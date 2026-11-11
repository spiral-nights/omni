//// Per-plugin relay access and network scoping configuration panel for Settings.
////
//// Supports 3 relay scoping modes for every installed plugin:
//// 1. All Configured Relays (Default Pool): `app.relays == None`
//// 2. Offline / Local-Only Mode (No Network Relays): `app.relays == Some([])`
//// 3. Custom Scoped Relays: `app.relays == Some(["wss://...", ...])`

import gleam/int
import gleam/list
import gleam/option.{None, Some}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import lustre/event
import omni/shell/model.{type InstalledApp, type Model}
import omni/shell/msg.{type Msg, SetAppRelays}
import omni/ui/icons

/// Relay scoping mode derived from `app.relays`.
pub type RelayScopeMode {
  ScopeDefaultPool
  ScopeLocalOnly
  ScopeCustom(relays: List(String))
}

/// Default pool relay URLs offered for custom scoping selection.
pub fn default_pool_relays() -> List(String) {
  ["wss://relay.damus.io", "wss://relay.ditto.pub", "wss://nos.lol"]
}

/// Determine the current `RelayScopeMode` of an `InstalledApp`.
pub fn app_relay_scope(app: InstalledApp) -> RelayScopeMode {
  case app.relays {
    None -> ScopeDefaultPool
    Some([]) -> ScopeLocalOnly
    Some(urls) -> ScopeCustom(urls)
  }
}

/// Render the per-plugin relay scoping configuration panel (`<section class="omni-settings-panel omni-relay-scoping-panel">`).
pub fn render_relay_scoping_panel(model: Model) -> Element(Msg) {
  let cards =
    list.map(model.installed_apps, fn(app) { render_app_relay_scope_card(app) })

  let content = case cards {
    [] -> [
      html.div([attribute.class("omni-empty-state")], [
        html.p([attribute.class("omni-empty-state-description")], [
          element.text("No applications installed."),
        ]),
      ]),
    ]
    items -> items
  }

  html.section(
    [
      attribute.class("omni-settings-panel omni-relay-scoping-panel"),
      attribute.id("settings-relay-scoping-panel"),
    ],
    [
      html.header([attribute.class("omni-settings-section-header")], [
        html.div([attribute.class("omni-settings-title-group")], [
          icons.render_icon("relays", 18),
          html.h3([attribute.class("omni-settings-section-title")], [
            element.text("Relay Access & Network Scoping"),
          ]),
        ]),
        html.p([attribute.class("omni-settings-section-desc")], [
          element.text(
            "Configure whether each application connects to the default relay pool, a restricted set of custom relays, or runs strictly offline in 0ms local-only mode.",
          ),
        ]),
      ]),
      html.div([attribute.class("omni-relay-scoping-app-list")], content),
    ],
  )
}

