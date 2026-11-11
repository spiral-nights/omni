//// Sandbox lifecycle manager for guest plugin runtimes.
////
//// Manages active `GuestHost` instances (`Dict(PluginId, GuestHost)`), spawns appropriate
//// host runtimes based on manifest format hints, routes, and content, and handles
//// graceful termination, port cleanup, and blob URL revocation.

import gleam/dict.{type Dict}
import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise
import gleam/option.{type Option, None, Some}
import gleam/string
import omni/protocol/plugin_id.{type PluginId}
import omni/sandbox/host.{
  type GuestHost, type HostType, GuestHost, IframeHost, WasmHost, WorkerHost,
}

/// Target execution format detected for a plugin view.
pub type ExecutionFormat {
  IframeFormat
  WorkerFormat
  WasmFormat
}

/// Spawning configuration options for instantiating a guest sandbox.
pub type SpawnOptions {
  SpawnOptions(
    format_hint: Option(String),
    route: Option(String),
    view_id: Option(String),
    content: Option(String),
    runtime_script: Option(String),
    theme_tokens: Option(Dict(String, String)),
    on_send: Option(fn(String) -> Result(Nil, String)),
    on_terminate: Option(fn() -> Nil),
  )
}

/// Default empty spawn options.
pub fn default_spawn_options() -> SpawnOptions {
  SpawnOptions(
    format_hint: None,
    route: None,
    view_id: None,
    content: None,
    runtime_script: None,
    theme_tokens: None,
    on_send: None,
    on_terminate: None,
  )
}

/// Sandbox lifecycle manager tracking active instances, ports, and blob resources.
pub type SandboxManager {
  SandboxManager(
    active: Dict(PluginId, GuestHost),
    blob_urls: Dict(PluginId, String),
    active_ports: Dict(PluginId, List(String)),
  )
}

/// Initialize a new, empty `SandboxManager`.
pub fn new() -> SandboxManager {
  SandboxManager(
    active: dict.new(),
    blob_urls: dict.new(),
    active_ports: dict.new(),
  )
}

/// Number of currently active sandboxes.
pub fn count(manager: SandboxManager) -> Int {
  dict.size(manager.active)
}

/// Check if a plugin currently has an active running sandbox.
pub fn is_active(manager: SandboxManager, id: PluginId) -> Bool {
  dict.has_key(manager.active, id)
}

/// Lookup an active `GuestHost` by `PluginId`.
pub fn get(manager: SandboxManager, id: PluginId) -> Result(GuestHost, Nil) {
  dict.get(manager.active, id)
}

/// List all currently active `GuestHost` instances.
pub fn list_active(manager: SandboxManager) -> List(GuestHost) {
  dict.values(manager.active)
}

/// Get the active blob URL for a worker sandbox (if allocated).
pub fn get_blob_url(
  manager: SandboxManager,
  id: PluginId,
) -> Result(String, Nil) {
  dict.get(manager.blob_urls, id)
}

/// Get the list of active virtual ports registered for a sandbox instance.
pub fn get_active_ports(
  manager: SandboxManager,
  id: PluginId,
) -> Result(List(String), Nil) {
  dict.get(manager.active_ports, id)
}

