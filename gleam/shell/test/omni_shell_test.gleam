import gleam/list
import gleam/option.{None, Some}
import gleam/string
import gleeunit
import gleeunit/should
import lustre/attribute
import lustre/element
import lustre/element/html
import omni/protocol/viewport.{Dock, HeaderActions, Main, Sidebar}
import omni/protocol/workspace
import omni/shell/layout/dock
import omni/shell/layout/header_actions
import omni/shell/layout/main_view
import omni/shell/layout/viewport_host
import omni/shell/layout/widgets_grid
import omni/shell/model.{
  type InstalledApp, AppStore, InstalledApp, IntentPromptState, Model,
  PlacementConfig, PrimaryApp, Settings, SyncError, Synced, Syncing, TabPlugins,
  TabRelays, UpdateModalState, UserProfileSummary, ViewOption, WidgetsDashboard,
}
import omni/shell/msg.{
  AccountSwitchResult, AddAppPlacement, ApplyRemoteWorkspace,
  ConfirmPluginUpdate, DisablePassphrase, DismissIntentPrompt, DismissToast,
  DismissUpdateModal, EnablePassphrase, EscapePressed, ExportKey,
  FinishPullRefresh, ImportKey, InstallApp, KeySecurityStatus, NavigateBack,
  NavigateTo, OpenApp, OpenIntentApp, OpenSettings, RemoveAppPlacement,
  SelectIntentHandler, SelectShell, SetAccentColor, SetAppPlacements,
  SetAppRelays, SetCustomInstallUrl, SetExportedNsec, SetKeyInput, SetPassphrase,
  SetSearchQuery, SetSyncStatus, SetThemeMode, SetUserProfile, ShellScrolled,
  ShowIntentPrompt, ShowToast, ShowToastTone, ShowUpdateModal, StartPullRefresh,
  SwitchAccount, ToggleAppEnabled, ToggleAppIntent, ToggleAppPinned,
  ToggleAutoSync, ToggleFullscreen, TriggerWorkspaceSync, UninstallApp,
  UnlockKey,
}
import omni/shell/shell
import omni/shell/themes/editorial as editorial_theme
import omni/shell/update.{
  DispatchIntentToPlugin, MountPluginInSlot, PersistAccentColor,
  PersistWorkspaceLocal, RefreshActiveView, SwitchActiveShell,
  UnmountPluginFromSlot, UpgradePlugin,
}

pub fn main() {
  gleeunit.main()
}

fn sample_app(
  id: String,
  name: String,
  enabled: Bool,
  pinned: Bool,
  placements: List(model.PlacementConfig),
) -> InstalledApp {
  InstalledApp(
    id: id,
    name: name,
    display_name: Some(name),
    description: "Description for " <> name,
    icon: "apps",
    enabled: enabled,
    pinned: pinned,
    views: [
      ViewOption(id: "default", title: "Default", path: "/", format: "html"),
    ],
    placements: placements,
    handled_intents: ["view-note"],
    disabled_intents: [],
    relays: None,
    source_url: "https://example.com/" <> id,
    version: Some("1.0.0"),
  )
}

// -----------------------------------------------------------------------------
// Model Tests
// -----------------------------------------------------------------------------

pub fn model_init_chooses_first_enabled_app_without_hardcoded_ids_test() {
  let app1 = sample_app("example.app.alpha", "Alpha", False, True, [])
  let app2 = sample_app("example.app.beta", "Beta", True, True, [])
  let m = model.init("editorial", [app1, app2])

  m.active_page
  |> should.equal(PrimaryApp(plugin_id: "example.app.beta", route: None))
  m.active_shell_id
  |> should.equal("editorial")
  m.accent_color
  |> should.equal("#d4a373")
}

pub fn model_init_falls_back_to_widgets_dashboard_when_no_enabled_apps_test() {
  let app1 = sample_app("example.app.alpha", "Alpha", False, False, [])
  let m = model.init("editorial", [app1])

  m.active_page
  |> should.equal(WidgetsDashboard)
}

