//// Tests for the guest bridge shims (Phase 7.10).

import gleam/dict
import gleam/dynamic
import gleam/dynamic/decode
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import gleeunit
import gleeunit/should
import omni/bridge/links_shim
import omni/bridge/nostr_shim
import omni/bridge/schema_bridge
import omni/bridge/share_shim
import omni/bridge/storage_shim
import omni/bridge/websocket_shim
import omni/platform/ref
import omni/protocol/schema/action
import omni/protocol/schema/builder as schema
import omni/protocol/schema/codec

pub fn main() -> Nil {
  gleeunit.main()
}

pub fn storage_keys_are_partitioned_per_plugin_test() {
  storage_shim.partition_key("example.app.alpha", "token")
  |> should.equal("omni:plugin:example.app.alpha:token")

  storage_shim.unpartition_key(
    "example.app.alpha",
    "omni:plugin:example.app.alpha:token",
  )
  |> should.equal(Some("token"))

  storage_shim.unpartition_key(
    "example.app.alpha",
    "omni:plugin:other.app:token",
  )
  |> should.equal(None)

  storage_shim.partition_key("a", "b")
  |> should.not_equal(storage_shim.partition_key("c", "b"))
}

pub fn links_are_classified_by_scheme_test() {
  links_shim.classify("nostr:nevent1abc") |> should.equal(links_shim.NostrLink)
  links_shim.classify("LIGHTNING:lnbc1")
  |> should.equal(links_shim.LightningLink)
  links_shim.classify("cashu:...") |> should.equal(links_shim.CashuLink)
  links_shim.classify("https://example.com") |> should.equal(links_shim.WebLink)
  links_shim.classify("file:///etc/passwd")
  |> should.equal(links_shim.ExternalLink)

  links_shim.intent_for(links_shim.NostrLink)
  |> should.equal("open_nostr_uri")
  links_shim.intent_for(links_shim.LightningLink)
  |> should.equal("pay_lightning_invoice")
}

pub fn link_message_is_standard_intent_test() {
  let raw = links_shim.link_message("  nostr:npub1abc  ")
  should.be_true(string.contains(raw, "\"type\":\"omni:open-intent\""))
  should.be_true(string.contains(raw, "open_nostr_uri"))
  should.be_true(string.contains(raw, "nostr:npub1abc"))
}

pub fn share_message_includes_only_present_fields_test() {
  let full =
    share_shim.share_message(
      Some("Title"),
      Some("Some text"),
      Some("https://example.com"),
    )
  should.be_true(string.contains(full, "\"type\":\"omni:share\""))
  should.be_true(string.contains(full, "Some text"))

  let text_only = share_shim.share_message(None, Some("Just text"), None)
  should.be_false(string.contains(text_only, "\"title\""))
  should.be_false(string.contains(text_only, "\"url\""))

  let empty = share_shim.share_message(None, Some("   "), None)
  should.be_false(string.contains(empty, "\"text\""))
}

pub fn schema_encode_uses_standard_envelope_test() {
  let node = schema.text("hello")
  let wire = schema_bridge.encode_schema(node, Some("component-1"))

  should.be_true(string.contains(wire, "\"type\":\"omni:schema\""))
  should.be_true(string.contains(wire, "\"componentId\":\"component-1\""))
  should.be_true(string.contains(wire, "hello"))

  // Round-trip through the protocol codec.
  let assert Ok(decoded) = codec.decode_schema_message(wire)
  decoded.component_id |> should.equal(Some("component-1"))
}

