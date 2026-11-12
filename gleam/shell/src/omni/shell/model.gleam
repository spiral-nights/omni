//// Shell application state model, installed app descriptors, and workspace conversion.
////
//// Strictly plugin-agnostic: zero hardcoded plugin IDs.

import gleam/dict.{type Dict}
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import omni/protocol/schema/node.{type Node}
import omni/protocol/viewport.{type Viewport, Dock, HeaderActions, Sidebar}
import omni/protocol/workspace.{
  type WorkspaceState, PluginConfig, PluginPlacement, WorkspaceState,
}

/// Active primary navigation page in the shell.
pub type Page {
  PrimaryApp(plugin_id: String, route: Option(String))
  WidgetsDashboard
  AppStore
  Settings(tab: SettingsTab)
}

/// Active tab inside the Settings view.
pub type SettingsTab {
  TabProfile
  TabRelays
  TabPlugins
  TabWorkspace
  TabShells
  TabPluginSettings(plugin_id: String)
}

/// NIP-78 workspace synchronization status.
pub type SyncStatus {
  SyncIdle
  Syncing
  Synced(timestamp_ms: Int)
  SyncError(String)
}

/// Summary of the signed-in Nostr user's profile.
pub type UserProfileSummary {
  UserProfileSummary(
    pubkey: String,
    npub: String,
    display_name: String,
    picture: Option(String),
    nip05: Option(String),
  )
}

/// Sub-view or route declared by an installed plugin.
pub type ViewOption {
  ViewOption(id: String, title: String, path: String, format: String)
}

/// User-assigned companion viewport placement for an installed plugin.
pub type PlacementConfig {
  PlacementConfig(viewport: Viewport, view_id: String, route: Option(String))
}

/// Installed application descriptor managed by the shell.
pub type InstalledApp {
  InstalledApp(
    id: String,
    name: String,
    display_name: Option(String),
    description: String,
    icon: String,
    enabled: Bool,
    pinned: Bool,
    views: List(ViewOption),
    placements: List(PlacementConfig),
    handled_intents: List(String),
    disabled_intents: List(String),
    relays: Option(List(String)),
    source_url: String,
    version: Option(String),
  )
}

/// State for the "Open With..." intent handler selection modal.
pub type IntentPromptState {
  IntentPromptState(
    intent_name: String,
    candidates: List(String),
    payload_json: String,
  )
}

/// State for the plugin update confirmation modal.
pub type UpdateModalState {
  UpdateModalState(
    plugin_id: String,
    plugin_name: String,
    current_version: String,
    latest_version: String,
    changelog: Option(String),
  )
}

/// A runtime capability request awaiting the user's decision.
pub type PermissionPromptState {
  PermissionPromptState(
    id: Int,
    plugin_id: String,
    capability: String,
    scope: Option(String),
  )
}

/// Root state model for the Omni Shell.
pub type Model {
  Model(
    active_page: Page,
    back_stack: List(Page),
    active_shell_id: String,
    accent_color: String,
    theme_mode: String,
    fullscreen: Bool,
    installed_apps: List(InstalledApp),
    user_profile: Option(UserProfileSummary),
    sync_status: SyncStatus,
    auto_sync_nip78: Bool,
    intent_prompt: Option(IntentPromptState),
    update_modal: Option(UpdateModalState),
    pull_refreshing: Bool,
    search_query: String,
    custom_install_url: String,
    embedded_views: Dict(String, Node),
    permission_prompt: Option(PermissionPromptState),
    key_input: String,
    key_message: Option(String),
    exported_nsec: Option(String),
    passphrase: String,
    key_encrypted: Bool,
    key_locked: Bool,
    accounts: List(String),
  )
}

/// Initialize the shell model with an active shell theme ID and installed apps.
/// Chooses the first enabled app as `PrimaryApp` if available, else `WidgetsDashboard`.
pub fn init(active_shell_id: String, apps: List(InstalledApp)) -> Model {
  let initial_page = case first_enabled_app(apps) {
    Some(app) -> PrimaryApp(plugin_id: app.id, route: None)
    None -> WidgetsDashboard
  }

  Model(
    active_page: initial_page,
    back_stack: [],
    active_shell_id: active_shell_id,
    accent_color: "#d4a373",
    theme_mode: "dark",
    fullscreen: False,
    installed_apps: apps,
    user_profile: None,
    sync_status: SyncIdle,
    auto_sync_nip78: True,
    intent_prompt: None,
    update_modal: None,
    pull_refreshing: False,
    search_query: "",
    custom_install_url: "",
    embedded_views: dict.new(),
    permission_prompt: None,
    key_input: "",
    key_message: None,
    exported_nsec: None,
    passphrase: "",
    key_encrypted: False,
    key_locked: False,
    accounts: [],
  )
}

