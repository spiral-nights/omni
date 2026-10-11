import { OmniKernel, WebCryptoKeystore, STANDARD_SLOTS, NostrPluginResolver } from "@omni/core";
import { OmniWorkspaceState, OmniWorkspacePluginConfig, OMNI_WORKSPACE_D_TAG, NostrEvent, PluginViewDeclaration } from "@omni/types";
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
  manifest?: any;
  htmlContent?: string;
  scriptContent: string;
  sourceUrl: string;
  enabled: boolean;
  naddr?: string;
  authorNpub?: string;
  event?: any;
}

export type AppPage = "feed" | "widgets" | string;
export type SettingsTab = "profile" | "relays" | "plugins";

export interface OmniShellOptions {
  root: HTMLElement;
  kernel: OmniKernel;
  installedPlugins?: InstalledPluginEntry[];
}

export class OmniShell {
  private root: HTMLElement;
  private kernel: OmniKernel;
  public installedPlugins: InstalledPluginEntry[];
  private slotContainers: Map<string, Element> = new Map();

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
  private dockBtnWidgets!: HTMLElement;
  private dockBtnSettings!: HTMLElement;

  // Settings modal elements
  private settingsModal!: HTMLElement;
  private settingsNavBtns!: Record<SettingsTab, HTMLElement>;
  private settingsPanes!: Record<SettingsTab, HTMLElement>;

  // Inspector & Install modals
  private pluginInspectorModal!: HTMLElement;
  private installPluginModal!: HTMLElement;
  private activeInspectedPlugin: InstalledPluginEntry | null = null;

  constructor(options: OmniShellOptions) {
    this.root = options.root;
    this.kernel = options.kernel;
    this.installedPlugins = options.installedPlugins ? [...options.installedPlugins] : [];
  }

