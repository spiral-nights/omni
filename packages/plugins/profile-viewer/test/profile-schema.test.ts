// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getProfileSchema,
  handleProfileViewerAction
} from "../src/index.js";
import { OmniCardPrimitive, OmniTabsPrimitive } from "@omni/types";

describe("@omni/plugin-profile-viewer Declarative Schema & State Machine", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map<string, string>();
    const mockStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
      get length() { return store.size; },
      key: (i: number) => Array.from(store.keys())[i] || null
    };
    try {
      Object.defineProperty(window, "localStorage", {
        value: mockStorage,
        writable: true,
        configurable: true
      });
      Object.defineProperty(globalThis, "localStorage", {
        value: mockStorage,
        writable: true,
        configurable: true
      });
    } catch (_) {}
  });

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

  it("renders Following tab with contact list and clickable profiles", () => {
    const schema = getProfileSchema("following", mockProfile, {
      follows: [{ pubkey: "b".repeat(64), name: "Bob", about: "Bitcoin dev", picture: "https://example.com/bob.png" }]
    }) as OmniCardPrimitive;

    const tabsNode = schema.children?.find((c) => c.type === "tabs") as OmniTabsPrimitive;
    expect(tabsNode.activeTab).toBe("following");

    const listNode = schema.children?.find((c) => c.type === "list") as any;
    expect(listNode).toBeDefined();
    expect(listNode.items.length).toBe(1);
    expect(listNode.items[0].title).toBe("Bob");
    expect(listNode.items[0].subtitle).toBe("Bitcoin dev");
    expect(listNode.items[0].avatarUrl).toBe("https://example.com/bob.png");
    expect(listNode.items[0].onClickAction).toEqual({
      name: "view_profile",
      payload: { pubkey: "b".repeat(64) }
    });
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

  it("populates My Profile tab with user info and follows from omni:init and local cache", async () => {
    const userPubkey = "9".repeat(64);
    const mockFollowsTags = [
      ["p", "1".repeat(64)],
      ["p", "2".repeat(64)],
      ["p", "3".repeat(64)]
    ];
    const mockProfileCache: Record<string, any> = {};
    mockProfileCache[userPubkey] = {
      meta: {
        name: "Satoshi Nakamoto",
        display_name: "Satoshi Nakamoto",
        about: "Cypherpunk visionary",
        nip05: "satoshi@bitcoin.org",
        picture: "https://example.com/satoshi.png"
      },
      timestamp: Date.now()
    };

    localStorage.setItem(`omni_people_follows_${userPubkey}`, JSON.stringify(mockFollowsTags));
    localStorage.setItem("omni_profile_viewer_cache_v2", JSON.stringify(mockProfileCache));

    (window as any).nostr = {
      getPublicKey: vi.fn().mockResolvedValue(userPubkey),
      signEvent: vi.fn().mockImplementation(async (ev) => ({ ...ev, id: "sig_123" }))
    };

    // Simulate receiving omni:init with userPubkey
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "omni:init",
          payload: { userPubkey }
        }
      })
    );

    await new Promise((r) => setTimeout(r, 50));

    const schema = (await handleProfileViewerAction({ name: "switch-tab" }, { tab: "my-profile" })) as OmniCardPrimitive;
    expect(schema).toBeDefined();

    // Check tabs
    const tabsNode = schema.children?.find((c) => c.type === "tabs") as OmniTabsPrimitive;
    expect(tabsNode).toBeDefined();
    expect(tabsNode.activeTab).toBe("my-profile");
    // Badge on following tab should be 3
    const followingTab = tabsNode.tabs.find((t) => t.id === "following");
    expect(followingTab?.badge).toBe(3);

    // Check user info rendered
    const avatarBox = schema.children?.find(
      (c) => c.type === "box" && (c as any).children?.some((child: any) => child.type === "avatar")
    ) as any;
    expect(avatarBox).toBeDefined();
    const avatar = avatarBox.children.find((child: any) => child.type === "avatar");
    expect(avatar.name).toBe("Satoshi Nakamoto");

    const textBox = avatarBox.children.find((child: any) => child.type === "box");
    expect(textBox).toBeDefined();
    const titleText = textBox.children.find((child: any) => child.variant === "title");
    expect(titleText.content).toBe("Satoshi Nakamoto");
    const aboutText = textBox.children.find((child: any) => child.tone === "muted");
    expect(aboutText.content).toBe("Cypherpunk visionary");

    // Check Following metric
    const metricsBox = schema.children?.find(
      (c) => c.type === "box" && (c as any).children?.some((child: any) => child.type === "metric" && child.label === "Following")
    ) as any;
    expect(metricsBox).toBeDefined();
    const followingMetric = metricsBox.children.find((child: any) => child.label === "Following");
    expect(followingMetric.value).toBe(3);
  });

  it("renders Following list with cached profile metadata and navigates into user profile with Back navigation", async () => {
    const friendPubkey = "f".repeat(64);
    const mockProfileCache: Record<string, any> = {};
    mockProfileCache[friendPubkey] = {
      meta: {
        name: "Finney",
        display_name: "Hal Finney",
        about: "Running bitcoin on day 1",
        picture: "https://example.com/hal.png",
        nip05: "hal@finney.org"
      },
      timestamp: Date.now()
    };
    localStorage.setItem("omni_profile_viewer_cache_v2", JSON.stringify(mockProfileCache));

    // Follow the friend
    await handleProfileViewerAction({ name: "follow" }, { pubkey: friendPubkey });

    // Open following tab
    const followingSchema = (await handleProfileViewerAction(
      { name: "switch-tab" },
      { tab: "following" }
    )) as OmniCardPrimitive;

    const listNode = followingSchema.children?.find((c) => c.type === "list") as any;
    expect(listNode).toBeDefined();
    const friendItem = listNode.items.find((i: any) => i.id === friendPubkey);
    expect(friendItem).toBeDefined();
    expect(friendItem.title).toBe("Hal Finney");
    expect(friendItem.subtitle).toBe("Running bitcoin on day 1");
    expect(friendItem.avatarUrl).toBe("https://example.com/hal.png");
    expect(friendItem.onClickAction).toEqual({
      name: "view_profile",
      payload: { pubkey: friendPubkey }
    });

    // Click into user profile
    const profileViewSchema = (await handleProfileViewerAction(
      friendItem.onClickAction,
      friendItem.onClickAction.payload
    )) as OmniCardPrimitive;

    const tabsNode = profileViewSchema.children?.find((c) => c.type === "tabs") as OmniTabsPrimitive;
    expect(tabsNode.activeTab).toBe("user-profile");

    // Check Back button
    const backBtnBox = profileViewSchema.children?.find(
      (c) => c.type === "box" && (c as any).children?.some((child: any) => child.label?.includes("Back to Following"))
    ) as any;
    expect(backBtnBox).toBeDefined();
    const backBtn = backBtnBox.children.find((c: any) => c.label?.includes("Back to Following"));
    expect(backBtn.action).toEqual({
      name: "switch-tab",
      payload: { tab: "following" }
    });

    // Check target user's details
    const targetUserBox = profileViewSchema.children?.find(
      (c) =>
        c.type === "box" &&
        (c as any).children?.some(
          (child: any) =>
            child.type === "avatar" ||
            (child.type === "box" && child.children?.some((sub: any) => sub.type === "avatar"))
        )
    ) as any;
    expect(targetUserBox).toBeDefined();
    const avatar =
      targetUserBox.children?.find((child: any) => child.type === "avatar") ||
      targetUserBox.children?.find((child: any) => child.type === "box")?.children?.find((child: any) => child.type === "avatar");
    expect(avatar.name).toBe("Hal Finney");
    expect(avatar.src).toBe("https://example.com/hal.png");

    // Click Back to Following
    const backSchema = (await handleProfileViewerAction(
      backBtn.action,
      backBtn.action.payload
    )) as OmniCardPrimitive;
    const backTabsNode = backSchema.children?.find((c) => c.type === "tabs") as OmniTabsPrimitive;
    expect(backTabsNode.activeTab).toBe("following");
  });
});
