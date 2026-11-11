//// Pure CSS selector scoper for sandboxed plugins and declarative components.
////
//// Ensures guest stylesheets injected into the host DOM cannot pollute the global
//// host document (e.g. document.body, :root, html, or unqualified universal/class selectors).
//// Rewrites root and body references directly to the scope container element.

import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import gleam/string_tree.{type StringTree}

// -----------------------------------------------------------------------------
// Identifier and Boundary Helpers
// -----------------------------------------------------------------------------

/// Check if a single character is valid within a CSS identifier.
pub fn is_css_ident_char(ch: String) -> Bool {
  case ch {
    "a"
    | "b"
    | "c"
    | "d"
    | "e"
    | "f"
    | "g"
    | "h"
    | "i"
    | "j"
    | "k"
    | "l"
    | "m"
    | "n"
    | "o"
    | "p"
    | "q"
    | "r"
    | "s"
    | "t"
    | "u"
    | "v"
    | "w"
    | "x"
    | "y"
    | "z"
    | "A"
    | "B"
    | "C"
    | "D"
    | "E"
    | "F"
    | "G"
    | "H"
    | "I"
    | "J"
    | "K"
    | "L"
    | "M"
    | "N"
    | "O"
    | "P"
    | "Q"
    | "R"
    | "S"
    | "T"
    | "U"
    | "V"
    | "W"
    | "X"
    | "Y"
    | "Z"
    | "0"
    | "1"
    | "2"
    | "3"
    | "4"
    | "5"
    | "6"
    | "7"
    | "8"
    | "9"
    | "_"
    | "-" -> True
    _ -> False
  }
}

fn is_whitespace(ch: String) -> Bool {
  case ch {
    " " | "\t" | "\n" | "\r" -> True
    _ -> False
  }
}

fn drop_whitespace(chars: List(String)) -> List(String) {
  case chars {
    [ch, ..rest] ->
      case is_whitespace(ch) {
        True -> drop_whitespace(rest)
        False -> chars
      }
    [] -> []
  }
}

// -----------------------------------------------------------------------------
// Single Selector Scoping
// -----------------------------------------------------------------------------

fn match_html_body(sel: String) -> Option(String) {
  let lower = string.lowercase(sel)
  case string.starts_with(lower, "html") {
    False -> None
    True -> {
      let after_html = string.slice(sel, 4, string.length(sel))
      let chars = string.to_graphemes(after_html)
      case chars {
        [first, ..]
          if first != " "
          && first != "\t"
          && first != "\n"
          && first != "\r"
          && first != ">"
        -> None
        _ -> {
          let after_ws = drop_whitespace(chars)
          let after_combinator = case after_ws {
            [">", ..rest_after_gt] -> drop_whitespace(rest_after_gt)
            _ -> after_ws
          }
          let rem_str = string.join(after_combinator, "")
          let rem_lower = string.lowercase(rem_str)
          case string.starts_with(rem_lower, "body") {
            False -> None
            True -> {
              let after_body = string.slice(rem_str, 4, string.length(rem_str))
              case string.to_graphemes(after_body) {
                [] -> Some("")
                [ch, ..] ->
                  case is_css_ident_char(ch) {
                    True -> None
                    False -> Some(after_body)
                  }
              }
            }
          }
        }
      }
    }
  }
}

fn find_matching_root_keyword(
  keywords: List(String),
  sel: String,
  lower: String,
) -> Option(String) {
  case keywords {
    [] -> None
    [kw, ..rest] ->
      case string.starts_with(lower, kw) {
        False -> find_matching_root_keyword(rest, sel, lower)
        True -> {
          let kw_len = string.length(kw)
          let after = string.slice(sel, kw_len, string.length(sel))
          case string.to_graphemes(after) {
            [] -> Some("")
            [ch, ..] ->
              case is_css_ident_char(ch) {
                True -> find_matching_root_keyword(rest, sel, lower)
                False -> Some(after)
              }
          }
        }
      }
  }
}

fn match_root_or_body(sel: String) -> Option(String) {
  let lower = string.lowercase(sel)
  let keywords = [":root", ":host", ":scope", "body", "html"]
  find_matching_root_keyword(keywords, sel, lower)
}