  public getPluginMeta(p: InstalledPluginEntry): {
    id: string;
    name: string;
    version: string;
    description: string;
    icon: string;
    viewport: string;
  } {
    const primaryCompId = p.manifest?.components?.[0]?.id || `${p.id}-main`;
    const layoutSlot = this.kernel?.layoutManager?.getSlotForComponent(p.id, primaryCompId);
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

  // --- NIP-78 Workspace State Export & Import ---

  public exportWorkspaceState(): OmniWorkspaceState {
    return {
      version: 1,
      updatedAt: Date.now(),
      activePage: this.getActivePageId(),
      autoSync: this.autoSyncNip78,
      plugins: this.installedPlugins.map((p) => {
        const meta = this.getPluginMeta(p);
        return {
          id: p.id,
          viewport: meta.viewport,
          route: p.route,
          viewId: p.viewId,
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

  public applyWorkspaceState(state: OmniWorkspaceState, persistLocal = true): void {
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
        if (item.route !== undefined) {
          plugin.route = item.route;
        }
        if (item.viewId !== undefined) {
          plugin.viewId = item.viewId;
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
                this.showPage("widgets");
              }
              pageEl.remove();
            }
          }
        }
      }
    }

    if (state.activePage && state.activePage !== this.getActivePageId()) {
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
    if (this.pageWidgets?.classList.contains("active")) {
      return "widgets";
    }
    const mainVp = this.mainViewport || this.root.querySelector(".main-viewport");
    const activeEl = mainVp?.querySelector<HTMLElement>(".app-page.active");
    if (activeEl) {
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

      // Primary applications in "main" or items assigned to "dock" ("Navigation Dock Shortcut")
      // get a dedicated navigation dock launcher button.
      // Modular companion widgets ("sidebar") live inside the Widgets & Tools Dashboard (#page-widgets).
      if (meta.viewport !== "main" && meta.viewport !== "dock") continue;

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
    this.dockBtnWidgets?.classList.remove("active");

    if (page === "widgets") {
      this.pageWidgets.classList.add("active");
      this.dockBtnWidgets?.classList.add("active");
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
    if (slot === "sidebar" || slot === "widgets") {
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

  public openSettings(tab: SettingsTab | "layout" = "profile"): void {
    this.switchSettingsTab(tab);
    this.settingsModal.classList.add("open");
  }

  public closeSettings(): void {
    this.settingsModal.classList.remove("open");
  }

  private switchSettingsTab(tab: SettingsTab | "layout"): void {
    const targetTab: SettingsTab = tab === "layout" ? "plugins" : tab;
    for (const [key, btn] of Object.entries(this.settingsNavBtns)) {
      btn?.classList.toggle("active", key === targetTab);
    }
    for (const [key, pane] of Object.entries(this.settingsPanes)) {
      pane?.classList.toggle("active", key === targetTab);
    }

    if (targetTab === "profile") {
      this.updateProfileUi();
    } else if (targetTab === "relays") {
      this.renderSettingsRelays();
    } else if (targetTab === "plugins") {
      this.renderPluginManager();
    }
  }

  public async updateProfileUi(): Promise<void> {
    const pubkey = await this.kernel.getUserPubkey();
    const npub = await this.kernel.getNpub();
    const shortNpub = `${npub.slice(0, 10)}...${npub.slice(-4)}`;

    const profileKeysNpub = document.getElementById("profile-keys-npub") as HTMLInputElement | null;
    const profileKeysHex = document.getElementById("profile-keys-hex") as HTMLInputElement | null;
    const profilePreviewNpub = document.getElementById("profile-preview-npub");
    const profilePreviewName = document.getElementById("profile-preview-name");
    const profileAvatarPreview = document.getElementById("profile-avatar-preview");
    const userBadge = document.getElementById("user-badge");

    if (profileKeysNpub) profileKeysNpub.value = npub;
    if (profileKeysHex) profileKeysHex.value = pubkey;
    if (profilePreviewNpub) profilePreviewNpub.textContent = shortNpub;

    const profile = await this.kernel.getProfile(pubkey);
    const inputDisplayName = document.getElementById("input-profile-display-name") as HTMLInputElement | null;
    const inputName = document.getElementById("input-profile-name") as HTMLInputElement | null;
    const inputAbout = document.getElementById("input-profile-about") as HTMLTextAreaElement | null;
    const inputPicture = document.getElementById("input-profile-picture") as HTMLInputElement | null;
    const inputNip05 = document.getElementById("input-profile-nip05") as HTMLInputElement | null;
    const inputLud16 = document.getElementById("input-profile-lud16") as HTMLInputElement | null;

    if (profile) {
      if (inputDisplayName) inputDisplayName.value = profile.display_name || "";
      if (inputName) inputName.value = profile.name || "";
      if (inputAbout) inputAbout.value = profile.about || "";
      if (inputPicture) inputPicture.value = profile.picture || "";
      if (inputNip05) inputNip05.value = profile.nip05 || "";
      if (inputLud16) inputLud16.value = profile.lud16 || "";

      const displayName = profile.display_name || profile.name || shortNpub;
      if (userBadge) {
        userBadge.textContent = displayName;
        userBadge.title = `${displayName}\n${npub}\nClick to manage profile & keys`;
      }
      if (profilePreviewName) profilePreviewName.textContent = profile.display_name || profile.name || "Guest User";

      if (profile.picture && profileAvatarPreview) {
        profileAvatarPreview.innerHTML = `<img src="${encodeURI(profile.picture)}" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.remove()" />`;
      } else if (profileAvatarPreview) {
        profileAvatarPreview.textContent = "✦";
      }
    } else {
      if (inputDisplayName) inputDisplayName.value = "";
      if (inputName) inputName.value = "";
      if (inputAbout) inputAbout.value = "";
      if (inputPicture) inputPicture.value = "";
      if (inputNip05) inputNip05.value = "";
      if (inputLud16) inputLud16.value = "";
      if (userBadge) {
        userBadge.textContent = shortNpub;
        userBadge.title = `Your Nostr Identity: ${npub}\nClick to manage profile & keys`;
      }
      if (profilePreviewName) profilePreviewName.textContent = "Guest User";
      if (profileAvatarPreview) profileAvatarPreview.textContent = "✦";
    }
  }



  // --- Relays Pool Manager UI ---
  private renderSettingsRelays(): void {
    const list = document.getElementById("settings-relays-list");
    const badge = document.getElementById("relays-status-badge");
    if (!list) return;
    list.innerHTML = "";

    const relays = this.kernel.relayPool.getAllRelays();
    const connectedCount = relays.filter((r) => r.status === "connected").length;

    if (badge) {
      badge.textContent = `${connectedCount} / ${relays.length} Connected`;
      badge.style.color = connectedCount > 0 ? "var(--omni-status-online)" : "var(--omni-text-muted)";
    }

    if (relays.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText =
        "font-size: 0.78rem; color: var(--omni-text-muted); font-style: italic; padding: 16px; text-align: center;";
      empty.textContent = "No relays connected. Add one above or select a preset.";
      list.appendChild(empty);
      return;
    }

    for (const r of relays) {
      const row = document.createElement("div");
      row.style.cssText =
        "display: flex; justify-content: space-between; align-items: center; background: var(--omni-bg-surface); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-sm); padding: 8px 12px; gap: 10px;";

      const left = document.createElement("div");
      left.style.cssText = "display: flex; align-items: center; gap: 8px; overflow: hidden; min-width: 0;";

      const dot = document.createElement("span");
      const dotColor =
        r.status === "connected"
          ? "var(--omni-status-online)"
          : r.status === "connecting"
          ? "#f59e0b"
          : "var(--omni-status-offline)";
      dot.style.cssText = `width: 8px; height: 8px; border-radius: 50%; background: ${dotColor}; flex-shrink: 0;`;

      const urlSpan = document.createElement("span");
      urlSpan.style.cssText =
        "font-family: var(--omni-font-mono); font-size: 0.78rem; color: var(--omni-text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;";
      urlSpan.textContent = r.url;

      const statusPill = document.createElement("span");
      statusPill.style.cssText =
        "font-size: 0.68rem; color: var(--omni-text-muted); text-transform: capitalize; flex-shrink: 0;";
      statusPill.textContent = r.status;

      left.appendChild(dot);
      left.appendChild(urlSpan);
      left.appendChild(statusPill);

      const btnRemove = document.createElement("button");
      btnRemove.className = "btn-secondary";
      btnRemove.style.cssText = "font-size: 0.72rem; padding: 3px 8px; color: #f87171; flex-shrink: 0;";
      btnRemove.textContent = "Disconnect";
      btnRemove.addEventListener("click", () => {
        this.kernel.relayPool.removeRelay(r.url);
        this.renderSettingsRelays();
      });

      row.appendChild(left);
      row.appendChild(btnRemove);
      list.appendChild(row);
    }
  }

  // --- Installed Plugins Manager UI ---
  public renderPluginManager(): void {
    const container = document.getElementById("plugins-list");
    const countBadge = document.getElementById("plugins-count-badge");
    if (!container) return;
    container.innerHTML = "";
    if (countBadge) countBadge.textContent = String(this.installedPlugins.length);

    for (const p of this.installedPlugins) {
      const card = document.createElement("div");
      card.className = "plugin-item-row";

      const meta = this.getPluginMeta(p);
      const synthManifest = this.ensurePluginManifest(p);

      const topRow = document.createElement("div");
      topRow.style.display = "flex";
      topRow.style.justifyContent = "space-between";
      topRow.style.alignItems = "flex-start";

      const titleGroup = document.createElement("div");
      titleGroup.style.display = "flex";
      titleGroup.style.flexDirection = "column";
      titleGroup.style.gap = "4px";

      const titleLine = document.createElement("div");
      titleLine.style.display = "flex";
      titleLine.style.alignItems = "center";
      titleLine.style.gap = "8px";
      titleLine.style.flexWrap = "wrap";

      let iconSvg = "";
      if (meta.icon && ICONS[meta.icon as IconName]) {
        iconSvg = icon(meta.icon as IconName, 18);
      } else {
        iconSvg = icon("plugins", 18);
      }
      const iconWrap = document.createElement("div");
      iconWrap.style.cssText = "display: flex; align-items: center; justify-content: center; color: var(--omni-accent-primary);";
      iconWrap.innerHTML = iconSvg;

      const title = document.createElement("strong");
      title.style.fontSize = "0.95rem";
      title.textContent = meta.name;

      const version = document.createElement("span");
      version.style.fontSize = "0.72rem";
      version.style.color = "var(--omni-text-muted)";
      version.textContent = `v${meta.version}`;

      const statusBadge = document.createElement("span");
      statusBadge.style.fontSize = "0.7rem";
      statusBadge.style.color = p.enabled ? "var(--omni-status-online)" : "var(--omni-text-muted)";
      statusBadge.style.background = "var(--omni-bg-subtle)";
      statusBadge.style.padding = "1px 6px";
      statusBadge.style.borderRadius = "var(--omni-radius-pill)";
      statusBadge.textContent = p.enabled ? "Active" : "Disabled";

      const roleBadge = document.createElement("span");
      roleBadge.style.cssText =
        "font-size: 0.68rem; font-weight: 500; padding: 2px 7px; border-radius: var(--omni-radius-pill); border: 1px solid var(--omni-border-subtle); background: var(--omni-bg-subtle);";
      if (meta.viewport === "main") {
        roleBadge.style.color = "var(--omni-accent-primary)";
        roleBadge.style.borderColor = "var(--omni-accent-primary)";
        roleBadge.textContent = "Full-Page App";
      } else if (meta.viewport === "dock") {
        roleBadge.style.color = "var(--omni-text-primary)";
        roleBadge.style.borderColor = "var(--omni-border-strong)";
        roleBadge.textContent = "Dock Shortcut";
      } else if (meta.viewport === "sidebar") {
        roleBadge.style.color = "var(--omni-text-secondary)";
        roleBadge.textContent = "Widgets Dashboard";
      } else if (meta.viewport === "header-actions") {
        roleBadge.style.color = "var(--omni-text-secondary)";
        roleBadge.textContent = "Header Action";
      } else {
        roleBadge.textContent = meta.viewport;
      }

      titleLine.appendChild(iconWrap);
      titleLine.appendChild(title);
      titleLine.appendChild(version);
      titleLine.appendChild(statusBadge);
      titleLine.appendChild(roleBadge);

      const sourcePill = document.createElement("div");
      sourcePill.style.fontSize = "0.72rem";
      sourcePill.style.fontFamily = "var(--omni-font-mono)";
      sourcePill.style.color = "var(--omni-text-muted)";
      sourcePill.textContent = p.sourceUrl;

      titleGroup.appendChild(titleLine);
      titleGroup.appendChild(sourcePill);

      const toggleLabel = document.createElement("label");
      toggleLabel.className = "omni-toggle";
      toggleLabel.title = p.enabled ? "Click to disable plugin" : "Click to enable plugin";

      const toggleInput = document.createElement("input");
      toggleInput.type = "checkbox";
      toggleInput.checked = p.enabled;
      toggleInput.addEventListener("change", async () => {
        if (toggleInput.checked) {
          await this.kernel.enablePlugin(synthManifest, p.htmlContent || p.scriptContent, this.slotContainers);
          p.enabled = true;
        } else {
          this.kernel.disablePlugin(p.id);
          p.enabled = false;
        }
        this.renderDockLaunchers();
        this.renderPluginManager();
      });

      const toggleSlider = document.createElement("span");
      toggleSlider.className = "toggle-slider";
      toggleLabel.appendChild(toggleInput);
      toggleLabel.appendChild(toggleSlider);

      topRow.appendChild(titleGroup);
      topRow.appendChild(toggleLabel);

      const desc = document.createElement("div");
      desc.style.fontSize = "0.82rem";
      desc.style.color = "var(--omni-text-secondary)";
      desc.textContent = meta.description || "No description provided.";

      const actionsRow = document.createElement("div");
      actionsRow.style.display = "flex";
      actionsRow.style.gap = "8px";
      actionsRow.style.marginTop = "4px";

      const btnInspect = document.createElement("button");
      btnInspect.className = "btn-secondary";
      btnInspect.textContent = "Inspect Plugin";
      btnInspect.addEventListener("click", () => {
        this.openPluginInspector(p);
      });

      const btnClearDb = document.createElement("button");
      btnClearDb.className = "btn-secondary";
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
      btnUninstall.textContent = "Uninstall";
      btnUninstall.addEventListener("click", () => {
        if (confirm(`Uninstall ${meta.name}? Its components and storage will be removed.`)) {
          this.uninstallPlugin(p.id);
        }
      });

      actionsRow.appendChild(btnInspect);
      actionsRow.appendChild(btnClearDb);
      actionsRow.appendChild(btnUninstall);

      // User-Defined Viewport Assignment Selector
      const viewportRow = document.createElement("div");
      viewportRow.style.cssText =
        "display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 6px; padding: 6px 10px; background: var(--omni-bg-subtle); border-radius: var(--omni-radius-sm); font-size: 0.75rem;";

      const vpLabelGroup = document.createElement("div");
      vpLabelGroup.style.cssText = "display: flex; flex-direction: column; gap: 1px;";
      vpLabelGroup.innerHTML = `
        <span style="font-weight: 600; color: var(--omni-text-primary);">Navigation Viewport:</span>
        <span style="font-size: 0.68rem; color: var(--omni-text-muted);">Choose where this app or widget appears</span>
      `;

      const vpSelect = document.createElement("select");
      vpSelect.className = "plugin-viewport-select";
      vpSelect.style.cssText =
        "background: var(--omni-bg-surface); border: 1px solid var(--omni-border-strong); color: var(--omni-text-primary); font-size: 0.72rem; padding: 3px 6px; border-radius: var(--omni-radius-sm); outline: none; cursor: pointer;";

      const primaryComp = synthManifest.components?.[0];
      const currentSlot = primaryComp
        ? (this.kernel.layoutManager.getSlotForComponent(p.id, primaryComp.id) || primaryComp.slot)
        : "main";

      const viewportOptions = [
        { id: "main", label: "Full-Page App (Center Viewport)" },
        { id: "dock", label: "Navigation Dock Shortcut" },
        { id: "sidebar", label: "Workspace Widget (Widgets Dashboard)" },
        { id: "header-actions", label: "Header Quick Action" }
      ];

      for (const optDef of viewportOptions) {
        const opt = document.createElement("option");
        opt.value = optDef.id;
        opt.textContent = optDef.label;
        if (optDef.id === currentSlot) opt.selected = true;
        vpSelect.appendChild(opt);
      }

      vpSelect.addEventListener("change", () => {
        const targetSlotId = vpSelect.value;
        const targetContainer = this.getContainerForPluginSlot(p.id, targetSlotId, primaryComp?.id);
        if (targetContainer && primaryComp) {
          this.kernel.reparentPluginComponent(p.id, primaryComp.id, targetSlotId, targetContainer);
          p.viewport = targetSlotId;
          if (targetSlotId !== "main" && targetSlotId !== "dock" && p.id !== "org.omni.plugin.feed") {
            const safeId = p.id.replace(/[^a-zA-Z0-9_-]/g, "-");
            const pageEl = document.getElementById(`page-app-${safeId}`);
            if (pageEl) {
              if (pageEl.classList.contains("active")) {
                this.showPage("widgets");
              }
              pageEl.remove();
            }
          }
          this.renderDockLaunchers();
          this.renderPluginManager();
          this.saveLocalWorkspace();
        }
      });

      viewportRow.appendChild(vpLabelGroup);
      viewportRow.appendChild(vpSelect);

      // Route / Sub-View Assignment Selector
      const routeRow = document.createElement("div");
      routeRow.style.cssText =
        "display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 4px; padding: 6px 10px; background: var(--omni-bg-subtle); border-radius: var(--omni-radius-sm); font-size: 0.75rem;";

      const routeLabelGroup = document.createElement("div");
      routeLabelGroup.style.cssText = "display: flex; flex-direction: column; gap: 1px;";
      routeLabelGroup.innerHTML = `
        <span style="font-weight: 600; color: var(--omni-text-primary);">Assigned Route:</span>
        <span style="font-size: 0.68rem; color: var(--omni-text-muted);">Choose which sub-view this area runs</span>
      `;

      const routeSelect = document.createElement("select");
      routeSelect.className = "plugin-route-select";
      routeSelect.style.cssText =
        "background: var(--omni-bg-surface); border: 1px solid var(--omni-border-strong); color: var(--omni-text-primary); font-size: 0.72rem; padding: 3px 6px; border-radius: var(--omni-radius-sm); outline: none; cursor: pointer;";

      const pluginViews = (synthManifest.views && synthManifest.views.length > 0)
        ? synthManifest.views
        : (p.views && p.views.length > 0)
        ? p.views
        : [{ id: "main", title: "Main App", path: "" }];

      for (const v of pluginViews) {
        const opt = document.createElement("option");
        opt.value = v.path;
        opt.textContent = `${v.title} (${v.path || "/"})`;
        if ((p.route !== undefined && p.route === v.path) || (!p.route && v.id === "main")) {
          opt.selected = true;
        }
        routeSelect.appendChild(opt);
      }

      routeSelect.addEventListener("change", async () => {
        p.route = routeSelect.value;
        const matchedView = pluginViews.find((v: any) => v.path === routeSelect.value);
        p.viewId = matchedView?.id || "main";
        if (p.enabled) {
          await this.kernel.enablePlugin(synthManifest, p.htmlContent || p.scriptContent, this.slotContainers, {
            route: p.route,
            viewId: p.viewId
          });
        }
        this.saveLocalWorkspace();
      });

      routeRow.appendChild(routeLabelGroup);
      routeRow.appendChild(routeSelect);

      // Dedicated Per-Plugin Settings Section
      const safeId = p.id.replace(/[^a-zA-Z0-9_-]/g, "-");
      const settingsBox = document.createElement("div");
      settingsBox.className = "plugin-settings-box";
      settingsBox.style.cssText =
        "margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--omni-border-subtle); display: flex; flex-direction: column; gap: 6px;";

      const settingsHeader = document.createElement("div");
      settingsHeader.style.cssText =
        "display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px;";

      const settingsTitle = document.createElement("span");
      settingsTitle.style.cssText = "font-weight: 600; font-size: 0.78rem; color: var(--omni-text-primary);";
      settingsTitle.textContent = "Plugin Settings";

      const settingsView = pluginViews.find((v: any) => v.id === "settings" || v.path.includes("settings"));

      const mountContainer = document.createElement("div");
      mountContainer.id = `plugin-settings-mount-${safeId}`;
      mountContainer.className = "plugin-settings-mount-container";
      mountContainer.style.cssText =
        "display: none; margin-top: 6px; padding: 10px; background: var(--omni-bg-surface); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-sm);";

      if (settingsView) {
        const btnToggleSettings = document.createElement("button");
        btnToggleSettings.className = "btn-secondary btn-plugin-settings";
        btnToggleSettings.style.cssText = "font-size: 0.72rem; padding: 2px 8px;";
        btnToggleSettings.textContent = "Open Settings Panel";

        let isSettingsMounted = false;
        btnToggleSettings.addEventListener("click", async () => {
          if (!isSettingsMounted) {
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
              isSettingsMounted = true;
            } catch (err) {
              console.error(`Failed to mount settings for ${p.id}:`, err);
              mountContainer.textContent = "Failed to load settings.";
              btnToggleSettings.textContent = "Open Settings Panel";
            }
          } else {
            this.kernel.destroyPluginSettings(p.id);
            mountContainer.style.display = "none";
            mountContainer.innerHTML = "";
            btnToggleSettings.textContent = "Open Settings Panel";
            isSettingsMounted = false;
          }
        });

        settingsHeader.appendChild(settingsTitle);
        settingsHeader.appendChild(btnToggleSettings);
        settingsBox.appendChild(settingsHeader);
        settingsBox.appendChild(mountContainer);
      } else {
        const noSettingsNote = document.createElement("div");
        noSettingsNote.style.cssText = "font-size: 0.72rem; color: var(--omni-text-muted);";
        noSettingsNote.innerHTML = `No custom settings route declared. <span style="opacity: 0.8;">(Conventions: tag <code>["view", "settings"]</code> or <code>&lt;link rel="alternate" href="?view=settings" title="Settings"&gt;</code>)</span>`;

        settingsHeader.appendChild(settingsTitle);
        settingsBox.appendChild(settingsHeader);
        settingsBox.appendChild(noSettingsNote);
      }

      card.appendChild(topRow);
      card.appendChild(desc);
      card.appendChild(viewportRow);
      card.appendChild(routeRow);
      card.appendChild(actionsRow);
      card.appendChild(settingsBox);

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
    this.renderPluginManager();
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

    // Components
    if (compList) {
      compList.innerHTML = "";
      for (const comp of synthManifest.components || []) {
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
        left.innerHTML = `<strong>${comp.title || comp.id}</strong> <span style="color: var(--omni-text-muted); font-size: 0.72rem;">(${comp.id})</span>`;

        const slotPill = document.createElement("span");
        slotPill.style.background = "var(--omni-bg-subtle)";
        slotPill.style.color = "var(--omni-accent-primary)";
        slotPill.style.padding = "2px 8px";
        slotPill.style.borderRadius = "var(--omni-radius-pill)";
        slotPill.style.fontFamily = "var(--omni-font-mono)";
        slotPill.style.fontSize = "0.72rem";
        slotPill.textContent = `slot: ${comp.slot}`;

        item.appendChild(left);
        item.appendChild(slotPill);
        compList.appendChild(item);
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

    if (rawPre) rawPre.textContent = JSON.stringify(synthManifest, null, 2);

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

          <!-- Page 2: Dedicated Full Widgets Dashboard -->
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
            <nav class="settings-nav">
              <button class="settings-nav-btn active" id="settings-tab-btn-profile" data-tab="profile">
                ${icon("user", 16)}
                <span>Profile & Keys</span>
              </button>
              <button class="settings-nav-btn" id="settings-tab-btn-relays" data-tab="relays">
                ${icon("relay", 16)}
                <span>Connected Relays</span>
              </button>
              <button class="settings-nav-btn" id="settings-tab-btn-plugins" data-tab="plugins">
                ${icon("plugins", 16)}
                <span>Plugins & Viewports</span>
              </button>
            </nav>

            <div class="settings-content">
              <!-- Pane 1: Profile & Keys -->
              <div class="settings-pane active" id="settings-pane-profile">
                <div class="modal-tabs">
                  <button class="modal-tab-btn active" id="tab-btn-profile-info">Profile Info (kind 0)</button>
                  <button class="modal-tab-btn" id="tab-btn-profile-keys">Keys & Custody</button>
                </div>

                <div id="profile-pane-info" style="display: flex; flex-direction: column; gap: 14px;">
                  <div style="display: flex; align-items: center; gap: 14px;">
                    <div id="profile-avatar-preview" style="width: 56px; height: 56px; border-radius: 50%; background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-strong); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; color: var(--omni-accent-primary); overflow: hidden; flex-shrink: 0;">
                      ✦
                    </div>
                    <div style="flex: 1; display: flex; flex-direction: column; gap: 2px;">
                      <div id="profile-preview-name" style="font-weight: 600; font-size: 0.95rem;">Guest User</div>
                      <div id="profile-preview-npub" style="font-family: var(--omni-font-mono); font-size: 0.72rem; color: var(--omni-text-muted);">npub...</div>
                    </div>
                  </div>

                  <div style="display: flex; flex-direction: column; gap: 10px;">
                    <label style="font-size: 0.78rem; color: var(--omni-text-secondary); display: flex; flex-direction: column; gap: 3px;">
                      Display Name:
                      <input id="input-profile-display-name" type="text" placeholder="e.g. Alice Smith" style="background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-strong); color: var(--omni-text-primary); padding: 7px 10px; border-radius: var(--omni-radius-sm); font-size: 0.82rem; outline: none;" />
                    </label>

                    <label style="font-size: 0.78rem; color: var(--omni-text-secondary); display: flex; flex-direction: column; gap: 3px;">
                      Name / Handle:
                      <input id="input-profile-name" type="text" placeholder="e.g. alice" style="background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-strong); color: var(--omni-text-primary); padding: 7px 10px; border-radius: var(--omni-radius-sm); font-size: 0.82rem; outline: none;" />
                    </label>

                    <label style="font-size: 0.78rem; color: var(--omni-text-secondary); display: flex; flex-direction: column; gap: 3px;">
                      About / Bio:
                      <textarea id="input-profile-about" rows="2" placeholder="Tell the Nostr network about yourself..." style="background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-strong); color: var(--omni-text-primary); padding: 7px 10px; border-radius: var(--omni-radius-sm); font-size: 0.82rem; outline: none; resize: vertical;"></textarea>
                    </label>

                    <label style="font-size: 0.78rem; color: var(--omni-text-secondary); display: flex; flex-direction: column; gap: 3px;">
                      Avatar / Picture URL:
                      <input id="input-profile-picture" type="text" placeholder="https://example.com/avatar.jpg" style="background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-strong); color: var(--omni-text-primary); padding: 7px 10px; border-radius: var(--omni-radius-sm); font-size: 0.82rem; outline: none;" />
                    </label>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                      <label style="font-size: 0.78rem; color: var(--omni-text-secondary); display: flex; flex-direction: column; gap: 3px;">
                        NIP-05 Identifier:
                        <input id="input-profile-nip05" type="text" placeholder="alice@domain.com" style="background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-strong); color: var(--omni-text-primary); padding: 7px 10px; border-radius: var(--omni-radius-sm); font-size: 0.82rem; outline: none;" />
                      </label>
                      <label style="font-size: 0.78rem; color: var(--omni-text-secondary); display: flex; flex-direction: column; gap: 3px;">
                        Lightning Address (lud16):
                        <input id="input-profile-lud16" type="text" placeholder="alice@getalby.com" style="background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-strong); color: var(--omni-text-primary); padding: 7px 10px; border-radius: var(--omni-radius-sm); font-size: 0.82rem; outline: none;" />
                      </label>
                    </div>
                  </div>

                  <div style="display: flex; justify-content: flex-end; margin-top: 6px;">
                    <button id="btn-save-profile" class="btn-publish">
                      Save & Publish Profile (kind 0)
                    </button>
                  </div>
                </div>

                <div id="profile-pane-keys" style="display: none; flex-direction: column; gap: 14px;">
                  <div style="display: flex; flex-direction: column; gap: 6px;">
                    <span style="font-size: 0.78rem; color: var(--omni-text-secondary);">Public Key (npub):</span>
                    <div style="display: flex; gap: 6px;">
                      <input id="profile-keys-npub" type="text" readonly style="flex: 1; background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-strong); color: var(--omni-text-primary); padding: 6px 10px; border-radius: var(--omni-radius-sm); font-family: var(--omni-font-mono); font-size: 0.75rem; outline: none;" />
                      <button id="btn-copy-npub" class="btn-secondary" style="font-size: 0.75rem;">Copy</button>
                    </div>
                  </div>

                  <div style="display: flex; flex-direction: column; gap: 6px;">
                    <span style="font-size: 0.78rem; color: var(--omni-text-secondary);">Public Key (Hex):</span>
                    <div style="display: flex; gap: 6px;">
                      <input id="profile-keys-hex" type="text" readonly style="flex: 1; background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-strong); color: var(--omni-text-muted); padding: 6px 10px; border-radius: var(--omni-radius-sm); font-family: var(--omni-font-mono); font-size: 0.72rem; outline: none;" />
                      <button id="btn-copy-hex" class="btn-secondary" style="font-size: 0.75rem;">Copy</button>
                    </div>
                  </div>

                  <div style="border-top: 1px solid var(--omni-border-subtle); padding-top: 12px; display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                      <span style="font-size: 0.82rem; font-weight: 600; color: var(--omni-text-secondary);">Private Key (nsec):</span>
                      <button id="btn-reveal-nsec" class="btn-secondary" style="font-size: 0.72rem;">Reveal Private Key</button>
                    </div>
                    <div id="private-key-display-wrapper" style="display: none; flex-direction: column; gap: 6px;">
                      <div style="display: flex; gap: 6px;">
                        <input id="profile-keys-nsec" type="text" readonly style="flex: 1; background: var(--omni-bg-subtle); border: 1px solid rgba(239,68,68,0.4); color: #f87171; padding: 6px 10px; border-radius: var(--omni-radius-sm); font-family: var(--omni-font-mono); font-size: 0.75rem; outline: none;" />
                        <button id="btn-copy-nsec" class="btn-secondary" style="font-size: 0.75rem;">Copy</button>
                      </div>
                      <span style="font-size: 0.7rem; color: var(--omni-text-muted);">⚠️ Never share your nsec private key with untrusted parties.</span>
                    </div>
                  </div>

                  <div style="border-top: 1px solid var(--omni-border-subtle); padding-top: 12px; display: flex; flex-direction: column; gap: 8px;">
                    <span style="font-size: 0.82rem; font-weight: 600; color: var(--omni-text-secondary);">Switch Identity / Import Key:</span>
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                      <input id="input-import-nsec" type="password" placeholder="Paste nsec1... or 64-char hex private key" style="background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-strong); color: var(--omni-text-primary); padding: 7px 10px; border-radius: var(--omni-radius-sm); font-size: 0.82rem; outline: none;" />
                      <div style="display: flex; justify-content: space-between; gap: 8px; margin-top: 4px;">
                        <button id="btn-generate-new-key" class="btn-secondary" style="font-size: 0.75rem;">Generate Fresh Key</button>
                        <button id="btn-confirm-import-key" class="btn-publish" style="font-size: 0.78rem;">Import & Switch</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Pane 2: Connected Relays -->
              <div class="settings-pane" id="settings-pane-relays">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <h3 style="font-size: 1.05rem; font-weight: 600;">Relay Pool Manager</h3>
                    <span style="font-size: 0.78rem; color: var(--omni-text-muted);">Manage real-time WebSocket connections to Nostr relays</span>
                  </div>
                  <span id="relays-status-badge" style="font-size: 0.72rem; background: var(--omni-bg-subtle); color: var(--omni-accent-primary); padding: 3px 8px; border-radius: var(--omni-radius-pill);">Live</span>
                </div>

                <div style="display: flex; gap: 8px;">
                  <input id="input-add-relay" type="text" placeholder="wss://relay.example.com" style="flex: 1; background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-strong); color: var(--omni-text-primary); padding: 8px 12px; border-radius: var(--omni-radius-sm); font-size: 0.85rem; outline: none;" />
                  <button id="btn-add-relay" class="btn-publish" style="font-size: 0.8rem; white-space: nowrap;">+ Connect Relay</button>
                </div>

                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                  <span style="font-size: 0.72rem; color: var(--omni-text-muted);">Presets:</span>
                  <button class="btn-secondary relay-preset-btn" data-url="wss://relay.ditto.pub" style="font-size: 0.7rem; padding: 2px 8px;">ditto.pub</button>
                  <button class="btn-secondary relay-preset-btn" data-url="wss://relay.damus.io" style="font-size: 0.7rem; padding: 2px 8px;">damus.io</button>
                  <button class="btn-secondary relay-preset-btn" data-url="wss://nos.lol" style="font-size: 0.7rem; padding: 2px 8px;">nos.lol</button>
                  <button class="btn-secondary relay-preset-btn" data-url="wss://relay.primal.net" style="font-size: 0.7rem; padding: 2px 8px;">primal.net</button>
                  <button class="btn-secondary relay-preset-btn" data-url="wss://relay.nostr.band" style="font-size: 0.7rem; padding: 2px 8px;">nostr.band</button>
                </div>

                <div id="settings-relays-list" style="display: flex; flex-direction: column; gap: 8px; margin-top: 6px;"></div>
              </div>

              <!-- Pane 3: Installed Plugins & Viewports -->
              <div class="settings-pane" id="settings-pane-plugins">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <h3 style="font-size: 1.05rem; font-weight: 600;">Installed Plugins & Viewports</h3>
                    <span id="plugins-count-badge" style="font-size: 0.72rem; background: var(--omni-bg-subtle); color: var(--omni-accent-primary); padding: 1px 6px; border-radius: var(--omni-radius-pill);">0</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
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
              Nostr naddr (NIP-5A) or Manifest URL:
              <input
                id="install-manifest-url"
                type="text"
                placeholder="naddr1... / 35129:pubkey:d-tag / https://..."
                style="background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-strong); color: var(--omni-text-primary); padding: 8px 12px; border-radius: var(--omni-radius-sm); font-size: 0.85rem; outline: none;"
              />
            </label>

            <div style="display: flex; align-items: center; gap: 8px; justify-content: center; font-size: 0.75rem; color: var(--omni-text-muted);">
              <span>— or paste raw manifest JSON / inline nsite HTML —</span>
            </div>

            <textarea
              id="install-manifest-json"
              rows="6"
              placeholder='{\n  "id": "org.example.plugin",\n  "name": "Custom Widget",\n  "version": "1.0.0"\n}'
              style="background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-strong); color: var(--omni-text-primary); padding: 8px 12px; border-radius: var(--omni-radius-sm); font-family: var(--omni-font-mono); font-size: 0.78rem; outline: none; resize: vertical;"
            ></textarea>

            <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; margin-top: 4px;">
              <div style="display: flex; gap: 6px;">
                <button id="btn-quick-sample-nostr" class="btn-secondary" style="font-size: 0.75rem;">
                  Load Sample Nostr (naddr)
                </button>
                <button id="btn-quick-sample-plugin" class="btn-secondary" style="font-size: 0.75rem;">
                  Load Raw Sample
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
            <button class="modal-tab-btn" id="tab-btn-manifest">Manifest JSON</button>
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
              <h4 style="font-size: 0.85rem; margin-bottom: 6px; color: var(--omni-text-secondary);">Contributed Components</h4>
              <div id="inspector-components-list" style="display: flex; flex-direction: column; gap: 6px;"></div>
            </div>
          </div>

          <div id="inspector-pane-permissions" style="display: none; flex-direction: column; gap: 10px;">
            <p style="font-size: 0.8rem; color: var(--omni-text-muted);">
              Granular capabilities granted to this plugin. Revoking immediately denies runtime RPC requests.
            </p>
            <div id="inspector-permissions-list" style="display: flex; flex-direction: column; gap: 8px;"></div>
          </div>

          <div id="inspector-pane-manifest" style="display: none; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: flex-end;">
              <button id="btn-copy-manifest" class="btn-secondary" style="font-size: 0.72rem;">
                Copy JSON
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
    this.dockBtnWidgets = document.getElementById("dock-btn-widgets")!;
    this.dockBtnSettings = document.getElementById("dock-btn-settings")!;

    this.settingsModal = document.getElementById("settings-modal")!;
    this.settingsNavBtns = {
      profile: document.getElementById("settings-tab-btn-profile")!,
      relays: document.getElementById("settings-tab-btn-relays")!,
      plugins: document.getElementById("settings-tab-btn-plugins")!
    };
    this.settingsPanes = {
      profile: document.getElementById("settings-pane-profile")!,
      relays: document.getElementById("settings-pane-relays")!,
      plugins: document.getElementById("settings-pane-plugins")!
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
  }

  private wireNavigation(): void {
    this.dockBtnWidgets?.addEventListener("click", () => this.showPage("widgets"));
    this.dockBtnSettings?.addEventListener("click", () => this.openSettings("profile"));

    const btnResetLayout = document.getElementById("btn-reset-layout");
    btnResetLayout?.addEventListener("click", () => {
      if (!confirm("Reset all plugin component slots back to defaults?")) return;
      const manifests = this.installedPlugins.map((p) => this.ensurePluginManifest(p));
      this.kernel.layoutManager.resetToDefaults(manifests);
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

    for (const [tab, btn] of Object.entries(this.settingsNavBtns)) {
      btn?.addEventListener("click", () => this.switchSettingsTab(tab as SettingsTab));
    }
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
      if (this.activeInspectedPlugin) {
        await navigator.clipboard.writeText(JSON.stringify(this.ensurePluginManifest(this.activeInspectedPlugin), null, 2));
        btnCopy.textContent = "Copied!";
        setTimeout(() => {
          btnCopy.textContent = "Copy JSON";
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
      urlInput.value = "https://registry.omni.org/plugins/scratchpad/omni.manifest.json";
      jsonInput.value = JSON.stringify(
        {
          id: "org.omni.plugins.scratchpad",
          name: "Scratchpad Notes",
          version: "1.0.0",
          description: "Minimal persistent scratchpad note taking widget",
          components: [{ id: "scratchpad-widget", slot: "sidebar", title: "Scratchpad" }]
        },
        null,
        2
      );
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
        this.renderPluginManager();
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
    const tabInfo = document.getElementById("tab-btn-profile-info");
    const tabKeys = document.getElementById("tab-btn-profile-keys");
    const paneInfo = document.getElementById("profile-pane-info");
    const paneKeys = document.getElementById("profile-pane-keys");
    const userBadge = document.getElementById("user-badge");
    const btnSave = document.getElementById("btn-save-profile") as HTMLButtonElement | null;
    const btnCopyNpub = document.getElementById("btn-copy-npub") as HTMLButtonElement | null;
    const btnCopyHex = document.getElementById("btn-copy-hex") as HTMLButtonElement | null;
    const btnCopyNsec = document.getElementById("btn-copy-nsec") as HTMLButtonElement | null;
    const btnRevealNsec = document.getElementById("btn-reveal-nsec") as HTMLButtonElement | null;
    const wrapperNsec = document.getElementById("private-key-display-wrapper");
    const inputNsec = document.getElementById("profile-keys-nsec") as HTMLInputElement | null;
    const inputImport = document.getElementById("input-import-nsec") as HTMLInputElement | null;
    const btnImport = document.getElementById("btn-confirm-import-key");
    const btnGenerate = document.getElementById("btn-generate-new-key");

    userBadge?.addEventListener("click", () => this.openSettings("profile"));

    tabInfo?.addEventListener("click", () => {
      tabInfo.classList.add("active");
      tabKeys?.classList.remove("active");
      if (paneInfo) paneInfo.style.display = "flex";
      if (paneKeys) paneKeys.style.display = "none";
    });

    tabKeys?.addEventListener("click", () => {
      tabKeys.classList.add("active");
      tabInfo?.classList.remove("active");
      if (paneKeys) paneKeys.style.display = "flex";
      if (paneInfo) paneInfo.style.display = "none";
    });

    btnSave?.addEventListener("click", async () => {
      if (!btnSave) return;
      btnSave.disabled = true;
      btnSave.textContent = "Signing & Publishing (kind 0)...";
      try {
        const metadata: Record<string, any> = {};
        const inputName = document.getElementById("input-profile-name") as HTMLInputElement | null;
        const inputDName = document.getElementById("input-profile-display-name") as HTMLInputElement | null;
        const inputAbout = document.getElementById("input-profile-about") as HTMLTextAreaElement | null;
        const inputPic = document.getElementById("input-profile-picture") as HTMLInputElement | null;
        const inputNip05 = document.getElementById("input-profile-nip05") as HTMLInputElement | null;
        const inputLud16 = document.getElementById("input-profile-lud16") as HTMLInputElement | null;

        if (inputName?.value.trim()) metadata.name = inputName.value.trim();
        if (inputDName?.value.trim()) metadata.display_name = inputDName.value.trim();
        if (inputAbout?.value.trim()) metadata.about = inputAbout.value.trim();
        if (inputPic?.value.trim()) metadata.picture = inputPic.value.trim();
        if (inputNip05?.value.trim()) metadata.nip05 = inputNip05.value.trim();
        if (inputLud16?.value.trim()) metadata.lud16 = inputLud16.value.trim();

        await this.kernel.publishProfile(metadata);
        await this.updateProfileUi();
        btnSave.textContent = "Profile Saved & Published!";
        setTimeout(() => {
          btnSave.disabled = false;
          btnSave.textContent = "Save & Publish Profile (kind 0)";
        }, 1800);
      } catch (err: any) {
        console.error("Failed to publish profile:", err);
        alert(`Failed to publish profile: ${err.message || String(err)}`);
        btnSave.disabled = false;
        btnSave.textContent = "Save & Publish Profile (kind 0)";
      }
    });

    const copyText = async (val: string, btn: HTMLButtonElement | null) => {
      if (!btn) return;
      try {
        await navigator.clipboard.writeText(val);
        const prev = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(() => {
          btn.textContent = prev;
        }, 1200);
      } catch {
        window.prompt("Copy:", val);
      }
    };

    btnCopyNpub?.addEventListener("click", () => {
      const val = (document.getElementById("profile-keys-npub") as HTMLInputElement)?.value || "";
      copyText(val, btnCopyNpub);
    });
    btnCopyHex?.addEventListener("click", () => {
      const val = (document.getElementById("profile-keys-hex") as HTMLInputElement)?.value || "";
      copyText(val, btnCopyHex);
    });
    btnCopyNsec?.addEventListener("click", () => {
      const val = (document.getElementById("profile-keys-nsec") as HTMLInputElement)?.value || "";
      copyText(val, btnCopyNsec);
    });

    btnRevealNsec?.addEventListener("click", () => {
      if (!wrapperNsec || !inputNsec || !btnRevealNsec) return;
      if (wrapperNsec.style.display === "flex") {
        wrapperNsec.style.display = "none";
        inputNsec.value = "";
        btnRevealNsec.textContent = "Reveal Private Key";
        return;
      }
      if (!window.confirm("⚠️ WARNING: Never share your private key!\nReveal private key?")) return;
      inputNsec.value = this.kernel.getNsec();
      wrapperNsec.style.display = "flex";
      btnRevealNsec.textContent = "Hide Private Key";
    });

    btnImport?.addEventListener("click", async () => {
      const val = inputImport?.value.trim();
      if (!val) {
        alert("Enter private key (nsec1... or hex)");
        return;
      }
      try {
        const decoded = WebCryptoKeystore.decodeKey(val);
        if ((decoded.type !== "nsec" && decoded.type !== "hex") || !decoded.hex) {
          alert("Identifier is not a private key.");
          return;
        }
        if (!window.confirm("Switch to this Nostr account?")) return;
        this.kernel.switchPrivateKey(decoded.hex);
        localStorage.setItem("omni_privkey", decoded.hex);
        if (inputImport) inputImport.value = "";
        await this.updateProfileUi();
        if (wrapperNsec) wrapperNsec.style.display = "none";
        if (inputNsec) inputNsec.value = "";
        if (btnRevealNsec) btnRevealNsec.textContent = "Reveal Private Key";
        alert("Identity switched successfully!");
      } catch (err: any) {
        alert(`Failed to import key: ${err.message || String(err)}`);
      }
    });

    btnGenerate?.addEventListener("click", async () => {
      if (!window.confirm("Generate fresh Nostr keypair?")) return;
      const freshHex = WebCryptoKeystore.generatePrivateKey();
      this.kernel.switchPrivateKey(freshHex);
      localStorage.setItem("omni_privkey", freshHex);
      await this.updateProfileUi();
      if (wrapperNsec) wrapperNsec.style.display = "none";
      if (inputNsec) inputNsec.value = "";
      if (btnRevealNsec) btnRevealNsec.textContent = "Reveal Private Key";
      alert("New Nostr keypair generated!");
    });
  }

  private wireRelaysManager(): void {
    const inputAdd = document.getElementById("input-add-relay") as HTMLInputElement | null;
    const btnAdd = document.getElementById("btn-add-relay");
    btnAdd?.addEventListener("click", () => {
      let url = inputAdd?.value.trim();
      if (!url) return;
      if (!url.startsWith("wss://") && !url.startsWith("ws://")) {
        url = `wss://${url}`;
      }
      this.kernel.relayPool.addRelay(url);
      if (inputAdd) inputAdd.value = "";
      this.renderSettingsRelays();
    });

    document.querySelectorAll(".relay-preset-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const url = btn.getAttribute("data-url");
        if (url) {
          this.kernel.relayPool.addRelay(url);
          this.renderSettingsRelays();
        }
      });
    });
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
