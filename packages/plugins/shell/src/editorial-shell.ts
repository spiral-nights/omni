import { OmniKernel, LayoutManager } from "@omni/core";
import {
  OmniWorkspaceState,
  PluginPlacement,
  PluginViewDeclaration,
  OmniShellHost
} from "@omni/types";
import { BaseShell, InstalledPluginEntry, OmniShellOptions } from "./base-shell.js";
import { ICONS, icon, IconName, renderPluginIcon } from "./icons.js";
import { mountShellStyles, unmountShellStyles } from "./styles/loader.js";
import { EDITORIAL_SHELL_CSS } from "./styles/editorial-styles.js";
import { shellRegistry } from "./shell-registry.js";
import {
  renderInstalledShellsList,
  renderCuratedShellCatalog as renderSharedCuratedShellCatalog,
  wireShellManagerModal
} from "./shell-manager-ui.js";
import {
  renderGeneralPermissionsSection,
  renderNostrWritePermissionsSection,
  renderHandledIntentsSection
} from "./permissions-intents-ui.js";
import { renderRelayScopingSection } from "./relay-scoping-ui.js";
import { renderPluginPlacementsSection, renderPluginCustomSettingsSection } from "./placements-ui.js";

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

/**
 * Calculates accessible contrast color (#ffffff or #141312) based on background perceived luminance (YIQ).
 * If background is dark (YIQ < 150), returns white (#ffffff).
 * If background is light (YIQ >= 150), returns dark (#141312).
 */
