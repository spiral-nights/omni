//// Message types for `plugin_relays`.

import gleam/option.{type Option}
import plugin/relays/model.{type RelayConnectionState, type ViewMode}

/// Messages handled by the `plugin_relays` state machine.
pub type Msg {
  AddRelay
  RemoveRelay(url: String)
  ToggleRead(url: String)
  ToggleWrite(url: String)
  SetDraftUrl(String)
  ReconnectRelay(url: String)
  UpdateRelayState(
    url: String,
    state: RelayConnectionState,
    latency_ms: Option(Int),
  )
  PublishNip65
  DismissError
  SetViewMode(ViewMode)
}
