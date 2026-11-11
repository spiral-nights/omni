//// Plugin registry tracking installed, enabled, and pinned plugins.
////
//// Agnostic to specific plugin implementations: zero hard-coded plugin IDs.
//// Manages plugin lifecycles, companion viewports, ordering, and intent declarations.

import gleam/dict.{type Dict}
import gleam/list
import gleam/option.{type Option, None, Some}
import omni/kernel/plugins/resolver.{type ResolvedPlugin}
import omni/protocol/manifest.{type PluginViewDeclaration}
import omni/protocol/viewport.{type Viewport}
import omni/protocol/workspace.{
  type PluginConfig, type PluginPlacement, PluginConfig,
}

/// An installed plugin entry in the registry.
pub type PluginEntry {
  PluginEntry(
    id: String,
    name: String,
    display_name: Option(String),
    version: String,
    description: String,
    icon: Option(String),
    viewport: Option(Viewport),
    route: Option(String),
    view_id: Option(String),
    enabled: Bool,
    pinned: Bool,
    order: Int,
    entry: String,
    content: String,
    source_url: Option(String),
    naddr: Option(String),
    relays: List(String),
    views: List(PluginViewDeclaration),
    placements: List(PluginPlacement),
    handled_intents: List(String),
    disabled_intents: List(String),
  )
}

/// Headless registry maintaining installed plugins and their order.
pub type PluginRegistry {
  PluginRegistry(plugins: Dict(String, PluginEntry), order: List(String))
}

/// Create an empty plugin registry.
pub fn new() -> PluginRegistry {
  PluginRegistry(plugins: dict.new(), order: [])
}

/// Number of installed plugins.
pub fn count(registry: PluginRegistry) -> Int {
  dict.size(registry.plugins)
}

/// Check if a plugin is installed.
pub fn is_installed(registry: PluginRegistry, plugin_id: String) -> Bool {
  dict.has_key(registry.plugins, plugin_id)
}

/// Lookup a plugin by ID.
pub fn get(
  registry: PluginRegistry,
  plugin_id: String,
) -> Result(PluginEntry, Nil) {
  dict.get(registry.plugins, plugin_id)
}

/// Install or update a plugin entry.
pub fn install(
  registry: PluginRegistry,
  plugin: PluginEntry,
) -> PluginRegistry {
  let is_new = !dict.has_key(registry.plugins, plugin.id)
  let next_order = case is_new {
    True -> list.append(registry.order, [plugin.id])
    False -> registry.order
  }
  let next_plugins = dict.insert(registry.plugins, plugin.id, plugin)
  PluginRegistry(plugins: next_plugins, order: next_order)
}

/// Install a plugin from a `ResolvedPlugin` manifest.
pub fn install_from_resolved(
  registry: PluginRegistry,
  resolved: ResolvedPlugin,
) -> PluginRegistry {
  let existing = get(registry, resolved.id)
  let #(enabled, pinned, placements, viewport, disabled_intents) = case
    existing
  {
    Ok(prev) -> #(
      prev.enabled,
      prev.pinned,
      prev.placements,
      prev.viewport,
      prev.disabled_intents,
    )
    Error(Nil) -> #(True, False, [], None, [])
  }

  let entry =
    PluginEntry(
      id: resolved.id,
      name: resolved.name,
      display_name: resolved.display_name,
      version: resolved.version,
      description: resolved.description,
      icon: resolved.icon,
      viewport: viewport,
      route: None,
      view_id: None,
      enabled: enabled,
      pinned: pinned,
      order: list.length(registry.order),
      entry: resolved.entry,
      content: resolved.content,
      source_url: resolved.source_url,
      naddr: resolved.naddr,
      relays: resolved.relays,
      views: resolved.views,
      placements: placements,
      handled_intents: resolved.handled_intents,
      disabled_intents: disabled_intents,
    )

  install(registry, entry)
}

/// Uninstall a plugin by ID.
pub fn uninstall(
  registry: PluginRegistry,
  plugin_id: String,
) -> PluginRegistry {
  let next_plugins = dict.delete(registry.plugins, plugin_id)
  let next_order = list.filter(registry.order, fn(id) { id != plugin_id })
  PluginRegistry(plugins: next_plugins, order: next_order)
}

/// Check if a plugin is enabled. Returns False if plugin is not installed.
pub fn is_enabled(registry: PluginRegistry, plugin_id: String) -> Bool {
  case get(registry, plugin_id) {
    Ok(p) -> p.enabled
    Error(Nil) -> False
  }
}

/// Check if a plugin is pinned. Returns False if plugin is not installed.
pub fn is_pinned(registry: PluginRegistry, plugin_id: String) -> Bool {
  case get(registry, plugin_id) {
    Ok(p) -> p.pinned
    Error(Nil) -> False
  }
}

