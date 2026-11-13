import gleam/list
import gleam/option.{None, Some}
import gleam/string
import gleeunit/should
import lustre/element
import omni/platform/storage
import omni/protocol/viewport.{Sidebar}
import omni/shell/accent
import omni/shell/app_store
import omni/shell/gestures/pull_to_refresh.{
  PullIdle, Pulling, ReadyToRefresh, Refreshing,
}
import omni/shell/model.{
  type InstalledApp, type PlacementConfig, type ViewOption, InstalledApp,
  IntentPromptState, Model, PlacementConfig, Settings, ShellInfo, SyncError,
  Synced, TabPluginSettings, TabPlugins, TabProfile, TabRelays, TabShells,
  TabWorkspace, UpdateModalState, UserProfileSummary, ViewOption,
}
import omni/shell/msg.{SetThemeMode, StartPullRefresh}
import omni/shell/registry
import omni/shell/settings/intents
import omni/shell/settings/permissions
import omni/shell/settings/placements
import omni/shell/settings/relay_scoping.{
  ScopeCustom, ScopeDefaultPool, ScopeLocalOnly,
}
import omni/shell/settings/shells
import omni/shell/shell
import omni/shell/theme
import omni/shell/update

import omni/shell/settings/tabs
import omni/shell/update_modal

fn make_app(
  id: String,
  name: String,
  enabled: Bool,
  pinned: Bool,
  views: List(ViewOption),
  placements_list: List(PlacementConfig),
  handled_intents: List(String),
  disabled_intents: List(String),
  relays: option.Option(List(String)),
) -> InstalledApp {
  InstalledApp(
    id: id,
    name: name,
    display_name: Some(name),
    description: "Description for " <> name,
    icon: "apps",
    enabled: enabled,
    pinned: pinned,
    views: views,
    placements: placements_list,
    handled_intents: handled_intents,
    disabled_intents: disabled_intents,
    relays: relays,
    source_url: "https://nsite.example/" <> id,
    version: Some("1.2.0"),
  )
}

// -----------------------------------------------------------------------------
// Phase 6.3: Placements Panel Tests
// -----------------------------------------------------------------------------

pub fn placements_panel_companion_viewports_exclude_main_fullpage_test() {
  let options = placements.companion_viewport_options()
  let ids = list.map(options, fn(o) { o.id })
  ids |> should.equal(["dock", "sidebar", "header-actions"])
  should.be_false(list.contains(ids, "main"))
}

pub fn placements_panel_renders_companion_controls_and_routes_test() {
  let views = [
    ViewOption(id: "default", title: "Stream", path: "/", format: "html"),
    ViewOption(
      id: "widget",
      title: "Compact Widget",
      path: "?view=widget",
      format: "html",
    ),
  ]
  let plc =
    PlacementConfig(
      viewport: Sidebar,
      view_id: "widget",
      route: Some("?view=widget"),
    )
  let app1 =
    make_app(
      "nsite.sample.alpha",
      "Alpha Reader",
      True,
      True,
      views,
      [plc],
      [],
      [],
      None,
    )
  let app2 =
    make_app(
      "nsite.sample.beta",
      "Beta Tool",
      True,
      False,
      [],
      [],
      [],
      [],
      None,
    )

  let m = model.init("editorial", [app1, app2])
  let html_str = placements.render_placements_panel(m) |> element.to_string

  should.be_true(string.contains(html_str, "id=\"settings-placements-panel\""))
  should.be_true(string.contains(html_str, "Alpha Reader"))
  should.be_true(string.contains(html_str, "Pinned to Dock"))
  should.be_true(string.contains(html_str, "Workspace Widget Active"))
  should.be_true(string.contains(html_str, "+ Add Header Action"))
  should.be_true(string.contains(html_str, "Compact Widget"))
  should.be_true(string.contains(html_str, "?view=widget"))
  should.be_true(string.contains(
    html_str,
    "id=\"btn-remove-placement-nsite.sample.alpha-sidebar\"",
  ))
  should.be_true(string.contains(
    html_str,
    "No companion surfaces assigned — available as a Full-Page App.",
  ))
}

// -----------------------------------------------------------------------------
// Phase 6.3: Permissions Panel Tests
// -----------------------------------------------------------------------------

