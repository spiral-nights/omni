//// Editorial shell theme (Phase 6.7).
////
//// Typography-first Warm Paper Dark layout: a fixed blurred header with the
//// OMNI wordmark and current view subtitle, a centered reading-width content
//// column, and a floating bottom dock. Strictly plugin-agnostic: zero
//// hardcoded plugin IDs.

import gleam/list
import gleam/option.{None, Some}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import lustre/event
import omni/shell/app_store
import omni/shell/gestures/pull_to_refresh.{PullIdle}
import omni/shell/layout/viewport_host
import omni/shell/layout/widgets_grid
import omni/shell/model.{
  type Model, type SettingsTab, AppStore, PrimaryApp, Settings, WidgetsDashboard,
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
import omni/shell/update_modal
import omni/ui/icons
import omni/ui/sanitize

/// Build the built-in Editorial `Theme` strategy descriptor.
pub fn theme() -> Theme {
  Theme(
    id: "editorial",
    name: "Editorial Shell",
    description: "Warm Paper Dark typography-first layout with clean reading proportions and bottom/side dock.",
    icon: "notes",
    author: "Omni Core Team",
    version: "1.0.0",
    is_builtin: True,
    stylesheet_href: styles.editorial_css_path,
    render: view,
  )
}

/// Render the full Editorial shell layout for the given model.
pub fn view(model: Model) -> Element(Msg) {
  html.div(
    [
      attribute.class(root_class(model)),
      attribute.id("editorial-shell-root"),
      attribute.attribute("data-shell", "editorial"),
      attribute.attribute("data-theme-mode", model.theme_mode),
      attribute.attribute("data-theme-mode", "dark"),
      attribute.style("--omni-accent-primary", model.accent_color),
    ],
    [
      render_header(model),
      render_main_content(model),
      render_dock(model),
      render_overlays(model),
    ],
  )
}

fn root_class(model: Model) -> String {
  let base = "omni-shell editorial-shell-root"

  let with_app = case model.active_page {
    PrimaryApp(_, _) -> base <> " has-active-app"
    WidgetsDashboard -> base <> " has-widgets-page"
    AppStore -> base <> " has-apps-page"
    Settings(_) -> base
  }

  case model.fullscreen {
    True -> with_app <> " app-fullscreen"
    False -> with_app
  }
}

/// Fixed editorial header: section label, OMNI wordmark and view subtitle,
/// plus settings, fullscreen, and profile controls.
fn render_header(model: Model) -> Element(Msg) {
  html.header([attribute.class("editorial-header")], [
    html.div([attribute.class("editorial-header-inner")], [
      html.div([attribute.class("editorial-header-left")], [
        html.button(
          [
            attribute.type_("button"),
            attribute.id("btn-editorial-dock-settings"),
            attribute.class("editorial-header-btn"),
            attribute.title("Settings"),
            attribute.attribute("aria-label", "Open Settings"),
            event.on_click(OpenSettings(tabs.current_tab(model))),
          ],
          [icons.render_icon("sliders", 17)],
        ),
      ]),
      html.div(
        [
          attribute.class("editorial-header-center"),
          attribute.id("editorial-brand-container"),
          attribute.title("Omni"),
        ],
        [
          html.h1([attribute.class("editorial-brand-title")], [
            element.text("OMNI"),
          ]),
          html.span(
            [
              attribute.id("editorial-view-subtitle"),
              attribute.class("editorial-view-subtitle"),
            ],
            [element.text(view_subtitle(model))],
          ),
        ],
      ),
      html.div([attribute.class("editorial-header-right")], [
        html.button(
          [
            attribute.type_("button"),
            attribute.id("btn-editorial-toggle-fullscreen"),
            attribute.class("editorial-header-btn"),
            attribute.title("Toggle Expansive Fullscreen"),
            attribute.attribute("aria-label", "Toggle Fullscreen"),
            event.on_click(ToggleFullscreen),
          ],
          [icons.render_icon("external", 17)],
        ),
        render_profile_avatar(model),
      ]),
    ]),
  ])
}

/// Current view subtitle shown under the wordmark.
fn view_subtitle(model: Model) -> String {
  case model.active_page {
    PrimaryApp(plugin_id, _) ->
      case model.find_app(model, plugin_id) {
        Some(app) -> model.app_title(app)
        None -> plugin_id
      }
    WidgetsDashboard -> "Widgets"
    AppStore -> "Apps"
    Settings(tab) -> settings_subtitle(tab)
  }
}

fn settings_subtitle(tab: SettingsTab) -> String {
  case tab {
    model.TabProfile -> "Profile"
    model.TabRelays -> "Relays"
    model.TabPlugins -> "Plugins"
    model.TabWorkspace -> "Workspace"
    model.TabShells -> "Shells"
    model.TabPluginSettings(_) -> "Plugin Settings"
  }
}

fn render_profile_avatar(model: Model) -> Element(Msg) {
  let #(title, avatar_src) = case model.user_profile {
    Some(profile) -> {
      let safe_pic = case profile.picture {
        Some(raw) -> sanitize.sanitize_url(raw)
        None -> None
      }
      let url = case safe_pic {
        Some(pic) -> pic
        None -> shell.avatar_data_uri(profile.pubkey, profile.display_name)
      }
      #(profile.display_name, url)
    }
    None -> #("Active Profile", shell.avatar_data_uri("anonymous", "O"))
  }

  html.button(
    [
      attribute.type_("button"),
      attribute.id("btn-editorial-profile-toggle"),
      attribute.class("editorial-header-avatar"),
      attribute.title(title),
      attribute.attribute("aria-label", "Open Profile Settings"),
      event.on_click(OpenSettings(tabs.current_tab(model))),
    ],
    [
      html.img([attribute.src(avatar_src), attribute.alt(title)]),
    ],
  )
}

