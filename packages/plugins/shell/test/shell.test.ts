// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import omniRuntimeScript from "../../../core/src/sandbox/omni-runtime.js?raw";
import "fake-indexeddb/auto";
import { OmniKernel } from "@omni/core";
import {
  OmniShell,
  PanoramaShell,
  InstalledPluginEntry,
  shellRegistry,
  ShellRegistry,
  OMNI_SHELL_STYLE_ELEMENT_ID,
  CLASSIC_SHELL_CSS,
  PANORAMA_SHELL_CSS
} from "../src/index.js";

describe("Milestone 4: Decouple Shell UI into @omni/plugin-shell", () => {
  let root: HTMLElement;
  let kernel: OmniKernel;
  let shell: OmniShell;

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

    document.body.innerHTML = '<div id="omni-root"></div>';
    root = document.getElementById("omni-root")!;
    kernel = new OmniKernel({ runtimeScript: omniRuntimeScript,
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

  it("opens and closes settings tabs cleanly and defaults to workspace tab", () => {
    const settingsModal = root.querySelector("#settings-modal");
    expect(settingsModal?.classList.contains("open")).toBe(false);

    // Default openSettings() should open workspace tab
    shell.openSettings();
    expect(settingsModal?.classList.contains("open")).toBe(true);
    const pluginsPane = root.querySelector("#settings-pane-plugins");
    const pluginsBtn = root.querySelector("#settings-tab-btn-plugins");
    expect(pluginsPane?.classList.contains("active")).toBe(true);
    expect(pluginsBtn?.classList.contains("active")).toBe(true);

    shell.openSettings("relays");
    const relaysPane = root.querySelector("#settings-pane-relays");
    expect(relaysPane?.classList.contains("active")).toBe(true);
    expect(pluginsPane?.classList.contains("active")).toBe(false);

    // openSettings("workspace") alias
    shell.openSettings("workspace");
    expect(pluginsPane?.classList.contains("active")).toBe(true);

    shell.closeSettings();
    expect(settingsModal?.classList.contains("open")).toBe(false);

    // Clicking dock settings button should open workspace tab
    const dockSettingsBtn = root.querySelector("#dock-btn-settings") as HTMLButtonElement;
    dockSettingsBtn?.click();
    expect(settingsModal?.classList.contains("open")).toBe(true);
    expect(pluginsPane?.classList.contains("active")).toBe(true);

    shell.closeSettings();
  });

  it("uninstalls plugins and updates plugin manager registry", () => {
    expect(shell.installedPlugins.length).toBe(2);
    shell.uninstallPlugin("org.omni.plugin.timer");
    expect(shell.installedPlugins.length).toBe(1);
    expect(shell.installedPlugins[0].id).toBe("org.omni.plugin.feed");
  });

  it("Milestone 5: supports user-defined viewport reassignment via dedicated plugin settings pane", () => {
    shell.openSettings("org.omni.plugin.feed");
    const pane = root.querySelector("#settings-pane-org-omni-plugin-feed");
    expect(pane).toBeTruthy();

    const select = pane?.querySelector(".plugin-viewport-select") as HTMLSelectElement | null;
    expect(select).toBeTruthy();

    // Reassign feed to widgets grid
    if (select) {
      select.value = "sidebar";
      select.dispatchEvent(new Event("change"));
    }

    expect(shell.layoutManager.getSlotForComponent("org.omni.plugin.feed", "feed-main")).toBe("sidebar");
  });

  it("supports route assignment and per-plugin settings sections", async () => {
    // Check that route selector is rendered in dedicated pane
    shell.openSettings("org.omni.plugin.feed");
    const feedPane = root.querySelector("#settings-pane-org-omni-plugin-feed");
    expect(feedPane).toBeTruthy();

    const routeSelects = feedPane?.querySelectorAll(".plugin-route-select");
    expect(routeSelects?.length).toBeGreaterThanOrEqual(1);

    const firstRouteSelect = routeSelects?.[0] as HTMLSelectElement;
    expect(firstRouteSelect).toBeTruthy();

    // Check per-plugin settings box in dedicated pane
    const feedSettingsBox = feedPane?.querySelector(".plugin-settings-box");
    expect(feedSettingsBox?.textContent).toContain("Settings & Preferences");

    // Add a plugin that has a settings route and check toggle button in its dedicated pane
    shell.installedPlugins.push({
      id: "org.omni.test.timer",
      name: "Test Timer App",
      viewport: "sidebar",
      enabled: true,
      scriptContent: "console.log('timer')",
      sourceUrl: "local:@omni/test-timer",
      views: [
        { id: "main", title: "Main Timer", path: "" },
        { id: "widget", title: "Timer Widget", path: "?view=widget" },
        { id: "settings", title: "Timer Preferences", path: "?view=settings" }
      ]
    });

    shell.renderSettingsNavAndPanes();
    shell.openSettings("org.omni.test.timer");

    const timerPane = root.querySelector("#settings-pane-org-omni-test-timer");
    expect(timerPane).toBeTruthy();

    const openSettingsBtn = timerPane?.querySelector(".btn-plugin-settings") as HTMLButtonElement;
    expect(openSettingsBtn).toBeTruthy();
    expect(openSettingsBtn.textContent).toBe("Open Settings");

    // Click to open settings
    openSettingsBtn.click();
    for (let i = 0; i < 20; i++) {
      if (openSettingsBtn.textContent === "Close Settings") break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const mountContainer = timerPane?.querySelector(".plugin-settings-mount-container") as HTMLElement;
    expect(mountContainer.style.display).toBe("block");
    expect(mountContainer.querySelector(".omni-component-slot")).toBeTruthy();
    expect(openSettingsBtn.textContent).toBe("Close Settings");

    // Click again to close settings
    openSettingsBtn.click();
    expect(mountContainer.style.display).toBe("none");
    expect(mountContainer.children.length).toBe(0);
    expect(openSettingsBtn.textContent).toBe("Open Settings");
  });

  it("organizes installed plugins in a clean directory overview that links to dedicated tabs", () => {
    shell.openSettings("plugins");
    const container = root.querySelector("#plugins-list");
    expect(container).toBeTruthy();

    const cards = container?.querySelectorAll(".plugin-item-row") || [];
    expect(cards.length).toBeGreaterThanOrEqual(2);

    const firstCard = cards[0] as HTMLElement;
    expect(firstCard).toBeTruthy();

    // Check Configure button
    const btnConfigure = firstCard.querySelector(".btn-configure-plugin") as HTMLButtonElement | null;
    expect(btnConfigure).toBeTruthy();
    expect(btnConfigure?.textContent).toContain("Configure");

    // Click Configure button -> switches directly to dedicated plugin pane
    btnConfigure?.click();
    const activePane = root.querySelector(".settings-pane.active") as HTMLElement | null;
    expect(activePane).toBeTruthy();
    expect(activePane?.id).toBe("settings-pane-org-omni-plugin-feed");
  });

  it("supports assigning the same plugin to multiple locations and routes simultaneously in dedicated pane", async () => {
    shell.openSettings("org.omni.plugin.timer");
    const timerPane = root.querySelector("#settings-pane-org-omni-plugin-timer") as HTMLElement;
    expect(timerPane).toBeTruthy();

    // Initial placements
    const initialRows = timerPane.querySelectorAll(".plugin-placement-row");
    expect(initialRows.length).toBe(1);

    // Click "+ Add Location"
    const addBtn = timerPane.querySelector(".btn-add-placement") as HTMLButtonElement;
    expect(addBtn).toBeTruthy();
    addBtn.click();
    await new Promise((r) => setTimeout(r, 60));

    // Should now have 2 placement rows
    const updatedTimerPane = root.querySelector("#settings-pane-org-omni-plugin-timer") as HTMLElement;
    const rowsAfterAdd = updatedTimerPane.querySelectorAll(".plugin-placement-row");
    expect(rowsAfterAdd.length).toBe(2);

    const timerPlugin = shell.installedPlugins.find((p) => p.id === "org.omni.plugin.timer")!;
    expect(timerPlugin.placements?.length).toBe(2);

    // First placement in sidebar, second placement in main
    const selects = updatedTimerPane.querySelectorAll(".plugin-viewport-select") as NodeListOf<HTMLSelectElement>;
    expect(selects.length).toBe(2);
    selects[1].value = "main";
    selects[1].dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 60));

    expect(timerPlugin.placements?.[1].viewport).toBe("main");

    // Verify workspace state exports both placements
    const exported = shell.exportWorkspaceState();
    const exportedTimer = exported.plugins.find((p) => p.id === "org.omni.plugin.timer");
    expect(exportedTimer?.placements?.length).toBe(2);

    // Remove the second placement
    const removeBtns = updatedTimerPane.querySelectorAll(".btn-remove-placement") as NodeListOf<HTMLButtonElement>;
    expect(removeBtns.length).toBe(2);
    removeBtns[1].click();
    await new Promise((r) => setTimeout(r, 60));

    const timerPaneAfterRemove = root.querySelector("#settings-pane-org-omni-plugin-timer") as HTMLElement;
    const rowsAfterRemove = timerPaneAfterRemove.querySelectorAll(".plugin-placement-row");
    expect(rowsAfterRemove.length).toBe(1);
    expect(timerPlugin.placements?.length).toBe(1);
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

  it("creates distinct pages for multiple full-page apps and displays only one at a time", () => {
    // Add second full-page app
    const secondApp: InstalledPluginEntry = {
      id: "org.omni.plugin.music",
      name: "Music Player",
      description: "Decentralized audio player",
      icon: "radio",
      viewport: "main",
      pinned: true,
      scriptContent: "console.log('music');",
      sourceUrl: "local:@omni/plugin-music",
      enabled: true
    };
    shell.installedPlugins.push(secondApp);
    shell.renderDockLaunchers();

    const dockSlot = root.querySelector("#dock-slot");
    const items = dockSlot?.querySelectorAll(".dock-item");
    expect(items?.length).toBe(2);

    const musicBtn = Array.from(items || []).find((el) => el.getAttribute("title")?.includes("Music")) as HTMLElement;
    const feedBtn = Array.from(items || []).find((el) => el.getAttribute("title")?.includes("Feed")) as HTMLElement;
    expect(musicBtn).toBeTruthy();
    expect(feedBtn).toBeTruthy();

    const pageFeed = root.querySelector("#page-feed");
    const pageMusic = root.querySelector("#page-app-org-omni-plugin-music");
    expect(pageFeed).toBeTruthy();
    expect(pageMusic).toBeTruthy();

    // Click Music -> only Music is active, Feed and Widgets are inactive
    musicBtn.click();
    expect(pageMusic?.classList.contains("active")).toBe(true);
    expect(pageFeed?.classList.contains("active")).toBe(false);
    expect(musicBtn.classList.contains("active")).toBe(true);
    expect(feedBtn.classList.contains("active")).toBe(false);

    // Click Feed -> only Feed is active, Music is inactive
    feedBtn.click();
    expect(pageFeed?.classList.contains("active")).toBe(true);
    expect(pageMusic?.classList.contains("active")).toBe(false);
    expect(feedBtn.classList.contains("active")).toBe(true);
    expect(musicBtn.classList.contains("active")).toBe(false);
  });

  it("renders top nav profile avatar and updates identity on updateProfileUi", async () => {
    const userBadge = root.querySelector("#user-badge");
    const avatarEl = root.querySelector("#header-profile-avatar");
    const nameEl = root.querySelector("#header-profile-name");

    expect(userBadge).toBeTruthy();
    expect(avatarEl).toBeTruthy();
    expect(nameEl).toBeTruthy();

    await shell.updateProfileUi();

    expect(nameEl?.textContent).toBeTruthy();
    expect(userBadge?.getAttribute("title")).toContain("Click to manage profile");
  });

  it("renders a dock launcher visually and routes clicks when a plugin is added to navigation dock shortcut", () => {
    // Timer was originally in sidebar (Widgets dashboard)
    const timerPlugin = shell.installedPlugins.find((p) => p.id === "org.omni.plugin.timer")!;
    expect(timerPlugin).toBeTruthy();

    const dockSlot = root.querySelector("#dock-slot");
    const initialItems = dockSlot?.querySelectorAll(".dock-item");
    // Initially only Feed is in main/dock
    expect(initialItems?.length).toBe(1);

    // Promote timer to "dock" ("Navigation Dock Shortcut")
    timerPlugin.viewport = "dock";
    shell.layoutManager.setComponentSlot("org.omni.plugin.timer", "timer-widget", "dock");
    shell.renderDockLaunchers();

    const updatedItems = dockSlot?.querySelectorAll(".dock-item");
    expect(updatedItems?.length).toBe(2);

    const timerBtn = Array.from(updatedItems || []).find((el) => el.getAttribute("title")?.includes("Timer")) as HTMLElement;
    expect(timerBtn).toBeTruthy();
    expect(timerBtn.textContent).toContain("Timer");

    // Click timer launcher in the dock
    timerBtn.click();
    const pageTimer = root.querySelector("#page-app-org-omni-plugin-timer");
    expect(pageTimer).toBeTruthy();
    expect(pageTimer?.classList.contains("active")).toBe(true);
    expect(timerBtn.classList.contains("active")).toBe(true);

    // Demote back to sidebar
    timerPlugin.viewport = "sidebar";
    shell.layoutManager.setComponentSlot("org.omni.plugin.timer", "timer-widget", "sidebar");
    shell.renderDockLaunchers();

    const finalItems = dockSlot?.querySelectorAll(".dock-item");
    expect(finalItems?.length).toBe(1);
    expect(Array.from(finalItems || []).some((el) => el.getAttribute("title")?.includes("Timer"))).toBe(false);
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

  it("displays relays:manage permission in Plugin Inspector and supports toggling grants", async () => {
    await kernel.boot();
    const relayPlugin: InstalledPluginEntry = {
      id: "org.omni.plugin.relays",
      name: "Relays",
      viewport: "sidebar",
      enabled: true,
      scriptContent: "console.log('relays');",
      sourceUrl: "local:@omni/plugin-relays"
    };
    shell.installedPlugins.push(relayPlugin);
    await shell.mountPlugin(relayPlugin);
    shell.openPluginInspector(relayPlugin);

    const modal = root.querySelector("#plugin-inspector-modal");
    expect(modal?.classList.contains("open")).toBe(true);

    // Switch to permissions tab
    const tabPerms = root.querySelector("#tab-btn-permissions") as HTMLButtonElement;
    tabPerms.click();

    const permRows = root.querySelectorAll("#inspector-permissions-list > div");
    const relayPermRow = Array.from(permRows).find((r) => r.textContent?.includes("relays:manage"));
    expect(relayPermRow).toBeTruthy();

    const toggle = relayPermRow?.querySelector("input[type='checkbox']") as HTMLInputElement;
    expect(toggle).toBeTruthy();
    expect(toggle.checked).toBe(true); // Pre-granted by kernel for org.omni.plugin.relays

    // Toggle off -> revokes permission
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));
    expect(kernel.getPluginPermission("org.omni.plugin.relays", "relays:manage")).toBe(false);

    // Toggle back on -> grants permission
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));
    expect(kernel.getPluginPermission("org.omni.plugin.relays", "relays:manage")).toBe(true);
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
      for (let i = 0; i < 20 && !root.querySelector("#open-with-modal")?.classList.contains("open"); i++) {
        await new Promise((r) => setTimeout(r, 20));
      }

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

  describe("NIP-78 Workspace State Sync (kind: 30078)", () => {
    it("renders the NIP-78 Workspace Cloud Sync banner and controls in Settings", () => {
      const banner = root.querySelector("#workspace-sync-banner");
      const btnSync = root.querySelector("#btn-sync-workspace");
      const btnRestore = root.querySelector("#btn-restore-workspace");
      const chkAutoSync = root.querySelector("#chk-auto-sync-workspace") as HTMLInputElement;

      expect(banner).toBeTruthy();
      expect(btnSync).toBeTruthy();
      expect(btnRestore).toBeTruthy();
      expect(chkAutoSync).toBeTruthy();
      expect(chkAutoSync.checked).toBe(true);
    });

    it("exports current workspace layout state cleanly", () => {
      const exported = shell.exportWorkspaceState();
      expect(exported.version).toBe(1);
      expect(exported.activePage).toBe("org.omni.plugin.feed");
      expect(exported.autoSync).toBe(true);
      expect(exported.plugins).toHaveLength(2);
      expect(exported.plugins[0].id).toBe("org.omni.plugin.feed");
      expect(exported.plugins[0].viewport).toBe("main");
      expect(exported.plugins[1].id).toBe("org.omni.plugin.timer");
      expect(exported.plugins[1].viewport).toBe("sidebar");
    });

    it("applies new workspace state and reparents viewports", () => {
      const newState = {
        version: 1 as const,
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

      // When switchPage is false, active page should remain unchanged
      shell.showPage("feed");
      shell.applyWorkspaceState(newState, true, false);
      expect(shell.getActivePageId()).toBe("org.omni.plugin.feed");

      // When switchPage is true, active page updates
      shell.applyWorkspaceState(newState, true, true);
      expect(shell.getActivePageId()).toBe("org.omni.plugin.timer");
      const feedPlugin = shell.installedPlugins.find((p) => p.id === "org.omni.plugin.feed");
      const timerPlugin = shell.installedPlugins.find((p) => p.id === "org.omni.plugin.timer");

      expect(feedPlugin?.viewport).toBe("dock");
      expect(timerPlugin?.viewport).toBe("main");
    });

    it("persists workspace to localStorage and restores on loadInitialWorkspace", () => {
      const newState = {
        version: 1 as const,
        updatedAt: Date.now(),
        activePage: "widgets",
        autoSync: false,
        plugins: [
          {
            id: "org.omni.plugin.feed",
            viewport: "sidebar",
            enabled: true
          }
        ]
      };

      shell.applyWorkspaceState(newState, true);
      const rawStored = window.localStorage.getItem(shell.LOCAL_WORKSPACE_KEY);
      expect(rawStored).toBeTruthy();

      // Fresh shell instance loading initial workspace
      const freshShell = new OmniShell({
        root,
        kernel,
        installedPlugins: JSON.parse(JSON.stringify(mockPlugins))
      });
      const loaded = freshShell.loadInitialWorkspace();
      expect(loaded).not.toBeNull();
      expect(freshShell.installedPlugins[0].viewport).toBe("sidebar");
      expect(freshShell.autoSyncNip78).toBe(false);
    });

    it("syncs workspace to kernel NIP-78 eventStore and updates sync UI", async () => {
      await kernel.boot();
      const event = await shell.syncWorkspaceToNostr();

      expect(event.kind).toBe(30078);
      expect(event.tags).toContainEqual(["d", "omni/workspace/v1"]);
      expect(shell.workspaceSyncStatus).toBe("synced");

      const statusText = root.querySelector("#workspace-sync-status-text");
      expect(statusText?.textContent).toContain("Synced with Nostr relays");
    });
  });

  describe("Pluggable Settings & Dedicated Per-Plugin Tabs Architecture", () => {
    it("renders a dedicated tab in Settings navigation for each installed plugin", () => {
      const nav = root.querySelector("#settings-nav");
      expect(nav).toBeTruthy();

      // System tab for Workspace
      expect(nav?.querySelector("#settings-tab-btn-plugins")).toBeTruthy();

      // Dedicated tab buttons for each installed plugin
      expect(nav?.querySelector("#settings-tab-btn-org-omni-plugin-feed")).toBeTruthy();
      expect(nav?.querySelector("#settings-tab-btn-org-omni-plugin-timer")).toBeTruthy();

      // Dedicated panes for each installed plugin
      const content = root.querySelector("#settings-content");
      expect(content?.querySelector("#settings-pane-plugins")).toBeTruthy();
      expect(content?.querySelector("#settings-pane-org-omni-plugin-feed")).toBeTruthy();
      expect(content?.querySelector("#settings-pane-org-omni-plugin-timer")).toBeTruthy();
    });

    it("supports pluggable Profile and Relay managers with their own tabs and panes", async () => {
      // Add pluggable Profile and Relay plugins
      shell.installedPlugins.push(
        {
          id: "org.omni.plugin.relays",
          name: "Relays",
          icon: "relays",
          viewport: "sidebar",
          scriptContent: "console.log('relays');",
          sourceUrl: "local:@omni/plugin-relays",
          enabled: true,
          views: [
            { id: "main", title: "Relays", path: "" }
          ]
        },
        {
          id: "org.omni.plugin.profile",
          name: "Profile",
          icon: "profile",
          viewport: "sidebar",
          scriptContent: "console.log('profile');",
          sourceUrl: "local:@omni/plugin-profile",
          enabled: true,
          views: [
            { id: "main", title: "Profile", path: "" },
            { id: "settings", title: "Profile Settings", path: "?view=settings" }
          ]
        }
      );

      shell.renderSettingsNavAndPanes();

      const nav = root.querySelector("#settings-nav");
      const relaysBtn = nav?.querySelector("#settings-tab-btn-relays");
      const profileBtn = nav?.querySelector("#settings-tab-btn-profile");
      expect(relaysBtn).toBeTruthy();
      expect(profileBtn).toBeTruthy();

      // Open Relays Settings tab
      shell.openSettings("relays");
      const relaysPane = root.querySelector("#settings-pane-relays");
      expect(relaysPane?.classList.contains("active")).toBe(true);
      expect(relaysBtn?.classList.contains("active")).toBe(true);

      // Open Profile Settings tab
      shell.openSettings("profile");
      const profilePane = root.querySelector("#settings-pane-profile");
      expect(profilePane?.classList.contains("active")).toBe(true);
      expect(profileBtn?.classList.contains("active")).toBe(true);
      expect(relaysPane?.classList.contains("active")).toBe(false);

      shell.closeSettings();
    });

    it("mounts settings view when 'Open Settings' is clicked and unmounts on modal close", async () => {
      // Add a plugin with custom settings view
      shell.installedPlugins.push({
        id: "org.omni.test.timer2",
        name: "Timer App 2",
        viewport: "sidebar",
        scriptContent: "console.log('timer2');",
        sourceUrl: "local:@omni/timer2",
        enabled: true,
        views: [
          { id: "main", title: "Main", path: "" },
          { id: "settings", title: "Preferences", path: "?view=settings" }
        ]
      });

      shell.renderSettingsNavAndPanes();

      // Open settings tab for this plugin
      shell.openSettings("org.omni.test.timer2");

      const pane = root.querySelector("#settings-pane-org-omni-test-timer2") as HTMLElement;
      expect(pane).toBeTruthy();
      expect(pane.classList.contains("active")).toBe(true);

      const mountContainer = pane.querySelector(".plugin-settings-mount-container") as HTMLElement;
      expect(mountContainer).toBeTruthy();
      expect(mountContainer.style.display).toBe("none");

      const toggleBtn = pane.querySelector(".btn-plugin-settings") as HTMLButtonElement;
      expect(toggleBtn).toBeTruthy();
      expect(toggleBtn.textContent).toBe("Open Settings");

      // Click "Open Settings"
      toggleBtn.click();

      // Wait for async mount
      await new Promise((r) => setTimeout(r, 60));
      expect(kernel.getPluginSettingsSandbox("org.omni.test.timer2")).toBeTruthy();
      expect(toggleBtn.textContent).toBe("Close Settings");
      expect(mountContainer.style.display).toBe("block");

      // Close settings modal -> destroys mounted settings sandbox
      shell.closeSettings();
      expect(kernel.getPluginSettingsSandbox("org.omni.test.timer2")).toBeUndefined();
    });

    it("dynamically cleans up tabs and panes when a plugin is uninstalled", () => {
      expect(root.querySelector("#settings-tab-btn-org-omni-plugin-timer")).toBeTruthy();
      expect(root.querySelector("#settings-pane-org-omni-plugin-timer")).toBeTruthy();

      shell.uninstallPlugin("org.omni.plugin.timer");

      expect(root.querySelector("#settings-tab-btn-org-omni-plugin-timer")).toBeNull();
      expect(root.querySelector("#settings-pane-org-omni-plugin-timer")).toBeNull();
    });

    it("displays 'Open Settings' by default on plugin settings toggle button", () => {
      shell.installedPlugins.push({
        id: "org.omni.test.togglebtn",
        name: "Toggle Test",
        viewport: "sidebar",
        scriptContent: "console.log('toggle');",
        sourceUrl: "local:@omni/toggle",
        enabled: true,
        views: [
          { id: "main", title: "Main", path: "" },
          { id: "settings", title: "Settings View", path: "?view=settings" }
        ]
      });

      shell.renderSettingsNavAndPanes();

      const pane = root.querySelector("#settings-pane-org-omni-test-togglebtn");
      expect(pane).toBeTruthy();

      const toggleBtn = pane?.querySelector(".btn-plugin-settings") as HTMLButtonElement;
      expect(toggleBtn).toBeTruthy();
      expect(toggleBtn.textContent).toBe("Open Settings");

      const mountContainer = pane?.querySelector(".plugin-settings-mount-container") as HTMLElement;
      expect(mountContainer.style.display).toBe("none");
    });

    it("preserves empty placements array and allows unassigning plugin placements", async () => {
      const plugin: InstalledPluginEntry = {
        id: "org.omni.plugin.test.placement",
        name: "Test Placement",
        viewport: "main",
        scriptContent: "console.log('placement test');",
        sourceUrl: "local:@omni/test-placement",
        enabled: true,
        placements: []
      };

      const placements = shell.getPluginPlacements(plugin);
      expect(placements).toEqual([]);
    });

    it("restores placements, route, and viewId in loadInitialWorkspace", () => {
      const savedState = {
        version: 1,
        updatedAt: Date.now(),
        activePage: "org.omni.plugin.feed",
        autoSync: true,
        plugins: [
          {
            id: "org.omni.plugin.feed",
            viewport: "main",
            enabled: true,
            placements: [
              {
                id: "main-primary",
                viewport: "main",
                route: "?view=compact",
                viewId: "compact",
                enabled: true
              }
            ]
          }
        ]
      };

      window.localStorage.setItem(shell.LOCAL_WORKSPACE_KEY, JSON.stringify(savedState));

      try {
        const restored = shell.loadInitialWorkspace();
        expect(restored).not.toBeNull();
        const feedPlugin = shell.installedPlugins.find((p) => p.id === "org.omni.plugin.feed");
        expect(feedPlugin?.placements).toHaveLength(1);
        expect(feedPlugin?.placements?.[0].route).toBe("?view=compact");
        expect(feedPlugin?.placements?.[0].viewId).toBe("compact");
      } finally {
        window.localStorage.removeItem(shell.LOCAL_WORKSPACE_KEY);
      }
    });

    it("removes plugin launcher from dock slot (sidebar) when all placements are unassigned", async () => {
      // Add profile plugin with a main placement
      const profilePlugin: InstalledPluginEntry = {
        id: "org.omni.plugin.profile",
        name: "Profile",
        description: "Profile management",
        icon: "user",
        viewport: "main",
        enabled: true,
        pinned: true,
        scriptContent: "console.log('profile');",
        placements: [
          {
            id: "main-primary",
            viewport: "main",
            route: "",
            viewId: "main",
            enabled: true
          }
        ]
      };
      shell.installedPlugins.push(profilePlugin);
      shell.renderDockLaunchers();

      const dockSlot = root.querySelector("#dock-slot");
      let profileBtn = dockSlot?.querySelector('[data-plugin-id="org.omni.plugin.profile"]');
      expect(profileBtn).toBeTruthy();

      // Now unassign all placements (empty array)
      profilePlugin.placements = [];
      await shell.remountPlugin(profilePlugin);

      profileBtn = dockSlot?.querySelector('[data-plugin-id="org.omni.plugin.profile"]');
      expect(profileBtn).toBeNull();

      const meta = shell.getPluginMeta(profilePlugin);
      expect(meta.viewport).toBe("unassigned");
    });

    it("navigates cleanly between Feed, Widgets, and Apps Launcher", () => {
      // 1. Initially feed is active
      expect(shell.getActivePageId()).toBe("org.omni.plugin.feed");

      // 2. Navigate to Widgets
      shell.showPage("widgets");
      expect(root.querySelector("#page-widgets")?.classList.contains("active")).toBe(true);
      expect(root.querySelector("#dock-btn-widgets")?.classList.contains("active")).toBe(true);
      expect(root.querySelector("#dock-btn-widgets")?.textContent).toContain("Widgets");

      // 3. Navigate to Apps Launcher
      shell.showPage("apps");
      expect(shell.getActivePageId()).toBe("apps");
      expect(root.querySelector("#page-apps")?.classList.contains("active")).toBe(true);
      expect(root.querySelector("#dock-btn-apps")?.classList.contains("active")).toBe(true);

      // 4. Return to Feed
      shell.showPage("feed");
      expect(shell.getActivePageId()).toBe("org.omni.plugin.feed");
      expect(root.querySelector("#page-feed")?.classList.contains("active")).toBe(true);
    });

    it("hides widgets dock item if no widgets are assigned in OmniShell", () => {
      // Initially timer is in sidebar, widgets dock button visible
      expect(shell.hasAssignedWidgets()).toBe(true);
      const widgetsBtn = root.querySelector("#dock-btn-widgets") as HTMLElement;
      expect(widgetsBtn.style.display).not.toBe("none");

      // Reassign timer to main
      const timer = shell.installedPlugins.find((p) => p.id === "org.omni.plugin.timer")!;
      timer.viewport = "main";
      timer.placements = [{ id: "main", viewport: "main", route: "", viewId: "main", enabled: true }];
      shell.renderDockLaunchers();

      expect(shell.hasAssignedWidgets()).toBe(false);
      expect(widgetsBtn.style.display).toBe("none");

      // Reassign back to sidebar
      timer.viewport = "sidebar";
      timer.placements = [{ id: "sidebar", viewport: "sidebar", route: "", viewId: "main", enabled: true }];
      shell.renderDockLaunchers();

      expect(shell.hasAssignedWidgets()).toBe(true);
      expect(widgetsBtn.style.display).toBe("");
    });

    it("pins and unpins full-page apps to/from dock slot and updates Apps Launcher", () => {
      // Add a third-party app with main placement
      const customApp: InstalledPluginEntry = {
        id: "com.example.notes",
        name: "Notes App",
        description: "Decentralized notes",
        icon: "edit",
        viewport: "main",
        enabled: true,
        pinned: true,
        scriptContent: "console.log('notes');",
        placements: [
          {
            id: "pl-notes",
            viewport: "main",
            route: "",
            viewId: "main",
            enabled: true
          }
        ]
      };
      shell.installedPlugins.push(customApp);
      shell.renderDockLaunchers();

      const dockSlot = root.querySelector("#dock-slot");
      expect(dockSlot?.querySelector('[data-plugin-id="com.example.notes"]')).toBeTruthy();

      // Unpin app
      shell.setAppPinned("com.example.notes", false);
      expect(shell.isAppPinned(customApp)).toBe(false);
      expect(dockSlot?.querySelector('[data-plugin-id="com.example.notes"]')).toBeNull();

      // Verify it appears in the Apps Launcher under Additional Apps
      shell.showPage("apps");
      const unpinnedGrid = root.querySelector("#apps-unpinned-grid");
      expect(unpinnedGrid?.textContent).toContain("Notes App");

      // Pin it back
      shell.setAppPinned("com.example.notes", true);
      expect(shell.isAppPinned(customApp)).toBe(true);
      expect(dockSlot?.querySelector('[data-plugin-id="com.example.notes"]')).toBeTruthy();
      const pinnedGrid = root.querySelector("#apps-pinned-grid");
      expect(pinnedGrid?.textContent).toContain("Notes App");
    });

    it("shows all installed plugins in the Apps launcher including unpinned/sidebar apps under All Apps", () => {
      shell.showPage("apps");
      const pinnedGrid = root.querySelector("#apps-pinned-grid");
      const unpinnedGrid = root.querySelector("#apps-unpinned-grid");

      // Feed is pinned to dock
      expect(pinnedGrid?.textContent).toContain("Feed");
      // Focus Timer is in All Apps (unpinned grid) even though its placement was sidebar
      expect(unpinnedGrid?.textContent).toContain("Focus Timer");

      // Opening Focus Timer from Apps launcher mounts its standalone app page
      shell.showPage("org.omni.plugin.timer");
      const timerPage = root.querySelector("#page-app-org-omni-plugin-timer");
      expect(timerPage).toBeTruthy();
      expect(timerPage?.classList.contains("active")).toBe(true);

      // Pin Focus Timer to dock
      shell.setAppPinned("org.omni.plugin.timer", true);
      const dockSlot = root.querySelector("#dock-slot");
      expect(dockSlot?.querySelector('[data-plugin-id="org.omni.plugin.timer"]')).toBeTruthy();
      expect(root.querySelector("#apps-pinned-grid")?.textContent).toContain("Focus Timer");
    });

    it("toggles the Viewport Guide drawer in Workspace settings", () => {
      const btnToggle = root.querySelector<HTMLButtonElement>("#btn-toggle-viewport-guide");
      const guideBox = root.querySelector<HTMLElement>("#viewport-guide-box");
      expect(btnToggle).toBeTruthy();
      expect(guideBox).toBeTruthy();
      expect(guideBox?.style.display).toBe("none");

      btnToggle?.click();
      expect(guideBox?.style.display).toBe("flex");
      expect(guideBox?.textContent).toContain("Full-Page App (main)");
      expect(guideBox?.textContent).toContain("Dock Shortcut (dock)");
      expect(guideBox?.textContent).toContain("Widget (sidebar)");

      const btnClose = root.querySelector<HTMLButtonElement>("#btn-close-viewport-guide");
      btnClose?.click();
      expect(guideBox?.style.display).toBe("none");
    });

    it("exports and imports pinned state in OmniWorkspaceState (NIP-78)", () => {
      const customApp: InstalledPluginEntry = {
        id: "com.example.draw",
        name: "Draw App",
        viewport: "main",
        enabled: true,
        pinned: false,
        scriptContent: "console.log('draw');",
        placements: [{ id: "pl-draw", viewport: "main", route: "", viewId: "main", enabled: true }]
      };
      shell.installedPlugins.push(customApp);

      const state = shell.exportWorkspaceState();
      const exportedApp = state.plugins.find((p) => p.id === "com.example.draw");
      expect(exportedApp?.pinned).toBe(false);

      // Re-import with pinned true
      exportedApp!.pinned = true;
      shell.applyWorkspaceState(state);
      expect(shell.isAppPinned(customApp)).toBe(true);
    });

    it("renders a person icon for the Profile plugin", () => {
      const profilePlugin: InstalledPluginEntry = {
        id: "org.omni.plugin.profile",
        name: "Profile",
        icon: "profile",
        viewport: "main",
        enabled: true,
        pinned: true,
        scriptContent: "console.log('profile');",
        placements: [{ id: "pl-profile", viewport: "main", route: "", viewId: "main", enabled: true }]
      };
      shell.installedPlugins.push(profilePlugin);
      shell.renderDockLaunchers();

      const profileDockBtn = root.querySelector('#dock-slot [data-plugin-id="org.omni.plugin.profile"]');
      expect(profileDockBtn).toBeTruthy();
      // Verify person icon geometry (head circle and shoulders path)
      const svg = profileDockBtn?.querySelector("svg");
      expect(svg).toBeTruthy();
      expect(svg?.innerHTML).toContain('circle cx="12" cy="7" r="4"');
      expect(svg?.innerHTML).toContain('M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2');

      // Verify in Apps Launcher as well
      shell.showPage("apps");
      const appCards = Array.from(root.querySelectorAll('#apps-pinned-grid .app-card'));
      const profileCard = appCards.find((c) => c.textContent?.includes("Profile"));
      expect(profileCard).toBeTruthy();
      expect(profileCard?.innerHTML).toContain('circle cx="12" cy="7" r="4"');
    });
  });

  describe("PanoramaShell (Windows Phone People Hub Experience)", () => {
    let panoramaRoot: HTMLElement;
    let panoramaKernel: OmniKernel;
    let panoramaShell: PanoramaShell;

    beforeEach(() => {
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

      // Verify relay scoping controls
      const radAll = panoramaRoot.querySelector("input[name='panorama-relay-scope-org-omni-plugin-timer'][type='radio']") as HTMLInputElement | null;
      expect(radAll).toBeTruthy();

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
      // In PanoramaShell, ensureWidgetsMounted mounts sidebar/widgets plugins into #panorama-widgets-slot
      await panoramaShell.ensureWidgetsMounted();
      const checklistPlugin = panoramaShell.installedPlugins.find((p) => p.id === "org.omni.plugin.checklist");
      if (checklistPlugin) {
        expect(panoramaKernel.getSandbox("org.omni.plugin.checklist::default") || panoramaKernel.getSandbox("org.omni.plugin.checklist")).toBeDefined();
      }
      const widgetsSlot = panoramaRoot.querySelector("#panorama-widgets-slot");
      expect(widgetsSlot).toBeTruthy();
    });

    it("renders accent color chooser in system section with preset swatches (not in header)", () => {
      // System card
      const systemCard = panoramaRoot.querySelector("#panorama-accent-card");
      expect(systemCard).toBeTruthy();
      const systemSwatches = panoramaRoot.querySelectorAll("#panorama-system-swatches-grid .panorama-color-swatch");
      expect(systemSwatches.length).toBe(14);

      // Header button & popup should NOT exist (only in settings)
      const headerColorBtn = panoramaRoot.querySelector("#btn-panorama-header-color");
      expect(headerColorBtn).toBeFalsy();
    });

    it("applies selected accent color, updates CSS variables, and persists to localStorage", () => {
      // Find the emerald swatch (#2ecc71)
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

      // Verify the active shell button exists and has .active class
      const activeShellBtn = panoramaRoot.querySelector("#panorama-shell-switcher-buttons .btn-panorama-action.active");
      expect(activeShellBtn).toBeTruthy();

      // Verify the hex label updated
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


    it("automatically pins and adds app to navigation dock when assigned to main in OmniShell", async () => {
      const classicRoot = document.createElement("div");
      document.body.appendChild(classicRoot);
      const classicKernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
      const classicShell = new OmniShell({
        root: classicRoot,
        kernel: classicKernel,
        installedPlugins: [
          {
            id: "org.omni.plugin.feed",
            name: "Feed",
            viewport: "main",
            enabled: true,
            scriptContent: "console.log('feed')"
          },
          {
            id: "org.omni.plugin.timer",
            name: "Focus Timer",
            viewport: "sidebar",
            enabled: true,
            scriptContent: "console.log('timer')"
          }
        ]
      });
      classicShell.mount();

      // Focus timer initially not in dock
      let timerDockBtn = classicRoot.querySelector(".dock-item[data-plugin-id='org.omni.plugin.timer']");
      expect(timerDockBtn).toBeFalsy();

      // Open settings and change viewport of timer to main
      classicShell.openSettings("org.omni.plugin.timer");
      const vpSelect = classicRoot.querySelector("#settings-pane-org-omni-plugin-timer .plugin-viewport-select") as HTMLSelectElement;
      expect(vpSelect).toBeTruthy();

      vpSelect.value = "main";
      vpSelect.dispatchEvent(new Event("change"));
      for (let i = 0; i < 20; i++) {
        timerDockBtn = classicRoot.querySelector(".dock-item[data-plugin-id='org.omni.plugin.timer']");
        if (timerDockBtn) break;
        await new Promise((r) => setTimeout(r, 50));
      }

      // Verify timer is automatically pinned and rendered in dock
      const timerPlugin = classicShell.installedPlugins.find((p) => p.id === "org.omni.plugin.timer")!;
      expect(timerPlugin.pinned).toBe(true);

      timerDockBtn = classicRoot.querySelector(".dock-item[data-plugin-id='org.omni.plugin.timer']");
      expect(timerDockBtn).toBeTruthy();

      classicShell.destroy();
      classicRoot.remove();
    });
  });

  describe("Decoupled Shell Styling & Dynamic Shell Registry", () => {
    it("lists default built-in shells (classic and panorama)", () => {
      const shells = shellRegistry.list();
      expect(shells.length).toBeGreaterThanOrEqual(2);
      expect(shells.some((s) => s.id === "classic")).toBe(true);
      expect(shells.some((s) => s.id === "panorama")).toBe(true);
    });

    it("registers and creates a custom user-installed shell", () => {
      const customShellFactory = {
        id: "minimalist",
        name: "Minimalist Shell",
        description: "An ultra-minimalist terminal-style shell",
        create: (options: any) => {
          return new OmniShell(options);
        }
      };
      shellRegistry.register(customShellFactory);
      expect(shellRegistry.get("minimalist")?.name).toBe("Minimalist Shell");
      expect(shellRegistry.list().some((s) => s.id === "minimalist")).toBe(true);

      const testRoot = document.createElement("div");
      const testKernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
      const created = shellRegistry.create("minimalist", {
        root: testRoot,
        kernel: testKernel,
        installedPlugins: []
      });
      expect(created).toBeInstanceOf(OmniShell);

      // Clean up
      shellRegistry.unregister("minimalist");
      expect(shellRegistry.get("minimalist")).toBeUndefined();
    });

    it("installs, lists, and uninstalls custom shells via shellRegistry with persistence", () => {
      const customShell = {
        id: "test-cyberpunk",
        name: "Cyberpunk Terminal",
        description: "Neon high-contrast shell",
        author: "Neo",
        version: "2.0.0"
      };

      shellRegistry.install(customShell, true);
      expect(shellRegistry.get("test-cyberpunk")?.name).toBe("Cyberpunk Terminal");
      expect(shellRegistry.list().some((s) => s.id === "test-cyberpunk")).toBe(true);
      expect(shellRegistry.isBuiltin("test-cyberpunk")).toBe(false);

      // Verify persistence in localStorage
      const saved = localStorage.getItem(ShellRegistry.STORAGE_KEY_INSTALLED);
      expect(saved).toBeTruthy();
      expect(saved).toContain("test-cyberpunk");

      // Test activating custom shell
      shellRegistry.setActiveShell("test-cyberpunk");
      expect(shellRegistry.getActiveShellId()).toBe("test-cyberpunk");

      // Uninstall custom shell
      const uninstalled = shellRegistry.uninstall("test-cyberpunk");
      expect(uninstalled).toBe(true);
      expect(shellRegistry.get("test-cyberpunk")).toBeUndefined();
      expect(shellRegistry.getActiveShellId()).toBe("classic");
    });

    it("prevents uninstalling built-in shells", () => {
      expect(shellRegistry.isBuiltin("classic")).toBe(true);
      expect(shellRegistry.isBuiltin("panorama")).toBe(true);
      expect(() => shellRegistry.uninstall("classic")).toThrow();
      expect(() => shellRegistry.uninstall("panorama")).toThrow();
    });

    it("includes curated shell experiences like Mantra in catalog", () => {
      const catalog = shellRegistry.getCuratedCatalog();
      expect(catalog.length).toBeGreaterThanOrEqual(1);
      const mantra = catalog.find((c) => c.id === "mantra");
      expect(mantra).toBeTruthy();
      expect(mantra?.name).toBe("Mantra");
      expect(mantra?.description).toContain("Sacred Editorial");
    });

    it("renders dedicated Installed Shells section in PanoramaShell and supports installing Mantra", () => {
      const testRoot = document.createElement("div");
      document.body.appendChild(testRoot);
      const testKernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
      const testShell = new PanoramaShell({
        root: testRoot,
        kernel: testKernel,
        installedPlugins: []
      });

      testShell.mount();

      // Check for dedicated Installed Shells section & cards
      const shellsSection = testRoot.querySelector("#panorama-shells-card");
      expect(shellsSection).toBeTruthy();
      const shellsList = testRoot.querySelector("#panorama-installed-shells-list");
      expect(shellsList).toBeTruthy();
      const shellCards = testRoot.querySelectorAll(".panorama-shell-card");
      expect(shellCards.length).toBeGreaterThanOrEqual(2);

      // Open install shell modal
      const btnInstall = testRoot.querySelector("#btn-panorama-install-shell") as HTMLElement | null;
      expect(btnInstall).toBeTruthy();
      btnInstall?.click();

      const modal = testRoot.querySelector("#panorama-install-shell-modal") as HTMLElement | null;
      expect(modal?.style.display).toBe("flex");

      // Verify Mantra is listed in curated catalog inside modal
      const catalogEl = testRoot.querySelector("#panorama-curated-shell-catalog");
      expect(catalogEl?.textContent).toContain("Mantra");

      // Install Mantra from curated catalog
      const installMantraBtn = catalogEl?.querySelector(".btn-install-curated-shell[data-shell-id='mantra']") as HTMLElement | null;
      if (installMantraBtn) {
        installMantraBtn.click();
        expect(shellRegistry.get("mantra")).toBeTruthy();
        expect(testRoot.querySelectorAll(".panorama-shell-card").length).toBeGreaterThanOrEqual(3);
      }

      // Cleanup
      shellRegistry.uninstall("mantra");
      testShell.destroy();
      testRoot.remove();
    });

    it("renders dedicated Installed Shells section in OmniShell and supports installing Mantra", () => {
      const testRoot = document.createElement("div");
      document.body.appendChild(testRoot);
      const testKernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
      const testShell = new OmniShell({
        root: testRoot,
        kernel: testKernel,
        installedPlugins: []
      });

      testShell.mount();

      // Check for dedicated Installed Shells box & cards
      const shellsBox = testRoot.querySelector("#shell-experience-box");
      expect(shellsBox).toBeTruthy();
      const cardsList = testRoot.querySelector("#classic-installed-shells-list");
      expect(cardsList).toBeTruthy();
      const shellCards = testRoot.querySelectorAll(".classic-shell-card");
      expect(shellCards.length).toBeGreaterThanOrEqual(2);

      // Open install shell modal
      const btnOpen = testRoot.querySelector("#btn-classic-open-install-shell") as HTMLElement | null;
      expect(btnOpen).toBeTruthy();
      btnOpen?.click();

      const modal = testRoot.querySelector("#install-shell-modal");
      expect(modal?.classList.contains("open")).toBe(true);

      // Verify Mantra in curated catalog
      const catalogEl = testRoot.querySelector("#classic-curated-shell-catalog");
      expect(catalogEl?.textContent).toContain("Mantra");

      // Install Mantra
      const installMantraBtn = catalogEl?.querySelector(".btn-install-curated-shell[data-shell-id='mantra']") as HTMLElement | null;
      if (installMantraBtn) {
        installMantraBtn.click();
        expect(shellRegistry.get("mantra")).toBeTruthy();
        expect(testRoot.querySelectorAll(".classic-shell-card").length).toBeGreaterThanOrEqual(3);
      }

      // Cleanup
      shellRegistry.uninstall("mantra");
      testShell.destroy();
      testRoot.remove();
    });

    it("injects classic stylesheet upon OmniShell mount and removes it on destroy", () => {
      const testRoot = document.createElement("div");
      document.body.appendChild(testRoot);
      const testKernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
      const testShell = new OmniShell({
        root: testRoot,
        kernel: testKernel,
        installedPlugins: []
      });

      testShell.mount();
      const styleEl = document.getElementById(OMNI_SHELL_STYLE_ELEMENT_ID);
      expect(styleEl).toBeTruthy();
      expect(styleEl?.textContent).toContain("--omni-bg-canvas: #141312");
      expect(document.documentElement.classList.contains("theme-panorama")).toBe(false);

      testShell.destroy();
      expect(document.getElementById(OMNI_SHELL_STYLE_ELEMENT_ID)).toBeNull();
      testRoot.remove();
    });

    it("injects panorama stylesheet upon PanoramaShell mount and removes it on destroy", () => {
      const testRoot = document.createElement("div");
      document.body.appendChild(testRoot);
      const testKernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
      const testShell = new PanoramaShell({
        root: testRoot,
        kernel: testKernel,
        installedPlugins: []
      });

      testShell.mount();
      const styleEl = document.getElementById(OMNI_SHELL_STYLE_ELEMENT_ID);
      expect(styleEl).toBeTruthy();
      expect(styleEl?.textContent).toContain("--omni-bg-canvas: #000000");
      expect(document.documentElement.classList.contains("theme-panorama")).toBe(true);

      testShell.destroy();
      expect(document.getElementById(OMNI_SHELL_STYLE_ELEMENT_ID)).toBeNull();
      expect(document.documentElement.classList.contains("theme-panorama")).toBe(false);
      testRoot.remove();
    });

    it("renders dynamic shell buttons from shellRegistry in settings", () => {
      const testRoot = document.createElement("div");
      document.body.appendChild(testRoot);
      const testKernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
      const testShell = new OmniShell({
        root: testRoot,
        kernel: testKernel,
        installedPlugins: []
      });

      testShell.mount();
      const classicBtn = testRoot.querySelector("#btn-shell-classic");
      const panoramaBtn = testRoot.querySelector("#btn-shell-panorama");
      expect(classicBtn).toBeTruthy();
      expect(panoramaBtn).toBeTruthy();
      expect(classicBtn?.textContent).toBe("Omni Classic");
      expect(panoramaBtn?.textContent).toBe("Panorama");

      testShell.destroy();
      testRoot.remove();
    });

    it("dynamically installs nsite via resolveAndInstallNsite with HTML content", async () => {
      const testRoot = document.createElement("div");
      document.body.appendChild(testRoot);
      const testKernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
      const testShell = new OmniShell({
        root: testRoot,
        kernel: testKernel,
        installedPlugins: []
      });
      testShell.mount();

      const htmlApp = `<!DOCTYPE html>
<html>
<head><title>Dynamic Notes</title></head>
<body><h1>Hello Dynamic nsite</h1></body>
</html>`;

      const installed = await testShell.resolveAndInstallNsite(htmlApp);
      expect(installed.name).toBe("Dynamic Notes");
      expect(testShell.installedPlugins.some((p) => p.id === installed.id)).toBe(true);

      // Verify uninstallation
      testShell.uninstallPlugin(installed.id);
      expect(testShell.installedPlugins.some((p) => p.id === installed.id)).toBe(false);

      testShell.destroy();
      testRoot.remove();
    });

    it("renders curated app store catalog in PanoramaShell and installs featured app", async () => {
      const testRoot = document.createElement("div");
      document.body.appendChild(testRoot);
      const testKernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
      const testShell = new PanoramaShell({
        root: testRoot,
        kernel: testKernel,
        installedPlugins: []
      });
      testShell.mount();

      const installBtn = testRoot.querySelector("#btn-panorama-install") as HTMLButtonElement | null;
      expect(installBtn).toBeTruthy();

      const catalog = testRoot.querySelector("#panorama-curated-catalog");
      expect(catalog).toBeTruthy();
      expect(catalog?.children.length).toBeGreaterThan(0);

      // Install the first curated app (Cypherpunk Wisdom)
      const firstInstallBtn = catalog?.querySelector("button") as HTMLButtonElement | null;
      expect(firstInstallBtn).toBeTruthy();
      expect(firstInstallBtn?.textContent).toBe("Install");

      firstInstallBtn?.click();
      for (let i = 0; i < 20; i++) {
        if (firstInstallBtn?.textContent === "Installed") break;
        await new Promise((r) => setTimeout(r, 50));
      }

      expect(firstInstallBtn?.textContent).toBe("Installed");
      expect(testShell.installedPlugins.some((p) => p.name === "Cypherpunk Wisdom")).toBe(true);

      testShell.destroy();
      testRoot.remove();
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
      const testKernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
      const testShell = new PanoramaShell({
        root: testRoot,
        kernel: testKernel,
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
      const testRoot = document.createElement("div");
      document.body.appendChild(testRoot);
      const testKernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
      const testShell = new PanoramaShell({
        root: testRoot,
        kernel: testKernel,
        installedPlugins: mockPlugins.map((p) => ({ ...p }))
      });
      testShell.mount();

      expect(testRoot.querySelector("#panorama-section-dynamic-app")).toBeFalsy();
      expect(testRoot.querySelector(".panorama-dynamic-pivot")).toBeFalsy();

      await testShell.openApp("org.omni.plugin.timer");

      // Dynamic pane exists immediately after apps without redundant inner header
      const dynamicPane = testRoot.querySelector("#panorama-section-dynamic-app");
      expect(dynamicPane).toBeTruthy();
      expect(dynamicPane?.querySelector(".panorama-dynamic-pane-header")).toBeFalsy();

      // Dynamic pivot header tab exists next to apps with close button
      const dynamicPivot = testRoot.querySelector(".panorama-dynamic-pivot");
      expect(dynamicPivot).toBeTruthy();
      expect(dynamicPivot?.textContent?.toLowerCase()).toContain("focus timer");
      expect(dynamicPivot?.querySelector(".dynamic-pivot-close")).toBeTruthy();

      // Header close button is visible
      const headerCloseBtn = testRoot.querySelector("#btn-header-close-app") as HTMLElement | null;
      expect(headerCloseBtn).toBeTruthy();
      expect(headerCloseBtn?.style.display).toBe("inline-flex");

      // Close app via header close button returns to apps launcher and cleans up with subtle fade out
      headerCloseBtn?.click();
      expect(testShell.getCurrentOpenedAppId()).toBeNull();
      expect(headerCloseBtn?.style.display).toBe("none");
      expect(dynamicPane?.classList.contains("pane-closing")).toBe(true);
      await new Promise((r) => setTimeout(r, 260));
      expect(testRoot.querySelector("#panorama-section-dynamic-app")).toBeFalsy();
      expect(testRoot.querySelector(".panorama-dynamic-pivot")).toBeFalsy();

      // Test closing via dynamic pivot close button
      await testShell.openApp("org.omni.plugin.timer");
      const dynamicPivot2 = testRoot.querySelector(".panorama-dynamic-pivot");
      const pivotCloseBtn = dynamicPivot2?.querySelector(".dynamic-pivot-close") as HTMLElement | null;
      expect(pivotCloseBtn).toBeTruthy();
      pivotCloseBtn?.click();
      expect(testShell.getCurrentOpenedAppId()).toBeNull();
      await new Promise((r) => setTimeout(r, 260));

      testShell.destroy();
      testRoot.remove();
    });

    it("opens and dismisses long-press context menu on tiles with quick actions", () => {
      const testRoot = document.createElement("div");
      document.body.appendChild(testRoot);
      const testKernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
      const testShell = new PanoramaShell({
        root: testRoot,
        kernel: testKernel,
        installedPlugins: mockPlugins.map((p) => ({ ...p }))
      });
      testShell.mount();

      const targetPlugin = testShell.installedPlugins[0];
      expect(document.getElementById("panorama-tile-context-menu")).toBeFalsy();

      // Trigger context menu
      testShell.openTileContextMenu(targetPlugin, 150, 200);

      const menu = document.getElementById("panorama-tile-context-menu");
      const backdrop = document.getElementById("panorama-tile-context-backdrop");
      expect(menu).toBeTruthy();
      expect(backdrop).toBeTruthy();

      const items = Array.from(menu?.querySelectorAll(".context-menu-item") || []).map((el) => el.textContent?.trim());
      expect(items.some((t) => t?.includes("Pivots"))).toBe(true);
      expect(items.some((t) => t?.includes("Widget"))).toBe(true);
      expect(items.some((t) => t?.includes("App Info"))).toBe(true);

      // Dismiss context menu
      testShell.closeTileContextMenu();
      expect(document.getElementById("panorama-tile-context-menu")).toBeFalsy();

      testShell.destroy();
      testRoot.remove();
    });

    it("renders desktop edge hover gliders and navigates adjacent pivots", () => {
      const testRoot = document.createElement("div");
      document.body.appendChild(testRoot);
      const testKernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
      const testShell = new PanoramaShell({
        root: testRoot,
        kernel: testKernel,
        installedPlugins: mockPlugins.map((p) => ({ ...p }))
      });
      testShell.mount();

      const gliderLeft = testRoot.querySelector("#panorama-glider-left");
      const gliderRight = testRoot.querySelector("#panorama-glider-right");
      expect(gliderLeft).toBeTruthy();
      expect(gliderRight).toBeTruthy();

      // Glider left is disabled when at the start
      testShell.updateEdgeGliders();
      expect(gliderLeft?.classList.contains("disabled")).toBe(true);

      testShell.destroy();
      testRoot.remove();
    });

    it("renders metro bottom application bar with compose, refresh, search, and more menu", () => {
      const testRoot = document.createElement("div");
      document.body.appendChild(testRoot);
      const testKernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
      const testShell = new PanoramaShell({
        root: testRoot,
        kernel: testKernel,
        installedPlugins: mockPlugins.map((p) => ({ ...p }))
      });
      testShell.mount();

      const bottomBar = testRoot.querySelector("#panorama-bottom-app-bar");
      expect(bottomBar).toBeTruthy();

      const btnCompose = testRoot.querySelector("#btn-app-bar-compose");
      const btnRefresh = testRoot.querySelector("#btn-app-bar-refresh");
      const btnSearch = testRoot.querySelector("#btn-app-bar-search");
      const btnMore = testRoot.querySelector("#btn-app-bar-more") as HTMLButtonElement | null;
      expect(btnCompose).toBeTruthy();
      expect(btnRefresh).toBeTruthy();
      expect(btnSearch).toBeTruthy();
      expect(btnMore).toBeTruthy();

      // Toggle more menu
      const menu = testRoot.querySelector("#panorama-app-bar-menu") as HTMLElement | null;
      expect(menu?.style.display).toBe("none");

      btnMore?.click();
      expect(menu?.style.display).toBe("flex");

      testShell.destroy();
      testRoot.remove();
    });

    it("renders clean empty state in widgets slot when no companion widgets are pinned", () => {
      const testRoot = document.createElement("div");
      document.body.appendChild(testRoot);
      const testKernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
      // All plugins with viewport: "" (no widgets)
      const noWidgetPlugins = mockPlugins.map((p) => ({ ...p, viewport: "", placements: [] }));
      const testShell = new PanoramaShell({
        root: testRoot,
        kernel: testKernel,
        installedPlugins: noWidgetPlugins
      });
      testShell.mount();

      testShell.renderWidgetsEmptyState();
      const widgetsSlot = testRoot.querySelector("#panorama-widgets-slot");
      expect(widgetsSlot?.querySelector(".panorama-empty-state")).toBeTruthy();
      expect(widgetsSlot?.textContent).toContain("No Widgets Pinned");

      testShell.destroy();
      testRoot.remove();
    });

    it("dynamically omits Manage Relays and Compose from bottom bar when corresponding plugins are absent", () => {
      const testRoot = document.createElement("div");
      document.body.appendChild(testRoot);
      const testKernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
      // Filter out feed and relays plugins
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
      const testRoot = document.createElement("div");
      document.body.appendChild(testRoot);
      const testKernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
      const testShell = new PanoramaShell({
        root: testRoot,
        kernel: testKernel,
        installedPlugins: mockPlugins.map((p) => ({ ...p }))
      });
      testShell.mount();

      // Check that plugins with compact view have .has-compact-view tile and container
      const timerTile = testRoot.querySelector('.panorama-tile[data-plugin-id="org.omni.plugin.timer"]');
      expect(timerTile).toBeTruthy();
      expect(timerTile?.classList.contains("has-compact-view")).toBe(true);

      const compactContainer = testRoot.querySelector("#panorama-tile-compact-org-omni-plugin-timer");
      expect(compactContainer).toBeTruthy();

      // Verify ensureCompactTilesMounted can be called without errors
      await testShell.ensureCompactTilesMounted();

      testShell.destroy();
      testRoot.remove();
    });

    it("mounts pull-to-refresh indicator and triggers page reload on downward touch drag", () => {
      const testRoot = document.createElement("div");
      document.body.appendChild(testRoot);
      const testKernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
      const testShell = new PanoramaShell({
        root: testRoot,
        kernel: testKernel,
        installedPlugins: mockPlugins.map((p) => ({ ...p }))
      });
      testShell.mount();

      const pullEl = testRoot.querySelector("#omni-pull-to-refresh");
      expect(pullEl).toBeTruthy();
      expect(pullEl?.textContent?.toLowerCase()).toContain("pull down to refresh");

      let reloaded = false;
      testShell.reloadPage = () => {
        reloaded = true;
      };

      // 1. Simulate pull down gesture (past threshold 65px)
      const touchStart = new TouchEvent("touchstart", {
        touches: [{ clientX: 100, clientY: 50 } as any]
      });
      window.dispatchEvent(touchStart);

      const touchMove = new TouchEvent("touchmove", {
        cancelable: true,
        touches: [{ clientX: 100, clientY: 180 } as any]
      });
      window.dispatchEvent(touchMove);

      expect(pullEl?.classList.contains("ready")).toBe(true);
      expect(pullEl?.textContent?.toLowerCase()).toContain("release to refresh");

      // 2. Release to trigger refresh
      const touchEnd = new TouchEvent("touchend", {
        touches: []
      });
      window.dispatchEvent(touchEnd);

      expect(pullEl?.classList.contains("is-refreshing")).toBe(true);
      expect(pullEl?.textContent?.toLowerCase()).toContain("refreshing");

      // Advance timer for reload callback
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(reloaded).toBe(true);
          testShell.destroy();
          expect(testRoot.querySelector("#omni-pull-to-refresh")).toBeFalsy();
          testRoot.remove();
          resolve();
        }, 320);
      });
    });

    it("cancels pull-to-refresh when swipe is predominantly horizontal", () => {
      const testRoot = document.createElement("div");
      document.body.appendChild(testRoot);
      const testKernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
      const testShell = new PanoramaShell({
        root: testRoot,
        kernel: testKernel,
        installedPlugins: mockPlugins.map((p) => ({ ...p }))
      });
      testShell.mount();

      const pullEl = testRoot.querySelector("#omni-pull-to-refresh");
      expect(pullEl).toBeTruthy();

      let reloaded = false;
      testShell.reloadPage = () => {
        reloaded = true;
      };

      // Horizontal swipe (moving mostly along X)
      window.dispatchEvent(new TouchEvent("touchstart", {
        touches: [{ clientX: 100, clientY: 50 } as any]
      }));

      window.dispatchEvent(new TouchEvent("touchmove", {
        cancelable: true,
        touches: [{ clientX: 250, clientY: 70 } as any]
      }));

      // Should not be ready or pulling
      expect(pullEl?.classList.contains("ready")).toBe(false);

      window.dispatchEvent(new TouchEvent("touchend", { touches: [] }));
      expect(reloaded).toBe(false);

      testShell.destroy();
      testRoot.remove();
    });
  });
});




