import gleam/option.{Some}
import gleam/order
import gleam/string
import omni/kernel/nostr/event_store_index.{
  ByIds, ByKind, ByPubkey, ScanAll, compare_created_at_desc, deduplicate_by_id,
  find_prunable_events, matches_deletion, matches_replaceable_target, plan_query,
  sort_newest_first,
}
import omni/nostr/event.{type Event, Event}
import omni/nostr/event_id.{type EventId}
import omni/nostr/filter
import omni/nostr/kind
import omni/nostr/pubkey.{type Pubkey}

fn make_pubkey(suffix: String) -> Pubkey {
  let padded = string.pad_start(suffix, to: 64, with: "0")
  let assert Ok(pk) = pubkey.parse(padded)
  pk
}

fn make_event_id(suffix: String) -> EventId {
  let padded = string.pad_start(suffix, to: 64, with: "0")
  let assert Ok(id) = event_id.parse(padded)
  id
}

fn make_event(
  id_suffix: String,
  author_suffix: String,
  k: Int,
  created_at: Int,
  tags: List(List(String)),
  content: String,
) -> Event {
  Event(
    id: make_event_id(id_suffix),
    pubkey: make_pubkey(author_suffix),
    created_at: created_at,
    kind: kind.from_int(k),
    tags: tags,
    content: content,
    sig: "dummy_sig",
  )
}

pub fn plan_query_test() {
  // Empty filter -> ScanAll
  assert plan_query(filter.new()) == ScanAll

  // Single 64-char ID -> ByIds
  let full_id = string.repeat("a", 64)
  let f_ids = filter.new() |> filter.with_ids([full_id])
  assert plan_query(f_ids) == ByIds([full_id])

  // Short prefix ID -> ScanAll
  let f_prefix_id = filter.new() |> filter.with_ids(["abc"])
  assert plan_query(f_prefix_id) == ScanAll

  // Single 64-char author -> ByPubkey
  let full_author = string.repeat("b", 64)
  let f_author = filter.new() |> filter.with_authors([full_author])
  assert plan_query(f_author) == ByPubkey(full_author)

  // Single kind -> ByKind
  let f_kind = filter.new() |> filter.with_kinds([kind.from_int(1)])
  assert plan_query(f_kind) == ByKind(1)
}

pub fn sorting_and_tie_breaking_test() {
  let ev1 = make_event("a", "1", 1, 1000, [], "")
  let ev2 = make_event("b", "1", 1, 2000, [], "")
  let ev3 = make_event("1", "1", 1, 1000, [], "")

  // ev2 (2000) > ev3 (1000, id suffix "1") > ev1 (1000, id suffix "a")
  let sorted = sort_newest_first([ev1, ev2, ev3])
  assert sorted == [ev2, ev3, ev1]

  // Compare directly
  assert compare_created_at_desc(ev2, ev1) == order.Lt
  assert compare_created_at_desc(ev1, ev2) == order.Gt
  assert compare_created_at_desc(ev3, ev1) == order.Lt
}

pub fn deduplicate_by_id_test() {
  let ev1 = make_event("1", "a", 1, 1000, [], "first")
  let ev1_dup = make_event("1", "a", 1, 1000, [], "duplicate")
  let ev2 = make_event("2", "a", 1, 2000, [], "second")

  let deduped = deduplicate_by_id([ev1, ev1_dup, ev2, ev1])
  assert deduped == [ev1, ev2]
}

pub fn matches_replaceable_test() {
  let meta1 = make_event("1", "a", 0, 1000, [], "meta1")
  let meta2 = make_event("2", "a", 0, 2000, [], "meta2")
  let meta_other = make_event("3", "b", 0, 2000, [], "meta_other")

  assert matches_replaceable_target(meta1, meta2) == True
  assert matches_replaceable_target(meta1, meta_other) == False

  // Addressable with d-tag
  let addr1 = make_event("1", "a", 30_078, 1000, [["d", "foo"]], "addr1")
  let addr2 = make_event("2", "a", 30_078, 2000, [["d", "foo"]], "addr2")
  let addr_diff = make_event("3", "a", 30_078, 2000, [["d", "bar"]], "addr_bar")

  assert matches_replaceable_target(addr1, addr2) == True
  assert matches_replaceable_target(addr1, addr_diff) == False
}

pub fn matches_deletion_test() {
  let note = make_event("1", "a", 1, 1000, [], "hello")
  let del = make_event("5", "a", 5, 1100, [["e", event_id.to_hex(note.id)]], "")
  let del_wrong_author =
    make_event("5", "b", 5, 1100, [["e", event_id.to_hex(note.id)]], "")

  assert matches_deletion(note, del) == True
  assert matches_deletion(note, del_wrong_author) == False
}

pub fn find_prunable_events_test() {
  let alice = make_pubkey("a")
  let b1 = make_event("1", "b", 1, 100, [], "b1")
  let b2 = make_event("2", "b", 1, 200, [], "b2")
  let b3 = make_event("3", "b", 1, 300, [], "b3")
  let a1 = make_event("4", "a", 1, 50, [], "a1")

  // max_notes: 2
  let prunable = find_prunable_events([b1, b2, b3, a1], 2, Some(alice))
  // Kept: b3, b2; prunable: b1. Alice's a1 is user-protected.
  assert prunable == [b1]
}
