// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { OmniKernel } from "@omni/core";
import { OmniShell, InstalledPluginEntry } from "../src/index.js";

describe("Milestone 4: Decouple Shell UI into @omni/plugin-shell", () => {
  let root: HTMLElement;
  let kernel: OmniKernel;
  let shell: OmniShell;

  const mockPlugins: InstalledPluginEntry[] = [
    {
      id: "org.omni.plugin.feed",
      manifest: {
        id: "org.omni.plugin.feed",
        name: "Timeline Feed",
        version: "1.0.0",
        entry: "dist/index.js",
        components: [
          { id: "feed-main", type: "main", title: "Feed", slot: "main" },
          { id: "feed-dock-icon", type: "icon", title: "Feed", slot: "dock" }
        ],
        permissions: { nostr: { read: { allKinds: true }, write: { allKinds: true }, sign: true } }
      },
      scriptContent: "console.log('feed');",
      sourceUrl: "local:@omni/plugin-feed",
      enabled: true
    },
    {
      id: "org.omni.plugin.timer",
      manifest: {
        id: "org.omni.plugin.timer",
        name: "Focus Timer",
        version: "1.0.0",
        entry: "dist/index.js",
        components: [
          { id: "timer-widget", type: "widget", title: "Timer", slot: "sidebar" }
        ],
        permissions: { storage: { quotaMb: 2 } }
      },
      scriptContent: "console.log('timer');",
      sourceUrl: "local:@omni/plugin-timer",
      enabled: true
    }
  ];

  beforeEach(() => {
    document.body.innerHTML = '<div id="omni-root"></div>';
    root = document.getElementById("omni-root")!;
    kernel = new OmniKernel({
      bootstrapRelays: []
    });
    shell = new OmniShell({
      root,
      kernel,
      installedPlugins: JSON.parse(JSON.stringify(mockPlugins))
    });
    shell.mount();
  });

  it("mounts the shell UI skeleton dynamically into #omni-root without hardcoded index.html markup", () => {
    expect(root.querySelector(".app-header")).toBeTruthy();
    expect(root.querySelector(".mobile-dock")).toBeTruthy();
    expect(root.querySelector(".main-viewport")).toBeTruthy();
    expect(root.querySelector("#settings-modal")).toBeTruthy();
    expect(root.querySelector("#install-plugin-modal")).toBeTruthy();
    expect(root.querySelector("#plugin-inspector-modal")).toBeTruthy();
  });

  it("exposes all standard slot containers for micro-frontend projection", () => {
    const slotContainers = shell.getSlotContainers();
    expect(slotContainers.has("main")).toBe(true);
    expect(slotContainers.has("dock")).toBe(true);
    expect(slotContainers.has("sidebar")).toBe(true);
    expect(slotContainers.has("widgets")).toBe(true);
    expect(slotContainers.has("header-actions")).toBe(true);

    const mainSlot = slotContainers.get("main");
    expect(mainSlot?.id).toBe("main-slot");
    const widgetsSlot = slotContainers.get("widgets");
    expect(widgetsSlot?.id).toBe("widgets-slot");
  });

  it("switches pages smoothly between Full Page Viewport and Widgets Grid", () => {
    const pageFeed = root.querySelector("#page-feed");
    const pageWidgets = root.querySelector("#page-widgets");

    expect(pageFeed?.classList.contains("active")).toBe(true);
    expect(pageWidgets?.classList.contains("active")).toBe(false);

    shell.showPage("widgets");
    expect(pageFeed?.classList.contains("active")).toBe(false);
    expect(pageWidgets?.classList.contains("active")).toBe(true);

    shell.showPage("feed");
    expect(pageFeed?.classList.contains("active")).toBe(true);
    expect(pageWidgets?.classList.contains("active")).toBe(false);
  });

  it("handles slot actions dispatched from plugins", () => {
    const pageWidgets = root.querySelector("#page-widgets");

    shell.handleSlotAction("open", "sidebar");
    expect(pageWidgets?.classList.contains("active")).toBe(true);

    shell.handleSlotAction("toggle", "sidebar");
    expect(pageWidgets?.classList.contains("active")).toBe(false);

    shell.handleSlotAction("open", "widgets");
    expect(pageWidgets?.classList.contains("active")).toBe(true);
  });

  it("opens and closes settings tabs cleanly", () => {
    const settingsModal = root.querySelector("#settings-modal");
    expect(settingsModal?.classList.contains("open")).toBe(false);

    shell.openSettings("relays");
    expect(settingsModal?.classList.contains("open")).toBe(true);

    const relaysPane = root.querySelector("#settings-pane-relays");
    expect(relaysPane?.classList.contains("active")).toBe(true);

    shell.closeSettings();
    expect(settingsModal?.classList.contains("open")).toBe(false);
  });

  it("uninstalls plugins and updates plugin manager registry", () => {
    expect(shell.installedPlugins.length).toBe(2);
    shell.uninstallPlugin("org.omni.plugin.timer");
    expect(shell.installedPlugins.length).toBe(1);
    expect(shell.installedPlugins[0].id).toBe("org.omni.plugin.feed");
  });

  it("Milestone 5: supports user-defined viewport reassignment via plugin manager card", () => {
    shell.openSettings("plugins");
    const container = root.querySelector("#plugins-list");
    expect(container).toBeTruthy();

    const select = container?.querySelector(".plugin-viewport-select") as HTMLSelectElement | null;
    expect(select).toBeTruthy();

    // Reassign feed to widgets grid
    if (select) {
      select.value = "sidebar";
      select.dispatchEvent(new Event("change"));
    }

    expect(kernel.layoutManager.getSlotForComponent("org.omni.plugin.feed", "feed-main")).toBe("sidebar");
  });

  it("renders dock launchers automatically for installed apps and routes clicks", () => {
    const dockSlot = root.querySelector("#dock-slot");
    expect(dockSlot).toBeTruthy();

    const items = dockSlot?.querySelectorAll(".dock-item");
    expect(items?.length).toBe(1); // Only full-page main apps (feed) get a dock launcher; widgets live in Widgets dashboard

    const feedBtn = Array.from(items || []).find((el) => el.getAttribute("title")?.includes("Feed")) as HTMLElement;
    expect(feedBtn).toBeTruthy();

    // Click feed launcher
    feedBtn.click();
    const pageFeed = root.querySelector("#page-feed");
    expect(pageFeed?.classList.contains("active")).toBe(true);
  });

  it("supports pure zero-manifest nsites without any manifest property", () => {
    const pureNsite: InstalledPluginEntry = {
      id: "org.example.pure-nsite",
      name: "Pure Standalone Nsite",
      description: "A 100% standard web app without an omni.manifest.json file",
      icon: "globe",
      viewport: "sidebar",
      scriptContent: "console.log('hello pure nsite');",
      sourceUrl: "nostr:naddr1pure",
      enabled: true
    };

    const meta = shell.getPluginMeta(pureNsite);
    expect(meta.name).toBe("Pure Standalone Nsite");
    expect(meta.viewport).toBe("sidebar");

    const synth = shell.ensurePluginManifest(pureNsite);
    expect(synth.id).toBe("org.example.pure-nsite");
    expect(synth.components.length).toBe(1);
    expect(synth.components[0].slot).toBe("sidebar");
  });

  describe("Milestone 6: Transparent Cross-App Intents & Open With Chooser", () => {
    it("detects URI schemes and Nostr target kinds correctly", async () => {
      const { detectUriScheme } = await import("@omni/core");
      expect(detectUriScheme("nostr:npub1abcdef")).toEqual({
        scheme: "nostr",
        target: "npub1abcdef",
        kind: 0
      });
      expect(detectUriScheme("nostr:nevent1xyz")).toEqual({
        scheme: "nostr",
        target: "nevent1xyz",
        kind: 1
      });
      expect(detectUriScheme("lightning:lnbc10u1p...").scheme).toBe("lightning");
      expect(detectUriScheme("cashu:cashuAeyJ0...").scheme).toBe("cashu");
    });

    it("resolves installed and NIP-89 app handlers for protocol URIs", async () => {
      const handlers = await kernel.resolveAppHandlers("nostr:nevent1xyz", mockPlugins);
      expect(handlers.length).toBeGreaterThan(0);
      const feedHandler = handlers.find((h) => h.id === "org.omni.plugin.feed");
      expect(feedHandler).toBeTruthy();
      expect(feedHandler?.isInstalled).toBe(true);
    });

    it("persists and retrieves user default handler preferences", () => {
      kernel.setDefaultHandler("nostr", "org.omni.plugin.feed");
      expect(kernel.getDefaultHandler("nostr")).toBe("org.omni.plugin.feed");
    });

    it("bypasses chooser modal when a default handler is already configured", async () => {
      kernel.setDefaultHandler("nostr", "org.omni.plugin.feed");
      const result = await shell.handleUri("nostr:nevent1xyz");
      expect(result.handled).toBe(true);
      expect(result.handlerId).toBe("org.omni.plugin.feed");
      const modal = root.querySelector("#open-with-modal");
      expect(modal?.classList.contains("open")).toBe(false);
    });

    it("presents Open With modal when no default is set and user confirms selection", async () => {
      // Clear any default handler
      kernel.clearDefaultHandler("nostr");

      // Add a second reader/timeline plugin so there are multiple choices
      const readerPlugin: InstalledPluginEntry = {
        id: "org.omni.plugin.reader",
        manifest: {
          id: "org.omni.plugin.reader",
          name: "Notes Reader & Timeline",
          version: "1.0.0",
          entry: "dist/index.js",
          components: [{ id: "reader-main", type: "main", title: "Reader", slot: "main" }],
          permissions: { nostr: { read: { allKinds: true }, write: { allKinds: true }, sign: true } }
        },
        scriptContent: "console.log('reader');",
        sourceUrl: "local:@omni/plugin-reader",
        enabled: true
      };
      shell.installedPlugins.push(readerPlugin);

      const handlePromise = shell.handleUri("nostr:nevent1xyz");
      await new Promise((r) => setTimeout(r, 20));

      // Modal should now be open
      const modal = root.querySelector("#open-with-modal");
      expect(modal?.classList.contains("open")).toBe(true);

      const items = root.querySelectorAll(".open-with-handler-item");
      expect(items.length).toBeGreaterThanOrEqual(1);

      // Select first handler item
      (items[0] as HTMLElement).click();

      // Check "Always open nostr: links with this app"
      const alwaysChk = root.querySelector("#open-with-always-checkbox") as HTMLInputElement;
      alwaysChk.checked = true;

      // Click confirm
      const btnConfirm = root.querySelector("#btn-confirm-open-with") as HTMLButtonElement;
      btnConfirm.click();

      const res = await handlePromise;
      expect(res.handled).toBe(true);
      expect(modal?.classList.contains("open")).toBe(false);
      expect(kernel.getDefaultHandler("nostr")).toBeTruthy();
    });

    it("handles Web Share API dispatch and routes to timeline composer", async () => {
      const res = await shell.handleShare({
        title: "Check this out",
        text: "Exciting decentralized update",
        url: "https://omni.run"
      });
      expect(res.handled).toBe(true);
      const pageFeed = root.querySelector("#page-feed");
      expect(pageFeed?.classList.contains("active")).toBe(true);
    });
  });
});

