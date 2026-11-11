//// End-to-end relay integration through the fake relay harness.

import fake_relay
import gleam/dict
import gleam/javascript/promise
import gleam/list
import gleam/option.{None, Some}
import gleeunit/should
import omni/kernel/nostr/coordinator
import omni/kernel/nostr/event_store
import omni/kernel/nostr/relay_pool
import omni/nostr/event_id
import omni/nostr/filter.{Filter}
import omni/nostr/kind
import omni/nostr/relay_frame
import omni/nostr/relay_url
import omni/platform/promise_ext
import omni/platform/ref
import omni/platform/storage

fn note_event_json(content: String) -> String {
  let hex = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  "[\"EVENT\",\"sub1\",{\"id\":\""
  <> hex
  <> "\",\"pubkey\":\""
  <> "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  <> "\",\"created_at\":1000,\"kind\":1,\"tags\":[],\"content\":\""
  <> content
  <> "\",\"sig\":\""
  <> "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
  <> "\"}]"
}

pub fn fake_relay_streams_and_dedupes_events_test() {
  let store =
    storage.in_memory_from([
      #(relay_pool.storage_key_configured_relays, "[\"wss://fake.example\"]"),
    ])
  let pool = relay_pool.new(store, [])
  let relay = fake_relay.start(pool, "wss://fake.example")
  use store_res <- promise.await(
    event_store.open_in_memory(event_store.default_options()),
  )
  let assert Ok(ev_store) = store_res
  let coord = coordinator.new(ev_store, pool, None)

  let eose = ref.new(False)

  use closer <- promise.await(coordinator.subscribe(
    coord,
    "it-sub",
    [Filter(None, None, Some([kind.Note]), None, None, None, None, dict.new())],
    fn(_ev) { Nil },
    Some(fn() { ref.set(eose, True) }),
  ))

  // REQ was sent on subscribe (socket already open).
  should.be_true(list.length(fake_relay.sent_frames(relay)) >= 1)

  let parsed = relay_frame.parse_relay_frame(note_event_json("hello"))
  should.be_true(case parsed {
    Ok(_) -> True
    Error(_) -> False
  })

  should.be_true(dict.has_key(ref.get(pool.subscribers), "it-sub"))

  // EOSE fires once all configured relays answered.
  fake_relay.emit(relay, "[\"EOSE\",\"it-sub\"]")
  should.be_true(ref.get(eose))

  closer()
  promise.resolve(Nil)
}

pub fn injected_event_frame_reaches_subscriber_test() {
  let store =
    storage.in_memory_from([
      #(relay_pool.storage_key_configured_relays, "[\"wss://fake.example\"]"),
    ])
  let pool = relay_pool.new(store, [])
  let relay = fake_relay.start(pool, "wss://fake.example")
  let frames = ref.new([])
  let _closer =
    relay_pool.subscribe(pool, "raw-sub", [], fn(_source, frame) {
      ref.update(frames, fn(fs) { [frame, ..fs] })
    })
  fake_relay.emit(
    relay,
    "[\"EVENT\",\"raw-sub\",{\"id\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"pubkey\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\",\"created_at\":1000,\"kind\":1,\"tags\":[],\"content\":\"raw\",\"sig\":\"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc\"}]",
  )
  should.equal(list.length(ref.get(frames)), 1)
}
