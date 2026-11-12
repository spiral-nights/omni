//// Per-author NIP-65 relay-hint cache used for outbox/gossip routing.
////
//// Maps an author pubkey to the read relays from their latest kind-10002
//// event, with TTLs for both positive and negative lookups. The cache is
//// in-memory only; the host seeds the local user's own list at boot.

import gleam/dict
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/set.{type Set}
import gleam/string
import omni/nostr/event.{type Event}
import omni/nostr/kind.{type Kind}
import omni/nostr/nip65
import omni/nostr/pubkey
import omni/platform/clock
import omni/platform/ref

/// How long a positive relay-list entry stays fresh.
pub const hint_ttl_ms = 86_400_000

/// How long a "this author has no relay list" entry stays fresh.
pub const negative_ttl_ms = 300_000

type HintEntry {
  HintEntry(read_relays: List(String), fetched_at_ms: Int, found: Bool)
}

/// Cached NIP-65 read relays per author plus in-flight refresh tracking.
pub opaque type RelayHintCache {
  RelayHintCache(
    entries: ref.Ref(dict.Dict(String, HintEntry)),
    in_flight: ref.Ref(Set(String)),
    clock: clock.Clock,
  )
}

pub fn new(clock: clock.Clock) -> RelayHintCache {
  RelayHintCache(
    entries: ref.new(dict.new()),
    in_flight: ref.new(set.new()),
    clock: clock,
  )
}

/// Look up the read relays for `author`. Returns `None` on a cache miss,
/// an expired entry, or a cached "no relay list" result.
pub fn lookup(cache: RelayHintCache, author: String) -> Option(List(String)) {
  let now = cache.clock.now_ms()
  case dict.get(ref.get(cache.entries), normalize(author)) {
    Error(Nil) -> None
    Ok(entry) ->
      case entry.found, now - entry.fetched_at_ms <= hint_ttl_ms {
        True, True -> Some(entry.read_relays)
        False, _ ->
          case now - entry.fetched_at_ms <= negative_ttl_ms {
            True -> None
            False -> None
          }
        _, False -> None
      }
  }
}

/// Store the read relays for `author`.
pub fn put(
  cache: RelayHintCache,
  author: String,
  read_relays: List(String),
) -> Nil {
  let entry =
    HintEntry(
      read_relays: read_relays,
      fetched_at_ms: cache.clock.now_ms(),
      found: True,
    )
  ref.update(cache.entries, fn(entries) {
    dict.insert(entries, normalize(author), entry)
  })
}

/// Cache a negative result so authors without a relay list are not refetched.
pub fn put_missing(cache: RelayHintCache, author: String) -> Nil {
  let entry =
    HintEntry(
      read_relays: [],
      fetched_at_ms: cache.clock.now_ms(),
      found: False,
    )
  ref.update(cache.entries, fn(entries) {
    dict.insert(entries, normalize(author), entry)
  })
}

/// Seed the cache from a kind-10002 event's tags.
pub fn seed_from_event(cache: RelayHintCache, event: Event) -> Nil {
  case kind.to_int(event.kind) == 10_002 {
    True ->
      put(cache, pubkey.to_hex(event.pubkey), nip65.read_relays(event.tags))
    False -> Nil
  }
}

/// Compatibility helper for a `Kind` value.
pub fn is_relay_list(kind: Kind) -> Bool {
  kind.to_int(kind) == 10_002
}

pub fn begin_fetch(
  cache: RelayHintCache,
  authors: List(String),
) -> List(String) {
  let wanted =
    list.filter(authors, fn(author) {
      !set.contains(ref.get(cache.in_flight), normalize(author))
    })
  ref.update(cache.in_flight, fn(in_flight) {
    list.fold(wanted, in_flight, fn(acc, author) {
      set.insert(acc, normalize(author))
    })
  })
  wanted
}

pub fn finish_fetch(cache: RelayHintCache, authors: List(String)) -> Nil {
  ref.update(cache.in_flight, fn(in_flight) {
    list.fold(authors, in_flight, fn(acc, author) {
      set.delete(acc, normalize(author))
    })
  })
}

fn normalize(author: String) -> String {
  author |> string.trim |> string.lowercase
}
