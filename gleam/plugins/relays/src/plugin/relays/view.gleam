//// Declarative Schema UI views for `plugin_relays`.

import gleam/dict
import gleam/dynamic
import gleam/int
import gleam/list
import gleam/option.{None, Some}
import omni/plugin_kit/schema
import omni/protocol/schema/action.{type Action}
import omni/protocol/schema/node.{
  type IndicatorStatus, type Node, AlignCenter, BadgeNeutral, BadgeSubtle,
  BadgeSuccess, BannerError, BannerInfo, Button, ButtonDanger, ButtonGhost,
  ButtonSecondary, Caption, Input, InputUrl, JustifyBetween, MetricInt,
  StatusConnecting, StatusError, StatusIndicator, StatusOffline, StatusOnline,
  ToneMuted, ToneSecondary,
}
import omni/protocol/schema/style.{SizeSm}
import plugin/relays/model.{
  type Model, type RelayConnectionState, type RelayEntry, StateConnected,
  StateConnecting, StateDisconnected, StateError, ViewCompact, ViewMain,
  ViewWidget,
}

/// Renders the root Schema `Node` for the current `Model`.
pub fn view(model: Model) -> Node {
  case model.view_mode {
    ViewCompact -> view_compact(model)
    ViewWidget -> view_widget(model)
    ViewMain -> view_main(model)
  }
}

fn view_compact(model: Model) -> Node {
  let conn = model.connected_count(model)
  let total = list.length(model.relays)
  let sub = case total {
    0 -> "Offline"
    _ -> int.to_string(conn) <> "/" <> int.to_string(total) <> " Online"
  }

  let base_metric = schema.metric("Relays", MetricInt(conn))
  case base_metric {
    node.Metric(..) as m -> node.Metric(..m, subtext: Some(sub))
    other -> other
  }
}

fn view_widget(model: Model) -> Node {
  let conn = model.connected_count(model)
  let total = list.length(model.relays)
  let indicator_status = case conn > 0 {
    True -> StatusOnline
    False -> StatusOffline
  }
  let status_label =
    int.to_string(conn) <> " of " <> int.to_string(total) <> " connected"

  let status_node =
    StatusIndicator(
      base: node.empty_base(),
      status: indicator_status,
      label: Some(status_label),
      pulse: Some(conn > 0),
    )

  let items =
    list.map(model.relays, fn(r) {
      schema.list_item(r.url)
      |> schema.subtitle(state_label(r.state))
      |> schema.with_icon("server")
    })

  schema.card()
  |> schema.title("Relay Pool")
  |> schema.subtitle("Decentralized WebSocket pool")
  |> schema.with_icon("server")
  |> schema.children([
    status_node,
    schema.list_view(items),
  ])
}

fn view_main(model: Model) -> Node {
  let conn = model.connected_count(model)
  let total = list.length(model.relays)
  let total_rx = model.total_events_received(model)

  let pool_metric = case schema.metric("Connected Relays", MetricInt(conn)) {
    node.Metric(..) as m ->
      node.Metric(
        ..m,
        subtext: Some(
          int.to_string(conn) <> " of " <> int.to_string(total) <> " active",
        ),
      )
    other -> other
  }

  let events_metric = case
    schema.metric("Events Received", MetricInt(total_rx))
  {
    node.Metric(..) as m -> node.Metric(..m, subtext: Some("Session total"))
    other -> other
  }

  let nip65_label = case model.syncing_nip65 {
    True -> "NIP-65 Synced"
    False -> "Publish NIP-65 Relay List"
  }

  let nip65_btn =
    schema.button(nip65_label, schema.new_action("publish-nip65"))
    |> schema.with_icon("globe")

  let metrics_bar =
    schema.box()
    |> schema.row()
    |> schema.align(AlignCenter)
    |> schema.justify(JustifyBetween)
    |> schema.gap("md")
    |> schema.children([
      pool_metric,
      events_metric,
      nip65_btn,
    ])

  let url_input = case
    schema.input("relayUrl")
    |> schema.input_type(InputUrl)
    |> schema.placeholder("wss://relay.example.com")
    |> schema.value(model.draft_url)
  {
    Input(..) as inp ->
      Input(
        ..inp,
        action_on_change: Some(schema.new_action("set-draft-url")),
        action_on_enter: Some(schema.new_action("add-relay")),
      )
    other -> other
  }

  let add_btn = schema.button("Add Relay", schema.new_action("add-relay"))

  let add_bar =
    schema.box()
    |> schema.row()
    |> schema.gap("sm")
    |> schema.align(AlignCenter)
    |> schema.children([url_input, add_btn])

  let preset_bar =
    schema.box()
    |> schema.row()
    |> schema.gap("xs")
    |> schema.align(AlignCenter)
    |> schema.children([
      preset_button("Ditto", "wss://relay.ditto.pub"),
      preset_button("Damus", "wss://relay.damus.io"),
      preset_button("nos.lol", "wss://nos.lol"),
      preset_button("Primal", "wss://relay.primal.net"),
      preset_button("nostr.band", "wss://relay.nostr.band"),
    ])

  let error_nodes = case model.error_banner {
    Some(err_msg) -> {
      let ban = case
        schema.banner(err_msg)
        |> schema.title("Relay Validation Error")
        |> schema.banner_tone(BannerError)
      {
        node.Banner(..) as b ->
          node.Banner(
            ..b,
            dismissible: Some(True),
            on_dismiss_action: Some(schema.new_action("dismiss-error")),
          )
        other -> other
      }
      [ban]
    }
    None -> []
  }

  let preset_hint =
    schema.text("Quick add popular relays:")
    |> schema.text_variant(Caption)
    |> schema.text_tone(ToneMuted)

  let relay_cards = case model.relays {
    [] -> [
      schema.banner(
        "No relays are currently configured. Events are served from the local event store.",
      )
      |> schema.title("Local Offline Mode")
      |> schema.banner_tone(BannerInfo),
    ]
    entries -> list.map(entries, render_relay_card)
  }

  let all_children =
    list.flatten([
      [metrics_bar, add_bar],
      error_nodes,
      relay_cards,
    ])

  schema.card()
  |> schema.title("Relay Pool Manager")
  |> schema.subtitle(
    "Active WebSocket connections and NIP-65 relay list configuration",
  )
  |> schema.with_icon("server")
  |> schema.children(all_children)
}

