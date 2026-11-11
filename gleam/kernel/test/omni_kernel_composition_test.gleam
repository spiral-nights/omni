import gleam/javascript/promise
import gleam/option.{None}
import omni/kernel/kernel.{KernelPorts}
import omni/platform/clock
import omni/platform/idb
import omni/platform/storage
import omni/protocol/plugin_id

pub fn kernel_composition_test() {
  use db_res <- promise.await(idb.in_memory_simple())
  let assert Ok(db) = db_res

  let ports =
    KernelPorts(
      storage: storage.in_memory(),
      idb: db,
      clock: clock.fixed(1_700_000_000_000),
      prompt_handler: None,
    )

  let k = kernel.new(ports, [], "timeline")
  assert k.navigation.current == "timeline"

  let assert Ok(pid) = plugin_id.parse("org.omni.plugin.feed")
  let rpc_ctx = kernel.get_rpc_context(k, pid)
  assert rpc_ctx.plugin_id == pid

  promise.resolve(Nil)
}