/// Scope an individual CSS selector under the specified container scope.
pub fn scope_single_selector(sel: String, scope: String) -> String {
  let sel = string.trim(sel)
  case sel {
    "" -> ""
    _ -> {
      let already_scoped =
        sel == scope
        || string.starts_with(sel, scope <> " ")
        || string.starts_with(sel, scope <> ">")
        || string.starts_with(sel, scope <> ":")
        || string.starts_with(sel, scope <> ".")

      case already_scoped {
        True -> sel
        False ->
          case match_html_body(sel) {
            Some(rest) -> scope <> rest
            None ->
              case match_root_or_body(sel) {
                Some(rest) -> scope <> rest
                None -> scope <> " " <> sel
              }
          }
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Selector List Scoping
// -----------------------------------------------------------------------------

fn split_selector_list(
  chars: List(String),
  depth: Int,
  cur: StringTree,
  acc: List(String),
) -> List(String) {
  case chars {
    [] -> {
      let final_part = string.trim(string_tree.to_string(cur))
      case final_part {
        "" -> list.reverse(acc)
        _ -> list.reverse([final_part, ..acc])
      }
    }
    ["(", ..rest] ->
      split_selector_list(rest, depth + 1, string_tree.append(cur, "("), acc)
    ["[", ..rest] ->
      split_selector_list(rest, depth + 1, string_tree.append(cur, "["), acc)
    [")", ..rest] ->
      split_selector_list(
        rest,
        int.max(0, depth - 1),
        string_tree.append(cur, ")"),
        acc,
      )
    ["]", ..rest] ->
      split_selector_list(
        rest,
        int.max(0, depth - 1),
        string_tree.append(cur, "]"),
        acc,
      )
    [",", ..rest] if depth == 0 -> {
      let part = string.trim(string_tree.to_string(cur))
      case part {
        "" -> split_selector_list(rest, 0, string_tree.new(), acc)
        _ -> split_selector_list(rest, 0, string_tree.new(), [part, ..acc])
      }
    }
    [ch, ..rest] ->
      split_selector_list(rest, depth, string_tree.append(cur, ch), acc)
  }
}

/// Scope a comma-separated selector list under the specified container scope.
pub fn scope_selector_list(selectors: String, scope: String) -> String {
  let parts =
    split_selector_list(
      string.to_graphemes(selectors),
      0,
      string_tree.new(),
      [],
    )
  parts
  |> list.map(fn(part) { scope_single_selector(part, scope) })
  |> list.filter(fn(s) { s != "" })
  |> string.join(", ")
}

// -----------------------------------------------------------------------------
// Stylesheet Scanning & Delimiters
// -----------------------------------------------------------------------------

fn consume_comment(
  chars: List(String),
  acc: StringTree,
) -> #(String, List(String)) {
  case chars {
    ["*", "/", ..rest] -> {
      let b = string_tree.append(acc, "*/")
      #(string_tree.to_string(b), rest)
    }
    [ch, ..rest] -> consume_comment(rest, string_tree.append(acc, ch))
    [] -> #(string_tree.to_string(acc), [])
  }
}

fn consume_quoted(
  quote_char: String,
  chars: List(String),
  acc: StringTree,
) -> #(String, List(String)) {
  case chars {
    ["\\", escaped, ..rest] -> {
      let b =
        acc
        |> string_tree.append("\\")
        |> string_tree.append(escaped)
      consume_quoted(quote_char, rest, b)
    }
    [ch, ..rest] if ch == quote_char -> {
      let b = string_tree.append(acc, quote_char)
      #(string_tree.to_string(b), rest)
    }
    [ch, ..rest] ->
      consume_quoted(quote_char, rest, string_tree.append(acc, ch))
    [] -> #(string_tree.to_string(acc), [])
  }
}

fn consume_block_body(
  chars: List(String),
  depth: Int,
  acc: StringTree,
) -> #(String, List(String)) {
  case chars {
    ["/", "*", ..rest] -> {
      let #(comment_str, remaining) =
        consume_comment(rest, string_tree.from_string("/*"))
      consume_block_body(remaining, depth, string_tree.append(acc, comment_str))
    }
    ["\"", ..rest] -> {
      let #(str, remaining) =
        consume_quoted("\"", rest, string_tree.from_string("\""))
      consume_block_body(remaining, depth, string_tree.append(acc, str))
    }
    ["'", ..rest] -> {
      let #(str, remaining) =
        consume_quoted("'", rest, string_tree.from_string("'"))
      consume_block_body(remaining, depth, string_tree.append(acc, str))
    }
    ["{", ..rest] ->
      consume_block_body(rest, depth + 1, string_tree.append(acc, "{"))
    ["}", ..rest] ->
      case depth <= 1 {
        True -> #(string_tree.to_string(acc), rest)
        False ->
          consume_block_body(rest, depth - 1, string_tree.append(acc, "}"))
      }
    [ch, ..rest] -> consume_block_body(rest, depth, string_tree.append(acc, ch))
    [] -> #(string_tree.to_string(acc), [])
  }
}

fn find_rule_delimiter(
  chars: List(String),
  depth: Int,
  buf: StringTree,
) -> #(String, String, List(String)) {
  case chars {
    [] -> #("", string_tree.to_string(buf), [])
    ["/", "*", ..rest] -> {
      let #(comment_str, remaining) =
        consume_comment(rest, string_tree.from_string("/*"))
      find_rule_delimiter(
        remaining,
        depth,
        string_tree.append(buf, comment_str),
      )
    }
    ["\"", ..rest] -> {
      let #(str, remaining) =
        consume_quoted("\"", rest, string_tree.from_string("\""))
      find_rule_delimiter(remaining, depth, string_tree.append(buf, str))
    }
    ["'", ..rest] -> {
      let #(str, remaining) =
        consume_quoted("'", rest, string_tree.from_string("'"))
      find_rule_delimiter(remaining, depth, string_tree.append(buf, str))
    }
    ["(", ..rest] ->
      find_rule_delimiter(rest, depth + 1, string_tree.append(buf, "("))
    ["[", ..rest] ->
      find_rule_delimiter(rest, depth + 1, string_tree.append(buf, "["))
    [")", ..rest] ->
      find_rule_delimiter(
        rest,
        int.max(0, depth - 1),
        string_tree.append(buf, ")"),
      )
    ["]", ..rest] ->
      find_rule_delimiter(
        rest,
        int.max(0, depth - 1),
        string_tree.append(buf, "]"),
      )
    [";", ..rest] if depth == 0 -> #(";", string_tree.to_string(buf), rest)
    ["{", ..rest] if depth == 0 -> #("{", string_tree.to_string(buf), rest)
    [ch, ..rest] ->
      find_rule_delimiter(rest, depth, string_tree.append(buf, ch))
  }
}

