//// Pure Gleam HTML and URL sanitization utilities for Omni UI.
////
//// Rejects XSS vectors including inline `on*` event handlers, `javascript:`,
//// `vbscript:`, `data:text/html`, `data:application/`, HTML entity-encoded
//// scheme tricks, control characters, and dangerous container tags (`<script>`,
//// `<iframe>`, `<object>`, `<embed>`, `<style>`).

import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string

/// Escapes `&`, `<`, `>`, `"`, and `'` for safe HTML text and attribute interpolation.
pub fn escape_html(raw: String) -> String {
  raw
  |> string.replace("&", "&amp;")
  |> string.replace("<", "&lt;")
  |> string.replace(">", "&gt;")
  |> string.replace("\"", "&quot;")
  |> string.replace("'", "&#39;")
}

/// Returns `True` if `raw_url` passes `sanitize_url`.
pub fn is_safe_url(raw_url: String) -> Bool {
  case sanitize_url(raw_url) {
    Some(_) -> True
    None -> False
  }
}

/// Sanitizes a URL string.
///
/// Trims whitespace, rejects control characters, HTML entities (`&#...` or `&colon;`),
/// and unsafe schemes (`javascript:`, `vbscript:`, `data:text/html`, `data:application/`),
/// and allows only safe schemes (`http:`, `https:`, `nostr:`, `lightning:`, `cashu:`,
/// `mailto:`, `blob:`, safe `data:image/` URLs) or relative paths starting with `/`, `?`, `#`.
pub fn sanitize_url(raw_url: String) -> Option(String) {
  let trimmed = string.trim(raw_url)
  case trimmed {
    "" -> None
    _ -> {
      case has_control_chars(trimmed) || has_encoded_scheme_evasion(trimmed) {
        True -> None
        False -> {
          let lower =
            trimmed
            |> strip_whitespace_and_control()
            |> string.lowercase()

          case is_allowed_url_lower(trimmed, lower) {
            True -> Some(trimmed)
            False -> None
          }
        }
      }
    }
  }
}

fn is_allowed_url_lower(original_trimmed: String, lower: String) -> Bool {
  // Reject protocol-relative URLs like `//evil.com`
  case string.starts_with(original_trimmed, "//") {
    True -> False
    False ->
      case
        string.starts_with(original_trimmed, "/")
        || string.starts_with(original_trimmed, "?")
        || string.starts_with(original_trimmed, "#")
      {
        True -> True
        False ->
          case
            string.starts_with(lower, "https://")
            || string.starts_with(lower, "http://")
            || string.starts_with(lower, "nostr:")
            || string.starts_with(lower, "lightning:")
            || string.starts_with(lower, "cashu:")
            || string.starts_with(lower, "mailto:")
            || string.starts_with(lower, "blob:")
          {
            True -> True
            False -> is_safe_data_image_url(lower)
          }
      }
  }
}

fn is_safe_data_image_url(lower: String) -> Bool {
  case
    string.starts_with(lower, "data:image/png;")
    || string.starts_with(lower, "data:image/png,")
    || string.starts_with(lower, "data:image/jpeg;")
    || string.starts_with(lower, "data:image/jpeg,")
    || string.starts_with(lower, "data:image/jpg;")
    || string.starts_with(lower, "data:image/jpg,")
    || string.starts_with(lower, "data:image/gif;")
    || string.starts_with(lower, "data:image/gif,")
    || string.starts_with(lower, "data:image/webp;")
    || string.starts_with(lower, "data:image/webp,")
    || string.starts_with(lower, "data:image/bmp;")
    || string.starts_with(lower, "data:image/bmp,")
    || string.starts_with(lower, "data:image/x-icon;")
    || string.starts_with(lower, "data:image/x-icon,")
    || string.starts_with(lower, "data:image/vnd.microsoft.icon;")
    || string.starts_with(lower, "data:image/vnd.microsoft.icon,")
  {
    True -> True
    False -> False
  }
}

fn has_control_chars(s: String) -> Bool {
  s
  |> string.to_utf_codepoints
  |> list.any(fn(cp) {
    let code = string.utf_codepoint_to_int(cp)
    code < 0x20 || code == 0x7f
  })
}

fn strip_whitespace_and_control(s: String) -> String {
  s
  |> string.to_utf_codepoints
  |> list.filter(fn(cp) {
    let code = string.utf_codepoint_to_int(cp)
    code > 0x20 && code != 0x7f
  })
  |> string.from_utf_codepoints
}

