import gleam/int
import gleam/json
import gleam/result
import omni/protocol/plugin_id
import qcheck

pub fn plugin_id_valid_parse_test() {
  let assert Ok(id) = plugin_id.parse("org.omni.plugin.feed")
  assert plugin_id.to_string(id) == "org.omni.plugin.feed"

  let assert Ok(id2) = plugin_id.parse("feed")
  assert plugin_id.to_string(id2) == "feed"

  let assert Ok(id3) = plugin_id.parse("my-app_123.test")
  assert plugin_id.to_string(id3) == "my-app_123.test"
}

pub fn plugin_id_invalid_parse_test() {
  // Empty
  assert plugin_id.parse("") == Error(Nil)

  // Whitespace only
  assert plugin_id.parse("   ") == Error(Nil)

  // Untrimmed
  assert plugin_id.parse(" feed") == Error(Nil)
  assert plugin_id.parse("feed ") == Error(Nil)

  // Inner spaces
  assert plugin_id.parse("feed viewer") == Error(Nil)

  // Colon (reserved for namespacing)
  assert plugin_id.parse("org:omni:feed") == Error(Nil)
  assert plugin_id.parse("plugin:subId") == Error(Nil)

  // Control characters
  assert plugin_id.parse("plugin\t1") == Error(Nil)
  assert plugin_id.parse("plugin\n1") == Error(Nil)
}

pub fn plugin_id_codec_test() {
  let assert Ok(id) = plugin_id.parse("org.omni.plugin.relays")
  let json_str = plugin_id.to_json(id) |> json.to_string
  assert json_str == "\"org.omni.plugin.relays\""

  let assert Ok(decoded) = json.parse(json_str, plugin_id.decoder())
  assert plugin_id.to_string(decoded) == "org.omni.plugin.relays"

  // Decoder rejects invalid
  assert result.is_error(json.parse("\"invalid:id\"", plugin_id.decoder()))
  assert result.is_error(json.parse("\"\"", plugin_id.decoder()))
  assert result.is_error(json.parse("\" spaces \"", plugin_id.decoder()))
}

pub fn plugin_id_property_test() {
  qcheck.run(qcheck.default_config(), qcheck.bounded_int(1, 10_000), fn(n) {
    let raw = "plugin_" <> int.to_string(n)
    let assert Ok(id) = plugin_id.parse(raw)
    assert plugin_id.to_string(id) == raw
  })
}
