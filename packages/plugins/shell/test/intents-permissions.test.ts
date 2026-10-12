// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { OmniKernel } from "@omni/core";
import { OmniShell, PanoramaShell, InstalledPluginEntry } from "../src/index.js";
import {
  renderNostrWritePermissionsSection,
  renderHandledIntentsSection,
  showIntentEnableToast
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

    kernel = new OmniKernel({
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
});
