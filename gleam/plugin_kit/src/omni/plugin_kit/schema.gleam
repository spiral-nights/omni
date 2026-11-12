//// Ergonomic re-exports and plugin-level helpers for Omni Server-Driven UI Schema.
////
//// Wraps `omni/protocol/schema/{node, builder, action, style, codec}` and provides
//// standard Channel 1 postMessage wire encoders and decoders.

import gleam/dict
import gleam/dynamic/decode
import gleam/json
import gleam/option.{type Option, None, Some}
import omni/protocol/schema/action as schema_action
import omni/protocol/schema/builder
import omni/protocol/schema/codec
import omni/protocol/schema/node
import omni/protocol/schema/style

// -----------------------------------------------------------------------------
// Type Re-exports
// -----------------------------------------------------------------------------

pub type Node =
  node.Node

pub type NodeBase =
  node.NodeBase

pub type Action =
  schema_action.Action

pub type NavigateTarget =
  schema_action.NavigateTarget

pub type Style =
  style.Style

pub type SizeToken =
  style.SizeToken

pub type Direction =
  node.Direction

pub type Align =
  node.Align

pub type Justify =
  node.Justify

pub type TextVariant =
  node.TextVariant

pub type TextTone =
  node.TextTone

pub type BadgeTone =
  node.BadgeTone

pub type BadgeVariant =
  node.BadgeVariant

pub type ButtonVariant =
  node.ButtonVariant

pub type IconButtonVariant =
  node.IconButtonVariant

pub type InputType =
  node.InputType

pub type SelectOption =
  node.SelectOption

pub type TabItem =
  node.TabItem

pub type IndicatorStatus =
  node.IndicatorStatus

pub type ProgressVariant =
  node.ProgressVariant

pub type BannerTone =
  node.BannerTone

pub type MetricValue =
  node.MetricValue

pub type MetricTrend =
  node.MetricTrend

// -----------------------------------------------------------------------------
// Wire Envelope Helpers (`omni:schema` and `omni:action`)
// -----------------------------------------------------------------------------

/// Encodes a schema `Node` into the standard Channel 1 `omni:schema` postMessage JSON string:
/// `{ "type": "omni:schema", "schema": ... }`.
pub fn encode_schema_message(root: Node) -> String {
  codec.SchemaMessage(
    type_name: "omni:schema",
    schema: root,
    component_id: None,
  )
  |> codec.encode_schema_message
}

/// Encodes a schema `Node` with an optional `componentId` into an `omni:schema` JSON string.
pub fn encode_schema_message_with_id(
  root: Node,
  component_id: String,
) -> String {
  codec.SchemaMessage(
    type_name: "omni:schema",
    schema: root,
    component_id: Some(component_id),
  )
  |> codec.encode_schema_message
}

/// Decodes an incoming Channel 1 `omni:action` JSON message or a direct `Action` JSON string.
///
/// Accepts:
/// - `{ "type": "omni:action", "action": "<name>", "payload": {...}, "navigate": {...} }`
/// - `{ "type": "omni:action", "action": { "name": "<name>", "payload": {...}, "navigate": {...} } }`
/// - `{ "name": "<name>", "payload": {...}, "navigate": {...} }`
pub fn decode_action_message(raw_json: String) -> Result(Action, String) {
  let envelope_string_decoder = {
    use msg_type <- decode.field("type", decode.string)
    case msg_type {
      "omni:action" | "action" -> {
        use act_name <- decode.field("action", decode.string)
        use payload <- decode.optional_field(
          "payload",
          None,
          decode.optional(decode.dict(decode.string, decode.dynamic)),
        )
        use navigate <- decode.optional_field(
          "navigate",
          None,
          decode.optional(schema_action.navigate_target_decoder()),
        )
        decode.success(schema_action.Action(
          name: act_name,
          payload: payload,
          navigate: navigate,
        ))
      }
      other ->
        decode.failure(
          schema_action.new(""),
          "Expected omni:action envelope, got: " <> other,
        )
    }
  }

  let envelope_nested_decoder = {
    use msg_type <- decode.field("type", decode.string)
    case msg_type {
      "omni:action" | "action" -> {
        use nested <- decode.field("action", schema_action.decoder())
        decode.success(nested)
      }
      other ->
        decode.failure(
          schema_action.new(""),
          "Expected omni:action envelope, got: " <> other,
        )
    }
  }

  let combined_decoder =
    decode.one_of(envelope_string_decoder, [
      envelope_nested_decoder,
      schema_action.decoder(),
    ])

  case json.parse(from: raw_json, using: combined_decoder) {
    Ok(act) -> Ok(act)
    Error(_) -> Error("Failed to decode action message JSON")
  }
}

