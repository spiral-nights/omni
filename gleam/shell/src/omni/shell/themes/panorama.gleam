//// Panorama Hub shell theme (Phase 6.6).
////
//// Metro-inspired horizontal pivot layout: a hero header with a pivot
//// navigation strip (pinned apps, Widgets, Apps, System), a user profile
//// tile, and a full-width content canvas for the active pivot section.
//// Strictly plugin-agnostic: zero hardcoded plugin IDs.

import gleam/int
import gleam/list
import gleam/option.{None, Some}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import lustre/event
import omni/shell/accent
import omni/shell/app_store
import omni/shell/gestures/pull_to_refresh
import omni/shell/layout/context_menu
import omni/shell/layout/header_actions
import omni/shell/layout/viewport_host
import omni/shell/layout/widgets_grid
import omni/shell/model.{
  type InstalledApp, type Model, type SettingsTab, AppStore, PrimaryApp,
  Settings, TabProfile, TabShells, WidgetsDashboard,
}
import omni/shell/msg.{
  type Msg, NavigateTo, OpenApp, OpenSettings, ToggleFullscreen,
}
import omni/shell/settings/intents
import omni/shell/settings/permission_prompt
import omni/shell/settings/tabs
import omni/shell/shell
import omni/shell/styles
import omni/shell/theme.{type Theme, Theme}
import omni/shell/toast
import omni/shell/update_modal
import omni/ui/icons

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
  let root_classes = case model.fullscreen {
    True -> "omni-shell panorama-shell-root app-fullscreen"
    False -> "omni-shell panorama-shell-root"
  }
  let active_idx = active_pivot_index(model)
  html.div(
    [
      attribute.class(root_classes),
      attribute.id("panorama-shell-root"),
      attribute.attribute("data-shell", "panorama"),
      attribute.attribute("data-theme-mode", model.theme_mode),
      attribute.attribute("style", accent.style_attribute(model.accent_color)),
    ],
    [
      render_header(model),
      html.div(
        [
          attribute.class("panorama-canvas"),
          attribute.attribute("data-active-index", int.to_string(active_idx)),
          attribute.attribute(
            "style",
            "--panorama-active-index: " <> int.to_string(active_idx),
          ),
        ],
        render_sections(model),
      ),
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
          header_actions.render_header_actions(model),
          render_profile_tile(model),
        ]),
      ]),
    ],
  )
}

fn pivot_apps(model: Model) -> List(InstalledApp) {
  let docked = model.dock_apps(model)
  case model.active_page {
    PrimaryApp(active_id, _) ->
      case list.any(docked, fn(app) { app.id == active_id }) {
        True -> docked
        False ->
          case model.find_app(model, active_id) {
            Some(app) -> list.append(docked, [app])
            None -> docked
          }
      }
    _ -> docked
  }
}

fn active_pivot_index(model: Model) -> Int {
  let apps = pivot_apps(model)
  let app_count = list.length(apps)
  case model.active_page {
    PrimaryApp(active_id, _) ->
      list.index_fold(apps, 0, fn(found, app, idx) {
        case app.id == active_id {
          True -> idx
          False -> found
        }
      })
    WidgetsDashboard -> app_count
    AppStore -> app_count + 1
    Settings(_) -> app_count + 2
  }
}

