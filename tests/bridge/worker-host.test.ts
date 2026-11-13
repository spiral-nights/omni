// @vitest-environment happy-dom
//
// Smoke test for the worker sandbox host. Node/happy-dom has no real Worker, so
// this pins the host contract: blob creation, init ports, schema delivery,
// action forwarding, and teardown.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  mount_worker,
  send_plugin_action,
  unmount_worker,
} from "../../gleam/interop/build/dev/javascript/omni_interop/omni/interop/shell_boot.ffi.mjs";

class FakeWorker {
  static instances: FakeWorker[] = [];
  messages: unknown[] = [];
  terminated = false;
  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor(public url: string) {
    FakeWorker.instances.push(this);
  }

  postMessage(message: unknown, _transfer?: unknown[]) {
    this.messages.push(message);
  }

  terminate() {
    this.terminated = true;
  }
}

describe("worker sandbox host", () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    document.body.innerHTML = '<div id="worker-slot"></div>';
    (globalThis as unknown as { Worker: typeof FakeWorker }).Worker =
      FakeWorker;
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:omni-worker");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  it("mounts a worker, routes schema, forwards actions, and tears down", () => {
    const schemas: string[] = [];
    const rpc: string[] = [];

    mount_worker(
      "#worker-slot",
      "self.postMessage({ type: 'omni:schema' });",
      "example.app.worker",
      (raw) => rpc.push(raw),
      (raw) => schemas.push(raw),
    );

    expect(FakeWorker.instances).toHaveLength(1);
    const worker = FakeWorker.instances[0];
    expect(worker.url).toBe("blob:omni-worker");

    const init = worker.messages[0] as {
      type: string;
      payload: { pluginId: string };
    };
    expect(init.type).toBe("omni:init");
    expect(init.payload.pluginId).toBe("example.app.worker");

    worker.onmessage?.({
      data: { type: "omni:schema", schema: { type: "omni:schema" } },
    });
    expect(schemas).toHaveLength(1);
    expect(JSON.parse(schemas[0])).toMatchObject({ type: "omni:schema" });

    send_plugin_action(
      "example.app.worker",
      JSON.stringify({ name: "select-preset" }),
    );
    expect(worker.messages[1]).toMatchObject({
      type: "omni:action",
      action: { name: "select-preset" },
    });

    unmount_worker("example.app.worker");
    expect(worker.terminated).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:omni-worker");
  });
});
