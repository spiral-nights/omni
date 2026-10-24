import { OmniKernel, LayoutManager } from "@omni/core";
import {
  OmniWorkspaceState,
  PluginPlacement,
  PluginViewDeclaration,
  OmniShellHost
} from "@omni/types";
import { BaseShell, InstalledPluginEntry, OmniShellOptions } from "./base-shell.js";
import { ICONS, icon, IconName } from "./icons.js";
import { mountShellStyles, unmountShellStyles } from "./styles/loader.js";
import { EDITORIAL_SHELL_CSS } from "./styles/editorial-styles.js";
import { shellRegistry } from "./shell-registry.js";

export type EditorialThemeMode = "light" | "dark" | "system";

export interface EditorialAccentPreset {
  id: string;
  name: string;
  lightColor: string;
  darkColor: string;
}

export const EDITORIAL_ACCENTS: EditorialAccentPreset[] = [
  { id: "cobalt", name: "Cobalt Glow", lightColor: "#1e40af", darkColor: "#4d8eff" },
  { id: "terra", name: "Terracotta", lightColor: "#c2410c", darkColor: "#e2725b" },
  { id: "saffron", name: "Saffron Ochre", lightColor: "#d97706", darkColor: "#f59e0b" },
  { id: "pine", name: "Forest Pine", lightColor: "#15803d", darkColor: "#4e9f78" },
  { id: "bone", name: "Monochrome Bone", lightColor: "#475569", darkColor: "#e5e1e4" }
];

export const STORAGE_KEY_EDITORIAL_MODE = "omni_editorial_theme_mode";
export const STORAGE_KEY_EDITORIAL_ACCENT_ID = "omni_editorial_accent_id";
export const STORAGE_KEY_EDITORIAL_ACCENT_COLOR = "omni_editorial_accent_color";
export const STORAGE_KEY_EDITORIAL_ACCENT_NAME = "omni_editorial_accent_name";

/**
 * EditorialShell — Sacred Swiss Editorial & Papyrus Sanctuary
 *
 * Distinctive Features:
 * - Sacred Swiss Editorial aesthetic with Newsreader serif headings & Space Mono uppercase labels
 * - Dual-Theme architecture: Sacred Editorial (Papyrus light mode) & Obsidian Sanctuary (dark mode)
 * - Dynamic Theme Mode (Light / Dark / System auto-detection)
 * - Curated & Custom Accent Color selector (Cobalt, Terracotta, Saffron, Pine, Bone)
 * - Dynamic dock navigation driven by plugin placements & dock pinning
 * - Clean broadsheet Applications Index & Companion Cards (widgets) dashboard
 * - Dedicated Installed Shells manager and pluggable settings
 */
export class EditorialShell extends BaseShell implements OmniShellHost {
  public activePage: "app" | "apps" | "widgets" = "app";
  public activePluginId: string | null = null;

  private themeMode: EditorialThemeMode = "system";
  private mediaQueryDark: MediaQueryList | null = null;
  private mediaQueryListener: ((e: MediaQueryListEvent) => void) | null = null;
  private isAppFullscreen = false;

  // Cached slot elements
  private headerActionsSlot!: HTMLElement;
  private mainAppContainer!: HTMLElement;
  private widgetsSlot!: HTMLElement;
  private dockContainer!: HTMLElement;
  private pendingAppMounts = new Set<string>();
  private boundKeydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private boundScrollHandler: (() => void) | null = null;

  constructor(options: OmniShellOptions) {
    super(options);
  }

  public getShellType(): string {
    return "editorial";
  }

  public getActivePageId(): string {
    if (this.activePluginId) return this.activePluginId;
    const defaultPage = this.root?.querySelector("#editorial-page-app") as HTMLElement | null;
    if (defaultPage?.dataset.pluginId) return defaultPage.dataset.pluginId;
    const firstMain = this.installedPlugins.find((p) => p.viewport === "main" || p.pinned);
    return firstMain?.id || "";
  }

  public ensureAppContainer(pluginId: string): HTMLElement {
    const safeId = pluginId.replace(/[^a-zA-Z0-9_-]/g, "-");
    const existing = this.root.querySelector<HTMLElement>(`#editorial-app-page-${safeId}`);
    if (existing) {
      return existing.querySelector(".editorial-app-container") as HTMLElement;
    }

    // Bind to the default unassigned app container if available
    const defaultPage = this.root.querySelector<HTMLElement>("#editorial-page-app");
    if (defaultPage && (!defaultPage.dataset.pluginId || defaultPage.dataset.pluginId === pluginId)) {
      defaultPage.dataset.pluginId = pluginId;
      const defaultContainer = defaultPage.querySelector<HTMLElement>(".editorial-app-container");
      if (defaultContainer) return defaultContainer;
    }

    const appPage = document.createElement("section");
    appPage.id = `editorial-app-page-${safeId}`;
    appPage.className = "editorial-viewport-page editorial-app-page";
    appPage.dataset.pluginId = pluginId;
    appPage.style.cssText = "display: none; width: 100%; min-height: 100%; flex-direction: column;";

    const slotInner = document.createElement("div");
    slotInner.id = `editorial-slot-main-${safeId}`;
    slotInner.className = "omni-slot editorial-app-container";
    slotInner.style.cssText = "width: 100%; min-height: 100%; flex: 1; display: flex; flex-direction: column;";
    appPage.appendChild(slotInner);

    const streamEnd = document.createElement("div");
    streamEnd.className = "editorial-stream-end";
    streamEnd.innerHTML = `
      <div class="editorial-stream-end-line">
        <span>○ Synchronized</span>
      </div>
    `;
    appPage.appendChild(streamEnd);

    const mainContent = this.root.querySelector(".editorial-main-content");
    const pageApps = this.root.querySelector("#editorial-page-apps");
    if (mainContent && pageApps) {
      mainContent.insertBefore(appPage, pageApps);
    } else if (mainContent) {
      mainContent.appendChild(appPage);
    }
    return appPage.querySelector(".editorial-app-container") as HTMLElement;
  }

  public getContainerForPluginSlot(pluginId: string, slotId: string, compId?: string): Element {
    if (slotId === "main") {
      return this.ensureAppContainer(pluginId);
    }
    if (slotId === "sidebar" || slotId === "widget" || slotId === "widgets") {
      return this.widgetsSlot || this.root;
    }
    if (slotId === "header-actions") {
      return this.headerActionsSlot || this.root;
    }
    if (slotId === "dock") {
      return this.dockContainer || this.root;
    }
    return this.ensureAppContainer(pluginId);
  }

  public getSlotContainers(): Map<string, Element> {
    return this.slotContainers;
  }

  public async showPage(page: string): Promise<void> {
    if (page === "apps" || page === "launcher") {
      this.showAppsIndex();
    } else if (page === "widgets" || page === "cards") {
      this.showWidgetsView();
    } else if (page === "settings" || page === "preferences") {
      this.openSettings();
    } else {
      const p = this.installedPlugins.find(
        (x) => x.id === page || x.name?.toLowerCase() === page.toLowerCase()
      );
      if (p) {
        this.openApp(p.id);
      } else {
        this.openApp(page);
      }
    }
  }

  public async dispatchIntent(action: string, data: any = {}): Promise<any> {
    if (!this.kernel?.intentBroker) return;
    return this.kernel.intentBroker.dispatch("shell", action, data);
  }

  public handleSlotAction(action: string, slot: string): void {
    if (action === "settings") {
      this.openSettings();
    } else if (action === "compose") {
      this.dispatchIntent("compose_note", {}).catch(() => {});
    }
  }

  public override async ensureWidgetsMounted(): Promise<void> {
    await super.ensureWidgetsMounted();
    this.renderWidgetsView();
  }

  // --- Mounting & Teardown ---

