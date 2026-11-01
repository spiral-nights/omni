// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import omniRuntimeScript from "../../../core/src/sandbox/omni-runtime.js?raw";
import "fake-indexeddb/auto";
import { OmniKernel } from "@omni/core";
import { EditorialShell } from "../src/editorial-shell.js";
import { InstalledPluginEntry } from "../src/index.js";

describe("Unified Navigation & Back Button Integration", () => {
  let root: HTMLElement;
  let kernel: OmniKernel;
  let shell: EditorialShell;

  const mockPlugins: InstalledPluginEntry[] = [
    {
      id: "org.omni.plugin.feed",
      name: "Feed",
      displayName: "Feed",
      description: "Timeline notes.",
      icon: "feed",
      viewport: "main",
      pinned: true,
      enabled: true,
      manifest: {
        id: "org.omni.plugin.feed",
        name: "Feed",
        version: "1.0.0",
        entry: "dist/index.js",
        components: [{ id: "feed-main", type: "main", title: "Feed", slot: "main" }],
        views: [{ id: "main", title: "Feed", path: "" }]
      },
      scriptContent: "console.log('feed');",
      sourceUrl: "local:@omni/plugin-feed"
    },
    {
      id: "org.omni.plugin.profile-viewer",
      name: "Profiles",
      displayName: "Profiles",
      description: "People & profiles.",
      icon: "user",
      viewport: "main",
      pinned: true,
      enabled: true,
      manifest: {
        id: "org.omni.plugin.profile-viewer",
        name: "Profiles",
        version: "1.0.0",
        entry: "dist/index.js",
        components: [{ id: "pv-main", type: "main", title: "Profiles", slot: "main" }],
        views: [{ id: "main", title: "Profiles", path: "" }]
      },
      handledIntents: ["view_profile"],
      scriptContent: "console.log('profile-viewer');",
      sourceUrl: "local:@omni/plugin-profile-viewer"
    }
  ];

  beforeEach(() => {
    root = document.createElement("div");
    root.id = "omni-root";
    document.body.appendChild(root);

    kernel = new OmniKernel({ runtimeScript: omniRuntimeScript });
    shell = new EditorialShell({
      root,
      kernel,
      installedPlugins: [...mockPlugins]
    });
    shell.mount();
  });

  afterEach(() => {
    shell.destroy();
    root.remove();
  });

  it("updates header back button visibility when navigating between apps", async () => {
    const backBtn = root.querySelector("#btn-editorial-back") as HTMLElement;
    expect(backBtn).not.toBeNull();
    expect(backBtn.style.display).toBe("none");

    // Open Feed first
    await shell.openApp("org.omni.plugin.feed");
    expect(backBtn.style.display).toBe("none");

    // Open Profiles next
    await shell.openApp("org.omni.plugin.profile-viewer");
    expect(backBtn.style.display).toBe("inline-flex");

    // Clicking header back button navigates back to Feed
    shell.triggerBack();
    expect(shell.getActivePageId()).toBe("org.omni.plugin.feed");
    expect(backBtn.style.display).toBe("none");
  });

  it("delegates back action to active app when on a subroute", async () => {
    const backBtn = root.querySelector("#btn-editorial-back") as HTMLElement;
    await shell.openApp("org.omni.plugin.profile-viewer");

    // Simulate Profile Viewer navigating into a user profile (subroute)
    shell.handleHistoryPush("org.omni.plugin.profile-viewer", {
      state: { tab: "user-profile", pubkey: "target-user-pubkey" },
      title: "User Profile",
      url: "?tab=user-profile&pubkey=target-user-pubkey"
    });

    expect(backBtn.style.display).toBe("inline-flex");
    expect(kernel.navigation.canGoBack()).toBe(true);

    // Going back should stay in Profiles (subroute pop), NOT kick user out to Feed
    let popDispatchedToPlugin: any = null;
    (kernel as any).dispatchHistoryPopstate = (pluginId: string, payload: any) => {
      popDispatchedToPlugin = { pluginId, payload };
    };

    shell.triggerBack();

    expect(shell.getActivePageId()).toBe("org.omni.plugin.profile-viewer");
    expect(popDispatchedToPlugin).not.toBeNull();
    expect(popDispatchedToPlugin.pluginId).toBe("org.omni.plugin.profile-viewer");
  });

  it("navigates across apps via intent and steps backward cleanly", async () => {
    // Start on Profiles
    await shell.openApp("org.omni.plugin.profile-viewer");

    // Simulate clicking a note inside profile -> dispatches view_note intent
    // Feed handles view_note
    shell.installedPlugins[0].handledIntents = ["view_note"];
    (shell as any).registerHandledIntents();

    await kernel.intentBroker.dispatch("org.omni.plugin.profile-viewer", "view_note", {
      id: "note-12345",
      eventId: "note-12345"
    });

    // Shell should now have switched to Feed
    expect(shell.getActivePageId()).toBe("org.omni.plugin.feed");

    // Pressing Back should return to Profiles
    shell.triggerBack();
    expect(shell.getActivePageId()).toBe("org.omni.plugin.profile-viewer");
  });
});
