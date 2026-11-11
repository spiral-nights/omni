//// Pure state transition logic and action mapping for `plugin_relays`.

import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import omni/nostr/event.{UnsignedEvent}
import omni/nostr/kind
import omni/nostr/relay_url
import omni/platform/clock
import omni/plugin_kit/app.{type Effect, Publish}
import omni/plugin_kit/schema
import omni/protocol/schema/action.{type Action}
import plugin/relays/model.{
  type Model, type RelayConnectionState, type ViewMode, Model, RelayEntry,
  StateConnected, StateConnecting, StateDisconnected, StateError, ViewCompact,
  ViewMain, ViewWidget,
}
import plugin/relays/msg.{
  type Msg, AddRelay, DismissError, PublishNip65, ReconnectRelay, RemoveRelay,
  SetDraftUrl, SetViewMode, ToggleRead, ToggleWrite, UpdateRelayState,
}

/// Pure Elm-style state update function for `plugin_relays`.
pub fn update(model: Model, msg: Msg) -> #(Model, List(Effect(Msg))) {
  case msg {
    SetDraftUrl(val) -> #(
      Model(..model, draft_url: val, error_banner: None),
      [],
    )

    AddRelay -> handle_add_relay(model)

    RemoveRelay(url) -> {
      let filtered = list.filter(model.relays, fn(r) { r.url != url })
      #(Model(..model, relays: filtered), [])
    }

    ToggleRead(url) -> {
      let updated =
        list.map(model.relays, fn(r) {
          case r.url == url {
            True -> RelayEntry(..r, read: !r.read)
            False -> r
          }
        })
      #(Model(..model, relays: updated), [])
    }

    ToggleWrite(url) -> {
      let updated =
        list.map(model.relays, fn(r) {
          case r.url == url {
            True -> RelayEntry(..r, write: !r.write)
            False -> r
          }
        })
      #(Model(..model, relays: updated), [])
    }

    ReconnectRelay(url) -> {
      let updated =
        list.map(model.relays, fn(r) {
          case r.url == url {
            True -> RelayEntry(..r, state: StateConnecting)
            False -> r
          }
        })
      #(Model(..model, relays: updated), [])
    }

    UpdateRelayState(url, next_state, latency) -> {
      let updated =
        list.map(model.relays, fn(r) {
          case r.url == url {
            True -> RelayEntry(..r, state: next_state, latency_ms: latency)
            False -> r
          }
        })
      #(Model(..model, relays: updated), [])
    }

    PublishNip65 -> #(Model(..model, syncing_nip65: True, error_banner: None), [
      Publish(UnsignedEvent(
        pubkey: None,
        created_at: clock.system().now_ms() / 1000,
        kind: kind.RelayList,
        tags: model.to_nip65_tags(model.relays),
        content: "",
      )),
    ])

    DismissError -> #(Model(..model, error_banner: None), [])

    SetViewMode(mode) -> #(Model(..model, view_mode: mode), [])
  }
}

fn handle_add_relay(model: Model) -> #(Model, List(Effect(Msg))) {
  let raw = string.trim(model.draft_url)
  case relay_url.parse(raw) {
    Error(Nil) -> #(
      Model(
        ..model,
        error_banner: Some(
          "Invalid relay URL. Please enter a valid ws:// or wss:// relay address.",
        ),
      ),
      [],
    )
    Ok(parsed) -> {
      let norm = relay_url.to_string(parsed)
      let exists = list.any(model.relays, fn(r) { r.url == norm })
      case exists {
        True -> #(
          Model(
            ..model,
            error_banner: Some("Relay is already in the pool: " <> norm),
          ),
          [],
        )
        False -> {
          let new_entry = model.default_relay_entry(norm)
          #(
            Model(
              ..model,
              relays: list.append(model.relays, [new_entry]),
              draft_url: "",
              error_banner: None,
            ),
            [],
          )
        }
      }
    }
  }
}

/// Maps incoming Channel 1 `Action` events into `Msg`.
pub fn action_to_msg(act: Action) -> Option(Msg) {
  case act.name {
    "add-relay" | "add_relay" -> {
      case extract_url_payload(act) {
        Some(url) ->
          case string.trim(url) {
            "" -> Some(AddRelay)
            _ -> Some(AddRelay)
          }
        None -> Some(AddRelay)
      }
    }

    "set-draft-url" | "set_draft_url" | "draft-url" ->
      case
        first_some([
          schema.payload_string(act, "value"),
          schema.payload_string(act, "draft_url"),
          schema.payload_string(act, "relayUrl"),
          schema.payload_string(act, "url"),
        ])
      {
        Some(val) -> Some(SetDraftUrl(val))
        None -> Some(SetDraftUrl(""))
      }

    "remove-relay" | "remove_relay" ->
      case extract_url_payload(act) {
        Some(url) -> Some(RemoveRelay(url))
        None -> None
      }

    "toggle-read" | "toggle_read" ->
      case extract_url_payload(act) {
        Some(url) -> Some(ToggleRead(url))
        None -> None
      }

    "toggle-write" | "toggle_write" ->
      case extract_url_payload(act) {
        Some(url) -> Some(ToggleWrite(url))
        None -> None
      }

    "reconnect-relay" | "reconnect_relay" ->
      case extract_url_payload(act) {
        Some(url) -> Some(ReconnectRelay(url))
        None -> None
      }

    "update-relay-state" | "update_relay_state" ->
      case extract_url_payload(act) {
        Some(url) -> {
          let state_str = case schema.payload_string(act, "state") {
            Some(s) -> s
            None -> "connected"
          }
          let latency = schema.payload_int(act, "latency_ms")
          Some(UpdateRelayState(url, parse_connection_state(state_str), latency))
        }
        None -> None
      }

    "publish-nip65" | "publish_nip65" -> Some(PublishNip65)

    "dismiss-error" | "dismiss_error" -> Some(DismissError)

    "set-view-mode" | "set_view_mode" ->
      case
        first_some([
          schema.payload_string(act, "view"),
          schema.payload_string(act, "mode"),
          schema.payload_string(act, "value"),
        ])
      {
        Some(v) -> Some(SetViewMode(parse_view_mode(v)))
        None -> None
      }

    _ -> None
  }
}

/// Converts a route view string (`"main"`, `"widget"`, `"compact"`) into `ViewMode`.
pub fn parse_view_mode(view_str: String) -> ViewMode {
  case string.lowercase(string.trim(view_str)) {
    "widget" | "sidebar" -> ViewWidget
    "compact" | "header-actions" -> ViewCompact
    _ -> ViewMain
  }
}

fn parse_connection_state(raw: String) -> RelayConnectionState {
  case string.lowercase(string.trim(raw)) {
    "connected" | "online" -> StateConnected
    "connecting" -> StateConnecting
    "disconnected" | "offline" -> StateDisconnected
    other -> StateError(other)
  }
}

fn extract_url_payload(act: Action) -> Option(String) {
  first_some([
    schema.payload_string(act, "url"),
    schema.payload_string(act, "relayUrl"),
    schema.payload_string(act, "value"),
  ])
}

fn first_some(items: List(Option(a))) -> Option(a) {
  case items {
    [] -> None
    [Some(v), ..] -> Some(v)
    [None, ..rest] -> first_some(rest)
  }
}
