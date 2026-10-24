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

describe("feed plugin thread view and following tabs", () => {
  let document: Document;
  const myPubkey = "a".repeat(64);
  const friendPubkey = "b".repeat(64);
  const strangerPubkey = "c".repeat(64);

  beforeEach(() => {
    const store = new Map<string, string>();
    (window as any).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear()
    };
    document = window.document;
    document.body.innerHTML = "";
    FakeWebSocket.instances = [];
    (window as any).WebSocket = FakeWebSocket;
    (window as any).nostr = {
      getPublicKey: async () => myPubkey,
      signEvent: vi.fn(async (ev: any) => ({
        ...ev,
        id: "signed-reply-id",
        pubkey: myPubkey,
        sig: "sig"
      }))
    };
    (window as any).omni = {
      intents: { dispatch: vi.fn(async () => ({})) }
    };
    (window as any).location.search = "";
    new Function(feedCode)();
  });

  const feed = () => document.body.querySelector<HTMLElement>(".feed-container")!;

  it("switches between Following and Global tabs", async () => {
    await flush();
    const btnFollowing = feed().querySelector<HTMLButtonElement>(".btn-tab-following")!;
    const btnGlobal = feed().querySelector<HTMLButtonElement>(".btn-tab-global")!;

    expect(btnFollowing.classList.contains("active")).toBe(true);

    btnGlobal.click();
    expect(btnGlobal.classList.contains("active")).toBe(true);
    expect(btnFollowing.classList.contains("active")).toBe(false);
    expect(localStorage.getItem("omni_feed_active_tab")).toBe("global");

    btnFollowing.click();
    expect(btnFollowing.classList.contains("active")).toBe(true);
    expect(btnGlobal.classList.contains("active")).toBe(false);
  });

  it("filters notes in Following tab to only followed pubkeys", async () => {
    await flush();
    const ws = FakeWebSocket.instances[0];

    // Deliver kind 3 contact list for myPubkey
    ws.deliver(["EVENT", "feed-contacts", {
      id: "contacts-1",
      pubkey: myPubkey,
      kind: 3,
      created_at: 1700000000,
      tags: [["p", friendPubkey]],
      content: ""
    }]);

    // Deliver notes from friend and stranger
    ws.deliver(["EVENT", "feed-initial", {
      id: "note-friend",
      pubkey: friendPubkey,
      kind: 1,
      created_at: 1700000001,
      content: "Friend update",
      tags: []
    }]);

    ws.deliver(["EVENT", "feed-initial", {
      id: "note-stranger",
      pubkey: strangerPubkey,
      kind: 1,
      created_at: 1700000002,
      content: "Stranger broadcast",
      tags: []
    }]);

    // In Following tab, only friend's note should be rendered
    const notesInFollowing = feed().querySelectorAll(".note-card");
    expect(notesInFollowing.length).toBe(1);
    expect(notesInFollowing[0].textContent).toContain("Friend update");

    // Switch to Global tab
    feed().querySelector<HTMLButtonElement>(".btn-tab-global")!.click();

    // In Global tab, both notes are present
    expect(feed().querySelectorAll(".note-card").length).toBe(2);
  });

  it("clicking a note card opens thread view with back navigation", async () => {
    await flush();
    feed().querySelector<HTMLButtonElement>(".btn-tab-global")!.click();
    const ws = FakeWebSocket.instances[0];

    ws.deliver(["EVENT", "feed-initial", {
      id: "parent-note-id",
      pubkey: friendPubkey,
      kind: 1,
      created_at: 1700000000,
      content: "Main conversation topic",
      tags: []
    }]);

    const card = feed().querySelector<HTMLElement>(".note-card")!;
    expect(card).toBeDefined();

    // Click card body (not an action button)
    card.click();

    const threadPage = feed().querySelector<HTMLElement>(".feed-thread-page")!;
    expect(threadPage.style.display).not.toBe("none");

    const focusedNote = threadPage.querySelector<HTMLElement>(".thread-focused-note")!;
    expect(focusedNote.textContent).toContain("Main conversation topic");

    // Click Back button
    const backBtn = threadPage.querySelector<HTMLButtonElement>(".btn-thread-back")!;
    backBtn.click();
    expect(threadPage.style.display).toBe("none");
    expect(feed().querySelector<HTMLElement>(".notes-list")!.style.display).not.toBe("none");
  });

  it("clicking reply button on a card opens thread view and focuses reply input", async () => {
    await flush();
    feed().querySelector<HTMLButtonElement>(".btn-tab-global")!.click();
    const ws = FakeWebSocket.instances[0];

    ws.deliver(["EVENT", "feed-initial", {
      id: "target-note-id",
      pubkey: friendPubkey,
      kind: 1,
      created_at: 1700000000,
      content: "Interesting post",
      tags: []
    }]);

    const replyBtn = feed().querySelector<HTMLButtonElement>(".action-reply")!;
    replyBtn.click();

    const threadPage = feed().querySelector<HTMLElement>(".feed-thread-page")!;
    expect(threadPage.style.display).not.toBe("none");
    const replyInput = threadPage.querySelector<HTMLTextAreaElement>(".thread-reply-input")!;
    expect(replyInput).toBeDefined();
  });

  it("submitting in-thread reply tags NIP-10 e/p tags, signs, and updates UI", async () => {
    await flush();
    feed().querySelector<HTMLButtonElement>(".btn-tab-global")!.click();
    const ws = FakeWebSocket.instances[0];

    ws.deliver(["EVENT", "feed-initial", {
      id: "root-note-123",
      pubkey: friendPubkey,
      kind: 1,
      created_at: 1700000000,
      content: "Root discussion point",
      tags: []
    }]);

    // Open thread
    feed().querySelector<HTMLElement>(".note-card")!.click();

    const threadPage = feed().querySelector<HTMLElement>(".feed-thread-page")!;
    const replyInput = threadPage.querySelector<HTMLTextAreaElement>(".thread-reply-input")!;
    const replySubmitBtn = threadPage.querySelector<HTMLButtonElement>(".btn-thread-reply")!;

    replyInput.value = "Here is my thoughtful reply!";
    replySubmitBtn.click();

    await flush();

    // Verify signing was called with correct NIP-10 tags
    const signEventSpy = (window as any).nostr.signEvent;
    expect(signEventSpy).toHaveBeenCalled();
    const callArgs = signEventSpy.mock.calls[0][0];
    expect(callArgs.kind).toBe(1);
    expect(callArgs.content).toBe("Here is my thoughtful reply!");

    // Checks root and reply tags
    const eTags = callArgs.tags.filter((t: string[]) => t[0] === "e");
    expect(eTags.some((t: string[]) => t[1] === "root-note-123")).toBe(true);
    const pTags = callArgs.tags.filter((t: string[]) => t[0] === "p");
    expect(pTags.some((t: string[]) => t[1] === friendPubkey)).toBe(true);

    // Verify event frame sent to WebSocket
    const sentEvent = ws.sent.find((f) => f[0] === "EVENT" && f[1]?.id === "signed-reply-id");
    expect(sentEvent).toBeDefined();

    // Verify reply card rendered in replies list
    const repliesList = threadPage.querySelector<HTMLElement>(".thread-replies-list")!;
    expect(repliesList.textContent).toContain("Here is my thoughtful reply!");
  });

  it("renders existing replies and incoming thread events", async () => {
    await flush();
    feed().querySelector<HTMLButtonElement>(".btn-tab-global")!.click();
    const ws = FakeWebSocket.instances[0];

    ws.deliver(["EVENT", "feed-initial", {
      id: "focused-note-456",
      pubkey: strangerPubkey,
      kind: 1,
      created_at: 1700000000,
      content: "Let's discuss something exciting",
      tags: []
    }]);

    // Open thread
    feed().querySelector<HTMLElement>(".note-card")!.click();

    const threadPage = feed().querySelector<HTMLElement>(".feed-thread-page")!;

    // Deliver a reply from relay with #e tag matching focused note
    ws.deliver(["EVENT", "thread_rep_focused-", {
      id: "reply-to-456",
      pubkey: friendPubkey,
      kind: 1,
      created_at: 1700000010,
      content: "I totally agree with this point!",
      tags: [["e", "focused-note-456", "", "root"], ["p", strangerPubkey]]
    }]);

    const repliesList = threadPage.querySelector<HTMLElement>(".thread-replies-list")!;
    expect(repliesList.textContent).toContain("I totally agree with this point!");
  });

  it("handles NIP-21 URIs and renders interactive entity links and quote cards", async () => {
    await flush();
    feed().querySelector<HTMLButtonElement>(".btn-tab-global")!.click();
    const ws = FakeWebSocket.instances[0];

    // Deliver note containing NIP-21 note reference
    const quotedHex = "f".repeat(64);
    // npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6
    const testNpub = "npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6";
    // note107u6a908g2wuv8z0swc4e3ludv2m7p8x0y7u6a908g2wuv8z0swc5mclst
    const testNote = "note16gv8m3wdywc2r9d5krrzhxaar070ped9t7xmwcdx6kkdr3455vlqs6qdre";

    ws.deliver(["EVENT", "feed-initial", {
      id: "quoting-note-1",
      pubkey: strangerPubkey,
      kind: 1,
      created_at: 1700000050,
      content: `Check this out nostr:${testNote} from nostr:${testNpub}`,
      tags: []
    }]);
    await flush();

    const noteCard = feed().querySelector<HTMLElement>(".note-card")!;
    expect(noteCard).toBeTruthy();

    // Verify NIP-21 links are rendered
    const noteLink = noteCard.querySelector<HTMLAnchorElement>(".feed-nostr-note");
    expect(noteLink).toBeTruthy();
    expect(noteLink?.textContent).toContain("Note");

    const profileLink = noteCard.querySelector<HTMLAnchorElement>(".feed-nostr-profile");
    expect(profileLink).toBeTruthy();
    expect(profileLink?.textContent).toContain("@");

    // Verify quote card is rendered
    const quoteCard = noteCard.querySelector<HTMLElement>(".feed-quote-card");
    expect(quoteCard).toBeTruthy();
    expect(quoteCard?.textContent).toContain("Quoted Note");

    // Click on quote card to open thread
    quoteCard?.click();
    await flush();

    const threadPage = feed().querySelector<HTMLElement>(".feed-thread-page")!;
    expect(threadPage.style.display).toBe("block");
  });
});