pub fn permissions_panel_renders_acl_capabilities_and_installer_test() {
  let app1 =
    make_app(
      "nsite.sample.alpha",
      "Alpha App",
      True,
      False,
      [],
      [],
      [],
      [],
      None,
    )
  let app2 =
    make_app(
      "nsite.sample.beta",
      "Beta Disabled",
      False,
      False,
      [],
      [],
      [],
      [],
      None,
    )
  let m =
    Model(
      ..model.init("editorial", [app1, app2]),
      custom_install_url: "https://nsite.example/custom.html",
      capability_grants: [
        model.CapabilityGrant(
          "nsite.sample.alpha",
          "storage:kv",
          None,
          "always",
        ),
        model.CapabilityGrant(
          "nsite.sample.alpha",
          "nostr:write",
          Some("1"),
          "always",
        ),
      ],
    )

  let html_str = permissions.render_permissions_panel(m) |> element.to_string

  should.be_true(string.contains(html_str, "id=\"settings-permissions-panel\""))
  should.be_true(string.contains(html_str, "id=\"input-custom-plugin-url\""))
  should.be_true(string.contains(html_str, "https://nsite.example/custom.html"))
  should.be_true(string.contains(
    html_str,
    "id=\"btn-toggle-enabled-nsite.sample.alpha\"",
  ))
  should.be_true(string.contains(
    html_str,
    "id=\"btn-uninstall-nsite.sample.alpha\"",
  ))
  should.be_true(string.contains(html_str, "Scoped Storage (KV)"))
  should.be_true(string.contains(html_str, "Event Signing"))
  should.be_true(string.contains(html_str, "Kind 1 (Short Notes)"))
  should.be_true(string.contains(
    html_str,
    "id=\"btn-capability-nsite.sample.alpha-storage:kv\"",
  ))
  should.be_true(string.contains(html_str, "Revoke"))
  should.be_true(string.contains(html_str, "Grant"))
  should.be_true(string.contains(html_str, "Enabled"))
  should.be_true(string.contains(html_str, "Disabled"))
}

// -----------------------------------------------------------------------------
// Phase 6.3: Intents Panel & Chooser Modal Tests
// -----------------------------------------------------------------------------

pub fn intents_panel_and_chooser_modal_test() {
  let app1 =
    make_app(
      "nsite.sample.alpha",
      "Alpha Notes",
      True,
      False,
      [],
      [],
      ["view_note", "share"],
      ["share"],
      None,
    )
  let m0 = model.init("editorial", [app1])

  let panel_html = intents.render_intents_panel(m0) |> element.to_string
  should.be_true(string.contains(panel_html, "id=\"settings-intents-panel\""))
  should.be_true(string.contains(panel_html, "View Note"))
  should.be_true(string.contains(panel_html, "Web Share"))
  should.be_true(string.contains(
    panel_html,
    "id=\"btn-toggle-intent-nsite.sample.alpha-view_note\"",
  ))
  should.be_true(string.contains(
    panel_html,
    "id=\"btn-toggle-intent-nsite.sample.alpha-share\"",
  ))

  // When intent_prompt is None, modal renders empty
  let empty_modal = intents.render_intent_chooser_modal(m0) |> element.to_string
  empty_modal |> should.equal("")

  // When intent_prompt is Some, renders "Open With..." chooser modal
  let prompt =
    IntentPromptState(
      intent_name: "view_note",
      candidates: ["nsite.sample.alpha"],
      payload_json: "{\"id\":\"abc\"}",
    )
  let m_prompt = Model(..m0, intent_prompt: Some(prompt))
  let modal_html =
    intents.render_intent_chooser_modal(m_prompt) |> element.to_string

  should.be_true(string.contains(modal_html, "id=\"omni-intent-chooser-modal\""))
  should.be_true(string.contains(modal_html, "Open With..."))
  should.be_true(string.contains(modal_html, "Alpha Notes"))
  should.be_true(string.contains(
    modal_html,
    "id=\"btn-select-intent-handler-nsite.sample.alpha\"",
  ))
  should.be_true(string.contains(modal_html, "id=\"btn-dismiss-intent-modal\""))
}

// -----------------------------------------------------------------------------
// Phase 6.3: Relay Scoping Panel Tests
// -----------------------------------------------------------------------------

