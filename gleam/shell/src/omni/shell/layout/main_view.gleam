//// Primary `<main class="omni-main-viewport">` view router for the Omni Shell.
////
//// Switches cleanly on `model.active_page` (`PrimaryApp`, `WidgetsDashboard`,
//// `AppStore`, `Settings`). Strictly plugin-agnostic.

import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import omni/shell/layout/viewport_host
import omni/shell/layout/widgets_grid
import omni/shell/model.{
  type Model, type SettingsTab, AppStore, PrimaryApp, Settings, WidgetsDashboard,
}
import omni/shell/msg.{type Msg}

/// Render `<main class="omni-main-viewport">` switching on `model.active_page`.
pub fn render_main_viewport(
  model: Model,
  settings_view: fn(Model, SettingsTab) -> Element(Msg),
  app_store_view: fn(Model) -> Element(Msg),
) -> Element(Msg) {
  let content = case model.active_page {
    PrimaryApp(plugin_id, route) ->
      viewport_host.render_embedded_or_island(model, plugin_id, route)

    WidgetsDashboard -> widgets_grid.render_widgets_grid(model)

    AppStore -> app_store_view(model)

    Settings(tab) -> settings_view(model, tab)
  }

  let fullscreen_class = case model.fullscreen {
    True -> " omni-main-fullscreen"
    False -> ""
  }

  html.main([attribute.class("omni-main-viewport" <> fullscreen_class)], [
    content,
  ])
}
