// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { OmniKernel } from "../src/kernel/omni-kernel.js";
import { JsonRpcDispatcher } from "../src/ipc/json-rpc-dispatcher.js";
import { NostrEvent } from "@omni/types";

describe("Milestone 2: Subscription Namespacing & Cache Isolation", () => {
  let kernel: OmniKernel;

  beforeEach(async () => {
    const uniqueId = `iso_${Math.random().toString(36).slice(2, 9)}`;
    kernel = new OmniKernel({
      bootstrapRelays: [],
      eventStoreName: `test_event_store_${uniqueId}`,
      storageName: `test_storage_${uniqueId}`
    });
    await kernel.boot();
  });

  it("isolates subscriptions between plugins so data does not leak", async () => {
    const channel1 = new MessageChannel();
    const channel2 = new MessageChannel();

    // Grant nostr:read to both plugins
    kernel.capabilityStore.setGrant("plugin-feed", "nostr:read", "always");
    kernel.capabilityStore.setGrant("plugin-timer", "nostr:read", "always");

    const dispatcher1 = new JsonRpcDispatcher({
      pluginId: "plugin-feed",
      port: channel1.port1,
      aclEngine: kernel.aclEngine,
      storageManager: kernel.storageManager,
      intentBroker: kernel.intentBroker,
      subscriptionCoordinator: kernel.subscriptionCoordinator,
      keystore: kernel.keystore,
      relayPool: kernel.relayPool,
      eventStore: kernel.eventStore
    });

    const dispatcher2 = new JsonRpcDispatcher({
      pluginId: "plugin-timer",
      port: channel2.port1,
      aclEngine: kernel.aclEngine,
      storageManager: kernel.storageManager,
      intentBroker: kernel.intentBroker,
      subscriptionCoordinator: kernel.subscriptionCoordinator,
      keystore: kernel.keystore,
      relayPool: kernel.relayPool,
      eventStore: kernel.eventStore
    });

    const eventsPluginFeed: NostrEvent[] = [];
    const eventsPluginTimer: NostrEvent[] = [];

    channel1.port2.onmessage = (e) => {
      if (e.data?.method === "nostr.stream.event") {
        eventsPluginFeed.push(e.data.params.event);
      }
    };

    channel2.port2.onmessage = (e) => {
      if (e.data?.method === "nostr.stream.event") {
        eventsPluginTimer.push(e.data.params.event);
      }
    };

    // Plugin 1 subscribes to kind 1
    channel1.port2.postMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "nostr.subscribe",
      params: { subscriptionId: "feed_sub", filters: [{ kinds: [1] }] }
    });

    // Plugin 2 subscribes to kind 30000
    channel2.port2.postMessage({
      jsonrpc: "2.0",
      id: 2,
      method: "nostr.subscribe",
      params: { subscriptionId: "timer_sub", filters: [{ kinds: [30000] }] }
    });

    await new Promise((r) => setTimeout(r, 50));

    // Simulate incoming note from relay specifically for plugin-feed
    const note = await kernel.keystore.signEvent({
      kind: 1,
      content: "Feed only note",
      tags: [],
      created_at: 1710000000
    });

    // Deliver via relay pool dispatch
    kernel.relayPool.handleRelayMessage(
      JSON.stringify(["EVENT", "plugin-feed:feed_sub", note]),
      "wss://relay.damus.io"
    );

    await new Promise((r) => setTimeout(r, 50));

    expect(eventsPluginFeed.length).toBe(1);
    expect(eventsPluginFeed[0].content).toBe("Feed only note");

    // Plugin 2 must have received ZERO events
    expect(eventsPluginTimer.length).toBe(0);

    dispatcher1.destroy();
    dispatcher2.destroy();
    channel1.port1.close();
    channel1.port2.close();
    channel2.port1.close();
    channel2.port2.close();
  });

  it("filters out sensitive encrypted direct messages (Kind 4 / 1059) from unpermitted cache queries", async () => {
    const channelUntrusted = new MessageChannel();
    const channelTrusted = new MessageChannel();

    // plugin-untrusted only has generic nostr:read
    kernel.capabilityStore.setGrant("plugin-untrusted", "nostr:read", "always");

    // plugin-trusted has explicit nostr:encrypt permission
    kernel.capabilityStore.setGrant("plugin-trusted", "nostr:read", "always");
    kernel.capabilityStore.setGrant("plugin-trusted", "nostr:encrypt", "always");

    const dispatcherUntrusted = new JsonRpcDispatcher({
      pluginId: "plugin-untrusted",
      port: channelUntrusted.port1,
      aclEngine: kernel.aclEngine,
      storageManager: kernel.storageManager,
      intentBroker: kernel.intentBroker,
      subscriptionCoordinator: kernel.subscriptionCoordinator,
      keystore: kernel.keystore,
      relayPool: kernel.relayPool,
      eventStore: kernel.eventStore
    });

    const dispatcherTrusted = new JsonRpcDispatcher({
      pluginId: "plugin-trusted",
      port: channelTrusted.port1,
      aclEngine: kernel.aclEngine,
      storageManager: kernel.storageManager,
      intentBroker: kernel.intentBroker,
      subscriptionCoordinator: kernel.subscriptionCoordinator,
      keystore: kernel.keystore,
      relayPool: kernel.relayPool,
      eventStore: kernel.eventStore
    });

    // Save a public note and a sensitive Kind 4 encrypted DM in local store
    const publicNote = await kernel.keystore.signEvent({
      kind: 1,
      content: "Public timeline post",
      tags: [],
      created_at: 1710000001
    });

    const privateDm = await kernel.keystore.signEvent({
      kind: 4,
      content: "Super secret direct message",
      tags: [["p", await kernel.getUserPubkey()]],
      created_at: 1710000002
    });

    await kernel.eventStore.saveEvent(publicNote);
    await kernel.eventStore.saveEvent(privateDm);

    // 1. Untrusted plugin queries all events (open filter)
    const untrustedEvents: NostrEvent[] = [];
    channelUntrusted.port2.onmessage = (e) => {
      if (e.data?.method === "nostr.stream.event") {
        untrustedEvents.push(e.data.params.event);
      }
    };

    channelUntrusted.port2.postMessage({
      jsonrpc: "2.0",
      id: 10,
      method: "nostr.subscribe",
      params: { subscriptionId: "snoop_sub", filters: [{ limit: 50 }] }
    });

    // 2. Trusted plugin queries all events
    const trustedEvents: NostrEvent[] = [];
    channelTrusted.port2.onmessage = (e) => {
      if (e.data?.method === "nostr.stream.event") {
        trustedEvents.push(e.data.params.event);
      }
    };

    channelTrusted.port2.postMessage({
      jsonrpc: "2.0",
      id: 20,
      method: "nostr.subscribe",
      params: { subscriptionId: "chat_sub", filters: [{ limit: 50 }] }
    });

    await new Promise((r) => setTimeout(r, 100));

    // Untrusted plugin should only receive publicNote, NOT privateDm
    expect(untrustedEvents.length).toBe(1);
    expect(untrustedEvents[0].kind).toBe(1);
    expect(untrustedEvents[0].content).toBe("Public timeline post");

    // Trusted plugin should receive both publicNote and privateDm
    expect(trustedEvents.length).toBe(2);
    expect(trustedEvents.some((e) => e.kind === 4)).toBe(true);

    dispatcherUntrusted.destroy();
    dispatcherTrusted.destroy();
    channelUntrusted.port1.close();
    channelUntrusted.port2.close();
    channelTrusted.port1.close();
    channelTrusted.port2.close();
  });

  it("strictly partitions storage between plugins", async () => {
    await kernel.storageManager.set("plugin-A", "user_setting", "theme_dark");
    await kernel.storageManager.set("plugin-B", "user_setting", "theme_light");

    const valA = await kernel.storageManager.get("plugin-A", "user_setting");
    const valB = await kernel.storageManager.get("plugin-B", "user_setting");

    expect(valA).toBe("theme_dark");
    expect(valB).toBe("theme_light");

    await kernel.storageManager.delete("plugin-A", "user_setting");

    expect(await kernel.storageManager.get("plugin-A", "user_setting")).toBeNull();
    expect(await kernel.storageManager.get("plugin-B", "user_setting")).toBe("theme_light");
  });
});
