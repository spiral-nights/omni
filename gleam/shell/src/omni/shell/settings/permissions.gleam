//// Per-plugin capability/ACL status, lifecycle controls, and custom URL installer.
////
//// Strictly plugin-agnostic: zero hardcoded plugin IDs.

import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import lustre/event
import omni/shell/model.{
  type InstalledApp, type Model, InstalledApp, TabPluginSettings, ViewOption,
  app_has_settings_view,
}
import omni/shell/msg.{
  type Msg, InstallApp, OpenSettings, SetCustomInstallUrl, ToggleAppEnabled,
  ToggleCapabilityGrant, UninstallApp,
}
import omni/shell/settings/intents as intents_settings
import omni/shell/settings/placements as placements_settings
import omni/shell/settings/relay_scoping as relay_scoping_settings
import omni/ui/icons
import omni/ui/plugin_icon

/// Standard Nostr event kind descriptor for publishing permissions summary.
pub type StandardKindInfo {
  StandardKindInfo(kind: Int, name: String, description: String)
}

/// Canonical Nostr event kinds surfaced in the permissions overview.
pub fn standard_nostr_kinds() -> List(StandardKindInfo) {
  [
    StandardKindInfo(
      kind: 1,
      name: "Short Notes",
      description: "Kind 1 — Short Text Notes & Posts",
    ),
    StandardKindInfo(
      kind: 6,
      name: "Reposts",
      description: "Kind 6 — Generic Reposts",
    ),
    StandardKindInfo(
      kind: 7,
      name: "Reactions",
      description: "Kind 7 — Reactions & Likes",
    ),
    StandardKindInfo(
      kind: 0,
      name: "Metadata",
      description: "Kind 0 — User Profile / Metadata",
    ),
    StandardKindInfo(
      kind: 30_023,
      name: "Articles",
      description: "Kind 30023 — Long-form Articles",
    ),
    StandardKindInfo(
      kind: 10_002,
      name: "Relay List",
      description: "Kind 10002 — Relay List Metadata",
    ),
    StandardKindInfo(
      kind: 4,
      name: "Direct Messages",
      description: "Kind 4 / 1059 — Encrypted Direct Messages",
    ),
  ]
}

/// Render the Plugins & Permissions management panel (`<section class="omni-settings-panel omni-permissions-panel">`).
pub fn render_permissions_panel(model: Model) -> Element(Msg) {
  let custom_installer = render_custom_installer_bar(model.custom_install_url)

  let app_cards =
    list.map(model.installed_apps, fn(app) {
      render_plugin_permission_card(model, app)
    })

  let list_content = case app_cards {
    [] -> [
      html.div([attribute.class("omni-empty-state")], [
        html.p([attribute.class("omni-empty-state-description")], [
          element.text("No applications installed."),
        ]),
      ]),
    ]
    cards -> cards
  }

  html.section(
    [
      attribute.class("omni-settings-panel omni-permissions-panel"),
      attribute.id("settings-permissions-panel"),
    ],
    [
      html.header([attribute.class("omni-settings-section-header")], [
        html.div([attribute.class("omni-settings-title-group")], [
          icons.render_icon("plugins", 18),
          html.h3([attribute.class("omni-settings-section-title")], [
            element.text("Installed Applications & Capability Governance"),
          ]),
        ]),
        html.p([attribute.class("omni-settings-section-desc")], [
          element.text(
            "Manage sandboxed applications, capability grants, Nostr signing permissions, and custom nsite installations.",
          ),
        ]),
      ]),
      custom_installer,
      html.div([attribute.class("omni-permissions-app-list")], list_content),
    ],
  )
}

fn render_custom_installer_bar(custom_url: String) -> Element(Msg) {
  let trimmed = string.trim(custom_url)
  let derived_app = derive_app_from_url(trimmed)

  html.div([attribute.class("omni-custom-installer-box")], [
    html.label(
      [
        attribute.class("omni-custom-installer-label"),
        attribute.for("input-custom-plugin-url"),
      ],
      [
        icons.render_icon("download", 14),
        html.span([], [
          element.text("Install Application from URL, Blossom, or NIP-19 naddr"),
        ]),
      ],
    ),
    html.div([attribute.class("omni-custom-installer-row")], [
      html.input([
        attribute.type_("text"),
        attribute.id("input-custom-plugin-url"),
        attribute.class("omni-input omni-custom-install-input"),
        attribute.placeholder("https://example.com/app.html or naddr1..."),
        attribute.value(custom_url),
        event.on_input(SetCustomInstallUrl),
      ]),
      html.button(
        [
          attribute.type_("button"),
          attribute.id("btn-install-custom-url"),
          attribute.class("omni-button omni-button-primary"),
          attribute.disabled(trimmed == ""),
          event.on_click(InstallApp(derived_app)),
        ],
        [
          icons.render_icon("plus", 14),
          html.span([], [element.text("Install App")]),
        ],
      ),
    ]),
  ])
}

