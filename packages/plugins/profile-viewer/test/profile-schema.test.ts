// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getProfileSchema,
  handleProfileViewerAction
} from "../src/index.js";
import { OmniCardPrimitive, OmniTabsPrimitive } from "@omni/types";

describe("@omni/plugin-profile-viewer Declarative Schema & State Machine", () => {
  const mockProfile = {
    name: "Alice Satoshi",
    about: "Building decentralized protocols on Nostr.",
    picture: "https://example.com/alice.png",
    pubkey: "a".repeat(64),
    npub: "npub1alicesatoshi123",
    nip05: "alice@satoshi.com",
    lud16: "alice@getalby.com"
  };

  it("renders the My Profile tab schema with tabs, avatar, and npub code-block", () => {
    const schema = getProfileSchema("my-profile", mockProfile, {
      followsCount: 42
    }) as OmniCardPrimitive;

    expect(schema.type).toBe("card");
    expect(schema.title).toBe("Profiles & Key Custody");

    const tabsNode = schema.children?.find((c) => c.type === "tabs") as OmniTabsPrimitive;
    expect(tabsNode).toBeDefined();
    expect(tabsNode.activeTab).toBe("my-profile");
    expect(tabsNode.tabs.length).toBe(4);
    expect(tabsNode.tabs[0].id).toBe("my-profile");
    expect(tabsNode.tabs[3].badge).toBe(42);

    // Verify avatar in top box
    const topBox = schema.children?.find(
      (c) => c.type === "box" && (c as any).children?.some((child: any) => child.type === "avatar")
    ) as any;
    expect(topBox).toBeDefined();
    const avatar = topBox.children.find((child: any) => child.type === "avatar");
    expect(avatar.name).toBe("Alice Satoshi");
    expect(avatar.src).toBe("https://example.com/alice.png");

    // Verify code block
    const codeBlock = schema.children?.find((c) => c.type === "code-block") as any;
    expect(codeBlock).toBeDefined();
    expect(codeBlock.code).toBe("npub1alicesatoshi123");
  });

  it("renders the Edit Profile tab schema with Kind 0 input fields", () => {
    const schema = getProfileSchema("edit", mockProfile) as OmniCardPrimitive;

    const tabsNode = schema.children?.find((c) => c.type === "tabs") as OmniTabsPrimitive;
    expect(tabsNode.activeTab).toBe("edit");

    const banner = schema.children?.find((c) => c.type === "banner") as any;
    expect(banner).toBeDefined();
    expect(banner.title).toContain("Public Nostr Identity");

    const formBox = schema.children?.find(
      (c) => c.type === "box" && (c as any).children?.some((child: any) => child.name === "name")
    ) as any;
    expect(formBox).toBeDefined();

    const nameInput = formBox.children.find((c: any) => c.name === "name");
    expect(nameInput.value).toBe("Alice Satoshi");

    const saveBtn = formBox.children.find((c: any) => c.type === "button");
    expect(saveBtn.action.name).toBe("save-profile");
  });

  it("renders Key Custody & NIP-07 tab with status indicator and keypair generation", () => {
    const schema = getProfileSchema("keys", mockProfile) as OmniCardPrimitive;

    const tabsNode = schema.children?.find((c) => c.type === "tabs") as OmniTabsPrimitive;
    expect(tabsNode.activeTab).toBe("keys");

    const statusIndicator = schema.children?.find(
      (c) => c.type === "box" && (c as any).children?.some((child: any) => child.type === "status-indicator")
    ) as any;
    expect(statusIndicator).toBeDefined();

    const codeBlock = schema.children?.find((c) => c.type === "code-block") as any;
    expect(codeBlock.code).toBe("npub1alicesatoshi123");
  });

  it("renders Following tab with contact list", () => {
    const schema = getProfileSchema("following", mockProfile, {
      follows: [{ pubkey: "b".repeat(64), name: "Bob" }]
    }) as OmniCardPrimitive;

    const tabsNode = schema.children?.find((c) => c.type === "tabs") as OmniTabsPrimitive;
    expect(tabsNode.activeTab).toBe("following");

    const listNode = schema.children?.find((c) => c.type === "list") as any;
    expect(listNode).toBeDefined();
    expect(listNode.items.length).toBe(1);
    expect(listNode.items[0].title).toBe("Bob");
    expect(listNode.items[0].actions[0].action.name).toBe("unfollow");
  });

  it("renders compact widget and live tile metric schemas", () => {
    const widgetSchema = getProfileSchema("widget", mockProfile) as OmniCardPrimitive;
    expect(widgetSchema.type).toBe("card");
    expect(widgetSchema.title).toBe("Active Identity");

    const compactSchema = getProfileSchema("compact", mockProfile) as any;
    expect(compactSchema.type).toBe("metric");
    expect(compactSchema.value).toBe("Alice Satoshi");
  });

  it("handles switch-tab action", async () => {
    const next = (await handleProfileViewerAction(
      { name: "switch-tab" },
      { tab: "edit" }
    )) as OmniCardPrimitive;

    const tabsNode = next.children?.find((c) => c.type === "tabs") as OmniTabsPrimitive;
    expect(tabsNode.activeTab).toBe("edit");
  });

  it("handles view_profile intent action and switches to user profile", async () => {
    const friendPubkey = "f".repeat(64);
    const next = (await handleProfileViewerAction(
      { name: "view_profile" },
      { pubkey: friendPubkey }
    )) as OmniCardPrimitive;

    const tabsNode = next.children?.find((c) => c.type === "tabs") as OmniTabsPrimitive;
    expect(tabsNode.activeTab).toBe("user-profile");
    expect(tabsNode.tabs.some((t) => t.id === "user-profile")).toBe(true);

    const codeBlock = next.children?.find((c) => c.type === "code-block") as any;
    expect(codeBlock.code).toBe(friendPubkey);
  });

  it("handles follow and unfollow actions", async () => {
    const friendPubkey = "f".repeat(64);
    await handleProfileViewerAction({ name: "follow" }, { pubkey: friendPubkey });

    const followingSchema = (await handleProfileViewerAction(
      { name: "switch-tab" },
      { tab: "following" }
    )) as OmniCardPrimitive;

    const listNode = followingSchema.children?.find((c) => c.type === "list") as any;
    expect(listNode.items.some((i: any) => i.id === friendPubkey)).toBe(true);

    // Unfollow
    await handleProfileViewerAction({ name: "unfollow" }, { pubkey: friendPubkey });
    const afterUnfollow = (await handleProfileViewerAction(
      { name: "switch-tab" },
      { tab: "following" }
    )) as OmniCardPrimitive;
    const banner = afterUnfollow.children?.find(
      (c) => c.type === "banner" && (c as any).message?.includes("not following anyone")
    );
    expect(banner).toBeDefined();
  });
});
