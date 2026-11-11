//// Action and navigation types for Omni declarative schema components.
////
//// When users interact with schema elements (clicks, inputs, toggles), an
//// `Action` is dispatched over Channel 1 back to the plugin sandbox or shell.

import gleam/dict.{type Dict}
import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}

/// Navigation target attached to an action for zero-roundtrip routing.
pub type NavigateTarget {
  NavigateTarget(
    plugin_id: Option(String),
    view: Option(String),
    route: Option(String),
    page: Option(String),
    back: Option(Bool),
  )
}

/// An interactive action declaration attached to buttons, cards, list items, etc.
pub type Action {
  Action(
    name: String,
    payload: Option(Dict(String, Dynamic)),
    navigate: Option(NavigateTarget),
  )
}

/// Create a new Action with the given name and no payload or navigation target.
pub fn new(name: String) -> Action {
  Action(name: name, payload: None, navigate: None)
}

/// Attach a key-value payload to an action.
pub fn with_payload(action: Action, payload: Dict(String, Dynamic)) -> Action {
  Action(..action, payload: Some(payload))
}

/// Attach a navigation target to an action.
pub fn with_navigate(action: Action, navigate: NavigateTarget) -> Action {
  Action(..action, navigate: Some(navigate))
}

/// Create an empty NavigateTarget with all fields unset.
pub fn empty_target() -> NavigateTarget {
  NavigateTarget(
    plugin_id: None,
    view: None,
    route: None,
    page: None,
    back: None,
  )
}

/// Create a navigation action pointing to a specific view (e.g. "settings", "widget").
pub fn navigate_view(view: String) -> Action {
  Action(
    name: "navigate",
    payload: None,
    navigate: Some(NavigateTarget(..empty_target(), view: Some(view))),
  )
}

/// Create a navigation action pointing to a route path (e.g. "?view=settings").
pub fn navigate_route(route: String) -> Action {
  Action(
    name: "navigate",
    payload: None,
    navigate: Some(NavigateTarget(..empty_target(), route: Some(route))),
  )
}

/// Create a navigation action to step back in the history stack.
pub fn navigate_back() -> Action {
  Action(
    name: "back",
    payload: None,
    navigate: Some(NavigateTarget(..empty_target(), back: Some(True))),
  )
}

/// Convert a generic Dynamic value to `gleam/json.Json`.
pub fn dynamic_to_json(d: Dynamic) -> json.Json {
  case decode.run(d, decode.string) {
    Ok(s) -> json.string(s)
    Error(_) ->
      case decode.run(d, decode.int) {
        Ok(i) -> json.int(i)
        Error(_) ->
          case decode.run(d, decode.float) {
            Ok(f) -> json.float(f)
            Error(_) ->
              case decode.run(d, decode.bool) {
                Ok(b) -> json.bool(b)
                Error(_) ->
                  case decode.run(d, decode.list(of: decode.dynamic)) {
                    Ok(items) -> json.array(items, of: dynamic_to_json)
                    Error(_) ->
                      case
                        decode.run(
                          d,
                          decode.dict(decode.string, decode.dynamic),
                        )
                      {
                        Ok(entries) ->
                          json.object(
                            dict.to_list(entries)
                            |> list.map(fn(pair) {
                              #(pair.0, dynamic_to_json(pair.1))
                            }),
                          )
                        Error(_) -> json.null()
                      }
                  }
              }
          }
      }
  }
}

/// Dynamic decoder for `NavigateTarget`.
pub fn navigate_target_decoder() -> decode.Decoder(NavigateTarget) {
  use plugin_id <- decode.optional_field(
    "pluginId",
    None,
    decode.optional(decode.string),
  )
  use plugin_id_alt <- decode.optional_field(
    "plugin_id",
    None,
    decode.optional(decode.string),
  )
  use view <- decode.optional_field(
    "view",
    None,
    decode.optional(decode.string),
  )
  use route <- decode.optional_field(
    "route",
    None,
    decode.optional(decode.string),
  )
  use page <- decode.optional_field(
    "page",
    None,
    decode.optional(decode.string),
  )
  use back <- decode.optional_field("back", None, decode.optional(decode.bool))

  let resolved_plugin_id = case plugin_id {
    Some(_) -> plugin_id
    None -> plugin_id_alt
  }

  decode.success(NavigateTarget(
    plugin_id: resolved_plugin_id,
    view: view,
    route: route,
    page: page,
    back: back,
  ))
}

/// Convert a `NavigateTarget` to `gleam/json.Json`.
pub fn navigate_target_to_json(target: NavigateTarget) -> json.Json {
  let fields = []

  let fields = case target.plugin_id {
    Some(p) -> [#(case_plugin_id_key(), json.string(p)), ..fields]
    None -> fields
  }
  let fields = case target.view {
    Some(v) -> [#("view", json.string(v)), ..fields]
    None -> fields
  }
  let fields = case target.route {
    Some(r) -> [#("route", json.string(r)), ..fields]
    None -> fields
  }
  let fields = case target.page {
    Some(pg) -> [#("page", json.string(pg)), ..fields]
    None -> fields
  }
  let fields = case target.back {
    Some(b) -> [#("back", json.bool(b)), ..fields]
    None -> fields
  }

  json.object(fields)
}

fn case_plugin_id_key() -> String {
  "pluginId"
}

/// Dynamic decoder for `Action`.
pub fn decoder() -> decode.Decoder(Action) {
  use name <- decode.field("name", decode.string)
  use payload <- decode.optional_field(
    "payload",
    None,
    decode.optional(decode.dict(decode.string, decode.dynamic)),
  )
  use navigate <- decode.optional_field(
    "navigate",
    None,
    decode.optional(navigate_target_decoder()),
  )
  decode.success(Action(name: name, payload: payload, navigate: navigate))
}

/// Convert an `Action` to `gleam/json.Json`.
pub fn to_json(action: Action) -> json.Json {
  let fields = [#("name", json.string(action.name))]

  let fields = case action.payload {
    Some(payload_dict) -> {
      let payload_json =
        json.object(
          dict.to_list(payload_dict)
          |> list.map(fn(pair) { #(pair.0, dynamic_to_json(pair.1)) }),
        )
      [#("payload", payload_json), ..fields]
    }
    None -> fields
  }

  let fields = case action.navigate {
    Some(target) -> [#("navigate", navigate_target_to_json(target)), ..fields]
    None -> fields
  }

  json.object(fields)
}

/// Parse an `Action` from a JSON string.
pub fn decode_json(json_str: String) -> Result(Action, json.DecodeError) {
  json.parse(from: json_str, using: decoder())
}

/// Encode an `Action` into a JSON string.
pub fn encode(action: Action) -> String {
  to_json(action) |> json.to_string
}