/// Metro pivot strip: one item per pinned/dock app plus the system panes.
fn render_pivot_nav(model: Model) -> Element(Msg) {
  let app_items =
    pivot_apps(model)
    |> list.map(fn(app) {
      render_pivot_item(
        id: "pivot-app-" <> app.id,
        label: model.app_title(app),
        icon_name: app.icon,
        active: case model.active_page {
          PrimaryApp(active_id, _) -> active_id == app.id
          _ -> False
        },
        context_app_id: Some(app.id),
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
      context_app_id: None,
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
      context_app_id: None,
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
      context_app_id: None,
      on_click_msg: OpenSettings(TabShells),
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
  context_app_id context_app_id: option.Option(String),
  on_click_msg on_click_msg: Msg,
) -> Element(Msg) {
  let class_str = case active {
    True -> "panorama-pivot-item active"
    False -> "panorama-pivot-item"
  }
  let base_attrs = [
    attribute.type_("button"),
    attribute.id(id),
    attribute.class(class_str),
    attribute.title(label),
    attribute.attribute("aria-current", case active {
      True -> "page"
      False -> "false"
    }),
    event.on_click(on_click_msg),
  ]
  let attrs = case context_app_id {
    Some(app_id) -> [
      attribute.attribute("data-context-app-id", app_id),
      ..base_attrs
    ]
    None -> base_attrs
  }

  html.button(attrs, [
    icons.render_icon(icon_name, 14),
    html.span([], [element.text(label)]),
  ])
}

/// Metro user profile tile in the header.
fn render_profile_tile(model: Model) -> Element(Msg) {
  let #(display_name, avatar_content) = case model.user_profile {
    Some(profile) -> #(
      profile.display_name,
      avatar_img(
        shell.avatar_data_uri(profile.pubkey, profile.display_name),
        profile.display_name,
      ),
    )
    None -> #(
      "Identity",
      avatar_img(shell.avatar_data_uri("anonymous", "I"), "Identity"),
    )
  }

  html.button(
    [
      attribute.type_("button"),
      attribute.id("panorama-header-user-btn"),
      attribute.class("panorama-header-user-btn"),
      attribute.title(display_name <> " (Manage Profile & Keys)"),
      attribute.attribute("aria-label", "Open Profile Settings"),
      event.on_click(OpenSettings(TabProfile)),
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

/// Panoramic section strip in fixed hub order: apps, widgets, app store, system.
fn render_sections(model: Model) -> List(Element(Msg)) {
  let app_sections =
    pivot_apps(model)
    |> list.map(fn(app) {
      case model.active_page {
        PrimaryApp(active_id, route) if active_id == app.id ->
          render_app_section(model, app.id, route, True)
        _ -> render_app_section(model, app.id, None, False)
      }
    })

  let widgets_active = case model.active_page {
    WidgetsDashboard -> True
    _ -> False
  }
  let apps_active = case model.active_page {
    AppStore -> True
    _ -> False
  }
  let #(system_active, system_tab) = case model.active_page {
    Settings(tab) -> #(True, tab)
    _ -> #(False, TabShells)
  }

  list.flatten([
    app_sections,
    [render_widgets_section(model, widgets_active)],
    [render_app_store_section(model, apps_active)],
    [render_settings_section(model, system_tab, system_active)],
  ])
}

fn render_app_section(
  model: Model,
  plugin_id: String,
  route: option.Option(String),
  is_active: Bool,
) -> Element(Msg) {
  let title = case model.find_app(model, plugin_id) {
    Some(app) -> model.app_title(app)
    None -> plugin_id
  }
  let class_name = case is_active {
    True -> "panorama-section panorama-active-section panorama-app-active-view"
    False -> "panorama-section"
  }
  let base_attrs = [
    attribute.class(class_name),
    attribute.id("panorama-section-app-" <> plugin_id),
    attribute.attribute("data-pivot", "app"),
  ]
  let attrs = case is_active {
    True -> base_attrs
    False -> [event.on_click(OpenApp(plugin_id, None)), ..base_attrs]
  }

  html.section(attrs, [
    html.div([attribute.class("panorama-section-title-bar")], [
      html.h2([], [element.text(title)]),
    ]),
    viewport_host.render_embedded_or_island(model, plugin_id, route),
  ])
}

fn render_widgets_section(model: Model, is_active: Bool) -> Element(Msg) {
  let class_name = case is_active {
    True -> "panorama-section panorama-active-section"
    False -> "panorama-section"
  }
  let base_attrs = [
    attribute.class(class_name),
    attribute.id("panorama-section-widgets"),
    attribute.attribute("data-pivot", "widgets"),
  ]
  let attrs = case is_active {
    True -> base_attrs
    False -> [event.on_click(NavigateTo(WidgetsDashboard)), ..base_attrs]
  }
  html.section(attrs, [widgets_grid.render_widgets_grid(model)])
}

fn render_app_store_section(model: Model, is_active: Bool) -> Element(Msg) {
  let class_name = case is_active {
    True -> "panorama-section panorama-active-section"
    False -> "panorama-section"
  }
  let base_attrs = [
    attribute.class(class_name),
    attribute.id("panorama-section-apps"),
    attribute.attribute("data-pivot", "apps"),
  ]
  let attrs = case is_active {
    True -> base_attrs
    False -> [event.on_click(NavigateTo(AppStore)), ..base_attrs]
  }
  html.section(attrs, [app_store.render_app_store(model, [])])
}

fn render_settings_section(
  model: Model,
  tab: SettingsTab,
  is_active: Bool,
) -> Element(Msg) {
  let class_name = case is_active {
    True -> "panorama-section panorama-active-section panorama-system-view"
    False -> "panorama-section panorama-system-view"
  }
  let base_attrs = [
    attribute.class(class_name),
    attribute.id("panorama-section-system"),
    attribute.attribute("data-pivot", "system"),
  ]
  let attrs = case is_active {
    True -> base_attrs
    False -> [event.on_click(OpenSettings(tab)), ..base_attrs]
  }
  html.section(attrs, [render_system_section(model, tab)])
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
  let exit_fullscreen = case model.fullscreen {
    True ->
      html.button(
        [
          attribute.type_("button"),
          attribute.id("btn-panorama-exit-fullscreen"),
          attribute.class("editorial-floating-exit-fullscreen"),
          attribute.title("Exit fullscreen"),
          event.on_click(ToggleFullscreen),
        ],
        [
          icons.render_icon("close", 14),
          html.span([], [element.text("Exit")]),
        ],
      )
    False -> element.none()
  }

  html.div([attribute.class("omni-shell-overlays")], [
    pull_to_refresh.render_indicator(model, model.pull_state),
    context_menu.render_context_menu(model),
    intents.render_intent_chooser_modal(model),
    permission_prompt.render_permission_prompt(model),
    update_modal.render_update_modal(model),
    exit_fullscreen,
    toast.render_toasts(model),
  ])
}