fn render_app_relay_scope_card(app: InstalledApp) -> Element(Msg) {
  let title = model.app_title(app)
  let scope = app_relay_scope(app)

  let #(mode_label, is_default, is_local, is_custom) = case scope {
    ScopeDefaultPool -> #("All Relays (Default)", True, False, False)
    ScopeLocalOnly -> #("Local Only (No Relays)", False, True, False)
    ScopeCustom(urls) -> {
      let count = list.length(urls)
      let suffix = case count == 1 {
        True -> "1 relay"
        False -> int.to_string(count) <> " relays"
      }
      #("Custom (" <> suffix <> ")", False, False, True)
    }
  }

  let initial_custom_relays = case app.relays {
    Some([_, ..] as existing) -> existing
    _ ->
      case default_pool_relays() {
        [first, ..] -> [first]
        [] -> ["wss://relay.damus.io"]
      }
  }

  let custom_relays_box = case scope {
    ScopeCustom(selected_urls) ->
      render_custom_relay_checkboxes(app.id, selected_urls)
    _ -> element.none()
  }

  html.article(
    [
      attribute.class("omni-settings-card plugin-relay-access-box"),
      attribute.attribute("data-relay-scope-app", app.id),
    ],
    [
      html.div([attribute.class("omni-settings-card-header")], [
        html.div([attribute.class("omni-settings-app-identity")], [
          icons.render_icon(app.icon, 18),
          html.div([attribute.class("omni-settings-app-titles")], [
            html.strong([attribute.class("omni-settings-app-name")], [
              element.text(title),
            ]),
            html.span([attribute.class("omni-settings-app-id")], [
              element.text(app.id),
            ]),
          ]),
        ]),
        html.span(
          [
            attribute.class("omni-relay-mode-pill"),
            attribute.attribute("data-relay-mode", mode_label),
          ],
          [element.text(mode_label)],
        ),
      ]),
      html.div([attribute.class("omni-relay-scope-options")], [
        // 1. Default Pool
        html.button(
          [
            attribute.type_("button"),
            attribute.id("btn-relay-default-" <> app.id),
            attribute.class(case is_default {
              True -> "omni-relay-scope-btn active"
              False -> "omni-relay-scope-btn"
            }),
            attribute.attribute("aria-pressed", bool_to_str(is_default)),
            event.on_click(SetAppRelays(app.id, None)),
          ],
          [
            icons.render_icon("cloud", 14),
            html.span([], [element.text("All Configured Relays (Default)")]),
          ],
        ),
        // 2. Custom Relays
        html.button(
          [
            attribute.type_("button"),
            attribute.id("btn-relay-custom-" <> app.id),
            attribute.class(case is_custom {
              True -> "omni-relay-scope-btn active"
              False -> "omni-relay-scope-btn"
            }),
            attribute.attribute("aria-pressed", bool_to_str(is_custom)),
            event.on_click(SetAppRelays(app.id, Some(initial_custom_relays))),
          ],
          [
            icons.render_icon("sliders", 14),
            html.span([], [element.text("Custom Relays")]),
          ],
        ),
        // 3. Offline / Local-Only
        html.button(
          [
            attribute.type_("button"),
            attribute.id("btn-relay-local-" <> app.id),
            attribute.class(case is_local {
              True -> "omni-relay-scope-btn active"
              False -> "omni-relay-scope-btn"
            }),
            attribute.attribute("aria-pressed", bool_to_str(is_local)),
            event.on_click(SetAppRelays(app.id, Some([]))),
          ],
          [
            icons.render_icon("key", 14),
            html.span([], [
              element.text("Local Only / Offline (Disable All Relays)"),
            ]),
          ],
        ),
      ]),
      custom_relays_box,
    ],
  )
}

fn render_custom_relay_checkboxes(
  plugin_id: String,
  selected_urls: List(String),
) -> Element(Msg) {
  let pool_urls = list.unique(list.append(default_pool_relays(), selected_urls))

  let items =
    list.map(pool_urls, fn(relay_url) {
      let is_checked = list.contains(selected_urls, relay_url)
      let next_urls = toggle_relay_in_list(selected_urls, relay_url)

      html.button(
        [
          attribute.type_("button"),
          attribute.class(case is_checked {
            True -> "omni-custom-relay-chip selected"
            False -> "omni-custom-relay-chip"
          }),
          attribute.attribute("data-relay-url", relay_url),
          event.on_click(SetAppRelays(plugin_id, Some(next_urls))),
        ],
        [
          icons.render_icon(
            case is_checked {
              True -> "check-circle"
              False -> "relay"
            },
            14,
          ),
          html.code([], [element.text(relay_url)]),
        ],
      )
    })

  html.div([attribute.class("omni-custom-relays-list")], items)
}

fn toggle_relay_in_list(current: List(String), target: String) -> List(String) {
  case list.contains(current, target) {
    True -> list.filter(current, fn(u) { u != target })
    False -> list.append(current, [target])
  }
}

fn bool_to_str(b: Bool) -> String {
  case b {
    True -> "true"
    False -> "false"
  }
}
