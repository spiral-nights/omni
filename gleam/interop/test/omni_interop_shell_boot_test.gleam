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
  AppStore, PrimaryApp, Settings, TabPluginSettings, TabShells, WidgetsDashboard,
}
import omni/shell/msg.{HistorySync}
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

  let panorama = shell_boot.select_shell(host, "panorama")
  shell_boot.active_shell_id(panorama) |> should.equal("panorama")
  shell_boot.render(panorama)
  |> string.contains("assets/styles/panorama.css")
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
  shell_boot.page_from_url("/?app=example.app.alpha")
  |> should.equal(Some(PrimaryApp("example.app.alpha", None)))

  shell_boot.page_from_url("/?app=example.app.alpha&route=%2Fthread%3Fid%3D1")
  |> should.equal(Some(PrimaryApp("example.app.alpha", Some("/thread?id=1"))))

  shell_boot.msg_from_url("/?app=example.app.alpha")
  |> should.equal(
    Some(HistorySync(PrimaryApp("example.app.alpha", None), backward: True)),
  )

  shell_boot.page_from_url("/?view=widgets")
  |> should.equal(Some(WidgetsDashboard))
  shell_boot.page_from_url("/?view=apps")
  |> should.equal(Some(AppStore))
  shell_boot.page_from_url("http://host/?view=settings&tab=shells")
  |> should.equal(Some(Settings(tab: TabShells)))
  shell_boot.page_from_url("/?view=settings&tab=plugin:example.app.alpha")
  |> should.equal(Some(Settings(tab: TabPluginSettings("example.app.alpha"))))
  shell_boot.page_from_url("/?view=unknown") |> should.equal(None)
  shell_boot.page_from_url("/") |> should.equal(None)
}

pub fn page_url_round_trips_app_routes_test() {
  use db_res <- promise.await(idb.in_memory_simple())
  let assert Ok(db) = db_res

  let host =
    shell_boot.ShellBoot(
      boot.init(KernelPorts(
        storage: storage.in_memory(),
        idb: db,
        clock: clock.fixed(1_700_000_000_000),
        prompt_handler: None,
      )),
    )

  let #(routed, _effects) =
    boot.dispatch(
      host.booted,
      HistorySync(
        PrimaryApp("example.app.alpha", Some("/thread?id=1")),
        backward: True,
      ),
    )

  let url = shell_boot.page_url(shell_boot.ShellBoot(routed))
  shell_boot.page_from_url(url)
  |> should.equal(Some(PrimaryApp("example.app.alpha", Some("/thread?id=1"))))
  promise.resolve(Nil)
}
