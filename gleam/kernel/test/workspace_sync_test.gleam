import gleam/dict
import gleam/list
import gleam/option.{None, Some}
import omni/kernel/workspace/sync.{default_state, load, merge, save}
import omni/platform/storage
import omni/protocol/viewport
import omni/protocol/workspace.{
  type PluginConfig, type PluginPlacement, PluginConfig, PluginPlacement,
  WorkspaceState,
}

fn make_placement(id: String, vp: viewport.Viewport) -> PluginPlacement {
  PluginPlacement(
    id: id,
    viewport: vp,
    route: None,
    view_id: None,
    enabled: Some(True),
    pinned: Some(False),
    relays: None,
  )
}

fn make_plugin(
  id: String,
  enabled: Bool,
  placements: List(PluginPlacement),
) -> PluginConfig {
  PluginConfig(
    id: id,
    viewport: Some(viewport.Main),
    enabled: enabled,
    pinned: None,
    order: None,
    naddr: None,
    source_url: None,
    display_name: Some(id <> " Name"),
    name: None,
    description: None,
    icon: None,
    route: None,
    view_id: None,
    relays: None,
    placements: placements,
    handled_intents: [],
    disabled_intents: [],
  )
}

pub fn workspace_load_default_and_save_test() {
  let store = storage.in_memory()
  let loaded = load(store)
  assert loaded == default_state()
  assert loaded.version == 1
  assert loaded.updated_at == 0
  assert loaded.plugins == []

  let custom_state =
    WorkspaceState(
      ..loaded,
      updated_at: 1_700_000,
      active_page: Some("org.omni.plugin.feed"),
      shell_type: Some("panorama"),
      plugins: [
        make_plugin("org.omni.plugin.feed", True, [
          make_placement("dock-feed", viewport.Dock),
        ]),
      ],
    )

  save(store, custom_state)
  let reloaded = load(store)
  assert reloaded == custom_state
  assert reloaded.updated_at == 1_700_000
  assert reloaded.active_page == Some("org.omni.plugin.feed")
  assert list.length(reloaded.plugins) == 1
}

pub fn workspace_merge_favors_newer_timestamp_test() {
  let local =
    WorkspaceState(
      version: 1,
      updated_at: 100,
      active_page: Some("page_local"),
      auto_sync: Some(False),
      shell_type: Some("classic"),
      default_intents: dict.from_list([#("intentA", "pluginA")]),
      plugins: [],
    )

  let remote =
    WorkspaceState(
      version: 1,
      updated_at: 200,
      active_page: Some("page_remote"),
      auto_sync: Some(True),
      shell_type: Some("editorial"),
      default_intents: dict.from_list([
        #("intentA", "pluginA_newer"),
        #("intentB", "pluginB"),
      ]),
      plugins: [],
    )

  let merged = merge(local, remote)
  assert merged.updated_at == 200
  assert merged.active_page == Some("page_remote")
  assert merged.shell_type == Some("editorial")
  assert merged.auto_sync == Some(True)

  // Remote intentA overrides local intentA, intentB is preserved
  assert dict.get(merged.default_intents, "intentA") == Ok("pluginA_newer")
  assert dict.get(merged.default_intents, "intentB") == Ok("pluginB")
}

pub fn workspace_merge_merges_placements_and_plugins_test() {
  let pl_dock = make_placement("dock-feed", viewport.Dock)
  let pl_sidebar = make_placement("sidebar-feed", viewport.Sidebar)
  let pl_header = make_placement("header-timer", viewport.HeaderActions)

  // Local state (updated 100) has Feed with dock placement, and Notes app
  let p_feed_local = make_plugin("org.omni.plugin.feed", True, [pl_dock])
  let p_notes_local = make_plugin("org.omni.plugin.notes", True, [])

  let local =
    WorkspaceState(
      version: 1,
      updated_at: 100,
      active_page: Some("feed"),
      auto_sync: Some(True),
      shell_type: Some("classic"),
      default_intents: dict.new(),
      plugins: [p_feed_local, p_notes_local],
    )

  // Remote state (updated 200) has Feed with sidebar placement, and Timer
  let p_feed_remote = make_plugin("org.omni.plugin.feed", True, [pl_sidebar])
  let p_timer_remote = make_plugin("org.omni.plugin.timer", True, [pl_header])

  let remote =
    WorkspaceState(
      version: 1,
      updated_at: 200,
      active_page: Some("timer"),
      auto_sync: Some(True),
      shell_type: Some("panorama"),
      default_intents: dict.new(),
      plugins: [p_feed_remote, p_timer_remote],
    )

  let merged = merge(local, remote)
  assert merged.updated_at == 200
  assert merged.active_page == Some("timer")

  // All 3 plugins should be present: feed, timer (from remote), notes (from local)
  let plugin_ids = list.map(merged.plugins, fn(p) { p.id })
  assert list.contains(plugin_ids, "org.omni.plugin.feed")
  assert list.contains(plugin_ids, "org.omni.plugin.timer")
  assert list.contains(plugin_ids, "org.omni.plugin.notes")

  // Feed should have both placements preserved (dock and sidebar)
  let assert Ok(feed) =
    list.find(merged.plugins, fn(p) { p.id == "org.omni.plugin.feed" })
  let placement_ids = list.map(feed.placements, fn(pl) { pl.id })
  assert list.contains(placement_ids, "dock-feed")
  assert list.contains(placement_ids, "sidebar-feed")
}
