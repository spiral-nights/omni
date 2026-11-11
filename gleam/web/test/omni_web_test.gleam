//// Unit tests for the Omni web bootstrap configuration and bootloader.

import gleam/javascript/promise
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import gleeunit
import gleeunit/should
import lustre/element
import omni/kernel/kernel.{type KernelPorts, KernelPorts}
import omni/platform/clock
import omni/platform/idb
import omni/platform/storage
import omni/sandbox/manager
import omni/shell/model
import omni/shell/msg.{NavigateTo, ToggleFullscreen}
import omni/shell/registry
import omni/web/boot
import omni/web/config

pub fn main() {
  gleeunit.main()
}

fn test_ports(
  store: storage.Storage,
) -> promise.Promise(Result(KernelPorts, Nil)) {
  use db_res <- promise.map(idb.in_memory_simple())
  case db_res {
    Ok(db) ->
      Ok(KernelPorts(
        storage: store,
        idb: db,
        clock: clock.fixed(1_700_000_000_000),
        prompt_handler: None,
      ))
    Error(_) -> Error(Nil)
  }
}

pub fn config_bootstrap_relays_parse_test() {
  let urls = config.bootstrap_relay_urls()
  list.length(urls) |> should.equal(3)
  list.length(config.bootstrap_relays()) |> should.equal(3)
}

pub fn config_system_apps_are_unique_and_enabled_test() {
  let apps = config.system_apps()
  let ids = list.map(apps, fn(app) { app.id })

  list.length(apps) |> should.equal(7)
  list.unique(ids) |> list.length |> should.equal(7)

  apps
  |> list.all(fn(app) { app.enabled && app.views != [] && app.source_url != "" })
  |> should.equal(True)

  config.dock_apps()
  |> list.any(fn(app) { app.pinned })
  |> should.equal(True)
}

pub fn config_system_apps_include_sidebar_widgets_test() {
  config.system_apps()
  |> list.any(fn(app) { app.placements != [] })
  |> should.equal(True)
}

pub fn boot_init_seeds_model_from_registry_and_config_test() {
  let store = storage.in_memory()
  use ports_res <- promise.await(test_ports(store))
  let assert Ok(ports) = ports_res

  let booted = boot.init(ports)

  booted.model.active_shell_id |> should.equal("editorial")
  booted.registry.active_id |> should.equal("editorial")
  list.length(booted.model.installed_apps)
  |> should.equal(list.length(config.system_apps()))

  // First-enabled app becomes the initial page.
  case booted.model.active_page {
    model.PrimaryApp(plugin_id, _) ->
      plugin_id |> should.equal("org.omni.plugin.feed")
    _ -> should.fail()
  }

  promise.resolve(Nil)
}

pub fn boot_view_renders_active_theme_and_stylesheets_test() {
  let store = storage.in_memory()
  use ports_res <- promise.await(test_ports(store))
  let assert Ok(ports) = ports_res

  let html_str = boot.view(boot.init(ports)) |> element.to_string

  should.be_true(string.contains(html_str, "id=\"omni-boot-root\""))
  should.be_true(string.contains(html_str, "data-active-shell=\"editorial\""))
  should.be_true(string.contains(html_str, "assets/styles/tokens.css"))
  should.be_true(string.contains(html_str, "assets/styles/schema.css"))
  should.be_true(string.contains(html_str, "assets/styles/shell-modules.css"))
  should.be_true(string.contains(html_str, "assets/styles/editorial.css"))
  should.be_true(string.contains(html_str, "editorial-shell-root"))

  promise.resolve(Nil)
}

pub fn boot_select_shell_persists_and_rerenders_test() {
  let store = storage.in_memory()
  use ports_res <- promise.await(test_ports(store))
  let assert Ok(ports) = ports_res

  let booted = boot.select_shell(boot.init(ports), "classic")

  booted.model.active_shell_id |> should.equal("classic")
  booted.registry.active_id |> should.equal("classic")
  storage.get(store, registry.active_shell_storage_key)
  |> should.equal(Some("classic"))

  let html_str = boot.view(booted) |> element.to_string
  should.be_true(string.contains(html_str, "assets/styles/classic.css"))
  should.be_true(string.contains(html_str, "omni-shell omni-shell-classic"))

  promise.resolve(Nil)
}

pub fn boot_dispatch_updates_model_and_returns_host_effects_test() {
  let store = storage.in_memory()
  use ports_res <- promise.await(test_ports(store))
  let assert Ok(ports) = ports_res

  let #(booted, effects) = boot.dispatch(boot.init(ports), ToggleFullscreen)

  booted.model.fullscreen |> should.equal(True)
  effects |> should.equal([])
  // Switching pages emits host-facing effects for the sandbox manager.
  let #(_, page_effects) =
    boot.dispatch(booted, NavigateTo(model.WidgetsDashboard))
  should.be_true(list.any(page_effects, fn(_) { True }))

  promise.resolve(Nil)
}

pub fn boot_spawns_sandbox_with_guest_bridge_test() {
  let store = storage.in_memory()
  use ports_res <- promise.await(test_ports(store))
  let assert Ok(ports) = ports_res

  let booted = boot.init_with_bridge(ports, Some("/* omni guest bridge */"))
  booted.bridge_script |> should.equal(Some("/* omni guest bridge */"))

  let assert Ok(#(next, mount)) =
    boot.spawn_sandbox(
      booted,
      "example.app.alpha",
      "<h1>hi</h1>",
      Some("?view=widget"),
    )

  should.be_true(string.contains(mount.srcdoc, "/* omni guest bridge */"))
  should.be_true(string.contains(mount.srcdoc, "<h1>hi</h1>"))
  manager.count(next.sandboxes) |> should.equal(1)

  let terminated = boot.terminate_sandbox(next, "example.app.alpha")
  manager.count(terminated.sandboxes) |> should.equal(0)

  case boot.spawn_sandbox(booted, "not a plugin id", "", None) {
    Ok(_) -> should.fail()
    Error(message) ->
      should.be_true(string.contains(message, "Invalid plugin ID"))
  }

  promise.resolve(Nil)
}