/// Centered reading-width content column hosting the active viewport page.
fn render_main_content(model: Model) -> Element(Msg) {
  html.main([attribute.class("editorial-main-content")], [
    render_active_page(model),
  ])
}

fn render_active_page(model: Model) -> Element(Msg) {
  case model.active_page {
    PrimaryApp(plugin_id, route) ->
      html.section(
        [
          attribute.class("editorial-viewport-page editorial-app-page active"),
          attribute.id("editorial-page-app"),
        ],
        [viewport_host.render_embedded_or_island(model, plugin_id, route)],
      )

    WidgetsDashboard ->
      html.section(
        [
          attribute.class("editorial-viewport-page active"),
          attribute.id("editorial-page-widgets"),
        ],
        [widgets_grid.render_widgets_grid(model)],
      )

    AppStore ->
      html.section(
        [
          attribute.class("editorial-viewport-page active"),
          attribute.id("editorial-page-apps"),
        ],
        [app_store.render_app_store(model, app_store.curated_catalog())],
      )

    Settings(_) ->
      html.section(
        [
          attribute.class("editorial-viewport-page active"),
          attribute.id("editorial-page-settings"),
        ],
        [tabs.render_settings_view(model)],
      )
  }
}

/// Floating editorial dock with pinned apps and the system panes.
fn render_dock(model: Model) -> Element(Msg) {
  let app_items =
    model.dock_apps(model)
    |> list.map(fn(app) {
      render_dock_item(
        id: "btn-editorial-dock-app-" <> app.id,
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
    render_dock_item(
      id: "btn-editorial-dock-apps",
      label: "Apps",
      icon_name: "apps",
      active: case model.active_page {
        AppStore -> True
        _ -> False
      },
      on_click_msg: NavigateTo(AppStore),
    ),
    render_dock_item(
      id: "btn-editorial-dock-widgets",
      label: "Widgets",
      icon_name: "layout",
      active: case model.active_page {
        WidgetsDashboard -> True
        _ -> False
      },
      on_click_msg: NavigateTo(WidgetsDashboard),
    ),
    render_dock_item(
      id: "btn-editorial-dock-prefs",
      label: "Settings",
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
      attribute.class("editorial-dock"),
      attribute.attribute("aria-label", "Primary Navigation"),
    ],
    [
      html.div(
        [
          attribute.id("editorial-dock-items"),
          attribute.class("editorial-dock-inner"),
        ],
        list.append(app_items, system_items),
      ),
    ],
  )
}

fn render_dock_item(
  id id: String,
  label label: String,
  icon_name icon_name: String,
  active active: Bool,
  on_click_msg on_click_msg: Msg,
) -> Element(Msg) {
  let class_str = case active {
    True -> "editorial-dock-item active"
    False -> "editorial-dock-item"
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
      html.div([attribute.class("editorial-dock-icon")], [
        icons.render_icon(icon_name, 20),
      ]),
      html.span([attribute.class("editorial-dock-label")], [
        element.text(label),
      ]),
      html.div([attribute.class("editorial-active-dot")], []),
    ],
  )
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
