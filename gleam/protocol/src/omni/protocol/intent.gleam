//// Cross-app intent contracts and resolution types.
////
//// Predefined intents, registered handlers, and disambiguation outcomes
//// governed by the IntentBroker.

import gleam/dict.{type Dict}
import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import omni/protocol/schema/action

/// Canonical cross-app intent request.
pub type Intent {
  Intent(
    action: String,
    data: Option(Dict(String, Dynamic)),
    caller_plugin_id: Option(String),
  )
}

/// An installed or declared handler capable of handling an intent.
pub type IntentHandler {
  IntentHandler(
    plugin_id: String,
    action: String,
    name: Option(String),
    icon: Option(String),
    description: Option(String),
    route: Option(String),
    is_rpc: Option(Bool),
  )
}

/// The outcome of an intent dispatch resolution.
pub type IntentResolution {
  Resolved(handler: IntentHandler, data: Option(Dict(String, Dynamic)))
  Disambiguate(
    action: String,
    candidates: List(IntentHandler),
    data: Option(Dict(String, Dynamic)),
  )
  DisabledCandidate(
    action: String,
    candidate: IntentHandler,
    data: Option(Dict(String, Dynamic)),
  )
  NoHandler(action: String)
  Denied(action: String, reason: String)
}

/// Normalize intent aliases (e.g. compose_note <-> create_note).
pub fn canonical_action(action_name: String) -> String {
  case action_name {
    "compose_note" -> "create_note"
    other -> other
  }
}

/// Create a new Intent with no data or caller.
pub fn new(action_name: String) -> Intent {
  Intent(
    action: canonical_action(action_name),
    data: None,
    caller_plugin_id: None,
  )
}

/// Attach key-value data to an intent.
pub fn with_data(intent: Intent, data: Dict(String, Dynamic)) -> Intent {
  Intent(..intent, data: Some(data))
}

/// Attach caller plugin ID to an intent.
pub fn with_caller(intent: Intent, caller_id: String) -> Intent {
  Intent(..intent, caller_plugin_id: Some(caller_id))
}

// -----------------------------------------------------------------------------
// Codecs: Intent
// -----------------------------------------------------------------------------

/// Dynamic decoder for `Intent`.
pub fn intent_decoder() -> decode.Decoder(Intent) {
  use act <- decode.field("action", decode.string)
  use dt <- decode.optional_field(
    "data",
    None,
    decode.optional(decode.dict(decode.string, decode.dynamic)),
  )
  use caller <- decode.optional_field(
    "callerPluginId",
    None,
    decode.optional(decode.string),
  )
  use caller_alt <- decode.optional_field(
    "caller_plugin_id",
    None,
    decode.optional(decode.string),
  )

  let resolved_caller = case caller {
    Some(_) -> caller
    None -> caller_alt
  }

  decode.success(Intent(
    action: canonical_action(act),
    data: dt,
    caller_plugin_id: resolved_caller,
  ))
}

