//// Content Security Policy (CSP) and iframe sandbox attribute builder.
////
//// Enforces strict host security boundaries for sandboxed plugin iframes:
//// - Locked-down CSP blocking direct network (`connect-src 'none'`)
//// - Mandatory `allow-scripts` sandbox attribute
//// - Strict prevention of `allow-same-origin` and `allow-top-navigation`

import gleam/list
import gleam/string

/// Structured representation of CSP directives.
pub type CspDirectives {
  CspDirectives(
    default_src: List(String),
    script_src: List(String),
    connect_src: List(String),
    style_src: List(String),
    img_src: List(String),
    font_src: List(String),
  )
}

/// The canonical locked-down CSP configuration.
pub fn locked_down_directives() -> CspDirectives {
  CspDirectives(
    default_src: ["'none'"],
    script_src: ["'unsafe-inline'", "'unsafe-eval'", "blob:"],
    connect_src: ["'none'"],
    style_src: ["'unsafe-inline'"],
    img_src: ["data:", "blob:", "https:"],
    font_src: ["data:", "https:"],
  )
}

/// Format a single CSP directive key and sources.
fn format_directive(name: String, sources: List(String)) -> String {
  case sources {
    [] -> ""
    _ -> name <> " " <> string.join(sources, " ") <> ";"
  }
}

/// Build a formatted CSP header or meta tag content string from directives.
pub fn build_csp(directives: CspDirectives) -> String {
  [
    format_directive("default-src", directives.default_src),
    format_directive("script-src", directives.script_src),
    format_directive("connect-src", directives.connect_src),
    format_directive("style-src", directives.style_src),
    format_directive("img-src", directives.img_src),
    format_directive("font-src", directives.font_src),
  ]
  |> list.filter(fn(s) { s != "" })
  |> string.join(" ")
}

/// The canonical locked-down CSP string used for all plugin guest sandboxes.
pub fn locked_down_csp() -> String {
  "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; connect-src 'none'; style-src 'unsafe-inline'; img-src data: blob: https:; font-src data: https:;"
}

/// Convenience alias for `locked_down_csp()`.
pub fn default_csp() -> String {
  locked_down_csp()
}

/// Wrap a CSP string in a standard HTML `<meta>` tag for iframe document injection.
pub fn to_meta_tag(csp: String) -> String {
  "<meta http-equiv=\"Content-Security-Policy\" content=\"" <> csp <> "\">"
}

/// Convenience alias for `to_meta_tag`.
pub fn build_csp_meta_tag(csp: String) -> String {
  to_meta_tag(csp)
}

// -----------------------------------------------------------------------------
// Iframe Sandbox Attributes
// -----------------------------------------------------------------------------

/// Strict sandbox attribute string ensuring script execution without origin elevation.
pub const strict_sandbox_attr =
  "allow-scripts allow-forms allow-modals allow-popups allow-downloads"

/// Standard iframe permissions allow attribute.
pub const default_allow_attr = "clipboard-read; clipboard-write;"

/// Permitted iframe sandbox permission flags.
pub type SandboxFlags {
  SandboxFlags(
    allow_scripts: Bool,
    allow_forms: Bool,
    allow_modals: Bool,
    allow_popups: Bool,
    allow_downloads: Bool,
  )
}

/// Default standard sandbox flags for interactive plugin iframes.
pub fn default_sandbox_flags() -> SandboxFlags {
  SandboxFlags(
    allow_scripts: True,
    allow_forms: True,
    allow_modals: True,
    allow_popups: True,
    allow_downloads: True,
  )
}

/// Minimal sandbox flags with only script execution enabled.
pub fn minimal_sandbox_flags() -> SandboxFlags {
  SandboxFlags(
    allow_scripts: True,
    allow_forms: False,
    allow_modals: False,
    allow_popups: False,
    allow_downloads: False,
  )
}

/// Build the space-separated `sandbox` attribute value string.
pub fn build_sandbox_attributes(flags: SandboxFlags) -> String {
  let attrs = []
  let attrs = case flags.allow_scripts {
    True -> ["allow-scripts", ..attrs]
    False -> attrs
  }
  let attrs = case flags.allow_forms {
    True -> ["allow-forms", ..attrs]
    False -> attrs
  }
  let attrs = case flags.allow_modals {
    True -> ["allow-modals", ..attrs]
    False -> attrs
  }
  let attrs = case flags.allow_popups {
    True -> ["allow-popups", ..attrs]
    False -> attrs
  }
  let attrs = case flags.allow_downloads {
    True -> ["allow-downloads", ..attrs]
    False -> attrs
  }
  list.reverse(attrs) |> string.join(" ")
}

// -----------------------------------------------------------------------------
// Security Verification & Validation
// -----------------------------------------------------------------------------

/// Validate that a sandbox attribute string satisfies security requirements:
/// - Must contain `allow-scripts`
/// - Must NEVER contain `allow-same-origin` (would collapse origin isolation)
/// - Must NEVER contain `allow-top-navigation` (prevents host frame hijacking)
pub fn validate_sandbox_attributes(
  attributes: String,
) -> Result(String, String) {
  let tokens =
    attributes
    |> string.split(" ")
    |> list.map(string.trim)
    |> list.filter(fn(s) { s != "" })

  let has_scripts = list.contains(tokens, "allow-scripts")
  let has_same_origin = list.contains(tokens, "allow-same-origin")
  let has_top_nav =
    list.any(tokens, fn(token) {
      string.starts_with(token, "allow-top-navigation")
    })

  case has_same_origin {
    True ->
      Error("Forbidden sandbox attribute: 'allow-same-origin' is not permitted")
    False ->
      case has_top_nav {
        True ->
          Error(
            "Forbidden sandbox attribute: 'allow-top-navigation' is not permitted",
          )
        False ->
          case has_scripts {
            False ->
              Error(
                "Missing required sandbox attribute: 'allow-scripts' is required",
              )
            True -> Ok(attributes)
          }
      }
  }
}

/// Returns True if the sandbox attributes string is safe according to security rules.
pub fn is_safe_sandbox_attributes(attributes: String) -> Bool {
  case validate_sandbox_attributes(attributes) {
    Ok(_) -> True
    Error(_) -> False
  }
}

/// Validate that a CSP string enforces network isolation (`connect-src 'none'`).
pub fn validate_csp(csp: String) -> Result(String, String) {
  let normalized = string.lowercase(csp)
  case string.contains(normalized, "connect-src 'none'") {
    True -> Ok(csp)
    False ->
      Error("CSP must enforce network isolation with \"connect-src 'none'\"")
  }
}

/// Returns True if the CSP string enforces `connect-src 'none'`.
pub fn is_safe_csp(csp: String) -> Bool {
  case validate_csp(csp) {
    Ok(_) -> True
    Error(_) -> False
  }
}
