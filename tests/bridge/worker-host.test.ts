// @vitest-environment happy-dom
//
// Smoke test for the worker sandbox host. Node/happy-dom has no real Worker, so
// this pins the host contract: blob creation, init ports, schema delivery,
// action forwarding, and teardown.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  mount_island,
  island_mounted,
  mount_wasm,
  mount_worker,
  send_plugin_action,
  unmount_island,
  unmount_wasm,
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

describe("island sandbox host", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="island-slot"></div>';
  });

  it("mounts an island iframe, and unmounts cleanly by plugin ID", () => {
    mount_island(
      "#island-slot",
      "<html><body>Hello</body></html>",
      "example.app.island",
      () => {},
      () => {},
    );
    expect(island_mounted("#island-slot")).toBe(true);
    const iframe = document.querySelector("#island-slot iframe");
    expect(iframe).not.toBeNull();

    unmount_island("example.app.island");
    expect(island_mounted("#island-slot")).toBe(false);
    expect(document.getElementById("island-slot")?.innerHTML).toBe("");
  });

  it("unmounts cleanly by DOM selector", () => {
    mount_island(
      "#island-slot",
      "<html><body>Hello</body></html>",
      "example.app.island2",
      () => {},
      () => {},
    );
    expect(island_mounted("#island-slot")).toBe(true);

    unmount_island("#island-slot");
    expect(island_mounted("#island-slot")).toBe(false);
    expect(document.getElementById("island-slot")?.innerHTML).toBe("");
  });
});

describe("wasm sandbox host", () => {
  const RUST_WIDGET_WASM_BASE64 =
    "AGFzbQEAAAABFwRgAn9/AGAEf39/fwBgAABgA39/fwF/Ag0BAnVpBnJlbmRlcgAAAwQDAQIDBQMBABEGGQN/AUGAgMAAC38AQYSCwAALfwBBkILAAAsHPAUGbWVtb3J5AgANaGFuZGxlX2FjdGlvbgABBGluaXQAAgpfX2RhdGFfZW5kAwELX19oZWFwX2Jhc2UDAgqMAQMtAAJAIAFBA0cNACAAQYGCwIAAQQMQg4CAgAANAEGFgcCAAEH8ABCAgICAAAsLEQBBgIDAgABBhQEQgICAgAALSgEDf0EAIQMCQCACRQ0AAkADQCAALQAAIgQgAS0AACIFRw0BIABBAWohACABQQFqIQEgAkF/aiICRQ0CDAALCyAEIAVrIQMLIAMLC44CAQBBgIDAAAuEAnsidHlwZSI6ImNhcmQiLCJ0aXRsZSI6IlJ1c3QgQ291bnRlciBXaWRnZXQiLCJpY29uIjoiY3B1IiwiY2hpbGRyZW4iOlt7InR5cGUiOiJidXR0b24iLCJsYWJlbCI6IkluY3JlbWVudCIsImFjdGlvbiI6eyJuYW1lIjoiaW5jIn19XX17InR5cGUiOiJjYXJkIiwidGl0bGUiOiJSdXN0IENvdW50ZXIgV2lkZ2V0IiwiaWNvbiI6ImNwdSIsImNoaWxkcmVuIjpbeyJ0eXBlIjoiYmFkZ2UiLCJsYWJlbCI6IkNvdW50OiAxIiwidG9uZSI6InN1Y2Nlc3MifV19aW5j";

  beforeEach(() => {
    document.body.innerHTML = '<div id="wasm-slot"></div>';
  });

  it("mounts a wasm plugin, emits initial schema, handles actions, and unmounts", async () => {
    const schemas: string[] = [];

    mount_wasm(
      "#wasm-slot",
      RUST_WIDGET_WASM_BASE64,
      "example.wasm.rust",
      "npub1test",
      () => {},
      (schemaJson: string) => schemas.push(schemaJson),
    );

    // Wait for async boot & init
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(schemas.length).toBeGreaterThanOrEqual(1);
    expect(schemas[0]).toContain("Rust Counter Widget");
    expect(schemas[0]).toContain("Increment");

    send_plugin_action(
      "example.wasm.rust",
      JSON.stringify({ name: "inc" }),
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(schemas.length).toBeGreaterThanOrEqual(2);
    expect(schemas[1]).toContain("Count: 1");

    unmount_wasm("example.wasm.rust");
  });
});
