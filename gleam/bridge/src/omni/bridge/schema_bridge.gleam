//// Declarative Schema bridge for guest sandboxes.
////
//// Encodes the guest's `Node` tree into the standard `omni:schema` postMessage
//// envelope and decodes host `omni:action` messages back into typed actions.

import gleam/dynamic/decode
import gleam/json
import gleam/option.{type Option}
import gleam/result
import omni/protocol/schema/action.{type Action}
import omni/protocol/schema/codec.{SchemaMessage}
import omni/protocol/schema/node.{type Node}

/// Encode a schema tree into the `omni:schema` wire JSON string.
pub fn encode_schema(node: Node, component_id: Option(String)) -> String {
  codec.encode_schema_message(SchemaMessage(
    type_name: "omni:schema",
    schema: node,
    component_id: component_id,
  ))
}

/// Decode an `omni:action` wire JSON string into a typed `Action`.
pub fn decode_action(raw_json: String) -> Result(Action, String) {
  json.parse(from: raw_json, using: action_decoder())
  |> result.map_error(fn(_err) { "invalid action message" })
}

fn action_decoder() -> decode.Decoder(Action) {
  action.decoder()
}

/// Forward an encoded schema message to the host (parent frame or worker port).
@external(javascript, "./schema_bridge.ffi.mjs", "emit_schema")
pub fn emit_schema(wire_json: String) -> Nil

/// Install an `omni:action` listener on the guest `window`.
@external(javascript, "./schema_bridge.ffi.mjs", "install_actions")
pub fn install_actions(on_action: fn(String) -> Nil) -> Nil
