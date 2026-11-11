import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/option.{None, Some}
import gleam/string
import omni/platform/json

@external(javascript, "./json_test.ffi.mjs", "make_circular_object")
fn make_circular_object() -> Dynamic

@external(javascript, "./json_test.ffi.mjs", "make_js_object")
fn make_js_object() -> Dynamic

pub fn parse_dynamic_valid_test() {
  let res = json.parse_dynamic("{\"key\":\"value\",\"count\":123}")
  case res {
    Ok(dyn) -> {
      let decoder = {
        use key <- decode.field("key", decode.string)
        use count <- decode.field("count", decode.int)
        decode.success(#(key, count))
      }
      assert json.decode_dynamic(dyn, decoder) == Ok(#("value", 123))
    }
    Error(_) -> panic as "expected valid JSON parse"
  }
}

pub fn parse_dynamic_syntax_error_test() {
  let res = json.parse_dynamic("{invalid json")
  case res {
    Error(json.SyntaxError(_)) -> Nil
    _ -> panic as "expected syntax error"
  }
}

pub fn parse_with_decoder_success_test() {
  let json_str = "[1, 2, 3, 4]"
  assert json.parse(json_str, decode.list(decode.int)) == Ok([1, 2, 3, 4])
}

pub fn parse_with_decoder_mismatch_test() {
  let json_str = "{\"name\": 123}"
  let decoder = {
    use name <- decode.field("name", decode.string)
    decode.success(name)
  }
  case json.parse(json_str, decoder) {
    Error(json.DecodeError(_)) -> Nil
    _ -> panic as "expected decode error"
  }
}

pub fn stringify_test() {
  let obj = make_js_object()
  let res = json.stringify(obj)
  case res {
    Ok(s) -> {
      assert string.contains(s, "\"name\":\"Alice\"")
      assert string.contains(s, "\"count\":42")
    }
    Error(_) -> panic as "expected successful stringify"
  }
}

pub fn stringify_pretty_test() {
  let obj = make_js_object()
  let res = json.stringify_pretty(obj, 2)
  case res {
    Ok(s) -> {
      assert string.contains(s, "\n")
      assert string.contains(s, "  \"name\": \"Alice\"")
    }
    Error(_) -> panic as "expected successful pretty stringify"
  }
}

pub fn stringify_circular_error_test() {
  let circ = make_circular_object()
  let res = json.stringify(circ)
  case res {
    Error(json.SerializationError(_)) -> Nil
    _ -> panic as "expected serialization error for circular ref"
  }
}

pub fn json_ast_builders_test() {
  let ast =
    json.object([
      #("name", json.string("Bob")),
      #("age", json.int(30)),
      #("active", json.bool(True)),
      #("tags", json.array(["gleam", "nostr"], json.string)),
      #("notes", json.nullable(None, json.string)),
      #("score", json.nullable(Some("A+"), json.string)),
      #("extra", json.null()),
    ])

  let rendered = json.to_string(ast)
  assert string.contains(rendered, "\"name\":\"Bob\"")
  assert string.contains(rendered, "\"age\":30")
  assert string.contains(rendered, "\"active\":true")
  assert string.contains(rendered, "\"tags\":[\"gleam\",\"nostr\"]")
  assert string.contains(rendered, "\"notes\":null")
  assert string.contains(rendered, "\"score\":\"A+\"")
  assert string.contains(rendered, "\"extra\":null")
}
