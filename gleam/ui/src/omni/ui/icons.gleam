//// Monochrome Geometric SVG Line Icons for Omni.
////
//// Conforms strictly to Warm Paper Dark / geometric 1.75px stroke standard.
//// Zero emojis.

import gleam/int
import gleam/list
import lustre/attribute.{type Attribute, attribute}
import lustre/element.{type Element}
import lustre/element/svg

/// All canonical monochrome SVG icon names supported by the Omni design system.
pub fn icon_names() -> List(String) {
  [
    "arrow-left",
    "arrow-up",
    "arrow-down",
    "search",
    "more",
    "windows",
    "apps",
    "grid",
    "pin",
    "help-circle",
    "cloud",
    "sun",
    "weather",
    "refresh",
    "upload",
    "download",
    "feed",
    "notes",
    "file-text",
    "widgets",
    "plugins",
    "settings",
    "user",
    "profile",
    "users",
    "timer",
    "clock",
    "close",
    "x",
    "reply",
    "message",
    "like",
    "heart",
    "trash",
    "plus",
    "copy",
    "check",
    "check-circle",
    "relay",
    "relays",
    "server",
    "key",
    "bolt",
    "zap",
    "lightning",
    "layout",
    "external",
    "eye",
    "sliders",
    "move",
    "chevron-down",
    "chevron-up",
    "chevron-left",
    "chevron-right",
    "star",
    "sparkle",
    "sparkles",
    "repeat",
    "repost",
    "bell",
    "spinner",
    "loader",
  ]
}

/// Returns `True` if `name` is a known icon in the Omni icon lookup table.
pub fn has_icon(name: String) -> Bool {
  case lookup_icon_children(name) {
    Ok(_) -> True
    Error(Nil) -> False
  }
}

/// Renders an icon with the default size of 16px.
pub fn render_icon_default(name: String) -> Element(msg) {
  render_icon(name, 16)
}

/// Renders a geometric monochrome SVG line icon for the given `name` and `size`.
/// If `name` is unknown, renders a fallback geometric help-circle icon with
/// `data-icon="<name>"` and `data-icon-fallback="true"`.
pub fn render_icon(name: String, size: Int) -> Element(msg) {
  let size_str = int.to_string(size)
  let base_class = case name {
    "spinner" | "loader" -> "omni-icon omni-icon-spin"
    _ -> "omni-icon"
  }

  let base_attrs: List(Attribute(msg)) = [
    attribute("viewBox", "0 0 24 24"),
    attribute("width", size_str),
    attribute("height", size_str),
    attribute("fill", "none"),
    attribute("stroke", "currentColor"),
    attribute("stroke-width", "1.75"),
    attribute("stroke-linecap", "round"),
    attribute("stroke-linejoin", "round"),
    attribute.class(base_class),
    attribute("data-icon", name),
  ]

  case lookup_icon_children(name) {
    Ok(children) -> svg.svg(base_attrs, children)
    Error(Nil) ->
      svg.svg(
        list.append(base_attrs, [attribute("data-icon-fallback", "true")]),
        fallback_children(),
      )
  }
}

fn fallback_children() -> List(Element(msg)) {
  [
    svg.circle([
      attribute("cx", "12"),
      attribute("cy", "12"),
      attribute("r", "10"),
    ]),
    svg.path([
      attribute("d", "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"),
    ]),
    svg.line([
      attribute("x1", "12"),
      attribute("y1", "17"),
      attribute("x2", "12.01"),
      attribute("y2", "17"),
    ]),
  ]
}

