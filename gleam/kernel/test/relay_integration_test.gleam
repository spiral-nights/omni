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
import omni/platform/promise_ext as pe
import omni/platform/ref
import omni/platform/storage

fn note_event_json(sub_id: String, id_hex: String, content: String) -> String {
  let hex = id_hex
  "[\"EVENT\",\""
  <> sub_id
  <> "\",{\"id\":\""
  <> hex
  <> "\",\"pubkey\":\""
  <> "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  <> "\",\"created_at\":1000,\"kind\":1,\"tags\":[],\"content\":\""
  <> content
  <> "\",\"sig\":\""
  <> "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
  <> "\"}]"
}

pub fn event_frame_json_parses_test() {
  let raw =
    note_event_json(
      "it-sub",
      "e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3",
      "parse-check",
    )
  should.be_true(case relay_frame.parse_relay_frame(raw) {
    Ok(_) -> True
    Error(_) -> False
  })
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

  let received = ref.new([])
  let eose = ref.new(False)

  use closer <- promise.await(coordinator.subscribe(
    coord,
    "it-sub",
    [Filter(None, None, Some([kind.Note]), None, None, None, None, dict.new())],
    fn(ev) { ref.update(received, fn(evs) { [ev, ..evs] }) },
    Some(fn() { ref.set(eose, True) }),
  ))

  should.be_true(list.length(fake_relay.sent_frames(relay)) >= 1)

  let event_id_hex =
    "e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1"
  fake_relay.emit(relay, note_event_json("it-sub", event_id_hex, "hello"))
  fake_relay.emit(relay, note_event_json("it-sub", event_id_hex, "hello"))
  should.equal(list.length(ref.get(received)), 1)

  let assert Ok(eid) = event_id.parse(event_id_hex)
  use stored <- promise.await(event_store.get_event_by_id(ev_store, eid))
  should.be_true(case stored {
    Some(_) -> True
    None -> False
  })

  fake_relay.emit(relay, "[\"EOSE\",\"it-sub\"]")
  should.be_true(ref.get(eose))

  closer()
  promise.resolve(Nil)
}
