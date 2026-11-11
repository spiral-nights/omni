//// Named `Filter` constructors for standard Nostr social queries.

import gleam/list
import gleam/option.{type Option, None, Some}
import omni/nostr/filter.{type Filter}
import omni/nostr/kind

/// Build a Kind 1 timeline filter with an optional list of `authors` and a `limit`.
pub fn timeline_filter(authors: Option(List(String)), limit: Int) -> Filter {
  let base =
    filter.new()
    |> filter.with_kinds([kind.Note])
    |> filter.with_limit(limit)

  case authors {
    Some(pks) -> filter.with_authors(base, pks)
    None -> base
  }
}

/// Build a Kind 1 filter for notes authored by `pubkey` with a `limit`.
pub fn notes_by_author(pubkey: String, limit: Int) -> Filter {
  filter.new()
  |> filter.with_kinds([kind.Note])
  |> filter.with_authors([pubkey])
  |> filter.with_limit(limit)
}

/// Build a Kind 0 metadata filter for the given `pubkeys`.
pub fn profiles_for(pubkeys: List(String)) -> Filter {
  let unique_pks = list.unique(pubkeys)
  filter.new()
  |> filter.with_kinds([kind.Metadata])
  |> filter.with_authors(unique_pks)
  |> filter.with_limit(list.length(unique_pks))
}

/// Build a Kind 3 contact list filter for `pubkey`.
pub fn follows_for(pubkey: String) -> Filter {
  filter.new()
  |> filter.with_kinds([kind.ContactList])
  |> filter.with_authors([pubkey])
  |> filter.with_limit(1)
}

/// Build an interactions filter (Kinds 1, 6, 7, 9735) referencing `note_ids` via `#e`.
pub fn interactions_for(note_ids: List(String)) -> Filter {
  let unique_ids = list.unique(note_ids)
  filter.new()
  |> filter.with_kinds([kind.Note, kind.Repost, kind.Reaction, kind.Zap])
  |> filter.with_e_tags(unique_ids)
}

/// Build a Kind 1 replies filter referencing `note_id` via `#e`.
pub fn replies_to(note_id: String) -> Filter {
  filter.new()
  |> filter.with_kinds([kind.Note])
  |> filter.with_e_tags([note_id])
}
