//// Pure Windowed Virtual List Calculation & Renderer (`VirtualList`).
////
//// Computes visible item slices and top/bottom spacer heights from scroll
//// offset and viewport dimensions without any DOM or FFI dependencies.

import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import lustre/attribute.{type Attribute}
import lustre/element.{type Element}
import lustre/element/html
import omni/protocol/schema/action.{type Action}
import omni/protocol/schema/node.{type Node}

/// Computed window slice and spacer dimensions for a virtualized list.
pub type Window {
  Window(
    start_index: Int,
    end_index: Int,
    top_spacer_px: Int,
    bottom_spacer_px: Int,
    visible_items: List(Node),
  )
}

/// Computes the visible window of `items` given `item_height`, `overscan`,
/// `scroll_top`, and `viewport_height`.
pub fn compute_window(
  items: List(Node),
  item_height: Int,
  overscan: Int,
  scroll_top: Int,
  viewport_height: Int,
) -> Window {
  let total = list.length(items)
  case total == 0 {
    True ->
      Window(
        start_index: 0,
        end_index: 0,
        top_spacer_px: 0,
        bottom_spacer_px: 0,
        visible_items: [],
      )
    False -> {
      let safe_item_h = int.max(1, item_height)
      let safe_overscan = int.max(0, overscan)
      let safe_scroll = int.max(0, scroll_top)
      let safe_vp = int.max(1, viewport_height)

      let raw_start = safe_scroll / safe_item_h - safe_overscan
      let start_idx = int.clamp(raw_start, min: 0, max: total - 1)

      let visible_count =
        { safe_vp + safe_item_h - 1 } / safe_item_h + safe_overscan * 2
      let raw_end = start_idx + visible_count
      let end_idx = int.clamp(raw_end, min: start_idx, max: total)

      let slice_len = int.max(0, end_idx - start_idx)
      let visible =
        items
        |> list.drop(start_idx)
        |> list.take(slice_len)

      let top_px = start_idx * safe_item_h
      let bottom_px = int.max(0, { total - end_idx } * safe_item_h)

      Window(
        start_index: start_idx,
        end_index: end_idx,
        top_spacer_px: top_px,
        bottom_spacer_px: bottom_px,
        visible_items: visible,
      )
    }
  }
}

/// Renders a `VirtualList` primitive using a computed window (defaults to
/// `scroll_top = 0` and `viewport_height = 800` for static initial render).
pub fn render_virtual_list(
  base_attrs: List(Attribute(Action)),
  items: List(Node),
  item_height: Option(Int),
  overscan: Option(Int),
  max_height: Option(String),
  render_node: fn(Node) -> Element(Action),
) -> Element(Action) {
  let item_h = option.unwrap(item_height, 72)
  let over = option.unwrap(overscan, 4)

  render_virtual_list_at(
    base_attrs,
    items,
    item_h,
    over,
    max_height,
    0,
    800,
    render_node,
  )
}

/// Renders a `VirtualList` primitive at a specific `scroll_top` and `viewport_height`.
pub fn render_virtual_list_at(
  base_attrs: List(Attribute(Action)),
  items: List(Node),
  item_height: Int,
  overscan: Int,
  max_height: Option(String),
  scroll_top: Int,
  viewport_height: Int,
  render_node: fn(Node) -> Element(Action),
) -> Element(Action) {
  let win =
    compute_window(items, item_height, overscan, scroll_top, viewport_height)

  let class_attr = attribute.class("omni-virtual-list")
  let data_attrs =
    list.flatten([
      [
        attribute.role("list"),
        attribute.attribute("data-item-height", int.to_string(item_height)),
        attribute.attribute("data-overscan", int.to_string(overscan)),
        attribute.attribute(
          "data-total-items",
          int.to_string(list.length(items)),
        ),
        attribute.attribute("data-start-index", int.to_string(win.start_index)),
        attribute.attribute("data-end-index", int.to_string(win.end_index)),
      ],
      case max_height {
        Some(mh) -> [attribute.style("max-height", mh)]
        None -> []
      },
    ])

  let top_spacer =
    html.div(
      [
        attribute.class("omni-virtual-list-spacer-top"),
        attribute.style("height", int.to_string(win.top_spacer_px) <> "px"),
      ],
      [],
    )

  let viewport_el =
    html.div(
      [attribute.class("omni-virtual-list-viewport")],
      list.map(win.visible_items, render_node),
    )

  let bottom_spacer =
    html.div(
      [
        attribute.class("omni-virtual-list-spacer-bottom"),
        attribute.style("height", int.to_string(win.bottom_spacer_px) <> "px"),
      ],
      [],
    )

  let attrs = list.flatten([[class_attr], base_attrs, data_attrs])
  html.div(attrs, [top_spacer, viewport_el, bottom_spacer])
}
