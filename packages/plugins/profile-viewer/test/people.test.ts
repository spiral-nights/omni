// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const peopleCode = readFileSync(
  join(__dirname, "../dist/index.js"),
  "utf8"
)
  .replace(/^export\s*\{[^}]*\}\s*;?/gm, "")
  .replace(/^export\s+/gm, "");

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

describe("People plugin (profile, follows, mutes)", () => {
  let document: Document;
  const myPubkey = "1".repeat(64);
  const friendPubkey = "2".repeat(64);
  const trollPubkey = "3".repeat(64);

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
      getPublicKey: vi.fn(async () => myPubkey),
      signEvent: vi.fn(async (ev: any) => ({
        ...ev,
        id: `signed-${ev.kind}`,
        pubkey: myPubkey,
        sig: "sig"
      }))
    };
    (window as any).omni = {
      intents: { handle: vi.fn(), dispatch: vi.fn(async () => ({ handled: true })) }
    };
    (window as any).location.search = "";
    (window as any).location.hash = "";
    new Function(peopleCode)();
  });

  const peopleRoot = () => document.body.querySelector<HTMLElement>(".profile-viewer-container")!;

  it("renders People tabs and switches views", async () => {
    await flush();
    const btnProfile = peopleRoot().querySelector<HTMLButtonElement>(".btn-tab-profile")!;
    const btnFollowing = peopleRoot().querySelector<HTMLButtonElement>(".btn-tab-following")!;
    const btnBlocked = peopleRoot().querySelector<HTMLButtonElement>(".btn-tab-blocked")!;

    expect(btnProfile.classList.contains("active")).toBe(true);
    expect(peopleRoot().querySelector<HTMLElement>(".pv-tab-profile")!.style.display).not.toBe("none");

    btnFollowing.click();
    expect(btnFollowing.classList.contains("active")).toBe(true);
    expect(peopleRoot().querySelector<HTMLElement>(".pv-tab-following")!.style.display).not.toBe("none");
    expect(peopleRoot().querySelector<HTMLElement>(".pv-tab-profile")!.style.display).toBe("none");

    btnBlocked.click();
    expect(btnBlocked.classList.contains("active")).toBe(true);
    expect(peopleRoot().querySelector<HTMLElement>(".pv-tab-blocked")!.style.display).not.toBe("none");
    expect(peopleRoot().querySelector<HTMLElement>(".pv-tab-following")!.style.display).toBe("none");
  });

  it("loads user's Kind 3 contacts and renders Following list with 1-click unfollow", async () => {
    await flush();
    const ws = FakeWebSocket.instances[0];

    // Deliver Kind 3 contact list
    ws.deliver(["EVENT", "pv_my_contacts", {
      id: "contacts-1",
      pubkey: myPubkey,
      kind: 3,
      created_at: 1700000000,
      tags: [["p", friendPubkey]],
      content: ""
    }]);

    // Check count in tab button
    const countFollowing = peopleRoot().querySelector<HTMLElement>(".count-following")!;
    expect(countFollowing.textContent).toBe("1");

    // Switch to Following tab
    peopleRoot().querySelector<HTMLButtonElement>(".btn-tab-following")!.click();
    await flush();

    const userCards = peopleRoot().querySelectorAll(".people-user-card");
    expect(userCards.length).toBe(1);
    expect(userCards[0].getAttribute("data-pubkey")).toBe(friendPubkey);

    // Click Unfollow
    const unfollowBtn = userCards[0].querySelector<HTMLButtonElement>(".btn-unfollow-row")!;
    unfollowBtn.click();
    await flush();

    // Verify Kind 3 was signed and published
    const signEventSpy = (window as any).nostr.signEvent;
    expect(signEventSpy).toHaveBeenCalled();
    const lastCall = signEventSpy.mock.calls[signEventSpy.mock.calls.length - 1][0];
    expect(lastCall.kind).toBe(3);
    expect(lastCall.tags.some((t: string[]) => t[1] === friendPubkey)).toBe(false);

    expect(countFollowing.textContent).toBe("0");
  });

  it("loads user's Kind 10000 mute list and renders Blocked list with 1-click unblock", async () => {
    await flush();
    const ws = FakeWebSocket.instances[0];

    // Deliver Kind 10000 mute list
    ws.deliver(["EVENT", "pv_my_mutes", {
      id: "mutes-1",
      pubkey: myPubkey,
      kind: 10000,
      created_at: 1700000000,
      tags: [["p", trollPubkey]],
      content: ""
    }]);

    const countBlocked = peopleRoot().querySelector<HTMLElement>(".count-blocked")!;
    expect(countBlocked.textContent).toBe("1");

    // Switch to Blocked tab
    peopleRoot().querySelector<HTMLButtonElement>(".btn-tab-blocked")!.click();
    await flush();

    const userCards = peopleRoot().querySelectorAll(".people-user-card");
    expect(userCards.length).toBe(1);
    expect(userCards[0].getAttribute("data-pubkey")).toBe(trollPubkey);

    // Click Unblock
    const unblockBtn = userCards[0].querySelector<HTMLButtonElement>(".btn-unblock-row")!;
    unblockBtn.click();
    await flush();

    const signEventSpy = (window as any).nostr.signEvent;
    expect(signEventSpy).toHaveBeenCalled();
    const lastCall = signEventSpy.mock.calls[signEventSpy.mock.calls.length - 1][0];
    expect(lastCall.kind).toBe(10000);
    expect(lastCall.tags.some((t: string[]) => t[1] === trollPubkey)).toBe(false);

    expect(countBlocked.textContent).toBe("0");
  });

  it("inspecting another user displays Follow and Block buttons", async () => {
    await flush();
    const ws = FakeWebSocket.instances[0];

    // Search/Lookup friendPubkey
    const searchInput = peopleRoot().querySelector<HTMLInputElement>(".pv-search-input")!;
    const searchBtn = peopleRoot().querySelector<HTMLButtonElement>(".pv-search-btn")!;
    searchInput.value = friendPubkey;
    searchBtn.click();

    await flush();

    const btnFollow = peopleRoot().querySelector<HTMLButtonElement>(".pv-btn-follow")!;
    const btnBlock = peopleRoot().querySelector<HTMLButtonElement>(".pv-btn-block")!;

    expect(btnFollow.style.display).not.toBe("none");
    expect(btnBlock.style.display).not.toBe("none");
    expect(btnFollow.textContent).toBe("Follow");

    // Click Follow on profile
    btnFollow.click();
    await flush();

    expect(btnFollow.textContent).toBe("Following");
    expect(btnFollow.classList.contains("is-following")).toBe(true);

    // Click Block on profile
    btnBlock.click();
    await flush();

    expect(btnBlock.textContent).toBe("Blocked");
    expect(btnBlock.classList.contains("is-blocked")).toBe(true);
  });

  it("responds to view_profile intent by loading profile and switching to Profile tab", async () => {
    await flush();
    const intentHandler = (window as any).omni.intents.handle.mock.calls.find(
      (c: any[]) => c[0] === "view_profile"
    )?.[1];
    expect(intentHandler).toBeDefined();

    // Switch to Blocked tab first
    peopleRoot().querySelector<HTMLButtonElement>(".btn-tab-blocked")!.click();

    // Dispatch intent
    intentHandler({ pubkey: friendPubkey });
    await flush();

    // Verify it switched back to Profile tab and loaded friendPubkey
    const btnProfile = peopleRoot().querySelector<HTMLButtonElement>(".btn-tab-profile")!;
    expect(btnProfile.classList.contains("active")).toBe(true);
    expect(peopleRoot().querySelector<HTMLElement>(".pv-tab-profile")!.style.display).not.toBe("none");
    expect(peopleRoot().querySelector<HTMLElement>(".pv-npub-text")!.textContent).toBeDefined();
  });

  it("toggles npub lookup bar visibility on demand", async () => {
    await flush();
    const searchBar = peopleRoot().querySelector<HTMLElement>(".pv-search-bar")!;
    const btnToggleLookup = peopleRoot().querySelector<HTMLButtonElement>(".btn-toggle-lookup")!;

    expect(searchBar.style.display).toBe("none");

    btnToggleLookup.click();
    expect(searchBar.style.display).toBe("flex");

    btnToggleLookup.click();
    expect(searchBar.style.display).toBe("none");
  });

  it("navigating to profile from following list shows Back button which returns to Following list", async () => {
    await flush();
    const ws = FakeWebSocket.instances[0];

    // Deliver Kind 3 contact list
    ws.deliver(["EVENT", "pv_my_contacts", {
      id: "contacts-nav",
      pubkey: myPubkey,
      kind: 3,
      created_at: 1700000000,
      tags: [["p", friendPubkey]],
      content: ""
    }]);

    peopleRoot().querySelector<HTMLButtonElement>(".btn-tab-following")!.click();
    await flush();

    const userCard = peopleRoot().querySelector<HTMLElement>(".people-user-card")!;
    expect(userCard).toBeDefined();

    // Click user avatar to view profile
    userCard.querySelector<HTMLElement>(".people-avatar")!.click();
    await flush();

    // Verify switched to Profile tab
    expect(peopleRoot().querySelector<HTMLElement>(".pv-tab-profile")!.style.display).not.toBe("none");
    const btnBack = peopleRoot().querySelector<HTMLButtonElement>(".btn-profile-back")!;
    expect(btnBack.style.display).not.toBe("none");
    expect(btnBack.textContent).toContain("Back to Following");

    // Click Back
    btnBack.click();
    await flush();

    // Should return to Following tab
    expect(peopleRoot().querySelector<HTMLElement>(".pv-tab-following")!.style.display).not.toBe("none");
    expect(peopleRoot().querySelector<HTMLElement>(".pv-tab-profile")!.style.display).toBe("none");
  });

  it("filters followed accounts by query string", async () => {
    await flush();
    const ws = FakeWebSocket.instances[0];

    // Deliver Kind 3 with 2 friends
    ws.deliver(["EVENT", "pv_my_contacts", {
      id: "contacts-filter",
      pubkey: myPubkey,
      kind: 3,
      created_at: 1700000000,
      tags: [["p", friendPubkey], ["p", trollPubkey]],
      content: ""
    }]);

    peopleRoot().querySelector<HTMLButtonElement>(".btn-tab-following")!.click();
    await flush();

    let cards = peopleRoot().querySelectorAll(".people-user-card");
    expect(cards.length).toBe(2);

    const filterInput = peopleRoot().querySelector<HTMLInputElement>(".following-filter-input")!;
    filterInput.value = friendPubkey;
    filterInput.dispatchEvent(new Event("input"));
    await flush();

    cards = peopleRoot().querySelectorAll(".people-user-card");
    expect(cards.length).toBe(1);
    expect(cards[0].getAttribute("data-pubkey")).toBe(friendPubkey);
  });

  it("renders timeline notes without 'Kind 1' badge and clicking a note card dispatches view_note intent", async () => {
    await flush();
    const ws = FakeWebSocket.instances[0];
    const notesReq = ws.sent.find((m: any[]) => m[0] === "REQ" && String(m[1]).startsWith("pv_notes_"));
    const subId = notesReq ? notesReq[1] : undefined;

    // Deliver note for active profile
    ws.deliver(["EVENT", subId, {
      id: "note-123456",
      pubkey: myPubkey,
      kind: 1,
      created_at: 1700000000,
      tags: [],
      content: "Hello from Nostr! Check nostr:nevent1qqs8xyzqpzry9x8gf2tvdw0s3jn54khce6mua7l"
    }]);
    await flush();

    const noteCard = peopleRoot().querySelector<HTMLElement>(".pv-note-card");
    expect(noteCard).toBeTruthy();

    // Verify "kind: 1" badge is omitted
    expect(noteCard?.textContent).not.toContain("kind: 1");

    // Verify NIP-21 entity is linkified / badge-styled
    const entity = noteCard?.querySelector(".pv-nostr-entity");
    expect(entity).toBeTruthy();

    // Click note card
    noteCard?.click();
    await flush();

    // Verify view_note intent was dispatched
    expect((window as any).omni.intents.dispatch).toHaveBeenCalledWith("view_note", {
      eventId: "note-123456",
      id: "note-123456"
    });
    expect(localStorage.getItem("omni_active_note_id")).toBe("note-123456");
  });

  it("renders 'Profiles' app title in header", async () => {
    await flush();
    const title = peopleRoot().querySelector<HTMLElement>(".people-header h2");
    expect(title?.textContent).toBe("Profiles");
  });

  it("viewing own profile shows 'Edit Profile' and 'Keys' buttons and allows publishing kind 0 metadata", async () => {
    await flush();
    const btnEdit = peopleRoot().querySelector<HTMLButtonElement>(".pv-btn-edit-profile")!;
    const btnKeys = peopleRoot().querySelector<HTMLButtonElement>(".pv-btn-keys")!;
    const btnFollow = peopleRoot().querySelector<HTMLButtonElement>(".pv-btn-follow")!;
    const btnBlock = peopleRoot().querySelector<HTMLButtonElement>(".pv-btn-block")!;
    const editPanel = peopleRoot().querySelector<HTMLElement>(".pv-edit-panel")!;

    // On own profile, Follow/Block are hidden, Edit & Keys are visible
    expect(btnEdit.style.display).not.toBe("none");
    expect(btnKeys.style.display).not.toBe("none");
    expect(btnFollow.style.display).toBe("none");
    expect(btnBlock.style.display).toBe("none");
    expect(editPanel.style.display).toBe("none");

    // Click Edit Profile
    btnEdit.click();
    expect(editPanel.style.display).toBe("flex");
    const paneProfile = editPanel.querySelector<HTMLElement>(".pane-profile")!;
    expect(paneProfile.style.display).not.toBe("none");

    // Fill form fields
    const nameInput = editPanel.querySelector<HTMLInputElement>("#prof-display-name")!;
    const handleInput = editPanel.querySelector<HTMLInputElement>("#prof-name")!;
    const aboutInput = editPanel.querySelector<HTMLTextAreaElement>("#prof-about")!;
    const btnSave = editPanel.querySelector<HTMLButtonElement>("#btn-save-profile")!;

    nameInput.value = "Alice in Nostrland";
    handleInput.value = "alice";
    aboutInput.value = "Building decentralized apps on Omni";

    // Click Save & Publish
    btnSave.click();
    await flush();

    // Verify kind 0 signed and published
    const signEventSpy = (window as any).nostr.signEvent;
    expect(signEventSpy).toHaveBeenCalled();
    const calls = signEventSpy.mock.calls;
    const kind0Call = calls.find((c: any[]) => c[0].kind === 0)?.[0];
    expect(kind0Call).toBeDefined();
    const parsedMeta = JSON.parse(kind0Call.content);
    expect(parsedMeta.display_name).toBe("Alice in Nostrland");
    expect(parsedMeta.name).toBe("alice");
    expect(parsedMeta.about).toBe("Building decentralized apps on Omni");

    // Verify profile card in UI immediately updated
    const displayNameEl = peopleRoot().querySelector<HTMLElement>(".pv-display-name")!;
    expect(displayNameEl.textContent).toBe("Alice in Nostrland");
  });

  it("keys & custody tab displays npub/hex and allows revealing private key with warning", async () => {
    await flush();
    const btnKeys = peopleRoot().querySelector<HTMLButtonElement>(".pv-btn-keys")!;
    const editPanel = peopleRoot().querySelector<HTMLElement>(".pv-edit-panel")!;

    btnKeys.click();
    expect(editPanel.style.display).toBe("flex");

    const paneKeys = editPanel.querySelector<HTMLElement>(".pane-keys")!;
    expect(paneKeys.style.display).not.toBe("none");

    // Check npub and hex pubkey fields
    const keyNpub = editPanel.querySelector<HTMLInputElement>("#key-npub")!;
    const keyHex = editPanel.querySelector<HTMLInputElement>("#key-hex")!;
    expect(keyHex.value).toBe(myPubkey);
    expect(keyNpub.value).toContain("npub1");

    // Reveal private key flow
    (window as any).omni.auth = {
      getNsec: vi.fn(async () => "nsec1testsecretkey123456789"),
      switchKey: vi.fn(async () => ({ pubkey: "9".repeat(64), npub: "npub1switched" }))
    };

    const btnReveal = editPanel.querySelector<HTMLButtonElement>("#btn-reveal-nsec")!;
    const confirmBox = editPanel.querySelector<HTMLElement>("#box-nsec-confirm")!;
    const btnConfirmReveal = editPanel.querySelector<HTMLButtonElement>("#btn-confirm-reveal")!;
    const nsecBox = editPanel.querySelector<HTMLElement>("#box-nsec")!;
    const keyNsec = editPanel.querySelector<HTMLInputElement>("#key-nsec")!;

    expect(confirmBox.style.display).toBe("none");
    btnReveal.click();
    expect(confirmBox.style.display).toBe("flex");

    btnConfirmReveal.click();
    await flush();

    expect(confirmBox.style.display).toBe("none");
    expect(nsecBox.style.display).toBe("flex");
    expect(keyNsec.value).toBe("nsec1testsecretkey123456789");
  });

  it("responds to edit_profile intent by opening the edit drawer", async () => {
    await flush();
    const editHandler = (window as any).omni.intents.handle.mock.calls.find(
      (c: any[]) => c[0] === "edit_profile"
    )?.[1];
    expect(editHandler).toBeDefined();

    const editPanel = peopleRoot().querySelector<HTMLElement>(".pv-edit-panel")!;
    expect(editPanel.style.display).toBe("none");

    // Dispatch edit_profile intent
    editHandler({ pubkey: myPubkey });
    await flush();

    expect(editPanel.style.display).toBe("flex");
    const paneProfile = editPanel.querySelector<HTMLElement>(".pane-profile")!;
    expect(paneProfile.style.display).not.toBe("none");
  });
});
