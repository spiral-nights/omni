//// Settings navigation tab bar and active tab content router.
////
//// Renders standard system tabs (`TabProfile`, `TabRelays`, `TabPlugins`,
//// `TabWorkspace`, `TabShells`) plus dynamic `TabPluginSettings(app.id)` tabs
//// for any enabled application that declares a `"settings"` view option
//// (`?view=settings`) per `AGENTS.md`.

import gleam/int
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import lustre/event
import omni/protocol/viewport.{Main}
import omni/shell/layout/viewport_host
import omni/shell/model.{
  type InstalledApp, type Model, type SettingsTab, type SyncStatus, Settings,
  SyncError, SyncIdle, Synced, Syncing, TabPluginSettings, TabPlugins,
  TabProfile, TabRelays, TabShells, TabWorkspace, app_has_settings_view,
}
import omni/shell/msg.{
  type Msg, DisablePassphrase, EnablePassphrase, ExportKey, ImportKey,
  OpenSettings, SetKeyInput, SetPassphrase, SwitchAccount, ToggleAutoSync,
  TriggerWorkspaceSync, UnlockKey,
}
import omni/shell/settings/intents
import omni/shell/settings/permissions
import omni/shell/settings/placements
import omni/shell/settings/relay_scoping
import omni/shell/settings/shells
import omni/shell/shell
import omni/ui/icons

/// Return all enabled installed applications that declare a `settings` route (`?view=settings`).
pub fn apps_with_settings_view(model: Model) -> List(InstalledApp) {
  list.filter(model.installed_apps, app_has_settings_view)
}

/// Resolve the active `SettingsTab` from `model.active_page` (defaults to `TabProfile`).
pub fn current_tab(model: Model) -> SettingsTab {
  case model.active_page {
    Settings(tab) -> tab
    _ -> TabProfile
  }
}

/// Render the full Settings view including the navigation tab bar and active tab content panel.
pub fn render_settings_view(model: Model) -> Element(Msg) {
  let active_tab = current_tab(model)
  let nav_bar = render_settings_tab_bar(model, active_tab)
  let panel_body = render_active_tab_panel(model, active_tab)

  html.div(
    [
      attribute.class("omni-settings-view"),
      attribute.id("omni-settings-view"),
    ],
    [
      html.header([attribute.class("omni-settings-header")], [
        html.h2([attribute.class("omni-settings-title")], [
          element.text("Workspace & System Settings"),
        ]),
        nav_bar,
      ]),
      html.div([attribute.class("omni-settings-content")], [panel_body]),
    ],
  )
}

fn render_settings_tab_bar(
  model: Model,
  active_tab: SettingsTab,
) -> Element(Msg) {
  // Three primary sections, matching the original Editorial settings modal:
  // Appearance & Shells, Plugins & Viewports, Workspace & Sync.
  let primary_tabs = [
    render_tab_button(
      id: "settings-tab-shells",
      label: "Appearance & Shells",
      icon_name: "layout",
      is_active: active_tab == TabShells,
      target: TabShells,
    ),
    render_tab_button(
      id: "settings-tab-plugins",
      label: "Plugins & Viewports",
      icon_name: "plugins",
      is_active: active_tab == TabPlugins,
      target: TabPlugins,
    ),
    render_tab_button(
      id: "settings-tab-workspace",
      label: "Workspace & Sync",
      icon_name: "cloud",
      is_active: active_tab == TabWorkspace,
      target: TabWorkspace,
    ),
  ]

  // Identity and relay scoping remain reachable as deeper pages. Their tab is
  // only surfaced while active so the primary bar stays at three entries.
  let secondary_tab = case active_tab {
    TabProfile -> [
      render_tab_button(
        id: "settings-tab-profile",
        label: "Profile & Keys",
        icon_name: "user",
        is_active: True,
        target: TabProfile,
      ),
    ]
    TabRelays -> [
      render_tab_button(
        id: "settings-tab-relays",
        label: "Relays & Scoping",
        icon_name: "relays",
        is_active: True,
        target: TabRelays,
      ),
    ]
    TabPluginSettings(plugin_id) -> [
      render_tab_button(
        id: "settings-tab-plugin-" <> plugin_id,
        label: plugin_title(model, plugin_id),
        icon_name: "sliders",
        is_active: True,
        target: TabPluginSettings(plugin_id),
      ),
    ]
    _ -> []
  }

  html.nav(
    [
      attribute.class("omni-settings-tabs"),
      attribute.attribute("role", "tablist"),
      attribute.attribute("aria-label", "Settings Categories"),
    ],
    list.append(primary_tabs, secondary_tab),
  )
}

