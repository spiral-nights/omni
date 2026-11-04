// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getRelaysSchema,
  handleRelaysAction,
  syncRelaysFromHost,
  RelayInfo
} from "../src/index.js";
import { OmniCardPrimitive, OmniTabsPrimitive } from "@omni/types";

describe("@omni/plugin-relays Declarative Schema & State Machine", () => {
  beforeEach(() => {
    if (typeof localStorage !== "undefined" && typeof localStorage.clear === "function") {
      localStorage.clear();
    }
  });

  it("renders the Connected Relays tab schema with tabs and status indicator", () => {
    const schema = getRelaysSchema("relays", [
      { url: "wss://relay.damus.io", status: "online" },
      { url: "wss://nos.lol", status: "connecting" }
    ]) as OmniCardPrimitive;

    expect(schema.type).toBe("card");
    expect(schema.title).toBe("Relay Pool Manager");
    expect(schema.children).toBeDefined();

    // Verify tabs primitive
    const tabsNode = schema.children?.find((c) => c.type === "tabs") as OmniTabsPrimitive;
    expect(tabsNode).toBeDefined();
    expect(tabsNode.activeTab).toBe("relays");
    expect(tabsNode.tabs.length).toBe(2);
    expect(tabsNode.tabs[0].id).toBe("relays");
    expect(tabsNode.tabs[0].badge).toBe(2);
    expect(tabsNode.tabs[1].id).toBe("add");

    // Verify top pool overview box
    const overviewBox = schema.children?.[1];
    expect(overviewBox?.type).toBe("box");

    // Verify list of relays
    const listNode = schema.children?.find((c) => c.type === "list") as any;
    expect(listNode).toBeDefined();
    expect(listNode.items.length).toBe(2);
    expect(listNode.items[0].title).toBe("wss://relay.damus.io");
    expect(listNode.items[0].actions[0].action.name).toBe("remove-relay");
  });

  it("renders the Add & Presets tab with input and one-click community presets", () => {
    const schema = getRelaysSchema("add", []) as OmniCardPrimitive;

    const tabsNode = schema.children?.find((c) => c.type === "tabs") as OmniTabsPrimitive;
    expect(tabsNode.activeTab).toBe("add");

    // Verify banner
    const bannerNode = schema.children?.find((c) => c.type === "banner");
    expect(bannerNode).toBeDefined();

    // Verify input box
    const inputBox = schema.children?.find(
      (c) => c.type === "box" && (c as any).children?.some((child: any) => child.type === "input")
    ) as any;
    expect(inputBox).toBeDefined();
    const inputChild = inputBox.children.find((child: any) => child.type === "input");
    expect(inputChild.name).toBe("relayUrl");

    // Verify presets
    const presetsBox = schema.children?.find(
      (c) => c.type === "box" && (c as any).children?.some((child: any) => child.type === "box")
    ) as any;
    expect(presetsBox).toBeDefined();
  });

  it("handles switch-tab action", async () => {
    const nextSchema = (await handleRelaysAction(
      { name: "switch-tab" },
      { tab: "add" }
    )) as OmniCardPrimitive;

    const tabsNode = nextSchema.children?.find((c) => c.type === "tabs") as OmniTabsPrimitive;
    expect(tabsNode.activeTab).toBe("add");
  });

  it("handles add-relay and add-preset actions and normalizes URLs", async () => {
    // Add relay without wss:// prefix
    const nextSchema = (await handleRelaysAction(
      { name: "add-relay" },
      { relayUrl: "relay.primal.net/" }
    )) as OmniCardPrimitive;

    // Adds and switches to relays tab
    const tabsNode = nextSchema.children?.find((c) => c.type === "tabs") as OmniTabsPrimitive;
    expect(tabsNode.activeTab).toBe("relays");

    const listNode = nextSchema.children?.find((c) => c.type === "list") as any;
    expect(listNode.items.some((i: any) => i.title === "wss://relay.primal.net")).toBe(true);

    // Add preset
    const presetSchema = (await handleRelaysAction(
      { name: "add-preset" },
      { url: "wss://relay.nostr.band" }
    )) as OmniCardPrimitive;
    const presetList = presetSchema.children?.find((c) => c.type === "list") as any;
    expect(presetList.items.some((i: any) => i.title === "wss://relay.nostr.band")).toBe(true);
  });

  it("handles remove-relay action", async () => {
    const nextSchema = (await handleRelaysAction(
      { name: "remove-relay" },
      { url: "wss://nos.lol" }
    )) as OmniCardPrimitive;

    const listNode = nextSchema.children?.find((c) => c.type === "list") as any;
    expect(listNode.items.some((i: any) => i.title === "wss://nos.lol")).toBe(false);
  });

  it("syncs live relay pool from host omni.relays RPC api", async () => {
    (window as any).omni = {
      relays: {
        list: vi.fn(async () => [
          { url: "wss://relay.ditto.pub", status: "connected" },
          { url: "wss://custom.relay", status: "connecting" }
        ]),
        add: vi.fn(),
        remove: vi.fn()
      }
    };

    const synced = await syncRelaysFromHost();
    expect(synced.length).toBe(2);
    expect(synced[0].url).toBe("wss://relay.ditto.pub");
    expect(synced[0].status).toBe("online");
    expect(synced[1].url).toBe("wss://custom.relay");
    expect(synced[1].status).toBe("connecting");

    delete (window as any).omni;
  });
});