pub fn model_helpers_filter_dock_sidebar_and_header_actions_test() {
  let p_dock = PlacementConfig(viewport: Dock, view_id: "dock", route: None)
  let p_side =
    PlacementConfig(
      viewport: Sidebar,
      view_id: "widget",
      route: Some("?view=widget"),
    )
  let p_hdr =
    PlacementConfig(
      viewport: HeaderActions,
      view_id: "status",
      route: Some("?view=status"),
    )

  let app_pinned = sample_app("example.app.alpha", "Alpha", True, True, [])
  let app_dock_placed =
    sample_app("example.app.beta", "Beta", True, False, [p_dock, p_side])
  let app_header =
    sample_app("example.app.gamma", "Gamma", True, False, [p_hdr])
  let app_disabled =
    sample_app("example.app.delta", "Delta", False, True, [p_side, p_hdr])

  let m =
    model.init("panorama", [
      app_pinned,
      app_dock_placed,
      app_header,
      app_disabled,
    ])

  let dock_ids = list.map(model.dock_apps(m), fn(a) { a.id })
  dock_ids
  |> should.equal(["example.app.alpha", "example.app.beta"])

  let sidebar_pairs = model.sidebar_widgets(m)
  list.length(sidebar_pairs)
  |> should.equal(1)
  case sidebar_pairs {
    [#(a, plc)] -> {
      a.id |> should.equal("example.app.beta")
      plc.route |> should.equal(Some("?view=widget"))
    }
    _ -> should.fail()
  }

  let header_pairs = model.header_action_apps(m)
  list.length(header_pairs)
  |> should.equal(1)
  case header_pairs {
    [#(a, plc)] -> {
      a.id |> should.equal("example.app.gamma")
      plc.route |> should.equal(Some("?view=status"))
    }
    _ -> should.fail()
  }

  model.find_app(m, "example.app.gamma")
  |> should.equal(Some(app_header))
  model.find_app(m, "example.app.nonexistent")
  |> should.equal(None)
}

pub fn model_workspace_state_roundtrip_test() {
  let p_side =
    PlacementConfig(
      viewport: Sidebar,
      view_id: "widget",
      route: Some("?view=widget"),
    )
  let app1 = sample_app("example.app.alpha", "Alpha", True, True, [p_side])
  let app2 = sample_app("example.app.beta", "Beta", True, False, [])
  let m0 = model.init("editorial", [app1, app2])

  let ws = model.to_workspace_state(m0, 1_700_000_000)
  ws.version |> should.equal(workspace.current_version)
  ws.updated_at |> should.equal(1_700_000_000)
  ws.active_page |> should.equal(Some("example.app.alpha"))
  ws.shell_type |> should.equal(Some("editorial"))

  // Modify workspace state as if synced from remote device
  let remote_ws =
    workspace.WorkspaceState(
      ..ws,
      active_page: Some("example.app.beta"),
      shell_type: Some("panorama"),
      auto_sync: Some(False),
    )

  let m1 = model.apply_workspace_state(m0, remote_ws)
  m1.active_page
  |> should.equal(PrimaryApp(plugin_id: "example.app.beta", route: None))
  m1.active_shell_id
  |> should.equal("panorama")
  m1.auto_sync_nip78
  |> should.equal(False)
}

// -----------------------------------------------------------------------------
// Update Tests
// -----------------------------------------------------------------------------

pub fn update_navigation_and_open_app_test() {
  let app1 = sample_app("example.app.alpha", "Alpha", True, True, [])
  let app2 = sample_app("example.app.beta", "Beta", True, False, [])
  let m0 = model.init("editorial", [app1, app2])

  let #(m1, eff1) =
    update.update(m0, OpenApp("example.app.beta", Some("?view=compact")))
  m1.active_page
  |> should.equal(PrimaryApp(
    plugin_id: "example.app.beta",
    route: Some("?view=compact"),
  ))
  should.be_true(list.contains(
    eff1,
    MountPluginInSlot("example.app.beta", Main, Some("?view=compact")),
  ))

  let #(m2, _eff2) = update.update(m1, OpenSettings(TabRelays))
  m2.active_page |> should.equal(Settings(TabRelays))

  let #(m3, _eff3) = update.update(m2, NavigateTo(AppStore))
  m3.active_page |> should.equal(AppStore)

  let #(m4, eff4) = update.update(m3, ToggleFullscreen)
  m4.fullscreen |> should.be_true()
  eff4 |> should.equal([])
}

