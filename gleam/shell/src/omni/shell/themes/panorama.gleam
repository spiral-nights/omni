//// Panorama Hub shell theme (Phase 6.6).
////
//// Metro-inspired horizontal pivot layout: a hero header with a pivot
//// navigation strip (pinned apps, Widgets, Apps, System), a user profile
//// tile, and a full-width content canvas for the active pivot section.
//// Strictly plugin-agnostic: zero hardcoded plugin IDs.

import gleam/list
import gleam/option.{None, Some}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import lustre/event
import omni/shell/accent
import omni/shell/app_store
import omni/shell/gestures/pull_to_refresh.{PullIdle}
import omni/shell/layout/header_actions
import omni/shell/layout/viewport_host
import omni/shell/layout/widgets_grid
import omni/shell/model.{
  type Model, type SettingsTab, AppStore, PrimaryApp, Settings, WidgetsDashboard,
}
import omni/shell/msg.{type Msg, NavigateTo, OpenApp, OpenSettings}
import omni/shell/settings/intents
import omni/shell/settings/permission_prompt
import omni/shell/settings/tabs
import omni/shell/shell
import omni/shell/styles
import omni/shell/theme.{type Theme, Theme}
import omni/shell/update_modal
import omni/ui/icons
import omni/ui/sanitize

/// Build the built-in Panorama Hub `Theme` strategy descriptor.
pub fn theme() -> Theme {
  Theme(
    id: "panorama",
    name: "Panorama Hub",
    description: "Horizontal metro-inspired panoramic canvas with live tiles and fluid hub columns.",
    icon: "windows",
    author: "Omni Core Team",
    version: "1.0.0",
    is_builtin: True,
    stylesheet_href: styles.panorama_css_path,
    render: view,
  )
}

/// Render the full Panorama Hub shell layout for the given model.
pub fn view(model: Model) -> Element(Msg) {
  html.div(
    [
      attribute.class("omni-shell panorama-shell-root"),
      attribute.id("panorama-shell-root"),
      attribute.attribute("data-shell", "panorama"),
      attribute.attribute("data-theme-mode", model.theme_mode),
      attribute.attribute("style", accent.style_attribute(model.accent_color)),
    ],
    [
      render_header(model),
      html.div([attribute.class("panorama-canvas")], [
        render_active_section(model),
      ]),
      render_overlays(model),
    ],
  )
}

/// Hero header: pivot navigation strip and user profile tile.
fn render_header(model: Model) -> Element(Msg) {
  html.header(
    [
      attribute.class("panorama-hero-header"),
      attribute.id("panorama-hero-header"),
    ],
    [
      html.div([attribute.class("panorama-header-content")], [
        header_actions.render_back_button(model),
        render_pivot_nav(model),
        html.div([attribute.class("panorama-header-profile-wrap")], [
          render_profile_tile(model),
        ]),
      ]),
    ],
  )
}

/// Metro pivot strip: one item per pinned/dock app plus the system panes.
fn render_pivot_nav(model: Model) -> Element(Msg) {
  let app_items =
    model.dock_apps(model)
    |> list.map(fn(app) {
      render_pivot_item(
        id: "pivot-app-" <> app.id,
        label: model.app_title(app),
        icon_name: app.icon,
        active: case model.active_page {
          PrimaryApp(active_id, _) -> active_id == app.id
          _ -> False
        },
        on_click_msg: OpenApp(app.id, None),
      )
    })

  let system_items = [
    render_pivot_item(
      id: "pivot-widgets",
      label: "Widgets",
      icon_name: "widgets",
      active: case model.active_page {
        WidgetsDashboard -> True
        _ -> False
      },
      on_click_msg: NavigateTo(WidgetsDashboard),
    ),
    render_pivot_item(
      id: "pivot-apps",
      label: "Apps",
      icon_name: "apps",
      active: case model.active_page {
        AppStore -> True
        _ -> False
      },
      on_click_msg: NavigateTo(AppStore),
    ),
    render_pivot_item(
      id: "pivot-system",
      label: "System",
      icon_name: "settings",
      active: case model.active_page {
        Settings(_) -> True
        _ -> False
      },
      on_click_msg: OpenSettings(tabs.current_tab(model)),
    ),
  ]

  html.nav(
    [
      attribute.class("panorama-pivot-nav"),
      attribute.id("panorama-pivot-nav"),
      attribute.attribute("aria-label", "Primary Navigation"),
    ],
    list.append(app_items, system_items),
  )
}

