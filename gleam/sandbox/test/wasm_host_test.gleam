import gleam/option.{None, Some}
import gleam/string
import gleeunit/should
import omni/sandbox/wasm_host.{WasmConfig}

pub fn is_wasm_content_test() {
  wasm_host.is_wasm_content("AGFzbQEAAAABFwRgAn9/AGAEf39/fw==")
  |> should.be_true

  wasm_host.is_wasm_content("data:application/wasm;base64,AGFzbQEAAAAB")
  |> should.be_true

  wasm_host.is_wasm_content("\u{0}asm\u{1}\u{0}\u{0}\u{0}")
  |> should.be_true

  wasm_host.is_wasm_content("<!DOCTYPE html><html><body>Direct</body></html>")
  |> should.be_false

  wasm_host.is_wasm_content("{\"name\": \"widget\"}")
  |> should.be_false

  wasm_host.is_wasm_content("console.log('hello');")
  |> should.be_false
}

pub fn validate_wasm_magic_test() {
  let valid_magic = <<0x00, 0x61, 0x73, 0x6D, 0x01, 0x00, 0x00, 0x00>>
  wasm_host.validate_wasm_magic(valid_magic)
  |> should.equal(Ok(Nil))

  let invalid_bytes = <<0x50, 0x4B, 0x03, 0x04>>
  wasm_host.validate_wasm_magic(invalid_bytes)
  |> should.be_error
}

pub fn extract_base64_payload_test() {
  wasm_host.extract_base64_payload("data:application/wasm;base64,AGFzbQEAAA==")
  |> should.equal("AGFzbQEAAA==")

  wasm_host.extract_base64_payload("AGFzbQEAAA==")
  |> should.equal("AGFzbQEAAA==")

  wasm_host.extract_base64_payload("  data:application/wasm;base64,XYZ123  ")
  |> should.equal("XYZ123")
}

pub fn prepare_handshake_test() {
  let config =
    WasmConfig(
      plugin_id: "example.wasm.counter",
      wasm_source: "AGFzbQ==",
      user_pubkey: Some("npub_test_123"),
      route: Some("?view=counter"),
      view_id: Some("counter"),
      theme_tokens: None,
    )

  let handshake = wasm_host.prepare_handshake(config)
  handshake.plugin_id |> should.equal("example.wasm.counter")
  handshake.user_pubkey |> should.equal("npub_test_123")
  handshake.route |> should.equal("?view=counter")
  handshake.view_id |> should.equal("counter")

  string.contains(
    handshake.payload_json,
    "\"pluginId\":\"example.wasm.counter\"",
  )
  |> should.be_true
  string.contains(handshake.payload_json, "\"userPubkey\":\"npub_test_123\"")
  |> should.be_true
}