pub fn relay_scoping_panel_renders_default_local_and_custom_modes_test() {
  let app_default =
    make_app(
      "nsite.sample.default",
      "Default Relay App",
      True,
      False,
      [],
      [],
      [],
      [],
      None,
    )
  let app_local =
    make_app(
      "nsite.sample.local",
      "Offline App",
      True,
      False,
      [],
      [],
      [],
      [],
      Some([]),
    )
  let app_custom =
    make_app(
      "nsite.sample.custom",
      "Scoped App",
      True,
      False,
      [],
      [],
      [],
      [],
      Some(["wss://relay.damus.io"]),
    )

  relay_scoping.app_relay_scope(app_default)
  |> should.equal(ScopeDefaultPool)
  relay_scoping.app_relay_scope(app_local)
  |> should.equal(ScopeLocalOnly)
  relay_scoping.app_relay_scope(app_custom)
  |> should.equal(ScopeCustom(["wss://relay.damus.io"]))

  let m = model.init("editorial", [app_default, app_local, app_custom])
  let html_str =
    relay_scoping.render_relay_scoping_panel(m) |> element.to_string

  should.be_true(string.contains(
    html_str,
    "id=\"settings-relay-scoping-panel\"",
  ))
  should.be_true(string.contains(html_str, "All Relays (Default)"))
  should.be_true(string.contains(html_str, "Local Only (No Relays)"))
  should.be_true(string.contains(html_str, "Custom (1 relay)"))
  should.be_true(string.contains(html_str, "wss://relay.damus.io"))
}

// -----------------------------------------------------------------------------
// Phase 6.3: Shells Panel Tests
// -----------------------------------------------------------------------------

pub fn shells_panel_renders_builtin_shells_and_accent_picker_test() {
  let builtins = shells.builtin_shells()
  let ids = list.map(builtins, fn(s) { s.id })
  ids |> should.equal(["editorial", "panorama"])

  let custom_shell =
    ShellInfo(
      id: "minimalist",
      name: "Minimalist E-Ink",
      description: "High-contrast monochrome shell",
      icon: "layout",
      author: "Community",
      version: "0.9.0",
      is_builtin: False,
    )

  let m = model.init("panorama", [])
  let html_str =
    shells.render_shells_panel(m, list.append(builtins, [custom_shell]))
    |> element.to_string

  should.be_true(string.contains(html_str, "id=\"settings-shells-panel\""))
  should.be_true(string.contains(html_str, "3 installed"))
  should.be_true(string.contains(html_str, "Editorial Shell"))
  should.be_true(string.contains(html_str, "Panorama Hub"))
  should.be_true(string.contains(html_str, "Minimalist E-Ink"))
  should.be_true(string.contains(html_str, "id=\"input-custom-accent-color\""))
  should.be_true(string.contains(html_str, "#d4a373"))
}

// -----------------------------------------------------------------------------
// Phase 6.3: Settings Tabs & Dynamic Plugin Settings Tests
// -----------------------------------------------------------------------------

