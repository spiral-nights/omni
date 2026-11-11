//// JS-facing facade over the `omni_web` shell bootloader.
////
//// The host page (`apps/web`) calls `start` to open IndexedDB and initialize
//// the kernel/registry/shell model, renders the returned HTML string into
//// `#omni-root`, and can rebuild the HTML after navigation or shell switches
//// through the exposed message helpers. DOM mounting and event wiring stay in
//// the host so this shared package needs no DOM FFI.

import gleam/dict
import gleam/javascript/promise
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string

import lustre/effect.{type Effect}
import lustre/element.{type Element}
import omni/kernel/kernel.{KernelPorts}
import omni/kernel/nostr/coordinator
import omni/kernel/nostr/relay_pool
import omni/nostr/event as nostr_event
import omni/nostr/filter.{type Filter, Filter}
import omni/nostr/kind
import omni/nostr/relay_url
import omni/platform/clock
import omni/platform/idb
import omni/platform/storage
import omni/platform/url
import omni/plugin_kit/route.{type Route}
import omni/protocol/workspace
import omni/shell/model.{
  type SettingsTab, AppStore, PrimaryApp, Settings, TabPluginSettings,
  TabPlugins, TabProfile, TabRelays, TabShells, TabWorkspace, WidgetsDashboard,
}
import omni/shell/msg.{
  ApplyRemoteWorkspace, EmbedSchema, NavigateTo, OpenApp, OpenSettings,
}
import omni/web/boot
import omni/web/config
import omni/web/rpc

/// Opaque shell boot state handed back to the host page.
pub type ShellBoot {
  ShellBoot(booted: boot.Booted)
}

/// Initialize the shell boot state, opening the host IndexedDB database and
/// resolving the persisted shell selection.
pub fn start(db_name: String) -> promise.Promise(Result(ShellBoot, String)) {
  start_with_bridge(db_name, "")
}

/// Initialize the shell boot state with the bundled Gleam guest bridge script
/// injected into every plugin sandbox (empty string disables injection).
pub fn start_with_bridge(
  db_name: String,
  bridge_script_source: String,
) -> promise.Promise(Result(ShellBoot, String)) {
  let bridge_script = case string.trim(bridge_script_source) {
    "" -> None
    source -> Some(source)
  }
  use db_res <- promise.await(idb.open(db_name, 1, fn(_) { Nil }))

  case db_res {
    Ok(db) -> {
      let ports =
        KernelPorts(
          storage: storage.local_or_in_memory(),
          idb: db,
          clock: clock.system(),
          prompt_handler: None,
        )
      promise.resolve(
        Ok(ShellBoot(boot.init_with_bridge(ports, bridge_script))),
      )
    }
    Error(err) -> promise.resolve(Error(err))
  }
}

/// Spawn a plugin sandbox and mount its `<iframe>` into the island container
/// identified by `selector`, using the bootstrapped guest bridge.
pub fn spawn_plugin(
  host: ShellBoot,
  selector: String,
  plugin_id: String,
  content: String,
  route: Option(String),
) -> Result(ShellBoot, String) {
  case boot.spawn_sandbox(host.booted, plugin_id, content, route) {
    Ok(#(next_booted, mount)) -> {
      mount_island(selector, mount.srcdoc, plugin_id, fn(raw_request, respond) {
        let _ =
          rpc.handle(next_booted, plugin_id, raw_request)
          |> promise.map(fn(response) { respond(response) })
        Nil
      })
      Ok(ShellBoot(next_booted))
    }
    Error(err) -> Error(err)
  }
}

/// Current user public key (hex) and npub.
pub fn user_pubkey(host: ShellBoot) -> String {
  rpc.public_key_hex(host.booted)
}

pub fn user_npub(host: ShellBoot) -> String {
  rpc.npub(host.booted)
}

/// Sign an unsigned-event JSON draft and return the signed event JSON.
pub fn sign_event(
  host: ShellBoot,
  draft_json: String,
) -> Result(String, String) {
  rpc.sign_draft_json(host.booted, draft_json)
}

/// Answer a raw JSON-RPC frame for `plugin_id` (Channel 2 host binding).
pub fn rpc_frame(
  host: ShellBoot,
  plugin_id: String,
  request_json: String,
) -> promise.Promise(String) {
  rpc.handle(host.booted, plugin_id, request_json)
}

/// Terminate a plugin sandbox and remove its mounted island contents.
pub fn terminate_plugin(host: ShellBoot, selector: String) -> ShellBoot {
  unmount_island(selector)
  ShellBoot(host.booted)
}

/// Render the current shell tree as HTML (static snapshot; no event handlers).
pub fn render(host: ShellBoot) -> String {
  boot.view(host.booted) |> element.to_string
}

