//// Nostr Kind 3 contact list (follows) representation, mutation, and tag serialization.

import gleam/dynamic/decode.{type Decoder}
import gleam/json.{type Json}
import gleam/list
import gleam/string
import omni/nostr/event.{type Event}
import omni/nostr/pubkey
import omni/plugin_kit/local_store.{type StoreConfig, StoreConfig}

/// A user's Nostr Kind 3 contact list.
pub type Follows {
  Follows(pubkey: String, followed_pubkeys: List(String), updated_at: Int)
}

/// Create an empty `Follows` record for `pubkey`.
pub fn empty(pubkey: String) -> Follows {
  Follows(pubkey: pubkey, followed_pubkeys: [], updated_at: 0)
}

/// Extract a `Follows` list from a Kind 3 `Event`, deduplicating `"p"` tags
/// while preserving their original order.
pub fn from_event(ev: Event) -> Follows {
  let raw_p = event.get_tag_values(ev.tags, "p")
  let cleaned =
    raw_p
    |> list.map(fn(pk) { string.lowercase(string.trim(pk)) })
    |> list.filter(fn(pk) { pk != "" })
    |> list.unique

  Follows(
    pubkey: pubkey.to_hex(ev.pubkey),
    followed_pubkeys: cleaned,
    updated_at: ev.created_at,
  )
}

/// Check whether `target_pubkey` is in `follows.followed_pubkeys`.
pub fn is_following(follows: Follows, target_pubkey: String) -> Bool {
  let norm = string.lowercase(string.trim(target_pubkey))
  norm != "" && list.contains(follows.followed_pubkeys, norm)
}

/// Toggle follow status for `target_pubkey` and update `updated_at` to `now_sec`.
pub fn toggle_follow(
  follows: Follows,
  target_pubkey: String,
  now_sec: Int,
) -> Follows {
  let norm = string.lowercase(string.trim(target_pubkey))
  case norm == "" {
    True -> follows
    False ->
      case is_following(follows, norm) {
        True ->
          Follows(
            ..follows,
            followed_pubkeys: list.filter(follows.followed_pubkeys, fn(pk) {
              pk != norm
            }),
            updated_at: now_sec,
          )
        False ->
          Follows(
            ..follows,
            followed_pubkeys: list.append(follows.followed_pubkeys, [norm]),
            updated_at: now_sec,
          )
      }
  }
}

/// Serialize `follows` into NIP-02 `"p"` tags (`[["p", "<pubkey>"], ...]`).
pub fn to_tags(follows: Follows) -> List(List(String)) {
  list.map(follows.followed_pubkeys, fn(pk) { ["p", pk] })
}

/// Encode `Follows` into JSON for local storage persistence.
pub fn encode(follows: Follows) -> Json {
  json.object([
    #("pubkey", json.string(follows.pubkey)),
    #("followed_pubkeys", json.array(follows.followed_pubkeys, json.string)),
    #("updated_at", json.int(follows.updated_at)),
  ])
}

/// Decode `Follows` from JSON.
pub fn decoder() -> Decoder(Follows) {
  use pubkey <- decode.optional_field("pubkey", "", decode.string)
  use followed_pubkeys <- decode.optional_field(
    "followed_pubkeys",
    [],
    decode.list(decode.string),
  )
  use updated_at <- decode.optional_field("updated_at", 0, decode.int)
  decode.success(Follows(
    pubkey: pubkey,
    followed_pubkeys: followed_pubkeys,
    updated_at: updated_at,
  ))
}

/// Shared `local_store.StoreConfig` for persisting the user's Kind 3 follows list.
pub fn store_config() -> StoreConfig(Follows) {
  StoreConfig(
    key: "omni_social_follows_v1",
    version: 1,
    encode: encode,
    decoder: decoder(),
    default: fn() { empty("") },
  )
}