pub fn settings_tabs_renders_system_tabs_and_dynamic_plugin_settings_test() {
  let settings_views = [
    ViewOption(id: "default", title: "Main", path: "/", format: "html"),
    ViewOption(
      id: "settings",
      title: "Preferences",
      path: "?view=settings",
      format: "html",
    ),
  ]
  let app_with_settings =
    make_app(
      "nsite.sample.configurable",
      "Configurable Reader",
      True,
      True,
      settings_views,
      [],
      [],
      [],
      None,
    )
  let app_without_settings =
    make_app(
      "nsite.sample.simple",
      "Simple Utility",
      True,
      False,
      [],
      [],
      [],
      [],
      None,
    )
  let disabled_with_settings =
    make_app(
      "nsite.sample.disabled",
      "Disabled Configurable",
      False,
      False,
      settings_views,
      [],
      [],
      [],
      None,
    )

  let m0 =
    model.init("editorial", [
      app_with_settings,
      app_without_settings,
      disabled_with_settings,
    ])

  let dynamic_apps = tabs.apps_with_settings_view(m0)
  list.map(dynamic_apps, fn(a) { a.id })
  |> should.equal(["nsite.sample.configurable"])

  // 1. TabWorkspace renders NIP-78 sync controls and placements panel
  let m_ws =
    Model(
      ..m0,
      active_page: Settings(TabWorkspace),
      sync_status: Synced(1_700_000_000),
    )
  let ws_html = tabs.render_settings_view(m_ws) |> element.to_string
  // The primary settings bar is exactly three sections, matching the original
  // Editorial modal: Appearance & Shells, Plugins & Viewports, Workspace & Sync.
  should.be_true(string.contains(ws_html, "id=\"settings-tab-shells\""))
  should.be_true(string.contains(ws_html, "id=\"settings-tab-plugins\""))
  should.be_true(string.contains(ws_html, "id=\"settings-tab-workspace\""))
  should.be_false(string.contains(ws_html, "id=\"settings-tab-profile\""))
  should.be_false(string.contains(ws_html, "id=\"settings-tab-relays\""))
  should.be_false(string.contains(
    ws_html,
    "id=\"settings-tab-plugin-nsite.sample.configurable\"",
  ))
  should.be_true(string.contains(ws_html, "id=\"btn-toggle-auto-sync\""))
  should.be_true(string.contains(ws_html, "id=\"btn-trigger-workspace-sync\""))

  // Companion viewport assignment lives with the plugin list, as it did in the
  // original "Plugins & Viewports" section.
  let plugins_html =
    tabs.render_settings_view(Model(..m0, active_page: Settings(TabPlugins)))
    |> element.to_string
  should.be_true(string.contains(
    plugins_html,
    "id=\"settings-placements-panel\"",
  ))
  should.be_true(string.contains(
    plugins_html,
    "id=\"settings-permissions-panel\"",
  ))

  // 2. Dynamic TabPluginSettings mounts the ?view=settings slot anchor in Main
  let m_plug_settings =
    Model(
      ..m0,
      active_page: Settings(TabPluginSettings("nsite.sample.configurable")),
    )
  let plug_settings_html =
    tabs.render_settings_view(m_plug_settings) |> element.to_string
  should.be_true(string.contains(
    plug_settings_html,
    "id=\"slot-main-nsite.sample.configurable\"",
  ))
  should.be_true(string.contains(
    plug_settings_html,
    "data-route=\"?view=settings\"",
  ))

  // 3. TabProfile with UserProfileSummary and TabRelays / TabPlugins / TabShells
  let prof =
    UserProfileSummary(
      pubkey: "abcdef012345",
      npub: "npub1abcdef",
      display_name: "Hal Finney",
      picture: None,
      nip05: Some("hal@finney.org"),
    )
  let m_prof =
    Model(
      ..m0,
      active_page: Settings(TabProfile),
      user_profile: Some(prof),
      sync_status: SyncError("offline"),
    )
  let prof_html = tabs.render_settings_view(m_prof) |> element.to_string
  should.be_true(string.contains(prof_html, "Hal Finney"))
  should.be_true(string.contains(prof_html, "npub1abcdef"))
  should.be_true(string.contains(prof_html, "hal@finney.org"))

  let m_relays = Model(..m0, active_page: Settings(TabRelays))
  should.be_true(string.contains(
    tabs.render_settings_view(m_relays) |> element.to_string,
    "id=\"settings-relay-scoping-panel\"",
  ))

  let m_plugins = Model(..m0, active_page: Settings(TabPlugins))
  let plugins_html = tabs.render_settings_view(m_plugins) |> element.to_string
  should.be_true(string.contains(
    plugins_html,
    "id=\"settings-permissions-panel\"",
  ))
  should.be_true(string.contains(plugins_html, "id=\"settings-intents-panel\""))

  let m_shells = Model(..m0, active_page: Settings(TabShells))
  should.be_true(string.contains(
    tabs.render_settings_view(m_shells) |> element.to_string,
    "id=\"settings-shells-panel\"",
  ))
}

// -----------------------------------------------------------------------------
// Phase 6.4: App Store Tests
// -----------------------------------------------------------------------------

