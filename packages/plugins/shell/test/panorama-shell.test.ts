// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import omniRuntimeScript from "../../../core/src/sandbox/omni-runtime.js?raw";
import "fake-indexeddb/auto";
import { OmniKernel } from "@omni/core";
import { PanoramaShell } from "../src/panorama-shell.js";
import { InstalledPluginEntry } from "../src/index.js";

describe("PanoramaShell (Windows Phone People Hub Experience)", () => {
  let panoramaRoot: HTMLElement;
  let panoramaKernel: OmniKernel;
  let panoramaShell: PanoramaShell;

  const mockPlugins: InstalledPluginEntry[] = [
    {
      id: "org.omni.plugin.feed",
      handledIntents: ["create_note", "compose_note", "search"],
      manifest: {
        id: "org.omni.plugin.feed",
        name: "Feed",
        version: "1.0.0",
        entry: "dist/index.js",
        components: [
          { id: "feed-main", type: "main", title: "Feed", slot: "main" },
          { id: "feed-dock-icon", type: "icon", title: "Feed", slot: "dock" }
        ],
        views: [
          { id: "main", title: "Feed", path: "" },
          { id: "search", title: "Search", path: "?view=search" }
        ],
        permissions: { nostr: { read: { allKinds: true }, write: { allKinds: true }, sign: true }, intents: { handle: ["create_note", "compose_note", "search"] } }
      },
      scriptContent: "console.log('feed');",
      sourceUrl: "local:@omni/plugin-feed",
      viewport: "main",
      enabled: true,
      pinned: true
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
        views: [
          { id: "main", title: "Timer", path: "" },
          { id: "compact", title: "Live Tile", path: "?view=compact" },
          { id: "settings", title: "Timer Settings", path: "?view=settings" }
        ],
        permissions: { storage: { quotaMb: 2 } }
      },
      scriptContent: "console.log('timer');",
      sourceUrl: "local:@omni/plugin-timer",
      viewport: "sidebar",
      enabled: true
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

    localStorage.clear();
    document.body.innerHTML = "";
    panoramaRoot = document.createElement("div");
    document.body.appendChild(panoramaRoot);
    panoramaKernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
    panoramaShell = new PanoramaShell({
      root: panoramaRoot,
      kernel: panoramaKernel,
      installedPlugins: mockPlugins.map((p) => ({ ...p, placements: p.placements ? [...p.placements] : undefined }))
    });
    panoramaShell.mount();
  });

  it("renders compact single-tier header with horizontal pivot headers and profile button", () => {
    const pivotNav = panoramaRoot.querySelector(".panorama-pivot-nav");
    expect(pivotNav).toBeTruthy();
    const pivotItems = Array.from(panoramaRoot.querySelectorAll(".panorama-pivot-item")).map(
      (el) => el.textContent?.trim()
    );
    expect(pivotItems).toContain("feed");
    expect(pivotItems).toContain("apps");
    expect(pivotItems).toContain("widgets");
    expect(pivotItems).toContain("system");

    const userBtn = panoramaRoot.querySelector("#panorama-header-user-btn");
    expect(userBtn).toBeTruthy();
  });

  it("renders live accent tiles for installed apps in the apps section", () => {
    const tilesGrid = panoramaRoot.querySelector("#panorama-tiles-grid");
    expect(tilesGrid).toBeTruthy();
    const tiles = Array.from(panoramaRoot.querySelectorAll(".panorama-tile"));
    expect(tiles.length).toBe(mockPlugins.length);

    const feedTile = tiles.find((t) => t.textContent?.includes("Feed")) as HTMLElement;
    expect(feedTile).toBeTruthy();
    const timerTile = tiles.find((t) => t.textContent?.includes("Focus Timer")) as HTMLElement;
    expect(timerTile).toBeTruthy();

    // Clicking a pinned canvas app smoothly navigates to its section without opening an overlay
    const overlay = panoramaRoot.querySelector("#panorama-full-app-overlay");
    feedTile.click();
    expect(overlay?.classList.contains("open")).toBe(false);
    expect(panoramaShell.getActivePageId()).toBe("org.omni.plugin.feed");
  });

  it("opens full-page apps in the slide-in overlay and mounts app container without blank screen", async () => {
    const overlay = panoramaRoot.querySelector("#panorama-full-app-overlay");
    expect(overlay?.classList.contains("open")).toBe(false);

    await panoramaShell.openApp("org.omni.plugin.feed");
    expect(overlay?.classList.contains("open")).toBe(true);

    const title = panoramaRoot.querySelector("#panorama-overlay-title");
    expect(title?.textContent).toBe("Feed");

    // Verify app page and overlay slot exist in the overlay container
    const feedPage = panoramaRoot.querySelector("#panorama-page-app-org-omni-plugin-feed") as HTMLElement;
    expect(feedPage).toBeTruthy();
    expect(feedPage?.style.display).toBe("block");
    const overlaySlot = feedPage?.querySelector(".panorama-main-viewport-slot");
    expect(overlaySlot).toBeTruthy();

    // Open a second app (e.g. Focus Timer) and verify it switches active page in overlay
    await panoramaShell.openApp("org.omni.plugin.timer");
    expect(title?.textContent).toBe("Focus Timer");
    const timerPage = panoramaRoot.querySelector("#panorama-page-app-org-omni-plugin-timer") as HTMLElement;
    expect(timerPage).toBeTruthy();
    expect(timerPage?.style.display).toBe("block");
    expect(feedPage?.style.display).toBe("none");

    panoramaShell.closeApp();
    expect(overlay?.classList.contains("open")).toBe(false);
  });

  it("opens dynamic app pane on app launch and applies subtle fade out on close while sliding back to apps", async () => {
    const peekHint = panoramaRoot.querySelector("#panorama-left-peek-hint") as HTMLButtonElement;
    expect(peekHint).toBeTruthy();

    await panoramaShell.openApp("org.omni.plugin.feed");
    const dynamicPane = panoramaRoot.querySelector("#panorama-section-dynamic-app") as HTMLElement | null;
    expect(dynamicPane).toBeTruthy();

    panoramaShell.closeApp();
    expect(dynamicPane?.classList.contains("pane-closing")).toBe(true);
    await new Promise((r) => setTimeout(r, 260));
    expect(panoramaRoot.querySelector("#panorama-section-dynamic-app")).toBeFalsy();
  });

  it("exports and applies workspace state with shellType: 'panorama'", () => {
    const state = panoramaShell.exportWorkspaceState();
    expect(state.shellType).toBe("panorama");
    expect(state.plugins.length).toBe(mockPlugins.length);

    // Disable a plugin and verify state application
    state.plugins[1].enabled = false;
    panoramaShell.applyWorkspaceState(state);
    expect(panoramaShell.installedPlugins[1].enabled).toBe(false);
  });

  it("removes redundant bottom ApplicationBar and sheet since management is handled via the system pivot", () => {
    const appBar = panoramaRoot.querySelector("#panorama-app-bar");
    expect(appBar).toBeFalsy();
    const drawerSheet = panoramaRoot.querySelector("#panorama-drawer-sheet");
    expect(drawerSheet).toBeFalsy();

    // Back navigation for full-screen apps is supported directly via the overlay header back button
    const overlayBack = panoramaRoot.querySelector("#btn-overlay-back");
    expect(overlayBack).toBeTruthy();
  });

  it("synchronizes top pivot navigation horizontally when swiping left-to-right across the canvas", () => {
    const canvas = panoramaRoot.querySelector("#panorama-canvas") as HTMLElement;
    const pivotNav = panoramaRoot.querySelector("#panorama-pivot-nav") as HTMLElement;
    expect(canvas).toBeTruthy();
    expect(pivotNav).toBeTruthy();

    // Mock scrollWidth and clientWidth for test environment
    Object.defineProperty(canvas, "scrollWidth", { value: 2000, configurable: true });
    Object.defineProperty(canvas, "clientWidth", { value: 500, configurable: true });
    Object.defineProperty(pivotNav, "scrollWidth", { value: 600, configurable: true });
    Object.defineProperty(pivotNav, "clientWidth", { value: 300, configurable: true });

    // Simulate swiping halfway across the canvas
    canvas.scrollLeft = 750;
    panoramaShell.syncPivotScrollFromCanvas();

    // Verify pivotNav scrolled proportionally
    expect(pivotNav.scrollLeft).toBeGreaterThan(0);
  });

  it("provides full-page vertical scrolling layout for main apps without middle-only trapped scroll containment", () => {
    const feedSection = panoramaRoot.querySelector("#panorama-section-org-omni-plugin-feed") as HTMLElement;
    expect(feedSection).toBeTruthy();
    const feedSlot = panoramaRoot.querySelector("#panorama-slot-main-org-omni-plugin-feed") as HTMLElement;
    expect(feedSlot).toBeTruthy();

    // feedSlot should not force an inner trapped scrollbar inline
    expect(feedSlot.style.overflow).not.toBe("auto");
  });

  it("dynamically adds and removes main app canvas sections and pivots (feed is not hardcoded)", async () => {
    // Feed is initially in main, so it has a dynamic section and pivot header
    expect(panoramaRoot.querySelector("#panorama-section-org-omni-plugin-feed")).toBeTruthy();
    const pivotNav = panoramaRoot.querySelector("#panorama-pivot-nav");
    expect(pivotNav?.textContent).toContain("feed");

    // Reassign feed to sidebar
    const feedPlugin = panoramaShell.installedPlugins.find((p) => p.id === "org.omni.plugin.feed")!;
    feedPlugin.viewport = "sidebar";
    feedPlugin.placements = [{ id: "feed-pl", viewport: "sidebar", route: "?view=widget", viewId: "widget", enabled: true }];
    await panoramaShell.remountPlugin(feedPlugin);

    // Dynamic canvas section and pivot header for feed are removed
    expect(panoramaRoot.querySelector("#panorama-section-org-omni-plugin-feed")).toBeFalsy();
    expect(panoramaRoot.querySelector("#panorama-pivot-nav")?.textContent).not.toContain("feed");
  });

  it("allows configuring plugins (settings, viewports, relays, inspector) in the system pivot", async () => {
    const pluginsList = panoramaRoot.querySelector("#panorama-plugins-list");
    expect(pluginsList).toBeTruthy();

    const cards = pluginsList?.querySelectorAll(".panorama-plugin-config-card");
    expect(cards?.length).toBe(mockPlugins.length);

    // Find timer plugin expand button
    const timerBtn = panoramaRoot.querySelector("#btn-expand-plugin-org-omni-plugin-timer") as HTMLButtonElement | null;
    expect(timerBtn).toBeTruthy();

    // Click expand button to reveal full configuration
    timerBtn?.click();

    // Verify settings button and mount container
    const btnSettings = panoramaRoot.querySelector("#btn-toggle-settings-org-omni-plugin-timer");
    expect(btnSettings).toBeTruthy();

    // Verify viewport and route selects
    const vpSelect = panoramaRoot.querySelector(".plugin-viewport-select") as HTMLSelectElement | null;
    expect(vpSelect).toBeTruthy();

    const routeSelect = panoramaRoot.querySelector(".plugin-route-select") as HTMLSelectElement | null;
    expect(routeSelect).toBeTruthy();

    // Verify relay scoping controls (3 options: all, custom, local-only)
    const relayRadios = panoramaRoot.querySelectorAll("input[name='panorama-relay-scope-org-omni-plugin-timer'][type='radio']");
    expect(relayRadios.length).toBe(3);
    const radAll = relayRadios[0] as HTMLInputElement;
    const radCustom = relayRadios[1] as HTMLInputElement;
    const radLocal = relayRadios[2] as HTMLInputElement;
    expect(radAll).toBeTruthy();
    expect(radCustom).toBeTruthy();
    expect(radLocal).toBeTruthy();

    // Test switching to Local Only
    radLocal.click();
    radLocal.dispatchEvent(new Event("change"));
    const timerPluginEntry = panoramaShell.installedPlugins.find((p) => p.id === "org.omni.plugin.timer")!;
    expect(timerPluginEntry.relays).toEqual([]);

    // Verify permissions & capabilities section
    const permSection = panoramaRoot.querySelector(".plugin-permissions-section");
    expect(permSection).toBeTruthy();
    expect(permSection?.textContent).toContain("Permissions & Capabilities");
    expect(permSection?.textContent).toContain("Scoped Storage (KV)");
    expect(permSection?.textContent).toContain("Intent Dispatch");
    expect(permSection?.textContent).toContain("Device Location (GPS)");
    expect(permSection?.textContent).toContain("Nostr Subscriptions (Read)");

    // Verify inspect button and modal
    const btnInspect = panoramaRoot.querySelector("#btn-inspect-org-omni-plugin-timer") as HTMLButtonElement | null;
    expect(btnInspect).toBeTruthy();
    btnInspect?.click();

    const inspectorModal = panoramaRoot.querySelector("#panorama-inspector-modal") as HTMLElement | null;
    expect(inspectorModal?.style.display).toBe("flex");
    expect(panoramaRoot.querySelector("#panorama-inspector-title")?.textContent).toContain("Focus Timer");

    // Close inspector modal
    const btnCloseInspector = panoramaRoot.querySelector("#btn-inspector-close") as HTMLButtonElement | null;
    btnCloseInspector?.click();
    expect(inspectorModal?.style.display).toBe("none");
  });

  it("dynamically updates top pivot navigation and canvas sections when assigning an app to main", async () => {
    // Initially, timer is in sidebar, pivots are feed, apps, widgets, system
    const pivotNav = panoramaRoot.querySelector("#panorama-pivot-nav");
    expect(pivotNav?.textContent).toContain("feed");
    expect(pivotNav?.textContent).toContain("apps");
    expect(pivotNav?.textContent).not.toContain("focus timer");

    // Now configure timer to main viewport
    const timerPlugin = panoramaShell.installedPlugins.find((p) => p.id === "org.omni.plugin.timer")!;
    expect(timerPlugin).toBeTruthy();
    timerPlugin.viewport = "main";
    timerPlugin.placements = [{ id: "main-pl", viewport: "main", route: "", viewId: "main", enabled: true }];
    await panoramaShell.remountPlugin(timerPlugin);

    // Verify dynamic pivot is added to top menu
    expect(pivotNav?.textContent).toContain("focus timer");

    // Verify canvas contains dedicated main section
    const timerCanvasSection = panoramaRoot.querySelector("#panorama-section-org-omni-plugin-timer");
    expect(timerCanvasSection).toBeTruthy();
    const timerSlot = timerCanvasSection?.querySelector("#panorama-slot-main-org-omni-plugin-timer");
    expect(timerSlot).toBeTruthy();

    // Verify getContainerForPluginSlot resolves directly to the canvas slot
    const resolved = panoramaShell.getContainerForPluginSlot("org.omni.plugin.timer", "main");
    expect(resolved).toBe(timerSlot);

    // Verify showPivot("apps") sets activePivot to "apps"
    panoramaShell.showPivot("apps");
    expect(panoramaShell.getActivePageId()).toBe("apps");
  });

  it("mounts companion workspace widgets into widgets slot when calling ensureWidgetsMounted or showPivot('widgets')", async () => {
    await panoramaShell.ensureWidgetsMounted();
    const widgetsSlot = panoramaRoot.querySelector("#panorama-widgets-slot");
    expect(widgetsSlot).toBeTruthy();
  });

  it("renders accent color chooser in system section with preset swatches (not in header)", () => {
    const systemCard = panoramaRoot.querySelector("#panorama-accent-card");
    expect(systemCard).toBeTruthy();
    const systemSwatches = panoramaRoot.querySelectorAll("#panorama-system-swatches-grid .panorama-color-swatch");
    expect(systemSwatches.length).toBe(14);

    const headerColorBtn = panoramaRoot.querySelector("#btn-panorama-header-color");
    expect(headerColorBtn).toBeFalsy();
  });

  it("applies selected accent color, updates CSS variables, and persists to localStorage", () => {
    const emeraldSwatch = Array.from(panoramaRoot.querySelectorAll<HTMLButtonElement>("#panorama-system-swatches-grid .panorama-color-swatch"))
      .find((s) => s.dataset.color?.toLowerCase() === "#2ecc71");
    expect(emeraldSwatch).toBeTruthy();

    emeraldSwatch?.click();

    expect(panoramaShell.getAccentColor()).toBe("#2ECC71");
    expect(document.documentElement.style.getPropertyValue("--omni-accent-primary")).toBe("#2ECC71");
    expect(document.documentElement.style.getPropertyValue("--omni-accent")).toBe("#2ECC71");
    expect(document.documentElement.style.getPropertyValue("--accent-primary")).toBe("#2ECC71");
    expect(localStorage.getItem(PanoramaShell.STORAGE_KEY_PANORAMA_ACCENT)).toBe("#2ECC71");
    expect(emeraldSwatch?.classList.contains("active")).toBe(true);

    const activeShellBtn = panoramaRoot.querySelector("#panorama-shell-switcher-buttons .btn-panorama-action.active");
    expect(activeShellBtn).toBeTruthy();

    const hexLabel = panoramaRoot.querySelector("#panorama-system-color-hex");
    expect(hexLabel?.textContent).toBe("#2ECC71");
  });

  it("supports custom color input selection", () => {
    const customInput = panoramaRoot.querySelector("#panorama-system-custom-color") as HTMLInputElement | null;
    expect(customInput).toBeTruthy();

    if (customInput) {
      customInput.value = "#8e44ad";
      customInput.dispatchEvent(new Event("input"));
    }

    expect(panoramaShell.getAccentColor()).toBe("#8E44AD");
    expect(document.documentElement.style.getPropertyValue("--omni-accent-primary")).toBe("#8E44AD");
    expect(localStorage.getItem(PanoramaShell.STORAGE_KEY_PANORAMA_ACCENT)).toBe("#8E44AD");
  });

  it("restores saved accent color from localStorage on mount", () => {
    localStorage.setItem(PanoramaShell.STORAGE_KEY_PANORAMA_ACCENT, "#F39C12");

    const testRoot = document.createElement("div");
    document.body.appendChild(testRoot);
    const testShell = new PanoramaShell({
      root: testRoot,
      kernel: panoramaKernel,
      installedPlugins: []
    });
    testShell.mount();

    expect(testShell.getAccentColor()).toBe("#F39C12");
    expect(document.documentElement.style.getPropertyValue("--omni-accent-primary")).toBe("#F39C12");

    testShell.destroy();
    testRoot.remove();
  });

  it("renders curated app store catalog in PanoramaShell and installs featured app", async () => {
    const installBtn = panoramaRoot.querySelector("#btn-panorama-install") as HTMLButtonElement | null;
    expect(installBtn).toBeTruthy();

    const catalog = panoramaRoot.querySelector("#panorama-curated-catalog");
    expect(catalog).toBeTruthy();
    expect(catalog?.children.length).toBeGreaterThan(0);

    const firstInstallBtn = catalog?.querySelector("button") as HTMLButtonElement | null;
    expect(firstInstallBtn).toBeTruthy();
    expect(firstInstallBtn?.textContent).toBe("Install");

    firstInstallBtn?.click();
    for (let i = 0; i < 20; i++) {
      if (firstInstallBtn?.textContent === "Installed") break;
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(firstInstallBtn?.textContent).toBe("Installed");
    expect(panoramaShell.installedPlugins.some((p) => p.name === "Cypherpunk Wisdom")).toBe(true);
  });

  it("renders compact live tiles for plugins declaring a compact view tier", async () => {
    const compactPlugin: InstalledPluginEntry = {
      id: "org.omni.plugin.live-status",
      name: "Live Status",
      version: "1.0.0",
      entry: "index.html",
      views: [
        { id: "main", title: "Full View", path: "" },
        { id: "compact", title: "Live Tile", path: "?view=compact" }
      ],
      scriptContent: "console.log('compact live tile');",
      sourceUrl: "local:@omni/plugin-live-status",
      enabled: true,
      viewport: ""
    };

    const testRoot = document.createElement("div");
    document.body.appendChild(testRoot);
    const testShell = new PanoramaShell({
      root: testRoot,
      kernel: panoramaKernel,
      installedPlugins: [compactPlugin]
    });
    testShell.mount();

    const tile = testRoot.querySelector(`.panorama-tile[data-plugin-id="${compactPlugin.id}"]`);
    expect(tile).toBeTruthy();
    expect(tile?.classList.contains("has-compact-view")).toBe(true);

    const compactContainer = testRoot.querySelector("#panorama-tile-compact-org-omni-plugin-live-status");
    expect(compactContainer).toBeTruthy();

    testShell.destroy();
    testRoot.remove();
  });

  it("opens unpinned apps in a horizontal dynamic app pane with dynamic pivot header", async () => {
    expect(panoramaRoot.querySelector("#panorama-section-dynamic-app")).toBeFalsy();
    expect(panoramaRoot.querySelector(".panorama-dynamic-pivot")).toBeFalsy();

    await panoramaShell.openApp("org.omni.plugin.timer");

    // Dynamic pane exists immediately after apps without redundant inner header
    const dynamicPane = panoramaRoot.querySelector("#panorama-section-dynamic-app");
    expect(dynamicPane).toBeTruthy();
    expect(dynamicPane?.querySelector(".panorama-dynamic-pane-header")).toBeFalsy();

    // Dynamic pivot header tab exists next to apps with close button
    const dynamicPivot = panoramaRoot.querySelector(".panorama-dynamic-pivot");
    expect(dynamicPivot).toBeTruthy();
    expect(dynamicPivot?.textContent?.toLowerCase()).toContain("focus timer");
    expect(dynamicPivot?.querySelector(".dynamic-pivot-close")).toBeTruthy();

    // Header close button is visible
    const headerCloseBtn = panoramaRoot.querySelector("#btn-header-close-app") as HTMLElement | null;
    expect(headerCloseBtn).toBeTruthy();
    expect(headerCloseBtn?.style.display).toBe("inline-flex");

    // Close app via header close button returns to apps launcher and cleans up with subtle fade out
    headerCloseBtn?.click();
    expect(panoramaShell.getCurrentOpenedAppId()).toBeNull();
    expect(headerCloseBtn?.style.display).toBe("none");
    expect(dynamicPane?.classList.contains("pane-closing")).toBe(true);
    await new Promise((r) => setTimeout(r, 260));
    expect(panoramaRoot.querySelector("#panorama-section-dynamic-app")).toBeFalsy();
    expect(panoramaRoot.querySelector(".panorama-dynamic-pivot")).toBeFalsy();

    // Test closing via dynamic pivot close button
    await panoramaShell.openApp("org.omni.plugin.timer");
    const dynamicPivot2 = panoramaRoot.querySelector(".panorama-dynamic-pivot");
    const pivotCloseBtn = dynamicPivot2?.querySelector(".dynamic-pivot-close") as HTMLElement | null;
    expect(pivotCloseBtn).toBeTruthy();
    pivotCloseBtn?.click();
    expect(panoramaShell.getCurrentOpenedAppId()).toBeNull();
    await new Promise((r) => setTimeout(r, 260));
  });

  it("opens and dismisses long-press context menu on tiles with quick actions", () => {
    const targetPlugin = panoramaShell.installedPlugins[0];
    expect(document.getElementById("panorama-tile-context-menu")).toBeFalsy();

    // Trigger context menu
    panoramaShell.openTileContextMenu(targetPlugin, 150, 200);

    const menu = document.getElementById("panorama-tile-context-menu");
    const backdrop = document.getElementById("panorama-tile-context-backdrop");
    expect(menu).toBeTruthy();
    expect(backdrop).toBeTruthy();

    const items = Array.from(menu?.querySelectorAll(".context-menu-item") || []).map((el) => el.textContent?.trim());
    expect(items.some((t) => t?.includes("Pivots"))).toBe(true);
    expect(items.some((t) => t?.includes("Widget"))).toBe(true);
    expect(items.some((t) => t?.includes("App Info"))).toBe(true);

    // Dismiss context menu
    panoramaShell.closeTileContextMenu();
    expect(document.getElementById("panorama-tile-context-menu")).toBeFalsy();
  });

  it("renders desktop edge hover gliders and navigates adjacent pivots", () => {
    const gliderLeft = panoramaRoot.querySelector("#panorama-glider-left");
    const gliderRight = panoramaRoot.querySelector("#panorama-glider-right");
    expect(gliderLeft).toBeTruthy();
    expect(gliderRight).toBeTruthy();

    // Glider left is disabled when at the start
    panoramaShell.updateEdgeGliders();
    expect(gliderLeft?.classList.contains("disabled")).toBe(true);
  });

  it("renders metro bottom application bar with compose, refresh, search, and more menu", () => {
    const bottomBar = panoramaRoot.querySelector("#panorama-bottom-app-bar");
    expect(bottomBar).toBeTruthy();

    const btnCompose = panoramaRoot.querySelector("#btn-app-bar-compose");
    const btnRefresh = panoramaRoot.querySelector("#btn-app-bar-refresh");
    const btnSearch = panoramaRoot.querySelector("#btn-app-bar-search");
    const btnMore = panoramaRoot.querySelector("#btn-app-bar-more") as HTMLButtonElement | null;
    expect(btnCompose).toBeTruthy();
    expect(btnRefresh).toBeTruthy();
    expect(btnSearch).toBeTruthy();
    expect(btnMore).toBeTruthy();

    // Toggle more menu
    const menu = panoramaRoot.querySelector("#panorama-app-bar-menu") as HTMLElement | null;
    expect(menu?.style.display).toBe("none");

    btnMore?.click();
    expect(menu?.style.display).toBe("flex");
  });

  it("hides widgets section and omits widgets pivot tab when no companion widgets are assigned", () => {
    const testRoot = document.createElement("div");
    document.body.appendChild(testRoot);
    const testKernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
    const noWidgetPlugins = mockPlugins.map((p) => ({ ...p, viewport: "", placements: [] }));
    const testShell = new PanoramaShell({
      root: testRoot,
      kernel: testKernel,
      installedPlugins: noWidgetPlugins
    });
    testShell.mount();

    // Verify widgets section is hidden
    const sectionWidgets = testRoot.querySelector("#panorama-section-widgets") as HTMLElement;
    expect(sectionWidgets?.style.display).toBe("none");

    // Verify widgets pivot item is omitted from top pivot navigation
    const pivotItems = Array.from(testRoot.querySelectorAll(".panorama-pivot-item")).map(
      (el) => el.textContent?.trim()
    );
    expect(pivotItems).not.toContain("widgets");

    // Dynamic appearance when a widget is assigned
    const timer = testShell.installedPlugins.find((p) => p.id === "org.omni.plugin.timer")!;
    timer.placements = [{ id: "timer-widget-1", viewport: "sidebar", route: "?view=widget", viewId: "widget", enabled: true }];
    (testShell as any).onWorkspaceUpdated();

    expect(sectionWidgets?.style.display).toBe("");
    const updatedPivots = Array.from(testRoot.querySelectorAll(".panorama-pivot-item")).map(
      (el) => el.textContent?.trim()
    );
    expect(updatedPivots).toContain("widgets");

    // Dynamic removal when widget is unassigned again
    timer.placements = [];
    (testShell as any).onWorkspaceUpdated();
    expect(sectionWidgets?.style.display).toBe("none");
    const finalPivots = Array.from(testRoot.querySelectorAll(".panorama-pivot-item")).map(
      (el) => el.textContent?.trim()
    );
    expect(finalPivots).not.toContain("widgets");

    testShell.destroy();
    testRoot.remove();
  });

  it("does not create empty canvas sections or pivot headers for unopened plugins", () => {
    const testRoot = document.createElement("div");
    document.body.appendChild(testRoot);
    const testKernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });

    // Multi-plugin setup simulating apps/web: Feed has viewport: "main", other plugins have no viewport
    const realisticPlugins: InstalledPluginEntry[] = [
      {
        id: "org.omni.plugin.feed",
        name: "Feed",
        viewport: "main",
        pinned: true,
        enabled: true,
        manifest: { id: "org.omni.plugin.feed", name: "Feed", version: "1.0.0", entry: "dist/index.js" },
        scriptContent: "console.log('feed');",
        sourceUrl: "local:@omni/plugin-feed"
      },
      {
        id: "org.omni.plugin.checklist",
        name: "Tasks",
        pinned: true,
        enabled: true,
        manifest: { id: "org.omni.plugin.checklist", name: "Tasks", version: "1.0.0", entry: "dist/index.js" },
        scriptContent: "console.log('tasks');",
        sourceUrl: "local:@omni/plugin-checklist"
      },
      {
        id: "org.omni.plugin.relays",
        name: "Relays",
        pinned: true,
        enabled: true,
        manifest: { id: "org.omni.plugin.relays", name: "Relays", version: "1.0.0", entry: "dist/index.js" },
        scriptContent: "console.log('relays');",
        sourceUrl: "local:@omni/plugin-relays"
      },
      {
        id: "org.omni.plugin.profile-viewer",
        name: "Profiles",
        pinned: true,
        enabled: true,
        manifest: { id: "org.omni.plugin.profile-viewer", name: "Profiles", version: "1.0.0", entry: "dist/index.js" },
        scriptContent: "console.log('profiles');",
        sourceUrl: "local:@omni/plugin-profile-viewer"
      }
    ];

    const testShell = new PanoramaShell({
      root: testRoot,
      kernel: testKernel,
      installedPlugins: realisticPlugins
    });
    testShell.mount();

    // Verify only Feed has a permanent main section; no empty sections for Tasks, Relays, Profiles
    expect(testRoot.querySelector("#panorama-section-org-omni-plugin-feed")).toBeTruthy();
    expect(testRoot.querySelector("#panorama-section-org-omni-plugin-checklist")).toBeFalsy();
    expect(testRoot.querySelector("#panorama-section-org-omni-plugin-relays")).toBeFalsy();
    expect(testRoot.querySelector("#panorama-section-org-omni-plugin-profile-viewer")).toBeFalsy();

    // Verify top pivot headers: only feed, apps, system
    const pivotItems = Array.from(testRoot.querySelectorAll(".panorama-pivot-item")).map(
      (el) => el.textContent?.trim().toLowerCase()
    );
    expect(pivotItems).toContain("feed");
    expect(pivotItems).toContain("apps");
    expect(pivotItems).toContain("system");
    expect(pivotItems).not.toContain("tasks");
    expect(pivotItems).not.toContain("relays");
    expect(pivotItems).not.toContain("profiles");

    testShell.destroy();
    testRoot.remove();
  });

  it("dynamically omits Manage Relays and Compose from bottom bar when corresponding plugins are absent", () => {
    const testRoot = document.createElement("div");
    document.body.appendChild(testRoot);
    const testKernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
    const minimalPlugins = mockPlugins.filter(
      (p) => p.id !== "org.omni.plugin.relays" && p.id !== "org.omni.plugin.feed"
    );
    const testShell = new PanoramaShell({
      root: testRoot,
      kernel: testKernel,
      installedPlugins: minimalPlugins.map((p) => ({ ...p }))
    });
    testShell.mount();

    const btnCompose = testRoot.querySelector("#btn-app-bar-compose");
    expect(btnCompose).toBeFalsy();

    const btnMenuRelays = testRoot.querySelector("#btn-app-bar-menu-relays");
    expect(btnMenuRelays).toBeFalsy();

    // System and Sync menu items still exist
    const btnMenuSystem = testRoot.querySelector("#btn-app-bar-menu-system");
    const btnMenuSync = testRoot.querySelector("#btn-app-bar-menu-sync");
    expect(btnMenuSystem).toBeTruthy();
    expect(btnMenuSync).toBeTruthy();

    testShell.destroy();
    testRoot.remove();
  });

  it("renders compact live tile containers in apps grid and populates them", async () => {
    const timerTile = panoramaRoot.querySelector('.panorama-tile[data-plugin-id="org.omni.plugin.timer"]');
    expect(timerTile).toBeTruthy();
    expect(timerTile?.classList.contains("has-compact-view")).toBe(true);

    const compactContainer = panoramaRoot.querySelector("#panorama-tile-compact-org-omni-plugin-timer");
    expect(compactContainer).toBeTruthy();

    await panoramaShell.ensureCompactTilesMounted();
  });

  it("mounts pull-to-refresh indicator and triggers page reload on downward touch drag", () => {
    const pullEl = panoramaRoot.querySelector("#omni-pull-to-refresh");
    expect(pullEl).toBeTruthy();
    expect(pullEl?.textContent?.toLowerCase()).toContain("pull down to refresh");

    let reloaded = false;
    panoramaShell.reloadPage = () => {
      reloaded = true;
    };

    // 1. Simulate pull down gesture (past threshold 65px)
    window.dispatchEvent(new TouchEvent("touchstart", {
      touches: [{ clientX: 100, clientY: 50 } as any]
    }));

    window.dispatchEvent(new TouchEvent("touchmove", {
      cancelable: true,
      touches: [{ clientX: 100, clientY: 180 } as any]
    }));

    expect(pullEl?.classList.contains("ready")).toBe(true);
    expect(pullEl?.textContent?.toLowerCase()).toContain("release to refresh");

    // 2. Release to trigger refresh
    window.dispatchEvent(new TouchEvent("touchend", { touches: [] }));

    expect(pullEl?.classList.contains("is-refreshing")).toBe(true);
    expect(pullEl?.textContent?.toLowerCase()).toContain("refreshing");

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(reloaded).toBe(true);
        resolve();
      }, 320);
    });
  });

  it("cancels pull-to-refresh when swipe is predominantly horizontal", () => {
    const pullEl = panoramaRoot.querySelector("#omni-pull-to-refresh");
    expect(pullEl).toBeTruthy();

    let reloaded = false;
    panoramaShell.reloadPage = () => {
      reloaded = true;
    };

    window.dispatchEvent(new TouchEvent("touchstart", {
      touches: [{ clientX: 100, clientY: 50 } as any]
    }));

    window.dispatchEvent(new TouchEvent("touchmove", {
      cancelable: true,
      touches: [{ clientX: 250, clientY: 70 } as any]
    }));

    expect(pullEl?.classList.contains("ready")).toBe(false);

    window.dispatchEvent(new TouchEvent("touchend", { touches: [] }));
    expect(reloaded).toBe(false);
  });
});
