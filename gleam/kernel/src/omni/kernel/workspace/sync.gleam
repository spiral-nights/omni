//// NIP-78 workspace state synchronization and merge engine.
////
//// Manages local persistence of `WorkspaceState` and merges state across devices,
//// favoring newer timestamps while preserving placements and enabled plugins.

import gleam/dict
import gleam/int
import gleam/list
import gleam/option.{None, Some}
import gleam/set
import omni/platform/storage.{type Storage}
import omni/protocol/workspace.{
  type PluginConfig, type WorkspaceState, PluginConfig, WorkspaceState,
}

/// Storage key under which the local workspace state JSON is persisted.
pub const storage_key_workspace = "omni_workspace_state"

/// Returns the initial default `WorkspaceState`.
pub fn default_state() -> WorkspaceState {
  WorkspaceState(
    version: workspace.current_version,
    updated_at: 0,
    active_page: None,
    auto_sync: Some(True),
    shell_type: Some("classic"),
    default_intents: dict.new(),
    plugins: [],
  )
}

/// Loads the persisted `WorkspaceState` from `storage`, migrating legacy formats
/// or returning `default_state()` if absent or corrupt.
pub fn load(store: Storage) -> WorkspaceState {
  case storage.get(store, storage_key_workspace) {
    Some(raw) -> {
      case workspace.migrate_json(raw, 0) {
        Ok(state) -> state
        Error(_) -> default_state()
      }
    }
    None -> default_state()
  }
}

/// Encodes and saves `state` into `storage`.
pub fn save(store: Storage, state: WorkspaceState) -> Nil {
  let encoded = workspace.encode(state)
  let _ = storage.set(store, storage_key_workspace, encoded)
  Nil
}

fn merge_plugin_config(
  newer: PluginConfig,
  older: PluginConfig,
) -> PluginConfig {
  let newer_placement_ids =
    set.from_list(list.map(newer.placements, fn(pl) { pl.id }))

  let older_extra_placements =
    list.filter(older.placements, fn(pl) {
      !set.contains(newer_placement_ids, pl.id)
    })

  let merged_placements = list.append(newer.placements, older_extra_placements)

  let all_handled =
    list.unique(list.append(newer.handled_intents, older.handled_intents))

  let all_disabled =
    list.unique(list.append(newer.disabled_intents, older.disabled_intents))

  let merged_enabled = newer.enabled || older.enabled

  let cfg =
    PluginConfig(
      ..newer,
      enabled: merged_enabled,
      placements: merged_placements,
      handled_intents: all_handled,
      disabled_intents: all_disabled,
    )

  let cfg = case cfg.display_name {
    Some(_) -> cfg
    None -> PluginConfig(..cfg, display_name: older.display_name)
  }
  let cfg = case cfg.icon {
    Some(_) -> cfg
    None -> PluginConfig(..cfg, icon: older.icon)
  }
  let cfg = case cfg.description {
    Some(_) -> cfg
    None -> PluginConfig(..cfg, description: older.description)
  }
  let cfg = case cfg.naddr {
    Some(_) -> cfg
    None -> PluginConfig(..cfg, naddr: older.naddr)
  }
  cfg
}

/// Merges local and remote workspace states:
/// - Favors the newer `updated_at` for active page, shell type, and options.
/// - Merges default intent mappings (newer overriding older on conflicts).
/// - Combines plugins from both states, preserving enabled plugins and placements.
pub fn merge(local: WorkspaceState, remote: WorkspaceState) -> WorkspaceState {
  let #(newer, older) = case local.updated_at >= remote.updated_at {
    True -> #(local, remote)
    False -> #(remote, local)
  }

  let final_updated_at = int.max(local.updated_at, remote.updated_at)
  let final_version = int.max(local.version, remote.version)

  let final_active_page = case newer.active_page {
    Some(p) -> Some(p)
    None -> older.active_page
  }

  let final_auto_sync = case newer.auto_sync {
    Some(s) -> Some(s)
    None -> older.auto_sync
  }

  let final_shell_type = case newer.shell_type {
    Some(st) -> Some(st)
    None -> older.shell_type
  }

  let final_default_intents =
    dict.merge(older.default_intents, newer.default_intents)

  let older_by_id =
    dict.from_list(list.map(older.plugins, fn(p) { #(p.id, p) }))

  let merged_newer_plugins =
    list.map(newer.plugins, fn(p_new) {
      case dict.get(older_by_id, p_new.id) {
        Ok(p_old) -> merge_plugin_config(p_new, p_old)
        Error(Nil) -> p_new
      }
    })

  let newer_plugin_ids = set.from_list(list.map(newer.plugins, fn(p) { p.id }))

  let older_only_plugins =
    list.filter(older.plugins, fn(p) { !set.contains(newer_plugin_ids, p.id) })

  let merged_plugins = list.append(merged_newer_plugins, older_only_plugins)

  WorkspaceState(
    version: final_version,
    updated_at: final_updated_at,
    active_page: final_active_page,
    auto_sync: final_auto_sync,
    shell_type: final_shell_type,
    default_intents: final_default_intents,
    plugins: merged_plugins,
  )
}
