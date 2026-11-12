//// Unit and integration tests for `plugin_relays` (Phase 7.5).

import gleam/list
import gleam/option.{None, Some}
import gleam/string
import gleeunit
import gleeunit/should
import omni/nostr/kind as nostr_kind
import omni/platform/ref
import omni/plugin_kit/app
import omni/plugin_kit/route
import omni/plugin_kit/schema
import omni/protocol/relay_command as rc
import omni/protocol/schema/node
import plugin/relays/main
import plugin/relays/model.{
  RelayEntry, StateConnected, StateConnecting, StateDisconnected, StateError,
  ViewCompact, ViewMain, ViewWidget,
}
import plugin/relays/msg.{
  AddRelay, DismissError, PublishNip65, ReconnectRelay, RemoveRelay, SetDraftUrl,
  SetViewMode, ToggleRead, ToggleWrite, UpdateRelayState,
}
import plugin/relays/update
import plugin/relays/view

pub fn main() -> Nil {
  gleeunit.main()
}

pub fn init_default_bootstrap_relays_test() {
  let m = model.init(ViewMain)
  assert list.length(m.relays) == 3
  assert model.connected_count(m) == 3
  assert model.total_events_received(m) == 0
  assert m.error_banner == None

  let urls = list.map(m.relays, fn(r) { r.url })
  assert urls
    == [
      "wss://relay.damus.io",
      "wss://relay.ditto.pub",
      "wss://relay.nostr.band",
    ]
}

pub fn add_relay_url_validation_test() {
  let m0 = model.init(ViewMain)

  // Invalid scheme (http:// instead of ws:// or wss://)
  let #(m1, _) = update.update(m0, SetDraftUrl("https://not-a-websocket.com"))
  let #(m2, _) = update.update(m1, AddRelay)
  assert list.length(m2.relays) == 3
  assert m2.error_banner != None

  // Dismiss error banner
  let #(m3, _) = update.update(m2, DismissError)
  assert m3.error_banner == None

  // Valid relay URL with uppercase host & trailing slash gets normalized
  let #(m4, _) = update.update(m3, SetDraftUrl("wss://Relay.Primal.Net/"))
  let #(m5, _) = update.update(m4, AddRelay)
  assert list.length(m5.relays) == 4
  assert m5.draft_url == ""
  assert m5.error_banner == None
  assert list.any(m5.relays, fn(r) { r.url == "wss://relay.primal.net" })

  // Duplicate relay rejected with error banner
  let #(m6, _) = update.update(m5, SetDraftUrl("wss://relay.primal.net"))
  let #(m7, _) = update.update(m6, AddRelay)
  assert list.length(m7.relays) == 4
  assert m7.error_banner != None
}

pub fn remove_and_toggle_flags_test() {
  let m0 = model.init(ViewMain)

  // Toggle read and write on wss://relay.damus.io
  let #(m1, _) = update.update(m0, ToggleRead("wss://relay.damus.io"))
  let #(m2, _) = update.update(m1, ToggleWrite("wss://relay.ditto.pub"))

  let assert Ok(damus) =
    list.find(m2.relays, fn(r) { r.url == "wss://relay.damus.io" })
  assert damus.read == False
  assert damus.write == True

  let assert Ok(ditto) =
    list.find(m2.relays, fn(r) { r.url == "wss://relay.ditto.pub" })
  assert ditto.read == True
  assert ditto.write == False

  // Reconnect and update relay state
  let #(m3, _) = update.update(m2, ReconnectRelay("wss://relay.damus.io"))
  let assert Ok(damus_reconn) =
    list.find(m3.relays, fn(r) { r.url == "wss://relay.damus.io" })
  assert damus_reconn.state == StateConnecting

  let #(m4, _) =
    update.update(
      m3,
      UpdateRelayState("wss://relay.damus.io", StateConnected, Some(42)),
    )
  let assert Ok(damus_conn) =
    list.find(m4.relays, fn(r) { r.url == "wss://relay.damus.io" })
  assert damus_conn.latency_ms == Some(42)

  // Remove relay
  let #(m5, _) = update.update(m4, RemoveRelay("wss://relay.nostr.band"))
  assert list.length(m5.relays) == 2
}

