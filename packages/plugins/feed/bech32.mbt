///|
let bech32_charset : String = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"

///|
fn bech32_polymod(values : Array[Int32]) -> Int32 {
  let generator = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
  let mut chk = 1
  for v in values {
    let top = chk >> 25
    chk = ((chk & 0x1ffffff) << 5) ^ v
    for i in 0..<5 {
      if ((top >> i) & 1) != 0 {
        chk = chk ^ generator[i]
      }
    }
  }
  chk
}

///|
fn hrp_expand(hrp : String) -> Array[Int32] {
  let ret : Array[Int32] = []
  for i in 0..<hrp.length() {
    let c = hrp[i].to_int()
    ret.push(c >> 5)
  }
  ret.push(0)
  for i in 0..<hrp.length() {
    let c = hrp[i].to_int()
    ret.push(c & 31)
  }
  ret
}

///|
pub fn bech32_encode(hrp : String, hex_str : String) -> String {
  let values : Array[Int32] = []
  let mut acc = 0
  let mut bits = 0
  let maxv = 31

  let hex_len = hex_str.length()
  for i in 0..<hex_len {
    let c = hex_str[i].to_int()
    let mut val = 0
    if c >= 48 && c <= 57 {
      val = c - 48
    } else if c >= 97 && c <= 102 {
      val = c - 97 + 10
    } else if c >= 65 && c <= 70 {
      val = c - 65 + 10
    }

    if i % 2 == 0 {
      acc = (acc << 4) | val
      bits = bits + 4
    } else {
      acc = (acc << 4) | val
      bits = bits + 4
      while bits >= 5 {
        bits = bits - 5
        values.push((acc >> bits) & maxv)
      }
    }
  }

  if bits > 0 {
    values.push((acc << (5 - bits)) & maxv)
  }

  // Calculate checksum
  let exp = hrp_expand(hrp)
  let chk_input : Array[Int32] = []
  for v in exp {
    chk_input.push(v)
  }
  for v in values {
    chk_input.push(v)
  }
  for _ in 0..<6 {
    chk_input.push(0)
  }

  let polymod = bech32_polymod(chk_input) ^ 1
  for i in 0..<6 {
    values.push((polymod >> (5 * (5 - i))) & 31)
  }

  let buf = StringBuilder()
  buf.write_string(hrp)
  buf.write_char('1')
  for v in values {
    let ch = bech32_charset[v].to_int()
    buf.write_char(ch.unsafe_to_char())
  }
  buf.to_string()
}
