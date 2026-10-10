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
      installedPlugins: mockPlugins
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
});