  public mount(): void {
    // 1. Inject Editorial Stylesheet
    mountShellStyles(EDITORIAL_SHELL_CSS);

    // 2. Set root classes
    if (typeof document !== "undefined") {
      document.documentElement.classList.remove("theme-panorama", "theme-classic");
      document.documentElement.classList.add("theme-editorial");
      document.body?.classList.remove("theme-panorama", "theme-classic");
      document.body?.classList.add("theme-editorial");
    }
    this.root.classList.add("editorial-shell-root", "theme-editorial");

    // 3. Render Skeleton Markup
    this.renderSkeleton();

    // 4. Cache Slot & Element References
    this.cacheElementReferences();
    this.initSlotContainers();

    // 5. Restore Theme Mode & Accent Color
    this.initThemeAndAccent();

    // 6. Restore Workspace & Pinned Plugins
    this.loadInitialWorkspace();

    // 7. Render Navigation Dock & Apps Index
    this.renderDock();
    this.renderAppsIndex();
    this.renderWidgetsView();

    // 8. Wire Interactive Listeners
    this.wireHeaderControls();
    this.wireDockEvents();
    this.wireAppsSearch();
    this.wireSettingsModal();
    this.wireShellManager();
    this.wireBackToTop();

    // 9. Initial View Selection
    this.selectInitialView();

    // 10. Pull-to-refresh
    this.initPullToRefresh();

    // 11. Listen for browser back / forward navigation & Escape key
    if (typeof window !== "undefined") {
      window.addEventListener("popstate", (e: PopStateEvent) => {
        const state = e.state;
        if (!state || state.type !== "omni-editorial-view") return;
        if (state.page === "app" && state.pluginId) {
          this.openApp(state.pluginId, false);
        } else if (state.page === "apps") {
          this.showAppsIndex(false);
        } else if (state.page === "widgets") {
          this.showWidgetsView(false);
        } else if (state.page === "settings") {
          this.openSettings(false);
        }
      });

      this.boundKeydownHandler = (e: KeyboardEvent) => {
        if (e.key === "Escape" || e.key === "Esc") {
          if (this.isAppFullscreen) {
            this.toggleAppFullscreen(false);
            return;
          }
          const settingsModal = document.querySelector("#editorial-settings-modal");
          if (settingsModal && (settingsModal.classList.contains("open") || (settingsModal as HTMLElement).style.display === "flex")) {
            this.closeSettings();
            return;
          }
          const profileDrawer = this.root.querySelector("#editorial-profile-drawer");
          if (profileDrawer?.classList.contains("open")) {
            profileDrawer.classList.remove("open");
            return;
          }
          const openWithModal = document.querySelector("#open-with-modal");
          if (openWithModal?.classList.contains("open")) {
            openWithModal.classList.remove("open");
          }
        }
      };
      window.addEventListener("keydown", this.boundKeydownHandler);
    }
  }

  public destroy(): void {
    if (this.boundScrollHandler) {
      this.root.removeEventListener("scroll", this.boundScrollHandler, { capture: true } as any);
      this.boundScrollHandler = null;
    }
    if (typeof window !== "undefined" && this.boundKeydownHandler) {
      window.removeEventListener("keydown", this.boundKeydownHandler);
      this.boundKeydownHandler = null;
    }
    if (this.mediaQueryDark && this.mediaQueryListener) {
      this.mediaQueryDark.removeEventListener("change", this.mediaQueryListener);
      this.mediaQueryListener = null;
    }
    if (typeof document !== "undefined") {
      document.documentElement.classList.remove("theme-editorial");
      document.body?.classList.remove("theme-editorial");
    }
    unmountShellStyles();
    this.root.innerHTML = "";
  }

  protected onWorkspaceUpdated(): void {
    this.renderDock();
    this.renderAppsIndex();
    this.renderWidgetsView();
    this.renderShellManager();
    this.renderPluginSettingsList();
  }

  // --- Theme Mode & Accent Illumination ---

  public getThemeMode(): EditorialThemeMode {
    return this.themeMode;
  }

  public setThemeMode(mode: EditorialThemeMode): void {
    this.themeMode = mode;
    try {
      localStorage.setItem(STORAGE_KEY_EDITORIAL_MODE, mode);
    } catch (_) {}

    this.applyThemeMode();
    this.updateThemeModeUi();
  }

  private initThemeAndAccent(): void {
    // Restore Theme Mode
    let savedMode: EditorialThemeMode = "system";
    try {
      const mode = localStorage.getItem(STORAGE_KEY_EDITORIAL_MODE);
      if (mode === "light" || mode === "dark" || mode === "system") {
        savedMode = mode;
      }
    } catch (_) {}
    this.themeMode = savedMode;

    // Listen to OS theme changes if in system mode
    if (typeof window !== "undefined" && window.matchMedia) {
      this.mediaQueryDark = window.matchMedia("(prefers-color-scheme: dark)");
      this.mediaQueryListener = () => {
        if (this.themeMode === "system") {
          this.applyThemeMode();
        }
      };
      this.mediaQueryDark.addEventListener("change", this.mediaQueryListener);
    }

    this.applyThemeMode();
    this.updateThemeModeUi();

    // Restore Accent Color
    this.restoreSavedAccent();
  }