fn plugin_title(model: Model, plugin_id: String) -> String {
  case model.find_app(model, plugin_id) {
    Some(app) -> model.app_title(app)
    None -> plugin_id
  }
}

fn render_tab_button(
  id id: String,
  label label: String,
  icon_name icon_name: String,
  is_active is_active: Bool,
  target target: SettingsTab,
) -> Element(Msg) {
  html.button(
    [
      attribute.type_("button"),
      attribute.id(id),
      attribute.class(case is_active {
        True -> "omni-settings-tab active"
        False -> "omni-settings-tab"
      }),
      attribute.attribute("role", "tab"),
      attribute.attribute("aria-selected", case is_active {
        True -> "true"
        False -> "false"
      }),
      event.on_click(OpenSettings(target)),
    ],
    [
      icons.render_icon(icon_name, 16),
      html.span([], [element.text(label)]),
    ],
  )
}

fn render_active_tab_panel(
  model: Model,
  active_tab: SettingsTab,
) -> Element(Msg) {
  case active_tab {
    TabProfile -> render_profile_tab(model)
    TabRelays -> relay_scoping.render_relay_scoping_panel(model)
    TabPlugins ->
      html.div([attribute.class("omni-settings-plugins-combined")], [
        permissions.render_permissions_panel(model),
        placements.render_placements_panel(model),
        relay_scoping.render_relay_scoping_panel(model),
        intents.render_intents_panel(model),
      ])
    TabWorkspace -> render_workspace_tab(model)
    TabShells -> shells.render_shells_panel(model, shells.builtin_shells())
    TabPluginSettings(plugin_id) -> render_plugin_settings_tab(model, plugin_id)
  }
}

fn render_profile_tab(model: Model) -> Element(Msg) {
  let profile_card = case model.user_profile {
    Some(profile) -> {
      let avatar_uri =
        shell.avatar_data_uri(profile.pubkey, profile.display_name)
      html.div(
        [attribute.class("omni-settings-card omni-profile-summary-card")],
        [
          html.div([attribute.class("omni-profile-summary-header")], [
            html.img([
              attribute.class("omni-profile-summary-avatar"),
              attribute.src(avatar_uri),
              attribute.alt(profile.display_name),
            ]),
            html.div([attribute.class("omni-profile-summary-details")], [
              html.h3([attribute.class("omni-profile-display-name")], [
                element.text(profile.display_name),
              ]),
              html.code([attribute.class("omni-profile-npub")], [
                element.text(profile.npub),
              ]),
              case profile.nip05 {
                Some(nip05) ->
                  html.span([attribute.class("omni-profile-nip05")], [
                    element.text(nip05),
                  ])
                None -> element.none()
              },
            ]),
          ]),
        ],
      )
    }
    None ->
      html.div(
        [attribute.class("omni-settings-card omni-profile-summary-card")],
        [
          html.p([attribute.class("omni-settings-section-desc")], [
            element.text(
              "Local WebCrypto NIP-07 signer active. Open your Profile & Identity application to edit Kind 0 metadata or import keys.",
            ),
          ]),
        ],
      )
  }

  html.section(
    [
      attribute.class("omni-settings-panel omni-profile-panel"),
      attribute.id("settings-profile-panel"),
    ],
    [
      html.header([attribute.class("omni-settings-section-header")], [
        html.div([attribute.class("omni-settings-title-group")], [
          icons.render_icon("user", 18),
          html.h3([attribute.class("omni-settings-section-title")], [
            element.text("Identity & Key Custody"),
          ]),
        ]),
      ]),
      profile_card,
      key_custody_card(model),
    ],
  )
}

