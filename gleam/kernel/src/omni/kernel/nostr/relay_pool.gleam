//// Relay pool state machine and socket manager.
////
//// Manages WebSocket connections to multiple Nostr relays, coordinates publication
//// and subscription dispatching, replays subscriptions when a socket opens, and
//// reconnects with exponential backoff.

import gleam/dict.{type Dict}
import gleam/dynamic/decode
import gleam/int
import gleam/javascript/promise.{type Promise}
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import omni/nostr/event.{type Event}
import omni/nostr/filter.{type Filter}
import omni/nostr/relay_frame.{type RelayFrame}
import omni/nostr/relay_url.{type RelayUrl}
import omni/platform/promise_ext
import omni/platform/ref.{type Ref}
import omni/platform/storage.{type Storage}
import omni/platform/websocket.{type WebSocketConnection}

/// The connection lifecycle status of an individual relay.
pub type RelayStatus {
  Connected
  Connecting
  Disconnected(reason: String)
}

/// A registered subscription: filters are kept so `REQ` can be replayed every
/// time a relay socket opens.
pub type Subscriber {
  Subscriber(filters: List(Filter), handler: fn(String, RelayFrame) -> Nil)
}

/// The active relay pool managing socket connections and subscribers.
pub type RelayPool {
  RelayPool(
    storage: Storage,
    sockets: Ref(Dict(String, WebSocketConnection)),
    statuses: Ref(Dict(String, RelayStatus)),
    subscribers: Ref(Dict(String, Subscriber)),
    retries: Ref(Dict(String, Int)),
    status_listeners: Ref(List(fn(List(#(RelayUrl, RelayStatus))) -> Nil)),
  )
}

/// Storage key under which configured relay URLs are persisted.
pub const storage_key_configured_relays = "omni_configured_relays"

fn load_relays(store: Storage) -> List(RelayUrl) {
  case storage.get(store, storage_key_configured_relays) {
    Some(raw) -> {
      case json.parse(from: raw, using: decode.list(of: decode.string)) {
        Ok(urls) -> list.filter_map(urls, relay_url.parse)
        Error(_) -> []
      }
    }
    None -> []
  }
}

fn save_relays(store: Storage, relays: List(RelayUrl)) -> Nil {
  let encoded =
    json.array(relays, fn(u) { json.string(relay_url.to_string(u)) })
    |> json.to_string
  let _ = storage.set(store, storage_key_configured_relays, encoded)
  Nil
}

/// Initializes a new `RelayPool`. If no relays are stored in `storage`, persists
/// and connects to `bootstrap_relays`.
pub fn new(storage: Storage, bootstrap_relays: List(RelayUrl)) -> RelayPool {
  let existing = load_relays(storage)
  let configured = case existing {
    [] -> {
      save_relays(storage, bootstrap_relays)
      bootstrap_relays
    }
    relays -> relays
  }
  let pool =
    RelayPool(
      storage: storage,
      sockets: ref.new(dict.new()),
      statuses: ref.new(dict.new()),
      subscribers: ref.new(dict.new()),
      retries: ref.new(dict.new()),
      status_listeners: ref.new([]),
    )
  list.each(configured, fn(u) { connect(pool, u) })
  pool
}

fn connect(pool: RelayPool, url: RelayUrl) -> Nil {
  let url_str = relay_url.to_string(url)
  // Never open a second socket for a relay that is already connecting or open.
  case dict.get(ref.get(pool.sockets), url_str) {
    Ok(_) -> Nil
    Error(Nil) ->
      case dict.get(ref.get(pool.statuses), url_str) {
        Ok(Connecting) -> Nil
        _ -> begin_connect(pool, url, url_str)
      }
  }
}

fn begin_connect(pool: RelayPool, url: RelayUrl, url_str: String) -> Nil {
  set_status(pool, url_str, Connecting)
  let conn =
    websocket.connect(url_str, fn(event) {
      case event {
        websocket.Open -> {
          ref.update(pool.retries, fn(r) { dict.delete(r, url_str) })
          set_status(pool, url_str, Connected)
          case dict.get(ref.get(pool.sockets), url_str) {
            Ok(sock) -> replay_subscriptions(pool, sock)
            Error(Nil) -> Nil
          }
        }
        websocket.Close(_code, reason) -> {
          ref.update(pool.sockets, fn(s) { dict.delete(s, url_str) })
          set_status(pool, url_str, Disconnected(reason))
          reconnect(pool, url, url_str)
        }
        websocket.Error(err) -> {
          ref.update(pool.sockets, fn(s) { dict.delete(s, url_str) })
          set_status(pool, url_str, Disconnected(err))
          reconnect(pool, url, url_str)
        }
        websocket.Message(text) -> {
          case relay_frame.parse_relay_frame(text) {
            Ok(frame) -> dispatch_frame(pool, url_str, frame)
            Error(_) -> Nil
          }
        }
      }
    })
  ref.update(pool.sockets, fn(s) { dict.insert(s, url_str, conn) })
  Nil
}

fn reconnect(pool: RelayPool, url: RelayUrl, url_str: String) -> Nil {
  let still_configured =
    list.any(load_relays(pool.storage), fn(u) {
      relay_url.to_string(u) == url_str
    })
  case still_configured {
    False -> Nil
    True -> {
      let attempt = case dict.get(ref.get(pool.retries), url_str) {
        Ok(n) -> n + 1
        Error(Nil) -> 1
      }
      ref.update(pool.retries, fn(r) { dict.insert(r, url_str, attempt) })
      let exponent = int.min(attempt - 1, 6)
      let delay_ms = int.min(30_000, 500 * pow2(exponent))
      let _ =
        promise_ext.delay(delay_ms, Nil)
        |> promise.map(fn(_) {
          case dict.get(ref.get(pool.statuses), url_str) {
            Ok(Connected) | Ok(Connecting) -> Nil
            _ -> connect(pool, url)
          }
        })
      Nil
    }
  }
}

fn pow2(n: Int) -> Int {
  case n <= 0 {
    True -> 1
    False -> 2 * pow2(n - 1)
  }
}

fn set_status(pool: RelayPool, url_str: String, status: RelayStatus) -> Nil {
  ref.update(pool.statuses, fn(st) { dict.insert(st, url_str, status) })
  notify_status_listeners(pool)
}

fn notify_status_listeners(pool: RelayPool) -> Nil {
  let snapshot = get_statuses(pool)
  ref.get(pool.status_listeners)
  |> list.each(fn(listener) { listener(snapshot) })
}

fn replay_subscriptions(pool: RelayPool, sock: WebSocketConnection) -> Nil {
  dict.each(ref.get(pool.subscribers), fn(sub_id, subscriber) {
    let req_json =
      relay_frame.client_frame_to_json(relay_frame.Req(
        sub_id,
        subscriber.filters,
      ))
    let _ = websocket.send(sock, req_json)
    Nil
  })
}

fn dispatch_frame(
  pool: RelayPool,
  source_url: String,
  frame: RelayFrame,
) -> Nil {
  let subs = ref.get(pool.subscribers)
  case frame {
    relay_frame.EventFrame(sub_id, _)
    | relay_frame.Eose(sub_id)
    | relay_frame.Closed(sub_id, _) -> {
      case dict.get(subs, sub_id) {
        Ok(subscriber) -> subscriber.handler(source_url, frame)
        Error(Nil) -> Nil
      }
    }
    relay_frame.Notice(_)
    | relay_frame.Ok(_, _, _)
    | relay_frame.AuthChallenge(_) -> Nil
    _ -> Nil
  }
}

/// Register a listener for relay status changes. Returns an unsubscribe function.
pub fn watch_statuses(
  pool: RelayPool,
  listener: fn(List(#(RelayUrl, RelayStatus))) -> Nil,
) -> fn() -> Nil {
  ref.update(pool.status_listeners, fn(ls) { [listener, ..ls] })
  fn() {
    ref.update(pool.status_listeners, fn(ls) {
      list.filter(ls, fn(l) { l != listener })
    })
  }
}

/// Attaches an existing socket connection and status directly into the pool.
///
/// Useful for testing with `websocket.fake`.
pub fn attach_socket(
  pool: RelayPool,
  url: RelayUrl,
  conn: WebSocketConnection,
  status: RelayStatus,
) -> Nil {
  let url_str = relay_url.to_string(url)
  ref.update(pool.sockets, fn(s) { dict.insert(s, url_str, conn) })
  set_status(pool, url_str, status)
}

/// Adds a new relay to the configured pool and establishes a connection.
pub fn add_relay(pool: RelayPool, url: RelayUrl) -> Nil {
  let current = get_configured_relays(pool)
  let url_str = relay_url.to_string(url)
  let already_present =
    list.any(current, fn(u) { relay_url.to_string(u) == url_str })
  case already_present {
    True -> Nil
    False -> {
      let updated = list.append(current, [url])
      save_relays(pool.storage, updated)
      connect(pool, url)
    }
  }
}

/// Removes a relay from the configured pool, closing any open socket.
pub fn remove_relay(pool: RelayPool, url: RelayUrl) -> Nil {
  let current = get_configured_relays(pool)
  let url_str = relay_url.to_string(url)
  let updated =
    list.filter(current, fn(u) { relay_url.to_string(u) != url_str })
  save_relays(pool.storage, updated)
  case dict.get(ref.get(pool.sockets), url_str) {
    Ok(sock) -> {
      websocket.close(sock, 1000, "relay removed")
      ref.update(pool.sockets, fn(s) { dict.delete(s, url_str) })
    }
    Error(Nil) -> Nil
  }
  ref.update(pool.retries, fn(r) { dict.delete(r, url_str) })
  set_status(pool, url_str, Disconnected("relay removed"))
}

/// Returns the list of currently configured relay URLs.
pub fn get_configured_relays(pool: RelayPool) -> List(RelayUrl) {
  load_relays(pool.storage)
}

/// Returns the connection statuses of all configured relays.
pub fn get_statuses(pool: RelayPool) -> List(#(RelayUrl, RelayStatus)) {
  let relays = get_configured_relays(pool)
  let status_map = ref.get(pool.statuses)
  list.map(relays, fn(url) {
    let st = case dict.get(status_map, relay_url.to_string(url)) {
      Ok(s) -> s
      Error(Nil) -> Disconnected("unconnected")
    }
    #(url, st)
  })
}

/// Publishes an event to all configured relays, returning a list of `# (url, success, message)`.
pub fn publish(
  pool: RelayPool,
  event: Event,
) -> Promise(List(#(RelayUrl, Bool, String))) {
  let frame_json = relay_frame.client_frame_to_json(relay_frame.Event(event))
  let relays = get_configured_relays(pool)
  let sockets = ref.get(pool.sockets)
  let statuses = ref.get(pool.statuses)
  let results =
    list.map(relays, fn(url) {
      let url_str = relay_url.to_string(url)
      let status = dict.get(statuses, url_str)
      case status {
        Ok(Connected) -> {
          case dict.get(sockets, url_str) {
            Ok(sock) -> {
              case websocket.send(sock, frame_json) {
                Ok(Nil) -> #(url, True, "sent")
                Error(Nil) -> #(url, False, "send failed")
              }
            }
            Error(Nil) -> #(url, False, "socket missing")
          }
        }
        Ok(Connecting) -> #(url, False, "connecting")
        Ok(Disconnected(reason)) -> #(url, False, reason)
        Error(Nil) -> #(url, False, "not connected")
      }
    })
  promise.resolve(results)
}

/// Registers an active subscription across the pool and sends `REQ` frames to connected sockets.
///
/// Returns an unsubscription closer that sends `CLOSE` frames and removes the subscriber.
pub fn subscribe(
  pool: RelayPool,
  sub_id: String,
  filters: List(Filter),
  on_frame: fn(String, RelayFrame) -> Nil,
) -> fn() -> Nil {
  ref.update(pool.subscribers, fn(subs) {
    dict.insert(subs, sub_id, Subscriber(filters: filters, handler: on_frame))
  })
  let req_json =
    relay_frame.client_frame_to_json(relay_frame.Req(sub_id, filters))
  let sockets = ref.get(pool.sockets)
  let statuses = ref.get(pool.statuses)
  dict.each(sockets, fn(url_str, sock) {
    case dict.get(statuses, url_str) {
      Ok(Connected) -> {
        let _ = websocket.send(sock, req_json)
        Nil
      }
      _ -> Nil
    }
  })
  fn() {
    ref.update(pool.subscribers, fn(subs) { dict.delete(subs, sub_id) })
    let close_json = relay_frame.client_frame_to_json(relay_frame.Close(sub_id))
    let cur_sockets = ref.get(pool.sockets)
    let cur_statuses = ref.get(pool.statuses)
    dict.each(cur_sockets, fn(url_str, sock) {
      case dict.get(cur_statuses, url_str) {
        Ok(Connected) -> {
          let _ = websocket.send(sock, close_json)
          Nil
        }
        _ -> Nil
      }
    })
    Nil
  }
}
