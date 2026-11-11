//// Tests for the JS-facing shell boot facade.

import gleam/javascript/promise
import gleam/option.{None}
import gleam/string
import gleeunit/should
import omni/interop/shell_boot
import omni/kernel/kernel.{KernelPorts}
import omni/platform/clock
import omni/platform/idb
import omni/platform/storage
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
