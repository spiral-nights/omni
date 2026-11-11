import gleam/dict
import gleam/javascript/promise.{type Promise}
import gleam/list
import gleam/option.{None, Some}
import omni/kernel/acl/capability_store
import omni/kernel/acl/engine as acl_engine
import omni/kernel/nostr/coordinator
import omni/kernel/nostr/event_store
import omni/kernel/nostr/relay_pool.{Connected}
import omni/nostr/event.{type Event, Event}
import omni/nostr/event_id
import omni/nostr/filter
import omni/nostr/kind
import omni/nostr/pubkey
import omni/nostr/relay_frame
import omni/nostr/relay_url
import omni/platform/ref
import omni/platform/storage
import omni/platform/websocket
import omni/protocol/capability
import omni/protocol/grant
import omni/protocol/plugin_id

fn make_event(id_hex: String, k: Int, content: String) -> Event {
  let assert Ok(eid) = event_id.parse(id_hex)
  let assert Ok(pk) =
    pubkey.parse(
      "3333333333333333333333333333333333333333333333333333333333333333",
    )
  Event(
    id: eid,
    pubkey: pk,
    created_at: 1000,
    kind: kind.from_int(k),
    tags: [],
    content: content,
    sig: "sig",
  )
}

pub fn coordinator_cached_0ms_hit_test() -> Promise(Nil) {
  let opts =
    event_store.LocalEventStoreOptions(
      db_name: Some("test_coord_db_1"),
      max_notes: Some(100),
      max_memory_cache_size: Some(100),
      user_pubkey: None,
    )
  use store_res <- promise.await(event_store.open_in_memory(opts))
  let assert Ok(store) = store_res

  let ev1 =
    make_event(
      "1111111111111111111111111111111111111111111111111111111111111111",
      1,
      "cached note",
    )
  use _ <- promise.await(event_store.save_event(store, ev1))

  let pool_store = storage.in_memory()
  let pool = relay_pool.new(pool_store, [])

  let coord = coordinator.new(store, pool, None)

  let received = ref.new([])
  let eosed = ref.new(False)

  let flt = filter.new() |> filter.with_kinds([kind.Note])

  use closer <- promise.await(coordinator.subscribe(
    coord,
    "sub_test",
    [flt],
    fn(ev) { ref.update(received, fn(evs) { [ev, ..evs] }) },
    Some(fn() { ref.set(eosed, True) }),
  ))

  assert list.length(ref.get(received)) == 1
  assert ref.get(eosed) == True

  closer()
  promise.resolve(Nil)
}

pub fn coordinator_deduplication_and_relay_ingestion_test() -> Promise(Nil) {
  let opts =
    event_store.LocalEventStoreOptions(
      db_name: Some("test_coord_db_2"),
      max_notes: Some(100),
      max_memory_cache_size: Some(100),
      user_pubkey: None,
    )
  use store_res <- promise.await(event_store.open_in_memory(opts))
  let assert Ok(store) = store_res

  let ev1 =
    make_event(
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      1,
      "event 1",
    )
  use _ <- promise.await(event_store.save_event(store, ev1))

  let pool_store = storage.in_memory()
  let assert Ok(url) = relay_url.parse("wss://relay.damus.io")
  let pool = relay_pool.new(pool_store, [url])

  let fake_sock =
    websocket.fake(fn(_msg) { Ok(Nil) }, fn(_code, _reason) { Nil })
  relay_pool.attach_socket(pool, url, fake_sock, Connected)

  let coord = coordinator.new(store, pool, None)
  let received = ref.new([])
  let sub_id = "test-sub-dedup"
  let flt = filter.new() |> filter.with_kinds([kind.Note])

  use closer <- promise.await(coordinator.subscribe(
    coord,
    sub_id,
    [flt],
    fn(ev) { ref.update(received, fn(evs) { [ev, ..evs] }) },
    None,
  ))

  // Initial 0ms cache hit gives ev1
  assert list.length(ref.get(received)) == 1

  // Simulate duplicate ev1 arriving from relay
  let subs = ref.get(pool.subscribers)
  let assert Ok(subscriber) = dict.get(subs, sub_id)
  subscriber.handler("wss://relay.example", relay_frame.EventFrame(sub_id, ev1))

  // Should still only have 1 event (duplicate ignored)
  assert list.length(ref.get(received)) == 1

  // Simulate new ev2 arriving from relay
  let ev2 =
    make_event(
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      1,
      "event 2 from relay",
    )
  subscriber.handler("wss://relay.example", relay_frame.EventFrame(sub_id, ev2))

  // ev2 was received
  assert list.length(ref.get(received)) == 2

  // Verify ev2 was ingested into local store
  use store_ev2 <- promise.await(event_store.get_event_by_id(store, ev2.id))
  assert store_ev2 == Some(ev2)

  closer()
  promise.resolve(Nil)
}

pub fn coordinator_acl_filtering_test() -> Promise(Nil) {
  let opts =
    event_store.LocalEventStoreOptions(
      db_name: Some("test_coord_db_3"),
      max_notes: Some(100),
      max_memory_cache_size: Some(100),
      user_pubkey: None,
    )
  use store_res <- promise.await(event_store.open_in_memory(opts))
  let assert Ok(store) = store_res

  // ev1: public Note (kind 1)
  let ev1 =
    make_event(
      "1111111111111111111111111111111111111111111111111111111111111111",
      1,
      "public note",
    )
  // ev2: encrypted DM (kind 4 - sensitive!)
  let ev2 =
    make_event(
      "4444444444444444444444444444444444444444444444444444444444444444",
      4,
      "secret dm",
    )

  use _ <- promise.await(event_store.save_event(store, ev1))
  use _ <- promise.await(event_store.save_event(store, ev2))

  // ACL engine with NostrRead grant (allows kind 1, but blocks sensitive kind 4)
  let cap_st = capability_store.new(storage.in_memory())
  let assert Ok(pid) = plugin_id.parse("org.untrusted.reader")
  capability_store.set_grant(
    cap_st,
    pid,
    capability.NostrRead,
    grant.Always,
    None,
  )
  let acl = acl_engine.new(cap_st, None)

  let pool = relay_pool.new(storage.in_memory(), [])
  let coord = coordinator.new(store, pool, Some(acl))

  let received = ref.new([])
  let flt = filter.new()

  // Namespaced sub_id from plugin "org.untrusted.reader"
  use closer <- promise.await(coordinator.subscribe(
    coord,
    "org.untrusted.reader:feed",
    [flt],
    fn(ev) { ref.update(received, fn(evs) { [ev, ..evs] }) },
    None,
  ))

  // Only the kind 1 note should be received; kind 4 is filtered by ACL!
  let events = ref.get(received)
  assert list.length(events) == 1
  assert list.map(events, fn(ev) { ev.id }) == [ev1.id]

  closer()
  promise.resolve(Nil)
}