pub fn update_toggle_app_enabled_and_placements_test() {
  let p_side =
    PlacementConfig(viewport: Sidebar, view_id: "widget", route: None)
  let app1 = sample_app("example.app.alpha", "Alpha", True, True, [p_side])
  let app2 = sample_app("example.app.beta", "Beta", True, False, [])
  let m0 = model.init("editorial", [app1, app2])

  // Disabling currently active app falls back to next enabled app and unmounts slots
  let #(m1, eff1) = update.update(m0, ToggleAppEnabled("example.app.alpha"))
  m1.active_page
  |> should.equal(PrimaryApp(plugin_id: "example.app.beta", route: None))
  should.be_true(list.contains(
    eff1,
    UnmountPluginFromSlot("example.app.alpha", Main),
  ))
  should.be_true(list.contains(
    eff1,
    UnmountPluginFromSlot("example.app.alpha", Sidebar),
  ))

  // Re-enabling mounts its configured placements
  let #(m2, eff2) = update.update(m1, ToggleAppEnabled("example.app.alpha"))
  case model.find_app(m2, "example.app.alpha") {
    Some(a) -> a.enabled |> should.be_true()
    None -> should.fail()
  }
  should.be_true(list.contains(
    eff2,
    MountPluginInSlot("example.app.alpha", Sidebar, None),
  ))

  // Pinning toggle
  let #(m3, _eff3) = update.update(m2, ToggleAppPinned("example.app.beta"))
  case model.find_app(m3, "example.app.beta") {
    Some(a) -> a.pinned |> should.be_true()
    None -> should.fail()
  }

  // Add placement
  let new_plc =
    PlacementConfig(
      viewport: HeaderActions,
      view_id: "quick",
      route: Some("?view=quick"),
    )
  let #(m4, eff4) =
    update.update(m3, AddAppPlacement("example.app.beta", new_plc))
  should.be_true(list.contains(
    eff4,
    MountPluginInSlot("example.app.beta", HeaderActions, Some("?view=quick")),
  ))
  list.length(model.header_action_apps(m4)) |> should.equal(1)

  // Remove placement
  let #(m5, eff5) =
    update.update(m4, RemoveAppPlacement("example.app.beta", HeaderActions))
  should.be_true(list.contains(
    eff5,
    UnmountPluginFromSlot("example.app.beta", HeaderActions),
  ))
  list.length(model.header_action_apps(m5)) |> should.equal(0)

  // SetAppPlacements replaces placements and unmounts removed ones
  let #(m6, eff6) =
    update.update(m5, SetAppPlacements("example.app.alpha", [new_plc]))
  should.be_true(list.contains(
    eff6,
    UnmountPluginFromSlot("example.app.alpha", Sidebar),
  ))
  should.be_true(list.contains(
    eff6,
    MountPluginInSlot("example.app.alpha", HeaderActions, Some("?view=quick")),
  ))
  list.length(model.sidebar_widgets(m6)) |> should.equal(0)
}

pub fn update_install_and_uninstall_app_test() {
  let app1 = sample_app("example.app.alpha", "Alpha", True, True, [])
  let m0 =
    Model(
      ..model.init("editorial", [app1]),
      custom_install_url: "https://example.com/gamma",
    )

  let app_gamma = sample_app("example.app.gamma", "Gamma", True, False, [])
  let #(m1, _eff1) = update.update(m0, InstallApp(app_gamma))
  m1.custom_install_url |> should.equal("")
  list.length(m1.installed_apps) |> should.equal(2)

  // Uninstalling active app falls back to remaining enabled app
  let #(m2, eff2) = update.update(m1, UninstallApp("example.app.alpha"))
  list.length(m2.installed_apps) |> should.equal(1)
  m2.active_page
  |> should.equal(PrimaryApp(plugin_id: "example.app.gamma", route: None))
  should.be_true(list.contains(
    eff2,
    UnmountPluginFromSlot("example.app.alpha", Main),
  ))
}

