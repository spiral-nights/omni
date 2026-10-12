import { OmniKernel, WebCryptoKeystore, NostrPluginResolver, LayoutManager, STANDARD_SLOTS } from "@omni/core";
import { OmniWorkspaceState, OmniWorkspacePluginConfig, PluginPlacement, OMNI_WORKSPACE_D_TAG, NostrEvent, PluginViewDeclaration, OmniShellHost } from "@omni/types";
import { ICONS, icon, IconName } from "./icons.js";
import { InstalledPluginEntry, OmniShellOptions } from "./shell.js";

export type PanoramaPivot = "feed" | "apps" | "widgets" | "system";

/**
 * PanoramaShell: Windows Phone "People Hub" Inspired Modern Typography & Panorama Runtime.
 *
 * Visual & Operational Characteristics:
 * - Huge lowercase hero title: "omni"
 * - Horizontal panorama header track: "what's new", "apps", "widgets", "system"
 * - Horizontal smooth swipe / panning viewport canvas
 * - Live Flat Accent Tiles for Full-Page Apps (Windows Phone square & wide tiles)
 * - Pure pitch-black canvas (#000000) with warm paper / cobalt / cyan accent colors
 * - Bottom Application Bar (AppBar) with icon buttons (Back, Windows Start/Home, Search, More ...)
 */
export class PanoramaShell implements OmniShellHost {
  private root: HTMLElement;
  private kernel: OmniKernel;
  public installedPlugins: InstalledPluginEntry[];
  public readonly layoutManager: LayoutManager;
  private slotContainers: Map<string, Element> = new Map();
  private expandedPluginId: string | null = null;

  // NIP-78 Workspace sync state
  public workspaceSyncStatus: "synced" | "unsynced" | "syncing" = "synced";
  public lastSyncedAt: number | null = null;
  public autoSyncNip78: boolean = true;
  private syncDebounceTimer: any = null;
  public readonly LOCAL_WORKSPACE_KEY = "omni_workspace_state";

  // Active navigation state
  private activePivot: PanoramaPivot = "feed";
  private currentOpenedAppId: string | null = null;

  // Internal element references
  private panoramaContainer!: HTMLElement;
  private pivotHeadersTrack!: HTMLElement;
  private sectionFeed!: HTMLElement;
  private sectionApps!: HTMLElement;
  private sectionWidgets!: HTMLElement;
  private sectionSystem!: HTMLElement;
  private fullAppOverlay!: HTMLElement;
  private fullAppContainer!: HTMLElement;
  private appBar!: HTMLElement;
  private appDrawerSheet!: HTMLElement;

  constructor(options: OmniShellOptions) {
    this.root = options.root;
    this.kernel = options.kernel;
    this.layoutManager = this.kernel?.layoutManager || new LayoutManager();
    if (options.installedPlugins) {
      const seen = new Set<string>();
      this.installedPlugins = options.installedPlugins.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
    } else {
      this.installedPlugins = [];
    }
  }

  // --- Meta & Manifest Helpers (100% compatible with OmniShell) ---

  public getPluginMeta(p: InstalledPluginEntry): {
    id: string;
    name: string;
    version: string;
    description: string;
    icon: string;
    viewport: string;
  } {
    if (Array.isArray(p.placements) && p.placements.length === 0) {
      return {
        id: p.id,
        name: p.name || p.manifest?.name || p.id,
        version: p.version || p.manifest?.version || "1.0.0",
        description: p.description || p.manifest?.description || "",
        icon: p.icon || p.manifest?.icon || "widgets",
        viewport: "unassigned"
      };
    }
    const primaryCompId = p.manifest?.components?.[0]?.id || `${p.id}-main`;
    const layoutSlot = this.layoutManager.getSlotForComponent(p.id, primaryCompId);
    return {
      id: p.id,
      name: p.name || p.manifest?.name || p.id,
      version: p.version || p.manifest?.version || "1.0.0",
      description: p.description || p.manifest?.description || "",
      icon: p.icon || p.manifest?.icon || (p.viewport === "main" ? "feed" : "widgets"),
      viewport: layoutSlot || p.viewport || p.manifest?.components?.[0]?.slot || "main"
    };
  }

