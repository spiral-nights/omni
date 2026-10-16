import { OmniKernel, WebCryptoKeystore, NostrPluginResolver, LayoutManager, STANDARD_SLOTS } from "@omni/core";
import {
  OmniWorkspaceState,
  OmniWorkspacePluginConfig,
  PluginPlacement,
  OMNI_WORKSPACE_D_TAG,
  NostrEvent,
  PluginViewDeclaration,
  OmniShellHost
} from "@omni/types";
import { ICONS } from "./icons.js";
import { showIntentEnableToast } from "./permissions-intents-ui.js";
import { unmountShellStyles } from "./styles/loader.js";

export interface InstalledPluginEntry {
  id: string;
  name?: string;
  displayName?: string;
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
  handledIntents?: string[]; // Intents this plugin can handle
  disabledIntents?: string[]; // Intents user explicitly turned off for this plugin
  naddr?: string;
  authorNpub?: string;
  event?: any;
}

export interface OmniShellOptions {
  root: HTMLElement;
  kernel: OmniKernel;
  installedPlugins?: InstalledPluginEntry[];
}

/**
 * BaseShell: Abstract base class consolidating all shared Omni Shell business logic:
 * - Plugin Lifecycle & Manifest Synthesis
 * - Multi-Viewport Placement Mapping
 * - NIP-78 Workspace Synchronization & Local Persistence
 * - Intent Broker Coordination & Handlers
 * - Protocol URI Routing & Web Share API Interception
 * - Shared Settings Sub-Views (Default Applications, ACL, Profile)
 *
 * Concrete shell implementations (e.g. OmniShell Classic, PanoramaShell) extend BaseShell
 * and focus strictly on layout presentation, viewport containers, and navigation styling.
 */
export abstract class BaseShell implements OmniShellHost {
  public root: HTMLElement;
  public kernel: OmniKernel;
  public installedPlugins: InstalledPluginEntry[];
  public readonly layoutManager: LayoutManager;
  public slotContainers: Map<string, Element> = new Map();
  public expandedPluginId: string | null = null;