fn render_pivot_item(
  id id: String,
  label label: String,
  icon_name icon_name: String,
  active active: Bool,
  on_click_msg on_click_msg: Msg,
) -> Element(Msg) {
  let class_str = case active {
    True -> "panorama-pivot-item active"
    False -> "panorama-pivot-item"
  }

  html.button(
    [
      attribute.type_("button"),
      attribute.id(id),
      attribute.class(class_str),
      attribute.title(label),
      attribute.attribute("aria-current", case active {
        True -> "page"
        False -> "false"
      }),
      event.on_click(on_click_msg),
    ],
    [
      icons.render_icon(icon_name, 14),
      html.span([], [element.text(label)]),
    ],
  )
}

/// Metro user profile tile in the header.
fn render_profile_tile(model: Model) -> Element(Msg) {
  let #(display_name, avatar_content) = case model.user_profile {
    Some(profile) -> {
      let safe_pic = case profile.picture {
        Some(raw) -> sanitize.sanitize_url(raw)
        None -> None
      }
      case safe_pic {
        Some(url) -> #(
          profile.display_name,
          avatar_img(url, profile.display_name),
        )
        None -> #(
          profile.display_name,
          html.img([
            attribute.class("panorama-header-avatar-img"),
            attribute.src(shell.avatar_data_uri(
              profile.pubkey,
              profile.display_name,
            )),
            attribute.alt(profile.display_name),
          ]),
        )
      }
    }
    None -> #(
      "Identity",
      html.img([
        attribute.class("panorama-header-avatar-img"),
        attribute.src(shell.avatar_data_uri("anonymous", "I")),
        attribute.alt("Identity"),
      ]),
    )
  }

  html.button(
    [
      attribute.type_("button"),
      attribute.id("panorama-header-user-btn"),
      attribute.class("panorama-header-user-btn"),
      attribute.title(display_name <> " (Manage Profile & Keys)"),
      attribute.attribute("aria-label", "Open Profile Settings"),
      event.on_click(OpenSettings(tabs.current_tab(model))),
    ],
    [
      html.div([attribute.class("panorama-header-avatar")], [avatar_content]),
      html.span([attribute.class("panorama-header-name")], [
        element.text(display_name),
      ]),
    ],
  )
}

fn avatar_img(url: String, alt: String) -> Element(Msg) {
  html.img([
    attribute.class("panorama-header-avatar-img"),
    attribute.src(url),
    attribute.alt(alt),
  ])
}

/// Active pivot section canvas: full app, widgets mosaic, app store, or system.
fn render_active_section(model: Model) -> Element(Msg) {
  case model.active_page {
    PrimaryApp(plugin_id, route) -> {
      let title = case model.find_app(model, plugin_id) {
        Some(app) -> model.app_title(app)
        None -> plugin_id
      }

      html.section(
        [
          attribute.class("panorama-section panorama-app-active-view"),
          attribute.id("panorama-section-app-" <> plugin_id),
          attribute.attribute("data-pivot", "app"),
        ],
        [
          html.div([attribute.class("panorama-section-title-bar")], [
            html.h2([], [element.text(title)]),
          ]),
          viewport_host.render_embedded_or_island(model, plugin_id, route),
        ],
      )
    }

    WidgetsDashboard ->
      html.section(
        [
          attribute.class("panorama-section"),
          attribute.id("panorama-section-widgets"),
          attribute.attribute("data-pivot", "widgets"),
        ],
        [widgets_grid.render_widgets_grid(model)],
      )

    AppStore ->
      html.section(
        [
          attribute.class("panorama-section"),
          attribute.id("panorama-section-apps"),
          attribute.attribute("data-pivot", "apps"),
        ],
        [app_store.render_app_store(model, app_store.curated_catalog())],
      )

    Settings(tab) ->
      html.section(
        [
          attribute.class("panorama-section panorama-system-view"),
          attribute.id("panorama-section-system"),
          attribute.attribute("data-pivot", "system"),
        ],
        [render_system_section(model, tab)],
      )
  }
}

fn render_system_section(model: Model, tab: SettingsTab) -> Element(Msg) {
  html.div([attribute.class("panorama-section-content")], [
    tabs.render_settings_view(model),
    html.div([attribute.class("panorama-tab-anchor")], [
      settings_tab_anchor(tab),
    ]),
  ])
}

fn settings_tab_anchor(tab: SettingsTab) -> Element(Msg) {
  html.div(
    [
      attribute.id("panorama-settings-tab"),
      attribute.attribute("data-settings-tab", settings_tab_id(tab)),
    ],
    [],
  )
}

fn settings_tab_id(tab: SettingsTab) -> String {
  case tab {
    model.TabProfile -> "profile"
    model.TabRelays -> "relays"
    model.TabPlugins -> "plugins"
    model.TabWorkspace -> "workspace"
    model.TabShells -> "shells"
    model.TabPluginSettings(plugin_id) -> "plugin-" <> plugin_id
  }
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