pub fn nip65_tags_round_trip_test() {
  let entries = [
    RelayEntry(
      url: "wss://relay.damus.io",
      read: True,
      write: True,
      state: StateConnected,
      latency_ms: Some(25),
      events_received: 10,
      events_sent: 2,
    ),
    RelayEntry(
      url: "wss://relay.ditto.pub",
      read: True,
      write: False,
      state: StateConnected,
      latency_ms: None,
      events_received: 5,
      events_sent: 0,
    ),
    RelayEntry(
      url: "wss://relay.nostr.band",
      read: False,
      write: True,
      state: StateDisconnected,
      latency_ms: None,
      events_received: 0,
      events_sent: 1,
    ),
    RelayEntry(
      url: "wss://disabled.example.com",
      read: False,
      write: False,
      state: StateError("timeout"),
      latency_ms: None,
      events_received: 0,
      events_sent: 0,
    ),
  ]

  let tags = model.to_nip65_tags(entries)
  assert tags
    == [
      ["r", "wss://relay.damus.io"],
      ["r", "wss://relay.ditto.pub", "read"],
      ["r", "wss://relay.nostr.band", "write"],
    ]

  let parsed = model.from_nip65_tags(tags)
  assert list.length(parsed) == 3

  let assert [r1, r2, r3] = parsed
  assert r1.url == "wss://relay.damus.io"
  assert r1.read == True
  assert r1.write == True

  assert r2.url == "wss://relay.ditto.pub"
  assert r2.read == True
  assert r2.write == False

  assert r3.url == "wss://relay.nostr.band"
  assert r3.read == False
  assert r3.write == True
}

pub fn view_modes_render_test() {
  let m_main = model.init(ViewMain)
  let node_main = view.view(m_main)
  assert node.node_type_name(node_main) == "card"
  let json_main = schema.encode_schema_message(node_main)
  assert string.contains(json_main, "Relay Pool Manager")
  assert string.contains(json_main, "Publish NIP-65 Relay List")
  assert string.contains(json_main, "status-indicator")

  let #(m_widget, _) = update.update(m_main, SetViewMode(ViewWidget))
  let node_widget = view.view(m_widget)
  assert node.node_type_name(node_widget) == "card"
  let json_widget = schema.encode_schema_message(node_widget)
  assert string.contains(json_widget, "Relay Pool")

  let #(m_compact, _) = update.update(m_main, SetViewMode(ViewCompact))
  let node_compact = view.view(m_compact)
  assert node.node_type_name(node_compact) == "metric"
  let json_compact = schema.encode_schema_message(node_compact)
  assert string.contains(json_compact, "3/3 Online")
}

pub fn start_app_action_round_trip_test() {
  let emitted_ref = ref.new([])
  let running =
    main.start_app("?view=main", fn(n) {
      ref.update(emitted_ref, fn(prev) { list.append(prev, [n]) })
    })

  assert list.length(ref.get(emitted_ref)) == 1

  // Set draft URL via JSON action
  let assert Ok(True) =
    app.handle_action_json(
      running,
      "{\"type\":\"omni:action\",\"action\":\"set-draft-url\",\"payload\":{\"value\":\"wss://nos.lol\"}}",
    )
  assert app.current_model(running).draft_url == "wss://nos.lol"

  // Add relay via JSON action
  let assert Ok(True) =
    app.handle_action_json(
      running,
      "{\"type\":\"omni:action\",\"action\":\"add-relay\"}",
    )
  assert list.length(app.current_model(running).relays) == 4

  // Publish NIP-65 action
  let assert Ok(True) =
    app.handle_action_json(
      running,
      "{\"type\":\"omni:action\",\"action\":\"publish-nip65\"}",
    )
  assert app.current_model(running).syncing_nip65 == True
}

pub fn publish_nip65_emits_relay_list_event_test() {
  let m0 = model.init(ViewMain)
  let #(_, effects) = update.update(m0, PublishNip65)
  should.be_true(
    list.any(effects, fn(effect) {
      case effect {
        app.Publish(draft) ->
          draft.kind == nostr_kind.RelayList
          && list.any(draft.tags, fn(tag) {
            case tag {
              ["r", _, ..] -> True
              _ -> False
            }
          })
        _ -> False
      }
    }),
  )
}

pub fn relay_mutations_emit_pool_commands_test() {
  let m = model.init(model.ViewMain)
  let assert Ok(first) = list.first(m.relays)

  let #(_, remove_effects) = update.update(m, RemoveRelay(first.url))
  should.be_true(
    list.any(remove_effects, fn(effect) {
      case effect {
        app.Relay(rc.RemoveRelay(url)) -> url == first.url
        _ -> False
      }
    }),
  )

  let #(_, toggle_effects) = update.update(m, ToggleRead(first.url))
  should.be_true(
    list.any(toggle_effects, fn(effect) {
      case effect {
        app.Relay(rc.SetRelayScope(url, _, _)) -> url == first.url
        _ -> False
      }
    }),
  )
}