pub fn update_intents_relays_theme_sync_and_modals_test() {
  let app1 = sample_app("example.app.alpha", "Alpha", True, True, [])
  let m0 = model.init("editorial", [app1])

  // Toggle intent disabled
  let #(m1, _) =
    update.update(m0, ToggleAppIntent("example.app.alpha", "view-note"))
  case model.find_app(m1, "example.app.alpha") {
    Some(a) -> a.disabled_intents |> should.equal(["view-note"])
    None -> should.fail()
  }

  // Intent prompt & selection
  let prompt =
    IntentPromptState(
      intent_name: "view-note",
      candidates: ["example.app.alpha"],
      payload_json: "{\"id\":\"123\"}",
    )
  let #(m2, _) = update.update(m1, ShowIntentPrompt(prompt))
  m2.intent_prompt |> should.equal(Some(prompt))

  let #(m3, eff3) = update.update(m2, SelectIntentHandler("example.app.alpha"))
  m3.intent_prompt |> should.equal(None)
  should.be_true(list.contains(
    eff3,
    DispatchIntentToPlugin("example.app.alpha", "view-note", "{\"id\":\"123\"}"),
  ))

  let #(m3b, _) = update.update(m2, DismissIntentPrompt)
  m3b.intent_prompt |> should.equal(None)

  // Relay scoping
  let #(m4, _) =
    update.update(
      m3,
      SetAppRelays("example.app.alpha", Some(["wss://relay.example.com"])),
    )
  case model.find_app(m4, "example.app.alpha") {
    Some(a) -> a.relays |> should.equal(Some(["wss://relay.example.com"]))
    None -> should.fail()
  }

  // Shell & accent color
  let #(m5, eff5) = update.update(m4, SelectShell("editorial"))
  m5.active_shell_id |> should.equal("editorial")
  should.be_true(list.contains(eff5, SwitchActiveShell("editorial")))

  let #(m6, eff6) = update.update(m5, SetAccentColor("#cc8844"))
  m6.accent_color |> should.equal("#cc8844")
  eff6 |> should.equal([PersistAccentColor("#cc8844")])

  // Profile & Sync
  let prof =
    UserProfileSummary(
      pubkey: "abcd1234",
      npub: "npub1abcd",
      display_name: "Alice",
      picture: None,
      nip05: Some("alice@example.com"),
    )
  let #(m7, _) = update.update(m6, SetUserProfile(prof))
  m7.user_profile |> should.equal(Some(prof))

  let #(m8, _) = update.update(m7, SetSyncStatus(Synced(12_345)))
  m8.sync_status |> should.equal(Synced(12_345))

  let #(m9, eff9) = update.update(m8, ToggleAutoSync(False))
  m9.auto_sync_nip78 |> should.be_false()
  // When auto_sync is False, only PersistWorkspaceLocal is emitted (not PublishWorkspaceNip78)
  list.length(eff9) |> should.equal(1)

  let #(m10, eff10) = update.update(m9, TriggerWorkspaceSync)
  m10.sync_status |> should.equal(Syncing)
  list.length(eff10) |> should.equal(2)

  // Modals & Pull refresh
  let upd_modal =
    UpdateModalState(
      plugin_id: "example.app.alpha",
      plugin_name: "Alpha",
      current_version: "1.0.0",
      latest_version: "1.1.0",
      changelog: Some("Bug fixes"),
    )
  let #(m11, _) = update.update(m10, ShowUpdateModal(upd_modal))
  m11.update_modal |> should.equal(Some(upd_modal))

  let #(m12, eff12) =
    update.update(m11, ConfirmPluginUpdate("example.app.alpha"))
  m12.update_modal |> should.equal(None)
  eff12 |> should.equal([UpgradePlugin("example.app.alpha")])

  let #(m12b, _) = update.update(m11, DismissUpdateModal)
  m12b.update_modal |> should.equal(None)

  let #(m13, eff13) = update.update(m12, StartPullRefresh)
  m13.pull_refreshing |> should.be_true()
  eff13 |> should.equal([RefreshActiveView])

  let #(m14, _) = update.update(m13, FinishPullRefresh)
  m14.pull_refreshing |> should.be_false()

  let #(m15, _) = update.update(m14, SetSearchQuery("notes"))
  m15.search_query |> should.equal("notes")

  let #(m16, _) = update.update(m15, SetCustomInstallUrl("https://a.b"))
  m16.custom_install_url |> should.equal("https://a.b")

  let ws = model.to_workspace_state(m16, 999)
  let #(_m17, eff17) = update.update(m16, ApplyRemoteWorkspace(ws))
  should.be_true(
    list.any(eff17, fn(effect) {
      case effect {
        update.PersistWorkspaceLocal(_) -> True
        _ -> False
      }
    }),
  )
}

// -----------------------------------------------------------------------------
// Shell Facade & Avatar Tests
// -----------------------------------------------------------------------------

pub fn shell_avatar_data_uri_is_deterministic_svg_test() {
  let uri1 = shell.avatar_data_uri("deadbeef01234567", "alice")
  let uri2 = shell.avatar_data_uri("deadbeef01234567", "alice")
  uri1 |> should.equal(uri2)
  should.be_true(string.starts_with(uri1, "data:image/svg+xml;utf8,%3Csvg"))
  should.be_true(string.contains(uri1, "%3EA%3C/text%3E"))
}

// -----------------------------------------------------------------------------
// Layout & Viewport Host Islands Tests
// -----------------------------------------------------------------------------

