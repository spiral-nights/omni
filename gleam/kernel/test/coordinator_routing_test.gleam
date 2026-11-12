//// Outbox/gossip routing acceptance tests for the subscription coordinator.

import fake_relay
import gleam/javascript/promise
import gleam/list
import gleam/option.{None, Some}
import gleeunit
import gleeunit/should
import omni/kernel/nostr/coordinator
import omni/kernel/nostr/event_store
import omni/kernel/nostr/relay_hints
import omni/kernel/nostr/relay_pool
import omni/nostr/filter
import omni/nostr/kind
import omni/nostr/relay_frame
import omni/platform/clock
import omni/platform/idb
import omni/platform/ref
import omni/platform/storage

pub fn main() {
  gleeunit.main()
}

const author = "6666666666666666666666666666666666666666666666666666666666666666"

fn open_store() -> promise.Promise(event_store.LocalEventStore) {
  use res <- promise.await(idb.in_memory_simple())
  let db = case res {
    Ok(db) -> db
    Error(_) -> panic as "in-memory idb"
  }
  use res <- promise.await(
    event_store.open_in_memory(event_store.LocalEventStoreOptions(
      db_name: Some("coordinator_routing_test"),
      max_notes: Some(100),
      max_memory_cache_size: Some(100),
      user_pubkey: None,
    )),
  )
  case res {
    Ok(store) -> promise.resolve(store)
    Error(err) -> panic as err
  }
}

fn two_relay_pool() -> relay_pool.RelayPool {
  let store =
    storage.in_memory_from([
      #(
        relay_pool.storage_key_configured_relays,
        "[\"wss://a.example\",\"wss://b.example\"]",
      ),
    ])
  relay_pool.new(store, [])
}

pub fn author_scoped_req_routes_only_to_hint_relay_test() -> promise.Promise(
  Nil,
) {
  use store <- promise.await(open_store())
  let pool = two_relay_pool()
  let relay_a = fake_relay.start(pool, "wss://a.example")
  let relay_b = fake_relay.start(pool, "wss://b.example")

  let coord = coordinator.new(store, pool, None)
  relay_hints.put(coordinator.relay_hints(coord), author, ["wss://b.example"])

  let flt = filter.new() |> filter.with_authors([author])
  use closer <- promise.await(coordinator.subscribe(
    coord,
    "route_author",
    [flt],
    fn(_event) { Nil },
    None,
  ))

  let sent_a = fake_relay.sent_frames(relay_a)
  let sent_b = fake_relay.sent_frames(relay_b)
  list.length(sent_a) |> should.equal(0)
  list.length(sent_b) |> should.equal(1)
  closer()
  promise.resolve(Nil)
}

pub fn missing_hints_fall_back_and_refresh_test() -> promise.Promise(Nil) {
  use store <- promise.await(open_store())
  let pool = two_relay_pool()
  let relay_a = fake_relay.start(pool, "wss://a.example")
  let relay_b = fake_relay.start(pool, "wss://b.example")

  let coord = coordinator.new(store, pool, None)
  let flt = filter.new() |> filter.with_authors([author])
  use closer <- promise.await(coordinator.subscribe(
    coord,
    "route_fallback",
    [flt],
    fn(_event) { Nil },
    None,
  ))

  // The author REQ fans out to both relays, plus a kind-10002 refresh REQ.
  list.length(fake_relay.sent_frames(relay_a)) |> should.equal(2)
  list.length(fake_relay.sent_frames(relay_b)) |> should.equal(2)
  closer()
  promise.resolve(Nil)
}

pub fn targeted_subscription_eose_fires_without_unrelated_relays_test() -> promise.Promise(
  Nil,
) {
  use store <- promise.await(open_store())
  let pool = two_relay_pool()
  let _relay_a = fake_relay.start(pool, "wss://a.example")
  let relay_b = fake_relay.start(pool, "wss://b.example")

  let coord = coordinator.new(store, pool, None)
  let eosed = ref.new(False)
  let flt = filter.new() |> filter.with_kinds([kind.Note])

  use _closer <- promise.await(coordinator.subscribe_targeted(
    coord,
    "route_eose",
    [flt],
    ["wss://b.example"],
    fn(_event) { Nil },
    Some(fn() { ref.set(eosed, True) }),
  ))

  fake_relay.emit(
    relay_b,
    relay_frame.relay_frame_to_json(relay_frame.Eose("route_eose")),
  )

  ref.get(eosed) |> should.equal(True)
  promise.resolve(Nil)
}

pub fn hint_cache_ttl_and_negative_entries_test() {
  let now = ref.new(1_000_000)
  let cache = relay_hints.new(clock.Clock(now_ms: fn() { ref.get(now) }))
  relay_hints.lookup(cache, author) |> should.equal(None)

  relay_hints.put(cache, author, ["wss://read.example"])
  relay_hints.lookup(cache, author)
  |> should.equal(Some(["wss://read.example"]))

  ref.set(now, 1_000_000 + relay_hints.hint_ttl_ms + 1)
  relay_hints.lookup(cache, author) |> should.equal(None)

  relay_hints.put_missing(cache, author)
  relay_hints.lookup(cache, author) |> should.equal(None)
  ref.set(
    now,
    1_000_000 + relay_hints.hint_ttl_ms + relay_hints.negative_ttl_ms + 2,
  )
  relay_hints.lookup(cache, author) |> should.equal(None)
}
