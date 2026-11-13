//// Primary Navigation Dock view for the Omni Shell.
////
//// Renders pinned/dock apps and built-in shell views (`WidgetsDashboard`,
//// `AppStore`, `Settings`) following the canonical `.dock-item` hierarchy.

import gleam/list
import gleam/option.{None}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import lustre/event
import omni/shell/model.{
  type InstalledApp, type Model, AppStore, PrimaryApp, Settings, TabProfile,
  WidgetsDashboard,
}
import omni/shell/msg.{type Msg, NavigateTo, OpenApp, OpenSettings}
import omni/ui/icons
import omni/ui/plugin_icon

/// Render the primary navigation dock `<nav class="omni-dock">`.
pub fn render_dock(model: Model) -> Element(Msg) {
  let app_items =
    model.dock_apps(model)
    |> list.map(fn(app) { render_app_dock_item(model, app) })

  let is_widgets_active = case model.active_page {
    WidgetsDashboard -> True
    _ -> False
  }
  let is_apps_active = case model.active_page {
    AppStore -> True
    _ -> False
  }
  let is_settings_active = case model.active_page {
    Settings(_) -> True
    _ -> False
  }

  let system_items = [
    render_dock_button(
      id: "nav-widgets",
      label: "Widgets",
      icon_name: "widgets",
      active: is_widgets_active,
      on_click_msg: NavigateTo(WidgetsDashboard),
    ),
    render_dock_button(
      id: "nav-apps",
      label: "Apps",
      icon_name: "apps",
      active: is_apps_active,
      on_click_msg: NavigateTo(AppStore),
    ),
    render_dock_button(
      id: "nav-settings",
      label: "Settings",
      icon_name: "settings",
      active: is_settings_active,
      on_click_msg: OpenSettings(TabProfile),
    ),
  ]

  html.nav(
    [
      attribute.class("omni-dock"),
      attribute.attribute("aria-label", "Primary Navigation"),
    ],
    list.append(app_items, system_items),
  )
}

fn render_app_dock_item(model: Model, app: InstalledApp) -> Element(Msg) {
  let is_active = case model.active_page {
    PrimaryApp(active_id, _) -> active_id == app.id
    _ -> False
  }
  let label = model.app_title(app)
  render_dock_button(
    id: "dock-app-" <> app.id,
    label: label,
    icon_name: app.icon,
    active: is_active,
    on_click_msg: OpenApp(app.id, model.app_default_route(app)),
  )
}

fn render_dock_button(
  id id: String,
  label label: String,
  icon_name icon_name: String,
  active active: Bool,
  on_click_msg on_click_msg: Msg,
) -> Element(Msg) {
  let class_str = case active {
    True -> "dock-item active"
    False -> "dock-item"
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
      html.div([attribute.class("dock-icon-wrapper")], [
        plugin_icon.render(icon_name, 18),
      ]),
      html.span([], [element.text(label)]),
    ],
  )
}
