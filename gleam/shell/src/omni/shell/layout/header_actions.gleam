//// Top header quick actions, sync status indicator, fullscreen toggle, and profile button.
////
//// Strictly plugin-agnostic: zero hardcoded plugin IDs.

import gleam/list
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import lustre/event
import omni/protocol/viewport.{HeaderActions}
import omni/shell/layout/viewport_host
import omni/shell/model.{type InstalledApp, type Model, type PlacementConfig}
import omni/shell/msg.{type Msg, NavigateBack, OpenApp, ToggleFullscreen}
import omni/ui/icons
import omni/ui/plugin_icon

/// Render an in-app back button when there is navigation history.
pub fn render_back_button(model: Model) -> Element(Msg) {
  case model.back_stack {
    [] -> element.none()
    _ ->
      html.button(
        [
          attribute.type_("button"),
          attribute.id("btn-shell-back"),
          attribute.class("omni-header-action-btn omni-back-btn"),
          attribute.title("Back"),
          attribute.attribute("aria-label", "Back"),
          event.on_click(NavigateBack),
        ],
        [icons.render_icon("arrow-left", 18)],
      )
  }
}

/// Render the header quick-actions toolbar (`<div class="omni-header-actions">`).
pub fn render_header_actions(model: Model) -> Element(Msg) {
  let action_pills =
    model.header_action_apps(model)
    |> list.map(fn(pair) { render_header_action_pill(pair.0, pair.1) })

  let fullscreen_icon = case model.fullscreen {
    True -> "minimize"
    False -> "expand"
  }

  let fullscreen_btn =
    html.button(
      [
        attribute.type_("button"),
        attribute.id("btn-shell-toggle-fullscreen"),
        attribute.class("omni-header-action-btn"),
        attribute.title(case model.fullscreen {
          True -> "Exit Fullscreen"
          False -> "Toggle Fullscreen"
        }),
        attribute.attribute("aria-label", case model.fullscreen {
          True -> "Exit Fullscreen"
          False -> "Toggle Fullscreen"
        }),
        event.on_click(ToggleFullscreen),
      ],
      [icons.render_icon(fullscreen_icon, 16)],
    )

  html.div(
    [attribute.class("omni-header-actions")],
    list.flatten([action_pills, [fullscreen_btn]]),
  )
}

fn render_header_action_pill(
  app: InstalledApp,
  placement: PlacementConfig,
) -> Element(Msg) {
  let title = model.app_title(app)
  html.div([attribute.class("omni-header-action-item")], [
    html.button(
      [
        attribute.type_("button"),
        attribute.class("omni-header-action-pill"),
        attribute.title(title),
        event.on_click(OpenApp(app.id, placement.route)),
      ],
      [
        plugin_icon.render(app.icon, 14),
        html.span([attribute.class("omni-header-action-label")], [
          element.text(title),
        ]),
      ],
    ),
    viewport_host.render_slot_anchor(
      HeaderActions,
      app.id,
      placement.route,
      True,
    ),
  ])
}
