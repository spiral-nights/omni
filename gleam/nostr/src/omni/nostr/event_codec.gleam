//// JSON codecs for Nostr events using `gleam_json` and `gleam/dynamic/decode`.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/json
import gleam/option.{None, Some}
import omni/nostr/event.{type Event, type UnsignedEvent, Event, UnsignedEvent}
import omni/nostr/event_id.{type EventId}
import omni/nostr/kind
import omni/nostr/pubkey.{type Pubkey}

const dummy_hex =
  "0000000000000000000000000000000000000000000000000000000000000000"

fn dummy_pubkey() -> Pubkey {
  let assert Ok(pk) = pubkey.parse(dummy_hex)
  pk
}

fn dummy_event_id() -> EventId {
  let assert Ok(id) = event_id.parse(dummy_hex)
  id
}

/// Dynamic decoder for a valid 64-character hex `Pubkey`.
pub fn pubkey_decoder() -> decode.Decoder(Pubkey) {
  use raw <- decode.then(decode.string)
  case pubkey.parse(raw) {
    Ok(pk) -> decode.success(pk)
    Error(Nil) -> decode.failure(dummy_pubkey(), "64-character hex Pubkey")
  }
}

/// Dynamic decoder for a valid 64-character hex `EventId`.
pub fn event_id_decoder() -> decode.Decoder(EventId) {
  use raw <- decode.then(decode.string)
  case event_id.parse(raw) {
    Ok(id) -> decode.success(id)
    Error(Nil) -> decode.failure(dummy_event_id(), "64-character hex EventId")
  }
}

/// Dynamic decoder for a standard NIP-01 `Event`.
pub fn decoder() -> decode.Decoder(Event) {
  use id <- decode.field("id", event_id_decoder())
  use pk <- decode.field("pubkey", pubkey_decoder())
  use created_at <- decode.field("created_at", decode.int)
  use k <- decode.field("kind", decode.map(decode.int, kind.from_int))
  use tags <- decode.field(
    "tags",
    decode.list(of: decode.list(of: decode.string)),
  )
  use content <- decode.field("content", decode.string)
  use sig <- decode.field("sig", decode.string)
  decode.success(Event(
    id: id,
    pubkey: pk,
    created_at: created_at,
    kind: k,
    tags: tags,
    content: content,
    sig: sig,
  ))
}

/// Decode an `Event` from a JSON string.
pub fn decode_json(json_str: String) -> Result(Event, json.DecodeError) {
  json.parse(from: json_str, using: decoder())
}

/// Decode an `Event` from dynamic data.
pub fn from_dynamic(data: Dynamic) -> Result(Event, List(decode.DecodeError)) {
  decode.run(data, decoder())
}

/// Convert an `Event` to `gleam/json.Json`.
pub fn to_json(event: Event) -> json.Json {
  json.object([
    #("id", json.string(event_id.to_hex(event.id))),
    #("pubkey", json.string(pubkey.to_hex(event.pubkey))),
    #("created_at", json.int(event.created_at)),
    #("kind", json.int(kind.to_int(event.kind))),
    #(
      "tags",
      json.array(event.tags, of: fn(tag) { json.array(tag, of: json.string) }),
    ),
    #("content", json.string(event.content)),
    #("sig", json.string(event.sig)),
  ])
}

/// Encode an `Event` to a compact JSON string.
pub fn encode(event: Event) -> String {
  to_json(event) |> json.to_string
}

/// Dynamic decoder for an `UnsignedEvent`.
pub fn unsigned_decoder() -> decode.Decoder(UnsignedEvent) {
  let optional_pubkey_decoder = {
    use opt_str <- decode.then(decode.optional(decode.string))
    case opt_str {
      None -> decode.success(None)
      Some(raw) ->
        case pubkey.parse(raw) {
          Ok(pk) -> decode.success(Some(pk))
          Error(Nil) -> decode.failure(None, "64-character hex Pubkey")
        }
    }
  }

  use pk <- decode.optional_field("pubkey", None, optional_pubkey_decoder)
  use created_at <- decode.field("created_at", decode.int)
  use k <- decode.field("kind", decode.map(decode.int, kind.from_int))
  use tags <- decode.field(
    "tags",
    decode.list(of: decode.list(of: decode.string)),
  )
  use content <- decode.field("content", decode.string)
  decode.success(UnsignedEvent(
    pubkey: pk,
    created_at: created_at,
    kind: k,
    tags: tags,
    content: content,
  ))
}

/// Decode an `UnsignedEvent` from a JSON string.
pub fn decode_unsigned_json(
  json_str: String,
) -> Result(UnsignedEvent, json.DecodeError) {
  json.parse(from: json_str, using: unsigned_decoder())
}

/// Convert an `UnsignedEvent` to `gleam/json.Json`.
pub fn unsigned_to_json(unsigned: UnsignedEvent) -> json.Json {
  let base_fields = [
    #("created_at", json.int(unsigned.created_at)),
    #("kind", json.int(kind.to_int(unsigned.kind))),
    #(
      "tags",
      json.array(unsigned.tags, of: fn(tag) { json.array(tag, of: json.string) }),
    ),
    #("content", json.string(unsigned.content)),
  ]
  let fields = case unsigned.pubkey {
    Some(pk) -> [#("pubkey", json.string(pubkey.to_hex(pk))), ..base_fields]
    None -> base_fields
  }
  json.object(fields)
}

/// Encode an `UnsignedEvent` to a compact JSON string.
pub fn encode_unsigned(unsigned: UnsignedEvent) -> String {
  unsigned_to_json(unsigned) |> json.to_string
}