pub fn viewport_host_renders_stable_island_anchor_test() {
  viewport_host.slot_dom_id(Main, "example.app.alpha")
  |> should.equal("slot-main-example.app.alpha")

  let html_str =
    viewport_host.render_slot_anchor(
      Sidebar,
      "example.app.alpha",
      Some("?view=widget"),
      True,
    )
    |> element.to_string

  should.be_true(string.contains(
    html_str,
    "class=\"omni-viewport-island omni-component-slot\"",
  ))
  should.be_true(string.contains(
    html_str,
    "id=\"slot-sidebar-example.app.alpha\"",
  ))
  should.be_true(string.contains(html_str, "data-viewport-slot=\"sidebar\""))
  should.be_true(string.contains(
    html_str,
    "data-plugin-slot=\"example.app.alpha\"",
  ))
  should.be_true(string.contains(html_str, "data-route=\"?view=widget\""))
  should.be_true(string.contains(html_str, "data-active=\"true\""))
}

pub fn dock_renders_standard_dock_item_hierarchy_test() {
  let app1 = sample_app("example.app.alpha", "Alpha", True, True, [])
  let m = model.init("editorial", [app1])
  let dock_html = dock.render_dock(m) |> element.to_string

  should.be_true(string.contains(dock_html, "<nav"))
  should.be_true(string.contains(dock_html, "class=\"omni-dock\""))
  should.be_true(string.contains(dock_html, "class=\"dock-item active\""))
  should.be_true(string.contains(dock_html, "<div class=\"dock-icon-wrapper\">"))
  should.be_true(string.contains(dock_html, "<span>Alpha</span>"))
  should.be_true(string.contains(dock_html, "<span>Widgets</span>"))
  should.be_true(string.contains(dock_html, "<span>Apps</span>"))
  should.be_true(string.contains(dock_html, "<span>Settings</span>"))
}

pub fn header_actions_renders_sync_fullscreen_and_profile_test() {
  let p_hdr =
    PlacementConfig(
      viewport: HeaderActions,
      view_id: "quick",
      route: Some("?view=quick"),
    )
  let app1 = sample_app("example.app.alpha", "Alpha", True, True, [p_hdr])
  let prof =
    UserProfileSummary(
      pubkey: "1234abcd",
      npub: "npub11234",
      display_name: "Satoshi",
      picture: Some("https://example.com/avatar.png"),
      nip05: None,
    )
  let m =
    Model(
      ..model.init("editorial", [app1]),
      user_profile: Some(prof),
      sync_status: Synced(1000),
    )

  let hdr_html = header_actions.render_header_actions(m) |> element.to_string
  should.be_true(string.contains(hdr_html, "id=\"btn-shell-toggle-fullscreen\""))
  should.be_true(string.contains(hdr_html, "data-sync-status=\"sync-ok\""))
  should.be_true(string.contains(
    hdr_html,
    "id=\"slot-header-actions-example.app.alpha\"",
  ))
  should.be_true(string.contains(hdr_html, "Satoshi"))

  // Also test SyncError and SyncIdle rendering
  let m_err = Model(..m, sync_status: SyncError("timeout"))
  let hdr_err_html =
    header_actions.render_header_actions(m_err) |> element.to_string
  should.be_true(string.contains(
    hdr_err_html,
    "data-sync-status=\"sync-error\"",
  ))
}

pub fn widgets_grid_renders_cards_and_empty_state_test() {
  let app_no_widgets = sample_app("example.app.alpha", "Alpha", True, True, [])
  let m_empty = model.init("editorial", [app_no_widgets])
  let empty_html =
    widgets_grid.render_widgets_grid(m_empty) |> element.to_string
  should.be_true(string.contains(empty_html, "No Workspace Widgets Assigned"))
  should.be_true(string.contains(empty_html, "Configure Widgets"))

  let p_side =
    PlacementConfig(
      viewport: Sidebar,
      view_id: "widget",
      route: Some("?view=widget"),
    )
  let app_with_widget =
    sample_app("example.app.beta", "Beta Widget", True, False, [p_side])
  let m_with = model.init("editorial", [app_with_widget])
  let grid_html = widgets_grid.render_widgets_grid(m_with) |> element.to_string
  should.be_true(string.contains(grid_html, "class=\"omni-widget-card\""))
  should.be_true(string.contains(grid_html, "Beta Widget"))
  should.be_true(string.contains(
    grid_html,
    "id=\"slot-sidebar-example.app.beta\"",
  ))
}