  // NIP-78 Workspace sync state
  public workspaceSyncStatus: "synced" | "unsynced" | "syncing" = "synced";
  public lastSyncedAt: number | null = null;
  public autoSyncNip78: boolean = true;
  protected syncDebounceTimer: any = null;
  public readonly LOCAL_WORKSPACE_KEY = "omni_workspace_state";

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
    this.registerHandledIntents();
    this.setupIntentListener();
  }

  // --- Abstract Interface: Concrete Shells Must Implement Layout & Styling ---

  /**
   * Mounts the shell layout and UI frame into the root host DOM element.
   */
  public abstract mount(): void;

  /**
   * Resolves physical DOM container elements for plugin viewports (main, sidebar, dock, header-actions).
   */
  public abstract getContainerForPluginSlot(pluginId: string, viewport: string, componentId?: string): Element | undefined;

  /**
   * Switches the active center viewport or slides into a full page app.
   */
  public abstract showPage(pageId: string): void | Promise<void>;

  /**
   * Returns the current active page identifier.
   */
  public abstract getActivePageId(): string;

  /**
   * Returns the canonical shell identifier (e.g. 'classic', 'panorama').
   */
  public abstract getShellType(): "classic" | "panorama" | string;

  /**
   * Hook invoked whenever plugins, placements, or workspace configurations change.
   * Allows concrete shells to update their navigation docks, pivot headers, or app tiles.
   */
  protected abstract onWorkspaceUpdated(): void;

  /**
   * Returns map of standard slot containers for micro-frontend projection.
   */
  public abstract getSlotContainers(): Map<string, Element>;

  // --- Centralized Intent Listener & Handler Registration ---

  protected setupIntentListener(): void {
    if (!this.kernel?.intentBroker) return;

    this.kernel.intentBroker.setPromptEnableCandidateCallback(async (action, candidate) => {
      return new Promise<boolean>((resolve) => {
        this.showEnableCandidateToast(action, candidate, resolve);
      });
    });

    this.kernel.intentBroker.setDisambiguateCallback(async (action, candidates, data) => {
      return this.promptDisambiguateIntent(action, candidates, data);
    });

    this.kernel.intentBroker.on("intent:dispatched", async (event: any) => {
      const targetPluginId = event?.targetPluginId;
      if (!targetPluginId) return;

      if (event?.action === "view_profile" && event?.data?.pubkey) {
        try {
          localStorage.setItem("omni_active_profile_pubkey", event.data.pubkey);
        } catch (_) {}
      }

      await this.showPage(targetPluginId);
      if (!event?.isRpc) {
        this.kernel.notifyPlugin(targetPluginId, "intent.invoke", {
          action: event.action,
          data: event.data
        });
      }
    });
  }

  protected registerHandledIntents(): void {
    if (!this.kernel?.intentBroker) return;
    for (const p of this.installedPlugins) {
      if (p.handledIntents) {
        for (const action of p.handledIntents) {
          this.kernel.intentBroker.registerHandler(
            p.id,
            action,
            async (data) => {
              if (action === "view_profile" && data?.pubkey) {
                try {
                  localStorage.setItem("omni_active_profile_pubkey", data.pubkey);
                } catch (_) {}
              }
              return { handled: true };
            },
            { name: p.displayName || p.name, description: p.description }
          );
        }
      }
    }
  }

  // --- Plugin Metadata, Views & Synthesis ---

  public getPluginMeta(p: InstalledPluginEntry): {
    id: string;
    name: string;
    displayName: string;
    version: string;
    description: string;
    icon: string;
    viewport: string;
  } {
    const displayName = p.displayName || p.manifest?.displayName || p.name || p.manifest?.name || p.id;
    if (Array.isArray(p.placements) && p.placements.length === 0) {
      return {
        id: p.id,
        name: p.name || p.manifest?.name || p.id,
        displayName,
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
      displayName,
      version: p.version || p.manifest?.version || "1.0.0",
      description: p.description || p.manifest?.description || "",
      icon: p.icon || p.manifest?.icon || (p.viewport === "main" ? "feed" : "widgets"),
      viewport: p.viewport || layoutSlot || p.manifest?.components?.[0]?.slot || "main"
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
        intents: { call: ["*"], handle: ["*"] },
        relays: p.id === "org.omni.plugin.relays" ? { manage: true, read: true } : undefined
      }
    };
  }

  public getPluginPlacements(p: InstalledPluginEntry): PluginPlacement[] {
    if (Array.isArray(p.placements)) {
      return p.placements;
    }
    if (p.viewport === "") {
      return [];
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

  // --- Mounting & Remounting Lifecycle ---

  public async mountPlugin(plugin: InstalledPluginEntry, placementId?: string): Promise<void> {
    if (!plugin.enabled) return;
    const placements = this.getPluginPlacements(plugin);
    const slotContainers = this.getSlotContainers();

    for (const pl of placements) {
      if (pl.enabled === false) continue;
      if (placementId && pl.id !== placementId) continue;
      const instanceKey = `${plugin.id}::${pl.id}`;
      if (this.kernel.getSandbox(instanceKey)) continue;

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
          instanceId: instanceKey,
          route: pl.route,
          viewId: pl.viewId,
          targetSlot: pl.viewport,
          relays: plugin.relays
        }
      );
    }
  }

  public async ensureWidgetsMounted(): Promise<void> {
    for (const p of this.installedPlugins) {
      if (!p.enabled) continue;
      const placements = this.getPluginPlacements(p);
      for (const pl of placements) {
        if (pl.enabled === false) continue;
        if (pl.viewport === "sidebar" || pl.viewport === "widgets") {
          const instanceKey = `${p.id}::${pl.id}`;
          if (!this.kernel.getSandbox(instanceKey) && !this.kernel.getSandbox(p.id)) {
            await this.mountPlugin(p, pl.id).catch(console.warn);
          }
        }
      }
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
      const pageEl = document.getElementById(`page-app-${safeId}`) || document.getElementById(`panorama-page-app-${safeId}`);
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

    if (plugin.enabled !== false) {
      await this.mountPlugin(plugin);
    }
    this.onWorkspaceUpdated();
    this.saveLocalWorkspace();
  }

  public isAppPinned(p: InstalledPluginEntry): boolean {
    if (p.id === "org.omni.plugin.feed" && p.pinned === undefined) return true;
    if (p.pinned !== undefined) return p.pinned;
    const placements = this.getPluginPlacements(p);
    const mainPl = placements.find((pl) => pl.viewport === "main");
    if (mainPl && mainPl.pinned !== undefined) return mainPl.pinned;
    if (mainPl) return true;
    const dockPl = placements.find((pl) => pl.viewport === "dock");
    if (dockPl) return true;
    return false;
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

    this.onWorkspaceUpdated();
    this.saveLocalWorkspace();
  }

  // --- Workspace State Serialization & NIP-78 Sync ---

  public exportWorkspaceState(): OmniWorkspaceState {
    return {
      version: 1,
      updatedAt: Date.now(),
      activePage: this.getActivePageId(),
      autoSync: this.autoSyncNip78,
      shellType: this.getShellType(),
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
          displayName: p.displayName || meta.displayName,
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

  protected getStorage(): Storage | null {
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

    if (state.defaultIntents) {
      for (const [action, pId] of Object.entries(state.defaultIntents)) {
        this.kernel.intentBroker.setDefaultHandler(action, pId);
      }
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
        if (item.displayName !== undefined) {
          plugin.displayName = item.displayName;
        }
        if (item.relays !== undefined) {
          plugin.relays = Array.isArray(item.relays) ? item.relays : undefined;
        }
        if (item.handledIntents !== undefined) {
          plugin.handledIntents = item.handledIntents;
        }
        if (item.disabledIntents !== undefined) {
          plugin.disabledIntents = item.disabledIntents;
          for (const act of (plugin.handledIntents || [])) {
            const isDis = plugin.disabledIntents.includes(act);
            this.kernel.intentBroker.setPluginIntentEnabled(plugin.id, act, !isDis);
          }
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
            this.layoutManager?.unregisterPlugin(plugin.id);
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
            const pageEl = document.getElementById(`page-app-${safeId}`) || document.getElementById(`panorama-page-app-${safeId}`);
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

    this.onWorkspaceUpdated();

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
              if (item.displayName !== undefined) plugin.displayName = item.displayName;
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

  // --- Shared Plugin Management & Identity ---

  public async updateProfileUi(): Promise<void> {
    try {
      const pubkey = await this.kernel.keystore.getPublicKey();
      const npub = WebCryptoKeystore.toNpub(pubkey);
      const shortNpub = `${npub.slice(0, 8)}...${npub.slice(-4)}`;
      const profile = await this.kernel.getProfile(pubkey);

      const avatarEl = document.getElementById("header-profile-avatar") || document.getElementById("panorama-header-avatar");
      const nameEl = document.getElementById("header-profile-name") || document.getElementById("panorama-header-name");
      const npubEl = document.getElementById("header-profile-npub") || document.getElementById("panorama-header-npub");

      if (avatarEl) {
        if (profile?.picture) {
          avatarEl.innerHTML = `<img src="${profile.picture}" style="width: 100%; height: 100%; object-fit: cover; border-radius: var(--omni-radius-full, 50%);" alt="Avatar">`;
        } else {
          avatarEl.innerHTML = ICONS.profile;
        }
      }
      if (nameEl) {
        nameEl.textContent = profile?.display_name || profile?.name || shortNpub;
      }
      if (npubEl) {
        npubEl.textContent = shortNpub;
      }
      const userBadge = document.getElementById("user-badge");
      if (userBadge) {
        if (profile) {
          const displayName = profile.display_name || profile.name || shortNpub;
          userBadge.textContent = displayName;
          userBadge.title = `${displayName}\n${npub}\nClick to manage profile`;
        } else {
          userBadge.textContent = shortNpub;
          userBadge.title = `Your Nostr Identity: ${npub}\nClick to manage profile`;
        }
      }
    } catch (_) {}
  }

  public uninstallPlugin(pluginId: string): void {
    this.kernel.uninstallPlugin(pluginId);
    const safeId = pluginId.replace(/[^a-zA-Z0-9_-]/g, "-");
    const pageEl = document.getElementById(`page-app-${safeId}`) || document.getElementById(`panorama-page-app-${safeId}`);
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
    this.onWorkspaceUpdated();
    this.saveLocalWorkspace();
  }

  // --- Shared Intent UI & Protocol Handlers ---

  public showEnableCandidateToast(
    action: string,
    candidate: { pluginId: string; name?: string; icon?: string; description?: string },
    resolve: (enabled: boolean) => void
  ): void {
    showIntentEnableToast({
      action,
      candidateName: candidate.name || candidate.pluginId,
      theme: this.getShellType() === "panorama" ? "panorama" : "classic",
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
      const modal = document.getElementById("open-with-modal");
      const uriEl = document.getElementById("open-with-target-uri");
      const listEl = document.getElementById("open-with-handlers-list");
      const alwaysChk = document.getElementById("open-with-always-checkbox") as HTMLInputElement | null;
      const alwaysLabel = document.getElementById("open-with-always-label");
      const btnConfirm = document.getElementById("btn-confirm-open-with") as HTMLButtonElement | null;
      const btnCancel = document.getElementById("btn-cancel-open-with");
      const btnClose = document.getElementById("btn-close-open-with");

      if (!modal || !listEl) return resolve(null);

      if (uriEl) uriEl.textContent = `Intent Action: "${action}"`;
      if (alwaysLabel) alwaysLabel.textContent = `Always use this app for "${action}"`;
      if (alwaysChk) alwaysChk.checked = false;
      if (btnConfirm) btnConfirm.disabled = true;

      listEl.innerHTML = "";
      let selectedHandlerId: string | null = null;

      for (const c of candidates) {
        const row = document.createElement("div");
        row.className = "open-with-handler-item";
        row.style.cssText =
          "display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--omni-bg-surface, #191816); border: 1px solid var(--omni-border-subtle, #2d2b27); border-radius: var(--omni-radius-sm, 6px); cursor: pointer; transition: border-color 0.15s;";

        const left = document.createElement("div");
        left.style.cssText = "display: flex; align-items: center; gap: 10px;";

        const iconEl = document.createElement("div");
        iconEl.style.cssText =
          "width: 32px; height: 32px; border-radius: var(--omni-radius-sm, 6px); background: var(--omni-bg-subtle, #22201d); display: flex; align-items: center; justify-content: center; font-size: 1rem; color: var(--omni-accent-primary, #d4a373);";
        iconEl.textContent = "✦";

        const textCol = document.createElement("div");
        textCol.style.cssText = "display: flex; flex-direction: column; gap: 2px;";
        textCol.innerHTML = `<span style="font-weight: 600; font-size: 0.85rem; color: var(--omni-text-primary, #ede8df);">${c.name || c.pluginId}</span><span style="font-size: 0.72rem; color: var(--omni-text-muted, #6b665f);">${c.description || ""}</span>`;

        left.appendChild(iconEl);
        left.appendChild(textCol);

        const badge = document.createElement("span");
        badge.style.cssText =
          "font-size: 0.68rem; background: var(--omni-bg-subtle, #22201d); color: var(--omni-accent-primary, #d4a373); padding: 2px 6px; border-radius: var(--omni-radius-pill, 9999px);";
        badge.textContent = "Handler";

        row.appendChild(left);
        row.appendChild(badge);

        row.addEventListener("click", () => {
          listEl.querySelectorAll(".open-with-handler-item").forEach((el: any) => {
            el.style.borderColor = "var(--omni-border-subtle, #2d2b27)";
          });
          row.style.borderColor = "var(--omni-accent-primary, #d4a373)";
          selectedHandlerId = c.pluginId;
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
          this.kernel.intentBroker.setDefaultHandler(action, selectedHandlerId);
          this.saveLocalWorkspace();
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

  public renderDefaultApplicationsSettings(container: HTMLElement): void {
    const existing = container.querySelector(".default-applications-box") || container.querySelector(".panorama-default-applications-box");
    if (existing) existing.remove();

    const box = document.createElement("div");
    box.className = "default-applications-box";
    box.style.cssText =
      "display: flex; flex-direction: column; gap: 8px; background: var(--omni-bg-surface, #191816); padding: 12px 14px; border: 1px solid var(--omni-border-subtle, #2d2b27); border-radius: var(--omni-radius-sm, 6px); margin-top: 10px;";

    box.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong style="font-size: 0.85rem; font-weight: 600; color: var(--omni-text-primary, #ede8df);">Default Applications</strong>
        <span style="font-size: 0.7rem; color: var(--omni-text-muted, #6b665f);">Intent Routing</span>
      </div>
      <p style="font-size: 0.72rem; color: var(--omni-text-muted, #6b665f); margin: 0;">
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
      label.style.cssText = "font-size: 0.75rem; color: var(--omni-text-secondary, #9e988f);";
      label.textContent = sa.label;

      const select = document.createElement("select");
      select.style.cssText =
        "background: var(--omni-bg-subtle, #22201d); border: 1px solid var(--omni-border-strong, #3a3732); color: var(--omni-text-primary, #ede8df); font-size: 0.72rem; padding: 4px 8px; border-radius: var(--omni-radius-sm, 4px); outline: none;";

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

  public async promptOpenWith(uri: string): Promise<string | null> {
    const scheme = uri.split(":")[0]?.toLowerCase() || "unknown";

    const defaultHandlerId = this.kernel.getDefaultHandler(scheme);
    if (defaultHandlerId) {
      const isInstalled = this.installedPlugins.some((p) => p.id === defaultHandlerId);
      if (isInstalled) {
        return defaultHandlerId;
      }
    }

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
          "display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--omni-bg-surface, #191816); border: 1px solid var(--omni-border-subtle, #2d2b27); border-radius: var(--omni-radius-sm, 6px); cursor: pointer; transition: border-color 0.15s;";

        const left = document.createElement("div");
        left.style.cssText = "display: flex; align-items: center; gap: 10px;";

        const iconEl = document.createElement("div");
        iconEl.style.cssText =
          "width: 32px; height: 32px; border-radius: var(--omni-radius-sm, 6px); background: var(--omni-bg-subtle, #22201d); display: flex; align-items: center; justify-content: center; font-size: 1rem; color: var(--omni-accent-primary, #d4a373);";
        iconEl.textContent = "✦";

        const textCol = document.createElement("div");
        textCol.style.cssText = "display: flex; flex-direction: column; gap: 2px;";
        textCol.innerHTML = `<span style="font-weight: 600; font-size: 0.85rem; color: var(--omni-text-primary, #ede8df);">${h.name}</span><span style="font-size: 0.72rem; color: var(--omni-text-muted, #6b665f);">${h.description || ""}</span>`;

        left.appendChild(iconEl);
        left.appendChild(textCol);

        const badge = document.createElement("span");
        badge.style.cssText =
          "font-size: 0.68rem; background: var(--omni-bg-subtle, #22201d); color: var(--omni-accent-primary, #d4a373); padding: 2px 6px; border-radius: var(--omni-radius-pill, 9999px);";
        badge.textContent = h.isInstalled ? "Installed" : "NIP-89";

        row.appendChild(left);
        row.appendChild(badge);

        row.addEventListener("click", () => {
          listEl.querySelectorAll(".open-with-handler-item").forEach((el: any) => {
            el.style.borderColor = "var(--omni-border-subtle, #2d2b27)";
          });
          row.style.borderColor = "var(--omni-accent-primary, #d4a373)";
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
          this.saveLocalWorkspace();
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

    if (chosenHandlerId.includes("feed") || chosenHandlerId === "org.omni.plugin.feed") {
      this.showPage("feed");
    } else {
      this.showPage(chosenHandlerId);
    }

    return { handled: true, uri, handlerId: chosenHandlerId };
  }

  public async handleShare(
    payload: { title?: string; text?: string; url?: string },
    sourcePluginId?: string
  ): Promise<any> {
    this.showPage("feed");
    const draftText = [payload.title, payload.text, payload.url].filter(Boolean).join("\n\n");
    if (draftText) {
      try {
        await this.kernel.intentBroker.dispatch("shell", "create_note", { content: draftText });
      } catch (_) {}
    }
    return { handled: true, payload };
  }

  public handleSlotAction(action: "toggle" | "open" | "close", slot: string): void {
    if (slot === "sidebar" || slot === "widgets") {
      if (action === "open") this.showPage("widgets");
      else if (action === "close") this.showPage("feed");
      else this.showPage(this.getActivePageId() === "widgets" ? "feed" : "widgets");
    }
  }

  public destroy(): void {
    unmountShellStyles();
    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
    }
  }
}