/// Mount the interactive shell into `selector` using Lustre's client runtime.
/// Messages are dispatched through the bootloader, so persistence effects apply
/// and the view re-renders in place with live event handlers.
pub fn mount_shell(selector: String, host: ShellBoot) -> Nil {
  mount_dom(
    selector,
    fn(_flags) { #(host, effect.none()) },
    fn(current: ShellBoot, message: msg.Msg) {
      let #(next, _effects) = boot.dispatch(current.booted, message)
      let _ =
        boot.publish_pending(next)
        |> promise.map(fn(event_ids) {
          case event_ids {
            [] -> Nil
            _ -> push_views(ShellBoot(next))
          }
        })
      #(ShellBoot(next), effect.none())
    },
    fn(current: ShellBoot) { boot.view(current.booted) },
    msg_from_url,
    page_url,
  )
}

/// URL for the shell's current page, used for `history.pushState`.
pub fn page_url(host: ShellBoot) -> String {
  case host.booted.model.active_page {
    PrimaryApp(plugin_id, _route) -> "?app=" <> url.encode_component(plugin_id)
    WidgetsDashboard -> "?view=widgets"
    AppStore -> "?view=apps"
    Settings(tab) -> "?view=settings&tab=" <> settings_tab_slug(tab)
  }
}

fn settings_tab_slug(tab: SettingsTab) -> String {
  case tab {
    TabProfile -> "profile"
    TabRelays -> "relays"
    TabPlugins -> "plugins"
    TabWorkspace -> "workspace"
    TabShells -> "shells"
    TabPluginSettings(plugin_id) -> "plugin:" <> plugin_id
  }
}

/// Decode a browser URL (`path?search`) into a shell message for back/forward.
pub fn msg_from_url(raw: String) -> Option(msg.Msg) {
  let search = case string.split_once(raw, "?") {
    Ok(#(_path, query)) -> "?" <> query
    Error(Nil) -> raw
  }
  let parsed = route.parse_search(search)

  case route.get_param(parsed, "app") {
    Some(plugin_id) if plugin_id != "" -> Some(msg.OpenApp(plugin_id, None))
    _ ->
      case route.get_param(parsed, "view") {
        Some(view) ->
          case string.lowercase(view) {
            "widgets" -> Some(msg.NavigateTo(WidgetsDashboard))
            "apps" -> Some(msg.NavigateTo(AppStore))
            "settings" -> Some(msg.OpenSettings(tab_from_slug(parsed)))
            _ -> None
          }
        None -> None
      }
  }
}

fn tab_from_slug(parsed: Route) -> SettingsTab {
  case route.get_param(parsed, "tab") {
    Some(raw) ->
      case raw {
        "relays" -> TabRelays
        "plugins" -> TabPlugins
        "workspace" -> TabWorkspace
        "shells" -> TabShells
        _ ->
          case string.starts_with(raw, "plugin:") {
            True -> TabPluginSettings(string.drop_start(raw, 7))
            False -> TabProfile
          }
      }
    None -> TabProfile
  }
}

@external(javascript, "./shell_boot.ffi.mjs", "mount_dom")
fn mount_dom(
  selector: String,
  init: fn(String) -> #(ShellBoot, Effect(msg.Msg)),
  update: fn(ShellBoot, msg.Msg) -> #(ShellBoot, Effect(msg.Msg)),
  view: fn(ShellBoot) -> Element(msg.Msg),
  parse_url: fn(String) -> Option(msg.Msg),
  page_url: fn(ShellBoot) -> String,
) -> Nil

/// Subscribe to public relay events, feed them to built-in apps that consume
/// events, push live relay statuses, and refresh the embedded Schema views.
pub fn start_live_data(host: ShellBoot) -> Nil {
  let _ =
    coordinator.subscribe(
      host.booted.kernel.coordinator,
      "builtin:feed",
      [public_events_filter()],
      fn(event) {
        dict.each(host.booted.builtins, fn(_id, app) {
          case app.ingest {
            Some(ingest) -> ingest(event)
            None -> Nil
          }
        })
        push_views(host)
      },
      None,
    )

  let self_pubkey = rpc.public_key_hex(host.booted)
  let _ =
    coordinator.subscribe(
      host.booted.kernel.coordinator,
      "builtin:workspace",
      [workspace_filter(self_pubkey)],
      fn(event) {
        case nostr_event.get_tag_values(event.tags, "d") {
          [d_tag, ..] if d_tag == config.workspace_sync_d_tag ->
            case workspace.decode_json(event.content) {
              Ok(state) ->
                case state.plugins {
                  [] -> Nil
                  _ -> dispatch_shell_msg(ApplyRemoteWorkspace(state))
                }
              Error(_) -> Nil
            }
          _ -> Nil
        }
      },
      None,
    )

  push_relay_statuses(
    host,
    relay_pool.get_statuses(host.booted.kernel.relay_pool),
  )
  let _ =
    relay_pool.watch_statuses(host.booted.kernel.relay_pool, fn(statuses) {
      push_relay_statuses(host, statuses)
      push_views(host)
    })

  push_views(host)
}

fn push_relay_statuses(
  host: ShellBoot,
  statuses: List(#(relay_url.RelayUrl, relay_pool.RelayStatus)),
) -> Nil {
  list.each(statuses, fn(pair) {
    let #(url, status) = pair
    let connected = case status {
      relay_pool.Connected -> True
      _ -> False
    }
    dict.each(host.booted.builtins, fn(_id, app) {
      case app.relay_status {
        Some(update) -> update(relay_url.to_string(url), connected)
        None -> Nil
      }
    })
  })
}

fn relay_list_filter(author_hex: String) -> Filter {
  Filter(
    ids: None,
    authors: Some([author_hex]),
    kinds: Some([kind.RelayList]),
    since: None,
    until: None,
    limit: Some(1),
    search: None,
    tags: dict.new(),
  )
}

fn workspace_filter(author_hex: String) -> Filter {
  Filter(
    ids: None,
    authors: Some([author_hex]),
    kinds: Some([kind.AppData]),
    since: None,
    until: None,
    limit: Some(5),
    search: None,
    tags: dict.new(),
  )
}

fn public_events_filter() -> Filter {
  Filter(
    ids: None,
    authors: None,
    kinds: Some([kind.Note, kind.Metadata, kind.Repost, kind.Reaction]),
    since: None,
    until: None,
    limit: Some(80),
    search: None,
    tags: dict.new(),
  )
}

fn push_views(host: ShellBoot) -> Nil {
  dict.each(host.booted.builtins, fn(plugin_id, app) {
    dispatch_shell_msg(EmbedSchema(plugin_id, app.render()))
  })
}

@external(javascript, "./shell_boot.ffi.mjs", "dispatch_shell_msg")
fn dispatch_shell_msg(message: msg.Msg) -> Nil

/// The active shell theme ID (`"classic"`, `"panorama"`, `"editorial"`).
pub fn active_shell_id(host: ShellBoot) -> String {
  host.booted.registry.active_id
}

/// Switch the active shell theme and persist the choice.
pub fn select_shell(host: ShellBoot, shell_id: String) -> ShellBoot {
  ShellBoot(boot.select_shell(host.booted, shell_id))
}

/// Open a plugin application by ID.
pub fn open_app(host: ShellBoot, plugin_id: String) -> ShellBoot {
  ShellBoot(dispatch(host, OpenApp(plugin_id, None)))
}

/// Navigate to the Widgets dashboard.
pub fn open_widgets(host: ShellBoot) -> ShellBoot {
  ShellBoot(dispatch(host, NavigateTo(WidgetsDashboard)))
}

/// Navigate to the Apps / App Store view.
pub fn open_apps(host: ShellBoot) -> ShellBoot {
  ShellBoot(dispatch(host, NavigateTo(AppStore)))
}

/// Open Settings (profile tab by default).
pub fn open_settings(host: ShellBoot) -> ShellBoot {
  ShellBoot(dispatch(host, OpenSettings(TabProfile)))
}

/// Toggle expansive fullscreen mode.
pub fn toggle_fullscreen(host: ShellBoot) -> ShellBoot {
  ShellBoot(dispatch(host, msg.ToggleFullscreen))
}

fn dispatch(host: ShellBoot, message: msg.Msg) -> boot.Booted {
  boot.dispatch(host.booted, message) |> fn(pair) { pair.0 }
}

/// Open Settings on a specific tab ID: `"profile"`, `"relays"`, `"plugins"`,
/// `"workspace"`, `"shells"`, or `"plugin:<id>"` for a plugin settings tab.
pub fn open_settings_tab(host: ShellBoot, tab_id: String) -> ShellBoot {
  let tab = case tab_id {
    "relays" -> TabRelays
    "plugins" -> TabPlugins
    "workspace" -> TabWorkspace
    "shells" -> TabShells
    _ ->
      case string.starts_with(tab_id, "plugin:") {
        True -> TabPluginSettings(plugin_settings_id(tab_id))
        False -> TabProfile
      }
  }
  ShellBoot(dispatch(host, OpenSettings(tab)))
}

@external(javascript, "./shell_boot.ffi.mjs", "mount_island")
fn mount_island(
  selector: String,
  srcdoc: String,
  plugin_id: String,
  on_rpc: fn(String, fn(String) -> Nil) -> Nil,
) -> Nil

@external(javascript, "./shell_boot.ffi.mjs", "unmount_island")
fn unmount_island(selector: String) -> Nil

fn plugin_settings_id(tab_id: String) -> String {
  string.drop_start(tab_id, 7)
}
