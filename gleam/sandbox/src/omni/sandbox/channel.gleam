//// Dual-channel IPC abstraction and message framing.
////
//// Defines the dual-channel postMessage structure (`channel1_schema` for UI schema
//// and action frames, `channel2_rpc` for capability-governed JSON-RPC) and typed
//// framing definitions for `omni:init`, `omni:schema`, and `omni:action`.

import gleam/dict.{type Dict}
import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import omni/protocol/schema/action
import omni/protocol/schema/codec
import omni/protocol/schema/node.{type Node}

/// Wrapper around a browser or worker `MessagePort`.
pub type MessagePort {
  MessagePort(raw: Dynamic)
}

/// Create a `MessagePort` wrapping an underlying JavaScript dynamic object.
pub fn port_from_dynamic(raw: Dynamic) -> MessagePort {
  MessagePort(raw)
}

/// Extract the underlying dynamic reference from a `MessagePort`.
pub fn port_to_dynamic(port: MessagePort) -> Dynamic {
  port.raw
}

/// Dual-channel IPC abstraction connecting a guest plugin sandbox to the host.
pub type DualChannel {
  DualChannel(channel1_schema: MessagePort, channel2_rpc: MessagePort)
}

/// Construct a new `DualChannel` pair.
pub fn new_dual_channel(
  channel1_schema: MessagePort,
  channel2_rpc: MessagePort,
) -> DualChannel {
  DualChannel(channel1_schema: channel1_schema, channel2_rpc: channel2_rpc)
}

// -----------------------------------------------------------------------------
// Message Framing: omni:init
// -----------------------------------------------------------------------------

/// Active color theme mode for the host shell.
pub type ThemeMode {
  Light
  Dark
}

pub fn theme_mode_to_string(mode: ThemeMode) -> String {
  case mode {
    Light -> "light"
    Dark -> "dark"
  }
}

pub fn theme_mode_from_string(raw: String) -> Result(ThemeMode, Nil) {
  case raw {
    "light" -> Ok(Light)
    "dark" -> Ok(Dark)
    _ -> Error(Nil)
  }
}

/// Shell theme information injected into the sandbox on initialization.
pub type InitTheme {
  InitTheme(mode: ThemeMode, colors: Dict(String, String))
}

/// Handshake initialization payload delivered to the guest plugin sandbox.
pub type InitPayload {
  InitPayload(
    plugin_id: String,
    instance_id: String,
    user_pubkey: String,
    theme: InitTheme,
    slots: List(String),
    components: Option(List(String)),
    script_content: Option(String),
    route: Option(String),
    view_id: Option(String),
    storage: Option(Dict(String, Dynamic)),
  )
}

/// Typed envelope for `omni:init` handshake message.
pub type InitMessage {
  InitMessage(type_name: String, payload: InitPayload)
}

/// Construct a standard `omni:init` handshake message.
pub fn init_message(payload: InitPayload) -> InitMessage {
  InitMessage(type_name: "omni:init", payload: payload)
}

// -----------------------------------------------------------------------------
// Message Framing: omni:schema
// -----------------------------------------------------------------------------

/// Typed envelope for `omni:schema` component tree updates.
pub type SchemaMessage {
  SchemaMessage(type_name: String, schema: Node, component_id: Option(String))
}

/// Construct a standard `omni:schema` message.
pub fn schema_message(
  schema: Node,
  component_id: Option(String),
) -> SchemaMessage {
  SchemaMessage(
    type_name: "omni:schema",
    schema: schema,
    component_id: component_id,
  )
}

// -----------------------------------------------------------------------------
// Message Framing: omni:action
// -----------------------------------------------------------------------------

/// Typed envelope for `omni:action` user interaction dispatches.
pub type ActionMessage {
  ActionMessage(
    type_name: String,
    component_id: Option(String),
    action: String,
    payload: Dynamic,
  )
}

/// Construct a standard `omni:action` message.
pub fn action_message(
  action: String,
  payload: Dynamic,
  component_id: Option(String),
) -> ActionMessage {
  ActionMessage(
    type_name: "omni:action",
    component_id: component_id,
    action: action,
    payload: payload,
  )
}

// -----------------------------------------------------------------------------
// Channel Message ADT
// -----------------------------------------------------------------------------

/// Exhaustive union of all channel message types.
pub type ChannelMessage {
  InitMsg(InitMessage)
  SchemaMsg(SchemaMessage)
  ActionMsg(ActionMessage)
}

// -----------------------------------------------------------------------------
// JSON Codecs
// -----------------------------------------------------------------------------

