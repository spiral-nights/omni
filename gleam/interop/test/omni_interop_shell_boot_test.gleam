//// Tests for the JS-facing shell boot facade.

import gleam/javascript/promise
import gleam/option.{None, Some}
import gleam/string
import gleeunit/should
import omni/interop/shell_boot
import omni/kernel/kernel.{KernelPorts}
import omni/platform/clock
import omni/platform/idb
import omni/platform/storage
import omni/shell/model.{
  AppStore, TabPluginSettings, TabShells, WidgetsDashboard,
}
import omni/shell/msg.{NavigateTo, OpenApp, OpenSettings}
import omni/web/boot

pub fn shell_boot_render_and_navigation_test() {
  use db_res <- promise.await(idb.in_memory_simple())
  let assert Ok(db) = db_res

  let ports =
    KernelPorts(
      storage: storage.in_memory(),
      idb: db,
      clock: clock.fixed(1_700_000_000_000),
      prompt_handler: None,
    )

  let host = shell_boot.ShellBoot(boot.init(ports))

  shell_boot.active_shell_id(host) |> should.equal("editorial")

  let html = shell_boot.render(host)
  should.be_true(string.contains(html, "id=\"omni-boot-root\""))
  should.be_true(string.contains(html, "assets/styles/editorial.css"))

  let classic = shell_boot.select_shell(host, "classic")
  shell_boot.active_shell_id(classic) |> should.equal("classic")
  shell_boot.render(classic)
  |> string.contains("assets/styles/classic.css")
  |> should.equal(True)

  shell_boot.render(shell_boot.open_widgets(host))
  |> string.contains("omni-widgets-grid")
  |> should.equal(True)

  shell_boot.render(shell_boot.open_apps(host))
  |> string.contains("omni-app-store")
  |> should.equal(True)

  shell_boot.render(shell_boot.open_settings_tab(host, "shells"))
  |> string.contains("omni-settings-view")
  |> should.equal(True)

  promise.resolve(Nil)
}

pub fn url_parsing_maps_to_shell_messages_test() {
  case shell_boot.msg_from_url("/?app=example.app.alpha") {
    Some(OpenApp("example.app.alpha", _)) -> Nil
    _ -> should.fail()
  }

  shell_boot.msg_from_url("/?view=widgets")
  |> should.equal(Some(NavigateTo(WidgetsDashboard)))
  shell_boot.msg_from_url("/?view=apps")
  |> should.equal(Some(NavigateTo(AppStore)))
  shell_boot.msg_from_url("http://host/?view=settings&tab=shells")
  |> should.equal(Some(OpenSettings(TabShells)))
  shell_boot.msg_from_url("/?view=settings&tab=plugin:example.app.alpha")
  |> should.equal(Some(OpenSettings(TabPluginSettings("example.app.alpha"))))
  shell_boot.msg_from_url("/?view=unknown") |> should.equal(None)
  shell_boot.msg_from_url("/") |> should.equal(None)
}
