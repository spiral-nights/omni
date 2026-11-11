import gleam/option.{None, Some}
import gleam/result
import gleeunit/should
import omni/sandbox/protocol_shims.{
  Cashu, DispatchIntent, ExternalLink, Lightning, Nostr, OpenChooser, Web,
}

pub fn parse_nostr_uri_test() {
  let assert Ok(parsed) =
    protocol_shims.parse_protocol_uri(
      "nostr:npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6",
    )
  parsed
  |> should.equal(Nostr(
    "npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6",
  ))
  protocol_shims.to_uri_string(parsed)
  |> should.equal(
    "nostr:npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6",
  )
  protocol_shims.payload(parsed)
  |> should.equal(
    "npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6",
  )
}

pub fn parse_web_nostr_uri_test() {
  let assert Ok(parsed) =
    protocol_shims.parse_protocol_uri(
      "web+nostr:note1zddx374qmw032ulydh0msafms7w89m0m9f0f970e7s0vjh6",
    )
  parsed
  |> should.equal(Nostr("note1zddx374qmw032ulydh0msafms7w89m0m9f0f970e7s0vjh6"))
}

pub fn parse_nostr_with_slashes_test() {
  let assert Ok(parsed) =
    protocol_shims.parse_protocol_uri(
      "nostr://nevent1qqs8f0s9f80sdf80sdf80sd8f0sdf8sd0f",
    )
  parsed
  |> should.equal(Nostr("nevent1qqs8f0s9f80sdf80sdf80sd8f0sdf8sd0f"))
}

pub fn parse_raw_bech32_nostr_test() {
  let assert Ok(parsed) =
    protocol_shims.parse_protocol_uri(
      "npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6",
    )
  parsed
  |> should.equal(Nostr(
    "npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6",
  ))
}

pub fn parse_lightning_uri_test() {
  let assert Ok(parsed) =
    protocol_shims.parse_protocol_uri(
      "lightning:lnbc20m1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqhp58yjmdan79s6qqdh5ct5t42uvq98mx3gu52vx3ga8qndrf9csv8wqgqqmcqpgxqrrss9qy9qsqsp5",
    )
  parsed
  |> should.equal(Lightning(
    "lnbc20m1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqhp58yjmdan79s6qqdh5ct5t42uvq98mx3gu52vx3ga8qndrf9csv8wqgqqmcqpgxqrrss9qy9qsqsp5",
  ))
  protocol_shims.payload(parsed)
  |> should.equal(
    "lnbc20m1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqhp58yjmdan79s6qqdh5ct5t42uvq98mx3gu52vx3ga8qndrf9csv8wqgqqmcqpgxqrrss9qy9qsqsp5",
  )
}

pub fn parse_raw_lightning_test() {
  let assert Ok(parsed) =
    protocol_shims.parse_protocol_uri(
      "lnbc100n1pj0w57dsp5f54smdc5w3924q89e5v943k07s5f8",
    )
  parsed
  |> should.equal(Lightning("lnbc100n1pj0w57dsp5f54smdc5w3924q89e5v943k07s5f8"))
}

pub fn parse_cashu_uri_test() {
  let assert Ok(parsed) =
    protocol_shims.parse_protocol_uri(
      "cashu:cashuAeyJ0b2tlbiI6W3siaW5mbyI6InRlc3QifV19",
    )
  parsed
  |> should.equal(Cashu("cashuAeyJ0b2tlbiI6W3siaW5mbyI6InRlc3QifV19"))
  protocol_shims.to_uri_string(parsed)
  |> should.equal("cashu:cashuAeyJ0b2tlbiI6W3siaW5mbyI6InRlc3QifV19")
}

pub fn parse_raw_cashu_test() {
  let assert Ok(parsed) =
    protocol_shims.parse_protocol_uri(
      "cashuAeyJ0b2tlbiI6W3siaW5mbyI6InRlc3QifV19",
    )
  parsed
  |> should.equal(Cashu("cashuAeyJ0b2tlbiI6W3siaW5mbyI6InRlc3QifV19"))
}

pub fn parse_web_uri_test() {
  let assert Ok(parsed) =
    protocol_shims.parse_protocol_uri("https://nostr.band/npub1test")
  parsed |> should.equal(Web("https://nostr.band/npub1test"))
  protocol_shims.to_uri_string(parsed)
  |> should.equal("https://nostr.band/npub1test")

  let assert Ok(parsed_http) =
    protocol_shims.parse_protocol_uri("http://localhost:5173/feed")
  parsed_http |> should.equal(Web("http://localhost:5173/feed"))
}

pub fn parse_invalid_uri_test() {
  protocol_shims.parse_protocol_uri("") |> result.is_error |> should.be_true
  protocol_shims.parse_protocol_uri("   ") |> result.is_error |> should.be_true
  protocol_shims.parse_protocol_uri("unknown:scheme")
  |> result.is_error
  |> should.be_true
  protocol_shims.parse_protocol_uri("nostr:")
  |> result.is_error
  |> should.be_true
}

pub fn route_nostr_profile_intent_test() {
  let uri =
    Nostr("npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6")
  let intent = protocol_shims.route_to_intent(uri, Some("org.omni.plugin.feed"))
  intent.action |> should.equal("view_profile")
  intent.caller_plugin_id |> should.equal(Some("org.omni.plugin.feed"))
}

pub fn route_nostr_note_intent_test() {
  let uri = Nostr("note1zddx374qmw032ulydh0msafms7w89m0m9f0f970e7s0vjh6")
  let intent = protocol_shims.route_to_intent(uri, None)
  intent.action |> should.equal("view_note")
}

pub fn route_nostr_app_intent_test() {
  let uri = Nostr("naddr1qqs8f0s9f80sdf80sdf80sd8f0sdf8sd0f")
  let intent = protocol_shims.route_to_intent(uri, None)
  intent.action |> should.equal("view_app")
}

pub fn route_lightning_intent_test() {
  let uri = Lightning("lnbc100n1pj0w57dsp5")
  let intent = protocol_shims.route_to_intent(uri, None)
  intent.action |> should.equal("pay_invoice")
}

pub fn route_cashu_intent_test() {
  let uri = Cashu("cashuAeyJ0b2tlbiI6W31df")
  let intent = protocol_shims.route_to_intent(uri, None)
  intent.action |> should.equal("receive_cashu")
}

pub fn resolve_uri_single_candidate_test() {
  let uri = Nostr("note1test123")
  let resolution =
    protocol_shims.resolve_uri(uri, None, ["org.omni.plugin.feed"])
  let assert DispatchIntent(i) = resolution
  i.action |> should.equal("view_note")
}

pub fn resolve_uri_multiple_candidates_test() {
  let uri = Nostr("npub1test123")
  let resolution =
    protocol_shims.resolve_uri(uri, None, [
      "org.omni.plugin.profile-viewer", "org.omni.plugin.feed",
    ])
  let assert OpenChooser(u, candidates) = resolution
  u |> should.equal(uri)
  candidates
  |> should.equal(["org.omni.plugin.profile-viewer", "org.omni.plugin.feed"])
}

pub fn resolve_web_uri_test() {
  let uri = Web("https://example.com")
  let resolution = protocol_shims.resolve_uri(uri, None, [])
  let assert ExternalLink(url) = resolution
  url |> should.equal("https://example.com")
}