fn has_encoded_scheme_evasion(s: String) -> Bool {
  let lower = string.lowercase(s)
  // Reject HTML numeric character references or named entities before the scheme colon
  case string.split_once(lower, ":") {
    Ok(#(before_colon, _)) ->
      string.contains(before_colon, "&#")
      || string.contains(before_colon, "&colon")
      || string.contains(before_colon, "&tab")
      || string.contains(before_colon, "&newline")
      || string.contains(before_colon, "\\")
    Error(Nil) ->
      string.contains(lower, "&#")
      || string.contains(lower, "&colon")
      || string.contains(lower, "javascript")
      || string.contains(lower, "vbscript")
  }
}

/// Validates whether an HTML attribute name is safe to render.
///
/// Rejects `on*` event handler attributes (`onclick`, `onerror`, `onload`, etc.),
/// `srcdoc`, `formaction`, empty strings, and any attribute containing whitespace,
/// quotes, `=`, `<`, `>`, `/`, or control characters.
pub fn is_safe_attribute_name(name: String) -> Bool {
  let trimmed = string.trim(name)
  case trimmed == "" || trimmed != name {
    True -> False
    False -> {
      let lower = string.lowercase(trimmed)
      case
        string.starts_with(lower, "on")
        || lower == "srcdoc"
        || lower == "formaction"
        || lower == "xlink:href"
      {
        True -> False
        False -> {
          trimmed
          |> string.to_utf_codepoints
          |> list.all(is_valid_attr_name_codepoint)
        }
      }
    }
  }
}

fn is_valid_attr_name_codepoint(cp: UtfCodepoint) -> Bool {
  let code = string.utf_codepoint_to_int(cp)
  // Allow a-z, A-Z, 0-9, '-', '_'
  { code >= 97 && code <= 122 }
  || { code >= 65 && code <= 90 }
  || { code >= 48 && code <= 57 }
  || code == 45
  || code == 95
}

// -----------------------------------------------------------------------------
// HTML Tag & Attribute Sanitizer
// -----------------------------------------------------------------------------

/// Strips `<script...>...</script>`, `<iframe...>`, `<object...>`, `<embed...>`,
/// `<style...>`, inline `on*="..."` attributes, and `javascript:` / unsafe URLs
/// from an HTML string.
pub fn strip_unsafe_html(html: String) -> String {
  html
  |> strip_paired_block_tag("script")
  |> strip_paired_block_tag("style")
  |> strip_paired_block_tag("iframe")
  |> strip_paired_block_tag("object")
  |> strip_paired_block_tag("embed")
  |> sanitize_tags_in_html("")
}

/// Removes `<tag ...>...</tag>` and self-closing/unclosed `<tag ...>` occurrences
/// case-insensitively.
fn strip_paired_block_tag(input: String, tag_lower: String) -> String {
  do_strip_paired_block_tag(input, tag_lower, "")
}

fn do_strip_paired_block_tag(
  remaining: String,
  tag_lower: String,
  acc: String,
) -> String {
  case find_open_tag_ci(remaining, tag_lower) {
    None -> acc <> remaining
    Some(#(before, after_open_lt)) -> {
      // Find the closing `>` of the opening tag
      case string.split_once(after_open_lt, ">") {
        Error(Nil) -> acc <> before
        Ok(#(_, after_open_tag)) -> {
          // Look for `</tag` case-insensitively
          case find_close_tag_ci(after_open_tag, tag_lower) {
            Some(#(_, after_close_tag)) ->
              do_strip_paired_block_tag(
                after_close_tag,
                tag_lower,
                acc <> before,
              )
            None ->
              do_strip_paired_block_tag(
                after_open_tag,
                tag_lower,
                acc <> before,
              )
          }
        }
      }
    }
  }
}

fn find_open_tag_ci(s: String, tag_lower: String) -> Option(#(String, String)) {
  case string.split_once(s, "<") {
    Error(Nil) -> None
    Ok(#(before, after_lt)) -> {
      let lower_after = string.lowercase(after_lt)
      case match_tag_name_prefix(lower_after, tag_lower) {
        True -> Some(#(before, after_lt))
        False ->
          case find_open_tag_ci(after_lt, tag_lower) {
            None -> None
            Some(#(sub_before, sub_after)) ->
              Some(#(before <> "<" <> sub_before, sub_after))
          }
      }
    }
  }
}

fn find_close_tag_ci(
  s: String,
  tag_lower: String,
) -> Option(#(String, String)) {
  case string.split_once(s, "</") {
    Error(Nil) -> None
    Ok(#(before, after_close_lt)) -> {
      let lower_after = string.lowercase(after_close_lt)
      case match_tag_name_prefix(lower_after, tag_lower) {
        True ->
          case string.split_once(after_close_lt, ">") {
            Ok(#(_, rest)) -> Some(#(before, rest))
            Error(Nil) -> Some(#(before, ""))
          }
        False ->
          case find_close_tag_ci(after_close_lt, tag_lower) {
            None -> None
            Some(#(sub_before, sub_after)) ->
              Some(#(before <> "</" <> sub_before, sub_after))
          }
      }
    }
  }
}

fn match_tag_name_prefix(lower_after: String, tag_lower: String) -> Bool {
  case string.starts_with(lower_after, tag_lower) {
    False -> False
    True -> {
      let rest = string.drop_start(lower_after, string.length(tag_lower))
      case string.first(rest) {
        Error(Nil) -> True
        Ok(ch) ->
          ch == ">"
          || ch == "/"
          || ch == " "
          || ch == "\t"
          || ch == "\n"
          || ch == "\r"
      }
    }
  }
}

fn sanitize_tags_in_html(remaining: String, acc: String) -> String {
  case string.split_once(remaining, "<") {
    Error(Nil) -> acc <> remaining
    Ok(#(before, after_lt)) -> {
      case string.split_once(after_lt, ">") {
        Error(Nil) -> acc <> before
        Ok(#(tag_inner, after_gt)) -> {
          let cleaned_tag = sanitize_single_tag(tag_inner)
          sanitize_tags_in_html(after_gt, acc <> before <> cleaned_tag)
        }
      }
    }
  }
}

fn sanitize_single_tag(tag_inner: String) -> String {
  let trimmed = string.trim(tag_inner)
  case trimmed {
    "" -> ""
    _ -> {
      case string.starts_with(trimmed, "!") {
        // Drop HTML comments and declarations
        True -> ""
        False -> {
          let is_closing = string.starts_with(trimmed, "/")
          let content = case is_closing {
            True -> string.trim(string.drop_start(trimmed, 1))
            False -> trimmed
          }
          let is_self_closing = string.ends_with(content, "/")
          let content_no_slash = case is_self_closing {
            True -> string.trim(string.drop_end(content, 1))
            False -> content
          }
          let #(raw_tag_name, raw_attrs) =
            split_tag_name_and_attrs(content_no_slash)
          let tag_lower = string.lowercase(raw_tag_name)

          case is_disallowed_tag(tag_lower) {
            True -> ""
            False ->
              case is_closing {
                True -> "</" <> tag_lower <> ">"
                False -> {
                  let safe_attrs = sanitize_tag_attributes(raw_attrs)
                  let attr_suffix = case safe_attrs {
                    "" -> ""
                    _ -> " " <> safe_attrs
                  }
                  let close_bracket = case is_self_closing {
                    True -> " />"
                    False -> ">"
                  }
                  "<" <> tag_lower <> attr_suffix <> close_bracket
                }
              }
          }
        }
      }
    }
  }
}

fn is_disallowed_tag(tag_lower: String) -> Bool {
  case tag_lower {
    "script"
    | "iframe"
    | "object"
    | "embed"
    | "style"
    | "applet"
    | "meta"
    | "link"
    | "base"
    | "form" -> True
    _ -> False
  }
}

fn split_tag_name_and_attrs(s: String) -> #(String, String) {
  let cps = string.to_utf_codepoints(s)
  let #(name_cps, rest_cps) = split_at_whitespace(cps, [])
  #(
    string.from_utf_codepoints(name_cps),
    string.trim(string.from_utf_codepoints(rest_cps)),
  )
}

fn split_at_whitespace(
  cps: List(UtfCodepoint),
  acc: List(UtfCodepoint),
) -> #(List(UtfCodepoint), List(UtfCodepoint)) {
  case cps {
    [] -> #(list.reverse(acc), [])
    [cp, ..rest] -> {
      let code = string.utf_codepoint_to_int(cp)
      case code == 32 || code == 9 || code == 10 || code == 13 {
        True -> #(list.reverse(acc), rest)
        False -> split_at_whitespace(rest, [cp, ..acc])
      }
    }
  }
}

fn sanitize_tag_attributes(raw_attrs: String) -> String {
  parse_attributes(string.to_utf_codepoints(raw_attrs), [])
  |> list.filter_map(fn(pair) {
    let #(name, val) = pair
    let lower_name = string.lowercase(name)
    case is_safe_attribute_name(lower_name) {
      False -> Error(Nil)
      True ->
        case lower_name {
          "href"
          | "src"
          | "action"
          | "Cite"
          | "cite"
          | "poster"
          | "background" ->
            case sanitize_url(val) {
              Some(safe_url) ->
                Ok(lower_name <> "=\"" <> escape_html(safe_url) <> "\"")
              None -> Error(Nil)
            }
          "style" ->
            case is_safe_inline_style(val) {
              True -> Ok("style=\"" <> escape_html(val) <> "\"")
              False -> Error(Nil)
            }
          _ -> {
            let lower_val =
              val
              |> strip_whitespace_and_control()
              |> string.lowercase()
            case
              string.contains(lower_val, "javascript:")
              || string.contains(lower_val, "vbscript:")
              || string.contains(lower_val, "data:text/html")
            {
              True -> Error(Nil)
              False -> Ok(lower_name <> "=\"" <> escape_html(val) <> "\"")
            }
          }
        }
    }
  })
  |> string.join(" ")
}

fn is_safe_inline_style(style_val: String) -> Bool {
  let lower =
    style_val
    |> strip_whitespace_and_control()
    |> string.lowercase()
  !string.contains(lower, "expression(")
  && !string.contains(lower, "javascript:")
  && !string.contains(lower, "vbscript:")
  && !string.contains(lower, "url(")
  && !string.contains(lower, "-moz-binding")
  && !string.contains(lower, "behavior:")
}

fn parse_attributes(
  cps: List(UtfCodepoint),
  acc: List(#(String, String)),
) -> List(#(String, String)) {
  let cps = skip_ws(cps)
  case cps {
    [] -> list.reverse(acc)
    _ -> {
      let #(name_cps, after_name) = read_attr_name(cps, [])
      let name = string.from_utf_codepoints(name_cps)
      let after_name_ws = skip_ws(after_name)
      case after_name_ws {
        [] ->
          case name {
            "" -> list.reverse(acc)
            _ -> list.reverse([#(name, ""), ..acc])
          }
        [cp, ..rest] -> {
          let code = string.utf_codepoint_to_int(cp)
          // '=' is 61
          case code == 61 {
            True -> {
              let after_eq = skip_ws(rest)
              let #(val, after_val) = read_attr_value(after_eq)
              case name {
                "" -> parse_attributes(after_val, acc)
                _ -> parse_attributes(after_val, [#(name, val), ..acc])
              }
            }
            False ->
              case name {
                "" ->
                  // Skip unexpected character to avoid infinite loop
                  parse_attributes(rest, acc)
                _ -> parse_attributes(after_name_ws, [#(name, ""), ..acc])
              }
          }
        }
      }
    }
  }
}

fn skip_ws(cps: List(UtfCodepoint)) -> List(UtfCodepoint) {
  case cps {
    [cp, ..rest] -> {
      let code = string.utf_codepoint_to_int(cp)
      case code <= 32 {
        True -> skip_ws(rest)
        False -> cps
      }
    }
    [] -> []
  }
}

fn read_attr_name(
  cps: List(UtfCodepoint),
  acc: List(UtfCodepoint),
) -> #(List(UtfCodepoint), List(UtfCodepoint)) {
  case cps {
    [] -> #(list.reverse(acc), [])
    [cp, ..rest] -> {
      let code = string.utf_codepoint_to_int(cp)
      // Stop on whitespace (<= 32), '=' (61), '"' (34), '\'' (39), '/' (47)
      case code <= 32 || code == 61 || code == 34 || code == 39 || code == 47 {
        True -> #(list.reverse(acc), cps)
        False -> read_attr_name(rest, [cp, ..acc])
      }
    }
  }
}

fn read_attr_value(cps: List(UtfCodepoint)) -> #(String, List(UtfCodepoint)) {
  case cps {
    [] -> #("", [])
    [cp, ..rest] -> {
      let code = string.utf_codepoint_to_int(cp)
      case code {
        // '"' double quote (34) or '\'' single quote (39)
        34 | 39 -> read_quoted_value(rest, code, [])
        _ -> read_unquoted_value(cps, [])
      }
    }
  }
}

fn read_quoted_value(
  cps: List(UtfCodepoint),
  quote_code: Int,
  acc: List(UtfCodepoint),
) -> #(String, List(UtfCodepoint)) {
  case cps {
    [] -> #(string.from_utf_codepoints(list.reverse(acc)), [])
    [cp, ..rest] -> {
      let code = string.utf_codepoint_to_int(cp)
      case code == quote_code {
        True -> #(string.from_utf_codepoints(list.reverse(acc)), rest)
        False -> read_quoted_value(rest, quote_code, [cp, ..acc])
      }
    }
  }
}

fn read_unquoted_value(
  cps: List(UtfCodepoint),
  acc: List(UtfCodepoint),
) -> #(String, List(UtfCodepoint)) {
  case cps {
    [] -> #(string.from_utf_codepoints(list.reverse(acc)), [])
    [cp, ..rest] -> {
      let code = string.utf_codepoint_to_int(cp)
      case code <= 32 {
        True -> #(string.from_utf_codepoints(list.reverse(acc)), rest)
        False -> read_unquoted_value(rest, [cp, ..acc])
      }
    }
  }
}
