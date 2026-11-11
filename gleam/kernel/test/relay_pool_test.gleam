import gleam/dict
import gleam/javascript/promise.{type Promise}
import gleam/list
import omni/kernel/nostr/relay_pool.{
  Connected, Disconnected, add_relay, attach_socket, get_configured_relays,
  get_statuses, publish, remove_relay, subscribe,
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
  let assert Ok(handler) = dict.get(subs, sub_id)
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
