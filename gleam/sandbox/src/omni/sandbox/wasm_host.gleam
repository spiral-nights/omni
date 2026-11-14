//// WebAssembly plugin guest host definition and validation.
////
//// Hosts compiled WASM components (Rust, Zig, C, Go) implementing the
//// Omni WIT interface (`ui.render`, `handle_action`, `init`).

import gleam/dict.{type Dict}
import gleam/json
import gleam/option.{type Option}
import gleam/string

/// Configuration options for instantiating a Wasm guest host.
pub type WasmConfig {
  WasmConfig(
    plugin_id: String,
    wasm_source: String,
    user_pubkey: Option(String),
    route: Option(String),
    view_id: Option(String),
    theme_tokens: Option(Dict(String, String)),
  )
}

/// Handshake message descriptor for Wasm guest host initialization.
pub type WasmHandshake {
  WasmHandshake(
    plugin_id: String,
    user_pubkey: String,
    route: String,
    view_id: String,
    payload_json: String,
  )
}

/// Check if string content represents a WebAssembly binary.
pub fn is_wasm_content(content: String) -> Bool {
  let trimmed = string.trim(content)
  string.starts_with(trimmed, "AGFzbQ")
  || string.starts_with(trimmed, "data:application/wasm;base64,")
  || string.starts_with(trimmed, "\u{0}asm")
}

/// Validate WebAssembly magic header bytes (`\0asm` -> `<<0x00, 0x61, 0x73, 0x6D>>`).
pub fn validate_wasm_magic(bytes: BitArray) -> Result(Nil, String) {
  case bytes {
    <<0x00, 0x61, 0x73, 0x6D, _:bits>> -> Ok(Nil)
    _ -> Error("Invalid WebAssembly magic header")
  }
}

/// Extract base64 payload from data URI or raw base64 string.
pub fn extract_base64_payload(content: String) -> String {
  let trimmed = string.trim(content)
  case string.starts_with(trimmed, "data:application/wasm;base64,") {
    True ->
      string.drop_start(trimmed, string.length("data:application/wasm;base64,"))
    False -> trimmed
  }
}

/// Prepare handshake descriptor for Wasm guest initialization.
pub fn prepare_handshake(config: WasmConfig) -> WasmHandshake {
  let pubkey = option.unwrap(config.user_pubkey, "")
  let route_val = option.unwrap(config.route, "")
  let view_val = option.unwrap(config.view_id, "main")

  let payload =
    json.object([
      #("pluginId", json.string(config.plugin_id)),
      #("userPubkey", json.string(pubkey)),
      #("route", json.string(route_val)),
      #("viewId", json.string(view_val)),
    ])
    |> json.to_string

  WasmHandshake(
    plugin_id: config.plugin_id,
    user_pubkey: pubkey,
    route: route_val,
    view_id: view_val,
    payload_json: payload,
  )
}
