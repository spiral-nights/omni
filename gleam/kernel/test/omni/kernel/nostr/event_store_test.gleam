import gleam/javascript/promise.{type Promise}
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import omni/kernel/nostr/event_store.{
  LocalEventStoreOptions, count_events, get_event_by_id, get_events,
  get_memory_cache_size, get_user_pubkey, open_in_memory, prune, save_event,
  save_events, set_user_pubkey,
}
import omni/nostr/event.{type Event, Event}
import omni/nostr/event_id.{type EventId}
import omni/nostr/filter
import omni/nostr/kind
import omni/nostr/pubkey.{type Pubkey}
import omni/platform/idb

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

fn setup_store(
  max_notes: Option(Int),
  max_cache: Option(Int),
  user: Option(Pubkey),
) -> Promise(event_store.LocalEventStore) {
  let opts =
    LocalEventStoreOptions(
      db_name: Some("test_omni_event_store"),
      max_notes: max_notes,
      max_memory_cache_size: max_cache,
      user_pubkey: user,
    )
  use res <- promise.map(open_in_memory(opts))
  let assert Ok(store) = res
  store
}

pub fn save_event_and_get_by_id_test() -> Promise(Nil) {
  use store <- promise.await(setup_store(None, None, None))
  let ev = make_event("1", "a", 1, 1000, [], "hello nostr")

  // Save event
  use save_res <- promise.await(save_event(store, ev))
  assert save_res == Ok(True)

  // 0ms get from memory cache
  use cached <- promise.await(get_event_by_id(store, ev.id))
  assert cached == Some(ev)

  // Get unknown ID
  let unknown_id = make_event_id("999")
  use not_found <- promise.await(get_event_by_id(store, unknown_id))
  assert not_found == None

  promise.resolve(Nil)
}

pub fn memory_cache_lru_eviction_test() -> Promise(Nil) {
  // Set memory cache limit to 2
  use store <- promise.await(setup_store(None, Some(2), None))

  let ev1 = make_event("1", "a", 1, 1000, [], "note 1")
  let ev2 = make_event("2", "a", 1, 2000, [], "note 2")
  let ev3 = make_event("3", "a", 1, 3000, [], "note 3")

  use _ <- promise.await(save_event(store, ev1))
  use _ <- promise.await(save_event(store, ev2))
  assert get_memory_cache_size(store) == 2

  // Saving third event should evict one from memory cache
  use _ <- promise.await(save_event(store, ev3))
  assert get_memory_cache_size(store) == 2

  // Evicted event can still be fetched from IndexedDB
  use fetched1 <- promise.await(get_event_by_id(store, ev1.id))
  assert fetched1 == Some(ev1)

  promise.resolve(Nil)
}

pub fn ephemeral_events_not_persisted_to_disk_test() -> Promise(Nil) {
  use store <- promise.await(setup_store(None, None, None))
  // Kind 20001 is ephemeral (20000 <= kind < 30000)
  let ephemeral_ev = make_event("1", "a", 20_001, 1000, [], "ephemeral ping")

  use save_res <- promise.await(save_event(store, ephemeral_ev))
  assert save_res == Ok(True)

  // Present in memory cache
  use in_mem <- promise.await(get_event_by_id(store, ephemeral_ev.id))
  assert in_mem == Some(ephemeral_ev)

  // Absent from IndexedDB
  use idb_records <- promise.await(idb.all(store.db, "events"))
  assert idb_records == Ok([])

  promise.resolve(Nil)
}

pub fn save_events_batch_test() -> Promise(Nil) {
  use store <- promise.await(setup_store(None, None, None))
  let ev1 = make_event("1", "a", 1, 1000, [], "note 1")
  let ev2 = make_event("2", "a", 1, 2000, [], "note 2")
  let ev3 = make_event("3", "a", 1, 3000, [], "note 3")

  use batch_res <- promise.await(save_events(store, [ev1, ev2, ev3]))
  assert batch_res == Ok(3)

  use total <- promise.await(count_events(store, filter.new()))
  assert total == 3

  promise.resolve(Nil)
}

