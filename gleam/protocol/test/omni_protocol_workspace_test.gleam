//// Unit tests for NIP-78 Workspace State codecs and migration helpers.

import gleam/dict
import gleam/list
import gleam/option.{None, Some}
import gleeunit/should
import omni/protocol/viewport.{Dock, Main, Sidebar}
import omni/protocol/workspace.{
  PluginConfig, PluginPlacement, WorkspaceState, current_version, d_tag,
}

pub fn workspace_nip78_json_roundtrip_test() {
  d_tag |> should.equal("omni/workspace/v1")

  let placement1 =
    PluginPlacement(
      id: "dock",
      viewport: Dock,
      route: Some("?view=widget"),
      view_id: Some("widget"),
      enabled: Some(True),
      pinned: Some(True),
      relays: Some(["wss://relay.damus.io"]),
    )

  let plugin1 =
    PluginConfig(
      id: "org.omni.plugin.feed",
      viewport: Some(Dock),
      enabled: True,
      pinned: Some(True),
      order: Some(1),
      naddr: Some("naddr1feed"),
      source_url: Some("https://example.com/feed.js"),
      display_name: Some("Feed"),
      name: Some("Feed App"),
      description: Some("Timeline feed & composer"),
      icon: Some("rss"),
      route: Some(""),
      view_id: Some("main"),
      relays: None,
      placements: [placement1],
      handled_intents: ["create_note", "view_note"],
      disabled_intents: [],
    )

  let plugin2 =
    PluginConfig(
      id: "org.omni.plugin.timer",
      viewport: Some(Main),
      enabled: True,
      pinned: None,
      order: Some(2),
      naddr: None,
      source_url: None,
      display_name: Some("Focus Timer"),
      name: Some("Timer"),
      description: Some("Pomodoro countdown"),
      icon: Some("clock"),
      route: None,
      view_id: None,
      relays: None,
      placements: [],
      handled_intents: [],
      disabled_intents: [],
    )

  let default_intents =
    dict.from_list([
      #("create_note", "org.omni.plugin.feed"),
      #("view_note", "org.omni.plugin.feed"),
    ])

  let state =
    WorkspaceState(
      version: current_version,
      updated_at: 1_700_000_000_000,
      active_page: Some("org.omni.plugin.timer"),
      auto_sync: Some(True),
      shell_type: Some("panorama"),
      default_intents: default_intents,
      plugins: [plugin1, plugin2],
    )

  let encoded = workspace.encode(state)
  let assert Ok(decoded) = workspace.decode_json(encoded)

  decoded.version |> should.equal(1)
  decoded.updated_at |> should.equal(1_700_000_000_000)
  decoded.active_page |> should.equal(Some("org.omni.plugin.timer"))
  decoded.auto_sync |> should.equal(Some(True))
  decoded.shell_type |> should.equal(Some("panorama"))
  dict.get(decoded.default_intents, "create_note")
  |> should.equal(Ok("org.omni.plugin.feed"))

  list.length(decoded.plugins) |> should.equal(2)
  let assert [p1, p2] = decoded.plugins
  p1.id |> should.equal("org.omni.plugin.feed")
  p1.viewport |> should.equal(Some(Dock))
  p1.display_name |> should.equal(Some("Feed"))
  list.length(p1.placements) |> should.equal(1)

  p2.id |> should.equal("org.omni.plugin.timer")
  p2.viewport |> should.equal(Some(Main))
}

pub fn workspace_migration_helper_test() {
  // Legacy unversioned payload without version or timestamps
  let legacy_json =
    "{\"plugins\": [{\"id\": \"org.omni.plugin.checklist\", \"viewport\": \"sidebar\", \"enabled\": true}]}"

  let assert Ok(migrated) = workspace.migrate_json(legacy_json, 1_720_000_000)

  migrated.version |> should.equal(current_version)
  migrated.updated_at |> should.equal(1_720_000_000)
  list.length(migrated.plugins) |> should.equal(1)

  let assert [cfg] = migrated.plugins
  cfg.id |> should.equal("org.omni.plugin.checklist")
  cfg.viewport |> should.equal(Some(Sidebar))
  cfg.enabled |> should.be_true
}
