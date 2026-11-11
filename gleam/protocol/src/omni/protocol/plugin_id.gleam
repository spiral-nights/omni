//// Strongly-typed plugin identifier.
////
//// Validates non-empty trimmed reverse-domain identifiers (e.g. `org.omni.plugin.feed`)
//// or arbitrary valid identifiers, while rejecting whitespace and colons (`:`) which are
//// reserved for subscription namespacing and ACL boundaries.

import gleam/dynamic/decode
import gleam/json
import gleam/string

/// An opaque, validated plugin identifier.
pub opaque type PluginId {
  PluginId(id: String)
}

/// Parse and validate a plugin identifier string.
///
/// Returns `Ok(PluginId)` if the string is non-empty, contains no whitespace,
/// is already trimmed, and contains no colons (`:`).
pub fn parse(raw: String) -> Result(PluginId, Nil) {
  let trimmed = string.trim(raw)
  case trimmed == "" || trimmed != raw {
    True -> Error(Nil)
    False -> {
      case
        string.contains(trimmed, " ")
        || string.contains(trimmed, "\t")
        || string.contains(trimmed, "\n")
        || string.contains(trimmed, "\r")
        || string.contains(trimmed, ":")
      {
        True -> Error(Nil)
        False -> Ok(PluginId(trimmed))
      }
    }
  }
}

/// Alias for `parse`.
pub const from_string = parse

/// Convert a `PluginId` to its string representation.
pub fn to_string(plugin_id: PluginId) -> String {
  plugin_id.id
}

/// Convert a `PluginId` to a `gleam/json.Json` value.
pub fn to_json(plugin_id: PluginId) -> json.Json {
  json.string(plugin_id.id)
}

/// Dynamic decoder for a valid `PluginId`.
pub fn decoder() -> decode.Decoder(PluginId) {
  use raw <- decode.then(decode.string)
  case parse(raw) {
    Ok(id) -> decode.success(id)
    Error(Nil) -> decode.failure(PluginId(""), "valid PluginId")
  }
}
