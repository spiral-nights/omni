//// Renders a plugin-supplied icon from any supported channel.
////
//// Manifests may provide a canonical icon name, an inline SVG, or an image
//// URL/data URI. Inline SVG becomes a data-URI image so scripts never run;
//// other glyphs fall back to the icon library so the UI stays monochrome.

import gleam/bit_array
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import omni/ui/icons
import omni/ui/sanitize

/// Render a plugin icon at `size` pixels.
pub fn render(icon: String, size: Int) -> Element(msg) {
  let trimmed = string.trim(icon)
  case inline_svg(trimmed) {
    Some(markup) -> render_svg(markup, size)
    None ->
      case image_source(trimmed) {
        Some(url) ->
          html.img([
            attribute.class("omni-plugin-icon omni-plugin-icon-img"),
            attribute.src(url),
            attribute.alt(""),
            attribute.attribute("aria-hidden", "true"),
            attribute.width(size),
            attribute.height(size),
          ])
        None -> icons.render_icon(alias(trimmed), size)
      }
  }
}

/// Map legacy shorthand names onto the canonical icon set.
pub fn alias(icon: String) -> String {
  case string.lowercase(icon) {
    "rss" -> "feed"
    "star" | "sparkle" | "sparkles" -> "sparkle"
    "profile" -> "user"
    "relay" -> "relays"
    "apps" | "windows" -> "apps"
    "" -> "apps"
    name -> name
  }
}

fn inline_svg(icon: String) -> Option(String) {
  case
    string.starts_with(string.lowercase(icon), "<svg")
    || string.starts_with(string.lowercase(icon), "<?xml")
  {
    True -> {
      // Render as an image so embedded scripts never execute.
      let encoded = bit_array.from_string(icon) |> bit_array.base64_encode(True)
      Some("data:image/svg+xml;base64," <> encoded)
    }
    False -> None
  }
}

fn image_source(icon: String) -> Option(String) {
  case
    string.starts_with(icon, "data:image/")
    || string.starts_with(icon, "http://")
    || string.starts_with(icon, "https://")
    || string.starts_with(icon, "/")
  {
    True -> sanitize.sanitize_url(icon)
    False -> None
  }
}

fn render_svg(data_uri: String, size: Int) -> Element(msg) {
  html.img([
    attribute.class("omni-plugin-icon omni-plugin-icon-svg"),
    attribute.src(data_uri),
    attribute.alt(""),
    attribute.attribute("aria-hidden", "true"),
    attribute.width(size),
    attribute.height(size),
  ])
}

/// Names that should be treated as icon names even when they contain spaces.
pub fn is_icon_name(icon: String) -> Bool {
  list.contains(icons.icon_names(), alias(icon))
}
