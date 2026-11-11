//// Nostr event types, tag manipulation helpers, and canonical NIP-01 serialization.

import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import omni/nostr/event_id.{type EventId}
import omni/nostr/kind.{type Kind}
import omni/nostr/pubkey.{type Pubkey}

/// A fully signed Nostr protocol event (NIP-01).
pub type Event {
  Event(
    id: EventId,
    pubkey: Pubkey,
    created_at: Int,
    kind: Kind,
    tags: List(List(String)),
    content: String,
    sig: String,
  )
}

/// An unsigned Nostr event draft (prior to ID calculation and Schnorr signing).
pub type UnsignedEvent {
  UnsignedEvent(
    pubkey: Option(Pubkey),
    created_at: Int,
    kind: Kind,
    tags: List(List(String)),
    content: String,
  )
}

/// Filter tags by tag name (the first item of each tag list).
///
/// Example: `get_tags(tags, "e")` returns all `["e", ...]` tags.
pub fn get_tags(tags: List(List(String)), name: String) -> List(List(String)) {
  list.filter(tags, fn(tag) {
    case tag {
      [tag_name, ..] if tag_name == name -> True
      _ -> False
    }
  })
}

/// Extract the values (second item) of all tags matching `name`.
///
/// Example: for tags `[["p", "pk1"], ["e", "ev1"], ["p", "pk2"]]`,
/// `get_tag_values(tags, "p")` returns `["pk1", "pk2"]`.
pub fn get_tag_values(tags: List(List(String)), name: String) -> List(String) {
  list.filter_map(tags, fn(tag) {
    case tag {
      [tag_name, value, ..] if tag_name == name -> Ok(value)
      _ -> Error(Nil)
    }
  })
}

/// Extract the value of the first "d" tag (NIP-33 / NIP-78 identifier), if present.
pub fn d_tag(tags: List(List(String))) -> Option(String) {
  case get_tag_values(tags, "d") {
    [value, ..] -> Some(value)
    [] -> None
  }
}

/// Serialize event fields to canonical NIP-01 JSON for ID calculation:
/// `[0, <pubkey-hex>, <created_at>, <kind-int>, <tags>, <content>]`
pub fn serialize_for_id(
  pubkey: Pubkey,
  created_at: Int,
  kind: Kind,
  tags: List(List(String)),
  content: String,
) -> String {
  json.preprocessed_array([
    json.int(0),
    json.string(pubkey.to_hex(pubkey)),
    json.int(created_at),
    json.int(kind.to_int(kind)),
    json.array(tags, of: fn(tag) { json.array(tag, of: json.string) }),
    json.string(content),
  ])
  |> json.to_string
}

/// Serialize a signed `Event` for event ID verification or hashing.
pub fn serialize_event_for_id(event: Event) -> String {
  serialize_for_id(
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  )
}

/// Serialize an `UnsignedEvent` with a given author `Pubkey` for ID calculation.
pub fn serialize_unsigned_for_id(
  unsigned: UnsignedEvent,
  author: Pubkey,
) -> String {
  serialize_for_id(
    author,
    unsigned.created_at,
    unsigned.kind,
    unsigned.tags,
    unsigned.content,
  )
}
