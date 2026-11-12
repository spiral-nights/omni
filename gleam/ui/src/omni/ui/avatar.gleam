//// Deterministic generated profile avatars.
////
//// Every pubkey maps to a stable palette and geometric composition so profiles
//// without a picture still get a distinctive, recognizable icon. Ported from the
//// original `getAvatarSvg` implementation to preserve visual identity across the
//// rewrite.

import gleam/int
import gleam/list
import gleam/string
import lustre/attribute.{attribute}
import lustre/element.{type Element}
import lustre/element/svg

const palettes = [
  #("#c85d3e", "#3d190e", "#ffd2c2"),
  #("#288755", "#0b2e1b", "#bcf5d4"),
  #("#356ec4", "#102347", "#cce0ff"),
  #("#85419c", "#2b1036", "#f3cbff"),
  #("#aa3148", "#3b0d17", "#ffd0d9"),
  #("#23858a", "#0a2d2f", "#bdf4f7"),
  #("#b88320", "#3d2905", "#ffe6b0"),
  #("#4d5ec2", "#161b42", "#d4dcff"),
  #("#c24965", "#3b0f1b", "#ffd2dc"),
  #("#6b8028", "#222c09", "#e4f7a8"),
  #("#8e4a7d", "#2e1227", "#f9d0ee"),
  #("#1c83a8", "#072b38", "#bceeff"),
  #("#bd5726", "#381506", "#ffd3bb"),
  #("#6a47b8", "#1e113d", "#e0d4ff"),
  #("#25846f", "#092d24", "#bcf5e6"),
  #("#a16328", "#331c07", "#fedec0"),
]

/// Deterministic 32-bit hash of a pubkey (or any stable identity string).
/// Mirrors the classic `(hash << 5) - hash + code` JavaScript recurrence.
pub fn seed(key: String) -> Int {
  string.to_utf_codepoints(key)
  |> list.fold(0, fn(hash, codepoint) {
    let shifted = int.bitwise_shift_left(hash, 5)
    let combined = shifted - hash + string.utf_codepoint_to_int(codepoint)
    signed_32(combined)
  })
  |> int.absolute_value
}

fn signed_32(value: Int) -> Int {
  let unsigned = int.bitwise_and(value, 0xFFFFFFFF)
  case unsigned >= 0x80000000 {
    True -> unsigned - 0x100000000
    False -> unsigned
  }
}

fn mod(a: Int, b: Int) -> Int {
  case int.modulo(a, b) {
    Ok(value) -> value
    Error(Nil) -> 0
  }
}

/// The palette triple (base, shadow, accent) chosen for a pubkey.
pub fn palette_for(key: String) -> #(String, String, String) {
  let index = mod(seed(key), 16)
  case palettes |> list.drop(up_to: index) |> list.first {
    Ok(palette) -> palette
    Error(Nil) -> #("#c85d3e", "#3d190e", "#ffd2c2")
  }
}

/// Renders the deterministic gradient avatar SVG for `key`, using `letter` as
/// the monogram (first character of the display name, uppercased).
pub fn render(key: String, letter: String) -> Element(msg) {
  let s = seed(key)
  let #(stop1, stop2, accent) = palette_for(key)

  let c1_x = 20 + mod(s, 60)
  let c1_y = 20 + mod(int.bitwise_shift_right(s, 4), 60)
  let c1_r = 24 + mod(int.bitwise_shift_right(s, 8), 16)
  let c1_color = case int.is_even(s) {
    True -> accent
    False -> "#ede8df"
  }
  let c1_opacity = opacity_string(240 + mod(s, 8) * 15)

  let c2_x = 100 - c1_x
  let c2_y = 100 - c1_y
  let c2_r = 20 + mod(int.bitwise_shift_right(s, 12), 20)

  let wave_y = 64 + mod(s, 10)
  let wave_control_y = 40 + mod(int.bitwise_shift_right(s, 3), 14)
  let wave_end_y = 68 + mod(int.bitwise_shift_right(s, 6), 12)

  let clean_letter = case
    string.uppercase(string.slice(string.trim(letter), 0, 1))
  {
    "" -> "?"
    first -> first
  }

  let wave_path =
    "M 0 "
    <> int.to_string(wave_y)
    <> " Q 50 "
    <> int.to_string(wave_control_y)
    <> " 100 "
    <> int.to_string(wave_end_y)
    <> " L 100 100 L 0 100 Z"

  svg.svg(
    [
      attribute("xmlns", "http://www.w3.org/2000/svg"),
      attribute("viewBox", "0 0 100 100"),
      attribute("width", "100%"),
      attribute("height", "100%"),
      attribute("role", "img"),
      attribute("aria-hidden", "true"),
      attribute("style", "display: block; border-radius: 50%;"),
      attribute("data-avatar-seed", int.to_string(s)),
    ],
    [
      svg.rect([
        attribute("width", "100"),
        attribute("height", "100"),
        attribute("rx", "50"),
        attribute("fill", stop1),
      ]),
      svg.circle([
        attribute("cx", int.to_string(c1_x)),
        attribute("cy", int.to_string(c1_y)),
        attribute("r", int.to_string(c1_r)),
        attribute("fill", c1_color),
        attribute("fill-opacity", c1_opacity),
      ]),
      svg.circle([
        attribute("cx", int.to_string(c2_x)),
        attribute("cy", int.to_string(c2_y)),
        attribute("r", int.to_string(c2_r)),
        attribute("fill", stop2),
        attribute("fill-opacity", "0.4"),
      ]),
      svg.path([
        attribute("d", wave_path),
        attribute("fill", "#141312"),
        attribute("fill-opacity", "0.3"),
      ]),
      svg.circle([
        attribute("cx", "50"),
        attribute("cy", "50"),
        attribute("r", "47.5"),
        attribute("fill", "none"),
        attribute("stroke", "#ede8df"),
        attribute("stroke-opacity", "0.25"),
        attribute("stroke-width", "1.5"),
      ]),
      svg.text(
        [
          attribute("x", "50"),
          attribute("y", "52"),
          attribute(
            "font-family",
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          ),
          attribute("font-size", "46"),
          attribute("font-weight", "900"),
          attribute("fill", "#ffffff"),
          attribute("stroke", "#141312"),
          attribute("stroke-width", "2"),
          attribute("stroke-opacity", "0.5"),
          attribute("text-anchor", "middle"),
          attribute("dominant-baseline", "central"),
          attribute("paint-order", "stroke fill"),
        ],
        clean_letter,
      ),
    ],
  )
}

/// Renders the deterministic gradient banner used behind profile headers.
pub fn banner_gradient(key: String) -> String {
  let s = seed(key)
  let #(stop1, shadow, accent) = palette_for(key)
  let angle = int.to_string(mod(s, 60) + 115)
  "linear-gradient("
  <> angle
  <> "deg, "
  <> shadow
  <> " 0%, color-mix(in srgb, "
  <> stop1
  <> " 65%, #141312) 55%, color-mix(in srgb, "
  <> accent
  <> " 30%, #1c1b18) 100%)"
}

fn opacity_string(permille: Int) -> String {
  let whole = permille / 1000
  let fraction = permille - whole * 1000
  let padded = case fraction {
    f if f < 10 -> "00" <> int.to_string(f)
    f if f < 100 -> "0" <> int.to_string(f)
    f -> int.to_string(f)
  }
  int.to_string(whole) <> "." <> padded
}