pub fn app_store_renders_search_custom_install_and_catalog_cards_test() {
  let catalog = app_store.curated_catalog()
  should.be_true(list.length(catalog) >= 5)

  // Install the first catalog entry so we can verify both "Installed" / "Open" and "Install" states
  let assert [first_entry, ..] = catalog
  let installed_first = app_store.catalog_entry_to_installed_app(first_entry)
  let m0 = model.init("editorial", [installed_first])

  let store_html = app_store.render_app_store(m0, catalog) |> element.to_string

  should.be_true(string.contains(store_html, "id=\"omni-app-store\""))
  should.be_true(string.contains(store_html, "id=\"input-app-store-search\""))
  should.be_true(string.contains(
    store_html,
    "id=\"input-app-store-custom-url\"",
  ))
  should.be_true(string.contains(
    store_html,
    "id=\"btn-open-catalog-" <> first_entry.id <> "\"",
  ))
  should.be_true(string.contains(store_html, "Installed"))
  should.be_true(string.contains(
    store_html,
    "id=\"btn-install-catalog-nsite.catalog.tasks\"",
  ))

  // Search filtering narrows results
  let m_search = Model(..m0, search_query: "timer")
  let filtered_html =
    app_store.render_app_store(m_search, catalog) |> element.to_string
  should.be_true(string.contains(filtered_html, "Focus Countdown Timer"))
  should.be_false(string.contains(filtered_html, "Relay Pool Inspector"))

  // Search with no matches renders empty state
  let m_no_match = Model(..m0, search_query: "nonexistent_xyz_999")
  let empty_html =
    app_store.render_app_store(m_no_match, catalog) |> element.to_string
  should.be_true(string.contains(empty_html, "No Matching Applications"))
}

// -----------------------------------------------------------------------------
// Phase 6.4: Update Modal Tests
// -----------------------------------------------------------------------------

pub fn update_modal_renders_version_diff_changelog_and_actions_test() {
  let m0 = model.init("editorial", [])
  let none_html = update_modal.render_update_modal(m0) |> element.to_string
  none_html |> should.equal("")

  let modal_state =
    UpdateModalState(
      plugin_id: "nsite.catalog.reader",
      plugin_name: "Social Stream & Reader",
      current_version: "1.0.0",
      latest_version: "1.3.0",
      changelog: Some("Added offline thread caching and faster NIP-44 decrypt."),
    )
  let m1 = Model(..m0, update_modal: Some(modal_state))
  let modal_html = update_modal.render_update_modal(m1) |> element.to_string

  should.be_true(string.contains(modal_html, "id=\"update-app-modal\""))
  should.be_true(string.contains(
    modal_html,
    "Update Social Stream &amp; Reader",
  ))
  should.be_true(string.contains(modal_html, "v1.0.0 -&gt; v1.3.0"))
  should.be_true(string.contains(
    modal_html,
    "Added offline thread caching and faster NIP-44 decrypt.",
  ))
  should.be_true(string.contains(modal_html, "id=\"btn-confirm-plugin-update\""))
  should.be_true(string.contains(modal_html, "Update Now"))
  should.be_true(string.contains(modal_html, "id=\"btn-update-later\""))
  should.be_true(string.contains(modal_html, "Later"))
}

// -----------------------------------------------------------------------------
// Phase 6.4: Pull-to-Refresh Gesture & Indicator Tests
// -----------------------------------------------------------------------------

