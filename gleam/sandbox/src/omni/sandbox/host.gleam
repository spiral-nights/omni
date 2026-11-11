//// Unified `GuestHost` strategy interface for sandboxed runtimes.
////
//// Iframe (`IframeAppHost`), Web Worker (`WorkerGuestHost`), and WebAssembly (`WasmGuestHost`)
//// implementations conform to this single interface.

import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}
import omni/protocol/plugin_id.{type PluginId}

/// Execution host runtime strategy.
pub type HostType {
  IframeHost
  WorkerHost
  WasmHost
}

/// Convenience alias for `HostType`.
pub type HostKind =
  HostType

/// Unified guest host handle representing an active sandboxed plugin runtime.
pub type GuestHost {
  GuestHost(
    plugin_id: PluginId,
    host_type: HostType,
    start: fn() -> Promise(Result(Nil, String)),
    send_schema_action: fn(String, Dynamic) -> Nil,
    stop: fn() -> Nil,
  )
}

/// Create a new `GuestHost` instance with labelled arguments.
pub fn new(
  plugin_id plugin_id: PluginId,
  host_type host_type: HostType,
  start start: fn() -> Promise(Result(Nil, String)),
  send_schema_action send_schema_action: fn(String, Dynamic) -> Nil,
  stop stop: fn() -> Nil,
) -> GuestHost {
  GuestHost(
    plugin_id: plugin_id,
    host_type: host_type,
    start: start,
    send_schema_action: send_schema_action,
    stop: stop,
  )
}

/// Start the guest host.
pub fn start(host: GuestHost) -> Promise(Result(Nil, String)) {
  host.start()
}

/// Send a declarative schema user action to the guest sandbox.
pub fn send_schema_action(
  host: GuestHost,
  action: String,
  payload: Dynamic,
) -> Nil {
  host.send_schema_action(action, payload)
}

/// Stop and tear down the guest host.
pub fn stop(host: GuestHost) -> Nil {
  host.stop()
}

/// Convert a `HostType` to its wire string representation.
pub fn host_type_to_string(ht: HostType) -> String {
  case ht {
    IframeHost -> "iframe"
    WorkerHost -> "worker"
    WasmHost -> "wasm"
  }
}

/// Parse a `HostType` from a string.
pub fn host_type_from_string(str: String) -> Result(HostType, Nil) {
  case str {
    "iframe" -> Ok(IframeHost)
    "worker" -> Ok(WorkerHost)
    "wasm" -> Ok(WasmHost)
    _ -> Error(Nil)
  }
}

/// Alias for `host_type_to_string`.
pub fn kind_to_string(kind: HostKind) -> String {
  host_type_to_string(kind)
}
