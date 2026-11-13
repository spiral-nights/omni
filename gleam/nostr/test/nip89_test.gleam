import gleam/option.{None, Some}
import gleam/string
import gleeunit/should
import omni/nostr/event.{type Event, Event}
import omni/nostr/event_id
import omni/nostr/kind
import omni/nostr/nip89
import omni/nostr/pubkey

fn hex_suffix(suffix: String) -> String {
  string.pad_start(suffix, to: 64, with: "0")
}

fn make_event(
  id_suffix: String,
  pubkey_suffix: String,
  kind_int: Int,
  tags: List(List(String)),
  content: String,
) -> Event {
  let assert Ok(id) = event_id.parse(hex_suffix(id_suffix))
  let assert Ok(pk) = pubkey.parse(hex_suffix(pubkey_suffix))
  Event(
    id: id,
    pubkey: pk,
    created_at: 1_700_000_000,
    kind: kind.from_int(kind_int),
    tags: tags,
    content: content,
    sig: "sig",
  )
}

pub fn parse_recommendation_and_handler_info_test() {
  let handler_pubkey = hex_suffix("5")
  let recommendation =
    make_event(
      "a",
      "b",
      nip89.recommendation_kind_int,
      [
        ["d", "1"],
        ["a", "31990:" <> handler_pubkey <> ":handler-x", "wss://relay.example"],
      ],
      "",
    )

  let assert Some(parsed) = nip89.parse_recommendation(recommendation)
  parsed.kind |> should.equal(1)
  let assert [reference] = parsed.handlers
  reference.pubkey |> should.equal(handler_pubkey)
  reference.identifier |> should.equal("handler-x")
  reference.relays |> should.equal(["wss://relay.example"])

  let info =
    make_event(
      "c",
      "5",
      nip89.handler_info_kind_int,
      [
        ["d", "handler-x"],
        ["k", "1"],
        ["k", "7"],
        ["web", "https://handler.example"],
      ],
      "{\"name\":\"Handler X\",\"about\":\"notes\",\"picture\":\"https://img\"}",
    )

  let assert Some(handler) = nip89.parse_handler_info(info)
  handler.name |> should.equal("Handler X")
  handler.about |> should.equal("notes")
  handler.picture |> should.equal(Some("https://img"))
  handler.web |> should.equal(Some("https://handler.example"))
  handler.supported_kinds |> should.equal([1, 7])
  handler.coordinate
  |> should.equal("31990:" <> handler_pubkey <> ":handler-x")
}

pub fn non_nip89_events_are_ignored_test() {
  let event = make_event("d", "e", 1, [["d", "1"]], "")
  nip89.parse_recommendation(event) |> should.equal(None)
  nip89.parse_handler_info(event) |> should.equal(None)
}
