//// Per-plugin storage quota tracker and accounting.
////
//// Tracks cumulative key-value byte usage per plugin against configured
//// storage thresholds.

import gleam/list
import gleam/option.{None, Some}
import gleam/string
import omni/platform/storage.{type Storage}
import omni/protocol/plugin_id.{type PluginId}

/// Tracks per-plugin storage consumption against a maximum byte ceiling.
pub type QuotaTracker {
  QuotaTracker(storage: Storage, max_bytes_per_plugin: Int)
}

/// Creates a new `QuotaTracker` bound to `storage` with `max_bytes_per_plugin`.
pub fn new(storage: Storage, max_bytes_per_plugin: Int) -> QuotaTracker {
  QuotaTracker(storage: storage, max_bytes_per_plugin: max_bytes_per_plugin)
}

/// Generates the storage key prefix for `plugin_id`.
pub fn plugin_prefix(plugin_id: PluginId) -> String {
  plugin_id.to_string(plugin_id) <> "::"
}

/// Scopes an application key under `plugin_id`.
pub fn scoped_key(plugin_id: PluginId, key: String) -> String {
  plugin_prefix(plugin_id) <> key
}

/// Computes the total byte usage of stored values for `plugin_id`.
pub fn get_usage(tracker: QuotaTracker, plugin_id: PluginId) -> Int {
  let prefix = plugin_prefix(plugin_id)
  let keys =
    list.filter(tracker.storage.keys(), fn(k) { string.starts_with(k, prefix) })
  list.fold(keys, 0, fn(acc, k) {
    case tracker.storage.get(k) {
      Some(v) -> acc + string.byte_size(v)
      None -> acc
    }
  })
}

/// Verifies whether writing `added_bytes` for `plugin_id` stays within quota.
pub fn check_quota(
  tracker: QuotaTracker,
  plugin_id: PluginId,
  added_bytes: Int,
) -> Bool {
  let current = get_usage(tracker, plugin_id)
  current + added_bytes <= tracker.max_bytes_per_plugin
}