fn key_custody_card(model: Model) -> Element(Msg) {
  let message_el = case model.key_message {
    Some(message) ->
      html.p(
        [
          attribute.class("omni-settings-section-desc"),
          attribute.id("key-custody-message"),
        ],
        [element.text(message)],
      )
    None -> element.none()
  }

  let exported_el = case model.exported_nsec {
    Some(nsec) ->
      html.div([attribute.class("omni-key-export-box")], [
        html.code(
          [attribute.id("exported-nsec"), attribute.class("omni-key-secret")],
          [
            element.text(nsec),
          ],
        ),
      ])
    None -> element.none()
  }

  html.section(
    [
      attribute.class("omni-settings-card omni-key-custody-card"),
      attribute.id("settings-key-custody-section"),
    ],
    [
      html.div([attribute.class("omni-settings-card-header")], [
        html.div([attribute.class("omni-settings-title-group")], [
          icons.render_icon("lock", 18),
          html.strong([attribute.class("omni-settings-app-name")], [
            element.text("Import or Export Key"),
          ]),
        ]),
      ]),
      html.p([attribute.class("omni-settings-section-desc")], [
        element.text(
          "Paste an nsec1... or 64-character hex private key to sign in as another identity. Your key stays in local browser storage and never leaves the device unsigned.",
        ),
      ]),
      html.div([attribute.class("omni-custom-installer-row")], [
        html.input([
          attribute.type_("password"),
          attribute.id("input-import-key"),
          attribute.class("omni-input"),
          attribute.placeholder("nsec1... or hex private key"),
          attribute.value(model.key_input),
          event.on_input(SetKeyInput),
        ]),
        html.button(
          [
            attribute.type_("button"),
            attribute.id("btn-import-key"),
            attribute.class("omni-button omni-button-primary"),
            attribute.disabled(model.key_input == ""),
            event.on_click(ImportKey),
          ],
          [element.text("Import Key")],
        ),
        html.button(
          [
            attribute.type_("button"),
            attribute.id("btn-export-key"),
            attribute.class("omni-button omni-button-secondary"),
            event.on_click(ExportKey),
          ],
          [element.text("Export nsec")],
        ),
      ]),
      passphrase_section(model),
      account_list(model),
      message_el,
      exported_el,
    ],
  )
}

fn account_list(model: Model) -> Element(Msg) {
  case model.accounts {
    [] -> element.none()
    accounts -> {
      let active = case model.user_profile {
        Some(profile) -> profile.pubkey
        None -> ""
      }
      html.div([attribute.class("omni-account-list-section")], [
        html.h4([attribute.class("omni-settings-subsection-title")], [
          element.text("Accounts"),
        ]),
        html.div(
          [attribute.class("omni-account-list")],
          list.map(accounts, fn(pubkey) {
            let is_active = pubkey == active
            let short =
              string.slice(pubkey, 0, 12)
              <> "…"
              <> string.slice(pubkey, string.length(pubkey) - 6, 6)
            html.div(
              [
                attribute.class("omni-account-row"),
                attribute.attribute("data-account", pubkey),
              ],
              [
                html.code([attribute.class("omni-account-key")], [
                  element.text(short),
                ]),
                case is_active {
                  True ->
                    html.span([attribute.class("omni-shell-badge active")], [
                      element.text("Active"),
                    ])
                  False ->
                    html.button(
                      [
                        attribute.type_("button"),
                        attribute.class("omni-button omni-button-secondary"),
                        event.on_click(SwitchAccount(pubkey)),
                      ],
                      [element.text("Switch")],
                    )
                },
              ],
            )
          }),
        ),
      ])
    }
  }
}

fn passphrase_section(model: Model) -> Element(Msg) {
  let status_el = case model.key_encrypted, model.key_locked {
    True, True ->
      html.p([attribute.class("omni-settings-section-desc")], [
        element.text(
          "Key is encrypted at rest and locked. Enter your passphrase to sign again.",
        ),
      ])
    True, False ->
      html.p([attribute.class("omni-settings-section-desc")], [
        element.text(
          "Key is encrypted at rest and currently unlocked for this session.",
        ),
      ])
    False, _ ->
      html.p([attribute.class("omni-settings-section-desc")], [
        element.text(
          "Protect the stored key with a passphrase. You will be asked to unlock it after each reload.",
        ),
      ])
  }

  let input_el = case model.key_locked, model.key_encrypted {
    False, False ->
      html.input([
        attribute.type_("password"),
        attribute.id("input-key-passphrase"),
        attribute.class("omni-input"),
        attribute.placeholder("Passphrase"),
        attribute.value(model.passphrase),
        event.on_input(SetPassphrase),
      ])
    True, _ ->
      html.input([
        attribute.type_("password"),
        attribute.id("input-key-passphrase"),
        attribute.class("omni-input"),
        attribute.placeholder("Unlock passphrase"),
        attribute.value(model.passphrase),
        event.on_input(SetPassphrase),
      ])
    False, True -> element.none()
  }

  let actions = case model.key_locked, model.key_encrypted {
    True, _ -> [
      html.button(
        [
          attribute.type_("button"),
          attribute.id("btn-unlock-key"),
          attribute.class("omni-button omni-button-primary"),
          attribute.disabled(model.passphrase == ""),
          event.on_click(UnlockKey),
        ],
        [element.text("Unlock Key")],
      ),
    ]
    False, True -> [
      html.button(
        [
          attribute.type_("button"),
          attribute.id("btn-disable-passphrase"),
          attribute.class("omni-button omni-button-secondary"),
          event.on_click(DisablePassphrase),
        ],
        [element.text("Remove Passphrase")],
      ),
    ]
    False, False -> [
      html.button(
        [
          attribute.type_("button"),
          attribute.id("btn-enable-passphrase"),
          attribute.class("omni-button omni-button-primary"),
          attribute.disabled(model.passphrase == ""),
          event.on_click(EnablePassphrase),
        ],
        [element.text("Enable Passphrase")],
      ),
    ]
  }

  html.div([attribute.class("omni-key-passphrase-section")], [
    html.h4([attribute.class("omni-settings-subsection-title")], [
      element.text("Passphrase Protection"),
    ]),
    status_el,
    html.div([attribute.class("omni-custom-installer-row")], [
      input_el,
      ..actions
    ]),
  ])
}

