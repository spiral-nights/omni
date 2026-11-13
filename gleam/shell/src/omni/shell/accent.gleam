//// Accent color derivation for shells, settings, and sandboxed guests.
////
//// A single user-chosen accent hex expands into the full interactive bundle:
//// primary, hover, contrast ink, focus ring, and status tint.

import gleam/float
import gleam/int
import gleam/list
import gleam/string

/// Fallback accent used when a stored value cannot be parsed.
pub const default_accent = "#d4a373"

/// The derived accent bundle as `(token name, value)` pairs.
pub fn tokens(hex: String) -> List(#(String, String)) {
  let #(red, green, blue) = parse_hex(hex)
  let luminance =
    weighted(red, 0.299) +. weighted(green, 0.587) +. weighted(blue, 0.114)
  let hover = case luminance >. 0.62 {
    True -> mix(red, green, blue, 0, 0, 0, 0.18)
    False -> mix(red, green, blue, 255, 255, 255, 0.12)
  }
  let contrast = case luminance >. 0.58 {
    True -> "#141312"
    False -> "#fffaf2"
  }
  [
    #("--omni-accent-primary", to_hex(red, green, blue)),
    #("--omni-accent-hover", to_hex(hover.0, hover.1, hover.2)),
    #("--omni-accent-focus", to_hex(hover.0, hover.1, hover.2)),
    #("--omni-border-focus", to_hex(hover.0, hover.1, hover.2)),
    #("--omni-accent-contrast", contrast),
    #("--accent-primary", to_hex(red, green, blue)),
    #("--accent-hover", to_hex(hover.0, hover.1, hover.2)),
    #("--accent-contrast", contrast),
  ]
}

/// Render the derived bundle as a CSS declaration string for a `style` attr.
pub fn style_attribute(hex: String) -> String {
  tokens(hex)
  |> list.map(fn(pair) { pair.0 <> ":" <> pair.1 })
  |> string.join(";")
}

/// Resolve an accent for CSS: a valid `#rrggbb` value or the default.
pub fn normalize(hex: String) -> String {
  let trimmed = string.trim(hex)
  case parse_hex(trimmed) {
    #(0, 0, 0) ->
      case trimmed {
        "#000000" -> trimmed
        _ -> default_accent
      }
    #(r, g, b) -> to_hex(r, g, b)
  }
}

fn parse_hex(hex: String) -> #(Int, Int, Int) {
  let body = case string.starts_with(hex, "#") {
    True -> string.drop_start(hex, 1)
    False -> hex
  }
  case string.length(body) {
    6 -> #(channel(body, 0), channel(body, 2), channel(body, 4))
    3 -> #(
      channel(body <> string.slice(body, 0, 1), 0),
      channel(body <> string.slice(body, 1, 1), 2),
      channel(body <> string.slice(body, 2, 1), 4),
    )
    _ -> #(0xd4, 0xa3, 0x73)
  }
}

fn channel(raw: String, offset: Int) -> Int {
  let high = hex_digit(string.slice(raw, offset, 1))
  let low = hex_digit(string.slice(raw, offset + 1, 1))
  int.clamp(high * 16 + low, 0, 255)
}

fn hex_digit(char: String) -> Int {
  case string.lowercase(char) {
    "0" -> 0
    "1" -> 1
    "2" -> 2
    "3" -> 3
    "4" -> 4
    "5" -> 5
    "6" -> 6
    "7" -> 7
    "8" -> 8
    "9" -> 9
    "a" -> 10
    "b" -> 11
    "c" -> 12
    "d" -> 13
    "e" -> 14
    "f" -> 15
    _ -> 0
  }
}

fn int_to_float(value: Int) -> Float {
  int.to_float(value)
}

fn weighted(value: Int, weight: Float) -> Float {
  int_to_float(value) *. weight /. 255.0
}

fn mix(
  red: Int,
  green: Int,
  blue: Int,
  target_red: Int,
  target_green: Int,
  target_blue: Int,
  amount: Float,
) -> #(Int, Int, Int) {
  let keep = 1.0 -. amount
  let blend = fn(from: Int, to: Int) {
    float.round(int_to_float(from) *. keep +. int_to_float(to) *. amount)
  }
  #(
    blend(red, target_red),
    blend(green, target_green),
    blend(blue, target_blue),
  )
}

fn to_hex(red: Int, green: Int, blue: Int) -> String {
  "#" <> pad(red) <> pad(green) <> pad(blue)
}

fn pad(value: Int) -> String {
  let raw = string.lowercase(int.to_base16(int.clamp(value, 0, 255)))
  case string.length(raw) {
    1 -> "0" <> raw
    _ -> raw
  }
}
