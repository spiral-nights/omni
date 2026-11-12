//// Omni Classic shell theme (Phase 6.5).
////
//// Traditional desktop-style workspace: a top utility bar carrying the brand
//// identity and quick actions, a persistent navigation rail that collapses to
//// a bottom dock on mobile, and an expansive centered main viewport.
//// Strictly plugin-agnostic: zero hardcoded plugin IDs.

import gleam/list
import gleam/option.{None}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import lustre/event
import omni/shell/app_store
import omni/shell/gestures/pull_to_refresh.{PullIdle}
import omni/shell/layout/dock
import omni/shell/layout/header_actions
import omni/shell/layout/main_view
import omni/shell/model.{
  type Model, type SettingsTab, AppStore, TabProfile, WidgetsDashboard,
}
import omni/shell/msg.{
  type Msg, NavigateTo, OpenApp, OpenSettings, ToggleMobileMenu,
}
import omni/shell/settings/intents
import omni/shell/settings/permission_prompt
import omni/shell/settings/tabs
import omni/shell/styles
import omni/shell/theme.{type Theme, Theme}
import omni/shell/update_modal
import omni/ui/icons

/// Build the built-in Omni Classic `Theme` strategy descriptor.
pub fn theme() -> Theme {
  Theme(
    id: "classic",
    name: "Omni Classic",
    description: "Traditional desktop-style workspace with persistent navigation sidebar and top utility bar.",
    icon: "layout",
    author: "Omni Core Team",
    version: "1.0.0",
    is_builtin: True,
    stylesheet_href: styles.classic_css_path,
    render: view,
  )
}

/// Render the full Omni Classic shell layout for the given model.
pub fn view(model: Model) -> Element(Msg) {
  html.div(
    [
      attribute.class("omni-shell omni-shell-classic"),
      attribute.id("omni-shell-root"),
      attribute.attribute("data-shell", "classic"),
      attribute.attribute("data-theme-mode", model.theme_mode),
      attribute.attribute("data-mobile-menu", case model.mobile_menu_open {
        True -> "open"
        False -> "closed"
      }),
    ],
    [
      render_header(model),
      html.div([attribute.class("app-layout")], [
        dock.render_dock(model),
        main_view.render_main_viewport(model, settings_view, store_view),
      ]),
      render_mobile_menu(model),
      render_overlays(model),
    ],
  )
}

/// Top utility bar: brand identity, mobile menu toggle, and quick actions.
fn render_header(model: Model) -> Element(Msg) {
  html.header([attribute.class("app-header"), attribute.id("omni-app-header")], [
    html.div([attribute.class("brand-row")], [
      html.button(
        [
          attribute.type_("button"),
          attribute.id("btn-shell-mobile-menu"),
          attribute.class("omni-mobile-menu-btn"),
          attribute.title("Toggle Navigation Menu"),
          attribute.attribute("aria-label", "Toggle Navigation Menu"),
          attribute.attribute("aria-expanded", case model.mobile_menu_open {
            True -> "true"
            False -> "false"
          }),
          event.on_click(ToggleMobileMenu),
        ],
        [icons.render_icon("menu", 18)],
      ),
      header_actions.render_back_button(model),
      html.span([attribute.class("brand-logo")], [element.text("Omni")]),
      html.span(
        [
          attribute.class("brand-tag"),
          attribute.attribute("aria-hidden", "true"),
        ],
        [element.text("Universal nsite Runtime")],
      ),
    ]),
    header_actions.render_header_actions(model),
  ])
}

fn render_mobile_menu(model: Model) -> Element(Msg) {
  case model.mobile_menu_open {
    False -> element.none()
    True ->
      html.nav(
        [
          attribute.class("omni-mobile-menu-panel"),
          attribute.id("omni-mobile-menu-panel"),
          attribute.attribute("aria-label", "Mobile Navigation"),
        ],
        list.append(
          list.map(model.dock_apps(model), fn(app) {
            mobile_menu_item(
              "mobile-app-" <> app.id,
              model.app_title(app),
              app.icon,
              OpenApp(app.id, None),
            )
          }),
          [
            mobile_menu_item(
              "mobile-nav-widgets",
              "Widgets",
              "widgets",
              NavigateTo(WidgetsDashboard),
            ),
            mobile_menu_item(
              "mobile-nav-apps",
              "Apps",
              "apps",
              NavigateTo(AppStore),
            ),
            mobile_menu_item(
              "mobile-nav-settings",
              "Settings",
              "settings",
              OpenSettings(TabProfile),
            ),
          ],
        ),
      )
  }
}

fn mobile_menu_item(
  id: String,
  label: String,
  icon_name: String,
  on_click: Msg,
) -> Element(Msg) {
  html.button(
    [
      attribute.type_("button"),
      attribute.id(id),
      attribute.class("dock-item omni-mobile-menu-item"),
      attribute.title(label),
      event.on_click(on_click),
    ],
    [
      html.div([attribute.class("dock-icon-wrapper")], [
        icons.render_icon(icon_name, 18),
      ]),
      html.span([], [element.text(label)]),
    ],
  )
}

fn settings_view(model: Model, _tab: SettingsTab) -> Element(Msg) {
  tabs.render_settings_view(model)
}

fn store_view(model: Model) -> Element(Msg) {
  app_store.render_app_store(model, app_store.curated_catalog())
}

/// Floating overlays rendered above the shell: pull-to-refresh indicator,
/// intent handler chooser modal, and plugin update confirmation modal.
fn render_overlays(model: Model) -> Element(Msg) {
  html.div([attribute.class("omni-shell-overlays")], [
    pull_to_refresh.render_indicator(model, PullIdle),
    intents.render_intent_chooser_modal(model),
    permission_prompt.render_permission_prompt(model),
    update_modal.render_update_modal(model),
  ])
}