pub fn main_view_switches_cleanly_across_pages_test() {
  let app1 = sample_app("example.app.alpha", "Alpha", True, True, [])
  let m0 = model.init("editorial", [app1])

  let dummy_settings = fn(_m, _tab) {
    html.div([attribute.id("mock-settings")], [element.text("Settings Content")])
  }
  let dummy_store = fn(_m) {
    html.div([attribute.id("mock-store")], [element.text("Store Content")])
  }

  // 1. PrimaryApp
  let html_primary =
    main_view.render_main_viewport(m0, dummy_settings, dummy_store)
    |> element.to_string
  should.be_true(string.contains(
    html_primary,
    "id=\"slot-main-example.app.alpha\"",
  ))

  // 2. WidgetsDashboard
  let m_widgets = Model(..m0, active_page: WidgetsDashboard)
  let html_widgets =
    main_view.render_main_viewport(m_widgets, dummy_settings, dummy_store)
    |> element.to_string
  should.be_true(string.contains(html_widgets, "omni-widgets-grid"))

  // 3. AppStore
  let m_store = Model(..m0, active_page: AppStore)
  let html_store =
    main_view.render_main_viewport(m_store, dummy_settings, dummy_store)
    |> element.to_string
  should.be_true(string.contains(html_store, "id=\"mock-store\""))

  // 4. Settings
  let m_settings =
    Model(..m0, active_page: Settings(TabPlugins), fullscreen: True)
  let html_settings =
    main_view.render_main_viewport(m_settings, dummy_settings, dummy_store)
    |> element.to_string
  should.be_true(string.contains(html_settings, "id=\"mock-settings\""))
  should.be_true(string.contains(html_settings, "omni-main-fullscreen"))
}

pub fn installing_custom_url_emits_install_effect_test() {
  let m = model.init("editorial", [])
  let custom =
    model.InstalledApp(
      id: "nsite.custom.example",
      name: "Custom",
      display_name: Some("Custom"),
      description: "",
      icon: "apps",
      enabled: True,
      pinned: False,
      views: [],
      placements: [],
      handled_intents: [],
      disabled_intents: [],
      relays: None,
      source_url: "https://example.com/app.html",
      version: Some("1.0.0"),
    )
  let #(_, effects) = update.update(m, InstallApp(custom))
  should.be_true(
    list.any(effects, fn(effect) {
      case effect {
        update.InstallPluginFromUrl(url, plugin_id) ->
          url == "https://example.com/app.html"
          && plugin_id == "nsite.custom.example"
        _ -> False
      }
    }),
  )
}

pub fn reinstalling_resolved_custom_app_does_not_refetch_test() {
  let custom =
    model.InstalledApp(
      id: "nsite.custom.example",
      name: "Custom",
      display_name: Some("Custom"),
      description: "",
      icon: "apps",
      enabled: True,
      pinned: False,
      views: [],
      placements: [],
      handled_intents: [],
      disabled_intents: [],
      relays: None,
      source_url: "https://example.com/app.html",
      version: Some("1.0.0"),
    )
  let m = model.init("editorial", [custom])
  let resolved =
    model.InstalledApp(..custom, name: "Custom Renamed", version: Some("2.0.0"))
  let #(_, effects) = update.update(m, InstallApp(resolved))
  should.be_false(
    list.any(effects, fn(effect) {
      case effect {
        update.InstallPluginFromUrl(_, _) -> True
        _ -> False
      }
    }),
  )
}

pub fn apply_remote_workspace_merges_newer_updated_at_test() {
  let m0 = model.init("editorial", [])
  let local = model.to_workspace_state(m0, 2000)
  let remote =
    workspace.WorkspaceState(
      ..local,
      updated_at: 1000,
      shell_type: Some("panorama"),
    )
  let #(next, effects) = update.update(m0, ApplyRemoteWorkspace(remote))
  // Local state is newer, so its shell choice wins; the payload is persisted.
  next.active_shell_id |> should.equal("editorial")
  should.be_true(
    list.any(effects, fn(effect) {
      case effect {
        update.PersistWorkspaceLocal(_) -> True
        _ -> False
      }
    }),
  )
}

pub fn theme_mode_switch_persists_and_normalizes_test() {
  let m = model.init("editorial", [])
  let #(light, effects) = update.update(m, SetThemeMode("light"))
  light.theme_mode |> should.equal("light")
  effects |> should.equal([update.PersistThemeMode("light")])

  let #(fallback, _) = update.update(light, SetThemeMode("sepia"))
  fallback.theme_mode |> should.equal("dark")
}

