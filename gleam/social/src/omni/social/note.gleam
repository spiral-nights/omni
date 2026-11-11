//// Nostr Kind 1 short text note representation, NIP-10 reply tag resolution,
//// and relative timestamp formatting.

import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import omni/nostr/event.{type Event}
import omni/nostr/event_id
import omni/nostr/pubkey

/// A parsed Nostr Kind 1 short text note with resolved NIP-10 reply and mention metadata.
pub type Note {
  Note(
    id: String,
    pubkey: String,
    content: String,
    created_at: Int,
    reply_to_id: Option(String),
    root_id: Option(String),
    reply_to_pubkey: Option(String),
    mentioned_pubkeys: List(String),
    hashtags: List(String),
  )
}

/// Convert a Nostr `Event` into a domain `Note`, resolving NIP-10 `e` tags
/// (both marked `"root"` / `"reply"` and positional fallback), `p` mention tags,
/// and `t` hashtag tags.
pub fn from_event(ev: Event) -> Note {
  let e_tags = event.get_tags(ev.tags, "e")
  let #(root_id, reply_to_id) = resolve_nip10_e_tags(e_tags)

  let p_values =
    event.get_tag_values(ev.tags, "p")
    |> list.filter(fn(v) { !string.is_empty(string.trim(v)) })
    |> list.unique

  let reply_to_pubkey = case reply_to_id, p_values {
    Some(_), [first_p, ..] -> Some(first_p)
    _, _ -> None
  }

  let hashtags =
    event.get_tag_values(ev.tags, "t")
    |> list.map(fn(t) { string.lowercase(string.trim(t)) })
    |> list.filter(fn(t) { !string.is_empty(t) })
    |> list.unique

  Note(
    id: event_id.to_hex(ev.id),
    pubkey: pubkey.to_hex(ev.pubkey),
    content: ev.content,
    created_at: ev.created_at,
    reply_to_id: reply_to_id,
    root_id: root_id,
    reply_to_pubkey: reply_to_pubkey,
    mentioned_pubkeys: p_values,
    hashtags: hashtags,
  )
}

fn resolve_nip10_e_tags(
  e_tags: List(List(String)),
) -> #(Option(String), Option(String)) {
  let marked_root = find_marked_e_tag(e_tags, "root")
  let marked_reply = find_marked_e_tag(e_tags, "reply")
  let has_any_marker =
    option.is_some(marked_root)
    || option.is_some(marked_reply)
    || option.is_some(find_marked_e_tag(e_tags, "mention"))

  case has_any_marker {
    True -> {
      let resolved_root = case marked_root {
        Some(r) -> Some(r)
        None -> marked_reply
      }
      let resolved_reply = case marked_reply {
        Some(rep) -> Some(rep)
        None -> marked_root
      }
      #(resolved_root, resolved_reply)
    }
    False -> {
      // Positional NIP-10 fallback (ignoring mention tags if any)
      let ids =
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
      case ids {
        [] -> #(None, None)
        [only] -> #(Some(only), Some(only))
        [first, ..rest] -> {
          let last = case list.last(rest) {
            Ok(l) -> l
            Error(Nil) -> first
          }
          #(Some(first), Some(last))
        }
      }
    }
  }
}

fn find_marked_e_tag(
  e_tags: List(List(String)),
  marker: String,
) -> Option(String) {
  list.find_map(e_tags, fn(tag) {
    case tag {
      ["e", id, _relay, m, ..] if m == marker && id != "" -> Ok(id)
      ["e", id, m] if m == marker && id != "" -> Ok(id)
      _ -> Error(Nil)
    }
  })
  |> option.from_result
}

/// Returns `True` if the note is a reply to another note.
pub fn is_reply(note: Note) -> Bool {
  option.is_some(note.reply_to_id)
}

/// Format a note timestamp relative to `now_sec` (`"just now"`, `"5m"`, `"2h"`, `"3d"`, `"2w"`, `"3mo"`, `"1y"`).
pub fn format_relative_time(created_at_sec: Int, now_sec: Int) -> String {
  let diff = now_sec - created_at_sec
  case diff < 60 {
    True -> "just now"
    False ->
      case diff < 3600 {
        True -> int.to_string(diff / 60) <> "m"
        False ->
          case diff < 86_400 {
            True -> int.to_string(diff / 3600) <> "h"
            False ->
              case diff < 604_800 {
                True -> int.to_string(diff / 86_400) <> "d"
                False ->
                  case diff < 2_592_000 {
                    True -> int.to_string(diff / 604_800) <> "w"
                    False ->
                      case diff < 31_536_000 {
                        True -> int.to_string(diff / 2_592_000) <> "mo"
                        False -> int.to_string(diff / 31_536_000) <> "y"
                      }
                  }
              }
          }
      }
  }
}