fn lookup_icon_children(name: String) -> Result(List(Element(msg)), Nil) {
  case name {
    "arrow-left" ->
      Ok([
        svg.line([
          attribute("x1", "19"),
          attribute("y1", "12"),
          attribute("x2", "5"),
          attribute("y2", "12"),
        ]),
        svg.polyline([attribute("points", "12 19 5 12 12 5")]),
      ])

    "arrow-up" ->
      Ok([
        svg.line([
          attribute("x1", "12"),
          attribute("y1", "19"),
          attribute("x2", "12"),
          attribute("y2", "5"),
        ]),
        svg.polyline([attribute("points", "5 12 12 5 19 12")]),
      ])

    "arrow-down" ->
      Ok([
        svg.line([
          attribute("x1", "12"),
          attribute("y1", "5"),
          attribute("x2", "12"),
          attribute("y2", "19"),
        ]),
        svg.polyline([attribute("points", "19 12 12 19 5 12")]),
      ])

    "search" ->
      Ok([
        svg.circle([
          attribute("cx", "11"),
          attribute("cy", "11"),
          attribute("r", "8"),
        ]),
        svg.line([
          attribute("x1", "21"),
          attribute("y1", "21"),
          attribute("x2", "16.65"),
          attribute("y2", "16.65"),
        ]),
      ])

    "more" ->
      Ok([
        svg.circle([
          attribute("cx", "12"),
          attribute("cy", "12"),
          attribute("r", "1.5"),
          attribute("fill", "currentColor"),
        ]),
        svg.circle([
          attribute("cx", "19"),
          attribute("cy", "12"),
          attribute("r", "1.5"),
          attribute("fill", "currentColor"),
        ]),
        svg.circle([
          attribute("cx", "5"),
          attribute("cy", "12"),
          attribute("r", "1.5"),
          attribute("fill", "currentColor"),
        ]),
      ])

    "windows" ->
      Ok([
        svg.rect([
          attribute("x", "3"),
          attribute("y", "3"),
          attribute("width", "7"),
          attribute("height", "7"),
        ]),
        svg.rect([
          attribute("x", "14"),
          attribute("y", "3"),
          attribute("width", "7"),
          attribute("height", "7"),
        ]),
        svg.rect([
          attribute("x", "14"),
          attribute("y", "14"),
          attribute("width", "7"),
          attribute("height", "7"),
        ]),
        svg.rect([
          attribute("x", "3"),
          attribute("y", "14"),
          attribute("width", "7"),
          attribute("height", "7"),
        ]),
      ])

    "apps" | "grid" ->
      Ok([
        svg.rect([
          attribute("x", "3"),
          attribute("y", "3"),
          attribute("width", "7"),
          attribute("height", "7"),
          attribute("rx", "1.5"),
        ]),
        svg.rect([
          attribute("x", "14"),
          attribute("y", "3"),
          attribute("width", "7"),
          attribute("height", "7"),
          attribute("rx", "1.5"),
        ]),
        svg.rect([
          attribute("x", "14"),
          attribute("y", "14"),
          attribute("width", "7"),
          attribute("height", "7"),
          attribute("rx", "1.5"),
        ]),
        svg.rect([
          attribute("x", "3"),
          attribute("y", "14"),
          attribute("width", "7"),
          attribute("height", "7"),
          attribute("rx", "1.5"),
        ]),
      ])

    "pin" ->
      Ok([
        svg.line([
          attribute("x1", "12"),
          attribute("y1", "17"),
          attribute("x2", "12"),
          attribute("y2", "22"),
        ]),
        svg.path([attribute("d", "M5 17h14l-2-7V4H7v6l-2 7z")]),
      ])

    "help-circle" -> Ok(fallback_children())

    "cloud" ->
      Ok([
        svg.path([
          attribute("d", "M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"),
        ]),
      ])

    "sun" ->
      Ok([
        svg.circle([
          attribute("cx", "12"),
          attribute("cy", "12"),
          attribute("r", "4.5"),
        ]),
        svg.line([
          attribute("x1", "12"),
          attribute("y1", "2"),
          attribute("x2", "12"),
          attribute("y2", "4.5"),
        ]),
        svg.line([
          attribute("x1", "12"),
          attribute("y1", "19.5"),
          attribute("x2", "12"),
          attribute("y2", "22"),
        ]),
        svg.line([
          attribute("x1", "4.93"),
          attribute("y1", "4.93"),
          attribute("x2", "6.7"),
          attribute("y2", "6.7"),
        ]),
        svg.line([
          attribute("x1", "17.3"),
          attribute("y1", "17.3"),
          attribute("x2", "19.07"),
          attribute("y2", "19.07"),
        ]),
        svg.line([
          attribute("x1", "2"),
          attribute("y1", "12"),
          attribute("x2", "4.5"),
          attribute("y2", "12"),
        ]),
        svg.line([
          attribute("x1", "19.5"),
          attribute("y1", "12"),
          attribute("x2", "22"),
          attribute("y2", "12"),
        ]),
        svg.line([
          attribute("x1", "4.93"),
          attribute("y1", "19.07"),
          attribute("x2", "6.7"),
          attribute("y2", "17.3"),
        ]),
        svg.line([
          attribute("x1", "17.3"),
          attribute("y1", "6.7"),
          attribute("x2", "19.07"),
          attribute("y2", "4.93"),
        ]),
      ])

    "weather" ->
      Ok([
        svg.path([attribute("d", "M12 2v2")]),
        svg.path([attribute("d", "M4.93 4.93l1.41 1.41")]),
        svg.path([attribute("d", "M20 12h2")]),
        svg.path([attribute("d", "M19.07 4.93l-1.41 1.41")]),
        svg.path([attribute("d", "M15.5 8.5a4 4 0 0 0-4-4 4 4 0 0 0-3.8 2.7")]),
        svg.path([
          attribute(
            "d",
            "M7 16a4 4 0 0 1 0-8 4.2 4.2 0 0 1 3.5 1.9A5 5 0 0 1 20 13a4.5 4.5 0 0 1-4.5 4.5H7z",
          ),
        ]),
      ])

    "refresh" ->
      Ok([
        svg.polyline([attribute("points", "23 4 23 10 17 10")]),
        svg.polyline([attribute("points", "1 20 1 14 7 14")]),
        svg.path([
          attribute(
            "d",
            "M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
          ),
        ]),
      ])

    "upload" ->
      Ok([
        svg.path([
          attribute("d", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"),
        ]),
        svg.polyline([attribute("points", "17 8 12 3 7 8")]),
        svg.line([
          attribute("x1", "12"),
          attribute("y1", "3"),
          attribute("x2", "12"),
          attribute("y2", "15"),
        ]),
      ])

    "download" ->
      Ok([
        svg.path([
          attribute("d", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"),
        ]),
        svg.polyline([attribute("points", "7 10 12 15 17 10")]),
        svg.line([
          attribute("x1", "12"),
          attribute("y1", "15"),
          attribute("x2", "12"),
          attribute("y2", "3"),
        ]),
      ])

    "feed" ->
      Ok([
        svg.path([
          attribute(
            "d",
            "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
          ),
        ]),
        svg.line([
          attribute("x1", "8"),
          attribute("y1", "9"),
          attribute("x2", "16"),
          attribute("y2", "9"),
        ]),
        svg.line([
          attribute("x1", "8"),
          attribute("y1", "13"),
          attribute("x2", "13"),
          attribute("y2", "13"),
        ]),
      ])

    "notes" | "file-text" ->
      Ok([
        svg.path([
          attribute(
            "d",
            "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z",
          ),
        ]),
        svg.polyline([attribute("points", "14 2 14 8 20 8")]),
        svg.line([
          attribute("x1", "16"),
          attribute("y1", "13"),
          attribute("x2", "8"),
          attribute("y2", "13"),
        ]),
        svg.line([
          attribute("x1", "16"),
          attribute("y1", "17"),
          attribute("x2", "8"),
          attribute("y2", "17"),
        ]),
        svg.line([
          attribute("x1", "10"),
          attribute("y1", "9"),
          attribute("x2", "8"),
          attribute("y2", "9"),
        ]),
      ])

    "widgets" ->
      Ok([
        svg.rect([
          attribute("x", "3"),
          attribute("y", "3"),
          attribute("width", "18"),
          attribute("height", "7"),
          attribute("rx", "1.5"),
        ]),
        svg.line([
          attribute("x1", "7"),
          attribute("y1", "6.5"),
          attribute("x2", "13"),
          attribute("y2", "6.5"),
        ]),
        svg.rect([
          attribute("x", "3"),
          attribute("y", "13"),
          attribute("width", "8"),
          attribute("height", "8"),
          attribute("rx", "1.5"),
        ]),
        svg.rect([
          attribute("x", "13"),
          attribute("y", "13"),
          attribute("width", "8"),
          attribute("height", "8"),
          attribute("rx", "1.5"),
        ]),
      ])

    "plugins" ->
      Ok([
        svg.path([
          attribute(
            "d",
            "M14 4h4a2 2 0 0 1 2 2v4a1 1 0 0 0 1 1 2 2 0 0 1 0 4 1 1 0 0 0-1 1v4a2 2 0 0 1-2 2h-4a1 1 0 0 0-1-1 2 2 0 0 1-4 0 1 1 0 0 0-1 1H4a2 2 0 0 1-2-2v-4a1 1 0 0 0 1-1 2 2 0 0 1 0-4 1 1 0 0 0-1-1V6a2 2 0 0 1 2-2h4a1 1 0 0 0 1 1 2 2 0 0 1 4 0 1 1 0 0 0 1-1z",
          ),
        ]),
      ])

    "settings" ->
      Ok([
        svg.circle([
          attribute("cx", "12"),
          attribute("cy", "12"),
          attribute("r", "3"),
        ]),
        svg.path([
          attribute(
            "d",
            "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
          ),
        ]),
      ])

    "user" | "profile" ->
      Ok([
        svg.path([
          attribute("d", "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"),
        ]),
        svg.circle([
          attribute("cx", "12"),
          attribute("cy", "7"),
          attribute("r", "4"),
        ]),
      ])

    "users" ->
      Ok([
        svg.path([
          attribute("d", "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"),
        ]),
        svg.circle([
          attribute("cx", "9"),
          attribute("cy", "7"),
          attribute("r", "4"),
        ]),
        svg.path([attribute("d", "M23 21v-2a4 4 0 0 0-3-3.87")]),
        svg.path([attribute("d", "M16 3.13a4 4 0 0 1 0 7.75")]),
      ])

    "timer" ->
      Ok([
        svg.circle([
          attribute("cx", "12"),
          attribute("cy", "13"),
          attribute("r", "8"),
        ]),
        svg.path([attribute("d", "M12 9v4l2 2")]),
        svg.path([attribute("d", "M5 3L2 6")]),
        svg.path([attribute("d", "M22 6l-3-3")]),
        svg.path([attribute("d", "M10 2h4")]),
      ])

    "clock" ->
      Ok([
        svg.circle([
          attribute("cx", "12"),
          attribute("cy", "12"),
          attribute("r", "10"),
        ]),
        svg.polyline([attribute("points", "12 6 12 12 16 14")]),
      ])

    "close" | "x" ->
      Ok([
        svg.line([
          attribute("x1", "18"),
          attribute("y1", "6"),
          attribute("x2", "6"),
          attribute("y2", "18"),
        ]),
        svg.line([
          attribute("x1", "6"),
          attribute("y1", "6"),
          attribute("x2", "18"),
          attribute("y2", "18"),
        ]),
      ])

    "reply" ->
      Ok([
        svg.polyline([attribute("points", "9 17 4 12 9 7")]),
        svg.path([attribute("d", "M20 18v-2a4 4 0 0 0-4-4H4")]),
      ])

    "message" ->
      Ok([
        svg.path([
          attribute(
            "d",
            "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z",
          ),
        ]),
      ])

    "like" | "heart" ->
      Ok([
        svg.path([
          attribute(
            "d",
            "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z",
          ),
        ]),
      ])

    "trash" ->
      Ok([
        svg.polyline([attribute("points", "3 6 5 6 21 6")]),
        svg.path([
          attribute(
            "d",
            "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
          ),
        ]),
      ])

    "plus" ->
      Ok([
        svg.line([
          attribute("x1", "12"),
          attribute("y1", "5"),
          attribute("x2", "12"),
          attribute("y2", "19"),
        ]),
        svg.line([
          attribute("x1", "5"),
          attribute("y1", "12"),
          attribute("x2", "19"),
          attribute("y2", "12"),
        ]),
      ])

    "copy" ->
      Ok([
        svg.rect([
          attribute("x", "9"),
          attribute("y", "9"),
          attribute("width", "13"),
          attribute("height", "13"),
          attribute("rx", "2"),
          attribute("ry", "2"),
        ]),
        svg.path([
          attribute(
            "d",
            "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
          ),
        ]),
      ])

    "check" ->
      Ok([
        svg.polyline([attribute("points", "20 6 9 17 4 12")]),
      ])

    "check-circle" ->
      Ok([
        svg.path([
          attribute("d", "M22 11.08V12a10 10 0 1 1-5.93-9.14"),
        ]),
        svg.polyline([attribute("points", "22 4 12 14.01 9 11.01")]),
      ])

    "relay" | "relays" | "server" ->
      Ok([
        svg.rect([
          attribute("x", "2"),
          attribute("y", "2"),
          attribute("width", "20"),
          attribute("height", "8"),
          attribute("rx", "2"),
          attribute("ry", "2"),
        ]),
        svg.rect([
          attribute("x", "2"),
          attribute("y", "14"),
          attribute("width", "20"),
          attribute("height", "8"),
          attribute("rx", "2"),
          attribute("ry", "2"),
        ]),
        svg.line([
          attribute("x1", "6"),
          attribute("y1", "6"),
          attribute("x2", "6.01"),
          attribute("y2", "6"),
        ]),
        svg.line([
          attribute("x1", "6"),
          attribute("y1", "18"),
          attribute("x2", "6.01"),
          attribute("y2", "18"),
        ]),
      ])

    "key" ->
      Ok([
        svg.path([
          attribute(
            "d",
            "M21 2l-2 2m-1.5 1.5L14 9l-1.5-1.5-2 2 1.5 1.5-3 3-2-2-2 2 2 2-3 3a5.5 5.5 0 1 1-2-7.8l5.3-5.3A7.5 7.5 0 0 1 21 2z",
          ),
        ]),
      ])

    "bolt" | "zap" | "lightning" ->
      Ok([
        svg.polygon([
          attribute("points", "13 2 3 14 12 14 11 22 21 10 12 10 13 2"),
        ]),
      ])

    "layout" ->
      Ok([
        svg.rect([
          attribute("x", "3"),
          attribute("y", "3"),
          attribute("width", "18"),
          attribute("height", "18"),
          attribute("rx", "2"),
        ]),
        svg.line([
          attribute("x1", "3"),
          attribute("y1", "9"),
          attribute("x2", "21"),
          attribute("y2", "9"),
        ]),
        svg.line([
          attribute("x1", "9"),
          attribute("y1", "21"),
          attribute("x2", "9"),
          attribute("y2", "9"),
        ]),
      ])

    "external" ->
      Ok([
        svg.path([
          attribute(
            "d",
            "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
          ),
        ]),
        svg.polyline([attribute("points", "15 3 21 3 21 9")]),
        svg.line([
          attribute("x1", "10"),
          attribute("y1", "14"),
          attribute("x2", "21"),
          attribute("y2", "3"),
        ]),
      ])

    "eye" ->
      Ok([
        svg.path([
          attribute("d", "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"),
        ]),
        svg.circle([
          attribute("cx", "12"),
          attribute("cy", "12"),
          attribute("r", "3"),
        ]),
      ])

    "sliders" ->
      Ok([
        svg.line([
          attribute("x1", "4"),
          attribute("y1", "21"),
          attribute("x2", "4"),
          attribute("y2", "14"),
        ]),
        svg.line([
          attribute("x1", "4"),
          attribute("y1", "10"),
          attribute("x2", "4"),
          attribute("y2", "3"),
        ]),
        svg.line([
          attribute("x1", "12"),
          attribute("y1", "21"),
          attribute("x2", "12"),
          attribute("y2", "12"),
        ]),
        svg.line([
          attribute("x1", "12"),
          attribute("y1", "8"),
          attribute("x2", "12"),
          attribute("y2", "3"),
        ]),
        svg.line([
          attribute("x1", "20"),
          attribute("y1", "21"),
          attribute("x2", "20"),
          attribute("y2", "16"),
        ]),
        svg.line([
          attribute("x1", "20"),
          attribute("y1", "12"),
          attribute("x2", "20"),
          attribute("y2", "3"),
        ]),
        svg.line([
          attribute("x1", "1"),
          attribute("y1", "14"),
          attribute("x2", "7"),
          attribute("y2", "14"),
        ]),
        svg.line([
          attribute("x1", "9"),
          attribute("y1", "8"),
          attribute("x2", "15"),
          attribute("y2", "8"),
        ]),
        svg.line([
          attribute("x1", "17"),
          attribute("y1", "16"),
          attribute("x2", "23"),
          attribute("y2", "16"),
        ]),
      ])

    "move" ->
      Ok([
        svg.polyline([attribute("points", "5 9 2 12 5 15")]),
        svg.polyline([attribute("points", "9 5 12 2 15 5")]),
        svg.polyline([attribute("points", "15 19 12 22 9 19")]),
        svg.polyline([attribute("points", "19 9 22 12 19 15")]),
        svg.line([
          attribute("x1", "2"),
          attribute("y1", "12"),
          attribute("x2", "22"),
          attribute("y2", "12"),
        ]),
        svg.line([
          attribute("x1", "12"),
          attribute("y1", "2"),
          attribute("x2", "12"),
          attribute("y2", "22"),
        ]),
      ])

    "chevron-down" ->
      Ok([
        svg.polyline([attribute("points", "6 9 12 15 18 9")]),
      ])

    "chevron-up" ->
      Ok([
        svg.polyline([attribute("points", "18 15 12 9 6 15")]),
      ])

    "chevron-left" ->
      Ok([
        svg.polyline([attribute("points", "15 18 9 12 15 6")]),
      ])

    "chevron-right" ->
      Ok([
        svg.polyline([attribute("points", "9 18 15 12 9 6")]),
      ])

    "star" ->
      Ok([
        svg.polygon([
          attribute(
            "points",
            "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2",
          ),
        ]),
      ])

    "sparkle" | "sparkles" ->
      Ok([
        svg.path([
          attribute(
            "d",
            "M12 3c0 4.5 3.5 8 8 8-4.5 0-8 3.5-8 8 0-4.5-3.5-8-8-8 4.5 0 8-3.5 8-8z",
          ),
        ]),
        svg.path([
          attribute(
            "d",
            "M19 17c0 2 1.5 3.5 3.5 3.5-2 0-3.5 1.5-3.5 3.5 0-2-1.5-3.5-3.5-3.5 2 0 3.5-1.5 3.5-3.5z",
          ),
        ]),
      ])

    "repeat" | "repost" ->
      Ok([
        svg.polyline([attribute("points", "17 1 21 5 17 9")]),
        svg.path([attribute("d", "M3 11V9a4 4 0 0 1 4-4h14")]),
        svg.polyline([attribute("points", "7 23 3 19 7 15")]),
        svg.path([attribute("d", "M21 13v2a4 4 0 0 1-4 4H3")]),
      ])

    "bell" ->
      Ok([
        svg.path([
          attribute("d", "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"),
        ]),
        svg.path([attribute("d", "M13.73 21a2 2 0 0 1-3.46 0")]),
      ])

    "spinner" | "loader" ->
      Ok([
        svg.circle([
          attribute("cx", "12"),
          attribute("cy", "12"),
          attribute("r", "9"),
          attribute("stroke-opacity", "0.2"),
        ]),
        svg.path([attribute("d", "M21 12a9 9 0 0 0-9-9")]),
      ])

    _ -> Error(Nil)
  }
}
