//// Floating application context menu (right-click / long-press on dock or app tiles).

import gleam/int
import gleam/option.{None, Some}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import lustre/event
import omni/shell/model.{
  type AppContextMenu, type Model, TabPluginSettings, UpdateModalState,
  app_has_settings_view,
}
import omni/shell/msg.{
  type Msg, DismissAppContextMenu, OpenApp, OpenSettings, ShowUpdateModal,
  ToggleAppPinned, UninstallApp,
}
import omni/ui/icons

/// Render the floating context menu when `model.context_menu` is `Some(menu)`.
pub fn render_context_menu(model: Model) -> Element(Msg) {
  case model.context_menu {
    None -> element.none()
    Some(menu) -> render_active_menu(model, menu)
  }
}

fn render_active_menu(model: Model, menu: AppContextMenu) -> Element(Msg) {
  case model.find_app(model, menu.plugin_id) {
    None -> element.none()
    Some(app) -> {
      let title = model.app_title(app)
      let version = option.unwrap(app.version, "0.1.0")
      let pin_label = case app.pinned {
        True -> "Unpin from Dock"
        False -> "Pin to Dock"
      }
      let style_pos =
        "position:fixed;left:"
        <> int.to_string(menu.x)
        <> "px;top:"
        <> int.to_string(menu.y)
        <> "px;z-index:2000;"

      let configure_btn = case app_has_settings_view(app) {
        True ->
          html.button(
            [
              attribute.type_("button"),
              attribute.id("ctx-menu-configure"),
              attribute.class("omni-context-menu-item"),
              event.on_click(OpenSettings(TabPluginSettings(app.id))),
            ],
            [
              icons.render_icon("sliders", 14),
              html.span([], [element.text("Configure")]),
            ],
          )
        False -> element.none()
      }

      html.div(
        [
          attribute.class("omni-context-menu-backdrop"),
          attribute.id("omni-app-context-menu-backdrop"),
          event.on_click(DismissAppContextMenu),
        ],
        [
          html.div(
            [
              attribute.id("omni-app-context-menu"),
              attribute.class("omni-context-menu"),
              attribute.attribute("role", "menu"),
              attribute.attribute("data-context-plugin", app.id),
              attribute.attribute("style", style_pos),
            ],
            [
              html.button(
                [
                  attribute.type_("button"),
                  attribute.id("ctx-menu-open"),
                  attribute.class("omni-context-menu-item"),
                  event.on_click(OpenApp(app.id, None)),
                ],
                [
                  icons.render_icon("external", 14),
                  html.span([], [element.text("Open " <> title)]),
                ],
              ),
              html.button(
                [
                  attribute.type_("button"),
                  attribute.id("ctx-menu-update"),
                  attribute.class("omni-context-menu-item"),
                  event.on_click(
                    ShowUpdateModal(UpdateModalState(
                      plugin_id: app.id,
                      plugin_name: title,
                      current_version: version,
                      latest_version: version,
                      changelog: None,
                      source_url: app.source_url,
                    )),
                  ),
                ],
                [
                  icons.render_icon("download", 14),
                  html.span([], [element.text("Update...")]),
                ],
              ),
              html.button(
                [
                  attribute.type_("button"),
                  attribute.id("ctx-menu-pin"),
                  attribute.class("omni-context-menu-item"),
                  event.on_click(ToggleAppPinned(app.id)),
                ],
                [
                  icons.render_icon("pin", 14),
                  html.span([], [element.text(pin_label)]),
                ],
              ),
              configure_btn,
              html.button(
                [
                  attribute.type_("button"),
                  attribute.id("ctx-menu-uninstall"),
                  attribute.class("omni-context-menu-item danger"),
                  event.on_click(UninstallApp(app.id)),
                ],
                [
                  icons.render_icon("trash", 14),
                  html.span([], [element.text("Uninstall")]),
                ],
              ),
            ],
          ),
        ],
      )
    }
  }
}