/// Convert an `Intent` into `gleam/json.Json`.
pub fn intent_to_json(intent: Intent) -> json.Json {
  let fields = [#("action", json.string(intent.action))]
  let fields = case intent.data {
    Some(data_dict) -> [
      #(
        "data",
        json.object(
          dict.to_list(data_dict)
          |> list.map(fn(pair) { #(pair.0, action.dynamic_to_json(pair.1)) }),
        ),
      ),
      ..fields
    ]
    None -> fields
  }
  let fields = case intent.caller_plugin_id {
    Some(caller) -> [#("callerPluginId", json.string(caller)), ..fields]
    None -> fields
  }
  json.object(fields)
}

/// Parse an `Intent` from a JSON string.
pub fn decode_intent_json(
  json_str: String,
) -> Result(Intent, json.DecodeError) {
  json.parse(from: json_str, using: intent_decoder())
}

/// Encode an `Intent` into a JSON string.
pub fn encode_intent(intent: Intent) -> String {
  intent_to_json(intent) |> json.to_string
}

// -----------------------------------------------------------------------------
// Codecs: IntentHandler
// -----------------------------------------------------------------------------

/// Dynamic decoder for `IntentHandler`.
pub fn intent_handler_decoder() -> decode.Decoder(IntentHandler) {
  use p_id <- decode.field("pluginId", decode.string)
  use act <- decode.field("action", decode.string)
  use nm <- decode.optional_field("name", None, decode.optional(decode.string))
  use ic <- decode.optional_field("icon", None, decode.optional(decode.string))
  use desc <- decode.optional_field(
    "description",
    None,
    decode.optional(decode.string),
  )
  use rt <- decode.optional_field("route", None, decode.optional(decode.string))
  use rpc <- decode.optional_field("isRpc", None, decode.optional(decode.bool))

  decode.success(IntentHandler(
    plugin_id: p_id,
    action: canonical_action(act),
    name: nm,
    icon: ic,
    description: desc,
    route: rt,
    is_rpc: rpc,
  ))
}

/// Convert an `IntentHandler` into `gleam/json.Json`.
pub fn intent_handler_to_json(h: IntentHandler) -> json.Json {
  let fields = [
    #("pluginId", json.string(h.plugin_id)),
    #("action", json.string(h.action)),
  ]
  let fields = case h.name {
    Some(n) -> [#("name", json.string(n)), ..fields]
    None -> fields
  }
  let fields = case h.icon {
    Some(i) -> [#("icon", json.string(i)), ..fields]
    None -> fields
  }
  let fields = case h.description {
    Some(d) -> [#("description", json.string(d)), ..fields]
    None -> fields
  }
  let fields = case h.route {
    Some(r) -> [#("route", json.string(r)), ..fields]
    None -> fields
  }
  let fields = case h.is_rpc {
    Some(rpc) -> [#("isRpc", json.bool(rpc)), ..fields]
    None -> fields
  }
  json.object(fields)
}

// -----------------------------------------------------------------------------
// Codecs: IntentResolution
// -----------------------------------------------------------------------------

/// Dynamic decoder for `IntentResolution`.
pub fn intent_resolution_decoder() -> decode.Decoder(IntentResolution) {
  use status <- decode.field("status", decode.string)
  case status {
    "resolved" -> {
      use h <- decode.field("handler", intent_handler_decoder())
      use dt <- decode.optional_field(
        "data",
        None,
        decode.optional(decode.dict(decode.string, decode.dynamic)),
      )
      decode.success(Resolved(handler: h, data: dt))
    }
    "disambiguate" -> {
      use act <- decode.field("action", decode.string)
      use candidates <- decode.field(
        "candidates",
        decode.list(of: intent_handler_decoder()),
      )
      use dt <- decode.optional_field(
        "data",
        None,
        decode.optional(decode.dict(decode.string, decode.dynamic)),
      )
      decode.success(Disambiguate(action: act, candidates: candidates, data: dt))
    }
    "disabled_candidate" -> {
      use act <- decode.field("action", decode.string)
      use candidate <- decode.field("candidate", intent_handler_decoder())
      use dt <- decode.optional_field(
        "data",
        None,
        decode.optional(decode.dict(decode.string, decode.dynamic)),
      )
      decode.success(DisabledCandidate(
        action: act,
        candidate: candidate,
        data: dt,
      ))
    }
    "no_handler" -> {
      use act <- decode.field("action", decode.string)
      decode.success(NoHandler(action: act))
    }
    "denied" -> {
      use act <- decode.field("action", decode.string)
      use reason <- decode.field("reason", decode.string)
      decode.success(Denied(action: act, reason: reason))
    }
    _ -> decode.failure(NoHandler("unknown"), "valid IntentResolution status")
  }
}

/// Convert an `IntentResolution` into `gleam/json.Json`.
pub fn intent_resolution_to_json(res: IntentResolution) -> json.Json {
  case res {
    Resolved(h, dt) -> {
      let fields = [
        #("status", json.string("resolved")),
        #("handler", intent_handler_to_json(h)),
      ]
      let fields = case dt {
        Some(data_dict) -> [
          #(
            "data",
            json.object(
              dict.to_list(data_dict)
              |> list.map(fn(pair) { #(pair.0, action.dynamic_to_json(pair.1)) }),
            ),
          ),
          ..fields
        ]
        None -> fields
      }
      json.object(fields)
    }

    Disambiguate(act, candidates, dt) -> {
      let fields = [
        #("status", json.string("disambiguate")),
        #("action", json.string(act)),
        #("candidates", json.array(candidates, of: intent_handler_to_json)),
      ]
      let fields = case dt {
        Some(data_dict) -> [
          #(
            "data",
            json.object(
              dict.to_list(data_dict)
              |> list.map(fn(pair) { #(pair.0, action.dynamic_to_json(pair.1)) }),
            ),
          ),
          ..fields
        ]
        None -> fields
      }
      json.object(fields)
    }

    DisabledCandidate(act, candidate, dt) -> {
      let fields = [
        #("status", json.string("disabled_candidate")),
        #("action", json.string(act)),
        #("candidate", intent_handler_to_json(candidate)),
      ]
      let fields = case dt {
        Some(data_dict) -> [
          #(
            "data",
            json.object(
              dict.to_list(data_dict)
              |> list.map(fn(pair) { #(pair.0, action.dynamic_to_json(pair.1)) }),
            ),
          ),
          ..fields
        ]
        None -> fields
      }
      json.object(fields)
    }

    NoHandler(act) ->
      json.object([
        #("status", json.string("no_handler")),
        #("action", json.string(act)),
      ])

    Denied(act, reason) ->
      json.object([
        #("status", json.string("denied")),
        #("action", json.string(act)),
        #("reason", json.string(reason)),
      ])
  }
}
