//// Nostr subscription filter (NIP-01) representation, matching, and builder API.

import gleam/dict.{type Dict}
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import omni/nostr/event.{type Event}
import omni/nostr/event_id.{type EventId}
import omni/nostr/kind.{type Kind}
import omni/nostr/pubkey.{type Pubkey}

/// A Nostr subscription filter (NIP-01).
///
/// Contains criteria for matching events. All specified fields must match
/// (logical AND). Within a multi-value field (e.g. `kinds` or tag values),
/// matching any value satisfies that field (logical OR).
pub type Filter {
  Filter(
    ids: Option(List(String)),
    authors: Option(List(String)),
    kinds: Option(List(Kind)),
    since: Option(Int),
    until: Option(Int),
    limit: Option(Int),
    search: Option(String),
    tags: Dict(String, List(String)),
  )
}

/// Strip leading `#` from tag names so `"e"` and `"#e"` are equivalent.
fn normalize_tag_name(name: String) -> String {
  case string.starts_with(name, "#") {
    True -> string.drop_start(name, 1)
    False -> name
  }
}

/// Create an empty `Filter` with all criteria unset.
pub fn new() -> Filter {
  Filter(
    ids: None,
    authors: None,
    kinds: None,
    since: None,
    until: None,
    limit: None,
    search: None,
    tags: dict.new(),
  )
}

/// Set the list of event IDs (or hex prefixes) to match.
pub fn with_ids(filter: Filter, ids: List(String)) -> Filter {
  Filter(..filter, ids: Some(ids))
}

/// Append a single event ID (or hex prefix) to the filter.
pub fn add_id(filter: Filter, id: String) -> Filter {
  case filter.ids {
    Some(existing) -> Filter(..filter, ids: Some(list.append(existing, [id])))
    None -> Filter(..filter, ids: Some([id]))
  }
}

/// Set event IDs from typed `EventId` values.
pub fn with_event_ids(filter: Filter, ids: List(EventId)) -> Filter {
  with_ids(filter, list.map(ids, event_id.to_hex))
}

/// Append an `EventId` to the filter.
pub fn add_event_id(filter: Filter, id: EventId) -> Filter {
  add_id(filter, event_id.to_hex(id))
}

/// Set the list of author pubkeys (or hex prefixes) to match.
pub fn with_authors(filter: Filter, authors: List(String)) -> Filter {
  Filter(..filter, authors: Some(authors))
}

/// Append an author pubkey (or hex prefix) to the filter.
pub fn add_author(filter: Filter, author: String) -> Filter {
  case filter.authors {
    Some(existing) ->
      Filter(..filter, authors: Some(list.append(existing, [author])))
    None -> Filter(..filter, authors: Some([author]))
  }
}

/// Set author pubkeys from typed `Pubkey` values.
pub fn with_pubkeys(filter: Filter, pubkeys: List(Pubkey)) -> Filter {
  with_authors(filter, list.map(pubkeys, pubkey.to_hex))
}

/// Append a `Pubkey` to the filter.
pub fn add_pubkey(filter: Filter, pk: Pubkey) -> Filter {
  add_author(filter, pubkey.to_hex(pk))
}

/// Set the list of event kinds to match.
pub fn with_kinds(filter: Filter, kinds: List(Kind)) -> Filter {
  Filter(..filter, kinds: Some(kinds))
}

/// Append a `Kind` to the filter.
pub fn add_kind(filter: Filter, k: Kind) -> Filter {
  case filter.kinds {
    Some(existing) -> Filter(..filter, kinds: Some(list.append(existing, [k])))
    None -> Filter(..filter, kinds: Some([k]))
  }
}

/// Set the lower timestamp bound (inclusive).
pub fn with_since(filter: Filter, timestamp: Int) -> Filter {
  Filter(..filter, since: Some(timestamp))
}

/// Set the upper timestamp bound (inclusive).
pub fn with_until(filter: Filter, timestamp: Int) -> Filter {
  Filter(..filter, until: Some(timestamp))
}

/// Set the maximum number of events to return.
pub fn with_limit(filter: Filter, max_events: Int) -> Filter {
  Filter(..filter, limit: Some(max_events))
}

/// Set NIP-50 search query terms.
pub fn with_search(filter: Filter, query: String) -> Filter {
  Filter(..filter, search: Some(query))
}

/// Set the allowed values for a generic tag constraint (e.g. `"e"`, `"p"`, `"d"`).
pub fn with_tag(filter: Filter, tag: String, values: List(String)) -> Filter {
  let name = normalize_tag_name(tag)
  Filter(..filter, tags: dict.insert(filter.tags, name, values))
}

/// Append a single value to a generic tag constraint.
pub fn add_tag(filter: Filter, tag: String, value: String) -> Filter {
  let name = normalize_tag_name(tag)
  case dict.get(filter.tags, name) {
    Ok(existing) ->
      Filter(
        ..filter,
        tags: dict.insert(filter.tags, name, list.append(existing, [value])),
      )
    Error(Nil) ->
      Filter(..filter, tags: dict.insert(filter.tags, name, [value]))
  }
}

/// Retrieve the list of values for a tag constraint, or empty list if unset.
pub fn get_tag(filter: Filter, tag: String) -> List(String) {
  let name = normalize_tag_name(tag)
  case dict.get(filter.tags, name) {
    Ok(values) -> values
    Error(Nil) -> []
  }
}

/// Filter by `#e` event reference tags.
pub fn with_e_tags(filter: Filter, event_ids: List(String)) -> Filter {
  with_tag(filter, "e", event_ids)
}

