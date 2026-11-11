import gleam/option.{None, Some}
import gleam/result
import gleeunit/should
import omni/platform/ref
import omni/protocol/plugin_id
import omni/sandbox/host.{IframeHost, WorkerHost}
import omni/sandbox/manager.{IframeFormat, WasmFormat, WorkerFormat}

pub fn format_detection_test() {
  // 1. Explicit format hints
  manager.detect_format(Some("schema"), None, None)
  |> should.equal(WorkerFormat)
  manager.detect_format(Some("iframe"), None, None)
  |> should.equal(IframeFormat)
  manager.detect_format(Some("wasm"), None, None)
  |> should.equal(WasmFormat)

  // 2. Query param routing
  manager.detect_format(None, Some("?format=schema"), None)
  |> should.equal(WorkerFormat)
  manager.detect_format(None, Some("?view=schema"), None)
  |> should.equal(WorkerFormat)
  manager.detect_format(None, Some("?format=iframe"), None)
  |> should.equal(IframeFormat)
  manager.detect_format(None, Some("?format=wasm"), None)
  |> should.equal(WasmFormat)

  // 3. Script content inspection
  manager.detect_format(
    None,
    None,
    Some("<script id=\"omni-schema\"></script>"),
  )
  |> should.equal(WorkerFormat)
  manager.detect_format(
    None,
    None,
    Some("window.postMessage({ type: 'omni:schema' });"),
  )
  |> should.equal(WorkerFormat)
  manager.detect_format(
    None,
    None,
    Some("<!DOCTYPE html><html><body>Direct nsite</body></html>"),
  )
  |> should.equal(IframeFormat)

  // 4. Default fallback: direct nsite -> Iframe
  manager.detect_format(None, None, None)
  |> should.equal(IframeFormat)
}

pub fn spawn_and_active_tracking_test() {
  let mgr = manager.new()
  manager.count(mgr) |> should.equal(0)

  let assert Ok(pid_feed) = plugin_id.parse("org.omni.plugin.feed")
  let assert Ok(pid_relays) = plugin_id.parse("org.omni.plugin.relays")

  // Spawn Worker guest (schema format)
  let opts_feed =
    manager.SpawnOptions(
      format_hint: Some("schema"),
      route: None,
      view_id: Some("main"),
      content: None,
      runtime_script: None,
      theme_tokens: None,
      on_send: None,
      on_terminate: None,
    )
  let #(mgr, host_feed) = manager.spawn(mgr, pid_feed, opts_feed)

  manager.count(mgr) |> should.equal(1)
  manager.is_active(mgr, pid_feed) |> should.be_true
  manager.is_active(mgr, pid_relays) |> should.be_false
  host_feed.host_type |> should.equal(WorkerHost)
  host_feed.plugin_id |> should.equal(pid_feed)

  // Blob URL allocated for worker
  manager.get_blob_url(mgr, pid_feed) |> result.is_ok |> should.be_true
  let assert Ok(ports_feed) = manager.get_active_ports(mgr, pid_feed)
  ports_feed
  |> should.equal([
    "org.omni.plugin.feed:channel1:schema", "org.omni.plugin.feed:channel2:rpc",
  ])

  // Spawn Iframe guest (direct nsite)
  let opts_relays =
    manager.SpawnOptions(
      format_hint: None,
      route: None,
      view_id: Some("main"),
      content: Some("<!DOCTYPE html><html><body>Relays</body></html>"),
      runtime_script: None,
      theme_tokens: None,
      on_send: None,
      on_terminate: None,
    )
  let #(mgr, host_relays) = manager.spawn(mgr, pid_relays, opts_relays)

  manager.count(mgr) |> should.equal(2)
  manager.is_active(mgr, pid_relays) |> should.be_true
  host_relays.host_type |> should.equal(IframeHost)

  // Lookups and list active
  let assert Ok(found) = manager.get(mgr, pid_feed)
  found.plugin_id |> should.equal(pid_feed)

  let active_list = manager.list_active(mgr)
  should.equal(2, manager.count(mgr))
  active_list |> should.not_equal([])
}

pub fn graceful_termination_and_cleanup_test() {
  let mgr = manager.new()
  let assert Ok(pid) = plugin_id.parse("org.omni.plugin.checklist")
  let cleanup_ref = ref.new(False)

  let opts =
    manager.SpawnOptions(
      format_hint: Some("schema"),
      route: None,
      view_id: None,
      content: None,
      runtime_script: None,
      theme_tokens: None,
      on_send: None,
      on_terminate: Some(fn() { ref.set(cleanup_ref, True) }),
    )
  let #(mgr, _h) = manager.spawn(mgr, pid, opts)

  manager.count(mgr) |> should.equal(1)
  manager.is_active(mgr, pid) |> should.be_true
  manager.get_blob_url(mgr, pid) |> result.is_ok |> should.be_true

  // Terminate single instance
  let mgr = manager.terminate(mgr, pid)
  manager.count(mgr) |> should.equal(0)
  manager.is_active(mgr, pid) |> should.be_false
  ref.get(cleanup_ref) |> should.be_true
  manager.get_blob_url(mgr, pid) |> result.is_error |> should.be_true
  manager.get_active_ports(mgr, pid) |> result.is_error |> should.be_true
}

pub fn terminate_all_test() {
  let mgr = manager.new()
  let assert Ok(p1) = plugin_id.parse("org.omni.plugin.a")
  let assert Ok(p2) = plugin_id.parse("org.omni.plugin.b")
  let count_ref = ref.new(0)

  let opts =
    manager.SpawnOptions(
      format_hint: Some("iframe"),
      route: None,
      view_id: None,
      content: None,
      runtime_script: None,
      theme_tokens: None,
      on_send: None,
      on_terminate: Some(fn() { ref.update(count_ref, fn(c) { c + 1 }) }),
    )

  let #(mgr, _) = manager.spawn(mgr, p1, opts)
  let #(mgr, _) = manager.spawn(mgr, p2, opts)
  manager.count(mgr) |> should.equal(2)

  let mgr = manager.terminate_all(mgr)
  manager.count(mgr) |> should.equal(0)
  ref.get(count_ref) |> should.equal(2)
}
