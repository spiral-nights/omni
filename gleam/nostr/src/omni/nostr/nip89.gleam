//// NIP-89 application handler discovery.
////
//// NIP-89 describes two kinds: `31989` recommendations (an app says it can
//// handle an event kind) and `31990` handler-info documents (name, icon, web).
//// This module parses both into typed records and builds the filters used to
//// discover them through the relay pool.

import gleam/dict.{type Dict}
import gleam/dynamic/decode
import gleam/int
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import omni/nostr/event.{type Event}
import omni/nostr/filter.{type Filter}
import omni/nostr/kind
import omni/nostr/pubkey

/// Handler recommendation event kind (31989).
pub const recommendation_kind_int = 31_989

/// Handler information event kind (31990).
pub const handler_info_kind_int = 31_990

/// Recommendation kind as a typed `Kind`.
pub fn recommendation_kind() -> kind.Kind {
  kind.from_int(recommendation_kind_int)
}

/// Handler info kind as a typed `Kind`.
pub fn handler_info_kind() -> kind.Kind {
  kind.from_int(handler_info_kind_int)
}

/// An addressable handler reference from a `31989` `a` tag.
pub type HandlerRef {
  HandlerRef(
    coordinate: String,
    pubkey: String,
    identifier: String,
    relays: List(String),
  )
}

/// Parsed `31989` recommendation listing apps that handle `kind`.
pub type Recommendation {
  Recommendation(kind: Int, handlers: List(HandlerRef))
}

/// Parsed `31990` handler information document.
pub type HandlerInfo {
  HandlerInfo(
    coordinate: String,
    pubkey: String,
    identifier: String,
    supported_kinds: List(Int),
    name: String,
    about: String,
    picture: Option(String),
    web: Option(String),
  )
}

/// Parse a `31989` recommendation event.
pub fn parse_recommendation(event: Event) -> Option(Recommendation) {
  case kind.to_int(event.kind) == recommendation_kind_int {
    False -> None
    True -> {
      let handled_kind =
        event.get_tag_values(event.tags, "d")
        |> list.first
        |> result_to_option
        |> option_then(fn(raw) {
          case int_parse(raw) {
            Ok(value) -> Some(value)
            Error(Nil) -> None
          }
        })
      case handled_kind {
        None -> None
        Some(handled) ->
          Some(Recommendation(
            kind: handled,
            handlers: parse_handler_refs(event.tags),
          ))
      }
    }
  }
}

fn parse_handler_refs(tags: List(List(String))) -> List(HandlerRef) {
  list.filter_map(tags, fn(tag) {
    case tag {
      ["a", coordinate, relay] -> handler_ref(coordinate, [relay])
      ["a", coordinate, ..] -> handler_ref(coordinate, [])
      _ -> Error(Nil)
    }
  })
}

fn handler_ref(
  coordinate: String,
  relays: List(String),
) -> Result(HandlerRef, Nil) {
  case string.split(coordinate, ":") {
    [kind_part, pubkey, identifier] if kind_part == "31990" ->
      Ok(HandlerRef(
        coordinate: coordinate,
        pubkey: pubkey,
        identifier: identifier,
        relays: list.filter(relays, fn(relay) { relay != "" }),
      ))
    _ -> Error(Nil)
  }
}

/// Parse a `31990` handler information event.
pub fn parse_handler_info(event: Event) -> Option(HandlerInfo) {
  case kind.to_int(event.kind) == handler_info_kind_int {
    False -> None
    True -> {
      let identifier =
        event.get_tag_values(event.tags, "d")
        |> list.first
        |> result_to_option
        |> option_unwrap_or("")
      let supported_kinds =
        event.get_tag_values(event.tags, "k")
        |> list.filter_map(fn(raw) {
          case int_parse(raw) {
            Ok(value) -> Ok(value)
            Error(Nil) -> Error(Nil)
          }
        })
      let metadata = parse_metadata(event.content)
      let name = case dict.get(metadata, "name") {
        Ok(value) -> value
        Error(Nil) ->
          event.get_tag_values(event.tags, "name")
          |> list.first
          |> result_to_option
          |> option_unwrap_or(identifier)
      }
      let about = case dict.get(metadata, "about") {
        Ok(value) -> value
        Error(Nil) ->
          event.get_tag_values(event.tags, "about")
          |> list.first
          |> result_to_option
          |> option_unwrap_or("")
      }
      let picture = case dict.get(metadata, "picture") {
        Ok(value) -> Some(value)
        Error(Nil) ->
          event.get_tag_values(event.tags, "picture")
          |> list.first
          |> result_to_option
      }
      let web = case dict.get(metadata, "web") {
        Ok(value) -> Some(value)
        Error(Nil) ->
          event.get_tag_values(event.tags, "web")
          |> list.first
          |> result_to_option
      }
      let pubkey_hex = pubkey.to_hex(event.pubkey)
      Some(HandlerInfo(
        coordinate: "31990:" <> pubkey_hex <> ":" <> identifier,
        pubkey: pubkey_hex,
        identifier: identifier,
        supported_kinds: supported_kinds,
        name: name,
        about: about,
        picture: picture,
        web: web,
      ))
    }
  }
}

fn parse_metadata(content: String) -> Dict(String, String) {
  let decoder = decode.dict(decode.string, decode.string)
  case json.parse(from: content, using: decoder) {
    Ok(values) -> values
    Error(_) -> dict.new()
  }
}

/// Filter that finds `31989` recommendations for `handled_kind`.
pub fn recommendation_filter(handled_kind: Int) -> Filter {
  filter.new()
  |> filter.with_kinds([recommendation_kind()])
  |> filter.with_tag("d", [int_to_string(handled_kind)])
  |> filter.with_limit(50)
}

/// Filter that finds the `31990` handler info for a coordinate.
pub fn handler_info_filter(pubkey: String, identifier: String) -> Filter {
  filter.new()
  |> filter.with_kinds([handler_info_kind()])
  |> filter.with_authors([pubkey])
  |> filter.with_tag("d", [identifier])
  |> filter.with_limit(1)
}

fn int_parse(raw: String) -> Result(Int, Nil) {
  int.parse(string.trim(raw))
}

fn int_to_string(value: Int) -> String {
  int.to_string(value)
}

fn result_to_option(value: Result(a, Nil)) -> Option(a) {
  case value {
    Ok(item) -> Some(item)
    Error(_) -> None
  }
}

fn option_then(value: Option(a), next: fn(a) -> Option(b)) -> Option(b) {
  case value {
    Some(item) -> next(item)
    None -> None
  }
}

fn option_unwrap_or(value: Option(a), default: a) -> a {
  case value {
    Some(item) -> item
    None -> default
  }
}