fn preset_button(label: String, url: String) -> Node {
  let act =
    schema.new_action("add-relay")
    |> schema.with_payload(dict.from_list([#("url", dynamic.string(url))]))

  Button(
    base: node.empty_base(),
    label: label,
    action: act,
    variant: Some(ButtonGhost),
    size: Some(SizeSm),
    icon: Some("plus"),
    icon_position: None,
    disabled: None,
    loading: None,
  )
}

fn render_relay_card(entry: RelayEntry) -> Node {
  let status_ind =
    StatusIndicator(
      base: node.empty_base(),
      status: to_indicator_status(entry.state),
      label: Some(state_label(entry.state)),
      pulse: Some(entry.state == StateConnected),
    )

  let latency_text = case entry.latency_ms {
    Some(ms) -> int.to_string(ms) <> " ms"
    None -> "-- ms"
  }

  let latency_badge =
    node.Badge(
      base: node.empty_base(),
      label: latency_text,
      tone: Some(case entry.state {
        StateConnected -> BadgeSuccess
        _ -> BadgeNeutral
      }),
      variant: Some(BadgeSubtle),
      dot: None,
    )

  let read_toggle = case
    schema.toggle(
      "read:" <> entry.url,
      entry.read,
      url_action("toggle-read", entry.url),
    )
  {
    node.Toggle(..) as t -> node.Toggle(..t, label: Some("Read"))
    other -> other
  }

  let write_toggle = case
    schema.toggle(
      "write:" <> entry.url,
      entry.write,
      url_action("toggle-write", entry.url),
    )
  {
    node.Toggle(..) as t -> node.Toggle(..t, label: Some("Write"))
    other -> other
  }

  let reconnect_btn = case
    schema.button("Reconnect", url_action("reconnect-relay", entry.url))
  {
    node.Button(..) as b ->
      node.Button(..b, variant: Some(ButtonSecondary), size: Some(SizeSm))
    other -> other
  }

  let remove_btn = case
    schema.button("Remove", url_action("remove-relay", entry.url))
  {
    node.Button(..) as b ->
      node.Button(..b, variant: Some(ButtonDanger), size: Some(SizeSm))
    other -> other
  }

  let stats_line =
    schema.text(
      "Received: "
      <> int.to_string(entry.events_received)
      <> " | Sent: "
      <> int.to_string(entry.events_sent),
    )
    |> schema.text_tone(ToneSecondary)

  let controls_row =
    schema.box()
    |> schema.row()
    |> schema.align(AlignCenter)
    |> schema.justify(JustifyBetween)
    |> schema.gap("sm")
    |> schema.children([
      status_ind,
      latency_badge,
      read_toggle,
      write_toggle,
      reconnect_btn,
      remove_btn,
    ])

  schema.card()
  |> schema.with_id("relay-" <> entry.url)
  |> schema.title(entry.url)
  |> schema.with_icon("server")
  |> schema.children([controls_row, stats_line])
}

fn to_indicator_status(state: RelayConnectionState) -> IndicatorStatus {
  case state {
    StateConnected -> StatusOnline
    StateConnecting -> StatusConnecting
    StateDisconnected -> StatusOffline
    StateError(_) -> StatusError
  }
}

fn state_label(state: RelayConnectionState) -> String {
  case state {
    StateConnected -> "Connected"
    StateConnecting -> "Connecting"
    StateDisconnected -> "Disconnected"
    StateError(reason) -> "Error: " <> reason
  }
}

fn url_action(name: String, url: String) -> Action {
  let payload = dict.from_list([#("url", dynamic.string(url))])
  schema.new_action(name)
  |> schema.with_payload(payload)
}