/// Return the first enabled app in the given list, if any.
pub fn first_enabled_app(apps: List(InstalledApp)) -> Option(InstalledApp) {
  case list.find(apps, fn(app) { app.enabled }) {
    Ok(app) -> Some(app)
    Error(Nil) -> None
  }
}

/// Resolve the human-readable title of an `InstalledApp`.
pub fn app_title(app: InstalledApp) -> String {
  case app.display_name {
    Some(dn) ->
      case dn {
        "" -> app.name
        _ -> dn
      }
    None -> app.name
  }
}

/// Find an installed app by its `plugin_id`.
pub fn find_app(model: Model, plugin_id: String) -> Option(InstalledApp) {
  case list.find(model.installed_apps, fn(a) { a.id == plugin_id }) {
    Ok(app) -> Some(app)
    Error(Nil) -> None
  }
}

/// The route an app should open with: its declared primary view path as a
/// search string (`?view=...`), or `None` when that view is the bare root.
pub fn app_default_route(app: InstalledApp) -> Option(String) {
  let preferred =
    list.find(app.views, fn(v) {
      v.id == "default" || v.id == "main" || v.id == "home"
    })
  let view = case preferred {
    Ok(found) -> Some(found)
    Error(Nil) -> option.from_result(list.first(app.views))
  }
  case view {
    Some(v) -> view_path_route(v.path)
    None -> None
  }
}

/// The route for a named view declared by an app (e.g. `"widget"`).
pub fn app_view_route(app: InstalledApp, view_id: String) -> Option(String) {
  case list.find(app.views, fn(v) { v.id == view_id }) {
    Ok(found) -> view_path_route(found.path)
    Error(Nil) -> None
  }
}

fn view_path_route(path: String) -> Option(String) {
  case string.split(path, "?") {
    [_, query] ->
      case string.trim(query) {
        "" -> None
        q -> Some("?" <> q)
      }
    _ -> None
  }
}

/// Whether an app declares a dedicated settings view (`?view=settings`).
pub fn app_has_settings_view(app: InstalledApp) -> Bool {
  app.enabled
  && list.any(app.views, fn(v) {
    v.id == "settings" || string.contains(v.path, "view=settings")
  })
}

/// Return enabled apps that are `pinned` or have a `Dock` companion placement.
pub fn dock_apps(model: Model) -> List(InstalledApp) {
  list.filter(model.installed_apps, fn(app) {
    app.enabled
    && { app.pinned || list.any(app.placements, fn(p) { p.viewport == Dock }) }
  })
}

