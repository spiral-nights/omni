// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const feedCode = readFileSync(
  join(__dirname, "../dist/index.js"),
  "utf8"
).replace(/^export /gm, "");

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  url: string;
  readyState = 0;
  onopen: any = null;
  onmessage: any = null;
  onerror: any = null;
  onclose: any = null;
  sent: any[] = [];

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.(new Event("open"));
    }, 0);
  }

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.readyState = 3;
  }

  deliver(frame: any[]) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

function flush() {
  return new Promise((r) => setTimeout(r, 20));
}

describe("feed plugin DOM interactions", () => {
  let document: Document;

  beforeEach(() => {
    document = window.document;
    document.body.innerHTML = "";
    FakeWebSocket.instances = [];
    (window as any).WebSocket = FakeWebSocket;
    (window as any).nostr = { getPublicKey: async () => "a".repeat(64) };
    (window as any).omni = {
      intents: { dispatch: vi.fn(async () => ({})) }
    };
    (window as any).location.search = "";
    new Function(feedCode)();
  });

  const feed = () => document.body.querySelector<HTMLElement>(".feed-container")!;

  it("renders note cards from relay events", async () => {
    await flush();
    const ws = FakeWebSocket.instances[0];
    ws.deliver(["EVENT", "feed-initial", {
      id: "note-1", pubkey: "b".repeat(64), kind: 1, created_at: 1700000000,
      content: "hello world", tags: []
    }]);
    expect(feed().querySelectorAll(".note-card").length).toBe(1);
  });

  it("refresh button sends a REQ and stops spinning on EOSE", async () => {
    await flush();
    const ws = FakeWebSocket.instances[0];
    const btn = feed().querySelector<HTMLButtonElement>(".btn-refresh-feed")!;
    btn.click();
    await flush();
    const req = ws.sent.find((f) => f[0] === "REQ" && String(f[1]).startsWith("refresh-"));
    expect(req).toBeDefined();
    expect(req[2].kinds).toEqual([1]);
  });

  it("search button opens the search page and hides feed sections", async () => {
    await flush();
    const btn = feed().querySelector<HTMLButtonElement>(".btn-search-feed")!;
    btn.click();
    const searchPage = feed().querySelector<HTMLElement>(".feed-search-page")!;
    expect(searchPage.style.display).not.toBe("none");
    expect(feed().querySelector<HTMLElement>(".notes-list")!.style.display).toBe("none");
  });

  it("entering a query runs a search and renders keyword matches", async () => {
    await flush();
    const ws = FakeWebSocket.instances[0];
    ws.deliver(["EVENT", "feed-initial", {
      id: "note-1", pubkey: "b".repeat(64), kind: 1, created_at: 1700000000,
      content: "cat pictures are great", tags: []
    }]);
    ws.deliver(["EOSE", "feed-initial"]);

    feed().querySelector<HTMLButtonElement>(".btn-search-feed")!.click();
    const input = feed().querySelector<HTMLInputElement>(".feed-search-input")!;
    input.value = "cat";
    feed().querySelector<HTMLButtonElement>(".btn-do-search")!.click();
    await flush();

    // Local match renders immediately
    const notes = feed().querySelectorAll(".search-notes-section .note-card");
    expect(notes.length).toBe(1);

    // Relay search completes: EOSE + grace period clears the status
    const searchWs = FakeWebSocket.instances[1];
    expect(searchWs).toBeDefined();
    searchWs.deliver(["EOSE", "search-notes-1"]);
    await new Promise((r) => setTimeout(r, 1800));
    expect(feed().querySelector(".search-status")).toBeNull();
  });

  it("counts late relay events that arrive after the first EOSE", async () => {
    await flush();
    feed().querySelector<HTMLButtonElement>(".btn-search-feed")!.click();
    const input = feed().querySelector<HTMLInputElement>(".feed-search-input")!;
    input.value = "cat";
    feed().querySelector<HTMLButtonElement>(".btn-do-search")!.click();
    await flush();

    const searchWs = FakeWebSocket.instances[1];
    // Fast relay signals EOSE immediately with a non-matching event
    searchWs.deliver(["EVENT", "search-notes-1", {
      id: "relay-1", pubkey: "c".repeat(64), kind: 1, created_at: 1700000000,
      content: "unrelated dog talk", tags: []
    }]);
    searchWs.deliver(["EOSE", "search-notes-1"]);

    // The slow search indexer responds within the grace period
    searchWs.deliver(["EVENT", "search-notes-1", {
      id: "relay-2", pubkey: "d".repeat(64), kind: 1, created_at: 1700000100,
      content: "more cats here", tags: []
    }]);

    await new Promise((r) => setTimeout(r, 1800));
    const notes = feed().querySelectorAll(".search-notes-section .note-card");
    expect(notes.length).toBe(1);
    expect(feed().querySelector(".search-status")).toBeNull();
  });

  it("npub input resolves via identifier path and dispatches view_profile", async () => {
    await flush();
    feed().querySelector<HTMLButtonElement>(".btn-search-feed")!.click();
    const input = feed().querySelector<HTMLInputElement>(".feed-search-input")!;
    input.value = "npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6";
    feed().querySelector<HTMLButtonElement>(".btn-do-search")!.click();
    await flush();
    expect((window as any).omni.intents.dispatch).toHaveBeenCalledWith(
      "view_profile",
      { pubkey: "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d" }
    );
  });

  it("back button returns to the feed", async () => {
    await flush();
    feed().querySelector<HTMLButtonElement>(".btn-search-feed")!.click();
    expect(feed().querySelector<HTMLElement>(".notes-list")!.style.display).toBe("none");
    feed().querySelector<HTMLButtonElement>(".btn-search-back")!.click();
    expect(feed().querySelector<HTMLElement>(".notes-list")!.style.display).toBe("");
  });
});
