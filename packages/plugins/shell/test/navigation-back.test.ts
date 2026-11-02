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

  it("Scenario 1: In feed, viewing note thread then clicking back returns to feed timeline", async () => {
    // Start at feed
    await shell.openApp("org.omni.plugin.feed");
    expect(shell.getActivePageId()).toBe("org.omni.plugin.feed");

    // Feed pushes a note thread subroute
    shell.handleHistoryPush("org.omni.plugin.feed", {
      state: { view: "thread", id: "note_abc123" },
      title: "Note Conversation",
      url: "?note=note_abc123"
    });

    expect(kernel.navigation.canGoBack()).toBe(true);

    let popPayload: any = null;
    (kernel as any).dispatchHistoryPopstate = (pluginId: string, payload: any) => {
      popPayload = { pluginId, payload };
    };

    // User triggers back
    shell.triggerBack();

    // Still in feed, but subroute popped back to root timeline (state is null)
    expect(shell.getActivePageId()).toBe("org.omni.plugin.feed");
    expect(popPayload).not.toBeNull();
    expect(popPayload.pluginId).toBe("org.omni.plugin.feed");
    expect(popPayload.payload.state).toBeNull();
    expect(kernel.navigation.canGoBack()).toBe(false);
  });

  it("Scenario 2: In feed, going to All Apps page then clicking back returns to feed", async () => {
    // Start at feed
    await shell.openApp("org.omni.plugin.feed");
    expect(shell.getActivePageId()).toBe("org.omni.plugin.feed");

    // Go to All Apps index
    shell.showAppsIndex(true);
    expect(shell.getActivePageId()).toBe("apps");
    expect(kernel.navigation.canGoBack()).toBe(true);

    // Browser back
    shell.triggerBack();

    // Should return to Feed
    expect(shell.getActivePageId()).toBe("org.omni.plugin.feed");
    expect(kernel.navigation.canGoBack()).toBe(false);
  });

  it("Scenario 3: Feed -> All Apps -> Another plugin -> Back returns to All Apps -> Back returns to Feed", async () => {
    // Start at feed
    await shell.openApp("org.omni.plugin.feed");
    expect(shell.getActivePageId()).toBe("org.omni.plugin.feed");

    // Go to All Apps
    shell.showAppsIndex(true);
    expect(shell.getActivePageId()).toBe("apps");

    // Open another plugin (Profiles) from Apps
    await shell.openApp("org.omni.plugin.profile-viewer");
    expect(shell.getActivePageId()).toBe("org.omni.plugin.profile-viewer");

    // First back should return to Apps
    shell.triggerBack();
    expect(shell.getActivePageId()).toBe("apps");

    // Second back should return to Feed
    shell.triggerBack();
    expect(shell.getActivePageId()).toBe("org.omni.plugin.feed");
    expect(kernel.navigation.canGoBack()).toBe(false);
  });

  it("Scenario 4: Profile plugin -> View Note in Feed -> Back returns to Profile plugin", async () => {
    // Start in Profile Viewer
    await shell.openApp("org.omni.plugin.profile-viewer");
    expect(shell.getActivePageId()).toBe("org.omni.plugin.profile-viewer");

    // User is viewing a profile in Profiles (subroute)
    shell.handleHistoryPush("org.omni.plugin.profile-viewer", {
      state: { tab: "user-profile", pubkey: "alice_pubkey" },
      title: "Alice",
      url: "?view=user-profile&pubkey=alice_pubkey"
    });

    // User clicks a note -> dispatches view_note intent
    shell.installedPlugins[0].handledIntents = ["view_note"];
    (shell as any).registerHandledIntents();

    await kernel.intentBroker.dispatch("org.omni.plugin.profile-viewer", "view_note", {
      id: "alice_note_999",
      eventId: "alice_note_999"
    });

    // Feed replaces state with thread view (simulating isFromIntent: true replaceState)
    shell.handleHistoryReplace("org.omni.plugin.feed", {
      state: { view: "thread", id: "alice_note_999" },
      title: "Thread",
      url: "?note=alice_note_999"
    });

    expect(shell.getActivePageId()).toBe("org.omni.plugin.feed");

    // Trigger back: should return straight to Profiles on the user-profile subroute
    let restoredState: any = null;
    (kernel as any).dispatchHistoryPopstate = (pluginId: string, payload: any) => {
      restoredState = { pluginId, payload };
    };

    shell.triggerBack();

    expect(shell.getActivePageId()).toBe("org.omni.plugin.profile-viewer");
    expect(restoredState).not.toBeNull();
    expect(restoredState.pluginId).toBe("org.omni.plugin.profile-viewer");
    expect(restoredState.payload.state).toEqual({ tab: "user-profile", pubkey: "alice_pubkey" });
  });

  it("preserves active app sandboxes across openApp switches and steps back from User Profile to Following without jumping to Feed", async () => {
    // 1. Start in Feed
    await shell.openApp("org.omni.plugin.feed");
    expect(shell.getActivePageId()).toBe("org.omni.plugin.feed");
    const stackAfterFeed = kernel.navigation.getStack().length;

    // 2. Navigate to Profiles
    await shell.openApp("org.omni.plugin.profile-viewer");
    expect(shell.getActivePageId()).toBe("org.omni.plugin.profile-viewer");
    expect(kernel.navigation.getStack().length).toBe(stackAfterFeed + 1);

    // 3. Switch to Following tab in Profiles
    shell.handleHistoryPush("org.omni.plugin.profile-viewer", {
      state: { tab: "following" },
      title: "Following",
      url: "?tab=following"
    });
    expect(kernel.navigation.getStack().length).toBe(stackAfterFeed + 2);

    // 4. Click into a User Profile in Profiles
    shell.handleHistoryPush("org.omni.plugin.profile-viewer", {
      state: { type: "omni-people-view", tab: "user-profile", pubkey: "bob_pk", from: "following" },
      title: "Bob",
      url: "?view=user-profile&pubkey=bob_pk"
    });
    expect(kernel.navigation.getStack().length).toBe(stackAfterFeed + 3);

    const poppedStates: any[] = [];
    (kernel as any).dispatchHistoryPopstate = (pluginId: string, payload: any) => {
      poppedStates.push({ pluginId, payload });
    };

    // 5. First Back: from User Profile -> Following (still inside Profiles!)
    shell.triggerBack();
    expect(shell.getActivePageId()).toBe("org.omni.plugin.profile-viewer");
    expect(poppedStates.length).toBe(1);
    expect(poppedStates[0].pluginId).toBe("org.omni.plugin.profile-viewer");
    expect(poppedStates[0].payload.state).toEqual({ tab: "following" });

    // 6. Second Back: from Following -> Profiles root ("my-profile", state: null)
    shell.triggerBack();
    expect(shell.getActivePageId()).toBe("org.omni.plugin.profile-viewer");
    expect(poppedStates.length).toBe(2);
    expect(poppedStates[1].pluginId).toBe("org.omni.plugin.profile-viewer");
    expect(poppedStates[1].payload.state).toBeNull();

    // 7. Third Back: from Profiles root -> Feed
    shell.triggerBack();
    expect(shell.getActivePageId()).toBe("org.omni.plugin.feed");
  });
});
