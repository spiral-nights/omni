// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import omniRuntimeScript from "../../../core/src/sandbox/omni-runtime.js?raw";
import "fake-indexeddb/auto";
import { OmniKernel } from "@omni/core";
import {
  EditorialShell,
  EDITORIAL_SHELL_CSS,
  EDITORIAL_ACCENTS,
  STORAGE_KEY_EDITORIAL_MODE,
  STORAGE_KEY_EDITORIAL_ACCENT_ID,
  InstalledPluginEntry,
  shellRegistry,
  OMNI_SHELL_STYLE_ELEMENT_ID
} from "../src/index.js";

describe("EditorialShell — Sacred Swiss Editorial & Papyrus Sanctuary", () => {
  let root: HTMLElement;
  let kernel: OmniKernel;
  let shell: EditorialShell;

  const mockPlugins: InstalledPluginEntry[] = [
    {
      id: "org.omni.plugin.feed",
      name: "Feed",
      displayName: "Feed",
      description: "Decentralized Nostr timeline notes and thoughts.",
      icon: "feed",
      viewport: "main",
      pinned: true,
      enabled: true,
      manifest: {
        id: "org.omni.plugin.feed",
        name: "Feed",
        version: "1.0.0",
        entry: "dist/index.js",
        components: [
          { id: "feed-main", type: "main", title: "Feed", slot: "main" }
        ],
        views: [{ id: "main", title: "Feed", path: "" }]
      },
      scriptContent: "console.log('feed');",
      sourceUrl: "local:@omni/plugin-feed"
    },
    {
      id: "org.omni.plugin.timer",
      name: "Focus Timer",
      displayName: "Focus Timer",
      description: "Pomodoro focus countdown and productivity timer.",
      icon: "timer",
      viewport: "sidebar",
      pinned: true,
      enabled: true,
      manifest: {
        id: "org.omni.plugin.timer",
        name: "Focus Timer",
        version: "1.0.0",
        entry: "dist/index.js",
        components: [
          { id: "timer-main", type: "main", title: "Focus Timer", slot: "main" },
          { id: "timer-widget", type: "widget", title: "Timer Card", slot: "sidebar" }
        ],
        views: [
          { id: "main", title: "Full Focus Screen", path: "" },
          { id: "widget", title: "Timer Card", path: "?view=widget" }
        ]
      },
      scriptContent: "console.log('timer');",
      sourceUrl: "local:@omni/plugin-timer"
    },
    {
      id: "org.omni.plugin.checklist",
      name: "Daily Checklist",
      displayName: "Checklist",
      description: "Daily goals and task checklist.",
      icon: "check-circle",
      viewport: "sidebar",
      pinned: false,
      enabled: true,
      manifest: {
        id: "org.omni.plugin.checklist",
        name: "Daily Checklist",
        version: "1.0.0",
        entry: "dist/index.js",
        components: [
          { id: "checklist-main", type: "main", title: "Checklist", slot: "main" }
        ],
        views: [{ id: "main", title: "Checklist", path: "" }]
      },
      scriptContent: "console.log('checklist');",
      sourceUrl: "local:@omni/plugin-checklist"
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
    try {
      Object.defineProperty(globalThis, "localStorage", {
        value: mockStorage,
        configurable: true,
        writable: true
      });
      Object.defineProperty(window, "localStorage", {
        value: mockStorage,
        configurable: true,
        writable: true
      });
    } catch {}

    root = document.createElement("div");
    root.id = "omni-root";
    document.body.appendChild(root);

    kernel = new OmniKernel({
      runtimeScript: omniRuntimeScript,
      bootstrapRelays: []
    });

    shell = new EditorialShell({
      root,
      kernel,
      installedPlugins: [...mockPlugins]
    });
  });

  afterEach(() => {
    shell?.destroy();
    root?.remove();
    const styleEl = document.getElementById(OMNI_SHELL_STYLE_ELEMENT_ID);
    styleEl?.remove();
  });

  describe("Mounting & Editorial Aesthetic Baseline", () => {
    it("mounts the editorial skeleton and injects editorial stylesheet into document.head", () => {
      shell.mount();

      const styleEl = document.getElementById(OMNI_SHELL_STYLE_ELEMENT_ID);
      expect(styleEl).toBeTruthy();
      expect(styleEl?.textContent).toContain("Newsreader");
      expect(styleEl?.textContent).toContain("Space Mono");
      expect(styleEl?.textContent).toContain("editorial-shell-root");

      expect(root.classList.contains("editorial-shell-root")).toBe(true);
      expect(root.classList.contains("theme-editorial")).toBe(true);
      expect(document.documentElement.classList.contains("theme-editorial")).toBe(true);
    });

    it("renders the OMNI brand title without MANTRA", () => {
      shell.mount();

      const brandTitle = root.querySelector(".editorial-brand-title");
      expect(brandTitle).toBeTruthy();
      expect(brandTitle?.textContent?.trim()).toBe("OMNI");
      expect(root.textContent).not.toContain("MANTRA");
      expect(root.textContent).not.toContain("Daily Dispatches");
      expect(root.textContent).not.toContain("Meshtastic");
    });

    it("exposes standard slot containers for micro-frontend projection", () => {
      shell.mount();

      const mainContainer = shell.getContainerForPluginSlot("org.omni.plugin.feed", "main");
      expect(mainContainer).toBeTruthy();
      expect(mainContainer.id).toBe("editorial-main-app-container");

      const widgetsContainer = shell.getContainerForPluginSlot("org.omni.plugin.timer", "sidebar");
      expect(widgetsContainer).toBeTruthy();
      expect(widgetsContainer.id).toBe("editorial-widgets-slot");

      const headerActions = shell.getContainerForPluginSlot("org.omni.plugin.feed", "header-actions");
      expect(headerActions).toBeTruthy();
      expect(headerActions.id).toBe("editorial-header-actions-slot");

      const dock = shell.getContainerForPluginSlot("org.omni.plugin.feed", "dock");
      expect(dock).toBeTruthy();
      expect(dock.id).toBe("editorial-dock-items");
    });
  });

  describe("Theme Mode & Display Cadence (Light / Dark / System)", () => {
    it("supports switching to light (Papyrus) mode and updates attribute and storage", () => {
      shell.mount();

      shell.setThemeMode("light");
      expect(shell.getThemeMode()).toBe("light");
      expect(root.getAttribute("data-theme-mode")).toBe("light");
      expect(document.documentElement.getAttribute("data-theme-mode")).toBe("light");
      expect(localStorage.getItem(STORAGE_KEY_EDITORIAL_MODE)).toBe("light");

      const activeBtn = root.querySelector(".editorial-mode-btn.active") as HTMLElement | null;
      expect(activeBtn?.dataset.mode).toBe("light");
    });

    it("supports switching to dark (Obsidian) mode and updates attribute and storage", () => {
      shell.mount();

      shell.setThemeMode("dark");
      expect(shell.getThemeMode()).toBe("dark");
      expect(root.getAttribute("data-theme-mode")).toBe("dark");
      expect(document.documentElement.getAttribute("data-theme-mode")).toBe("dark");
      expect(localStorage.getItem(STORAGE_KEY_EDITORIAL_MODE)).toBe("dark");

      const activeBtn = root.querySelector(".editorial-mode-btn.active") as HTMLElement | null;
      expect(activeBtn?.dataset.mode).toBe("dark");
    });

    it("supports system mode and falls back cleanly", () => {
      shell.mount();

      shell.setThemeMode("system");
      expect(shell.getThemeMode()).toBe("system");
      expect(localStorage.getItem(STORAGE_KEY_EDITORIAL_MODE)).toBe("system");
      expect(root.getAttribute("data-theme-mode")).toBeTruthy();
    });
  });

  describe("Accent Color Selector (Cobalt, Terra, Saffron, Pine, Bone)", () => {
    it("provides predefined accent swatches and allows switching", () => {
      shell.mount();

      // Switch to Terracotta accent
      shell.setAccent("terra");
      expect(localStorage.getItem(STORAGE_KEY_EDITORIAL_ACCENT_ID)).toBe("terra");
      const accentStyle = root.style.getPropertyValue("--omni-accent-primary");
      expect(accentStyle).toBeTruthy();

      // Verify label in settings
      const nameEl = root.querySelector("#editorial-active-accent-name");
      expect(nameEl?.textContent).toBe("Terracotta");

      // Switch to Saffron
      shell.setAccent("saffron");
      expect(localStorage.getItem(STORAGE_KEY_EDITORIAL_ACCENT_ID)).toBe("saffron");
      expect(root.querySelector("#editorial-active-accent-name")?.textContent).toBe("Saffron Ochre");
    });

    it("supports custom hex accent colors", () => {
      shell.mount();

      shell.setAccent("custom", "#e11d48");
      expect(localStorage.getItem(STORAGE_KEY_EDITORIAL_ACCENT_ID)).toBe("custom");
      expect(root.style.getPropertyValue("--omni-accent-primary")).toBe("#e11d48");
      expect(root.querySelector("#editorial-active-accent-name")?.textContent).toBe("Custom");
    });
  });

  describe("Dynamic Bottom Navigation Dock", () => {
    it("dynamically renders pinned plugins in the bottom dock", () => {
      shell.mount();

      const dockItems = root.querySelectorAll(".editorial-dock-item");
      expect(dockItems.length).toBeGreaterThanOrEqual(4); // Feed, Timer, Index, Cards, Prefs

      const dockTexts = Array.from(dockItems).map((el) => el.textContent || "");
      expect(dockTexts.some((t) => t.includes("FEED") || t.includes("Feed"))).toBe(true);
      expect(dockTexts.some((t) => t.includes("INDEX") || t.includes("Index"))).toBe(true);
      expect(dockTexts.some((t) => t.includes("CARDS") || t.includes("Cards"))).toBe(true);

      // Unpinned checklist should not be in dock
      const hasChecklist = Array.from(root.querySelectorAll("#editorial-dock-items .editorial-dock-item")).some(
        (el) => (el as HTMLElement).dataset.pluginId === "org.omni.plugin.checklist"
      );
      expect(hasChecklist).toBe(false);
    });

    it("switches view to Index (All Apps) and Companion Cards (Widgets)", () => {
      shell.mount();

      const btnIndex = root.querySelector("#btn-editorial-dock-apps") as HTMLElement | null;
      btnIndex?.click();
      expect(shell.activePage).toBe("apps");
      expect(root.querySelector("#editorial-page-apps")?.classList.contains("active")).toBe(true);
      expect(root.querySelector("#editorial-view-subtitle")?.textContent).toBe("Index");

      const btnCards = root.querySelector("#btn-editorial-dock-widgets") as HTMLElement | null;
      btnCards?.click();
      expect(shell.activePage).toBe("widgets");
      expect(root.querySelector("#editorial-page-widgets")?.classList.contains("active")).toBe(true);
      expect(root.querySelector("#editorial-view-subtitle")?.textContent).toBe("Cards");
    });

    it("pinning an app in Applications Index adds it to the dock immediately", () => {
      shell.mount();
      shell.showAppsIndex();

      const checklist = shell.installedPlugins.find((p) => p.id === "org.omni.plugin.checklist");
      expect(checklist?.pinned).toBe(false);

      const allGrid = root.querySelector("#editorial-all-apps-grid");
      const pinBtn = allGrid?.querySelector(".btn-toggle-pin") as HTMLElement | null;
      expect(pinBtn).toBeTruthy();
      pinBtn?.click();

      expect(checklist?.pinned).toBe(true);
      const inDock = Array.from(root.querySelectorAll("#editorial-dock-items .editorial-dock-item")).some(
        (el) => (el as HTMLElement).dataset.pluginId === "org.omni.plugin.checklist"
      );
      expect(inDock).toBe(true);
    });
  });

  describe("Settings & Preferences Modal & Installed Shells", () => {
    it("opens and closes the preferences modal", () => {
      shell.mount();

      const modal = root.querySelector("#editorial-settings-modal");
      expect(modal?.classList.contains("open")).toBe(false);

      const btnOpen = root.querySelector("#btn-editorial-settings") as HTMLElement | null;
      btnOpen?.click();
      expect(modal?.classList.contains("open")).toBe(true);

      const btnClose = root.querySelector("#btn-editorial-close-settings") as HTMLElement | null;
      btnClose?.click();
      expect(modal?.classList.contains("open")).toBe(false);
    });

    it("renders installed shells card in settings with activate affordance", () => {
      shell.mount();
      shell.openSettings();

      const shellsList = root.querySelector("#editorial-installed-shells-list");
      expect(shellsList).toBeTruthy();
      expect(shellsList?.textContent).toContain("Omni Classic");
      expect(shellsList?.textContent).toContain("Panorama");
      expect(shellsList?.textContent).toContain("Editorial");
    });
  });

  describe("Application Navigation & Micro-Frontend Mounting", () => {
    it("opens non-feed plugins into dedicated isolated containers and shows them", async () => {
      shell.mount();

      // Open timer
      await shell.openApp("org.omni.plugin.timer");

      expect(shell.activePage).toBe("app");
      expect(shell.activePluginId).toBe("org.omni.plugin.timer");
      expect(root.querySelector("#editorial-view-subtitle")?.textContent).toBe("Focus Timer");

      const timerPage = root.querySelector("#editorial-app-page-org-omni-plugin-timer") as HTMLElement | null;
      expect(timerPage).toBeTruthy();
      expect(timerPage?.classList.contains("active")).toBe(true);
      expect(timerPage?.style.display).toBe("flex");

      // Feed page should be hidden
      const feedPage = root.querySelector("#editorial-page-app") as HTMLElement | null;
      expect(feedPage?.classList.contains("active")).toBe(false);
      expect(feedPage?.style.display).toBe("none");

      // Switch back to feed
      await shell.openApp("org.omni.plugin.feed");
      expect(shell.activePluginId).toBe("org.omni.plugin.feed");
      expect(feedPage?.classList.contains("active")).toBe(true);
      expect(feedPage?.style.display).toBe("flex");
      expect(timerPage?.classList.contains("active")).toBe(false);
      expect(timerPage?.style.display).toBe("none");
    });

    it("contains authentic tactile paper grain texture and warm broadsheet newspaper dark ground", () => {
      shell.mount();

      expect(EDITORIAL_SHELL_CSS).toContain("noiseFilter");
      expect(EDITORIAL_SHELL_CSS).toContain("mix-blend-mode: screen");
      expect(EDITORIAL_SHELL_CSS).toContain("#1c1b20");
      expect(EDITORIAL_SHELL_CSS).toContain(".feed-container");
      expect(EDITORIAL_SHELL_CSS).toContain(".feed-composer");
      expect(EDITORIAL_SHELL_CSS).toContain(".note-card");
      expect(EDITORIAL_SHELL_CSS).toContain(".timer-widget-card");
      expect(EDITORIAL_SHELL_CSS).toContain(".checklist-widget-card");
    });
  });

  describe("Built-in Shell Registry Integration", () => {
    it("registers Editorial as a built-in shell in shellRegistry", () => {
      expect(shellRegistry.get("editorial")?.name).toBe("Editorial");
      expect(shellRegistry.isBuiltin("editorial")).toBe(true);
      expect(() => shellRegistry.uninstall("editorial")).toThrow();
    });

    it("instantiates an EditorialShell via shellRegistry.create('editorial')", () => {
      const testRoot = document.createElement("div");
      document.body.appendChild(testRoot);
      const created = shellRegistry.create("editorial", {
        root: testRoot,
        kernel,
        installedPlugins: []
      });
      expect(created instanceof EditorialShell).toBe(true);
      expect(created.getShellType()).toBe("editorial");
      created.destroy();
      testRoot.remove();
    });
  });
});
