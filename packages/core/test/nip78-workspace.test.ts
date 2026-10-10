// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { OmniKernel } from "../src/index.js";
import { OMNI_WORKSPACE_D_TAG, OmniWorkspaceState } from "@omni/types";

describe("NIP-78 Arbitrary App Data & Workspace Sync", () => {
  let kernel: OmniKernel;

  beforeEach(async () => {
    kernel = new OmniKernel({
      bootstrapRelays: []
    });
    await kernel.boot();
  });

  it("publishes arbitrary app data as kind 30078 with 'd' identifier tag", async () => {
    const appData = { theme: "warm-paper", zoom: 1.2 };
    const event = await kernel.publishAppData("app/preferences", appData);

    expect(event.kind).toBe(30078);
    expect(event.pubkey).toBe(await kernel.getUserPubkey());
    expect(event.tags).toContainEqual(["d", "app/preferences"]);
    expect(JSON.parse(event.content)).toEqual(appData);

    // Retrieve from local 0ms store
    const retrieved = await kernel.getAppData("app/preferences");
    expect(retrieved).not.toBeNull();
    expect(retrieved?.data).toEqual(appData);
    expect(retrieved?.event.id).toBe(event.id);
  });

  it("publishes and restores OmniWorkspaceState via NIP-78", async () => {
    const mockWorkspace: OmniWorkspaceState = {
      version: 1,
      updatedAt: Date.now(),
      activePage: "org.omni.plugin.timer",
      autoSync: true,
      plugins: [
        {
          id: "org.omni.plugin.feed",
          viewport: "dock",
          enabled: true
        },
        {
          id: "org.omni.plugin.timer",
          viewport: "main",
          enabled: true
        }
      ]
    };

    const event = await kernel.publishWorkspaceState(mockWorkspace);
    expect(event.kind).toBe(30078);
    expect(event.tags).toContainEqual(["d", OMNI_WORKSPACE_D_TAG]);

    const retrieved = await kernel.getWorkspaceState();
    expect(retrieved).not.toBeNull();
    expect(retrieved?.state.activePage).toBe("org.omni.plugin.timer");
    expect(retrieved?.state.plugins).toHaveLength(2);
    expect(retrieved?.state.plugins[0].viewport).toBe("dock");
    expect(retrieved?.state.plugins[1].viewport).toBe("main");
  });

  it("returns null when no app data event exists for identifier", async () => {
    const missing = await kernel.getAppData("nonexistent/identifier");
    expect(missing).toBeNull();
  });
});
