//// Pure URL query string parser and route extractor.
////
//// Parses and formats nsite query strings (`?view=settings`, `?view=widget`, `?view=search`)
//// according to standard WHATWG URL query semantics without side effects or FFI.

import gleam/dict.{type Dict}
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import gleam/uri

/// Parsed route representation including path, view, and query parameters.
pub type Route {
  Route(
    path: String,
    view: Option(String),
    params: Dict(String, String),
    fragment: Option(String),
  )
}

/// Parse query parameters from a raw query string or full URL into a `Dict(String, String)`.
///
/// Handles leading `?`, trailing `#fragment`, multiple parameters separated by `&`,
/// and percent-decoding of keys and values.
pub fn parse_query(raw: String) -> Dict(String, String) {
  let clean = string.trim(raw)

  // Strip hash fragment if present
  let without_fragment = case string.split(clean, "#") {
    [before, ..] -> before
    [] -> ""
  }

  // Extract query portion (after '?')
  let query_string = case string.split(without_fragment, "?") {
    [_, q, ..] -> q
    [single] ->
      case string.contains(single, "=") {
        True -> single
        False -> ""
      }
    [] -> ""
  }

  case query_string == "" {
    True -> dict.new()
    False ->
      string.split(query_string, "&")
      |> list.fold(dict.new(), fn(acc, pair) {
        let trimmed_pair = string.trim(pair)
        case trimmed_pair == "" {
          True -> acc
          False -> {
            let #(raw_key, raw_val) = case string.split(trimmed_pair, "=") {
              [k, v, ..rest] -> #(k, string.join([v, ..rest], "="))
              [k] -> #(k, "")
              [] -> #("", "")
            }
            let key = decode_component(raw_key)
            let val = decode_component(raw_val)
            case key == "" {
              True -> acc
              False -> dict.insert(acc, key, val)
            }
          }
        }
      })
  }
}

fn decode_component(str: String) -> String {
  case uri.percent_decode(str) {
    Ok(decoded) -> decoded
    Error(Nil) -> str
  }
}

/// Get a specific query parameter from a raw query string or URL.
pub fn get_param(raw: String, key: String) -> Option(String) {
  dict.get(parse_query(raw), key)
  |> option.from_result
}

/// Get the companion sub-view (`view`) parameter from a query string or URL.
///
/// Extracts values for `?view=settings`, `?view=widget`, `?view=search`, etc.
pub fn get_view(raw: String) -> Option(String) {
  get_param(raw, "view")
}

/// Parse a URL or path into a structured `Route`.
pub fn parse_route(raw: String) -> Route {
  let clean = string.trim(raw)

  let #(path_with_query, fragment) = case string.split(clean, "#") {
    [before, frag, ..] -> #(before, Some(frag))
    [before] -> #(before, None)
    [] -> #("", None)
  }

  let #(path, params) = case string.split(path_with_query, "?") {
    [p, q, ..] -> #(p, parse_query("?" <> q))
    [p] ->
      case string.contains(p, "=") {
        True -> #("", parse_query(p))
        False -> #(p, dict.new())
      }
    [] -> #("", dict.new())
  }

  let view = dict.get(params, "view") |> option.from_result

  Route(path: path, view: view, params: params, fragment: fragment)
}

/// Format key-value pairs into a canonical URL query string (including leading `?`).
/// Returns an empty string if `params` is empty.
pub fn format_query(params: List(#(String, String))) -> String {
  case params {
    [] -> ""
    _ -> {
      let encoded =
        list.map(params, fn(pair) {
          uri.percent_encode(pair.0) <> "=" <> uri.percent_encode(pair.1)
        })
        |> string.join("&")
      "?" <> encoded
    }
  }
}

/// Set or update the `view` parameter on a given URL or query string.
pub fn set_view(raw: String, view: String) -> String {
  let route = parse_route(raw)
  let updated_params = dict.insert(route.params, "view", view)
  let param_list = dict.to_list(updated_params)
  let query = format_query(param_list)

  let frag_str = case route.fragment {
    Some(f) -> "#" <> f
    None -> ""
  }

  route.path <> query <> frag_str
}

/// Remove the `view` parameter from a given URL or query string.
pub fn remove_view(raw: String) -> String {
  let route = parse_route(raw)
  let updated_params = dict.delete(route.params, "view")
  let param_list = dict.to_list(updated_params)
  let query = format_query(param_list)

  let frag_str = case route.fragment {
    Some(f) -> "#" <> f
    None -> ""
  }

  route.path <> query <> frag_str
}
