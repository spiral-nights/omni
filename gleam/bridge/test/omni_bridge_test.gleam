//// Tests for the guest bridge shims (Phase 7.10).

import gleam/dict
import gleam/dynamic
import gleam/json
import gleam/option.{None, Some}
import gleam/string
import gleeunit
import gleeunit/should
import omni/bridge/links_shim
import omni/bridge/schema_bridge
import omni/bridge/share_shim
import omni/bridge/storage_shim
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
