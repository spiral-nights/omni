// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WorkerGuestHost } from "../src/sandbox/worker-guest-host.js";
import { SandboxInstance } from "../src/sandbox/sandbox-manager.js";
import { OmniManifest } from "@omni/types";

describe("WorkerGuestHost (Off-Thread Web Worker Execution Engine)", () => {
  let createdBlobUrls: string[] = [];
  let originalCreateObjectURL: typeof URL.createObjectURL;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL;
  let originalWorker: any;

  beforeEach(() => {
    createdBlobUrls = [];
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    originalWorker = (globalThis as any).Worker;

    URL.createObjectURL = vi.fn((blob: Blob) => {
      const url = `blob:http://localhost/worker-${Math.random().toString(36).slice(2)}`;
      createdBlobUrls.push(url);
      return url;
    });

    URL.revokeObjectURL = vi.fn((url: string) => {
      createdBlobUrls = createdBlobUrls.filter((u) => u !== url);
    });
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    (globalThis as any).Worker = originalWorker;
    vi.restoreAllMocks();
  });

  it("throws an error if Worker is not supported in the environment", () => {
    delete (globalThis as any).Worker;

    const channel1 = new MessageChannel();
    const channel2 = new MessageChannel();

    expect(() => {
      new WorkerGuestHost({
        pluginId: "org.omni.test",
        runtimeScript: "console.log('runtime');",
        pluginScript: "console.log('plugin');",
        channel1,
        channel2,
        initPayload: {
          pluginId: "org.omni.test",
          instanceId: "inst_1",
          userPubkey: "npub1test",
          theme: {} as any,
          slots: ["main"],
          components: ["main"],
          storage: {}
        }
      });
    }).toThrow(/Web Worker API is not supported/);
  });

  it("creates a hardened Blob worker, transfers MessagePorts, and performs handshake", () => {
    let capturedBlobContent = "";
    URL.createObjectURL = vi.fn((blob: Blob) => {
      // Read blob content synchronously if possible or save reference
      if (blob instanceof Blob) {
        // Simple synchronous text extraction for test blob
        capturedBlobContent = (blob as any)._buffer
          ? (blob as any)._buffer.toString("utf-8")
          : "";
      }
      return "blob:http://localhost/worker-mock-id";
    });

    let postedMessages: any[] = [];
    let transferredPorts: any[] = [];
    let isTerminated = false;

    class MockWorker {
      public onmessage: ((e: any) => void) | null = null;
      public onerror: ((e: any) => void) | null = null;
      public name: string;
      public type: string;
      public url: string;

      constructor(url: string, options?: any) {
        this.url = url;
        this.name = options?.name;
        this.type = options?.type;
      }

      postMessage(msg: any, transfer?: any[]) {
        postedMessages.push(msg);
        if (transfer) {
          transferredPorts.push(...transfer);
        }
      }

      terminate() {
        isTerminated = true;
      }

      addEventListener() {}
      removeEventListener() {}
      dispatchEvent() { return true; }
    }

    (globalThis as any).Worker = MockWorker;

    const channel1 = new MessageChannel();
    const channel2 = new MessageChannel();
    const onSchemaUpdate = vi.fn();

    const host = new WorkerGuestHost({
      pluginId: "org.omni.plugin.feed",
      runtimeScript: "// omni runtime bridge",
      pluginScript: "window.parent.postMessage({ type: 'omni:schema', schema: { type: 'box' } }, '*');",
      channel1,
      channel2,
      initPayload: {
        pluginId: "org.omni.plugin.feed",
        instanceId: "inst_feed",
        userPubkey: "npub1feedtest",
        theme: { mode: "dark" } as any,
        slots: ["main"],
        components: ["main"],
        route: "?view=settings",
        viewId: "settings",
        storage: { key1: "val1" }
      },
      onSchemaUpdate
    });

    // 1. Verify Blob URL creation & Worker instantiation
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(host.getWorker()).toBeInstanceOf(MockWorker);
    const workerInstance = host.getWorker() as any;
    expect(workerInstance.name).toBe("omni-worker-org.omni.plugin.feed");
    expect(workerInstance.type).toBe("classic");

    // 2. Verify Handshake & Transferred Ports
    expect(postedMessages.length).toBe(1);
    expect(postedMessages[0].type).toBe("omni:init");
    expect(postedMessages[0].payload.pluginId).toBe("org.omni.plugin.feed");
    expect(postedMessages[0].payload.route).toBe("?view=settings");
    expect(transferredPorts.length).toBe(2);
    expect(transferredPorts[0] === channel1.port2).toBe(true);
    expect(transferredPorts[1] === channel2.port2).toBe(true);

    // 3. Verify incoming schema updates via worker.onmessage
    workerInstance.onmessage({
      data: {
        type: "omni:schema",
        componentId: "main",
        schema: { type: "card", title: "Feed Note" }
      }
    });
    expect(onSchemaUpdate).toHaveBeenCalledWith(
      { type: "card", title: "Feed Note" },
      "main"
    );

    // 4. Verify action dispatch
    host.dispatchAction("main", { name: "like" }, { noteId: "note123" });
    expect(postedMessages.length).toBe(2);
    expect(postedMessages[1]).toEqual({
      type: "omni:action",
      componentId: "main",
      action: { name: "like" },
      payload: { noteId: "note123" }
    });

    // 5. Verify cleanup on destroy
    host.destroy();
    expect(isTerminated).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/worker-mock-id");
    expect(host.getWorker()).toBeNull();
    expect(host.getBlobUrl()).toBeNull();
  });

  it("detects ES module syntax in pluginScript and instantiates Worker with type: module", () => {
    class MockWorker {
      public type: string;
      constructor(_url: string, options?: any) {
        this.type = options?.type;
      }
      postMessage() {}
      terminate() {}
    }
    (globalThis as any).Worker = MockWorker;

    const channel1 = new MessageChannel();
    const channel2 = new MessageChannel();

    const host = new WorkerGuestHost({
      pluginId: "org.omni.plugin.module",
      runtimeScript: "// runtime",
      pluginScript: "import { something } from 'https://cdn.example.com/mod.js'; export default {};",
      channel1,
      channel2,
      initPayload: {
        pluginId: "org.omni.plugin.module",
        instanceId: "inst_mod",
        userPubkey: "npub1mod",
        theme: {} as any,
        slots: ["main"],
        components: ["main"],
        storage: {}
      }
    });

    const workerInstance = host.getWorker() as any;
    expect(workerInstance.type).toBe("module");
    host.destroy();
  });

  it("integrates seamlessly into SandboxInstance when worker is supported and format is schema", async () => {
    let workerCreated = false;
    class MockWorker {
      constructor() {
        workerCreated = true;
      }
      postMessage() {}
      terminate() {}
    }
    (globalThis as any).Worker = MockWorker;

    const manifest: OmniManifest = {
      id: "org.omni.plugin.checklist",
      name: "Checklist",
      version: "1.0.0",
      entry: "index.js",
      permissions: [],
      components: [{ id: "main", type: "main", title: "Checklist", slot: "main" }]
    };

    const mainSlot = document.createElement("div");
    mainSlot.id = "main-slot";
    document.body.appendChild(mainSlot);

    const slotContainers = new Map<string, Element>([["main", mainSlot]]);

    const mockIntentBroker = {
      registerApp: vi.fn(),
      unregisterHandlers: vi.fn(),
      dispatch: vi.fn()
    };

    const sandbox = new SandboxInstance({
      manifest,
      scriptContent: "console.log('checklist running');",
      runtimeScript: "// runtime code",
      userPubkey: "npub1test",
      slotContainers,
      aclEngine: { isAllowed: () => true } as any,
      storageManager: { getAll: async () => ({}) } as any,
      intentBroker: mockIntentBroker as any,
      subscriptionCoordinator: {} as any,
      keystore: {} as any,
      relayPool: {} as any,
      eventStore: {} as any
    });

    await sandbox.mount();

    // Verify workerHost was created and no <iframe> was appended to the DOM
    expect(workerCreated).toBe(true);
    expect(sandbox.getWorkerHost()).not.toBeNull();
    const iframesInDoc = document.querySelectorAll("iframe");
    expect(iframesInDoc.length).toBe(0);

    // Teardown
    sandbox.destroy();
    expect(sandbox.getWorkerHost()).toBeNull();
    mainSlot.remove();
  });

  it("falls back to iframe if workerEnabled is set to false", async () => {
    class MockWorker {
      postMessage() {}
      terminate() {}
    }
    (globalThis as any).Worker = MockWorker;

    const manifest: OmniManifest = {
      id: "org.omni.plugin.feed",
      name: "Feed",
      version: "1.0.0",
      entry: "index.js",
      permissions: [],
      components: [{ id: "main", type: "main", title: "Feed", slot: "main" }]
    };

    const mainSlot = document.createElement("div");
    mainSlot.id = "main-slot";
    document.body.appendChild(mainSlot);

    const slotContainers = new Map<string, Element>([["main", mainSlot]]);

    const mockIntentBroker = {
      registerApp: vi.fn(),
      unregisterHandlers: vi.fn(),
      dispatch: vi.fn()
    };

    const sandbox = new SandboxInstance({
      manifest,
      scriptContent: "console.log('feed running');",
      runtimeScript: "// runtime code",
      userPubkey: "npub1test",
      slotContainers,
      workerEnabled: false, // Explicitly disable worker to force iframe fallback
      aclEngine: { isAllowed: () => true } as any,
      storageManager: { getAll: async () => ({}) } as any,
      intentBroker: mockIntentBroker as any,
      subscriptionCoordinator: {} as any,
      keystore: {} as any,
      relayPool: {} as any,
      eventStore: {} as any
    });

    await sandbox.mount();

    // Verify workerHost was NOT created and iframe was created instead
    expect(sandbox.getWorkerHost()).toBeNull();

    sandbox.destroy();
    mainSlot.remove();
  });
});
