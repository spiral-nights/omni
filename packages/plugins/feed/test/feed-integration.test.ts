// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import omniRuntimeScript from "../../../core/src/sandbox/omni-runtime.js?raw";
import { OmniKernel } from "../../../core/src/kernel/omni-kernel.js";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wasmPath = path.resolve(__dirname, "../dist/feed.wasm");
const wasmBytes = fs.readFileSync(wasmPath);

describe("MoonBit WebAssembly Feed Plugin (WasmGuestHost + SchemaRenderer + OmniKernel)", { timeout: 40000 }, () => {
  let kernel: OmniKernel;
  let rootContainer: HTMLElement;
  let mainSlot: HTMLElement;

  beforeEach(async () => {
    if ((window as any).happyDOM?.settings) {
      (window as any).happyDOM.settings.enableIframePageLoading = true;
    }
    document.body.innerHTML = "";
    rootContainer = document.createElement("div");
    document.body.appendChild(rootContainer);
    mainSlot = document.createElement("div");
    rootContainer.appendChild(mainSlot);

    const uniqueId = `feed_wasm_${Math.random().toString(36).slice(2, 9)}`;
    kernel = new OmniKernel({
      bootstrapRelays: [],
      persistRelays: false,
      runtimeScript: omniRuntimeScript,
      eventStoreName: `test_event_store_${uniqueId}`,
      storageName: `test_storage_${uniqueId}`
    });
    await kernel.boot();
  }, 10000);

  afterEach(() => {
    try { kernel?.relayPool?.disconnect(); } catch (_) {}
    document.body.innerHTML = "";
  });

  it("renders declarative Schema UI with custom omni-* elements natively into the host DOM", async () => {
    const slotContainers = new Map<string, Element>([["main", mainSlot]]);

    const sandbox = await kernel.registerPlugin(
      {
        id: "org.omni.plugin.feed",
        name: "Feed",
        version: "1.0.0",
        entry: "feed.wasm",
        components: [{ id: "main", type: "main", title: "Feed", slot: "main" }],
        permissions: {},
        views: [{ id: "main", title: "Feed", path: "", format: "wasm" }]
      },
      wasmBytes,
      slotContainers
    );

    expect(sandbox.getWasmHost()).not.toBeNull();
    await wait(50);

    expect(mainSlot.querySelector("omni-box")).not.toBeNull();
    expect(mainSlot.querySelector("omni-button")).not.toBeNull();

    // Verify tabs rendered as omni-button custom elements
    const buttons = Array.from(mainSlot.querySelectorAll("omni-button"));
    expect(buttons.length).toBeGreaterThan(0);
    const followingBtn = buttons.find((b) => b.textContent?.includes("Following"));
    expect(followingBtn).toBeDefined();
    const globalBtn = buttons.find((b) => b.textContent?.includes("Global"));
    expect(globalBtn).toBeDefined();

    sandbox.destroy();
  });

  it("selects Following tab by default and switches to Global on click", async () => {
    const slotContainers = new Map<string, Element>([["main", mainSlot]]);

    const sandbox = await kernel.registerPlugin(
      {
        id: "org.omni.plugin.feed",
        name: "Feed",
        version: "1.0.0",
        entry: "feed.wasm",
        components: [{ id: "main", type: "main", title: "Feed", slot: "main" }],
        permissions: {},
        views: [{ id: "main", title: "Feed", path: "", format: "wasm" }]
      },
      wasmBytes,
      slotContainers
    );

    await wait(50);

    const buttons = Array.from(mainSlot.querySelectorAll("omni-button"));
    const followingBtn = buttons.find((b) => b.textContent?.includes("Following"));
    const globalBtn = buttons.find((b) => b.textContent?.includes("Global"));
    expect(followingBtn).toBeDefined();
    expect(globalBtn).toBeDefined();

    // Following is primary by default
    expect(followingBtn?.getAttribute("variant")).toBe("primary");
    expect(globalBtn?.getAttribute("variant")).toBe("ghost");

    // Click "Global" tab button
    const targetGlobal = globalBtn?.querySelector("button") || globalBtn;
    (targetGlobal as HTMLElement)?.click();
    await wait(50);

    // After clicking Global, active tab variant is updated to primary and Following to ghost
    const updatedButtons = Array.from(mainSlot.querySelectorAll("omni-button"));
    const updatedGlobal = updatedButtons.find((b) => b.textContent?.includes("Global"));
    const updatedFollowing = updatedButtons.find((b) => b.textContent?.includes("Following"));
    expect(updatedGlobal?.getAttribute("variant")).toBe("primary");
    expect(updatedFollowing?.getAttribute("variant")).toBe("ghost");

    sandbox.destroy();
  });

  it("renders connecting card when feed has zero notes", async () => {
    const slotContainers = new Map<string, Element>([["main", mainSlot]]);

    const sandbox = await kernel.registerPlugin(
      {
        id: "org.omni.plugin.feed",
        name: "Feed",
        version: "1.0.0",
        entry: "feed.wasm",
        components: [{ id: "main", type: "main", title: "Feed", slot: "main" }],
        permissions: {},
        views: [{ id: "main", title: "Feed", path: "", format: "wasm" }]
      },
      wasmBytes,
      slotContainers
    );

    await wait(50);

    // Verify connecting / empty message is shown instead of fake notes
    expect(mainSlot.textContent).toContain("Connecting to Nostr relays...");
    expect(mainSlot.textContent).not.toContain("note_welcome");

    sandbox.destroy();
  });

  it("renders live Nostr note cards loaded from 0ms eventStore cache", async () => {
    // Commit a real Nostr note to local event store before mounting
    await kernel.eventStore.saveEvent({
      id: "note_live_abc123",
      pubkey: "45a5f5099077eed79858276d2e6a5c1cb5c97b00c8800263658624479588b966",
      kind: 1,
      content: "Hello live Nostr world from 0ms cache!",
      created_at: 1730001000,
      tags: [],
      sig: "test_sig"
    });

    const slotContainers = new Map<string, Element>([["main", mainSlot]]);

    const sandbox = await kernel.registerPlugin(
      {
        id: "org.omni.plugin.feed",
        name: "Feed",
        version: "1.0.0",
        entry: "feed.wasm",
        components: [{ id: "main", type: "main", title: "Feed", slot: "main" }],
        permissions: {},
        views: [{ id: "main", title: "Feed", path: "", format: "wasm" }]
      },
      wasmBytes,
      slotContainers
    );

    await wait(80);

    const cards = mainSlot.querySelectorAll("omni-card");
    expect(cards.length).toBeGreaterThanOrEqual(2);

    expect(mainSlot.textContent).toContain("Hello live Nostr world from 0ms cache!");

    // Action buttons (Reply, Repost, Like, Zap) inside note card with descriptive tooltips
    const actionButtons = Array.from(mainSlot.querySelectorAll("omni-card omni-button"));
    expect(actionButtons.length).toBeGreaterThanOrEqual(4);

    const replyBtn = actionButtons.find((b) => b.querySelector("button")?.title === "Reply");
    const repostBtn = actionButtons.find((b) => b.querySelector("button")?.title === "Repost");
    const likeBtn = actionButtons.find((b) => b.querySelector("button")?.title === "Like");
    const zapBtn = actionButtons.find((b) => b.querySelector("button")?.title === "Zap");

    expect(replyBtn).toBeDefined();
    expect(repostBtn).toBeDefined();
    expect(likeBtn).toBeDefined();
    expect(zapBtn).toBeDefined();

    // Clicking avatar or author row dispatches view_profile intent
    let dispatchedIntent: any = null;
    kernel.intentBroker.registerHandler("test-profile-handler", "view_profile", async (data) => {
      dispatchedIntent = data;
      return { handled: true };
    });

    const avatar = mainSlot.querySelector("omni-avatar");
    expect(avatar).toBeDefined();
    (avatar as HTMLElement)?.click();
    await wait(30);

    expect(dispatchedIntent).toBeDefined();
    expect(dispatchedIntent?.pubkey).toBe("45a5f5099077eed79858276d2e6a5c1cb5c97b00c8800263658624479588b966");

    sandbox.destroy();
  });

  it("renders composer card with input and Publish Note button", async () => {
    const slotContainers = new Map<string, Element>([["main", mainSlot]]);

    const sandbox = await kernel.registerPlugin(
      {
        id: "org.omni.plugin.feed",
        name: "Feed",
        version: "1.0.0",
        entry: "feed.wasm",
        components: [{ id: "main", type: "main", title: "Feed", slot: "main" }],
        permissions: {},
        views: [{ id: "main", title: "Feed", path: "", format: "wasm" }]
      },
      wasmBytes,
      slotContainers
    );

    await wait(50);

    const buttons = Array.from(mainSlot.querySelectorAll("omni-button"));
    const publishBtn = buttons.find((b) => b.textContent?.includes("Publish Note"));
    expect(publishBtn).toBeDefined();

    const input = mainSlot.querySelector("omni-input");
    expect(input).not.toBeNull();

    sandbox.destroy();
  });

  it("loads and displays notes from followed creators in the Following tab", async () => {
    const userPubkey = await kernel.getUserPubkey();
    const followedPubkey = "1111111111111111111111111111111111111111111111111111111111111111";
    const strangerPubkey = "9999999999999999999999999999999999999999999999999999999999999999";

    // 1. Save contact list (Kind 3) for the user
    await kernel.eventStore.saveEvent({
      id: "contacts_test_123",
      pubkey: userPubkey,
      kind: 3,
      created_at: 1730000000,
      tags: [["p", followedPubkey]],
      content: "",
      sig: "test_sig_3"
    });

    // 2. Save note from followed creator
    await kernel.eventStore.saveEvent({
      id: "note_followed_creator_1",
      pubkey: followedPubkey,
      kind: 1,
      created_at: 1730001000,
      tags: [],
      content: "Exclusive note from your favorite followed creator!",
      sig: "test_sig_followed"
    });

    // 3. Save note from stranger
    await kernel.eventStore.saveEvent({
      id: "note_stranger_1",
      pubkey: strangerPubkey,
      kind: 1,
      created_at: 1730002000,
      tags: [],
      content: "Random global stranger post across Nostr universe",
      sig: "test_sig_stranger"
    });

    const slotContainers = new Map<string, Element>([["main", mainSlot]]);

    const sandbox = await kernel.registerPlugin(
      {
        id: "org.omni.plugin.feed",
        name: "Feed",
        version: "1.0.0",
        entry: "feed.wasm",
        components: [{ id: "main", type: "main", title: "Feed", slot: "main" }],
        permissions: {},
        views: [{ id: "main", title: "Feed", path: "", format: "wasm" }]
      },
      wasmBytes,
      slotContainers
    );

    await wait(120);

    // Following tab is active: should show note from followed creator, but NOT stranger note
    expect(mainSlot.textContent).toContain("Exclusive note from your favorite followed creator!");
    expect(mainSlot.textContent).not.toContain("Random global stranger post across Nostr universe");

    // Click "Global" tab
    const buttons = Array.from(mainSlot.querySelectorAll("omni-button"));
    const globalBtn = buttons.find((b) => b.textContent?.includes("Global"));
    const targetGlobal = globalBtn?.querySelector("button") || globalBtn;
    (targetGlobal as HTMLElement)?.click();
    await wait(80);

    // In Global tab: both notes are visible
    expect(mainSlot.textContent).toContain("Exclusive note from your favorite followed creator!");
    expect(mainSlot.textContent).toContain("Random global stranger post across Nostr universe");

    sandbox.destroy();
  });

  it("publishes a real Schnorr-signed Nostr note from the WASM composer into eventStore and feed", async () => {
    const slotContainers = new Map<string, Element>([["main", mainSlot]]);

    const sandbox = await kernel.registerPlugin(
      {
        id: "org.omni.plugin.feed",
        name: "Feed",
        version: "1.0.0",
        entry: "feed.wasm",
        components: [{ id: "main", type: "main", title: "Feed", slot: "main" }],
        permissions: {},
        views: [{ id: "main", title: "Feed", path: "", format: "wasm" }]
      },
      wasmBytes,
      slotContainers
    );

    await wait(50);

    // Enter note text in composer
    const input = mainSlot.querySelector("omni-input");
    const innerInput = input?.querySelector("input") || (input as any);
    if (innerInput) {
      innerInput.value = "Autonomous MoonBit WASM Nostr publish test!";
      innerInput.dispatchEvent(new Event("input", { bubbles: true }));
    }

    // Click Publish Note button
    const buttons = Array.from(mainSlot.querySelectorAll("omni-button"));
    const publishBtn = buttons.find((b) => b.textContent?.includes("Publish Note"));
    const targetBtn = publishBtn?.querySelector("button") || publishBtn;
    (targetBtn as HTMLElement)?.click();

    await wait(150);

    // Check that note is signed and saved into 0ms eventStore
    const savedNotes = await kernel.eventStore.getEvents({ kinds: [1] });
    const ourSavedNote = savedNotes.find((n) => n.content === "Autonomous MoonBit WASM Nostr publish test!");
    expect(ourSavedNote).toBeDefined();
    expect(ourSavedNote?.sig).toBeDefined();
    expect(ourSavedNote?.pubkey).toBeDefined();

    // Check that the note card rendered into the feed
    expect(mainSlot.textContent).toContain("Autonomous MoonBit WASM Nostr publish test!");

    sandbox.destroy();
  });

  it("resolves author display name from Kind 0 metadata events in feed note cards", async () => {
    const authorPk = "4444444444444444444444444444444444444444444444444444444444444444";
    const slotContainers = new Map<string, Element>([["main", mainSlot]]);

    // Pre-seed eventStore with a Kind 1 note
    await kernel.eventStore.saveEvent({
      id: "note_named_author_1",
      pubkey: authorPk,
      kind: 1,
      created_at: 1730000500,
      tags: [],
      content: "Hello from Alice wonderland!",
      sig: "00".repeat(64)
    } as any);

    // Also pre-seed Kind 0 metadata event
    await kernel.eventStore.saveEvent({
      id: "metadata_author_1",
      pubkey: authorPk,
      kind: 0,
      created_at: 1730000600,
      tags: [],
      content: JSON.stringify({
        name: "alice",
        display_name: "Alice in Wonderland"
      }),
      sig: "00".repeat(64)
    } as any);

    const sandbox = await kernel.registerPlugin(
      {
        id: "org.omni.plugin.feed",
        name: "Feed",
        version: "1.0.0",
        entry: "feed.wasm",
        components: [{ id: "main", type: "main", title: "Feed", slot: "main" }],
        permissions: {},
        views: [{ id: "main", title: "Feed", path: "", format: "wasm" }]
      },
      wasmBytes,
      slotContainers
    );

    await wait(120);

    // Note content should be visible
    expect(mainSlot.textContent).toContain("Hello from Alice wonderland!");
    // Author display name should be resolved to Alice in Wonderland
    expect(mainSlot.textContent).toContain("Alice in Wonderland");

    sandbox.destroy();
  });

  it("renders Load More Notes button and batches older notes pagination", async () => {
    const slotContainers = new Map<string, Element>([["main", mainSlot]]);

    await kernel.eventStore.saveEvent({
      id: "note_pagination_head",
      pubkey: "5555555555555555555555555555555555555555555555555555555555555555",
      kind: 1,
      created_at: 1730000800,
      tags: [],
      content: "Head of feed note",
      sig: "00".repeat(64)
    } as any);

    const sandbox = await kernel.registerPlugin(
      {
        id: "org.omni.plugin.feed",
        name: "Feed",
        version: "1.0.0",
        entry: "feed.wasm",
        components: [{ id: "main", type: "main", title: "Feed", slot: "main" }],
        permissions: {},
        views: [{ id: "main", title: "Feed", path: "", format: "wasm" }]
      },
      wasmBytes,
      slotContainers
    );

    await wait(100);

    // Verify "Load More Notes" button is rendered
    const buttons = Array.from(mainSlot.querySelectorAll("omni-button"));
    const loadMoreBtn = buttons.find((b) => b.textContent?.includes("Load More Notes"));
    expect(loadMoreBtn).toBeDefined();

    // Click load more button
    const targetBtn = loadMoreBtn?.querySelector("button") || loadMoreBtn;
    (targetBtn as HTMLElement)?.click();

    await wait(80);

    // Deliver an older note as incoming relay frame
    const wasmHost = sandbox.getWasmHost();
    wasmHost?.dispatchAction("main", { name: "nostr:event" }, {
      id: "note_older_1",
      pubkey: "6666666666666666666666666666666666666666666666666666666666666666",
      kind: 1,
      created_at: 1730000100,
      content: "Older paginated historical note"
    });

    await wait(80);

    // Both notes should be rendered
    expect(mainSlot.textContent).toContain("Head of feed note");
    expect(mainSlot.textContent).toContain("Older paginated historical note");

    sandbox.destroy();
  });

  it("handles repeated load-more pagination and rapid event streams without index out of bounds errors", async () => {
    const slotContainers = new Map<string, Element>([["main", mainSlot]]);

    const sandbox = await kernel.registerPlugin(
      {
        id: "org.omni.plugin.feed",
        name: "Feed",
        version: "1.0.0",
        entry: "feed.wasm",
        components: [{ id: "main", type: "main", title: "Feed", slot: "main" }],
        permissions: {},
        views: [{ id: "main", title: "Feed", path: "", format: "wasm" }]
      },
      wasmBytes,
      slotContainers
    );

    const wasmHost = sandbox.getWasmHost()!;
    expect(wasmHost).toBeDefined();

    // Stream 60 events in rapid succession (simulating real relay bursts)
    for (let i = 0; i < 60; i++) {
      wasmHost.dispatchAction("main", { name: "nostr:event" }, {
        id: `burst_note_${i.toString().padStart(64, "0")}`,
        pubkey: `burst_pk_${(i % 10).toString().padStart(64, "0")}`,
        kind: 1,
        created_at: 1730000000 + i,
        content: `Rapid burst note ${i} with emojis 😀🚀⚡ to verify safe UTF-8 decoding and heap isolation.`
      });
    }

    await wait(60);

    // Trigger multiple load-more pagination actions
    for (let p = 0; p < 5; p++) {
      wasmHost.dispatchAction("main", { name: "load-more" }, {});
    }

    await wait(60);

    // Verify feed rendered without crashing
    expect(mainSlot.querySelector("omni-card")).not.toBeNull();
    expect(mainSlot.textContent).toContain("Rapid burst note");

    sandbox.destroy();
  });

  it("tracks and renders reply and reaction counts on note cards", async () => {
    const slotContainers = new Map<string, Element>([["main", mainSlot]]);

    const rootNoteId = "parent_target_note_12345678901234567890123456789012345678901234";
    await kernel.eventStore.saveEvent({
      id: rootNoteId,
      pubkey: "7777777777777777777777777777777777777777777777777777777777777777",
      kind: 1,
      created_at: 1730000500,
      tags: [],
      content: "Root note waiting for interaction counts",
      sig: "00".repeat(64)
    } as any);

    const sandbox = await kernel.registerPlugin(
      {
        id: "org.omni.plugin.feed",
        name: "Feed",
        version: "1.0.0",
        entry: "feed.wasm",
        components: [{ id: "main", type: "main", title: "Feed", slot: "main" }],
        permissions: {},
        views: [{ id: "main", title: "Feed", path: "", format: "wasm" }]
      },
      wasmBytes,
      slotContainers
    );

    await wait(100);

    const wasmHost = sandbox.getWasmHost()!;
    expect(wasmHost).toBeDefined();

    // Deliver a Kind 1 reply referencing rootNoteId
    wasmHost.dispatchAction("main", { name: "nostr:event" }, {
      id: "reply_child_note_9876543210987654321098765432109876543210",
      pubkey: "8888888888888888888888888888888888888888888888888888888888888888",
      kind: 1,
      created_at: 1730000510,
      tags: [["e", rootNoteId, "", "reply"]],
      content: "This is a great reply to root note!"
    });

    // Deliver a Kind 7 like reaction referencing rootNoteId
    wasmHost.dispatchAction("main", { name: "nostr:event" }, {
      id: "like_reaction_event_1111111111111111111111111111111111111111",
      pubkey: "9999999999999999999999999999999999999999999999999999999999999999",
      kind: 7,
      created_at: 1730000520,
      tags: [["e", rootNoteId]],
      content: "+"
    });

    await wait(80);

    // Verify reply count and like count updated on note action buttons
    const buttons = Array.from(mainSlot.querySelectorAll("omni-button"));
    const replyBtn = buttons.find((b) => (b.getAttribute("tooltip") === "Reply" || b.getAttribute("icon") === "reply") && b.textContent?.includes("1"));
    expect(replyBtn).toBeDefined();

    const likeBtn = buttons.find((b) => (b.getAttribute("tooltip") === "Like" || b.getAttribute("icon") === "heart") && b.textContent?.includes("1"));
    expect(likeBtn).toBeDefined();

    // Verify reply note card renders "Reply to..." badge
    const badge = mainSlot.querySelector("omni-badge");
    expect(badge?.textContent).toContain("Reply to...");

    sandbox.destroy();
  });

  it("views post conversation thread with replies and navigates back to feed", async () => {
    const slotContainers = new Map<string, Element>([["main", mainSlot]]);

    const targetPostId = "thread_target_post_1111111111111111111111111111111111111111";
    await kernel.eventStore.saveEvent({
      id: targetPostId,
      pubkey: "3333333333333333333333333333333333333333333333333333333333333333",
      kind: 1,
      created_at: 1730000400,
      tags: [],
      content: "Main discussion post to view replies for",
      sig: "00".repeat(64)
    } as any);

    // Also pre-save a reply in the event store so it loads when thread opens
    const replyNoteId = "thread_reply_post_2222222222222222222222222222222222222222";
    await kernel.eventStore.saveEvent({
      id: replyNoteId,
      pubkey: "4444444444444444444444444444444444444444444444444444444444444444",
      kind: 1,
      created_at: 1730000450,
      tags: [["e", targetPostId, "", "reply"]],
      content: "This is a visible reply in the discussion thread!",
      sig: "00".repeat(64)
    } as any);

    const sandbox = await kernel.registerPlugin(
      {
        id: "org.omni.plugin.feed",
        name: "Feed",
        version: "1.0.0",
        entry: "feed.wasm",
        components: [{ id: "main", type: "main", title: "Feed", slot: "main" }],
        permissions: {},
        views: [{ id: "main", title: "Feed", path: "", format: "wasm" }]
      },
      wasmBytes,
      slotContainers
    );

    await wait(100);

    const wasmHost = sandbox.getWasmHost()!;
    expect(wasmHost).toBeDefined();

    // Verify post is on timeline
    expect(mainSlot.textContent).toContain("Main discussion post to view replies for");

    // Click into the post to view thread
    wasmHost.dispatchAction("main", { name: "view-thread" }, { id: targetPostId });

    await wait(100);

    // Verify conversation thread header rendered
    expect(mainSlot.textContent).toContain("Conversation Thread");
    expect(mainSlot.textContent).toContain("Main discussion post to view replies for");

    // Deliver the reply event (from local store or relay stream)
    wasmHost.dispatchAction("main", { name: "nostr:event" }, {
      id: replyNoteId,
      pubkey: "4444444444444444444444444444444444444444444444444444444444444444",
      kind: 1,
      created_at: 1730000450,
      tags: [["e", targetPostId, "", "reply"]],
      content: "This is a visible reply in the discussion thread!"
    });

    await wait(80);

    // Verify reply is rendered under the parent post in the thread
    expect(mainSlot.textContent).toContain("This is a visible reply in the discussion thread!");

    // Verify "← Back to Feed" button exists and clicking it returns to timeline
    const buttons = Array.from(mainSlot.querySelectorAll("omni-button"));
    const backBtn = buttons.find((b) => b.textContent?.includes("Back to Feed"));
    expect(backBtn).toBeDefined();

    const targetBackBtn = backBtn?.querySelector("button") || backBtn;
    (targetBackBtn as HTMLElement)?.click();

    await wait(80);

    // Verify we are back on the main timeline
    expect(mainSlot.textContent).toContain("Timeline Notes");
    expect(mainSlot.textContent).not.toContain("Conversation Thread");

    // Also test navigation back via dispatchHistoryPopstate
    wasmHost.dispatchAction("main", { name: "view-thread" }, { id: targetPostId });
    await wait(80);
    expect(mainSlot.textContent).toContain("Conversation Thread");

    sandbox.dispatchHistoryPopstate(-1, null, "");
    await wait(80);
    expect(mainSlot.textContent).toContain("Timeline Notes");
    expect(mainSlot.textContent).not.toContain("Conversation Thread");

    sandbox.destroy();
  });
});