pub fn pull_to_refresh_state_machine_and_indicator_test() {
  // 1. Touch start when scrolled down (> 1.0) remains PullIdle
  let s_scrolled = pull_to_refresh.on_touch_start(PullIdle, 25.0, 100.0)
  s_scrolled |> should.equal(PullIdle)

  // 2. Touch start at scroll top (0.0) enters Pulling
  let s0 = pull_to_refresh.on_touch_start(PullIdle, 0.0, 100.0)
  s0 |> should.equal(Pulling(start_y: 100.0, current_y: 100.0, distance: 0.0))

  // 3. Touch move below threshold stays Pulling
  let s1 = pull_to_refresh.on_touch_move(s0, 145.0)
  s1 |> should.equal(Pulling(start_y: 100.0, current_y: 145.0, distance: 45.0))

  // Releasing before threshold resets to PullIdle with None msg
  let #(s_cancel, msg_cancel) = pull_to_refresh.on_touch_end(s1)
  s_cancel |> should.equal(PullIdle)
  msg_cancel |> should.equal(None)

  // 4. Touch move past threshold_px (72.0) transitions to ReadyToRefresh
  let s2 = pull_to_refresh.on_touch_move(s0, 180.0)
  s2 |> should.equal(ReadyToRefresh(distance: 80.0))

  // 5. Touch end from ReadyToRefresh transitions to Refreshing and emits Some(StartPullRefresh)
  let #(s3, msg_refresh) = pull_to_refresh.on_touch_end(s2)
  s3 |> should.equal(Refreshing)
  msg_refresh |> should.equal(Some(StartPullRefresh))

  // 6. Indicator rendering for each state
  let m0 = model.init("editorial", [])

  let idle_html =
    pull_to_refresh.render_indicator(m0, PullIdle) |> element.to_string
  should.be_true(string.contains(idle_html, "pull down to refresh"))

  let ready_html =
    pull_to_refresh.render_indicator(m0, ReadyToRefresh(80.0))
    |> element.to_string
  should.be_true(string.contains(
    ready_html,
    "class=\"omni-pull-to-refresh ready\"",
  ))
  should.be_true(string.contains(ready_html, "release to refresh"))

  let m_refreshing = Model(..m0, pull_refreshing: True)
  let refreshing_html =
    pull_to_refresh.render_indicator(m_refreshing, PullIdle)
    |> element.to_string
  should.be_true(string.contains(
    refreshing_html,
    "class=\"omni-pull-to-refresh is-refreshing\"",
  ))
  should.be_true(string.contains(refreshing_html, "refreshing..."))
}

pub fn shell_registry_install_uninstall_persists_test() {
  let store = storage.in_memory()
  let reg = registry.with_builtin_themes()
  let assert Ok(desc) = list.first(registry.curated_descriptors())

  let installed = registry.install_descriptor(reg, desc)
  registry.save_installed_shells(installed, store)

  let reloaded =
    registry.with_builtin_themes()
    |> registry.load_installed_shells(store)
  list.any(registry.list_shells(reloaded), fn(theme) { theme.id == desc.id })
  |> should.be_true()

  let removed = registry.uninstall_shell(installed, desc.id)
  list.any(registry.list_shells(removed), fn(theme) { theme.id == desc.id })
  |> should.be_false()

  // Built-in shells cannot be uninstalled.
  let still_there = registry.uninstall_shell(removed, "editorial")
  list.any(registry.list_shells(still_there), fn(theme: theme.Theme) {
    theme.id == "editorial"
  })
  |> should.be_true()
}

pub fn shells_panel_renders_curated_catalog_and_install_test() {
  let m =
    Model(
      ..model.init("editorial", []),
      installed_shells: shells.builtin_shells(),
      curated_shells: [
        ShellInfo(
          id: "mantra",
          name: "Mantra Shell",
          description: "Curated shell",
          icon: "layout",
          author: "Omni Core Team",
          version: "1.0.0",
          is_builtin: False,
        ),
      ],
      custom_shell_url: "https://example.com/shell.html",
    )

  let html_str =
    shells.render_shells_panel(m, shells.builtin_shells())
    |> element.to_string

  should.be_true(string.contains(html_str, "id=\"curated-shells-list\""))
  should.be_true(string.contains(html_str, "id=\"btn-install-shell-mantra\""))
  should.be_true(string.contains(html_str, "id=\"input-custom-shell-url\""))
  should.be_true(string.contains(html_str, "id=\"btn-install-shell-panorama\""))
}

pub fn accent_derivation_bundle_test() {
  let tokens = accent.tokens("#d4a373")
  let lookup = fn(name: String) {
    list.find_map(tokens, fn(pair) {
      case pair.0 == name {
        True -> Ok(pair.1)
        False -> Error(Nil)
      }
    })
  }
  lookup("--omni-accent-primary") |> should.equal(Ok("#d4a373"))
  lookup("--omni-accent-hover") |> should.equal(Ok("#ae865e"))
  lookup("--omni-accent-contrast") |> should.equal(Ok("#141312"))
  accent.normalize("not-a-color") |> should.equal("#d4a373")
  accent.normalize("#A9743F") |> should.equal("#a9743f")
}

pub fn theme_mode_accepts_system_test() {
  let m0 = model.init("editorial", [])
  let #(m1, effects) = shell.update(m0, SetThemeMode("system"))
  m1.theme_mode |> should.equal("system")
  list.any(effects, fn(effect) { effect == update.PersistThemeMode("system") })
  |> should.be_true()
}
