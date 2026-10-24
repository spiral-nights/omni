// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import omniRuntimeScript from "../src/sandbox/omni-runtime.js?raw";
import "fake-indexeddb/auto";
import { RelayPool, parseNip65Relays, buildNip65Tags, STORAGE_KEY_CONFIGURED_RELAYS } from "../src/nostr/relay-pool.js";
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

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => store.set(key, String(val)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    get length() { return store.size; },
    key: (i: number) => Array.from(store.keys())[i] ?? null
  };
}

let memStorage: any;

beforeEach(() => {
  memStorage = createMemoryStorage();
  (globalThis as any).localStorage = memStorage;
  if (typeof window !== "undefined") {
    (window as any).localStorage = memStorage;
  }
});

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

  it("persists added and removed relays across RelayPool instances via localStorage", () => {
    pool.addRelay("wss://relay.primal.net");
    const storage = typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
    const stored = JSON.parse(storage?.getItem(STORAGE_KEY_CONFIGURED_RELAYS) || "[]");
    expect(stored).toContain("wss://relay.primal.net");

    // New instance without options should load the persisted relays
    const newPool = new RelayPool();
    expect(newPool.getAllRelays().some((r) => r.url === "wss://relay.primal.net")).toBe(true);

    // Remove relay and verify new instance reflects removal
    newPool.removeRelay("wss://relay.primal.net");
    const updated = JSON.parse(storage?.getItem(STORAGE_KEY_CONFIGURED_RELAYS) || "[]");
    expect(updated).not.toContain("wss://relay.primal.net");

    const thirdPool = new RelayPool();
    expect(thirdPool.getAllRelays().some((r) => r.url === "wss://relay.primal.net")).toBe(false);

    // Add relay again via thirdPool
    thirdPool.addRelay("wss://relay.primal.net");
    // New instance WITH bootstrapRelays option (as in apps/web/main.ts on refresh) must still load persisted relays
    const fourthPool = new RelayPool({ bootstrapRelays: ["wss://relay.damus.io", "wss://nos.lol"] });
    expect(fourthPool.getAllRelays().some((r) => r.url === "wss://relay.primal.net")).toBe(true);
  });

  it("auto-prefixes wss:// when protocol is omitted", () => {
    pool.addRelay("relay.nostr.band");
    expect(pool.getAllRelays().some((r) => r.url === "wss://relay.nostr.band")).toBe(true);
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
    const kernel = new OmniKernel({ runtimeScript: omniRuntimeScript,
      bootstrapRelays: [],
      eventStoreName: `test_db_relays_${Date.now()}`,
      storageName: `test_storage_relays_${Date.now()}`
    });
    await kernel.boot();

    // 1. First-party relay plugin
    const relayManifest = {
      id: "org.omni.plugin.relays",
      name: "Relays",
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

  it("normalizes relay URLs and prevents duplicates when adding relays", () => {
    const pool = new RelayPool({ bootstrapRelays: ["wss://relay.damus.io"] });
    expect(pool.getAllRelays()).toHaveLength(1);

    // Add same relay with trailing slash
    pool.addRelay("wss://relay.damus.io/");
    expect(pool.getAllRelays()).toHaveLength(1);
    expect(pool.getAllRelays()[0].url).toBe("wss://relay.damus.io");

    // Add new relay
    pool.addRelay("wss://relay.ditto.pub");
    expect(pool.getAllRelays()).toHaveLength(2);

    // Add new relay with trailing slash and whitespace
    pool.addRelay("  wss://relay.ditto.pub/  ");
    expect(pool.getAllRelays()).toHaveLength(2);
  });
});

describe("Per-Plugin Relay Scoping & Isolation", () => {
  it("restricts nostr.getRelays to the plugin's allowed relays", async () => {
    const pool = new RelayPool({
      bootstrapRelays: ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.ditto.pub"]
    });
    const capStore = new CapabilityStore(`test_cap_scope_${Date.now()}`);
    const aclEngine = new AclEngine(capStore);

    // 1. Unrestricted plugin (allowedRelays undefined / empty) gets all pool relays
    const channelAll = new MessageChannel();
    new JsonRpcDispatcher({
      pluginId: "plugin-default",
      port: channelAll.port1,
      aclEngine,
      relayPool: pool,
      storageManager: {} as any,
      intentBroker: {} as any,
      subscriptionCoordinator: {} as any,
      keystore: {} as any,
      eventStore: {} as any
    });

    const resAll = await sendRpc(channelAll.port2, {
      jsonrpc: "2.0",
      id: 1,
      method: "nostr.getRelays"
    });
    expect(Object.keys(resAll.result)).toHaveLength(3);
    expect(resAll.result["wss://relay.damus.io"]).toBeDefined();
    expect(resAll.result["wss://nos.lol"]).toBeDefined();
    expect(resAll.result["wss://relay.ditto.pub"]).toBeDefined();

    // 2. Restricted plugin (scoped strictly to wss://nos.lol)
    const channelRestricted = new MessageChannel();
    new JsonRpcDispatcher({
      pluginId: "plugin-scoped",
      port: channelRestricted.port1,
      aclEngine,
      relayPool: pool,
      storageManager: {} as any,
      intentBroker: {} as any,
      subscriptionCoordinator: {} as any,
      keystore: {} as any,
      eventStore: {} as any,
      allowedRelays: ["wss://nos.lol"]
    });

    const resRestricted = await sendRpc(channelRestricted.port2, {
      jsonrpc: "2.0",
      id: 2,
      method: "nostr.getRelays"
    });
    expect(Object.keys(resRestricted.result)).toEqual(["wss://nos.lol"]);
    expect(resRestricted.result["wss://relay.damus.io"]).toBeUndefined();
    expect(resRestricted.result["wss://relay.ditto.pub"]).toBeUndefined();
  });

  it("filters publish targets when targetRelays are specified", async () => {
    const pool = new RelayPool({
      bootstrapRelays: ["wss://relay.damus.io", "wss://nos.lol"]
    });

    // Mock WebSocket instances in relays map
    const mockDamusWs: any = { readyState: 1, send: () => {} };
    const mockNosWs: any = { readyState: 1, send: () => {} };
    (pool as any).relays.set("wss://relay.damus.io", mockDamusWs);
    (pool as any).relays.set("wss://nos.lol", mockNosWs);

    const testEvent = {
      id: "ev1",
      pubkey: "pk1",
      created_at: 1000,
      kind: 1,
      tags: [],
      content: "Hello",
      sig: "sig1"
    };

    // Publish to all
    const allPublished = await pool.publish(testEvent);
    expect(allPublished).toHaveLength(2);
    expect(allPublished).toContain("wss://relay.damus.io");
    expect(allPublished).toContain("wss://nos.lol");

    // Publish scoped strictly to wss://nos.lol
    const scopedPublished = await pool.publish(testEvent, ["wss://nos.lol"]);
    expect(scopedPublished).toEqual(["wss://nos.lol"]);
  });

  it("parses and builds NIP-65 relay list metadata (kind: 10002)", () => {
    const nip65Event = {
      id: "ev_nip65",
      pubkey: "pk1",
      created_at: 1000,
      kind: 10002,
      tags: [
        ["r", "wss://relay.damus.io"],
        ["r", "wss://write.only.relay", "write"],
        ["r", "wss://read.only.relay", "read"]
      ],
      content: "",
      sig: "sig1"
    };

    const parsed = parseNip65Relays(nip65Event);
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toEqual({ url: "wss://relay.damus.io", read: true, write: true });
    expect(parsed[1]).toEqual({ url: "wss://write.only.relay", read: false, write: true });
    expect(parsed[2]).toEqual({ url: "wss://read.only.relay", read: true, write: false });

    const rebuiltTags = buildNip65Tags(parsed);
    expect(rebuiltTags).toEqual([
      ["r", "wss://relay.damus.io"],
      ["r", "wss://write.only.relay", "write"],
      ["r", "wss://read.only.relay", "read"]
    ]);
  });

  it("routes publishes to write-capable relays via NIP-65 outbox policy", async () => {
    const pool = new RelayPool({
      bootstrapRelays: ["wss://relay.damus.io", "wss://nos.lol"]
    });

    // Mock WebSocket instances
    const mockDamusWs: any = { readyState: 1, send: () => {} };
    const mockWriteWs: any = { readyState: 1, send: () => {} };
    const mockReadWs: any = { readyState: 1, send: () => {} };

    (pool as any).relays.set("wss://relay.damus.io", mockDamusWs);
    (pool as any).relays.set("wss://write.relay", mockWriteWs);
    (pool as any).relays.set("wss://read.relay", mockReadWs);

    pool.setUserRelays([
      { url: "wss://write.relay", read: false, write: true },
      { url: "wss://read.relay", read: true, write: false }
    ]);

    const testEvent = {
      id: "ev2",
      pubkey: "pk1",
      created_at: 1000,
      kind: 1,
      tags: [],
      content: "Outbox post",
      sig: "sig2"
    };

    // When publish is called without explicit targets, it should target write relays
    const published = await pool.publish(testEvent);
    expect(published).toContain("wss://write.relay");
    expect(published).not.toContain("wss://read.relay");
  });
});