/// Enable or disable an installed plugin.
pub fn set_enabled(
  registry: PluginRegistry,
  plugin_id: String,
  enabled: Bool,
) -> PluginRegistry {
  case get(registry, plugin_id) {
    Ok(plugin) -> {
      let updated = PluginEntry(..plugin, enabled: enabled)
      PluginRegistry(
        ..registry,
        plugins: dict.insert(registry.plugins, plugin_id, updated),
      )
    }
    Error(Nil) -> registry
  }
}

/// Enable an installed plugin.
pub fn enable(registry: PluginRegistry, plugin_id: String) -> PluginRegistry {
  set_enabled(registry, plugin_id, True)
}

/// Disable an installed plugin.
pub fn disable(registry: PluginRegistry, plugin_id: String) -> PluginRegistry {
  set_enabled(registry, plugin_id, False)
}

/// Set pinned status of an installed plugin.
pub fn set_pinned(
  registry: PluginRegistry,
  plugin_id: String,
  pinned: Bool,
) -> PluginRegistry {
  case get(registry, plugin_id) {
    Ok(plugin) -> {
      let updated = PluginEntry(..plugin, pinned: pinned)
      PluginRegistry(
        ..registry,
        plugins: dict.insert(registry.plugins, plugin_id, updated),
      )
    }
    Error(Nil) -> registry
  }
}

/// Pin an installed plugin.
pub fn pin(registry: PluginRegistry, plugin_id: String) -> PluginRegistry {
  set_pinned(registry, plugin_id, True)
}

/// Unpin an installed plugin.
pub fn unpin(registry: PluginRegistry, plugin_id: String) -> PluginRegistry {
  set_pinned(registry, plugin_id, False)
}

/// Return all installed plugins in ordered sequence.
pub fn list_all(registry: PluginRegistry) -> List(PluginEntry) {
  list.filter_map(registry.order, fn(id) { get(registry, id) })
}

/// Return only enabled plugins in ordered sequence.
pub fn list_enabled(registry: PluginRegistry) -> List(PluginEntry) {
  list.filter(list_all(registry), fn(p) { p.enabled })
}

/// Return only pinned plugins in ordered sequence.
pub fn list_pinned(registry: PluginRegistry) -> List(PluginEntry) {
  list.filter(list_all(registry), fn(p) { p.pinned })
}

/// Return only disabled plugins in ordered sequence.
pub fn list_disabled(registry: PluginRegistry) -> List(PluginEntry) {
  list.filter(list_all(registry), fn(p) { !p.enabled })
}

/// Set custom plugin order list.
pub fn set_order(
  registry: PluginRegistry,
  ordered_ids: List(String),
) -> PluginRegistry {
  let known_ids =
    list.filter(ordered_ids, fn(id) { dict.has_key(registry.plugins, id) })
  let missing_ids =
    list.filter(registry.order, fn(id) { !list.contains(known_ids, id) })
  let full_order = list.append(known_ids, missing_ids)
  PluginRegistry(..registry, order: full_order)
}

/// Convert registry entries into `PluginConfig` records for NIP-78 sync.
pub fn to_plugin_configs(registry: PluginRegistry) -> List(PluginConfig) {
  list.index_map(list_all(registry), fn(p, idx) {
    PluginConfig(
      id: p.id,
      viewport: p.viewport,
      enabled: p.enabled,
      pinned: Some(p.pinned),
      order: Some(idx),
      naddr: p.naddr,
      source_url: p.source_url,
      display_name: p.display_name,
      name: Some(p.name),
      description: Some(p.description),
      icon: p.icon,
      route: p.route,
      view_id: p.view_id,
      relays: case p.relays {
        [] -> None
        r -> Some(r)
      },
      placements: p.placements,
      handled_intents: p.handled_intents,
      disabled_intents: p.disabled_intents,
    )
  })
}

/// Reconstruct a `PluginRegistry` from `List(PluginConfig)` loaded from workspace storage.
pub fn from_plugin_configs(configs: List(PluginConfig)) -> PluginRegistry {
  list.fold(configs, new(), fn(acc, cfg) {
    let entry =
      PluginEntry(
        id: cfg.id,
        name: case cfg.name {
          Some(n) -> n
          None -> cfg.id
        },
        display_name: cfg.display_name,
        version: "1.0.0",
        description: case cfg.description {
          Some(d) -> d
          None -> ""
        },
        icon: cfg.icon,
        viewport: cfg.viewport,
        route: cfg.route,
        view_id: cfg.view_id,
        enabled: cfg.enabled,
        pinned: case cfg.pinned {
          Some(pin) -> pin
          None -> False
        },
        order: case cfg.order {
          Some(o) -> o
          None -> 0
        },
        entry: "index.html",
        content: "",
        source_url: cfg.source_url,
        naddr: cfg.naddr,
        relays: case cfg.relays {
          Some(r) -> r
          None -> []
        },
        views: [],
        placements: cfg.placements,
        handled_intents: cfg.handled_intents,
        disabled_intents: cfg.disabled_intents,
      )
    install(acc, entry)
  })
}
