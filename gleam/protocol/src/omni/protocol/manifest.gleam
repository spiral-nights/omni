//// Nsite discovery and sub-view declaration contracts.
////
//// Pure Nostr sites (nsites) declare their available routes, companion viewports,
//// and shortcuts using standard Nostr event tags, HTML <link rel="alternate">
//// tags, or W3C Web App Manifest files without proprietary SDKs.

import gleam/dynamic/decode
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import gleam/uri

/// Sub-view execution and rendering format.
pub type ViewFormat {
  Iframe
  Schema
  Wasm
  Auto
}

/// Convert a `ViewFormat` to its wire string representation.
pub fn view_format_to_string(fmt: ViewFormat) -> String {
  case fmt {
    Iframe -> "iframe"
    Schema -> "schema"
    Wasm -> "wasm"
    Auto -> "auto"
  }
}

/// Parse a `ViewFormat` from a string.
pub fn view_format_from_string(str: String) -> ViewFormat {
  case string.lowercase(str) {
    "iframe" -> Iframe
    "schema" -> Schema
    "wasm" -> Wasm
    _ -> Auto
  }
}

/// Declaration of a view or route within an nsite application.
pub type PluginViewDeclaration {
  PluginViewDeclaration(
    id: String,
    title: String,
    path: String,
    format: ViewFormat,
  )
}

/// Discovered HTML `<link rel="alternate">` tag.
pub type AlternateLink {
  AlternateLink(href: String, title: Option(String), media_type: Option(String))
}

/// Discovered W3C Web App Manifest shortcut item.
pub type ManifestShortcut {
  ManifestShortcut(
    name: String,
    url: String,
    short_name: Option(String),
    description: Option(String),
  )
}

/// Standard W3C Web App Manifest subset relevant for nsite discovery.
pub type WebManifest {
  WebManifest(
    name: Option(String),
    short_name: Option(String),
    description: Option(String),
    start_url: Option(String),
    display: Option(String),
    shortcuts: List(ManifestShortcut),
  )
}

// -----------------------------------------------------------------------------
// Discovery Parsers
// -----------------------------------------------------------------------------

