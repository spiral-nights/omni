// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import omniRuntimeScript from "../../../core/src/sandbox/omni-runtime.js?raw";
import feedCodeRaw from "../dist/index.js?raw";
import { SchemaRenderer } from "../../../core/src/schema/schema-renderer.js";
import { OmniKernel } from "../../../core/src/kernel/omni-kernel.js";
import { JsonRpcDispatcher } from "../../../core/src/ipc/json-rpc-dispatcher.js";

// The feed dist is an ES module; eval as classic script requires stripping exports.
const feedCode = feedCodeRaw.replace(/^export /gm, "");

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("feed plugin full-stack (runtime bridge + schema renderer + kernel)", () => {
  let kernel: OmniKernel;

  beforeEach(async () => {
    kernel = new OmniKernel({ bootstrapRelays: [] });
    await kernel.boot();
    kernel.capabilityStore.setGrant("org.omni.plugin.feed", "nostr:read", "always");
  });

  async function bootFeed(route: string = "?format=schema") {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const win = iframe.contentWindow as any;

    win.eval(omniRuntimeScript);

    const channelDom = new MessageChannel();
    const channelRpc = new MessageChannel();

    const dispatcher = new JsonRpcDispatcher({
      pluginId: "org.omni.plugin.feed",
      port: channelRpc.port1,
      aclEngine: kernel.aclEngine,
      storageManager: kernel.storageManager,
      intentBroker: kernel.intentBroker,
      subscriptionCoordinator: kernel.subscriptionCoordinator,
      keystore: kernel.keystore,
      relayPool: kernel.relayPool,
      eventStore: kernel.eventStore
    });

    const container = document.createElement("div");
    document.body.appendChild(container);

    const renderer = new SchemaRenderer({
      container,
      onAction: (action, payload) => {
        channelDom.port1.postMessage({
          type: "action",
          componentId: "main",
          action,
          payload
        });
      }
    });

    channelDom.port1.onmessage = (e: any) => {
      if (e.data?.type === "schema" && e.data.schema) {
        renderer.render(e.data.schema);
      }
    };

    const initEvent = new (iframe.contentWindow as any).MessageEvent("message", {
      data: {
        type: "omni:init",
        payload: {
          pluginId: "org.omni.plugin.feed",
          instanceId: "inst_test",
          userPubkey: await kernel.getUserPubkey(),
          theme: { mode: "dark", colors: {} },
          slots: ["main"],
          components: ["main"],
          route
        }
      },
      ports: [channelDom.port2, channelRpc.port2]
    });
    win.dispatchEvent(initEvent);
    await wait(50);

    win.eval(feedCode);
    await wait(200); // allow mount + initial schema dispatch

    return { iframe, win, container, dispatcher, renderer, channelDom, channelRpc };
  }

  it("renders declarative Schema UI with custom omni-* elements natively into the host", async () => {
    const { container, dispatcher, renderer } = await bootFeed();
    expect(container.querySelector("omni-box")).not.toBeNull();
    expect(container.querySelector("omni-button")).not.toBeNull();

    // Verify tabs rendered as omni-button custom elements
    const buttons = Array.from(container.querySelectorAll("omni-button"));
    expect(buttons.length).toBeGreaterThan(0);
    const followingBtn = buttons.find((b) => b.textContent?.includes("Following"));
    expect(followingBtn).toBeDefined();

    renderer.destroy();
    dispatcher.destroy();
  });

  it("dispatches actions and updates Schema UI on tab click", async () => {
    const { container, dispatcher, renderer } = await bootFeed();
    await wait(100);

    const buttons = Array.from(container.querySelectorAll("omni-button"));
    const globalBtn = buttons.find((b) => b.textContent?.includes("Global"));
    expect(globalBtn).toBeDefined();

    // Click "Global" tab
    globalBtn?.click();
    await wait(150);

    // After clicking Global, active tab state is updated in the rendered schema
    const updatedButtons = Array.from(container.querySelectorAll("omni-button"));
    const updatedGlobal = updatedButtons.find((b) => b.textContent?.includes("Global"));
    expect(updatedGlobal?.getAttribute("variant")).toBe("primary");

    renderer.destroy();
    dispatcher.destroy();
  });

  it("renders note cards with omni-card custom elements in the host DOM", async () => {
    const { container, dispatcher, renderer } = await bootFeed();
    await wait(100);

    const cards = container.querySelectorAll("omni-card");
    expect(cards.length).toBeGreaterThanOrEqual(1);

    // Action button inside note card
    const actionButtons = container.querySelectorAll("omni-card omni-button");
    expect(actionButtons.length).toBeGreaterThan(0);

    renderer.destroy();
    dispatcher.destroy();
  });

  it("renders composer card with textarea and Publish Note button", async () => {
    const { container, dispatcher, renderer } = await bootFeed();
    await wait(100);

    const buttons = Array.from(container.querySelectorAll("omni-button"));
    const publishBtn = buttons.find((b) => b.textContent?.includes("Publish Note"));
    expect(publishBtn).toBeDefined();

    const textarea = container.querySelector("omni-textarea");
    expect(textarea).not.toBeNull();

    renderer.destroy();
    dispatcher.destroy();
  });
});