fn render_plugin_permission_card(
  model: Model,
  app: InstalledApp,
) -> Element(Msg) {
  let title = model.app_title(app)
  let version_str = option.unwrap(app.version, "1.0.0")
  let status_badge = case app.enabled {
    True ->
      html.span([attribute.class("omni-status-badge status-enabled")], [
        element.text("Enabled"),
      ])
    False ->
      html.span([attribute.class("omni-status-badge status-disabled")], [
        element.text("Disabled"),
      ])
  }

  let capability_pills = [
    render_capability_pill(
      model,
      app.id,
      "storage:kv",
      "Scoped Storage (KV)",
      "Isolated local storage partition",
      None,
    ),
    render_capability_pill(
      model,
      app.id,
      "nostr:read",
      "Nostr Subscriptions",
      "Read public events and local 0ms cache",
      None,
    ),
    render_capability_pill(
      model,
      app.id,
      "nostr:sign",
      "Event Signing",
      "Sign Nostr events via host keystore",
      None,
    ),
    render_capability_pill(
      model,
      app.id,
      "nostr:encrypt",
      "Encryption",
      "NIP-04 and NIP-44 direct message access",
      None,
    ),
    render_capability_pill(
      model,
      app.id,
      "intents:dispatch",
      "Intent Routing",
      "Cross-application protocol & intent invocation",
      None,
    ),
  ]

  let kind_badges =
    list.map(standard_nostr_kinds(), fn(k) {
      let scope = Some(int.to_string(k.kind))
      let granted = grant_allows(model, app.id, "nostr:write", scope)
      html.button(
        [
          attribute.type_("button"),
          attribute.class("omni-kind-badge omni-kind-toggle"),
          attribute.title(k.description),
          attribute.attribute("data-granted", case granted {
            True -> "true"
            False -> "false"
          }),
          event.on_click(ToggleCapabilityGrant(
            app.id,
            "nostr:write",
            scope,
            !granted,
          )),
        ],
        [
          element.text(
            "Kind " <> int.to_string(k.kind) <> " (" <> k.name <> ")",
          ),
        ],
      )
    })

  html.article(
    [
      attribute.class("omni-settings-card plugin-permissions-section"),
      attribute.attribute("data-permission-app", app.id),
    ],
    [
      html.div([attribute.class("omni-settings-card-header")], [
        html.div([attribute.class("omni-settings-app-identity")], [
          plugin_icon.render(app.icon, 18),
          html.div([attribute.class("omni-settings-app-titles")], [
            html.div([attribute.class("omni-settings-app-title-row")], [
              html.strong([attribute.class("omni-settings-app-name")], [
                element.text(title),
              ]),
              html.span([attribute.class("omni-settings-app-version")], [
                element.text("v" <> version_str),
              ]),
              status_badge,
            ]),
            html.span([attribute.class("omni-settings-app-id")], [
              element.text(app.id),
            ]),
            case app.description {
              "" -> element.none()
              desc ->
                html.p([attribute.class("omni-settings-app-desc")], [
                  element.text(desc),
                ])
            },
          ]),
        ]),
        html.div([attribute.class("omni-permission-card-actions")], [
          case app_has_settings_view(app) {
            True ->
              html.button(
                [
                  attribute.type_("button"),
                  attribute.id("btn-app-settings-" <> app.id),
                  attribute.class("omni-button omni-button-secondary"),
                  attribute.title("Open " <> title <> " settings"),
                  event.on_click(OpenSettings(TabPluginSettings(app.id))),
                ],
                [
                  icons.render_icon("sliders", 14),
                  html.span([], [element.text("Settings")]),
                ],
              )
            False -> element.none()
          },
          html.button(
            [
              attribute.type_("button"),
              attribute.id("btn-toggle-enabled-" <> app.id),
              attribute.class(case app.enabled {
                True -> "omni-button omni-button-secondary"
                False -> "omni-button omni-button-primary"
              }),
              event.on_click(ToggleAppEnabled(app.id)),
            ],
            [
              html.span([], [
                element.text(case app.enabled {
                  True -> "Disable"
                  False -> "Enable"
                }),
              ]),
            ],
          ),
          html.button(
            [
              attribute.type_("button"),
              attribute.id("btn-uninstall-" <> app.id),
              attribute.class("omni-button omni-button-danger"),
              attribute.title("Uninstall " <> title),
              event.on_click(UninstallApp(app.id)),
            ],
            [
              icons.render_icon("trash", 14),
              html.span([], [element.text("Uninstall")]),
            ],
          ),
        ]),
      ]),
      html.div([attribute.class("omni-capability-grid")], capability_pills),
      html.div([attribute.class("plugin-write-permissions-section")], [
        html.span([attribute.class("write-permissions-label")], [
          element.text("Governed Nostr Event Kinds:"),
        ]),
        html.div([attribute.class("write-permissions-kinds")], kind_badges),
      ]),
      html.div(
        [
          attribute.class("omni-app-settings-sections"),
          attribute.id("settings-placements-panel"),
        ],
        [
          placements_settings.render_app_placements_card(app),
          relay_scoping_settings.render_app_relay_scope_card(app),
          html.div([attribute.id("settings-intents-panel")], [
            intents_settings.render_app_intents_card(app),
          ]),
        ],
      ),
    ],
  )
}

