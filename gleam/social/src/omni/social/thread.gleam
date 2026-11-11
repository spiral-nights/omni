//// Thread tree resolution, ancestor chain traversal, and root timeline filtering.

import gleam/dict.{type Dict}
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/order
import gleam/string
import omni/social/note.{type Note}

/// A resolved conversation thread view centered around a `focal` note,
/// with chronological `ancestors` above it and chronological `replies` below it.
pub type ThreadView {
  ThreadView(focal: Note, ancestors: List(Note), replies: List(Note))
}

/// Build a `ThreadView` for `focal_id` from a collection of `notes`.
///
/// Returns `None` if `focal_id` is not present in `notes`.
/// - `ancestors`: parent chain leading up to `focal`, sorted oldest-first.
/// - `replies`: direct and nested replies to `focal`, sorted oldest-first.
pub fn build_thread(focal_id: String, notes: List(Note)) -> Option(ThreadView) {
  let by_id =
    list.fold(notes, dict.new(), fn(acc, n) { dict.insert(acc, n.id, n) })

  case dict.get(by_id, focal_id) {
    Error(Nil) -> None
    Ok(focal) -> {
      let ancestors = collect_ancestors(focal, by_id, [focal.id], [])
      let replies =
        collect_replies(focal.id, notes)
        |> sort_oldest_first
      Some(ThreadView(focal: focal, ancestors: ancestors, replies: replies))
    }
  }
}

fn collect_ancestors(
  current: Note,
  by_id: Dict(String, Note),
  visited: List(String),
  acc: List(Note),
) -> List(Note) {
  let parent_id_opt = case current.reply_to_id {
    Some(pid) -> Some(pid)
    None -> current.root_id
  }

  case parent_id_opt {
    None -> acc
    Some(pid) ->
      case list.contains(visited, pid) {
        True -> acc
        False ->
          case dict.get(by_id, pid) {
            Ok(parent) ->
              collect_ancestors(parent, by_id, [pid, ..visited], [parent, ..acc])
            Error(Nil) ->
              case current.root_id {
                Some(rid) if rid != pid ->
                  case list.contains(visited, rid), dict.get(by_id, rid) {
                    False, Ok(root_note) -> [root_note, ..acc]
                    _, _ -> acc
                  }
                _ -> acc
              }
          }
      }
  }
}

fn collect_replies(focal_id: String, notes: List(Note)) -> List(Note) {
  // Iteratively expand the set of descendant note IDs starting from focal_id
  let descendant_ids = expand_descendant_ids([focal_id], notes)
  list.filter(notes, fn(n) {
    n.id != focal_id && list.contains(descendant_ids, n.id)
  })
  |> deduplicate_notes
}

fn expand_descendant_ids(
  known_ids: List(String),
  notes: List(Note),
) -> List(String) {
  let newly_matched =
    list.filter_map(notes, fn(n) {
      case list.contains(known_ids, n.id) {
        True -> Error(Nil)
        False -> {
          let replies_to_known = case n.reply_to_id {
            Some(rid) -> list.contains(known_ids, rid)
            None -> False
          }
          let roots_at_known = case n.root_id {
            Some(root) -> list.contains(known_ids, root)
            None -> False
          }
          case replies_to_known || roots_at_known {
            True -> Ok(n.id)
            False -> Error(Nil)
          }
        }
      }
    })

  case newly_matched {
    [] -> known_ids
    more -> expand_descendant_ids(list.append(known_ids, more), notes)
  }
}

/// Filter `notes` to top-level (non-reply) root notes and sort newest-first.
pub fn root_notes(notes: List(Note)) -> List(Note) {
  notes
  |> list.filter(fn(n) { !note.is_reply(n) })
  |> deduplicate_notes
  |> sort_newest_first
}

fn deduplicate_notes(notes: List(Note)) -> List(Note) {
  let #(_seen, kept) =
    list.fold(notes, #([], []), fn(state, n) {
      let #(seen_ids, acc) = state
      case list.contains(seen_ids, n.id) {
        True -> state
        False -> #([n.id, ..seen_ids], [n, ..acc])
      }
    })
  list.reverse(kept)
}

fn sort_oldest_first(notes: List(Note)) -> List(Note) {
  list.sort(notes, fn(a, b) {
    case int.compare(a.created_at, b.created_at) {
      order.Eq -> string.compare(a.id, b.id)
      other -> other
    }
  })
}

fn sort_newest_first(notes: List(Note)) -> List(Note) {
  list.sort(notes, fn(a, b) {
    case int.compare(b.created_at, a.created_at) {
      order.Eq -> string.compare(a.id, b.id)
      other -> other
    }
  })
}
