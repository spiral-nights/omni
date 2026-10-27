import { OmniKernel, WebCryptoKeystore, NostrPluginResolver, LayoutManager, STANDARD_SLOTS } from "@omni/core";
import { OmniWorkspaceState, OmniWorkspacePluginConfig, PluginPlacement, OMNI_WORKSPACE_D_TAG, NostrEvent, PluginViewDeclaration, OmniShellHost } from "@omni/types";
import { ICONS, icon, IconName, renderPluginIcon } from "./icons.js";
import { BaseShell, InstalledPluginEntry, OmniShellOptions } from "./base-shell.js";
import {
  renderNostrWritePermissionsSection,
  renderHandledIntentsSection,
  showIntentEnableToast
} from "./permissions-intents-ui.js";
import { mountShellStyles, unmountShellStyles } from "./styles/loader.js";
import { PANORAMA_SHELL_CSS } from "./styles/panorama-styles.js";
import { shellRegistry } from "./shell-registry.js";
import { CURATED_APPS } from "./app-store-catalog.js";

export type PanoramaPivot = "feed" | "apps" | "widgets" | "system" | string;

export interface PanoramaAccentPreset {
  name: string;
  hex: string;
}

export const PANORAMA_ACCENT_PRESETS: PanoramaAccentPreset[] = [
  { name: "Cyan", hex: "#00a4ef" },
  { name: "Cobalt", hex: "#0078d7" },
  { name: "Teal", hex: "#00aba9" },
  { name: "Emerald", hex: "#2ecc71" },
  { name: "Lime", hex: "#60a917" },
  { name: "Mango", hex: "#f39c12" },
  { name: "Orange", hex: "#fa6800" },
  { name: "Amber", hex: "#d4a373" },
  { name: "Crimson", hex: "#e51400" },
  { name: "Magenta", hex: "#e056fd" },
  { name: "Purple", hex: "#8e44ad" },
  { name: "Pink", hex: "#f472d0" },
  { name: "Steel", hex: "#647687" },
  { name: "Gold", hex: "#f0a30a" }
];

function adjustColorBrightness(hex: string, percent: number): string {
  const clean = hex.replace("#", "");
  const num = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  if (isNaN(num)) return hex;
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, Math.max(0, (num >> 16) + amt));
  const G = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amt));
  const B = Math.min(255, Math.max(0, (num & 0x0000ff) + amt));
  return `#${((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1)}`;
}

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
export class PanoramaShell extends BaseShell {
  public static readonly STORAGE_KEY_PANORAMA_ACCENT = "omni_panorama_accent_color";
  public static readonly DEFAULT_ACCENT_COLOR = "#00a4ef";

  private currentAccentColor: string = PanoramaShell.DEFAULT_ACCENT_COLOR;
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
  private pendingOverlayMounts: Set<string> = new Set();
  private pendingCompactMounts: Set<string> = new Set();
  private activeContextMenu: HTMLElement | null = null;
  private dynamicAppSection: HTMLElement | null = null;
  private boundKeydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private boundGliderScrollHandler: (() => void) | null = null;

  // New element references
  private gliderLeft!: HTMLElement;
  private gliderRight!: HTMLElement;
  private bottomAppBar!: HTMLElement;
  private appBarMenu!: HTMLElement;
  private headerCloseBtn: HTMLElement | null = null;

  constructor(options: OmniShellOptions) {
    super(options);
  }

  public getShellType(): "panorama" {
    return "panorama";
  }

  protected onWorkspaceUpdated(): void {
    this.ensureMainAppSections();
    this.renderPivotNavigation();
    this.renderAppsTiles();
    this.renderWidgetsEmptyState();
    this.renderSystemShellList();
    this.renderSystemPluginList();
    this.renderBottomAppBar();
    this.updateEdgeGliders();
    this.ensureWidgetsMounted().catch(console.warn);
  }

  public override async ensureWidgetsMounted(): Promise<void> {
    await super.ensureWidgetsMounted();
    this.renderWidgetsEmptyState();
  }
  public getSlotContainers(): Map<string, Element> {
    return this.slotContainers;
  }

  public getMainAppPlugins(): InstalledPluginEntry[] {
    return this.installedPlugins.filter((p) => {
      if (p.enabled === false) return false;
      if (p.viewport && p.viewport !== "main" && p.viewport !== "dock") return false;
      const placements = this.getPluginPlacements(p);
      if (placements.length > 0 && !placements.some((pl) => pl.viewport === "main" || pl.viewport === "dock")) {
        return false;
      }
      return (
        p.viewport === "main" ||
        p.id === "org.omni.plugin.feed" ||
        (!p.viewport && p.manifest?.components?.[0]?.slot === "main") ||
        placements.some((pl) => pl.enabled !== false && pl.viewport === "main")
      );
    });
  }

  // --- Mounting & Container Resolution ---

