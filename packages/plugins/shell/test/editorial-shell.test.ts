// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import omniRuntimeScript from "../../../core/src/sandbox/omni-runtime.js?raw";
import "fake-indexeddb/auto";
import { OmniKernel } from "@omni/core";
import {
  EditorialShell,
  EDITORIAL_ACCENTS,
  STORAGE_KEY_EDITORIAL_MODE,
  STORAGE_KEY_EDITORIAL_ACCENT_ID
} from "../src/editorial-shell.js";
import { EDITORIAL_SHELL_CSS } from "../src/styles/editorial-styles.js";
import {
  InstalledPluginEntry,
  shellRegistry,
  OMNI_SHELL_STYLE_ELEMENT_ID,
  renderPluginIcon,
  ICONS
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
      id: "org.omni.plugin.relays",
      name: "Relays",
      displayName: "Relays",
      description: "Manage connected relays and monitor live pool status.",
      icon: "relays",
      viewport: "sidebar",
      pinned: true,
      enabled: true,
      manifest: {
        id: "org.omni.plugin.relays",
        name: "Relays",
        version: "1.0.0",
        entry: "dist/index.js",
        components: [
          { id: "relays-main", type: "main", title: "Relays", slot: "main" },
          { id: "relays-widget", type: "widget", title: "Relays Card", slot: "sidebar" }
        ],
        views: [
          { id: "main", title: "Relays", path: "" }
        ]
      },
      scriptContent: "console.log('relays');",
      sourceUrl: "local:@omni/plugin-relays"
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
      installedPlugins: JSON.parse(JSON.stringify(mockPlugins))
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

      const widgetsContainer = shell.getContainerForPluginSlot("org.omni.plugin.relays", "sidebar");
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
      expect(dockItems.length).toBeGreaterThanOrEqual(4); // Feed, Relays, Index, Cards, Prefs

      const dockTexts = Array.from(dockItems).map((el) => el.textContent || "");
      expect(dockTexts.some((t) => t.includes("FEED") || t.includes("Feed"))).toBe(true);
      expect(dockTexts.some((t) => t.includes("INDEX") || t.includes("Index") || t.includes("APPS") || t.includes("Apps"))).toBe(true);
      expect(dockTexts.some((t) => t.includes("CARDS") || t.includes("Cards") || t.includes("WIDGETS") || t.includes("Widgets"))).toBe(true);

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
      expect(root.querySelector("#editorial-view-subtitle")?.textContent).toBe("Apps");

      const btnCards = root.querySelector("#btn-editorial-dock-widgets") as HTMLElement | null;
      btnCards?.click();
      expect(shell.activePage).toBe("widgets");
      expect(root.querySelector("#editorial-page-widgets")?.classList.contains("active")).toBe(true);
      expect(root.querySelector("#editorial-view-subtitle")?.textContent).toBe("Cards");
    });

    it("does not render widgets dock item if no widgets are assigned in EditorialShell", () => {
      shell.mount();

      // Initially relays and checklist are in sidebar, widgets dock button is present
      expect(shell.hasAssignedWidgets()).toBe(true);
      expect(root.querySelector("#btn-editorial-dock-widgets")).toBeTruthy();

      // Reassign all sidebar plugins to main
      for (const p of shell.installedPlugins) {
        p.viewport = "main";
        p.placements = [{ id: "main", viewport: "main", route: "", viewId: "main", enabled: true }];
      }
      shell.renderDock();

      expect(shell.hasAssignedWidgets()).toBe(false);
      expect(root.querySelector("#btn-editorial-dock-widgets")).toBeNull();

      // Reassign relays back to sidebar
      const relays = shell.installedPlugins.find((p) => p.id === "org.omni.plugin.relays")!;
      relays.viewport = "sidebar";
      relays.placements = [{ id: "sidebar", viewport: "sidebar", route: "", viewId: "main", enabled: true }];
      shell.renderDock();

      expect(shell.hasAssignedWidgets()).toBe(true);
      expect(root.querySelector("#btn-editorial-dock-widgets")).toBeTruthy();
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

    it("allows pinning and unpinning an app with empty companion placements to the dock", () => {
      shell.mount();
      const customApp: InstalledPluginEntry = {
        id: "com.example.plainapp",
        name: "Plain App",
        pinned: false,
        enabled: true,
        placements: [],
        scriptContent: "console.log('plain');"
      };
      shell.installedPlugins.push(customApp);

      expect(shell.isAppPinned(customApp)).toBe(false);
      shell.setAppPinned("com.example.plainapp", true);
      expect(shell.isAppPinned(customApp)).toBe(true);
      expect(customApp.pinned).toBe(true);

      shell.renderDock();
      const inDock = Array.from(root.querySelectorAll("#editorial-dock-items .editorial-dock-item")).some(
        (el) => (el as HTMLElement).dataset.pluginId === "com.example.plainapp"
      );
      expect(inDock).toBe(true);

      // Unpin
      shell.setAppPinned("com.example.plainapp", false);
      expect(shell.isAppPinned(customApp)).toBe(false);
      shell.renderDock();
      const inDockAfter = Array.from(root.querySelectorAll("#editorial-dock-items .editorial-dock-item")).some(
        (el) => (el as HTMLElement).dataset.pluginId === "com.example.plainapp"
      );
      expect(inDockAfter).toBe(false);
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

      // Open relays
      await shell.openApp("org.omni.plugin.relays");

      expect(shell.activePage).toBe("app");
      expect(shell.activePluginId).toBe("org.omni.plugin.relays");
      expect(root.querySelector("#editorial-view-subtitle")?.textContent).toBe("Relays");

      const relaysPage = root.querySelector("#editorial-app-page-org-omni-plugin-relays") as HTMLElement | null;
      expect(relaysPage).toBeTruthy();
      expect(relaysPage?.classList.contains("active")).toBe(true);
      expect(relaysPage?.style.display).toBe("flex");

      // Feed page should be hidden
      const feedPage = root.querySelector("#editorial-page-app") as HTMLElement | null;
      expect(feedPage?.classList.contains("active")).toBe(false);
      expect(feedPage?.style.display).toBe("none");

      // Switch back to feed
      await shell.openApp("org.omni.plugin.feed");
      expect(shell.activePluginId).toBe("org.omni.plugin.feed");
      expect(feedPage?.classList.contains("active")).toBe(true);
      expect(feedPage?.style.display).toBe("flex");
      expect(relaysPage?.classList.contains("active")).toBe(false);
      expect(relaysPage?.style.display).toBe("none");
    });

    it("contains authentic tactile paper grain texture and warm broadsheet newspaper dark ground", () => {
      shell.mount();

      expect(EDITORIAL_SHELL_CSS).toContain("noiseFilter");
      expect(EDITORIAL_SHELL_CSS).toContain("mix-blend-mode: screen");
      expect(EDITORIAL_SHELL_CSS).toContain("#1c1b20");
      expect(EDITORIAL_SHELL_CSS).toContain(".editorial-shell-root");
      expect(EDITORIAL_SHELL_CSS).toContain(".editorial-dock");
      expect(EDITORIAL_SHELL_CSS).toContain(".editorial-app-page");
      expect(EDITORIAL_SHELL_CSS).toContain("#editorial-widgets-slot");

      // Verify strict shell plugin agnosticism (Rule 7: Zero hardcoded plugin classes in shell stylesheet)
      expect(EDITORIAL_SHELL_CSS).not.toContain(".feed-container");
      expect(EDITORIAL_SHELL_CSS).not.toContain(".feed-composer");
      expect(EDITORIAL_SHELL_CSS).not.toContain(".note-card");
      expect(EDITORIAL_SHELL_CSS).not.toContain(".relays-container");
      expect(EDITORIAL_SHELL_CSS).not.toContain(".checklist-widget-card");
      expect(EDITORIAL_SHELL_CSS).not.toContain(".people-user-card");
    });
  });

  describe("Plugin Placements & Viewports in Editorial Preferences", () => {
    it("renders viewport and route selectors for each installed plugin in settings", () => {
      shell.mount();
      shell.openSettings();

      const list = root.querySelector("#editorial-plugins-settings-list");
      expect(list).toBeTruthy();

      const vpSelects = list?.querySelectorAll(".plugin-viewport-select");
      expect(vpSelects?.length).toBeGreaterThanOrEqual(1);

      const addBtn = list?.querySelector(".btn-add-placement") as HTMLElement | null;
      expect(addBtn).toBeTruthy();
    });

    it("fades the exit fullscreen button in and out unobtrusively in fullscreen mode", async () => {
      shell.mount();
      const exitBtn = root.querySelector("#btn-editorial-exit-fullscreen") as HTMLElement;
      expect(exitBtn).toBeTruthy();

      // Enter fullscreen
      shell.toggleAppFullscreen(true);
      expect(root.classList.contains("app-fullscreen")).toBe(true);
      expect(exitBtn.classList.contains("active-reveal")).toBe(true);

      // Trigger mouse move near the top edge
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 200, clientY: 40 }));
      expect(exitBtn.classList.contains("active-reveal")).toBe(true);

      // Trigger touchstart near the top edge for mobile touch devices
      const touchEvent = new CustomEvent("touchstart", { bubbles: true }) as any;
      touchEvent.touches = [{ clientX: 200, clientY: 45 }];
      window.dispatchEvent(touchEvent);
      expect(exitBtn.classList.contains("active-reveal")).toBe(true);

      // Exit fullscreen
      shell.toggleAppFullscreen(false);
      expect(root.classList.contains("app-fullscreen")).toBe(false);
      expect(exitBtn.classList.contains("active-reveal")).toBe(false);
    });

    it("ensures plugins without companion viewports do not have phantom dock placements", () => {
      shell.mount();
      const feed = shell.installedPlugins.find((p) => p.id === "org.omni.plugin.feed")!;
      const feedPlacements = shell.getPluginPlacements(feed);
      expect(feedPlacements.length).toBe(0);

      shell.openSettings();
      const feedDetails = root.querySelector("#plugin-details-org-omni-plugin-feed");
      expect(feedDetails?.textContent).toContain("Unassigned");

      const feedVpSelect = feedDetails?.querySelector(".plugin-viewport-select") as HTMLSelectElement | null;
      expect(feedVpSelect).toBeNull();
    });

    it("does not include 'main' or 'Full-Page App' in available viewport options", () => {
      shell.mount();
      const viewports = shell.getAvailableViewports();
      const viewportIds = viewports.map((v) => v.id);
      expect(viewportIds).not.toContain("main");
      expect(viewports.map((v) => v.label)).not.toContain("Full-Page App");

      shell.openSettings();
      const list = root.querySelector("#editorial-plugins-settings-list");
      const vpSelects = list?.querySelectorAll<HTMLSelectElement>(".plugin-viewport-select");
      if (vpSelects && vpSelects.length > 0) {
        for (const select of vpSelects) {
          const optionValues = Array.from(select.options).map((o) => o.value);
          expect(optionValues).not.toContain("main");
        }
      }
    });

    it("automatically scrolls to top and applies fade transition when switching between apps", async () => {
      shell.mount();
      await shell.openApp("org.omni.plugin.feed");

      const feedContainer = shell.ensureAppContainer("org.omni.plugin.feed");
      const feedPage = feedContainer.closest(".editorial-viewport-page") as HTMLElement;
      expect(feedPage).toBeTruthy();

      // Simulate scrolled down position on Feed
      feedPage.scrollTop = 450;
      feedContainer.scrollTop = 450;
      expect(feedPage.scrollTop).toBe(450);

      // Switch to Relays app
      const switchPromise = shell.openApp("org.omni.plugin.relays");

      // Verify outgoing page gets fade-out
      expect(feedPage.classList.contains("fade-out")).toBe(true);

      await switchPromise;

      const relaysContainer = shell.ensureAppContainer("org.omni.plugin.relays");
      const relaysPage = relaysContainer.closest(".editorial-viewport-page") as HTMLElement;
      expect(relaysPage).toBeTruthy();
      expect(relaysPage.classList.contains("active")).toBe(true);
      expect(relaysPage.classList.contains("fade-in")).toBe(true);
      expect(relaysPage.scrollTop).toBe(0);

      // Now scroll down on Relays and switch back to Feed
      relaysPage.scrollTop = 320;
      await shell.openApp("org.omni.plugin.feed");

      expect(feedPage.classList.contains("active")).toBe(true);
      expect(feedPage.scrollTop).toBe(0);
      expect(feedContainer.scrollTop).toBe(0);
    });

    it("allows adding and reassigning viewports for a plugin in Editorial mode without collapsing viewports section", async () => {
      shell.mount();
      shell.openSettings();

      const checklist = shell.installedPlugins.find((p) => p.id === "org.omni.plugin.checklist")!;
      const toggleBtn = root.querySelector("#btn-toggle-placements-org-omni-plugin-checklist") as HTMLElement | null;
      toggleBtn?.click();
      const detailsBefore = root.querySelector("#plugin-details-org-omni-plugin-checklist") as HTMLElement | null;
      expect(detailsBefore?.style.display).toBe("flex");

      const addBtn = root.querySelector("#btn-add-placement-org-omni-plugin-checklist") as HTMLElement | null;
      expect(addBtn).toBeTruthy();
      addBtn?.click();

      const placements = shell.getPluginPlacements(checklist);
      expect(placements.length).toBeGreaterThanOrEqual(2);

      // Verify viewports section did NOT collapse after clicking Add Location
      const detailsAfter = root.querySelector("#plugin-details-org-omni-plugin-checklist") as HTMLElement | null;
      expect(detailsAfter?.style.display).toBe("flex");
    });

    it("clears apps search input when navigating to apps page", () => {
      shell.mount();
      shell.showAppsIndex();

      const searchInput = root.querySelector("#editorial-apps-search-input") as HTMLInputElement | null;
      expect(searchInput).toBeTruthy();
      searchInput!.value = "weather query";

      shell.openApp("org.omni.plugin.feed");
      expect(shell.activePage).toBe("app");

      shell.showAppsIndex();
      expect(shell.activePage).toBe("apps");
      expect(searchInput!.value).toBe("");
    });

    it("renders permissions section with device location toggle and updates kernel grant", () => {
      shell.mount();
      shell.openSettings();

      const toggleBtn = root.querySelector("#btn-toggle-placements-org-omni-plugin-checklist") as HTMLElement | null;
      toggleBtn?.click();

      const details = root.querySelector("#plugin-details-org-omni-plugin-checklist") as HTMLElement | null;
      expect(details).toBeTruthy();

      const permSection = details?.querySelector(".plugin-permissions-section");
      expect(permSection).toBeTruthy();
      expect(permSection?.textContent).toContain("Device Location (GPS)");

      const gpsToggle = Array.from(permSection?.querySelectorAll("input[type=checkbox]") || []).find((input) => {
        const text = input.closest("div")?.textContent || "";
        return text.includes("Device Location (GPS)");
      }) as HTMLInputElement | undefined;

      expect(gpsToggle).toBeDefined();
      expect(gpsToggle?.checked).toBe(false);

      gpsToggle?.click();
      expect(kernel.getPluginPermission("org.omni.plugin.checklist", "system:geolocation")).toBe(true);

      gpsToggle?.click();
      expect(kernel.getPluginPermission("org.omni.plugin.checklist", "system:geolocation")).toBe(false);
    });

    it("collapses viewports section by default and toggles open on click", () => {
      shell.mount();
      shell.openSettings();

      const toggleBtn = root.querySelector("#btn-toggle-placements-org-omni-plugin-checklist") as HTMLElement | null;
      expect(toggleBtn).toBeTruthy();
      expect(toggleBtn?.textContent).toContain("Configure Viewports");

      const details = root.querySelector("#plugin-details-org-omni-plugin-checklist") as HTMLElement | null;
      expect(details).toBeTruthy();
      expect(details?.style.display).toBe("none");

      toggleBtn?.click();
      expect(details?.style.display).toBe("flex");
      expect(toggleBtn?.textContent).toContain("Close Viewports");

      toggleBtn?.click();
      expect(details?.style.display).toBe("none");
    });

    it("triggers context menu on app card via right-click and mobile long-press", async () => {
      shell.mount();
      shell.showAppsIndex();

      const appCard = root.querySelector(".editorial-plate-card") as HTMLElement | null;
      expect(appCard).toBeTruthy();

      // Right-click contextmenu
      appCard?.dispatchEvent(new MouseEvent("contextmenu", { clientX: 120, clientY: 150, bubbles: true }));
      const menu = document.querySelector(".omni-app-context-menu");
      expect(menu).toBeTruthy();
      expect(menu?.querySelector(".ctx-btn-update")).toBeTruthy();
      expect(menu?.querySelector(".ctx-btn-uninstall")).toBeTruthy();

      // Close menu
      await new Promise((r) => setTimeout(r, 20));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      expect(document.querySelector(".omni-app-context-menu")).toBeNull();
    });

    it("updates installed plugin seamlessly without throwing 'already installed' error", async () => {
      shell.mount();
      const existing = shell.installedPlugins.find((p) => p.id === "org.omni.plugin.checklist")!;
      expect(existing).toBeTruthy();

      await shell.installPluginEntry({
        ...existing,
        version: "2.0.0",
        scriptContent: "document.body.innerHTML = '<h1>Checklist v2</h1>';"
      });

      const updated = shell.installedPlugins.find((p) => p.id === "org.omni.plugin.checklist")!;
      expect(updated.version).toBe("2.0.0");
      expect(updated.scriptContent).toContain("Checklist v2");
    });

    it("supports browser popstate navigation across app, apps, and widgets views", () => {
      shell.mount();
      shell.openApp("org.omni.plugin.feed");
      expect(shell.activePage).toBe("app");

      shell.showAppsIndex();
      expect(shell.activePage).toBe("apps");

      // Simulate popstate back to app
      window.dispatchEvent(
        new PopStateEvent("popstate", {
          state: { type: "omni-editorial-view", page: "app", pluginId: "org.omni.plugin.feed" }
        })
      );
      expect(shell.activePage).toBe("app");
      expect(shell.activePluginId).toBe("org.omni.plugin.feed");
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

  describe("Plugin Icons & Mobile Search Bar Layout", () => {
    it("renders emoji, SVG, image, and starbright heuristics via renderPluginIcon", () => {
      // Emojis
      const sparkleEmoji = renderPluginIcon("✨", 20);
      expect(sparkleEmoji).toContain("omni-icon-emoji");
      expect(sparkleEmoji).toContain("✨");

      const starEmoji = renderPluginIcon("⭐", 20);
      expect(starEmoji).toContain("omni-icon-emoji");
      expect(starEmoji).toContain("⭐");

      // Star / Sparkle icon names
      const starIcon = renderPluginIcon("star", 18);
      expect(starIcon).toContain("omni-icon");
      expect(starIcon).toContain("<polygon");

      const sparkleIcon = renderPluginIcon("sparkle", 18);
      expect(sparkleIcon).toContain("omni-icon");
      expect(sparkleIcon).toContain("<svg");

      // Starbright heuristic
      const starbrightDefault = renderPluginIcon("", 20, "", "org.starbright.app");
      expect(starbrightDefault).toContain("omni-icon-emoji");
      expect(starbrightDefault).toContain("✨");

      // Image URL
      const imgIcon = renderPluginIcon("https://example.com/icon.png", 24);
      expect(imgIcon).toContain("<img");
      expect(imgIcon).toContain('src="https://example.com/icon.png"');
    });

    it("renders search bar with .editorial-plugins-search-bar for mobile responsive stacking", () => {
      shell.mount();
      shell.openSettings();

      const searchBar = root.querySelector(".editorial-plugins-search-bar");
      expect(searchBar).toBeTruthy();

      const searchInput = searchBar?.querySelector("#editorial-plugins-search-input");
      const expandBtn = searchBar?.querySelector("#btn-editorial-expand-all-plugins");
      expect(searchInput).toBeTruthy();
      expect(expandBtn).toBeTruthy();
    });

    it("renders Starbright with sparkle/star icon in dock and apps index", () => {
      const starbrightPlugin: InstalledPluginEntry = {
        id: "org.starbright.app",
        name: "Starbright",
        displayName: "Starbright Notes",
        description: "A sparkling note client.",
        version: "1.0.0",
        icon: "✨",
        viewport: "main",
        enabled: true,
        pinned: true,
        htmlContent: "<html><body>Starbright</body></html>"
      };

      shell.installedPlugins.push(starbrightPlugin);
      shell.mount();

      // In Dock
      const dockItem = root.querySelector('.editorial-dock-item[data-plugin-id="org.starbright.app"]');
      expect(dockItem).toBeTruthy();
      expect(dockItem?.innerHTML).toContain("✨");

      // In Apps Index
      shell.showAppsIndex();
      const card = root.querySelector(".editorial-plate-card");
      expect(root.innerHTML).toContain("✨");
    });
  });

  describe("Relay Management & Relay Access Scoping in Editorial", () => {
    it("renders Relay Access section in plugin settings and persists custom relay selections", async () => {
      shell.mount();
      shell.openSettings();

      // Configure a relay in the pool
      kernel.relayPool.addRelay("wss://relay.damus.io");
      kernel.relayPool.addRelay("wss://relay.ditto.pub");

      shell.renderPluginSettingsList();

      const feedDetails = root.querySelector("#plugin-details-org-omni-plugin-feed");
      expect(feedDetails).toBeTruthy();

      const relayBox = feedDetails?.querySelector(".plugin-relay-access-box");
      expect(relayBox).toBeTruthy();

      const radCustom = relayBox?.querySelector("input[type=radio][value='custom'], input[type=radio]:not([checked])") as HTMLInputElement | null;
      expect(radCustom).toBeTruthy();

      // Select custom radio
      const radRadios = relayBox?.querySelectorAll("input[type=radio]");
      const radAll = radRadios?.[0] as HTMLInputElement;
      const radCustomBtn = radRadios?.[1] as HTMLInputElement;
      expect(radAll).toBeTruthy();
      expect(radCustomBtn).toBeTruthy();

      radCustomBtn.click();
      radCustomBtn.dispatchEvent(new Event("change"));

      const feedPlugin = shell.installedPlugins.find((p) => p.id === "org.omni.plugin.feed")!;
      expect(feedPlugin.relays).toBeDefined();
      expect(Array.isArray(feedPlugin.relays)).toBe(true);

      // Verify it was persisted to localStorage
      const savedWs = JSON.parse(localStorage.getItem(shell.LOCAL_WORKSPACE_KEY) || "{}");
      const savedFeed = savedWs.plugins?.find((p: any) => p.id === "org.omni.plugin.feed");
      expect(savedFeed.relays).toBeDefined();
    });

    it("renders Workspace & Sync tab for NIP-78 synchronization without duplicating relays plugin UI", () => {
      shell.mount();
      shell.openSettings();

      const tabWorkspace = root.querySelector("#tab-editorial-workspace") as HTMLElement | null;
      expect(tabWorkspace).toBeTruthy();
      expect(tabWorkspace?.textContent).toContain("Workspace");
      expect(tabWorkspace?.textContent).toContain("Sync");
      tabWorkspace?.click();

      const panelWorkspace = root.querySelector("#panel-editorial-workspace");
      expect(panelWorkspace).toBeTruthy();

      // NIP-78 Sync button is present
      const btnSync = panelWorkspace?.querySelector("#btn-editorial-sync-workspace");
      expect(btnSync).toBeTruthy();

      // Does not contain a duplicated relay mesh in settings (relays belong to @omni/plugin-relays)
      expect(panelWorkspace?.querySelector("#editorial-relays-list")).toBeNull();
    });
  });
});