pub fn get_events_with_filters_test() -> Promise(Nil) {
  use store <- promise.await(setup_store(None, None, None))
  let alice_pk = make_pubkey("a")
  let bob_pk = make_pubkey("b")

  let ev1 = make_event("1", "a", 1, 1000, [["t", "gleam"]], "alice gleam note")
  let ev2 = make_event("2", "a", 0, 1500, [], "alice profile")
  let ev3 = make_event("3", "b", 1, 2000, [["t", "nostr"]], "bob nostr note")

  use _ <- promise.await(save_events(store, [ev1, ev2, ev3]))

  // Filter by author Alice
  let f_alice = filter.new() |> filter.with_pubkeys([alice_pk])
  use alice_events <- promise.await(get_events(store, f_alice))
  assert list.length(alice_events) == 2

  // Filter by author Bob
  let f_bob = filter.new() |> filter.with_pubkeys([bob_pk])
  use bob_events <- promise.await(get_events(store, f_bob))
  assert bob_events == [ev3]

  // Filter by kind 0
  let f_kind0 = filter.new() |> filter.with_kinds([kind.from_int(0)])
  use kind0_events <- promise.await(get_events(store, f_kind0))
  assert kind0_events == [ev2]

  // Filter by tag `#t: ["gleam"]`
  let f_tag = filter.new() |> filter.add_tag("t", "gleam")
  use tag_events <- promise.await(get_events(store, f_tag))
  assert tag_events == [ev1]

  // Filter by since
  let f_since = filter.new() |> filter.with_since(1600)
  use since_events <- promise.await(get_events(store, f_since))
  assert since_events == [ev3]

  promise.resolve(Nil)
}

pub fn get_events_deduplication_and_ordering_test() -> Promise(Nil) {
  use store <- promise.await(setup_store(None, None, None))

  let ev_old = make_event("1", "a", 1, 1000, [], "old")
  let ev_mid = make_event("2", "a", 1, 2000, [], "mid")
  let ev_new = make_event("3", "a", 1, 3000, [], "new")

  use _ <- promise.await(save_events(store, [ev_old, ev_new, ev_mid]))

  // Query without filter should return newest first: ev_new, ev_mid, ev_old
  use events <- promise.await(get_events(store, filter.new()))
  assert events == [ev_new, ev_mid, ev_old]

  // Test limit: take top 2 newest
  let f_limit = filter.new() |> filter.with_limit(2)
  use limited <- promise.await(get_events(store, f_limit))
  assert limited == [ev_new, ev_mid]

  // Count ignores limit
  use cnt <- promise.await(count_events(store, f_limit))
  assert cnt == 3

  promise.resolve(Nil)
}

pub fn replaceable_event_resolution_test() -> Promise(Nil) {
  use store <- promise.await(setup_store(None, None, None))

  // Profile metadata (kind 0) v1 at timestamp 1000
  let profile_v1 = make_event("1", "a", 0, 1000, [], "Alice v1")
  use res1 <- promise.await(save_event(store, profile_v1))
  assert res1 == Ok(True)

  // Profile metadata (kind 0) v2 at timestamp 2000 (newer)
  let profile_v2 = make_event("2", "a", 0, 2000, [], "Alice v2")
  use res2 <- promise.await(save_event(store, profile_v2))
  assert res2 == Ok(True)

  // Query kind 0: only v2 should exist!
  let f_kind0 = filter.new() |> filter.with_kinds([kind.from_int(0)])
  use events <- promise.await(get_events(store, f_kind0))
  assert events == [profile_v2]

  // Attempt to save an older profile (timestamp 500): should be ignored (Ok(False))
  let profile_old = make_event("3", "a", 0, 500, [], "Alice old")
  use res_old <- promise.await(save_event(store, profile_old))
  assert res_old == Ok(False)

  // Query still returns v2
  use events_after <- promise.await(get_events(store, f_kind0))
  assert events_after == [profile_v2]

  promise.resolve(Nil)
}

pub fn addressable_parameterized_replaceable_test() -> Promise(Nil) {
  use store <- promise.await(setup_store(None, None, None))

  // App data (kind 30078) with d="settings" at 1000
  let app_settings_v1 =
    make_event("1", "a", 30_078, 1000, [["d", "settings"]], "settings v1")
  // App data (kind 30078) with d="layout" at 1000
  let app_layout =
    make_event("2", "a", 30_078, 1000, [["d", "layout"]], "layout v1")
  // Updated app data (kind 30078) with d="settings" at 2000
  let app_settings_v2 =
    make_event("3", "a", 30_078, 2000, [["d", "settings"]], "settings v2")

  use _ <- promise.await(save_event(store, app_settings_v1))
  use _ <- promise.await(save_event(store, app_layout))
  use _ <- promise.await(save_event(store, app_settings_v2))

  let f_nip78 = filter.new() |> filter.with_kinds([kind.from_int(30_078)])
  use events <- promise.await(get_events(store, f_nip78))

  // Should have app_settings_v2 (newer) and app_layout (different d-tag)
  assert events == [app_settings_v2, app_layout]

  promise.resolve(Nil)
}

