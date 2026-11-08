///|
pub fn json_escape(s : String) -> String {
  let buf = StringBuilder()
  for i in 0..<s.length() {
    let c = s[i].to_int()
    if c == 34 {
      buf.write_string("\\\"")
    } else if c == 92 {
      buf.write_string("\\\\")
    } else if c == 10 {
      buf.write_string("\\n")
    } else if c == 13 {
      buf.write_string("\\r")
    } else if c == 9 {
      buf.write_string("\\t")
    } else {
      buf.write_char(c.unsafe_to_char())
    }
  }
  buf.to_string()
}
