//// Virtual `WebSocket` shim for guest sandboxes.
////
//// Standard Nostr relay frames (`REQ`, `CLOSE`, `EVENT`) sent by an unmodified
//// client are translated into host kernel RPC calls, and host stream
//// notifications are translated back into `["EVENT", sub, event]` /
//// `["EOSE", sub]` frames.

import gleam/json
import gleam/option.{type Option, None, Some}
import gleam/string
import omni/nostr/event
import omni/nostr/event_id
import omni/nostr/filter_codec
import omni/nostr/kind
import omni/nostr/pubkey
import omni/nostr/relay_frame.{Close, Event, Req}

/// Browser-compatible `WebSocket` ready states.
pub const state_connecting = 0

pub const state_open = 1

pub const state_closing = 2

pub const state_closed = 3

/// Relay URLs that should save events locally instead of broadcasting.
pub fn is_local_url(url: String) -> Bool {
  let lower = string.lowercase(url)
  string.contains(lower, "local") || string.contains(lower, "offline")
}

/// Translate a client-sent frame into kernel RPC calls.
///
/// Returns the JSON frame to echo back for publish acknowledgements, if any.
pub fn handle_client_frame(
  raw_frame: String,
  local_only: Bool,
  call_rpc: fn(String, String) -> Nil,
) -> Option(String) {
  case relay_frame.parse_client_frame(raw_frame) {
    Ok(Req(sub_id, filters)) -> {
      let params =
        json.object([
          #("subscriptionId", json.string(sub_id)),
          #("filters", json.array(filters, of: filter_codec.to_json)),
        ])
        |> json.to_string
      call_rpc("nostr.subscribe", params)
      None
    }

    Ok(Close(sub_id)) -> {
      call_rpc(
        "nostr.unsubscribe",
        json.object([#("subscriptionId", json.string(sub_id))])
          |> json.to_string,
      )
      None
    }

    Ok(Event(ev)) -> {
      let event_json = event_to_json(ev)
      let params =
        json.object([
          #("event", event_json),
          #("localOnly", json.bool(local_only)),
        ])
        |> json.to_string
      call_rpc("nostr.publish", params)
      Some(ok_frame(event_id_string(ev), True, "saved-locally"))
    }

    _ -> None
  }
}

fn event_id_string(ev: event.Event) -> String {
  event_id.to_hex(ev.id)
}

fn event_to_json(ev: event.Event) -> json.Json {
  json.object([
    #("id", json.string(event_id.to_hex(ev.id))),
    #("pubkey", json.string(pubkey.to_hex(ev.pubkey))),
    #("created_at", json.int(ev.created_at)),
    #("kind", json.int(kind.to_int(ev.kind))),
    #(
      "tags",
      json.array(ev.tags, of: fn(tag) { json.array(tag, of: json.string) }),
    ),
    #("content", json.string(ev.content)),
    #("sig", json.string(ev.sig)),
  ])
}

/// Build a relay `OK` frame.
pub fn ok_frame(event_id: String, accepted: Bool, message: String) -> String {
  json.array(
    [
      json.string("OK"),
      json.string(event_id),
      json.bool(accepted),
      json.string(message),
    ],
    of: identity,
  )
  |> json.to_string
}

/// Build a relay `EVENT` frame for a subscription.
pub fn event_frame(sub_id: String, event_json: String) -> String {
  json.array(
    [json.string("EVENT"), json.string(sub_id), json.string(event_json)],
    of: identity,
  )
  |> json.to_string
}

fn identity(value: json.Json) -> json.Json {
  value
}

/// Install the virtual `WebSocket`, forwarding frames through `call_rpc`.
@external(javascript, "./websocket_shim.ffi.mjs", "install")
pub fn install(
  call_rpc: fn(String, String) -> Nil,
  handle_frame: fn(String, Bool) -> Option(String),
) -> Nil

/// Route a host stream notification to the socket that owns the subscription.
@external(javascript, "./websocket_shim.ffi.mjs", "route_notification")
pub fn route_notification(raw_notification: String) -> Nil