  public ensurePluginManifest(p: InstalledPluginEntry): any {
    if (!p.views || p.views.length === 0) {
      if (p.manifest?.views && p.manifest.views.length > 0) {
        p.views = p.manifest.views;
      } else {
        p.views = NostrPluginResolver.detectPluginViews(p.event, p.htmlContent || p.scriptContent);
      }
    }
    if (p.manifest && p.manifest.components && p.manifest.components.length > 0) {
      if (!p.manifest.views || p.manifest.views.length === 0) {
        p.manifest.views = p.views;
      }
      return p.manifest;
    }
    const meta = this.getPluginMeta(p);
    return {
      id: meta.id,
      name: meta.name,
      version: meta.version,
      description: meta.description,
      icon: meta.icon,
      entry: "index.html",
      components: [
        {
          id: `${meta.id}-main`,
          type: meta.viewport === "main" ? "main" : "widget",
          title: meta.name,
          slot: meta.viewport
        }
      ],
      views: p.views || [{ id: "main", title: "Main App", path: "" }],
      permissions: {
        nostr: { read: { allKinds: true }, write: { allKinds: true }, sign: true },
        storage: { quotaMb: 5 },
        relays: p.id === "org.omni.plugin.relays" ? { manage: true, read: true } : undefined
      }
    };
  }

  public getPluginPlacements(p: InstalledPluginEntry): PluginPlacement[] {
    if (Array.isArray(p.placements)) {
      return p.placements;
    }
    const vp = p.viewport || (p.manifest?.components?.[0]?.slot) || "main";
    return [
      {
        id: `${vp}-primary`,
        viewport: vp,
        route: p.route !== undefined ? p.route : "",
        viewId: p.viewId || "main",
        enabled: p.enabled !== false
      }
    ];
  }

  public ensurePlacementManifest(p: InstalledPluginEntry, pl: PluginPlacement): any {
    const synth = this.ensurePluginManifest(p);
    const safePlId = pl.id.replace(/[^a-zA-Z0-9_-]/g, "-");
    return {
      ...synth,
      components: [
        {
          id: `${p.id}-${safePlId}`,
          type: pl.viewport === "main" ? "main" : "widget",
          title: p.name || p.id,
          slot: pl.viewport
        }
      ]
    };
  }

  public getAvailableViewports(): { id: string; label: string; description: string }[] {
    return STANDARD_SLOTS
      .filter((s) => s.id !== "header-status")
      .map((s) => ({ id: s.id, label: s.name, description: s.description }));
  }

  public getSlotContainers(): Map<string, Element> {
    return this.slotContainers;
  }

  // --- Mounting & Container Resolution ---

  public getContainerForPluginSlot(pluginId: string, slotId: string, compId?: string): Element {
    if (pluginId === "org.omni.plugin.feed") {
      const feedSlot = document.getElementById("panorama-feed-slot");
      if (feedSlot) return feedSlot;
    }

    if (slotId === "main" || slotId === "dock") {
      if (pluginId === "org.omni.plugin.feed") {
        return document.getElementById("panorama-feed-slot") || this.sectionFeed;
      }
      return this.ensureAppPage(pluginId);
    }

    if (slotId === "sidebar" || slotId === "widgets") {
      return document.getElementById("panorama-widgets-slot") || this.sectionWidgets;
    }

    return this.slotContainers.get(slotId) || this.sectionFeed;
  }

  public ensureAppPage(pluginId: string): HTMLElement {
    if (pluginId === "org.omni.plugin.feed") {
      return document.getElementById("panorama-feed-slot") || this.sectionFeed;
    }

    const safeId = pluginId.replace(/[^a-zA-Z0-9_-]/g, "-");
    let pageEl = document.getElementById(`panorama-page-app-${safeId}`);
    if (!pageEl) {
      pageEl = document.createElement("section");
      pageEl.className = "panorama-app-page";
      pageEl.id = `panorama-page-app-${safeId}`;
      pageEl.dataset.pluginId = pluginId;
      pageEl.style.cssText = "display: none; width: 100%; height: 100%; overflow: auto; padding: 16px 20px;";

      const slotEl = document.createElement("div");
      slotEl.className = "omni-slot panorama-main-viewport-slot";
      slotEl.id = `panorama-slot-main-${safeId}`;
      slotEl.style.cssText = "width: 100%; height: 100%;";
      pageEl.appendChild(slotEl);

      if (this.fullAppContainer) {
        this.fullAppContainer.appendChild(pageEl);
      }
      return slotEl;
    }
    return (pageEl.querySelector(".panorama-main-viewport-slot") as HTMLElement) || pageEl;
  }