/// Capitalize the first character of a string for default titles.
fn capitalize(str: String) -> String {
  case string.pop_grapheme(str) {
    Ok(#(first, rest)) -> string.uppercase(first) <> rest
    Error(Nil) -> str
  }
}

/// Parse Nostr event tags (`["view", ...]`, `["route", ...]`, `["views", ...]`)
/// into a list of `PluginViewDeclaration` records.
pub fn parse_view_tags(
  tags: List(List(String)),
  has_schema_markers: Bool,
) -> List(PluginViewDeclaration) {
  list.fold(tags, [], fn(acc, tag) {
    case tag {
      [prefix, id, ..rest] if prefix == "view" || prefix == "route" -> {
        let clean_id = string.trim(id)
        case clean_id == "" {
          True -> acc
          False -> {
            let title = case rest {
              [t, ..] if t != "" -> string.trim(t)
              _ -> capitalize(clean_id)
            }
            let path = case rest {
              [_, p, ..] if p != "" -> string.trim(p)
              _ ->
                case clean_id {
                  "main" -> ""
                  other -> "?view=" <> uri.percent_encode(other)
                }
            }
            let raw_fmt = case rest {
              [_, _, f, ..] -> string.lowercase(string.trim(f))
              _ -> ""
            }
            let format = case raw_fmt {
              "schema" -> Schema
              "iframe" -> Iframe
              "wasm" -> Wasm
              _ ->
                case
                  has_schema_markers
                  && { clean_id == "widget" || clean_id == "settings" }
                {
                  True -> Schema
                  False -> Auto
                }
            }
            [PluginViewDeclaration(clean_id, title, path, format), ..acc]
          }
        }
      }

      ["views", ..ids] -> {
        let list_views =
          list.filter_map(ids, fn(id) {
            let clean_id = string.trim(id)
            case clean_id == "" {
              True -> Error(Nil)
              False -> {
                let title = capitalize(clean_id)
                let path = case clean_id {
                  "main" -> ""
                  other -> "?view=" <> uri.percent_encode(other)
                }
                let format = case
                  has_schema_markers
                  && { clean_id == "widget" || clean_id == "settings" }
                {
                  True -> Schema
                  False -> Auto
                }
                Ok(PluginViewDeclaration(clean_id, title, path, format))
              }
            }
          })
        list.append(list.reverse(list_views), acc)
      }

      _ -> acc
    }
  })
  |> list.reverse
}

/// Convert an `AlternateLink` tag into a `PluginViewDeclaration`.
pub fn alternate_link_to_view(
  link: AlternateLink,
  has_schema_markers: Bool,
) -> Option(PluginViewDeclaration) {
  let clean_href = string.trim(link.href)
  case string.starts_with(clean_href, "data:") || clean_href == "" {
    True -> None
    False -> {
      let id = case extract_view_param(clean_href) {
        Some(param) -> param
        None ->
          clean_href
          |> string.replace("/", "")
          |> string.replace("?", "")
          |> string.replace(".html", "")
      }
      case id == "" {
        True -> None
        False -> {
          let title = case link.title {
            Some(t) -> string.trim(t)
            None -> capitalize(id)
          }
          let is_json = case link.media_type {
            Some(mt) -> string.contains(mt, "application/json")
            None -> False
          }
          let format = case is_json {
            True -> Schema
            False ->
              case
                has_schema_markers && { id == "widget" || id == "settings" }
              {
                True -> Schema
                False -> Auto
              }
          }
          Some(PluginViewDeclaration(id, title, clean_href, format))
        }
      }
    }
  }
}

/// Extract view parameter value (`?view=xxx` or `&view=xxx`) from a query string.
fn extract_view_param(path: String) -> Option(String) {
  case string.split(path, "?") {
    [_, query] -> find_view_in_query(query)
    _ -> None
  }
}

fn find_view_in_query(query: String) -> Option(String) {
  string.split(query, "&")
  |> list.find_map(fn(part) {
    case string.split(part, "=") {
      ["view", val] -> Ok(val)
      _ -> Error(Nil)
    }
  })
  |> option.from_result
}

/// Convert a `ManifestShortcut` into a `PluginViewDeclaration`.
pub fn shortcut_to_view(shortcut: ManifestShortcut) -> PluginViewDeclaration {
  let clean_url = string.trim(shortcut.url)
  let id = case extract_view_param(clean_url) {
    Some(param) -> param
    None ->
      shortcut.name
      |> string.lowercase
      |> string.replace(" ", "-")
  }
  let title = case shortcut.short_name {
    Some(sn) -> sn
    None -> shortcut.name
  }
  PluginViewDeclaration(id, title, clean_url, Auto)
}

// -----------------------------------------------------------------------------
// Codecs
// -----------------------------------------------------------------------------

/// Dynamic decoder for `PluginViewDeclaration`.
pub fn view_declaration_decoder() -> decode.Decoder(PluginViewDeclaration) {
  use id <- decode.field("id", decode.string)
  use title <- decode.field("title", decode.string)
  use path <- decode.optional_field("path", "", decode.string)
  use fmt_str <- decode.optional_field("format", "auto", decode.string)
  decode.success(PluginViewDeclaration(
    id: id,
    title: title,
    path: path,
    format: view_format_from_string(fmt_str),
  ))
}

/// Convert a `PluginViewDeclaration` to `gleam/json.Json`.
pub fn view_declaration_to_json(v: PluginViewDeclaration) -> json.Json {
  json.object([
    #("id", json.string(v.id)),
    #("title", json.string(v.title)),
    #("path", json.string(v.path)),
    #("format", json.string(view_format_to_string(v.format))),
  ])
}

/// Dynamic decoder for `ManifestShortcut`.
pub fn manifest_shortcut_decoder() -> decode.Decoder(ManifestShortcut) {
  use name <- decode.field("name", decode.string)
  use url <- decode.field("url", decode.string)
  use short_name <- decode.optional_field(
    "short_name",
    None,
    decode.optional(decode.string),
  )
  use desc <- decode.optional_field(
    "description",
    None,
    decode.optional(decode.string),
  )
  decode.success(ManifestShortcut(
    name: name,
    url: url,
    short_name: short_name,
    description: desc,
  ))
}

/// Dynamic decoder for `WebManifest`.
pub fn web_manifest_decoder() -> decode.Decoder(WebManifest) {
  use name <- decode.optional_field(
    "name",
    None,
    decode.optional(decode.string),
  )
  use short_name <- decode.optional_field(
    "short_name",
    None,
    decode.optional(decode.string),
  )
  use desc <- decode.optional_field(
    "description",
    None,
    decode.optional(decode.string),
  )
  use start_url <- decode.optional_field(
    "start_url",
    None,
    decode.optional(decode.string),
  )
  use display <- decode.optional_field(
    "display",
    None,
    decode.optional(decode.string),
  )
  use shortcuts <- decode.optional_field(
    "shortcuts",
    [],
    decode.list(of: manifest_shortcut_decoder()),
  )
  decode.success(WebManifest(
    name: name,
    short_name: short_name,
    description: desc,
    start_url: start_url,
    display: display,
    shortcuts: shortcuts,
  ))
}

/// Parse a Web Manifest JSON string into `WebManifest`.
pub fn decode_web_manifest(
  json_str: String,
) -> Result(WebManifest, json.DecodeError) {
  json.parse(from: json_str, using: web_manifest_decoder())
}