/// Extracts a string field from an `Action` payload dictionary, if present.
pub fn payload_string(act: Action, key: String) -> Option(String) {
  case act.payload {
    None -> None
    Some(dict_val) ->
      case dict.get(dict_val, key) {
        Ok(dyn) ->
          case decode.run(dyn, decode.string) {
            Ok(s) -> Some(s)
            Error(_) -> None
          }
        Error(Nil) -> None
      }
  }
}

/// Extracts an integer field from an `Action` payload dictionary, if present.
pub fn payload_int(act: Action, key: String) -> Option(Int) {
  case act.payload {
    None -> None
    Some(dict_val) ->
      case dict.get(dict_val, key) {
        Ok(dyn) ->
          case decode.run(dyn, decode.int) {
            Ok(i) -> Some(i)
            Error(_) -> None
          }
        Error(Nil) -> None
      }
  }
}

/// Extracts a boolean field from an `Action` payload dictionary, if present.
pub fn payload_bool(act: Action, key: String) -> Option(Bool) {
  case act.payload {
    None -> None
    Some(dict_val) ->
      case dict.get(dict_val, key) {
        Ok(dyn) ->
          case decode.run(dyn, decode.bool) {
            Ok(b) -> Some(b)
            Error(_) -> None
          }
        Error(Nil) -> None
      }
  }
}

// -----------------------------------------------------------------------------
// Builder Re-exports
// -----------------------------------------------------------------------------

pub const box = builder.box

pub const card = builder.card

pub const divider = builder.divider

pub const vertical_divider = builder.vertical_divider

pub const spacer = builder.spacer

pub const text = builder.text

pub const badge = builder.badge

pub const metric = builder.metric

pub const icon = builder.icon

pub const avatar = builder.avatar

pub const button = builder.button

pub const icon_button = builder.icon_button

pub const input = builder.input

pub const textarea = builder.textarea

pub const toggle = builder.toggle

pub const select = builder.select

pub const tabs = builder.tabs

pub const status_indicator = builder.status_indicator

pub const code_block = builder.code_block

pub const progress = builder.progress

pub const banner = builder.banner

pub const list_view = builder.list_view

pub const list_item = builder.list_item

pub const empty_state = builder.empty_state

pub const virtual_list = builder.virtual_list

pub const with_id = builder.with_id

pub const with_key = builder.with_key

pub const visible = builder.visible

pub const with_style = builder.with_style

pub const page = builder.page

pub const row = builder.row

pub const column = builder.column

pub const gap = builder.gap

pub const gap_size = builder.gap_size

pub const padding = builder.padding

pub const padding_size = builder.padding_size

pub const align = builder.align

pub const justify = builder.justify

pub const wrap = builder.wrap

pub const background = builder.background

pub const child = builder.child

pub const children = builder.children

pub const title = builder.title

pub const subtitle = builder.subtitle

pub const with_icon = builder.with_icon

pub const action = builder.action

pub const disabled = builder.disabled

pub const loading = builder.loading

pub const action_on_change = builder.action_on_change

/// Set placeholder text on an Input or Textarea.
pub const placeholder = builder.placeholder

pub const value = builder.value

pub const input_type = builder.input_type

pub const footer = builder.footer

pub const header_action = builder.header_action

pub const text_variant = builder.text_variant

pub const text_tone = builder.text_tone

pub const badge_tone = builder.badge_tone

pub const banner_tone = builder.banner_tone

pub const avatar_src = builder.avatar_src

// -----------------------------------------------------------------------------
// Action Constructor Re-exports
// -----------------------------------------------------------------------------

pub const new_action = schema_action.new

pub const with_payload = schema_action.with_payload

pub const with_navigate = schema_action.with_navigate

pub const navigate_view = schema_action.navigate_view

pub const navigate_route = schema_action.navigate_route

pub const navigate_back = schema_action.navigate_back
