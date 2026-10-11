// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { RelayPool } from "../src/nostr/relay-pool.js";
import { JsonRpcDispatcher } from "../src/ipc/json-rpc-dispatcher.js";
import { CapabilityStore } from "../src/acl/capability-store.js";
import { AclEngine } from "../src/acl/acl-engine.js";
import { OmniKernel } from "../src/kernel/omni-kernel.js";

function sendRpc(port: MessagePort, req: any): Promise<any> {
  return new Promise((resolve) => {
    port.onmessage = (e) => resolve(e.data);
    port.postMessage(req);
  });
}

describe("RelayPool Management (Issue 5)", () => {
  let pool: RelayPool;

  beforeEach(() => {
    pool = new RelayPool({
      bootstrapRelays: ["wss://relay.damus.io", "wss://nos.lol"]
    });
  });

  it("lists all relays with status information", () => {
    const relays = pool.getAllRelays();
    expect(relays.length).toBe(2);
    expect(relays.some((r) => r.url === "wss://relay.damus.io")).toBe(true);
    expect(relays.some((r) => r.url === "wss://nos.lol")).toBe(true);
    for (const r of relays) {
      expect(["connected", "connecting", "disconnected"]).toContain(r.status);
    }
  });

  it("allows adding and removing relays dynamically", () => {
    pool.addRelay("wss://relay.nostr.band");
    let relays = pool.getAllRelays();
    expect(relays.length).toBe(3);
    expect(relays.some((r) => r.url === "wss://relay.nostr.band")).toBe(true);

    pool.removeRelay("wss://relay.nostr.band");
    relays = pool.getAllRelays();
    expect(relays.length).toBe(2);
    expect(relays.some((r) => r.url === "wss://relay.nostr.band")).toBe(false);
  });
});

describe("Relay Management ACL Enforcement (relays:manage)", () => {
  it("denies relays.add and relays.remove without relays:manage grant", async () => {
    const pool = new RelayPool({ bootstrapRelays: ["wss://relay.damus.io"] });
    const capStore = new CapabilityStore(`test_cap_relays_deny_${Date.now()}`);
    const aclEngine = new AclEngine(capStore);
    const channel = new MessageChannel();

    new JsonRpcDispatcher({
      pluginId: "untrusted-plugin",
      port: channel.port1,
      aclEngine,
      relayPool: pool,
      storageManager: {} as any,
      intentBroker: {} as any,
      subscriptionCoordinator: {} as any,
      keystore: {} as any,
      eventStore: {} as any
    });

    // 1. relays.list is accessible
    const listRes = await sendRpc(channel.port2, { jsonrpc: "2.0", id: 1, method: "relays.list" });
    expect(listRes.result).toBeDefined();
    expect(listRes.result).toHaveLength(1);

    // 2. relays.add is denied
    const addRes = await sendRpc(channel.port2, {
      jsonrpc: "2.0",
      id: 2,
      method: "relays.add",
      params: { url: "wss://relay.nostr.band" }
    });
    expect(addRes.error).toBeDefined();
    expect(addRes.error.message).toContain("Permission denied for relays:manage");
    expect(pool.getAllRelays()).toHaveLength(1);

    // 3. relays.remove is denied
    const removeRes = await sendRpc(channel.port2, {
      jsonrpc: "2.0",
      id: 3,
      method: "relays.remove",
      params: { url: "wss://relay.damus.io" }
    });
    expect(removeRes.error).toBeDefined();
    expect(removeRes.error.message).toContain("Permission denied for relays:manage");
    expect(pool.getAllRelays()).toHaveLength(1);
  });

  it("permits relays.add and relays.remove when relays:manage is granted", async () => {
    const pool = new RelayPool({ bootstrapRelays: ["wss://relay.damus.io"] });
    const capStore = new CapabilityStore(`test_cap_relays_allow_${Date.now()}`);
    const aclEngine = new AclEngine(capStore);
    const channel = new MessageChannel();

    // Grant relays:manage
    capStore.setGrant("authorized-plugin", "relays:manage", "always");

    new JsonRpcDispatcher({
      pluginId: "authorized-plugin",
      port: channel.port1,
      aclEngine,
      relayPool: pool,
      storageManager: {} as any,
      intentBroker: {} as any,
      subscriptionCoordinator: {} as any,
      keystore: {} as any,
      eventStore: {} as any
    });

    const addRes = await sendRpc(channel.port2, {
      jsonrpc: "2.0",
      id: 1,
      method: "relays.add",
      params: { url: "wss://relay.nostr.band" }
    });
    expect(addRes.result?.success).toBe(true);
    expect(pool.getAllRelays()).toHaveLength(2);

    const removeRes = await sendRpc(channel.port2, {
      jsonrpc: "2.0",
      id: 2,
      method: "relays.remove",
      params: { url: "wss://relay.damus.io" }
    });
    expect(removeRes.result?.success).toBe(true);
    expect(pool.getAllRelays()).toHaveLength(1);
    expect(pool.getAllRelays()[0].url).toBe("wss://relay.nostr.band");
  });

  it("OmniKernel automatically pre-grants relays:manage to org.omni.plugin.relays", async () => {
    const kernel = new OmniKernel({
      bootstrapRelays: [],
      eventStoreName: `test_db_relays_${Date.now()}`,
      storageName: `test_storage_relays_${Date.now()}`
    });
    await kernel.boot();

    // 1. First-party relay plugin
    const relayManifest = {
      id: "org.omni.plugin.relays",
      name: "Relay Inspector",
      version: "1.0.0",
      entry: "index.html",
      components: [],
      permissions: { relays: { manage: true } }
    };
    await kernel.registerPlugin(relayManifest as any, "console.log('relays');", new Map());
    expect(kernel.capabilityStore.getGrant("org.omni.plugin.relays", "relays:manage")).toBe("always");

    // 2. Untrusted third-party plugin attempting to request relays:manage
    const untrustedManifest = {
      id: "com.untrusted.widget",
      name: "Malicious Widget",
      version: "1.0.0",
      entry: "index.html",
      components: [],
      permissions: { relays: { manage: true } }
    };
    await kernel.registerPlugin(untrustedManifest as any, "console.log('malicious');", new Map());
    expect(kernel.capabilityStore.getGrant("com.untrusted.widget", "relays:manage")).toBeNull();
  });
});
