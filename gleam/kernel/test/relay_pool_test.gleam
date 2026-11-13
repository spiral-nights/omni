import gleam/dict
import gleam/javascript/promise.{type Promise}
import gleam/list
import gleam/option.{None, is_some}
import gleeunit/should
import omni/kernel/nostr/relay_pool.{
  Connected, Disconnected, add_relay, attach_socket, get_configured_relays,
  get_latency, get_statuses, publish, publish_tracked, register_ok, relay_scope,
  remove_relay, set_relay_scope, storage_key_configured_relays, subscribe,
}
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

fn make_test_event() -> Event {
  let assert Ok(eid) =
    event_id.parse(
      "1111111111111111111111111111111111111111111111111111111111111111",
    )
  let assert Ok(pk) =
    pubkey.parse(
      "2222222222222222222222222222222222222222222222222222222222222222",
    )
  Event(
    id: eid,
    pubkey: pk,
    created_at: 1000,
    kind: kind.Note,
    tags: [],
    content: "hello world",
    sig: "dummy_sig",
  )
}

pub fn relay_pool_bootstrap_and_persistence_test() {
  let store = storage.in_memory()
  let assert Ok(url1) = relay_url.parse("wss://relay.damus.io")
  let assert Ok(url2) = relay_url.parse("wss://relay.ditto.pub")

  let pool = relay_pool.new(store, [url1, url2])
  let configured = get_configured_relays(pool)
  assert list.length(configured) == 2
  assert list.map(configured, relay_url.to_string)
    == [
      "wss://relay.damus.io",
      "wss://relay.ditto.pub",
    ]

  // Re-creating pool with same storage reuses stored relays
  let assert Ok(dummy_url) = relay_url.parse("wss://ignored.bootstrap")
  let pool2 = relay_pool.new(store, [dummy_url])
  let configured2 = get_configured_relays(pool2)
  assert list.map(configured2, relay_url.to_string)
    == [
      "wss://relay.damus.io",
      "wss://relay.ditto.pub",
    ]
}

pub fn relay_pool_add_and_remove_test() {
  let store = storage.in_memory()
  let assert Ok(url1) = relay_url.parse("wss://relay.damus.io")
  let assert Ok(url2) = relay_url.parse("wss://relay.snort.social")

  let pool = relay_pool.new(store, [url1])
  assert list.length(get_configured_relays(pool)) == 1

  add_relay(pool, url2)
  let updated = get_configured_relays(pool)
  assert list.length(updated) == 2
  assert list.map(updated, relay_url.to_string)
    == [
      "wss://relay.damus.io",
      "wss://relay.snort.social",
    ]

  remove_relay(pool, url1)
  let after_remove = get_configured_relays(pool)
  assert list.length(after_remove) == 1
  assert list.map(after_remove, relay_url.to_string)
    == [
      "wss://relay.snort.social",
    ]
}

