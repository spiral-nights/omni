//// Stable DOM island placeholder containers for plugin sandboxes.
////
//// Renders empty `<div class="omni-viewport-island omni-component-slot">`
//// anchors so Lustre's virtual DOM never destroys or reloads live `<iframe>`
//// nodes when switching pages or themes.

import gleam/option.{type Option}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import omni/protocol/viewport.{type Viewport}
import omni/shell/msg.{type Msg}

/// Compute the deterministic DOM ID for a viewport slot anchor.
pub fn slot_dom_id(vp: Viewport, plugin_id: String) -> String {
  "slot-" <> viewport.to_string(vp) <> "-" <> plugin_id
}

/// Render a stable placeholder anchor `<div>` for a plugin sandbox island.
pub fn render_slot_anchor(
  vp: Viewport,
  plugin_id: String,
  route: Option(String),
  active: Bool,
) -> Element(Msg) {
  let vp_str = viewport.to_string(vp)
  let dom_id = slot_dom_id(vp, plugin_id)
  let route_str = option.unwrap(route, "")
  let active_str = case active {
    True -> "true"
    False -> "false"
  }

  html.div(
    [
      attribute.class("omni-viewport-island omni-component-slot"),
      attribute.id(dom_id),
      attribute.attribute("data-viewport-slot", vp_str),
      attribute.attribute("data-plugin-slot", plugin_id),
      attribute.attribute("data-route", route_str),
      attribute.attribute("data-active", active_str),
    ],
    [],
  )
}