  public async mountPlugin(plugin: InstalledPluginEntry): Promise<void> {
    if (!plugin.enabled) return;
    const placements = this.getPluginPlacements(plugin);
    const slotContainers = this.getSlotContainers();

    for (const pl of placements) {
      if (pl.enabled === false) continue;
      const synth = this.ensurePlacementManifest(plugin, pl);
      const targetContainer = this.getContainerForPluginSlot(plugin.id, pl.viewport, synth.components?.[0]?.id);
      const customSlotContainers = new Map(slotContainers);
      if (targetContainer) {
        customSlotContainers.set(pl.viewport, targetContainer);
      }

      await this.kernel.registerPlugin(
        synth,
        plugin.htmlContent || plugin.scriptContent,
        customSlotContainers,
        {
          instanceId: `${plugin.id}::${pl.id}`,
          route: pl.route,
          viewId: pl.viewId,
          targetSlot: pl.viewport,
          relays: plugin.relays
        }
      );
    }
  }

  public async remountPlugin(plugin: InstalledPluginEntry): Promise<void> {
    this.kernel.disablePlugin(plugin.id);
    if (plugin.enabled) {
      await this.mountPlugin(plugin);
    }
    this.renderAppsTiles();
    this.renderSystemPluginList();
    this.saveLocalWorkspace();
  }

  public isAppPinned(p: InstalledPluginEntry): boolean {
    if (p.id === "org.omni.plugin.feed") return true;
    if (typeof p.pinned === "boolean") return p.pinned;
    return true; // Default pinned in panorama for bold live tiles
  }

  public setAppPinned(pluginId: string, pinned: boolean): void {
    const plugin = this.installedPlugins.find((p) => p.id === pluginId);
    if (plugin) {
      plugin.pinned = pinned;
      this.renderAppsTiles();
      this.saveLocalWorkspace();
    }
  }

  // --- Local & Cloud Workspace Sync ---

  private getStorage(): Storage | null {
    try {
      if (typeof window !== "undefined" && window.localStorage && typeof window.localStorage.getItem === "function") {
        return window.localStorage;
      }
      if (typeof localStorage !== "undefined" && typeof localStorage.getItem === "function") {
        return localStorage;
      }
    } catch {}
    return null;
  }

  public saveLocalWorkspace(): void {
    try {
      const state = this.exportWorkspaceState();
      const storage = this.getStorage();
      if (storage) {
        storage.setItem(this.LOCAL_WORKSPACE_KEY, JSON.stringify(state));
      }
      this.workspaceSyncStatus = "unsynced";
      this.updateSyncUi();
      if (this.autoSyncNip78) {
        this.scheduleNip78Sync();
      }
    } catch (err) {
      console.warn("Failed to save local workspace state:", err);
    }
  }