pub fn in_app_back_navigation_pops_history_test() {
  let m = model.init("editorial", [])
  let #(apps, _) = update.update(m, NavigateTo(model.AppStore))
  let #(widgets, _) = update.update(apps, NavigateTo(model.WidgetsDashboard))
  list.length(widgets.back_stack) |> should.equal(2)

  let #(back1, _) = update.update(widgets, NavigateBack)
  case back1.active_page {
    model.AppStore -> Nil
    _ -> should.fail()
  }
  let #(back2, _) = update.update(back1, NavigateBack)
  case back2.active_page {
    model.WidgetsDashboard -> Nil
    _ -> should.fail()
  }
  back2.back_stack |> should.equal([])
}

pub fn theme_renders_back_button_only_with_history_test() {
  let m = model.init("editorial", [])
  let html0 = editorial_theme.view(m) |> element.to_string
  string.contains(html0, "btn-shell-back") |> should.be_false()

  let #(next, _) = update.update(m, NavigateTo(model.AppStore))
  let html1 = editorial_theme.view(next) |> element.to_string
  string.contains(html1, "btn-shell-back") |> should.be_true()
}

pub fn key_import_and_export_emit_effects_test() {
  let m = model.init("editorial", [])
  let #(typed, _) = update.update(m, SetKeyInput("nsec1example"))
  let #(_, import_effects) = update.update(typed, ImportKey)
  import_effects |> should.equal([update.ImportKeyEffect("nsec1example")])

  let #(_, export_effects) = update.update(m, ExportKey)
  export_effects |> should.equal([update.ExportKeyEffect])

  let #(with_nsec, _) = update.update(m, SetExportedNsec(Ok("nsec1abc")))
  with_nsec.exported_nsec |> should.equal(Some("nsec1abc"))
}

pub fn plugin_settings_tab_mounts_plugin_view_test() {
  let m = model.init("editorial", [])
  let #(_, effects) =
    update.update(m, OpenSettings(model.TabPluginSettings("example.app.alpha")))
  should.be_true(
    list.any(effects, fn(effect) {
      case effect {
        update.MountPluginInSlot(id, Main, Some("?view=settings")) ->
          id == "example.app.alpha"
        _ -> False
      }
    }),
  )
}

pub fn widgets_dashboard_mounts_companion_placements_test() {
  let alpha =
    model.InstalledApp(
      id: "example.app.alpha",
      name: "Alpha",
      display_name: Some("Alpha"),
      description: "",
      icon: "apps",
      enabled: True,
      pinned: True,
      views: [],
      placements: [
        model.PlacementConfig(
          viewport: Sidebar,
          view_id: "widget",
          route: Some("?view=widget"),
        ),
      ],
      handled_intents: [],
      disabled_intents: [],
      relays: None,
      source_url: "https://example.com/app.html",
      version: Some("1.0.0"),
    )
  let m = model.init("editorial", [alpha])
  let #(_, effects) = update.update(m, NavigateTo(model.WidgetsDashboard))
  should.be_true(
    list.any(effects, fn(effect) {
      case effect {
        update.MountPluginInSlot(
          "example.app.alpha",
          Sidebar,
          Some("?view=widget"),
        ) -> True
        _ -> False
      }
    }),
  )
}

pub fn passphrase_controls_emit_effects_and_status_test() {
  let m = model.init("editorial", [])
  let #(typed, _) = update.update(m, SetPassphrase("secret"))
  let #(_, enable_effects) = update.update(typed, EnablePassphrase)
  enable_effects |> should.equal([update.EnablePassphraseEffect("secret")])

  let #(_, unlock_effects) = update.update(typed, UnlockKey)
  unlock_effects |> should.equal([update.UnlockKeyEffect("secret")])

  let #(unlocked, _) =
    update.update(m, KeySecurityStatus(encrypted: True, locked: False))
  unlocked.key_encrypted |> should.equal(True)
  unlocked.key_locked |> should.equal(False)
  unlocked.passphrase |> should.equal("")
}

pub fn account_switch_emits_effect_and_status_test() {
  let m = model.init("editorial", [])
  let #(_, effects) = update.update(m, SwitchAccount("abc123"))
  effects |> should.equal([update.SwitchAccountEffect("abc123")])

  let #(next, _) = update.update(m, AccountSwitchResult(Ok(Nil)))
  next.key_message |> should.equal(Some("Switched account."))
}

