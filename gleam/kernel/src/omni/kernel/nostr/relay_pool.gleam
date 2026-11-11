//// Relay pool state machine and socket manager.
////
//// Manages WebSocket connections to multiple Nostr relays, coordinates publication
//// and subscription dispatching, and persists configured relay URLs.

import gleam/dict.{type Dict}
import gleam/dynamic/decode
import gleam/javascript/promise.{type Promise}
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import omni/nostr/event.{type Event}
import omni/nostr/filter.{type Filter}
import omni/nostr/relay_frame.{type RelayFrame}
import omni/nostr/relay_url.{type RelayUrl}
import omni/platform/ref.{type Ref}
import omni/platform/storage.{type Storage}
import omni/platform/websocket.{type WebSocketConnection}

/// The connection lifecycle status of an individual relay.
pub type RelayStatus {
  Connected
  Connecting
  Disconnected(reason: String)
}

/// The active relay pool managing socket connections and subscribers.
pub type RelayPool {
  RelayPool(
    storage: Storage,
    sockets: Ref(Dict(String, WebSocketConnection)),
    statuses: Ref(Dict(String, RelayStatus)),
    subscribers: Ref(Dict(String, fn(RelayFrame) -> Nil)),
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
    )
  list.each(configured, fn(u) { connect_relay(pool, u) })
  pool
}

fn connect_relay(pool: RelayPool, url: RelayUrl) -> Nil {
  let url_str = relay_url.to_string(url)
  ref.update(pool.statuses, fn(st) { dict.insert(st, url_str, Connecting) })
  let conn =
    websocket.connect(url_str, fn(event) {
      case event {
        websocket.Open -> {
          ref.update(pool.statuses, fn(st) {
            dict.insert(st, url_str, Connected)
          })
        }
        websocket.Close(_code, reason) -> {
          ref.update(pool.statuses, fn(st) {
            dict.insert(st, url_str, Disconnected(reason))
          })
        }
        websocket.Error(err) -> {
          ref.update(pool.statuses, fn(st) {
            dict.insert(st, url_str, Disconnected(err))
          })
        }
        websocket.Message(text) -> {
          case relay_frame.parse_relay_frame(text) {
            Ok(frame) -> dispatch_frame(pool, frame)
            Error(_) -> Nil
          }
        }
      }
    })
  ref.update(pool.sockets, fn(s) { dict.insert(s, url_str, conn) })
  Nil
}

fn dispatch_frame(pool: RelayPool, frame: RelayFrame) -> Nil {
  let subs = ref.get(pool.subscribers)
  case frame {
    relay_frame.EventFrame(sub_id, _)
    | relay_frame.Eose(sub_id)
    | relay_frame.Closed(sub_id, _) -> {
      case dict.get(subs, sub_id) {
        Ok(handler) -> handler(frame)
        Error(Nil) -> Nil
      }
    }
    _ -> Nil
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
  ref.update(pool.statuses, fn(st) { dict.insert(st, url_str, status) })
  Nil
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
      connect_relay(pool, url)
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
  ref.update(pool.statuses, fn(st) {
    dict.insert(st, url_str, Disconnected("relay removed"))
  })
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
  on_frame: fn(RelayFrame) -> Nil,
) -> fn() -> Nil {
  ref.update(pool.subscribers, fn(subs) { dict.insert(subs, sub_id, on_frame) })
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