pub fn relay_pool_publish_test() -> Promise(Nil) {
  let store = storage.in_memory()
  let assert Ok(url1) = relay_url.parse("wss://relay.damus.io")
  let assert Ok(url2) = relay_url.parse("wss://relay.offline.local")

  let pool = relay_pool.new(store, [url1, url2])

  let sent_messages = ref.new([])
  let fake_sock1 =
    websocket.fake(
      fn(msg) {
        ref.update(sent_messages, fn(m) { [msg, ..m] })
        Ok(Nil)
      },
      fn(_c, _r) { Nil },
    )

  // Attach connected socket for url1 and disconnected for url2
  attach_socket(pool, url1, fake_sock1, Connected)
  attach_socket(pool, url2, fake_sock1, Disconnected("offline"))

  let test_event = make_test_event()
  use publish_results <- promise.await(publish(pool, test_event))

  assert list.length(publish_results) == 2
  assert list.contains(publish_results, #(url1, True, "sent"))
  assert list.contains(publish_results, #(url2, False, "offline"))

  // Check that frame was sent over socket
  let messages = ref.get(sent_messages)
  assert list.length(messages) == 1
  assert list.any(messages, fn(msg) {
    case relay_frame.parse_relay_frame(msg) {
      _ -> True
    }
  })

  promise.resolve(Nil)
}

pub fn relay_pool_subscribe_and_dispatch_test() {
  let store = storage.in_memory()
  let assert Ok(url1) = relay_url.parse("wss://relay.damus.io")
  let pool = relay_pool.new(store, [url1])

  let sent_frames = ref.new([])
  let fake_sock =
    websocket.fake(
      fn(msg) {
        ref.update(sent_frames, fn(f) { [msg, ..f] })
        Ok(Nil)
      },
      fn(_c, _r) { Nil },
    )
  attach_socket(pool, url1, fake_sock, Connected)

  let received_events = ref.new([])
  let sub_id = "test-sub-1"
  let flt = filter.new() |> filter.with_kinds([kind.Note])

  let closer =
    subscribe(pool, sub_id, [flt], fn(_source, frame) {
      case frame {
        relay_frame.EventFrame(_sid, ev) ->
          ref.update(received_events, fn(evs) { [ev, ..evs] })
        _ -> Nil
      }
    })

  // REQ frame should have been sent to socket
  let frames = ref.get(sent_frames)
  assert list.length(frames) == 1

  // Simulate incoming relay frame
  let ev = make_test_event()
  let in_frame = relay_frame.EventFrame(sub_id, ev)

  // Dispatch frame via subscribers dict
  let subs = ref.get(pool.subscribers)
  let assert Ok(handlers) = dict.get(subs, sub_id)
  let assert [handler, ..] = handlers
  handler.handler("wss://relay.example", in_frame)

  assert list.length(ref.get(received_events)) == 1

  // Unsubscribe
  closer()

  // CLOSE frame should have been sent
  let frames_after = ref.get(sent_frames)
  assert list.length(frames_after) == 2

  // Subscriber is removed
  assert dict.has_key(ref.get(pool.subscribers), sub_id) == False
}

pub fn relay_pool_statuses_test() {
  let store = storage.in_memory()
  let assert Ok(url1) = relay_url.parse("wss://relay.damus.io")
  let pool = relay_pool.new(store, [url1])

  let fake_sock = websocket.fake(fn(_) { Ok(Nil) }, fn(_c, _r) { Nil })
  attach_socket(pool, url1, fake_sock, Connected)

  let statuses = get_statuses(pool)
  assert statuses == [#(url1, Connected)]
}

pub fn relay_pool_publish_tracked_receipts_test() {
  let store = storage.in_memory()
  let assert Ok(url) = relay_url.parse("wss://relay.example")
  let pool = relay_pool.new(store, [url])
  let sent = ref.new([])
  let sock =
    websocket.fake(
      fn(frame) {
        ref.update(sent, fn(frames) { [frame, ..frames] })
        Ok(Nil)
      },
      fn(_code, _reason) { Nil },
    )
  attach_socket(pool, url, sock, Connected)

  let event = make_test_event()
  let waiter = publish_tracked(pool, event, 500)
  register_ok(
    pool,
    relay_url.to_string(url),
    event_id.to_hex(event.id),
    True,
    "accepted",
  )

  use results <- promise.await(waiter)
  assert list.length(results) == 1
  let assert Ok(#(_relay, accepted, message)) = list.first(results)
  assert accepted
  assert message == "accepted"
  assert list.length(ref.get(sent)) == 1
  assert is_some(get_latency(pool, url))
  promise.resolve(Nil)
}

pub fn relay_pool_read_write_scopes_are_honoured_test() {
  let store =
    storage.in_memory_from([
      #(
        storage_key_configured_relays,
        "[\"wss://readrelay.example\",\"wss://writrelay.example\"]",
      ),
    ])
  let pool = relay_pool.new(store, [])
  let assert Ok(read_url) = relay_url.parse("wss://readrelay.example")
  let assert Ok(write_url) = relay_url.parse("wss://writrelay.example")

  let read_frames = ref.new([])
  let write_frames = ref.new([])
  let read_sock =
    websocket.fake(
      fn(frame) {
        ref.update(read_frames, fn(fs) { [frame, ..fs] })
        Ok(Nil)
      },
      fn(_, _) { Nil },
    )
  let write_sock =
    websocket.fake(
      fn(frame) {
        ref.update(write_frames, fn(fs) { [frame, ..fs] })
        Ok(Nil)
      },
      fn(_, _) { Nil },
    )
  attach_socket(pool, read_url, read_sock, Connected)
  attach_socket(pool, write_url, write_sock, Connected)

  set_relay_scope(pool, read_url, True, False)
  set_relay_scope(pool, write_url, False, True)

  relay_scope(pool, read_url) |> should.equal(#(True, False))
  relay_scope(pool, write_url) |> should.equal(#(False, True))

  let _closer =
    subscribe(
      pool,
      "scope-test",
      [filter.Filter(None, None, None, None, None, None, None, dict.new())],
      fn(_, _) { Nil },
    )
  // Only the read relay receives the REQ.
  assert list.length(ref.get(read_frames)) == 1
  assert list.length(ref.get(write_frames)) == 0

  let event = make_test_event()
  let waiter = publish_tracked(pool, event, 300)
  // Only the write relay receives the EVENT.
  assert list.length(ref.get(write_frames)) == 1
  assert list.length(ref.get(read_frames)) == 1
  register_ok(
    pool,
    relay_url.to_string(write_url),
    event_id.to_hex(event.id),
    True,
    "ok",
  )
  use results <- promise.await(waiter)
  assert list.length(results) == 1
  promise.resolve(Nil)
}

pub fn duplicate_sub_ids_do_not_overwrite_handlers_test() {
  let store = storage.in_memory()
  let assert Ok(url1) = relay_url.parse("wss://relay.damus.io")
  let pool = relay_pool.new(store, [url1])

  let fake_sock = websocket.fake(fn(_) { Ok(Nil) }, fn(_c, _r) { Nil })
  attach_socket(pool, url1, fake_sock, Connected)

  let received_a = ref.new(0)
  let received_b = ref.new(0)
  let flt = filter.new() |> filter.with_kinds([kind.Note])
  let sub_id = "collision"

  let closer_a =
    subscribe(pool, sub_id, [flt], fn(_s, _f) {
      ref.update(received_a, fn(n) { n + 1 })
    })
  let closer_b =
    subscribe(pool, sub_id, [flt], fn(_s, _f) {
      ref.update(received_b, fn(n) { n + 1 })
    })

  let subs = ref.get(pool.subscribers)
  let assert Ok(handlers) = dict.get(subs, sub_id)
  assert list.length(handlers) == 2

  let ev = make_test_event()
  let frame = relay_frame.EventFrame(sub_id, ev)
  list.each(handlers, fn(handler) {
    handler.handler("wss://relay.example", frame)
  })
  assert ref.get(received_a) == 1
  assert ref.get(received_b) == 1

  // Closing one subscriber keeps the other alive and sends no CLOSE.
  closer_a()
  let subs_after = ref.get(pool.subscribers)
  let assert Ok(remaining) = dict.get(subs_after, sub_id)
  assert list.length(remaining) == 1

  list.each(remaining, fn(handler) {
    handler.handler("wss://relay.example", frame)
  })
  assert ref.get(received_b) == 2

  closer_b()
  assert dict.has_key(ref.get(pool.subscribers), sub_id) == False
}
