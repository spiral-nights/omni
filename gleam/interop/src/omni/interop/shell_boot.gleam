//// JS-facing facade over the `omni_web` shell bootloader.
////
//// The host page (`apps/web`) calls `start` to open IndexedDB and initialize
//// the kernel/registry/shell model, renders the returned HTML string into
//// `#omni-root`, and can rebuild the HTML after navigation or shell switches
//// through the exposed message helpers. DOM mounting and event wiring stay in
//// the host so this shared package needs no DOM FFI.

import gleam/javascript/promise
import gleam/option.{None}
import gleam/string
import lustre/element
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
      promise.resolve(Ok(ShellBoot(boot.init(ports))))
    }
    Error(err) -> promise.resolve(Error(err))
  }
}

/// Render the current shell tree as HTML for the host `#omni-root` container.
pub fn render(host: ShellBoot) -> String {
  boot.view(host.booted) |> element.to_string
}

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

fn plugin_settings_id(tab_id: String) -> String {
  string.drop_start(tab_id, 7)
}
