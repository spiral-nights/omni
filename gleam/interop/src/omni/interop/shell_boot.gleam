//// JS-facing facade over the `omni_web` shell bootloader.
////
//// The host page (`apps/web`) calls `start` to open IndexedDB and initialize
//// the kernel/registry/shell model, renders the returned HTML string into
//// `#omni-root`, and can rebuild the HTML after navigation or shell switches
//// through the exposed message helpers. DOM mounting and event wiring stay in
//// the host so this shared package needs no DOM FFI.

import gleam/javascript/promise
import gleam/option.{type Option, None, Some}
import gleam/string

import lustre/effect.{type Effect}
import lustre/element.{type Element}
import omni/kernel/kernel.{KernelPorts}
import omni/platform/clock
import omni/platform/idb
import omni/platform/storage
import omni/shell/model.{AppStore, TabProfile, WidgetsDashboard}
import omni/shell/msg.{NavigateTo, OpenApp, OpenSettings}
import omni/web/boot

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
      mount_island(selector, mount.srcdoc)
      Ok(ShellBoot(next_booted))
    }
    Error(err) -> Error(err)
  }
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
      #(ShellBoot(next), effect.none())
    },
    fn(current: ShellBoot) { boot.view(current.booted) },
  )
}

@external(javascript, "./shell_boot.ffi.mjs", "mount_dom")
fn mount_dom(
  selector: String,
  init: fn(String) -> #(ShellBoot, Effect(msg.Msg)),
  update: fn(ShellBoot, msg.Msg) -> #(ShellBoot, Effect(msg.Msg)),
  view: fn(ShellBoot) -> Element(msg.Msg),
) -> Nil

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
    "relays" -> model.TabRelays
    "plugins" -> model.TabPlugins
    "workspace" -> model.TabWorkspace
    "shells" -> model.TabShells
    _ ->
      case string.starts_with(tab_id, "plugin:") {
        True -> model.TabPluginSettings(plugin_settings_id(tab_id))
        False -> TabProfile
      }
  }
  ShellBoot(dispatch(host, OpenSettings(tab)))
}

@external(javascript, "./shell_boot.ffi.mjs", "mount_island")
fn mount_island(selector: String, srcdoc: String) -> Nil

@external(javascript, "./shell_boot.ffi.mjs", "unmount_island")
fn unmount_island(selector: String) -> Nil

fn plugin_settings_id(tab_id: String) -> String {
  string.drop_start(tab_id, 7)
}
