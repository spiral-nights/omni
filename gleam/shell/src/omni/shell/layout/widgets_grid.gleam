//// Multi-column Widgets Dashboard grid view for the Omni Shell.
////
//// Renders interactive cards for each `Sidebar` companion placement or an
//// empty state inviting the user to configure widgets in Settings.

import gleam/list
import gleam/option.{None}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import lustre/event
import omni/protocol/viewport.{Sidebar}
import omni/shell/layout/viewport_host
import omni/shell/model.{
  type InstalledApp, type Model, type PlacementConfig, TabPlugins,
}
import omni/shell/msg.{type Msg, OpenApp, OpenSettings}
import omni/ui/icons

/// Render the multi-column Widgets Dashboard (`<div class="omni-widgets-grid">`).
pub fn render_widgets_grid(model: Model) -> Element(Msg) {
  let widgets = model.sidebar_widgets(model)

  case widgets {
    [] -> render_empty_widgets_state()
    items ->
      html.div(
        [attribute.class("omni-widgets-grid")],
        list.map(items, fn(pair) { render_widget_card(pair.0, pair.1) }),
      )
  }
}

fn render_widget_card(
  app: InstalledApp,
  placement: PlacementConfig,
) -> Element(Msg) {
  let title = model.app_title(app)
  html.article(
    [
      attribute.class("omni-widget-card"),
      attribute.attribute("data-widget-app", app.id),
    ],
    [
      html.header([attribute.class("omni-widget-header")], [
        html.div([attribute.class("omni-widget-title-group")], [
          icons.render_icon(app.icon, 16),
          html.span([attribute.class("omni-widget-title")], [
            element.text(title),
          ]),
        ]),
        html.button(
          [
            attribute.type_("button"),
            attribute.class("omni-widget-open-btn"),
            attribute.title("Open " <> title),
            event.on_click(OpenApp(app.id, model.app_view_route(app, "widget"))),
          ],
          [
            html.span([], [element.text("Open App")]),
            icons.render_icon("external", 14),
          ],
        ),
      ]),
      html.div([attribute.class("omni-widget-body")], [
        viewport_host.render_slot_anchor(Sidebar, app.id, placement.route, True),
      ]),
    ],
  )
}

fn render_empty_widgets_state() -> Element(Msg) {
  html.div([attribute.class("omni-widgets-grid omni-widgets-empty")], [
    html.div([attribute.class("omni-empty-state")], [
      html.div([attribute.class("omni-empty-state-icon")], [
        icons.render_icon("widgets", 32),
      ]),
      html.h3([attribute.class("omni-empty-state-title")], [
        element.text("No Workspace Widgets Assigned"),
      ]),
      html.p([attribute.class("omni-empty-state-description")], [
        element.text(
          "Assign any installed application to the Widget surface in Settings to build your dashboard.",
        ),
      ]),
      html.button(
        [
          attribute.type_("button"),
          attribute.class("omni-button omni-button-primary"),
          event.on_click(OpenSettings(TabPlugins)),
        ],
        [
          icons.render_icon("sliders", 16),
          html.span([], [element.text("Configure Widgets")]),
        ],
      ),
    ]),
  ])
}
