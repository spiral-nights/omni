//// Pure indexing, query planning, sorting, and matching logic for the local event store.
////
//// This module contains no I/O, no promises, and no side effects.

import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/order.{type Order}
import gleam/set
import gleam/string
import omni/nostr/event.{type Event}
import omni/nostr/event_id
import omni/nostr/filter.{type Filter}
import omni/nostr/kind
import omni/nostr/pubkey.{type Pubkey}
import omni/nostr/replaceable
import omni/platform/idb.{type StoreDef, IndexDef, StoreDef}

/// The IndexedDB object store name for persisted Nostr events.
pub const events_store_name = "events"

/// Returns the schema definition for the "events" object store and its secondary indices.
pub fn store_def() -> StoreDef {
  StoreDef(
    name: events_store_name,
    key_path: Some("id"),
    auto_increment: False,
    indexes: [
      IndexDef(name: "pubkey", key_path: "pubkey", unique: False),
      IndexDef(name: "kind", key_path: "kind", unique: False),
      IndexDef(name: "created_at", key_path: "created_at", unique: False),
    ],
  )
}

/// Applies the schema creation to an open IndexedDB upgrade migration.
pub fn upgrade_schema(upgrade: idb.IdbUpgrade) -> Result(Nil, String) {
  upgrade.create_store(store_def())
}

/// Query execution plan determining which IndexedDB index or scan strategy to use.
pub type QueryPlan {
  ByIds(List(String))
  ByPubkey(String)
  ByKind(Int)
  ScanAll
}

/// Plans the most selective query strategy for a given `Filter`.
pub fn plan_query(filter: Filter) -> QueryPlan {
  case filter.ids {
    Some([_, ..] as ids) -> {
      let all_full_hex =
        list.all(ids, fn(id) { string.length(string.trim(id)) == 64 })
      case all_full_hex {
        True -> ByIds(ids)
        False -> ScanAll
      }
    }
    _ ->
      case filter.authors {
        Some([author]) ->
          case string.length(string.trim(author)) == 64 {
            True -> ByPubkey(author)
            False ->
              case filter.kinds {
                Some([k]) -> ByKind(kind.to_int(k))
                _ -> ScanAll
              }
          }
        _ ->
          case filter.kinds {
            Some([k]) -> ByKind(kind.to_int(k))
            _ -> ScanAll
          }
      }
  }
}

/// Comparator sorting events newest first (`created_at` descending).
///
/// In case of matching timestamps, breaks ties deterministically by choosing
/// the lexicographically lower event ID hex.
pub fn compare_created_at_desc(a: Event, b: Event) -> Order {
  case int.compare(b.created_at, a.created_at) {
    order.Eq -> {
      let a_hex = event_id.to_hex(a.id)
      let b_hex = event_id.to_hex(b.id)
      string.compare(a_hex, b_hex)
    }
    other -> other
  }
}

/// Sorts a list of events newest first, tie-broken by event ID hex.
pub fn sort_newest_first(events: List(Event)) -> List(Event) {
  list.sort(events, by: compare_created_at_desc)
}

/// Deduplicates a list of events by event ID, preserving first-seen order.
pub fn deduplicate_by_id(events: List(Event)) -> List(Event) {
  let #(deduped, _seen) =
    list.fold(events, #([], set.new()), fn(acc, ev) {
      let #(res, seen) = acc
      let hex = event_id.to_hex(ev.id)
      case set.contains(seen, hex) {
        True -> #(res, seen)
        False -> #([ev, ..res], set.insert(seen, hex))
      }
    })
  list.reverse(deduped)
}

/// Filters a list of events according to the criteria in `Filter`.
pub fn filter_events(events: List(Event), f: Filter) -> List(Event) {
  list.filter(events, fn(ev) { filter.matches(ev, f) })
}

/// Checks whether an event is a transient public social note (kind 1, 6, 7).
pub fn is_transient_note(event: Event) -> Bool {
  case kind.to_int(event.kind) {
    1 | 6 | 7 -> True
    _ -> False
  }
}

/// Returns `True` if `existing` and `incoming` target the exact same replaceable slot
/// (same author pubkey, same kind, and if addressable, same "d" tag).
pub fn matches_replaceable_target(existing: Event, incoming: Event) -> Bool {
  let same_author =
    pubkey.to_hex(existing.pubkey) == pubkey.to_hex(incoming.pubkey)
  let same_kind = kind.to_int(existing.kind) == kind.to_int(incoming.kind)
  case same_author && same_kind {
    False -> False
    True -> {
      case replaceable.is_replaceable(incoming.kind) {
        True -> True
        False ->
          case replaceable.is_addressable(incoming.kind) {
            True ->
              replaceable.get_d_tag(existing) == replaceable.get_d_tag(incoming)
            False -> False
          }
      }
    }
  }
}

/// Evaluates whether an authored event should be deleted by a NIP-09 deletion event (kind 5).
pub fn matches_deletion(existing: Event, deletion_event: Event) -> Bool {
  case kind.to_int(deletion_event.kind) == 5 {
    False -> False
    True -> {
      let same_author =
        pubkey.to_hex(existing.pubkey) == pubkey.to_hex(deletion_event.pubkey)
      case same_author {
        False -> False
        True -> {
          let target_ids = event.get_tag_values(deletion_event.tags, "e")
          let existing_id_hex = event_id.to_hex(existing.id)
          case list.contains(target_ids, existing_id_hex) {
            True -> True
            False -> {
              case replaceable.coordinate(existing) {
                Some(coord) -> {
                  let target_coords =
                    event.get_tag_values(deletion_event.tags, "a")
                  list.contains(target_coords, coord)
                }
                None -> False
              }
            }
          }
        }
      }
    }
  }
}

/// Finds non-user transient notes (kinds 1, 6, 7) that exceed `max_notes` per kind,
/// ordered oldest first for deletion.
pub fn find_prunable_events(
  events: List(Event),
  max_notes: Int,
  user_pubkey: Option(Pubkey),
) -> List(Event) {
  let transient_notes = list.filter(events, is_transient_note)
  let non_user_notes = case user_pubkey {
    None -> transient_notes
    Some(user_pk) -> {
      let user_hex = pubkey.to_hex(user_pk)
      list.filter(transient_notes, fn(ev) {
        pubkey.to_hex(ev.pubkey) != user_hex
      })
    }
  }

  let transient_kinds = [1, 6, 7]
  list.flat_map(transient_kinds, fn(k) {
    let for_kind =
      list.filter(non_user_notes, fn(ev) { kind.to_int(ev.kind) == k })
      |> sort_newest_first
    list.drop(for_kind, max_notes)
  })
}
