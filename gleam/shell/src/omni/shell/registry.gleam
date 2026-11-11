//// User-swappable shell registry.
////
//// Tracks the registered `Theme` strategies, resolves the active theme, and
//// persists the user's active shell choice via the platform storage port.
//// Strictly plugin-agnostic: zero hardcoded plugin IDs.

import gleam/dict.{type Dict}
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import omni/platform/storage.{type Storage, type StorageError}
import omni/shell/theme.{type Theme}
import omni/shell/themes/classic
import omni/shell/themes/editorial
import omni/shell/themes/panorama

/// Storage key holding the persisted active shell ID.
pub const active_shell_storage_key = "omni_active_shell_id"

/// Fallback shell ID used when nothing is registered or the stored ID is unknown.
pub const default_shell_id = "editorial"

/// Registry of available shell themes and the currently active shell ID.
pub type ShellRegistry {
  ShellRegistry(active_id: String, shells: Dict(String, Theme))
}

/// Initialize an empty registry with the fallback active shell ID.
pub fn new() -> ShellRegistry {
  ShellRegistry(active_id: default_shell_id, shells: dict.new())
}

/// The built-in first-party shell themes bundled with Omni.
pub fn builtin_themes() -> List(Theme) {
  [editorial.theme(), panorama.theme(), classic.theme()]
}

/// Initialize a registry pre-populated with the built-in shell themes.
pub fn with_builtin_themes() -> ShellRegistry {
  list.fold(builtin_themes(), new(), register)
}

/// Register (or replace) a shell theme by its ID.
pub fn register(registry: ShellRegistry, theme: Theme) -> ShellRegistry {
  ShellRegistry(
    ..registry,
    shells: dict.insert(registry.shells, theme.id, theme),
  )
}

/// Remove a shell theme. If the removed theme was active, the active shell
/// falls back to `default_shell_id`.
pub fn unregister(registry: ShellRegistry, shell_id: String) -> ShellRegistry {
  let next_shells = dict.delete(registry.shells, shell_id)
  let next_active = case registry.active_id == shell_id {
    True -> default_shell_id
    False -> registry.active_id
  }
  ShellRegistry(active_id: next_active, shells: next_shells)
}

/// Look up a registered shell theme by ID.
pub fn resolve(registry: ShellRegistry, shell_id: String) -> Option(Theme) {
  case dict.get(registry.shells, shell_id) {
    Ok(theme) -> Some(theme)
    Error(Nil) -> None
  }
}

/// Set the active shell ID without validating registration.
pub fn set_active(registry: ShellRegistry, shell_id: String) -> ShellRegistry {
  ShellRegistry(..registry, active_id: shell_id)
}

/// Resolve the active theme, falling back to the default shell and finally to
/// the first registered theme.
pub fn active_theme(registry: ShellRegistry) -> Theme {
  case resolve_active(registry) {
    Some(theme) -> theme
    None -> fallback_theme(registry)
  }
}

fn resolve_active(registry: ShellRegistry) -> Option(Theme) {
  case dict.get(registry.shells, registry.active_id) {
    Ok(theme) -> Some(theme)
    Error(Nil) -> resolve(registry, default_shell_id)
  }
}

fn fallback_theme(registry: ShellRegistry) -> Theme {
  case dict.values(registry.shells) {
    [theme, ..] -> theme
    [] -> editorial.theme()
  }
}

/// Load the persisted active shell ID from storage into the registry.
/// Unregistered IDs are ignored, preserving the current active shell.
pub fn load_active_id(reg: ShellRegistry, store: Storage) -> ShellRegistry {
  case storage.get(store, active_shell_storage_key) {
    Some(shell_id) ->
      case dict.has_key(reg.shells, shell_id) {
        True -> set_active(reg, shell_id)
        False -> reg
      }
    None -> reg
  }
}

/// Persist the registry's active shell ID to storage.
pub fn save_active_id(
  reg: ShellRegistry,
  store: Storage,
) -> Result(Nil, StorageError) {
  storage.set(store, active_shell_storage_key, reg.active_id)
}

/// Load the persisted active shell ID, validate it against the registry and
/// persist the validated choice back so a bad stored value self-heals.
pub fn load_and_persist_active_id(
  reg: ShellRegistry,
  store: Storage,
) -> ShellRegistry {
  let loaded = load_active_id(reg, store)
  let _ = save_active_id(loaded, store)
  loaded
}

/// All registered themes, sorted by ID for stable display order.
pub fn list_shells(reg: ShellRegistry) -> List(Theme) {
  reg.shells
  |> dict.values
  |> list.sort(fn(a, b) { string.compare(a.id, b.id) })
}
