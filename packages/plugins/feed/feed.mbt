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

fn nostr_get_public_key() -> String {
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

fn nostr_subscribe(filter_json : String) -> Unit {
  let (ptr, len) = write_string_to_scratch(filter_json)
  host_subscribe(ptr, len)
}

fn nostr_publish(draft_json : String) -> Unit {
  let (ptr, len) = write_string_to_scratch(draft_json)
  host_publish(ptr, len)
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

pub struct Note {
  id : String
  pubkey : String
  mut author_name : String
  npub : String
  content : String
  created_at : Int
  mut liked : Bool
  mut reposted : Bool
  mut likes : Int
  mut reposts : Int
  mut replies : Int
  reply_to_id : String
  e_tags : Array[String]
}

fn note_is_reply_to(n : Note, target_id : String) -> Bool {
  if n.reply_to_id == target_id {
    return true
  }
  for id in n.e_tags {
    if id == target_id {
      return true
    }
  }
  false
}

pub struct UserProfile {
  pubkey : String
  mut name : String
}

pub struct FeedState {
  mut active_tab : String
  mut active_thread_id : String
  notes : Array[Note]
  follows : Array[String]
  profiles : Array[UserProfile]
  mut pending_profile_reqs : Array[String]
  mut pending_interaction_reqs : Array[String]
  queried_interactions : Array[String]
  mut oldest_timestamp : Int
  mut is_loading_older : Bool
  mut my_pubkey : String
  mut view : String
}

let global_state : FeedState = {
  active_tab: "following",
  active_thread_id: "",
  notes: [],
  follows: [],
  profiles: [],
  pending_profile_reqs: [],
  pending_interaction_reqs: [],
  queried_interactions: [],
  oldest_timestamp: 0,
  is_loading_older: false,
  my_pubkey: "",
  view: "main"
}

fn subscribe_to_follows(follows : Array[String]) -> Unit {
  if follows.length() == 0 && global_state.my_pubkey == "" {
    return
  }
  let buf = StringBuilder()
  buf.write_string("[{\"kinds\":[1],\"authors\":[")
  let limit = if follows.length() > 100 { 100 } else { follows.length() }
  let mut count = 0
  if global_state.my_pubkey != "" {
    buf.write_string("\"")
    buf.write_string(global_state.my_pubkey)
    buf.write_string("\"")
    count = 1
  }
  for i in 0..<limit {
    let f = follows[i]
    if f != global_state.my_pubkey {
      if count > 0 { buf.write_string(",") }
      buf.write_string("\"")
      buf.write_string(f)
      buf.write_string("\"")
      count = count + 1
    }
  }
  buf.write_string("],\"limit\":40}]")
  nostr_subscribe(buf.to_string())
}

fn extract_all_p_tags(json : String) -> Array[String] {
  let result : Array[String] = []
  let len = json.length()
  let mut i = 0
  while i < len - 6 {
    if json[i] == '[' && json[i + 1] == '"' && json[i + 2] == 'p' && json[i + 3] == '"' {
      let mut p = i + 4
      while p < len && (json[p] == ' ' || json[p] == ',') {
        p = p + 1
      }
      if p < len && json[p] == '"' {
        p = p + 1
        let buf = StringBuilder()
        while p < len && json[p] != '"' {
          buf.write_char(json[p].to_int().unsafe_to_char())
          p = p + 1
        }
        let pk = buf.to_string()
        if pk.length() >= 16 {
          result.push(pk)
        }
        i = p
      } else {
        i = i + 1
      }
    } else {
      i = i + 1
    }
  }
  result
}

fn extract_all_e_tags(json : String) -> Array[String] {
  let result : Array[String] = []
  let len = json.length()
  let mut i = 0
  while i < len - 6 {
    if json[i] == '[' && json[i + 1] == '"' && json[i + 2] == 'e' && json[i + 3] == '"' {
      let mut p = i + 4
      while p < len && (json[p] == ' ' || json[p] == ',') {
        p = p + 1
      }
      if p < len && json[p] == '"' {
        p = p + 1
        let buf = StringBuilder()
        while p < len && json[p] != '"' {
          buf.write_char(json[p].to_int().unsafe_to_char())
          p = p + 1
        }
        let e_id = buf.to_string()
        if e_id.length() >= 16 {
          result.push(e_id)
        }
        i = p
      } else {
        i = i + 1
      }
    } else {
      i = i + 1
    }
  }
  result
}

fn emit_schema(schema_json : String) -> Unit {
  println(schema_json)
}

fn extract_json_field(json : String, key : String) -> String {
  let search = "\"" + key + "\":\""
  let search_space = "\"" + key + "\": \""
  let mut start_pos = -1
  let len = json.length()
  
  if json.contains(search) {
    let klen = search.length()
    for i in 0..<(len - klen + 1) {
      let mut match_found = true
      for j in 0..<klen {
        if json[i + j] != search[j] {
          match_found = false
          break
        }
      }
      if match_found {
        start_pos = i + klen
        break
      }
    }
  } else if json.contains(search_space) {
    let klen = search_space.length()
    for i in 0..<(len - klen + 1) {
      let mut match_found = true
      for j in 0..<klen {
        if json[i + j] != search_space[j] {
          match_found = false
          break
        }
      }
      if match_found {
        start_pos = i + klen
        break
      }
    }
  }

  if start_pos == -1 {
    return ""
  }

  let buf = StringBuilder()
  let mut is_escaped = false

  for k in start_pos..<len {
    let c = json[k]
    if is_escaped {
      if c == '"' {
        buf.write_char('"')
      } else if c == '\\' {
        buf.write_char('\\')
      } else if c == 'n' {
        buf.write_char('\n')
      } else if c == 'r' {
        buf.write_char('\r')
      } else if c == 't' {
        buf.write_char('\t')
      } else {
        buf.write_char('\\')
        buf.write_char(c.to_int().unsafe_to_char())
      }
      is_escaped = false
    } else if c == '\\' {
      is_escaped = true
    } else if c == '"' {
      break
    } else {
      buf.write_char(c.to_int().unsafe_to_char())
    }
  }

  buf.to_string()
}

fn extract_json_int(json : String, key : String) -> Int {
  let search = "\"" + key + "\":"
  let len = json.length()
  let klen = search.length()
  if len < klen {
    return 0
  }
  let mut start_pos = -1

  for i in 0..<(len - klen + 1) {
    let mut match_found = true
    for j in 0..<klen {
      if json[i + j] != search[j] {
        match_found = false
        break
      }
    }
    if match_found {
      start_pos = i + klen
      break
    }
  }

  if start_pos == -1 {
    return 0
  }

  let mut p = start_pos
  while p < len && json[p] == ' ' {
    p = p + 1
  }

  let mut num = 0
  for k in p..<len {
    let c = json[k].to_int()
    if c >= 48 && c <= 57 {
      num = num * 10 + (c - 48)
    } else {
      break
    }
  }
  num
}

fn extract_reply_id_from_tags(json : String) -> String {
  let search = "[\"e\",\""
  let len = json.length()
  let klen = search.length()
  if len < klen {
    return ""
  }
  for i in 0..<(len - klen + 1) {
    let mut match_found = true
    for j in 0..<klen {
      if json[i + j] != search[j] {
        match_found = false
        break
      }
    }
    if match_found {
      let start_pos = i + klen
      let buf = StringBuilder()
      for k in start_pos..<len {
        let c = json[k]
        if c == '"' {
          break
        }
        buf.write_char(c.to_int().unsafe_to_char())
      }
      return buf.to_string()
    }
  }
  ""
}

fn find_profile_name(pubkey : String) -> String {
  for p in global_state.profiles {
    if p.pubkey == pubkey {
      return p.name
    }
  }
  ""
}

fn set_profile_name(pubkey : String, name : String) -> Unit {
  if pubkey == "" || name == "" {
    return
  }
  let mut found = false
  for p in global_state.profiles {
    if p.pubkey == pubkey {
      p.name = name
      found = true
      break
    }
  }
  if !found {
    global_state.profiles.push({ pubkey: pubkey, name: name })
  }
  for n in global_state.notes {
    if n.pubkey == pubkey {
      n.author_name = name
    }
  }
}

fn extract_profile_name(content_json : String) -> String {
  let mut name = extract_json_field(content_json, "display_name")
  if name == "" {
    name = extract_json_field(content_json, "displayName")
  }
  if name == "" {
    name = extract_json_field(content_json, "name")
  }
  if name == "" {
    name = extract_json_field(content_json, "username")
  }
  if name == "" {
    let nip05 = extract_json_field(content_json, "nip05")
    if nip05 != "" {
      let mut at_idx = -1
      for i in 0..<nip05.length() {
        if nip05[i] == '@' {
          at_idx = i
          break
        }
      }
      if at_idx > 0 {
        let buf = StringBuilder()
        for i in 0..<at_idx {
          buf.write_char(nip05[i].to_int().unsafe_to_char())
        }
        name = buf.to_string()
      } else {
        name = nip05
      }
    }
  }
  name
}

fn request_missing_profiles() -> Unit {
  let count = global_state.pending_profile_reqs.length()
  if count == 0 {
    return
  }
  let limit = if count > 50 { 50 } else { count }
  let buf = StringBuilder()
  buf.write_string("[{\"kinds\":[0],\"authors\":[")
  for i in 0..<limit {
    if i > 0 { buf.write_string(",") }
    buf.write_string("\"")
    buf.write_string(global_state.pending_profile_reqs[i])
    buf.write_string("\"")
  }
  buf.write_string("]}]")
  nostr_subscribe(buf.to_string())

  let remaining : Array[String] = []
  for i in limit..<count {
    remaining.push(global_state.pending_profile_reqs[i])
  }
  global_state.pending_profile_reqs = remaining
}

fn request_missing_interactions() -> Unit {
  let count = global_state.pending_interaction_reqs.length()
  if count == 0 {
    return
  }
  let limit = if count > 30 { 30 } else { count }
  let buf = StringBuilder()
  buf.write_string("[{\"kinds\":[1,6,7],\"#e\":[")
  for i in 0..<limit {
    if i > 0 { buf.write_string(",") }
    buf.write_string("\"")
    buf.write_string(global_state.pending_interaction_reqs[i])
    buf.write_string("\"")
  }
  buf.write_string("],\"limit\":")
  buf.write_string((limit * 15).to_string())
  buf.write_string("}]")
  nostr_subscribe(buf.to_string())

  let remaining : Array[String] = []
  for i in limit..<count {
    remaining.push(global_state.pending_interaction_reqs[i])
  }
  global_state.pending_interaction_reqs = remaining
}

fn render_compact_view(state : FeedState) -> String {
  let count = state.notes.length()
  let latest = if count > 0 { state.notes[0].content } else { "Connecting to relays..." }
  let preview = if latest.length() > 30 {
    let buf = StringBuilder()
    for i in 0..<30 {
      buf.write_char(latest[i].to_int().unsafe_to_char())
    }
    buf.write_string("...")
    buf.to_string()
  } else {
    latest
  }
  let subtext = json_escape(preview)
  let buf = StringBuilder()
  buf.write_string("{\"type\":\"metric\",\"label\":\"Timeline Notes\",\"value\":\"")
  buf.write_string(count.to_string())
  buf.write_string(" notes\",\"subtext\":\"")
  buf.write_string(subtext)
  buf.write_string("\"}")
  buf.to_string()
}

fn render_widget_view(state : FeedState) -> String {
  let buf = StringBuilder()
  buf.write_string("{\"type\":\"card\",\"title\":\"Recent Notes\",\"icon\":\"message\",\"children\":[")
  
  // Quick Post Input
  buf.write_string("{\"type\":\"box\",\"direction\":\"row\",\"gap\":\"sm\",\"children\":[")
  buf.write_string("{\"type\":\"input\",\"name\":\"noteText\",\"placeholder\":\"Quick note...\",\"actionOnEnter\":{\"name\":\"publish-note\"}},")
  buf.write_string("{\"type\":\"button\",\"label\":\"Post\",\"variant\":\"primary\",\"size\":\"sm\",\"action\":{\"name\":\"publish-note\"}}")
  buf.write_string("]},")

  // Recent List Items
  buf.write_string("{\"type\":\"list\",\"items\":[")
  if state.notes.length() == 0 {
    buf.write_string("{\"type\":\"list-item\",\"id\":\"empty\",\"title\":\"Connecting to relays...\",\"subtitle\":\"Notes will stream in from relays\"}")
  } else {
    let limit = if state.notes.length() < 3 { state.notes.length() } else { 3 }
    for i in 0..<limit {
      if i > 0 { buf.write_string(",") }
      let n = state.notes[i]
      buf.write_string("{\"type\":\"list-item\",\"id\":\"")
      buf.write_string(n.id)
      buf.write_string("\",\"title\":\"")
      buf.write_string(json_escape(n.author_name))
      buf.write_string("\",\"subtitle\":\"")
      buf.write_string(json_escape(n.content))
      buf.write_string("\",\"actions\":[{\"type\":\"icon-button\",\"icon\":\"heart\",\"variant\":\"")
      if n.liked { buf.write_string("secondary") } else { buf.write_string("ghost") }
      buf.write_string("\",\"action\":{\"name\":\"like-note\",\"payload\":{\"id\":\"")
      buf.write_string(n.id)
      buf.write_string("\"}}}]}")
    }
  }
  buf.write_string("]}")

  buf.write_string("]}")
  buf.to_string()
}

fn render_thread_view(state : FeedState) -> String {
  let target_id = state.active_thread_id
  let mut parent_note : Note? = None
  for n in state.notes {
    if n.id == target_id {
      parent_note = Some(n)
      break
    }
  }

  let buf = StringBuilder()
  buf.write_string("{\"type\":\"card\",\"title\":\"Conversation Thread\",\"icon\":\"reply\",")
  buf.write_string("\"page\":{\"id\":\"thread-")
  buf.write_string(target_id)
  buf.write_string("\",\"title\":\"Conversation Thread\",\"url\":\"?view=thread&id=")
  buf.write_string(target_id)
  buf.write_string("\",\"state\":{\"view\":\"thread\",\"id\":\"")
  buf.write_string(target_id)
  buf.write_string("\"}},\"children\":[")
  
  // Back to Feed Button
  buf.write_string("{\"type\":\"button\",\"label\":\"← Back to Feed\",\"icon\":\"arrow-left\",\"variant\":\"ghost\",\"size\":\"sm\",\"action\":{\"name\":\"back-to-feed\",\"navigate\":{\"back\":true}}},")
  buf.write_string("{\"type\":\"divider\"},")

  match parent_note {
    Some(p) => {
      // Parent Note Details
      buf.write_string("{\"type\":\"box\",\"direction\":\"row\",\"gap\":\"sm\",\"align\":\"center\",\"style\":\"cursor: pointer; margin-bottom: 8px;\",\"action\":{\"name\":\"view-profile\",\"payload\":{\"pubkey\":\"")
      buf.write_string(p.pubkey)
      buf.write_string("\"}},\"children\":[")
      buf.write_string("{\"type\":\"avatar\",\"pubkey\":\"")
      buf.write_string(p.pubkey)
      buf.write_string("\",\"name\":\"")
      buf.write_string(json_escape(p.author_name))
      buf.write_string("\",\"size\":\"md\",\"action\":{\"name\":\"view-profile\",\"payload\":{\"pubkey\":\"")
      buf.write_string(p.pubkey)
      buf.write_string("\"}}},")
      buf.write_string("{\"type\":\"box\",\"direction\":\"column\",\"children\":[")
      buf.write_string("{\"type\":\"text\",\"content\":\"")
      buf.write_string(json_escape(p.author_name))
      buf.write_string("\",\"variant\":\"caption\",\"tone\":\"primary\"},")
      buf.write_string("{\"type\":\"text\",\"content\":\"")
      buf.write_string(p.npub)
      buf.write_string("\",\"variant\":\"caption\",\"tone\":\"muted\"}")
      buf.write_string("]}")
      buf.write_string("]},")
      buf.write_string("{\"type\":\"text\",\"content\":\"")
      buf.write_string(json_escape(p.content))
      buf.write_string("\",\"variant\":\"body\"},")
      buf.write_string("{\"type\":\"divider\"},")

      // Reply Input
      buf.write_string("{\"type\":\"box\",\"direction\":\"row\",\"gap\":\"sm\",\"children\":[")
      buf.write_string("{\"type\":\"input\",\"name\":\"replyText\",\"placeholder\":\"Write a reply...\",\"actionOnEnter\":{\"name\":\"publish-reply\",\"payload\":{\"replyToId\":\"")
      buf.write_string(p.id)
      buf.write_string("\"}}},")
      buf.write_string("{\"type\":\"button\",\"label\":\"Reply\",\"variant\":\"primary\",\"size\":\"sm\",\"action\":{\"name\":\"publish-reply\",\"payload\":{\"replyToId\":\"")
      buf.write_string(p.id)
      buf.write_string("\"}}}")
      buf.write_string("]}")

      // Replies to this note
      let mut reply_count = 0
      for n in state.notes {
        if n.id != p.id && note_is_reply_to(n, p.id) {
          reply_count = reply_count + 1
          buf.write_string(",")
          buf.write_string("{\"type\":\"card\",\"style\":\"margin-top: 8px; margin-left: 12px;\",\"children\":[")
          buf.write_string("{\"type\":\"box\",\"direction\":\"row\",\"gap\":\"sm\",\"align\":\"center\",\"style\":\"cursor: pointer;\",\"action\":{\"name\":\"view-profile\",\"payload\":{\"pubkey\":\"")
          buf.write_string(n.pubkey)
          buf.write_string("\"}},\"children\":[")
          buf.write_string("{\"type\":\"avatar\",\"pubkey\":\"")
          buf.write_string(n.pubkey)
          buf.write_string("\",\"name\":\"")
          buf.write_string(json_escape(n.author_name))
          buf.write_string("\",\"size\":\"sm\",\"action\":{\"name\":\"view-profile\",\"payload\":{\"pubkey\":\"")
          buf.write_string(n.pubkey)
          buf.write_string("\"}}},")
          buf.write_string("{\"type\":\"text\",\"content\":\"")
          buf.write_string(json_escape(n.author_name))
          buf.write_string("\",\"variant\":\"body\",\"tone\":\"primary\"}")
          buf.write_string("]},")
          buf.write_string("{\"type\":\"text\",\"content\":\"")
          buf.write_string(json_escape(n.content))
          buf.write_string("\",\"variant\":\"body\",\"style\":\"margin-top: 6px;\"}")
          buf.write_string("]}")
        }
      }
      if reply_count == 0 {
        buf.write_string(",")
        if p.replies > 0 {
          buf.write_string("{\"type\":\"text\",\"content\":\"Fetching conversation replies from relays...\",\"tone\":\"muted\",\"style\":\"margin-top: 14px; margin-left: 4px; font-style: italic;\"}")
        } else {
          buf.write_string("{\"type\":\"text\",\"content\":\"No replies yet. Be the first to reply!\",\"tone\":\"muted\",\"style\":\"margin-top: 14px; margin-left: 4px; font-style: italic;\"}")
        }
      }
    }
    None => {
      buf.write_string("{\"type\":\"text\",\"content\":\"Note not found or deleted.\",\"tone\":\"muted\"}")
    }
  }

  buf.write_string("]}")
  buf.to_string()
}

pub fn render_feed(state : FeedState) -> String {
  if state.view == "compact" {
    return render_compact_view(state)
  }
  if state.view == "widget" {
    return render_widget_view(state)
  }
  if state.active_thread_id != "" {
    return render_thread_view(state)
  }

  let buf = StringBuilder()
  buf.write_string("{\"type\":\"card\",\"title\":\"Timeline Notes\",\"icon\":\"feed\",\"page\":{\"id\":\"timeline\",\"title\":\"Timeline Notes\",\"url\":\"\",\"state\":null},\"children\":[")

  // Top Bar: Navigation Tabs (Following, Global)
  buf.write_string("{\"type\":\"box\",\"direction\":\"row\",\"gap\":\"xs\",\"children\":[")
  buf.write_string("{\"type\":\"button\",\"label\":\"Following\",\"variant\":\"")
  if state.active_tab == "following" { buf.write_string("primary") } else { buf.write_string("ghost") }
  buf.write_string("\",\"size\":\"sm\",\"action\":{\"name\":\"set-tab\",\"payload\":{\"tab\":\"following\"}}},")
  buf.write_string("{\"type\":\"button\",\"label\":\"Global\",\"variant\":\"")
  if state.active_tab == "global" { buf.write_string("primary") } else { buf.write_string("ghost") }
  buf.write_string("\",\"size\":\"sm\",\"action\":{\"name\":\"set-tab\",\"payload\":{\"tab\":\"global\"}}}")
  buf.write_string("]},")

  // Composer Box
  buf.write_string("{\"type\":\"box\",\"direction\":\"column\",\"gap\":\"sm\",\"style\":\"margin-top: 10px; margin-bottom: 12px; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 8px;\",\"children\":[")
  buf.write_string("{\"type\":\"input\",\"name\":\"composerText\",\"placeholder\":\"What's on your mind? Broadcast to Nostr...\",\"actionOnEnter\":{\"name\":\"publish-note\"}},")
  buf.write_string("{\"type\":\"box\",\"direction\":\"row\",\"justify\":\"end\",\"children\":[")
  buf.write_string("{\"type\":\"button\",\"label\":\"Publish Note\",\"variant\":\"primary\",\"size\":\"sm\",\"icon\":\"send\",\"action\":{\"name\":\"publish-note\"}}")
  buf.write_string("]}")
  buf.write_string("]},")

  let is_following = state.active_tab == "following"
  let has_follows = state.follows.length() > 0

  // Filter notes when Following tab is active and follows list is present
  let displayed_notes : Array[Note] = []
  for n in state.notes {
    if !is_following {
      displayed_notes.push(n)
    } else if !has_follows {
      // If user hasn't followed accounts yet, display available notes
      displayed_notes.push(n)
    } else {
      let mut is_followed = false
      if state.my_pubkey != "" && n.pubkey == state.my_pubkey {
        is_followed = true
      } else {
        for f in state.follows {
          if f == n.pubkey {
            is_followed = true
            break
          }
        }
      }
      if is_followed {
        displayed_notes.push(n)
      }
    }
  }

  // Notes List
  if displayed_notes.length() == 0 {
    buf.write_string("{\"type\":\"card\",\"style\":\"padding: 24px; text-align: center; margin-top: 8px;\",\"children\":[")
    buf.write_string("{\"type\":\"box\",\"direction\":\"column\",\"align\":\"center\",\"gap\":\"sm\",\"children\":[")
    if is_following && has_follows {
      buf.write_string("{\"type\":\"text\",\"content\":\"No notes from followed creators yet\",\"variant\":\"subheading\",\"tone\":\"primary\"},")
      buf.write_string("{\"type\":\"text\",\"content\":\"Follow creators in Profiles or switch to Global to view all network timeline notes.\",\"variant\":\"body\",\"tone\":\"muted\"}")
    } else {
      buf.write_string("{\"type\":\"text\",\"content\":\"Connecting to Nostr relays...\",\"variant\":\"subheading\",\"tone\":\"primary\"},")
      buf.write_string("{\"type\":\"text\",\"content\":\"Notes will stream in as relays respond, or post a note above.\",\"variant\":\"body\",\"tone\":\"muted\"}")
    }
    buf.write_string("]}")
    buf.write_string("]}")
  } else {
    for i in 0..<displayed_notes.length() {
      if i > 0 { buf.write_string(",") }
      let n = displayed_notes[i]
      buf.write_string("{\"type\":\"card\",\"style\":\"margin-bottom: 8px;\",\"children\":[")
      
      // Header Row: Avatar, Name, npub (clickable to open profile)
      buf.write_string("{\"type\":\"box\",\"direction\":\"row\",\"gap\":\"sm\",\"align\":\"center\",\"style\":\"cursor: pointer;\",\"action\":{\"name\":\"view-profile\",\"payload\":{\"pubkey\":\"")
      buf.write_string(n.pubkey)
      buf.write_string("\"}},\"children\":[")
      buf.write_string("{\"type\":\"avatar\",\"pubkey\":\"")
      buf.write_string(n.pubkey)
      buf.write_string("\",\"name\":\"")
      buf.write_string(json_escape(n.author_name))
      buf.write_string("\",\"size\":\"md\",\"action\":{\"name\":\"view-profile\",\"payload\":{\"pubkey\":\"")
      buf.write_string(n.pubkey)
      buf.write_string("\"}}},")
      buf.write_string("{\"type\":\"box\",\"direction\":\"column\",\"children\":[")
      buf.write_string("{\"type\":\"text\",\"content\":\"")
      buf.write_string(json_escape(n.author_name))
      buf.write_string("\",\"variant\":\"body\",\"tone\":\"primary\"},")
      buf.write_string("{\"type\":\"text\",\"content\":\"")
      buf.write_string(n.npub)
      buf.write_string("\",\"variant\":\"caption\",\"tone\":\"muted\"}")
      buf.write_string("]}")
      buf.write_string("]},")

      // Note Body
      buf.write_string("{\"type\":\"text\",\"content\":\"")
      buf.write_string(json_escape(n.content))
      buf.write_string("\",\"variant\":\"body\",\"style\":\"margin-top: 8px; margin-bottom: 8px; cursor: pointer;\",\"action\":{\"name\":\"view-thread\",\"payload\":{\"id\":\"")
      buf.write_string(n.id)
      buf.write_string("\"}}},")

      // Divider
      buf.write_string("{\"type\":\"divider\"},")

      // Action Row (Reply, Repost, Like, Zap)
      buf.write_string("{\"type\":\"box\",\"direction\":\"row\",\"justify\":\"between\",\"align\":\"center\",\"children\":[")
      
      // Reply Button
      buf.write_string("{\"type\":\"button\",\"icon\":\"reply\",\"label\":\"")
      buf.write_string(n.replies.to_string())
      buf.write_string("\",\"tooltip\":\"Reply\",\"title\":\"Reply\",\"variant\":\"ghost\",\"size\":\"sm\",\"action\":{\"name\":\"view-thread\",\"payload\":{\"id\":\"")
      buf.write_string(n.id)
      buf.write_string("\"}}},")

      // Repost Button
      buf.write_string("{\"type\":\"button\",\"icon\":\"repeat\",\"label\":\"")
      buf.write_string(n.reposts.to_string())
      buf.write_string("\",\"tooltip\":\"Repost\",\"title\":\"Repost\",\"variant\":\"")
      if n.reposted { buf.write_string("secondary") } else { buf.write_string("ghost") }
      buf.write_string("\",\"size\":\"sm\",\"action\":{\"name\":\"repost-note\",\"payload\":{\"id\":\"")
      buf.write_string(n.id)
      buf.write_string("\"}}},")

      // Like Button
      buf.write_string("{\"type\":\"button\",\"icon\":\"heart\",\"label\":\"")
      buf.write_string(n.likes.to_string())
      buf.write_string("\",\"tooltip\":\"Like\",\"title\":\"Like\",\"variant\":\"")
      if n.liked { buf.write_string("secondary") } else { buf.write_string("ghost") }
      buf.write_string("\",\"size\":\"sm\",\"action\":{\"name\":\"like-note\",\"payload\":{\"id\":\"")
      buf.write_string(n.id)
      buf.write_string("\"}}},")

      // Zap Button
      buf.write_string("{\"type\":\"button\",\"icon\":\"zap\",\"label\":\"0\",\"tooltip\":\"Zap\",\"title\":\"Zap\",\"variant\":\"ghost\",\"size\":\"sm\",\"action\":{\"name\":\"zap-note\",\"payload\":{\"id\":\"")
      buf.write_string(n.id)
      buf.write_string("\"}}}")

      buf.write_string("]}")
      buf.write_string("]}")
    }

    // Load More Button / Sentinel for infinite scroll
    buf.write_string(",")
    buf.write_string("{\"type\":\"box\",\"direction\":\"row\",\"justify\":\"center\",\"style\":\"margin-top: 14px; margin-bottom: 20px;\",\"children\":[")
    buf.write_string("{\"type\":\"button\",\"label\":\"")
    if state.is_loading_older {
      buf.write_string("Loading older notes...")
    } else {
      buf.write_string("Load More Notes")
    }
    buf.write_string("\",\"variant\":\"secondary\",\"size\":\"md\",\"icon\":\"arrow-down\",\"action\":{\"name\":\"load-more\"}}")
    buf.write_string("]}")
  }

  buf.write_string("]}")
  buf.to_string()
}

pub fn handle_action_impl(action_name : String, payload_str : String) -> Unit {
  if action_name == "view-profile" || action_name == "view_profile" {
    return
  } else if action_name == "set-tab" {
    global_state.oldest_timestamp = 0
    global_state.is_loading_older = false
    if payload_str.contains("\"global\"") {
      global_state.active_tab = "global"
      nostr_subscribe("[{\"kinds\":[1],\"limit\":40}]")
    } else {
      global_state.active_tab = "following"
      if global_state.follows.length() > 0 {
        subscribe_to_follows(global_state.follows)
      } else if global_state.my_pubkey != "" {
        nostr_subscribe("[{\"kinds\":[3],\"authors\":[\"" + global_state.my_pubkey + "\"],\"limit\":1}]")
      }
    }
  } else if action_name == "load-more" {
    if !global_state.is_loading_older && global_state.oldest_timestamp > 0 {
      global_state.is_loading_older = true
      let until_ts = global_state.oldest_timestamp - 1
      if global_state.active_tab == "following" && global_state.follows.length() > 0 {
        let buf = StringBuilder()
        buf.write_string("[{\"kinds\":[1],\"authors\":[")
        let limit = if global_state.follows.length() > 100 { 100 } else { global_state.follows.length() }
        let mut count = 0
        if global_state.my_pubkey != "" {
          buf.write_string("\"")
          buf.write_string(global_state.my_pubkey)
          buf.write_string("\"")
          count = 1
        }
        for i in 0..<limit {
          let f = global_state.follows[i]
          if f != global_state.my_pubkey {
            if count > 0 { buf.write_string(",") }
            buf.write_string("\"")
            buf.write_string(f)
            buf.write_string("\"")
            count = count + 1
          }
        }
        buf.write_string("],\"until\":")
        buf.write_string(until_ts.to_string())
        buf.write_string(",\"limit\":20}]")
        nostr_subscribe(buf.to_string())
      } else {
        let buf = StringBuilder()
        buf.write_string("[{\"kinds\":[1],\"until\":")
        buf.write_string(until_ts.to_string())
        buf.write_string(",\"limit\":20}]")
        nostr_subscribe(buf.to_string())
      }
    }
  } else if action_name == "view-thread" {
    let mut target_id = extract_json_field(payload_str, "id")
    if target_id == "" {
      target_id = extract_json_field(payload_str, "eventId")
    }
    if target_id == "" {
      for n in global_state.notes {
        if payload_str.contains(n.id) {
          target_id = n.id
          break
        }
      }
    }
    if target_id != "" {
      global_state.active_thread_id = target_id
      let buf = StringBuilder()
      buf.write_string("[{\"kinds\":[1],\"#e\":[\"")
      buf.write_string(target_id)
      buf.write_string("\"],\"limit\":50},{\"kinds\":[1],\"ids\":[\"")
      buf.write_string(target_id)
      buf.write_string("\"],\"limit\":1}]")
      nostr_subscribe(buf.to_string())
    }
  } else if action_name == "back-to-feed" || action_name == "back" {
    global_state.active_thread_id = ""
  } else if action_name == "like-note" {
    let target_id = extract_json_field(payload_str, "id")
    if target_id != "" {
      for n in global_state.notes {
        if n.id == target_id {
          n.liked = !n.liked
          if n.liked {
            n.likes = n.likes + 1
            let draft_json = "{\"kind\":7,\"content\":\"+\",\"tags\":[[\"e\",\"" + target_id + "\"]]}"
            nostr_publish(draft_json)
          } else {
            n.likes = n.likes - 1
          }
          break
        }
      }
    }
  } else if action_name == "repost-note" {
    let target_id = extract_json_field(payload_str, "id")
    if target_id != "" {
      for n in global_state.notes {
        if n.id == target_id {
          n.reposted = !n.reposted
          if n.reposted {
            n.reposts = n.reposts + 1
            let draft_json = "{\"kind\":6,\"content\":\"\",\"tags\":[[\"e\",\"" + target_id + "\"]]}"
            nostr_publish(draft_json)
          } else {
            n.reposts = n.reposts - 1
          }
          break
        }
      }
    }
  } else if action_name == "publish-note" {
    let mut new_text = extract_json_field(payload_str, "noteText")
    if new_text == "" {
      new_text = extract_json_field(payload_str, "composerText")
    }
    if new_text != "" {
      let draft_json = "{\"kind\":1,\"content\":\"" + json_escape(new_text) + "\",\"tags\":[]}"
      nostr_publish(draft_json)
    }
  } else if action_name == "publish-reply" {
    let parent_id = global_state.active_thread_id
    if parent_id != "" {
      let reply_text = extract_json_field(payload_str, "replyText")
      if reply_text != "" {
        let draft_json = "{\"kind\":1,\"content\":\"" + json_escape(reply_text) + "\",\"tags\":[[\"e\",\"" + parent_id + "\",\"\",\"reply\"]]}"
        nostr_publish(draft_json)
      }
    }
  } else if action_name == "set-view" {
    if payload_str.contains("\"widget\"") {
      global_state.view = "widget"
    } else if payload_str.contains("\"compact\"") {
      global_state.view = "compact"
    } else {
      global_state.view = "main"
    }
  } else if action_name == "zap-note" {
    // Zap note reaction
  } else if action_name == "nostr:event" {
    let kind = extract_json_int(payload_str, "kind")
    if kind == 3 {
      let p_tags = extract_all_p_tags(payload_str)
      let mut new_follows = false
      for pk in p_tags {
        let mut exists = false
        for f in global_state.follows {
          if f == pk {
            exists = true
            break
          }
        }
        if !exists {
          global_state.follows.push(pk)
          new_follows = true
        }
      }
      if new_follows && global_state.follows.length() > 0 && global_state.active_tab == "following" {
        subscribe_to_follows(global_state.follows)
      }
    } else if kind == 0 {
      let pubkey = extract_json_field(payload_str, "pubkey")
      let content = extract_json_field(payload_str, "content")
      if pubkey != "" && content != "" {
        let name = extract_profile_name(content)
        if name != "" {
          set_profile_name(pubkey, name)
        }
      }
    } else if kind == 7 {
      let e_tags = extract_all_e_tags(payload_str)
      let pubkey = extract_json_field(payload_str, "pubkey")
      for target_id in e_tags {
        for n in global_state.notes {
          if n.id == target_id {
            n.likes = n.likes + 1
            if pubkey != "" && pubkey == global_state.my_pubkey {
              n.liked = true
            }
            break
          }
        }
      }
    } else if kind == 6 {
      let e_tags = extract_all_e_tags(payload_str)
      let pubkey = extract_json_field(payload_str, "pubkey")
      for target_id in e_tags {
        for n in global_state.notes {
          if n.id == target_id {
            n.reposts = n.reposts + 1
            if pubkey != "" && pubkey == global_state.my_pubkey {
              n.reposted = true
            }
            break
          }
        }
      }
    } else {
      let id = extract_json_field(payload_str, "id")
      let pubkey = extract_json_field(payload_str, "pubkey")
      let content = extract_json_field(payload_str, "content")
      let created_at = extract_json_int(payload_str, "created_at")
      let e_tags = extract_all_e_tags(payload_str)
      let mut reply_to = extract_reply_id_from_tags(payload_str)
      if reply_to == "" && e_tags.length() > 0 {
        reply_to = e_tags[0]
      }
      if reply_to == "" {
        reply_to = extract_json_field(payload_str, "replyToId")
      }

      // Update reply counts for parent notes
      for target_id in e_tags {
        if target_id != id {
          for n in global_state.notes {
            if n.id == target_id {
              n.replies = n.replies + 1
              break
            }
          }
        }
      }

      if id != "" && content != "" {
        global_state.is_loading_older = false
        let mut exists = false
        for n in global_state.notes {
          if n.id == id {
            exists = true
            break
          }
        }

        // Only display if new and either root note or reply to active thread
        let mut is_thread_reply = false
        if global_state.active_thread_id != "" {
          if reply_to == global_state.active_thread_id {
            is_thread_reply = true
          } else {
            for target in e_tags {
              if target == global_state.active_thread_id {
                is_thread_reply = true
                break
              }
            }
          }
        }
        let should_display = !exists && (reply_to == "" || is_thread_reply)

        if should_display {
          let known_name = find_profile_name(pubkey)
          let author_name = if known_name != "" {
            known_name
          } else if pubkey.length() >= 8 {
            pubkey[0:8].to_owned()
          } else {
            "Nostr User"
          }

          if known_name == "" && pubkey.length() >= 16 {
            let mut already_pending = false
            for pk in global_state.pending_profile_reqs {
              if pk == pubkey {
                already_pending = true
                break
              }
            }
            if !already_pending {
              global_state.pending_profile_reqs.push(pubkey)
            }
          }

          // Register for interaction count queries (replies, reposts, likes)
          let mut already_queried = false
          for q in global_state.queried_interactions {
            if q == id {
              already_queried = true
              break
            }
          }
          if !already_queried {
            global_state.queried_interactions.push(id)
            global_state.pending_interaction_reqs.push(id)
          }

          let note_ts = if created_at > 0 { created_at } else { 1730000000 }
          if (note_ts < global_state.oldest_timestamp || global_state.oldest_timestamp == 0) && reply_to == "" {
            global_state.oldest_timestamp = note_ts
          }

          let note : Note = {
            id: id,
            pubkey: pubkey,
            author_name: author_name,
            npub: if pubkey.length() >= 16 { bech32_encode("npub", pubkey) } else { "npub1..." },
            content: content,
            created_at: note_ts,
            liked: false,
            reposted: false,
            likes: 0,
            reposts: 0,
            replies: 0,
            reply_to_id: reply_to,
            e_tags: e_tags
          }

          let mut inserted = false
          for i in 0..<global_state.notes.length() {
            if note.created_at >= global_state.notes[i].created_at {
              global_state.notes.insert(i, note)
              inserted = true
              break
            }
          }
          if !inserted {
            global_state.notes.push(note)
          }

          if global_state.notes.length() > 250 {
            let _ = global_state.notes.pop()
          }
        }
      }
    }

    if global_state.pending_interaction_reqs.length() > 0 {
      request_missing_interactions()
    }
    if global_state.pending_profile_reqs.length() > 0 {
      request_missing_profiles()
    }
  }

  let updated_schema = render_feed(global_state)
  emit_schema(updated_schema)
}

pub fn handle_action(action_ptr : Int, action_len : Int, payload_ptr : Int, payload_len : Int) -> Unit {
  let act = read_string_from_memory(action_ptr, action_len)
  let payload = read_string_from_memory(payload_ptr, payload_len)
  handle_action_impl(act, payload)
}

pub fn start() -> Unit {
  let my_pk = nostr_get_public_key()
  global_state.my_pubkey = my_pk
  let schema = render_feed(global_state)
  emit_schema(schema)
  if my_pk != "" {
    nostr_subscribe("[{\"kinds\":[1],\"limit\":40},{\"kinds\":[3],\"authors\":[\"" + my_pk + "\"],\"limit\":1}]")
  } else {
    nostr_subscribe("[{\"kinds\":[1],\"limit\":40},{\"kinds\":[3],\"limit\":1}]")
  }
}
