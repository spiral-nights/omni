//// Typed styles and design tokens for Omni Server-Driven UI components.
////
//// Adheres to the Omni "Warm Paper Dark" design system and prevents brittle
//// raw string concatenation where structured tokens are appropriate.

import gleam/dict.{type Dict}
import gleam/dynamic/decode
import gleam/float
import gleam/int
import gleam/json
import gleam/list
import gleam/string

/// Standard spacing and sizing tokens.
pub type SizeToken {
  SizeNone
  SizeXs
  SizeSm
  SizeMd
  SizeLg
  SizeXl
}

/// Convert a `SizeToken` to its wire token string representation.
pub fn size_to_string(size: SizeToken) -> String {
  case size {
    SizeNone -> "none"
    SizeXs -> "xs"
    SizeSm -> "sm"
    SizeMd -> "md"
    SizeLg -> "lg"
    SizeXl -> "xl"
  }
}

/// Parse a `SizeToken` from a string.
pub fn size_from_string(str: String) -> Result(SizeToken, Nil) {
  case str {
    "none" | "0" -> Ok(SizeNone)
    "xs" -> Ok(SizeXs)
    "sm" -> Ok(SizeSm)
    "md" -> Ok(SizeMd)
    "lg" -> Ok(SizeLg)
    "xl" -> Ok(SizeXl)
    _ -> Error(Nil)
  }
}

/// Convert a `SizeToken` to CSS rem/px spacing string.
pub fn size_to_css_value(size: SizeToken) -> String {
  case size {
    SizeNone -> "0"
    SizeXs -> "0.25rem"
    SizeSm -> "0.5rem"
    SizeMd -> "1rem"
    SizeLg -> "1.5rem"
    SizeXl -> "2rem"
  }
}

/// Omni design system color tokens.
pub type ColorToken {
  Canvas
  Surface
  Elevated
  TextPrimary
  TextSecondary
  TextMuted
  AccentPrimary
  Success
  Warning
  ColorError
  CustomColor(String)
}

/// Convert a `ColorToken` to its CSS variable representation.
pub fn color_to_var(color: ColorToken) -> String {
  case color {
    Canvas -> "var(--omni-bg-canvas)"
    Surface -> "var(--omni-bg-surface)"
    Elevated -> "var(--omni-bg-elevated)"
    TextPrimary -> "var(--omni-text-primary)"
    TextSecondary -> "var(--omni-text-secondary)"
    TextMuted -> "var(--omni-text-muted)"
    AccentPrimary -> "var(--omni-accent-primary)"
    Success -> "var(--omni-success)"
    Warning -> "var(--omni-warning)"
    ColorError -> "var(--omni-error)"
    CustomColor(c) -> c
  }
}

/// Fallback hex values for Omni warm paper dark palette.
pub fn color_to_hex(color: ColorToken) -> String {
  case color {
    Canvas -> "#141312"
    Surface -> "#191816"
    Elevated -> "#22201d"
    TextPrimary -> "#ede8df"
    TextSecondary -> "#9e988f"
    TextMuted -> "#6b665f"
    AccentPrimary -> "#d4a373"
    Success -> "#98c379"
    Warning -> "#e5c07b"
    ColorError -> "#e06c75"
    CustomColor(c) -> c
  }
}

/// Parse a `ColorToken` from a token name or CSS string.
pub fn color_from_string(str: String) -> ColorToken {
  case str {
    "canvas" | "bg-canvas" -> Canvas
    "surface" | "bg-surface" -> Surface
    "elevated" | "bg-elevated" -> Elevated
    "text-primary" | "primary" -> TextPrimary
    "text-secondary" | "secondary" -> TextSecondary
    "text-muted" | "muted" -> TextMuted
    "accent" | "accent-primary" -> AccentPrimary
    "success" -> Success
    "warning" -> Warning
    "error" -> ColorError
    other -> CustomColor(other)
  }
}

/// Sizing dimension specification.
pub type Dimension {
  Px(Int)
  Rem(Float)
  Percent(Float)
  Auto
  Full
  Fit
  CustomDimension(String)
}

/// Convert a `Dimension` into a valid CSS string value.
pub fn dimension_to_string(dim: Dimension) -> String {
  case dim {
    Px(n) -> int.to_string(n) <> "px"
    Rem(f) -> float.to_string(f) <> "rem"
    Percent(f) -> float.to_string(f) <> "%"
    Auto -> "auto"
    Full -> "100%"
    Fit -> "fit-content"
    CustomDimension(s) -> s
  }
}

