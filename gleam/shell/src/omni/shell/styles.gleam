//// Stylesheet asset paths and inline `<link>` element helpers for Omni Shell themes.
////
//// Strictly plugin-agnostic: zero hardcoded plugin IDs.

import gleam/option.{type Option, None, Some}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html

/// Canonical stylesheet path for the shared Warm Paper Dark design tokens (`assets/styles/tokens.css`).
pub const tokens_css_path = "assets/styles/tokens.css"

/// Canonical stylesheet path for the Declarative Schema UI primitives (`assets/styles/schema.css`).
pub const schema_css_path = "assets/styles/schema.css"

/// Canonical stylesheet path shared by all shell themes for the omni-* classes
/// emitted by the Gleam shell layout/settings/app-store/widgets modules
/// (`assets/styles/shell-modules.css`).
pub const shell_modules_css_path = "assets/styles/shell-modules.css"

/// Canonical stylesheet path for the Panorama Hub shell (`assets/styles/panorama.css`).
pub const panorama_css_path = "assets/styles/panorama.css"

/// Canonical stylesheet path for the Editorial shell (`assets/styles/editorial.css`).
pub const editorial_css_path = "assets/styles/editorial.css"

/// Look up the asset path for a known stylesheet key (`"tokens"`, `"schema"`, `"panorama"`, `"editorial"`).
pub fn stylesheet_path(name: String) -> Option(String) {
  case name {
    "tokens" -> Some(tokens_css_path)
    "schema" -> Some(schema_css_path)
    "panorama" -> Some(panorama_css_path)
    "editorial" -> Some(editorial_css_path)
    _ -> None
  }
}

/// Resolve the stylesheet asset path for a shell theme ID, falling back to `editorial_css_path`.
pub fn shell_stylesheet_path(shell_id: String) -> String {
  case shell_id {
    "panorama" -> panorama_css_path
    "editorial" -> editorial_css_path
    _ -> editorial_css_path
  }
}

/// Render a `<link rel="stylesheet" href="...">` element for the given stylesheet href and DOM id.
pub fn render_stylesheet_link(id: String, href: String) -> Element(msg) {
  html.link([
    attribute.id(id),
    attribute.rel("stylesheet"),
    attribute.href(href),
  ])
}

/// Render the core stylesheet `<link>` tags (`tokens.css`, `schema.css`, the
/// shared shell module styles, and the active shell stylesheet).
pub fn render_shell_stylesheets(shell_id: String) -> List(Element(msg)) {
  [
    render_stylesheet_link("omni-styles-tokens", tokens_css_path),
    render_stylesheet_link("omni-styles-schema", schema_css_path),
    render_stylesheet_link("omni-styles-shell-modules", shell_modules_css_path),
    render_stylesheet_link(
      "omni-styles-theme-" <> shell_id,
      shell_stylesheet_path(shell_id),
    ),
  ]
}
