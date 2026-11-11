//// Partitioned `localStorage` shim for guest sandboxes.
////
//// Every key written by a guest is namespaced by its plugin ID so two plugins
//// sharing one origin cannot read or clobber each other's data.

import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string

/// Prefix applied to every guest storage key.
pub const key_prefix = "omni:plugin:"

/// Partition a guest storage key by plugin ID.
pub fn partition_key(plugin_id: String, key: String) -> String {
  key_prefix <> plugin_id <> ":" <> key
}

/// Strip the partitioning prefix for a plugin, returning `None` for foreign keys.
pub fn unpartition_key(plugin_id: String, raw_key: String) -> Option(String) {
  let full_prefix = partition_key(plugin_id, "")
  case string.starts_with(raw_key, full_prefix) {
    True -> Some(string.drop_start(raw_key, string_length(full_prefix)))
    False -> None
  }
}

/// Replace the guest `window.localStorage` with a partitioned shim.
@external(javascript, "./storage_shim.ffi.mjs", "install")
pub fn install(plugin_id: String) -> Nil

fn string_length(value: String) -> Int {
  value |> string.to_graphemes |> list.length
}