export function getContrastColor(color: string): string {
  if (!color) return "#ffffff";
  let r = 0;
  let g = 0;
  let b = 0;

  const hexMatch = color.trim().match(/^#?([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3 || hex.length === 4) {
      hex = hex.split("").slice(0, 3).map((c) => c + c).join("");
    } else if (hex.length >= 6) {
      hex = hex.slice(0, 6);
    }
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  } else {
    const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (rgbMatch) {
      r = parseInt(rgbMatch[1], 10);
      g = parseInt(rgbMatch[2], 10);
      b = parseInt(rgbMatch[3], 10);
    } else {
      return "#ffffff";
    }
  }

  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return "#ffffff";
  }

  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#141312" : "#ffffff";
}

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
  private boundPopstateHandler: ((e: PopStateEvent) => void) | null = null;
  private boundScrollHandler: (() => void) | null = null;
  private fullscreenFadeTimeout: any = null;
  private boundFullscreenMouseHandler: ((e: MouseEvent) => void) | null = null;
  private boundFullscreenTouchHandler: ((e: TouchEvent) => void) | null = null;
  private expandedPluginDetails: Set<string> = new Set();
  private lastScrollTop = 0;
  private appsViewMode: "grid" | "ledger" = "ledger";

  constructor(options: OmniShellOptions) {
    super(options);
    try {
      if (typeof localStorage !== "undefined") {
        const saved = localStorage.getItem("omni_editorial_apps_view_mode");
        if (saved === "ledger" || saved === "grid") {
          this.appsViewMode = saved;
        }
      }
    } catch (_) {}
  }

  public getShellType(): string {
    return "editorial";
  }

  public getAppsViewMode(): "grid" | "ledger" {
    return this.appsViewMode;
  }

  public setAppsViewMode(mode: "grid" | "ledger"): void {
    this.appsViewMode = mode;
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("omni_editorial_apps_view_mode", mode);
      }
    } catch (_) {}
    this.renderAppsIndex();
  }

  public getActivePageId(): string {
    if (this.activePage === "apps") return "apps";
    if (this.activePage === "widgets") return "widgets";
    if (this.activePluginId) return this.activePluginId;
    const defaultPage = this.root?.querySelector("#editorial-page-app") as HTMLElement | null;
    if (this.activePage === "app" && defaultPage?.dataset.pluginId) return defaultPage.dataset.pluginId;
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
    } else if (action === "scrollToTop" || action === "scroll_to_top") {
      this.scrollToTop();
    }
  }

  public scrollToTop(): void {
    const mainContent = this.root.querySelector<HTMLElement>(".editorial-main-content");
    if (mainContent) {
      mainContent.scrollTop = 0;
      if (typeof (mainContent as any).scrollTo === "function") {
        (mainContent as any).scrollTo({ top: 0, left: 0, behavior: "instant" });
      }
    }
    const activePage = this.root.querySelector<HTMLElement>(".editorial-viewport-page.active");
    if (activePage) {
      activePage.scrollTop = 0;
      if (typeof (activePage as any).scrollTo === "function") {
        (activePage as any).scrollTo({ top: 0, left: 0, behavior: "instant" });
      }
    }
    if (typeof window !== "undefined") {
      window.scrollTo(0, 0);
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
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
      if (this.boundPopstateHandler) {
        window.removeEventListener("popstate", this.boundPopstateHandler);
      }
      this.boundPopstateHandler = (e: PopStateEvent) => {
        if (this.handlePopState(e)) return;
        const state = e.state;
        if (!state || state.type !== "omni-editorial-view") return;
        if (state.page === "app" && state.pluginId) {
          if (this.activePluginId === state.pluginId) {
            this.kernel.dispatchHistoryPopstate(state.pluginId, { delta: -1, state: null, url: "" });
          } else {
            this.openApp(state.pluginId, false);
          }
        } else if (state.page === "apps") {
          this.showAppsIndex(false);
        } else if (state.page === "widgets") {
          this.showWidgetsView(false);
        } else if (state.page === "settings") {
          this.openSettings(false);
        }
      };
      window.addEventListener("popstate", this.boundPopstateHandler);

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
    super.destroy();
    if (this.fullscreenFadeTimeout) {
      clearTimeout(this.fullscreenFadeTimeout);
      this.fullscreenFadeTimeout = null;
    }
    if (this.boundFullscreenMouseHandler && typeof window !== "undefined") {
      window.removeEventListener("mousemove", this.boundFullscreenMouseHandler);
      this.boundFullscreenMouseHandler = null;
    }
    if (this.boundFullscreenTouchHandler && typeof window !== "undefined") {
      window.removeEventListener("touchstart", this.boundFullscreenTouchHandler);
      this.boundFullscreenTouchHandler = null;
    }
    if (this.boundScrollHandler) {
      this.root.removeEventListener("scroll", this.boundScrollHandler, { capture: true } as any);
      this.boundScrollHandler = null;
    }
    if (typeof window !== "undefined" && this.boundKeydownHandler) {
      window.removeEventListener("keydown", this.boundKeydownHandler);
      this.boundKeydownHandler = null;
    }
    if (typeof window !== "undefined" && this.boundPopstateHandler) {
      window.removeEventListener("popstate", this.boundPopstateHandler);
      this.boundPopstateHandler = null;
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
    this.kernel?.syncThemeToSandboxes?.();
  }

  public toggleAppFullscreen(fullscreen?: boolean): void {
    this.isAppFullscreen = typeof fullscreen === "boolean" ? fullscreen : !this.isAppFullscreen;
    const btnExit = this.root.querySelector<HTMLElement>("#btn-editorial-exit-fullscreen");

    if (this.fullscreenFadeTimeout) {
      clearTimeout(this.fullscreenFadeTimeout);
      this.fullscreenFadeTimeout = null;
    }

    if (this.isAppFullscreen) {
      this.root.classList.add("app-fullscreen");
      // Initially reveal exit button clearly
      btnExit?.classList.add("active-reveal");
      // Softly fade down to unobtrusive transparency after 2.5 seconds
      this.fullscreenFadeTimeout = setTimeout(() => {
        btnExit?.classList.remove("active-reveal");
      }, 2500);

      // Listen for cursor moving toward the top edge or top-right quadrant
      if (!this.boundFullscreenMouseHandler && typeof window !== "undefined") {
        this.boundFullscreenMouseHandler = (e: MouseEvent) => {
          const isNearTopRight = e.clientY <= 90 || (window.innerWidth - e.clientX <= 180 && e.clientY <= 140);
          if (isNearTopRight) {
            btnExit?.classList.add("active-reveal");
            if (this.fullscreenFadeTimeout) clearTimeout(this.fullscreenFadeTimeout);
            this.fullscreenFadeTimeout = setTimeout(() => {
              btnExit?.classList.remove("active-reveal");
            }, 2500);
          }
        };
        window.addEventListener("mousemove", this.boundFullscreenMouseHandler, { passive: true });
      }

      // Listen for touch taps near the top edge or top-right quadrant on mobile devices
      if (!this.boundFullscreenTouchHandler && typeof window !== "undefined") {
        this.boundFullscreenTouchHandler = (e: TouchEvent) => {
          const touch = e.touches[0];
          if (!touch) return;
          const isNearTopRight = touch.clientY <= 90 || (window.innerWidth - touch.clientX <= 180 && touch.clientY <= 140);
          if (isNearTopRight) {
            btnExit?.classList.add("active-reveal");
            if (this.fullscreenFadeTimeout) clearTimeout(this.fullscreenFadeTimeout);
            this.fullscreenFadeTimeout = setTimeout(() => {
              btnExit?.classList.remove("active-reveal");
            }, 3000);
          }
        };
        window.addEventListener("touchstart", this.boundFullscreenTouchHandler, { passive: true });
      }
    } else {
      this.root.classList.remove("app-fullscreen");
      btnExit?.classList.remove("active-reveal");
      if (this.boundFullscreenMouseHandler && typeof window !== "undefined") {
        window.removeEventListener("mousemove", this.boundFullscreenMouseHandler);
        this.boundFullscreenMouseHandler = null;
      }
      if (this.boundFullscreenTouchHandler && typeof window !== "undefined") {
        window.removeEventListener("touchstart", this.boundFullscreenTouchHandler);
        this.boundFullscreenTouchHandler = null;
      }
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

    const contrastColor = getContrastColor(colorToApply);

    this.root.style.setProperty("--omni-accent-primary", colorToApply);
    this.root.style.setProperty("--accent-primary", colorToApply);
    this.root.style.setProperty("--omni-accent-contrast", contrastColor);
    this.root.style.setProperty("--accent-contrast", contrastColor);
    this.root.style.setProperty("--omni-border-focus", colorToApply);
    this.root.style.setProperty("--omni-status-online", colorToApply);
    this.root.style.setProperty("--omni-status-badge", colorToApply);

    if (typeof document !== "undefined") {
      document.documentElement.style.setProperty("--omni-accent-primary", colorToApply);
      document.documentElement.style.setProperty("--accent-primary", colorToApply);
      document.documentElement.style.setProperty("--omni-accent-contrast", contrastColor);
      document.documentElement.style.setProperty("--accent-contrast", contrastColor);
      if (document.body) {
        document.body.style.setProperty("--omni-accent-contrast", contrastColor);
        document.body.style.setProperty("--accent-contrast", contrastColor);
      }
    }
    this.kernel?.syncThemeToSandboxes?.();
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
          const swatchBg = isDark ? preset.darkColor : preset.lightColor;
          circle.style.backgroundColor = swatchBg;
          circle.style.color = getContrastColor(swatchBg);
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
      return this.isAppPinned(p);
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

      const iconMarkup = renderPluginIcon(plugin.icon, 20, "", plugin.id || plugin.name);

      item.innerHTML = `
        <div class="editorial-dock-icon">${iconMarkup}</div>
        <span class="editorial-dock-label">${plugin.displayName || plugin.name || "App"}</span>
        <span class="editorial-active-dot"></span>
      `;

      item.addEventListener("click", () => {
        this.handleDockItemClick(plugin.id);
      });

      this.bindAppContextMenu(item, plugin);

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

    // Cards (Widgets) Button - only shown if at least one widget is assigned
    if (this.hasAssignedWidgets()) {
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
    } else if (this.activePage === "widgets") {
      this.showAppsIndex(false);
    }

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

  private unloadAppIfStandalone(pluginId: string): void {
    if (!pluginId) return;
    const plugin = this.installedPlugins.find((p) => p.id === pluginId);
    if (!plugin) return;

    // Check if plugin has persistent companion viewports (e.g. sidebar widget)
    const placements = this.getPluginPlacements(plugin);
    const hasCompanionViewport = placements.some(
      (pl) => pl.enabled !== false && (pl.viewport === "sidebar" || pl.viewport === "widgets")
    );

    // If it has dedicated full-page app instances, unload them cleanly
    const appInstanceKey = `${pluginId}::app`;
    const primaryKey = `${pluginId}::main-primary`;
    if (this.kernel.getSandboxExact?.(appInstanceKey)) {
      this.kernel.unloadPluginInstance(appInstanceKey);
    }
    if (this.kernel.getSandboxExact?.(primaryKey)) {
      this.kernel.unloadPluginInstance(primaryKey);
    }
    if (!hasCompanionViewport && this.kernel.getSandboxExact?.(pluginId)) {
      this.kernel.unloadPluginInstance(pluginId);
    }

    const safeId = pluginId.replace(/[^a-zA-Z0-9_-]/g, "-");
    const container = this.root.querySelector(`#editorial-app-page-${safeId} .editorial-app-container`);
    if (container) {
      container.innerHTML = "";
    }
    this.registerHandledIntents();
  }

  public handleDockItemClick(pluginId: string): void {
    const plugin = this.installedPlugins.find((p) => p.id === pluginId);
    if (!plugin) return;

    // 1. If clicking the currently active app
    if (this.activePluginId === pluginId && this.activePage === "app") {
      this.scrollToTop();
      // If currently on a subroute or note thread, return to app's root
      const curFrame = this.kernel?.navigation?.getCurrentFrame();
      if (
        curFrame &&
        curFrame.appId === pluginId &&
        (curFrame.type === "subroute" || Boolean(curFrame.state) || Boolean(curFrame.pageId))
      ) {
        const stack = this.kernel.navigation.getStack();
        const rootIdx = stack.findIndex(
          (f) => f.type === "app" && f.appId === pluginId && (!f.state || f.state === null) && !f.pageId
        );
        if (rootIdx >= 0 && rootIdx < this.kernel.navigation.getPointer()) {
          this.kernel.navigation.jumpTo(rootIdx);
        } else {
          this.kernel.navigation.replace({
            type: "app",
            appId: pluginId,
            title: plugin.displayName || plugin.name,
            url: `?app=${pluginId}`,
            state: null,
            pageId: undefined
          });
        }
        this.kernel.dispatchHistoryPopstate(pluginId, {
          delta: -1,
          state: null,
          url: ""
        });
        this.updateHeaderBackVisibility();
      }
      return;
    }

    // 2. If clicking the initial root home app (index 0, e.g. Feed)
    if (this.kernel?.navigation) {
      const stack = this.kernel.navigation.getStack();
      if (stack.length > 0 && stack[0].type === "app" && stack[0].appId === pluginId) {
        const prev = stack[this.kernel.navigation.getPointer()];
        this.kernel.navigation.jumpTo(0);
        this.resetOutgoingPluginOnBack(prev, stack[0]);
        this.openApp(pluginId, false);
        this.updateHeaderBackVisibility();
        return;
      }
    }

    this.openApp(pluginId, true);
  }

  public async openApp(pluginId: string, pushState = true): Promise<void> {
    const plugin = this.installedPlugins.find((p) => p.id === pluginId);
    if (!plugin) return;

    if (pushState && typeof window !== "undefined") {
      if (this.activePluginId !== pluginId || this.activePage !== "app") {
        try {
          if (this.kernel?.navigation) {
            this.kernel.navigation.push({
              type: "app",
              appId: pluginId,
              title: plugin.displayName || plugin.name,
              url: `?app=${pluginId}`
            });
          } else {
            window.history.pushState({ type: "omni-editorial-view", page: "app", pluginId }, "");
          }
        } catch (_) {}
        this.updateHeaderBackVisibility();
      } else if (this.kernel?.navigation) {
        const curFrame = this.kernel.navigation.getCurrentFrame();
        if (
          curFrame &&
          curFrame.appId === pluginId &&
          !curFrame.intentEntry &&
          (curFrame.type === "subroute" || Boolean(curFrame.state))
        ) {
          const stack = this.kernel.navigation.getStack();
          const rootIdx = stack.findIndex(
            (f) => f.type === "app" && f.appId === pluginId && (!f.state || f.state === null) && !f.pageId
          );
          if (rootIdx >= 0 && rootIdx < this.kernel.navigation.getPointer()) {
            this.kernel.navigation.jumpTo(rootIdx);
          } else {
            this.kernel.navigation.replace({
              type: "app",
              appId: pluginId,
              title: plugin.displayName || plugin.name,
              url: `?app=${pluginId}`,
              state: null,
              pageId: undefined
            });
          }
          this.kernel.dispatchHistoryPopstate(pluginId, {
            delta: -1,
            state: null,
            url: ""
          });
          this.updateHeaderBackVisibility();
        }
      }
    }

    this.activePage = "app";
    this.activePluginId = pluginId;
    this.revealDock();
    this.root.classList.remove("has-widgets-page");
    this.root.classList.remove("has-apps-page");
    this.root.classList.add("has-active-app");

    // Update Header Title & Subtitle
    this.updateHeaderSubtitle(plugin.displayName || plugin.name || "App");

    const targetContainer = this.ensureAppContainer(pluginId);
    const targetPage = targetContainer.closest(".editorial-viewport-page") as HTMLElement | null;

    // Fade out currently active outgoing pages if different from targetPage
    const outgoingPages = Array.from(
      this.root.querySelectorAll<HTMLElement>(".editorial-viewport-page.active, .editorial-app-page.active")
    ).filter((p) => p !== targetPage);

    if (outgoingPages.length > 0) {
      for (const p of outgoingPages) {
        p.classList.remove("fade-in");
        p.classList.add("fade-out");
      }
      // Wait briefly for smooth fade-out transition
      await new Promise((r) => setTimeout(r, 90));
      for (const p of outgoingPages) {
        p.classList.remove("active", "fade-out");
        p.style.display = "none";
      }
    }

    // Hide Index & Cards Viewports
    const pageApps = this.root.querySelector("#editorial-page-apps") as HTMLElement | null;
    const pageWidgets = this.root.querySelector("#editorial-page-widgets") as HTMLElement | null;
    if (pageApps && pageApps !== targetPage) {
      pageApps.classList.remove("active", "fade-out", "fade-in");
      pageApps.style.display = "none";
    }
    if (pageWidgets && pageWidgets !== targetPage) {
      pageWidgets.classList.remove("active", "fade-out", "fade-in");
      pageWidgets.style.display = "none";
    }

    // Hide all other application viewports
    const defaultPage = this.root.querySelector("#editorial-page-app") as HTMLElement | null;
    const allAppPages = this.root.querySelectorAll<HTMLElement>(".editorial-app-page");

    allAppPages.forEach((p) => {
      if (p !== targetPage) {
        p.classList.remove("active", "fade-out", "fade-in");
        p.style.display = "none";
      }
    });
    if (defaultPage && defaultPage !== targetPage) {
      defaultPage.classList.remove("active", "fade-out", "fade-in");
      defaultPage.style.display = "none";
    }

    if (targetPage) {
      targetPage.classList.remove("fade-out");
      targetPage.classList.add("active", "fade-in");
      targetPage.style.display = "flex";

      // Scroll to top automatically when switching to another app
      targetPage.scrollTop = 0;
      targetContainer.scrollTop = 0;
      if (typeof (targetPage as any).scrollTo === "function") {
        (targetPage as any).scrollTo({ top: 0, left: 0, behavior: "instant" });
      }
      const mainContent = this.root.querySelector<HTMLElement>(".editorial-main-content");
      if (mainContent) {
        mainContent.scrollTop = 0;
        if (typeof (mainContent as any).scrollTo === "function") {
          (mainContent as any).scrollTo({ top: 0, left: 0, behavior: "instant" });
        }
      }
      if (typeof window !== "undefined") {
        window.scrollTo(0, 0);
      }
      if (typeof document !== "undefined") {
        if (document.documentElement) document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
      }
      const firstChild = targetContainer.firstElementChild as HTMLElement | null;
      if (firstChild && typeof firstChild.scrollTop === "number") {
        firstChild.scrollTop = 0;
      }
      const scrollableElements = targetContainer.querySelectorAll<HTMLElement>(".feed-container, .notes-stream, [data-scrollable]");
      scrollableElements.forEach((el) => {
        el.scrollTop = 0;
      });

      targetPage.addEventListener(
        "animationend",
        () => {
          targetPage.classList.remove("fade-in");
        },
        { once: true }
      );
    }

    const btnFs = this.root.querySelector("#btn-editorial-toggle-fullscreen") as HTMLElement | null;
    if (btnFs) {
      btnFs.style.display = "flex";
    }

    // Ensure the nsite is mounted and its component is projected into targetContainer
    const appInstanceKey = `${plugin.id}::app`;
    const primaryKey = `${plugin.id}::main-primary`;

    // Only look for sandboxes dedicated to the full-page app presentation (not widgets)
    const appSandbox =
      this.kernel.getSandboxExact?.(appInstanceKey) ||
      this.kernel.getSandboxExact?.(primaryKey) ||
      this.kernel.getSandboxExact?.(plugin.id);

    if (appSandbox) {
      const liveComp =
        (appSandbox as any).getPrimaryComponentContainer?.() ||
        appSandbox.getFirstPopulatedComponentContainer() ||
        appSandbox.getComponentContainer(`${plugin.id}-main`) ||
        appSandbox.getComponentContainer(`${plugin.id}-app-main`) ||
        (appSandbox as any).compContainers?.[0];
      if (liveComp) {
        targetContainer.querySelector(".editorial-app-loading")?.remove();
        // Ensure only this live component is present in targetContainer (no duplicates)
        const compSlots = targetContainer.querySelectorAll(".omni-component-slot");
        compSlots.forEach((slot) => {
          if (slot !== liveComp) slot.remove();
        });
        if (!targetContainer.contains(liveComp)) {
          targetContainer.appendChild(liveComp);
        }
      }
      (appSandbox as any).updateTheme?.();
      this.renderDock();
      this.saveLocalWorkspace();
      this.boundScrollHandler?.();
      return;
    }

    if (!this.pendingAppMounts.has(appInstanceKey)) {
      this.pendingAppMounts.add(appInstanceKey);
      try {
        // Clean up any stale or empty slots before registering fresh
        if (!targetContainer.querySelector(".editorial-app-loading")) {
          targetContainer.innerHTML = `
            <div class="editorial-app-loading">
              <span class="omni-icon omni-icon-spin" style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px;">
                ${icon("spinner", 28)}
              </span>
              <span class="editorial-app-loading-text">Loading ${plugin.displayName || plugin.name || "application"}...</span>
            </div>
          `;
        }

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
        const mountedSandbox = await this.kernel.registerPlugin(
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
        const liveComp =
          (mountedSandbox as any)?.getPrimaryComponentContainer?.() ||
          mountedSandbox?.getFirstPopulatedComponentContainer?.();
        if (liveComp) {
          targetContainer.querySelector(".editorial-app-loading")?.remove();
          const compSlots = targetContainer.querySelectorAll(".omni-component-slot");
          compSlots.forEach((slot) => {
            if (slot !== liveComp) slot.remove();
          });
          if (!targetContainer.contains(liveComp)) {
            targetContainer.appendChild(liveComp);
          }
        }
      } catch (err) {
        console.warn(`Failed to register app instance for ${plugin.id}:`, err);
      } finally {
        this.pendingAppMounts.delete(appInstanceKey);
      }
    }

    this.renderDock();
    this.saveLocalWorkspace();
    this.boundScrollHandler?.();
  }

  public showAppsIndex(pushState = true): void {
    if (pushState && typeof window !== "undefined" && this.activePage !== "apps") {
      try {
        if (this.kernel?.navigation) {
          this.kernel.navigation.push({
            type: "section",
            section: "apps",
            title: "Apps",
            url: "?view=apps"
          });
        } else {
          window.history.pushState({ type: "omni-editorial-view", page: "apps" }, "");
        }
      } catch (_) {}
      this.updateHeaderBackVisibility();
    }

    this.activePage = "apps";
    this.activePluginId = null;
    this.revealDock();
    this.root.classList.remove("has-active-app");
    this.root.classList.remove("has-widgets-page");
    this.root.classList.add("has-apps-page");
    if (this.isAppFullscreen) this.toggleAppFullscreen(false);
    const btnFsApps = this.root.querySelector("#btn-editorial-toggle-fullscreen") as HTMLElement | null;
    if (btnFsApps) btnFsApps.style.display = "none";

    this.updateHeaderSubtitle("Apps");

    const pageApps = this.root.querySelector("#editorial-page-apps") as HTMLElement | null;
    const pageWidgets = this.root.querySelector("#editorial-page-widgets") as HTMLElement | null;
    const pageApp = this.root.querySelector("#editorial-page-app") as HTMLElement | null;
    const allAppPages = this.root.querySelectorAll<HTMLElement>(".editorial-app-page");

    if (pageApps) {
      pageApps.classList.remove("fade-out");
      pageApps.classList.add("active", "fade-in");
      pageApps.style.display = "block";
      pageApps.scrollTop = 0;
    }
    if (pageWidgets) {
      pageWidgets.classList.remove("active", "fade-out", "fade-in");
      pageWidgets.style.display = "none";
    }
    if (pageApp) {
      pageApp.classList.remove("active", "fade-out", "fade-in");
      pageApp.style.display = "none";
    }
    allAppPages.forEach((p) => {
      p.classList.remove("active", "fade-out", "fade-in");
      p.style.display = "none";
    });

    const mainContent = this.root.querySelector<HTMLElement>(".editorial-main-content");
    if (mainContent) mainContent.scrollTop = 0;
    if (typeof window !== "undefined") window.scrollTo(0, 0);

    const filterInput = this.root.querySelector("#editorial-apps-search-input") as HTMLInputElement | null;
    if (filterInput) {
      filterInput.value = "";
    }

    this.renderDock();
    this.renderAppsIndex();
    this.boundScrollHandler?.();
  }

  public showWidgetsView(pushState = true): void {
    if (pushState && typeof window !== "undefined" && this.activePage !== "widgets") {
      try {
        if (this.kernel?.navigation) {
          this.kernel.navigation.push({
            type: "section",
            section: "widgets",
            title: "Widgets",
            url: "?view=widgets"
          });
        } else {
          window.history.pushState({ type: "omni-editorial-view", page: "widgets" }, "");
        }
      } catch (_) {}
      this.updateHeaderBackVisibility();
    }

    this.activePage = "widgets";
    this.activePluginId = null;
    this.revealDock();
    this.root.classList.remove("has-active-app");
    this.root.classList.remove("has-apps-page");
    this.root.classList.add("has-widgets-page");
    if (this.isAppFullscreen) this.toggleAppFullscreen(false);
    const btnFsWidgets = this.root.querySelector("#btn-editorial-toggle-fullscreen") as HTMLElement | null;
    if (btnFsWidgets) btnFsWidgets.style.display = "none";

    this.updateHeaderSubtitle("Cards");

    const pageApps = this.root.querySelector("#editorial-page-apps") as HTMLElement | null;
    const pageWidgets = this.root.querySelector("#editorial-page-widgets") as HTMLElement | null;
    const pageApp = this.root.querySelector("#editorial-page-app") as HTMLElement | null;
    const allAppPages = this.root.querySelectorAll<HTMLElement>(".editorial-app-page");

    if (pageWidgets) {
      pageWidgets.classList.remove("fade-out");
      pageWidgets.classList.add("active", "fade-in");
      pageWidgets.style.display = "block";
      pageWidgets.scrollTop = 0;
    }
    if (pageApps) {
      pageApps.classList.remove("active", "fade-out", "fade-in");
      pageApps.style.display = "none";
    }
    if (pageApp) {
      pageApp.classList.remove("active", "fade-out", "fade-in");
      pageApp.style.display = "none";
    }
    allAppPages.forEach((p) => {
      p.classList.remove("active", "fade-out", "fade-in");
      p.style.display = "none";
    });

    const mainContent = this.root.querySelector<HTMLElement>(".editorial-main-content");
    if (mainContent) mainContent.scrollTop = 0;
    if (typeof window !== "undefined") window.scrollTo(0, 0);

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
      if (plugin.id === this.activePluginId || this.pendingAppMounts.has(`${plugin.id}::app`)) {
        continue;
      }
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
    const initialId = pinned.length > 0 ? pinned[0].id : (this.installedPlugins[0]?.id || "");
    if (initialId) {
      if (this.kernel?.navigation) {
        const rootFrame = this.kernel.navigation.initInitialFrame({
          type: "app",
          appId: initialId,
          title: this.installedPlugins.find((p) => p.id === initialId)?.displayName || "Feed",
          url: `?app=${initialId}`
        });
        if (typeof window !== "undefined" && window.history) {
          try {
            window.history.replaceState({ omniNavId: rootFrame.id, ...rootFrame }, rootFrame.title || document.title, window.location.href);
          } catch (_) {}
        }
      }
      this.openApp(initialId, false);
    } else {
      if (this.kernel?.navigation) {
        const rootFrame = this.kernel.navigation.initInitialFrame({
          type: "section",
          section: "apps",
          title: "Apps",
          url: "?view=apps"
        });
        if (typeof window !== "undefined" && window.history) {
          try {
            window.history.replaceState({ omniNavId: rootFrame.id, ...rootFrame }, "Apps", window.location.href);
          } catch (_) {}
        }
      }
      this.showAppsIndex(false);
    }
    this.updateHeaderBackVisibility();
    this.ensurePinnedAppsMounted().catch(console.warn);
  }

  // --- Broadsheet Applications Index ---

  public renderAppsIndex(): void {
    const pinnedGrid = this.root.querySelector("#editorial-pinned-apps-grid");
    const allGrid = this.root.querySelector("#editorial-all-apps-grid");
    const ledgerTbody = this.root.querySelector("#editorial-apps-ledger-tbody");
    const gridView = this.root.querySelector("#editorial-apps-grid-view") as HTMLElement | null;
    const ledgerView = this.root.querySelector("#editorial-apps-ledger-view") as HTMLElement | null;
    const emptyNotice = this.root.querySelector("#editorial-apps-search-empty") as HTMLElement | null;
    const btnGrid = this.root.querySelector("#btn-apps-view-grid") as HTMLElement | null;
    const btnLedger = this.root.querySelector("#btn-apps-view-ledger") as HTMLElement | null;

    if (!pinnedGrid || !allGrid) return;

    pinnedGrid.innerHTML = "";
    allGrid.innerHTML = "";
    if (ledgerTbody) ledgerTbody.innerHTML = "";

    // Apply active class to the view mode buttons
    if (this.appsViewMode === "ledger") {
      if (gridView) gridView.style.display = "none";
      if (ledgerView) ledgerView.style.display = "block";
      btnGrid?.classList.remove("active");
      btnLedger?.classList.add("active");
    } else {
      if (gridView) gridView.style.display = "block";
      if (ledgerView) ledgerView.style.display = "none";
      btnGrid?.classList.add("active");
      btnLedger?.classList.remove("active");
    }

    const filterInput = this.root.querySelector("#editorial-apps-search-input") as HTMLInputElement | null;
    const query = filterInput?.value.trim().toLowerCase() || "";

    const filtered = this.installedPlugins.filter((p) => {
      if (!query) return true;
      const n = (p.displayName || p.name || p.id).toLowerCase();
      const d = (p.description || "").toLowerCase();
      return n.includes(query) || d.includes(query) || p.id.toLowerCase().includes(query);
    });

    // Sort strictly in alphabetical order by app display name
    const sortAlphabetical = (a: InstalledPluginEntry, b: InstalledPluginEntry) => {
      const nameA = (a.displayName || a.name || a.id).toLowerCase();
      const nameB = (b.displayName || b.name || b.id).toLowerCase();
      return nameA.localeCompare(nameB);
    };

    filtered.sort(sortAlphabetical);

    const pinnedList = filtered.filter((p) => this.isAppPinned(p));
    const unpinnedList = filtered.filter((p) => !this.isAppPinned(p));

    // Handle empty search results
    if (filtered.length === 0) {
      if (emptyNotice) emptyNotice.style.display = "block";
      if (gridView) gridView.style.display = "none";
      if (ledgerView) ledgerView.style.display = "none";
    } else {
      if (emptyNotice) emptyNotice.style.display = "none";
      if (this.appsViewMode === "ledger") {
        if (ledgerView) ledgerView.style.display = "block";
      } else {
        if (gridView) gridView.style.display = "block";
      }
    }

    // Hide pinned section in Grid mode if there are no pinned apps matching filter
    const pinnedSection = this.root.querySelector("#editorial-pinned-section") as HTMLElement | null;
    if (pinnedSection) {
      pinnedSection.style.display = pinnedList.length > 0 ? "block" : "none";
    }

    // 1. Render Cards Grid (in strictly alphabetical order)
    const renderCard = (plugin: InstalledPluginEntry, container: Element) => {
      const card = document.createElement("div");
      card.className = "editorial-plate-card";
      card.dataset.pluginId = plugin.id;
      const isPinned = this.isAppPinned(plugin);
      const placements = this.getPluginPlacements(plugin);
      const hasWidget = placements.some((pl) => pl.enabled !== false && (pl.viewport === "sidebar" || pl.viewport === "widget"));

      card.innerHTML = `
        <div class="editorial-plate-card-header">
          <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
            <div class="editorial-plate-card-icon">
              ${renderPluginIcon(plugin.icon, 18, "", plugin.id || plugin.name)}
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
            ${isPinned ? "Unpin" : "Pin"}
          </button>
        </div>
        <p class="editorial-plate-card-desc">${plugin.description || "Decentralized micro-frontend application."}</p>
        <div class="editorial-plate-card-footer" style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--omni-border-subtle); padding-top: 8px; margin-top: 2px;">
          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            ${isPinned ? `<span class="editorial-badge editorial-badge-pinned">★ Pinned</span>` : ""}
            ${hasWidget ? `<span class="editorial-badge editorial-badge-widget">Widget</span>` : ""}
          </div>
          <button class="editorial-btn-open" title="Open App" style="background: transparent; border: none; color: var(--omni-text-muted); cursor: pointer; display: flex; align-items: center; padding: 2px 4px;">
            ${icon("chevron-right", 15)}
          </button>
        </div>
      `;

      card.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest(".btn-toggle-pin")) return;
        this.openApp(plugin.id);
      });

      card.querySelector(".btn-toggle-pin")?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.setAppPinned(plugin.id, !this.isAppPinned(plugin));
        this.renderDock();
        this.renderAppsIndex();
      });

      this.bindAppContextMenu(card, plugin);
      container.appendChild(card);
    };

    pinnedList.forEach((p) => renderCard(p, pinnedGrid));
    unpinnedList.forEach((p) => renderCard(p, allGrid));

    const pinnedCount = this.root.querySelector("#editorial-pinned-count");
    if (pinnedCount) pinnedCount.textContent = `${pinnedList.length} pinned`;

    const allCount = this.root.querySelector("#editorial-all-count");
    if (allCount) allCount.textContent = `${unpinnedList.length} unpinned`;

    // 2. Render Swiss Ledger Table (all matching apps, strictly in alphabetical order)
    if (ledgerTbody) {
      for (const plugin of filtered) {
        const isPinned = this.isAppPinned(plugin);
        const row = document.createElement("tr");
        row.className = "editorial-ledger-row";
        row.dataset.pluginId = plugin.id;

        row.innerHTML = `
          <td>
            <div style="display: flex; align-items: center; gap: 10px; min-width: 0; width: 100%;">
              <div class="editorial-plate-card-icon" style="width: 28px; height: 28px; flex-shrink: 0;">
                ${renderPluginIcon(plugin.icon, 16, "", plugin.id || plugin.name)}
              </div>
              <div style="min-width: 0; flex: 1; overflow: hidden;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span class="editorial-ledger-name" style="font-family: var(--omni-font-serif); font-size: 0.95rem; font-weight: 600; color: var(--omni-text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${plugin.displayName || plugin.name || plugin.id}
                  </span>
                  ${isPinned ? `<span class="editorial-badge editorial-badge-pinned" style="font-size: 0.58rem; padding: 1px 4px;">★ Pinned</span>` : ""}
                </div>
                <div style="font-family: var(--omni-font-sans); font-size: 0.72rem; color: var(--omni-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  ${plugin.description || "Decentralized application"}
                </div>
              </div>
            </div>
          </td>
          <td style="text-align: right; white-space: nowrap;">
            <span style="font-family: var(--omni-font-mono); font-size: 0.70rem; color: var(--omni-text-muted);">v${plugin.version || "1.0.0"}</span>
          </td>
        `;

        row.addEventListener("click", () => {
          this.openApp(plugin.id);
        });

        this.bindAppContextMenu(row, plugin);
        ledgerTbody.appendChild(row);
      }
    }
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
    const btnBack = this.root.querySelector("#btn-editorial-back");
    btnBack?.addEventListener("click", () => {
      this.triggerBack();
    });

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
      this.dispatchIntent("view_profile", {}).catch(() => {
        const handlerPlugin = this.installedPlugins.find(
          (p) => p.enabled !== false && (p.handledIntents?.includes("view_profile") || p.manifest?.permissions?.intents?.handle?.includes("view_profile"))
        );
        if (handlerPlugin) {
          this.openApp(handlerPlugin.id);
        }
      });
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

    const btnGrid = this.root.querySelector("#btn-apps-view-grid");
    const btnLedger = this.root.querySelector("#btn-apps-view-ledger");

    btnGrid?.addEventListener("click", () => {
      this.setAppsViewMode("grid");
    });

    btnLedger?.addEventListener("click", () => {
      this.setAppsViewMode("ledger");
    });
  }

  // --- Settings & Preferences Modal ---

  public openSettings(pushState = true): void {
    if (pushState && typeof window !== "undefined") {
      try {
        if (this.kernel?.navigation) {
          this.kernel.navigation.push({
            type: "section",
            section: "settings",
            title: "Settings",
            url: "?view=settings"
          });
        } else {
          window.history.pushState({ type: "omni-editorial-view", page: "settings" }, "");
        }
      } catch (_) {}
      this.updateHeaderBackVisibility();
    }
    const modal = this.root.querySelector("#editorial-settings-modal");
    modal?.classList.add("open");
    this.renderPluginSettingsList();
    this.renderShellManager();
  }

  public closeSettings(pushState = true): void {
    const modal = this.root.querySelector("#editorial-settings-modal");
    modal?.classList.remove("open");
    if (pushState && typeof window !== "undefined") {
      try {
        if (this.kernel?.navigation?.getCurrentFrame()?.section === "settings") {
          this.kernel.navigation.back();
        } else if (window.history.state?.page === "settings") {
          window.history.back();
        }
      } catch (_) {}
      this.updateHeaderBackVisibility();
    }
  }

  private wireSettingsModal(): void {
    const modal = this.root.querySelector("#editorial-settings-modal");
    const btnClose = this.root.querySelector("#btn-editorial-close-settings");

    btnClose?.addEventListener("click", () => this.closeSettings());
    modal?.addEventListener("click", (e) => {
      if (e.target === modal) this.closeSettings();
    });

    // Settings Navigation Tabs & Mobile Dropdown
    const tabs = this.root.querySelectorAll(".editorial-settings-tab-btn");
    const mobileSelect = this.root.querySelector("#editorial-settings-mobile-select") as HTMLSelectElement | null;

    const activateTab = (tabKey: string) => {
      tabs.forEach((t) => t.classList.toggle("active", (t as HTMLElement).dataset.tab === tabKey));
      const panels = this.root.querySelectorAll(".editorial-settings-tab-panel");
      panels.forEach((p) => {
        const isMatch = p.id === `panel-editorial-${tabKey}`;
        p.classList.toggle("active", isMatch);
        (p as HTMLElement).style.display = isMatch ? "flex" : "none";
      });
      if (mobileSelect && mobileSelect.value !== tabKey) {
        mobileSelect.value = tabKey;
      }
    };

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const tabKey = (tab as HTMLElement).dataset.tab;
        if (tabKey) activateTab(tabKey);
      });
    });

    mobileSelect?.addEventListener("change", () => {
      if (mobileSelect.value) activateTab(mobileSelect.value);
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

    // Plugins Filter & Expand All
    const searchInput = this.root.querySelector("#editorial-plugins-search-input") as HTMLInputElement | null;
    searchInput?.addEventListener("input", () => this.renderPluginSettingsList());

    const btnExpandAll = this.root.querySelector("#btn-editorial-expand-all-plugins") as HTMLElement | null;
    let areAllExpanded = false;
    btnExpandAll?.addEventListener("click", () => {
      areAllExpanded = !areAllExpanded;
      this.root.querySelectorAll<HTMLElement>(".editorial-plugin-details-container").forEach((el) => {
        el.style.display = areAllExpanded ? "flex" : "none";
      });
      this.root.querySelectorAll<HTMLElement>(".btn-toggle-placements").forEach((btn) => {
        btn.textContent = areAllExpanded ? "Done All ▴" : "Configure All ▾";
        btn.classList.toggle("active", areAllExpanded);
      });
      btnExpandAll.textContent = areAllExpanded ? "Collapse All" : "Configure All";
    });
  }

  // --- Installed Shells Manager in Editorial ---

  public renderShellManager(): void {
    renderInstalledShellsList({
      root: this.root,
      prefix: "editorial",
      isEditorial: true,
      onReload: () => this.reloadPage(),
      onRefresh: () => this.renderShellManager()
    });
    this.renderCuratedShellCatalog();
  }

  public renderCuratedShellCatalog(): void {
    renderSharedCuratedShellCatalog({
      root: this.root,
      prefix: "editorial",
      isEditorial: true,
      onReload: () => this.reloadPage(),
      onRefresh: () => this.renderShellManager()
    });
  }

  private wireShellManager(): void {
    wireShellManagerModal({
      root: this.root,
      prefix: "editorial",
      isEditorial: true,
      onReload: () => this.reloadPage(),
      onRefresh: () => this.renderShellManager()
    });
  }

  public revealDock(): void {
    const dock = this.root.querySelector(".editorial-dock");
    dock?.classList.remove("dock-hidden");
    this.lastScrollTop = 0;
  }

  private wireBackToTop(): void {
    const backToTopBtn = this.root.querySelector("#editorial-back-to-top");
    const dock = this.root.querySelector(".editorial-dock");

    this.boundScrollHandler = () => {
      const activePage = this.root.querySelector(".editorial-viewport-page.active") as HTMLElement | null;
      if (!activePage) return;

      const currentScrollTop = activePage.scrollTop;
      const diff = currentScrollTop - this.lastScrollTop;

      // Handle Back to Top button visibility
      if (currentScrollTop > 200) {
        backToTopBtn?.classList.add("visible");
      } else {
        backToTopBtn?.classList.remove("visible");
      }

      // Handle Smart Reading Auto-Hide:
      // Scrolling down past threshold hides dock; scrolling up or near top reveals it
      const SCROLL_THRESHOLD = 15;
      if (diff > SCROLL_THRESHOLD && currentScrollTop > 60) {
        dock?.classList.add("dock-hidden");
      } else if (diff < -SCROLL_THRESHOLD || currentScrollTop <= 20) {
        dock?.classList.remove("dock-hidden");
      }

      this.lastScrollTop = currentScrollTop;
    };

    this.root.addEventListener("scroll", this.boundScrollHandler, { capture: true, passive: true });

    backToTopBtn?.addEventListener("click", () => {
      const activePage = this.root.querySelector(".editorial-viewport-page.active") as HTMLElement | null;
      if (activePage) {
        activePage.scrollTo({ top: 0, behavior: "smooth" });
      }
      this.revealDock();
    });

    this.root.addEventListener("click", (e: Event) => {
      const topBtn = (e.target as Element)?.closest(".btn-feed-back-to-top, [data-action='scroll-top']");
      if (topBtn) {
        const page = topBtn.closest(".editorial-viewport-page") || (this.root.querySelector(".editorial-viewport-page.active") as HTMLElement | null);
        if (page) {
          (page as HTMLElement).scrollTo({ top: 0, behavior: "smooth" });
          this.revealDock();
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

    const searchInput = this.root.querySelector("#editorial-plugins-search-input") as HTMLInputElement | null;
    const filterQuery = (searchInput?.value || "").trim().toLowerCase();

    const pluginsToRender = this.installedPlugins.filter((p) => {
      if (!filterQuery) return true;
      const hay = `${p.displayName || ""} ${p.name || ""} ${p.id} ${p.description || ""}`.toLowerCase();
      return hay.includes(filterQuery);
    });

    for (const plugin of pluginsToRender) {
      const card = document.createElement("div");
      card.className = "editorial-pref-card compact-plugin-card";

      const iconKey = (plugin.icon as IconName) || "apps";
      const synthManifest = this.ensurePluginManifest(plugin);
      const pluginViews = synthManifest.views || [{ id: "main", title: "Default View", path: "" }];
      const safeId = plugin.id.replace(/[^a-zA-Z0-9_-]/g, "-");
      const isPinned = this.isAppPinned(plugin);

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
            <div style="width: 34px; height: 34px; background: var(--omni-bg-elevated); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-sm); display: flex; align-items: center; justify-content: center; color: var(--omni-accent-primary); flex-shrink: 0;">
              ${renderPluginIcon(plugin.icon, 18, "", plugin.id || plugin.name)}
            </div>
            <div style="min-width: 0;">
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <strong style="font-family: var(--omni-font-serif); font-size: 0.95rem; color: var(--omni-text-primary);">${plugin.displayName || plugin.name || plugin.id}</strong>
                <span style="font-family: var(--omni-font-mono); font-size: 0.65rem; color: var(--omni-text-muted);">v${plugin.version || "1.0.0"}</span>
              </div>
              <div style="font-family: var(--omni-font-mono); font-size: 0.65rem; color: var(--omni-text-muted); margin-top: 1px; word-break: break-all;">${plugin.id}</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <button class="editorial-btn-secondary btn-update-plugin" style="font-size: 0.68rem; padding: 4px 8px; color: var(--omni-accent-primary); border-color: var(--omni-border-subtle);">
              Update
            </button>
            <button class="editorial-btn-secondary btn-toggle-placements" id="btn-toggle-placements-${safeId}" style="font-size: 0.68rem; padding: 4px 8px;">
              Configure ▾
            </button>
            <button class="editorial-btn-secondary btn-toggle-pin-pref" style="font-size: 0.68rem; padding: 4px 8px;">
              ${isPinned ? "Unpin" : "Pin"}
            </button>
            <button class="editorial-btn-secondary btn-uninstall-plugin" style="color: #ff5555; border-color: #552222; font-size: 0.68rem; padding: 4px 8px;">
              Uninstall
            </button>
          </div>
        </div>
        <p style="font-family: var(--omni-font-sans); font-size: 0.78rem; color: var(--omni-text-secondary); margin: 0; line-height: 1.4;">${plugin.description || "Micro-frontend plugin."}</p>
      `;

      card.querySelector(".btn-toggle-pin-pref")?.addEventListener("click", () => {
        this.setAppPinned(plugin.id, !this.isAppPinned(plugin));
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

      card.querySelector(".btn-update-plugin")?.addEventListener("click", () => {
        this.openUpdatePluginModal(plugin);
      });

      // Collapsible details container (placements, settings, rules) - remembers expanded state
      const detailsContainer = document.createElement("div");
      detailsContainer.className = "editorial-plugin-details-container";
      detailsContainer.id = `plugin-details-${safeId}`;
      const isExpanded = this.expandedPluginDetails.has(plugin.id);
      detailsContainer.style.cssText = `display: ${isExpanded ? "flex" : "none"}; flex-direction: column; gap: 14px; margin-top: 10px; border-top: 1px solid var(--omni-border-subtle); padding-top: 12px;`;

      const togglePlacementsBtn = card.querySelector(`#btn-toggle-placements-${safeId}`) as HTMLElement | null;
      if (togglePlacementsBtn) {
        togglePlacementsBtn.textContent = isExpanded ? "Done ▴" : "Configure ▾";
        togglePlacementsBtn.classList.toggle("active", isExpanded);
        togglePlacementsBtn.addEventListener("click", () => {
          const currentlyExpanded = this.expandedPluginDetails.has(plugin.id);
          if (currentlyExpanded) {
            this.expandedPluginDetails.delete(plugin.id);
            detailsContainer.style.display = "none";
            togglePlacementsBtn.textContent = "Configure ▾";
            togglePlacementsBtn.classList.remove("active");
          } else {
            this.expandedPluginDetails.add(plugin.id);
            detailsContainer.style.display = "flex";
            togglePlacementsBtn.textContent = "Done ▴";
            togglePlacementsBtn.classList.add("active");
          }
        });
      }

      // 1. Placements & Viewports Section
      const placementsBox = renderPluginPlacementsSection({
        plugin,
        theme: "editorial",
        viewportOptions,
        pluginViews,
        synthManifest,
        layoutManager: this.layoutManager,
        getPluginPlacements: (p) => this.getPluginPlacements(p),
        onUpdate: () => {
          this.expandedPluginDetails.add(plugin.id);
          this.saveLocalWorkspace();
        },
        onRemount: () => this.remountPlugin(plugin),
        onRefreshAll: () => {
          this.renderPluginSettingsList();
          this.renderDock();
          this.renderAppsIndex();
          this.renderWidgetsView();
        }
      });
      detailsContainer.appendChild(placementsBox);

      // 2. Custom Plugin Settings View (e.g. for Feed filtering)
      const settingsBox = renderPluginCustomSettingsSection({
        kernel: this.kernel,
        plugin,
        theme: "editorial",
        pluginViews,
        synthManifest
      });
      if (settingsBox) {
        detailsContainer.appendChild(settingsBox);
      }

      // 3. Relay Access Scoping Section
      const relayAccessBox = renderRelayScopingSection({
        kernel: this.kernel,
        plugin,
        theme: "classic",
        onUpdate: () => this.saveLocalWorkspace(),
        onRemount: () => this.remountPlugin(plugin)
      });
      detailsContainer.appendChild(relayAccessBox);

      // 4. Permissions & Capabilities Section
      const permSection = renderGeneralPermissionsSection({
        kernel: this.kernel,
        plugin,
        theme: "classic",
        onUpdate: () => this.saveLocalWorkspace()
      });

      // Collapsible Nostr Write Permissions
      const writeSection = renderNostrWritePermissionsSection({
        kernel: this.kernel,
        pluginId: plugin.id,
        theme: "classic",
        onUpdate: () => this.saveLocalWorkspace()
      });
      permSection.appendChild(writeSection);

      // Handled Intents Section
      const intentsSection = renderHandledIntentsSection({
        kernel: this.kernel,
        plugin,
        theme: "classic",
        onUpdate: () => this.saveLocalWorkspace()
      });
      permSection.appendChild(intentsSection);

      detailsContainer.appendChild(permSection);

      card.appendChild(detailsContainer);
      container.appendChild(card);
    }
  }

  // --- HTML Skeleton Markup ---

  private renderSkeleton(): void {
    this.root.innerHTML = `
      <!-- 1. Fixed Editorial Header -->
      <header class="editorial-header">
        <div class="editorial-header-inner">
          <div class="editorial-header-left">
            <button id="btn-editorial-back" class="omni-header-back-btn editorial-back-btn" title="Go Back" aria-label="Go Back" style="display: none;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              <span class="editorial-back-text">Back</span>
            </button>
          </div>

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
          <div id="editorial-main-app-container" class="editorial-app-container">
            <div class="editorial-app-loading" id="editorial-app-initial-loader">
              <span class="omni-icon omni-icon-spin" style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px;">
                ${icon("spinner", 28)}
              </span>
              <span class="editorial-app-loading-text">Loading application...</span>
            </div>
          </div>
        </section>

        <!-- Viewport B: Broadsheet Applications Index -->
        <section id="editorial-page-apps" class="editorial-viewport-page" style="padding: 20px 16px calc(100px + env(safe-area-inset-bottom, 0px));">
          <div class="editorial-section-header">
            <div>
              <h2 class="editorial-section-title">Applications</h2>
              <div class="editorial-section-meta">All Installed Apps • Pin to Dock or Launch Directly</div>
            </div>
            <div class="editorial-apps-view-switcher">
              <span class="editorial-view-switcher-label">View:</span>
              <div class="editorial-view-mode-toggles">
                <button id="btn-apps-view-grid" class="editorial-view-toggle-btn" title="Cards Grid">
                  ${icon("grid", 13)}
                  <span>Grid</span>
                </button>
                <button id="btn-apps-view-ledger" class="editorial-view-toggle-btn active" title="Swiss Ledger Table">
                  ${icon("layout", 13)}
                  <span>Ledger</span>
                </button>
              </div>
            </div>
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

          <!-- Mode A: Cards Grid Container -->
          <div id="editorial-apps-grid-view" style="display: none;">
            <!-- Pinned to Dock Section -->
            <div id="editorial-pinned-section" style="margin-bottom: 24px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span class="editorial-pref-label">Pinned to Dock</span>
                <span id="editorial-pinned-count" class="editorial-pref-status">0 pinned</span>
              </div>
              <div id="editorial-pinned-apps-grid" class="editorial-apps-grid"></div>
            </div>

            <!-- All Apps Section -->
            <div id="editorial-unpinned-section">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span class="editorial-pref-label">Unpinned Applications</span>
                <span id="editorial-all-count" class="editorial-pref-status">0 unpinned</span>
              </div>
              <div id="editorial-all-apps-grid" class="editorial-apps-grid"></div>
            </div>
          </div>

          <!-- Mode B: Swiss Ledger Table Container -->
          <div id="editorial-apps-ledger-view" class="editorial-ledger-table-wrap">
            <table class="editorial-ledger-table">
              <thead>
                <tr>
                  <th>Application</th>
                  <th style="text-align: right; width: 85px;">Version</th>
                </tr>
              </thead>
              <tbody id="editorial-apps-ledger-tbody"></tbody>
            </table>
          </div>

          <!-- Empty search result notice -->
          <div id="editorial-apps-search-empty" class="editorial-pref-card" style="align-items: center; text-align: center; padding: 32px 16px; display: none;">
            <div style="font-family: var(--omni-font-serif); font-size: 1.1rem; color: var(--omni-text-primary); margin-bottom: 4px;">No applications found</div>
            <p style="font-family: var(--omni-font-sans); font-size: 0.82rem; color: var(--omni-text-muted); margin: 0;">Try a different keyword or search query.</p>
          </div>
        </section>

        <!-- Viewport C: Companion Cards (Widgets) -->
        <section id="editorial-page-widgets" class="editorial-viewport-page" style="padding: 20px 16px calc(100px + env(safe-area-inset-bottom, 0px));">
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

          <!-- Settings Navigation: Desktop Segmented Tabs + Mobile Sub-Menu Dropdown -->
          <div class="editorial-settings-nav-wrapper">
            <div class="editorial-settings-mobile-select-container">
              <span class="editorial-settings-mobile-select-label">Section:</span>
              <div class="editorial-settings-select-box">
                <select id="editorial-settings-mobile-select" class="editorial-settings-mobile-select" aria-label="Settings Section">
                  <option value="appearance">Appearance & Shells</option>
                  <option value="plugins">Installed Plugins</option>
                  <option value="workspace">Workspace & Sync</option>
                </select>
                <div class="editorial-settings-select-arrow">${icon("chevron-down", 14)}</div>
              </div>
            </div>

            <div class="editorial-settings-tabs-bar">
              <button class="editorial-settings-tab-btn active" data-tab="appearance" id="tab-editorial-appearance">
                <span class="editorial-tab-icon">${icon("layout", 16)}</span>
                <span class="editorial-tab-title">Appearance</span>
                <span class="editorial-tab-sub">& Shells</span>
              </button>
              <button class="editorial-settings-tab-btn" data-tab="plugins" id="tab-editorial-plugins">
                <span class="editorial-tab-icon">${icon("plugins", 16)}</span>
                <span class="editorial-tab-title">Plugins</span>
                <span class="editorial-tab-sub">& Viewports</span>
              </button>
              <button class="editorial-settings-tab-btn" data-tab="workspace" id="tab-editorial-workspace">
                <span class="editorial-tab-icon">${icon("cloud", 16)}</span>
                <span class="editorial-tab-title">Workspace</span>
                <span class="editorial-tab-sub">& Sync</span>
              </button>
            </div>
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
                      Configure viewports, routes, dock pins, updates, and custom settings for your apps.
                    </p>
                  </div>
                  <span class="editorial-pref-status">Autonomous nsites</span>
                </div>
                <div class="editorial-plugins-search-bar" style="display: flex; gap: 8px; margin-bottom: 8px;">
                  <input type="text" id="editorial-plugins-search-input" placeholder="Search installed plugins..." style="flex: 1; background: var(--omni-bg-surface); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-sm); padding: 8px 12px; font-family: var(--omni-font-sans); font-size: 0.8rem; color: var(--omni-text-primary);" />
                  <button id="btn-editorial-expand-all-plugins" class="editorial-btn-secondary btn-editorial-expand-all" style="font-size: 0.72rem; padding: 4px 10px; white-space: nowrap;">
                    Expand All Viewports
                  </button>
                </div>
                <div id="editorial-plugins-settings-list" style="display: flex; flex-direction: column; gap: 14px;"></div>
              </div>
            </div>

            <!-- Tab Panel 3: Workspace & Sync -->
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

// Register editorial shell constructor in the global registry
shellRegistry.registerClass("editorial", EditorialShell);
