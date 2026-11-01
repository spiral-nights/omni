// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getFeedSchema,
  handleFeedAction,
  FeedSchemaState,
  loadInlineImagesPreference,
  saveInlineImagesPreference,
  renderFilterSettings
} from "../src/index.js";
import { OmniBoxPrimitive, OmniCardPrimitive, OmniTextPrimitive } from "@omni/types";

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

describe("Feed Schema UI (Server-Driven Declarative Feed)", () => {
  beforeEach(() => {
    const memStorage = createMemoryStorage();
    (globalThis as any).localStorage = memStorage;
    if (typeof window !== "undefined") {
      (window as any).localStorage = memStorage;
    }
  });
  it("renders full-page feed schema with header, composer, and timeline stream", () => {
    const schema = getFeedSchema("main") as OmniBoxPrimitive;
    expect(schema).toBeDefined();
    expect(schema.type).toBe("box");
    expect(schema.direction).toBe("column");

    // Children: [Top timeline header, Composer card, ...Notes]
    expect(schema.children.length).toBeGreaterThanOrEqual(3);

    // Header box check
    const header = schema.children[0] as OmniBoxPrimitive;
    expect(header.type).toBe("box");
    const headerLeft = header.children[0] as OmniBoxPrimitive;
    const title = headerLeft.children[0] as OmniTextPrimitive;
    expect(title.content).toBe("Feed");

    // Composer card check
    const composer = schema.children[1] as OmniCardPrimitive;
    expect(composer.type).toBe("card");
    const composerBox = composer.children[0] as OmniBoxPrimitive;
    const textarea = composerBox.children.find((c) => c.type === "textarea");
    expect(textarea).toBeDefined();

    // Notes cards
    const noteCard = schema.children[2] as OmniCardPrimitive;
    expect(noteCard.type).toBe("card");
  });

  it("renders compact metric view for dock / compact placement", () => {
    const schema = getFeedSchema("compact") as any;
    expect(schema.type).toBe("metric");
    expect(schema.label).toBe("Timeline Notes");
    expect(schema.value).toContain("notes");
  });

  it("renders widget card view for widgets dashboard", () => {
    const schema = getFeedSchema("widget") as OmniCardPrimitive;
    expect(schema.type).toBe("card");
    expect(schema.title).toBe("Recent Notes");
    const list = schema.children.find((c) => c.type === "list") as any;
    expect(list).toBeDefined();
    expect(list.items.length).toBeGreaterThan(0);
  });

  it("handles publish-note action by prepending a new note to the feed", () => {
    const newNoteContent = "Testing pure Schema Feed publication";
    const nextSchema = handleFeedAction(
      { name: "publish-note" },
      { noteText: newNoteContent }
    ) as OmniBoxPrimitive;

    expect(nextSchema).toBeDefined();
    // The newly created note card should be child index 2 (after header and composer)
    const firstNoteCard = nextSchema.children[2] as OmniCardPrimitive;
    expect(firstNoteCard).toBeDefined();
    const contentNode = firstNoteCard.children.find(
      (c) => c.type === "text" && (c as OmniTextPrimitive).content === newNoteContent
    );
    expect(contentNode).toBeDefined();
  });

  it("handles like-note and repost-note reactions", () => {
    const current = getFeedSchema("main") as OmniBoxPrimitive;
    const firstNoteCard = current.children[2] as OmniCardPrimitive;
    const actionsBox = firstNoteCard.children.find(
      (c) =>
        c.type === "box" &&
        (c as OmniBoxPrimitive).children.some((btn: any) => btn.icon === "heart")
    ) as OmniBoxPrimitive;
    expect(actionsBox).toBeDefined();

    const likeButton = actionsBox.children.find(
      (c) => c.type === "button" && (c as any).icon === "heart"
    ) as any;
    expect(likeButton).toBeDefined();

    const noteId = likeButton.action.payload.id;
    const updatedSchema = handleFeedAction(
      { name: "like-note", payload: { id: noteId } },
      {}
    ) as OmniBoxPrimitive;

    const updatedNoteCard = updatedSchema.children[2] as OmniCardPrimitive;
    const updatedActionsBox = updatedNoteCard.children.find(
      (c) =>
        c.type === "box" &&
        (c as OmniBoxPrimitive).children.some((btn: any) => btn.icon === "heart")
    ) as OmniBoxPrimitive;
    const updatedLikeButton = updatedActionsBox.children.find(
      (c) => c.type === "button" && (c as any).icon === "heart"
    ) as any;

    expect(updatedLikeButton.variant).toBe("secondary");
  });

  it("handles set-tab action switching between Following and Global", () => {
    const nextSchema = handleFeedAction(
      { name: "set-tab", payload: { tab: "following" } },
      {}
    ) as OmniBoxPrimitive;

    const header = nextSchema.children[0] as OmniBoxPrimitive;
    const headerLeft = header.children[0] as OmniBoxPrimitive;
    const followingBtn = headerLeft.children.find(
      (c) => c.type === "button" && (c as any).label === "Following"
    ) as any;
    expect(followingBtn.variant).toBe("primary");
  });

  it("handles view-thread, reply, and close-thread navigation", () => {
    const current = getFeedSchema("main") as OmniBoxPrimitive;
    const firstNoteCard = current.children[2] as OmniCardPrimitive;
    const contentNode = firstNoteCard.children.find((c) => c.type === "text") as any;
    expect(contentNode.action.name).toBe("view-thread");
    const noteId = contentNode.action.payload.id;

    // Click into thread
    const threadSchema = handleFeedAction(
      { name: "view-thread", payload: { id: noteId } },
      {}
    ) as OmniBoxPrimitive;
    expect(threadSchema).toBeDefined();

    // Check Back to Feed button
    const topRow = threadSchema.children[0] as OmniBoxPrimitive;
    const backBtn = topRow.children.find((c: any) => c.label?.includes("Back to Feed")) as any;
    expect(backBtn).toBeDefined();
    expect(backBtn.action.name).toBe("close-thread");

    // Post a reply
    const afterReply = handleFeedAction(
      { name: "publish-reply", payload: { replyToId: noteId } },
      { replyText: "Great point on Nostr decentralization!" }
    ) as OmniBoxPrimitive;

    // Check that reply appears in replies section
    const replyCard = afterReply.children.find(
      (c) => c.type === "card" && (c as any).children?.some((child: any) => child.content === "Great point on Nostr decentralization!")
    );
    expect(replyCard).toBeDefined();

    // Close thread
    const closedSchema = handleFeedAction({ name: "close-thread" }, {}) as OmniBoxPrimitive;
    const feedHeader = closedSchema.children[0] as OmniBoxPrimitive;
    const feedTitle = (feedHeader.children[0] as OmniBoxPrimitive).children[0] as OmniTextPrimitive;
    expect(feedTitle.content).toBe("Feed");
  });

  it("accurately displays non-zero reply counts and lists replies when re-entering a thread", () => {
    // Current feed schema
    const feed = getFeedSchema("main") as OmniBoxPrimitive;
    const noteCard = feed.children[2] as OmniCardPrimitive;
    const contentNode = noteCard.children.find((c) => c.type === "text") as any;
    const noteId = contentNode.action.payload.id;

    // The note we previously replied to should now display a reply count of at least 1
    const actionsBox = noteCard.children.find(
      (c) =>
        c.type === "box" &&
        (c as OmniBoxPrimitive).children.some((btn: any) => btn.icon === "reply")
    ) as OmniBoxPrimitive;
    const replyBtn = actionsBox.children.find(
      (c) => c.type === "button" && (c as any).icon === "reply"
    ) as any;
    expect(Number(replyBtn.label)).toBeGreaterThanOrEqual(1);

    // Opening the thread again should show the replies count header and card
    const threadSchema = handleFeedAction(
      { name: "view-thread", payload: { id: noteId } },
      {}
    ) as OmniBoxPrimitive;

    const repliesTitle = threadSchema.children.find(
      (c) => c.type === "box" && (c as any).children?.some((child: any) => child.content?.startsWith("Replies ("))
    );
    expect(repliesTitle).toBeDefined();

    // The reply card posted earlier is displayed
    const replyCard = threadSchema.children.find(
      (c) => c.type === "card" && (c as any).children?.some((child: any) => child.content === "Great point on Nostr decentralization!")
    );
    expect(replyCard).toBeDefined();
  });

  it("controls inline image previews vs clickable callout links via settings", () => {
    const testState: FeedSchemaState = {
      activeTab: "global",
      composerText: "",
      notes: [
        {
          id: "test_img_note",
          pubkey: "pk123",
          authorName: "Alice",
          npub: "npub123",
          content: "Here is an image: https://blossom.ditto.pub/img1.png",
          created_at: Date.now(),
          likes: 0,
          reposts: 0,
          replies: 0,
          zaps: 0
        }
      ]
    };

    // 1. Defaults to false (links only)
    localStorage.removeItem("omni_feed_inline_images");
    expect(loadInlineImagesPreference()).toBe(false);

    const schemaDefault = getFeedSchema("main", testState) as OmniBoxPrimitive;
    const noteCard = schemaDefault.children[2] as OmniCardPrimitive;
    const textNode = noteCard.children.find((c) => c.type === "text") as any;
    expect(textNode.showInlineImages).toBe(false);

    // 2. Can toggle preference to true
    saveInlineImagesPreference(true);
    expect(loadInlineImagesPreference()).toBe(true);
    const schemaEnabled = getFeedSchema("main", testState) as OmniBoxPrimitive;
    const noteCardEnabled = schemaEnabled.children[2] as OmniCardPrimitive;
    const textNodeEnabled = noteCardEnabled.children.find((c) => c.type === "text") as any;
    expect(textNodeEnabled.showInlineImages).toBe(true);

    // 3. Reset back to false
    saveInlineImagesPreference(false);
    expect(loadInlineImagesPreference()).toBe(false);

    // 4. Verify settings UI renders the toggle
    const container = document.createElement("div");
    renderFilterSettings(container);
    const toggle = container.querySelector<HTMLInputElement>(".feed-toggle-inline-images");
    expect(toggle).toBeDefined();
    expect(toggle?.checked).toBe(false);
  });
});
