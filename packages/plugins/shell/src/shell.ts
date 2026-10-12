import { OmniKernel, WebCryptoKeystore, NostrPluginResolver, LayoutManager, STANDARD_SLOTS } from "@omni/core";
import { OmniWorkspaceState, OmniWorkspacePluginConfig, PluginPlacement, OMNI_WORKSPACE_D_TAG, NostrEvent, PluginViewDeclaration, OmniShellHost } from "@omni/types";
import { ICONS, icon, IconName } from "./icons.js";

export interface InstalledPluginEntry {
  id: string;
  name?: string;
  description?: string;
  version?: string;
  icon?: string;
  viewport?: string;
  route?: string;
  viewId?: string;
  views?: PluginViewDeclaration[];
  placements?: PluginPlacement[];
  manifest?: any;
  htmlContent?: string;
  scriptContent: string;
  sourceUrl: string;
  enabled: boolean;
  pinned?: boolean;
  relays?: string[]; // Custom relay URLs allowed for this plugin. If undefined or empty, uses all configured relays.
  naddr?: string;
  authorNpub?: string;
  event?: any;
}

export type AppPage = "feed" | "widgets" | "dashboard" | "apps" | string;
export type SettingsTab = "profile" | "relays" | "plugins" | "workspace" | string;

export interface OmniShellOptions {
  root: HTMLElement;
  kernel: OmniKernel;
  installedPlugins?: InstalledPluginEntry[];
}

export class OmniShell implements OmniShellHost {
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

  // Internal element references
  private mainViewport!: HTMLElement;
  private headerActionsSlot!: HTMLElement;
  private dockSlot!: HTMLElement;
  private mainSlot!: HTMLElement;
  private widgetsSlot!: HTMLElement;
  private pageFeed!: HTMLElement;
  private pageWidgets!: HTMLElement;
  private pageApps!: HTMLElement;
  private dockBtnApps!: HTMLElement;
  private dockBtnWidgets!: HTMLElement;
  private dockBtnSettings!: HTMLElement;

  // Settings modal elements
  private settingsModal!: HTMLElement;
  private settingsNav!: HTMLElement;
  private settingsContent!: HTMLElement;
  private currentMountedSettingsPluginId: string | null = null;
  public settingsNavBtns: Record<string, HTMLElement> = {};
  public settingsPanes: Record<string, HTMLElement> = {};

  // Inspector & Install modals
  private pluginInspectorModal!: HTMLElement;
  private installPluginModal!: HTMLElement;
  private activeInspectedPlugin: InstalledPluginEntry | null = null;

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
    const placements = this.getPluginPlacements(plugin);
    const hasMainPlacement = placements.some(
      (pl) => pl.enabled !== false && (pl.viewport === "main" || pl.viewport === "dock")
    );
    if (!hasMainPlacement && plugin.id !== "org.omni.plugin.feed") {
      const safeId = plugin.id.replace(/[^a-zA-Z0-9_-]/g, "-");
      const pageEl = document.getElementById(`page-app-${safeId}`);
      if (pageEl) {
        if (pageEl.classList.contains("active")) {
          this.showPage("feed");
        }
        pageEl.remove();
      }
      if (this.getActivePageId() === plugin.id) {
        this.showPage("feed");
      }
    }

