import gleam/dict
import gleam/json
import gleam/option.{None, Some}
import gleam/string
import omni/platform/json as platform_json
import omni/protocol/schema/builder
import omni/sandbox/channel.{Dark, InitMsg, InitPayload, InitTheme, Light}

pub fn message_port_wrapping_test() {
  let assert Ok(raw) = platform_json.parse_dynamic("\"fake-port\"")
  let port = channel.port_from_dynamic(raw)
  assert channel.port_to_dynamic(port) == raw
}

pub fn dual_channel_creation_test() {
  let assert Ok(p1_raw) = platform_json.parse_dynamic("\"port1\"")
  let assert Ok(p2_raw) = platform_json.parse_dynamic("\"port2\"")
  let p1 = channel.port_from_dynamic(p1_raw)
  let p2 = channel.port_from_dynamic(p2_raw)
  let dc = channel.new_dual_channel(p1, p2)
  assert dc.channel1_schema == p1
  assert dc.channel2_rpc == p2
}

pub fn init_message_roundtrip_test() {
  let theme =
    InitTheme(
      mode: Dark,
      colors: dict.from_list([#("--omni-bg-canvas", "#141312")]),
    )
  let payload =
    InitPayload(
      plugin_id: "org.omni.plugin.test",
      instance_id: "inst-1",
      user_pubkey: "npub123",
      theme: theme,
      slots: ["main", "dock"],
      components: Some(["card", "button"]),
      script_content: Some("console.log('hello')"),
      route: Some("/test"),
      view_id: Some("main"),
      storage: None,
    )
  let msg = channel.init_message(payload)
  let json_str = channel.init_message_to_json(msg) |> json.to_string

  case json.parse(from: json_str, using: channel.init_message_decoder()) {
    Ok(decoded) -> {
      assert decoded.type_name == "omni:init"
      assert decoded.payload.plugin_id == "org.omni.plugin.test"
      assert decoded.payload.instance_id == "inst-1"
      assert decoded.payload.user_pubkey == "npub123"
      assert decoded.payload.theme.mode == Dark
      assert decoded.payload.slots == ["main", "dock"]
      assert decoded.payload.components == Some(["card", "button"])
      assert decoded.payload.route == Some("/test")
    }
    Error(_) -> panic as "failed to decode init message"
  }
}

pub fn schema_message_roundtrip_test() {
  let node_tree = builder.card()
  let msg = channel.schema_message(node_tree, Some("main-comp"))
  let json_str = channel.schema_message_to_json(msg) |> json.to_string

  case json.parse(from: json_str, using: channel.schema_message_decoder()) {
    Ok(decoded) -> {
      assert decoded.type_name == "omni:schema"
      assert decoded.component_id == Some("main-comp")
    }
    Error(_) -> panic as "failed to decode schema message"
  }
}

pub fn action_message_roundtrip_test() {
  let assert Ok(dyn_payload) =
    platform_json.parse_dynamic("{\"key\":\"value\"}")
  let msg = channel.action_message("like_click", dyn_payload, Some("card-1"))
  let json_str = channel.action_message_to_json(msg) |> json.to_string

  case json.parse(from: json_str, using: channel.action_message_decoder()) {
    Ok(decoded) -> {
      assert decoded.type_name == "omni:action"
      assert decoded.action == "like_click"
      assert decoded.component_id == Some("card-1")
    }
    Error(err) -> panic as string.inspect(err)
  }
}

pub fn channel_message_decoder_dispatch_test() {
  let init_json =
    "{\"type\":\"omni:init\",\"payload\":{\"pluginId\":\"p1\",\"instanceId\":\"i1\",\"userPubkey\":\"k1\",\"theme\":{\"mode\":\"light\",\"colors\":{}},\"slots\":[\"main\"]}}"
  case json.parse(from: init_json, using: channel.channel_message_decoder()) {
    Ok(InitMsg(init)) -> {
      assert init.payload.plugin_id == "p1"
      assert init.payload.theme.mode == Light
    }
    _ -> panic as "expected InitMsg"
  }
}