pub fn nip09_deletion_event_test() -> Promise(Nil) {
  use store <- promise.await(setup_store(None, None, None))

  let note = make_event("1", "a", 1, 1000, [], "note to delete")
  use _ <- promise.await(save_event(store, note))

  // Kind 5 deletion event authored by same pubkey referencing note ID
  let del_ev =
    make_event("5", "a", 5, 1100, [["e", event_id.to_hex(note.id)]], "delete")
  use del_res <- promise.await(save_event(store, del_ev))
  assert del_res == Ok(True)

  // Target note should no longer be found
  use fetched <- promise.await(get_event_by_id(store, note.id))
  assert fetched == None

  promise.resolve(Nil)
}

pub fn prune_transient_notes_test() -> Promise(Nil) {
  let alice_pk = make_pubkey("a")
  // Max notes: 2, initially no user pubkey
  use store <- promise.await(setup_store(Some(2), None, None))
  assert get_user_pubkey(store) == None

  // Set user pubkey dynamically
  set_user_pubkey(store, alice_pk)
  assert get_user_pubkey(store) == Some(alice_pk)

  // Bob (non-user) creates 4 kind 1 notes
  let bob1 = make_event("1", "b", 1, 100, [], "bob 100")
  let bob2 = make_event("2", "b", 1, 200, [], "bob 200")
  let bob3 = make_event("3", "b", 1, 300, [], "bob 300")
  let bob4 = make_event("4", "b", 1, 400, [], "bob 400")

  // Alice (user) creates 2 kind 1 notes
  let alice1 = make_event("5", "a", 1, 50, [], "alice 50")
  let alice2 = make_event("6", "a", 1, 60, [], "alice 60")

  // A profile metadata event (kind 0, non-transient)
  let profile = make_event("7", "b", 0, 70, [], "bob profile")

  use _ <- promise.await(
    save_events(store, [bob1, bob2, bob3, bob4, alice1, alice2, profile]),
  )

  // Prune transient notes exceeding max_notes (2)
  use prune_res <- promise.await(prune(store))
  // Bob's 2 oldest notes (bob1: 100, bob2: 200) should be pruned
  assert prune_res == Ok(2)

  // Bob's remaining kind 1 notes should be bob4 and bob3
  let f_bob =
    filter.new()
    |> filter.with_pubkeys([make_pubkey("b")])
    |> filter.with_kinds([kind.from_int(1)])
  use bob_remaining <- promise.await(get_events(store, f_bob))
  assert bob_remaining == [bob4, bob3]

  // Alice's notes are protected and remain
  let f_alice = filter.new() |> filter.with_pubkeys([alice_pk])
  use alice_remaining <- promise.await(get_events(store, f_alice))
  assert alice_remaining == [alice2, alice1]

  // Kind 0 profile remains
  use prof_fetched <- promise.await(get_event_by_id(store, profile.id))
  assert prof_fetched == Some(profile)

  promise.resolve(Nil)
}

pub fn get_events_time_range_filters_without_scan_test() -> Promise(Nil) {
  use store <- promise.await(setup_store(None, None, None))
  let ev1 = make_event("11", "a", 1, 1000, [], "early")
  let ev2 = make_event("12", "a", 1, 2000, [], "middle")
  let ev3 = make_event("13", "a", 7, 3000, [], "late")

  use _ <- promise.await(save_events(store, [ev1, ev2, ev3]))

  let ranged =
    filter.new()
    |> filter.with_since(1500)
    |> filter.with_until(2500)
  use events <- promise.await(get_events(store, ranged))
  assert events == [ev2]

  let recent = filter.new() |> filter.with_since(2500)
  use recent_events <- promise.await(get_events(store, recent))
  assert recent_events == [ev3]

  promise.resolve(Nil)
}

pub fn get_events_uses_kind_created_compound_index_test() -> Promise(Nil) {
  use store <- promise.await(setup_store(None, None, None))
  let ev1 = make_event("21", "a", 1, 1000, [], "early note")
  let ev2 = make_event("22", "a", 1, 2000, [], "late note")
  let ev3 = make_event("23", "a", 7, 2000, [], "reaction")
  use _ <- promise.await(save_events(store, [ev1, ev2, ev3]))

  let filter_notes =
    filter.new()
    |> filter.with_kinds([kind.from_int(1)])
    |> filter.with_since(1500)
  use notes <- promise.await(get_events(store, filter_notes))
  assert notes == [ev2]

  promise.resolve(Nil)
}
