import gleam/list
import gleam/option.{None, Some}
import gleam/order.{Eq, Gt, Lt}
import gleeunit/should
import omni/kernel/plugins/registry.{type PluginEntry, PluginEntry}
import omni/kernel/plugins/updates
import omni/protocol/viewport.{Main}

fn make_entry(id: String, enabled: Bool, pinned: Bool) -> PluginEntry {
  PluginEntry(
    id: id,
    name: id <> " App",
    display_name: Some(id <> " App"),
    version: "1.0.0",
    description: "Test description",
    icon: Some("icon-star"),
    viewport: Some(Main),
    route: None,
    view_id: None,
    enabled: enabled,
    pinned: pinned,
    order: 0,
    entry: "index.html",
    content: "<html></html>",
    source_url: None,
    naddr: None,
    relays: [],
    views: [],
    placements: [],
    handled_intents: ["view_note"],
    disabled_intents: [],
  )
}

pub fn registry_install_and_get_test() {
  let reg =
    registry.new()
    |> registry.install(make_entry("p1", True, False))
    |> registry.install(make_entry("p2", False, True))

  registry.count(reg) |> should.equal(2)
  registry.is_installed(reg, "p1") |> should.be_true
  registry.is_installed(reg, "p2") |> should.be_true
  registry.is_installed(reg, "p3") |> should.be_false

  let assert Ok(p1) = registry.get(reg, "p1")
  p1.name |> should.equal("p1 App")
}

pub fn registry_enable_disable_test() {
  let reg =
    registry.new()
    |> registry.install(make_entry("p1", True, False))

  registry.is_enabled(reg, "p1") |> should.be_true

  let disabled = registry.disable(reg, "p1")
  registry.is_enabled(disabled, "p1") |> should.be_false
  list.length(registry.list_disabled(disabled)) |> should.equal(1)
  list.length(registry.list_enabled(disabled)) |> should.equal(0)

  let re_enabled = registry.enable(disabled, "p1")
  registry.is_enabled(re_enabled, "p1") |> should.be_true
  list.length(registry.list_enabled(re_enabled)) |> should.equal(1)
}

pub fn registry_pin_unpin_test() {
  let reg =
    registry.new()
    |> registry.install(make_entry("p1", True, False))

  registry.is_pinned(reg, "p1") |> should.be_false

  let pinned = registry.pin(reg, "p1")
  registry.is_pinned(pinned, "p1") |> should.be_true
  list.length(registry.list_pinned(pinned)) |> should.equal(1)

  let unpinned = registry.unpin(pinned, "p1")
  registry.is_pinned(unpinned, "p1") |> should.be_false
  list.length(registry.list_pinned(unpinned)) |> should.equal(0)
}

pub fn registry_ordering_and_uninstall_test() {
  let reg =
    registry.new()
    |> registry.install(make_entry("p1", True, False))
    |> registry.install(make_entry("p2", True, False))
    |> registry.install(make_entry("p3", True, False))

  let all = registry.list_all(reg)
  let assert [first, second, third] = all
  first.id |> should.equal("p1")
  second.id |> should.equal("p2")
  third.id |> should.equal("p3")

  // Custom ordering
  let reordered = registry.set_order(reg, ["p3", "p1", "p2"])
  let all_reordered = registry.list_all(reordered)
  let assert [r1, r2, r3] = all_reordered
  r1.id |> should.equal("p3")
  r2.id |> should.equal("p1")
  r3.id |> should.equal("p2")

  // Uninstall p1
  let uninstalled = registry.uninstall(reordered, "p1")
  registry.count(uninstalled) |> should.equal(2)
  registry.is_installed(uninstalled, "p1") |> should.be_false
}

pub fn registry_workspace_configs_roundtrip_test() {
  let reg =
    registry.new()
    |> registry.install(make_entry("p1", True, True))
    |> registry.install(make_entry("p2", False, False))

  let configs = registry.to_plugin_configs(reg)
  list.length(configs) |> should.equal(2)

  let restored = registry.from_plugin_configs(configs)
  registry.count(restored) |> should.equal(2)
  registry.is_enabled(restored, "p1") |> should.be_true
  registry.is_pinned(restored, "p1") |> should.be_true
  registry.is_enabled(restored, "p2") |> should.be_false
  registry.is_pinned(restored, "p2") |> should.be_false
}

pub fn updates_version_compare_test() {
  updates.compare_strings("1.1.0", "1.0.0") |> should.equal(Gt)
  updates.compare_strings("2.0.0", "1.9.9") |> should.equal(Gt)
  updates.compare_strings("1.0.1", "1.0.0") |> should.equal(Gt)
  updates.compare_strings("1.0.0", "v1.0.0") |> should.equal(Eq)
  updates.compare_strings("1.0.0", "1.0.1") |> should.equal(Lt)

  // Pre-release precedence
  updates.compare_strings("1.0.0", "1.0.0-rc.1") |> should.equal(Gt)

  updates.is_newer("2.0.0", "1.0.0") |> should.be_true
  updates.is_newer("1.0.0", "1.0.0") |> should.be_false
  updates.is_newer("0.9.0", "1.0.0") |> should.be_false

  // detect_update
  let assert Some(up) =
    updates.detect_update(
      "plugin.feed",
      "1.0.0",
      "1.1.0",
      Some("https://..."),
      None,
    )
  up.latest_version |> should.equal("1.1.0")
  updates.detect_update("plugin.feed", "1.1.0", "1.0.0", None, None)
  |> should.equal(None)
}