/// Strongly typed CSS styling property.
pub type StyleProperty {
  Padding(SizeToken)
  PaddingX(SizeToken)
  PaddingY(SizeToken)
  Margin(SizeToken)
  MarginX(SizeToken)
  MarginY(SizeToken)
  Gap(SizeToken)
  Width(Dimension)
  Height(Dimension)
  MaxWidth(Dimension)
  MaxHeight(Dimension)
  Color(ColorToken)
  Background(ColorToken)
  BorderColor(ColorToken)
  BorderRadius(SizeToken)
  Opacity(Float)
  Display(String)
  CustomProperty(String, String)
}

/// Convert a `StyleProperty` to a `#(name, value)` pair.
pub fn property_to_pair(prop: StyleProperty) -> #(String, String) {
  case prop {
    Padding(s) -> #("padding", size_to_css_value(s))
    PaddingX(s) -> #("padding-inline", size_to_css_value(s))
    PaddingY(s) -> #("padding-block", size_to_css_value(s))
    Margin(s) -> #("margin", size_to_css_value(s))
    MarginX(s) -> #("margin-inline", size_to_css_value(s))
    MarginY(s) -> #("margin-block", size_to_css_value(s))
    Gap(s) -> #("gap", size_to_css_value(s))
    Width(d) -> #("width", dimension_to_string(d))
    Height(d) -> #("height", dimension_to_string(d))
    MaxWidth(d) -> #("max-width", dimension_to_string(d))
    MaxHeight(d) -> #("max-height", dimension_to_string(d))
    Color(c) -> #("color", color_to_var(c))
    Background(c) -> #("background", color_to_var(c))
    BorderColor(c) -> #("border-color", color_to_var(c))
    BorderRadius(s) -> #("border-radius", size_to_css_value(s))
    Opacity(f) -> #("opacity", float.to_string(f))
    Display(d) -> #("display", d)
    CustomProperty(k, v) -> #(k, v)
  }
}

/// Style declaration supporting typed properties, string maps, or raw CSS strings.
pub type Style {
  StyleProps(List(StyleProperty))
  StyleMap(Dict(String, String))
  StyleRaw(String)
}

/// Convert a `Style` into a dictionary of property-value pairs.
pub fn to_dict(style: Style) -> Dict(String, String) {
  case style {
    StyleProps(props) ->
      list.map(props, property_to_pair)
      |> dict.from_list
    StyleMap(map) -> map
    StyleRaw(raw) -> {
      string.split(raw, ";")
      |> list.filter_map(fn(part) {
        case string.split(part, ":") {
          [k, v] -> Ok(#(string.trim(k), string.trim(v)))
          _ -> Error(Nil)
        }
      })
      |> dict.from_list
    }
  }
}

/// Convert a `Style` into an inline CSS style attribute string.
pub fn to_css_string(style: Style) -> String {
  case style {
    StyleRaw(raw) -> raw
    StyleProps(props) ->
      list.map(props, fn(prop) {
        let #(k, v) = property_to_pair(prop)
        k <> ": " <> v <> ";"
      })
      |> string.join(" ")
    StyleMap(map) ->
      dict.to_list(map)
      |> list.map(fn(pair) { pair.0 <> ": " <> pair.1 <> ";" })
      |> string.join(" ")
  }
}

/// Dynamic decoder for `Style`. Accepts either a CSS string or an object of properties.
pub fn decoder() -> decode.Decoder(Style) {
  decode.one_of(decode.map(decode.string, StyleRaw), [
    decode.map(decode.dict(decode.string, decode.string), StyleMap),
  ])
}

/// Convert a `Style` to `gleam/json.Json`.
pub fn to_json(style: Style) -> json.Json {
  case style {
    StyleRaw(raw) -> json.string(raw)
    StyleMap(map) ->
      json.object(
        dict.to_list(map)
        |> list.map(fn(pair) { #(pair.0, json.string(pair.1)) }),
      )
    StyleProps(props) ->
      json.object(
        list.map(props, fn(p) {
          let #(k, v) = property_to_pair(p)
          #(k, json.string(v))
        }),
      )
  }
}
