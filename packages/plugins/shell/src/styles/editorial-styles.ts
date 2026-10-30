/**
 * Editorial Shell Stylesheet (Sacred Swiss Editorial & Papyrus Sanctuary)
 *
 * Implements the dual-theme design system:
 * - Sacred Editorial (Light / Papyrus): Warm tactile rag paper (#fbfbf9), deep carbon ink (#0f172a), electric cobalt (#1e40af).
 * - Obsidian Sanctuary (Dark): Deep warm charcoal broadsheet (#151417), elevated paper plates (#222126), warm ivory text (#e5e1e4).
 * - Physical newspaper tactile paper grain overlay in both modes.
 * - Comprehensive broadsheet typography and plate styling for all first-class apps (Feed, Composer, Timer, Checklist, Relays, People).
 */
export const EDITORIAL_SHELL_CSS = /* css */ `
@import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,200..800;1,6..72,200..800&family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Geist:wght@400;500;600&display=swap');

:root.theme-editorial,
body.theme-editorial,
.editorial-shell-root {
  /* Typography */
  --omni-font-serif: "Newsreader", "Charter", "Georgia", serif;
  --omni-font-mono: "Space Mono", ui-monospace, SFMono-Regular, monospace;
  --omni-font-sans: "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --omni-font-headline: var(--omni-font-serif);

  --omni-radius-sm: 2px;
  --omni-radius-md: 4px;
  --omni-radius-lg: 8px;
  --omni-radius-pill: 9999px;

  /* Editorial Default Accent (Cobalt) */
  --omni-accent-primary: #1e40af;
  --omni-accent-hover: #1d4ed8;
  --omni-accent-contrast: #ffffff;
  --omni-status-online: #1e40af;
  --omni-status-badge: #1e40af;

  --accent-primary: var(--omni-accent-primary);
  --accent-hover: var(--omni-accent-hover);
  --accent-contrast: var(--omni-accent-contrast);
  --font-mono: var(--omni-font-mono);
  --font-serif: var(--omni-font-serif);
  --font-sans: var(--omni-font-sans);
  --radius-sm: var(--omni-radius-sm);
  --radius-md: var(--omni-radius-md);
  --radius-lg: var(--omni-radius-lg);
  --radius-pill: var(--omni-radius-pill);
  --status-online: var(--omni-status-online);
  --status-badge: var(--omni-status-badge);
}

/* Light Mode: Sacred Editorial (Papyrus Archival Paper) */
:root.theme-editorial[data-theme-mode="light"],
body.theme-editorial[data-theme-mode="light"],
.editorial-shell-root[data-theme-mode="light"] {
  color-scheme: light !important;
  --omni-bg-canvas: #fbfbf9;
  --omni-bg-surface: #f4f4f2;
  --omni-bg-elevated: #ffffff;
  --omni-bg-subtle: #eeeeec;
  --editorial-bg-rgb: 251, 251, 249;

  --omni-text-primary: #0f172a;
  --omni-text-secondary: #565e74;
  --omni-text-muted: #94a3b8;

  --omni-border-subtle: #e2e8f0;
  --omni-border-strong: #cbd5e1;
  --omni-border-focus: var(--omni-accent-primary, #1e40af);

  /* Generic Standalone Tokens */
  --bg-canvas: var(--omni-bg-canvas);
  --bg-surface: var(--omni-bg-surface);
  --bg-elevated: var(--omni-bg-elevated);
  --bg-subtle: var(--omni-bg-subtle);
  --text-primary: var(--omni-text-primary);
  --text-secondary: var(--omni-text-secondary);
  --text-muted: var(--omni-text-muted);
  --border-subtle: var(--omni-border-subtle);
  --border-strong: var(--omni-border-strong);
  --border-focus: var(--omni-border-focus);
}

/* Dark Mode: Obsidian Sanctuary (Warm Slate Broadsheet Newspaper) */
:root.theme-editorial[data-theme-mode="dark"],
body.theme-editorial[data-theme-mode="dark"],
.editorial-shell-root[data-theme-mode="dark"] {
  color-scheme: dark !important;
  /* Warm dark broadsheet newsprint paper ground — soft, rich paper tone, not harsh pitch black */
  --omni-bg-canvas: #1c1b20;
  --omni-bg-surface: #232227;
  --omni-bg-elevated: #2a2930;
  --omni-bg-subtle: #33323b;
  --editorial-bg-rgb: 28, 27, 32;

  --omni-text-primary: #e5e1e4;
  --omni-text-secondary: #c2c6d6;
  --omni-text-muted: #8c909f;

  --omni-border-subtle: #313038;
  --omni-border-strong: #42404b;
  --omni-border-focus: var(--omni-accent-primary, #4d8eff);

  /* Generic Standalone Tokens */
  --bg-canvas: var(--omni-bg-canvas);
  --bg-surface: var(--omni-bg-surface);
  --bg-elevated: var(--omni-bg-elevated);
  --bg-subtle: var(--omni-bg-subtle);
  --text-primary: var(--omni-text-primary);
  --text-secondary: var(--omni-text-secondary);
  --text-muted: var(--omni-text-muted);
  --border-subtle: var(--omni-border-subtle);
  --border-strong: var(--omni-border-strong);
  --border-focus: var(--omni-border-focus);
}

:root.theme-editorial,
body.theme-editorial {
  background-color: var(--omni-bg-canvas) !important;
  color: var(--omni-text-primary) !important;
}

/* Guarantee non-visual elements are never displayed in host DOM */
style, script, head, title, meta, link,
.omni-component-slot style,
.editorial-app-container style,
.omni-slot style {
  display: none !important;
}

/* Reset and Global Viewport */
.editorial-shell-root {
  background-color: var(--omni-bg-canvas);
  color: var(--omni-text-primary);
  font-family: var(--omni-font-serif);
  font-size: 16px;
  line-height: 1.6;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Physical Newspaper Tactile Paper Grain Overlay */
.editorial-shell-root::before {
  content: "";
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 10;
  opacity: 0.065;
  mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 250 250' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
}

.editorial-shell-root[data-theme-mode="dark"]::before {
  opacity: 0.085;
  filter: invert(1);
  mix-blend-mode: screen;
}

/* Fixed Editorial Header */
.editorial-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 58px;
  z-index: 100;
  background: rgba(var(--editorial-bg-rgb), 0.88);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--omni-border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
}

.editorial-header-inner {
  max-width: 760px;
  width: 100%;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
}

.editorial-header-left {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-height: 38px;
}

.editorial-header-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.editorial-header-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  user-select: none;
  cursor: pointer;
}

.editorial-brand-title {
  font-family: var(--omni-font-serif);
  font-size: 1.15rem;
  font-weight: 400;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--omni-text-primary);
  line-height: 1.2;
}

.editorial-view-subtitle {
  font-family: var(--omni-font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--omni-text-muted);
  margin-top: -1px;
}

.editorial-header-btn {
  background: transparent;
  border: none;
  color: var(--omni-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: var(--omni-radius-sm);
  transition: color 0.15s ease, background-color 0.15s ease;
}

.editorial-header-btn:hover {
  color: var(--omni-text-primary);
  background-color: var(--omni-bg-surface);
}

.editorial-header-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--omni-accent-primary);
  color: var(--omni-accent-contrast);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--omni-font-mono);
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid var(--omni-border-subtle);
  overflow: hidden;
}

.editorial-header-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Central Viewport Container */
.editorial-main-content {
  flex: 1;
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  box-sizing: border-box;
  padding-top: 58px;
  padding-bottom: 60px;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  z-index: 2;
  transition: max-width 0.2s ease, padding 0.2s ease;
}

/* Expansive viewport for full-page apps */
.editorial-shell-root.has-active-app .editorial-main-content {
  max-width: 1360px;
  padding-left: 20px;
  padding-right: 20px;
}

.editorial-shell-root.has-active-app .editorial-app-page {
  max-width: 100%;
}

.editorial-shell-root.has-active-app .editorial-app-container {
  max-width: 100%;
  padding: 12px 0 24px;
}

/* Fullscreen Immersive Mode */
.editorial-shell-root.app-fullscreen .editorial-header {
  display: none !important;
}

.editorial-shell-root.app-fullscreen .editorial-dock {
  display: none !important;
}

.editorial-shell-root.app-fullscreen .editorial-main-content {
  max-width: 100% !important;
  width: 100vw !important;
  height: 100vh !important;
  height: 100dvh !important;
  padding: 0 !important;
  margin: 0 !important;
}

.editorial-shell-root.app-fullscreen .editorial-app-page {
  width: 100% !important;
  height: 100% !important;
  max-width: 100% !important;
  padding: 0 !important;
}

.editorial-shell-root.app-fullscreen .editorial-app-container {
  width: 100% !important;
  height: 100% !important;
  max-width: 100% !important;
  padding: 0 !important;
}

.editorial-floating-exit-fullscreen {
  position: fixed;
  top: 12px;
  right: 16px;
  z-index: 999999;
  display: none;
  align-items: center;
  gap: 6px;
  background: rgba(20, 19, 18, 0.6);
  color: var(--omni-text-primary, #ede8df);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 9999px;
  padding: 5px 12px;
  font-family: var(--omni-font-mono, monospace);
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
  opacity: 0.25;
  transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s ease, background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.editorial-floating-exit-fullscreen:hover,
.editorial-floating-exit-fullscreen:focus-visible,
.editorial-floating-exit-fullscreen.active-reveal {
  opacity: 1;
  background: rgba(20, 19, 18, 0.95);
  border-color: var(--omni-accent-primary, #d4a373);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.45);
  transform: translateY(0) scale(1.02);
}

.editorial-shell-root[data-theme-mode="light"] .editorial-floating-exit-fullscreen {
  background: rgba(251, 251, 249, 0.6);
  color: var(--omni-text-primary, #141312);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
}

.editorial-shell-root[data-theme-mode="light"] .editorial-floating-exit-fullscreen:hover,
.editorial-shell-root[data-theme-mode="light"] .editorial-floating-exit-fullscreen:focus-visible,
.editorial-shell-root[data-theme-mode="light"] .editorial-floating-exit-fullscreen.active-reveal {
  opacity: 1;
  background: rgba(251, 251, 249, 0.98);
  border-color: var(--omni-accent-primary, #d97706);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  transform: translateY(0) scale(1.02);
}

.editorial-shell-root.app-fullscreen .editorial-floating-exit-fullscreen {
  display: flex !important;
}

@media (max-width: 768px), (hover: none) and (pointer: coarse) {
  .editorial-floating-exit-fullscreen {
    opacity: 0.42;
    padding: 7px 14px;
    font-size: 0.72rem;
    min-height: 34px;
    top: 14px;
    right: 14px;
  }
  .editorial-floating-exit-fullscreen:active,
  .editorial-floating-exit-fullscreen.active-reveal {
    opacity: 1;
    background: rgba(20, 19, 18, 0.98);
    transform: scale(1.03);
  }
  .editorial-shell-root[data-theme-mode="light"] .editorial-floating-exit-fullscreen:active,
  .editorial-shell-root[data-theme-mode="light"] .editorial-floating-exit-fullscreen.active-reveal {
    background: rgba(251, 251, 249, 0.98);
  }
}

.editorial-viewport-page {
  flex: 1;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  display: none;
  box-sizing: border-box;
  -webkit-overflow-scrolling: touch;
}

.editorial-viewport-page.active {
  display: flex;
  flex-direction: column;
}

/* Individual App Page Container */
.editorial-app-page {
  width: 100%;
  height: 100%;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  display: none;
  flex-direction: column;
  box-sizing: border-box;
  -webkit-overflow-scrolling: touch;
}

.editorial-app-page.active {
  display: flex;
}

/* Editorial App Switching Animations */
@keyframes editorialAppFadeOut {
  0% {
    opacity: 1;
    transform: translateY(0);
  }
  100% {
    opacity: 0;
    transform: translateY(-4px);
  }
}

@keyframes editorialAppFadeIn {
  0% {
    opacity: 0;
    transform: translateY(6px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

.editorial-viewport-page.fade-out,
.editorial-app-page.fade-out {
  animation: editorialAppFadeOut 0.12s ease-out forwards;
  pointer-events: none;
}

.editorial-viewport-page.fade-in,
.editorial-app-page.fade-in {
  animation: editorialAppFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@media (prefers-reduced-motion: reduce) {
  .editorial-viewport-page.fade-out,
  .editorial-app-page.fade-out,
  .editorial-viewport-page.fade-in,
  .editorial-app-page.fade-in {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
}

.editorial-app-container {
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px 16px 24px;
  box-sizing: border-box;
}

/* Fixed Editorial Bottom Dock */
.editorial-dock {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 60px;
  z-index: 100;
  background: rgba(var(--editorial-bg-rgb), 0.92);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-top: 1px solid var(--omni-border-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 8px;
}

.editorial-dock-inner {
  max-width: 600px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-around;
  gap: 4px;
}

.editorial-dock-item {
  background: transparent;
  border: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 6px 12px;
  cursor: pointer;
  color: var(--omni-text-muted);
  border-radius: var(--omni-radius-sm);
  transition: all 0.18s ease;
  position: relative;
  min-width: 58px;
}

.editorial-dock-item:hover {
  color: var(--omni-text-primary);
}

.editorial-dock-item.active {
  color: var(--omni-text-primary);
}

.editorial-dock-label {
  font-family: var(--omni-font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  line-height: 1;
}

.editorial-active-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background-color: var(--omni-accent-primary);
  margin-top: 1px;
  opacity: 0;
  transform: scale(0.6);
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

.editorial-dock-item.active .editorial-active-dot {
  opacity: 1;
  transform: scale(1);
}

/* Floating Editorial Back to Top Button */
.editorial-back-to-top {
  position: fixed;
  bottom: calc(76px + env(safe-area-inset-bottom, 0px));
  right: 24px;
  z-index: 99;
  background: var(--omni-bg-surface);
  color: var(--omni-text-primary);
  border: 1px solid var(--omni-border-strong);
  padding: 7px 14px;
  font-family: var(--omni-font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  border-radius: var(--omni-radius-sm);
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transform: translateY(10px);
  transition: opacity 0.2s ease, transform 0.2s ease, background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  user-select: none;
}

.editorial-back-to-top svg {
  width: 13px;
  height: 13px;
  stroke-width: 2;
}

.editorial-back-to-top.visible {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.editorial-back-to-top:hover {
  background: var(--omni-bg-elevated);
  border-color: var(--omni-accent-primary);
  color: var(--omni-accent-primary);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
  transform: translateY(-1px);
}

@media (max-width: 600px) {
  .editorial-back-to-top {
    bottom: calc(68px + env(safe-area-inset-bottom, 0px));
    right: 16px;
    padding: 6px 12px;
    font-size: 0.65rem;
  }
}


/* Generic View Back Button */
.btn-back {
  background: var(--omni-bg-surface);
  border: 1px solid var(--omni-border-subtle);
  color: var(--omni-text-primary);
  font-family: var(--omni-font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 6px 14px;
  border-radius: var(--omni-radius-sm);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s ease;
}

.btn-back:hover {
  color: var(--omni-accent-primary);
  border-color: var(--omni-border-strong);
  background: var(--omni-bg-elevated);
}

.btn-back svg {
  width: 14px;
  height: 14px;
  stroke-width: 1.8;
}

/* ==========================================================================
   Applications Index & Broadsheet Grid
   ========================================================================== */

.editorial-section-header {
  margin-bottom: 16px;
  border-bottom: 1px solid var(--omni-border-subtle);
  padding-bottom: 12px;
}

.editorial-section-title {
  font-family: var(--omni-font-serif);
  font-size: 1.6rem;
  font-weight: 400;
  line-height: 1.25;
  color: var(--omni-text-primary);
  margin: 0;
}

.editorial-section-meta {
  font-family: var(--omni-font-mono);
  font-size: 0.65rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--omni-text-muted);
  margin-top: 4px;
}

.editorial-apps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}

.editorial-plate-card {
  background: var(--omni-bg-elevated);
  border: 1px solid var(--omni-border-subtle);
  border-radius: var(--omni-radius-sm);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  cursor: pointer;
  transition: border-color 0.18s ease, transform 0.18s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.editorial-plate-card:hover {
  border-color: var(--omni-border-strong);
  transform: translateY(-1px);
}

.editorial-plate-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.editorial-plate-card-icon {
  width: 34px;
  height: 34px;
  background: var(--omni-bg-surface);
  border: 1px solid var(--omni-border-subtle);
  border-radius: var(--omni-radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--omni-accent-primary);
  flex-shrink: 0;
}

.editorial-plate-card-name {
  font-family: var(--omni-font-serif);
  font-size: 1.05rem;
  font-weight: 500;
  color: var(--omni-text-primary);
}

.editorial-plate-card-desc {
  font-family: var(--omni-font-sans);
  font-size: 0.8rem;
  color: var(--omni-text-secondary);
  line-height: 1.4;
  margin: 0;
}

/* Modals & Preference Drawers */
.editorial-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(var(--editorial-bg-rgb), 0.94);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: none;
  align-items: center;
  justify-content: center;
  padding: 16px;
  overflow-y: auto;
}

.editorial-modal-overlay.open {
  display: flex;
}

.editorial-modal-card {
  background: var(--omni-bg-elevated);
  border: 1px solid var(--omni-border-subtle);
  border-radius: var(--omni-radius-md);
  max-width: 920px;
  width: 94%;
  max-height: 88vh;
  height: 88vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.16);
}

.editorial-modal-header {
  padding: 18px 24px;
  border-bottom: 1px solid var(--omni-border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  background: var(--omni-bg-elevated);
  z-index: 10;
  flex-shrink: 0;
}

.editorial-settings-nav-wrapper {
  border-bottom: 1px solid var(--omni-border-subtle);
  background: var(--omni-bg-surface);
  flex-shrink: 0;
}

.editorial-settings-mobile-select-container {
  display: none;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: var(--omni-bg-surface);
}

.editorial-settings-mobile-select-label {
  font-family: var(--omni-font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--omni-text-muted);
}

.editorial-settings-select-box {
  position: relative;
  flex: 1;
}

.editorial-settings-mobile-select {
  width: 100%;
  appearance: none;
  background: var(--omni-bg-elevated);
  border: 1px solid var(--omni-border-subtle);
  border-radius: var(--omni-radius-sm);
  padding: 8px 32px 8px 12px;
  font-family: var(--omni-font-sans);
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--omni-text-primary);
  outline: none;
  cursor: pointer;
}

.editorial-settings-select-arrow {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: var(--omni-text-muted);
  display: flex;
  align-items: center;
}

.editorial-settings-tabs-bar {
  display: flex;
  gap: 8px;
  padding: 10px 24px;
  background: var(--omni-bg-surface);
  flex-shrink: 0;
  box-sizing: border-box;
}

.editorial-settings-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  font-family: var(--omni-font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  border: 1px solid transparent;
  border-radius: var(--omni-radius-sm);
  cursor: pointer;
  color: var(--omni-text-secondary);
  background: transparent;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.editorial-tab-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: currentColor;
}

.editorial-tab-title {
  color: currentColor;
}

.editorial-tab-sub {
  color: var(--omni-text-muted);
  font-weight: 500;
}

.editorial-settings-tab-btn:hover {
  color: var(--omni-text-primary);
  background: var(--omni-bg-elevated);
}

.editorial-settings-tab-btn.active {
  background: var(--omni-bg-elevated);
  color: var(--omni-accent-primary);
  border-color: var(--omni-border-subtle);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.editorial-settings-tab-btn.active .editorial-tab-sub {
  color: var(--omni-text-secondary);
}

.editorial-plugins-search-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

@media (max-width: 680px) {
  .editorial-plugins-search-bar {
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 8px !important;
  }

  .editorial-plugins-search-bar input {
    width: 100% !important;
    box-sizing: border-box !important;
  }

  .editorial-plugins-search-bar .editorial-btn-secondary {
    width: 100% !important;
    justify-content: center !important;
    text-align: center !important;
    padding: 8px 12px !important;
    white-space: normal !important;
  }

  .editorial-settings-mobile-select-container {
    display: flex !important;
  }

  .editorial-settings-tabs-bar {
    display: grid !important;
    grid-template-columns: repeat(3, 1fr) !important;
    gap: 4px !important;
    padding: 6px 12px 10px !important;
    overflow-x: hidden !important;
    width: 100% !important;
  }

  .editorial-settings-tab-btn {
    padding: 8px 2px !important;
    font-size: 0.68rem !important;
    text-align: center !important;
    white-space: normal !important;
    line-height: 1.2 !important;
    flex-direction: column !important;
    gap: 3px !important;
    justify-content: center !important;
  }

  .editorial-tab-sub {
    display: none !important;
  }
}

.editorial-modal-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  overflow-y: auto;
  flex: 1;
  box-sizing: border-box;
}

.editorial-settings-tab-panel {
  display: flex;
  flex-direction: column;
  gap: 22px;
  width: 100%;
}

/* Preference Cards & Controls */
.editorial-pref-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.editorial-pref-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.editorial-pref-label {
  font-family: var(--omni-font-mono);
  font-size: 0.74rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--omni-text-muted);
}

.editorial-pref-status {
  font-family: var(--omni-font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--omni-accent-primary);
  font-weight: 600;
}

.editorial-pref-card {
  background: var(--omni-bg-surface);
  border: 1px solid var(--omni-border-subtle);
  border-radius: var(--omni-radius-md);
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

/* Theme Mode Switcher */
.editorial-mode-switcher {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.editorial-mode-btn {
  background: var(--omni-bg-elevated);
  border: 1px solid var(--omni-border-subtle);
  border-radius: var(--omni-radius-sm);
  padding: 8px 12px;
  font-family: var(--omni-font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--omni-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.15s ease;
}

.editorial-mode-btn:hover {
  color: var(--omni-text-primary);
  border-color: var(--omni-border-strong);
}

.editorial-mode-btn.active {
  color: var(--omni-accent-contrast);
  background: var(--omni-accent-primary);
  border-color: var(--omni-accent-primary);
  font-weight: 700;
}

/* Theme Accent Swatches */
.editorial-swatches-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: flex-start;
  max-width: 100%;
  box-sizing: border-box;
}

.editorial-swatch-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  background: transparent;
  border: none;
  padding: 4px;
  min-width: 44px;
  flex-shrink: 0;
  box-sizing: border-box;
}

.editorial-swatch-circle {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  transition: transform 0.18s ease;
  position: relative;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}

.editorial-swatch-item:hover .editorial-swatch-circle {
  transform: scale(1.08);
}

.editorial-swatch-item.active .editorial-swatch-circle {
  outline: 2px solid var(--omni-text-primary);
  outline-offset: 2px;
}

.editorial-swatch-label {
  font-family: var(--omni-font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--omni-text-muted);
}

/* Buttons and Inputs */
.editorial-btn-primary {
  background: var(--omni-accent-primary);
  color: var(--omni-accent-contrast);
  border: 1px solid var(--omni-accent-primary);
  padding: 8px 16px;
  font-family: var(--omni-font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 700;
  border-radius: var(--omni-radius-sm);
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.editorial-btn-primary:hover {
  opacity: 0.9;
}

.editorial-btn-secondary {
  background: var(--omni-bg-elevated);
  color: var(--omni-text-primary);
  border: 1px solid var(--omni-border-subtle);
  padding: 8px 14px;
  font-family: var(--omni-font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  border-radius: var(--omni-radius-sm);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.editorial-btn-secondary:hover {
  border-color: var(--omni-border-strong);
  background: var(--omni-bg-surface);
}

.editorial-input-text {
  background: var(--omni-bg-elevated);
  border: 1px solid var(--omni-border-subtle);
  border-radius: var(--omni-radius-sm);
  padding: 8px 12px;
  font-family: var(--omni-font-sans);
  font-size: 0.85rem;
  color: var(--omni-text-primary);
  outline: none;
  width: 100%;
}

.editorial-input-text:focus {
  border-color: var(--omni-accent-primary);
}

/* Stream End Marker / Sacred Geometry */
.editorial-stream-end {
  display: none !important; /* Eliminate excessive whitespace below timeline notes */
}

.editorial-stream-end-line {
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: var(--omni-font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.editorial-stream-end-line::before,
.editorial-stream-end-line::after {
  content: "";
  display: block;
  width: 36px;
  height: 1px;
  background-color: var(--omni-border-subtle);
}

/* ==========================================================================
   Editorial First-Class Applications & Widgets Styling
   ========================================================================== */

/* App Viewports & Container Polish */
.editorial-app-page {
  width: 100%;
  height: 100%;
  flex: 1;
  display: none;
  flex-direction: column;
  box-sizing: border-box;
}

.editorial-app-page.active {
  display: flex !important;
}

.editorial-app-container {
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px 16px 24px;
  box-sizing: border-box;
}

/* Companion Cards (Widgets) Dashboard */
#editorial-widgets-slot {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
}

/* Pull to Refresh Indicator */
.omni-pull-to-refresh {
  position: fixed;
  top: 0;
  left: 50%;
  transform: translate(-50%, -100%);
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  opacity: 0;
  will-change: transform, opacity;
}

.omni-pull-indicator-content {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--omni-bg-surface);
  border: 1px solid var(--omni-border-subtle);
  border-radius: 20px;
  padding: 6px 14px;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.4);
  color: var(--omni-text-primary);
  font-family: var(--omni-font-mono);
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  user-select: none;
}

.omni-pull-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: var(--omni-accent-primary);
  transition: transform 0.05s ease;
}

.omni-pull-to-refresh.ready .omni-pull-indicator-content {
  border-color: var(--omni-accent-primary);
}

.omni-pull-to-refresh.is-refreshing .omni-pull-icon svg {
  animation: omni-spin 0.6s linear infinite;
}

/* Plugin Placements & Custom Settings Configuration in Preferences */
.plugin-placements-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--omni-bg-surface);
  padding: 12px;
  border: 1px solid var(--omni-border-subtle);
  border-radius: var(--omni-radius-sm);
  margin-top: 10px;
}

.plugin-placement-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--omni-bg-elevated);
  padding: 10px 12px;
  border: 1px solid var(--omni-border-subtle);
  border-radius: var(--omni-radius-sm);
}

.plugin-placement-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 8px;
}

.plugin-viewport-select,
.plugin-route-select {
  background: var(--omni-bg-surface);
  border: 1px solid var(--omni-border-subtle);
  color: var(--omni-text-primary);
  font-family: var(--omni-font-mono);
  font-size: 0.75rem;
  padding: 6px 8px;
  border-radius: var(--omni-radius-sm);
  outline: none;
  cursor: pointer;
  width: 100%;
  height: 32px;
  box-sizing: border-box;
}

.plugin-custom-settings-container {
  margin-top: 10px;
  padding: 12px;
  background: var(--omni-bg-surface);
  border: 1px solid var(--omni-border-subtle);
  border-radius: var(--omni-radius-sm);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Universal App Context Menu */
.omni-app-context-menu {
  position: fixed;
  z-index: 10000;
  min-width: 200px;
  background: var(--omni-bg-elevated, #22201d);
  border: 1px solid var(--omni-border-subtle, #33302a);
  border-radius: var(--omni-radius-md, 8px);
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.45);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  animation: omniCtxFadeIn 0.12s ease-out;
}

@keyframes omniCtxFadeIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

.context-menu-header {
  padding: 8px 10px 6px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--omni-border-subtle, #33302a);
  margin-bottom: 4px;
}

.context-menu-title {
  font-family: var(--omni-font-serif, inherit);
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--omni-text-primary, #ede8df);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.context-menu-badge {
  font-family: var(--omni-font-mono, monospace);
  font-size: 0.65rem;
  color: var(--omni-text-muted, #9e988f);
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: transparent;
  border: none;
  border-radius: var(--omni-radius-sm, 6px);
  color: var(--omni-text-primary, #ede8df);
  font-family: var(--omni-font-sans, inherit);
  font-size: 0.8rem;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: background 0.12s ease, color 0.12s ease;
}

.context-menu-item:hover {
  background: var(--omni-bg-surface, #191816);
  color: var(--omni-accent-primary, #d4a373);
}

.context-menu-item.danger {
  color: #ff5555;
}

.context-menu-item.danger:hover {
  background: rgba(255, 85, 85, 0.15);
  color: #ff7777;
}

.context-menu-divider {
  height: 1px;
  background: var(--omni-border-subtle, #33302a);
  margin: 3px 0;
}

/* Modal Overlay & Card for Update App */
.omni-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  display: none;
  align-items: center;
  justify-content: center;
  z-index: 10001;
}

.omni-modal-overlay.open {
  display: flex;
}

`;