/// Return enabled apps and their `Sidebar` placements for the Widgets Dashboard.
pub fn sidebar_widgets(model: Model) -> List(#(InstalledApp, PlacementConfig)) {
  list.flat_map(model.installed_apps, fn(app) {
    case app.enabled {
      False -> []
      True ->
        app.placements
        |> list.filter(fn(p) { p.viewport == Sidebar })
        |> list.map(fn(p) { #(app, p) })
    }
  })
}

/// Return enabled apps and their `HeaderActions` placements for top header quick actions.
pub fn header_action_apps(
  model: Model,
) -> List(#(InstalledApp, PlacementConfig)) {
  list.flat_map(model.installed_apps, fn(app) {
    case app.enabled {
      False -> []
      True ->
        app.placements
        |> list.filter(fn(p) { p.viewport == HeaderActions })
        |> list.map(fn(p) { #(app, p) })
    }
  })
}

/// Convert the current shell `Model` into a NIP-78 `WorkspaceState` snapshot.
pub fn to_workspace_state(model: Model, updated_at: Int) -> WorkspaceState {
  let active_page_str = case model.active_page {
    PrimaryApp(plugin_id, _) -> Some(plugin_id)
    WidgetsDashboard -> Some("widgets")
    AppStore -> Some("apps")
    Settings(_) -> Some("settings")
  }

  let plugin_configs =
    list.index_map(model.installed_apps, fn(app, idx) {
      let ws_placements =
        list.map(app.placements, fn(p) {
          PluginPlacement(
            id: app.id <> ":" <> viewport.to_string(p.viewport),
            viewport: p.viewport,
            route: p.route,
            view_id: Some(p.view_id),
            enabled: Some(app.enabled),
            pinned: Some(app.pinned),
            relays: app.relays,
          )
        })

      PluginConfig(
        id: app.id,
        viewport: None,
        enabled: app.enabled,
        pinned: Some(app.pinned),
        order: Some(idx),
        naddr: None,
        source_url: Some(app.source_url),
        display_name: app.display_name,
        name: Some(app.name),
        description: Some(app.description),
        icon: Some(app.icon),
        route: None,
        view_id: None,
        relays: app.relays,
        placements: ws_placements,
        handled_intents: app.handled_intents,
        disabled_intents: app.disabled_intents,
      )
    })

  WorkspaceState(
    version: workspace.current_version,
    updated_at: updated_at,
    active_page: active_page_str,
    auto_sync: Some(model.auto_sync_nip78),
    shell_type: Some(model.active_shell_id),
    default_intents: dict.new(),
    plugins: plugin_configs,
  )
}

/// Apply a remote or persisted `WorkspaceState` onto the shell `Model`.
pub fn apply_workspace_state(model: Model, ws: WorkspaceState) -> Model {
  let next_shell_id = case ws.shell_type {
    Some(sh) ->
      case sh {
        "" -> model.active_shell_id
        _ -> sh
      }
    None -> model.active_shell_id
  }

  let next_auto_sync = option.unwrap(ws.auto_sync, model.auto_sync_nip78)

  let existing_by_id =
    list.fold(model.installed_apps, dict.new(), fn(acc, app) {
      dict.insert(acc, app.id, app)
    })

  let updated_from_ws =
    list.map(ws.plugins, fn(cfg) {
      let converted_placements =
        list.map(cfg.placements, fn(p) {
          PlacementConfig(
            viewport: p.viewport,
            view_id: option.unwrap(p.view_id, "default"),
            route: p.route,
          )
        })

      case dict.get(existing_by_id, cfg.id) {
        Ok(existing) ->
          InstalledApp(
            ..existing,
            enabled: cfg.enabled,
            pinned: option.unwrap(cfg.pinned, existing.pinned),
            display_name: case cfg.display_name {
              Some(_) -> cfg.display_name
              None -> existing.display_name
            },
            placements: case converted_placements {
              [] -> existing.placements
              _ -> converted_placements
            },
            handled_intents: case cfg.handled_intents {
              [] -> existing.handled_intents
              _ -> cfg.handled_intents
            },
            disabled_intents: cfg.disabled_intents,
            relays: case cfg.relays {
              Some(_) -> cfg.relays
              None -> existing.relays
            },
          )
        Error(Nil) ->
          InstalledApp(
            id: cfg.id,
            name: option.unwrap(cfg.name, cfg.id),
            display_name: cfg.display_name,
            description: option.unwrap(cfg.description, ""),
            icon: option.unwrap(cfg.icon, "apps"),
            enabled: cfg.enabled,
            pinned: option.unwrap(cfg.pinned, False),
            views: [],
            placements: converted_placements,
            handled_intents: cfg.handled_intents,
            disabled_intents: cfg.disabled_intents,
            relays: cfg.relays,
            source_url: option.unwrap(cfg.source_url, ""),
            version: None,
          )
      }
    })

  let ws_ids = list.map(ws.plugins, fn(cfg) { cfg.id })
  let remaining_local =
    list.filter(model.installed_apps, fn(app) { !list.contains(ws_ids, app.id) })

  let merged_apps = case ws.plugins {
    [] -> model.installed_apps
    _ -> list.append(updated_from_ws, remaining_local)
  }

  let next_page = case ws.active_page {
    Some("widgets") | Some("dashboard") -> WidgetsDashboard
    Some("apps") -> AppStore
    Some("settings") -> Settings(TabProfile)
    Some(plugin_id) ->
      case list.find(merged_apps, fn(a) { a.id == plugin_id && a.enabled }) {
        Ok(app) -> PrimaryApp(plugin_id: app.id, route: None)
        Error(Nil) -> model.active_page
      }
    None -> model.active_page
  }

  Model(
    ..model,
    active_page: next_page,
    active_shell_id: next_shell_id,
    auto_sync_nip78: next_auto_sync,
    installed_apps: merged_apps,
  )
}
