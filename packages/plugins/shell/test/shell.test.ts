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

    expect(shell.layoutManager.getSlotForComponent("org.omni.plugin.feed", "feed-main")).toBe("sidebar");
  });

  it("supports route assignment and per-plugin settings sections", async () => {
    shell.openSettings("plugins");
    const container = root.querySelector("#plugins-list");
    expect(container).toBeTruthy();

    // Check that route selector is rendered
    const routeSelects = container?.querySelectorAll(".plugin-route-select");
    expect(routeSelects?.length).toBeGreaterThanOrEqual(1);

    const firstRouteSelect = routeSelects?.[0] as HTMLSelectElement;
    expect(firstRouteSelect).toBeTruthy();

    // Check per-plugin settings boxes
    const settingsBoxes = container?.querySelectorAll(".plugin-settings-box");
    expect(settingsBoxes?.length).toBe(shell.installedPlugins.length);

    // Feed plugin does not declare settings
    const feedBox = settingsBoxes?.[0];
    expect(feedBox?.textContent).toContain("Plugin Settings");

    // Add a plugin that has a settings route and check toggle button
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

    shell.renderPluginManager();

    const updatedBoxes = container?.querySelectorAll(".plugin-settings-box");
    const timerBox = Array.from(updatedBoxes || []).find((b) => b.querySelector(".btn-plugin-settings"));
    expect(timerBox).toBeTruthy();

    const openSettingsBtn = timerBox?.querySelector(".btn-plugin-settings") as HTMLButtonElement;
    expect(openSettingsBtn).toBeTruthy();
    expect(openSettingsBtn.textContent).toBe("Open Settings");

    // Click to open settings
    openSettingsBtn.click();
    await new Promise((r) => setTimeout(r, 50));
    const mountContainer = timerBox?.querySelector(".plugin-settings-mount-container") as HTMLElement;
    expect(mountContainer.style.display).toBe("block");
    expect(mountContainer.querySelector(".omni-component-slot")).toBeTruthy();
    expect(openSettingsBtn.textContent).toBe("Close Settings");

    // Click again to close settings
    openSettingsBtn.click();
    expect(mountContainer.style.display).toBe("none");
    expect(mountContainer.children.length).toBe(0);
    expect(openSettingsBtn.textContent).toBe("Open Settings");
  });

  it("organizes plugins in clean collapsible cards that toggle on header click", () => {
    shell.openSettings("plugins");
    const container = root.querySelector("#plugins-list");
    expect(container).toBeTruthy();

    const firstCard = container?.querySelector(".plugin-card-collapsible") as HTMLElement;
    expect(firstCard).toBeTruthy();

    const header = firstCard.querySelector(".plugin-card-collapsible-header") as HTMLElement;
    const details = firstCard.querySelector(".plugin-card-details") as HTMLElement;
    expect(header).toBeTruthy();
    expect(details).toBeTruthy();

    // Collapsed by default
    expect(details.style.display).toBe("none");

    // Click header to expand
    header.click();
    const firstCardAfterClick = container?.querySelector(".plugin-card-collapsible") as HTMLElement;
    const detailsAfterClick = firstCardAfterClick.querySelector(".plugin-card-details") as HTMLElement;
    expect(detailsAfterClick.style.display).toBe("flex");

    // Click again to collapse
    const headerAfterClick = firstCardAfterClick.querySelector(".plugin-card-collapsible-header") as HTMLElement;
    headerAfterClick.click();
    const firstCardAfterSecondClick = container?.querySelector(".plugin-card-collapsible") as HTMLElement;
    const detailsAfterSecondClick = firstCardAfterSecondClick.querySelector(".plugin-card-details") as HTMLElement;
    expect(detailsAfterSecondClick.style.display).toBe("none");

    // Accordion behavior: expanding second card closes the first
    const cards = container?.querySelectorAll(".plugin-card-collapsible") || [];
    expect(cards.length).toBeGreaterThanOrEqual(2);

    const card0Header = cards[0].querySelector(".plugin-card-collapsible-header") as HTMLElement;
    card0Header.click();

    const cardsAfter0 = container?.querySelectorAll(".plugin-card-collapsible") || [];
    const details0 = cardsAfter0[0].querySelector(".plugin-card-details") as HTMLElement;
    const details1 = cardsAfter0[1].querySelector(".plugin-card-details") as HTMLElement;
    expect(details0.style.display).toBe("flex");
    expect(details1.style.display).toBe("none");

    // Click card 1 header -> card 0 closes, card 1 opens
    const card1Header = cardsAfter0[1].querySelector(".plugin-card-collapsible-header") as HTMLElement;
    card1Header.click();

    const cardsAfter1 = container?.querySelectorAll(".plugin-card-collapsible") || [];
    const details0After1 = cardsAfter1[0].querySelector(".plugin-card-details") as HTMLElement;
    const details1After1 = cardsAfter1[1].querySelector(".plugin-card-details") as HTMLElement;
    expect(details0After1.style.display).toBe("none");
    expect(details1After1.style.display).toBe("flex");
  });

  it("supports assigning the same plugin to multiple locations and routes simultaneously", async () => {
    shell.openSettings("plugins");
    const container = root.querySelector("#plugins-list");
    const timerCard = Array.from(container?.querySelectorAll(".plugin-card-collapsible") || []).find((c) =>
      c.textContent?.includes("Timer")
    ) as HTMLElement;
    expect(timerCard).toBeTruthy();

    // Expand timer card
    const header = timerCard.querySelector(".plugin-card-collapsible-header") as HTMLElement;
    header.click();

    // Initial placements
    const initialRows = timerCard.querySelectorAll(".plugin-placement-row");
    expect(initialRows.length).toBe(1);

    // Click "+ Add Location"
    const addBtn = timerCard.querySelector(".btn-add-placement") as HTMLButtonElement;
    expect(addBtn).toBeTruthy();
    addBtn.click();
    await new Promise((r) => setTimeout(r, 60));

    // Should now have 2 placement rows
    const updatedTimerCard = Array.from(container?.querySelectorAll(".plugin-card-collapsible") || []).find((c) =>
      c.textContent?.includes("Timer")
    ) as HTMLElement;
    const rowsAfterAdd = updatedTimerCard.querySelectorAll(".plugin-placement-row");
    expect(rowsAfterAdd.length).toBe(2);

    const timerPlugin = shell.installedPlugins.find((p) => p.id === "org.omni.plugin.timer")!;
    expect(timerPlugin.placements?.length).toBe(2);

    // First placement in sidebar, second placement in main
    const selects = updatedTimerCard.querySelectorAll(".plugin-viewport-select") as NodeListOf<HTMLSelectElement>;
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
    const removeBtns = updatedTimerCard.querySelectorAll(".btn-remove-placement") as NodeListOf<HTMLButtonElement>;
    expect(removeBtns.length).toBe(2);
    removeBtns[1].click();
    await new Promise((r) => setTimeout(r, 60));

    const timerCardAfterRemove = Array.from(container?.querySelectorAll(".plugin-card-collapsible") || []).find((c) =>
      c.textContent?.includes("Timer")
    ) as HTMLElement;
    const rowsAfterRemove = timerCardAfterRemove.querySelectorAll(".plugin-placement-row");
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
      name: "Relay Inspector",
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
      await new Promise((r) => setTimeout(r, 60));

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

      shell.applyWorkspaceState(newState, true);

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
          name: "Connected Relays",
          icon: "relays",
          viewport: "sidebar",
          scriptContent: "console.log('relays');",
          sourceUrl: "local:@omni/plugin-relays",
          enabled: true,
          views: [
            { id: "main", title: "Relay Pool", path: "" },
            { id: "settings", title: "Relay Settings", path: "?view=settings" }
          ]
        },
        {
          id: "org.omni.plugin.profile",
          name: "Profile & Keys",
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
  });
});