pub fn schema_decode_action_round_trip_test() {
  let act =
    action.new("load-more")
    |> action.with_payload(dict.from_list([#("id", dynamic.string("note-1"))]))
  let wire = action.to_json(act) |> json.to_string
  let assert Ok(decoded) = schema_bridge.decode_action(wire)
  decoded.name |> should.equal("load-more")

  schema_bridge.decode_action("not json")
  |> should.equal(Error("invalid action message"))
}

// --- NIP-07 nostr shim (Phase 7.10) -----------------------------------------

pub fn subscription_ids_are_deterministic_and_distinct_test() {
  nostr_shim.subscription_id("alpha")
  |> should.equal(nostr_shim.subscription_id("alpha"))
  nostr_shim.subscription_id("alpha")
  |> should.not_equal(nostr_shim.subscription_id("beta"))
  should.be_true(string.starts_with(nostr_shim.subscription_id("alpha"), "sub_"))
}

pub fn publish_draft_is_shaped_into_event_test() {
  let draft =
    draft_dynamic(
      "{\"kind\":1,\"content\":\"hello\",\"tags\":[[\"t\",\"gm\"]]}",
    )

  let assert Ok(raw) =
    nostr_shim.publish_event_json(draft, "my-pubkey", 1_700_000_000)

  should.be_true(string.contains(raw, "\"kind\":1"))
  should.be_true(string.contains(raw, "\"content\":\"hello\""))
  should.be_true(string.contains(raw, "\"pubkey\":\"my-pubkey\""))
  should.be_true(string.contains(raw, "\"created_at\":1700000000"))
  should.be_true(string.contains(raw, "[\"t\",\"gm\"]"))
  should.be_false(string.contains(raw, "\"id\""))
  should.be_false(string.contains(raw, "\"sig\""))

  // Explicit values win over defaults.
  let explicit =
    draft_dynamic(
      "{\"kind\":30078,\"content\":\"x\",\"pubkey\":\"other\",\"created_at\":5,\"id\":\"abc\",\"sig\":\"def\"}",
    )
  let assert Ok(raw_explicit) =
    nostr_shim.publish_event_json(explicit, "my-pubkey", 1_700_000_000)
  should.be_true(string.contains(raw_explicit, "\"pubkey\":\"other\""))
  should.be_true(string.contains(raw_explicit, "\"created_at\":5"))
  should.be_true(string.contains(raw_explicit, "\"id\":\"abc\""))
  should.be_true(string.contains(raw_explicit, "\"sig\":\"def\""))

  nostr_shim.publish_event_json(draft_dynamic("{\"content\":\"x\"}"), "pk", 1)
  |> should.equal(Error("Invalid draft event to publish"))
}

// --- Virtual WebSocket shim (Phase 7.10) ------------------------------------

pub fn local_relay_urls_are_detected_test() {
  websocket_shim.is_local_url("wss://local.relay")
  |> should.equal(True)
  websocket_shim.is_local_url("wss://offline.local")
  |> should.equal(True)
  websocket_shim.is_local_url("wss://relay.damus.io")
  |> should.equal(False)
  websocket_shim.state_open |> should.equal(1)
}

pub fn req_and_close_frames_map_to_rpc_test() {
  let calls = ref.new([])
  let record = fn(method: String, params: String) {
    let _ = ref.update(calls, fn(existing) { [#(method, params), ..existing] })
  }

  websocket_shim.handle_client_frame(
    "[\"REQ\",\"sub1\",{\"kinds\":[1]}]",
    False,
    record,
  )
  |> should.equal(None)

  websocket_shim.handle_client_frame("[\"CLOSE\",\"sub1\"]", False, record)
  |> should.equal(None)

  let recorded = ref.get(calls)
  list.length(recorded) |> should.equal(2)
  let assert Ok(#(close_method, close_params)) = list.first(recorded)
  close_method |> should.equal("nostr.unsubscribe")
  should.be_true(string.contains(close_params, "sub1"))

  let assert Ok(#(sub_method, sub_params)) = list.last(recorded)
  sub_method |> should.equal("nostr.subscribe")
  should.be_true(string.contains(sub_params, "\"subscriptionId\":\"sub1\""))
  should.be_true(string.contains(sub_params, "kinds"))
}

pub fn publish_frame_returns_ok_and_rpc_test() {
  let calls = ref.new([])
  let record = fn(method: String, params: String) {
    let _ = ref.update(calls, fn(existing) { [#(method, params), ..existing] })
  }

  let event_json =
    "{\"id\":\""
    <> string.repeat("a", 64)
    <> "\",\"pubkey\":\""
    <> string.repeat("b", 64)
    <> "\",\"created_at\":1700000000,\"kind\":1,\"tags\":[],\"content\":\"hi\",\"sig\":\""
    <> string.repeat("c", 128)
    <> "\"}"
  let frame = "[\"EVENT\"," <> event_json <> "]"

  let ok = websocket_shim.handle_client_frame(frame, True, record)
  let assert Some(ok_frame) = ok
  should.be_true(string.contains(ok_frame, "\"OK\""))
  should.be_true(string.contains(ok_frame, string.repeat("a", 64)))
  should.be_true(string.contains(ok_frame, "saved-locally"))

  let assert Ok(#(method, params)) = list.first(ref.get(calls))
  method |> should.equal("nostr.publish")
  should.be_true(string.contains(params, "\"localOnly\":true"))
}

pub fn frame_builders_match_relay_wire_format_test() {
  websocket_shim.ok_frame("abc", True, "published")
  |> should.equal("[\"OK\",\"abc\",true,\"published\"]")

  websocket_shim.event_frame("sub1", "{\"id\":\"x\"}")
  |> should.equal("[\"EVENT\",\"sub1\",\"{\\\"id\\\":\\\"x\\\"}\"]")
}

fn draft_dynamic(raw: String) -> dynamic.Dynamic {
  let assert Ok(value) = json.parse(from: raw, using: decode.dynamic)
  value
}
