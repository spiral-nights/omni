import gleam/javascript/promise
import omni/platform/json as platform_json
import omni/platform/ref
import omni/protocol/plugin_id
import omni/sandbox/host.{IframeHost, WasmHost, WorkerHost}

pub fn host_type_string_roundtrip_test() {
  assert host.host_type_to_string(IframeHost) == "iframe"
  assert host.host_type_to_string(WorkerHost) == "worker"
  assert host.host_type_to_string(WasmHost) == "wasm"

  assert host.host_type_from_string("iframe") == Ok(IframeHost)
  assert host.host_type_from_string("worker") == Ok(WorkerHost)
  assert host.host_type_from_string("wasm") == Ok(WasmHost)
  assert host.host_type_from_string("unknown") == Error(Nil)
}

pub fn guest_host_lifecycle_test() {
  let assert Ok(pid) = plugin_id.parse("org.omni.plugin.test")
  let started_ref = ref.new(False)
  let stopped_ref = ref.new(False)
  let last_action_ref = ref.new("")

  let gh =
    host.new(
      plugin_id: pid,
      host_type: IframeHost,
      start: fn() {
        ref.set(started_ref, True)
        promise.resolve(Ok(Nil))
      },
      send_schema_action: fn(act, _payload) { ref.set(last_action_ref, act) },
      stop: fn() { ref.set(stopped_ref, True) },
    )

  assert gh.host_type == IframeHost
  assert gh.plugin_id == pid

  // Execute lifecycle
  let _start_promise = host.start(gh)
  assert ref.get(started_ref) == True

  let assert Ok(dyn_val) = platform_json.parse_dynamic("\"val\"")
  host.send_schema_action(gh, "btn_click", dyn_val)
  assert ref.get(last_action_ref) == "btn_click"

  host.stop(gh)
  assert ref.get(stopped_ref) == True
}

pub fn worker_and_wasm_host_types_test() {
  let assert Ok(pid) = plugin_id.parse("org.omni.plugin.worker")
  let worker_h =
    host.new(
      plugin_id: pid,
      host_type: WorkerHost,
      start: fn() { promise.resolve(Ok(Nil)) },
      send_schema_action: fn(_, _) { Nil },
      stop: fn() { Nil },
    )
  assert worker_h.host_type == WorkerHost

  let wasm_h =
    host.new(
      plugin_id: pid,
      host_type: WasmHost,
      start: fn() { promise.resolve(Ok(Nil)) },
      send_schema_action: fn(_, _) { Nil },
      stop: fn() { Nil },
    )
  assert wasm_h.host_type == WasmHost
}