pub fn app_default_route_resolves_declared_primary_view_test() {
  let app =
    sample_app("example.app.views", "Views", True, True, [])
    |> fn(a) {
      model.InstalledApp(..a, views: [
        model.ViewOption(
          id: "widget",
          title: "Widget",
          path: "/?view=widget",
          format: "html",
        ),
        model.ViewOption(id: "main", title: "Main", path: "/", format: "html"),
      ])
    }

  // The declared main view is the bare root, so no route is needed.
  model.app_default_route(app) |> should.equal(None)
  model.app_view_route(app, "widget") |> should.equal(Some("?view=widget"))
  model.app_view_route(app, "missing") |> should.equal(None)
}

pub fn intent_navigation_coalesces_back_stack_test() {
  let m0 = model.init("editorial", [])
  let #(m1, _) = update.update(m0, NavigateTo(model.AppStore))
  let #(m2, _) = update.update(m1, OpenIntentApp("nsite.a", None))
  list.length(m2.back_stack) |> should.equal(2)

  // A second intent navigation replaces the first intent entry.
  let #(m3, _) = update.update(m2, OpenIntentApp("nsite.b", None))
  list.length(m3.back_stack) |> should.equal(2)
  case m3.active_page {
    model.PrimaryApp("nsite.b", _) -> Nil
    _ -> should.fail()
  }
  case m3.back_stack {
    [model.AppStore, model.WidgetsDashboard] -> Nil
    _ -> should.fail()
  }

  // Manual navigation clears the intent marker, so the next intent pushes.
  let #(m4, _) = update.update(m3, OpenApp("nsite.manual", None))
  m4.intent_page |> should.equal(None)
  let #(m5, _) = update.update(m4, OpenIntentApp("nsite.c", None))
  list.length(m5.back_stack) |> should.equal(4)
}

pub fn scroll_state_hides_dock_and_shows_back_to_top_test() {
  let m0 = model.init("editorial", [])
  let #(m1, _) = update.update(m0, ShellScrolled(False, True))
  m1.dock_hidden |> should.equal(True)
  m1.show_back_to_top |> should.equal(True)

  let #(m2, _) = update.update(m1, ShellScrolled(False, False))
  m2.dock_hidden |> should.equal(False)
  m2.show_back_to_top |> should.equal(True)

  let #(m3, _) = update.update(m2, ShellScrolled(True, False))
  m3.dock_hidden |> should.equal(False)
  m3.show_back_to_top |> should.equal(False)
}

pub fn escape_exits_fullscreen_and_dismisses_intent_prompt_test() {
  let m0 =
    Model(
      ..model.init("editorial", []),
      fullscreen: True,
      intent_prompt: Some(IntentPromptState(
        "view_note",
        ["nsite.sample.alpha"],
        "{}",
      )),
    )
  let #(m1, _) = update.update(m0, EscapePressed)
  m1.intent_prompt |> should.equal(None)
  m1.fullscreen |> should.equal(True)

  let #(m2, _) = update.update(m1, EscapePressed)
  m2.fullscreen |> should.equal(False)
}

pub fn editorial_chrome_renders_exit_and_back_to_top_test() {
  let base = model.init("editorial", [])
  let fullscreen = Model(..base, fullscreen: True)
  let full_html = editorial_theme.view(fullscreen) |> element.to_string
  string.contains(full_html, "btn-editorial-exit-fullscreen")
  |> should.be_true()

  let scrolled = Model(..base, show_back_to_top: True, dock_hidden: True)
  let scrolled_html = editorial_theme.view(scrolled) |> element.to_string
  string.contains(scrolled_html, "btn-editorial-back-to-top")
  |> should.be_true()
  string.contains(scrolled_html, "editorial-dock dock-hidden")
  |> should.be_true()
}

pub fn toast_stack_caps_and_dismisses_test() {
  let m0 = model.init("editorial", [])
  let #(m1, _) = update.update(m0, ShowToast("first"))
  let #(m2, _) = update.update(m1, ShowToastTone("second", model.ToastError))
  let #(m3, _) = update.update(m2, ShowToast("third"))
  let #(m4, _) = update.update(m3, ShowToast("fourth"))
  list.length(m4.toasts) |> should.equal(3)
  let assert [newest, ..] = m4.toasts
  newest.message |> should.equal("fourth")

  let #(m5, _) = update.update(m4, DismissToast(newest.id))
  list.length(m5.toasts) |> should.equal(2)

  let html_str = editorial_theme.view(m4) |> element.to_string
  string.contains(html_str, "omni-toast-stack") |> should.be_true()
  string.contains(html_str, "btn-dismiss-toast-") |> should.be_true()
}
