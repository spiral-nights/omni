// WebAssembly FFI & Low-Level Memory Bridge for Omni Host Runtime

extern "wasm" fn load8_u(addr : Int) -> Int =
  #|(func (param i32) (result i32) local.get 0 i32.load8_u)

extern "wasm" fn store8(addr : Int, val : Int) -> Unit =
  #|(func (param i32 i32) local.get 0 local.get 1 i32.store8)

extern "wasm" fn memory_size() -> Int =
  #|(func (result i32) memory.size)

extern "wasm" fn memory_grow(delta : Int) -> Int =
  #|(func (param i32) (result i32) local.get 0 memory.grow)

extern "wasm" fn load32_u(addr : Int) -> Int =
  #|(func (param i32) (result i32) local.get 0 i32.load)

extern "wasm" fn host_subscribe(filter_ptr : Int, filter_len : Int) -> Unit = "nostr" "subscribe"
extern "wasm" fn host_publish(draft_ptr : Int, draft_len : Int) -> Unit = "nostr" "publish"
extern "wasm" fn host_get_public_key(ret_ptr : Int) -> Unit = "nostr" "get-public-key"

fn write_string_to_scratch(s : String) -> (Int, Int) {
  let base = 3145728
  let mut byte_len = 0
  for i in 0..<s.length() {
    let code = s[i].to_int()
    if code < 0x80 {
      byte_len = byte_len + 1
    } else if code < 0x800 {
      byte_len = byte_len + 2
    } else if code < 0x10000 {
      byte_len = byte_len + 3
    } else {
      byte_len = byte_len + 4
    }
  }
  let end_addr = base + byte_len
  let current_bytes = memory_size() * 65536
  if end_addr > current_bytes {
    let needed = (end_addr - current_bytes + 65535) / 65536
    let _ = memory_grow(needed)
  }
  let mut offset = 0
  for i in 0..<s.length() {
    let code = s[i].to_int()
    if code < 0x80 {
      store8(base + offset, code)
      offset = offset + 1
    } else if code < 0x800 {
      store8(base + offset, 0xc0 | (code >> 6))
      store8(base + offset + 1, 0x80 | (code & 0x3f))
      offset = offset + 2
    } else if code < 0x10000 {
      store8(base + offset, 0xe0 | (code >> 12))
      store8(base + offset + 1, 0x80 | ((code >> 6) & 0x3f))
      store8(base + offset + 2, 0x80 | (code & 0x3f))
      offset = offset + 3
    } else {
      store8(base + offset, 0xf0 | (code >> 18))
      store8(base + offset + 1, 0x80 | ((code >> 12) & 0x3f))
      store8(base + offset + 2, 0x80 | ((code >> 6) & 0x3f))
      store8(base + offset + 3, 0x80 | (code & 0x3f))
      offset = offset + 4
    }
  }
  (base, byte_len)
}

fn read_string_from_memory(ptr : Int, len : Int) -> String {
  let buf = StringBuilder()
  let mut i = 0
  while i < len {
    let b0 = load8_u(ptr + i)
    if b0 < 0x80 {
      buf.write_char(b0.unsafe_to_char())
      i = i + 1
    } else if (b0 & 0xe0) == 0xc0 && i + 1 < len {
      let b1 = load8_u(ptr + i + 1)
      let cp = ((b0 & 0x1f) << 6) | (b1 & 0x3f)
      buf.write_char(cp.unsafe_to_char())
      i = i + 2
    } else if (b0 & 0xf0) == 0xe0 && i + 2 < len {
      let b1 = load8_u(ptr + i + 1)
      let b2 = load8_u(ptr + i + 2)
      let cp = ((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f)
      buf.write_char(cp.unsafe_to_char())
      i = i + 3
    } else if (b0 & 0xf8) == 0xf0 && i + 3 < len {
      let b1 = load8_u(ptr + i + 1)
      let b2 = load8_u(ptr + i + 2)
      let b3 = load8_u(ptr + i + 3)
      let cp = ((b0 & 0x07) << 18) | ((b1 & 0x3f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f)
      if cp > 0xffff {
        let u = cp - 0x10000
        let hs = 0xd800 | (u >> 10)
        let ls = 0xdc00 | (u & 0x3ff)
        buf.write_char(hs.unsafe_to_char())
        buf.write_char(ls.unsafe_to_char())
      } else {
        buf.write_char(cp.unsafe_to_char())
      }
      i = i + 4
    } else {
      buf.write_char(b0.unsafe_to_char())
      i = i + 1
    }
  }
  buf.to_string()
}

pub fn nostr_get_public_key() -> String {
  let base = 3145728
  let current_bytes = memory_size() * 65536
  if base + 16 > current_bytes {
    let needed = (base + 16 - current_bytes + 65535) / 65536
    let _ = memory_grow(needed)
  }
  host_get_public_key(base)
  let ptr = load32_u(base)
  let len = load32_u(base + 4)
  if ptr > 0 && len > 0 {
    read_string_from_memory(ptr, len)
  } else {
    ""
  }
}

pub fn nostr_subscribe(filter_json : String) -> Unit {
  let (ptr, len) = write_string_to_scratch(filter_json)
  host_subscribe(ptr, len)
}

pub fn nostr_publish(draft_json : String) -> Unit {
  let (ptr, len) = write_string_to_scratch(draft_json)
  host_publish(ptr, len)
}

pub fn emit_schema(schema_json : String) -> Unit {
  println(schema_json)
}

pub fn handle_action(action_ptr : Int, action_len : Int, payload_ptr : Int, payload_len : Int) -> Unit {
  let act = read_string_from_memory(action_ptr, action_len)
  let payload = read_string_from_memory(payload_ptr, payload_len)
  handle_action_impl(act, payload)
}
