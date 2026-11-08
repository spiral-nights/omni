///|
pub fn parse_json(s : String) -> @json.Json? {
  Some(@json.parse(s)) catch {
    _ => None
  }
}

///|
pub fn json_get_string(val : @json.Json, key : String) -> String {
  match val {
    Object(map) =>
      match map.get(key) {
        Some(String(s)) => s
        _ => ""
      }
    _ => ""
  }
}

///|
pub fn json_get_int(val : @json.Json, key : String) -> Int32 {
  match val {
    Object(map) =>
      match map.get(key) {
        Some(Number(n, ..)) => n.to_int()
        _ => 0
      }
    _ => 0
  }
}

///|
pub fn json_get_tags_by_type(
  val : @json.Json,
  tag_type : String,
) -> Array[String] {
  let result : Array[String] = []
  match val {
    Object(map) =>
      match map.get("tags") {
        Some(Array(tags_arr)) =>
          for item in tags_arr {
            match item {
              Array(tag) =>
                if tag.length() >= 2 {
                  match (tag[0], tag[1]) {
                    (String(t), String(v)) =>
                      if t == tag_type && v.length() >= 16 {
                        result.push(v)
                      }
                    _ => ()
                  }
                }
              _ => ()
            }
          }
        _ => ()
      }
    _ => ()
  }
  result
}

///|
pub fn get_reply_id_from_tags(
  e_tags : Array[String],
  q_tags : Array[String],
) -> String {
  for t in e_tags {
    let mut is_q = false
    for q in q_tags {
      if q == t {
        is_q = true
        break
      }
    }
    if !is_q {
      return t
    }
  }
  ""
}

///|
pub fn extract_profile_name(content_json : String) -> String {
  let parsed = @json.parse(content_json) catch { _ => return "" }
  let mut name = json_get_string(parsed, "display_name")
  if name == "" {
    name = json_get_string(parsed, "displayName")
  }
  if name == "" {
    name = json_get_string(parsed, "name")
  }
  if name == "" {
    name = json_get_string(parsed, "username")
  }
  if name == "" {
    let nip05 = json_get_string(parsed, "nip05")
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
