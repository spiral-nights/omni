//// User-swappable shell registry.
////
//// Tracks the registered `Theme` strategies, resolves the active theme, and
//// persists the user's active shell choice via the platform storage port.
//// Strictly plugin-agnostic: zero hardcoded plugin IDs.

import gleam/dict.{type Dict}
import gleam/dynamic/decode
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import omni/platform/storage.{type Storage, type StorageError}
import omni/shell/styles
import omni/shell/theme.{type Theme, Theme}
import omni/shell/themes/editorial
import omni/shell/themes/panorama

/// Storage key holding the persisted active shell ID.
pub const active_shell_storage_key = "omni_active_shell_id"

/// Storage key holding persisted custom shell descriptors.
pub const installed_shells_storage_key = "omni_installed_shells"

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
  [editorial.theme(), panorama.theme()]
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

/// A shareable descriptor for a shell installed from the curated catalog or a
/// custom URL. Custom shells reuse a built-in layout strategy.
pub type ShellDescriptor {
  ShellDescriptor(
    id: String,
    name: String,
    description: String,
    icon: String,
    author: String,
    version: String,
    base_layout: String,
  )
}

/// Curated shell catalog. Entries are installable but start uninstalled.
pub fn curated_descriptors() -> List(ShellDescriptor) {
  [
    ShellDescriptor(
      id: "mantra",
      name: "Mantra Shell",
      description: "Calm, centered reading shell layered on the Panorama hub layout with generous whitespace.",
      icon: "layout",
      author: "Omni Core Team",
      version: "1.0.0",
      base_layout: "panorama",
    ),
  ]
}

/// Build a `Theme` strategy for a descriptor using its base layout renderer.
pub fn theme_from_descriptor(desc: ShellDescriptor) -> Theme {
  let base = case desc.base_layout {
    "panorama" -> panorama.theme()
    _ -> editorial.theme()
  }
  Theme(
    id: desc.id,
    name: desc.name,
    description: desc.description,
    icon: desc.icon,
    author: desc.author,
    version: desc.version,
    is_builtin: False,
    stylesheet_href: base.stylesheet_href,
    render: base.render,
  )
}

/// Register a custom shell descriptor.
pub fn install_descriptor(
  reg: ShellRegistry,
  desc: ShellDescriptor,
) -> ShellRegistry {
  register(reg, theme_from_descriptor(desc))
}

/// Unregister a non-builtin shell. Built-in shells cannot be removed.
pub fn uninstall_shell(reg: ShellRegistry, shell_id: String) -> ShellRegistry {
  case resolve(reg, shell_id) {
    Some(theme) if !theme.is_builtin -> unregister(reg, shell_id)
    _ -> reg
  }
}

/// Persist every registered non-builtin shell descriptor to storage.
pub fn save_installed_shells(reg: ShellRegistry, store: Storage) -> Nil {
  let descriptors =
    reg.shells
    |> dict.values
    |> list.filter(fn(theme) { !theme.is_builtin })
    |> list.map(fn(theme) {
      json.object([
        #("id", json.string(theme.id)),
        #("name", json.string(theme.name)),
        #("description", json.string(theme.description)),
        #("icon", json.string(theme.icon)),
        #("author", json.string(theme.author)),
        #("version", json.string(theme.version)),
        #("base_layout", json.string(base_layout_for(theme.stylesheet_href))),
      ])
    })
    |> json.array(of: fn(value) { value })
    |> json.to_string
  let _ = storage.set(store, installed_shells_storage_key, descriptors)
  Nil
}

fn base_layout_for(stylesheet_href: String) -> String {
  case string.contains(stylesheet_href, "panorama") {
    True -> "panorama"
    False -> "editorial"
  }
}

/// Load and register persisted custom shells, ignoring duplicates and garbage.
pub fn load_installed_shells(
  reg: ShellRegistry,
  store: Storage,
) -> ShellRegistry {
  case storage.get(store, installed_shells_storage_key) {
    Some(raw) ->
      case json.parse(from: raw, using: decode.list(descriptor_decoder())) {
        Ok(descriptors) ->
          list.fold(descriptors, reg, fn(acc, desc) {
            case resolve(acc, desc.id) {
              Some(_) -> acc
              None -> install_descriptor(acc, desc)
            }
          })
        Error(_) -> reg
      }
    None -> reg
  }
}

fn descriptor_decoder() -> decode.Decoder(ShellDescriptor) {
  use id <- decode.field("id", decode.string)
  use name <- decode.field("name", decode.string)
  use description <- decode.field("description", decode.string)
  use icon <- decode.field("icon", decode.string)
  use author <- decode.field("author", decode.string)
  use version <- decode.field("version", decode.string)
  use base_layout <- decode.field("base_layout", decode.string)
  decode.success(ShellDescriptor(
    id: id,
    name: name,
    description: description,
    icon: icon,
    author: author,
    version: version,
    base_layout: base_layout,
  ))
}

/// Build a custom shell descriptor from a URL and base layout.
pub fn descriptor_from_url(
  url: String,
  base_layout: String,
) -> ShellDescriptor {
  let slug =
    url
    |> string.lowercase
    |> string.replace("https://", "")
    |> string.replace("http://", "")
    |> string.replace("/", ".")
    |> string.replace(":", "-")
    |> string.slice(0, 32)
  let slug = case slug {
    "" -> "custom"
    value -> value
  }
  ShellDescriptor(
    id: "shell.custom." <> slug,
    name: "Custom Shell",
    description: "Installed from " <> url,
    icon: "layout",
    author: "Custom",
    version: "1.0.0",
    base_layout: base_layout,
  )
}
