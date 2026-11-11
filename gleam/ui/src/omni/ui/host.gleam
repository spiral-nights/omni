//// Declarative Schema UI Host (`Model`, `Msg`, `update`, `view`, `encode_action_envelope`).
////
//// Manages a live declarative Schema UI tree and routes `Action` events
//// triggered by user interactions back to a callback or Channel 1 message bus.

import gleam/dict
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import omni/protocol/schema/action.{type Action}
import omni/protocol/schema/codec
import omni/protocol/schema/node.{type Node}
import omni/ui/render

/// State model for the declarative Schema UI host.
pub type Model {
  Model(
    root: Option(Node),
    dispatched_actions: List(Action),
    on_action: fn(Action) -> Nil,
  )
}

/// Messages processed by the Schema UI host.
pub type Msg {
  SetSchema(Node)
  SetSchemaJson(String)
  ClearSchema
  TriggerAction(Action)
}

/// Initializes a new Schema UI host model with the given `on_action` callback.
pub fn init(on_action: fn(Action) -> Nil) -> Model {
  Model(root: None, dispatched_actions: [], on_action: on_action)
}

/// Updates the Schema UI host state in response to `Msg`.
pub fn update(model: Model, msg: Msg) -> Model {
  case msg {
    SetSchema(node) -> Model(..model, root: Some(node))

    SetSchemaJson(raw) ->
      case codec.decode_schema_message(raw) {
        Ok(envelope) -> Model(..model, root: Some(envelope.schema))
        Error(_) ->
          case codec.decode_node(raw) {
            Ok(node) -> Model(..model, root: Some(node))
            Error(_) -> model
          }
      }

    ClearSchema -> Model(..model, root: None)

    TriggerAction(act) -> {
      model.on_action(act)
      Model(..model, dispatched_actions: [act, ..model.dispatched_actions])
    }
  }
}

/// Renders the current Schema UI tree inside `.omni-schema-host`, mapping all
/// element `Action` events into `TriggerAction(Action)`.
pub fn view(model: Model) -> Element(Msg) {
  case model.root {
    Some(node) ->
      html.div([attribute.class("omni-schema-host")], [
        element.map(render.render(node), TriggerAction),
      ])
    None -> element.none()
  }
}

/// Encodes an `Action` into a Channel 1 `omni:action` wire JSON envelope string:
/// `{ "type": "omni:action", "action": act.name, "payload": ..., "navigate": ... }`.
pub fn encode_action_envelope(act: Action) -> String {
  let base_fields = [
    #("type", json.string("omni:action")),
    #("action", json.string(act.name)),
  ]

  let with_payload = case act.payload {
    Some(payload_dict) -> {
      let payload_json =
        json.object(
          dict.to_list(payload_dict)
          |> list.map(fn(pair) { #(pair.0, action.dynamic_to_json(pair.1)) }),
        )
      list.append(base_fields, [#("payload", payload_json)])
    }
    None -> base_fields
  }

  let with_navigate = case act.navigate {
    Some(target) ->
      list.append(with_payload, [
        #("navigate", action.navigate_target_to_json(target)),
      ])
    None -> with_payload
  }

  json.object(with_navigate)
  |> json.to_string
}