  public getContainerForPluginSlot(pluginId: string, slotId: string, compId?: string): Element | undefined {
    if (slotId === "compact" || compId?.includes("compact")) {
      const safeId = pluginId.replace(/[^a-zA-Z0-9_-]/g, "-");
      const compactEl = document.getElementById(`panorama-tile-compact-${safeId}`);
      if (compactEl) return compactEl;
      return undefined;
    }

    if (slotId === "main" || slotId === "dock") {
      const safeId = pluginId.replace(/[^a-zA-Z0-9_-]/g, "-");
      if (compId?.includes("overlay")) {
        return this.ensureAppPage(pluginId);
      }
      const canvasSlot = document.getElementById(`panorama-slot-main-${safeId}`);
      if (canvasSlot) {
        return canvasSlot;
      }
      // The section may not exist yet (mount racing section creation); create
      // sections and retry before falling back to the overlay page, otherwise
      // main viewport mounts silently land in a hidden overlay page.
      this.ensureMainAppSections();
      const retrySlot = document.getElementById(`panorama-slot-main-${safeId}`);
      if (retrySlot) {
        return retrySlot;
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
          <div class="panorama-section-content" style="height: auto; min-height: 100%; flex: 1;">
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

  public mount(): void {
    mountShellStyles(PANORAMA_SHELL_CSS);
    if (typeof document !== "undefined") {
      document.documentElement.classList.add("theme-panorama");
      document.body?.classList.add("theme-panorama");
    }
    this.renderSkeleton();
    const savedAccent = (typeof localStorage !== "undefined"
      ? localStorage.getItem(PanoramaShell.STORAGE_KEY_PANORAMA_ACCENT)
      : null) || PanoramaShell.DEFAULT_ACCENT_COLOR;
    this.applyAccentColor(savedAccent, false);
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
    this.renderWidgetsEmptyState();
    this.renderSystemShellList();
    this.renderSystemPluginList();
    this.renderColorChoosers();
    this.wireNavigation();
    this.wireGlobalEvents();
    this.wireKeyboardAndGliders();
    this.wireBottomAppBar();
    this.renderBottomAppBar();
    this.wireShellManagement();
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

    this.initPullToRefresh();
  }

  public destroy(): void {
    super.destroy();
    if (typeof window !== "undefined" && this.boundKeydownHandler) {
      window.removeEventListener("keydown", this.boundKeydownHandler);
      this.boundKeydownHandler = null;
    }
    if (this.panoramaContainer && this.boundGliderScrollHandler) {
      this.panoramaContainer.removeEventListener("scroll", this.boundGliderScrollHandler);
      this.boundGliderScrollHandler = null;
    }
    this.closeTileContextMenu();
    if (typeof document !== "undefined") {
      document.documentElement.classList.remove("theme-panorama");
      document.body?.classList.remove("theme-panorama");
      document.documentElement.style.removeProperty("--omni-accent-primary");
      document.documentElement.style.removeProperty("--omni-accent-hover");
      document.documentElement.style.removeProperty("--omni-border-focus");
      document.documentElement.style.removeProperty("--omni-status-online");
      document.documentElement.style.removeProperty("--omni-status-badge");
      document.documentElement.style.removeProperty("--accent-primary");
      document.documentElement.style.removeProperty("--accent-hover");
      document.documentElement.style.removeProperty("--status-online");
      document.documentElement.style.removeProperty("--status-badge");
      document.documentElement.style.removeProperty("--border-focus");
    }
    if (this.root) {
      this.root.innerHTML = "";
    }
  }

  public getActivePageId(): string {
    return this.currentOpenedAppId || this.activePivot;
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
            --omni-border-focus: var(--omni-accent-primary, #00a4ef);
            --omni-accent-primary: #00a4ef;
            --omni-accent-hover: #0078d7;
            --omni-accent-contrast: #ffffff;
            --omni-status-online: var(--omni-accent-primary, #00a4ef);
            --omni-status-badge: var(--omni-accent-primary, #00a4ef);
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
            --border-focus: var(--omni-accent-primary, #00a4ef);
            --accent-primary: var(--omni-accent-primary, #00a4ef);
            --accent-hover: var(--omni-accent-hover, #0078d7);
            --accent-contrast: #ffffff;
            --status-online: var(--omni-accent-primary, #00a4ef);
            --status-badge: var(--omni-accent-primary, #00a4ef);
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
            background: var(--omni-accent-primary, #00a4ef) !important;
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
            background: var(--omni-accent-primary, #00a4ef) !important;
            color: #ffffff !important;
            border-radius: 0px !important;
          }
          .panorama-shell-root .cache-indicator,
          .panorama-shell-root .note-author,
          .panorama-shell-root .timer-digits {
            color: var(--omni-accent-primary, #00a4ef) !important;
          }
          .panorama-shell-root .omni-toggle input:checked + .toggle-slider {
            background-color: var(--omni-accent-primary, #00a4ef) !important;
            border-color: var(--omni-accent-primary, #00a4ef) !important;
          }
          .panorama-shell-root .toggle-slider {
            border-radius: 0px !important;
          }
          .panorama-shell-root .toggle-slider:before {
            border-radius: 0px !important;
          }
        </style>
        <!-- 1. Panorama Header & Pivot Navigation -->
        <header class="panorama-hero-header">
          <div class="panorama-header-content">
            <!-- Metro Left Pane Peek Affordance -->
            <button class="panorama-left-peek-hint" id="panorama-left-peek-hint" title="Previous pane" aria-label="Previous pane" style="opacity: 0; pointer-events: none;">
              <span class="panorama-left-peek-arrow">${icon("arrow-left", 14)}</span>
              <span class="panorama-left-peek-label" id="panorama-left-peek-label"></span>
            </button>
            <nav class="panorama-pivot-nav" id="panorama-pivot-nav"></nav>
            <div class="panorama-header-profile-wrap">
              <!-- Metro Close App Button (Visible when a dynamic app is open) -->
              <button class="btn-header-close-app" id="btn-header-close-app" title="Close application" aria-label="Close application" style="display: none;">
                <span class="btn-header-close-icon">${icon("close", 14)}</span>
                <span class="btn-header-close-label">close</span>
              </button>
              <!-- Metro User Profile Tile -->
              <button class="panorama-header-user-btn" id="panorama-header-user-btn" title="Manage Profile & Keys">
                <div class="panorama-header-avatar" id="panorama-header-avatar">
                  ${icon("user", 14)}
                </div>
                <span class="panorama-header-name" id="panorama-header-name">Identity</span>
              </button>
            </div>
          </div>
        </header>

        <!-- 2. Horizontal Panorama Canvas -->
        <div class="panorama-canvas" id="panorama-canvas">
          <!-- Section: Apps (Live Tiles Mosaic & Embedded Application View) -->
          <section class="panorama-section" id="panorama-section-apps" data-pivot="apps">
            <!-- Grid of application tiles (default state) -->
            <div class="panorama-section-content" id="panorama-apps-grid-view">
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
              </div>
              <div class="panorama-full-app-container" id="panorama-full-app-container" style="flex: 1; width: 100%; min-height: 100%; overflow: visible;"></div>
            </div>
          </section>

          <!-- Section 3: Widgets (Modular Companion Tools) -->
          <section class="panorama-section" id="panorama-section-widgets" data-pivot="widgets">
            <div class="panorama-section-content">
              <div class="panorama-widgets-grid" id="panorama-widgets-slot"></div>
            </div>
          </section>

          <!-- Section 4: System (Governance & Control) -->
          <section class="panorama-section" id="panorama-section-system" data-pivot="system">
            <div class="panorama-section-content">
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

              <!-- Installed Shells Card -->
              <div class="panorama-system-card panorama-installed-shells-card" id="panorama-shells-card" style="display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                  <div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <strong style="font-size: 0.9rem;">Installed Shells</strong>
                      <span id="panorama-shell-count" class="panorama-badge" style="font-size: 0.68rem; padding: 2px 6px; background: #222; border: 1px solid #333; color: #aaa;">2 installed</span>
                    </div>
                    <p style="font-size: 0.75rem; color: #888; margin-top: 2px;">
                      Host UI frames, viewport mapping, and navigation layouts. Exactly one shell can be active.
                    </p>
                  </div>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <button id="btn-panorama-install-shell" class="btn-panorama-action" style="color: var(--omni-accent-primary, #00a4ef); border-color: var(--omni-accent-primary, #00a4ef); font-size: 0.78rem; height: 32px; display: inline-flex; align-items: center; gap: 4px;">
                      ${icon("plus", 14)}
                      <span>Install Shell</span>
                    </button>
                    <!-- Preserved container for switcher buttons -->
                    <div id="panorama-shell-switcher-buttons" style="display: flex; gap: 6px; flex-wrap: wrap;"></div>
                  </div>
                </div>
                <!-- Installed Shell Cards List -->
                <div id="panorama-installed-shells-list" style="display: flex; flex-direction: column; gap: 8px;"></div>
              </div>

              <!-- Theme Accent Color Card -->
              <div class="panorama-system-card" id="panorama-accent-card">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 12px;">
                  <div>
                    <strong>Accent Color</strong>
                    <p style="font-size: 0.75rem; color: #888; margin-top: 2px;">Personalize live tiles, highlights, and controls.</p>
                  </div>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span id="panorama-system-color-hex" style="font-family: var(--omni-font-mono, monospace); font-size: 0.8rem; font-weight: 600; color: var(--omni-accent-primary, #00a4ef);">#00A4EF</span>
                    <label title="Pick Custom Color" style="cursor: pointer; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: 1px solid #444; background: #222; position: relative;">
                      <input type="color" id="panorama-system-custom-color" style="opacity: 0; width: 100%; height: 100%; position: absolute; top: 0; left: 0; cursor: pointer;" />
                      <span style="font-size: 0.8rem; pointer-events: none;">🎨</span>
                    </label>
                  </div>
                </div>
                <div class="panorama-color-swatches-grid" id="panorama-system-swatches-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(36px, 1fr)); gap: 8px;"></div>
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
              <div class="panorama-system-card panorama-installed-plugins-card" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 32px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <strong>Installed Plugins</strong>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <button id="btn-panorama-install" class="btn-panorama-action" style="color: var(--omni-accent-primary, #00a4ef); border-color: var(--omni-accent-primary, #00a4ef);">+ Install nsite</button>
                    <span id="panorama-plugin-count" style="font-size: 0.75rem; color: #888;">5 installed</span>
                  </div>
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
                <span id="panorama-open-with-target" style="font-size: 0.75rem; color: var(--omni-accent-primary, #00a4ef); word-break: break-all; font-family: var(--omni-font-mono);"></span>
              </div>
              <div id="panorama-open-with-list" style="display: flex; flex-direction: column; gap: 6px; max-height: 200px; overflow-y: auto;"></div>
              <label style="display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: #aaa; cursor: pointer; padding-top: 4px; border-top: 1px solid #222;">
                <input id="panorama-open-with-always" type="checkbox" />
                <span id="panorama-open-with-always-label">Always use this application</span>
              </label>
              <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px;">
                <button id="btn-panorama-open-with-cancel" class="btn-panorama-action" style="padding: 6px 12px;">Cancel</button>
                <button id="btn-panorama-open-with-confirm" class="btn-panorama-action" style="padding: 6px 12px; border-color: var(--omni-accent-primary, #00a4ef); color: var(--omni-accent-primary, #00a4ef);" disabled>Open</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 6. Install nsite / Plugin Modal -->
        <div class="panorama-inspector-modal" id="panorama-install-modal" style="display: none; align-items: center; justify-content: center;">
          <div class="panorama-inspector-content" style="max-width: 520px; width: 92%; max-height: 85vh; overflow-y: auto;">
            <div class="panorama-inspector-header">
              <h3 style="margin: 0; font-size: 1.05rem; color: #fff;">Install nsite / Decentralized App</h3>
              <button class="btn-app-bar-circle" id="btn-panorama-install-close" style="width: 32px; height: 32px; border: 1px solid #666;" title="Close">
                ${icon("close", 16)}
              </button>
            </div>
            <div style="padding: 16px; display: flex; flex-direction: column; gap: 14px;">
              <label style="display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; color: #ccc;">
                <span style="font-weight: 600; color: #fff;">Nostr naddr (NIP-5A) or App URL:</span>
                <input id="panorama-install-url" type="text" placeholder="naddr1... / 35129:pubkey:d-tag / https://..." style="background: #111; border: 1px solid #333; color: #fff; padding: 8px 12px; font-size: 0.85rem; outline: none;" />
              </label>

              <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                <button id="btn-panorama-quick-sample" class="btn-panorama-action" style="font-size: 0.75rem;">Load Sample naddr</button>
                <button id="btn-panorama-confirm-install" class="btn-panorama-action" style="background: var(--omni-accent-primary, #00a4ef); color: #fff; border-color: var(--omni-accent-primary, #00a4ef); font-weight: 600; padding: 6px 14px;">Install</button>
              </div>

              <!-- Curated Decentralized Catalog -->
              <div style="margin-top: 10px; border-top: 1px solid #222; padding-top: 12px;">
                <div style="font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 8px;">
                  Featured Decentralized Apps (1-Click Install)
                </div>
                <div id="panorama-curated-catalog" style="display: flex; flex-direction: column; gap: 8px;"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- 7. Install Shell Modal -->
        <div class="panorama-inspector-modal" id="panorama-install-shell-modal" style="display: none; align-items: center; justify-content: center;">
          <div class="panorama-inspector-content" style="max-width: 540px; width: 92%; max-height: 85vh; overflow-y: auto;">
            <div class="panorama-inspector-header">
              <h3 style="margin: 0; font-size: 1.05rem; color: #fff;">Install Shell Experience</h3>
              <button class="btn-app-bar-circle" id="btn-panorama-install-shell-close" style="width: 32px; height: 32px; border: 1px solid #666;" title="Close">
                ${icon("close", 16)}
              </button>
            </div>
            <div style="padding: 16px; display: flex; flex-direction: column; gap: 14px;">
              <p style="font-size: 0.8rem; color: #aaa; margin: 0;">
                Shell experiences redefine the entire application layout, typography, navigation docks, and theme system.
              </p>

              <!-- Curated Shell Catalog -->
              <div>
                <div style="font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 8px;">
                  Featured Shells (1-Click Install)
                </div>
                <div id="panorama-curated-shell-catalog" style="display: flex; flex-direction: column; gap: 8px;"></div>
              </div>

              <!-- Custom Shell Installation -->
              <div style="border-top: 1px solid #222; padding-top: 12px; display: flex; flex-direction: column; gap: 10px;">
                <div style="font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #888;">
                  Install Custom Shell
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                  <label style="display: flex; flex-direction: column; gap: 4px; font-size: 0.8rem; color: #ccc;">
                    <span>Shell ID:</span>
                    <input id="panorama-custom-shell-id" type="text" placeholder="e.g. minimalist" style="background: #111; border: 1px solid #333; color: #fff; padding: 6px 10px; font-size: 0.8rem; outline: none;" />
                  </label>
                  <label style="display: flex; flex-direction: column; gap: 4px; font-size: 0.8rem; color: #ccc;">
                    <span>Shell Name:</span>
                    <input id="panorama-custom-shell-name" type="text" placeholder="e.g. Minimalist Shell" style="background: #111; border: 1px solid #333; color: #fff; padding: 6px 10px; font-size: 0.8rem; outline: none;" />
                  </label>
                </div>
                <label style="display: flex; flex-direction: column; gap: 4px; font-size: 0.8rem; color: #ccc;">
                  <span>Description:</span>
                  <input id="panorama-custom-shell-desc" type="text" placeholder="Brief description of the shell..." style="background: #111; border: 1px solid #333; color: #fff; padding: 6px 10px; font-size: 0.8rem; outline: none;" />
                </label>
                <div style="display: flex; justify-content: flex-end;">
                  <button id="btn-panorama-confirm-custom-shell" class="btn-panorama-action" style="background: var(--omni-accent-primary, #00a4ef); color: #fff; border-color: var(--omni-accent-primary, #00a4ef); font-weight: 600;">
                    Install Custom Shell
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Desktop Edge Hover Gliders -->
        <button class="panorama-edge-glider glider-left" id="panorama-glider-left" title="Previous pane" aria-label="Previous pane">
          ${icon("chevron-left", 20)}
        </button>
        <button class="panorama-edge-glider glider-right" id="panorama-glider-right" title="Next pane" aria-label="Next pane">
          ${icon("chevron-right", 20)}
        </button>

        <!-- Floating Back to Top Button -->
        <button class="panorama-back-to-top" id="panorama-back-to-top" title="Back to top" aria-label="Back to top">
          ${icon("arrow-up", 16)}
          <span>Top</span>
        </button>

        <!-- Metro Bottom Application Bar -->
        <footer class="panorama-bottom-app-bar" id="panorama-bottom-app-bar">
          <div class="app-bar-content">
            <div class="app-bar-actions" id="panorama-app-bar-actions"></div>
            <button class="btn-app-bar-more" id="btn-app-bar-more" title="More options" aria-label="More options">
              ${icon("more", 18)}
            </button>
          </div>
          <div class="panorama-app-bar-menu" id="panorama-app-bar-menu" style="display: none;"></div>
        </footer>
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
    this.gliderLeft = q("#panorama-glider-left");
    this.gliderRight = q("#panorama-glider-right");
    this.bottomAppBar = q("#panorama-bottom-app-bar");
    this.appBarMenu = q("#panorama-app-bar-menu");
    this.headerCloseBtn = q("#btn-header-close-app");
  }

  private updateHeaderCloseButton(visible: boolean): void {
    const btn = this.headerCloseBtn || this.root.querySelector<HTMLElement>("#btn-header-close-app") || document.getElementById("btn-header-close-app");
    if (btn) {
      btn.style.display = visible ? "inline-flex" : "none";
    }
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
    if (!grid) return;

    grid.innerHTML = "";
    const apps = this.installedPlugins.filter((p) => p.enabled !== false);

    if (apps.length === 0) {
      const emptyCard = document.createElement("div");
      emptyCard.className = "panorama-empty-state";
      emptyCard.style.gridColumn = "1 / -1";
      emptyCard.innerHTML = `
        ${icon("apps", 36)}
        <h4>No Applications Installed</h4>
        <p>Install decentralized web apps (nsites) from Nostr relays or explore the catalog.</p>
        <button class="btn-panorama-action btn-empty-install" style="color: var(--omni-accent-primary, #00a4ef); border-color: var(--omni-accent-primary, #00a4ef); margin-top: 4px;">Install App</button>
      `;
      emptyCard.querySelector(".btn-empty-install")?.addEventListener("click", () => {
        const installModal = document.getElementById("panorama-install-modal");
        if (installModal) installModal.style.display = "flex";
      });
      grid.appendChild(emptyCard);
      return;
    }

    // Color palette inspired by Windows Phone signature accent colors
    const tileColors = [
      this.currentAccentColor,
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
      const safeId = plugin.id.replace(/[^a-zA-Z0-9_-]/g, "-");

      const tile = document.createElement("div");
      tile.className = "panorama-tile";
      tile.dataset.pluginId = plugin.id;
      tile.style.backgroundColor = color;

      const iconSvg = renderPluginIcon(meta.icon, 28, "", plugin.id || meta.name);

      const synthManifest = this.ensurePluginManifest(plugin);
      const views = plugin.views || synthManifest.views || [];
      const hasCompactView = views.some(
        (v: any) => v.id === "compact" || (v.path && v.path.includes("view=compact"))
      );

      if (hasCompactView) {
        tile.classList.add("has-compact-view");
        tile.innerHTML = `
          <div class="panorama-tile-header">
            <div style="display: flex; align-items: center; gap: 8px;">
              <div class="panorama-tile-icon" style="width: 22px; height: 22px;">${iconSvg}</div>
              <div class="panorama-tile-title" style="font-size: 0.8rem;">${meta.name}</div>
            </div>
            ${isPinned ? `<span class="panorama-tile-pin" style="position: static; opacity: 0.7;">${icon("pin", 11)}</span>` : ""}
          </div>
          <div class="panorama-tile-compact-container" id="panorama-tile-compact-${safeId}"></div>
        `;
      } else {
        tile.innerHTML = `
          <div class="panorama-tile-icon">${iconSvg}</div>
          <div class="panorama-tile-title">${meta.name}</div>
          ${isPinned ? `<span class="panorama-tile-pin">${icon("pin", 12)}</span>` : ""}
        `;
      }

      // Long-press detection for touch devices & context menu on desktop
      let touchTimer: any = null;
      let startX = 0;
      let startY = 0;
      let longPressed = false;

      tile.addEventListener("touchstart", (e) => {
        const touch = e.touches[0];
        if (!touch) return;
        startX = touch.clientX;
        startY = touch.clientY;
        longPressed = false;
        touchTimer = setTimeout(() => {
          longPressed = true;
          this.openTileContextMenu(plugin, touch.clientX, touch.clientY);
        }, 500);
      }, { passive: true });

      tile.addEventListener("touchmove", (e) => {
        const touch = e.touches[0];
        if (!touch || !touchTimer) return;
        if (Math.abs(touch.clientX - startX) > 10 || Math.abs(touch.clientY - startY) > 10) {
          clearTimeout(touchTimer);
          touchTimer = null;
        }
      }, { passive: true });

      tile.addEventListener("touchend", () => {
        if (touchTimer) {
          clearTimeout(touchTimer);
          touchTimer = null;
        }
      });

      tile.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.openTileContextMenu(plugin, e.clientX, e.clientY);
      });

      tile.addEventListener("click", (e) => {
        if (longPressed) {
          longPressed = false;
          return;
        }
        const clickedButton = (e.target as HTMLElement).closest("button");
        if (clickedButton && clickedButton.closest(".panorama-tile-compact-container")) {
          return;
        }
        this.showPage(plugin.id);
      });

      grid.appendChild(tile);

      if (hasCompactView) {
        const compactContainer = tile.querySelector<HTMLElement>(`#panorama-tile-compact-${safeId}`);
        if (compactContainer) {
          this.mountCompactTile(plugin, safeId, compactContainer);
        }
      }
    });
  }

  public async ensureCompactTilesMounted(): Promise<void> {
    const apps = this.installedPlugins.filter((p) => p.enabled !== false);
    for (const plugin of apps) {
      const synthManifest = this.ensurePluginManifest(plugin);
      const views = plugin.views || synthManifest.views || [];
      const hasCompactView = views.some(
        (v: any) => v.id === "compact" || (v.path && v.path.includes("view=compact"))
      );
      if (hasCompactView) {
        const safeId = plugin.id.replace(/[^a-zA-Z0-9_-]/g, "-");
        const container = document.getElementById(`panorama-tile-compact-${safeId}`);
        if (container && !container.querySelector(".omni-component-slot")) {
          await this.mountCompactTile(plugin, safeId, container);
        }
      }
    }
  }

  public async mountCompactTile(plugin: InstalledPluginEntry, safeId: string, targetEl?: HTMLElement): Promise<void> {
    const container = targetEl || document.getElementById(`panorama-tile-compact-${safeId}`);
    if (!container) return;
    const compactInstanceKey = `${plugin.id}::compact`;
    if (this.pendingCompactMounts.has(compactInstanceKey)) {
      return;
    }
    const existingSandbox = this.kernel.getSandbox(compactInstanceKey);
    if (existingSandbox) {
      if (this.kernel.reparentLiveComponent(compactInstanceKey, container)) {
        return;
      }
      this.kernel.disablePlugin(compactInstanceKey);
    }
    this.pendingCompactMounts.add(compactInstanceKey);
    try {
      const synthManifest = this.ensurePluginManifest(plugin);
      const compactManifest = {
        ...synthManifest,
        components: [
          {
            id: `${plugin.id}-compact`,
            type: "compact",
            title: plugin.name || plugin.id,
            slot: "compact"
          }
        ]
      };
      const customSlotContainers = new Map();
      customSlotContainers.set("compact", container);
      customSlotContainers.set("main", container);
      customSlotContainers.set("dock", container);
      customSlotContainers.set("sidebar", container);
      if (synthManifest.components) {
        for (const comp of synthManifest.components) {
          if (comp.slot) customSlotContainers.set(comp.slot, container);
        }
      }
      await this.kernel.registerPlugin(
        compactManifest,
        plugin.htmlContent || plugin.scriptContent,
        customSlotContainers,
        {
          instanceId: compactInstanceKey,
          route: "?view=compact",
          viewId: "compact",
          targetSlot: "compact",
          relays: plugin.relays
        }
      );
    } catch (err) {
      console.warn(`Failed to mount compact tile for ${plugin.id}:`, err);
    } finally {
      this.pendingCompactMounts.delete(compactInstanceKey);
    }
  }

  public openTileContextMenu(plugin: InstalledPluginEntry, clientX: number, clientY: number): void {
    this.closeTileContextMenu();
    const meta = this.getPluginMeta(plugin);
    const isPinnedMain = this.isAppPinned(plugin);
    const placements = this.getPluginPlacements(plugin);
    const isWidget = placements.some((pl) => pl.enabled !== false && (pl.viewport === "sidebar" || pl.viewport === "widgets"));

    const backdrop = document.createElement("div");
    backdrop.className = "panorama-tile-context-backdrop";
    backdrop.id = "panorama-tile-context-backdrop";

    const menu = document.createElement("div");
    menu.className = "panorama-tile-context-menu";
    menu.id = "panorama-tile-context-menu";

    menu.innerHTML = `
      <div class="panorama-tile-context-header">${meta.name}</div>
      <button class="context-menu-item" data-action="pin-pivot">
        ${isPinnedMain ? icon("close", 14) : icon("pin", 14)}
        <span>${isPinnedMain ? "Unpin from Pivots" : "Pin to Pivots"}</span>
      </button>
      <button class="context-menu-item" data-action="pin-widget">
        ${isWidget ? icon("close", 14) : icon("widgets", 14)}
        <span>${isWidget ? "Remove from Widgets" : "Pin as Widget"}</span>
      </button>
      <button class="context-menu-item" data-action="inspect">
        ${icon("sliders", 14)}
        <span>App Info & Permissions</span>
      </button>
      <button class="context-menu-item" data-action="update">
        ${icon("refresh", 14)}
        <span>Update App...</span>
      </button>
      <button class="context-menu-item" data-action="uninstall" style="color: #ff5555;">
        ${icon("close", 14)}
        <span>Uninstall App</span>
      </button>
      <button class="context-menu-item context-menu-cancel" data-action="cancel">
        <span>Cancel</span>
      </button>
    `;

    const menuWidth = 240;
    const menuHeight = 180;
    const x = Math.min(Math.max(10, clientX), (window.innerWidth || 360) - menuWidth - 10);
    const y = Math.min(Math.max(10, clientY), (window.innerHeight || 600) - menuHeight - 10);
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    menu.addEventListener("click", async (e) => {
      const target = (e.target as HTMLElement).closest(".context-menu-item") as HTMLElement | null;
      if (!target) return;
      const action = target.dataset.action;
      this.closeTileContextMenu();

      if (action === "pin-pivot") {
        this.setAppPinned(plugin.id, !isPinnedMain);
        this.onWorkspaceUpdated();
      } else if (action === "pin-widget") {
        if (isWidget) {
          plugin.placements = placements.filter((pl) => pl.viewport !== "sidebar" && pl.viewport !== "widgets");
        } else {
          const widgetView = plugin.views?.find((v) => v.id === "widget") || { id: "widget", title: "Widget", path: "?view=widget" };
          plugin.placements = [
            ...placements,
            { id: `${plugin.id}-widget-${Date.now()}`, viewport: "sidebar", route: widgetView.path, viewId: widgetView.id, enabled: true }
          ];
        }
        await this.remountPlugin(plugin);
        this.onWorkspaceUpdated();
      } else if (action === "inspect") {
        this.openPluginInspector(plugin);
      } else if (action === "update") {
        this.openUpdatePluginModal(plugin);
      } else if (action === "uninstall") {
        if (confirm(`Uninstall ${meta.name}?`)) {
          this.uninstallPlugin(plugin.id);
          this.renderAppsTiles();
        }
      }
    });

    backdrop.addEventListener("click", () => this.closeTileContextMenu());

    document.body.appendChild(backdrop);
    document.body.appendChild(menu);
    this.activeContextMenu = menu;
  }

  public closeTileContextMenu(): void {
    const backdrop = document.getElementById("panorama-tile-context-backdrop");
    if (backdrop) backdrop.remove();
    const menu = document.getElementById("panorama-tile-context-menu");
    if (menu) menu.remove();
    this.activeContextMenu = null;
  }

  public renderWidgetsEmptyState(): void {
    const widgetsSlot = document.getElementById("panorama-widgets-slot");
    if (!widgetsSlot) return;
    const hasActiveWidgets = this.installedPlugins.some((p) => {
      if (!p.enabled) return false;
      const placements = this.getPluginPlacements(p);
      return placements.some((pl) => pl.enabled !== false && (pl.viewport === "sidebar" || pl.viewport === "widgets"));
    });

    const existingEmpty = widgetsSlot.querySelector(".panorama-empty-state");
    if (!hasActiveWidgets) {
      if (!existingEmpty) {
        widgetsSlot.innerHTML = `
          <div class="panorama-empty-state">
            ${icon("widgets", 36)}
            <h4>No Widgets Pinned</h4>
            <p>Pin widgets from your installed apps to monitor live tools and ambient information.</p>
            <button class="btn-panorama-action btn-add-widget-hint" style="color: var(--omni-accent-primary, #00a4ef); border-color: var(--omni-accent-primary, #00a4ef); margin-top: 4px;">Browse Apps</button>
          </div>
        `;
        widgetsSlot.querySelector(".btn-add-widget-hint")?.addEventListener("click", () => {
          this.showPivot("apps");
        });
      }
    } else {
      if (existingEmpty) existingEmpty.remove();
    }
  }

  // --- Installed Shells Management (First-Class Swappable Shells) ---

  public renderSystemShellList(): void {
    const list = (this.root.querySelector("#panorama-installed-shells-list") || document.getElementById("panorama-installed-shells-list")) as HTMLElement | null;
    const countBadge = this.root.querySelector("#panorama-shell-count") || document.getElementById("panorama-shell-count");
    const switcherButtons = (this.root.querySelector("#panorama-shell-switcher-buttons") || document.getElementById("panorama-shell-switcher-buttons")) as HTMLElement | null;

    const shells = shellRegistry.list();
    const currentActive = shellRegistry.getActiveShellId();

    if (countBadge) {
      countBadge.textContent = `${shells.length} installed`;
    }

    // Populate quick buttons for backward compatibility and tests
    if (switcherButtons) {
      switcherButtons.innerHTML = "";
      for (const s of shells) {
        const btn = document.createElement("button");
        btn.id = `btn-switch-${s.id}`;
        btn.className = `btn-panorama-action ${currentActive === s.id ? "active" : ""}`;
        btn.textContent = s.name;
        btn.title = s.description;
        btn.addEventListener("click", () => {
          shellRegistry.setActiveShell(s.id);
          this.reloadPage();
        });
        switcherButtons.appendChild(btn);
      }
    }

    if (!list) return;
    list.innerHTML = "";

    for (const s of shells) {
      const isActive = currentActive === s.id;
      const isBuiltin = s.isBuiltin !== false;
      const card = document.createElement("div");
      card.className = "panorama-shell-card";
      card.style.cssText = `
        background: #141414;
        border: 1px solid ${isActive ? "var(--omni-accent-primary, #00a4ef)" : "#222"};
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        position: relative;
      `;

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 32px; height: 32px; background: #222; border: 1px solid #333; display: flex; align-items: center; justify-content: center; color: var(--omni-accent-primary, #00a4ef); flex-shrink: 0;">
              ${s.icon && ICONS[s.icon as IconName] ? icon(s.icon as IconName, 18) : icon("layout", 18)}
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <strong style="font-size: 0.88rem; color: #fff;">${s.name}</strong>
                ${isActive ? `<span style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; padding: 1px 6px; background: var(--omni-accent-primary, #00a4ef); color: #fff;">Active</span>` : ""}
                ${!isBuiltin ? `<span style="font-size: 0.65rem; text-transform: uppercase; padding: 1px 6px; background: #262626; color: #888; border: 1px solid #333;">Custom</span>` : ""}
              </div>
              <div style="font-size: 0.72rem; color: #888; margin-top: 1px;">
                ${s.author ? `by ${s.author}` : "Omni Core Team"} • v${s.version || "1.0.0"}
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            ${!isActive ? `
              <button class="btn-panorama-action btn-activate-shell" data-shell-id="${s.id}" style="color: var(--omni-accent-primary, #00a4ef); border-color: var(--omni-accent-primary, #00a4ef); font-size: 0.75rem; padding: 4px 10px; height: 28px;">
                Activate
              </button>
            ` : `
              <span style="font-size: 0.72rem; color: var(--omni-accent-primary, #00a4ef); font-weight: 600; padding: 4px 6px;">Current</span>
            `}
            ${!isBuiltin ? `
              <button class="btn-panorama-action btn-uninstall-shell" data-shell-id="${s.id}" style="color: #ff5555; border-color: #552222; font-size: 0.75rem; padding: 4px 8px; height: 28px;">
                Uninstall
              </button>
            ` : ""}
          </div>
        </div>
        <p style="font-size: 0.78rem; color: #bbb; margin: 0; line-height: 1.35;">${s.description}</p>
      `;

      card.querySelector(".btn-activate-shell")?.addEventListener("click", () => {
        shellRegistry.setActiveShell(s.id);
        this.reloadPage();
      });

      card.querySelector(".btn-uninstall-shell")?.addEventListener("click", () => {
        if (confirm(`Uninstall shell '${s.name}'?`)) {
          shellRegistry.uninstall(s.id);
          this.renderSystemShellList();
          this.showToast(`Uninstalled shell ${s.name}`);
        }
      });

      list.appendChild(card);
    }

    // Populate curated shells catalog inside modal
    this.renderCuratedShellCatalog();
  }

  public renderCuratedShellCatalog(): void {
    const catalogContainer = this.root.querySelector("#panorama-curated-shell-catalog") || document.getElementById("panorama-curated-shell-catalog");
    if (!catalogContainer) return;
    catalogContainer.innerHTML = "";

    const curated = shellRegistry.getCuratedCatalog();
    const installed = shellRegistry.list();

    for (const c of curated) {
      const isInstalled = installed.some((s) => s.id === c.id);
      const isCurrentActive = shellRegistry.getActiveShellId() === c.id;

      const item = document.createElement("div");
      item.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: #161616; border: 1px solid #282828; gap: 10px;";
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
          <div style="width: 32px; height: 32px; background: #222; border: 1px solid #333; display: flex; align-items: center; justify-content: center; color: var(--omni-accent-primary, #00a4ef); flex-shrink: 0;">
            ${c.icon && ICONS[c.icon as IconName] ? icon(c.icon as IconName, 18) : icon("layout", 18)}
          </div>
          <div style="min-width: 0;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <strong style="font-size: 0.85rem; color: #fff;">${c.name}</strong>
              <span style="font-size: 0.68rem; color: #888;">v${c.version || "1.0.0"}</span>
            </div>
            <div style="font-size: 0.74rem; color: #aaa; margin-top: 2px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
              ${c.description}
            </div>
          </div>
        </div>
        <div style="flex-shrink: 0;">
          ${isInstalled ? (
            isCurrentActive ? `
              <span style="font-size: 0.72rem; color: var(--omni-accent-primary, #00a4ef); font-weight: 600;">Active</span>
            ` : `
              <button class="btn-panorama-action btn-activate-curated-shell" data-shell-id="${c.id}" style="font-size: 0.75rem; padding: 4px 10px;">
                Activate
              </button>
            `
          ) : `
            <button class="btn-panorama-action btn-install-curated-shell" data-shell-id="${c.id}" style="color: var(--omni-accent-primary, #00a4ef); border-color: var(--omni-accent-primary, #00a4ef); font-size: 0.75rem; padding: 4px 10px;">
              Install Shell
            </button>
          `}
        </div>
      `;

      item.querySelector(".btn-install-curated-shell")?.addEventListener("click", () => {
        shellRegistry.install(c);
        this.renderSystemShellList();
        this.showToast(`Installed ${c.name} Shell!`);
      });

      item.querySelector(".btn-activate-curated-shell")?.addEventListener("click", () => {
        shellRegistry.setActiveShell(c.id);
        this.reloadPage();
      });

      catalogContainer.appendChild(item);
    }
  }

  public wireShellManagement(): void {
    const modal = (this.root.querySelector("#panorama-install-shell-modal") || document.getElementById("panorama-install-shell-modal")) as HTMLElement | null;
    const btnOpen = (this.root.querySelector("#btn-panorama-install-shell") || document.getElementById("btn-panorama-install-shell")) as HTMLElement | null;
    const btnClose = (this.root.querySelector("#btn-panorama-install-shell-close") || document.getElementById("btn-panorama-install-shell-close")) as HTMLElement | null;
    const btnConfirmCustom = (this.root.querySelector("#btn-panorama-confirm-custom-shell") || document.getElementById("btn-panorama-confirm-custom-shell")) as HTMLElement | null;

    btnOpen?.addEventListener("click", () => {
      if (modal) modal.style.display = "flex";
      this.renderCuratedShellCatalog();
    });

    btnClose?.addEventListener("click", () => {
      if (modal) modal.style.display = "none";
    });

    modal?.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).id === "panorama-install-shell-modal") {
        modal.style.display = "none";
      }
    });

    btnConfirmCustom?.addEventListener("click", () => {
      const idInput = (this.root.querySelector("#panorama-custom-shell-id") || document.getElementById("panorama-custom-shell-id")) as HTMLInputElement | null;
      const nameInput = (this.root.querySelector("#panorama-custom-shell-name") || document.getElementById("panorama-custom-shell-name")) as HTMLInputElement | null;
      const descInput = (this.root.querySelector("#panorama-custom-shell-desc") || document.getElementById("panorama-custom-shell-desc")) as HTMLInputElement | null;

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
        isBuiltin: false
      });

      if (idInput) idInput.value = "";
      if (nameInput) nameInput.value = "";
      if (descInput) descInput.value = "";

      if (modal) modal.style.display = "none";
      this.renderSystemShellList();
      this.showToast(`Installed shell ${name}!`);
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
      iconBox.innerHTML = renderPluginIcon(meta.icon, 18, "", plugin.id || meta.name);

      const titleCol = document.createElement("div");
      titleCol.style.cssText = "display: flex; flex-direction: column; gap: 2px;";
      titleCol.innerHTML = `
        <div style="display: flex; align-items: center; gap: 6px;">
          <strong style="font-size: 0.88rem; color: #fff;">${meta.name}</strong>
          <span style="font-size: 0.65rem; color: #888; background: #1a1a1a; padding: 1px 5px; border-radius: 0;">v${meta.version}</span>
        </div>
        <span style="font-size: 0.7rem; color: ${plugin.enabled ? "#888" : "#666"};">${plugin.enabled ? "Active" : "Disabled"}</span>
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

        const idInfoRow = document.createElement("div");
        idInfoRow.className = "plugin-details-id-row";
        idInfoRow.style.cssText = "display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.72rem; color: #888; padding: 2px 0 6px 0;";
        idInfoRow.innerHTML = `
          <span>ID: <code style="font-family: var(--omni-font-mono, monospace); color: #aaa;">${plugin.id}</code></span>
          <span style="color: ${plugin.enabled ? "#4caf50" : "#888"};">${plugin.enabled ? "Active" : "Disabled"}</span>
        `;
        details.appendChild(idInfoRow);

        // Section A: Sandboxed Settings
        const settingsBox = document.createElement("div");
        settingsBox.className = "panorama-config-section plugin-settings-box";
        settingsBox.style.cssText = "display: flex; flex-direction: column; gap: 8px; background: #141414; padding: 10px 12px; border: 1px solid #222;";

        const settingsHeader = document.createElement("div");
        settingsHeader.className = "panorama-config-section-title";
        settingsHeader.style.cssText = "display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem; font-weight: 600; color: #fff;";

        const settingsTitle = document.createElement("span");
        settingsTitle.textContent = "Preferences";
        settingsHeader.appendChild(settingsTitle);

        const mountContainer = document.createElement("div");
        mountContainer.id = `panorama-settings-mount-${safeId}`;
        mountContainer.className = "plugin-settings-mount-container";
        mountContainer.style.cssText = "display: none; margin-top: 6px; padding: 10px; background: #000; border: 1px solid #222;";

        if (settingsView) {
          const btnToggleSettings = document.createElement("button");
          btnToggleSettings.className = "btn-panorama-action btn-plugin-settings";
          btnToggleSettings.id = `btn-toggle-settings-${safeId}`;
          btnToggleSettings.textContent = "Configure";

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
                btnToggleSettings.textContent = "Close";
              } catch (err) {
                console.error(`Failed to mount settings for ${plugin.id}:`, err);
                mountContainer.textContent = "Failed to load settings.";
                btnToggleSettings.textContent = "Configure";
              }
            } else {
              this.kernel.destroyPluginSettings(plugin.id);
              mountContainer.style.display = "none";
              mountContainer.innerHTML = "";
              btnToggleSettings.textContent = "Configure";
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
          row.style.cssText = "display: flex; flex-direction: column; gap: 8px; background: #0c0c0c; padding: 10px 12px; border: 1px solid #1e1e1e;";

          const rowHeader = document.createElement("div");
          rowHeader.style.cssText = "display: flex; align-items: center; justify-content: space-between;";

          const plNumber = document.createElement("span");
          plNumber.style.cssText = "font-size: 0.74rem; font-weight: 600; color: #fff;";
          plNumber.textContent = `Placement #${plIdx + 1}`;
          rowHeader.appendChild(plNumber);

          const btnRemovePl = document.createElement("button");
          btnRemovePl.className = "btn-panorama-action btn-remove-placement";
          btnRemovePl.style.cssText = "font-size: 0.72rem; padding: 4px 10px; color: #ff5555; border-color: #552222;";
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
          rowHeader.appendChild(btnRemovePl);
          row.appendChild(rowHeader);

          const fieldsGrid = document.createElement("div");
          fieldsGrid.className = "plugin-placement-fields";
          fieldsGrid.style.cssText = "display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px;";

          const vpCol = document.createElement("label");
          vpCol.style.cssText = "display: flex; flex-direction: column; gap: 4px; font-size: 0.7rem; color: #888;";
          const vpLabel = document.createElement("span");
          vpLabel.textContent = "Viewport";
          vpCol.appendChild(vpLabel);

          const vpSelect = document.createElement("select");
          vpSelect.className = "plugin-viewport-select";
          vpSelect.style.cssText = "background: #191919; border: 1px solid #333; color: #fff; font-size: 0.75rem; padding: 6px 8px; outline: none; cursor: pointer; width: 100%; height: 32px; box-sizing: border-box;";

          let hasSelectedVp = false;
          for (const optDef of viewportOptions) {
            const opt = document.createElement("option");
            opt.value = optDef.id;
            opt.textContent = optDef.label;
            if (optDef.id === pl.viewport) {
              opt.selected = true;
              hasSelectedVp = true;
            }
            vpSelect.appendChild(opt);
          }
          if (!hasSelectedVp) {
            const placeholder = document.createElement("option");
            placeholder.value = "";
            placeholder.textContent = "Select Viewport...";
            placeholder.disabled = true;
            placeholder.selected = true;
            vpSelect.insertBefore(placeholder, vpSelect.firstChild);
          }

          vpSelect.addEventListener("change", async () => {
            pl.viewport = vpSelect.value;
            plugin.viewport = pl.viewport;
            if (pl.viewport === "dock") {
              plugin.pinned = true;
            }
            const primaryComp = synthManifest.components?.[0];
            if (primaryComp) {
              this.layoutManager.setComponentSlot(plugin.id, primaryComp.id, pl.viewport);
            }
            await this.remountPlugin(plugin);
          });
          vpCol.appendChild(vpSelect);
          fieldsGrid.appendChild(vpCol);

          const routeCol = document.createElement("label");
          routeCol.style.cssText = "display: flex; flex-direction: column; gap: 4px; font-size: 0.7rem; color: #888;";
          const routeLabel = document.createElement("span");
          routeLabel.textContent = "Sub-View Route";
          routeCol.appendChild(routeLabel);

          const routeSelect = document.createElement("select");
          routeSelect.className = "plugin-route-select";
          routeSelect.style.cssText = "background: #191919; border: 1px solid #333; color: #fff; font-size: 0.75rem; padding: 6px 8px; outline: none; cursor: pointer; width: 100%; height: 32px; box-sizing: border-box;";

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
          routeCol.appendChild(routeSelect);
          fieldsGrid.appendChild(routeCol);

          row.appendChild(fieldsGrid);

          if (pl.viewport === "main") {
            const isPinned = this.isAppPinned(plugin);
            const pinBtnWrap = document.createElement("div");
            pinBtnWrap.style.cssText = "display: flex; justify-content: flex-start; margin-top: 2px;";

            const pinBtn = document.createElement("button");
            pinBtn.className = "btn-panorama-action btn-pin-dock";
            pinBtn.style.cssText = `font-size: 0.74rem; padding: 5px 12px; display: inline-flex; align-items: center; gap: 6px; color: ${
              isPinned ? "var(--omni-accent-primary, #00a4ef)" : "#bbb"
            }; border-color: ${isPinned ? "var(--omni-accent-primary, #00a4ef)" : "#333"};`;
            pinBtn.innerHTML = `${icon("pin", 12)} <span>${isPinned ? "Pinned to Tiles" : "Pin to Tiles"}</span>`;
            pinBtn.title = isPinned ? "Unpin tile" : "Pin live tile";
            pinBtn.addEventListener("click", () => {
              this.setAppPinned(plugin.id, !isPinned);
              this.renderSystemPluginList();
            });
            pinBtnWrap.appendChild(pinBtn);
            row.appendChild(pinBtnWrap);
          }

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
        actionsRow.className = "panorama-config-actions plugin-actions-row";
        actionsRow.style.cssText = "display: flex; gap: 8px; align-items: center; margin-top: 6px; flex-wrap: wrap;";

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
        <div><strong>Plugin ID:</strong> <code style="color: var(--omni-accent-primary, #00a4ef);">${meta.id}</code></div>
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

      // If an unpinned app is currently open, show its dynamic pivot tab right next to apps
      if (sp === "apps" && this.currentOpenedAppId && !mainApps.some((a) => a.id === this.currentOpenedAppId)) {
        const openedPlugin = this.installedPlugins.find((p) => p.id === this.currentOpenedAppId);
        if (openedPlugin) {
          const meta = this.getPluginMeta(openedPlugin);
          const dynBtn = document.createElement("button");
          dynBtn.className = "panorama-pivot-item panorama-dynamic-pivot";
          dynBtn.dataset.pivot = openedPlugin.id;
          if (this.activePivot === openedPlugin.id) {
            dynBtn.classList.add("active");
          }
          dynBtn.innerHTML = `<span>${(openedPlugin.name || meta.name).toLowerCase()}</span><span class="dynamic-pivot-close" title="Close application" aria-label="Close application">${icon("close", 10)}</span>`;
          dynBtn.addEventListener("click", (e) => {
            if ((e.target as HTMLElement).closest(".dynamic-pivot-close")) {
              e.stopPropagation();
              this.closeApp();
            } else {
              this.showPivot(openedPlugin.id);
            }
          });
          this.pivotHeadersTrack.appendChild(dynBtn);
        }
      }
    }
  }

  public async openApp(pluginId: string, pushHistory = true): Promise<void> {
    const plugin = this.installedPlugins.find((p) => p.id === pluginId);
    if (!plugin) {
      return;
    }

    if (pushHistory && typeof window !== "undefined" && this.currentOpenedAppId !== pluginId) {
      try {
        window.history.pushState({ type: "omni-panorama-app", pluginId }, "");
      } catch (_) {}
    }

    this.currentOpenedAppId = pluginId;
    const meta = this.getPluginMeta(plugin);
    const titleEl = document.getElementById("panorama-overlay-title");
    if (titleEl) titleEl.textContent = meta.name;

    const safeId = pluginId.replace(/[^a-zA-Z0-9_-]/g, "-");
    const isAlreadyOpen = this.fullAppOverlay?.classList.contains("open") || false;

    // 1. Maintain overlay page container for backward compatibility and test stability
    const slotEl = this.ensureAppPage(plugin.id);
    const allPages = (this.root || document).querySelectorAll<HTMLElement>(".panorama-app-page");
    allPages.forEach((p) => (p.style.display = "none"));

    const target = document.getElementById(`panorama-page-app-${safeId}`);
    if (target) {
      target.style.display = "block";
    }

    if (this.sectionApps) {
      this.sectionApps.scrollTop = 0;
    }
    if (this.fullAppContainer) {
      this.fullAppContainer.scrollTop = 0;
    }

    // 2. Full app overlay visibility for backwards compatibility
    if (this.fullAppOverlay) {
      this.fullAppOverlay.classList.remove("card-flip-out-right", "card-flip-out-left", "card-flip-in-left", "card-flip-in-right");
      this.fullAppOverlay.classList.add("open");
      this.fullAppOverlay.style.display = "flex";
    }

    // 3. Create Dynamic Horizontal Pane next to Apps section
    if (this.dynamicAppSection) {
      this.dynamicAppSection.remove();
      this.dynamicAppSection = null;
    }
    const oldDynamic = document.getElementById("panorama-section-dynamic-app");
    if (oldDynamic) oldDynamic.remove();

    const dynamicSec = document.createElement("section");
    dynamicSec.className = "panorama-section panorama-dynamic-app-pane";
    dynamicSec.id = "panorama-section-dynamic-app";
    dynamicSec.dataset.pivot = pluginId;
    dynamicSec.dataset.pluginId = pluginId;

    dynamicSec.innerHTML = `
      <div class="panorama-section-content" style="height: auto; min-height: 100%; flex: 1;">
        <div id="panorama-slot-dynamic-${safeId}" class="omni-slot panorama-main-viewport-slot" style="flex: 1; width: 100%; min-height: 100%; overflow: visible;"></div>
      </div>
    `;

    if (this.sectionApps && this.sectionApps.nextSibling) {
      this.panoramaContainer?.insertBefore(dynamicSec, this.sectionApps.nextSibling);
    } else if (this.panoramaContainer) {
      this.panoramaContainer.appendChild(dynamicSec);
    }
    this.dynamicAppSection = dynamicSec;

    this.renderPivotNavigation();
    this.updateHeaderCloseButton(true);
    this.showPivot(pluginId);

    // 4. Ensure the full app view is mounted into the overlay slot container
    const overlayInstanceKey = `${plugin.id}::overlay`;

    const hasOverlaySandbox = Boolean(this.kernel.getSandbox(overlayInstanceKey));
    const overlayHasMirror = Boolean(slotEl.querySelector(".omni-component-slot"));

    if (!hasOverlaySandbox && !this.pendingOverlayMounts.has(overlayInstanceKey)) {
      await this.mountOverlayInstance(plugin, meta, slotEl, overlayInstanceKey);
    } else if (hasOverlaySandbox && !overlayHasMirror && !this.pendingOverlayMounts.has(overlayInstanceKey)) {
      if (!this.kernel.reparentLiveComponent(overlayInstanceKey, slotEl)) {
        await this.mountOverlayInstance(plugin, meta, slotEl, overlayInstanceKey);
      }
    }

    // Project app container inside the dynamic pane
    const dynamicSlot = dynamicSec.querySelector(`#panorama-slot-dynamic-${safeId}`) as HTMLElement;
    if (dynamicSlot && target) {
      dynamicSlot.appendChild(target);
    }
  }

  private async mountOverlayInstance(
    plugin: InstalledPluginEntry,
    meta: { name: string },
    slotEl: HTMLElement,
    overlayInstanceKey: string
  ): Promise<void> {
    this.pendingOverlayMounts.add(overlayInstanceKey);
    try {
      slotEl.innerHTML = "";
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
          route: plugin.route || "",
          viewId: "main",
          targetSlot: "main",
          relays: plugin.relays
        }
      );
    } catch (err) {
      console.error(`Failed to mount overlay app for ${plugin.id}:`, err);
    } finally {
      this.pendingOverlayMounts.delete(overlayInstanceKey);
    }
  }

  public closeApp(immediate = false): void {
    const prevOpenedAppId = this.currentOpenedAppId;
    this.currentOpenedAppId = null;
    this.updateHeaderCloseButton(false);
    const gridView = document.getElementById("panorama-apps-grid-view");
    const tilesGrid = document.getElementById("panorama-tiles-grid");

    if (this.sectionApps) {
      this.sectionApps.scrollTop = 0;
      this.sectionApps.classList.remove("has-active-app");
    }
    if (this.fullAppContainer) {
      this.fullAppContainer.scrollTop = 0;
    }
    if (gridView) {
      gridView.scrollTop = 0;
      gridView.style.display = "flex";
      gridView.classList.remove("card-flip-out-left", "card-flip-in-left");
    }
    if (tilesGrid) {
      tilesGrid.scrollTop = 0;
    }

    if (this.fullAppOverlay) {
      this.fullAppOverlay.classList.remove("open", "card-flip-in-right", "card-flip-out-right");
      this.fullAppOverlay.style.display = "none";
    }

    // Return app page container to fullAppContainer
    if (prevOpenedAppId) {
      const prevSafeId = prevOpenedAppId.replace(/[^a-zA-Z0-9_-]/g, "-");
      const pageEl = document.getElementById(`panorama-page-app-${prevSafeId}`);
      if (this.fullAppContainer && pageEl && pageEl.parentElement !== this.fullAppContainer) {
        this.fullAppContainer.appendChild(pageEl);
      }
    }

    const dynamicSec = this.dynamicAppSection || document.getElementById("panorama-section-dynamic-app");
    this.dynamicAppSection = null;

    // Smoothly glide back to the apps section
    this.showPivot("apps");

    if (dynamicSec) {
      dynamicSec.classList.add("pane-closing");
      if (immediate) {
        dynamicSec.remove();
        this.renderPivotNavigation();
      } else {
        setTimeout(() => {
          dynamicSec.remove();
          this.renderPivotNavigation();
        }, 220);
      }
    } else {
      this.renderPivotNavigation();
    }
  }

  public updateEdgeGliders(): void {
    if (!this.panoramaContainer || !this.gliderLeft || !this.gliderRight) return;
    const scrollLeft = this.panoramaContainer.scrollLeft;
    const maxScroll = Math.max(0, this.panoramaContainer.scrollWidth - this.panoramaContainer.clientWidth);

    if (scrollLeft <= 10) {
      this.gliderLeft.classList.add("disabled");
    } else {
      this.gliderLeft.classList.remove("disabled");
    }

    if (scrollLeft >= maxScroll - 10) {
      this.gliderRight.classList.add("disabled");
    } else {
      this.gliderRight.classList.remove("disabled");
    }
  }

  public showToast(msg: string, durationMs = 2000): void {
    let container = document.getElementById("panorama-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "panorama-toast-container";
      container.className = "panorama-toast-container";
      (this.root || document.body).appendChild(container);
    }
    const toast = document.createElement("div");
    toast.className = "panorama-toast-notification";
    toast.innerHTML = `<span>${msg}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("toast-leaving");
      setTimeout(() => toast.remove(), 200);
    }, durationMs);
  }

  public navigateAdjacentPivot(direction: "left" | "right"): void {
    if (!this.panoramaContainer) return;
    const sections = Array.from(this.panoramaContainer.querySelectorAll<HTMLElement>(".panorama-section"))
      .filter((s) => s.style.display !== "none" && s.offsetWidth > 0);
    if (sections.length === 0) return;

    const currentScroll = this.panoramaContainer.scrollLeft;
    let closestIndex = 0;
    let minDiff = Infinity;
    sections.forEach((sec, idx) => {
      const diff = Math.abs(sec.offsetLeft - currentScroll);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = idx;
      }
    });

    const targetIndex = direction === "left" ? closestIndex - 1 : closestIndex + 1;
    if (targetIndex >= 0 && targetIndex < sections.length) {
      const targetSec = sections[targetIndex];
      const pivot = targetSec.dataset.pivot;
      if (pivot) {
        this.showPivot(pivot);
      } else {
        this.panoramaContainer.scrollTo({ left: targetSec.offsetLeft, behavior: "smooth" });
      }
    }
  }

  private wireKeyboardAndGliders(): void {
    if (this.gliderLeft) {
      this.gliderLeft.addEventListener("click", () => this.navigateAdjacentPivot("left"));
    }
    if (this.gliderRight) {
      this.gliderRight.addEventListener("click", () => this.navigateAdjacentPivot("right"));
    }
    this.boundGliderScrollHandler = () => this.updateEdgeGliders();
    this.panoramaContainer?.addEventListener("scroll", this.boundGliderScrollHandler, { passive: true });
    this.updateEdgeGliders();

    this.boundKeydownHandler = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;

      const active = document.activeElement as HTMLElement | null;
      const isInput = active && (
        active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.isContentEditable ||
        Boolean(active.closest("input, textarea, [contenteditable='true']"))
      );
      if (isInput) return;

      const inspector = document.getElementById("panorama-inspector-modal");
      const openWith = document.getElementById("panorama-open-with-modal");
      const install = document.getElementById("panorama-install-modal");
      if (
        (inspector && inspector.style.display !== "none") ||
        (openWith && openWith.style.display !== "none") ||
        (install && install.style.display !== "none")
      ) {
        return;
      }

      e.preventDefault();
      this.navigateAdjacentPivot(e.key === "ArrowLeft" ? "left" : "right");
    };

    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this.boundKeydownHandler);
    }
  }

  public renderBottomAppBar(): void {
    const actionsBar = (this.root.querySelector("#panorama-app-bar-actions") || document.getElementById("panorama-app-bar-actions")) as HTMLElement | null;
    const menu = (this.root.querySelector("#panorama-app-bar-menu") || document.getElementById("panorama-app-bar-menu")) as HTMLElement | null;
    if (!actionsBar || !menu) return;

    actionsBar.innerHTML = "";
    menu.innerHTML = "";

    const enabledPlugins = this.installedPlugins.filter((p) => p.enabled !== false);

    // 1. Compose Action: Purely intent-driven (create_note / compose_note)
    const composeHandlers = [
      ...this.kernel.intentBroker.getHandlers("create_note"),
      ...this.kernel.intentBroker.getHandlers("compose_note")
    ];
    const composePlugin = enabledPlugins.find((p) => {
      const synth = this.ensurePluginManifest(p);
      const handled = p.handledIntents || synth.permissions?.intents?.handle || [];
      return handled.includes("create_note") || handled.includes("compose_note");
    });

    if (composeHandlers.length > 0 || composePlugin) {
      const btnCompose = document.createElement("button");
      btnCompose.className = "btn-app-bar-action";
      btnCompose.id = "btn-app-bar-compose";
      btnCompose.title = "Compose note";
      btnCompose.innerHTML = `<span class="app-bar-icon-circle">${icon("plus", 14)}</span>`;
      btnCompose.addEventListener("click", async () => {
        try {
          await this.kernel.intentBroker.dispatch("shell", "create_note", {});
        } catch {
          if (composePlugin) {
            await this.showPage(composePlugin.id);
          }
        }
      });
      actionsBar.appendChild(btnCompose);
    }

    // 2. Refresh Action: Universal refresh dispatching to active section
    const btnRefresh = document.createElement("button");
    btnRefresh.className = "btn-app-bar-action";
    btnRefresh.id = "btn-app-bar-refresh";
    btnRefresh.title = "Refresh";
    btnRefresh.innerHTML = `<span class="app-bar-icon-circle">${icon("refresh", 14)}</span>`;
    btnRefresh.addEventListener("click", () => {
      btnRefresh.classList.add("is-refreshing");
      setTimeout(() => btnRefresh.classList.remove("is-refreshing"), 650);

      const activePivotName = this.activePivot === "now" ? "feed" : this.activePivot;
      this.showToast(`Refreshed ${activePivotName}`);

      const activeSection = this.panoramaContainer?.querySelector<HTMLElement>(`.panorama-section[data-pivot="${this.activePivot}"]`);
      if (activeSection) {
        activeSection.dispatchEvent(new CustomEvent("omni:refresh", { bubbles: true }));
        const refreshAffordance = activeSection.querySelector<HTMLElement>('button[data-action="refresh"], button[title*="Refresh" i], button[aria-label*="Refresh" i]');
        if (refreshAffordance) {
          refreshAffordance.click();
        }
      }
      if (this.activePivot === "apps") {
        this.renderAppsTiles();
      } else if (this.activePivot === "widgets") {
        this.ensureWidgetsMounted().catch(console.warn);
      }
    });
    actionsBar.appendChild(btnRefresh);

    // 3. Search Action: Purely intent- & view-driven
    const searchHandlers = this.kernel.intentBroker.getHandlers("search");
    const searchPlugin = enabledPlugins.find((p) => {
      const synth = this.ensurePluginManifest(p);
      const handled = p.handledIntents || synth.permissions?.intents?.handle || [];
      const views = p.views || synth.views || [];
      return handled.includes("search") || views.some((v: any) => v.id === "search" || (v.path && v.path.includes("search")));
    });

    if (searchHandlers.length > 0 || searchPlugin) {
      const btnSearch = document.createElement("button");
      btnSearch.className = "btn-app-bar-action";
      btnSearch.id = "btn-app-bar-search";
      btnSearch.title = "Search";
      btnSearch.innerHTML = `<span class="app-bar-icon-circle">${icon("search", 14)}</span>`;
      btnSearch.addEventListener("click", async () => {
        if (searchPlugin) {
          await this.showPage(searchPlugin.id);
        }
        try {
          await this.kernel.intentBroker.dispatch("shell", "search", {});
        } catch (_) {}

        const focusInput = () => {
          const targetSec = this.dynamicAppSection || this.panoramaContainer || document.body;
          const searchAffordance = targetSec?.querySelector<HTMLElement>('.btn-search-feed, [data-action="search"]');
          if (searchAffordance) {
            searchAffordance.click();
          }
          const searchInput = targetSec?.querySelector<HTMLInputElement>(".feed-search-input, input[type='search'], input[name='search']");
          if (searchInput) {
            searchInput.focus();
            searchInput.select?.();
            return true;
          }
          return false;
        };

        if (!focusInput()) {
          setTimeout(focusInput, 60);
          setTimeout(focusInput, 180);
          setTimeout(focusInput, 350);
        }
      });
      actionsBar.appendChild(btnSearch);
    }

    // --- More Options Menu (···) ---
    // A. Settings & System (Core Shell Pivot)
    const btnMenuSystem = document.createElement("button");
    btnMenuSystem.className = "app-bar-menu-item";
    btnMenuSystem.id = "btn-app-bar-menu-system";
    btnMenuSystem.innerHTML = `${icon("settings", 16)} <span>Settings & System</span>`;
    btnMenuSystem.addEventListener("click", () => {
      menu.style.display = "none";
      this.showPivot("system");
    });
    menu.appendChild(btnMenuSystem);

    // B. Sync Workspace (Core Shell NIP-78)
    const btnMenuSync = document.createElement("button");
    btnMenuSync.className = "app-bar-menu-item";
    btnMenuSync.id = "btn-app-bar-menu-sync";
    btnMenuSync.innerHTML = `${icon("cloud", 16)} <span>Sync Workspace (NIP-78)</span>`;
    btnMenuSync.addEventListener("click", () => {
      menu.style.display = "none";
      document.getElementById("btn-panorama-sync")?.click();
    });
    menu.appendChild(btnMenuSync);

    // C. Relay Management: Dynamically discovered by capabilities, zero hardcoded IDs
    const relayManagerPlugin = enabledPlugins.find((p) => {
      const synth = this.ensurePluginManifest(p);
      return (
        p.manifest?.permissions?.relays?.manage === true ||
        synth.permissions?.relays?.manage === true ||
        (p.handledIntents && p.handledIntents.includes("manage_relays"))
      );
    });
    if (relayManagerPlugin) {
      const meta = this.getPluginMeta(relayManagerPlugin);
      const btnMenuRelays = document.createElement("button");
      btnMenuRelays.className = "app-bar-menu-item";
      btnMenuRelays.id = "btn-app-bar-menu-relays";
      btnMenuRelays.innerHTML = `${icon("relays", 16)} <span>${meta.name || "Manage Relays"}</span>`;
      btnMenuRelays.addEventListener("click", () => {
        menu.style.display = "none";
        this.showPage(relayManagerPlugin.id);
      });
      menu.appendChild(btnMenuRelays);
    }

    // D. Install nsite / Plugin (Core Shell Feature)
    const btnMenuInstall = document.createElement("button");
    btnMenuInstall.className = "app-bar-menu-item";
    btnMenuInstall.id = "btn-app-bar-menu-install";
    btnMenuInstall.innerHTML = `${icon("plus", 16)} <span>Install nsite / Plugin</span>`;
    btnMenuInstall.addEventListener("click", () => {
      menu.style.display = "none";
      document.getElementById("btn-panorama-install")?.click();
    });
    menu.appendChild(btnMenuInstall);
  }

  private wireBottomAppBar(): void {
    const btnMore = document.getElementById("btn-app-bar-more");
    const menu = document.getElementById("panorama-app-bar-menu") as HTMLElement | null;

    btnMore?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!menu) return;
      const isVisible = menu.style.display === "flex";
      menu.style.display = isVisible ? "none" : "flex";
    });

    if (typeof document !== "undefined") {
      document.addEventListener("click", (e) => {
        if (menu && menu.style.display === "flex" && !(e.target as HTMLElement).closest("#panorama-bottom-app-bar")) {
          menu.style.display = "none";
        }
      });
    }
  }

  public getCurrentOpenedAppId(): string | null {
    return this.currentOpenedAppId;
  }

  public showPivot(pivot: PanoramaPivot): void {
    this.activePivot = pivot;
    if (pivot === "widgets") {
      this.ensureWidgetsMounted().catch(console.warn);
    }
    if (pivot === "apps") {
      this.ensureCompactTilesMounted().catch(console.warn);
    }
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
      // If already on this pivot pane, smooth scroll to top of this section
      if (Math.abs(this.panoramaContainer.scrollLeft - targetSection.offsetLeft) < 20 && targetSection.scrollTop > 0) {
        targetSection.scrollTo({ top: 0, behavior: "smooth" });
      }

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
        const btnIndex = Array.from(buttons).indexOf(btn);
        const peekOffset = btnIndex > 0 ? 36 : 0;
        this.pivotHeadersTrack.scrollTo({
          left: Math.max(0, btn.offsetLeft - firstOffset - peekOffset),
          behavior: "smooth"
        });
      }

      this.programmaticScrollTimer = setTimeout(() => {
        this.isProgrammaticScroll = false;
        this.syncPivotScrollFromCanvas();
        this.updateEdgeGliders();
      }, 600);
      if (this.currentOpenedAppId) {
        this.updateHeaderCloseButton(pivot === this.currentOpenedAppId);
      }
      this.updateEdgeGliders();
    }
  }

  public async showPage(page: string): Promise<void> {
    if (page === "apps") {
      this.closeApp();
      this.showPivot("apps");
    } else if (page === "widgets" || page === "dashboard") {
      this.closeApp();
      this.showPivot("widgets");
      await this.ensureWidgetsMounted().catch(console.warn);
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
        const plugin = this.installedPlugins.find(
          (p) => p.id === page || p.id === `org.omni.plugin.${page}`
        );
        if (plugin && plugin.enabled) {
          const isMounted = Boolean(this.kernel.getSandbox(plugin.id));
          const slotEl = document.getElementById(`panorama-slot-main-${safeId}`);
          const hasLiveMirror = Boolean(slotEl && slotEl.querySelector(".omni-component-slot"));
          if (!isMounted) {
            await this.mountPlugin(plugin);
          } else if (!hasLiveMirror) {
            // Sandbox exists but its mirrored DOM is not in this section (e.g.
            // the mount landed in the overlay page slot). Recover by remounting.
            await this.remountPlugin(plugin);
          }
        }
      } else {
        await this.openApp(page);
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
    const PEEK_OFFSET = 36;

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
          const start = Math.max(0, (btnA?.offsetLeft ?? 0) - firstOffset - (i > 0 ? PEEK_OFFSET : 0));
          const end = Math.max(0, (btnB?.offsetLeft ?? 0) - firstOffset - PEEK_OFFSET);
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
          targetPivotScroll = Math.max(0, (lastBtn?.offsetLeft ?? 0) - firstOffset - PEEK_OFFSET);
        }
      }

      if (targetPivotScroll === 0 && scrollLeft > 0) {
        targetPivotScroll = (scrollLeft / maxCanvas) * maxPivot;
      }

      this.pivotHeadersTrack.scrollLeft = Math.max(0, targetPivotScroll);
    }

    // 2. Highlight closest pivot button
    let closestIndex = 0;
    let closestSection = sections[0];
    let minDiff = Infinity;
    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      const diff = Math.abs(sec.offsetLeft - scrollLeft);
      if (diff < minDiff) {
        minDiff = diff;
        closestSection = sec;
        closestIndex = i;
      }
    }

    const pivot = (closestSection.dataset.pivot || closestSection.dataset.pluginId) as PanoramaPivot;
    if (pivot && this.activePivot !== pivot) {
      this.activePivot = pivot;
      buttons.forEach((b) => b.classList.toggle("active", b.dataset.pivot === pivot));
      if (this.currentOpenedAppId) {
        this.updateHeaderCloseButton(pivot === this.currentOpenedAppId);
      }
      if (pivot === "widgets") {
        this.ensureWidgetsMounted().catch(console.warn);
      }
    }

    // 3. Update left pane peek hint affordance
    const peekHint = document.getElementById("panorama-left-peek-hint");
    const peekLabel = document.getElementById("panorama-left-peek-label");
    if (peekHint && closestIndex > 0) {
      const prevSection = sections[closestIndex - 1];
      const prevPivot = (prevSection?.dataset.pivot || prevSection?.dataset.pluginId || "") as PanoramaPivot;
      const prevBtn = buttons.find((b) => b.dataset.pivot === prevPivot);
      const prevTitle = prevBtn?.textContent?.trim() || prevPivot;
      if (peekLabel) peekLabel.textContent = prevTitle;
      peekHint.dataset.prevPivot = prevPivot;
      peekHint.style.opacity = "1";
      peekHint.style.pointerEvents = "auto";
    } else if (peekHint) {
      peekHint.style.opacity = "0";
      peekHint.style.pointerEvents = "none";
    }

    this.updateEdgeGliders();
  }

  private wireNavigation(): void {
    this.renderPivotNavigation();

    // Continuous horizontal scroll tracking: pivot headers follow swiping 1:1
    this.panoramaContainer?.addEventListener("scroll", () => {
      this.syncPivotScrollFromCanvas();
    }, { passive: true });

    // Vertical scroll tracking on all sections for Back to Top button
    const backToTopBtn = this.root.querySelector<HTMLElement>("#panorama-back-to-top") || document.getElementById("panorama-back-to-top");
    const sections = Array.from(this.panoramaContainer?.querySelectorAll<HTMLElement>(".panorama-section") || []);

    sections.forEach((sec) => {
      sec.addEventListener("scroll", () => {
        const anyScrolled = sections.some((s) => s.scrollTop > 200);
        if (anyScrolled) {
          backToTopBtn?.classList.add("visible");
        } else {
          backToTopBtn?.classList.remove("visible");
        }
      }, { passive: true });
    });

    backToTopBtn?.addEventListener("click", () => {
      const scrollLeft = this.panoramaContainer?.scrollLeft || 0;
      let currentSec: HTMLElement | null = null;
      let minDiff = Infinity;
      sections.forEach((sec) => {
        const diff = Math.abs(sec.offsetLeft - scrollLeft);
        if (diff < minDiff) {
          minDiff = diff;
          currentSec = sec;
        }
      });
      if (currentSec) {
        (currentSec as HTMLElement).scrollTo({ top: 0, behavior: "smooth" });
      }
    });

    // Delegate clicks from any inner back-to-top buttons
    this.root.addEventListener("click", (e: Event) => {
      const topBtn = (e.target as Element)?.closest(".btn-feed-back-to-top, [data-action='scroll-top']");
      if (topBtn) {
        const sec = topBtn.closest(".panorama-section, .main-viewport") || sections[0];
        if (sec) {
          (sec as HTMLElement).scrollTo({ top: 0, behavior: "smooth" });
        }
      }
    });
  }

  private wireGlobalEvents(): void {
    // Left pane peek affordance click
    const peekHint = document.getElementById("panorama-left-peek-hint");
    peekHint?.addEventListener("click", () => {
      const prevPivot = peekHint.dataset.prevPivot as PanoramaPivot;
      if (prevPivot) {
        this.showPivot(prevPivot);
      }
    });

    // Profile / Identity quick navigation
    const openProfile = () => {
      const profilePlugin = this.installedPlugins.find((p) => p.id === "org.omni.plugin.profile-viewer" || p.id === "org.omni.plugin.profile" || p.id.includes("profile"));
      if (profilePlugin && profilePlugin.enabled) {
        this.showPage(profilePlugin.id);
      } else {
        this.showPivot("system");
      }
    };

    document.getElementById("panorama-header-user-btn")?.addEventListener("click", openProfile);
    document.getElementById("panorama-identity-card")?.addEventListener("click", openProfile);

    // Metro header close button for dynamic open apps
    document.getElementById("btn-header-close-app")?.addEventListener("click", () => {
      this.closeApp();
    });

    // Back button on full app slide-in overlay
    const btnOverlayBack = document.getElementById("btn-overlay-back");
    btnOverlayBack?.addEventListener("click", () => {
      this.closeApp();
      if (typeof window !== "undefined" && (window.history.state?.type === "omni-panorama-app" || window.history.state?.type === "omni-people-view")) {
        try { window.history.back(); } catch (_) {}
      }
    });

    if (typeof window !== "undefined") {
      window.addEventListener("popstate", (e) => {
        if (this.currentOpenedAppId) {
          if (e.state?.type !== "omni-panorama-app" && e.state?.type !== "omni-people-view") {
            this.closeApp();
          }
        } else if (e.state?.type === "omni-panorama-app" && e.state.pluginId) {
          this.openApp(e.state.pluginId, false);
        }
      });
    }

    // Inspector Modal Close
    document.getElementById("btn-inspector-close")?.addEventListener("click", () => {
      this.closePluginInspector();
    });
    document.getElementById("panorama-inspector-modal")?.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).id === "panorama-inspector-modal") {
        this.closePluginInspector();
      }
    });

    // Shell Switcher & Registry
    this.renderSystemShellList();
    this.wireShellManagement();

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

    // Install nsite / Plugin Modal Wiring
    const panoInstallModal = document.getElementById("panorama-install-modal");
    document.getElementById("btn-panorama-install")?.addEventListener("click", () => {
      if (panoInstallModal) panoInstallModal.style.display = "flex";
    });
    document.getElementById("btn-panorama-install-close")?.addEventListener("click", () => {
      if (panoInstallModal) panoInstallModal.style.display = "none";
    });
    panoInstallModal?.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).id === "panorama-install-modal") {
        panoInstallModal.style.display = "none";
      }
    });

    const panoUrlInput = document.getElementById("panorama-install-url") as HTMLInputElement | null;
    document.getElementById("btn-panorama-quick-sample")?.addEventListener("click", async () => {
      const btn = document.getElementById("btn-panorama-quick-sample") as HTMLButtonElement | null;
      if (btn) btn.disabled = true;
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
            <div style="background: #111; padding: 14px; border: 1px solid #333;">
              <h3 style="font-size: 0.95rem; font-weight: 600; color: var(--omni-accent-primary, #00a4ef);">✦ Decentralized Wisdom</h3>
              <p style="font-size: 0.85rem; font-style: italic; margin-top: 8px;">“Don't trust, verify.” — Cypherpunk Maxim</p>
            </div>
          </body>
          </html>
        `;
        const published = await this.kernel.publishNsitePlugin(sampleManifest as any, sampleScript);
        if (panoUrlInput) panoUrlInput.value = published.naddr;
      } catch (err: any) {
        alert(`Failed: ${err.message || String(err)}`);
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    document.getElementById("btn-panorama-confirm-install")?.addEventListener("click", async () => {
      const urlText = panoUrlInput?.value.trim();
      if (!urlText) {
        alert("Please enter a Nostr naddr or App URL.");
        return;
      }
      const confirmBtn = document.getElementById("btn-panorama-confirm-install") as HTMLButtonElement | null;
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = "Resolving & Installing...";
      }
      try {
        const installed = await this.resolveAndInstallNsite(urlText);
        if (panoInstallModal) panoInstallModal.style.display = "none";
        if (panoUrlInput) panoUrlInput.value = "";
        this.renderSystemPluginList();
        this.renderAppsTiles();
        if (typeof alert === "function") { try { alert(`Installed '${installed.name}' successfully!`); } catch (_) {} }
      } catch (err: any) {
        if (typeof alert === "function") { try { alert(`Install failed: ${err.message || String(err)}`); } catch (_) {} }
      } finally {
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.textContent = "Install";
        }
      }
    });

    const panoCatalog = document.getElementById("panorama-curated-catalog");
    if (panoCatalog) {
      panoCatalog.innerHTML = "";
      for (const app of CURATED_APPS) {
        const isInstalled = this.installedPlugins.some((p) => p.id === app.id);
        const card = document.createElement("div");
        card.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: #111; border: 1px solid #222; gap: 10px;";
        card.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <strong style="font-size: 0.85rem; color: #fff;">${app.name}</strong>
              <span style="font-size: 0.65rem; color: var(--omni-accent-primary, #00a4ef); background: #1a1a1a; padding: 1px 5px;">${app.category}</span>
            </div>
            <span style="font-size: 0.72rem; color: #888; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${app.description}</span>
          </div>
        `;
        const btnInstallApp = document.createElement("button");
        btnInstallApp.className = "btn-panorama-action";
        btnInstallApp.style.cssText = "font-size: 0.72rem; padding: 3px 8px; flex-shrink: 0;";
        btnInstallApp.textContent = isInstalled ? "Installed" : "Install";
        btnInstallApp.disabled = isInstalled;
        btnInstallApp.addEventListener("click", async () => {
          btnInstallApp.disabled = true;
          btnInstallApp.textContent = "Installing...";
          try {
            await this.resolveAndInstallNsite(app.htmlContent);
            btnInstallApp.textContent = "Installed";
            this.renderSystemPluginList();
            this.renderAppsTiles();
            if (typeof alert === "function") { try { alert(`Installed ${app.name}!`); } catch (_) {} }
          } catch (err: any) {
            if (typeof alert === "function") { try { alert(`Install failed: ${err.message || String(err)}`); } catch (_) {} }
            btnInstallApp.disabled = false;
            btnInstallApp.textContent = "Install";
          }
        });
        card.appendChild(btnInstallApp);
        panoCatalog.appendChild(card);
      }
    }

    // Escape key closes modals / overlay / settings pivot
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          if (this.currentOpenedAppId) {
            this.closeApp();
            return;
          }
          this.closePluginInspector();
          if (panoInstallModal && panoInstallModal.style.display !== "none") {
            panoInstallModal.style.display = "none";
            return;
          }
          const headerColorPopup = this.root?.querySelector<HTMLElement>("#panorama-header-color-popup");
          if (headerColorPopup && headerColorPopup.style.display !== "none") {
            headerColorPopup.style.display = "none";
            return;
          }
          if (this.activePivot === "system") {
            this.showPivot("feed");
          }
        }
      });
    }
  }

  // --- Theme Accent Color Chooser ---

  public getAccentColor(): string {
    return this.currentAccentColor;
  }

  public applyAccentColor(hexColor: string, persist = true): void {
    if (!hexColor || !hexColor.startsWith("#")) return;
    this.currentAccentColor = hexColor.toUpperCase();
    if (persist && typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(PanoramaShell.STORAGE_KEY_PANORAMA_ACCENT, this.currentAccentColor);
      } catch {}
    }

    const hoverColor = adjustColorBrightness(this.currentAccentColor, -15);
    const properties: Array<[string, string]> = [
      ["--omni-accent-primary", this.currentAccentColor],
      ["--omni-accent-hover", hoverColor],
      ["--omni-accent", this.currentAccentColor],
      ["--omni-border-focus", this.currentAccentColor],
      ["--omni-status-online", this.currentAccentColor],
      ["--omni-status-badge", this.currentAccentColor],
      ["--accent-primary", this.currentAccentColor],
      ["--accent-hover", hoverColor],
      ["--accent", this.currentAccentColor],
      ["--status-online", this.currentAccentColor],
      ["--status-badge", this.currentAccentColor],
      ["--border-focus", this.currentAccentColor]
    ];

    if (typeof document !== "undefined") {
      const docEl = document.documentElement;
      for (const [prop, val] of properties) {
        docEl.style.setProperty(prop, val);
      }
    }

    if (this.root) {
      for (const [prop, val] of properties) {
        this.root.style.setProperty(prop, val);
      }
      const shellRoot = this.root.querySelector<HTMLElement>(".panorama-shell-root");
      if (shellRoot) {
        for (const [prop, val] of properties) {
          shellRoot.style.setProperty(prop, val);
        }
      }
    }

    if (this.kernel?.theme?.colors) {
      this.kernel.theme.colors.accent = this.currentAccentColor;
    }

    this.updateColorChooserUI();
    this.renderAppsTiles();
  }

  private updateColorChooserUI(): void {
    const hex = this.currentAccentColor;

    const hexLabel = this.root?.querySelector<HTMLElement>("#panorama-system-color-hex");
    if (hexLabel) {
      hexLabel.textContent = hex;
      hexLabel.style.color = hex;
    }

    const systemCustomInput = this.root?.querySelector<HTMLInputElement>("#panorama-system-custom-color");
    if (systemCustomInput) systemCustomInput.value = hex;

    this.root?.querySelectorAll<HTMLButtonElement>(".panorama-color-swatch").forEach((btn) => {
      const swatchHex = btn.dataset.color?.toUpperCase();
      btn.classList.toggle("active", swatchHex === hex);
    });
  }

  private renderColorChoosers(): void {
    const grid = this.root.querySelector<HTMLElement>("#panorama-system-swatches-grid");
    if (grid) {
      grid.innerHTML = "";
      PANORAMA_ACCENT_PRESETS.forEach((preset) => {
        const btn = document.createElement("button");
        btn.className = "panorama-color-swatch";
        btn.dataset.color = preset.hex;
        btn.title = preset.name;
        btn.style.backgroundColor = preset.hex;
        if (preset.hex.toUpperCase() === this.currentAccentColor.toUpperCase()) {
          btn.classList.add("active");
        }
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.applyAccentColor(preset.hex);
        });
        grid.appendChild(btn);
      });
    }

    // Wire custom color input in settings
    const systemCustom = this.root.querySelector<HTMLInputElement>("#panorama-system-custom-color");
    systemCustom?.addEventListener("input", (e) => {
      const val = (e.target as HTMLInputElement).value;
      if (val) this.applyAccentColor(val);
    });
  }

}
