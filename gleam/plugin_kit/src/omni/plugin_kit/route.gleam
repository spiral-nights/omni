//// Pure URL query string and view route parser/builder for standard nsites.
////
//// Supports standard `?view=settings`, `?view=widget&id=123`, and `#section`
//// view navigation without any proprietary routing SDKs.

import gleam/dict.{type Dict}
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import omni/platform/url

/// Parsed view route representation for a standard nsite.
pub type Route {
  Route(view: String, params: Dict(String, String), hash: Option(String))
}

/// Default route pointing to the `"main"` view with no query parameters or hash.
pub fn main() -> Route {
  Route(view: "main", params: dict.new(), hash: None)
}

/// Parses a URL search query string (e.g. `"?view=settings&id=123"` or `"view=widget#top"`).
/// Defaults `view` to `"main"` if `?view=` is absent or empty.
pub fn parse_search(search: String) -> Route {
  let trimmed = string.trim(search)
  let #(before_hash, hash_opt) = split_hash(trimmed)
  let raw_query = case string.starts_with(before_hash, "?") {
    True -> string.drop_start(before_hash, 1)
    False -> before_hash
  }

  let pairs =
    string.split(raw_query, "&")
    |> list.filter_map(fn(segment) {
      let seg = string.trim(segment)
      case seg {
        "" -> Error(Nil)
        _ ->
          case string.split_once(seg, "=") {
            Ok(#(raw_k, raw_v)) -> {
              let k = url.decode_component(raw_k)
              let v = url.decode_component(raw_v)
              case k {
                "" -> Error(Nil)
                _ -> Ok(#(k, v))
              }
            }
            Error(Nil) -> {
              let k = url.decode_component(seg)
              case k {
                "" -> Error(Nil)
                _ -> Ok(#(k, ""))
              }
            }
          }
      }
    })

  let all_params = dict.from_list(pairs)
  let resolved_view = case dict.get(all_params, "view") {
    Ok(v) ->
      case string.trim(v) {
        "" -> "main"
        non_empty -> non_empty
      }
    Error(Nil) -> "main"
  }
  let clean_params = dict.delete(all_params, "view")

  Route(view: resolved_view, params: clean_params, hash: hash_opt)
}

/// Parses either a full URL (`"https://app.example/index.html?view=settings#general"`),
/// a relative path (`"/index.html?view=widget&id=42"`), or a raw search/hash string.
pub fn parse_url(full_url_or_search: String) -> Route {
  let trimmed = string.trim(full_url_or_search)
  case url.parse(trimmed) {
    Ok(parsed) -> {
      let query_part = case parsed.query {
        Some(q) -> "?" <> q
        None -> ""
      }
      let hash_part = case parsed.fragment {
        Some(f) if f != "" -> "#" <> f
        _ -> ""
      }
      parse_search(query_part <> hash_part)
    }
    Error(_) -> {
      case string.split_once(trimmed, "?") {
        Ok(#(_path, rest)) -> parse_search("?" <> rest)
        Error(Nil) ->
          case string.starts_with(trimmed, "#") {
            True -> parse_search(trimmed)
            False ->
              case string.contains(trimmed, "=") {
                True -> parse_search(trimmed)
                False ->
                  case string.split_once(trimmed, "#") {
                    Ok(#(_path, fragment)) -> parse_search("#" <> fragment)
                    Error(Nil) -> main()
                  }
              }
          }
      }
    }
  }
}

/// Serializes a `Route` back into a canonical search/hash string (e.g. `"?view=settings"`,
/// `"?view=widget&id=123#top"`, or `""` when `view == "main"`, `params` is empty, and `hash` is `None`).
pub fn to_search(route: Route) -> String {
  let view_pairs = case route.view {
    "" | "main" -> []
    v -> [#("view", v)]
  }

  let param_pairs =
    dict.to_list(route.params)
    |> list.filter(fn(pair) { pair.0 != "view" && pair.0 != "" })
    |> list.sort(fn(a, b) { string.compare(a.0, b.0) })

  let all_pairs = list.append(view_pairs, param_pairs)
  let query_str = case all_pairs {
    [] -> ""
    _ -> {
      let encoded =
        list.map(all_pairs, fn(pair) {
          url.encode_component(pair.0) <> "=" <> url.encode_component(pair.1)
        })
        |> string.join("&")
      "?" <> encoded
    }
  }

  let hash_str = case route.hash {
    Some(h) if h != "" -> "#" <> h
    _ -> ""
  }

  query_str <> hash_str
}

/// Retrieves a query parameter value from `route` by key (Wait: if `"view"` is queried, returns `Some(route.view)`).
pub fn get_param(route: Route, key: String) -> Option(String) {
  case key {
    "view" -> Some(route.view)
    _ ->
      dict.get(route.params, key)
      |> option.from_result
  }
}

/// Returns a copy of `route` with its `view` updated.
pub fn with_view(route: Route, view: String) -> Route {
  let normalized = case string.trim(view) {
    "" -> "main"
    v -> v
  }
  Route(..route, view: normalized)
}

/// Returns a copy of `route` with query parameter `key` set to `value`.
pub fn with_param(route: Route, key: String, value: String) -> Route {
  case key {
    "view" -> with_view(route, value)
    _ -> Route(..route, params: dict.insert(route.params, key, value))
  }
}

/// Returns a copy of `route` with the hash fragment set.
pub fn with_hash(route: Route, hash: Option(String)) -> Route {
  Route(..route, hash: hash)
}

fn split_hash(raw: String) -> #(String, Option(String)) {
  case string.split_once(raw, "#") {
    Ok(#(before, after)) -> {
      let decoded_hash = url.decode_component(after)
      let hash_opt = case decoded_hash {
        "" -> None
        h -> Some(h)
      }
      #(before, hash_opt)
    }
    Error(Nil) -> #(raw, None)
  }
}
