import gleam/option.{None, Some}
import gleam/result
import omni/nostr/event.{Event, UnsignedEvent}
import omni/nostr/event_codec
import omni/nostr/event_id
import omni/nostr/kind
import omni/nostr/pubkey
import qcheck

pub fn event_round_trip_test() {
  let pk_hex =
    "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"
  let id_hex =
    "a2a0a221516e86ad09ad15bf73d6fe8e329ebc43f848caec0a383d46a815a770"
  let assert Ok(pk) = pubkey.parse(pk_hex)
  let assert Ok(id) = event_id.parse(id_hex)

  let ev =
    Event(
      id: id,
      pubkey: pk,
      created_at: 1_700_000_000,
      kind: kind.Note,
      tags: [["p", pk_hex], ["t", "nostr", "client"]],
      content: "Hello world!",
      sig: "e17a421234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    )

  let json_str = event_codec.encode(ev)
  let assert Ok(decoded) = event_codec.decode_json(json_str)

  assert decoded.id == ev.id
  assert decoded.pubkey == ev.pubkey
  assert decoded.created_at == ev.created_at
  assert decoded.kind == ev.kind
  assert decoded.tags == ev.tags
  assert decoded.content == ev.content
  assert decoded.sig == ev.sig
}

pub fn unsigned_event_round_trip_test() {
  let pk_hex =
    "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"
  let assert Ok(pk) = pubkey.parse(pk_hex)

  let unsigned =
    UnsignedEvent(
      pubkey: Some(pk),
      created_at: 1_700_000_000,
      kind: kind.AppData,
      tags: [["d", "omni/test"]],
      content: "{\"setting\": true}",
    )

  let json_str = event_codec.encode_unsigned(unsigned)
  let assert Ok(decoded) = event_codec.decode_unsigned_json(json_str)

  assert decoded == unsigned

  let no_pubkey =
    UnsignedEvent(
      pubkey: None,
      created_at: 1_700_000_000,
      kind: kind.Note,
      tags: [],
      content: "draft",
    )
  let no_pk_json = event_codec.encode_unsigned(no_pubkey)
  let assert Ok(decoded_no_pk) = event_codec.decode_unsigned_json(no_pk_json)
  assert decoded_no_pk == no_pubkey
}

pub fn reject_invalid_json_test() {
  assert event_codec.decode_json("{not json") |> result.is_error
  assert event_codec.decode_json("{\"id\": 123}") |> result.is_error
}

pub fn reject_bad_hex_fields_test() {
  let bad_pk =
    "{\"id\":\"a2a0a221516e86ad09ad15bf73d6fe8e329ebc43f848caec0a383d46a815a770\",\"pubkey\":\"bad\",\"created_at\":100,\"kind\":1,\"tags\":[],\"content\":\"hi\",\"sig\":\"sig\"}"
  assert event_codec.decode_json(bad_pk) |> result.is_error
}

pub fn event_property_round_trip_test() {
  let pk_hex =
    "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"
  let id_hex =
    "a2a0a221516e86ad09ad15bf73d6fe8e329ebc43f848caec0a383d46a815a770"
  let assert Ok(pk) = pubkey.parse(pk_hex)
  let assert Ok(id) = event_id.parse(id_hex)

  let gen =
    qcheck.tuple3(
      qcheck.uniform_int(),
      qcheck.small_non_negative_int(),
      qcheck.string(),
    )

  qcheck.run(qcheck.default_config(), gen, fn(tuple) {
    let #(created_at, kind_int, content) = tuple
    let ev =
      Event(
        id: id,
        pubkey: pk,
        created_at: created_at,
        kind: kind.from_int(kind_int),
        tags: [["tag", content]],
        content: content,
        sig: "validsig",
      )
    let json_str = event_codec.encode(ev)
    let assert Ok(decoded) = event_codec.decode_json(json_str)
    assert decoded == ev
  })
}
