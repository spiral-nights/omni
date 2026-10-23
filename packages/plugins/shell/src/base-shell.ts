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
import { ICONS, icon } from "./icons.js";
import { showIntentEnableToast } from "./permissions-intents-ui.js";
import { unmountShellStyles } from "./styles/loader.js";
import { CURATED_APPS } from "./app-store-catalog.js";

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
  public localWorkspaceUpdatedAt: number = 0;
  public autoSyncNip78: boolean = true;
  protected syncDebounceTimer: any = null;
  public readonly LOCAL_WORKSPACE_KEY = "omni_workspace_state";
  public readonly LOCAL_PLUGIN_BUNDLES_KEY = "omni_installed_plugin_bundles";

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

  // --- Pull Down to Refresh (Mobile Web & PWA) ---
  protected pullToRefreshEl: HTMLElement | null = null;
  protected boundTouchStartHandler: ((e: TouchEvent) => void) | null = null;
  protected boundTouchMoveHandler: ((e: TouchEvent) => void) | null = null;
  protected boundTouchEndHandler: ((e: TouchEvent) => void) | null = null;

  protected initPullToRefresh(): void {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    if (this.pullToRefreshEl) {
      this.destroyPullToRefresh();
    }

    const indicator = document.createElement("div");
    indicator.className = "omni-pull-to-refresh";
    indicator.id = "omni-pull-to-refresh";
    indicator.innerHTML = `
      <div class="omni-pull-indicator-content">
        <span class="omni-pull-icon">${icon("refresh", 16)}</span>
        <span class="omni-pull-label">pull down to refresh</span>
      </div>
    `;
    this.root.appendChild(indicator);
    this.pullToRefreshEl = indicator;

    let startY = 0;
    let startX = 0;
    let isPulling = false;
    let pullDistance = 0;
    const PULL_THRESHOLD = 50;

    const isAtScrollTop = (target: EventTarget | null): boolean => {
      let el = target as HTMLElement | null;
      while (el && el !== document.body && el !== document.documentElement && el !== this.root) {
        if (el.scrollTop > 1) {
          return false;
        }
        el = el.parentElement;
      }
      return true;
    };

    this.boundTouchStartHandler = (e: TouchEvent) => {
      if (!e.touches || e.touches.length !== 1) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
        return;
      }
      if (!isAtScrollTop(target)) {
        return;
      }
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      isPulling = false;
      pullDistance = 0;
    };

    this.boundTouchMoveHandler = (e: TouchEvent) => {
      if (!e.touches || e.touches.length !== 1 || startY === 0) return;
      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      const diffY = currentY - startY;
      const diffX = Math.abs(currentX - startX);

      // If predominantly horizontal, ignore and abort pull to refresh
      if (diffX > Math.abs(diffY)) {
        if (isPulling) {
          this.resetPullIndicator();
          isPulling = false;
        }
        return;
      }

      // If pulling down while at the top of scrollable content
      if (diffY > 10 && isAtScrollTop(e.target)) {
        isPulling = true;
        pullDistance = Math.min(90, diffY * 0.5);
        if (e.cancelable) {
          e.preventDefault();
        }
        this.updatePullIndicator(pullDistance, PULL_THRESHOLD);
      } else if (isPulling && diffY <= 0) {
        this.resetPullIndicator();
        isPulling = false;
      }
    };

    this.boundTouchEndHandler = () => {
      if (isPulling) {
        if (pullDistance >= PULL_THRESHOLD) {
          this.triggerPullRefresh();
        } else {
          this.resetPullIndicator();
        }
      }
      startY = 0;
      startX = 0;
      isPulling = false;
      pullDistance = 0;
    };

    window.addEventListener("touchstart", this.boundTouchStartHandler, { passive: true });
    window.addEventListener("touchmove", this.boundTouchMoveHandler, { passive: false });
    window.addEventListener("touchend", this.boundTouchEndHandler, { passive: true });
    window.addEventListener("touchcancel", this.boundTouchEndHandler, { passive: true });
  }

  protected updatePullIndicator(distance: number, threshold: number): void {
    if (!this.pullToRefreshEl) return;
    const label = this.pullToRefreshEl.querySelector(".omni-pull-label");
    const iconEl = this.pullToRefreshEl.querySelector<HTMLElement>("svg");

    this.pullToRefreshEl.style.transition = "none";
    this.pullToRefreshEl.style.opacity = Math.min(1, distance / 25).toString();
    this.pullToRefreshEl.style.transform = `translate(-50%, ${distance}px)`;

    if (iconEl) {
      iconEl.style.transform = `rotate(${distance * 4.5}deg)`;
    }

    if (label) {
      if (distance >= threshold) {
        label.textContent = "release to refresh";
        this.pullToRefreshEl.classList.add("ready");
      } else {
        label.textContent = "pull down to refresh";
        this.pullToRefreshEl.classList.remove("ready");
      }
    }
  }

  protected resetPullIndicator(): void {
    if (!this.pullToRefreshEl) return;
    this.pullToRefreshEl.style.transition = "transform 0.22s ease, opacity 0.22s ease";
    this.pullToRefreshEl.style.opacity = "0";
    this.pullToRefreshEl.style.transform = "translate(-50%, -100%)";
    this.pullToRefreshEl.classList.remove("ready", "is-refreshing");
  }

  protected triggerPullRefresh(): void {
    if (!this.pullToRefreshEl) return;
    const label = this.pullToRefreshEl.querySelector(".omni-pull-label");
    if (label) label.textContent = "refreshing...";
    this.pullToRefreshEl.classList.add("is-refreshing");
    this.pullToRefreshEl.style.transition = "transform 0.15s ease";
    this.pullToRefreshEl.style.transform = "translate(-50%, 48px)";

    setTimeout(() => {
      this.reloadPage();
    }, 280);
  }

  public reloadPage(): void {
    if (typeof window !== "undefined" && window.location && typeof window.location.reload === "function") {
      try {
        window.location.reload();
      } catch (_) {
        // Navigation not implemented in synthetic test runners
      }
    }
  }

  protected destroyPullToRefresh(): void {
    if (typeof window !== "undefined") {
      if (this.boundTouchStartHandler) window.removeEventListener("touchstart", this.boundTouchStartHandler);
      if (this.boundTouchMoveHandler) window.removeEventListener("touchmove", this.boundTouchMoveHandler);
      if (this.boundTouchEndHandler) {
        window.removeEventListener("touchend", this.boundTouchEndHandler);
        window.removeEventListener("touchcancel", this.boundTouchEndHandler);
      }
    }
    this.boundTouchStartHandler = null;
    this.boundTouchMoveHandler = null;
    this.boundTouchEndHandler = null;
    this.pullToRefreshEl?.remove();
    this.pullToRefreshEl = null;
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
      } else if (event?.action === "view_note" && (event?.data?.eventId || event?.data?.id)) {
        try {
          localStorage.setItem("omni_active_note_id", event.data.eventId || event.data.id);
        } catch (_) {}
      }

      await this.showPage(targetPluginId);
      if (!event?.isRpc) {
        this.kernel.notifyPlugin(targetPluginId, "intent.invoke", {
          action: event.action,
          effectiveAction: event.effectiveAction,
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
              } else if (action === "view_note" && (data?.eventId || data?.id)) {
                try {
                  localStorage.setItem("omni_active_note_id", data.eventId || data.id);
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

  private pendingWidgetMounts = new Set<string>();

  public async ensureWidgetsMounted(): Promise<void> {
    for (const p of this.installedPlugins) {
      if (!p.enabled) continue;
      const placements = this.getPluginPlacements(p);
      for (const pl of placements) {
        if (pl.enabled === false) continue;
        if (pl.viewport === "sidebar" || pl.viewport === "widgets" || pl.viewport === "header-actions") {
          const instanceKey = `${p.id}::${pl.id}`;
          if (this.pendingWidgetMounts.has(instanceKey)) continue;
          const existingSandbox = this.kernel.getSandbox(instanceKey);
          if (existingSandbox) {
            const safePlId = pl.id.replace(/[^a-zA-Z0-9_-]/g, "-");
            const targetContainer = this.getContainerForPluginSlot(p.id, pl.viewport, `${p.id}-${safePlId}`);
            if (targetContainer) {
              const compEl = existingSandbox.getFirstPopulatedComponentContainer();
              if (compEl && !targetContainer.contains(compEl)) {
                this.kernel.reparentLiveComponent(instanceKey, targetContainer);
              }
            }
          } else {
            this.pendingWidgetMounts.add(instanceKey);
            try {
              await this.mountPlugin(p, pl.id);
            } catch (err) {
              console.warn(`Failed to mount widget ${instanceKey}:`, err);
            } finally {
              this.pendingWidgetMounts.delete(instanceKey);
            }
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

  protected getSavedPluginBundles(): Record<string, Partial<InstalledPluginEntry>> {
    try {
      const storage = this.getStorage();
      if (!storage) return {};
      const raw = storage.getItem(this.LOCAL_PLUGIN_BUNDLES_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  protected savePluginBundlesToStorage(): void {
    try {
      const storage = this.getStorage();
      if (!storage) return;
      const existing = this.getSavedPluginBundles();
      const bundles: Record<string, Partial<InstalledPluginEntry>> = {};
      for (const p of this.installedPlugins) {
        if (p.sourceUrl && p.sourceUrl.startsWith("local:@omni/")) continue;
        const prev = existing[p.id] || {};
        bundles[p.id] = {
          id: p.id,
          name: p.name ?? prev.name,
          displayName: p.displayName ?? prev.displayName,
          description: p.description ?? prev.description,
          version: p.version ?? prev.version,
          icon: p.icon ?? prev.icon,
          viewport: p.viewport ?? prev.viewport,
          views: p.views ?? prev.views,
          manifest: p.manifest ?? prev.manifest,
          htmlContent: p.htmlContent ?? prev.htmlContent,
          scriptContent: p.scriptContent || prev.scriptContent || "",
          sourceUrl: p.sourceUrl || prev.sourceUrl || `custom:${p.id}`,
          naddr: p.naddr ?? prev.naddr,
          authorNpub: p.authorNpub ?? prev.authorNpub
        };
      }
      storage.setItem(this.LOCAL_PLUGIN_BUNDLES_KEY, JSON.stringify(bundles));
    } catch (err) {
      console.warn("Failed to persist custom plugin bundles:", err);
    }
  }

  protected async hydrateRemotePluginEntry(entry: InstalledPluginEntry, target: string): Promise<void> {
    const cleanTarget = target.trim().replace(/^nostr:/i, "");
    if (cleanTarget.startsWith("naddr1") || /^\d+:[0-9a-fA-F]{64}:/.test(cleanTarget)) {
      const resolved = await this.kernel.resolveNsitePlugin(cleanTarget);
      if (resolved && resolved.scriptContent) {
        entry.scriptContent = resolved.scriptContent;
        entry.manifest = resolved.manifest || entry.manifest;
        entry.views = resolved.manifest?.views || entry.views;
        entry.naddr = resolved.naddr || entry.naddr;
        entry.authorNpub = resolved.authorNpub || entry.authorNpub;
        this.savePluginBundlesToStorage();
        if (entry.enabled) {
          await this.remountPlugin(entry);
        }
      }
    }
  }

  protected restoreMissingPluginEntry(
    item: OmniWorkspacePluginConfig,
    bundles: Record<string, Partial<InstalledPluginEntry>>
  ): InstalledPluginEntry {
    const bundle = bundles[item.id];
    const curated = CURATED_APPS.find((c) => c.id === item.id);
    const scriptContent = bundle?.scriptContent || bundle?.htmlContent || curated?.htmlContent || "";
    const name = item.name || bundle?.name || curated?.name || item.id;
    const viewport = item.viewport || bundle?.viewport || curated?.viewport || "main";
    const views =
      bundle?.views ||
      curated?.views ||
      (scriptContent ? NostrPluginResolver.detectPluginViews(null, scriptContent) : [{ id: "main", title: name, path: "" }]);

    const entry: InstalledPluginEntry = {
      id: item.id,
      name,
      displayName: item.displayName || bundle?.displayName || name,
      description: item.description ?? bundle?.description ?? curated?.description ?? "",
      version: bundle?.version || curated?.version || "1.0.0",
      icon: item.icon || bundle?.icon || curated?.icon || "widgets",
      viewport,
      route: item.route,
      viewId: item.viewId,
      views,
      placements: item.placements,
      manifest: bundle?.manifest,
      htmlContent: bundle?.htmlContent,
      scriptContent,
      sourceUrl: item.sourceUrl || bundle?.sourceUrl || item.naddr || `custom:${item.id}`,
      enabled: typeof item.enabled === "boolean" ? item.enabled : true,
      pinned: typeof item.pinned === "boolean" ? item.pinned : false,
      relays: Array.isArray(item.relays) ? item.relays : undefined,
      handledIntents: item.handledIntents,
      disabledIntents: item.disabledIntents,
      naddr: item.naddr || bundle?.naddr,
      authorNpub: bundle?.authorNpub
    };

    entry.manifest = this.ensurePluginManifest(entry);
    this.installedPlugins.push(entry);

    if (!entry.scriptContent && (entry.naddr || (entry.sourceUrl && /^https?:\/\//i.test(entry.sourceUrl)))) {
      const target = entry.naddr || entry.sourceUrl;
      this.hydrateRemotePluginEntry(entry, target).catch((err) => {
        console.warn(`Could not hydrate remote plugin ${entry.id} from ${target}:`, err);
      });
    }

    return entry;
  }

  public saveLocalWorkspace(): void {
    try {
      const state = this.exportWorkspaceState();
      this.localWorkspaceUpdatedAt = state.updatedAt;
      const storage = this.getStorage();
      if (storage) {
        storage.setItem(this.LOCAL_WORKSPACE_KEY, JSON.stringify(state));
      }
      this.savePluginBundlesToStorage();
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

    const bundles = this.getSavedPluginBundles();

    for (const item of state.plugins) {
      let plugin = this.installedPlugins.find((p) => p.id === item.id);
      if (!plugin && !(item.sourceUrl && item.sourceUrl.startsWith("local:@omni/"))) {
        plugin = this.restoreMissingPluginEntry(item, bundles);
      }
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
          const mergedState = this.exportWorkspaceState();
          if (typeof state.updatedAt === "number") {
            mergedState.updatedAt = Math.max(mergedState.updatedAt, state.updatedAt);
          }
          if (state.activePage) {
            mergedState.activePage = state.activePage;
          }
          this.localWorkspaceUpdatedAt = mergedState.updatedAt;
          storage.setItem(this.LOCAL_WORKSPACE_KEY, JSON.stringify(mergedState));
          this.savePluginBundlesToStorage();
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
      const bundles = this.getSavedPluginBundles();
      if (saved) {
        const state: OmniWorkspaceState = JSON.parse(saved);
        if (state && typeof state.updatedAt === "number") {
          this.localWorkspaceUpdatedAt = state.updatedAt;
        }
        if (state && state.plugins) {
          for (const item of state.plugins) {
            let plugin = this.installedPlugins.find((p) => p.id === item.id);
            if (!plugin && !(item.sourceUrl && item.sourceUrl.startsWith("local:@omni/"))) {
              plugin = this.restoreMissingPluginEntry(item, bundles);
            }
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
          // Also ensure any persisted custom plugin bundle not listed in state.plugins is restored
          for (const [bundleId, bundle] of Object.entries(bundles)) {
            if (!this.installedPlugins.some((p) => p.id === bundleId)) {
              this.restoreMissingPluginEntry(
                {
                  id: bundleId,
                  viewport: bundle.viewport || "main",
                  name: bundle.name,
                  displayName: bundle.displayName,
                  description: bundle.description,
                  icon: bundle.icon,
                  naddr: bundle.naddr,
                  sourceUrl: bundle.sourceUrl,
                  enabled: true
                },
                bundles
              );
            }
          }
          if (typeof state.autoSync === "boolean") {
            this.autoSyncNip78 = state.autoSync;
          }
          return state;
        }
      } else if (Object.keys(bundles).length > 0) {
        for (const [bundleId, bundle] of Object.entries(bundles)) {
          if (!this.installedPlugins.some((p) => p.id === bundleId)) {
            this.restoreMissingPluginEntry(
              {
                id: bundleId,
                viewport: bundle.viewport || "main",
                name: bundle.name,
                displayName: bundle.displayName,
                description: bundle.description,
                icon: bundle.icon,
                naddr: bundle.naddr,
                sourceUrl: bundle.sourceUrl,
                enabled: true
              },
              bundles
            );
          }
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
      let profile = await this.kernel.getProfile(pubkey);
      if (!profile) {
        this.kernel.fetchRemoteProfile(pubkey, 3500).then((res) => {
          if (res?.metadata) {
            this.updateProfileUi().catch(() => {});
          }
        }).catch(() => {});
      }

      const displayName = profile?.display_name || profile?.name || shortNpub;

      // Update Classic header profile elements
      const classicAvatar = document.getElementById("header-profile-avatar");
      const classicName = document.getElementById("header-profile-name");
      const classicNpub = document.getElementById("header-profile-npub");
      if (classicAvatar) {
        if (profile?.picture) {
          classicAvatar.innerHTML = `<img src="${profile.picture}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" alt="Avatar">`;
        } else {
          classicAvatar.innerHTML = ICONS.user || ICONS.profile;
        }
      }
      if (classicName) classicName.textContent = displayName;
      if (classicNpub) classicNpub.textContent = shortNpub;

      // Update Panorama header profile elements
      const panoAvatar = document.getElementById("panorama-header-avatar");
      const panoName = document.getElementById("panorama-header-name");
      const panoNpub = document.getElementById("panorama-header-npub");
      if (panoAvatar) {
        if (profile?.picture) {
          panoAvatar.innerHTML = `<img src="${profile.picture}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 0px;" alt="Avatar">`;
        } else {
          panoAvatar.innerHTML = ICONS.user || ICONS.profile;
        }
      }
      if (panoName) panoName.textContent = displayName;
      if (panoNpub) panoNpub.textContent = shortNpub;

      // Update Panorama system card elements
      const panoSysAvatar = document.getElementById("panorama-avatar");
      const panoSysName = document.getElementById("panorama-display-name");
      const panoSysNpub = document.getElementById("panorama-npub");
      if (panoSysAvatar) {
        if (profile?.picture) {
          panoSysAvatar.innerHTML = `<img src="${profile.picture}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 0px;" alt="Avatar">`;
        } else {
          panoSysAvatar.innerHTML = ICONS.user || ICONS.profile;
        }
      }
      if (panoSysName) panoSysName.textContent = displayName;
      if (panoSysNpub) panoSysNpub.textContent = shortNpub;

      // Update Editorial header profile elements
      const editorialAvatar = document.getElementById("btn-editorial-profile-toggle");
      if (editorialAvatar) {
        if (profile?.picture) {
          editorialAvatar.innerHTML = `<img src="${profile.picture}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" alt="Avatar">`;
        } else {
          editorialAvatar.innerHTML = `<span>${(displayName || "Ω").slice(0, 1).toUpperCase()}</span>`;
        }
        editorialAvatar.title = `${displayName}\n${npub}`;
      }

      const userBadge = document.getElementById("user-badge");
      if (userBadge) {
        userBadge.title = `${displayName}\n${npub}\nClick to manage profile`;
      }
      const panoUserBtn = document.getElementById("panorama-header-user-btn");
      if (panoUserBtn) {
        panoUserBtn.title = `${displayName}\n${npub}\nClick to manage profile`;
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

  public async installPluginEntry(entry: InstalledPluginEntry): Promise<void> {
    if (this.installedPlugins.some((p) => p.id === entry.id)) {
      throw new Error(`Plugin '${entry.name || entry.id}' is already installed.`);
    }
    const manifest = this.ensurePluginManifest(entry);
    const slotContainers = this.getSlotContainers();
    const targetSlot = entry.viewport || manifest.components?.[0]?.slot || "main";
    const customSlotContainers = new Map(slotContainers);
    const targetContainer = this.getContainerForPluginSlot(entry.id, targetSlot, manifest.components?.[0]?.id);
    if (targetContainer) {
      customSlotContainers.set(targetSlot, targetContainer);
    }
    const placements = this.getPluginPlacements(entry);
    const primaryPlId = placements[0]?.id || `${targetSlot}-primary`;
    await this.kernel.registerPlugin(manifest, entry.scriptContent || "", customSlotContainers, {
      instanceId: `${entry.id}::${primaryPlId}`,
      targetSlot
    });
    this.installedPlugins.push(entry);
    this.onWorkspaceUpdated();
    this.saveLocalWorkspace();
  }

  public async resolveAndInstallNsite(target: string): Promise<InstalledPluginEntry> {
    const trimmed = target.trim();
    let manifest: any = null;
    let scriptContent = "";
    let resolvedNaddr: string | undefined;
    let resolvedAuthorNpub: string | undefined;
    let customViewport: string | undefined;
    let customViews: any[] | undefined;

    // 1. Check if target matches a curated app (by id, name, or htmlContent)
    const curatedMatch = CURATED_APPS.find(
      (c) => c.id === trimmed || c.name.toLowerCase() === trimmed.toLowerCase() || c.htmlContent.trim() === trimmed
    );
    if (curatedMatch) {
      scriptContent = curatedMatch.htmlContent;
      customViewport = curatedMatch.viewport;
      customViews = curatedMatch.views;
      manifest = {
        id: curatedMatch.id,
        name: curatedMatch.name,
        version: curatedMatch.version,
        description: curatedMatch.description,
        icon: curatedMatch.icon,
        entry: "index.html",
        components: [
          {
            id: `${curatedMatch.id}-main`,
            slot: curatedMatch.viewport || "sidebar",
            title: curatedMatch.name
          }
        ],
        views: curatedMatch.views
      };
    } else if (trimmed.startsWith("<") || trimmed.startsWith("<!DOCTYPE") || /<html[\s>]/i.test(trimmed)) {
      scriptContent = trimmed;
      const titleMatch = trimmed.match(/<title>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : "Custom HTML App";
      customViews = NostrPluginResolver.detectPluginViews(null, scriptContent);
      manifest = {
        id: `custom-app-${Date.now()}`,
        name: title,
        version: "1.0.0",
        entry: "index.html",
        components: [{ id: "main", slot: "main", title }],
        views: customViews
      };
    } else if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      const res = await fetch(trimmed);
      const text = await res.text();
      if (text.startsWith("<") || text.startsWith("<!DOCTYPE") || /<html[\s>]/i.test(text)) {
        scriptContent = text;
        const titleMatch = text.match(/<title>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : "Custom nsite";
        manifest = {
          id: `nsite-${Date.now()}`,
          name: title,
          version: "1.0.0",
          entry: "index.html",
          components: [{ id: "main", slot: "main", title }]
        };
      } else {
        manifest = JSON.parse(text);
        if (typeof manifest.script === "string" && !scriptContent) {
          scriptContent = manifest.script;
        }
      }
    } else if (trimmed.startsWith("naddr1") || trimmed.startsWith("nostr:naddr1") || /^\d+:[0-9a-fA-F]{64}:/.test(trimmed)) {
      const cleanTarget = trimmed.replace(/^nostr:/i, "");
      const resolved = await this.kernel.resolveNsitePlugin(cleanTarget);
      manifest = resolved.manifest;
      scriptContent = resolved.scriptContent;
      resolvedNaddr = resolved.naddr;
      resolvedAuthorNpub = resolved.authorNpub;
    } else {
      manifest = JSON.parse(trimmed);
      if (typeof manifest.script === "string" && !scriptContent) {
        scriptContent = manifest.script;
      }
    }

    if (!manifest.id || !manifest.name) {
      throw new Error("Invalid manifest: 'id' and 'name' are required.");
    }

    // If re-installing an already-installed nsite (e.g. updating from Plugin Studio), replace cleanly
    if (this.installedPlugins.some((p) => p.id === manifest.id) && resolvedNaddr) {
      this.uninstallPlugin(manifest.id);
    }

    const entry: InstalledPluginEntry = {
      id: manifest.id,
      name: manifest.name,
      displayName: manifest.displayName || manifest.name,
      version: manifest.version || "1.0.0",
      description: manifest.description || "",
      icon: manifest.icon || "widgets",
      viewport: customViewport || manifest.components?.[0]?.slot || "main",
      views: customViews || manifest.views || [{ id: "main", title: manifest.name, path: "" }],
      manifest,
      scriptContent,
      sourceUrl: resolvedNaddr || (trimmed.startsWith("http") ? trimmed : `custom:${manifest.id}`),
      enabled: true,
      pinned: false,
      naddr: resolvedNaddr,
      authorNpub: resolvedAuthorNpub
    };

    await this.installPluginEntry(entry);
    return entry;
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

    const isPanorama = this.getShellType() === "panorama" || (typeof document !== "undefined" && document.body.classList.contains("theme-panorama"));

    const box = document.createElement("div");
    box.className = "default-applications-box";
    box.style.cssText = isPanorama
      ? "display: flex; flex-direction: column; gap: 10px; background: #111; padding: 14px; border: 1px solid #1e1e1e; margin-top: 14px; box-sizing: border-box;"
      : "display: flex; flex-direction: column; gap: 10px; background: var(--omni-bg-surface, #191816); padding: 14px; border: 1px solid var(--omni-border-subtle, #2d2b27); border-radius: var(--omni-radius-sm, 6px); margin-top: 14px; box-sizing: border-box;";

    box.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong style="font-size: 0.85rem; font-weight: 600; color: ${isPanorama ? "#fff" : "var(--omni-text-primary, #ede8df)"};">Default Applications</strong>
        <span style="font-size: 0.7rem; color: ${isPanorama ? "#888" : "var(--omni-text-muted, #6b665f)"};">Intent Routing</span>
      </div>
      <p style="font-size: 0.72rem; color: ${isPanorama ? "#888" : "var(--omni-text-muted, #6b665f)"}; margin: 0;">
        Assign default applications to handle common actions across plugins without prompting every time.
      </p>
    `;

    const standardActions: Array<{
      action: string;
      aliases?: string[];
      label: string;
      desc: string;
    }> = [
      {
        action: "compose_note",
        aliases: ["create_note"],
        label: "Compose Note",
        desc: "Create and publish new short notes, posts, or thread replies."
      },
      {
        action: "view_note",
        label: "View Note & Thread",
        desc: "Inspect notes, discussions, and conversation trees."
      },
      {
        action: "view_profile",
        label: "View Profile",
        desc: "Open user identity profiles, contacts, and metadata."
      },
      {
        action: "share",
        label: "Web Share Target",
        desc: "Receive text and links forwarded from other apps or external shares."
      },
      {
        action: "pay_invoice",
        label: "Lightning Payment",
        desc: "Handle lightning: invoices and Cashu payment requests."
      },
      {
        action: "search",
        label: "Search",
        desc: "Search notes, events, profiles, and keywords across relays."
      }
    ];

    const grid = document.createElement("div");
    grid.className = "default-applications-grid";
    grid.style.cssText = "display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; margin-top: 6px;";

    for (const sa of standardActions) {
      const allActions = [sa.action, ...(sa.aliases || [])];
      const candidates = this.installedPlugins.filter((p) =>
        allActions.some((act) =>
          (p.handledIntents || []).includes(act) ||
          this.kernel.intentBroker.getHandlers(act).some((h) => h.pluginId === p.id)
        )
      );

      const card = document.createElement("div");
      card.className = "default-app-card";
      card.style.cssText = isPanorama
        ? "display: flex; flex-direction: column; gap: 6px; background: #0c0c0c; padding: 10px 12px; border: 1px solid #1e1e1e; box-sizing: border-box;"
        : "display: flex; flex-direction: column; gap: 6px; background: var(--omni-bg-canvas, #141312); padding: 10px 12px; border: 1px solid var(--omni-border-subtle, #2d2b27); border-radius: var(--omni-radius-sm, 4px); box-sizing: border-box;";

      const topRow = document.createElement("div");
      topRow.style.cssText = "display: flex; align-items: center; justify-content: space-between; gap: 8px;";

      const titleLabel = document.createElement("span");
      titleLabel.style.cssText = `font-size: 0.78rem; font-weight: 600; color: ${isPanorama ? "#fff" : "var(--omni-text-primary, #ede8df)"};`;
      titleLabel.textContent = sa.label;
      topRow.appendChild(titleLabel);

      const btnInfo = document.createElement("button");
      btnInfo.type = "button";
      btnInfo.className = "btn-default-app-info";
      btnInfo.style.cssText = "background: transparent; border: none; color: #888; font-size: 0.72rem; cursor: pointer; padding: 2px 6px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; width: 22px; height: 22px;";
      btnInfo.title = "Explain action";
      btnInfo.innerHTML = "ⓘ";
      topRow.appendChild(btnInfo);
      card.appendChild(topRow);

      const descBox = document.createElement("div");
      descBox.className = "default-app-desc";
      descBox.style.cssText = isPanorama
        ? "display: none; font-size: 0.7rem; color: #999; padding: 4px 6px 2px 0; border-top: 1px dashed #262626;"
        : "display: none; font-size: 0.7rem; color: var(--omni-text-muted, #6b665f); padding: 4px 6px 2px 0; border-top: 1px dashed var(--omni-border-subtle, #2d2b27);";
      descBox.innerHTML = `
        <div>${sa.desc}</div>
        <div style="margin-top: 2px;"><code style="font-size: 0.65rem; color: ${isPanorama ? "var(--omni-accent-primary, #00a4ef)" : "var(--omni-accent-primary, #d4a373)"};">${sa.action}${sa.aliases ? ` (${sa.aliases.join(", ")})` : ""}</code></div>
      `;
      card.appendChild(descBox);

      btnInfo.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = descBox.style.display !== "none";
        descBox.style.display = isOpen ? "none" : "block";
        btnInfo.style.color = isOpen ? "#888" : (isPanorama ? "var(--omni-accent-primary, #00a4ef)" : "var(--omni-accent-primary, #d4a373)");
      });

      const select = document.createElement("select");
      select.className = "default-app-select";
      select.style.cssText = isPanorama
        ? "background: #191919; border: 1px solid #333; color: #fff; font-size: 0.75rem; padding: 6px 8px; outline: none; cursor: pointer; width: 100%; height: 32px; box-sizing: border-box;"
        : "background: var(--omni-bg-subtle, #22201d); border: 1px solid var(--omni-border-strong, #3a3732); color: var(--omni-text-primary, #ede8df); font-size: 0.75rem; padding: 6px 8px; border-radius: var(--omni-radius-sm, 4px); outline: none; cursor: pointer; width: 100%; height: 32px; box-sizing: border-box;";

      const optNone = document.createElement("option");
      optNone.value = "";
      optNone.textContent = candidates.length > 0 ? "Prompt every time (None)" : "No apps available";
      select.appendChild(optNone);

      for (const cand of candidates) {
        const meta = this.getPluginMeta(cand);
        const opt = document.createElement("option");
        opt.value = cand.id;
        opt.textContent = meta.name;
        select.appendChild(opt);
      }

      let currentDefault = this.kernel.intentBroker.getDefaultHandler(sa.action);
      if (!currentDefault && sa.aliases) {
        for (const alias of sa.aliases) {
          currentDefault = this.kernel.intentBroker.getDefaultHandler(alias);
          if (currentDefault) break;
        }
      }
      if (currentDefault) {
        select.value = currentDefault;
      }

      select.addEventListener("change", () => {
        const val = select.value;
        if (!val) {
          this.kernel.intentBroker.clearDefaultHandler(sa.action);
          if (sa.aliases) {
            for (const alias of sa.aliases) {
              this.kernel.intentBroker.clearDefaultHandler(alias);
            }
          }
        } else {
          this.kernel.intentBroker.setDefaultHandler(sa.action, val);
          if (sa.aliases) {
            for (const alias of sa.aliases) {
              this.kernel.intentBroker.setDefaultHandler(alias, val);
            }
          }
        }
        this.saveLocalWorkspace();
      });

      card.appendChild(select);
      grid.appendChild(card);
    }

    box.appendChild(grid);
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
    const cleanTarget = uri.trim().replace(/^nostr:/i, "");
    if (cleanTarget.startsWith("naddr1")) {
      try {
        const decoded = WebCryptoKeystore.decodeNaddr(cleanTarget);
        if (!decoded.kind || decoded.kind === 35129) {
          const installed = await this.resolveAndInstallNsite(cleanTarget);
          this.showPage(installed.id);
          return { handled: true, uri, handlerId: installed.id, installed: true };
        }
      } catch {
        // Fall through to standard Open With chooser
      }
    }

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
    this.destroyPullToRefresh();
    this.pendingWidgetMounts.clear();
    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
    }
  }
}