fn render_capability_pill(
  model: Model,
  plugin_id: String,
  cap_key: String,
  label: String,
  description: String,
  scope: Option(String),
) -> Element(Msg) {
  let granted = grant_allows(model, plugin_id, cap_key, scope)
  html.div(
    [
      attribute.class(case granted {
        True -> "omni-capability-item granted"
        False -> "omni-capability-item revoked"
      }),
      attribute.attribute("data-capability", cap_key),
    ],
    [
      html.div([attribute.class("omni-capability-info")], [
        html.strong([attribute.class("omni-capability-name")], [
          element.text(label),
        ]),
        html.span([attribute.class("omni-capability-desc")], [
          element.text(description),
        ]),
      ]),
      html.div([attribute.class("omni-capability-controls")], [
        html.span([attribute.class("omni-capability-status")], [
          element.text(case granted {
            True -> "Granted"
            False -> "Not granted"
          }),
        ]),
        html.button(
          [
            attribute.type_("button"),
            attribute.id("btn-capability-" <> plugin_id <> "-" <> cap_key),
            attribute.class("omni-button omni-button-secondary"),
            event.on_click(ToggleCapabilityGrant(
              plugin_id,
              cap_key,
              scope,
              !granted,
            )),
          ],
          [
            element.text(case granted {
              True -> "Revoke"
              False -> "Grant"
            }),
          ],
        ),
      ]),
    ],
  )
}

fn grant_allows(
  model: Model,
  plugin_id: String,
  capability_name: String,
  scope: Option(String),
) -> Bool {
  let matches =
    list.filter(model.capability_grants, fn(item) {
      item.plugin_id == plugin_id
      && item.capability == capability_name
      && item.scope == scope
    })
  case matches {
    [item, ..] -> item.level != "deny"
    [] -> False
  }
}

fn derive_app_from_url(url: String) -> InstalledApp {
  let clean_id = case url {
    "" -> "nsite.custom.app"
    u ->
      "nsite.custom."
      <> {
        u
        |> string.lowercase
        |> string.replace("https://", "")
        |> string.replace("http://", "")
        |> string.replace("/", ".")
        |> string.replace(":", "-")
        |> string.slice(0, 32)
      }
  }

  InstalledApp(
    id: clean_id,
    name: "Custom App",
    display_name: Some("Custom App"),
    description: "Installed from " <> url,
    icon: "apps",
    enabled: True,
    pinned: False,
    views: [
      ViewOption(id: "default", title: "Default", path: "/", format: "html"),
    ],
    placements: [],
    handled_intents: [],
    disabled_intents: [],
    relays: None,
    source_url: url,
    version: Some("1.0.0"),
  )
}