  private applyThemeMode(): void {
    const isDark =
      this.themeMode === "dark" ||
      (this.themeMode === "system" &&
        (typeof window !== "undefined" && window.matchMedia
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
          : false));

    const resolvedMode = isDark ? "dark" : "light";

    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme-mode", resolvedMode);
      document.body?.setAttribute("data-theme-mode", resolvedMode);
      try {
        document.documentElement.style.colorScheme = resolvedMode;
        if (document.body) {
          document.body.style.backgroundColor = isDark ? "#1c1b20" : "#fbfbf9";
          document.body.style.color = isDark ? "#e5e1e4" : "#0f172a";
        }
        document.documentElement.style.backgroundColor = isDark ? "#1c1b20" : "#fbfbf9";
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
          metaThemeColor.setAttribute("content", isDark ? "#1c1b20" : "#fbfbf9");
        }
      } catch (_) {}
    }
    this.root.setAttribute("data-theme-mode", resolvedMode);

    // Re-apply accent color for current mode
    this.applyAccentVariables();
  }

  public toggleAppFullscreen(fullscreen?: boolean): void {
    this.isAppFullscreen = typeof fullscreen === "boolean" ? fullscreen : !this.isAppFullscreen;
    if (this.isAppFullscreen) {
      this.root.classList.add("app-fullscreen");
    } else {
      this.root.classList.remove("app-fullscreen");
    }
    const btn = this.root.querySelector("#btn-editorial-toggle-fullscreen");
    if (btn) {
      btn.classList.toggle("active", this.isAppFullscreen);
    }
  }

  private updateThemeModeUi(): void {
    const btns = this.root.querySelectorAll(".editorial-mode-btn");
    btns.forEach((btn) => {
      const mode = (btn as HTMLElement).dataset.mode;
      if (mode === this.themeMode) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  public setAccent(presetId: string, customColor?: string): void {
    if (presetId === "custom" && customColor) {
      try {
        localStorage.setItem(STORAGE_KEY_EDITORIAL_ACCENT_ID, "custom");
        localStorage.setItem(STORAGE_KEY_EDITORIAL_ACCENT_COLOR, customColor);
        localStorage.setItem(STORAGE_KEY_EDITORIAL_ACCENT_NAME, "Custom");
      } catch (_) {}
    } else {
      const preset = EDITORIAL_ACCENTS.find((a) => a.id === presetId) || EDITORIAL_ACCENTS[0];
      try {
        localStorage.setItem(STORAGE_KEY_EDITORIAL_ACCENT_ID, preset.id);
        localStorage.removeItem(STORAGE_KEY_EDITORIAL_ACCENT_COLOR);
        localStorage.setItem(STORAGE_KEY_EDITORIAL_ACCENT_NAME, preset.name);
      } catch (_) {}
    }

    this.applyAccentVariables();
    this.updateAccentUi();
  }

  private restoreSavedAccent(): void {
    this.applyAccentVariables();
    this.updateAccentUi();
  }

  private applyAccentVariables(): void {
    let accentId = "cobalt";
    let customColor: string | null = null;

    try {
      accentId = localStorage.getItem(STORAGE_KEY_EDITORIAL_ACCENT_ID) || "cobalt";
      customColor = localStorage.getItem(STORAGE_KEY_EDITORIAL_ACCENT_COLOR);
    } catch (_) {}

    const isDark = this.root.getAttribute("data-theme-mode") === "dark";
    let colorToApply = "#1e40af";

    if (accentId === "custom" && customColor) {
      colorToApply = customColor;
    } else {
      const preset = EDITORIAL_ACCENTS.find((a) => a.id === accentId) || EDITORIAL_ACCENTS[0];
      colorToApply = isDark ? preset.darkColor : preset.lightColor;
    }

    const isLightText = isDark && (accentId === "saffron" || accentId === "bone" || colorToApply.toLowerCase() === "#e5e1e4" || colorToApply.toLowerCase() === "#f59e0b" || colorToApply.toLowerCase() === "#e8a838");
    const contrastColor = isLightText ? "#141312" : "#ffffff";

    this.root.style.setProperty("--omni-accent-primary", colorToApply);
    this.root.style.setProperty("--accent-primary", colorToApply);
    this.root.style.setProperty("--omni-accent-contrast", contrastColor);
    this.root.style.setProperty("--omni-border-focus", colorToApply);
    this.root.style.setProperty("--omni-status-online", colorToApply);
    this.root.style.setProperty("--omni-status-badge", colorToApply);

    if (typeof document !== "undefined") {
      document.documentElement.style.setProperty("--omni-accent-primary", colorToApply);
      document.documentElement.style.setProperty("--accent-primary", colorToApply);
    }
  }

  private updateAccentUi(): void {
    let currentId = "cobalt";
    let customColor: string | null = null;
    let currentName = "Cobalt Glow";

    try {
      currentId = localStorage.getItem(STORAGE_KEY_EDITORIAL_ACCENT_ID) || "cobalt";
      customColor = localStorage.getItem(STORAGE_KEY_EDITORIAL_ACCENT_COLOR);
      currentName = localStorage.getItem(STORAGE_KEY_EDITORIAL_ACCENT_NAME) || "Cobalt Glow";
    } catch (_) {}

    const labelEl = this.root.querySelector("#editorial-active-accent-name");
    if (labelEl) labelEl.textContent = currentName;

    const isDark = this.root.getAttribute("data-theme-mode") === "dark";
    const swatchItems = this.root.querySelectorAll(".editorial-swatch-item");
    swatchItems.forEach((item) => {
      const sid = (item as HTMLElement).dataset.accentId;
      const preset = EDITORIAL_ACCENTS.find((a) => a.id === sid);
      if (preset) {
        const circle = item.querySelector(".editorial-swatch-circle") as HTMLElement | null;
        if (circle) {
          circle.style.backgroundColor = isDark ? preset.darkColor : preset.lightColor;
        }
      }
      if (sid === currentId) {
        item.classList.add("active");
        const check = item.querySelector(".editorial-swatch-check");
        if (check) (check as HTMLElement).style.display = "flex";
      } else {
        item.classList.remove("active");
        const check = item.querySelector(".editorial-swatch-check");
        if (check) (check as HTMLElement).style.display = "none";
      }
    });

    const customInput = this.root.querySelector("#editorial-custom-accent-color") as HTMLInputElement | null;
    if (customInput && customColor) {
      customInput.value = customColor;
    }
  }

  // --- Dynamic Dock Navigation & Viewport Reparenting ---

  public getPinnedPlugins(): InstalledPluginEntry[] {
    return this.installedPlugins.filter((p) => {
      if (p.enabled === false) return false;
      if (p.pinned !== undefined) return p.pinned;
      const placements = this.getPluginPlacements(p);
      return placements.some((pl) => pl.viewport === "dock" || pl.viewport === "main");
    });
  }

  public renderDock(): void {
    if (!this.dockContainer) return;
    this.dockContainer.innerHTML = "";

    const pinned = this.getPinnedPlugins();

    for (const plugin of pinned) {
      const isActive = this.activePage === "app" && this.activePluginId === plugin.id;
      const item = document.createElement("button");
      item.className = `editorial-dock-item ${isActive ? "active" : ""}`;
      item.dataset.pluginId = plugin.id;
      item.title = plugin.name || plugin.id;

      const iconKey = (plugin.icon as IconName) || "apps";
      const iconMarkup = ICONS[iconKey] ? icon(iconKey, 20) : icon("apps", 20);

      item.innerHTML = `
        <div class="editorial-dock-icon">${iconMarkup}</div>
        <span class="editorial-dock-label">${plugin.displayName || plugin.name || "App"}</span>
        <span class="editorial-active-dot"></span>
      `;

      item.addEventListener("click", () => {
        this.openApp(plugin.id);
      });

      this.dockContainer.appendChild(item);
    }

    // Apps (All Applications) Button
    const btnApps = document.createElement("button");
    const isAppsActive = this.activePage === "apps";
    btnApps.className = `editorial-dock-item ${isAppsActive ? "active" : ""}`;
    btnApps.id = "btn-editorial-dock-apps";
    btnApps.title = "Applications";
    btnApps.innerHTML = `
      <div class="editorial-dock-icon">${icon("apps", 20)}</div>
      <span class="editorial-dock-label">Apps</span>
      <span class="editorial-active-dot"></span>
    `;
    btnApps.addEventListener("click", () => this.showAppsIndex());
    this.dockContainer.appendChild(btnApps);

    // Cards (Widgets) Button
    const btnWidgets = document.createElement("button");
    const isWidgetsActive = this.activePage === "widgets";
    btnWidgets.className = `editorial-dock-item ${isWidgetsActive ? "active" : ""}`;
    btnWidgets.id = "btn-editorial-dock-widgets";
    btnWidgets.title = "Companion Cards";
    btnWidgets.innerHTML = `
      <div class="editorial-dock-icon">${icon("layout", 20)}</div>
      <span class="editorial-dock-label">Widgets</span>
      <span class="editorial-active-dot"></span>
    `;
    btnWidgets.addEventListener("click", () => this.showWidgetsView());
    this.dockContainer.appendChild(btnWidgets);

    // Prefs Button
    const btnPrefs = document.createElement("button");
    btnPrefs.className = "editorial-dock-item";
    btnPrefs.id = "btn-editorial-dock-prefs";
    btnPrefs.title = "Preferences & Custody";
    btnPrefs.innerHTML = `
      <div class="editorial-dock-icon">${icon("settings", 20)}</div>
      <span class="editorial-dock-label">Settings</span>
      <span class="editorial-active-dot"></span>
    `;
    btnPrefs.addEventListener("click", () => this.openSettings());
    this.dockContainer.appendChild(btnPrefs);
  }

  public async openApp(pluginId: string, pushState = true): Promise<void> {
    const plugin = this.installedPlugins.find((p) => p.id === pluginId);
    if (!plugin) return;

    if (pushState && typeof window !== "undefined" && (this.activePluginId !== pluginId || this.activePage !== "app")) {
      try {
        window.history.pushState({ type: "omni-editorial-view", page: "app", pluginId }, "");
      } catch (_) {}
    }

    this.activePage = "app";
    this.activePluginId = pluginId;

    // Update Header Title & Subtitle
    this.updateHeaderSubtitle(plugin.displayName || plugin.name || "App");

    // Hide Index & Cards Viewports
    const pageApps = this.root.querySelector("#editorial-page-apps") as HTMLElement | null;
    const pageWidgets = this.root.querySelector("#editorial-page-widgets") as HTMLElement | null;
    if (pageApps) {
      pageApps.classList.remove("active");
      pageApps.style.display = "none";
    }
    if (pageWidgets) {
      pageWidgets.classList.remove("active");
      pageWidgets.style.display = "none";
    }

    // Hide all application viewports
    const defaultPage = this.root.querySelector("#editorial-page-app") as HTMLElement | null;
    const allAppPages = this.root.querySelectorAll<HTMLElement>(".editorial-app-page");

    allAppPages.forEach((p) => {
      p.classList.remove("active");
      p.style.display = "none";
    });
    if (defaultPage) {
      defaultPage.classList.remove("active");
      defaultPage.style.display = "none";
    }

    this.root.classList.add("has-active-app");

    const targetContainer = this.ensureAppContainer(pluginId);
    const targetPage = targetContainer.closest(".editorial-viewport-page") as HTMLElement | null;
    if (targetPage) {
      targetPage.classList.add("active");
      targetPage.style.display = "flex";
    }

    const btnFs = this.root.querySelector("#btn-editorial-toggle-fullscreen") as HTMLElement | null;
    if (btnFs) {
      btnFs.style.display = "flex";
    }

    // Ensure the nsite is mounted and its component is projected into targetContainer
    const appInstanceKey = `${plugin.id}::app`;
    const placements = this.getPluginPlacements(plugin);
    const runningMainPlacement = placements.find(
      (pl) => pl.enabled !== false && (pl.viewport === "main" || pl.viewport === "dock") && this.kernel.getSandbox(`${plugin.id}::${pl.id}`)
    );
    const directSandbox = this.kernel.getSandbox(plugin.id);
    const appSandbox = this.kernel.getSandbox(appInstanceKey);

    if (runningMainPlacement) {
      const sb = this.kernel.getSandbox(`${plugin.id}::${runningMainPlacement.id}`);
      const liveComp = sb?.getFirstPopulatedComponentContainer();
      if (liveComp && !targetContainer.contains(liveComp)) {
        this.kernel.reparentLiveComponent(`${plugin.id}::${runningMainPlacement.id}`, targetContainer);
      }
    } else if (directSandbox) {
      const liveComp = directSandbox.getFirstPopulatedComponentContainer();
      if (liveComp && !targetContainer.contains(liveComp)) {
        this.kernel.reparentLiveComponent(plugin.id, targetContainer);
      }
    } else if (appSandbox) {
      const liveComp = appSandbox.getFirstPopulatedComponentContainer();
      if (liveComp && !targetContainer.contains(liveComp)) {
        this.kernel.reparentLiveComponent(appInstanceKey, targetContainer);
      }
    } else {
      const hasMainPlacement = placements.some((pl) => pl.enabled !== false && (pl.viewport === "main" || pl.viewport === "dock"));
      if (hasMainPlacement) {
        if (!this.pendingAppMounts.has(plugin.id)) {
          this.pendingAppMounts.add(plugin.id);
          try {
            await this.mountPlugin(plugin);
          } catch (err) {
            console.warn(`Failed to mount plugin ${plugin.id}:`, err);
          } finally {
            this.pendingAppMounts.delete(plugin.id);
          }
        }
      } else {
        if (!this.pendingAppMounts.has(appInstanceKey)) {
          this.pendingAppMounts.add(appInstanceKey);
          try {
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
            customSlotContainers.set("main", targetContainer);
            customSlotContainers.set("sidebar", targetContainer);
            if (synthManifest.components) {
              for (const comp of synthManifest.components) {
                if (comp.slot) customSlotContainers.set(comp.slot, targetContainer);
              }
            }
            const activePubkey = typeof localStorage !== "undefined" ? localStorage.getItem("omni_active_profile_pubkey") || "" : "";
            await this.kernel.registerPlugin(
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
            );
          } catch (err) {
            console.warn(`Failed to register app instance for ${plugin.id}:`, err);
          } finally {
            this.pendingAppMounts.delete(appInstanceKey);
          }
        }
      }
    }

    this.renderDock();
    this.saveLocalWorkspace();
    this.boundScrollHandler?.();
  }

  public showAppsIndex(pushState = true): void {
    if (pushState && typeof window !== "undefined" && this.activePage !== "apps") {
      try {
        window.history.pushState({ type: "omni-editorial-view", page: "apps" }, "");
      } catch (_) {}
    }

    this.activePage = "apps";
    this.activePluginId = null;
    this.root.classList.remove("has-active-app");
    if (this.isAppFullscreen) this.toggleAppFullscreen(false);
    const btnFsApps = this.root.querySelector("#btn-editorial-toggle-fullscreen") as HTMLElement | null;
    if (btnFsApps) btnFsApps.style.display = "none";

    this.updateHeaderSubtitle("Apps");

    const pageApps = this.root.querySelector("#editorial-page-apps") as HTMLElement | null;
    const pageWidgets = this.root.querySelector("#editorial-page-widgets") as HTMLElement | null;
    const pageApp = this.root.querySelector("#editorial-page-app") as HTMLElement | null;
    const allAppPages = this.root.querySelectorAll<HTMLElement>(".editorial-app-page");

    if (pageApps) {
      pageApps.classList.add("active");
      pageApps.style.display = "block";
    }
    if (pageWidgets) {
      pageWidgets.classList.remove("active");
      pageWidgets.style.display = "none";
    }
    if (pageApp) {
      pageApp.classList.remove("active");
      pageApp.style.display = "none";
    }
    allAppPages.forEach((p) => {
      p.classList.remove("active");
      p.style.display = "none";
    });

    this.renderDock();
    this.renderAppsIndex();
    this.boundScrollHandler?.();
  }

  public showWidgetsView(pushState = true): void {
    if (pushState && typeof window !== "undefined" && this.activePage !== "widgets") {
      try {
        window.history.pushState({ type: "omni-editorial-view", page: "widgets" }, "");
      } catch (_) {}
    }

    this.activePage = "widgets";
    this.activePluginId = null;
    this.root.classList.remove("has-active-app");
    if (this.isAppFullscreen) this.toggleAppFullscreen(false);
    const btnFsWidgets = this.root.querySelector("#btn-editorial-toggle-fullscreen") as HTMLElement | null;
    if (btnFsWidgets) btnFsWidgets.style.display = "none";

    this.updateHeaderSubtitle("Cards");

    const pageApps = this.root.querySelector("#editorial-page-apps") as HTMLElement | null;
    const pageWidgets = this.root.querySelector("#editorial-page-widgets") as HTMLElement | null;
    const pageApp = this.root.querySelector("#editorial-page-app") as HTMLElement | null;
    const allAppPages = this.root.querySelectorAll<HTMLElement>(".editorial-app-page");

    if (pageWidgets) {
      pageWidgets.classList.add("active");
      pageWidgets.style.display = "block";
    }
    if (pageApps) {
      pageApps.classList.remove("active");
      pageApps.style.display = "none";
    }
    if (pageApp) {
      pageApp.classList.remove("active");
      pageApp.style.display = "none";
    }
    allAppPages.forEach((p) => {
      p.classList.remove("active");
      p.style.display = "none";
    });

    this.renderDock();
    this.ensureWidgetsMounted().catch(console.warn);
    this.renderWidgetsView();
    this.boundScrollHandler?.();
  }

  private updateHeaderSubtitle(sub: string): void {
    const subtitleEl = this.root.querySelector("#editorial-view-subtitle");
    if (subtitleEl) subtitleEl.textContent = sub;
  }

  public async ensurePinnedAppsMounted(): Promise<void> {
    const pinned = this.getPinnedPlugins();
    for (const plugin of pinned) {
      if (!plugin.enabled) continue;
      const placements = this.getPluginPlacements(plugin);
      const hasRunning = placements.some((pl) => Boolean(this.kernel.getSandbox(`${plugin.id}::${pl.id}`))) ||
        Boolean(this.kernel.getSandbox(plugin.id)) ||
        Boolean(this.kernel.getSandbox(`${plugin.id}::app`));

      if (!hasRunning) {
        try {
          const targetContainer = this.ensureAppContainer(plugin.id);
          const hasMainPlacement = placements.some((pl) => pl.enabled !== false && (pl.viewport === "main" || pl.viewport === "dock"));
          if (hasMainPlacement) {
            await this.mountPlugin(plugin);
          } else {
            const appInstanceKey = `${plugin.id}::app`;
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
            customSlotContainers.set("main", targetContainer);
            customSlotContainers.set("sidebar", targetContainer);
            await this.kernel.registerPlugin(
              appManifest,
              plugin.htmlContent || plugin.scriptContent,
              customSlotContainers,
              {
                instanceId: appInstanceKey,
                route: "",
                viewId: "main",
                targetSlot: "main",
                relays: plugin.relays
              }
            );
          }
        } catch (err) {
          console.warn(`Could not pre-mount pinned plugin ${plugin.id}:`, err);
        }
      }
    }
  }

  private selectInitialView(): void {
    const pinned = this.getPinnedPlugins();
    if (pinned.length > 0) {
      this.openApp(pinned[0].id);
    } else if (this.installedPlugins.length > 0) {
      this.openApp(this.installedPlugins[0].id);
    } else {
      this.showAppsIndex();
    }
    this.ensurePinnedAppsMounted().catch(console.warn);
  }

  // --- Broadsheet Applications Index ---

  public renderAppsIndex(): void {
    const pinnedGrid = this.root.querySelector("#editorial-pinned-apps-grid");
    const allGrid = this.root.querySelector("#editorial-all-apps-grid");
    if (!pinnedGrid || !allGrid) return;

    pinnedGrid.innerHTML = "";
    allGrid.innerHTML = "";

    const filterInput = this.root.querySelector("#editorial-apps-search-input") as HTMLInputElement | null;
    const query = filterInput?.value.trim().toLowerCase() || "";

    const filtered = this.installedPlugins.filter((p) => {
      if (!query) return true;
      const n = (p.name || p.id).toLowerCase();
      const d = (p.description || "").toLowerCase();
      return n.includes(query) || d.includes(query);
    });

    const pinnedList = filtered.filter((p) => p.pinned !== false);
    const unpinnedList = filtered.filter((p) => p.pinned === false);

    const renderCard = (plugin: InstalledPluginEntry, container: Element) => {
      const card = document.createElement("div");
      card.className = "editorial-plate-card";
      const iconKey = (plugin.icon as IconName) || "apps";

      card.innerHTML = `
        <div class="editorial-plate-card-header">
          <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
            <div class="editorial-plate-card-icon">
              ${ICONS[iconKey] ? icon(iconKey, 18) : icon("apps", 18)}
            </div>
            <div style="min-width: 0;">
              <div class="editorial-plate-card-name" style="text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                ${plugin.displayName || plugin.name || plugin.id}
              </div>
              <div style="font-family: var(--omni-font-mono); font-size: 0.65rem; color: var(--omni-text-muted);">
                v${plugin.version || "1.0.0"}
              </div>
            </div>
          </div>
          <button class="editorial-btn-secondary btn-toggle-pin" style="font-size: 0.65rem; padding: 3px 8px; flex-shrink: 0;">
            ${plugin.pinned !== false ? "Unpin" : "Pin"}
          </button>
        </div>
        <p class="editorial-plate-card-desc">${plugin.description || "Decentralized micro-frontend application."}</p>
      `;

      card.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest(".btn-toggle-pin")) return;
        this.openApp(plugin.id);
      });

      card.querySelector(".btn-toggle-pin")?.addEventListener("click", (e) => {
        e.stopPropagation();
        plugin.pinned = plugin.pinned === false;
        this.saveLocalWorkspace();
        this.renderDock();
        this.renderAppsIndex();
      });

      container.appendChild(card);
    };

    pinnedList.forEach((p) => renderCard(p, pinnedGrid));
    unpinnedList.forEach((p) => renderCard(p, allGrid));

    const pinnedCount = this.root.querySelector("#editorial-pinned-count");
    if (pinnedCount) pinnedCount.textContent = `${pinnedList.length} pinned`;

    const allCount = this.root.querySelector("#editorial-all-count");
    if (allCount) allCount.textContent = `${unpinnedList.length} unpinned`;
  }

  // --- Companion Widgets View ---

  public renderWidgetsView(): void {
    if (!this.widgetsSlot) return;
    const widgetPlugins = this.installedPlugins.filter((p) => {
      const placements = this.getPluginPlacements(p);
      return placements.some((pl) => pl.viewport === "sidebar" || pl.viewport === "widget");
    });

    const emptyNotice = this.root.querySelector("#editorial-widgets-empty");
    if (widgetPlugins.length === 0) {
      if (emptyNotice) (emptyNotice as HTMLElement).style.display = "flex";
    } else {
      if (emptyNotice) (emptyNotice as HTMLElement).style.display = "none";
    }
  }

  // --- Wire Interactive Controls ---

  private wireHeaderControls(): void {
    const btnSearch = this.root.querySelector("#btn-editorial-search");
    btnSearch?.addEventListener("click", () => {
      this.dispatchIntent("search", {}).catch(() => {});
    });

    const headerBrand = this.root.querySelector("#editorial-brand-container");
    headerBrand?.addEventListener("click", () => {
      this.showAppsIndex();
    });

    const btnSettings = this.root.querySelector("#btn-editorial-settings");
    btnSettings?.addEventListener("click", () => {
      this.openSettings();
    });

    const btnProfile = this.root.querySelector("#btn-editorial-profile-toggle");
    btnProfile?.addEventListener("click", () => {
      this.dispatchIntent("view_profile", {}).catch(() => {});
    });

    const btnFullscreen = this.root.querySelector("#btn-editorial-toggle-fullscreen");
    btnFullscreen?.addEventListener("click", () => {
      this.toggleAppFullscreen();
    });

    const btnExitFullscreen = this.root.querySelector("#btn-editorial-exit-fullscreen");
    btnExitFullscreen?.addEventListener("click", () => {
      this.toggleAppFullscreen(false);
    });
  }

  private wireDockEvents(): void {
    // Dock item clicks are handled during dynamic dock rendering
  }

  private wireAppsSearch(): void {
    const searchInput = this.root.querySelector("#editorial-apps-search-input") as HTMLInputElement | null;
    searchInput?.addEventListener("input", () => {
      this.renderAppsIndex();
    });
  }

  // --- Settings & Preferences Modal ---

  public openSettings(pushState = true): void {
    if (pushState && typeof window !== "undefined") {
      try {
        window.history.pushState({ type: "omni-editorial-view", page: "settings" }, "");
      } catch (_) {}
    }
    const modal = this.root.querySelector("#editorial-settings-modal");
    modal?.classList.add("open");
    this.renderPluginSettingsList();
    this.renderShellManager();
  }

  public closeSettings(pushState = true): void {
    const modal = this.root.querySelector("#editorial-settings-modal");
    modal?.classList.remove("open");
    if (pushState && typeof window !== "undefined" && window.history.state?.page === "settings") {
      try {
        window.history.back();
      } catch (_) {}
    }
  }

  private wireSettingsModal(): void {
    const modal = this.root.querySelector("#editorial-settings-modal");
    const btnClose = this.root.querySelector("#btn-editorial-close-settings");

    btnClose?.addEventListener("click", () => this.closeSettings());
    modal?.addEventListener("click", (e) => {
      if (e.target === modal) this.closeSettings();
    });

    // Settings Navigation Tabs
    const tabs = this.root.querySelectorAll(".editorial-settings-tab-btn");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const tabKey = (tab as HTMLElement).dataset.tab;
        if (!tabKey) return;
        tabs.forEach((t) => t.classList.toggle("active", t === tab));
        const panels = this.root.querySelectorAll(".editorial-settings-tab-panel");
        panels.forEach((p) => {
          const isMatch = p.id === `panel-editorial-${tabKey}`;
          p.classList.toggle("active", isMatch);
          (p as HTMLElement).style.display = isMatch ? "flex" : "none";
        });
      });
    });

    // Theme Mode buttons
    const modeBtns = this.root.querySelectorAll(".editorial-mode-btn");
    modeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = (btn as HTMLElement).dataset.mode as EditorialThemeMode;
        if (mode) this.setThemeMode(mode);
      });
    });

    // Accent Swatches
    const swatchBtns = this.root.querySelectorAll(".editorial-swatch-item");
    swatchBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const aid = (btn as HTMLElement).dataset.accentId;
        if (aid) this.setAccent(aid);
      });
    });

    // Custom Accent Color input
    const customInput = this.root.querySelector("#editorial-custom-accent-color") as HTMLInputElement | null;
    customInput?.addEventListener("input", (e) => {
      const color = (e.target as HTMLInputElement).value;
      this.setAccent("custom", color);
    });

    // Cloud Workspace Sync
    const btnSync = this.root.querySelector("#btn-editorial-sync-workspace");
    btnSync?.addEventListener("click", async () => {
      try {
        await this.syncWorkspaceToNostr();
        alert("Workspace synced to Nostr relays!");
      } catch (err: any) {
        alert(`Sync failed: ${err.message || String(err)}`);
      }
    });
  }

  // --- Installed Shells Manager in Editorial ---

  public renderShellManager(): void {
    const shellsList = this.root.querySelector("#editorial-installed-shells-list");
    const countBadge = this.root.querySelector("#editorial-shell-count-badge");
    if (!shellsList) return;

    const shells = shellRegistry.list();
    const currentActive = shellRegistry.getActiveShellId();

    if (countBadge) {
      countBadge.textContent = `${shells.length} installed`;
    }

    shellsList.innerHTML = "";

    for (const s of shells) {
      const isActive = currentActive === s.id;
      const isBuiltin = s.isBuiltin !== false;

      const card = document.createElement("div");
      card.className = "editorial-pref-card";
      card.style.cssText = `border: 1px solid ${isActive ? "var(--omni-accent-primary)" : "var(--omni-border-subtle)"};`;

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 32px; height: 32px; background: var(--omni-bg-elevated); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-sm); display: flex; align-items: center; justify-content: center; color: var(--omni-accent-primary); flex-shrink: 0;">
              ${s.icon && ICONS[s.icon as IconName] ? icon(s.icon as IconName, 18) : icon("layout", 18)}
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <strong style="font-family: var(--omni-font-serif); font-size: 0.95rem; color: var(--omni-text-primary);">${s.name}</strong>
                ${isActive ? `<span style="font-family: var(--omni-font-mono); font-size: 0.62rem; font-weight: 700; text-transform: uppercase; padding: 1px 6px; background: var(--omni-accent-primary); color: #fff; border-radius: 2px;">Active</span>` : ""}
                ${!isBuiltin ? `<span style="font-family: var(--omni-font-mono); font-size: 0.62rem; text-transform: uppercase; padding: 1px 6px; background: var(--omni-bg-elevated); color: var(--omni-text-muted); border: 1px solid var(--omni-border-subtle); border-radius: 2px;">Custom</span>` : ""}
              </div>
              <div style="font-family: var(--omni-font-mono); font-size: 0.65rem; color: var(--omni-text-muted); margin-top: 2px;">
                ${s.author ? `by ${s.author}` : "Omni Core Team"} • v${s.version || "1.0.0"}
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            ${!isActive ? `
              <button class="editorial-btn-secondary btn-activate-shell" data-shell-id="${s.id}" style="color: var(--omni-accent-primary); border-color: var(--omni-accent-primary); font-size: 0.72rem; padding: 4px 8px;">
                Activate
              </button>
            ` : `
              <span style="font-family: var(--omni-font-mono); font-size: 0.68rem; color: var(--omni-accent-primary); font-weight: 600; padding: 4px 6px;">Current</span>
            `}
            ${!isBuiltin ? `
              <button class="editorial-btn-secondary btn-uninstall-shell" data-shell-id="${s.id}" style="color: #ff5555; border-color: #552222; font-size: 0.72rem; padding: 4px 8px;">
                Uninstall
              </button>
            ` : ""}
          </div>
        </div>
        <p style="font-family: var(--omni-font-sans); font-size: 0.78rem; color: var(--omni-text-secondary); margin: 0; line-height: 1.35;">${s.description}</p>
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

      shellsList.appendChild(card);
    }

    this.renderCuratedShellCatalog();
  }

  public renderCuratedShellCatalog(): void {
    const catalogContainer = this.root.querySelector("#editorial-curated-shell-catalog");
    if (!catalogContainer) return;
    catalogContainer.innerHTML = "";

    const curated = shellRegistry.getCuratedCatalog();
    const installed = shellRegistry.list();

    for (const c of curated) {
      const isInstalled = installed.some((s) => s.id === c.id);
      const isCurrentActive = shellRegistry.getActiveShellId() === c.id;

      const item = document.createElement("div");
      item.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--omni-bg-elevated); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-sm); gap: 10px;";
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
          <div style="width: 30px; height: 30px; background: var(--omni-bg-surface); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-sm); display: flex; align-items: center; justify-content: center; color: var(--omni-accent-primary); flex-shrink: 0;">
            ${c.icon && ICONS[c.icon as IconName] ? icon(c.icon as IconName, 16) : icon("layout", 16)}
          </div>
          <div style="min-width: 0;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <strong style="font-family: var(--omni-font-serif); font-size: 0.88rem; color: var(--omni-text-primary);">${c.name}</strong>
              <span style="font-family: var(--omni-font-mono); font-size: 0.65rem; color: var(--omni-text-muted);">v${c.version || "1.0.0"}</span>
            </div>
            <div style="font-family: var(--omni-font-sans); font-size: 0.72rem; color: var(--omni-text-muted); margin-top: 1px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
              ${c.description}
            </div>
          </div>
        </div>
        <div style="flex-shrink: 0;">
          ${isInstalled ? (
            isCurrentActive ? `
              <span style="font-family: var(--omni-font-mono); font-size: 0.68rem; color: var(--omni-accent-primary); font-weight: 600;">Active</span>
            ` : `
              <button class="editorial-btn-secondary btn-activate-curated-shell" data-shell-id="${c.id}" style="font-size: 0.72rem; padding: 3px 8px;">
                Activate
              </button>
            `
          ) : `
            <button class="editorial-btn-secondary btn-install-curated-shell" data-shell-id="${c.id}" style="color: var(--omni-accent-primary); border-color: var(--omni-accent-primary); font-size: 0.72rem; padding: 3px 8px;">
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

  private wireShellManager(): void {
    const modal = this.root.querySelector("#editorial-install-shell-modal");
    const btnOpen = this.root.querySelector("#btn-editorial-open-install-shell");
    const btnClose = this.root.querySelector("#btn-editorial-close-install-shell");

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
  }

  private wireBackToTop(): void {
    const backToTopBtn = this.root.querySelector("#editorial-back-to-top");

    this.boundScrollHandler = () => {
      const activePage = this.root.querySelector(".editorial-viewport-page.active") as HTMLElement | null;
      if (activePage && activePage.scrollTop > 200) {
        backToTopBtn?.classList.add("visible");
      } else {
        backToTopBtn?.classList.remove("visible");
      }
    };

    this.root.addEventListener("scroll", this.boundScrollHandler, { capture: true, passive: true });

    backToTopBtn?.addEventListener("click", () => {
      const activePage = this.root.querySelector(".editorial-viewport-page.active") as HTMLElement | null;
      if (activePage) {
        activePage.scrollTo({ top: 0, behavior: "smooth" });
      }
    });

    this.root.addEventListener("click", (e: Event) => {
      const topBtn = (e.target as Element)?.closest(".btn-feed-back-to-top, [data-action='scroll-top']");
      if (topBtn) {
        const page = topBtn.closest(".editorial-viewport-page") || (this.root.querySelector(".editorial-viewport-page.active") as HTMLElement | null);
        if (page) {
          (page as HTMLElement).scrollTo({ top: 0, behavior: "smooth" });
        }
      }
    });
  }

  // --- Installed Plugins Settings List ---

  private renderPluginSettingsList(): void {
    const container = this.root.querySelector("#editorial-plugins-settings-list");
    if (!container) return;
    container.innerHTML = "";

    const viewportOptions = this.getAvailableViewports();

    for (const plugin of this.installedPlugins) {
      const card = document.createElement("div");
      card.className = "editorial-pref-card";

      const iconKey = (plugin.icon as IconName) || "apps";
      const synthManifest = this.ensurePluginManifest(plugin);
      const pluginViews = synthManifest.views || [{ id: "main", title: "Default View", path: "" }];
      const safeId = plugin.id.replace(/[^a-zA-Z0-9_-]/g, "-");
      const isPinned = plugin.pinned !== false;

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 32px; height: 32px; background: var(--omni-bg-elevated); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-sm); display: flex; align-items: center; justify-content: center; color: var(--omni-accent-primary); flex-shrink: 0;">
              ${ICONS[iconKey] ? icon(iconKey, 18) : icon("apps", 18)}
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <strong style="font-family: var(--omni-font-serif); font-size: 0.95rem; color: var(--omni-text-primary);">${plugin.displayName || plugin.name || plugin.id}</strong>
                <span style="font-family: var(--omni-font-mono); font-size: 0.65rem; color: var(--omni-text-muted);">v${plugin.version || "1.0.0"}</span>
              </div>
              <div style="font-family: var(--omni-font-mono); font-size: 0.65rem; color: var(--omni-text-muted); margin-top: 1px;">${plugin.id}</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <button class="editorial-btn-secondary btn-toggle-pin-pref" style="font-size: 0.68rem; padding: 3px 8px;">
              ${isPinned ? "Pinned to Dock" : "Pin to Dock"}
            </button>
            <button class="editorial-btn-secondary btn-uninstall-plugin" style="color: #ff5555; border-color: #552222; font-size: 0.68rem; padding: 3px 8px;">
              Uninstall
            </button>
          </div>
        </div>
        <p style="font-family: var(--omni-font-sans); font-size: 0.78rem; color: var(--omni-text-secondary); margin: 0;">${plugin.description || "Micro-frontend plugin."}</p>
      `;

      card.querySelector(".btn-toggle-pin-pref")?.addEventListener("click", () => {
        plugin.pinned = plugin.pinned === false;
        this.saveLocalWorkspace();
        this.renderDock();
        this.renderAppsIndex();
        this.renderPluginSettingsList();
      });

      card.querySelector(".btn-uninstall-plugin")?.addEventListener("click", () => {
        if (confirm(`Uninstall ${plugin.name || plugin.id}?`)) {
          this.uninstallPlugin(plugin.id);
          this.renderPluginSettingsList();
          this.renderDock();
          this.renderAppsIndex();
          this.renderWidgetsView();
        }
      });

      // 1. Placements & Viewports Section
      const placementsBox = document.createElement("div");
      placementsBox.className = "plugin-placements-section";

      const placementsHeader = document.createElement("div");
      placementsHeader.style.cssText = "display: flex; justify-content: space-between; align-items: center;";

      const placementsTitle = document.createElement("span");
      placementsTitle.style.cssText = "font-family: var(--omni-font-mono); font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--omni-text-primary);";
      placementsTitle.textContent = "Placements & Viewports";
      placementsHeader.appendChild(placementsTitle);

      const btnAddPlacement = document.createElement("button");
      btnAddPlacement.className = "editorial-btn-secondary btn-add-placement";
      btnAddPlacement.id = `btn-add-placement-${safeId}`;
      btnAddPlacement.style.cssText = "font-size: 0.68rem; padding: 3px 8px;";
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
        this.saveLocalWorkspace();
        await this.remountPlugin(plugin);
        this.renderPluginSettingsList();
        this.renderDock();
        this.renderAppsIndex();
        this.renderWidgetsView();
      });
      placementsHeader.appendChild(btnAddPlacement);
      placementsBox.appendChild(placementsHeader);

      const placements = this.getPluginPlacements(plugin);
      if (placements.length === 0) {
        const emptyPl = document.createElement("div");
        emptyPl.style.cssText = "font-family: var(--omni-font-mono); font-size: 0.68rem; color: var(--omni-text-muted); font-style: italic;";
        emptyPl.textContent = "Unassigned — Not currently placed in any viewport.";
        placementsBox.appendChild(emptyPl);
      }

      for (let plIdx = 0; plIdx < placements.length; plIdx++) {
        const pl = placements[plIdx];
        const row = document.createElement("div");
        row.className = "plugin-placement-row";

        const rowHeader = document.createElement("div");
        rowHeader.style.cssText = "display: flex; align-items: center; justify-content: space-between;";

        const plNumber = document.createElement("span");
        plNumber.style.cssText = "font-family: var(--omni-font-mono); font-size: 0.7rem; font-weight: 700; color: var(--omni-text-primary); text-transform: uppercase;";
        plNumber.textContent = `Placement #${plIdx + 1}`;
        rowHeader.appendChild(plNumber);

        const btnRemovePl = document.createElement("button");
        btnRemovePl.className = "editorial-btn-secondary btn-remove-placement";
        btnRemovePl.style.cssText = "font-size: 0.65rem; padding: 2px 6px; color: #ff5555; border-color: #552222;";
        btnRemovePl.textContent = placements.length > 1 ? "Remove" : "Unassign";
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
            this.layoutManager?.unregisterPlugin(plugin.id);
          }
          this.saveLocalWorkspace();
          await this.remountPlugin(plugin);
          this.renderPluginSettingsList();
          this.renderDock();
          this.renderAppsIndex();
          this.renderWidgetsView();
        });
        rowHeader.appendChild(btnRemovePl);
        row.appendChild(rowHeader);

        const fieldsGrid = document.createElement("div");
        fieldsGrid.className = "plugin-placement-fields";

        // Viewport Column
        const vpCol = document.createElement("label");
        vpCol.style.cssText = "display: flex; flex-direction: column; gap: 4px; font-family: var(--omni-font-mono); font-size: 0.65rem; color: var(--omni-text-muted); text-transform: uppercase;";
        const vpLabel = document.createElement("span");
        vpLabel.textContent = "Viewport";
        vpCol.appendChild(vpLabel);

        const vpSelect = document.createElement("select");
        vpSelect.className = "plugin-viewport-select";

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
          if (primaryComp && this.layoutManager) {
            this.layoutManager.setComponentSlot(plugin.id, primaryComp.id, pl.viewport);
          }
          this.saveLocalWorkspace();
          await this.remountPlugin(plugin);
          this.renderDock();
          this.renderAppsIndex();
          this.renderWidgetsView();
        });
        vpCol.appendChild(vpSelect);
        fieldsGrid.appendChild(vpCol);

        // Route Column
        const routeCol = document.createElement("label");
        routeCol.style.cssText = "display: flex; flex-direction: column; gap: 4px; font-family: var(--omni-font-mono); font-size: 0.65rem; color: var(--omni-text-muted); text-transform: uppercase;";
        const routeLabel = document.createElement("span");
        routeLabel.textContent = "View / Route";
        routeCol.appendChild(routeLabel);

        const routeSelect = document.createElement("select");
        routeSelect.className = "plugin-route-select";

        for (const v of pluginViews) {
          const opt = document.createElement("option");
          opt.value = v.path || "";
          opt.textContent = `${v.title || v.id} (${v.path || "/"})`;
          if ((v.path || "") === (pl.route || "")) opt.selected = true;
          routeSelect.appendChild(opt);
        }

        routeSelect.addEventListener("change", async () => {
          pl.route = routeSelect.value;
          const matchedView = pluginViews.find((v: any) => (v.path || "") === pl.route);
          if (matchedView) pl.viewId = matchedView.id;
          plugin.route = pl.route;
          plugin.viewId = pl.viewId;
          this.saveLocalWorkspace();
          await this.remountPlugin(plugin);
        });
        routeCol.appendChild(routeSelect);
        fieldsGrid.appendChild(routeCol);

        row.appendChild(fieldsGrid);
        placementsBox.appendChild(row);
      }
      card.appendChild(placementsBox);

      // 2. Custom Plugin Settings View (e.g. for Feed filtering)
      const settingsView = pluginViews.find((v: any) => v.id === "settings" || v.path?.includes("view=settings"));
      if (settingsView && this.kernel?.mountPluginSettings) {
        const settingsBox = document.createElement("div");
        settingsBox.className = "plugin-custom-settings-container";

        const settingsHeader = document.createElement("div");
        settingsHeader.style.cssText = "display: flex; justify-content: space-between; align-items: center;";

        const settingsTitle = document.createElement("span");
        settingsTitle.style.cssText = "font-family: var(--omni-font-mono); font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--omni-text-primary);";
        settingsTitle.textContent = "Plugin Settings & Rules";
        settingsHeader.appendChild(settingsTitle);

        const btnToggleSettings = document.createElement("button");
        btnToggleSettings.className = "editorial-btn-secondary";
        btnToggleSettings.style.cssText = "font-size: 0.68rem; padding: 3px 8px; color: var(--omni-accent-primary); border-color: var(--omni-accent-primary);";
        btnToggleSettings.textContent = "Configure Settings";

        const mountContainer = document.createElement("div");
        mountContainer.style.cssText = "display: none; padding: 10px; background: var(--omni-bg-elevated); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-sm); margin-top: 6px;";

        btnToggleSettings.addEventListener("click", async () => {
          const isCurrentlyOpen = mountContainer.style.display !== "none";
          if (!isCurrentlyOpen) {
            mountContainer.style.display = "block";
            mountContainer.innerHTML = '<div style="font-family: var(--omni-font-mono); font-size: 0.72rem; color: var(--omni-text-muted);">Loading settings...</div>';
            try {
              await this.kernel.mountPluginSettings(
                plugin.id,
                synthManifest,
                plugin.htmlContent || plugin.scriptContent,
                mountContainer,
                settingsView.path || "?view=settings",
                plugin.relays
              );
              btnToggleSettings.textContent = "Close Settings";
            } catch (err: any) {
              console.error(`Failed to mount settings for ${plugin.id}:`, err);
              mountContainer.textContent = "Failed to load settings.";
              btnToggleSettings.textContent = "Configure Settings";
            }
          } else {
            this.kernel.destroyPluginSettings(plugin.id);
            mountContainer.style.display = "none";
            mountContainer.innerHTML = "";
            btnToggleSettings.textContent = "Configure Settings";
          }
        });

        settingsHeader.appendChild(btnToggleSettings);
        settingsBox.appendChild(settingsHeader);
        settingsBox.appendChild(mountContainer);
        card.appendChild(settingsBox);
      }

      container.appendChild(card);
    }
  }

  // --- HTML Skeleton Markup ---

  private renderSkeleton(): void {
    this.root.innerHTML = `
      <!-- 1. Fixed Editorial Header -->
      <header class="editorial-header">
        <div class="editorial-header-inner">
          <div class="editorial-header-left"></div>

          <div id="editorial-brand-container" class="editorial-header-center" title="Omni">
            <h1 class="editorial-brand-title">OMNI</h1>
            <span id="editorial-view-subtitle" class="editorial-view-subtitle">Feed</span>
          </div>

          <div class="editorial-header-right">
            <div id="editorial-header-actions-slot" style="display: flex; align-items: center; gap: 4px;"></div>
            <button id="btn-editorial-toggle-fullscreen" class="editorial-header-btn" title="Toggle Expansive Fullscreen" style="display: none;">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
              </svg>
            </button>
            <button id="btn-editorial-settings" class="editorial-header-btn" title="Preferences">
              ${icon("settings", 18)}
            </button>
            <div id="btn-editorial-profile-toggle" class="editorial-header-avatar" title="Active Profile">
              <span>Ω</span>
            </div>
          </div>
        </div>
      </header>

      <!-- Floating Exit Fullscreen Button -->
      <button id="btn-editorial-exit-fullscreen" class="editorial-floating-exit-fullscreen" title="Exit Fullscreen (Esc)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
        <span>Exit Fullscreen</span>
      </button>

      <!-- 2. Central Content Viewport -->
      <main class="editorial-main-content">
        <!-- Viewport A: Full App View -->
        <section id="editorial-page-app" class="editorial-viewport-page editorial-app-page active">
          <div id="editorial-main-app-container" class="editorial-app-container"></div>
        </section>

        <!-- Viewport B: Broadsheet Applications Index -->
        <section id="editorial-page-apps" class="editorial-viewport-page" style="padding: 20px 16px;">
          <div class="editorial-section-header">
            <h2 class="editorial-section-title">Applications</h2>
            <div class="editorial-section-meta">All Installed Apps • Pin to Dock or Launch Directly</div>
          </div>

          <!-- Apps Search -->
          <div style="margin-bottom: 20px;">
            <input
              id="editorial-apps-search-input"
              class="editorial-input-text"
              type="text"
              placeholder="Search applications..."
            />
          </div>

          <!-- Pinned to Dock Section -->
          <div style="margin-bottom: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <span class="editorial-pref-label">Pinned to Dock</span>
              <span id="editorial-pinned-count" class="editorial-pref-status">0 pinned</span>
            </div>
            <div id="editorial-pinned-apps-grid" class="editorial-apps-grid"></div>
          </div>

          <!-- All Apps Section -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <span class="editorial-pref-label">Unpinned Applications</span>
              <span id="editorial-all-count" class="editorial-pref-status">0 unpinned</span>
            </div>
            <div id="editorial-all-apps-grid" class="editorial-apps-grid"></div>
          </div>
        </section>

        <!-- Viewport C: Companion Cards (Widgets) -->
        <section id="editorial-page-widgets" class="editorial-viewport-page" style="padding: 20px 16px;">
          <div class="editorial-section-header">
            <h2 class="editorial-section-title">Companion Cards</h2>
            <div class="editorial-section-meta">Workspace Widgets</div>
          </div>

          <div id="editorial-widgets-empty" class="editorial-pref-card" style="align-items: center; text-align: center; padding: 32px 16px; display: none;">
            <div style="font-family: var(--omni-font-serif); font-size: 1.1rem; color: var(--omni-text-primary); margin-bottom: 4px;">No companion widgets active</div>
            <p style="font-family: var(--omni-font-sans); font-size: 0.82rem; color: var(--omni-text-muted); margin: 0; max-width: 320px;">
              Assign any installed application to the sidebar/widget slot in Preferences to view cards here.
            </p>
          </div>

          <div id="editorial-widgets-slot" style="display: flex; flex-direction: column; gap: 12px;"></div>
        </section>
      </main>

      <!-- 3. Fixed Editorial Bottom Dock -->
      <nav class="editorial-dock">
        <div id="editorial-dock-items" class="editorial-dock-inner"></div>
      </nav>

      <!-- Floating Back to Top Button -->
      <button id="editorial-back-to-top" class="editorial-back-to-top" title="Back to top" aria-label="Back to top">
        ${icon("arrow-up", 13)}
        <span>Top</span>
      </button>

      <!-- 4. Settings & Preferences Modal -->
      <div id="editorial-settings-modal" class="editorial-modal-overlay">
        <div class="editorial-modal-card">
          <div class="editorial-modal-header">
            <div>
              <h3 style="font-family: var(--omni-font-serif); font-size: 1.35rem; font-weight: 600; margin: 0;">Settings & Preferences</h3>
              <span style="font-family: var(--omni-font-mono); font-size: 0.68rem; color: var(--omni-text-muted); text-transform: uppercase; letter-spacing: 0.1em;">Appearance, Plugins, Viewports & Workspace</span>
            </div>
            <button id="btn-editorial-close-settings" class="editorial-header-btn">
              ${icon("close", 18)}
            </button>
          </div>

          <!-- Settings Tabbed Navigation -->
          <div class="editorial-settings-tabs-bar">
            <button class="editorial-settings-tab-btn active" data-tab="appearance" id="tab-editorial-appearance">
              <span>🎨 Appearance & Shells</span>
            </button>
            <button class="editorial-settings-tab-btn" data-tab="plugins" id="tab-editorial-plugins">
              <span>🧩 Installed Plugins</span>
            </button>
            <button class="editorial-settings-tab-btn" data-tab="workspace" id="tab-editorial-workspace">
              <span>☁️ Workspace & Relays</span>
            </button>
          </div>

          <div class="editorial-modal-body">
            <!-- Tab Panel 1: Appearance & Shells -->
            <div class="editorial-settings-tab-panel active" id="panel-editorial-appearance">
              <!-- Section 1: Display Mode (Light / Dark / System) -->
              <div class="editorial-pref-group">
                <div class="editorial-pref-header">
                  <span class="editorial-pref-label">Display Cadence</span>
                </div>
                <div class="editorial-pref-card">
                  <div class="editorial-mode-switcher">
                    <button class="editorial-mode-btn" data-mode="light" id="btn-editorial-mode-light">
                      <span>Papyrus (Light)</span>
                    </button>
                    <button class="editorial-mode-btn" data-mode="dark" id="btn-editorial-mode-dark">
                      <span>Obsidian (Dark)</span>
                    </button>
                    <button class="editorial-mode-btn" data-mode="system" id="btn-editorial-mode-system">
                      <span>System Automatic</span>
                    </button>
                  </div>
                  <p style="font-family: var(--omni-font-sans); font-size: 0.8rem; color: var(--omni-text-muted); margin: 0;">
                    Papyrus renders warm archival rag paper; Obsidian renders deep charcoal sanctuary.
                  </p>
                </div>
              </div>

              <!-- Section 2: Theme Accent Selector -->
              <div class="editorial-pref-group">
                <div class="editorial-pref-header">
                  <span class="editorial-pref-label">Accent Illumination</span>
                  <span id="editorial-active-accent-name" class="editorial-pref-status">Cobalt Glow</span>
                </div>
                <div class="editorial-pref-card">
                  <div class="editorial-swatches-grid">
                    ${EDITORIAL_ACCENTS.map(
                      (a) => `
                      <button class="editorial-swatch-item" data-accent-id="${a.id}" title="${a.name}">
                        <div class="editorial-swatch-circle" style="background-color: ${a.darkColor};">
                          <span class="editorial-swatch-check" style="display: none; font-size: 14px;">✓</span>
                        </div>
                        <span class="editorial-swatch-label">${a.name.split(" ")[0]}</span>
                      </button>
                    `
                    ).join("")}
                    <!-- Custom Picker -->
                    <label class="editorial-swatch-item" title="Custom Hex">
                      <input type="color" id="editorial-custom-accent-color" value="#1e40af" style="opacity: 0; width: 0; height: 0; position: absolute;" />
                      <div class="editorial-swatch-circle" style="background: conic-gradient(red, yellow, green, cyan, blue, magenta, red); cursor: pointer;">
                        <span style="font-size: 11px; font-weight: 700;">+</span>
                      </div>
                      <span class="editorial-swatch-label">Custom</span>
                    </label>
                  </div>
                </div>
              </div>

              <!-- Section 3: Installed Shells Architecture -->
              <div class="editorial-pref-group" id="editorial-shells-group">
                <div class="editorial-pref-header">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="editorial-pref-label">Installed Shells</span>
                    <span id="editorial-shell-count-badge" class="editorial-pref-status">3 installed</span>
                  </div>
                  <button id="btn-editorial-open-install-shell" class="editorial-btn-secondary" style="font-size: 0.72rem; padding: 4px 10px; color: var(--omni-accent-primary);">
                    + Install Shell
                  </button>
                </div>
                <div id="editorial-installed-shells-list" style="display: flex; flex-direction: column; gap: 10px;"></div>
              </div>
            </div>

            <!-- Tab Panel 2: Installed Plugins & Viewports -->
            <div class="editorial-settings-tab-panel" id="panel-editorial-plugins" style="display: none;">
              <div class="editorial-pref-group">
                <div class="editorial-pref-header">
                  <div>
                    <span class="editorial-pref-label">Installed Standalone Plugins</span>
                    <p style="font-family: var(--omni-font-sans); font-size: 0.78rem; color: var(--omni-text-muted); margin: 2px 0 0;">
                      Configure viewports, routes, dock pins, and custom settings for your decentralized applications.
                    </p>
                  </div>
                  <span class="editorial-pref-status">Autonomous nsites</span>
                </div>
                <div id="editorial-plugins-settings-list" style="display: flex; flex-direction: column; gap: 14px;"></div>
              </div>
            </div>

            <!-- Tab Panel 3: Workspace & Relays -->
            <div class="editorial-settings-tab-panel" id="panel-editorial-workspace" style="display: none;">
              <div class="editorial-pref-group">
                <div class="editorial-pref-header">
                  <span class="editorial-pref-label">NIP-78 Workspace Synchronization</span>
                  <span class="editorial-pref-status">Decentralized</span>
                </div>
                <div class="editorial-pref-card">
                  <p style="font-family: var(--omni-font-sans); font-size: 0.85rem; color: var(--omni-text-secondary); margin: 0; line-height: 1.5;">
                    Synchronize your layout configurations, viewport assignments, enabled plugins, and themes across all your devices using Nostr (kind: 30078, tag: ["d", "omni/workspace/v1"]).
                  </p>
                  <div style="display: flex; justify-content: flex-end; margin-top: 8px;">
                    <button id="btn-editorial-sync-workspace" class="editorial-btn-primary">
                      Sync Workspace to Relays
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 5. Install Shell Modal -->
      <div id="editorial-install-shell-modal" class="editorial-modal-overlay">
        <div class="editorial-modal-card" style="max-width: 500px;">
          <div class="editorial-modal-header">
            <div>
              <h3 style="font-family: var(--omni-font-serif); font-size: 1.15rem; font-weight: 500; margin: 0;">Install Shell Experience</h3>
              <span style="font-family: var(--omni-font-mono); font-size: 0.65rem; color: var(--omni-text-muted); text-transform: uppercase;">Curated & Custom Shells</span>
            </div>
            <button id="btn-editorial-close-install-shell" class="editorial-header-btn">
              ${icon("close", 18)}
            </button>
          </div>
          <div class="editorial-modal-body" style="gap: 16px;">
            <div class="editorial-pref-group">
              <span class="editorial-pref-label">Curated Shell Catalog</span>
              <div id="editorial-curated-shell-catalog" style="display: flex; flex-direction: column; gap: 8px;"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private cacheElementReferences(): void {
    this.headerActionsSlot = this.root.querySelector("#editorial-header-actions-slot") as HTMLElement;
    this.mainAppContainer = this.root.querySelector("#editorial-main-app-container") as HTMLElement;
    this.widgetsSlot = this.root.querySelector("#editorial-widgets-slot") as HTMLElement;
    this.dockContainer = this.root.querySelector("#editorial-dock-items") as HTMLElement;
  }

  private initSlotContainers(): void {
    this.slotContainers.set("header-actions", this.headerActionsSlot);
    this.slotContainers.set("main", this.mainAppContainer);
    this.slotContainers.set("dock", this.dockContainer);
    this.slotContainers.set("sidebar", this.widgetsSlot);
    this.slotContainers.set("widget", this.widgetsSlot);
  }
}
