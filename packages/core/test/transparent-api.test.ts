// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { OmniKernel } from "../src/kernel/omni-kernel.js";
import { JsonRpcDispatcher } from "../src/ipc/json-rpc-dispatcher.js";
import omniRuntimeScript from "../src/sandbox/omni-runtime.js?raw";

describe("Milestone 1: Transparent APIs (Virtual WebSocket, NIP-07, and DOM Auto-Mount)", () => {
  let kernel: OmniKernel;

  beforeEach(async () => {
    kernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
    await kernel.boot();
  });

  it("handles nostr.getRelays in JsonRpcDispatcher", async () => {
    kernel.relayPool.addRelay("wss://relay.damus.io");
    kernel.relayPool.addRelay("wss://nos.lol");

    const channel = new MessageChannel();
    const dispatcher = new JsonRpcDispatcher({
      pluginId: "test-plugin",
      port: channel.port1,
      aclEngine: kernel.aclEngine,
      storageManager: kernel.storageManager,
      intentBroker: kernel.intentBroker,
      subscriptionCoordinator: kernel.subscriptionCoordinator,
      keystore: kernel.keystore,
      relayPool: kernel.relayPool,
      eventStore: kernel.eventStore
    });

    const responsePromise = new Promise<any>((resolve) => {
      channel.port2.onmessage = (e) => resolve(e.data);
    });

    channel.port2.postMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "nostr.getRelays",
      params: {}
    });

    const res = await responsePromise;
    expect(res.error).toBeUndefined();
    expect(res.result).toBeDefined();
    expect(res.result["wss://relay.damus.io"]).toEqual({ read: true, write: true });
    expect(res.result["wss://nos.lol"]).toEqual({ read: true, write: true });

    dispatcher.destroy();
    channel.port1.close();
    channel.port2.close();
  });

  it("handles NIP-04 encrypt and decrypt over JsonRpcDispatcher", async () => {
    const channel = new MessageChannel();
    const dispatcher = new JsonRpcDispatcher({
      pluginId: "test-plugin",
      port: channel.port1,
      aclEngine: kernel.aclEngine,
      storageManager: kernel.storageManager,
      intentBroker: kernel.intentBroker,
      subscriptionCoordinator: kernel.subscriptionCoordinator,
      keystore: kernel.keystore,
      relayPool: kernel.relayPool,
      eventStore: kernel.eventStore
    });

    // Grant nostr:sign permission for encrypt/decrypt
    kernel.capabilityStore.setGrant("test-plugin", "nostr:sign", "always");

    const userPubkey = await kernel.getUserPubkey();

    // 1. Encrypt message for self
    let rpcId = 10;
    const encryptPromise = new Promise<any>((resolve) => {
      channel.port2.onmessage = (e) => resolve(e.data);
    });

    channel.port2.postMessage({
      jsonrpc: "2.0",
      id: rpcId,
      method: "nostr.nip04.encrypt",
      params: { pubkey: userPubkey, plaintext: "Hello Transparent Nostr!" }
    });

    const encRes = await encryptPromise;
    expect(encRes.error).toBeUndefined();
    expect(encRes.result).toContain("?iv=");

    // 2. Decrypt ciphertext
    const ciphertext = encRes.result;
    const decryptPromise = new Promise<any>((resolve) => {
      channel.port2.onmessage = (e) => resolve(e.data);
    });

    channel.port2.postMessage({
      jsonrpc: "2.0",
      id: ++rpcId,
      method: "nostr.nip04.decrypt",
      params: { pubkey: userPubkey, ciphertext }
    });

    const decRes = await decryptPromise;
    expect(decRes.error).toBeUndefined();
    expect(decRes.result).toBe("Hello Transparent Nostr!");

    dispatcher.destroy();
    channel.port1.close();
    channel.port2.close();
  });

  it("injected runtime exposes Virtual WebSocket and standard window.nostr", async () => {
    // Setup isolated fake window environment to test the runtime bridge
    const fakeWindow: any = {
      addEventListener: vi.fn(),
      localStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn()
      }
    };

    const fn = new Function("window", "document", "EventTarget", "Event", "MessageEvent", "CloseEvent", omniRuntimeScript);
    fn(fakeWindow, document, EventTarget, Event, MessageEvent, CloseEvent);

    // Verify WebSocket class was injected onto window
    expect(fakeWindow.WebSocket).toBeDefined();
    expect(fakeWindow.WebSocket.CONNECTING).toBe(0);
    expect(fakeWindow.WebSocket.OPEN).toBe(1);
    expect(fakeWindow.WebSocket.CLOSING).toBe(2);
    expect(fakeWindow.WebSocket.CLOSED).toBe(3);

    // Verify standard NIP-07 window.nostr was injected
    expect(fakeWindow.nostr).toBeDefined();
    expect(typeof fakeWindow.nostr.getPublicKey).toBe("function");
    expect(typeof fakeWindow.nostr.signEvent).toBe("function");
    expect(typeof fakeWindow.nostr.getRelays).toBe("function");
    expect(typeof fakeWindow.nostr.nip04.encrypt).toBe("function");
    expect(typeof fakeWindow.nostr.nip04.decrypt).toBe("function");

    // Verify window.omni remains available for backward compatibility
    expect(fakeWindow.omni).toBeDefined();
  });

  it("Virtual WebSocket sends REQ and receives EVENT & EOSE frames", async () => {
    const channelRemoteDom = new MessageChannel();
    const channelKernelRpc = new MessageChannel();

    // Grant nostr:read
    kernel.capabilityStore.setGrant("test-app", "nostr:read", "always");

    const dispatcher = new JsonRpcDispatcher({
      pluginId: "test-app",
      port: channelKernelRpc.port1,
      aclEngine: kernel.aclEngine,
      storageManager: kernel.storageManager,
      intentBroker: kernel.intentBroker,
      subscriptionCoordinator: kernel.subscriptionCoordinator,
      keystore: kernel.keystore,
      relayPool: kernel.relayPool,
      eventStore: kernel.eventStore
    });

    // Save a test event in local store
    const note = await kernel.keystore.signEvent({
      kind: 1,
      content: "A note for virtual socket test",
      tags: [],
      created_at: 1710000000
    });
    await kernel.eventStore.saveEvent(note);

    const fakeWindow: any = {
      addEventListener: vi.fn(),
      localStorage: { getItem: vi.fn(), setItem: vi.fn() }
    };

    const fn = new Function("window", "document", "EventTarget", "Event", "MessageEvent", "CloseEvent", omniRuntimeScript);
    fn(fakeWindow, document, EventTarget, Event, MessageEvent, CloseEvent);

    // Simulate omni:init message with ports
    const messageListener = fakeWindow.addEventListener.mock.calls.find(
      (c: any[]) => c[0] === "message"
    )[1];

    messageListener({
      data: {
        type: "omni:init",
        payload: {
          pluginId: "test-app",
          instanceId: "inst_1",
          userPubkey: await kernel.getUserPubkey(),
          theme: { mode: "dark", colors: {} },
          slots: ["main"],
          components: ["main"]
        }
      },
      ports: [channelRemoteDom.port2, channelKernelRpc.port2]
    });

    // Create Virtual WebSocket
    const ws = new fakeWindow.WebSocket("wss://relay.damus.io");

    const receivedFrames: any[] = [];
    ws.addEventListener("message", (e: any) => {
      receivedFrames.push(JSON.parse(e.data));
    });

    // Send Nostr REQ frame
    ws.send(JSON.stringify(["REQ", "test_sub", { kinds: [1] }]));

    // Wait for cached event and EOSE delivery
    await new Promise((r) => setTimeout(r, 100));

    expect(receivedFrames.length).toBeGreaterThanOrEqual(2);
    // Frame 1: ["EVENT", "test_sub", event]
    expect(receivedFrames[0][0]).toBe("EVENT");
    expect(receivedFrames[0][1]).toBe("test_sub");
    expect(receivedFrames[0][2].content).toBe("A note for virtual socket test");

    // Frame 2: ["EOSE", "test_sub"]
    expect(receivedFrames[1][0]).toBe("EOSE");
    expect(receivedFrames[1][1]).toBe("test_sub");

    // Close socket
    ws.close();
    expect(ws.readyState).toBe(fakeWindow.WebSocket.CLOSED);

    dispatcher.destroy();
    channelRemoteDom.port1.close();
    channelRemoteDom.port2.close();
    channelKernelRpc.port1.close();
    channelKernelRpc.port2.close();
  });

  it("transparently auto-mounts standard DOM elements to Remote DOM when no omni.registerComponent is called", async () => {
    const channelRemoteDom = new MessageChannel();
    const channelKernelRpc = new MessageChannel();

    const fakeDoc = document.implementation.createHTMLDocument("Sandbox Document");
    const fakeWindow: any = {
      addEventListener: vi.fn(),
      localStorage: { getItem: vi.fn(), setItem: vi.fn() }
    };

    const fn = new Function("window", "document", "EventTarget", "Event", "MessageEvent", "CloseEvent", omniRuntimeScript);
    fn(fakeWindow, fakeDoc, EventTarget, Event, MessageEvent, CloseEvent);

    const messageListener = fakeWindow.addEventListener.mock.calls.find(
      (c: any[]) => c[0] === "message"
    )[1];

    messageListener({
      data: {
        type: "omni:init",
        payload: {
          pluginId: "plain-nsite",
          instanceId: "inst_plain",
          userPubkey: await kernel.getUserPubkey(),
          theme: { mode: "dark", colors: {} },
          slots: ["main"],
          components: ["main"]
        }
      },
      ports: [channelRemoteDom.port2, channelKernelRpc.port2]
    });

    const remoteMutations: any[] = [];
    channelRemoteDom.port1.onmessage = (e) => {
      if (e.data?.type === "mutate") {
        remoteMutations.push(...e.data.records);
      }
    };

    // Standard nsite creates elements using standard document.createElement
    const btn = fakeDoc.createElement("button");
    btn.className = "nsite-button";
    btn.textContent = "Click Me Native";
    const onClick = vi.fn();
    btn.addEventListener("click", onClick);
    fakeDoc.body.appendChild(btn);

    // Wait for auto-mount setTimeout(..., 0) and microtask flush
    await new Promise((r) => setTimeout(r, 50));

    expect(remoteMutations.length).toBeGreaterThan(0);
    // Find mutation inserting button
    const insertBtnMutation = remoteMutations.find(
      (m) => m[0] === 0 && m[2]?.element === "button"
    );
    expect(insertBtnMutation).toBeDefined();
    const remoteBtnId = insertBtnMutation[2].id;

    // Simulate host click event arriving on this button
    channelRemoteDom.port1.postMessage({
      type: "event",
      componentId: "main",
      id: remoteBtnId,
      eventName: "click"
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(onClick).toHaveBeenCalledTimes(1);

    channelRemoteDom.port1.close();
    channelRemoteDom.port2.close();
    channelKernelRpc.port1.close();
    channelKernelRpc.port2.close();
  });
});