    if (plugin.enabled) {
      await this.mountPlugin(plugin);
    }
    this.renderDockLaunchers();
    this.renderPluginManager();
    this.saveLocalWorkspace();
  }

  public isAppPinned(p: InstalledPluginEntry): boolean {
    if (p.id === "org.omni.plugin.feed") return true;
    if (p.pinned !== undefined) return p.pinned;
    const placements = this.getPluginPlacements(p);
    const mainPl = placements.find((pl) => pl.viewport === "main");
    if (mainPl && mainPl.pinned !== undefined) return mainPl.pinned;
    const dockPl = placements.find((pl) => pl.viewport === "dock");
    if (dockPl) return true;
    return p.pinned !== false;
  }

  public setAppPinned(pluginId: string, pinned: boolean): void {
    const plugin = this.installedPlugins.find((p) => p.id === pluginId);
    if (!plugin) return;
    plugin.pinned = pinned;

    const placements = this.getPluginPlacements(plugin);
    for (const pl of placements) {
      if (pl.viewport === "main") {
        pl.pinned = pinned;
      }
    }

    this.renderDockLaunchers();
    this.renderAppsLauncher();
    this.saveLocalWorkspace();
  }

  public renderDock(): void {
    this.renderDockLaunchers();
  }

  // --- NIP-78 Workspace State Export & Import ---

  public exportWorkspaceState(): OmniWorkspaceState {
    return {
      version: 1,
      updatedAt: Date.now(),
      activePage: this.getActivePageId(),
      autoSync: this.autoSyncNip78,
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

  public getAvailableViewports(): { id: string; label: string; description: string }[] {
    return STANDARD_SLOTS
      .filter((s) => s.id !== "header-status")
      .map((s) => ({ id: s.id, label: s.name, description: s.description }));
  }

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

  public applyWorkspaceState(state: OmniWorkspaceState, persistLocal = true, switchPage = false): void {
    if (!state || !state.plugins) return;

    if (typeof state.autoSync === "boolean") {
      this.autoSyncNip78 = state.autoSync;
      const chk = document.getElementById("chk-auto-sync-workspace") as HTMLInputElement | null;
      if (chk) chk.checked = this.autoSyncNip78;
    }

    for (const item of state.plugins) {
      const plugin = this.installedPlugins.find((p) => p.id === item.id);
      if (plugin) {
        if (typeof item.enabled === "boolean") {
          plugin.enabled = item.enabled;
        }
        if (typeof item.pinned === "boolean") {
          plugin.pinned = item.pinned;
        }
        if (item.relays !== undefined) {
          plugin.relays = Array.isArray(item.relays) ? item.relays : undefined;
        }
        if (item.route !== undefined) {
          plugin.route = item.route;
        }
        if (item.viewId !== undefined) {
          plugin.viewId = item.viewId;
        }
        if (item.placements && Array.isArray(item.placements)) {
          plugin.placements = item.placements;
          if (item.placements.length === 0) {
            plugin.viewport = "";
            this.layoutManager.unregisterPlugin(plugin.id);
          }
        }
        if (item.viewport && item.viewport !== plugin.viewport) {
          plugin.viewport = item.viewport;
          const synth = this.ensurePluginManifest(plugin);
          const primaryComp = synth.components?.[0];
          if (primaryComp) {
            const container = this.getContainerForPluginSlot(plugin.id, item.viewport, primaryComp.id);
            if (container) {
              this.kernel.reparentPluginComponent(plugin.id, primaryComp.id, item.viewport, container);
            }
          }
          if (item.viewport !== "main" && item.viewport !== "dock" && plugin.id !== "org.omni.plugin.feed") {
            const safeId = plugin.id.replace(/[^a-zA-Z0-9_-]/g, "-");
            const pageEl = document.getElementById(`page-app-${safeId}`);
            if (pageEl) {
              if (pageEl.classList.contains("active")) {
                this.showPage("feed");
              }
              pageEl.remove();
            }
          }
        }
      }
    }

    if (switchPage && state.activePage && state.activePage !== this.getActivePageId()) {
      this.showPage(state.activePage);
    }

    this.renderDockLaunchers();
    this.renderPluginManager();

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
    const textEl = document.getElementById("workspace-sync-status-text");
    const dotEl = document.getElementById("workspace-sync-status-dot");
    const timeEl = document.getElementById("workspace-sync-timestamp");
    const btnSync = document.getElementById("btn-sync-workspace") as HTMLButtonElement | null;
    const btnRestore = document.getElementById("btn-restore-workspace") as HTMLButtonElement | null;

    if (!textEl) return;

    if (this.workspaceSyncStatus === "syncing") {
      textEl.textContent = "Syncing with Nostr relays (NIP-78)...";
      if (dotEl) dotEl.style.color = "var(--omni-text-muted)";
      if (btnSync) btnSync.disabled = true;
      if (btnRestore) btnRestore.disabled = true;
    } else if (this.workspaceSyncStatus === "synced") {
      textEl.textContent = "Synced with Nostr relays (NIP-78 kind 30078)";
      if (dotEl) dotEl.style.color = "var(--omni-accent-primary)";
      if (btnSync) btnSync.disabled = false;
      if (btnRestore) btnRestore.disabled = false;
    } else {
      textEl.textContent = "Unsynced local changes";
      if (dotEl) dotEl.style.color = "#f87171";
      if (btnSync) btnSync.disabled = false;
      if (btnRestore) btnRestore.disabled = false;
    }

    if (timeEl) {
      if (this.lastSyncedAt) {
        const timeStr = new Date(this.lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        timeEl.textContent = `Last synced: ${timeStr}`;
      } else {
        timeEl.textContent = "Not synced yet during this session";
      }
    }
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
                if (item.placements.length === 0) {
                  plugin.viewport = "";
                  this.layoutManager?.unregisterPlugin(plugin.id);
                }
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

  public getContainerForPluginSlot(pluginId: string, slotId: string, compId?: string): Element {
    if (slotId === "main" || slotId === "dock") {
      if (slotId === "dock" && (compId?.endsWith("-icon") || compId?.includes("icon"))) {
        return this.dockSlot;
      }
      if (pluginId === "org.omni.plugin.feed") {
        return this.mainSlot;
      }
      return this.ensureAppPage(pluginId);
    }
    if (slotId === "sidebar" || slotId === "widgets") {
      return this.widgetsSlot;
    }
    if (slotId === "icon") {
      return this.dockSlot;
    }
    if (slotId === "header-actions") {
      return this.headerActionsSlot;
    }
    return this.slotContainers.get(slotId) || this.mainSlot;
  }

  public ensureAppPage(pluginId: string): HTMLElement {
    if (pluginId === "org.omni.plugin.feed") {
      return this.mainSlot;
    }
    const safeId = pluginId.replace(/[^a-zA-Z0-9_-]/g, "-");
    let pageEl = document.getElementById(`page-app-${safeId}`);
    if (!pageEl) {
      pageEl = document.createElement("section");
      pageEl.className = "app-page";
      pageEl.id = `page-app-${safeId}`;
      pageEl.dataset.page = pluginId;
      pageEl.dataset.pluginId = pluginId;

      const slotEl = document.createElement("div");
      slotEl.className = "omni-slot main-viewport-slot";
      slotEl.id = `slot-main-${safeId}`;
      pageEl.appendChild(slotEl);

      const mainVp = this.mainViewport || this.root.querySelector(".main-viewport");
      if (mainVp) {
        if (this.pageWidgets && this.pageWidgets.parentNode === mainVp) {
          mainVp.insertBefore(pageEl, this.pageWidgets);
        } else {
          mainVp.appendChild(pageEl);
        }
      }
      return slotEl;
    }
    return (pageEl.querySelector(".main-viewport-slot") as HTMLElement) || pageEl;
  }

  public getActivePageId(): string {
    if (this.pageApps?.classList.contains("active")) {
      return "apps";
    }
    if (this.pageWidgets?.classList.contains("active")) {
      return "widgets";
    }
    const mainVp = this.mainViewport || this.root.querySelector(".main-viewport");
    const activeEl = mainVp?.querySelector<HTMLElement>(".app-page.active");
    if (activeEl) {
      if (activeEl.id === "page-apps") return "apps";
      if (activeEl.id === "page-widgets") return "widgets";
      if (activeEl.id === "page-feed") return "org.omni.plugin.feed";
      if (activeEl.dataset.pluginId) return activeEl.dataset.pluginId;
      if (activeEl.dataset.page) return activeEl.dataset.page;
    }
    return "org.omni.plugin.feed";
  }

  public renderDockLaunchers(): void {
    if (!this.dockSlot) return;
    Array.from(this.dockSlot.children).forEach((child) => {
      if (child.classList.contains("dock-item")) {
        child.remove();
      }
    });

    const activePage = this.getActivePageId();

    for (const plugin of this.installedPlugins) {
      if (!plugin.enabled) continue;
      const meta = this.getPluginMeta(plugin);

      // Primary applications in "main" (if pinned) or items assigned to "dock" ("Navigation Dock Shortcut")
      // get a dedicated navigation dock launcher button.
      // Unpinned full-page apps are accessible via the Apps launcher (#page-apps).
      const placements = this.getPluginPlacements(plugin);
      const hasDockSlot = placements.some((pl) => pl.enabled !== false && pl.viewport === "dock");
      const hasMainSlot = placements.some((pl) => pl.enabled !== false && pl.viewport === "main");

      if (plugin.id !== "org.omni.plugin.feed") {
        if (!hasDockSlot && !hasMainSlot) continue;
        if (!hasDockSlot && hasMainSlot && !this.isAppPinned(plugin)) continue;
      }

      if (plugin.id !== "org.omni.plugin.feed") {
        this.ensureAppPage(plugin.id);
      }

      const btn = document.createElement("button");
      btn.className = "dock-item";
      btn.title = meta.name;
      btn.dataset.pluginId = plugin.id;

      if (
        activePage === plugin.id ||
        (activePage === "feed" && plugin.id === "org.omni.plugin.feed") ||
        (activePage === "org.omni.plugin.feed" && plugin.id === "org.omni.plugin.feed")
      ) {
        btn.classList.add("active");
      }

      let iconSvg = "";
      if (meta.icon && ICONS[meta.icon as IconName]) {
        iconSvg = icon(meta.icon as IconName, 20);
      } else if (plugin.id === "org.omni.plugin.profile" || meta.icon === "profile") {
        iconSvg = icon("user", 20);
      } else {
        iconSvg = icon("feed", 20);
      }

      let label = meta.name.split(" ")[0];
      if (plugin.id === "org.omni.plugin.feed") label = "Feed";
      else if (plugin.id === "org.omni.plugin.timer") label = "Timer";
      else if (plugin.id === "org.omni.plugin.checklist") label = "Daily";
      else if (plugin.id === "org.omni.plugin.relays") label = "Relays";
      else if (plugin.id === "org.omni.plugin.profile") label = "Profile";

      btn.innerHTML = `
        <div class="dock-icon-wrapper">
          ${iconSvg}
        </div>
        <span>${label}</span>
      `;

      btn.addEventListener("click", () => {
        this.showPage(plugin.id);
      });

      this.dockSlot.appendChild(btn);
    }
  }

  public renderAppsLauncher(): void {
    const pinnedGrid = document.getElementById("apps-pinned-grid");
    const unpinnedGrid = document.getElementById("apps-unpinned-grid");
    const pinnedCountEl = document.getElementById("apps-pinned-count");
    const unpinnedCountEl = document.getElementById("apps-unpinned-count");
    if (!pinnedGrid || !unpinnedGrid) return;

    pinnedGrid.innerHTML = "";
    unpinnedGrid.innerHTML = "";

    const appCandidates: InstalledPluginEntry[] = [];
    for (const plugin of this.installedPlugins) {
      if (!plugin.enabled) continue;
      const placements = this.getPluginPlacements(plugin);
      const hasMain = placements.some((pl) => pl.enabled !== false && pl.viewport === "main");
      if (hasMain || plugin.id === "org.omni.plugin.feed") {
        appCandidates.push(plugin);
      }
    }

    let pinnedCount = 0;
    let unpinnedCount = 0;

    for (const plugin of appCandidates) {
      const isPinned = this.isAppPinned(plugin);
      const meta = this.getPluginMeta(plugin);
      const isFeed = plugin.id === "org.omni.plugin.feed";

      const card = document.createElement("div");
      card.className = "app-card";
      card.style.cssText =
        "display: flex; flex-direction: column; justify-content: space-between; background: var(--omni-bg-surface); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-md); padding: 14px; gap: 12px; transition: border-color 0.15s ease;";

      const topRow = document.createElement("div");
      topRow.style.cssText = "display: flex; align-items: flex-start; gap: 10px;";

      let iconSvg = "";
      if (meta.icon && ICONS[meta.icon as IconName]) {
        iconSvg = icon(meta.icon as IconName, 22);
      } else if (plugin.id === "org.omni.plugin.profile" || meta.icon === "profile") {
        iconSvg = icon("user", 22);
      } else {
        iconSvg = icon("feed", 22);
      }

      const iconWrap = document.createElement("div");
      iconWrap.style.cssText =
        "display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: var(--omni-radius-sm); background: var(--omni-bg-subtle); color: var(--omni-accent-primary); flex-shrink: 0;";
      iconWrap.innerHTML = iconSvg;

      const titleCol = document.createElement("div");
      titleCol.style.cssText = "display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0;";

      const nameRow = document.createElement("div");
      nameRow.style.cssText = "display: flex; align-items: center; justify-content: space-between; gap: 6px;";

      const nameEl = document.createElement("span");
      nameEl.style.cssText =
        "font-weight: 600; font-size: 0.88rem; color: var(--omni-text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;";
      nameEl.textContent = meta.name;

      const badgeEl = document.createElement("span");
      badgeEl.style.cssText =
        "font-size: 0.65rem; padding: 1px 6px; border-radius: var(--omni-radius-pill); background: var(--omni-bg-subtle); color: var(--omni-text-muted); font-family: var(--omni-font-mono);";
      badgeEl.textContent = `v${meta.version}`;

      nameRow.appendChild(nameEl);
      nameRow.appendChild(badgeEl);

      const descEl = document.createElement("p");
      descEl.style.cssText =
        "font-size: 0.74rem; color: var(--omni-text-secondary); margin: 0; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;";
      descEl.textContent = meta.description || "Standalone Nostr web application.";

      titleCol.appendChild(nameRow);
      titleCol.appendChild(descEl);

      topRow.appendChild(iconWrap);
      topRow.appendChild(titleCol);
      card.appendChild(topRow);

      const bottomRow = document.createElement("div");
      bottomRow.style.cssText =
        "display: flex; align-items: center; justify-content: space-between; gap: 8px; border-top: 1px solid var(--omni-border-subtle); padding-top: 10px;";

      const btnPin = document.createElement("button");
      btnPin.className = "btn-secondary btn-app-pin";
      btnPin.style.cssText = `font-size: 0.72rem; padding: 4px 8px; display: inline-flex; align-items: center; gap: 5px; color: ${
        isPinned ? "var(--omni-accent-primary)" : "var(--omni-text-secondary)"
      };`;
      btnPin.innerHTML = `${icon("pin", 13)} <span>${isPinned ? "Pinned" : "Pin to Dock"}</span>`;

      if (isFeed) {
        btnPin.title = "Feed is permanently pinned to the dock";
        btnPin.disabled = true;
        btnPin.style.opacity = "0.7";
      } else {
        btnPin.title = isPinned ? "Unpin from navigation dock" : "Pin to navigation dock";
        btnPin.addEventListener("click", () => {
          this.setAppPinned(plugin.id, !isPinned);
        });
      }

      const btnOpen = document.createElement("button");
      btnOpen.className = "btn-publish btn-app-launch";
      btnOpen.style.cssText = "font-size: 0.72rem; padding: 4px 12px;";
      btnOpen.textContent = "Open App";
      btnOpen.addEventListener("click", () => {
        this.showPage(plugin.id);
      });

      bottomRow.appendChild(btnPin);
      bottomRow.appendChild(btnOpen);
      card.appendChild(bottomRow);

      if (isPinned) {
        pinnedGrid.appendChild(card);
        pinnedCount++;
      } else {
        unpinnedGrid.appendChild(card);
        unpinnedCount++;
      }
    }

    if (pinnedCountEl) pinnedCountEl.textContent = `${pinnedCount} app${pinnedCount === 1 ? "" : "s"}`;
    if (unpinnedCountEl) unpinnedCountEl.textContent = `${unpinnedCount} app${unpinnedCount === 1 ? "" : "s"}`;

    if (pinnedCount === 0) {
      const emptyNote = document.createElement("div");
      emptyNote.style.cssText =
        "grid-column: 1 / -1; padding: 18px; text-align: center; color: var(--omni-text-muted); font-size: 0.78rem; background: var(--omni-bg-surface); border: 1px dashed var(--omni-border-subtle); border-radius: var(--omni-radius-sm);";
      emptyNote.textContent = "No pinned applications. Pin apps to keep them in your navigation dock.";
      pinnedGrid.appendChild(emptyNote);
    }

    if (unpinnedCount === 0) {
      const emptyNote = document.createElement("div");
      emptyNote.style.cssText =
        "grid-column: 1 / -1; padding: 18px; text-align: center; color: var(--omni-text-muted); font-size: 0.78rem; background: var(--omni-bg-surface); border: 1px dashed var(--omni-border-subtle); border-radius: var(--omni-radius-sm);";
      emptyNote.textContent = "All installed full-page applications are currently pinned to your navigation dock.";
      unpinnedGrid.appendChild(emptyNote);
    }
  }

  /**
   * Mounts the complete shell DOM and wires all interactive controllers
   */
  public mount(): void {
    this.renderSkeleton();
    this.cacheElementReferences();
    this.initSlotContainers();
    this.renderDockLaunchers();
    this.wireNavigation();
    this.wireSettingsModal();
    this.wireInspectorModal();
    this.wireInstallModal();
    this.wireProfileControls();
    this.wireRelaysManager();
    this.renderSettingsNavAndPanes();
  }

  public getSlotContainers(): Map<string, Element> {
    return this.slotContainers;
  }

  /**
   * Switch center viewport between full-page apps and Widgets Dashboard
   */
  public showPage(page: AppPage): void {
    const mainVp = this.mainViewport || this.root.querySelector(".main-viewport");
    const allPages = mainVp?.querySelectorAll<HTMLElement>(".app-page") || [];
    allPages.forEach((p) => p.classList.remove("active"));

    this.dockSlot?.querySelectorAll(".dock-item").forEach((btn: any) => {
      btn.classList.remove("active");
    });
    this.dockBtnApps?.classList.remove("active");
    this.dockBtnWidgets?.classList.remove("active");

    if (page === "apps") {
      this.pageApps?.classList.add("active");
      this.dockBtnApps?.classList.add("active");
      this.renderAppsLauncher();
    } else if (page === "widgets" || page === "dashboard") {
      this.pageWidgets.classList.add("active");
      this.dockBtnWidgets?.classList.add("active");
      for (const p of this.installedPlugins) {
        if (p.enabled && !this.kernel.getSandbox(p.id)) {
          this.mountPlugin(p).catch(console.warn);
        }
      }
    } else {
      let targetPage: HTMLElement | null = null;
      if (page === "feed" || page === "org.omni.plugin.feed") {
        targetPage = this.pageFeed;
      } else {
        const safeId = page.replace(/[^a-zA-Z0-9_-]/g, "-");
        targetPage = document.getElementById(`page-app-${safeId}`) as HTMLElement | null;
        if (!targetPage) {
          targetPage = mainVp?.querySelector<HTMLElement>(`[data-plugin-id="${page}"], [data-page="${page}"]`) || null;
        }
      }

      if (targetPage) {
        targetPage.classList.add("active");
      } else if (this.pageFeed) {
        this.pageFeed.classList.add("active");
      }

      const targetBtn = this.dockSlot?.querySelector<HTMLElement>(`[data-plugin-id="${page}"]`);
      if (targetBtn) {
        targetBtn.classList.add("active");
      } else if (page === "feed" || page === "org.omni.plugin.feed") {
        const feedBtn = this.dockSlot?.querySelector<HTMLElement>(`[data-plugin-id="org.omni.plugin.feed"]`);
        if (feedBtn) feedBtn.classList.add("active");
      } else {
        // App opened from Apps Launcher that has no dedicated dock button
        this.dockBtnApps?.classList.add("active");
      }
    }

    if (mainVp) {
      if (typeof mainVp.scrollTo === "function") {
        mainVp.scrollTo({ top: 0, behavior: "instant" });
      }
      mainVp.scrollTop = 0;
    }
  }

  /**
   * Handle slot action dispatched from plugins or kernel
   */
  public handleSlotAction(action: string, slot: string): void {
    if (slot === "sidebar" || slot === "widgets" || slot === "dashboard") {
      if (action === "toggle") {
        const isWidgets = this.pageWidgets.classList.contains("active");
        this.showPage(isWidgets ? "feed" : "widgets");
      } else if (action === "open") {
        this.showPage("widgets");
      } else if (action === "close") {
        this.showPage("feed");
      }
    } else if (slot === "main" || slot === "feed") {
      this.showPage("feed");
    }
  }

  public openSettings(tab: SettingsTab | "layout" | "workspace" = "plugins"): void {
    this.switchSettingsTab(tab);
    this.settingsModal.classList.add("open");
  }

  public closeSettings(): void {
    if (this.currentMountedSettingsPluginId) {
      const safeId = this.currentMountedSettingsPluginId.replace(/[^a-zA-Z0-9_-]/g, "-");
      const mountContainer = document.getElementById(`plugin-settings-mount-${safeId}`);
      if (mountContainer) {
        mountContainer.style.display = "none";
        mountContainer.innerHTML = "";
      }
      const btnToggle = document.getElementById(`btn-toggle-settings-${safeId}`) as HTMLButtonElement | null;
      if (btnToggle) btnToggle.textContent = "Open Settings";

      this.kernel.destroyPluginSettings(this.currentMountedSettingsPluginId);
      this.currentMountedSettingsPluginId = null;
    }
    this.settingsModal.classList.remove("open");
  }

  public switchSettingsTab(tab: string): void {
    let targetTab = tab;
    if (targetTab === "profile") {
      const profilePlugin = this.installedPlugins.find((p) => p.id === "org.omni.plugin.profile" || p.id.includes("profile"));
      if (profilePlugin) {
        targetTab = profilePlugin.id;
      }
    } else if (targetTab === "relays") {
      const relayPlugin = this.installedPlugins.find((p) => p.id === "org.omni.plugin.relays" || p.id.includes("relays"));
      if (relayPlugin) {
        targetTab = relayPlugin.id;
      }
    } else if (targetTab === "layout" || targetTab === "workspace") {
      targetTab = "plugins";
    }

    if (this.currentMountedSettingsPluginId && this.currentMountedSettingsPluginId !== targetTab) {
      const prevSafeId = this.currentMountedSettingsPluginId.replace(/[^a-zA-Z0-9_-]/g, "-");
      const prevContainer = document.getElementById(`plugin-settings-mount-${prevSafeId}`);
      if (prevContainer) {
        prevContainer.style.display = "none";
        prevContainer.innerHTML = "";
      }
      const prevBtn = document.getElementById(`btn-toggle-settings-${prevSafeId}`) as HTMLButtonElement | null;
      if (prevBtn) prevBtn.textContent = "Open Settings";

      this.kernel.destroyPluginSettings(this.currentMountedSettingsPluginId);
      this.currentMountedSettingsPluginId = null;
    }

    // Toggle active state on navigation tab buttons
    const navBtns = this.settingsModal?.querySelectorAll<HTMLElement>(".settings-nav-btn") || [];
    navBtns.forEach((btn) => {
      const btnTab = btn.getAttribute("data-tab");
      const isActive = btnTab === targetTab ||
        (tab === "relays" && (btnTab === "relays" || btn.id === "settings-tab-btn-relays")) ||
        (tab === "profile" && (btnTab === "profile" || btn.id === "settings-tab-btn-profile"));
      btn.classList.toggle("active", isActive);
    });

    // Toggle active state and visibility on panes
    const panes = this.settingsModal?.querySelectorAll<HTMLElement>(".settings-pane") || [];
    panes.forEach((pane) => {
      const paneTab = pane.getAttribute("data-tab");
      const isActive = paneTab === targetTab ||
        (tab === "relays" && (paneTab === "relays" || pane.id === "settings-pane-relays")) ||
        (tab === "profile" && (paneTab === "profile" || pane.id === "settings-pane-profile"));
      pane.classList.toggle("active", isActive);
      pane.style.display = isActive ? (pane.classList.contains("plugin-pane") ? "flex" : "block") : "none";
    });

    if (targetTab === "plugins") {
      this.renderPluginManager();
    }
  }

  public async updateProfileUi(): Promise<void> {
    const pubkey = await this.kernel.getUserPubkey();
    const npub = await this.kernel.getNpub();
    const shortNpub = `${npub.slice(0, 10)}...${npub.slice(-4)}`;
    const userBadge = document.getElementById("user-badge");

    const profile = await this.kernel.getProfile(pubkey);
    if (profile) {
      const displayName = profile.display_name || profile.name || shortNpub;
      if (userBadge) {
        userBadge.textContent = displayName;
        userBadge.title = `${displayName}\n${npub}\nClick to manage profile & keys`;
      }
    } else if (userBadge) {
      userBadge.textContent = shortNpub;
      userBadge.title = `Your Nostr Identity: ${npub}\nClick to manage profile & keys`;
    }
  }

  private renderSettingsRelays(): void {
    // Relays pool is managed via @omni/plugin-relays
  }

  public renderSettingsNavAndPanes(): void {
    if (!this.settingsNav || !this.settingsContent) return;

    // Remove previous plugin tab buttons and section title from nav
    const oldPluginBtns = this.settingsNav.querySelectorAll(".plugin-tab-btn, .settings-nav-section-title");
    oldPluginBtns.forEach((el) => el.remove());

    // Remove previous plugin panes from content (preserves #settings-pane-plugins)
    const oldPluginPanes = this.settingsContent.querySelectorAll(".settings-pane.plugin-pane");
    oldPluginPanes.forEach((el) => el.remove());

    // Deduplicate installedPlugins by ID to ensure clean, unique rendering
    const uniquePlugins: InstalledPluginEntry[] = [];
    const seenPluginIds = new Set<string>();
    for (const p of this.installedPlugins) {
      if (!seenPluginIds.has(p.id)) {
        seenPluginIds.add(p.id);
        uniquePlugins.push(p);
      }
    }
    this.installedPlugins = uniquePlugins;

    if (this.installedPlugins.length > 0) {
      const sectionTitle = document.createElement("div");
      sectionTitle.className = "settings-nav-section-title";
      sectionTitle.style.cssText =
        "font-size: 0.68rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--omni-text-muted); padding: 10px 12px 4px 12px; margin-top: 4px; border-top: 1px solid var(--omni-border-subtle);";
      sectionTitle.textContent = "Installed Plugins";
      this.settingsNav.appendChild(sectionTitle);
    }

    const viewportOptions = this.getAvailableViewports();

    for (const p of this.installedPlugins) {
      const meta = this.getPluginMeta(p);
      const safeId = p.id.replace(/[^a-zA-Z0-9_-]/g, "-");
      const synthManifest = this.ensurePluginManifest(p);
      const pluginViews = (synthManifest.views && synthManifest.views.length > 0)
        ? synthManifest.views
        : (p.views && p.views.length > 0)
        ? p.views
        : [{ id: "main", title: "Main App", path: "" }];
      const settingsView = pluginViews.find((v: any) => v.id === "settings" || v.path.includes("settings"));

      const btnId = p.id === "org.omni.plugin.relays"
        ? "settings-tab-btn-relays"
        : p.id === "org.omni.plugin.profile"
        ? "settings-tab-btn-profile"
        : `settings-tab-btn-${safeId}`;

      const paneId = p.id === "org.omni.plugin.relays"
        ? "settings-pane-relays"
        : p.id === "org.omni.plugin.profile"
        ? "settings-pane-profile"
        : `settings-pane-${safeId}`;

      // 1. Tab Button in Nav
      const tabBtn = document.createElement("button");
      tabBtn.className = "settings-nav-btn plugin-tab-btn";
      tabBtn.id = btnId;
      tabBtn.setAttribute("data-tab", p.id);
      tabBtn.title = meta.name;

      const safeIconName: IconName =
        meta.icon === "relays" ? "relay" :
        meta.icon === "profile" ? "user" :
        meta.icon === "check-circle" || meta.icon === "checklist" ? "check" :
        (ICONS[meta.icon as IconName] ? (meta.icon as IconName) : "plugins");

      tabBtn.innerHTML = `
        ${icon(safeIconName, 16)}
        <span>${meta.name}</span>
      `;
      tabBtn.addEventListener("click", () => this.switchSettingsTab(p.id));
      this.settingsNav.appendChild(tabBtn);
      this.settingsNavBtns[p.id] = tabBtn;
      if (p.id === "org.omni.plugin.relays") this.settingsNavBtns["relays"] = tabBtn;
      if (p.id === "org.omni.plugin.profile") this.settingsNavBtns["profile"] = tabBtn;

      // 2. Dedicated Settings Pane
      const pane = document.createElement("div");
      pane.className = "settings-pane plugin-pane";
      pane.id = paneId;
      pane.setAttribute("data-tab", p.id);
      pane.style.cssText = "display: none; flex-direction: column; gap: 14px;";

      // Header: Icon + Name + Version + Toggle
      const headerBox = document.createElement("div");
      headerBox.style.cssText =
        "display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--omni-border-subtle);";

      const headerLeft = document.createElement("div");
      headerLeft.style.cssText = "display: flex; align-items: center; gap: 12px;";

      const iconBox = document.createElement("div");
      iconBox.style.cssText =
        "width: 40px; height: 40px; border-radius: var(--omni-radius-sm); background: var(--omni-bg-surface); border: 1px solid var(--omni-border-subtle); display: flex; align-items: center; justify-content: center; color: var(--omni-accent-primary); flex-shrink: 0;";
      iconBox.innerHTML = icon(safeIconName, 22);

      const titleInfo = document.createElement("div");
      titleInfo.style.cssText = "display: flex; flex-direction: column; gap: 2px;";
      titleInfo.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <h3 style="font-size: 1.1rem; font-weight: 600; color: var(--omni-text-primary); margin: 0;">${meta.name}</h3>
          <span style="font-size: 0.68rem; font-family: var(--omni-font-mono); color: var(--omni-text-muted); background: var(--omni-bg-surface); padding: 1px 6px; border-radius: var(--omni-radius-pill);">v${meta.version}</span>
        </div>
        <p style="font-size: 0.78rem; color: var(--omni-text-secondary); margin: 0;">${meta.description || "Nostr sandboxed application."}</p>
      `;

      headerLeft.appendChild(iconBox);
      headerLeft.appendChild(titleInfo);

      const toggleLabel = document.createElement("label");
      toggleLabel.style.cssText =
        "display: inline-flex; align-items: center; gap: 6px; font-size: 0.75rem; color: var(--omni-text-muted); cursor: pointer;";
      const chkToggle = document.createElement("input");
      chkToggle.type = "checkbox";
      chkToggle.checked = p.enabled !== false;
      chkToggle.addEventListener("change", async () => {
        p.enabled = chkToggle.checked;
        await this.remountPlugin(p);
      });
      toggleLabel.appendChild(chkToggle);
      toggleLabel.appendChild(document.createTextNode(p.enabled !== false ? "Active" : "Disabled"));

      headerBox.appendChild(headerLeft);
      headerBox.appendChild(toggleLabel);
      pane.appendChild(headerBox);

      // Sandboxed Settings View
      const settingsBox = document.createElement("div");
      settingsBox.className = "plugin-settings-box";
      settingsBox.style.cssText =
        "display: flex; flex-direction: column; gap: 8px; background: var(--omni-bg-surface); padding: 12px 14px; border-radius: var(--omni-radius-sm); border: 1px solid var(--omni-border-subtle);";

      const settingsHeader = document.createElement("div");
      settingsHeader.style.cssText =
        "display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px;";

      const settingsTitle = document.createElement("span");
      settingsTitle.style.cssText = "font-weight: 600; font-size: 0.82rem; color: var(--omni-text-primary);";
      settingsTitle.textContent = "Settings & Preferences";
      settingsHeader.appendChild(settingsTitle);

      const mountContainer = document.createElement("div");
      mountContainer.id = `plugin-settings-mount-${safeId}`;
      mountContainer.className = "plugin-settings-mount-container";
      mountContainer.style.cssText =
        "display: none; margin-top: 6px; padding: 10px; background: var(--omni-bg-canvas); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-sm);";

      if (settingsView) {
        const btnToggleSettings = document.createElement("button");
        btnToggleSettings.className = "btn-secondary btn-plugin-settings";
        btnToggleSettings.id = `btn-toggle-settings-${safeId}`;
        btnToggleSettings.style.cssText = "font-size: 0.72rem; padding: 2px 8px;";
        btnToggleSettings.textContent = "Open Settings";

        btnToggleSettings.addEventListener("click", async () => {
          const isOpen = mountContainer.style.display !== "none";
          if (!isOpen) {
            mountContainer.style.display = "block";
            btnToggleSettings.textContent = "Loading...";
            try {
              await this.kernel.mountPluginSettings(
                p.id,
                synthManifest,
                p.htmlContent || p.scriptContent,
                mountContainer,
                settingsView.path || "?view=settings"
              );
              btnToggleSettings.textContent = "Close Settings";
              this.currentMountedSettingsPluginId = p.id;
            } catch (err) {
              console.error(`Failed to mount settings for ${p.id}:`, err);
              mountContainer.textContent = "Failed to load settings.";
              btnToggleSettings.textContent = "Open Settings";
            }
          } else {
            this.kernel.destroyPluginSettings(p.id);
            mountContainer.style.display = "none";
            mountContainer.innerHTML = "";
            btnToggleSettings.textContent = "Open Settings";
            if (this.currentMountedSettingsPluginId === p.id) {
              this.currentMountedSettingsPluginId = null;
            }
          }
        });

        settingsHeader.appendChild(btnToggleSettings);
        settingsBox.appendChild(settingsHeader);
        settingsBox.appendChild(mountContainer);
      } else {
        const noSettingsNote = document.createElement("div");
        noSettingsNote.style.cssText = "font-size: 0.72rem; color: var(--omni-text-muted); font-style: italic;";
        noSettingsNote.textContent = "No custom settings route declared. Configure viewports and placements below.";
        settingsBox.appendChild(settingsHeader);
        settingsBox.appendChild(noSettingsNote);
      }

      pane.appendChild(settingsBox);

      // Placements Section
      const placementsSection = document.createElement("div");
      placementsSection.className = "plugin-placements-section";
      placementsSection.style.cssText =
        "display: flex; flex-direction: column; gap: 8px; background: var(--omni-bg-surface); padding: 12px 14px; border-radius: var(--omni-radius-sm); border: 1px solid var(--omni-border-subtle);";

      const placementsHeader = document.createElement("div");
      placementsHeader.style.cssText = "display: flex; justify-content: space-between; align-items: center;";

      const placementsTitle = document.createElement("span");
      placementsTitle.style.cssText = "font-weight: 600; font-size: 0.82rem; color: var(--omni-text-primary);";
      placementsTitle.textContent = "Assigned Viewports & Routes";

      const btnAddPlacement = document.createElement("button");
      btnAddPlacement.className = "btn-secondary btn-add-placement";
      btnAddPlacement.style.cssText = "font-size: 0.72rem; padding: 2px 8px;";
      btnAddPlacement.textContent = "+ Add Location";
      btnAddPlacement.addEventListener("click", async () => {
        const currentPlacements = this.getPluginPlacements(p);
        const newPl: PluginPlacement = {
          id: `placement-${Date.now()}`,
          viewport: "sidebar",
          route: pluginViews[0]?.path || "",
          viewId: pluginViews[0]?.id || "main",
          enabled: true
        };
        p.placements = [...currentPlacements, newPl];
        p.viewport = p.placements[0].viewport;
        p.route = p.placements[0].route;
        p.viewId = p.placements[0].viewId;
        await this.remountPlugin(p);
        this.renderSettingsNavAndPanes();
        this.switchSettingsTab(p.id);
      });

      placementsHeader.appendChild(placementsTitle);
      placementsHeader.appendChild(btnAddPlacement);
      placementsSection.appendChild(placementsHeader);

      const placements = this.getPluginPlacements(p);
      if (placements.length === 0) {
        const emptyPl = document.createElement("div");
        emptyPl.className = "empty-placements-note";
        emptyPl.style.cssText = "font-size: 0.75rem; color: var(--omni-text-muted); font-style: italic; padding: 6px 2px;";
        emptyPl.textContent = "Unassigned — This plugin is not currently placed in any viewport or dock.";
        placementsSection.appendChild(emptyPl);
      }

      for (let plIdx = 0; plIdx < placements.length; plIdx++) {
        const pl = placements[plIdx];
        const row = document.createElement("div");
        row.className = "plugin-placement-row";
        row.style.cssText =
          "display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; background: var(--omni-bg-canvas); padding: 8px 10px; border-radius: var(--omni-radius-sm); border: 1px solid var(--omni-border-subtle);";

        const controlsLeft = document.createElement("div");
        controlsLeft.style.cssText = "display: flex; align-items: center; gap: 6px; flex-wrap: wrap;";

        const vpLabel = document.createElement("span");
        vpLabel.style.cssText = "font-weight: 500; color: var(--omni-text-secondary); font-size: 0.72rem;";
        vpLabel.textContent = `Placement #${plIdx + 1}:`;

        const vpSelect = document.createElement("select");
        vpSelect.className = "plugin-viewport-select";
        vpSelect.style.cssText =
          "background: var(--omni-bg-surface); border: 1px solid var(--omni-border-strong); color: var(--omni-text-primary); font-size: 0.72rem; padding: 3px 6px; border-radius: var(--omni-radius-sm); outline: none; cursor: pointer;";

        for (const optDef of viewportOptions) {
          const opt = document.createElement("option");
          opt.value = optDef.id;
          opt.textContent = optDef.label;
          if (optDef.id === pl.viewport) opt.selected = true;
          vpSelect.appendChild(opt);
        }

        vpSelect.addEventListener("change", async () => {
          pl.viewport = vpSelect.value;
          p.viewport = pl.viewport;
          const primaryComp = synthManifest.components?.[0];
          if (primaryComp) {
            this.layoutManager.setComponentSlot(p.id, primaryComp.id, pl.viewport);
          }
          await this.remountPlugin(p);
        });

        const routeLabel = document.createElement("span");
        routeLabel.style.cssText = "font-weight: 500; color: var(--omni-text-secondary); margin-left: 6px; font-size: 0.72rem;";
        routeLabel.textContent = "View:";

        const routeSelect = document.createElement("select");
        routeSelect.className = "plugin-route-select";
        routeSelect.style.cssText =
          "background: var(--omni-bg-surface); border: 1px solid var(--omni-border-strong); color: var(--omni-text-primary); font-size: 0.72rem; padding: 3px 6px; border-radius: var(--omni-radius-sm); outline: none; cursor: pointer;";

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
          p.route = pl.route;
          p.viewId = pl.viewId;
          await this.remountPlugin(p);
        });

        controlsLeft.appendChild(vpLabel);
        controlsLeft.appendChild(vpSelect);
        controlsLeft.appendChild(routeLabel);
        controlsLeft.appendChild(routeSelect);

        if (pl.viewport === "main") {
          const isPinned = this.isAppPinned(p);
          const pinBtn = document.createElement("button");
          pinBtn.className = "btn-secondary btn-pin-dock";
          pinBtn.style.cssText = `font-size: 0.7rem; padding: 2px 7px; display: inline-flex; align-items: center; gap: 4px; color: ${
            isPinned ? "var(--omni-accent-primary)" : "var(--omni-text-muted)"
          };`;
          pinBtn.innerHTML = `${icon("pin", 12)} <span>${isPinned ? "Pinned to Dock" : "Pin to Dock"}</span>`;
          if (p.id === "org.omni.plugin.feed") {
            pinBtn.title = "Feed is always pinned";
            pinBtn.style.opacity = "0.7";
            pinBtn.disabled = true;
          } else {
            pinBtn.title = isPinned ? "Unpin from navigation dock" : "Pin to navigation dock";
            pinBtn.addEventListener("click", () => {
              this.setAppPinned(p.id, !isPinned);
              this.renderSettingsNavAndPanes();
              this.switchSettingsTab(p.id);
            });
          }
          controlsLeft.appendChild(pinBtn);
        }

        row.appendChild(controlsLeft);

        const btnRemovePl = document.createElement("button");
        btnRemovePl.className = "btn-secondary btn-remove-placement";
        btnRemovePl.style.cssText = "font-size: 0.68rem; padding: 2px 6px; color: #f87171;";
        btnRemovePl.textContent = placements.length > 1 ? "Remove" : "Unassign";
        btnRemovePl.title = "Remove this placement";
        btnRemovePl.addEventListener("click", async () => {
          p.placements = placements.filter((_, idx) => idx !== plIdx);
          if (p.placements.length > 0) {
            p.viewport = p.placements[0].viewport;
            p.route = p.placements[0].route;
            p.viewId = p.placements[0].viewId;
          } else {
            p.viewport = "";
            p.route = "";
            p.viewId = "";
            this.layoutManager.unregisterPlugin(p.id);
          }
          await this.remountPlugin(p);
          this.renderSettingsNavAndPanes();
          this.switchSettingsTab(p.id);
        });
        row.appendChild(btnRemovePl);

        placementsSection.appendChild(row);
      }

      pane.appendChild(placementsSection);

      // Actions Row
      const actionsRow = document.createElement("div");
      actionsRow.style.cssText = "display: flex; gap: 8px; align-items: center; margin-top: 4px;";

      const btnInspect = document.createElement("button");
      btnInspect.className = "btn-secondary";
      btnInspect.style.cssText = "font-size: 0.75rem; padding: 4px 10px;";
      btnInspect.textContent = "Inspect Plugin";
      btnInspect.addEventListener("click", () => this.openPluginInspector(p));

      const btnClearDb = document.createElement("button");
      btnClearDb.className = "btn-secondary";
      btnClearDb.style.cssText = "font-size: 0.75rem; padding: 4px 10px;";
      btnClearDb.textContent = "Clear Storage";
      btnClearDb.addEventListener("click", async () => {
        await this.kernel.storageManager.clear(p.id);
        btnClearDb.textContent = "Cleared!";
        setTimeout(() => { btnClearDb.textContent = "Clear Storage"; }, 1500);
      });

      const btnUninstall = document.createElement("button");
      btnUninstall.className = "btn-danger";
      btnUninstall.style.cssText = "font-size: 0.75rem; padding: 4px 10px;";
      btnUninstall.textContent = "Uninstall";
      btnUninstall.addEventListener("click", () => {
        if (confirm(`Uninstall ${meta.name}?`)) {
          this.uninstallPlugin(p.id);
        }
      });

      actionsRow.appendChild(btnInspect);
      actionsRow.appendChild(btnClearDb);
      actionsRow.appendChild(btnUninstall);
      pane.appendChild(actionsRow);

      this.settingsContent.appendChild(pane);
      this.settingsPanes[p.id] = pane;
      if (p.id === "org.omni.plugin.relays") this.settingsPanes["relays"] = pane;
      if (p.id === "org.omni.plugin.profile") this.settingsPanes["profile"] = pane;
    }

    // Fallbacks if relays or profile are not in installedPlugins
    if (!this.installedPlugins.some((p) => p.id === "org.omni.plugin.relays" || p.id === "relays")) {
      const fbRelaysPane = document.createElement("div");
      fbRelaysPane.className = "settings-pane plugin-pane";
      fbRelaysPane.id = "settings-pane-relays";
      fbRelaysPane.setAttribute("data-tab", "relays");
      fbRelaysPane.style.cssText = "display: none; padding: 24px; text-align: center; color: var(--omni-text-muted); font-size: 0.85rem;";
      fbRelaysPane.textContent = "No Relay Manager plugin installed. You can install one from the Workspace tab.";
      this.settingsContent.appendChild(fbRelaysPane);
      this.settingsPanes["relays"] = fbRelaysPane;

      const fbRelaysBtn = document.createElement("button");
      fbRelaysBtn.className = "settings-nav-btn plugin-tab-btn";
      fbRelaysBtn.id = "settings-tab-btn-relays";
      fbRelaysBtn.setAttribute("data-tab", "relays");
      fbRelaysBtn.style.display = "none";
      this.settingsNav.appendChild(fbRelaysBtn);
      this.settingsNavBtns["relays"] = fbRelaysBtn;
    }

    if (!this.installedPlugins.some((p) => p.id === "org.omni.plugin.profile" || p.id === "profile")) {
      const fbProfilePane = document.createElement("div");
      fbProfilePane.className = "settings-pane plugin-pane";
      fbProfilePane.id = "settings-pane-profile";
      fbProfilePane.setAttribute("data-tab", "profile");
      fbProfilePane.style.cssText = "display: none; padding: 24px; text-align: center; color: var(--omni-text-muted); font-size: 0.85rem;";
      fbProfilePane.textContent = "No Profile Manager plugin installed. You can install one from the Workspace tab.";
      this.settingsContent.appendChild(fbProfilePane);
      this.settingsPanes["profile"] = fbProfilePane;

      const fbProfileBtn = document.createElement("button");
      fbProfileBtn.className = "settings-nav-btn plugin-tab-btn";
      fbProfileBtn.id = "settings-tab-btn-profile";
      fbProfileBtn.setAttribute("data-tab", "profile");
      fbProfileBtn.style.display = "none";
      this.settingsNav.appendChild(fbProfileBtn);
      this.settingsNavBtns["profile"] = fbProfileBtn;
    }

    // Populate Workspace tab overview
    this.renderPluginManager();
  }

  // --- Installed Plugins Manager UI ---
  public renderPluginManager(): void {
    const container = document.getElementById("plugins-list");
    const countBadge = document.getElementById("plugins-count-badge");
    if (!container) return;
    container.innerHTML = "";
    if (countBadge) countBadge.textContent = String(this.installedPlugins.length);

    for (const p of this.installedPlugins) {
      const meta = this.getPluginMeta(p);
      const synthManifest = this.ensurePluginManifest(p);
      const pluginViews = (synthManifest.views && synthManifest.views.length > 0)
        ? synthManifest.views
        : (p.views && p.views.length > 0)
        ? p.views
        : [{ id: "main", title: "Main App", path: "" }];
      const placements = this.getPluginPlacements(p);
      const isExpanded = this.expandedPluginId === p.id;

      const card = document.createElement("div");
      card.className = "plugin-item-row plugin-card-collapsible";
      card.dataset.pluginId = p.id;
      card.style.cssText = `margin-bottom: 8px; background: var(--omni-bg-surface); border: 1px solid ${isExpanded ? "var(--omni-border-strong)" : "var(--omni-border-subtle)"}; border-radius: var(--omni-radius-md); overflow: hidden; transition: border-color 0.15s ease;`;

      // 1. Collapsible Header Row (Compact & informative on load)
      const header = document.createElement("div");
      header.className = "plugin-card-header plugin-card-collapsible-header";
      header.style.cssText = `display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; cursor: pointer; user-select: none; gap: 10px; background: ${isExpanded ? "var(--omni-bg-elevated)" : "transparent"}; transition: background 0.15s ease;`;

      const headerLeft = document.createElement("div");
      headerLeft.style.cssText = "display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; flex-wrap: wrap;";

      let iconSvg = "";
      if (meta.icon && ICONS[meta.icon as IconName]) {
        iconSvg = icon(meta.icon as IconName, 18);
      } else if (p.id === "org.omni.plugin.profile" || meta.icon === "profile") {
        iconSvg = icon("user", 18);
      } else {
        iconSvg = icon("plugins", 18);
      }
      const iconWrap = document.createElement("div");
      iconWrap.style.cssText = "display: flex; align-items: center; justify-content: center; color: var(--omni-accent-primary); flex-shrink: 0;";
      iconWrap.innerHTML = iconSvg;

      const title = document.createElement("strong");
      title.style.cssText = "font-size: 0.92rem; color: var(--omni-text-primary); white-space: nowrap;";
      title.textContent = meta.name;

      const version = document.createElement("span");
      version.style.cssText = "font-size: 0.72rem; color: var(--omni-text-muted); font-family: var(--omni-font-mono);";
      version.textContent = `v${meta.version}`;

      const statusBadge = document.createElement("span");
      statusBadge.style.cssText = `font-size: 0.68rem; padding: 1px 6px; border-radius: var(--omni-radius-pill); background: var(--omni-bg-subtle); color: ${p.enabled ? "var(--omni-status-online)" : "var(--omni-text-muted)"}; font-weight: 500;`;
      statusBadge.textContent = p.enabled ? "Active" : "Disabled";

      // Placement summary badges
      const placementsSummaryWrap = document.createElement("div");
      placementsSummaryWrap.style.cssText = "display: flex; gap: 4px; flex-wrap: wrap; align-items: center;";
      const activePlacements = placements.filter((pl) => pl.enabled !== false);
      if (activePlacements.length > 0) {
        for (const pl of activePlacements) {
          const badge = document.createElement("span");
          badge.style.cssText = "font-size: 0.66rem; padding: 1px 6px; border-radius: var(--omni-radius-pill); border: 1px solid var(--omni-border-subtle); background: var(--omni-bg-subtle); color: var(--omni-text-secondary);";
          if (pl.viewport === "main") {
            badge.style.color = "var(--omni-accent-primary)";
            badge.style.borderColor = "var(--omni-accent-primary)";
            badge.textContent = "Full-Page App";
          } else if (pl.viewport === "dock") {
            badge.textContent = "Dock Shortcut";
          } else if (pl.viewport === "sidebar") {
            badge.textContent = "Widget";
          } else if (pl.viewport === "header-actions") {
            badge.textContent = "Header Action";
          } else {
            badge.textContent = pl.viewport;
          }
          placementsSummaryWrap.appendChild(badge);
        }
      } else {
        const badge = document.createElement("span");
        badge.style.cssText = "font-size: 0.66rem; padding: 1px 6px; border-radius: var(--omni-radius-pill); border: 1px solid var(--omni-border-subtle); background: var(--omni-bg-subtle); color: var(--omni-text-muted);";
        badge.textContent = "Unassigned";
        placementsSummaryWrap.appendChild(badge);
      }

      headerLeft.appendChild(iconWrap);
      headerLeft.appendChild(title);
      headerLeft.appendChild(version);
      headerLeft.appendChild(statusBadge);
      headerLeft.appendChild(placementsSummaryWrap);

      const headerRight = document.createElement("div");
      headerRight.style.cssText = "display: flex; align-items: center; gap: 10px; flex-shrink: 0;";

      // Enable/disable master toggle
      const toggleLabel = document.createElement("label");
      toggleLabel.className = "omni-toggle";
      toggleLabel.title = p.enabled ? "Click to disable plugin" : "Click to enable plugin";
      toggleLabel.addEventListener("click", (e) => e.stopPropagation());

      const toggleInput = document.createElement("input");
      toggleInput.type = "checkbox";
      toggleInput.checked = p.enabled;
      toggleInput.addEventListener("change", async (e) => {
        e.stopPropagation();
        p.enabled = toggleInput.checked;
        await this.remountPlugin(p);
      });

      const toggleSlider = document.createElement("span");
      toggleSlider.className = "toggle-slider";
      toggleLabel.appendChild(toggleInput);
      toggleLabel.appendChild(toggleSlider);

      // Expand/Collapse Chevron Indicator
      const chevronWrap = document.createElement("div");
      chevronWrap.className = "plugin-expand-chevron";
      chevronWrap.style.cssText = "color: var(--omni-text-muted); display: flex; align-items: center; justify-content: center; width: 18px; height: 18px;";
      chevronWrap.innerHTML = isExpanded ? icon("chevron-up", 14) : icon("chevron-down", 14);

      headerRight.appendChild(toggleLabel);
      headerRight.appendChild(chevronWrap);

      header.appendChild(headerLeft);
      header.appendChild(headerRight);

      // Header click toggles expand/collapse (accordion: only 1 section open at a time)
      header.addEventListener("click", () => {
        if (this.expandedPluginId) {
          this.kernel.destroyPluginSettings(this.expandedPluginId);
        }
        this.expandedPluginId = this.expandedPluginId === p.id ? null : p.id;
        this.renderPluginManager();
      });

      card.appendChild(header);

      // 2. Collapsible Details Panel (Hidden on load, shown when expanded)
      const details = document.createElement("div");
      details.className = "plugin-details-panel plugin-card-details";
      details.style.cssText = `display: ${isExpanded ? "flex" : "none"}; flex-direction: column; padding: 12px 14px; gap: 12px; border-top: 1px solid var(--omni-border-subtle); background: var(--omni-bg-canvas);`;

      // Description & provenance
      const descRow = document.createElement("div");
      descRow.style.cssText = "display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; flex-wrap: wrap;";

      const desc = document.createElement("div");
      desc.style.cssText = "font-size: 0.8rem; color: var(--omni-text-secondary); max-width: 650px;";
      desc.textContent = meta.description || "No description provided.";

      const sourcePill = document.createElement("div");
      sourcePill.style.cssText = "font-size: 0.7rem; font-family: var(--omni-font-mono); color: var(--omni-text-muted); background: var(--omni-bg-surface); padding: 2px 6px; border-radius: var(--omni-radius-xs); border: 1px solid var(--omni-border-subtle);";
      sourcePill.textContent = p.sourceUrl;

      descRow.appendChild(desc);
      descRow.appendChild(sourcePill);
      details.appendChild(descRow);

      // 3. Placements & Routes Section (Multi-viewport assignment)
      const placementsSection = document.createElement("div");
      placementsSection.className = "plugin-placements-section";
      placementsSection.style.cssText = "display: flex; flex-direction: column; gap: 8px; background: var(--omni-bg-surface); padding: 10px 12px; border-radius: var(--omni-radius-sm); border: 1px solid var(--omni-border-subtle);";

      const placementsHeader = document.createElement("div");
      placementsHeader.style.cssText = "display: flex; justify-content: space-between; align-items: center; gap: 8px;";

      const placementsTitle = document.createElement("span");
      placementsTitle.style.cssText = "font-weight: 600; font-size: 0.78rem; color: var(--omni-text-primary);";
      placementsTitle.textContent = "Placements & Assigned Routes";

      const btnAddPlacement = document.createElement("button");
      btnAddPlacement.className = "btn-secondary btn-add-placement";
      btnAddPlacement.style.cssText = "font-size: 0.7rem; padding: 2px 8px; display: inline-flex; align-items: center; gap: 4px;";
      btnAddPlacement.innerHTML = `<span>+</span> Add Location`;
      btnAddPlacement.addEventListener("click", async () => {
        const currentPlacements = this.getPluginPlacements(p);
        const nextVp = currentPlacements.some((pl) => pl.viewport === "main") ? "sidebar" : "main";
        const newPl: PluginPlacement = {
          id: `pl-${Date.now().toString(36)}`,
          viewport: nextVp,
          route: pluginViews[0]?.path || "",
          viewId: pluginViews[0]?.id || "main",
          enabled: true
        };
        p.placements = [...currentPlacements, newPl];
        p.viewport = newPl.viewport;
        p.route = newPl.route;
        p.viewId = newPl.viewId;
        await this.remountPlugin(p);
      });

      placementsHeader.appendChild(placementsTitle);
      placementsHeader.appendChild(btnAddPlacement);
      placementsSection.appendChild(placementsHeader);

      if (placements.length === 0) {
        const emptyPl = document.createElement("div");
        emptyPl.className = "empty-placements-note";
        emptyPl.style.cssText = "font-size: 0.72rem; color: var(--omni-text-muted); font-style: italic; padding: 4px 2px;";
        emptyPl.textContent = "Unassigned — This plugin is not currently placed in any viewport or dock.";
        placementsSection.appendChild(emptyPl);
      }

      const viewportOptions = this.getAvailableViewports();

      // Render each placement row
      for (let plIdx = 0; plIdx < placements.length; plIdx++) {
        const pl = placements[plIdx];
        const row = document.createElement("div");
        row.className = "plugin-placement-row";
        row.style.cssText = "display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px; background: var(--omni-bg-subtle); border-radius: var(--omni-radius-xs); font-size: 0.74rem; flex-wrap: wrap;";

        const controlsLeft = document.createElement("div");
        controlsLeft.style.cssText = "display: flex; align-items: center; gap: 8px; flex: 1; flex-wrap: wrap;";

        // Viewport selector
        const vpLabel = document.createElement("span");
        vpLabel.style.cssText = "font-weight: 500; color: var(--omni-text-secondary);";
        vpLabel.textContent = "Location:";

        const vpSelect = document.createElement("select");
        vpSelect.className = "plugin-viewport-select";
        vpSelect.style.cssText = "background: var(--omni-bg-surface); border: 1px solid var(--omni-border-strong); color: var(--omni-text-primary); font-size: 0.72rem; padding: 3px 6px; border-radius: var(--omni-radius-sm); outline: none; cursor: pointer;";

        for (const optDef of viewportOptions) {
          const opt = document.createElement("option");
          opt.value = optDef.id;
          opt.textContent = optDef.label;
          if (optDef.id === pl.viewport) opt.selected = true;
          vpSelect.appendChild(opt);
        }

        vpSelect.addEventListener("change", async () => {
          pl.viewport = vpSelect.value;
          p.viewport = pl.viewport;
          const primaryComp = synthManifest.components?.[0];
          if (primaryComp) {
            this.layoutManager.setComponentSlot(p.id, primaryComp.id, pl.viewport);
          }
          await this.remountPlugin(p);
        });

        // Route selector
        const routeLabel = document.createElement("span");
        routeLabel.style.cssText = "font-weight: 500; color: var(--omni-text-secondary); margin-left: 6px;";
        routeLabel.textContent = "View:";

        const routeSelect = document.createElement("select");
        routeSelect.className = "plugin-route-select";
        routeSelect.style.cssText = "background: var(--omni-bg-surface); border: 1px solid var(--omni-border-strong); color: var(--omni-text-primary); font-size: 0.72rem; padding: 3px 6px; border-radius: var(--omni-radius-sm); outline: none; cursor: pointer;";

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
          p.route = pl.route;
          p.viewId = pl.viewId;
          await this.remountPlugin(p);
        });

        controlsLeft.appendChild(vpLabel);
        controlsLeft.appendChild(vpSelect);
        controlsLeft.appendChild(routeLabel);
        controlsLeft.appendChild(routeSelect);

        if (pl.viewport === "main") {
          const isPinned = this.isAppPinned(p);
          const pinBtn = document.createElement("button");
          pinBtn.className = "btn-secondary btn-pin-dock";
          pinBtn.style.cssText = `font-size: 0.7rem; padding: 2px 7px; display: inline-flex; align-items: center; gap: 4px; color: ${
            isPinned ? "var(--omni-accent-primary)" : "var(--omni-text-muted)"
          };`;
          pinBtn.innerHTML = `${icon("pin", 12)} <span>${isPinned ? "Pinned to Dock" : "Pin to Dock"}</span>`;
          if (p.id === "org.omni.plugin.feed") {
            pinBtn.title = "Feed is always pinned";
            pinBtn.style.opacity = "0.7";
            pinBtn.disabled = true;
          } else {
            pinBtn.title = isPinned ? "Unpin from navigation dock" : "Pin to navigation dock";
            pinBtn.addEventListener("click", () => {
              this.setAppPinned(p.id, !isPinned);
              this.renderPluginManager();
            });
          }
          controlsLeft.appendChild(pinBtn);
        }

        row.appendChild(controlsLeft);

        // Remove placement button (if multiple placements or allow unassign)
        const btnRemovePl = document.createElement("button");
        btnRemovePl.className = "btn-secondary btn-remove-placement";
        btnRemovePl.style.cssText = "font-size: 0.68rem; padding: 2px 6px; color: #f87171;";
        btnRemovePl.textContent = placements.length > 1 ? "Remove" : "Unassign";
        btnRemovePl.title = "Remove this placement";
        btnRemovePl.addEventListener("click", async () => {
          p.placements = placements.filter((_, idx) => idx !== plIdx);
          if (p.placements.length > 0) {
            p.viewport = p.placements[0].viewport;
            p.route = p.placements[0].route;
            p.viewId = p.placements[0].viewId;
          } else {
            p.viewport = "";
            p.route = "";
            p.viewId = "";
            this.layoutManager.unregisterPlugin(p.id);
          }
          await this.remountPlugin(p);
        });
        row.appendChild(btnRemovePl);

        placementsSection.appendChild(row);
      }

      details.appendChild(placementsSection);

      // 4. Plugin Settings Section (Clean, no extraneous syntax spam)
      const safeId = p.id.replace(/[^a-zA-Z0-9_-]/g, "-");
      const settingsBox = document.createElement("div");
      settingsBox.className = "plugin-settings-box";
      settingsBox.style.cssText = "display: flex; flex-direction: column; gap: 6px; background: var(--omni-bg-surface); padding: 10px 12px; border-radius: var(--omni-radius-sm); border: 1px solid var(--omni-border-subtle);";

      const settingsHeader = document.createElement("div");
      settingsHeader.style.cssText = "display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px;";

      const settingsTitle = document.createElement("span");
      settingsTitle.style.cssText = "font-weight: 600; font-size: 0.78rem; color: var(--omni-text-primary);";
      settingsTitle.textContent = "Plugin Settings";

      const settingsView = pluginViews.find((v: any) => v.id === "settings" || v.path.includes("settings"));

      const mountContainer = document.createElement("div");
      mountContainer.id = `plugin-settings-mount-mgr-${safeId}`;
      mountContainer.className = "plugin-settings-mount-container";
      mountContainer.style.cssText = "display: none; margin-top: 6px; padding: 10px; background: var(--omni-bg-canvas); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-sm);";

      if (settingsView) {
        const btnToggleSettings = document.createElement("button");
        btnToggleSettings.className = "btn-secondary btn-plugin-settings";
        btnToggleSettings.id = `btn-toggle-settings-mgr-${safeId}`;
        btnToggleSettings.style.cssText = "font-size: 0.72rem; padding: 2px 8px;";
        btnToggleSettings.textContent = "Open Settings";

        btnToggleSettings.addEventListener("click", async () => {
          const isOpen = mountContainer.style.display !== "none";
          if (!isOpen) {
            mountContainer.style.display = "block";
            btnToggleSettings.textContent = "Loading...";
            try {
              await this.kernel.mountPluginSettings(
                p.id,
                synthManifest,
                p.htmlContent || p.scriptContent,
                mountContainer,
                settingsView.path || "?view=settings"
              );
              btnToggleSettings.textContent = "Close Settings";
            } catch (err) {
              console.error(`Failed to mount settings for ${p.id}:`, err);
              mountContainer.textContent = "Failed to load settings.";
              btnToggleSettings.textContent = "Open Settings";
            }
          } else {
            this.kernel.destroyPluginSettings(p.id);
            mountContainer.style.display = "none";
            mountContainer.innerHTML = "";
            btnToggleSettings.textContent = "Open Settings";
          }
        });

        settingsHeader.appendChild(settingsTitle);
        settingsHeader.appendChild(btnToggleSettings);
        settingsBox.appendChild(settingsHeader);
        settingsBox.appendChild(mountContainer);
      } else {
        const noSettingsNote = document.createElement("div");
        noSettingsNote.style.cssText = "font-size: 0.72rem; color: var(--omni-text-muted);";
        noSettingsNote.textContent = "No custom settings available.";

        settingsHeader.appendChild(settingsTitle);
        settingsBox.appendChild(settingsHeader);
        settingsBox.appendChild(noSettingsNote);
      }

      details.appendChild(settingsBox);

      // 4b. Relay Access Scoping Section
      const relayAccessBox = document.createElement("div");
      relayAccessBox.className = "plugin-relay-access-box";
      relayAccessBox.style.cssText = "display: flex; flex-direction: column; gap: 8px; background: var(--omni-bg-surface); padding: 10px 12px; border-radius: var(--omni-radius-sm); border: 1px solid var(--omni-border-subtle);";

      const relayHeader = document.createElement("div");
      relayHeader.style.cssText = "display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px;";

      const relayTitle = document.createElement("div");
      relayTitle.style.cssText = "display: flex; align-items: center; gap: 6px;";
      relayTitle.innerHTML = `<span style="font-weight: 600; font-size: 0.78rem; color: var(--omni-text-primary);">Relay Access</span>`;

      const allRelays = this.kernel.relayPool.getAllRelays().map((r) => r.url);
      const isCustomRelays = Array.isArray(p.relays) && p.relays.length > 0;

      const relayModePill = document.createElement("span");
      relayModePill.style.cssText = "font-size: 0.68rem; padding: 1px 6px; border-radius: var(--omni-radius-pill); background: var(--omni-bg-subtle); color: var(--omni-text-secondary);";
      relayModePill.textContent = isCustomRelays
        ? `Custom (${p.relays!.length} relay${p.relays!.length === 1 ? "" : "s"})`
        : "All Relays (Default)";

      relayHeader.appendChild(relayTitle);
      relayHeader.appendChild(relayModePill);
      relayAccessBox.appendChild(relayHeader);

      const relayDesc = document.createElement("div");
      relayDesc.style.cssText = "font-size: 0.72rem; color: var(--omni-text-muted);";
      relayDesc.textContent = "Restrict this plugin to specific relays, or allow it to use all configured relays.";
      relayAccessBox.appendChild(relayDesc);

      const relayOptionsWrap = document.createElement("div");
      relayOptionsWrap.style.cssText = "display: flex; flex-direction: column; gap: 6px; margin-top: 2px;";

      // Radio: All relays
      const radAllLabel = document.createElement("label");
      radAllLabel.style.cssText = "display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: var(--omni-text-primary); cursor: pointer;";
      const radAll = document.createElement("input");
      radAll.type = "radio";
      radAll.name = `relay-scope-${safeId}`;
      radAll.checked = !isCustomRelays;
      radAllLabel.appendChild(radAll);
      radAllLabel.appendChild(document.createTextNode("All Configured Relays (Default)"));
      relayOptionsWrap.appendChild(radAllLabel);

      // Radio: Custom relays
      const radCustomLabel = document.createElement("label");
      radCustomLabel.style.cssText = "display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: var(--omni-text-primary); cursor: pointer;";
      const radCustom = document.createElement("input");
      radCustom.type = "radio";
      radCustom.name = `relay-scope-${safeId}`;
      radCustom.checked = isCustomRelays;
      radCustomLabel.appendChild(radCustom);
      radCustomLabel.appendChild(document.createTextNode("Custom Relays"));
      relayOptionsWrap.appendChild(radCustomLabel);

      // Container for custom checkboxes
      const customCheckboxesContainer = document.createElement("div");
      customCheckboxesContainer.style.cssText = `display: ${isCustomRelays ? "flex" : "none"}; flex-direction: column; gap: 5px; margin-left: 18px; padding-top: 4px;`;

      const selectedCustomRelays = new Set<string>(p.relays || []);

      for (const rUrl of allRelays) {
        const cbLabel = document.createElement("label");
        cbLabel.style.cssText = "display: flex; align-items: center; gap: 6px; font-size: 0.72rem; color: var(--omni-text-secondary); cursor: pointer;";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = selectedCustomRelays.has(rUrl);
        cb.addEventListener("change", async () => {
          if (cb.checked) {
            selectedCustomRelays.add(rUrl);
          } else {
            selectedCustomRelays.delete(rUrl);
          }
          p.relays = Array.from(selectedCustomRelays);
          relayModePill.textContent = `Custom (${p.relays.length} relay${p.relays.length === 1 ? "" : "s"})`;
          await this.remountPlugin(p);
        });
        cbLabel.appendChild(cb);
        const codeSpan = document.createElement("code");
        codeSpan.style.cssText = "font-family: var(--omni-font-mono); font-size: 0.7rem;";
        codeSpan.textContent = rUrl;
        cbLabel.appendChild(codeSpan);
        customCheckboxesContainer.appendChild(cbLabel);
      }

      radAll.addEventListener("change", async () => {
        if (radAll.checked) {
          customCheckboxesContainer.style.display = "none";
          p.relays = undefined;
          relayModePill.textContent = "All Relays (Default)";
          await this.remountPlugin(p);
        }
      });

      radCustom.addEventListener("change", async () => {
        if (radCustom.checked) {
          customCheckboxesContainer.style.display = "flex";
          if (selectedCustomRelays.size === 0 && allRelays.length > 0) {
            // Default select the first relay if none selected yet
            selectedCustomRelays.add(allRelays[0]);
            const firstCb = customCheckboxesContainer.querySelector("input[type=checkbox]") as HTMLInputElement | null;
            if (firstCb) firstCb.checked = true;
          }
          p.relays = Array.from(selectedCustomRelays);
          relayModePill.textContent = `Custom (${p.relays.length} relay${p.relays.length === 1 ? "" : "s"})`;
          await this.remountPlugin(p);
        }
      });

      relayOptionsWrap.appendChild(customCheckboxesContainer);
      relayAccessBox.appendChild(relayOptionsWrap);
      details.appendChild(relayAccessBox);

      // 5. Actions Row (Inspect, Clear DB, Uninstall)
      const actionsRow = document.createElement("div");
      actionsRow.style.cssText = "display: flex; gap: 8px; align-items: center; margin-top: 2px;";

      const btnInspect = document.createElement("button");
      btnInspect.className = "btn-secondary";
      btnInspect.style.cssText = "font-size: 0.72rem; padding: 3px 8px;";
      btnInspect.textContent = "Inspect Plugin";
      btnInspect.addEventListener("click", () => {
        this.openPluginInspector(p);
      });

      const btnClearDb = document.createElement("button");
      btnClearDb.className = "btn-secondary";
      btnClearDb.style.cssText = "font-size: 0.72rem; padding: 3px 8px;";
      btnClearDb.textContent = "Clear DB";
      btnClearDb.addEventListener("click", async () => {
        await this.kernel.storageManager.clear(p.id);
        btnClearDb.textContent = "Cleared!";
        setTimeout(() => {
          btnClearDb.textContent = "Clear DB";
        }, 1500);
      });

      const btnUninstall = document.createElement("button");
      btnUninstall.className = "btn-danger";
      btnUninstall.style.cssText = "font-size: 0.72rem; padding: 3px 8px;";
      btnUninstall.textContent = "Uninstall";
      btnUninstall.addEventListener("click", () => {
        if (confirm(`Uninstall ${meta.name}? Its components and storage will be removed.`)) {
          this.uninstallPlugin(p.id);
        }
      });

      actionsRow.appendChild(btnInspect);
      actionsRow.appendChild(btnClearDb);
      actionsRow.appendChild(btnUninstall);

      details.appendChild(actionsRow);

      card.appendChild(details);

      container.appendChild(card);
    }
  }

  public uninstallPlugin(pluginId: string): void {
    this.kernel.uninstallPlugin(pluginId);
    const safeId = pluginId.replace(/[^a-zA-Z0-9_-]/g, "-");
    const pageEl = document.getElementById(`page-app-${safeId}`);
    if (pageEl) {
      if (pageEl.classList.contains("active")) {
        this.showPage("feed");
      }
      pageEl.remove();
    }
    const idx = this.installedPlugins.findIndex((p) => p.id === pluginId);
    if (idx !== -1) {
      this.installedPlugins.splice(idx, 1);
    }
    this.renderDockLaunchers();
    this.renderSettingsNavAndPanes();
    this.saveLocalWorkspace();
  }

  // --- Plugin Inspector Modal ---
  private openPluginInspector(plugin: InstalledPluginEntry): void {
    this.activeInspectedPlugin = plugin;
    const nameEl = document.getElementById("inspector-plugin-name");
    const idEl = document.getElementById("inspector-plugin-id");
    const sourceEl = document.getElementById("inspector-source-url");
    const nostrProvEl = document.getElementById("inspector-nostr-provenance");
    const authorNpubEl = document.getElementById("inspector-author-npub");
    const naddrEl = document.getElementById("inspector-naddr");
    const btnPublish = document.getElementById("btn-publish-plugin-nostr") as HTMLButtonElement | null;
    const compList = document.getElementById("inspector-components-list");
    const permList = document.getElementById("inspector-permissions-list");
    const rawPre = document.getElementById("inspector-manifest-raw");

    const meta = this.getPluginMeta(plugin);
    const synthManifest = this.ensurePluginManifest(plugin);

    if (nameEl) nameEl.textContent = meta.name;
    if (idEl) idEl.textContent = meta.id;
    if (sourceEl) sourceEl.textContent = plugin.sourceUrl;

    if (plugin.naddr && nostrProvEl && authorNpubEl && naddrEl) {
      nostrProvEl.style.display = "flex";
      authorNpubEl.textContent = plugin.authorNpub || "Anonymous";
      naddrEl.textContent = plugin.naddr;
      if (btnPublish) btnPublish.textContent = "Re-Publish to Nostr (Update)";
    } else {
      if (nostrProvEl) nostrProvEl.style.display = "none";
      if (btnPublish) btnPublish.textContent = "Publish / Share to Nostr (NIP-5A)";
    }

    // Discovered Routes & Views
    const viewsList = document.getElementById("inspector-views-list") || compList;
    if (viewsList) {
      viewsList.innerHTML = "";
      const views = (synthManifest.views && synthManifest.views.length > 0)
        ? synthManifest.views
        : (plugin.views && plugin.views.length > 0)
        ? plugin.views
        : [{ id: "main", title: "Main App", path: "" }];

      for (const v of views) {
        const item = document.createElement("div");
        item.style.background = "var(--omni-bg-surface)";
        item.style.border = "1px solid var(--omni-border-subtle)";
        item.style.borderRadius = "var(--omni-radius-sm)";
        item.style.padding = "8px 12px";
        item.style.fontSize = "0.8rem";
        item.style.display = "flex";
        item.style.justifyContent = "space-between";
        item.style.alignItems = "center";

        const left = document.createElement("div");
        left.innerHTML = `<strong>${v.title}</strong> <span style="color: var(--omni-text-muted); font-size: 0.72rem;">(${v.id})</span>`;

        const pathPill = document.createElement("span");
        pathPill.style.background = "var(--omni-bg-subtle)";
        pathPill.style.color = "var(--omni-accent-primary)";
        pathPill.style.padding = "2px 8px";
        pathPill.style.borderRadius = "var(--omni-radius-pill)";
        pathPill.style.fontFamily = "var(--omni-font-mono)";
        pathPill.style.fontSize = "0.72rem";
        pathPill.textContent = v.path || "/ (default)";

        item.appendChild(left);
        item.appendChild(pathPill);
        viewsList.appendChild(item);
      }
    }

    // Permissions
    if (permList) {
      permList.innerHTML = "";
      const declaredPerms: Array<{ key: string; name: string; desc: string }> = [];

      if (synthManifest.permissions?.storage) {
        declaredPerms.push({
          key: "storage:kv",
          name: "Scoped Storage (KV)",
          desc: `Persistent IndexedDB storage (Quota: ${synthManifest.permissions.storage.quotaMb || 5} MB)`
        });
      }
      if (synthManifest.permissions?.intents) {
        declaredPerms.push({
          key: "intents:dispatch",
          name: "Intent Dispatch",
          desc: "Allow cross-plugin intent calls and events"
        });
      }
      declaredPerms.push({
        key: "nostr:read",
        name: "Nostr Subscriptions (Read)",
        desc: "Subscribe to public notes, profiles, and live timeline streams"
      });
      declaredPerms.push({
        key: "nostr:write",
        name: "Nostr Event Signing (Write)",
        desc: "Draft and request signing of Nostr notes and custom events"
      });
      if (
        synthManifest.permissions?.relays ||
        this.kernel.getPluginPermission(plugin.id, "relays:manage") ||
        plugin.id === "org.omni.plugin.relays"
      ) {
        declaredPerms.push({
          key: "relays:manage",
          name: "Relay Management (relays:manage)",
          desc: "Add, remove, and monitor connected WebSocket relays in the host relay pool"
        });
      }

      for (const perm of declaredPerms) {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.background = "var(--omni-bg-surface)";
        row.style.border = "1px solid var(--omni-border-subtle)";
        row.style.borderRadius = "var(--omni-radius-sm)";
        row.style.padding = "10px 12px";

        const info = document.createElement("div");
        info.style.display = "flex";
        info.style.flexDirection = "column";
        info.style.gap = "2px";

        const pName = document.createElement("strong");
        pName.style.fontSize = "0.82rem";
        pName.textContent = perm.name;

        const pDesc = document.createElement("span");
        pDesc.style.fontSize = "0.72rem";
        pDesc.style.color = "var(--omni-text-muted)";
        pDesc.textContent = perm.desc;

        info.appendChild(pName);
        info.appendChild(pDesc);

        const toggle = document.createElement("label");
        toggle.className = "omni-toggle";

        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = this.kernel.getPluginPermission(plugin.id, perm.key);
        input.addEventListener("change", () => {
          this.kernel.setPluginPermission(plugin.id, perm.key, input.checked);
        });

        const slider = document.createElement("span");
        slider.className = "toggle-slider";

        toggle.appendChild(input);
        toggle.appendChild(slider);

        row.appendChild(info);
        row.appendChild(toggle);
        permList.appendChild(row);
      }
    }

    if (rawPre) {
      if (plugin.event) {
        rawPre.textContent = JSON.stringify(plugin.event, null, 2);
      } else {
        const views = (synthManifest.views && synthManifest.views.length > 0)
          ? synthManifest.views
          : (plugin.views && plugin.views.length > 0)
          ? plugin.views
          : [{ id: "main", title: "Main App", path: "" }];

        const eventTags: string[][] = [
          ["d", meta.id],
          ["name", meta.name],
          ["version", meta.version],
          ["description", meta.description || ""],
          ["entry", "index.html"]
        ];

        for (const v of views) {
          eventTags.push(["view", v.id, v.title, v.path]);
        }

        const standardNostrEvent = {
          kind: 30066,
          pubkey: plugin.authorNpub || "local-device-keystore",
          created_at: Math.floor(Date.now() / 1000),
          tags: eventTags,
          content: "(Standalone nsite HTML / Blossom sha256 blob)"
        };
        rawPre.textContent = JSON.stringify(standardNostrEvent, null, 2);
      }
    }

    this.switchInspectorTab("overview");
    this.pluginInspectorModal.classList.add("open");
  }

  private switchInspectorTab(tab: "overview" | "permissions" | "manifest"): void {
    const tabOverview = document.getElementById("tab-btn-overview");
    const tabPerms = document.getElementById("tab-btn-permissions");
    const tabMan = document.getElementById("tab-btn-manifest");
    const paneOverview = document.getElementById("inspector-pane-overview");
    const panePerms = document.getElementById("inspector-pane-permissions");
    const paneMan = document.getElementById("inspector-pane-manifest");

    tabOverview?.classList.toggle("active", tab === "overview");
    tabPerms?.classList.toggle("active", tab === "permissions");
    tabMan?.classList.toggle("active", tab === "manifest");

    if (paneOverview) paneOverview.style.display = tab === "overview" ? "flex" : "none";
    if (panePerms) panePerms.style.display = tab === "permissions" ? "flex" : "none";
    if (paneMan) paneMan.style.display = tab === "manifest" ? "flex" : "none";
  }

  // --- Initial DOM Skeleton Rendering ---
  private renderSkeleton(): void {
    this.root.innerHTML = `
      <!-- 1. Header -->
      <header class="app-header">
        <div class="brand-row">
          <span class="brand-logo">✦ Omni</span>
          <span style="font-size: 0.72rem; color: var(--omni-text-muted); background: var(--omni-bg-subtle); padding: 2px 6px; border-radius: var(--omni-radius-pill);">Universal nsite Runtime</span>
        </div>
        <div class="header-actions">
          <div id="header-actions-slot" class="omni-slot-inline" style="display: flex; align-items: center; gap: 8px;"></div>
        </div>
      </header>

      <!-- 2. Main App Content Layout -->
      <div class="app-layout">
        <!-- Navigation Dock -->
        <nav class="mobile-dock" id="app-dock">
          <div id="dock-slot" class="dock-slot-container"></div>

          <button class="dock-item" id="dock-btn-apps" title="All Applications">
            <div class="dock-icon-wrapper">
              ${icon("apps", 20)}
            </div>
            <span>Apps</span>
          </button>

          <button class="dock-item" id="dock-btn-widgets" title="Workspace Widgets & Tools">
            <div class="dock-icon-wrapper">
              ${icon("widgets", 20)}
            </div>
            <span>Widgets</span>
          </button>

          <button class="dock-item" id="dock-btn-settings" title="Settings & System Control">
            <div class="dock-icon-wrapper">
              ${icon("settings", 20)}
            </div>
            <span>Settings</span>
          </button>
        </nav>

        <!-- Center Viewport with Multi-Page Views -->
        <main class="main-viewport" id="main-viewport">
          <!-- Page 1: Timeline Feed & Main Slot -->
          <section class="app-page active" id="page-feed" data-plugin-id="org.omni.plugin.feed" data-page="feed">
            <div id="main-slot" class="omni-slot main-viewport-slot"></div>
          </section>

          <!-- Page 2: Applications Launcher (Pinned + Additional Apps) -->
          <section class="app-page" id="page-apps" data-page="apps">
            <div class="widgets-page-header">
              <div class="widgets-page-title-row">
                <h2 class="widgets-page-title">Applications</h2>
                <span class="widgets-page-badge">Launcher</span>
              </div>
              <p class="widgets-page-desc">All installed full-page applications. Pin your favorites to the navigation dock for instant access.</p>
            </div>
            <div class="apps-launcher-content" style="display: flex; flex-direction: column; gap: 20px;">
              <div class="apps-section">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                  <h3 style="font-size: 0.88rem; font-weight: 600; color: var(--omni-text-primary); margin: 0; display: flex; align-items: center; gap: 6px;">
                    ${icon("pin", 15)} Pinned to Dock
                  </h3>
                  <span id="apps-pinned-count" style="font-size: 0.72rem; color: var(--omni-text-muted);">0 apps</span>
                </div>
                <div id="apps-pinned-grid" class="apps-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px;"></div>
              </div>

              <div class="apps-section">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                  <h3 style="font-size: 0.88rem; font-weight: 600; color: var(--omni-text-primary); margin: 0; display: flex; align-items: center; gap: 6px;">
                    ${icon("grid", 15)} Additional Apps
                  </h3>
                  <span id="apps-unpinned-count" style="font-size: 0.72rem; color: var(--omni-text-muted);">0 apps</span>
                </div>
                <div id="apps-unpinned-grid" class="apps-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px;"></div>
              </div>
            </div>
          </section>

          <!-- Page 3: Dedicated Full Widgets View -->
          <section class="app-page" id="page-widgets">
            <div class="widgets-page-header">
              <div class="widgets-page-title-row">
                <h2 class="widgets-page-title">Workspace Widgets & Tools</h2>
                <span class="widgets-page-badge">Full View</span>
              </div>
              <p class="widgets-page-desc">All active modular widgets, tools, and productivity plugins.</p>
            </div>
            <div id="widgets-slot" class="omni-slot widgets-grid"></div>
          </section>
        </main>
      </div>

      <!-- 3. Unified Settings Modal -->
      <div class="modal-overlay" id="settings-modal">
        <div class="settings-modal-card">
          <div class="settings-header">
            <div style="display: flex; align-items: center; gap: 10px;">
              ${icon("settings", 20)}
              <h2 style="font-size: 1.15rem; font-weight: 600;">Settings & Control</h2>
            </div>
            <button class="btn-drawer-close" id="btn-close-settings-modal" title="Close Settings">
              ${icon("close", 14)}
            </button>
          </div>

          <div class="settings-body">
            <nav class="settings-nav" id="settings-nav">
              <button class="settings-nav-btn active" id="settings-tab-btn-plugins" data-tab="plugins">
                ${icon("plugins", 16)}
                <span>Workspace</span>
              </button>
            </nav>

            <div class="settings-content" id="settings-content">
              <!-- System Tab: Installed Plugins & Workspace -->
              <div class="settings-pane active" id="settings-pane-plugins" data-tab="plugins">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <h3 style="font-size: 1.05rem; font-weight: 600;">Installed Plugins & Viewports</h3>
                    <span id="plugins-count-badge" style="font-size: 0.72rem; background: var(--omni-bg-subtle); color: var(--omni-accent-primary); padding: 1px 6px; border-radius: var(--omni-radius-pill);">0</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                    <button id="btn-toggle-viewport-guide" class="btn-secondary" style="font-size: 0.72rem; padding: 4px 8px; display: inline-flex; align-items: center; gap: 4px;" title="Learn about viewport locations">
                      ${icon("help-circle", 14)} Viewport Guide
                    </button>
                    <button id="btn-sync-workspace" class="btn-secondary" style="font-size: 0.72rem; padding: 4px 8px; display: inline-flex; align-items: center; gap: 4px;" title="Sync workspace layout to Nostr relays (NIP-78)">
                      ${icon("cloud", 14)} Sync to Nostr
                    </button>
                    <button id="btn-restore-workspace" class="btn-secondary" style="font-size: 0.72rem; padding: 4px 8px; display: inline-flex; align-items: center; gap: 4px;" title="Restore workspace layout from Nostr relays (NIP-78)">
                      ${icon("download", 14)} Restore
                    </button>
                    <button id="btn-reset-layout" class="btn-secondary" style="font-size: 0.72rem; padding: 4px 8px;" title="Reset all apps to default viewports">Reset</button>
                    <button id="btn-show-install-modal" class="btn-publish" style="font-size: 0.75rem; padding: 4px 10px;">
                      + Install Plugin
                    </button>
                  </div>
                </div>

                <!-- Viewport Locations Guide Drawer -->
                <div id="viewport-guide-box" style="display: none; flex-direction: column; gap: 8px; background: var(--omni-bg-surface); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-md); padding: 12px 14px; margin-top: 4px;">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <span style="color: var(--omni-accent-primary); font-size: 0.85rem;">✦</span>
                      <strong style="font-size: 0.82rem; color: var(--omni-text-primary);">Viewport & Location Guide</strong>
                    </div>
                    <button id="btn-close-viewport-guide" class="btn-drawer-close" style="padding: 2px 4px;" title="Close guide">
                      ${icon("close", 12)}
                    </button>
                  </div>
                  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; font-size: 0.74rem; color: var(--omni-text-secondary); line-height: 1.4;">
                    <div style="background: var(--omni-bg-subtle); padding: 8px 10px; border-radius: var(--omni-radius-xs);">
                      <strong style="color: var(--omni-text-primary); display: block; margin-bottom: 2px;">Full-Page App (main)</strong>
                      Primary application view taking up the center stage. Pinned apps stay directly on your dock; unpinned apps remain accessible anytime via the Apps launcher.
                    </div>
                    <div style="background: var(--omni-bg-subtle); padding: 8px 10px; border-radius: var(--omni-radius-xs);">
                      <strong style="color: var(--omni-text-primary); display: block; margin-bottom: 2px;">Dock Shortcut (dock)</strong>
                      Quick launcher button pinned directly to the navigation dock for instant opening.
                    </div>
                    <div style="background: var(--omni-bg-subtle); padding: 8px 10px; border-radius: var(--omni-radius-xs);">
                      <strong style="color: var(--omni-text-primary); display: block; margin-bottom: 2px;">Widget (sidebar)</strong>
                      Modular companion card or widget embedded inside the Workspace Widgets view.
                    </div>
                    <div style="background: var(--omni-bg-subtle); padding: 8px 10px; border-radius: var(--omni-radius-xs);">
                      <strong style="color: var(--omni-text-primary); display: block; margin-bottom: 2px;">Header Action (header-actions)</strong>
                      Compact status icon or quick button in the top navigation bar.
                    </div>
                  </div>
                </div>

                <!-- NIP-78 Workspace Cloud Sync Banner -->
                <div id="workspace-sync-banner" style="display: flex; flex-direction: column; gap: 6px; background: var(--omni-bg-surface); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-md); padding: 10px 12px; margin-top: 2px;">
                  <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <span id="workspace-sync-status-dot" style="font-size: 0.8rem; color: var(--omni-accent-primary);">✦</span>
                      <span id="workspace-sync-status-text" style="font-size: 0.78rem; font-weight: 600; color: var(--omni-text-primary);">Synced with Nostr relays (NIP-78 kind 30078)</span>
                    </div>
                    <label style="font-size: 0.72rem; color: var(--omni-text-muted); display: inline-flex; align-items: center; gap: 5px; cursor: pointer;">
                      <input id="chk-auto-sync-workspace" type="checkbox" checked style="cursor: pointer;" />
                      Auto-sync layout changes
                    </label>
                  </div>
                  <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.7rem; color: var(--omni-text-muted);">
                    <span>Identifier: <code>omni/workspace/v1</code></span>
                    <span id="workspace-sync-timestamp">Not synced yet during this session</span>
                  </div>
                </div>

                <!-- Shell Experience Switcher -->
                <div id="shell-experience-box" style="display: flex; flex-direction: column; gap: 8px; background: var(--omni-bg-surface); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-md); padding: 12px 14px; margin-top: 4px;">
                  <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                    <div>
                      <strong style="font-size: 0.85rem; color: var(--omni-text-primary); display: flex; align-items: center; gap: 6px;">
                        ${icon("layout", 15)} Shell Experience
                      </strong>
                      <span style="font-size: 0.72rem; color: var(--omni-text-muted);">Switch between Omni Classic dock layout and the Windows Phone Panorama Hub.</span>
                    </div>
                    <div style="display: flex; gap: 6px;">
                      <button id="btn-shell-classic" class="btn-secondary active" style="font-size: 0.72rem; padding: 3px 8px; border-color: var(--omni-accent-primary); color: var(--omni-accent-primary);">
                        Omni Classic
                      </button>
                      <button id="btn-shell-panorama" class="btn-secondary" style="font-size: 0.72rem; padding: 3px 8px;">
                        Panorama Hub
                      </button>
                    </div>
                  </div>
                </div>

                <p style="font-size: 0.78rem; color: var(--omni-text-muted); margin: 0;">
                  Manage installed Nostr nsites, assign their navigation viewports (Full-Page App, Dock Shortcut, or Widget), and configure permissions.
                </p>

                <div id="plugins-list" style="display: flex; flex-direction: column; gap: 10px;"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 4. Install Plugin Modal -->
      <div class="modal-overlay" id="install-plugin-modal">
        <div class="modal-card">
          <div class="modal-header">
            <h3 style="font-size: 1.05rem; font-weight: 600;">Install New Plugin</h3>
            <button class="btn-drawer-close" id="btn-close-install-modal">
              ${icon("close", 14)}
            </button>
          </div>

          <div style="display: flex; flex-direction: column; gap: 12px;">
            <label style="font-size: 0.82rem; color: var(--omni-text-secondary); display: flex; flex-direction: column; gap: 4px;">
              Nostr naddr (NIP-5A) or App URL:
              <input
                id="install-manifest-url"
                type="text"
                placeholder="naddr1... / 35129:pubkey:d-tag / https://..."
                style="background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-strong); color: var(--omni-text-primary); padding: 8px 12px; border-radius: var(--omni-radius-sm); font-size: 0.85rem; outline: none;"
              />
            </label>

            <div style="display: flex; align-items: center; gap: 8px; justify-content: center; font-size: 0.75rem; color: var(--omni-text-muted);">
              <span>— or paste inline nsite HTML or script —</span>
            </div>

            <textarea
              id="install-manifest-json"
              rows="6"
              placeholder="<!DOCTYPE html>&#10;<html>&#10;<head>&#10;  <title>Custom App</title>&#10;  <link rel=&quot;alternate&quot; href=&quot;?view=widget&quot; title=&quot;Widget View&quot;>&#10;</head>&#10;<body>...</body>&#10;</html>"
              style="background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-strong); color: var(--omni-text-primary); padding: 8px 12px; border-radius: var(--omni-radius-sm); font-family: var(--omni-font-mono); font-size: 0.78rem; outline: none; resize: vertical;"
            ></textarea>

            <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; margin-top: 4px;">
              <div style="display: flex; gap: 6px;">
                <button id="btn-quick-sample-nostr" class="btn-secondary" style="font-size: 0.75rem;">
                  Load Sample Nostr (naddr)
                </button>
                <button id="btn-quick-sample-plugin" class="btn-secondary" style="font-size: 0.75rem;">
                  Load HTML Sample
                </button>
              </div>
              <button id="btn-confirm-install" class="btn-publish">
                Install Plugin
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 5. Plugin Inspector Modal -->
      <div class="modal-overlay" id="plugin-inspector-modal">
        <div class="modal-card" style="max-width: 540px;">
          <div class="modal-header">
            <div>
              <h3 id="inspector-plugin-name" style="font-size: 1.05rem; font-weight: 600;">Plugin Inspector</h3>
              <span id="inspector-plugin-id" style="font-family: var(--omni-font-mono); font-size: 0.72rem; color: var(--omni-text-muted);"></span>
            </div>
            <button class="btn-drawer-close" id="btn-close-inspector">
              ${icon("close", 14)}
            </button>
          </div>

          <div class="modal-tabs">
            <button class="modal-tab-btn active" id="tab-btn-overview">Overview</button>
            <button class="modal-tab-btn" id="tab-btn-permissions">Permissions</button>
            <button class="modal-tab-btn" id="tab-btn-manifest">Nostr Event</button>
          </div>

          <div id="inspector-pane-overview" style="display: flex; flex-direction: column; gap: 12px;">
            <div id="inspector-nostr-provenance" style="display: none; flex-direction: column; gap: 6px; background: var(--omni-bg-surface); padding: 10px; border-radius: var(--omni-radius-sm); border: 1px solid var(--omni-border-subtle);">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.75rem; font-weight: 600; color: var(--omni-accent-primary);">✦ Nostr NIP-5A Verified App</span>
                <span style="font-size: 0.7rem; color: #34d399;">SHA-256 Verified</span>
              </div>
              <div style="font-size: 0.75rem; color: var(--omni-text-muted); display: flex; flex-direction: column; gap: 3px;">
                <div>Author: <code id="inspector-author-npub" style="color: var(--omni-text-primary);"></code></div>
                <div>Nostr Address: <code id="inspector-naddr" style="color: var(--omni-text-primary); word-break: break-all;"></code></div>
              </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 4px; font-size: 0.82rem;">
              <div style="color: var(--omni-text-muted);">Source Origin:</div>
              <div id="inspector-source-url" style="font-family: var(--omni-font-mono); color: var(--omni-accent-primary); word-break: break-all; background: var(--omni-bg-surface); padding: 6px 10px; border-radius: var(--omni-radius-sm); border: 1px solid var(--omni-border-subtle);"></div>
            </div>

            <div style="display: flex; justify-content: flex-end;">
              <button id="btn-publish-plugin-nostr" class="btn-secondary" style="font-size: 0.75rem;">
                Publish / Share to Nostr (NIP-5A)
              </button>
            </div>

            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <h4 style="font-size: 0.85rem; color: var(--omni-text-secondary);">Discovered Routes & Views</h4>
                <span style="font-size: 0.7rem; color: var(--omni-text-muted);">Standard Nostr tags & HTML links</span>
              </div>
              <div id="inspector-views-list" style="display: flex; flex-direction: column; gap: 6px;"></div>
            </div>
          </div>

          <div id="inspector-pane-permissions" style="display: none; flex-direction: column; gap: 10px;">
            <p style="font-size: 0.8rem; color: var(--omni-text-muted);">
              Granular capabilities granted to this plugin. Revoking immediately denies runtime RPC requests.
            </p>
            <div id="inspector-permissions-list" style="display: flex; flex-direction: column; gap: 8px;"></div>
          </div>

          <div id="inspector-pane-manifest" style="display: none; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 0.72rem; color: var(--omni-text-muted);">Standard decentralized Nostr site event (NIP-5A kind 30066 / 30078)</span>
              <button id="btn-copy-manifest" class="btn-secondary" style="font-size: 0.72rem;">
                Copy Event JSON
              </button>
            </div>
            <pre class="manifest-code-block" id="inspector-manifest-raw"></pre>
          </div>
        </div>
      </div>

      <!-- 6. "Open With..." System Chooser Modal (Milestone 6) -->
      <div class="modal-overlay" id="open-with-modal">
        <div class="modal-card" style="max-width: 440px;">
          <div class="modal-header">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 1.1rem; color: var(--omni-accent-primary);">✦</span>
              <h3 style="font-size: 1.05rem; font-weight: 600;">Open With...</h3>
            </div>
            <button class="btn-drawer-close" id="btn-close-open-with">
              ${icon("close", 14)}
            </button>
          </div>

          <div style="display: flex; flex-direction: column; gap: 14px;">
            <div style="background: var(--omni-bg-surface); padding: 10px 12px; border-radius: var(--omni-radius-sm); border: 1px solid var(--omni-border-subtle); display: flex; flex-direction: column; gap: 4px;">
              <span style="font-size: 0.72rem; color: var(--omni-text-muted);">Incoming URI / Intent:</span>
              <code id="open-with-target-uri" style="font-size: 0.78rem; color: var(--omni-text-primary); word-break: break-all; font-family: var(--omni-font-mono);">nostr:...</code>
            </div>

            <p style="font-size: 0.8rem; color: var(--omni-text-secondary); margin: 0;">
              Select an installed application or handler to open this content:
            </p>

            <div id="open-with-handlers-list" style="display: flex; flex-direction: column; gap: 8px; max-height: 220px; overflow-y: auto;"></div>

            <div style="display: flex; align-items: center; gap: 8px; padding-top: 6px; border-top: 1px solid var(--omni-border-subtle);">
              <label style="display: flex; align-items: center; gap: 6px; font-size: 0.78rem; color: var(--omni-text-secondary); cursor: pointer;">
                <input id="open-with-always-checkbox" type="checkbox" />
                <span id="open-with-always-label">Always use this app for this protocol</span>
              </label>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px;">
              <button id="btn-cancel-open-with" class="btn-secondary" style="font-size: 0.78rem;">Cancel</button>
              <button id="btn-confirm-open-with" class="btn-publish" style="font-size: 0.78rem;" disabled>Open</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private cacheElementReferences(): void {
    this.mainViewport = document.getElementById("main-viewport") || this.root.querySelector(".main-viewport")!;
    this.headerActionsSlot = document.getElementById("header-actions-slot")!;
    this.dockSlot = document.getElementById("dock-slot")!;
    this.mainSlot = document.getElementById("main-slot")!;
    this.widgetsSlot = document.getElementById("widgets-slot")!;
    this.pageFeed = document.getElementById("page-feed")!;
    this.pageWidgets = document.getElementById("page-widgets")!;
    this.pageApps = document.getElementById("page-apps")!;
    this.dockBtnApps = document.getElementById("dock-btn-apps")!;
    this.dockBtnWidgets = document.getElementById("dock-btn-widgets")!;
    this.dockBtnSettings = document.getElementById("dock-btn-settings")!;

    this.settingsModal = document.getElementById("settings-modal")!;
    this.settingsNav = document.getElementById("settings-nav")!;
    this.settingsContent = document.getElementById("settings-content")!;
    const pluginsBtn = document.getElementById("settings-tab-btn-plugins");
    const pluginsPane = document.getElementById("settings-pane-plugins");
    this.settingsNavBtns = {
      plugins: pluginsBtn!
    };
    this.settingsPanes = {
      plugins: pluginsPane!
    };

    this.pluginInspectorModal = document.getElementById("plugin-inspector-modal")!;
    this.installPluginModal = document.getElementById("install-plugin-modal")!;
  }

  private initSlotContainers(): void {
    this.slotContainers.set("header-actions", this.headerActionsSlot);
    this.slotContainers.set("main", this.mainSlot);
    this.slotContainers.set("dock", this.dockSlot);
    this.slotContainers.set("icon", this.dockSlot);
    this.slotContainers.set("sidebar", this.widgetsSlot);
    this.slotContainers.set("widgets", this.widgetsSlot);
    this.slotContainers.set("dashboard", this.widgetsSlot);
  }

  private wireNavigation(): void {
    this.dockBtnApps?.addEventListener("click", () => this.showPage("apps"));
    this.dockBtnWidgets?.addEventListener("click", () => this.showPage("widgets"));
    this.dockBtnSettings?.addEventListener("click", () => this.openSettings("plugins"));

    const btnToggleGuide = document.getElementById("btn-toggle-viewport-guide");
    const guideBox = document.getElementById("viewport-guide-box");
    const btnCloseGuide = document.getElementById("btn-close-viewport-guide");
    btnToggleGuide?.addEventListener("click", () => {
      if (guideBox) {
        const isHidden = guideBox.style.display === "none";
        guideBox.style.display = isHidden ? "flex" : "none";
      }
    });
    btnCloseGuide?.addEventListener("click", () => {
      if (guideBox) guideBox.style.display = "none";
    });

    const btnResetLayout = document.getElementById("btn-reset-layout");
    btnResetLayout?.addEventListener("click", () => {
      if (!confirm("Reset all plugin component slots back to defaults?")) return;
      const manifests = this.installedPlugins.map((p) => this.ensurePluginManifest(p));
      this.layoutManager.resetToDefaults(manifests);
      for (const p of this.installedPlugins) {
        const synth = this.ensurePluginManifest(p);
        for (const comp of synth.components || []) {
          p.viewport = comp.slot;
          const container = this.getContainerForPluginSlot(p.id, comp.slot, comp.id);
          if (container) {
            this.kernel.getSandbox(p.id)?.reparentComponent(comp.id, container);
          }
          if (comp.slot !== "main" && comp.slot !== "dock" && p.id !== "org.omni.plugin.feed") {
            const safeId = p.id.replace(/[^a-zA-Z0-9_-]/g, "-");
            const pageEl = document.getElementById(`page-app-${safeId}`);
            pageEl?.remove();
          }
        }
      }
      this.renderDockLaunchers();
      this.renderPluginManager();
      this.saveLocalWorkspace();
    });

    const btnSyncWorkspace = document.getElementById("btn-sync-workspace");
    btnSyncWorkspace?.addEventListener("click", async () => {
      try {
        await this.syncWorkspaceToNostr();
        alert("Workspace layout synced to Nostr relays successfully!");
      } catch (err: any) {
        alert(`Sync failed: ${err.message || String(err)}`);
      }
    });

    const btnRestoreWorkspace = document.getElementById("btn-restore-workspace");
    btnRestoreWorkspace?.addEventListener("click", async () => {
      try {
        const restored = await this.restoreWorkspaceFromNostr();
        if (restored) {
          alert("Workspace layout successfully restored from Nostr relays!");
        } else {
          alert("No remote workspace event found on relays.");
        }
      } catch (err: any) {
        alert(`Restore failed: ${err.message || String(err)}`);
      }
    });

    const chkAutoSync = document.getElementById("chk-auto-sync-workspace") as HTMLInputElement | null;
    chkAutoSync?.addEventListener("change", () => {
      this.autoSyncNip78 = !!chkAutoSync.checked;
      this.saveLocalWorkspace();
    });

    const btnShellClassic = document.getElementById("btn-shell-classic");
    const btnShellPanorama = document.getElementById("btn-shell-panorama");
    btnShellClassic?.addEventListener("click", () => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("omni_active_shell", "classic");
        window.location.reload();
      }
    });
    btnShellPanorama?.addEventListener("click", () => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("omni_active_shell", "panorama");
        window.location.reload();
      }
    });
  }

  private wireSettingsModal(): void {
    const btnClose = document.getElementById("btn-close-settings-modal");
    btnClose?.addEventListener("click", () => this.closeSettings());
    this.settingsModal?.addEventListener("click", (e) => {
      if (e.target === this.settingsModal) this.closeSettings();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.settingsModal?.classList.contains("open")) {
        this.closeSettings();
      }
    });

    const pluginsBtn = document.getElementById("settings-tab-btn-plugins");
    pluginsBtn?.addEventListener("click", () => this.switchSettingsTab("plugins"));
  }

  private wireInspectorModal(): void {
    const btnClose = document.getElementById("btn-close-inspector");
    const tabOverview = document.getElementById("tab-btn-overview");
    const tabPerms = document.getElementById("tab-btn-permissions");
    const tabMan = document.getElementById("tab-btn-manifest");
    const btnCopy = document.getElementById("btn-copy-manifest");
    const btnPublish = document.getElementById("btn-publish-plugin-nostr") as HTMLButtonElement | null;

    btnClose?.addEventListener("click", () => {
      this.pluginInspectorModal.classList.remove("open");
      this.activeInspectedPlugin = null;
    });

    this.pluginInspectorModal?.addEventListener("click", (e) => {
      if (e.target === this.pluginInspectorModal) {
        this.pluginInspectorModal.classList.remove("open");
        this.activeInspectedPlugin = null;
      }
    });

    tabOverview?.addEventListener("click", () => this.switchInspectorTab("overview"));
    tabPerms?.addEventListener("click", () => this.switchInspectorTab("permissions"));
    tabMan?.addEventListener("click", () => this.switchInspectorTab("manifest"));

    btnCopy?.addEventListener("click", async () => {
      const rawPre = document.getElementById("inspector-manifest-raw");
      if (rawPre?.textContent) {
        await navigator.clipboard.writeText(rawPre.textContent);
        btnCopy.textContent = "Copied!";
        setTimeout(() => {
          btnCopy.textContent = "Copy Event JSON";
        }, 1500);
      }
    });

    btnPublish?.addEventListener("click", async () => {
      if (!this.activeInspectedPlugin || !btnPublish) return;
      const p = this.activeInspectedPlugin;
      btnPublish.disabled = true;
      btnPublish.textContent = "Signing & Publishing to Nostr...";

      try {
        const published = await this.kernel.publishNsitePlugin(this.ensurePluginManifest(p), p.htmlContent || p.scriptContent);
        p.naddr = published.naddr;
        p.authorNpub = published.authorNpub;
        p.event = published.event;
        p.sourceUrl = published.naddr;

        const nostrProvEl = document.getElementById("inspector-nostr-provenance");
        const authorNpubEl = document.getElementById("inspector-author-npub");
        const naddrEl = document.getElementById("inspector-naddr");
        const sourceUrlEl = document.getElementById("inspector-source-url");

        if (nostrProvEl) nostrProvEl.style.display = "flex";
        if (authorNpubEl) authorNpubEl.textContent = published.authorNpub;
        if (naddrEl) naddrEl.textContent = published.naddr;
        if (sourceUrlEl) sourceUrlEl.textContent = published.naddr;
        btnPublish.textContent = "Published & Verified!";

        await navigator.clipboard.writeText(published.naddr);
        alert(`Plugin '${p.manifest.name}' published to Nostr (NIP-5A)!\n\nNostr Address:\n${published.naddr}`);

        setTimeout(() => {
          btnPublish.disabled = false;
          btnPublish.textContent = "Re-Publish to Nostr (Update)";
        }, 2000);
      } catch (err: any) {
        console.error("Failed to publish plugin to Nostr:", err);
        alert(`Failed to publish plugin to Nostr: ${err.message || String(err)}`);
        btnPublish.disabled = false;
        btnPublish.textContent = "Publish / Share to Nostr (NIP-5A)";
      }
    });
  }

  private wireInstallModal(): void {
    const btnShow = document.getElementById("btn-show-install-modal");
    const btnClose = document.getElementById("btn-close-install-modal");
    const urlInput = document.getElementById("install-manifest-url") as HTMLInputElement;
    const jsonInput = document.getElementById("install-manifest-json") as HTMLTextAreaElement;
    const btnQuickNostr = document.getElementById("btn-quick-sample-nostr") as HTMLButtonElement;
    const btnQuickRaw = document.getElementById("btn-quick-sample-plugin") as HTMLButtonElement;
    const btnConfirm = document.getElementById("btn-confirm-install") as HTMLButtonElement;

    btnShow?.addEventListener("click", () => this.installPluginModal.classList.add("open"));
    btnClose?.addEventListener("click", () => this.installPluginModal.classList.remove("open"));
    this.installPluginModal?.addEventListener("click", (e) => {
      if (e.target === this.installPluginModal) this.installPluginModal.classList.remove("open");
    });

    btnQuickRaw?.addEventListener("click", () => {
      urlInput.value = "";
      jsonInput.value = `<!DOCTYPE html>
<html>
<head>
  <title>Scratchpad Notes</title>
  <link rel="alternate" href="?view=widget" title="Scratchpad Widget">
</head>
<body>
  <div style="background: var(--omni-bg-surface); padding: 14px; border-radius: var(--omni-radius-md);">
    <h3 style="font-size: 0.95rem; font-weight: 600; color: var(--omni-accent-primary);">✦ Scratchpad Notes</h3>
    <textarea style="width: 100%; height: 100px; margin-top: 8px; background: var(--omni-bg-subtle); color: var(--omni-text-primary); border: 1px solid var(--omni-border-subtle); border-radius: 4px; padding: 8px; font-family: inherit; font-size: 0.82rem;" placeholder="Write quick notes here..."></textarea>
  </div>
</body>
</html>`;
    });

    btnQuickNostr?.addEventListener("click", async () => {
      btnQuickNostr.disabled = true;
      btnQuickNostr.textContent = "Publishing to Nostr...";
      try {
        const sampleManifest = {
          id: "org.omni.plugin.nostr-wisdom",
          name: "Decentralized Wisdom",
          version: "1.0.0",
          description: "Cryptographic quotes and cypherpunk wisdom widget",
          entry: "index.html",
          components: [{ id: "wisdom-widget", slot: "sidebar", title: "Wisdom Widget" }]
        };
        const sampleScript = `
          <!DOCTYPE html>
          <html>
          <body>
            <div style="background: var(--omni-bg-surface); padding: 14px; border-radius: var(--omni-radius-md); border: 1px solid var(--omni-border-strong);">
              <h3 style="font-size: 0.95rem; font-weight: 600; color: var(--omni-accent-primary);">✦ Decentralized Wisdom</h3>
              <p style="font-size: 0.85rem; font-style: italic; margin-top: 8px;">“Don't trust, verify.” — Cypherpunk Maxim</p>
            </div>
          </body>
          </html>
        `;
        const published = await this.kernel.publishNsitePlugin(sampleManifest as any, sampleScript);
        urlInput.value = published.naddr;
        jsonInput.value = "";
        btnQuickNostr.textContent = "naddr Loaded!";
        setTimeout(() => {
          btnQuickNostr.disabled = false;
          btnQuickNostr.textContent = "Load Sample Nostr (naddr)";
        }, 2000);
      } catch (err: any) {
        console.error("Failed to generate Nostr sample:", err);
        alert(`Failed: ${err.message || String(err)}`);
        btnQuickNostr.disabled = false;
        btnQuickNostr.textContent = "Load Sample Nostr (naddr)";
      }
    });

    btnConfirm?.addEventListener("click", async () => {
      const jsonText = jsonInput.value.trim();
      const urlText = urlInput.value.trim();
      let manifest: any = null;
      let scriptContent = "";
      let resolvedNaddr: string | undefined;
      let resolvedAuthorNpub: string | undefined;

      btnConfirm.disabled = true;
      try {
        if (urlText && (urlText.startsWith("naddr1") || urlText.includes(":"))) {
          btnConfirm.textContent = "Resolving from Nostr (NIP-5A)...";
          const resolved = await this.kernel.resolveNsitePlugin(urlText);
          manifest = resolved.manifest;
          scriptContent = resolved.scriptContent;
          resolvedNaddr = resolved.naddr;
          resolvedAuthorNpub = resolved.authorNpub;
        } else if (urlText) {
          btnConfirm.textContent = "Fetching from URL...";
          const res = await fetch(urlText);
          manifest = await res.json();
        } else if (jsonText) {
          if (jsonText.startsWith("<") || jsonText.startsWith("<!DOCTYPE")) {
            scriptContent = jsonText;
            manifest = {
              id: `custom-app-${Date.now()}`,
              name: "Custom HTML App",
              version: "1.0.0",
              entry: "index.html",
              components: [{ id: "custom-main", slot: "main", title: "Custom App" }]
            };
          } else {
            manifest = JSON.parse(jsonText);
          }
        } else {
          alert("Please provide either a Nostr naddr, URL, or JSON/HTML content.");
          btnConfirm.disabled = false;
          return;
        }

        if (!manifest.id || !manifest.name) {
          alert("Invalid plugin manifest: 'id' and 'name' are required.");
          btnConfirm.disabled = false;
          return;
        }

        if (this.installedPlugins.some((p) => p.id === manifest.id)) {
          alert(`Plugin '${manifest.name}' (${manifest.id}) is already installed.`);
          btnConfirm.disabled = false;
          return;
        }

        if (!scriptContent) {
          scriptContent = `
            <!DOCTYPE html>
            <html>
            <body>
              <div style="background: var(--omni-bg-surface); padding: 12px; border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-md);">
                <h4>${manifest.name}</h4>
                <p style="font-size: 0.8rem; color: var(--omni-text-muted);">${manifest.description || "Active application"}</p>
              </div>
            </body>
            </html>
          `;
        }

        const entry: InstalledPluginEntry = {
          id: manifest.id,
          manifest,
          scriptContent,
          sourceUrl: resolvedNaddr || urlText || `custom:${manifest.id}`,
          enabled: true,
          naddr: resolvedNaddr,
          authorNpub: resolvedAuthorNpub
        };

        btnConfirm.textContent = "Mounting to sandbox...";
        await this.kernel.registerPlugin(this.ensurePluginManifest(entry), scriptContent, this.slotContainers);
        this.installedPlugins.push(entry);
        this.renderDockLaunchers();
        this.renderSettingsNavAndPanes();
        this.saveLocalWorkspace();
        this.installPluginModal.classList.remove("open");
        urlInput.value = "";
        jsonInput.value = "";
        alert(`Plugin '${manifest.name}' installed successfully!`);
      } catch (err: any) {
        console.error("Install failed:", err);
        alert(`Install failed: ${err.message || String(err)}`);
      } finally {
        btnConfirm.disabled = false;
        btnConfirm.textContent = "Install Plugin";
      }
    });
  }

  private wireProfileControls(): void {
    const userBadge = document.getElementById("user-badge");
    userBadge?.addEventListener("click", () => this.openSettings("profile"));
  }

  private wireRelaysManager(): void {
    // Relays management is handled by the standalone @omni/plugin-relays plugin
  }



  // --- Milestone 6: Transparent Cross-App Intents & Open With Chooser ---

  public async promptOpenWith(uri: string): Promise<string | null> {
    const scheme = uri.split(":")[0]?.toLowerCase() || "unknown";

    // 1. Check if user configured a default handler for this scheme
    const defaultHandlerId = this.kernel.getDefaultHandler(scheme);
    if (defaultHandlerId) {
      const isInstalled = this.installedPlugins.some((p) => p.id === defaultHandlerId);
      if (isInstalled) {
        return defaultHandlerId;
      }
    }

    // 2. Resolve available handlers from kernel
    const handlers = await this.kernel.resolveAppHandlers(uri, this.installedPlugins);
    if (handlers.length === 0) {
      if (typeof alert === "function") {
        alert(`No installed apps or handlers found for URI scheme: ${scheme}:`);
      } else if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert(`No installed apps or handlers found for URI scheme: ${scheme}:`);
      }
      return null;
    }

    if (handlers.length === 1 && handlers[0].isInstalled) {
      return handlers[0].id;
    }

    // 3. Present "Open With..." chooser dialog
    return new Promise((resolve) => {
      const modal = document.getElementById("open-with-modal");
      const uriEl = document.getElementById("open-with-target-uri");
      const listEl = document.getElementById("open-with-handlers-list");
      const alwaysChk = document.getElementById("open-with-always-checkbox") as HTMLInputElement | null;
      const alwaysLabel = document.getElementById("open-with-always-label");
      const btnConfirm = document.getElementById("btn-confirm-open-with") as HTMLButtonElement | null;
      const btnCancel = document.getElementById("btn-cancel-open-with");
      const btnClose = document.getElementById("btn-close-open-with");

      if (!modal || !listEl) return resolve(null);

      if (uriEl) uriEl.textContent = uri;
      if (alwaysLabel) alwaysLabel.textContent = `Always open ${scheme}: links with this app`;
      if (alwaysChk) alwaysChk.checked = false;
      if (btnConfirm) btnConfirm.disabled = true;

      listEl.innerHTML = "";
      let selectedHandlerId: string | null = null;

      for (const h of handlers) {
        const row = document.createElement("div");
        row.className = "open-with-handler-item";
        row.style.cssText =
          "display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--omni-bg-surface); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-sm); cursor: pointer; transition: border-color 0.15s;";

        const left = document.createElement("div");
        left.style.cssText = "display: flex; align-items: center; gap: 10px;";

        const iconEl = document.createElement("div");
        iconEl.style.cssText =
          "width: 32px; height: 32px; border-radius: var(--omni-radius-sm); background: var(--omni-bg-subtle); display: flex; align-items: center; justify-content: center; font-size: 1rem; color: var(--omni-accent-primary);";
        iconEl.textContent = "✦";

        const textCol = document.createElement("div");
        textCol.style.cssText = "display: flex; flex-direction: column; gap: 2px;";
        textCol.innerHTML = `<span style="font-weight: 600; font-size: 0.85rem; color: var(--omni-text-primary);">${h.name}</span><span style="font-size: 0.72rem; color: var(--omni-text-muted);">${h.description || ""}</span>`;

        left.appendChild(iconEl);
        left.appendChild(textCol);

        const badge = document.createElement("span");
        badge.style.cssText =
          "font-size: 0.68rem; background: var(--omni-bg-subtle); color: var(--omni-accent-primary); padding: 2px 6px; border-radius: var(--omni-radius-pill);";
        badge.textContent = h.isInstalled ? "Installed" : "Nostr NIP-89";

        row.appendChild(left);
        row.appendChild(badge);

        row.addEventListener("click", () => {
          listEl.querySelectorAll(".open-with-handler-item").forEach((el: any) => {
            el.style.borderColor = "var(--omni-border-subtle)";
          });
          row.style.borderColor = "var(--omni-accent-primary)";
          selectedHandlerId = h.id;
          if (btnConfirm) btnConfirm.disabled = false;
        });

        listEl.appendChild(row);
      }

      const cleanup = () => {
        modal.classList.remove("open");
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
          this.kernel.setDefaultHandler(scheme, selectedHandlerId);
        }
        cleanup();
        resolve(selectedHandlerId);
      };

      btnCancel?.addEventListener("click", onCancel);
      btnClose?.addEventListener("click", onCancel);
      btnConfirm?.addEventListener("click", onConfirm);

      modal.classList.add("open");
    });
  }

  public async handleUri(uri: string, sourcePluginId?: string): Promise<any> {
    const chosenHandlerId = await this.promptOpenWith(uri);
    if (!chosenHandlerId) return { handled: false, uri };

    // Launch or focus selected app
    if (chosenHandlerId.includes("feed") || chosenHandlerId === "org.omni.plugin.feed") {
      this.showPage("feed");
    } else {
      this.showPage("widgets");
    }

    return { handled: true, uri, handlerId: chosenHandlerId };
  }

  public async handleShare(
    payload: { title?: string; text?: string; url?: string },
    sourcePluginId?: string
  ): Promise<any> {
    // Switch to feed view (timeline & composer)
    this.showPage("feed");

    const draftText = [payload.title, payload.text, payload.url].filter(Boolean).join("\n\n");
    if (draftText) {
      try {
        await this.kernel.intentBroker.dispatch("shell", "create_note", { content: draftText });
      } catch (_) {}
    }

    return { handled: true, payload };
  }
}