  public scheduleNip78Sync(): void {
    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
    }
    this.syncDebounceTimer = setTimeout(() => {
      this.syncWorkspaceToNostr().catch((err) => {
        console.warn("Automatic workspace sync to Nostr failed:", err);
      });
    }, 1200);
  }

  public loadInitialWorkspace(): OmniWorkspaceState | null {
    try {
      const storage = this.getStorage();
      if (!storage) return null;
      const saved = storage.getItem(this.LOCAL_WORKSPACE_KEY);
      if (saved) {
        const state: OmniWorkspaceState = JSON.parse(saved);
        if (state && state.plugins) {
          for (const item of state.plugins) {
            const plugin = this.installedPlugins.find((p) => p.id === item.id);
            if (plugin) {
              if (item.viewport) plugin.viewport = item.viewport;
              if (typeof item.enabled === "boolean") plugin.enabled = item.enabled;
              if (typeof item.pinned === "boolean") plugin.pinned = item.pinned;
              if (item.relays !== undefined) {
                plugin.relays = Array.isArray(item.relays) ? item.relays : undefined;
              }
              if (item.placements && Array.isArray(item.placements)) {
                plugin.placements = item.placements;
              }
              if (item.route !== undefined) plugin.route = item.route;
              if (item.viewId) plugin.viewId = item.viewId;
            }
          }
          if (typeof state.autoSync === "boolean") {
            this.autoSyncNip78 = state.autoSync;
          }
          return state;
        }
      }
    } catch (err) {
      console.warn("Failed to parse initial workspace from localStorage:", err);
    }
    return null;
  }

  public exportWorkspaceState(): OmniWorkspaceState {
    return {
      version: 1,
      updatedAt: Date.now(),
      activePage: this.activePivot,
      autoSync: this.autoSyncNip78,
      shellType: "panorama",
      plugins: this.installedPlugins.map((p) => {
        const meta = this.getPluginMeta(p);
        const placements = this.getPluginPlacements(p);
        return {
          id: p.id,
          viewport: meta.viewport,
          route: p.route,
          viewId: p.viewId,
          pinned: p.pinned,
          relays: p.relays,
          placements,
          enabled: p.enabled,
          name: meta.name,
          description: meta.description,
          icon: meta.icon,
          naddr: p.naddr,
          sourceUrl: p.sourceUrl
        };
      })
    };
  }

  public applyWorkspaceState(state: OmniWorkspaceState, persistLocal = true): void {
    if (!state || !state.plugins) return;

    if (typeof state.autoSync === "boolean") {
      this.autoSyncNip78 = state.autoSync;
    }

    for (const item of state.plugins) {
      const plugin = this.installedPlugins.find((p) => p.id === item.id);
      if (plugin) {
        if (typeof item.enabled === "boolean") plugin.enabled = item.enabled;
        if (typeof item.pinned === "boolean") plugin.pinned = item.pinned;
        if (item.relays !== undefined) plugin.relays = item.relays;
        if (item.route !== undefined) plugin.route = item.route;
        if (item.viewId !== undefined) plugin.viewId = item.viewId;
        if (item.placements) plugin.placements = item.placements;
      }
    }

    this.renderAppsTiles();
    this.renderSystemPluginList();

    if (persistLocal) {
      const storage = this.getStorage();
      if (storage) {
        try {
          storage.setItem(this.LOCAL_WORKSPACE_KEY, JSON.stringify(state));
        } catch {}
      }
    }
  }

  public async syncWorkspaceToNostr(): Promise<NostrEvent> {
    this.workspaceSyncStatus = "syncing";
    this.updateSyncUi();
    try {
      const state = this.exportWorkspaceState();
      const event = await this.kernel.publishWorkspaceState(state);
      this.workspaceSyncStatus = "synced";
      this.lastSyncedAt = Date.now();
      this.updateSyncUi();
      return event;
    } catch (err: any) {
      this.workspaceSyncStatus = "unsynced";
      this.updateSyncUi();
      throw err;
    }
  }

  public async restoreWorkspaceFromNostr(): Promise<boolean> {
    this.workspaceSyncStatus = "syncing";
    this.updateSyncUi();
    try {
      const res = await this.kernel.fetchRemoteWorkspaceState();
      if (res && res.state) {
        this.applyWorkspaceState(res.state, true);
        this.workspaceSyncStatus = "synced";
        this.lastSyncedAt = (res.event.created_at || Math.floor(Date.now() / 1000)) * 1000;
        this.updateSyncUi();
        return true;
      }
      this.workspaceSyncStatus = "synced";
      this.updateSyncUi();
      return false;
    } catch (err: any) {
      this.workspaceSyncStatus = "unsynced";
      this.updateSyncUi();
      throw err;
    }
  }

  public updateSyncUi(): void {
    const statusText = document.getElementById("panorama-sync-status");
    if (statusText) {
      if (this.workspaceSyncStatus === "syncing") {
        statusText.textContent = "Syncing with relays...";
      } else if (this.workspaceSyncStatus === "synced") {
        statusText.textContent = "NIP-78 Synced";
      } else {
        statusText.textContent = "Unsynced changes";
      }
    }
  }

  // --- Mounting the Panorama DOM ---

  public mount(): void {
    this.renderSkeleton();
    this.cacheElementReferences();
    this.initSlotContainers();
    this.renderAppsTiles();
    this.renderSystemPluginList();
    this.wireNavigation();
    this.wireAppBar();
    this.updateProfileUi();
  }

  public getActivePageId(): string {
    return this.activePivot;
  }

  private renderSkeleton(): void {
    this.root.innerHTML = `
      <div class="panorama-shell-root" id="panorama-shell-root">
        <!-- 1. Panorama Hero Header -->
        <header class="panorama-hero-header">
          <div class="panorama-brand-row">
            <h1 class="panorama-hero-title">omni</h1>
          </div>
          <nav class="panorama-pivot-nav" id="panorama-pivot-nav">
            <button class="panorama-pivot-item active" data-pivot="feed">what's new</button>
            <button class="panorama-pivot-item" data-pivot="apps">apps</button>
            <button class="panorama-pivot-item" data-pivot="widgets">widgets</button>
            <button class="panorama-pivot-item" data-pivot="system">system</button>
          </nav>
        </header>

        <!-- 2. Horizontal Panorama Canvas -->
        <div class="panorama-canvas" id="panorama-canvas">
          <!-- Section 1: What's New (Timeline Feed) -->
          <section class="panorama-section" id="panorama-section-feed" data-pivot="feed">
            <div class="panorama-section-content">
              <div id="panorama-feed-slot" class="omni-slot panorama-feed-slot"></div>
            </div>
          </section>

          <!-- Section 2: Apps (Live Tiles Mosaic) -->
          <section class="panorama-section" id="panorama-section-apps" data-pivot="apps">
            <div class="panorama-section-content">
              <div class="panorama-section-title-bar">
                <h2>applications</h2>
                <span class="panorama-badge" id="panorama-apps-count">0 tiles</span>
              </div>
              <div class="panorama-tiles-grid" id="panorama-tiles-grid"></div>
            </div>
          </section>

          <!-- Section 3: Widgets (Modular Companion Tools) -->
          <section class="panorama-section" id="panorama-section-widgets" data-pivot="widgets">
            <div class="panorama-section-content">
              <div class="panorama-section-title-bar">
                <h2>workspace widgets</h2>
                <span class="panorama-badge">companion cards</span>
              </div>
              <div class="panorama-widgets-grid" id="panorama-widgets-slot"></div>
            </div>
          </section>

          <!-- Section 4: System (Governance & Control) -->
          <section class="panorama-section" id="panorama-section-system" data-pivot="system">
            <div class="panorama-section-content">
              <div class="panorama-section-title-bar">
                <h2>system & control</h2>
                <span class="panorama-badge" id="panorama-sync-status">NIP-78 Synced</span>
              </div>

              <!-- Identity Card -->
              <div class="panorama-system-card" id="panorama-identity-card">
                <div class="panorama-system-card-header">
                  <div class="panorama-system-avatar" id="panorama-avatar">✦</div>
                  <div class="panorama-system-identity">
                    <strong id="panorama-display-name">Nostr User</strong>
                    <code id="panorama-npub">npub1...</code>
                  </div>
                </div>
              </div>

              <!-- Shell Switcher Card -->
              <div class="panorama-system-card">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                  <div>
                    <strong>Shell Experience</strong>
                    <p style="font-size: 0.75rem; color: #888; margin-top: 2px;">Switch layout and navigation style.</p>
                  </div>
                  <div style="display: flex; gap: 6px;">
                    <button id="btn-switch-classic" class="btn-panorama-action">Omni Classic</button>
                    <button id="btn-switch-panorama" class="btn-panorama-action active">Panorama</button>
                  </div>
                </div>
              </div>

              <!-- Cloud Workspace Sync Card -->
              <div class="panorama-system-card">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                  <div>
                    <strong>Cloud Workspace Sync</strong>
                    <p style="font-size: 0.75rem; color: #888; margin-top: 2px;">Synchronize across devices via Nostr (NIP-78 kind 30078).</p>
                  </div>
                  <div style="display: flex; gap: 6px;">
                    <button id="btn-panorama-sync" class="btn-panorama-action">Sync</button>
                    <button id="btn-panorama-restore" class="btn-panorama-action">Restore</button>
                  </div>
                </div>
              </div>

              <!-- Installed Apps List -->
              <div class="panorama-system-card" style="display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <strong>Installed Plugins & Relays</strong>
                  <span id="panorama-plugin-count" style="font-size: 0.75rem; color: #888;">5 installed</span>
                </div>
                <div id="panorama-plugins-list" style="display: flex; flex-direction: column; gap: 8px;"></div>
              </div>
            </div>
          </section>
        </div>

        <!-- 3. Full-Page App Slide-In Overlay -->
        <div class="panorama-full-app-overlay" id="panorama-full-app-overlay">
          <div class="panorama-full-app-header">
            <button class="btn-app-bar-circle" id="btn-overlay-back" title="Back to Panorama">
              ${icon("arrow-left", 18)}
            </button>
            <h2 id="panorama-overlay-title">App Name</h2>
          </div>
          <div class="panorama-full-app-container" id="panorama-full-app-container"></div>
        </div>

        <!-- 4. Windows Phone ApplicationBar -->
        <footer class="panorama-app-bar" id="panorama-app-bar">
          <div class="panorama-app-bar-buttons">
            <button class="btn-app-bar-circle" id="btn-bar-back" title="Back">
              ${icon("arrow-left", 18)}
            </button>
            <button class="btn-app-bar-circle" id="btn-bar-home" title="Panorama Hub">
              ${icon("windows", 16)}
            </button>
            <button class="btn-app-bar-circle" id="btn-bar-search" title="Search">
              ${icon("search", 16)}
            </button>
            <button class="btn-app-bar-circle" id="btn-bar-more" title="More options">
              ${icon("more", 18)}
            </button>
          </div>
        </footer>

        <!-- 5. Slide-Up Menu Sheet -->
        <div class="panorama-drawer-sheet" id="panorama-drawer-sheet">
          <div class="panorama-drawer-item" id="sheet-item-switch-classic">Switch to Omni Classic Shell</div>
          <div class="panorama-drawer-item" id="sheet-item-sync">Sync Workspace (NIP-78)</div>
          <div class="panorama-drawer-item" id="sheet-item-restore">Restore Workspace from Relays</div>
          <div class="panorama-drawer-item" id="sheet-item-close">Close Menu</div>
        </div>
      </div>
    `;
  }

  private cacheElementReferences(): void {
    this.panoramaContainer = document.getElementById("panorama-canvas")!;
    this.pivotHeadersTrack = document.getElementById("panorama-pivot-nav")!;
    this.sectionFeed = document.getElementById("panorama-section-feed")!;
    this.sectionApps = document.getElementById("panorama-section-apps")!;
    this.sectionWidgets = document.getElementById("panorama-section-widgets")!;
    this.sectionSystem = document.getElementById("panorama-section-system")!;
    this.fullAppOverlay = document.getElementById("panorama-full-app-overlay")!;
    this.fullAppContainer = document.getElementById("panorama-full-app-container")!;
    this.appBar = document.getElementById("panorama-app-bar")!;
    this.appDrawerSheet = document.getElementById("panorama-drawer-sheet")!;
  }

  private initSlotContainers(): void {
    this.slotContainers.clear();
    const feedSlot = document.getElementById("panorama-feed-slot");
    const widgetsSlot = document.getElementById("panorama-widgets-slot");
    if (feedSlot) {
      this.slotContainers.set("main", feedSlot);
      this.slotContainers.set("dock", feedSlot);
    }
    if (widgetsSlot) {
      this.slotContainers.set("sidebar", widgetsSlot);
      this.slotContainers.set("widgets", widgetsSlot);
    }
  }

  // --- Live Accent Tiles (Windows Phone Tile Grid) ---

  public renderAppsTiles(): void {
    const grid = document.getElementById("panorama-tiles-grid");
    const countEl = document.getElementById("panorama-apps-count");
    if (!grid) return;

    grid.innerHTML = "";
    const apps = this.installedPlugins.filter((p) => p.enabled);
    if (countEl) countEl.textContent = `${apps.length} app${apps.length === 1 ? "" : "s"}`;

    // Color palette inspired by Windows Phone signature accent colors
    const tileColors = [
      "#00a4ef", // cyan
      "#d4a373", // warm amber
      "#e056fd", // magenta
      "#2ecc71", // emerald
      "#f39c12", // orange
      "#3498db"  // cobalt
    ];

    apps.forEach((plugin, index) => {
      const meta = this.getPluginMeta(plugin);
      const isPinned = this.isAppPinned(plugin);
      const color = tileColors[index % tileColors.length];

      const tile = document.createElement("div");
      tile.className = "panorama-tile";
      tile.dataset.pluginId = plugin.id;
      tile.style.backgroundColor = color;

      let iconSvg = "";
      if (meta.icon && ICONS[meta.icon as IconName]) {
        iconSvg = icon(meta.icon as IconName, 28);
      } else if (plugin.id === "org.omni.plugin.profile" || meta.icon === "profile") {
        iconSvg = icon("user", 28);
      } else {
        iconSvg = icon("apps", 28);
      }

      tile.innerHTML = `
        <div class="panorama-tile-icon">${iconSvg}</div>
        <div class="panorama-tile-title">${meta.name}</div>
        ${isPinned ? `<span class="panorama-tile-pin">${icon("pin", 12)}</span>` : ""}
      `;

      tile.addEventListener("click", () => {
        this.openApp(plugin.id);
      });

      grid.appendChild(tile);
    });
  }

  public renderSystemPluginList(): void {
    const list = document.getElementById("panorama-plugins-list");
    const count = document.getElementById("panorama-plugin-count");
    if (!list) return;

    list.innerHTML = "";
    if (count) count.textContent = `${this.installedPlugins.length} installed`;

    for (const plugin of this.installedPlugins) {
      const meta = this.getPluginMeta(plugin);
      const row = document.createElement("div");
      row.className = "panorama-system-plugin-row";

      const left = document.createElement("div");
      left.style.cssText = "display: flex; flex-direction: column; gap: 2px;";
      left.innerHTML = `
        <strong style="font-size: 0.85rem; color: #fff;">${meta.name}</strong>
        <span style="font-size: 0.7rem; color: #888;">${plugin.id} • ${plugin.enabled ? "Active" : "Disabled"}</span>
      `;

      const right = document.createElement("div");
      right.style.cssText = "display: flex; align-items: center; gap: 8px;";

      const toggle = document.createElement("label");
      toggle.className = "omni-toggle";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = plugin.enabled;
      input.addEventListener("change", async () => {
        plugin.enabled = input.checked;
        await this.remountPlugin(plugin);
      });
      const slider = document.createElement("span");
      slider.className = "toggle-slider";
      toggle.appendChild(input);
      toggle.appendChild(slider);
      right.appendChild(toggle);

      row.appendChild(left);
      row.appendChild(right);
      list.appendChild(row);
    }
  }

  // --- App Overlay & Navigation ---

  public openApp(pluginId: string): void {
    const plugin = this.installedPlugins.find((p) => p.id === pluginId);
    if (!plugin) return;

    this.currentOpenedAppId = pluginId;
    const meta = this.getPluginMeta(plugin);
    const titleEl = document.getElementById("panorama-overlay-title");
    if (titleEl) titleEl.textContent = meta.name;

    // Ensure app container is mounted
    if (!this.kernel.getSandbox(plugin.id)) {
      this.mountPlugin(plugin).catch(console.warn);
    }

    // Hide other pages in overlay, show target page
    const safeId = pluginId.replace(/[^a-zA-Z0-9_-]/g, "-");
    const allPages = this.fullAppContainer?.querySelectorAll<HTMLElement>(".panorama-app-page") || [];
    allPages.forEach((p) => (p.style.display = "none"));

    const target = document.getElementById(`panorama-page-app-${safeId}`);
    if (target) {
      target.style.display = "block";
    }

    this.fullAppOverlay.classList.add("open");
  }

  public closeApp(): void {
    this.currentOpenedAppId = null;
    this.fullAppOverlay.classList.remove("open");
  }

  public showPivot(pivot: PanoramaPivot): void {
    this.activePivot = pivot;
    const buttons = this.pivotHeadersTrack?.querySelectorAll<HTMLElement>(".panorama-pivot-item") || [];
    buttons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.pivot === pivot);
    });

    const targetSection = document.getElementById(`panorama-section-${pivot}`);
    if (targetSection && this.panoramaContainer) {
      targetSection.scrollIntoView({ behavior: "smooth", inline: "start" });
    }
  }

  public showPage(page: string): void {
    if (page === "feed" || page === "org.omni.plugin.feed") {
      this.closeApp();
      this.showPivot("feed");
    } else if (page === "apps") {
      this.closeApp();
      this.showPivot("apps");
    } else if (page === "widgets" || page === "dashboard") {
      this.closeApp();
      this.showPivot("widgets");
    } else if (page === "system" || page === "settings") {
      this.closeApp();
      this.showPivot("system");
    } else {
      this.openApp(page);
    }
  }

  // --- Interactive Controllers Wiring ---

  private wireNavigation(): void {
    const pivotBtns = this.pivotHeadersTrack?.querySelectorAll<HTMLElement>(".panorama-pivot-item") || [];
    pivotBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const pivot = btn.dataset.pivot as PanoramaPivot;
        if (pivot) this.showPivot(pivot);
      });
    });

    // IntersectionObserver to auto-update active pivot on horizontal swipe
    if (typeof IntersectionObserver !== "undefined" && this.panoramaContainer) {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
              const pivot = (entry.target as HTMLElement).dataset.pivot as PanoramaPivot;
              if (pivot && this.activePivot !== pivot) {
                this.activePivot = pivot;
                const buttons = this.pivotHeadersTrack?.querySelectorAll<HTMLElement>(".panorama-pivot-item") || [];
                buttons.forEach((b) => b.classList.toggle("active", b.dataset.pivot === pivot));
              }
            }
          }
        },
        { root: this.panoramaContainer, threshold: 0.5 }
      );

      const sections = this.panoramaContainer.querySelectorAll(".panorama-section");
      sections.forEach((s) => observer.observe(s));
    }
  }

  private wireAppBar(): void {
    // Back button
    const btnBack = document.getElementById("btn-bar-back");
    const btnOverlayBack = document.getElementById("btn-overlay-back");
    const handleBack = () => {
      if (this.currentOpenedAppId) {
        this.closeApp();
      } else if (this.activePivot !== "feed") {
        this.showPivot("feed");
      }
    };
    btnBack?.addEventListener("click", handleBack);
    btnOverlayBack?.addEventListener("click", handleBack);

    // Windows Start / Hub Home button
    const btnHome = document.getElementById("btn-bar-home");
    btnHome?.addEventListener("click", () => {
      this.closeApp();
      this.showPivot("feed");
    });

    // Search button (jump to apps mosaic)
    const btnSearch = document.getElementById("btn-bar-search");
    btnSearch?.addEventListener("click", () => {
      this.closeApp();
      this.showPivot("apps");
    });

    // More ... button (toggle slide-up sheet)
    const btnMore = document.getElementById("btn-bar-more");
    btnMore?.addEventListener("click", () => {
      this.appDrawerSheet.classList.toggle("open");
    });

    // Sheet items
    document.getElementById("sheet-item-close")?.addEventListener("click", () => {
      this.appDrawerSheet.classList.remove("open");
    });

    document.getElementById("sheet-item-switch-classic")?.addEventListener("click", () => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("omni_active_shell", "classic");
        window.location.reload();
      }
    });

    document.getElementById("btn-switch-classic")?.addEventListener("click", () => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("omni_active_shell", "classic");
        window.location.reload();
      }
    });

    document.getElementById("btn-panorama-sync")?.addEventListener("click", async () => {
      try {
        await this.syncWorkspaceToNostr();
        alert("Workspace synced to Nostr relays!");
      } catch (err: any) {
        alert(`Sync failed: ${err.message || String(err)}`);
      }
    });

    document.getElementById("btn-panorama-restore")?.addEventListener("click", async () => {
      try {
        const restored = await this.restoreWorkspaceFromNostr();
        if (restored) alert("Workspace restored from Nostr relays!");
        else alert("No remote workspace found on relays.");
      } catch (err: any) {
        alert(`Restore failed: ${err.message || String(err)}`);
      }
    });
  }

  public async updateProfileUi(): Promise<void> {
    try {
      const pubkey = await this.kernel.getUserPubkey();
      const npub = await this.kernel.getNpub();
      const shortNpub = `${npub.slice(0, 10)}...${npub.slice(-4)}`;

      const nameEl = document.getElementById("panorama-display-name");
      const npubEl = document.getElementById("panorama-npub");
      const avatarEl = document.getElementById("panorama-avatar");

      if (npubEl) npubEl.textContent = shortNpub;

      const profile = await this.kernel.getProfile(pubkey);
      if (profile && nameEl) {
        nameEl.textContent = profile.display_name || profile.name || shortNpub;
        if (profile.picture && avatarEl) {
          avatarEl.innerHTML = `<img src="${profile.picture}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 2px;" />`;
        }
      }
    } catch (_) {}
  }
}
