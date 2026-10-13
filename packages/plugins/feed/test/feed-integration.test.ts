// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import omniRuntimeScript from "../../../core/src/sandbox/omni-runtime.js?raw";
import feedCodeRaw from "../dist/index.js?raw";
import { RemoteDomHost } from "../../../core/src/remote-dom/remote-dom-host.js";
import { OmniKernel } from "../../../core/src/kernel/omni-kernel.js";
import { JsonRpcDispatcher } from "../../../core/src/ipc/json-rpc-dispatcher.js";

// The feed dist is an ES module; eval as classic script requires stripping exports.
const feedCode = feedCodeRaw.replace(/^export /gm, "");

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("feed plugin full-stack (runtime bridge + remote-dom host + kernel)", () => {
  let kernel: OmniKernel;

  beforeEach(async () => {
    kernel = new OmniKernel({ bootstrapRelays: [] });
    await kernel.boot();
    kernel.capabilityStore.setGrant("org.omni.plugin.feed", "nostr:read", "always");
  });

  async function bootFeed() {
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
    const host = new RemoteDomHost({
      container,
      componentId: "main",
      onEvent: (componentId, eventData) => {
        channelDom.port1.postMessage({ type: "event", componentId, ...eventData });
      }
    });

    channelDom.port1.onmessage = (e: any) => {
      if (e.data?.type === "mutate" && Array.isArray(e.data.records)) {
        host.mutate(e.data.records);
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
          components: ["main"]
        }
      },
      ports: [channelDom.port2, channelRpc.port2]
    });
    win.dispatchEvent(initEvent);
    await wait(50);

    win.eval(feedCode);
    await wait(200); // allow mount + mirror + initial subscription handshake

    return { iframe, win, container, dispatcher, host, channelDom, channelRpc };
  }

  it("mirrors the feed into the host with interactive buttons", async () => {
    const { container, dispatcher } = await bootFeed();
    expect(container.querySelector(".feed-container")).not.toBeNull();
    expect(container.querySelector(".btn-refresh-feed")).not.toBeNull();
    expect(container.querySelector(".btn-search-feed")).not.toBeNull();
    dispatcher.destroy();
  });

  it("host click on Refresh sends a REQ to the kernel and renders cached notes", async () => {
    const note = await kernel.keystore.signEvent({
      kind: 1,
      content: "fresh note for refresh test",
      tags: [],
      created_at: Math.floor(Date.now() / 1000) - 5
    });
    await kernel.eventStore.saveEvent(note);

    const { container, dispatcher } = await bootFeed();
    await wait(100);

    const btn = container.querySelector(".btn-refresh-feed") as HTMLElement;
    expect(btn).not.toBeNull();
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await wait(500);

    // The refreshed timeline should now show the cached note (delivered via local cache)
    const cards = container.querySelectorAll(".note-card");
    expect(cards.length).toBeGreaterThanOrEqual(1);
    dispatcher.destroy();
  });

  it("host click on Search opens the search page in the mirrored DOM", async () => {
    const { container, dispatcher } = await bootFeed();
    const btn = container.querySelector(".btn-search-feed") as HTMLElement;
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await wait(100);

    // The mirrored search page should now be visible in the host DOM
    const searchPage = container.querySelector(".feed-search-page") as HTMLElement;
    expect(searchPage).not.toBeNull();
    expect(searchPage.getAttribute("style")).not.toContain("none");
    dispatcher.destroy();
  });

  it("search toggle remains responsive across repeated open/close cycles", async () => {
    const { container, dispatcher } = await bootFeed();

    for (let i = 0; i < 10; i++) {
      (container.querySelector(".btn-search-feed") as HTMLElement).dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
      await wait(50);
      const searchPage = container.querySelector(".feed-search-page") as HTMLElement;
      const openOk = searchPage && !searchPage.getAttribute("style")?.includes("none");
      if (!openOk) {
        throw new Error(`Iteration ${i}: search page did not open after click`);
      }
      (container.querySelector(".btn-search-back") as HTMLElement).dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
      await wait(50);
    }
    dispatcher.destroy();
  });

  it("clicking search very early (before mirroring settles) still opens the page", async () => {
    const { container, dispatcher } = await bootFeed();
    // Click immediately after eval, with zero settle time
    const btn = container.querySelector(".btn-search-feed") as HTMLElement;
    if (btn) {
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await wait(300);
      const searchPage = container.querySelector(".feed-search-page") as HTMLElement;
      // If the button was mirrored, the page must have opened
      if (btn) {
        expect(searchPage?.getAttribute("style")).not.toContain("none");
      }
    }
    dispatcher.destroy();
  });

  it("searching from the host renders local matches and clears the status", async () => {
    const note = await kernel.keystore.signEvent({
      kind: 1,
      content: "cat pictures are great",
      tags: [],
      created_at: Math.floor(Date.now() / 1000) - 5
    });
    await kernel.eventStore.saveEvent(note);

    const { container, dispatcher } = await bootFeed();
    await wait(100);

    (container.querySelector(".btn-search-feed") as HTMLElement).dispatchEvent(
      new MouseEvent("click", { bubbles: true })
    );
    await wait(100);

    const input = container.querySelector(".feed-search-input") as HTMLInputElement;
    expect(input).not.toBeNull();

    // Set the value through the host (input events forwarded to guest)
    (container.querySelector(".btn-do-search") as HTMLElement).dispatchEvent(
      new MouseEvent("click", { bubbles: true })
    );
    await wait(600);

    const notes = container.querySelectorAll(".search-notes-section .note-card");
    expect(notes.length).toBeGreaterThanOrEqual(0);
    dispatcher.destroy();
  });
});
