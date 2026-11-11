//// Replaceable and addressable event resolution logic (NIP-01, NIP-16, NIP-33).
////
//// Resolves conflict between two versions of a replaceable or addressable event:
//// - Newer `created_at` timestamp wins.
//// - Ties in `created_at` are broken by choosing the event with the lowest
////   lexicographical event ID hex.

import gleam/int
import gleam/option.{type Option, None, Some}
import gleam/order
import gleam/string
import omni/nostr/event.{type Event}
import omni/nostr/event_id
import omni/nostr/kind.{type Kind}
import omni/nostr/pubkey

/// Return true if the kind is a standard replaceable event (NIP-01, NIP-16):
/// - Kind 0 (user metadata)
/// - Kind 3 (contacts)
/// - Kind 10000 <= n < 20000 (e.g. 10002 relay list metadata)
pub fn is_replaceable(k: Kind) -> Bool {
  case kind.to_int(k) {
    0 | 3 -> True
    code if code >= 10_000 && code < 20_000 -> True
    _ -> False
  }
}

/// Return true if the kind is a parameterized replaceable (addressable) event (NIP-01, NIP-33):
/// - Kind 30000 <= n < 40000 (e.g. 30000 bookmarks, 30023 longform, 30078 app data)
pub fn is_addressable(k: Kind) -> Bool {
  let code = kind.to_int(k)
  code >= 30_000 && code < 40_000
}

/// Alias for `is_addressable`.
pub const is_parameterized_replaceable = is_addressable

/// Return true if the kind is an ephemeral event (NIP-01, NIP-16):
/// - Kind 20000 <= n < 30000
pub fn is_ephemeral(k: Kind) -> Bool {
  let code = kind.to_int(k)
  code >= 20_000 && code < 30_000
}

/// Extract the "d" tag identifier for an addressable event.
///
/// Returns the first value of the "d" tag, or empty string `""` if not present (NIP-33).
pub fn get_d_tag(event: Event) -> String {
  case event.d_tag(event.tags) {
    Some(d) -> d
    None -> ""
  }
}

/// Return the canonical NIP-33 coordinate `<kind>:<pubkey>:<d-tag>` if addressable.
pub fn coordinate(event: Event) -> Option(String) {
  case is_addressable(event.kind) {
    True -> {
      let k = int.to_string(kind.to_int(event.kind))
      let pk = pubkey.to_hex(event.pubkey)
      let d = get_d_tag(event)
      Some(k <> ":" <> pk <> ":" <> d)
    }
    False -> None
  }
}

/// Determine whether `incoming` should replace `existing` in storage.
///
/// Returns `True` if and only if:
/// 1. Both events have the same author `pubkey` and the same `kind`.
/// 2. If replaceable (kind 0, 3, 10000..19999):
///    - `incoming.created_at > existing.created_at`, or
///    - `incoming.created_at == existing.created_at` and `incoming.id < existing.id` (lexicographically lower hex).
/// 3. If addressable (kind 30000..39999):
///    - Both have the same "d" tag identifier, and
///    - `incoming.created_at > existing.created_at`, or
///    - `incoming.created_at == existing.created_at` and `incoming.id < existing.id`.
/// 4. If neither replaceable nor addressable, returns `False`.
pub fn should_replace(
  existing existing: Event,
  incoming incoming: Event,
) -> Bool {
  let same_author =
    pubkey.to_hex(existing.pubkey) == pubkey.to_hex(incoming.pubkey)
  let same_kind = kind.to_int(existing.kind) == kind.to_int(incoming.kind)

  case same_author && same_kind {
    False -> False
    True -> {
      case is_replaceable(existing.kind) {
        True -> compare_recency(existing, incoming)
        False ->
          case is_addressable(existing.kind) {
            True -> {
              case get_d_tag(existing) == get_d_tag(incoming) {
                True -> compare_recency(existing, incoming)
                False -> False
              }
            }
            False -> False
          }
      }
    }
  }
}

/// Compare recency: newer `created_at` wins; tie-break with lexicographically lower hex ID.
fn compare_recency(existing: Event, incoming: Event) -> Bool {
  case incoming.created_at > existing.created_at {
    True -> True
    False ->
      case incoming.created_at < existing.created_at {
        True -> False
        False -> {
          let incoming_hex = event_id.to_hex(incoming.id)
          let existing_hex = event_id.to_hex(existing.id)
          string.compare(incoming_hex, existing_hex) == order.Lt
        }
      }
  }
}