/// Detect the target execution format based on format hints, route query params, and content.
///
/// Precedence:
/// 1. Wasm format hint or route
/// 2. Explicit schema format hint or route (`format=schema`, `view=schema`)
/// 3. Explicit iframe format hint or route (`format=iframe`, `view=iframe`)
/// 4. Declarative schema markers in script content (`omni:schema`, `id="omni-schema"`)
/// 5. Standard HTML markup (`<!DOCTYPE html>`, `<html>`)
/// 6. Default fallback: Iframe (pure direct nsite)
pub fn detect_format(
  format_hint: Option(String),
  route: Option(String),
  content: Option(String),
) -> ExecutionFormat {
  let is_wasm_hint = case format_hint {
    Some(h) -> string.lowercase(h) == "wasm"
    None -> False
  }
  let is_wasm_route = case route {
    Some(r) ->
      string.contains(r, "format=wasm") || string.contains(r, "view=wasm")
    None -> False
  }

  case is_wasm_hint || is_wasm_route {
    True -> WasmFormat
    False -> {
      let is_schema_hint = case format_hint {
        Some(h) -> string.lowercase(h) == "schema"
        None -> False
      }
      let is_schema_route = case route {
        Some(r) ->
          string.contains(r, "format=schema")
          || string.contains(r, "view=schema")
        None -> False
      }

      case is_schema_hint || is_schema_route {
        True -> WorkerFormat
        False -> {
          let is_iframe_hint = case format_hint {
            Some(h) -> string.lowercase(h) == "iframe"
            None -> False
          }
          let is_iframe_route = case route {
            Some(r) ->
              string.contains(r, "format=iframe")
              || string.contains(r, "view=iframe")
            None -> False
          }

          case is_iframe_hint || is_iframe_route {
            True -> IframeFormat
            False -> {
              case content {
                Some(cnt) -> {
                  let has_schema_marker =
                    string.contains(cnt, "omni:schema")
                    || string.contains(cnt, "id=\"omni-schema\"")
                    || string.contains(
                      cnt,
                      "application/json\" id=\"omni-schema\"",
                    )

                  case has_schema_marker {
                    True -> WorkerFormat
                    False -> {
                      let has_html =
                        string.contains(cnt, "<!DOCTYPE html")
                        || string.contains(cnt, "<!doctype html")
                        || string.contains(cnt, "<html")
                      case has_html {
                        True -> IframeFormat
                        False -> IframeFormat
                      }
                    }
                  }
                }
                None -> IframeFormat
              }
            }
          }
        }
      }
    }
  }
}

/// Convert an `ExecutionFormat` to its corresponding `HostType`.
pub fn format_to_host_kind(fmt: ExecutionFormat) -> HostType {
  case fmt {
    WorkerFormat -> WorkerHost
    IframeFormat -> IframeHost
    WasmFormat -> WasmHost
  }
}

/// Spawn a guest sandbox host for a plugin and register it in the manager.
pub fn spawn(
  manager: SandboxManager,
  id: PluginId,
  options: SpawnOptions,
) -> #(SandboxManager, GuestHost) {
  // If an existing instance is active for this plugin ID, terminate it first
  let manager = terminate(manager, id)

  let format =
    detect_format(options.format_hint, options.route, options.content)
  let kind = format_to_host_kind(format)

  let send_fn = case options.on_send {
    Some(f) -> f
    None -> fn(_msg) { Ok(Nil) }
  }

  let terminate_fn = case options.on_terminate {
    Some(f) -> f
    None -> fn() { Nil }
  }

  let guest_host =
    GuestHost(
      plugin_id: id,
      host_type: kind,
      start: fn() { promise.resolve(Ok(Nil)) },
      send_schema_action: fn(act, _payload: Dynamic) {
        let _ = send_fn(act)
        Nil
      },
      stop: terminate_fn,
    )

  let id_str = plugin_id.to_string(id)
  let ports = [id_str <> ":channel1:schema", id_str <> ":channel2:rpc"]

  let next_blob_urls = case kind {
    WorkerHost ->
      dict.insert(manager.blob_urls, id, "blob:omni-" <> id_str <> "-worker")
    _ -> manager.blob_urls
  }

  let next_active = dict.insert(manager.active, id, guest_host)
  let next_ports = dict.insert(manager.active_ports, id, ports)

  let updated_manager =
    SandboxManager(
      active: next_active,
      blob_urls: next_blob_urls,
      active_ports: next_ports,
    )

  #(updated_manager, guest_host)
}

/// Gracefully terminate an active sandbox, triggering cleanup and releasing ports and blob URLs.
pub fn terminate(manager: SandboxManager, id: PluginId) -> SandboxManager {
  case dict.get(manager.active, id) {
    Ok(existing_host) -> {
      existing_host.stop()
      let next_active = dict.delete(manager.active, id)
      let next_blobs = dict.delete(manager.blob_urls, id)
      let next_ports = dict.delete(manager.active_ports, id)
      SandboxManager(
        active: next_active,
        blob_urls: next_blobs,
        active_ports: next_ports,
      )
    }
    Error(Nil) -> manager
  }
}

/// Terminate all currently active sandboxes.
pub fn terminate_all(manager: SandboxManager) -> SandboxManager {
  dict.each(manager.active, fn(_id, host) { host.stop() })
  new()
}