pub fn init_theme_to_json(theme: InitTheme) -> json.Json {
  json.object([
    #("mode", json.string(theme_mode_to_string(theme.mode))),
    #(
      "colors",
      json.object(
        dict.to_list(theme.colors)
        |> list.map(fn(pair) { #(pair.0, json.string(pair.1)) }),
      ),
    ),
  ])
}

pub fn init_theme_decoder() -> decode.Decoder(InitTheme) {
  use mode_str <- decode.field("mode", decode.string)
  use colors <- decode.field(
    "colors",
    decode.dict(decode.string, decode.string),
  )
  let mode = case theme_mode_from_string(mode_str) {
    Ok(m) -> m
    Error(Nil) -> Dark
  }
  decode.success(InitTheme(mode: mode, colors: colors))
}

pub fn init_payload_to_json(payload: InitPayload) -> json.Json {
  let fields = [
    #("pluginId", json.string(payload.plugin_id)),
    #("instanceId", json.string(payload.instance_id)),
    #("userPubkey", json.string(payload.user_pubkey)),
    #("theme", init_theme_to_json(payload.theme)),
    #("slots", json.array(payload.slots, json.string)),
  ]

  let fields = case payload.components {
    Some(comps) -> [#("components", json.array(comps, json.string)), ..fields]
    None -> fields
  }

  let fields = case payload.script_content {
    Some(sc) -> [#("scriptContent", json.string(sc)), ..fields]
    None -> fields
  }

  let fields = case payload.route {
    Some(r) -> [#("route", json.string(r)), ..fields]
    None -> fields
  }

  let fields = case payload.view_id {
    Some(vid) -> [#("viewId", json.string(vid)), ..fields]
    None -> fields
  }

  json.object(fields)
}

pub fn init_payload_decoder() -> decode.Decoder(InitPayload) {
  use plugin_id <- decode.field("pluginId", decode.string)
  use instance_id <- decode.field("instanceId", decode.string)
  use user_pubkey <- decode.field("userPubkey", decode.string)
  use theme <- decode.field("theme", init_theme_decoder())
  use slots <- decode.field("slots", decode.list(decode.string))
  use components <- decode.optional_field(
    "components",
    None,
    decode.optional(decode.list(decode.string)),
  )
  use script_content <- decode.optional_field(
    "scriptContent",
    None,
    decode.optional(decode.string),
  )
  use route <- decode.optional_field(
    "route",
    None,
    decode.optional(decode.string),
  )
  use view_id <- decode.optional_field(
    "viewId",
    None,
    decode.optional(decode.string),
  )
  decode.success(InitPayload(
    plugin_id: plugin_id,
    instance_id: instance_id,
    user_pubkey: user_pubkey,
    theme: theme,
    slots: slots,
    components: components,
    script_content: script_content,
    route: route,
    view_id: view_id,
    storage: None,
  ))
}

pub fn init_message_to_json(msg: InitMessage) -> json.Json {
  json.object([
    #("type", json.string(msg.type_name)),
    #("payload", init_payload_to_json(msg.payload)),
  ])
}

pub fn init_message_decoder() -> decode.Decoder(InitMessage) {
  use type_name <- decode.field("type", decode.string)
  use payload <- decode.field("payload", init_payload_decoder())
  decode.success(InitMessage(type_name: type_name, payload: payload))
}

pub fn schema_message_to_json(msg: SchemaMessage) -> json.Json {
  let fields = [
    #("type", json.string(msg.type_name)),
    #("schema", codec.node_to_json(msg.schema)),
  ]
  let fields = case msg.component_id {
    Some(cid) -> [#("componentId", json.string(cid)), ..fields]
    None -> fields
  }
  json.object(fields)
}

pub fn schema_message_decoder() -> decode.Decoder(SchemaMessage) {
  use type_name <- decode.field("type", decode.string)
  use schema <- decode.field("schema", codec.node_decoder())
  use component_id <- decode.optional_field(
    "componentId",
    None,
    decode.optional(decode.string),
  )
  decode.success(SchemaMessage(
    type_name: type_name,
    schema: schema,
    component_id: component_id,
  ))
}

pub fn action_message_to_json(msg: ActionMessage) -> json.Json {
  let fields = [
    #("type", json.string(msg.type_name)),
    #("action", json.string(msg.action)),
    #("payload", action.dynamic_to_json(msg.payload)),
  ]
  let fields = case msg.component_id {
    Some(cid) -> [#("componentId", json.string(cid)), ..fields]
    None -> fields
  }
  json.object(fields)
}

pub fn action_message_decoder() -> decode.Decoder(ActionMessage) {
  use type_name <- decode.field("type", decode.string)
  use action <- decode.field("action", decode.string)
  use payload <- decode.optional_field("payload", dynamic.nil(), decode.dynamic)
  use component_id <- decode.optional_field(
    "componentId",
    None,
    decode.optional(decode.string),
  )
  decode.success(ActionMessage(
    type_name: type_name,
    component_id: component_id,
    action: action,
    payload: payload,
  ))
}

pub fn channel_message_decoder() -> decode.Decoder(ChannelMessage) {
  use type_name <- decode.field("type", decode.string)
  case type_name {
    "omni:init" -> {
      use msg <- decode.then(init_message_decoder())
      decode.success(InitMsg(msg))
    }
    "omni:schema" | "schema" -> {
      use msg <- decode.then(schema_message_decoder())
      decode.success(SchemaMsg(msg))
    }
    "omni:action" -> {
      use msg <- decode.then(action_message_decoder())
      decode.success(ActionMsg(msg))
    }
    _ ->
      decode.failure(
        InitMsg(
          init_message(InitPayload(
            plugin_id: "",
            instance_id: "",
            user_pubkey: "",
            theme: InitTheme(mode: Dark, colors: dict.new()),
            slots: [],
            components: None,
            script_content: None,
            route: None,
            view_id: None,
            storage: None,
          )),
        ),
        "known omni message type",
      )
  }
}
