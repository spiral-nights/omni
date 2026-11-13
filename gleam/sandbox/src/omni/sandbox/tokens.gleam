//// Design token injection for sandboxed plugin iframes and components.
////
//// Maps the Omni palette tokens into a standard HTML `<style id="omni-design-tokens">`
//// stylesheet block scoped to `:root`, ensuring visual consistency between host
//// and guest interfaces.

import gleam/dict.{type Dict}
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string

// -----------------------------------------------------------------------------
// Canonical Token Names
// -----------------------------------------------------------------------------

pub const bg_canvas = "--omni-bg-canvas"

pub const bg_surface = "--omni-bg-surface"

pub const bg_elevated = "--omni-bg-elevated"

pub const text_primary = "--omni-text-primary"

pub const text_secondary = "--omni-text-secondary"

pub const text_muted = "--omni-text-muted"

pub const border_subtle = "--omni-border-subtle"

pub const border_strong = "--omni-border-strong"

pub const accent_primary = "--omni-accent-primary"

pub const radius_sm = "--omni-radius-sm"

pub const radius_md = "--omni-radius-md"

pub const font_sans = "--omni-font-sans"

pub const font_mono = "--omni-font-mono"

// -----------------------------------------------------------------------------
// Default Token Values
// -----------------------------------------------------------------------------

/// The standard Warm Paper Dark / e-ink palette tokens.
pub fn default_tokens() -> List(#(String, String)) {
  [
    #(bg_canvas, "#141312"),
    #(bg_surface, "#191816"),
    #(bg_elevated, "#22201d"),
    #(text_primary, "#ede8df"),
    #(text_secondary, "#9e988f"),
    #(text_muted, "#6b665f"),
    #(border_subtle, "#272522"),
    #(border_strong, "#383530"),
    #(accent_primary, "#d4a373"),
    #(radius_sm, "6px"),
    #(radius_md, "10px"),
    #(
      font_sans,
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    ),
    #(
      font_mono,
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    ),
  ]
}

/// Warm Paper Light palette used when the guest follows light appearance.
pub fn light_tokens() -> List(#(String, String)) {
  [
    #(bg_canvas, "#f3efe6"),
    #(bg_surface, "#faf7f0"),
    #(bg_elevated, "#ffffff"),
    #(text_primary, "#24221e"),
    #(text_secondary, "#5f5a52"),
    #(text_muted, "#8a847a"),
    #(border_subtle, "#e2dccf"),
    #(border_strong, "#cfc7b8"),
    #(accent_primary, "#a9743f"),
    #(radius_sm, "6px"),
    #(radius_md, "10px"),
    #(
      font_sans,
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    ),
    #(
      font_mono,
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    ),
  ]
}

// -----------------------------------------------------------------------------
// Stylesheet Generation
// -----------------------------------------------------------------------------

/// Formats a list of token pairs into CSS variable declarations.
pub fn to_css_rules(tokens: List(#(String, String))) -> String {
  tokens
  |> list.map(fn(pair) { "  " <> pair.0 <> ": " <> pair.1 <> ";" })
  |> string.join("\n")
}

/// Builds an HTML `<style id="omni-design-tokens">` tag injecting tokens into `:root`.
pub fn build_token_style_tag(tokens: List(#(String, String))) -> String {
  let rules = to_css_rules(tokens)
  "<style id=\"omni-design-tokens\">\n:root {\n" <> rules <> "\n}\n</style>"
}

/// Builds an HTML token style tag from an optional dictionary of token overrides.
pub fn build_token_style_tag_from_dict(
  custom_tokens: Dict(String, String),
) -> String {
  let merged = merge_tokens(default_tokens(), dict.to_list(custom_tokens))
  build_token_style_tag(merged)
}

/// Builds an HTML token style tag from an optional dictionary of token overrides.
pub fn build_token_style_tag_from_option_dict(
  custom_tokens: Option(Dict(String, String)),
) -> String {
  case custom_tokens {
    Some(d) -> build_token_style_tag_from_dict(d)
    None -> default_token_style_tag()
  }
}

/// Builds the default HTML token style tag for iframe injection.
pub fn default_token_style_tag() -> String {
  build_token_style_tag(default_tokens())
}

/// Inject light or system-following appearance tokens into a guest document.
///
/// `mode` is `"light"`, `"system"`, or `"dark"` (no override for dark).
pub fn theme_mode_style_tag(
  mode: String,
  overrides: List(#(String, String)),
) -> String {
  let rules =
    merge_tokens(light_tokens(), overrides)
    |> to_css_rules
  case mode {
    "light" ->
      "<style id=\"omni-theme-mode\">\n:root {\n" <> rules <> "\n}\n</style>"
    "system" ->
      "<style id=\"omni-theme-mode\">\n@media (prefers-color-scheme: light) {\n:root {\n"
      <> rules
      <> "\n}\n}\n</style>"
    _ -> ""
  }
}

// -----------------------------------------------------------------------------
// Helpers & Dict Conversion
// -----------------------------------------------------------------------------

/// Merge base tokens with overrides. Keys in `overrides` replace keys in `base`.
pub fn merge_tokens(
  base: List(#(String, String)),
  overrides: List(#(String, String)),
) -> List(#(String, String)) {
  let override_dict = dict.from_list(overrides)
  let updated_base =
    list.map(base, fn(pair) {
      case dict.get(override_dict, pair.0) {
        Ok(new_val) -> #(pair.0, new_val)
        Error(Nil) -> pair
      }
    })
  let base_keys = list.map(base, fn(p) { p.0 })
  let extra_overrides =
    list.filter(overrides, fn(pair) { !list.contains(base_keys, pair.0) })
  list.append(updated_base, extra_overrides)
}

/// Convert a key-value dictionary to a token list.
pub fn from_dict(d: Dict(String, String)) -> List(#(String, String)) {
  dict.to_list(d)
}

/// Convert a token list to a dictionary.
pub fn to_dict(tokens: List(#(String, String))) -> Dict(String, String) {
  dict.from_list(tokens)
}
