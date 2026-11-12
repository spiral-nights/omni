//// Unit tests for the shell theme registry.

import gleam/list
import gleam/option.{None, Some}
import gleam/string
import gleeunit/should
import omni/platform/storage
import omni/shell/registry
import omni/shell/settings/shells
import omni/shell/themes/panorama

pub fn registry_registers_and_resolves_themes_test() {
  let reg =
    registry.new()
    |> registry.register(panorama.theme())

  case registry.resolve(reg, "panorama") {
    Some(theme) -> theme.id |> should.equal("panorama")
    None -> should.fail()
  }

  registry.resolve(reg, "missing") |> should.equal(None)
}

pub fn registry_builtin_themes_cover_shell_registry_test() {
  let reg = registry.with_builtin_themes()

  let builtin_ids =
    shells.builtin_shells()
    |> list.map(fn(info) { info.id })
    |> list.sort(string.compare)

  let registered_ids =
    registry.list_shells(reg)
    |> list.map(fn(theme) { theme.id })

  registered_ids |> should.equal(builtin_ids)
}

pub fn registry_default_active_theme_is_editorial_test() {
  let reg = registry.with_builtin_themes()
  reg.active_id |> should.equal("editorial")
  registry.active_theme(reg).id |> should.equal("editorial")
}

pub fn registry_active_theme_falls_back_when_missing_test() {
  let reg =
    registry.new()
    |> registry.register(panorama.theme())
    |> registry.set_active("does-not-exist")

  // The default shell ID is not registered, so fall back to the first theme.
  registry.active_theme(reg).id |> should.equal("panorama")
}

pub fn registry_unregister_falls_back_test() {
  let reg =
    registry.with_builtin_themes()
    |> registry.set_active("panorama")
    |> registry.unregister("panorama")

  reg.active_id |> should.equal("editorial")
  registry.resolve(reg, "panorama") |> should.equal(None)
}

pub fn registry_saves_and_loads_active_id_test() {
  let store = storage.in_memory()
  let reg =
    registry.with_builtin_themes()
    |> registry.set_active("panorama")

  let assert Ok(Nil) = registry.save_active_id(reg, store)

  let reloaded =
    registry.with_builtin_themes()
    |> registry.load_active_id(store)

  reloaded.active_id |> should.equal("panorama")
}

pub fn registry_ignores_unknown_stored_shell_id_test() {
  let store =
    storage.in_memory_from([#(registry.active_shell_storage_key, "bogus")])

  let reg =
    registry.with_builtin_themes()
    |> registry.load_active_id(store)

  reg.active_id |> should.equal("editorial")
}

pub fn registry_self_heals_stored_value_test() {
  let store =
    storage.in_memory_from([#(registry.active_shell_storage_key, "bogus")])

  let reg =
    registry.with_builtin_themes()
    |> registry.load_and_persist_active_id(store)

  reg.active_id |> should.equal("editorial")
  storage.get(store, registry.active_shell_storage_key)
  |> should.equal(Some("editorial"))
}
