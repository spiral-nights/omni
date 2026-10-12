// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import omniRuntimeScript from "../src/sandbox/omni-runtime.js?raw";
import "fake-indexeddb/auto";
import { OmniKernel } from "../src/index.js";
import { OMNI_WORKSPACE_D_TAG, OmniWorkspaceState } from "@omni/types";

describe("NIP-78 Arbitrary App Data & Workspace Sync", () => {
  let kernel: OmniKernel;

  beforeEach(async () => {
    kernel = new OmniKernel({ runtimeScript: omniRuntimeScript,
      bootstrapRelays: []
    });
    await kernel.boot();
  });

  it("publishes arbitrary app data as kind 30078 with 'd' identifier tag", async () => {
    const appData = { theme: "warm-paper", zoom: 1.2 };
    const event = await kernel.publishAppData("app/preferences", appData);

    expect(event.kind).toBe(30078);
    expect(event.pubkey).toBe(await kernel.getUserPubkey());
    expect(event.tags).toContainEqual(["d", "app/preferences"]);
    expect(JSON.parse(event.content)).toEqual(appData);

    // Retrieve from local 0ms store
    const retrieved = await kernel.getAppData("app/preferences");
    expect(retrieved).not.toBeNull();
    expect(retrieved?.data).toEqual(appData);
    expect(retrieved?.event.id).toBe(event.id);
  });

  it("publishes and restores OmniWorkspaceState via NIP-78", async () => {
    const mockWorkspace: OmniWorkspaceState = {
      version: 1,
      updatedAt: Date.now(),
      activePage: "org.omni.plugin.timer",
      autoSync: true,
      plugins: [
        {
          id: "org.omni.plugin.feed",
          viewport: "dock",
          enabled: true
        },
        {
          id: "org.omni.plugin.timer",
          viewport: "main",
          enabled: true
        }
      ]
    };

    const event = await kernel.publishWorkspaceState(mockWorkspace);
    expect(event.kind).toBe(30078);
    expect(event.tags).toContainEqual(["d", OMNI_WORKSPACE_D_TAG]);

    const retrieved = await kernel.getWorkspaceState();
    expect(retrieved).not.toBeNull();
    expect(retrieved?.state.activePage).toBe("org.omni.plugin.timer");
    expect(retrieved?.state.plugins).toHaveLength(2);
    expect(retrieved?.state.plugins[0].viewport).toBe("dock");
    expect(retrieved?.state.plugins[1].viewport).toBe("main");
  });

  it("returns null when no app data event exists for identifier", async () => {
    const missing = await kernel.getAppData("nonexistent/identifier");
    expect(missing).toBeNull();
  });

  it("blocks guest plugins from signing or publishing reserved omni/* NIP-78 events", async () => {
    const { JsonRpcDispatcher } = await import("../src/ipc/json-rpc-dispatcher.js");
    const channel = new MessageChannel();
    const dispatcher = new JsonRpcDispatcher({
      pluginId: "untrusted-plugin",
      port: channel.port1,
      aclEngine: kernel.aclEngine,
      storageManager: kernel.storageManager,
      intentBroker: kernel.intentBroker,
      subscriptionCoordinator: kernel.subscriptionCoordinator,
      keystore: kernel.keystore,
      relayPool: kernel.relayPool,
      eventStore: kernel.eventStore
    });

    // 1. Attempt to sign event targeting omni/workspace/v1
    const signPromise = new Promise<any>((resolve) => {
      channel.port2.onmessage = (e) => resolve(e.data);
    });

    channel.port2.postMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "nostr.signEvent",
      params: {
        event: {
          kind: 30078,
          created_at: Math.floor(Date.now() / 1000),
          tags: [["d", OMNI_WORKSPACE_D_TAG]],
          content: '{"malicious": true}'
        }
      }
    });

    const signRes = await signPromise;
    expect(signRes.error).toBeDefined();
    expect(signRes.error.code).toBe(-32001); // PERMISSION_DENIED
    expect(signRes.error.message).toContain("reserved for Omni host workspace synchronization");

    // 2. Attempt to publish event targeting omni/custom
    const publishPromise = new Promise<any>((resolve) => {
      channel.port2.onmessage = (e) => resolve(e.data);
    });

    channel.port2.postMessage({
      jsonrpc: "2.0",
      id: 2,
      method: "nostr.publish",
      params: {
        event: {
          kind: 30078,
          created_at: Math.floor(Date.now() / 1000),
          tags: [["d", "omni/layout/hacked"]],
          content: '{"malicious": true}'
        }
      }
    });

    const publishRes = await publishPromise;
    expect(publishRes.error).toBeDefined();
    expect(publishRes.error.code).toBe(-32001); // PERMISSION_DENIED
    expect(publishRes.error.message).toContain("reserved for Omni host workspace synchronization");

    // 3. Permitted normal kind 30078 (e.g. app-specific data) should not be blocked by the namespace guard
    // (AclEngine checks permission normally)
    const allowed = await kernel.aclEngine.checkPermission(
      "untrusted-plugin",
      "nostr:sign",
      { kind: 30078, tags: [["d", "my-app-identifier"]] }
    );
    // Since untrusted-plugin has no grant, it returns false by default ACL policy, NOT the reserved namespace block
    expect(allowed).toBe(false);

    dispatcher.destroy();
    channel.port1.close();
    channel.port2.close();
  });
});

