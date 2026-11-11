//// Typed `--omni-*` CSS custom property constants and helper functions for the
//// "Warm Paper Dark" design system.
////
//// Provides canonical CSS variable names, default palette values, and helpers
//// to convert `omni/protocol/schema/style.{type SizeToken, type Style}` into
//// Lustre `attribute.Attribute(msg)` or CSS class names.

import gleam/dict.{type Dict}
import gleam/list
import gleam/string
import lustre/attribute.{type Attribute}
import omni/protocol/schema/style.{
  type ColorToken, type SizeToken, type Style, SizeLg, SizeMd, SizeNone, SizeSm,
  SizeXl, SizeXs, StyleMap, StyleProps, StyleRaw,
}

// -----------------------------------------------------------------------------
// Background Tokens
// -----------------------------------------------------------------------------

pub const bg_canvas = "--omni-bg-canvas"

pub const bg_surface = "--omni-bg-surface"

pub const bg_elevated = "--omni-bg-elevated"

pub const bg_subtle = "--omni-bg-subtle"

// -----------------------------------------------------------------------------
// Text Tokens
// -----------------------------------------------------------------------------

pub const text_primary = "--omni-text-primary"

pub const text_secondary = "--omni-text-secondary"

pub const text_muted = "--omni-text-muted"

// -----------------------------------------------------------------------------
// Accent & Semantic Tokens
// -----------------------------------------------------------------------------

pub const accent_primary = "--omni-accent-primary"

pub const accent_hover = "--omni-accent-hover"

pub const accent_contrast = "--omni-accent-contrast"

pub const success = "--omni-success"

pub const warning = "--omni-warning"

pub const error = "--omni-error"

pub const border_subtle = "--omni-border-subtle"

pub const border_default = "--omni-border-default"

pub const border_strong = "--omni-border-strong"

pub const border_focus = "--omni-border-focus"

// -----------------------------------------------------------------------------
// Typography & Spacing Tokens
// -----------------------------------------------------------------------------

pub const font_sans = "--omni-font-sans"

pub const font_mono = "--omni-font-mono"

pub const font_serif = "--omni-font-serif"

pub const space_xs = "--omni-space-xs"

pub const space_sm = "--omni-space-sm"

pub const space_md = "--omni-space-md"

pub const space_lg = "--omni-space-lg"

pub const space_xl = "--omni-space-xl"

pub const radius_sm = "--omni-radius-sm"

pub const radius_md = "--omni-radius-md"

pub const radius_lg = "--omni-radius-lg"

pub const radius_pill = "--omni-radius-pill"

// -----------------------------------------------------------------------------
// Default Token Values ("Warm Paper Dark")
// -----------------------------------------------------------------------------

/// Returns the ordered list of canonical default `--omni-*` token pairs for the
/// "Warm Paper Dark" design system.
pub fn default_tokens_list() -> List(#(String, String)) {
  [
    #(bg_canvas, "#141312"),
    #(bg_surface, "#191816"),
    #(bg_elevated, "#22201d"),
    #(bg_subtle, "#292623"),
    #(text_primary, "#ede8df"),
    #(text_secondary, "#9e988f"),
    #(text_muted, "#6b665f"),
    #(accent_primary, "#d4a373"),
    #(accent_hover, "#deb489"),
    #(accent_contrast, "#141312"),
    #(success, "#98c379"),
    #(warning, "#e5c07b"),
    #(error, "#e06c75"),
    #(border_subtle, "#272522"),
    #(border_default, "#302d29"),
    #(border_strong, "#383530"),
    #(border_focus, "#d4a373"),
    #(
      font_sans,
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    ),
    #(
      font_mono,
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    ),
    #(font_serif, "'Newsreader', 'Charter', 'Georgia', serif"),
    #(space_xs, "0.25rem"),
    #(space_sm, "0.5rem"),
    #(space_md, "1rem"),
    #(space_lg, "1.5rem"),
    #(space_xl, "2rem"),
    #(radius_sm, "6px"),
    #(radius_md, "10px"),
    #(radius_lg, "14px"),
    #(radius_pill, "9999px"),
  ]
}

/// Returns the canonical default hex/font/spacing values map for the
/// "Warm Paper Dark" design system.
pub fn default_tokens_map() -> Dict(String, String) {
  dict.from_list(default_tokens_list())
}

/// Wraps a CSS variable name (e.g. `"--omni-bg-canvas"`) in `var(...)`.
pub fn css_var(token_name: String) -> String {
  "var(" <> token_name <> ")"
}

/// Wraps a CSS variable name in `var(..., fallback)`.
pub fn css_var_with_fallback(token_name: String, fallback: String) -> String {
  "var(" <> token_name <> ", " <> fallback <> ")"
}

// -----------------------------------------------------------------------------
// Schema Style & SizeToken Conversion Helpers
// -----------------------------------------------------------------------------

/// Converts a `SizeToken` into its corresponding `--omni-space-*` CSS variable
/// reference (or `"0"` for `SizeNone`).
pub fn size_token_to_space_var(size: SizeToken) -> String {
  case size {
    SizeNone -> "0"
    SizeXs -> css_var_with_fallback(space_xs, "0.25rem")
    SizeSm -> css_var_with_fallback(space_sm, "0.5rem")
    SizeMd -> css_var_with_fallback(space_md, "1rem")
    SizeLg -> css_var_with_fallback(space_lg, "1.5rem")
    SizeXl -> css_var_with_fallback(space_xl, "2rem")
  }
}

/// Converts a `SizeToken` into a semantic modifier class suffix (e.g. `"omni-size-md"`).
pub fn size_token_to_class(prefix: String, size: SizeToken) -> String {
  prefix <> "-" <> style.size_to_string(size)
}

/// Converts a `SizeToken` into a Lustre `class` attribute with the given prefix.
pub fn size_token_to_attribute(
  prefix: String,
  size: SizeToken,
) -> Attribute(msg) {
  attribute.class(size_token_to_class(prefix, size))
}

/// Converts a `ColorToken` into a CSS `color` Lustre attribute.
pub fn color_token_to_attribute(color: ColorToken) -> Attribute(msg) {
  attribute.style("color", style.color_to_var(color))
}

/// Converts a `ColorToken` into a CSS `background` Lustre attribute.
pub fn background_token_to_attribute(color: ColorToken) -> Attribute(msg) {
  attribute.style("background", style.color_to_var(color))
}

/// Converts an `omni/protocol/schema/style.Style` into a Lustre `Attribute(msg)`.
pub fn style_to_attribute(s: Style) -> Attribute(msg) {
  case s {
    StyleProps([]) -> attribute.none()
    StyleProps(props) ->
      props
      |> list.map(style.property_to_pair)
      |> attribute.styles
    StyleMap(map) ->
      case dict.size(map) {
        0 -> attribute.none()
        _ -> attribute.styles(dict.to_list(map))
      }
    StyleRaw(raw) -> {
      let trimmed = string.trim(raw)
      case trimmed {
        "" -> attribute.none()
        _ -> attribute.attribute("style", trimmed)
      }
    }
  }
}