/// Append an `#e` event reference tag.
pub fn add_e_tag(filter: Filter, event_id: String) -> Filter {
  add_tag(filter, "e", event_id)
}

/// Filter by `#p` pubkey reference tags.
pub fn with_p_tags(filter: Filter, pubkeys: List(String)) -> Filter {
  with_tag(filter, "p", pubkeys)
}

/// Append a `#p` pubkey reference tag.
pub fn add_p_tag(filter: Filter, pubkey: String) -> Filter {
  add_tag(filter, "p", pubkey)
}

/// Filter by single `#d` identifier tag (NIP-33 / NIP-78).
pub fn with_d_tag(filter: Filter, d: String) -> Filter {
  with_tag(filter, "d", [d])
}

/// Filter by multiple `#d` identifier tags (NIP-33 / NIP-78).
pub fn with_d_tags(filter: Filter, ds: List(String)) -> Filter {
  with_tag(filter, "d", ds)
}

/// Check whether a Nostr `Event` satisfies all criteria of the `Filter`.
pub fn matches(event: Event, filter: Filter) -> Bool {
  let matches_ids = case filter.ids {
    None -> True
    Some(prefixes) -> {
      let event_hex = event_id.to_hex(event.id)
      list.any(prefixes, fn(p) {
        let norm = string.lowercase(string.trim(p))
        norm != "" && string.starts_with(event_hex, norm)
      })
    }
  }

  let matches_authors = case filter.authors {
    None -> True
    Some(prefixes) -> {
      let author_hex = pubkey.to_hex(event.pubkey)
      list.any(prefixes, fn(p) {
        let norm = string.lowercase(string.trim(p))
        norm != "" && string.starts_with(author_hex, norm)
      })
    }
  }

  let matches_kinds = case filter.kinds {
    None -> True
    Some(kinds) -> list.contains(kinds, event.kind)
  }

  let matches_since = case filter.since {
    None -> True
    Some(since) -> event.created_at >= since
  }

  let matches_until = case filter.until {
    None -> True
    Some(until) -> event.created_at <= until
  }

  let matches_search = case filter.search {
    None -> True
    Some(query) -> {
      let terms =
        string.lowercase(query)
        |> string.split(" ")
        |> list.filter(fn(t) { !string.is_empty(string.trim(t)) })
      case terms {
        [] -> True
        _ -> {
          let content_lower = string.lowercase(event.content)
          list.all(terms, fn(term) { string.contains(content_lower, term) })
        }
      }
    }
  }

  let matches_tags =
    dict.to_list(filter.tags)
    |> list.all(fn(pair) {
      let #(tag_name, expected_values) = pair
      let event_values = event.get_tag_values(event.tags, tag_name)
      list.any(event_values, fn(v) { list.contains(expected_values, v) })
    })

  matches_ids
  && matches_authors
  && matches_kinds
  && matches_since
  && matches_until
  && matches_search
  && matches_tags
}

/// Check whether an `Event` matches any filter in the given list.
pub fn matches_any(event: Event, filters: List(Filter)) -> Bool {
  case filters {
    [] -> False
    _ -> list.any(filters, fn(f) { matches(event, f) })
  }
}

/// Combine two filters into one union filter.
fn merge_two(a: Filter, b: Filter) -> Filter {
  let ids = case a.ids, b.ids {
    None, None -> None
    Some(l1), None -> Some(l1)
    None, Some(l2) -> Some(l2)
    Some(l1), Some(l2) -> Some(list.unique(list.append(l1, l2)))
  }

  let authors = case a.authors, b.authors {
    None, None -> None
    Some(l1), None -> Some(l1)
    None, Some(l2) -> Some(l2)
    Some(l1), Some(l2) -> Some(list.unique(list.append(l1, l2)))
  }

  let kinds = case a.kinds, b.kinds {
    None, None -> None
    Some(l1), None -> Some(l1)
    None, Some(l2) -> Some(l2)
    Some(l1), Some(l2) -> Some(list.unique(list.append(l1, l2)))
  }

  let since = case a.since, b.since {
    None, None -> None
    Some(s), None | None, Some(s) -> Some(s)
    Some(s1), Some(s2) -> Some(int.min(s1, s2))
  }

  let until = case a.until, b.until {
    None, None -> None
    Some(u), None | None, Some(u) -> Some(u)
    Some(u1), Some(u2) -> Some(int.max(u1, u2))
  }

  let limit = case a.limit, b.limit {
    None, None -> None
    Some(l), None | None, Some(l) -> Some(l)
    Some(l1), Some(l2) -> Some(l1 + l2)
  }

  let search = case b.search {
    Some(s) -> Some(s)
    None -> a.search
  }

  let tags =
    dict.fold(b.tags, a.tags, fn(acc, tag_name, vals2) {
      case dict.get(acc, tag_name) {
        Ok(vals1) ->
          dict.insert(acc, tag_name, list.unique(list.append(vals1, vals2)))
        Error(Nil) -> dict.insert(acc, tag_name, vals2)
      }
    })

  Filter(
    ids: ids,
    authors: authors,
    kinds: kinds,
    since: since,
    until: until,
    limit: limit,
    search: search,
    tags: tags,
  )
}

/// Merge a list of filters into a single combined filter.
///
/// Array fields (`ids`, `authors`, `kinds`, `#tag` values) are combined via union
/// and deduplicated. `since` takes the earliest timestamp (`min`), `until` takes
/// the latest (`max`), and `limit` is summed.
pub fn merge(filters: List(Filter)) -> Filter {
  case filters {
    [] -> new()
    [single] -> single
    _ -> list.fold(filters, new(), merge_two)
  }
}
