//// `navigator.share` shim for guest sandboxes.
////
//// Routes Web Share payloads into the shell's composer via a standard intent
//// message instead of the unsupported platform share sheet.

import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string

/// Build the JSON message the host receives for a share request.
pub fn share_message(
  title: Option(String),
  text: Option(String),
  url: Option(String),
) -> String {
  let fields =
    [
      optional_field("title", title),
      optional_field("text", text),
      optional_field("url", url),
    ]
    |> list.flat_map(fn(item) {
      case item {
        Some(field) -> [field]
        None -> []
      }
    })

  json.object([#("type", json.string("omni:share")), ..fields])
  |> json.to_string
}

fn optional_field(
  key: String,
  value: Option(String),
) -> Option(#(String, json.Json)) {
  case value {
    Some(text) ->
      case string.trim(text) != "" {
        True -> Some(#(key, json.string(text)))
        False -> None
      }
    None -> None
  }
}

/// Replace `navigator.share` with a shim forwarding payloads to `post`.
@external(javascript, "./share_shim.ffi.mjs", "install")
pub fn install(post: fn(String) -> Nil) -> Nil