fn get_at_rule_name(selector_or_at: String) -> String {
  let first = case string.split(selector_or_at, " ") {
    [h, ..] -> h
    [] -> selector_or_at
  }
  let first_clean = case string.split_once(first, "(") {
    Ok(#(h, _)) -> h
    Error(Nil) -> first
  }
  string.lowercase(string.trim(first_clean))
}

fn parse_rules(chars: List(String), scope: String, out: StringTree) -> String {
  case chars {
    [] -> string_tree.to_string(out)
    _ -> {
      let #(ws_chars, after_ws) = take_while_whitespace(chars, [])
      let out = string_tree.append(out, string.join(ws_chars, ""))
      case after_ws {
        [] -> string_tree.to_string(out)
        ["/", "*", ..rest_comment] -> {
          let #(comment_str, remaining) =
            consume_comment(rest_comment, string_tree.from_string("/*"))
          parse_rules(remaining, scope, string_tree.append(out, comment_str))
        }
        _ -> {
          let #(delim, selector_or_at_raw, remaining) =
            find_rule_delimiter(after_ws, 0, string_tree.new())
          let selector_or_at = string.trim(selector_or_at_raw)
          case delim {
            ";" ->
              parse_rules(
                remaining,
                scope,
                string_tree.append(out, selector_or_at <> ";"),
              )
            "{" -> {
              let #(block_body, rest_after_block) =
                consume_block_body(remaining, 1, string_tree.new())
              let formatted_rule = case
                string.starts_with(selector_or_at, "@")
              {
                True -> {
                  let at_name = get_at_rule_name(selector_or_at)
                  case at_name {
                    "@keyframes"
                    | "@-webkit-keyframes"
                    | "@font-face"
                    | "@page" -> selector_or_at <> " {" <> block_body <> "}"
                    "@media" | "@supports" | "@container" ->
                      selector_or_at
                      <> " {"
                      <> scope_css(block_body, scope)
                      <> "}"
                    _ -> selector_or_at <> " {" <> block_body <> "}"
                  }
                }
                False -> {
                  let scoped_sel = scope_selector_list(selector_or_at, scope)
                  scoped_sel <> " {" <> block_body <> "}"
                }
              }
              parse_rules(
                rest_after_block,
                scope,
                string_tree.append(out, formatted_rule),
              )
            }
            _ ->
              string_tree.to_string(string_tree.append(out, selector_or_at_raw))
          }
        }
      }
    }
  }
}

fn take_while_whitespace(
  chars: List(String),
  acc: List(String),
) -> #(List(String), List(String)) {
  case chars {
    [ch, ..rest] ->
      case is_whitespace(ch) {
        True -> take_while_whitespace(rest, [ch, ..acc])
        False -> #(list.reverse(acc), chars)
      }
    [] -> #(list.reverse(acc), [])
  }
}

// -----------------------------------------------------------------------------
// Public Stylesheet Scoping API
// -----------------------------------------------------------------------------

/// Scopes an entire CSS stylesheet string under the given `scope_selector`.
///
/// Rewrites `body`, `html`, `:root`, `:host`, `:scope` directly to the container,
/// prefixes other rules, preserves keyframes/font-face/page, and recursively scopes
/// conditional at-rules (@media, @supports, @container).
pub fn scope_css(css_text: String, scope_selector: String) -> String {
  case css_text == "" || scope_selector == "" {
    True -> css_text
    False ->
      parse_rules(
        string.to_graphemes(css_text),
        scope_selector,
        string_tree.new(),
      )
  }
}
