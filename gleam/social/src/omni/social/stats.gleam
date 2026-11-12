//// Pure reducer for Nostr note interaction statistics (Kind 1 replies, Kind 6 reposts,
//// Kind 7 reactions, and Kind 9735 zap receipts).

import gleam/dict.{type Dict}
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import omni/nostr/event.{type Event}
import omni/nostr/event_id
import omni/nostr/kind
import omni/nostr/pubkey

/// Aggregated interaction counts and current-user status flags for a note.
pub type NoteStats {
  NoteStats(
    note_id: String,
    likes: Int,
    reposts: Int,
    replies: Int,
    zaps: Int,
    zap_sats: Int,
    liked_by_me: Bool,
    reposted_by_me: Bool,
  )
}

/// Create an empty `NoteStats` record with zeroed counters for `note_id`.
pub fn empty_stats(note_id: String) -> NoteStats {
  NoteStats(
    note_id: note_id,
    likes: 0,
    reposts: 0,
    replies: 0,
    zaps: 0,
    zap_sats: 0,
    liked_by_me: False,
    reposted_by_me: False,
  )
}

/// Apply a single Nostr `Event` to a dictionary of `NoteStats`.
///
/// Handles:
/// - `Kind 7` reactions (excluding `"-"` dislikes), referencing the target note via the last `"e"` tag
/// - `Kind 6` reposts, referencing the target note via the last `"e"` tag
/// - `Kind 1` replies, referencing the target note via NIP-10 `"reply"` marker or last `"e"` tag
/// - `Kind 9735` zap receipts, referencing the target note via the last `"e"` tag and parsing optional `"amount"` / `"sats"` tags
pub fn apply_event(
  stats_map: Dict(String, NoteStats),
  ev: Event,
  my_pubkey: Option(String),
) -> Dict(String, NoteStats) {
  let target_opt = resolve_target_note_id(ev)
  case target_opt {
    None -> stats_map
    Some(target_id) -> {
      let ev_id_hex = event_id.to_hex(ev.id)
      case target_id == "" || target_id == ev_id_hex {
        True -> stats_map
        False -> {
          let current = case dict.get(stats_map, target_id) {
            Ok(existing) -> existing
            Error(Nil) -> empty_stats(target_id)
          }
          let is_me = case my_pubkey {
            Some(me) -> {
              let clean_me = string.lowercase(string.trim(me))
              clean_me != "" && clean_me == pubkey.to_hex(ev.pubkey)
            }
            None -> False
          }

          case ev.kind {
            kind.Reaction -> {
              let content = string.trim(ev.content)
              case content == "-" {
                True -> stats_map
                False -> {
                  let updated =
                    NoteStats(
                      ..current,
                      likes: current.likes + 1,
                      liked_by_me: current.liked_by_me || is_me,
                    )
                  dict.insert(stats_map, target_id, updated)
                }
              }
            }

            kind.Repost -> {
              let updated =
                NoteStats(
                  ..current,
                  reposts: current.reposts + 1,
                  reposted_by_me: current.reposted_by_me || is_me,
                )
              dict.insert(stats_map, target_id, updated)
            }

            kind.Note -> {
              let updated = NoteStats(..current, replies: current.replies + 1)
              dict.insert(stats_map, target_id, updated)
            }

            kind.Zap -> {
              let sats = extract_zap_sats(ev.tags)
              let updated =
                NoteStats(
                  ..current,
                  zaps: current.zaps + 1,
                  zap_sats: current.zap_sats + sats,
                )
              dict.insert(stats_map, target_id, updated)
            }

            _ -> stats_map
          }
        }
      }
    }
  }
}

/// Mark a note as liked by the current user without changing the count.
/// The real reaction event supplies the count when it is ingested.
pub fn mark_liked(
  stats_map: Dict(String, NoteStats),
  note_id: String,
) -> Dict(String, NoteStats) {
  let current = case dict.get(stats_map, note_id) {
    Ok(existing) -> existing
    Error(Nil) -> empty_stats(note_id)
  }
  dict.insert(stats_map, note_id, NoteStats(..current, liked_by_me: True))
}

/// Mark a note as reposted by the current user without changing the count.
pub fn mark_reposted(
  stats_map: Dict(String, NoteStats),
  note_id: String,
) -> Dict(String, NoteStats) {
  let current = case dict.get(stats_map, note_id) {
    Ok(existing) -> existing
    Error(Nil) -> empty_stats(note_id)
  }
  dict.insert(stats_map, note_id, NoteStats(..current, reposted_by_me: True))
}

/// Apply a list of `Event` values to produce an aggregated `Dict(String, NoteStats)`.
pub fn apply_events(
  events: List(Event),
  my_pubkey: Option(String),
) -> Dict(String, NoteStats) {
  let deduped = deduplicate_events(events)
  list.fold(deduped, dict.new(), fn(acc, ev) { apply_event(acc, ev, my_pubkey) })
}

fn deduplicate_events(events: List(Event)) -> List(Event) {
  let #(_seen, kept) =
    list.fold(events, #([], []), fn(state, ev) {
      let #(seen_ids, acc) = state
      let id_hex = event_id.to_hex(ev.id)
      case list.contains(seen_ids, id_hex) {
        True -> state
        False -> #([id_hex, ..seen_ids], [ev, ..acc])
      }
    })
  list.reverse(kept)
}

fn resolve_target_note_id(ev: Event) -> Option(String) {
  let e_tags = event.get_tags(ev.tags, "e")
  case ev.kind {
    kind.Note -> {
      // Check for NIP-10 marked "reply" first, then "root", then last "e" tag
      let marked_reply =
        list.find_map(e_tags, fn(tag) {
          case tag {
            ["e", id, _relay, "reply", ..] if id != "" -> Ok(id)
            ["e", id, "reply"] if id != "" -> Ok(id)
            _ -> Error(Nil)
          }
        })
      case marked_reply {
        Ok(id) -> Some(string.trim(id))
        Error(Nil) -> last_e_tag_value(e_tags)
      }
    }
    _ -> last_e_tag_value(e_tags)
  }
}

fn last_e_tag_value(e_tags: List(List(String))) -> Option(String) {
  let values =
    list.filter_map(e_tags, fn(tag) {
      case tag {
        ["e", id, ..] -> {
          let trimmed = string.trim(id)
          case trimmed {
            "" -> Error(Nil)
            _ -> Ok(trimmed)
          }
        }
        _ -> Error(Nil)
      }
    })
  list.last(values) |> option.from_result
}

fn extract_zap_sats(tags: List(List(String))) -> Int {
  // Check ["sats", "<n>"] first, then ["amount", "<msats>"]
  case event.get_tag_values(tags, "sats") {
    [raw_sats, ..] ->
      case int.parse(string.trim(raw_sats)) {
        Ok(s) if s > 0 -> s
        _ -> 0
      }
    [] ->
      case event.get_tag_values(tags, "amount") {
        [raw_msats, ..] ->
          case int.parse(string.trim(raw_msats)) {
            Ok(msats) if msats >= 1000 -> msats / 1000
            Ok(msats) if msats > 0 -> msats
            _ -> 0
          }
        [] -> 0
      }
  }
}
