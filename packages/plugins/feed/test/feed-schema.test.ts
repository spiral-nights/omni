// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getFeedSchema,
  handleFeedAction,
  FeedSchemaState
} from "../src/index.js";
import { OmniBoxPrimitive, OmniCardPrimitive, OmniTextPrimitive } from "@omni/types";

describe("Feed Schema UI (Server-Driven Declarative Feed)", () => {
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
});
