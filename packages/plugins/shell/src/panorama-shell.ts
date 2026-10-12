import { OmniKernel, WebCryptoKeystore, NostrPluginResolver, LayoutManager, STANDARD_SLOTS } from "@omni/core";
import { OmniWorkspaceState, OmniWorkspacePluginConfig, PluginPlacement, OMNI_WORKSPACE_D_TAG, NostrEvent, PluginViewDeclaration, OmniShellHost } from "@omni/types";
import { ICONS, icon, IconName } from "./icons.js";
import { InstalledPluginEntry, OmniShellOptions } from "./shell.js";
import {
  renderNostrWritePermissionsSection,
  renderHandledIntentsSection,
  showIntentEnableToast
} from "./permissions-intents-ui.js";
import { mountShellStyles, unmountShellStyles } from "./styles/loader.js";
import { PANORAMA_SHELL_CSS } from "./styles/panorama-styles.js";
import { shellRegistry } from "./shell-registry.js";

export type PanoramaPivot = "feed" | "apps" | "widgets" | "system" | string;

/**
 * PanoramaShell: Windows Phone "People Hub" Inspired Modern Typography & Panorama Runtime.
 *
 * Visual & Operational Characteristics:
 * - Huge lowercase hero title: "omni"
 * - Horizontal panorama header track: "feed", dynamic main apps, "apps", "widgets", "system"
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
  private isProgrammaticScroll: boolean = false;
  private programmaticScrollTimer: any = null;
  private scrollDebounceTimer: any = null;

  // Internal element references
  private panoramaContainer!: HTMLElement;
  private pivotHeadersTrack!: HTMLElement;
  private sectionApps!: HTMLElement;
  private sectionWidgets!: HTMLElement;
  private sectionSystem!: HTMLElement;
  private fullAppOverlay!: HTMLElement;
  private fullAppContainer!: HTMLElement;

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

  public getMainAppPlugins(): InstalledPluginEntry[] {
    return this.installedPlugins.filter((p) => {
      if (p.enabled === false) return false;
      const placements = this.getPluginPlacements(p);
      return (
        p.viewport === "main" ||
        placements.some((pl) => pl.enabled !== false && pl.viewport === "main")
      );
    });
  }

  // --- Mounting & Container Resolution ---

  public getContainerForPluginSlot(pluginId: string, slotId: string, compId?: string): Element {
    if (slotId === "main" || slotId === "dock") {
      const safeId = pluginId.replace(/[^a-zA-Z0-9_-]/g, "-");
      if (compId?.includes("overlay")) {
        return this.ensureAppPage(pluginId);
      }
      const canvasSlot = document.getElementById(`panorama-slot-main-${safeId}`);
      if (canvasSlot) {
        return canvasSlot;
      }
      return this.ensureAppPage(pluginId);
    }

    if (slotId === "sidebar" || slotId === "widgets") {
      return document.getElementById("panorama-widgets-slot") || this.sectionWidgets;
    }

    return this.slotContainers.get(slotId) || document.getElementById("panorama-widgets-slot") || this.root;
  }

  public ensureMainAppSections(): void {
    if (!this.panoramaContainer) return;
    const mainApps = this.getMainAppPlugins();
    const appsSection = document.getElementById("panorama-section-apps");

    // Remove any main app canvas sections for plugins no longer assigned to main
    const currentSections = this.panoramaContainer.querySelectorAll<HTMLElement>(".panorama-section-custom-main");
    currentSections.forEach((sec) => {
      const pId = sec.dataset.pluginId;
      if (!mainApps.some((a) => a.id === pId)) {
        sec.remove();
      }
    });

    for (const app of mainApps) {
      const safeId = app.id.replace(/[^a-zA-Z0-9_-]/g, "-");
      let sec = document.getElementById(`panorama-section-${safeId}`) as HTMLElement | null;
      if (!sec) {
        sec = document.createElement("section");
        sec.className = "panorama-section panorama-section-custom-main";
        sec.id = `panorama-section-${safeId}`;
        sec.dataset.pivot = app.id;
        sec.dataset.pluginId = app.id;

        const meta = this.getPluginMeta(app);
        sec.innerHTML = `
          <div class="panorama-section-content">
            <div class="panorama-section-title-bar">
              <h2>${(app.name || meta.name).toLowerCase()}</h2>
              <span class="panorama-badge">application</span>
            </div>
            <div id="panorama-slot-main-${safeId}" class="omni-slot panorama-main-viewport-slot" style="flex: 1; width: 100%; min-height: 100%; overflow: visible;"></div>
          </div>
        `;

        if (appsSection && appsSection.parentNode === this.panoramaContainer) {
          this.panoramaContainer.insertBefore(sec, appsSection);
        } else {
          this.panoramaContainer.appendChild(sec);
        }
      }
    }
  }

  public ensureAppPage(pluginId: string): HTMLElement {
    const safeId = pluginId.replace(/[^a-zA-Z0-9_-]/g, "-");
    let pageEl = document.getElementById(`panorama-page-app-${safeId}`);
    if (!pageEl) {
      pageEl = document.createElement("section");
      pageEl.className = "panorama-app-page";
      pageEl.id = `panorama-page-app-${safeId}`;
      pageEl.dataset.pluginId = pluginId;
      pageEl.style.cssText = "display: none; width: 100%; min-height: 100%; overflow: visible; padding: 16px 24px;";

      const slotEl = document.createElement("div");
      slotEl.className = "omni-slot panorama-main-viewport-slot";
      slotEl.id = `panorama-slot-overlay-${safeId}`;
      slotEl.style.cssText = "width: 100%; min-height: 100%; overflow: visible;";
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
    const safeId = plugin.id.replace(/[^a-zA-Z0-9_-]/g, "-");
    const pageEl = document.getElementById(`panorama-page-app-${safeId}`);
    if (pageEl) {
      const slot = pageEl.querySelector(".panorama-main-viewport-slot");
      if (slot) slot.innerHTML = "";
    }
    this.ensureMainAppSections();
    this.renderPivotNavigation();
    if (plugin.enabled !== false) {
      await this.mountPlugin(plugin);
    }
    this.renderAppsTiles();
    this.renderSystemPluginList();
    this.saveLocalWorkspace();
  }

  public isAppPinned(p: InstalledPluginEntry): boolean {
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
      defaultIntents: this.kernel.intentBroker.getAllDefaultHandlers(),
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
          handledIntents: p.handledIntents,
          disabledIntents: p.disabledIntents,
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

    if (state.defaultIntents) {
      for (const [action, pId] of Object.entries(state.defaultIntents)) {
        this.kernel.intentBroker.setDefaultHandler(action, pId);
      }
    }

    for (const item of state.plugins) {
      const plugin = this.installedPlugins.find((p) => p.id === item.id);
      if (plugin) {
        if (typeof item.enabled === "boolean") plugin.enabled = item.enabled;
        if (typeof item.pinned === "boolean") plugin.pinned = item.pinned;
        if (item.relays !== undefined) plugin.relays = item.relays;
        if (item.handledIntents !== undefined) plugin.handledIntents = item.handledIntents;
        if (item.disabledIntents !== undefined) {
          plugin.disabledIntents = item.disabledIntents;
          for (const act of (plugin.handledIntents || [])) {
            const isDis = plugin.disabledIntents.includes(act);
            this.kernel.intentBroker.setPluginIntentEnabled(plugin.id, act, !isDis);
          }
        }
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
    mountShellStyles(PANORAMA_SHELL_CSS);
    if (typeof document !== "undefined") {
      document.documentElement.classList.add("theme-panorama");
      document.body?.classList.add("theme-panorama");
    }
    this.renderSkeleton();
    this.cacheElementReferences();
    this.initSlotContainers();
    this.ensureMainAppSections();
    const mainApps = this.getMainAppPlugins();
    if (mainApps.length > 0) {
      this.activePivot = mainApps[0].id;
    } else {
      this.activePivot = "apps";
    }
    this.renderAppsTiles();
    this.renderSystemPluginList();
    this.wireNavigation();
    this.wireGlobalEvents();
    this.updateProfileUi();

    // Wire intent broker callbacks for conflict resolution & single candidate flow
    this.kernel.intentBroker.setPromptEnableCandidateCallback(async (action, candidate) => {
      return new Promise<boolean>((resolve) => {
        this.showEnableCandidateToast(action, candidate, resolve);
      });
    });

    this.kernel.intentBroker.setDisambiguateCallback(async (action, candidates, data) => {
      return this.promptDisambiguateIntent(action, candidates, data);
    });
  }

  public destroy(): void {
    unmountShellStyles();
    if (typeof document !== "undefined") {
      document.documentElement.classList.remove("theme-panorama");
      document.body?.classList.remove("theme-panorama");
    }
    if (this.root) {
      this.root.innerHTML = "";
    }
  }

  public getActivePageId(): string {
    return this.activePivot;
  }

  private renderSkeleton(): void {
    this.root.innerHTML = `
      <div class="panorama-shell-root" id="panorama-shell-root">
        <style id="panorama-embedded-theme">
          .panorama-shell-root {
            --omni-bg-canvas: #000000;
            --omni-bg-surface: #111111;
            --omni-bg-elevated: #161616;
            --omni-bg-subtle: #222222;
            --omni-text-primary: #ffffff;
            --omni-text-secondary: #aaaaaa;
            --omni-text-muted: #666666;
            --omni-border-subtle: #1e1e1e;
            --omni-border-strong: #333333;
            --omni-border-focus: #00a4ef;
            --omni-accent-primary: #00a4ef;
            --omni-accent-hover: #0078d7;
            --omni-accent-contrast: #ffffff;
            --omni-status-online: #00a4ef;
            --omni-status-badge: #00a4ef;
            --omni-radius-sm: 0px;
            --omni-radius-md: 0px;
            --omni-radius-lg: 0px;
            --omni-radius-pill: 0px;

            --bg-canvas: #000000;
            --bg-surface: #111111;
            --bg-elevated: #161616;
            --bg-subtle: #222222;
            --text-primary: #ffffff;
            --text-secondary: #aaaaaa;
            --text-muted: #666666;
            --border-subtle: #1e1e1e;
            --border-strong: #333333;
            --border-focus: #00a4ef;
            --accent-primary: #00a4ef;
            --accent-hover: #0078d7;
            --accent-contrast: #ffffff;
            --status-online: #00a4ef;
            --status-badge: #00a4ef;
            --radius-sm: 0px;
            --radius-md: 0px;
            --radius-lg: 0px;
            --radius-pill: 0px;
          }
          .panorama-shell-root,
          .panorama-shell-root * {
            scrollbar-width: none !important;
            -ms-overflow-style: none !important;
          }
          .panorama-shell-root::-webkit-scrollbar,
          .panorama-shell-root *::-webkit-scrollbar {
            display: none !important;
            width: 0 !important;
            height: 0 !important;
          }
          .panorama-shell-root .timer-widget-card,
          .panorama-shell-root .checklist-widget-card,
          .panorama-shell-root .checklist-card,
          .panorama-shell-root .widget-card {
            background: #111111 !important;
            border-color: #222222 !important;
            border-radius: 0px !important;
          }
          .panorama-shell-root .feed-composer,
          .panorama-shell-root .composer-card {
            background: transparent !important;
            border: none !important;
            border-bottom: none !important;
            border-top: none !important;
            border-left: none !important;
            border-right: none !important;
            box-shadow: none !important;
          }
          .panorama-shell-root .composer-input,
          .panorama-shell-root textarea.composer-input {
            background: transparent !important;
            border: none !important;
            outline: none !important;
            box-shadow: none !important;
          }
          .panorama-shell-root .composer-toolbar {
            border-top: none !important;
          }
          .panorama-shell-root .feed-post,
          .panorama-shell-root .note-card {
            background: transparent !important;
            border: none !important;
            border-bottom: none !important;
            box-shadow: none !important;
          }
          .panorama-shell-root .feed-post:hover,
          .panorama-shell-root .note-card:hover {
            background: transparent !important;
          }
          .panorama-shell-root .feed-action-btn,
          .panorama-shell-root .note-action-btn {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            color: var(--omni-accent-primary, #00a4ef) !important;
          }
          .panorama-shell-root .btn-publish,
          .panorama-shell-root .btn-timer-start,
          .panorama-shell-root .btn-add-task {
            background: #00a4ef !important;
            color: #ffffff !important;
            border: none !important;
            border-radius: 0px !important;
          }
          .panorama-shell-root .btn-refresh-feed,
          .panorama-shell-root .btn-timer-pause,
          .panorama-shell-root .btn-timer-reset {
            border-radius: 0px !important;
          }
          .panorama-shell-root .new-posts-pill {
            background: #00a4ef !important;
            color: #ffffff !important;
            border-radius: 0px !important;
          }
          .panorama-shell-root .cache-indicator,
          .panorama-shell-root .note-author,
          .panorama-shell-root .timer-digits {
            color: #00a4ef !important;
          }
          .panorama-shell-root .omni-toggle input:checked + .toggle-slider {
            background-color: #00a4ef !important;
            border-color: #00a4ef !important;
          }
          .panorama-shell-root .toggle-slider {
            border-radius: 0px !important;
          }
          .panorama-shell-root .toggle-slider:before {
            border-radius: 0px !important;
          }
        </style>
        <!-- 1. Panorama Hero Header -->
        <header class="panorama-hero-header">
          <div class="panorama-brand-row">
            <h1 class="panorama-hero-title">omni</h1>
          </div>
          <nav class="panorama-pivot-nav" id="panorama-pivot-nav"></nav>
        </header>

        <!-- 2. Horizontal Panorama Canvas -->
        <div class="panorama-canvas" id="panorama-canvas">
          <!-- Section: Apps (Live Tiles Mosaic & Embedded Application View) -->
          <section class="panorama-section" id="panorama-section-apps" data-pivot="apps">
            <!-- Grid of application tiles (default state) -->
            <div class="panorama-section-content" id="panorama-apps-grid-view">
              <div class="panorama-section-title-bar">
                <h2>applications</h2>
                <span class="panorama-badge" id="panorama-apps-count">0 tiles</span>
              </div>
              <div class="panorama-tiles-grid" id="panorama-tiles-grid"></div>
            </div>

            <!-- Active Application View (opened within applications pane) -->
            <div class="panorama-section-content panorama-apps-active-view panorama-full-app-overlay" id="panorama-full-app-overlay" style="display: none;">
              <div class="panorama-section-title-bar" style="display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <button class="btn-app-bar-circle" id="btn-overlay-back" style="width: 28px; height: 28px; border: 1px solid #444;" title="Back to applications list">
                    ${icon("arrow-left", 14)}
                  </button>
                  <h2 id="panorama-overlay-title" style="margin: 0; font-size: 1.15rem; font-weight: 400; color: #fff;">Application</h2>
                </div>
                <span class="panorama-badge">application</span>
              </div>
              <div class="panorama-full-app-container" id="panorama-full-app-container" style="flex: 1; width: 100%; min-height: 100%; overflow: visible;"></div>
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
                  <div id="panorama-shell-switcher-buttons" style="display: flex; gap: 6px; flex-wrap: wrap;"></div>
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

        <!-- 4. Plugin Inspector Modal -->
        <div class="panorama-inspector-modal" id="panorama-inspector-modal" style="display: none;">
          <div class="panorama-inspector-content">
            <div class="panorama-inspector-header">
              <h3 id="panorama-inspector-title" style="margin: 0; font-size: 1rem; color: #fff;">Plugin Inspector</h3>
              <button class="btn-app-bar-circle" id="btn-inspector-close" style="width: 32px; height: 32px; border: 1px solid #666;" title="Close">
                ${icon("close", 16)}
              </button>
            </div>
            <div class="panorama-inspector-body" id="panorama-inspector-body"></div>
          </div>
        </div>

        <!-- 5. "Open With..." System Chooser Modal -->
        <div class="panorama-inspector-modal" id="panorama-open-with-modal" style="display: none; align-items: center; justify-content: center;">
          <div class="panorama-inspector-content" style="max-width: 440px; width: 90%;">
            <div class="panorama-inspector-header">
              <h3 id="panorama-open-with-title" style="margin: 0; font-size: 1rem; color: #fff;">Open With...</h3>
              <button class="btn-app-bar-circle" id="btn-panorama-open-with-close" style="width: 32px; height: 32px; border: 1px solid #666;" title="Close">
                ${icon("close", 16)}
              </button>
            </div>
            <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px;">
              <div style="background: #111; padding: 8px 10px; border: 1px solid #222;">
                <span id="panorama-open-with-target" style="font-size: 0.75rem; color: #00a4ef; word-break: break-all; font-family: var(--omni-font-mono);"></span>
              </div>
              <div id="panorama-open-with-list" style="display: flex; flex-direction: column; gap: 6px; max-height: 200px; overflow-y: auto;"></div>
              <label style="display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: #aaa; cursor: pointer; padding-top: 4px; border-top: 1px solid #222;">
                <input id="panorama-open-with-always" type="checkbox" />
                <span id="panorama-open-with-always-label">Always use this application</span>
              </label>
              <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px;">
                <button id="btn-panorama-open-with-cancel" class="btn-panorama-action" style="padding: 6px 12px;">Cancel</button>
                <button id="btn-panorama-open-with-confirm" class="btn-panorama-action" style="padding: 6px 12px; border-color: #00a4ef; color: #00a4ef;" disabled>Open</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private cacheElementReferences(): void {
    const q = (sel: string) => (this.root.querySelector(sel) || document.querySelector(sel)) as HTMLElement;
    this.panoramaContainer = q("#panorama-canvas");
    this.pivotHeadersTrack = q("#panorama-pivot-nav");
    this.sectionApps = q("#panorama-section-apps");
    this.sectionWidgets = q("#panorama-section-widgets");
    this.sectionSystem = q("#panorama-section-system");
    this.fullAppOverlay = q("#panorama-full-app-overlay");
    this.fullAppContainer = q("#panorama-full-app-container");
  }

  private initSlotContainers(): void {
    this.slotContainers.clear();
    const widgetsSlot = this.root.querySelector("#panorama-widgets-slot") || document.getElementById("panorama-widgets-slot");
    if (widgetsSlot) {
      this.slotContainers.set("sidebar", widgetsSlot);
      this.slotContainers.set("widgets", widgetsSlot);
    }
  }

  // --- Live Accent Tiles (Windows Phone Tile Grid) ---

  public renderAppsTiles(): void {
    const grid = this.root.querySelector("#panorama-tiles-grid") || document.getElementById("panorama-tiles-grid");
    const countEl = this.root.querySelector("#panorama-apps-count") || document.getElementById("panorama-apps-count");
    if (!grid) return;

    grid.innerHTML = "";
    const apps = this.installedPlugins.filter((p) => p.enabled !== false);
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
        this.showPage(plugin.id);
      });

      grid.appendChild(tile);
    });
  }

  public renderSystemPluginList(): void {
    const list = (this.root.querySelector("#panorama-plugins-list") || document.getElementById("panorama-plugins-list")) as HTMLElement | null;
    const count = this.root.querySelector("#panorama-plugin-count") || document.getElementById("panorama-plugin-count");
    if (!list) return;

    list.innerHTML = "";
    if (count) count.textContent = `${this.installedPlugins.length} installed`;

    const viewportOptions = this.getAvailableViewports();

    for (const plugin of this.installedPlugins) {
      const meta = this.getPluginMeta(plugin);
      const safeId = plugin.id.replace(/[^a-zA-Z0-9_-]/g, "-");
      const synthManifest = this.ensurePluginManifest(plugin);
      const pluginViews = (synthManifest.views && synthManifest.views.length > 0)
        ? synthManifest.views
        : (plugin.views && plugin.views.length > 0)
        ? plugin.views
        : [{ id: "main", title: "Main App", path: "" }];
      const settingsView = pluginViews.find((v: any) => v.id === "settings" || v.path.includes("settings"));
      const isExpanded = this.expandedPluginId === plugin.id;

      const card = document.createElement("div");
      card.className = "panorama-plugin-config-card";
      card.dataset.pluginId = plugin.id;
      card.style.cssText = "background: #111; border: 1px solid #222; margin-bottom: 8px;";

      // 1. Header row
      const header = document.createElement("div");
      header.className = "panorama-plugin-config-header";
      header.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; cursor: pointer;";

      const left = document.createElement("div");
      left.style.cssText = "display: flex; align-items: center; gap: 10px; flex: 1;";

      const safeIconName: IconName =
        meta.icon === "relays" ? "relay" :
        meta.icon === "profile" ? "user" :
        meta.icon === "check-circle" || meta.icon === "checklist" ? "check" :
        (ICONS[meta.icon as IconName] ? (meta.icon as IconName) : "plugins");

      const iconBox = document.createElement("div");
      iconBox.style.cssText = "width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; color: var(--omni-accent-primary, #00a4ef); flex-shrink: 0;";
      iconBox.innerHTML = icon(safeIconName, 18);

      const titleCol = document.createElement("div");
      titleCol.style.cssText = "display: flex; flex-direction: column; gap: 2px;";
      titleCol.innerHTML = `
        <div style="display: flex; align-items: center; gap: 6px;">
          <strong style="font-size: 0.88rem; color: #fff;">${meta.name}</strong>
          <span style="font-size: 0.65rem; color: #888; background: #1a1a1a; padding: 1px 5px; border-radius: 0;">v${meta.version}</span>
        </div>
        <span style="font-size: 0.7rem; color: #888;">${plugin.id} • ${plugin.enabled ? "Active" : "Disabled"}</span>
      `;

      left.appendChild(iconBox);
      left.appendChild(titleCol);
      left.addEventListener("click", () => {
        this.expandedPluginId = isExpanded ? null : plugin.id;
        this.renderSystemPluginList();
      });

      const right = document.createElement("div");
      right.style.cssText = "display: flex; align-items: center; gap: 10px;";

      const toggle = document.createElement("label");
      toggle.className = "omni-toggle";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = plugin.enabled;
      input.addEventListener("change", async (e) => {
        e.stopPropagation();
        plugin.enabled = input.checked;
        await this.remountPlugin(plugin);
      });
      const slider = document.createElement("span");
      slider.className = "toggle-slider";
      toggle.appendChild(input);
      toggle.appendChild(slider);
      right.appendChild(toggle);

      const btnExpand = document.createElement("button");
      btnExpand.className = "btn-expand-plugin";
      btnExpand.id = `btn-expand-plugin-${safeId}`;
      btnExpand.style.cssText = "background: transparent; border: none; color: #aaa; cursor: pointer; padding: 4px; display: flex; align-items: center;";
      btnExpand.title = isExpanded ? "Collapse settings" : "Configure plugin";
      btnExpand.innerHTML = icon(isExpanded ? "chevron-up" : "chevron-down", 16);
      btnExpand.addEventListener("click", (e) => {
        e.stopPropagation();
        this.expandedPluginId = isExpanded ? null : plugin.id;
        this.renderSystemPluginList();
      });
      right.appendChild(btnExpand);

      header.appendChild(left);
      header.appendChild(right);
      card.appendChild(header);

      // 2. Expanded Details
      if (isExpanded) {
        const details = document.createElement("div");
        details.className = "panorama-plugin-config-details";
        details.style.cssText = "display: flex; flex-direction: column; gap: 12px; padding: 12px 14px 16px 14px; border-top: 1px solid #1a1a1a; background: #0c0c0c;";

        // Section A: Sandboxed Settings
        const settingsBox = document.createElement("div");
        settingsBox.className = "panorama-config-section plugin-settings-box";
        settingsBox.style.cssText = "display: flex; flex-direction: column; gap: 8px; background: #141414; padding: 10px 12px; border: 1px solid #222;";

        const settingsHeader = document.createElement("div");
        settingsHeader.className = "panorama-config-section-title";
        settingsHeader.style.cssText = "display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem; font-weight: 600; color: #fff;";

        const settingsTitle = document.createElement("span");
        settingsTitle.textContent = "Settings & Preferences";
        settingsHeader.appendChild(settingsTitle);

        const mountContainer = document.createElement("div");
        mountContainer.id = `panorama-settings-mount-${safeId}`;
        mountContainer.className = "plugin-settings-mount-container";
        mountContainer.style.cssText = "display: none; margin-top: 6px; padding: 10px; background: #000; border: 1px solid #222;";

        if (settingsView) {
          const btnToggleSettings = document.createElement("button");
          btnToggleSettings.className = "btn-panorama-action btn-plugin-settings";
          btnToggleSettings.id = `btn-toggle-settings-${safeId}`;
          btnToggleSettings.textContent = "Open Settings";

          btnToggleSettings.addEventListener("click", async () => {
            const isOpen = mountContainer.style.display !== "none";
            if (!isOpen) {
              mountContainer.style.display = "block";
              btnToggleSettings.textContent = "Loading...";
              try {
                await this.kernel.mountPluginSettings(
                  plugin.id,
                  synthManifest,
                  plugin.htmlContent || plugin.scriptContent,
                  mountContainer,
                  settingsView.path || "?view=settings"
                );
                btnToggleSettings.textContent = "Close Settings";
              } catch (err) {
                console.error(`Failed to mount settings for ${plugin.id}:`, err);
                mountContainer.textContent = "Failed to load settings.";
                btnToggleSettings.textContent = "Open Settings";
              }
            } else {
              this.kernel.destroyPluginSettings(plugin.id);
              mountContainer.style.display = "none";
              mountContainer.innerHTML = "";
              btnToggleSettings.textContent = "Open Settings";
            }
          });

          settingsHeader.appendChild(btnToggleSettings);
          settingsBox.appendChild(settingsHeader);
          settingsBox.appendChild(mountContainer);
        } else {
          const noSettingsNote = document.createElement("div");
          noSettingsNote.style.cssText = "font-size: 0.72rem; color: #888; font-style: italic;";
          noSettingsNote.textContent = "No custom settings view declared. Configure viewports and placements below.";
          settingsBox.appendChild(settingsHeader);
          settingsBox.appendChild(noSettingsNote);
        }
        details.appendChild(settingsBox);

        // Section B: Assigned Viewports & Routes
        const placementsBox = document.createElement("div");
        placementsBox.className = "panorama-config-section plugin-placements-section";
        placementsBox.style.cssText = "display: flex; flex-direction: column; gap: 8px; background: #141414; padding: 10px 12px; border: 1px solid #222;";

        const placementsHeader = document.createElement("div");
        placementsHeader.className = "panorama-config-section-title";
        placementsHeader.style.cssText = "display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem; font-weight: 600; color: #fff;";

        const placementsTitle = document.createElement("span");
        placementsTitle.textContent = "Assigned Viewports & Routes";
        placementsHeader.appendChild(placementsTitle);

        const btnAddPlacement = document.createElement("button");
        btnAddPlacement.className = "btn-panorama-action btn-add-placement";
        btnAddPlacement.id = `btn-add-placement-${safeId}`;
        btnAddPlacement.textContent = "+ Add Location";
        btnAddPlacement.addEventListener("click", async () => {
          const currentPlacements = this.getPluginPlacements(plugin);
          const newPl: PluginPlacement = {
            id: `placement-${Date.now()}`,
            viewport: "sidebar",
            route: pluginViews[0]?.path || "",
            viewId: pluginViews[0]?.id || "main",
            enabled: true
          };
          plugin.placements = [...currentPlacements, newPl];
          plugin.viewport = plugin.placements[0].viewport;
          plugin.route = plugin.placements[0].route;
          plugin.viewId = plugin.placements[0].viewId;
          await this.remountPlugin(plugin);
        });
        placementsHeader.appendChild(btnAddPlacement);
        placementsBox.appendChild(placementsHeader);

        const placements = this.getPluginPlacements(plugin);
        if (placements.length === 0) {
          const emptyPl = document.createElement("div");
          emptyPl.className = "empty-placements-note";
          emptyPl.style.cssText = "font-size: 0.72rem; color: #888; font-style: italic;";
          emptyPl.textContent = "Unassigned — Not currently placed in any viewport.";
          placementsBox.appendChild(emptyPl);
        }

        for (let plIdx = 0; plIdx < placements.length; plIdx++) {
          const pl = placements[plIdx];
          const row = document.createElement("div");
          row.className = "plugin-placement-row";
          row.style.cssText = "display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; background: #0c0c0c; padding: 8px 10px; border: 1px solid #1e1e1e;";

          const controlsLeft = document.createElement("div");
          controlsLeft.style.cssText = "display: flex; align-items: center; gap: 6px; flex-wrap: wrap;";

          const vpLabel = document.createElement("span");
          vpLabel.style.cssText = "font-size: 0.72rem; color: #888;";
          vpLabel.textContent = `Location #${plIdx + 1}:`;

          const vpSelect = document.createElement("select");
          vpSelect.className = "plugin-viewport-select";
          vpSelect.style.cssText = "background: #191919; border: 1px solid #333; color: #fff; font-size: 0.72rem; padding: 3px 6px; outline: none; cursor: pointer;";

          for (const optDef of viewportOptions) {
            const opt = document.createElement("option");
            opt.value = optDef.id;
            opt.textContent = optDef.label;
            if (optDef.id === pl.viewport) opt.selected = true;
            vpSelect.appendChild(opt);
          }

          vpSelect.addEventListener("change", async () => {
            pl.viewport = vpSelect.value;
            plugin.viewport = pl.viewport;
            if (pl.viewport === "main" || pl.viewport === "dock") {
              plugin.pinned = true;
            }
            const primaryComp = synthManifest.components?.[0];
            if (primaryComp) {
              this.layoutManager.setComponentSlot(plugin.id, primaryComp.id, pl.viewport);
            }
            await this.remountPlugin(plugin);
          });

          const routeLabel = document.createElement("span");
          routeLabel.style.cssText = "font-size: 0.72rem; color: #888; margin-left: 4px;";
          routeLabel.textContent = "View:";

          const routeSelect = document.createElement("select");
          routeSelect.className = "plugin-route-select";
          routeSelect.style.cssText = "background: #191919; border: 1px solid #333; color: #fff; font-size: 0.72rem; padding: 3px 6px; outline: none; cursor: pointer;";

          for (const v of pluginViews) {
            const opt = document.createElement("option");
            opt.value = v.path;
            opt.textContent = `${v.title} (${v.path || "/"})`;
            if ((pl.route !== undefined && pl.route === v.path) || (!pl.route && v.id === "main")) {
              opt.selected = true;
            }
            routeSelect.appendChild(opt);
          }

          routeSelect.addEventListener("change", async () => {
            pl.route = routeSelect.value;
            const matchedView = pluginViews.find((v: any) => v.path === routeSelect.value);
            pl.viewId = matchedView?.id || "main";
            plugin.route = pl.route;
            plugin.viewId = pl.viewId;
            await this.remountPlugin(plugin);
          });

          controlsLeft.appendChild(vpLabel);
          controlsLeft.appendChild(vpSelect);
          controlsLeft.appendChild(routeLabel);
          controlsLeft.appendChild(routeSelect);

          if (pl.viewport === "main") {
            const isPinned = this.isAppPinned(plugin);
            const pinBtn = document.createElement("button");
            pinBtn.className = "btn-panorama-action btn-pin-dock";
            pinBtn.style.cssText = `font-size: 0.7rem; padding: 2px 7px; display: inline-flex; align-items: center; gap: 4px; color: ${
              isPinned ? "var(--omni-accent-primary, #00a4ef)" : "#888"
            };`;
            pinBtn.innerHTML = `${icon("pin", 12)} <span>${isPinned ? "Pinned to Tiles" : "Pin to Tiles"}</span>`;
            pinBtn.title = isPinned ? "Unpin tile" : "Pin live tile";
            pinBtn.addEventListener("click", () => {
              this.setAppPinned(plugin.id, !isPinned);
              this.renderSystemPluginList();
            });
            controlsLeft.appendChild(pinBtn);
          }

          row.appendChild(controlsLeft);

          const btnRemovePl = document.createElement("button");
          btnRemovePl.className = "btn-panorama-action btn-remove-placement";
          btnRemovePl.style.cssText = "font-size: 0.68rem; padding: 2px 6px; color: #ff5555; border-color: #552222;";
          btnRemovePl.textContent = placements.length > 1 ? "Remove" : "Unassign";
          btnRemovePl.title = "Remove this placement";
          btnRemovePl.addEventListener("click", async () => {
            plugin.placements = placements.filter((_, idx) => idx !== plIdx);
            if (plugin.placements.length > 0) {
              plugin.viewport = plugin.placements[0].viewport;
              plugin.route = plugin.placements[0].route;
              plugin.viewId = plugin.placements[0].viewId;
            } else {
              plugin.viewport = "";
              plugin.route = "";
              plugin.viewId = "";
              this.layoutManager.unregisterPlugin(plugin.id);
            }
            await this.remountPlugin(plugin);
          });
          row.appendChild(btnRemovePl);

          placementsBox.appendChild(row);
        }
        details.appendChild(placementsBox);

        // Section C: Relay Access Scoping
        const relayAccessBox = document.createElement("div");
        relayAccessBox.className = "panorama-config-section plugin-relay-access-box";
        relayAccessBox.style.cssText = "display: flex; flex-direction: column; gap: 8px; background: #141414; padding: 10px 12px; border: 1px solid #222;";

        const relayHeader = document.createElement("div");
        relayHeader.className = "panorama-config-section-title";
        relayHeader.style.cssText = "display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem; font-weight: 600; color: #fff;";

        const relayTitle = document.createElement("span");
        relayTitle.textContent = "Relay Access";

        const allRelays = this.kernel.relayPool.getAllRelays().map((r) => r.url);
        const isCustomRelays = Array.isArray(plugin.relays) && plugin.relays.length > 0;

        const relayModePill = document.createElement("span");
        relayModePill.style.cssText = "font-size: 0.68rem; padding: 1px 6px; background: #222; color: #aaa;";
        relayModePill.textContent = isCustomRelays
          ? `Custom (${plugin.relays!.length} relay${plugin.relays!.length === 1 ? "" : "s"})`
          : "All Relays (Default)";

        relayHeader.appendChild(relayTitle);
        relayHeader.appendChild(relayModePill);
        relayAccessBox.appendChild(relayHeader);

        const relayDesc = document.createElement("div");
        relayDesc.style.cssText = "font-size: 0.72rem; color: #888;";
        relayDesc.textContent = "Restrict this plugin to specific relays, or allow it to use all configured relays.";
        relayAccessBox.appendChild(relayDesc);

        const relayOptionsWrap = document.createElement("div");
        relayOptionsWrap.style.cssText = "display: flex; flex-direction: column; gap: 6px; margin-top: 2px;";

        const radAllLabel = document.createElement("label");
        radAllLabel.style.cssText = "display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: #fff; cursor: pointer;";
        const radAll = document.createElement("input");
        radAll.type = "radio";
        radAll.name = `panorama-relay-scope-${safeId}`;
        radAll.checked = !isCustomRelays;
        radAllLabel.appendChild(radAll);
        radAllLabel.appendChild(document.createTextNode("All Configured Relays (Default)"));
        relayOptionsWrap.appendChild(radAllLabel);

        const radCustomLabel = document.createElement("label");
        radCustomLabel.style.cssText = "display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: #fff; cursor: pointer;";
        const radCustom = document.createElement("input");
        radCustom.type = "radio";
        radCustom.name = `panorama-relay-scope-${safeId}`;
        radCustom.checked = isCustomRelays;
        radCustomLabel.appendChild(radCustom);
        radCustomLabel.appendChild(document.createTextNode("Custom Relays"));
        relayOptionsWrap.appendChild(radCustomLabel);

        const customCheckboxesContainer = document.createElement("div");
        customCheckboxesContainer.style.cssText = `display: ${isCustomRelays ? "flex" : "none"}; flex-direction: column; gap: 5px; margin-left: 18px; padding-top: 4px;`;

        const selectedCustomRelays = new Set<string>(plugin.relays || []);

        for (const rUrl of allRelays) {
          const cbLabel = document.createElement("label");
          cbLabel.style.cssText = "display: flex; align-items: center; gap: 6px; font-size: 0.72rem; color: #aaa; cursor: pointer;";
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked = selectedCustomRelays.has(rUrl);
          cb.addEventListener("change", async () => {
            if (cb.checked) {
              selectedCustomRelays.add(rUrl);
            } else {
              selectedCustomRelays.delete(rUrl);
            }
            plugin.relays = Array.from(selectedCustomRelays);
            relayModePill.textContent = `Custom (${plugin.relays.length} relay${plugin.relays.length === 1 ? "" : "s"})`;
            await this.remountPlugin(plugin);
          });
          cbLabel.appendChild(cb);
          const codeSpan = document.createElement("code");
          codeSpan.style.cssText = "font-family: var(--omni-font-mono); font-size: 0.7rem; color: #ddd;";
          codeSpan.textContent = rUrl;
          cbLabel.appendChild(codeSpan);
          customCheckboxesContainer.appendChild(cbLabel);
        }

        radAll.addEventListener("change", async () => {
          if (radAll.checked) {
            customCheckboxesContainer.style.display = "none";
            plugin.relays = undefined;
            relayModePill.textContent = "All Relays (Default)";
            await this.remountPlugin(plugin);
          }
        });

        radCustom.addEventListener("change", async () => {
          if (radCustom.checked) {
            customCheckboxesContainer.style.display = "flex";
            if (selectedCustomRelays.size === 0 && allRelays.length > 0) {
              selectedCustomRelays.add(allRelays[0]);
              const firstCb = customCheckboxesContainer.querySelector("input[type=checkbox]") as HTMLInputElement | null;
              if (firstCb) firstCb.checked = true;
            }
            plugin.relays = Array.from(selectedCustomRelays);
            relayModePill.textContent = `Custom (${plugin.relays.length} relay${plugin.relays.length === 1 ? "" : "s"})`;
            await this.remountPlugin(plugin);
          }
        });

        relayOptionsWrap.appendChild(customCheckboxesContainer);
        relayAccessBox.appendChild(relayOptionsWrap);
        details.appendChild(relayAccessBox);

        // Section C2: Nostr Write Permissions (Collapsible Section)
        const writeSection = renderNostrWritePermissionsSection({
          kernel: this.kernel,
          pluginId: plugin.id,
          theme: "panorama",
          onUpdate: () => this.saveLocalWorkspace()
        });
        details.appendChild(writeSection);

        // Section C3: Handled Intents & Capabilities
        const intentsSection = renderHandledIntentsSection({
          kernel: this.kernel,
          plugin,
          theme: "panorama",
          onUpdate: () => this.saveLocalWorkspace()
        });
        details.appendChild(intentsSection);

        // Section D: Actions Row
        const actionsRow = document.createElement("div");
        actionsRow.style.cssText = "display: flex; gap: 8px; align-items: center; margin-top: 4px;";

        const btnInspect = document.createElement("button");
        btnInspect.className = "btn-panorama-action";
        btnInspect.id = `btn-inspect-${safeId}`;
        btnInspect.textContent = "Inspect Plugin";
        btnInspect.addEventListener("click", () => this.openPluginInspector(plugin));

        const btnClearDb = document.createElement("button");
        btnClearDb.className = "btn-panorama-action";
        btnClearDb.id = `btn-clear-db-${safeId}`;
        btnClearDb.textContent = "Clear Storage";
        btnClearDb.addEventListener("click", async () => {
          await this.kernel.storageManager.clear(plugin.id);
          btnClearDb.textContent = "Cleared!";
          setTimeout(() => { btnClearDb.textContent = "Clear Storage"; }, 1500);
        });

        const btnUninstall = document.createElement("button");
        btnUninstall.className = "btn-panorama-action";
        btnUninstall.id = `btn-uninstall-${safeId}`;
        btnUninstall.style.color = "#ff5555";
        btnUninstall.style.borderColor = "#662222";
        btnUninstall.textContent = "Uninstall";
        btnUninstall.addEventListener("click", () => {
          if (confirm(`Uninstall ${meta.name}?`)) {
            this.uninstallPlugin(plugin.id);
          }
        });

        actionsRow.appendChild(btnInspect);
        actionsRow.appendChild(btnClearDb);
        actionsRow.appendChild(btnUninstall);
        details.appendChild(actionsRow);

        card.appendChild(details);
      }

      list.appendChild(card);
    }

    this.renderDefaultApplicationsSettings(list);
  }

  public openPluginInspector(plugin: InstalledPluginEntry): void {
    const modal = document.getElementById("panorama-inspector-modal");
    const body = document.getElementById("panorama-inspector-body");
    const title = document.getElementById("panorama-inspector-title");
    if (!modal || !body) return;

    const meta = this.getPluginMeta(plugin);
    const synthManifest = this.ensurePluginManifest(plugin);
    if (title) title.textContent = `${meta.name} Inspector`;

    body.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px; font-size: 0.82rem; color: #fff;">
        <div><strong>Plugin ID:</strong> <code style="color: #00a4ef;">${meta.id}</code></div>
        <div><strong>Version:</strong> <span style="background: #222; padding: 2px 6px;">v${meta.version}</span></div>
        <div><strong>Source:</strong> <code>${plugin.sourceUrl || "local"}</code></div>
        <div>
          <strong>Declared Views & Routes:</strong>
          <ul style="margin: 4px 0 0 16px; padding: 0;">
            ${(synthManifest.views || []).map((v: any) => `<li><code>${v.id}</code>: "${v.title}" (${v.path || "/"})</li>`).join("")}
          </ul>
        </div>
      </div>
    `;

    // Collapsible Nostr Write Permissions Section
    const writeSection = renderNostrWritePermissionsSection({
      kernel: this.kernel,
      pluginId: plugin.id,
      theme: "panorama",
      onUpdate: () => this.saveLocalWorkspace()
    });
    body.appendChild(writeSection);

    // Handled Intents Section
    const intentsSection = renderHandledIntentsSection({
      kernel: this.kernel,
      plugin,
      theme: "panorama",
      onUpdate: () => this.saveLocalWorkspace()
    });
    body.appendChild(intentsSection);

    modal.style.display = "flex";
  }

  public closePluginInspector(): void {
    const modal = document.getElementById("panorama-inspector-modal");
    if (modal) modal.style.display = "none";
  }

  public uninstallPlugin(pluginId: string): void {
    const plugin = this.installedPlugins.find((p) => p.id === pluginId);
    if (!plugin) return;
    this.kernel.disablePlugin(pluginId);
    this.kernel.destroyPluginSettings(pluginId);
    const idx = this.installedPlugins.findIndex((p) => p.id === pluginId);
    if (idx !== -1) {
      this.installedPlugins.splice(idx, 1);
    }
    this.renderAppsTiles();
    this.renderSystemPluginList();
    this.saveLocalWorkspace();
  }

  // --- App Overlay & Navigation ---

  public renderPivotNavigation(): void {
    if (!this.pivotHeadersTrack) return;
    this.pivotHeadersTrack.innerHTML = "";

    // 1. Dynamic Main App Pivots (Feed, or whatever apps are assigned to main)
    const mainApps = this.getMainAppPlugins();
    for (const app of mainApps) {
      const meta = this.getPluginMeta(app);
      const btn = document.createElement("button");
      btn.className = "panorama-pivot-item";
      btn.dataset.pivot = app.id;
      const label = app.id === "org.omni.plugin.feed" ? "feed" : (app.name || meta.name).toLowerCase();
      btn.textContent = label;
      if (this.activePivot === app.id || (app.id === "org.omni.plugin.feed" && this.activePivot === "feed")) {
        btn.classList.add("active");
      }
      btn.addEventListener("click", () => this.showPivot(app.id));
      this.pivotHeadersTrack.appendChild(btn);
    }

    // 2. Standard Panorama Pivots: Apps, Widgets, System
    const standardPivots = ["apps", "widgets", "system"];
    for (const sp of standardPivots) {
      const btn = document.createElement("button");
      btn.className = "panorama-pivot-item";
      btn.dataset.pivot = sp;
      btn.textContent = sp;
      if (this.activePivot === sp) {
        btn.classList.add("active");
      }
      btn.addEventListener("click", () => this.showPivot(sp));
      this.pivotHeadersTrack.appendChild(btn);
    }
  }

  public async openApp(pluginId: string): Promise<void> {
    const plugin = this.installedPlugins.find((p) => p.id === pluginId);
    if (!plugin) return;

    this.currentOpenedAppId = pluginId;
    const meta = this.getPluginMeta(plugin);
    const titleEl = document.getElementById("panorama-overlay-title");
    if (titleEl) titleEl.textContent = meta.name;

    const safeId = pluginId.replace(/[^a-zA-Z0-9_-]/g, "-");

    // Toggle from live tiles grid to active application view inside apps section
    const gridView = document.getElementById("panorama-apps-grid-view");
    if (gridView) gridView.style.display = "none";
    if (this.sectionApps) this.sectionApps.classList.add("has-active-app");

    // 1. Ensure the overlay page container element exists in fullAppContainer
    const slotEl = this.ensureAppPage(plugin.id);

    // 2. Hide other app pages in overlay, and display this target page
    const allPages = this.fullAppContainer?.querySelectorAll<HTMLElement>(".panorama-app-page") || [];
    allPages.forEach((p) => (p.style.display = "none"));

    const target = document.getElementById(`panorama-page-app-${safeId}`);
    if (target) {
      target.style.display = "block";
    }

    if (this.fullAppContainer) {
      this.fullAppContainer.scrollTop = 0;
    }

    if (this.fullAppOverlay) {
      this.fullAppOverlay.classList.add("open");
      this.fullAppOverlay.style.display = "flex";
    }

    this.showPivot("apps");

    // 3. Ensure the full app view is mounted into the overlay slot container
    const overlayInstanceKey = `${plugin.id}::overlay`;
    if (!this.kernel.getSandbox(overlayInstanceKey)) {
      try {
        const synthManifest = this.ensurePluginManifest(plugin);
        const overlayManifest = {
          ...synthManifest,
          components: [
            {
              id: `${plugin.id}-overlay`,
              type: "main",
              title: plugin.name || meta.name || plugin.id,
              slot: "main"
            }
          ]
        };

        const customSlotContainers = new Map(this.getSlotContainers());
        customSlotContainers.set("main", slotEl);
        customSlotContainers.set("dock", slotEl);
        customSlotContainers.set("sidebar", slotEl);
        if (synthManifest.components) {
          for (const comp of synthManifest.components) {
            if (comp.slot) customSlotContainers.set(comp.slot, slotEl);
          }
        }

        await this.kernel.registerPlugin(
          overlayManifest,
          plugin.htmlContent || plugin.scriptContent,
          customSlotContainers,
          {
            instanceId: overlayInstanceKey,
            route: "",
            viewId: "main",
            targetSlot: "main",
            relays: plugin.relays
          }
        );
      } catch (err) {
        console.error(`Failed to mount overlay app for ${plugin.id}:`, err);
      }
    }
  }

  public closeApp(): void {
    this.currentOpenedAppId = null;
    const gridView = document.getElementById("panorama-apps-grid-view");
    if (gridView) gridView.style.display = "flex";
    if (this.sectionApps) this.sectionApps.classList.remove("has-active-app");
    if (this.fullAppOverlay) {
      this.fullAppOverlay.classList.remove("open");
      this.fullAppOverlay.style.display = "none";
    }
  }

  public showPivot(pivot: PanoramaPivot): void {
    this.activePivot = pivot;
    const buttons = this.pivotHeadersTrack?.querySelectorAll<HTMLElement>(".panorama-pivot-item") || [];
    buttons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.pivot === pivot);
    });

    const safeId = pivot.replace(/[^a-zA-Z0-9_-]/g, "-");
    const targetSection = document.getElementById(`panorama-section-${pivot}`) ||
      document.getElementById(`panorama-section-${safeId}`) ||
      (pivot === "feed" ? document.getElementById("panorama-section-org-omni-plugin-feed") : null) ||
      (pivot === "org.omni.plugin.feed" ? document.getElementById("panorama-section-feed") : null) ||
      (this.panoramaContainer?.querySelector<HTMLElement>(`.panorama-section[data-pivot="${pivot}"]`));

    if (targetSection && this.panoramaContainer) {
      this.isProgrammaticScroll = true;
      if (this.programmaticScrollTimer) clearTimeout(this.programmaticScrollTimer);

      this.panoramaContainer.scrollTo({
        left: targetSection.offsetLeft,
        behavior: "smooth"
      });

      const btn = this.pivotHeadersTrack?.querySelector<HTMLElement>(`.panorama-pivot-item[data-pivot="${pivot}"]`) ||
        (pivot === "feed" ? this.pivotHeadersTrack?.querySelector<HTMLElement>(`.panorama-pivot-item[data-pivot="org.omni.plugin.feed"]`) : null) ||
        (pivot === "org.omni.plugin.feed" ? this.pivotHeadersTrack?.querySelector<HTMLElement>(`.panorama-pivot-item[data-pivot="feed"]`) : null);
      if (btn && this.pivotHeadersTrack) {
        const firstOffset = this.pivotHeadersTrack.querySelector<HTMLElement>(".panorama-pivot-item")?.offsetLeft || 0;
        this.pivotHeadersTrack.scrollTo({
          left: Math.max(0, btn.offsetLeft - firstOffset),
          behavior: "smooth"
        });
      }

      this.programmaticScrollTimer = setTimeout(() => {
        this.isProgrammaticScroll = false;
        this.syncPivotScrollFromCanvas();
      }, 600);
    }
  }

  public showPage(page: string): void {
    if (page === "apps") {
      this.closeApp();
      this.showPivot("apps");
    } else if (page === "widgets" || page === "dashboard") {
      this.closeApp();
      this.showPivot("widgets");
    } else if (page === "system" || page === "settings") {
      this.closeApp();
      this.showPivot("system");
    } else {
      const safeId = page.replace(/[^a-zA-Z0-9_-]/g, "-");
      const section = document.getElementById(`panorama-section-${safeId}`) ||
        (page === "feed" ? document.getElementById("panorama-section-org-omni-plugin-feed") : null) ||
        (page === "org.omni.plugin.feed" ? document.getElementById("panorama-section-feed") : null);
      if (section) {
        this.closeApp();
        this.showPivot(page);
      } else {
        this.openApp(page);
      }
    }
  }

  // --- Interactive Controllers Wiring ---

  public syncPivotScrollFromCanvas(): void {
    if (!this.panoramaContainer || !this.pivotHeadersTrack) return;

    const scrollLeft = this.panoramaContainer.scrollLeft;
    const sections = Array.from(this.panoramaContainer.querySelectorAll<HTMLElement>(".panorama-section"));
    const buttons = Array.from(this.pivotHeadersTrack.querySelectorAll<HTMLElement>(".panorama-pivot-item"));
    if (sections.length === 0 || buttons.length === 0) return;

    // 1. Calculate continuous scroll position for the top pivot navigation
    const maxCanvas = this.panoramaContainer.scrollWidth - this.panoramaContainer.clientWidth;
    const maxPivot = this.pivotHeadersTrack.scrollWidth - this.pivotHeadersTrack.clientWidth;

    if (maxCanvas > 0 && maxPivot > 0) {
      let targetPivotScroll = 0;
      let matched = false;

      for (let i = 0; i < sections.length - 1; i++) {
        const secA = sections[i];
        const secB = sections[i + 1];
        if (secA && secB && scrollLeft >= secA.offsetLeft && scrollLeft <= secB.offsetLeft) {
          const btnA = buttons[i];
          const btnB = buttons[i + 1];
          const span = secB.offsetLeft - secA.offsetLeft;
          const t = span > 0 ? (scrollLeft - secA.offsetLeft) / span : 0;
          const firstOffset = buttons[0]?.offsetLeft || 0;
          const start = (btnA?.offsetLeft ?? 0) - firstOffset;
          const end = (btnB?.offsetLeft ?? 0) - firstOffset;
          targetPivotScroll = start + t * (end - start);
          matched = true;
          break;
        }
      }

      if (!matched) {
        if (scrollLeft <= (sections[0]?.offsetLeft ?? 0)) {
          targetPivotScroll = 0;
        } else {
          const lastBtn = buttons[buttons.length - 1];
          const firstOffset = buttons[0]?.offsetLeft || 0;
          targetPivotScroll = (lastBtn?.offsetLeft ?? 0) - firstOffset;
        }
      }

      if (targetPivotScroll === 0 && scrollLeft > 0) {
        targetPivotScroll = (scrollLeft / maxCanvas) * maxPivot;
      }

      this.pivotHeadersTrack.scrollLeft = Math.max(0, targetPivotScroll);
    }

    // 2. Highlight closest pivot button
    let closestSection = sections[0];
    let minDiff = Infinity;
    for (const sec of sections) {
      const diff = Math.abs(sec.offsetLeft - scrollLeft);
      if (diff < minDiff) {
        minDiff = diff;
        closestSection = sec;
      }
    }

    const pivot = (closestSection.dataset.pivot || closestSection.dataset.pluginId) as PanoramaPivot;
    if (pivot && this.activePivot !== pivot) {
      this.activePivot = pivot;
      buttons.forEach((b) => b.classList.toggle("active", b.dataset.pivot === pivot));
    }
  }

  private wireNavigation(): void {
    this.renderPivotNavigation();

    // Continuous horizontal scroll tracking: pivot headers follow swiping 1:1
    this.panoramaContainer?.addEventListener("scroll", () => {
      this.syncPivotScrollFromCanvas();
    }, { passive: true });
  }

  private wireGlobalEvents(): void {
    // Back button on full app slide-in overlay
    const btnOverlayBack = document.getElementById("btn-overlay-back");
    btnOverlayBack?.addEventListener("click", () => {
      this.closeApp();
    });

    // Inspector Modal Close
    document.getElementById("btn-inspector-close")?.addEventListener("click", () => {
      this.closePluginInspector();
    });
    document.getElementById("panorama-inspector-modal")?.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).id === "panorama-inspector-modal") {
        this.closePluginInspector();
      }
    });

    // Shell Switcher
    const shellButtonsContainer = (this.root.querySelector("#panorama-shell-switcher-buttons") || document.getElementById("panorama-shell-switcher-buttons")) as HTMLElement | null;
    if (shellButtonsContainer) {
      shellButtonsContainer.innerHTML = "";
      const currentActive = (typeof window !== "undefined" ? window.localStorage.getItem("omni_active_shell") : null) || "panorama";
      for (const s of shellRegistry.list()) {
        const btn = document.createElement("button");
        btn.id = `btn-switch-${s.id}`;
        btn.className = `btn-panorama-action ${currentActive === s.id ? "active" : ""}`;
        btn.textContent = s.name;
        btn.title = s.description;
        btn.addEventListener("click", () => {
          if (typeof window !== "undefined") {
            window.localStorage.setItem("omni_active_shell", s.id);
            window.location.reload();
          }
        });
        shellButtonsContainer.appendChild(btn);
      }
    }

    // Nostr Cloud Workspace Sync
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

    // Escape key closes modals / overlay
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          if (this.currentOpenedAppId) {
            this.closeApp();
          }
          this.closePluginInspector();
        }
      });
    }
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

  public showEnableCandidateToast(
    action: string,
    candidate: { pluginId: string; name?: string; icon?: string; description?: string },
    resolve: (enabled: boolean) => void
  ): void {
    showIntentEnableToast({
      action,
      candidateName: candidate.name || candidate.pluginId,
      theme: "panorama",
      onEnable: () => {
        this.kernel.intentBroker.setPluginIntentEnabled(candidate.pluginId, action, true);
        const p = this.installedPlugins.find((x) => x.id === candidate.pluginId);
        if (p) {
          if (!p.disabledIntents) p.disabledIntents = [];
          p.disabledIntents = p.disabledIntents.filter((a) => a !== action);
        }
        this.saveLocalWorkspace();
        resolve(true);
      },
      onDismiss: () => {
        resolve(false);
      }
    });
  }

  public async promptDisambiguateIntent(
    action: string,
    candidates: Array<{ pluginId: string; name?: string; icon?: string; description?: string }>,
    data?: any
  ): Promise<string | null> {
    return new Promise((resolve) => {
      const modal = document.getElementById("panorama-open-with-modal");
      const targetEl = document.getElementById("panorama-open-with-target");
      const listEl = document.getElementById("panorama-open-with-list");
      const alwaysChk = document.getElementById("panorama-open-with-always") as HTMLInputElement | null;
      const alwaysLabel = document.getElementById("panorama-open-with-always-label");
      const btnConfirm = document.getElementById("btn-panorama-open-with-confirm") as HTMLButtonElement | null;
      const btnCancel = document.getElementById("btn-panorama-open-with-cancel");
      const btnClose = document.getElementById("btn-panorama-open-with-close");

      if (!modal || !listEl) return resolve(null);

      if (targetEl) targetEl.textContent = `Intent Action: "${action}"`;
      if (alwaysLabel) alwaysLabel.textContent = `Always use this application for "${action}"`;
      if (alwaysChk) alwaysChk.checked = false;
      if (btnConfirm) btnConfirm.disabled = true;

      listEl.innerHTML = "";
      let selectedHandlerId: string | null = null;

      for (const c of candidates) {
        const row = document.createElement("div");
        row.style.cssText =
          "display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: #141414; border: 1px solid #222; cursor: pointer; transition: border-color 0.15s;";

        const left = document.createElement("div");
        left.style.cssText = "display: flex; align-items: center; gap: 8px;";
        left.innerHTML = `<span style="color: #00a4ef; font-size: 0.9rem;">✦</span><span style="font-size: 0.82rem; color: #fff; font-weight: 500;">${c.name || c.pluginId}</span>`;

        const badge = document.createElement("span");
        badge.style.cssText = "font-size: 0.68rem; padding: 1px 6px; background: #222; color: #aaa;";
        badge.textContent = "Handler";

        row.appendChild(left);
        row.appendChild(badge);

        row.addEventListener("click", () => {
          listEl.querySelectorAll("div").forEach((el: any) => {
            el.style.borderColor = "#222";
          });
          row.style.borderColor = "#00a4ef";
          selectedHandlerId = c.pluginId;
          if (btnConfirm) btnConfirm.disabled = false;
        });

        listEl.appendChild(row);
      }

      const cleanup = () => {
        modal.style.display = "none";
        btnCancel?.removeEventListener("click", onCancel);
        btnClose?.removeEventListener("click", onCancel);
        btnConfirm?.removeEventListener("click", onConfirm);
      };

      const onCancel = () => {
        cleanup();
        resolve(null);
      };

      const onConfirm = () => {
        if (!selectedHandlerId) return;
        if (alwaysChk?.checked) {
          this.kernel.intentBroker.setDefaultHandler(action, selectedHandlerId);
          this.saveLocalWorkspace();
        }
        cleanup();
        resolve(selectedHandlerId);
      };

      btnCancel?.addEventListener("click", onCancel);
      btnClose?.addEventListener("click", onCancel);
      btnConfirm?.addEventListener("click", onConfirm);

      modal.style.display = "flex";
    });
  }

  public renderDefaultApplicationsSettings(container: HTMLElement): void {
    const existing = container.querySelector(".panorama-default-applications-box");
    if (existing) existing.remove();

    const box = document.createElement("div");
    box.className = "panorama-config-section panorama-default-applications-box";
    box.style.cssText =
      "display: flex; flex-direction: column; gap: 8px; background: #141414; padding: 12px 14px; border: 1px solid #222; margin-top: 10px;";

    box.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong style="font-size: 0.85rem; font-weight: 600; color: #fff;">Default Applications</strong>
        <span style="font-size: 0.7rem; color: #00a4ef;">Intent Routing</span>
      </div>
      <p style="font-size: 0.72rem; color: #888; margin: 0;">
        Assign default applications to handle common actions across plugins without prompting every time.
      </p>
    `;

    const standardActions = [
      { action: "create_note", label: "Create Note / Composer" },
      { action: "view_note", label: "View Note / Thread" },
      { action: "view_profile", label: "View Identity Profile" },
      { action: "share", label: "Web Share Target" },
      { action: "pay_invoice", label: "Lightning Payment" }
    ];

    const actionsList = document.createElement("div");
    actionsList.style.cssText = "display: flex; flex-direction: column; gap: 6px; margin-top: 4px;";

    for (const sa of standardActions) {
      const row = document.createElement("div");
      row.style.cssText = "display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 0;";

      const label = document.createElement("span");
      label.style.cssText = "font-size: 0.75rem; color: #aaa;";
      label.textContent = sa.label;

      const select = document.createElement("select");
      select.style.cssText =
        "background: #000; border: 1px solid #444; color: #fff; font-size: 0.72rem; padding: 4px 8px; outline: none;";

      const optNone = document.createElement("option");
      optNone.value = "";
      optNone.textContent = "Prompt every time (None)";
      select.appendChild(optNone);

      const candidates = this.installedPlugins.filter((p) =>
        (p.handledIntents || []).includes(sa.action) ||
        this.kernel.intentBroker.getHandlers(sa.action).some((h) => h.pluginId === p.id)
      );

      for (const cand of candidates) {
        const meta = this.getPluginMeta(cand);
        const opt = document.createElement("option");
        opt.value = cand.id;
        opt.textContent = meta.name;
        select.appendChild(opt);
      }

      const currentDefault = this.kernel.intentBroker.getDefaultHandler(sa.action);
      if (currentDefault) {
        select.value = currentDefault;
      }

      select.addEventListener("change", () => {
        if (!select.value) {
          this.kernel.intentBroker.clearDefaultHandler(sa.action);
        } else {
          this.kernel.intentBroker.setDefaultHandler(sa.action, select.value);
        }
        this.saveLocalWorkspace();
      });

      row.appendChild(label);
      row.appendChild(select);
      actionsList.appendChild(row);
    }

    box.appendChild(actionsList);
    container.appendChild(box);
  }

  public async handleUri(uri: string, sourcePluginId?: string): Promise<any> {
    const scheme = uri.split(":")[0]?.toLowerCase() || "unknown";
    const defaultHandlerId = this.kernel.getDefaultHandler(scheme);
    if (defaultHandlerId && this.installedPlugins.some((p) => p.id === defaultHandlerId)) {
      if (defaultHandlerId.includes("feed") || defaultHandlerId === "org.omni.plugin.feed") {
        this.showPivot("feed");
      } else {
        this.openApp(defaultHandlerId);
      }
      return { handled: true, uri, handlerId: defaultHandlerId };
    }

    const handlers = await this.kernel.resolveAppHandlers(uri, this.installedPlugins);
    if (handlers.length === 0) {
      if (typeof alert === "function") alert(`No installed apps found for URI scheme: ${scheme}:`);
      return { handled: false, uri };
    }

    if (handlers.length === 1 && handlers[0].isInstalled) {
      const chosenId = handlers[0].id;
      if (chosenId.includes("feed") || chosenId === "org.omni.plugin.feed") {
        this.showPivot("feed");
      } else {
        this.openApp(chosenId);
      }
      return { handled: true, uri, handlerId: chosenId };
    }

    const chosenId = await this.promptDisambiguateIntent(
      scheme,
      handlers.map((h) => ({ pluginId: h.id, name: h.name, description: h.description }))
    );

    if (chosenId) {
      if (chosenId.includes("feed") || chosenId === "org.omni.plugin.feed") {
        this.showPivot("feed");
      } else {
        this.openApp(chosenId);
      }
      return { handled: true, uri, handlerId: chosenId };
    }
    return { handled: false, uri };
  }

  public async handleShare(
    payload: { title?: string; text?: string; url?: string },
    sourcePluginId?: string
  ): Promise<any> {
    this.showPivot("feed");
    const draftText = [payload.title, payload.text, payload.url].filter(Boolean).join("\n\n");
    if (draftText) {
      try {
        await this.kernel.intentBroker.dispatch("shell", "create_note", { content: draftText });
      } catch (_) {}
    }
    return { handled: true, payload };
  }
}
