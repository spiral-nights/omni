import { OmniKernel, WebCryptoKeystore, NostrPluginResolver, LayoutManager, STANDARD_SLOTS } from "@omni/core";
import { OmniWorkspaceState, OmniWorkspacePluginConfig, PluginPlacement, OMNI_WORKSPACE_D_TAG, NostrEvent, PluginViewDeclaration, OmniShellHost } from "@omni/types";
import { ICONS, icon, IconName } from "./icons.js";
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
    this.renderSystemPluginList();
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
          <div class="panorama-section-content">
            <div class="panorama-section-title-bar">
              <h2>${(app.name || meta.name).toLowerCase()}</h2>
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
    this.renderSystemPluginList();
    this.renderColorChoosers();
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
    super.destroy();
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
        <!-- 1. Panorama Hero Header -->
        <header class="panorama-hero-header">
          <div class="panorama-brand-row" style="display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <h1 class="panorama-hero-title">omni</h1>
              <!-- Metro Left Pane Peek Affordance -->
              <button class="panorama-left-peek-hint" id="panorama-left-peek-hint" title="Previous pane" aria-label="Previous pane" style="opacity: 0; pointer-events: none;">
                <span class="panorama-left-peek-arrow">${icon("arrow-left", 14)}</span>
                <span class="panorama-left-peek-label" id="panorama-left-peek-label"></span>
              </button>
            </div>
            <!-- Header Right Actions -->
            <div style="display: flex; align-items: center; gap: 8px; position: relative;">
              <!-- Metro User Profile Tile -->
              <button class="panorama-header-user-btn" id="panorama-header-user-btn" title="Manage Profile & Keys" style="display: flex; align-items: center; gap: 8px; background: transparent; border: none; cursor: pointer; padding: 4px; color: #fff;">
                <div class="panorama-header-avatar" id="panorama-header-avatar" style="width: 26px; height: 26px; border-radius: 0px; background: #222; border: 1px solid #444; display: flex; align-items: center; justify-content: center; overflow: hidden; color: var(--omni-accent-primary, #00a4ef); flex-shrink: 0;">
                  ${icon("user", 14)}
                </div>
                <span class="panorama-header-name" id="panorama-header-name" style="font-size: 0.82rem; font-weight: 400; color: #ccc; max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Identity</span>
              </button>
            </div>
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
              </div>
              <div class="panorama-full-app-container" id="panorama-full-app-container" style="flex: 1; width: 100%; min-height: 100%; overflow: visible;"></div>
            </div>
          </section>

          <!-- Section 3: Widgets (Modular Companion Tools) -->
          <section class="panorama-section" id="panorama-section-widgets" data-pivot="widgets">
            <div class="panorama-section-content">
              <div class="panorama-section-title-bar">
                <h2>workspace widgets</h2>
              </div>
              <div class="panorama-widgets-grid" id="panorama-widgets-slot"></div>
            </div>
          </section>

          <!-- Section 4: System (Governance & Control) -->
          <section class="panorama-section" id="panorama-section-system" data-pivot="system">
            <div class="panorama-section-content">
              <div class="panorama-section-title-bar">
                <h2>system & control</h2>
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
              <div class="panorama-system-card" style="display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <strong>Installed Plugins & Relays</strong>
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
    if (!grid) return;

    grid.innerHTML = "";
    const apps = this.installedPlugins.filter((p) => p.enabled !== false);

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

    // 1. 3D card flip transition: grid view flips out to the left
    const gridView = document.getElementById("panorama-apps-grid-view");
    if (gridView) {
      if (!isAlreadyOpen) {
        gridView.classList.remove("card-flip-in-left", "card-flip-out-right", "card-flip-in-right");
        gridView.classList.add("card-flip-out-left");
        setTimeout(() => {
          if (this.currentOpenedAppId) {
            gridView.style.display = "none";
            gridView.classList.remove("card-flip-out-left");
          }
        }, 260);
      } else {
        gridView.style.display = "none";
      }
    }
    if (this.sectionApps) this.sectionApps.classList.add("has-active-app");

    // 2. Ensure the overlay page container element exists in fullAppContainer
    const slotEl = this.ensureAppPage(plugin.id);

    // 3. Hide other app pages in overlay, and display this target page
    const allPages = this.fullAppContainer?.querySelectorAll<HTMLElement>(".panorama-app-page") || [];
    allPages.forEach((p) => (p.style.display = "none"));

    const target = document.getElementById(`panorama-page-app-${safeId}`);
    if (target) {
      target.style.display = "block";
    }

    if (this.fullAppContainer) {
      this.fullAppContainer.scrollTop = 0;
    }

    // 4. 3D card flip transition: overlay flips in from the right
    if (this.fullAppOverlay) {
      this.fullAppOverlay.classList.remove("card-flip-out-right", "card-flip-out-left", "card-flip-in-left");
      this.fullAppOverlay.classList.add("open");
      if (!isAlreadyOpen) {
        this.fullAppOverlay.classList.add("card-flip-in-right");
        setTimeout(() => {
          this.fullAppOverlay?.classList.remove("card-flip-in-right");
        }, 320);
      }
      this.fullAppOverlay.style.display = "flex";
    }

    this.showPivot("apps");

    // 5. Ensure the full app view is mounted into the overlay slot container
    const overlayInstanceKey = `${plugin.id}::overlay`;
    const placements = this.getPluginPlacements(plugin);
    const hasRunningInstance =
      Boolean(this.kernel.getSandbox(overlayInstanceKey)) ||
      Boolean(this.kernel.getSandbox(plugin.id)) ||
      placements.some((pl) => Boolean(this.kernel.getSandbox(`${plugin.id}::${pl.id}`)));
    const overlayHasMirror = Boolean(slotEl.querySelector(".omni-component-slot"));


    if (!hasRunningInstance && !this.pendingOverlayMounts.has(overlayInstanceKey)) {
      await this.mountOverlayInstance(plugin, meta, slotEl, overlayInstanceKey);
    } else if (hasRunningInstance && !overlayHasMirror && !this.pendingOverlayMounts.has(overlayInstanceKey)) {
      // A sandbox exists but its live mirrored DOM is not in the overlay page
      // (e.g. the main-viewport mount landed here, or a previous overlay was
      // destroyed by a remount). Recover instead of showing a dead surface.
      if (this.kernel.reparentLiveComponent(plugin.id, slotEl)) {
      } else {
        this.kernel.disablePlugin(plugin.id);
        await this.mountPlugin(plugin);
        await this.mountOverlayInstance(plugin, meta, slotEl, overlayInstanceKey);
      }
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

      const activePubkey = localStorage.getItem("omni_active_profile_pubkey") || "";
      await this.kernel.registerPlugin(
        overlayManifest,
        plugin.htmlContent || plugin.scriptContent,
        customSlotContainers,
        {
          instanceId: overlayInstanceKey,
          route: (plugin.id === "org.omni.plugin.profile-viewer" && activePubkey) ? `?pubkey=${activePubkey}` : "",
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

  public closeApp(): void {
    const prevOpenedAppId = this.currentOpenedAppId;
    this.currentOpenedAppId = null;
    const gridView = document.getElementById("panorama-apps-grid-view");

    if (this.fullAppOverlay) {
      this.fullAppOverlay.classList.remove("open", "card-flip-in-right");
      if (prevOpenedAppId) {
        this.fullAppOverlay.classList.add("card-flip-out-right");
        if (gridView) {
          gridView.style.display = "flex";
          gridView.classList.remove("card-flip-out-left");
          gridView.classList.add("card-flip-in-left");
          setTimeout(() => {
            gridView.classList.remove("card-flip-in-left");
          }, 320);
        }
        setTimeout(() => {
          if (!this.currentOpenedAppId && this.fullAppOverlay) {
            this.fullAppOverlay.classList.remove("card-flip-out-right");
            this.fullAppOverlay.style.display = "none";
            if (this.sectionApps) this.sectionApps.classList.remove("has-active-app");
          }
        }, 260);
      } else {
        this.fullAppOverlay.style.display = "none";
        if (gridView) gridView.style.display = "flex";
        if (this.sectionApps) this.sectionApps.classList.remove("has-active-app");
      }
    } else {
      if (gridView) gridView.style.display = "flex";
      if (this.sectionApps) this.sectionApps.classList.remove("has-active-app");
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
      }, 600);
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

    // 0. Parallax translation for hero title ("omni")
    const heroTitle = this.root.querySelector<HTMLElement>(".panorama-hero-title");
    if (heroTitle) {
      heroTitle.style.transform = `translateX(${Math.round(-scrollLeft * 0.12)}px)`;
    }

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
  }

  private wireNavigation(): void {
    this.renderPivotNavigation();

    // Continuous horizontal scroll tracking: pivot headers follow swiping 1:1
    this.panoramaContainer?.addEventListener("scroll", () => {
      this.syncPivotScrollFromCanvas();
    }, { passive: true });
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
      const profilePlugin = this.installedPlugins.find((p) => p.id === "org.omni.plugin.profile");
      if (profilePlugin && profilePlugin.enabled) {
        this.showPage("org.omni.plugin.profile");
      } else {
        this.showPivot("system");
      }
    };

    document.getElementById("panorama-header-user-btn")?.addEventListener("click", openProfile);
    document.getElementById("panorama-identity-card")?.addEventListener("click", openProfile);

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

    // Escape key closes modals / overlay
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          if (this.currentOpenedAppId) {
            this.closeApp();
          }
          this.closePluginInspector();
          if (panoInstallModal) {
            panoInstallModal.style.display = "none";
          }
          const headerColorPopup = this.root?.querySelector<HTMLElement>("#panorama-header-color-popup");
          if (headerColorPopup) {
            headerColorPopup.style.display = "none";
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