fn render_workspace_tab(model: Model) -> Element(Msg) {
  let sync_label = format_sync_status(model.sync_status)

  let nip78_sync_card =
    html.section(
      [
        attribute.class("omni-settings-card omni-nip78-sync-card"),
        attribute.id("settings-nip78-sync-section"),
      ],
      [
        html.div([attribute.class("omni-settings-card-header")], [
          html.div([attribute.class("omni-settings-title-group")], [
            icons.render_icon("cloud", 18),
            html.div([attribute.class("omni-settings-app-titles")], [
              html.strong([attribute.class("omni-settings-app-name")], [
                element.text("Decentralized Workspace Sync (NIP-78)"),
              ]),
              html.span([attribute.class("omni-settings-app-id")], [
                element.text("kind: 30078 • d: omni/workspace/v1"),
              ]),
            ]),
          ]),
          html.span(
            [
              attribute.class("omni-sync-status-pill"),
              attribute.attribute("data-sync-state", sync_label),
            ],
            [element.text(sync_label)],
          ),
        ]),
        html.p([attribute.class("omni-settings-section-desc")], [
          element.text(
            "Synchronize your companion viewport assignments, pinned apps, route selections, and active shell theme across devices via encrypted or replaceable NIP-78 application state.",
          ),
        ]),
        html.div([attribute.class("omni-nip78-sync-controls")], [
          html.button(
            [
              attribute.type_("button"),
              attribute.id("btn-toggle-auto-sync"),
              attribute.class(case model.auto_sync_nip78 {
                True -> "omni-button omni-button-secondary active"
                False -> "omni-button omni-button-secondary"
              }),
              attribute.attribute("aria-pressed", case model.auto_sync_nip78 {
                True -> "true"
                False -> "false"
              }),
              event.on_click(ToggleAutoSync(!model.auto_sync_nip78)),
            ],
            [
              icons.render_icon("check-circle", 14),
              html.span([], [
                element.text(case model.auto_sync_nip78 {
                  True -> "Auto-Sync Enabled"
                  False -> "Auto-Sync Disabled"
                }),
              ]),
            ],
          ),
          html.button(
            [
              attribute.type_("button"),
              attribute.id("btn-trigger-workspace-sync"),
              attribute.class("omni-button omni-button-primary"),
              event.on_click(TriggerWorkspaceSync),
            ],
            [
              icons.render_icon("refresh", 14),
              html.span([], [element.text("Sync Workspace Now")]),
            ],
          ),
        ]),
      ],
    )

  html.div([attribute.class("omni-settings-workspace-combined")], [
    nip78_sync_card,
  ])
}

fn render_plugin_settings_tab(model: Model, plugin_id: String) -> Element(Msg) {
  let title = case model.find_app(model, plugin_id) {
    Some(app) -> model.app_title(app)
    None -> plugin_id
  }

  html.section(
    [
      attribute.class("omni-settings-panel omni-plugin-custom-settings-panel"),
      attribute.id("settings-plugin-panel-" <> plugin_id),
    ],
    [
      html.header([attribute.class("omni-settings-section-header")], [
        html.div([attribute.class("omni-settings-title-group")], [
          icons.render_icon("sliders", 18),
          html.h3([attribute.class("omni-settings-section-title")], [
            element.text(title <> " Settings"),
          ]),
        ]),
      ]),
      html.div([attribute.class("plugin-settings-mount-container")], [
        viewport_host.render_slot_anchor(
          Main,
          plugin_id,
          Some("?view=settings"),
          True,
        ),
      ]),
    ],
  )
}

fn format_sync_status(status: SyncStatus) -> String {
  case status {
    SyncIdle -> "Local Ready"
    Syncing -> "Syncing..."
    Synced(ts) -> "Synced (" <> int.to_string(ts) <> ")"
    SyncError(reason) -> "Sync Error: " <> reason
  }
}
