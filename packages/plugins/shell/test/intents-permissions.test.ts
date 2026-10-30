// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import omniRuntimeScript from "../../../core/src/sandbox/omni-runtime.js?raw";
import "fake-indexeddb/auto";
import { OmniKernel } from "@omni/core";
import { OmniShell } from "../src/shell.js";
import { PanoramaShell } from "../src/panorama-shell.js";
import { InstalledPluginEntry } from "../src/index.js";
import {
  renderNostrWritePermissionsSection,
  renderHandledIntentsSection,
  showIntentEnableToast,
  INTENT_FRIENDLY_NAMES
} from "../src/permissions-intents-ui.js";

describe("Granular Kind-Level Nostr Permissions & Multi-Handler Intent System", () => {
  let root: HTMLElement;
  let kernel: OmniKernel;

  const mockPlugins: InstalledPluginEntry[] = [
    {
      id: "org.omni.plugin.feed",
      name: "Feed",
      version: "1.0.0",
      description: "Timeline feed and composer",
      handledIntents: ["create_note", "view_note", "share"],
      scriptContent: "console.log('feed');",
      sourceUrl: "local:@omni/plugin-feed",
      enabled: true,
      viewport: "main"
    },
    {
      id: "org.omni.plugin.notes.alt",
      name: "Alt Notes",
      version: "1.0.0",
      description: "Alternative note editor",
      handledIntents: ["create_note"],
      scriptContent: "console.log('alt notes');",
      sourceUrl: "local:@omni/plugin-notes-alt",
      enabled: true,
      viewport: "main"
    },
    {
      id: "org.omni.plugin.checklist",
      name: "Checklist",
      version: "1.0.0",
      description: "Task and checklist tracker",
      handledIntents: ["create_task"],
      scriptContent: "console.log('checklist');",
      sourceUrl: "local:@omni/plugin-checklist",
      enabled: true,
      viewport: "sidebar"
    }
  ];

  beforeEach(() => {
    const store = new Map<string, string>();
    const mockStorage = {
      getItem: (k: string) => store.get(k) || null,
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
      get length() { return store.size; },
      key: (idx: number) => Array.from(store.keys())[idx] || null
    };
    Object.defineProperty(window, "localStorage", {
      value: mockStorage,
      writable: true,
      configurable: true
    });

    root = document.createElement("div");
    root.id = "omni-root";
    document.body.innerHTML = "";
    document.body.appendChild(root);

    kernel = new OmniKernel({ runtimeScript: omniRuntimeScript,
      defaultRelays: ["wss://relay.damus.io"]
    });
  });

  describe("1. Granular Kind-Level Permissions & Collapsible Section", () => {
    it("allows setting and querying specific kind permissions on OmniKernel", () => {
      const pluginId = "org.omni.plugin.feed";
      expect(kernel.getPluginPermission(pluginId, "nostr:write", "1")).toBe(false);

      kernel.setPluginKindPermission(pluginId, 1, true);
      expect(kernel.getPluginPermission(pluginId, "nostr:write", "1")).toBe(true);
      expect(kernel.getPluginPermission(pluginId, "nostr:write", "7")).toBe(false);

      const perms = kernel.getPluginKindPermissions(pluginId);
      expect(perms.allKinds).toBe(false);
      expect(perms.kinds).toContain(1);
      expect(perms.kinds).not.toContain(7);

      // Setting wildcard grants all
      kernel.setPluginPermission(pluginId, "nostr:write", true, "*");
      expect(kernel.getPluginPermission(pluginId, "nostr:write", "7")).toBe(true);
      expect(kernel.getPluginKindPermissions(pluginId).allKinds).toBe(true);
    });

    it("renders collapsible section with chevron and toggles open/closed", () => {
      const section = renderNostrWritePermissionsSection({
        kernel,
        pluginId: "org.omni.plugin.feed",
        theme: "classic"
      });
      document.body.appendChild(section);

      const header = section.querySelector(".write-permissions-header") as HTMLElement;
      const body = section.querySelector(".write-permissions-body") as HTMLElement;
      const chevron = section.querySelector(".write-permissions-chevron") as HTMLElement;

      expect(header).toBeTruthy();
      expect(body).toBeTruthy();
      expect(body.style.display).toBe("none");

      // Click header to open
      header.click();
      expect(body.style.display).toBe("flex");
      expect(chevron.style.transform).toBe("rotate(180deg)");

      // Click again to close
      header.click();
      expect(body.style.display).toBe("none");
      expect(chevron.style.transform).toBe("rotate(0deg)");
    });

    it("allows adding and revoking custom numeric kinds in the UI", () => {
      const pluginId = "org.omni.plugin.feed";
      const section = renderNostrWritePermissionsSection({
        kernel,
        pluginId,
        theme: "classic"
      });
      document.body.appendChild(section);

      const input = section.querySelector("input[type=number]") as HTMLInputElement;
      const addBtn = section.querySelector("button[type=button]") as HTMLButtonElement;

      expect(input).toBeTruthy();
      expect(addBtn).toBeTruthy();

      input.value = "30078";
      addBtn.click();

      expect(kernel.getPluginPermission(pluginId, "nostr:write", "30078")).toBe(true);
      expect(kernel.getPluginKindPermissions(pluginId).kinds).toContain(30078);

      // Pill rendered with revoke button
      const pills = section.querySelectorAll(".write-permissions-body span");
      const customPill = Array.from(pills).find((el) => el.textContent?.includes("Kind 30078"));
      expect(customPill).toBeTruthy();

      const revokeBtn = customPill?.querySelector("button") as HTMLButtonElement;
      revokeBtn?.click();

      expect(kernel.getPluginPermission(pluginId, "nostr:write", "30078")).toBe(false);
      expect(kernel.getPluginKindPermissions(pluginId).kinds).not.toContain(30078);
    });
  });

  describe("2. Handled Intents Section & Intent Toggles", () => {
    it("renders declared intents with toggle switches", () => {
      const plugin = mockPlugins[0]; // Feed
      const section = renderHandledIntentsSection({
        kernel,
        plugin,
        theme: "classic"
      });
      document.body.appendChild(section);

      const checkboxes = section.querySelectorAll("input[type=checkbox]") as NodeListOf<HTMLInputElement>;
      expect(checkboxes.length).toBe(3); // create_note, view_note, share

      // All enabled by default
      expect(kernel.intentBroker.isPluginIntentEnabled(plugin.id, "create_note")).toBe(true);

      // Disable create_note
      checkboxes[0].click();
      expect(kernel.intentBroker.isPluginIntentEnabled(plugin.id, "create_note")).toBe(false);
      expect(plugin.disabledIntents).toContain("create_note");

      // Re-enable create_note
      checkboxes[0].click();
      expect(kernel.intentBroker.isPluginIntentEnabled(plugin.id, "create_note")).toBe(true);
      expect(plugin.disabledIntents).not.toContain("create_note");
    });
  });

  describe("3. Multi-Handler Resolution & 0-Handler Toast Prompt", () => {
    it("prompts toast when 0 active handlers exist but 1 disabled candidate exists", async () => {
      const shell = new OmniShell({ root, kernel, installedPlugins: [...mockPlugins] });
      shell.mount();

      // Register mock handler for create_task
      let taskCreated = false;
      kernel.intentBroker.registerHandler(
        "org.omni.plugin.checklist",
        "create_task",
        async () => {
          taskCreated = true;
          return { ok: true };
        },
        { name: "Checklist" }
      );

      // Disable checklist handler
      kernel.intentBroker.setPluginIntentEnabled("org.omni.plugin.checklist", "create_task", false);

      // Dispatching intent should trigger toast prompt
      const dispatchPromise = kernel.intentBroker.dispatch("test", "create_task", { task: "Buy milk" });

      // Check that toast was mounted
      const toast = document.getElementById("omni-intent-enable-toast");
      expect(toast).toBeTruthy();
      expect(toast?.textContent).toContain("No active handler for \"create_task\"");
      expect(toast?.textContent).toContain("Checklist");

      // User clicks "Enable & Open"
      const enableBtn = toast?.querySelector("button") as HTMLButtonElement;
      enableBtn.click();

      const result = await dispatchPromise;
      expect(result).toEqual({ ok: true });
      expect(taskCreated).toBe(true);
      expect(kernel.intentBroker.isPluginIntentEnabled("org.omni.plugin.checklist", "create_task")).toBe(true);
    });

    it("disambiguates when multiple active handlers exist via Open With modal", async () => {
      const shell = new OmniShell({ root, kernel, installedPlugins: [...mockPlugins] });
      shell.mount();

      let feedExecuted = false;
      let altExecuted = false;

      kernel.intentBroker.registerHandler("org.omni.plugin.feed", "create_note", async () => {
        feedExecuted = true;
        return "feed-res";
      }, { name: "Feed" });

      kernel.intentBroker.registerHandler("org.omni.plugin.notes.alt", "create_note", async () => {
        altExecuted = true;
        return "alt-res";
      }, { name: "Alt Notes" });

      // Dispatch intent
      const dispatchPromise = kernel.intentBroker.dispatch("test", "create_note", { text: "Hello" });

      // Open With modal opens
      const modal = document.getElementById("open-with-modal");
      expect(modal?.classList.contains("open")).toBe(true);

      const items = modal?.querySelectorAll(".open-with-handler-item") as NodeListOf<HTMLElement>;
      expect(items.length).toBe(2);

      // User clicks Alt Notes (second item) and confirms
      items[1].click();
      const confirmBtn = document.getElementById("btn-confirm-open-with") as HTMLButtonElement;
      confirmBtn.click();

      const res = await dispatchPromise;
      expect(res).toBe("alt-res");
      expect(altExecuted).toBe(true);
      expect(feedExecuted).toBe(false);
    });
  });

  describe("4. Workspace State Serialization & Persistence", () => {
    it("round-trips defaultIntents, handledIntents, and disabledIntents through export and apply", () => {
      const shell = new OmniShell({ root, kernel, installedPlugins: [...mockPlugins] });
      shell.mount();

      // Configure a default handler and a disabled intent
      kernel.intentBroker.setDefaultHandler("create_note", "org.omni.plugin.feed");
      shell.installedPlugins[0].disabledIntents = ["share"];
      kernel.intentBroker.setPluginIntentEnabled("org.omni.plugin.feed", "share", false);

      const exported = shell.exportWorkspaceState();
      expect(exported.defaultIntents?.create_note).toBe("org.omni.plugin.feed");
      expect(exported.plugins.find((p) => p.id === "org.omni.plugin.feed")?.disabledIntents).toEqual(["share"]);

      // Reset shell and apply state
      kernel.intentBroker.clearDefaultHandler("create_note");
      kernel.intentBroker.setPluginIntentEnabled("org.omni.plugin.feed", "share", true);

      shell.applyWorkspaceState(exported, false);

      expect(kernel.intentBroker.getDefaultHandler("create_note")).toBe("org.omni.plugin.feed");
      expect(kernel.intentBroker.isPluginIntentEnabled("org.omni.plugin.feed", "share")).toBe(false);
    });

    it("PanoramaShell also round-trips defaultIntents and disabledIntents", () => {
      const panorama = new PanoramaShell({ root, kernel, installedPlugins: [...mockPlugins] });
      panorama.mount();

      kernel.intentBroker.setDefaultHandler("create_task", "org.omni.plugin.checklist");
      panorama.installedPlugins[0].disabledIntents = ["view_note"];

      const exported = panorama.exportWorkspaceState();
      expect(exported.defaultIntents?.create_task).toBe("org.omni.plugin.checklist");
      expect(exported.plugins.find((p) => p.id === "org.omni.plugin.feed")?.disabledIntents).toEqual(["view_note"]);

      kernel.intentBroker.clearDefaultHandler("create_task");
      panorama.applyWorkspaceState(exported, false);

      expect(kernel.intentBroker.getDefaultHandler("create_task")).toBe("org.omni.plugin.checklist");
      expect(kernel.intentBroker.isPluginIntentEnabled("org.omni.plugin.feed", "view_note")).toBe(false);
    });
  });

  describe("5. Display Name vs Actual Name Resolution", () => {
    it("renders displayName on OmniShell dock launchers and preserves it in workspace export", () => {
      const plugins: InstalledPluginEntry[] = [
        {
          id: "org.omni.plugin.checklist",
          name: "Task Checklist",
          displayName: "Daily",
          version: "1.0.0",
          scriptContent: "console.log('checklist');",
          sourceUrl: "local:@omni/plugin-checklist",
          enabled: true,
          pinned: true,
          viewport: "main"
        },
        {
          id: "org.omni.plugin.profile-viewer",
          name: "Profiles Application",
          displayName: "Profiles",
          version: "1.0.0",
          scriptContent: "console.log('profiles');",
          sourceUrl: "local:@omni/plugin-profile-viewer",
          enabled: true,
          pinned: true,
          viewport: "main"
        }
      ];

      const shell = new OmniShell({ root, kernel, installedPlugins: plugins });
      shell.mount();

      const metaChecklist = shell.getPluginMeta(plugins[0]);
      expect(metaChecklist.name).toBe("Task Checklist");
      expect(metaChecklist.displayName).toBe("Daily");

      const metaProfiles = shell.getPluginMeta(plugins[1]);
      expect(metaProfiles.name).toBe("Profiles Application");
      expect(metaProfiles.displayName).toBe("Profiles");

      // Verify dock items display the distinct displayNames
      const dockItems = Array.from(root.querySelectorAll<HTMLElement>(".dock-item"));
      const checklistDock = dockItems.find((el) => el.textContent?.includes("Daily"));
      const profilesDock = dockItems.find((el) => el.textContent?.includes("Profiles"));

      expect(checklistDock).toBeDefined();
      expect(profilesDock).toBeDefined();

      // Verify export preserves displayName
      const exported = shell.exportWorkspaceState();
      expect(exported.plugins.find((p) => p.id === "org.omni.plugin.checklist")?.displayName).toBe("Daily");
      expect(exported.plugins.find((p) => p.id === "org.omni.plugin.profile-viewer")?.displayName).toBe("Profiles");
    });

    it("renders displayName on PanoramaShell and round-trips through workspace", () => {
      const plugins: InstalledPluginEntry[] = [
        {
          id: "org.omni.plugin.profile-viewer",
          name: "Profiles Application",
          displayName: "Profiles",
          version: "1.0.0",
          scriptContent: "console.log('profiles');",
          sourceUrl: "local:@omni/plugin-profile-viewer",
          enabled: true,
          viewport: "main"
        }
      ];

      const panorama = new PanoramaShell({ root, kernel, installedPlugins: plugins });
      panorama.mount();

      const meta = panorama.getPluginMeta(plugins[0]);
      expect(meta.displayName).toBe("Profiles");

      const exported = panorama.exportWorkspaceState();
      expect(exported.plugins[0].displayName).toBe("Profiles");
    });
  });

  describe("6. Profile Viewer Intent Dispatching & Navigation", () => {
    it("automatically opens profile viewer when view_profile intent is dispatched", async () => {
      const plugins: InstalledPluginEntry[] = [
        {
          id: "org.omni.plugin.feed",
          name: "Feed",
          version: "1.0.0",
          handledIntents: ["create_note"],
          scriptContent: "console.log('feed');",
          sourceUrl: "local:@omni/plugin-feed",
          enabled: true,
          viewport: "main"
        },
        {
          id: "org.omni.plugin.profile-viewer",
          name: "Profiles",
          displayName: "Profiles",
          version: "1.0.0",
          handledIntents: ["view_profile"],
          scriptContent: "console.log('viewer');",
          sourceUrl: "local:@omni/plugin-profile-viewer",
          enabled: true,
          viewport: "main"
        }
      ];

      const shell = new OmniShell({ root, kernel, installedPlugins: plugins });
      shell.mount();

      // Dispatch view_profile intent
      const testPubkey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      await kernel.intentBroker.dispatch("org.omni.plugin.feed", "view_profile", { pubkey: testPubkey });

      // Verify active page is now profile-viewer and target active profile key is saved in storage
      expect(shell.getActivePageId()).toBe("org.omni.plugin.profile-viewer");
      expect(localStorage.getItem("omni_active_profile_pubkey")).toBe(testPubkey);
    });

    it("PanoramaShell opens profile viewer when view_profile intent is dispatched", async () => {
      const plugins: InstalledPluginEntry[] = [
        {
          id: "org.omni.plugin.feed",
          name: "Feed",
          version: "1.0.0",
          handledIntents: ["create_note"],
          scriptContent: "console.log('feed');",
          sourceUrl: "local:@omni/plugin-feed",
          enabled: true,
          viewport: "main"
        },
        {
          id: "org.omni.plugin.profile-viewer",
          name: "Profiles",
          displayName: "Profiles",
          version: "1.0.0",
          handledIntents: ["view_profile"],
          scriptContent: "console.log('viewer');",
          sourceUrl: "local:@omni/plugin-profile-viewer",
          enabled: true,
          viewport: "main"
        }
      ];

      const panorama = new PanoramaShell({ root, kernel, installedPlugins: plugins });
      panorama.mount();

      const testPubkey = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
      await kernel.intentBroker.dispatch("org.omni.plugin.feed", "view_profile", { pubkey: testPubkey });

      expect(localStorage.getItem("omni_active_profile_pubkey")).toBe(testPubkey);
      expect(panorama.getActivePageId() === "org.omni.plugin.profile-viewer" || panorama.getCurrentOpenedAppId() === "org.omni.plugin.profile-viewer").toBe(true);
    });

    it("synthesizes manifests with intents permissions and grants ACL checks", async () => {
      const shell = new OmniShell({ root, kernel, installedPlugins: mockPlugins });
      const manifest = shell.ensurePluginManifest(mockPlugins[0]);
      expect(manifest.permissions.intents).toBeDefined();
      expect(manifest.permissions.intents.call).toContain("*");

      const panorama = new PanoramaShell({ root, kernel, installedPlugins: mockPlugins });
      const pManifest = panorama.ensurePluginManifest(mockPlugins[0]);
      expect(pManifest.permissions.intents).toBeDefined();
      expect(pManifest.permissions.intents.call).toContain("*");
    });

    it("does not create duplicate component slots or instances when view_profile is dispatched repeatedly", async () => {
      const plugins: InstalledPluginEntry[] = [
        {
          id: "org.omni.plugin.feed",
          name: "Feed",
          version: "1.0.0",
          handledIntents: ["create_note"],
          scriptContent: "console.log('feed');",
          sourceUrl: "local:@omni/plugin-feed",
          enabled: true,
          viewport: "main"
        },
        {
          id: "org.omni.plugin.profile-viewer",
          name: "Profiles",
          displayName: "Profiles",
          version: "1.0.0",
          handledIntents: ["view_profile"],
          scriptContent: "console.log('viewer');",
          sourceUrl: "local:@omni/plugin-profile-viewer",
          enabled: true,
          viewport: "" // Unassigned
        }
      ];

      const shell = new OmniShell({ root, kernel, installedPlugins: plugins });
      shell.mount();

      const testPubkey = "1111111111111111111111111111111111111111111111111111111111111111";

      // 1st dispatch
      await kernel.intentBroker.dispatch("org.omni.plugin.feed", "view_profile", { pubkey: testPubkey });
      expect(shell.getActivePageId()).toBe("org.omni.plugin.profile-viewer");

      // Go back to feed
      shell.showPage("feed");
      expect(shell.getActivePageId()).toBe("org.omni.plugin.feed");

      // 2nd dispatch for same or different profile
      await kernel.intentBroker.dispatch("org.omni.plugin.feed", "view_profile", { pubkey: testPubkey });
      expect(shell.getActivePageId()).toBe("org.omni.plugin.profile-viewer");

      // Verify slot container has only ONE component container for profile viewer, never duplicates
      const slotContainer = document.getElementById("slot-main-org-omni-plugin-profile-viewer");
      expect(slotContainer).not.toBeNull();
      const compSlots = slotContainer?.querySelectorAll(".omni-component-slot");
      expect(compSlots?.length).toBe(1);
    });

    it("PanoramaShell does not duplicate overlay instances when view_profile is dispatched repeatedly", async () => {
      const plugins: InstalledPluginEntry[] = [
        {
          id: "org.omni.plugin.feed",
          name: "Feed",
          version: "1.0.0",
          handledIntents: ["create_note"],
          scriptContent: "console.log('feed');",
          sourceUrl: "local:@omni/plugin-feed",
          enabled: true,
          viewport: "main"
        },
        {
          id: "org.omni.plugin.profile-viewer",
          name: "Profiles",
          displayName: "Profiles",
          version: "1.0.0",
          handledIntents: ["view_profile"],
          scriptContent: "console.log('viewer');",
          sourceUrl: "local:@omni/plugin-profile-viewer",
          enabled: true,
          viewport: "" // Unassigned
        }
      ];

      const panorama = new PanoramaShell({ root, kernel, installedPlugins: plugins });
      panorama.mount();

      const testPubkey = "1111111111111111111111111111111111111111111111111111111111111111";

      // 1st dispatch
      await kernel.intentBroker.dispatch("org.omni.plugin.feed", "view_profile", { pubkey: testPubkey });
      await new Promise((r) => setTimeout(r, 20));
      expect(panorama.getCurrentOpenedAppId()).toBe("org.omni.plugin.profile-viewer");

      // Go back to feed
      await panorama.showPage("feed");
      expect(panorama.getCurrentOpenedAppId()).toBeNull();

      // 2nd dispatch
      await kernel.intentBroker.dispatch("org.omni.plugin.feed", "view_profile", { pubkey: testPubkey });
      await new Promise((r) => setTimeout(r, 20));
      expect(panorama.getCurrentOpenedAppId()).toBe("org.omni.plugin.profile-viewer");

      // Check overlay slot
      const overlaySlot = document.getElementById("panorama-slot-overlay-org-omni-plugin-profile-viewer");
      expect(overlaySlot).not.toBeNull();
      // Ensure only 1 sandbox was registered for the overlay
      const sandboxes = Array.from((kernel as any).sandboxes.keys()).filter((k: any) =>
        k.startsWith("org.omni.plugin.profile-viewer")
      );
      expect(sandboxes.length).toBe(1);
    });

    it("resolves compose_note to create_note handler seamlessly via alias resolution", async () => {
      let receivedData: any = null;
      kernel.intentBroker.registerHandler("org.omni.plugin.feed", "create_note", async (data) => {
        receivedData = data;
        return { success: true };
      }, { name: "Feed" });

      const res: any = await kernel.intentBroker.dispatch("test-caller", "compose_note", {
        text: "Draft from cross-app intent",
        replyTo: "note1xyz"
      });

      expect(res.success).toBe(true);
      expect(receivedData).toEqual({
        text: "Draft from cross-app intent",
        replyTo: "note1xyz"
      });
    });

    it("dispatches view_note and stores omni_active_note_id in localStorage", async () => {
      const shell = new OmniShell({ root, kernel, installedPlugins: [...mockPlugins] });
      shell.mount();

      let noteViewed = false;
      kernel.intentBroker.registerHandler("org.omni.plugin.feed", "view_note", async (data) => {
        noteViewed = true;
        return { noteId: data.eventId };
      }, { name: "Feed" });

      await kernel.intentBroker.dispatch("test-caller", "view_note", {
        eventId: "event123456"
      });

      expect(noteViewed).toBe(true);
      expect(localStorage.getItem("omni_active_note_id")).toBe("event123456");
    });

    it("does not include send_zap in standard intent catalog", () => {
      const actions = Object.keys(INTENT_FRIENDLY_NAMES);
      expect(actions).toContain("view_profile");
      expect(actions).toContain("compose_note");
      expect(actions).toContain("create_note");
      expect(actions).toContain("view_note");
      expect(actions).not.toContain("send_zap");
    });
  });
});
