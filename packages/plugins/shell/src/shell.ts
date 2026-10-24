import { OmniKernel, WebCryptoKeystore, NostrPluginResolver, LayoutManager, STANDARD_SLOTS } from "@omni/core";
import { OmniWorkspaceState, OmniWorkspacePluginConfig, PluginPlacement, OMNI_WORKSPACE_D_TAG, NostrEvent, PluginViewDeclaration, OmniShellHost } from "@omni/types";
import { ICONS, icon, IconName } from "./icons.js";
import {
  renderNostrWritePermissionsSection,
  renderHandledIntentsSection,
  showIntentEnableToast
} from "./permissions-intents-ui.js";
import { mountShellStyles, unmountShellStyles } from "./styles/loader.js";
import { CLASSIC_SHELL_CSS } from "./styles/classic-styles.js";
import { shellRegistry } from "./shell-registry.js";
import { CURATED_APPS } from "./app-store-catalog.js";

import { BaseShell, InstalledPluginEntry, OmniShellOptions } from "./base-shell.js";
export type { InstalledPluginEntry, OmniShellOptions };

export type AppPage = "feed" | "widgets" | "dashboard" | "apps" | string;
export type SettingsTab = "profile" | "relays" | "plugins" | "workspace" | string;

export class OmniShell extends BaseShell {
  private pendingAppMounts: Set<string> = new Set();

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
    super(options);
  }

  public getShellType(): "classic" {
    return "classic";
  }

  protected onWorkspaceUpdated(): void {
    this.renderDockLaunchers();
    this.renderAppsLauncher();
    this.renderShellManager();
    this.renderPluginManager();
    this.renderSettingsNavAndPanes();
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
      if (!this.isAppPinned(plugin)) continue;

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

      let label = plugin.displayName || meta.displayName;
      if (!label) {
        if (plugin.id === "org.omni.plugin.feed") label = "Feed";
        else if (plugin.id === "org.omni.plugin.timer") label = "Timer";
        else if (plugin.id === "org.omni.plugin.checklist") label = "Daily";
        else if (plugin.id === "org.omni.plugin.relays") label = "Relays";
        else if (plugin.id === "org.omni.plugin.profile") label = "My Profile";
        else if (plugin.id === "org.omni.plugin.profile-viewer") label = "Profile";
        else label = meta.name.split(" ")[0];
      }

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
    const totalBadgeEl = document.getElementById("apps-total-badge");
    if (!pinnedGrid || !unpinnedGrid) return;

    pinnedGrid.innerHTML = "";
    unpinnedGrid.innerHTML = "";

    const searchInput = document.getElementById("apps-search-input") as HTMLInputElement | null;
    const filterQuery = (searchInput?.value || "").trim().toLowerCase();

    if (searchInput && !(searchInput as any)._bound) {
      (searchInput as any)._bound = true;
      searchInput.addEventListener("input", () => this.renderAppsLauncher());
    }

    const appCandidates: InstalledPluginEntry[] = this.installedPlugins.filter((p) => p.enabled !== false);
    if (totalBadgeEl) {
      totalBadgeEl.textContent = `${appCandidates.length} Installed`;
    }

    const filteredCandidates = appCandidates.filter((p) => {
      if (!filterQuery) return true;
      const meta = this.getPluginMeta(p);
      const hay = `${p.id} ${meta.name} ${meta.description || ""}`.toLowerCase();
      return hay.includes(filterQuery);
    });

    let pinnedCount = 0;
    let unpinnedCount = 0;

    for (const plugin of filteredCandidates) {
      const isPinned = this.isAppPinned(plugin);
      const meta = this.getPluginMeta(plugin);

      // Category detection
      let category = "App";
      if (plugin.id.includes("feed")) category = "Social";
      else if (plugin.id.includes("profile")) category = "Identity";
      else if (plugin.id.includes("timer") || plugin.id.includes("checklist")) category = "Productivity";
      else if (plugin.id.includes("relays")) category = "Network";

      const card = document.createElement("div");
      card.className = "app-card";
      card.style.cssText =
        "display: flex; flex-direction: column; justify-content: space-between; background: var(--omni-bg-surface); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-md); padding: 14px; gap: 12px; transition: all 0.15s ease; cursor: pointer;";

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
        "display: flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: var(--omni-radius-sm); background: var(--omni-bg-subtle); color: var(--omni-accent-primary); flex-shrink: 0;";
      iconWrap.innerHTML = iconSvg;

      const titleCol = document.createElement("div");
      titleCol.style.cssText = "display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0;";

      const nameRow = document.createElement("div");
      nameRow.style.cssText = "display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap;";

      const nameEl = document.createElement("span");
      nameEl.style.cssText =
        "font-weight: 600; font-size: 0.9rem; color: var(--omni-text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;";
      nameEl.textContent = meta.name;

      const metaBadges = document.createElement("div");
      metaBadges.style.cssText = "display: flex; align-items: center; gap: 4px;";

      const catBadge = document.createElement("span");
      catBadge.style.cssText =
        "font-size: 0.65rem; padding: 1px 6px; border-radius: var(--omni-radius-pill); background: rgba(212, 163, 115, 0.12); color: var(--omni-accent-primary); font-weight: 500;";
      catBadge.textContent = category;

      const badgeEl = document.createElement("span");
      badgeEl.style.cssText =
        "font-size: 0.65rem; padding: 1px 6px; border-radius: var(--omni-radius-pill); background: var(--omni-bg-subtle); color: var(--omni-text-muted); font-family: var(--omni-font-mono);";
      badgeEl.textContent = `v${meta.version}`;

      metaBadges.appendChild(catBadge);
      metaBadges.appendChild(badgeEl);
      nameRow.appendChild(nameEl);
      nameRow.appendChild(metaBadges);

      const descEl = document.createElement("p");
      descEl.style.cssText =
        "font-size: 0.75rem; color: var(--omni-text-secondary); margin: 0; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;";
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

      btnPin.title = isPinned ? "Unpin from navigation dock" : "Pin to navigation dock";
      btnPin.addEventListener("click", (e) => {
        e.stopPropagation();
        this.setAppPinned(plugin.id, !isPinned);
      });

      const btnOpen = document.createElement("button");
      btnOpen.className = "btn-publish btn-app-launch";
      btnOpen.style.cssText = "font-size: 0.72rem; padding: 4px 12px;";
      btnOpen.textContent = "Open App";
      btnOpen.addEventListener("click", (e) => {
        e.stopPropagation();
        this.showPage(plugin.id);
      });

      // Clicking anywhere on card opens the app
      card.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest(".btn-app-pin")) return;
        this.showPage(plugin.id);
      });

      bottomRow.appendChild(btnPin);
      bottomRow.appendChild(btnOpen);
      card.appendChild(bottomRow);

      this.bindAppContextMenu(card, plugin);

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
      emptyNote.textContent = filterQuery
        ? `No pinned applications matching "${filterQuery}".`
        : "No pinned applications. Pin apps to keep them in your navigation dock.";
      pinnedGrid.appendChild(emptyNote);
    }

    if (unpinnedCount === 0) {
      const emptyNote = document.createElement("div");
      emptyNote.style.cssText =
        "grid-column: 1 / -1; padding: 18px; text-align: center; color: var(--omni-text-muted); font-size: 0.78rem; background: var(--omni-bg-surface); border: 1px dashed var(--omni-border-subtle); border-radius: var(--omni-radius-sm);";
      emptyNote.textContent = filterQuery
        ? `No unpinned applications matching "${filterQuery}".`
        : "All installed applications are currently pinned to your navigation dock.";
      unpinnedGrid.appendChild(emptyNote);
    }
  }

  /**
   * Mounts the complete shell DOM and wires all interactive controllers
   */
  public mount(): void {
    mountShellStyles(CLASSIC_SHELL_CSS);
    if (typeof document !== "undefined") {
      document.documentElement.classList.remove("theme-panorama");
      document.body?.classList.remove("theme-panorama");
    }
    this.renderSkeleton();
    this.cacheElementReferences();
    this.initSlotContainers();
    this.renderDockLaunchers();
    this.wireNavigation();
    this.wireSettingsModal();
    this.renderShellManager();
    this.wireShellManager();
    this.wireInspectorModal();
    this.wireInstallModal();
    this.wireProfileControls();
    this.wireRelaysManager();
    this.renderSettingsNavAndPanes();

    // Wire intent broker callbacks for conflict resolution & single candidate flow
    this.kernel.intentBroker.setPromptEnableCandidateCallback(async (action, candidate) => {
      return new Promise<boolean>((resolve) => {
        this.showEnableCandidateToast(action, candidate, resolve);
      });
    });

    this.kernel.intentBroker.setDisambiguateCallback(async (action, candidates, data) => {
      return this.promptDisambiguateIntent(action, candidates, data);
    });

    this.initPullToRefresh();
  }

  public destroy(): void {
    super.destroy();
    if (this.root) {
      this.root.innerHTML = "";
    }
  }

  public getSlotContainers(): Map<string, Element> {
    return this.slotContainers;
  }

  /**
   * Switch center viewport between full-page apps and Widgets Dashboard
   */
  public showPage(page: AppPage, pushState = true): void {
    const currentPage = this.getActivePageId();
    if (pushState && typeof window !== "undefined" && currentPage !== page) {
      try {
        window.history.pushState({ type: "omni-classic-page", page }, "");
      } catch (_) {}
    }
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
      this.ensureWidgetsMounted().catch(console.warn);
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

        const plugin = this.installedPlugins.find((p) => p.id === page);
        if (plugin && plugin.enabled) {
          const slotEl = this.ensureAppPage(plugin.id);
          targetPage = document.getElementById(`page-app-${safeId}`) as HTMLElement | null;

          // If no sandbox instance has been mounted to slot-main-${safeId}, mount the standalone app
          const appInstanceKey = `${plugin.id}::app`;
          const placements = this.getPluginPlacements(plugin);
          const hasMainRunning = placements.some(
            (pl) => pl.enabled !== false && pl.viewport === "main" && this.kernel.getSandbox(`${plugin.id}::${pl.id}`)
          );

          if (!hasMainRunning && !this.kernel.getSandbox(appInstanceKey) && !this.pendingAppMounts.has(appInstanceKey)) {
            this.pendingAppMounts.add(appInstanceKey);
            const synthManifest = this.ensurePluginManifest(plugin);
            const appManifest = {
              ...synthManifest,
              components: [
                {
                  id: `${plugin.id}-app-main`,
                  type: "main",
                  title: plugin.name || plugin.id,
                  slot: "main"
                }
              ]
            };
            const customSlotContainers = new Map(this.getSlotContainers());
            customSlotContainers.set("main", slotEl);
            customSlotContainers.set("sidebar", slotEl);
            if (synthManifest.components) {
              for (const comp of synthManifest.components) {
                if (comp.slot) customSlotContainers.set(comp.slot, slotEl);
              }
            }

            const activePubkey = localStorage.getItem("omni_active_profile_pubkey") || "";
            this.kernel.registerPlugin(
              appManifest,
              plugin.htmlContent || plugin.scriptContent,
              customSlotContainers,
              {
                instanceId: appInstanceKey,
                route: (plugin.id === "org.omni.plugin.profile-viewer" && activePubkey) ? `?pubkey=${activePubkey}` : "",
                viewId: "main",
                targetSlot: "main",
                relays: plugin.relays
              }
            ).catch((err) => console.error(`Failed to register app instance for ${plugin.id}:`, err))
             .finally(() => {
               this.pendingAppMounts.delete(appInstanceKey);
             });
          }
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
        this.renderDockLaunchers();
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
          if (pl.viewport === "main" || pl.viewport === "dock") {
            p.pinned = true;
          }
          const primaryComp = synthManifest.components?.[0];
          if (primaryComp) {
            this.layoutManager.setComponentSlot(p.id, primaryComp.id, pl.viewport);
          }
          await this.remountPlugin(p);
          this.renderDockLaunchers();
          this.renderSettingsNavAndPanes();
          this.switchSettingsTab(p.id);
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
          this.renderDockLaunchers();
          this.renderSettingsNavAndPanes();
          this.switchSettingsTab(p.id);
        });
        row.appendChild(btnRemovePl);

        placementsSection.appendChild(row);
      }

      pane.appendChild(placementsSection);

      // Relay Access Scoping Section
      const relayAccessBox = document.createElement("div");
      relayAccessBox.className = "plugin-relay-access-box";
      relayAccessBox.style.cssText =
        "display: flex; flex-direction: column; gap: 8px; background: var(--omni-bg-surface); padding: 12px 14px; border-radius: var(--omni-radius-sm); border: 1px solid var(--omni-border-subtle);";

      const relayHeader = document.createElement("div");
      relayHeader.style.cssText = "display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px;";

      const relayTitle = document.createElement("div");
      relayTitle.style.cssText = "display: flex; align-items: center; gap: 6px;";
      relayTitle.innerHTML = `<span style="font-weight: 600; font-size: 0.82rem; color: var(--omni-text-primary);">Relay Access</span>`;

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

      const radAllLabel = document.createElement("label");
      radAllLabel.style.cssText = "display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: var(--omni-text-primary); cursor: pointer;";
      const radAll = document.createElement("input");
      radAll.type = "radio";
      radAll.name = `pane-relay-scope-${safeId}`;
      radAll.checked = !isCustomRelays;
      radAllLabel.appendChild(radAll);
      radAllLabel.appendChild(document.createTextNode("All Configured Relays (Default)"));
      relayOptionsWrap.appendChild(radAllLabel);

      const radCustomLabel = document.createElement("label");
      radCustomLabel.style.cssText = "display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: var(--omni-text-primary); cursor: pointer;";
      const radCustom = document.createElement("input");
      radCustom.type = "radio";
      radCustom.name = `pane-relay-scope-${safeId}`;
      radCustom.checked = isCustomRelays;
      radCustomLabel.appendChild(radCustom);
      radCustomLabel.appendChild(document.createTextNode("Custom Relays"));
      relayOptionsWrap.appendChild(radCustomLabel);

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
      pane.appendChild(relayAccessBox);

      // Nostr Write Permissions (Collapsible Section)
      const writeSection = renderNostrWritePermissionsSection({
        kernel: this.kernel,
        pluginId: p.id,
        theme: "classic",
        onUpdate: () => this.saveLocalWorkspace()
      });
      pane.appendChild(writeSection);

      // Handled Intents & Capabilities
      const intentsSection = renderHandledIntentsSection({
        kernel: this.kernel,
        plugin: p,
        theme: "classic",
        onUpdate: () => this.saveLocalWorkspace()
      });
      pane.appendChild(intentsSection);

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

      const btnUpdate = document.createElement("button");
      btnUpdate.className = "btn-secondary";
      btnUpdate.style.cssText = "font-size: 0.75rem; padding: 4px 10px;";
      btnUpdate.textContent = "Update App...";
      btnUpdate.addEventListener("click", () => {
        this.openUpdatePluginModal(p);
      });

      actionsRow.appendChild(btnInspect);
      actionsRow.appendChild(btnUpdate);
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

  // --- Installed Shells Manager UI (Swappable Shells Architecture) ---

  public renderShellManager(): void {
    const switcherContainer = (this.root.querySelector("#shell-switcher-buttons") || document.getElementById("shell-switcher-buttons")) as HTMLElement | null;
    const cardsList = (this.root.querySelector("#classic-installed-shells-list") || document.getElementById("classic-installed-shells-list")) as HTMLElement | null;
    const countBadge = (this.root.querySelector("#classic-shell-count-badge") || document.getElementById("classic-shell-count-badge")) as HTMLElement | null;

    const shells = shellRegistry.list();
    const currentActive = shellRegistry.getActiveShellId();

    if (countBadge) {
      countBadge.textContent = `${shells.length} installed`;
    }

    if (switcherContainer) {
      switcherContainer.innerHTML = "";
      for (const s of shells) {
        const btn = document.createElement("button");
        btn.id = `btn-shell-${s.id}`;
        btn.className = `btn-secondary ${currentActive === s.id ? "active" : ""}`;
        btn.style.cssText = `font-size: 0.72rem; padding: 3px 8px; ${currentActive === s.id ? "border-color: var(--omni-accent-primary); color: var(--omni-accent-primary);" : ""}`;
        btn.textContent = s.name;
        btn.title = s.description;
        btn.addEventListener("click", () => {
          shellRegistry.setActiveShell(s.id);
          this.reloadPage();
        });
        switcherContainer.appendChild(btn);
      }
    }

    if (!cardsList) return;
    cardsList.innerHTML = "";

    for (const s of shells) {
      const isActive = currentActive === s.id;
      const isBuiltin = s.isBuiltin !== false;
      const card = document.createElement("div");
      card.className = "classic-shell-card";
      card.style.cssText = `
        background: var(--omni-bg-elevated);
        border: 1px solid ${isActive ? "var(--omni-accent-primary)" : "var(--omni-border-subtle)"};
        border-radius: var(--omni-radius-sm);
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      `;

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 32px; height: 32px; background: var(--omni-bg-surface); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-sm); display: flex; align-items: center; justify-content: center; color: var(--omni-accent-primary); flex-shrink: 0;">
              ${s.icon && ICONS[s.icon as IconName] ? icon(s.icon as IconName, 18) : icon("layout", 18)}
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <strong style="font-size: 0.88rem; color: var(--omni-text-primary);">${s.name}</strong>
                ${isActive ? `<span style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; padding: 1px 6px; background: var(--omni-accent-primary); color: #fff; border-radius: 3px;">Active</span>` : ""}
                ${!isBuiltin ? `<span style="font-size: 0.65rem; text-transform: uppercase; padding: 1px 6px; background: var(--omni-bg-subtle); color: var(--omni-text-muted); border: 1px solid var(--omni-border-subtle); border-radius: 3px;">Custom</span>` : ""}
              </div>
              <div style="font-size: 0.72rem; color: var(--omni-text-muted); margin-top: 1px;">
                ${s.author ? `by ${s.author}` : "Omni Core Team"} • v${s.version || "1.0.0"}
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            ${!isActive ? `
              <button class="btn-secondary btn-activate-shell" data-shell-id="${s.id}" style="color: var(--omni-accent-primary); border-color: var(--omni-accent-primary); font-size: 0.75rem; padding: 4px 10px;">
                Activate
              </button>
            ` : `
              <span style="font-size: 0.72rem; color: var(--omni-accent-primary); font-weight: 600; padding: 4px 6px;">Current</span>
            `}
            ${!isBuiltin ? `
              <button class="btn-secondary btn-uninstall-shell" data-shell-id="${s.id}" style="color: #ff5555; border-color: #552222; font-size: 0.75rem; padding: 4px 8px;">
                Uninstall
              </button>
            ` : ""}
          </div>
        </div>
        <p style="font-size: 0.78rem; color: var(--omni-text-secondary); margin: 0; line-height: 1.35;">${s.description}</p>
      `;

      card.querySelector(".btn-activate-shell")?.addEventListener("click", () => {
        shellRegistry.setActiveShell(s.id);
        this.reloadPage();
      });

      card.querySelector(".btn-uninstall-shell")?.addEventListener("click", () => {
        if (confirm(`Uninstall shell '${s.name}'?`)) {
          shellRegistry.uninstall(s.id);
          this.renderShellManager();
        }
      });

      cardsList.appendChild(card);
    }

    this.renderCuratedShellCatalog();
  }

  public renderCuratedShellCatalog(): void {
    const catalogContainer = (this.root.querySelector("#classic-curated-shell-catalog") || document.getElementById("classic-curated-shell-catalog")) as HTMLElement | null;
    if (!catalogContainer) return;
    catalogContainer.innerHTML = "";

    const curated = shellRegistry.getCuratedCatalog();
    const installed = shellRegistry.list();

    for (const c of curated) {
      const isInstalled = installed.some((s) => s.id === c.id);
      const isCurrentActive = shellRegistry.getActiveShellId() === c.id;

      const item = document.createElement("div");
      item.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--omni-bg-surface); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-sm); gap: 10px;";
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
          <div style="width: 32px; height: 32px; background: var(--omni-bg-elevated); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-sm); display: flex; align-items: center; justify-content: center; color: var(--omni-accent-primary); flex-shrink: 0;">
            ${c.icon && ICONS[c.icon as IconName] ? icon(c.icon as IconName, 18) : icon("layout", 18)}
          </div>
          <div style="min-width: 0;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <strong style="font-size: 0.85rem; color: var(--omni-text-primary);">${c.name}</strong>
              <span style="font-size: 0.68rem; color: var(--omni-text-muted);">v${c.version || "1.0.0"}</span>
            </div>
            <div style="font-size: 0.74rem; color: var(--omni-text-muted); margin-top: 2px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
              ${c.description}
            </div>
          </div>
        </div>
        <div style="flex-shrink: 0;">
          ${isInstalled ? (
            isCurrentActive ? `
              <span style="font-size: 0.72rem; color: var(--omni-accent-primary); font-weight: 600;">Active</span>
            ` : `
              <button class="btn-secondary btn-activate-curated-shell" data-shell-id="${c.id}" style="font-size: 0.75rem; padding: 3px 8px;">
                Activate
              </button>
            `
          ) : `
            <button class="btn-secondary btn-install-curated-shell" data-shell-id="${c.id}" style="color: var(--omni-accent-primary); border-color: var(--omni-accent-primary); font-size: 0.75rem; padding: 3px 8px;">
              Install Shell
            </button>
          `}
        </div>
      `;

      item.querySelector(".btn-install-curated-shell")?.addEventListener("click", () => {
        shellRegistry.install(c);
        this.renderShellManager();
      });

      item.querySelector(".btn-activate-curated-shell")?.addEventListener("click", () => {
        shellRegistry.setActiveShell(c.id);
        this.reloadPage();
      });

      catalogContainer.appendChild(item);
    }
  }

  public wireShellManager(): void {
    const modal = (this.root.querySelector("#install-shell-modal") || document.getElementById("install-shell-modal")) as HTMLElement | null;
    const btnOpen = (this.root.querySelector("#btn-classic-open-install-shell") || document.getElementById("btn-classic-open-install-shell")) as HTMLElement | null;
    const btnClose = (this.root.querySelector("#btn-close-install-shell-modal") || document.getElementById("btn-close-install-shell-modal")) as HTMLElement | null;
    const btnConfirmCustom = (this.root.querySelector("#btn-classic-confirm-custom-shell-install") || document.getElementById("btn-classic-confirm-custom-shell-install")) as HTMLElement | null;

    btnOpen?.addEventListener("click", () => {
      modal?.classList.add("open");
      this.renderCuratedShellCatalog();
    });

    btnClose?.addEventListener("click", () => {
      modal?.classList.remove("open");
    });

    modal?.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.remove("open");
    });

    btnConfirmCustom?.addEventListener("click", () => {
      const idInput = (this.root.querySelector("#classic-custom-shell-id") || document.getElementById("classic-custom-shell-id")) as HTMLInputElement | null;
      const nameInput = (this.root.querySelector("#classic-custom-shell-name") || document.getElementById("classic-custom-shell-name")) as HTMLInputElement | null;
      const descInput = (this.root.querySelector("#classic-custom-shell-desc") || document.getElementById("classic-custom-shell-desc")) as HTMLInputElement | null;

      const id = idInput?.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
      const name = nameInput?.value.trim();
      const desc = descInput?.value.trim() || `Custom installed shell experience (${id})`;

      if (!id || !name) {
        alert("Please provide both a Shell ID and Name.");
        return;
      }

      shellRegistry.install({
        id,
        name,
        description: desc,
        author: "Custom",
        version: "1.0.0",
        isBuiltin: false,
        create: (options) => new OmniShell(options)
      });

      if (idInput) idInput.value = "";
      if (nameInput) nameInput.value = "";
      if (descInput) descInput.value = "";

      modal?.classList.remove("open");
      this.renderShellManager();
    });
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
      const safeId = p.id.replace(/[^a-zA-Z0-9_-]/g, "-");

      const card = document.createElement("div");
      card.className = "plugin-item-row plugin-card-collapsible";
      card.dataset.pluginId = p.id;
      card.style.cssText = `margin-bottom: 8px; background: var(--omni-bg-surface); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-md); overflow: hidden; transition: border-color 0.15s ease;`;

      // Compact Directory Row
      const header = document.createElement("div");
      header.className = "plugin-card-header plugin-card-collapsible-header";
      header.style.cssText = `display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; gap: 12px; flex-wrap: wrap;`;

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

      // Master enable/disable toggle
      const toggleLabel = document.createElement("label");
      toggleLabel.className = "omni-toggle";
      toggleLabel.title = p.enabled ? "Click to disable plugin" : "Click to enable plugin";

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

      // Dedicated Configure Tab Navigation Button
      const btnConfigure = document.createElement("button");
      btnConfigure.className = "btn-secondary btn-configure-plugin";
      btnConfigure.style.cssText = "font-size: 0.72rem; padding: 3px 10px; display: inline-flex; align-items: center; gap: 5px; color: var(--omni-accent-primary); border-color: var(--omni-border-strong);";
      btnConfigure.innerHTML = `<span>Configure</span> <span>→</span>`;
      btnConfigure.title = `Open dedicated settings tab for ${meta.name}`;
      btnConfigure.addEventListener("click", () => {
        this.switchSettingsTab(p.id);
      });

      headerRight.appendChild(toggleLabel);
      headerRight.appendChild(btnConfigure);

      header.appendChild(headerLeft);
      header.appendChild(headerRight);
      card.appendChild(header);

      container.appendChild(card);
    }

    this.renderDefaultApplicationsSettings(container);
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

      // Collapsible Nostr Write Permissions Section
      const writeSection = renderNostrWritePermissionsSection({
        kernel: this.kernel,
        pluginId: plugin.id,
        theme: "classic",
        onUpdate: () => this.saveLocalWorkspace()
      });
      permList.appendChild(writeSection);

      // Handled Intents Section
      const intentsSection = renderHandledIntentsSection({
        kernel: this.kernel,
        plugin,
        theme: "classic",
        onUpdate: () => this.saveLocalWorkspace()
      });
      permList.appendChild(intentsSection);
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
        <div class="header-actions" style="display: flex; align-items: center; gap: 10px;">
          <div id="header-actions-slot" class="omni-slot-inline" style="display: flex; align-items: center; gap: 8px;"></div>
          <button id="user-badge" class="header-identity-pill" title="Click to manage profile" style="display: flex; align-items: center; gap: 7px; background: var(--omni-bg-surface); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-pill, 9999px); padding: 3px 10px 3px 4px; color: var(--omni-text-primary); cursor: pointer; transition: all 0.15s ease;">
            <div id="header-profile-avatar" style="width: 22px; height: 22px; border-radius: 50%; overflow: hidden; background: var(--omni-bg-subtle); display: flex; align-items: center; justify-content: center; color: var(--omni-accent-primary); flex-shrink: 0;">
              ${icon("user", 14)}
            </div>
            <span id="header-profile-name" style="font-size: 0.78rem; font-weight: 500; max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Identity</span>
          </button>
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
          <!-- Page 1: Feed & Main Slot -->
          <section class="app-page active" id="page-feed" data-plugin-id="org.omni.plugin.feed" data-page="feed">
            <div id="main-slot" class="omni-slot main-viewport-slot"></div>
          </section>

          <!-- Page 2: Applications Launcher (Pinned + Additional Apps) -->
          <section class="app-page" id="page-apps" data-page="apps">
            <div class="widgets-page-header">
              <div class="widgets-page-title-row">
                <h2 class="widgets-page-title">Applications</h2>
                <span class="widgets-page-badge" id="apps-total-badge">Launcher</span>
              </div>
              <p class="widgets-page-desc">All installed applications. Pin your favorites to the navigation dock or launch any application directly.</p>
            </div>

            <!-- Apps Search Bar -->
            <div class="apps-search-bar" style="display: flex; align-items: center; gap: 8px; background: var(--omni-bg-surface); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-md); padding: 8px 12px; margin-bottom: 16px;">
              <span style="color: var(--omni-text-muted); display: flex; align-items: center;">${icon("search", 15)}</span>
              <input id="apps-search-input" type="text" placeholder="Search applications..." style="flex: 1; background: transparent; border: none; outline: none; color: var(--omni-text-primary); font-size: 0.85rem;" />
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
                    ${icon("grid", 15)} All Apps
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
                <!-- Installed Shells Card -->
                <div id="shell-experience-box" class="classic-shells-card" style="display: flex; flex-direction: column; gap: 10px; background: var(--omni-bg-surface); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-md); padding: 14px; margin-top: 4px;">
                  <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                    <div>
                      <div style="display: flex; align-items: center; gap: 8px;">
                        <strong style="font-size: 0.9rem; color: var(--omni-text-primary); display: flex; align-items: center; gap: 6px;">
                          ${icon("layout", 15)} Installed Shells
                        </strong>
                        <span id="classic-shell-count-badge" style="font-size: 0.68rem; padding: 2px 6px; background: var(--omni-bg-elevated); border: 1px solid var(--omni-border-subtle); border-radius: 4px; color: var(--omni-text-muted);">2 installed</span>
                      </div>
                      <span style="font-size: 0.72rem; color: var(--omni-text-muted);">Host UI frames, viewport mapping, and navigation layouts. Exactly one shell can be active.</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <button id="btn-classic-open-install-shell" class="btn-secondary" style="font-size: 0.75rem; display: flex; align-items: center; gap: 4px; color: var(--omni-accent-primary); border-color: var(--omni-accent-primary);">
                        ${icon("plus", 12)}
                        <span>Install Shell</span>
                      </button>
                      <div id="shell-switcher-buttons" style="display: flex; gap: 6px; flex-wrap: wrap;"></div>
                    </div>
                  </div>
                  <!-- Installed Shell Cards List -->
                  <div id="classic-installed-shells-list" style="display: flex; flex-direction: column; gap: 8px;"></div>
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

            <!-- Curated Decentralized Catalog -->
            <div style="margin-top: 10px; border-top: 1px solid var(--omni-border-subtle); padding-top: 10px;">
              <div style="font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--omni-text-muted); margin-bottom: 8px;">
                Featured Decentralized Apps (1-Click Install)
              </div>
              <div id="classic-curated-catalog" style="display: flex; flex-direction: column; gap: 6px; max-height: 180px; overflow-y: auto;"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 5. Install Shell Modal -->
      <div class="modal-overlay" id="install-shell-modal">
        <div class="modal-card">
          <div class="modal-header">
            <h3 style="font-size: 1.05rem; font-weight: 600;">Install Shell Experience</h3>
            <button class="btn-drawer-close" id="btn-close-install-shell-modal">
              ${icon("close", 14)}
            </button>
          </div>

          <div style="display: flex; flex-direction: column; gap: 14px;">
            <p style="font-size: 0.8rem; color: var(--omni-text-muted); margin: 0;">
              Shell experiences redefine the entire workspace frame, layout viewport routing, navigation dock, and visual design system.
            </p>

            <div>
              <div style="font-size: 0.78rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--omni-text-secondary); margin-bottom: 8px;">
                Featured Shells (1-Click Install)
              </div>
              <div id="classic-curated-shell-catalog" style="display: flex; flex-direction: column; gap: 8px;"></div>
            </div>

            <div style="border-top: 1px solid var(--omni-border-subtle); padding-top: 12px; display: flex; flex-direction: column; gap: 10px;">
              <div style="font-size: 0.78rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--omni-text-secondary);">
                Install Custom Shell
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <label style="display: flex; flex-direction: column; gap: 4px; font-size: 0.8rem; color: var(--omni-text-secondary);">
                  Shell ID:
                  <input id="classic-custom-shell-id" type="text" placeholder="e.g. minimalist" style="background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-strong); color: var(--omni-text-primary); padding: 6px 10px; border-radius: var(--omni-radius-sm); font-size: 0.8rem; outline: none;" />
                </label>
                <label style="display: flex; flex-direction: column; gap: 4px; font-size: 0.8rem; color: var(--omni-text-secondary);">
                  Shell Name:
                  <input id="classic-custom-shell-name" type="text" placeholder="e.g. Minimalist Shell" style="background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-strong); color: var(--omni-text-primary); padding: 6px 10px; border-radius: var(--omni-radius-sm); font-size: 0.8rem; outline: none;" />
                </label>
              </div>
              <label style="display: flex; flex-direction: column; gap: 4px; font-size: 0.8rem; color: var(--omni-text-secondary);">
                Description:
                <input id="classic-custom-shell-desc" type="text" placeholder="Brief description of the shell..." style="background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-strong); color: var(--omni-text-primary); padding: 6px 10px; border-radius: var(--omni-radius-sm); font-size: 0.8rem; outline: none;" />
              </label>
              <div style="display: flex; justify-content: flex-end;">
                <button id="btn-classic-confirm-custom-shell-install" class="btn-publish">
                  Install Custom Shell
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 6. Plugin Inspector Modal -->
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
    const q = (sel: string) => (this.root.querySelector(sel) || document.querySelector(sel)) as HTMLElement;
    this.mainViewport = q("#main-viewport") || q(".main-viewport");
    this.headerActionsSlot = q("#header-actions-slot");
    this.dockSlot = q("#dock-slot");
    this.mainSlot = q("#main-slot");
    this.widgetsSlot = q("#widgets-slot");
    this.pageFeed = q("#page-feed");
    this.pageWidgets = q("#page-widgets");
    this.pageApps = q("#page-apps");
    this.dockBtnApps = q("#dock-btn-apps");
    this.dockBtnWidgets = q("#dock-btn-widgets");
    this.dockBtnSettings = q("#dock-btn-settings");

    this.settingsModal = q("#settings-modal");
    this.settingsNav = q("#settings-nav");
    this.settingsContent = q("#settings-content");
    const pluginsBtn = q("#settings-tab-btn-plugins");
    const pluginsPane = q("#settings-pane-plugins");
    this.settingsNavBtns = {
      plugins: pluginsBtn!
    };
    this.settingsPanes = {
      plugins: pluginsPane!
    };

    this.pluginInspectorModal = q("#plugin-inspector-modal");
    this.installPluginModal = q("#install-plugin-modal");
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

    if (typeof window !== "undefined") {
      window.addEventListener("popstate", (e) => {
        if (e.state?.type === "omni-classic-page" && e.state.page) {
          this.showPage(e.state.page, false);
        } else if (!e.state || !e.state.type) {
          this.showPage("feed", false);
        }
      });
    }

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

    this.renderShellManager();
    this.wireShellManager();
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
      const target = urlText || jsonText;
      if (!target) {
        alert("Please provide either a Nostr naddr, URL, or JSON/HTML content.");
        return;
      }
      btnConfirm.disabled = true;
      btnConfirm.textContent = "Resolving & Installing...";
      try {
        const installed = await this.resolveAndInstallNsite(target);
        this.renderDockLaunchers();
        this.renderSettingsNavAndPanes();
        this.installPluginModal.classList.remove("open");
        urlInput.value = "";
        jsonInput.value = "";
        if (typeof alert === "function") { try { alert(`Plugin '${installed.name}' installed successfully!`); } catch (_) {} }
      } catch (err: any) {
        console.error("Install failed:", err);
        if (typeof alert === "function") { try { alert(`Install failed: ${err.message || String(err)}`); } catch (_) {} }
      } finally {
        btnConfirm.disabled = false;
        btnConfirm.textContent = "Install Plugin";
      }
    });

    const catalogContainer = document.getElementById("classic-curated-catalog");
    if (catalogContainer) {
      catalogContainer.innerHTML = "";
      for (const app of CURATED_APPS) {
        const isInstalled = this.installedPlugins.some((p) => p.id === app.id);
        const card = document.createElement("div");
        card.style.cssText =
          "display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: var(--omni-bg-surface); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-sm); gap: 10px;";
        card.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <strong style="font-size: 0.82rem; color: var(--omni-text-primary);">${app.name}</strong>
              <span style="font-size: 0.65rem; color: var(--omni-accent-primary); background: var(--omni-bg-subtle); padding: 1px 5px; border-radius: 999px;">${app.category}</span>
            </div>
            <span style="font-size: 0.72rem; color: var(--omni-text-muted); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${app.description}</span>
          </div>
        `;
        const btnInstallApp = document.createElement("button");
        btnInstallApp.className = "btn-secondary";
        btnInstallApp.style.cssText = "font-size: 0.72rem; padding: 3px 8px; flex-shrink: 0;";
        btnInstallApp.textContent = isInstalled ? "Installed" : "Install";
        btnInstallApp.disabled = isInstalled;
        btnInstallApp.addEventListener("click", async () => {
          btnInstallApp.disabled = true;
          btnInstallApp.textContent = "Installing...";
          try {
            await this.resolveAndInstallNsite(app.htmlContent);
            btnInstallApp.textContent = "Installed";
            this.renderDockLaunchers();
            this.renderSettingsNavAndPanes();
            if (typeof alert === "function") { try { alert(`Installed ${app.name}!`); } catch (_) {} }
          } catch (err: any) {
            if (typeof alert === "function") { try { alert(`Install failed: ${err.message || String(err)}`); } catch (_) {} }
            btnInstallApp.disabled = false;
            btnInstallApp.textContent = "Install";
          }
        });
        card.appendChild(btnInstallApp);
        catalogContainer.appendChild(card);
      }
    }
  }

  private wireProfileControls(): void {
    const userBadge = document.getElementById("user-badge");
    userBadge?.addEventListener("click", () => this.openSettings("profile"));
  }

  private wireRelaysManager(): void {
    // Relays management is handled by the standalone @omni/plugin-relays plugin
  }



}
