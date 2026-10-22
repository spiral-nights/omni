/**
 * Editorial Shell Stylesheet (Sacred Swiss Editorial & Papyrus Sanctuary)
 *
 * Implements the dual-theme design system:
 * - Sacred Editorial (Light / Papyrus): Warm tactile rag paper (#fbfbf9), deep carbon ink (#0f172a), electric cobalt (#1e40af).
 * - Obsidian Sanctuary (Dark): Deep obsidian (#0a0a0c), elevated charcoal plates (#1c1b1d), warm ivory text (#e5e1e4).
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
}

/* Light Mode: Sacred Editorial (Papyrus) */
:root.theme-editorial[data-theme-mode="light"],
body.theme-editorial[data-theme-mode="light"],
.editorial-shell-root[data-theme-mode="light"] {
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

/* Dark Mode: Obsidian Sanctuary */
:root.theme-editorial[data-theme-mode="dark"],
body.theme-editorial[data-theme-mode="dark"],
.editorial-shell-root[data-theme-mode="dark"] {
  --omni-bg-canvas: #0a0a0c;
  --omni-bg-surface: #131315;
  --omni-bg-elevated: #1c1b1d;
  --omni-bg-subtle: #201f21;
  --editorial-bg-rgb: 10, 10, 12;

  --omni-text-primary: #e5e1e4;
  --omni-text-secondary: #c2c6d6;
  --omni-text-muted: #8c909f;

  --omni-border-subtle: #262528;
  --omni-border-strong: #353437;
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
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
  padding-top: 58px;
  padding-bottom: 66px;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.editorial-viewport-page {
  flex: 1;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  display: none;
  -webkit-overflow-scrolling: touch;
}

.editorial-viewport-page.active {
  display: flex;
  flex-direction: column;
}

/* Pinned Micro-Frontend Host Container */
.editorial-app-container {
  width: 100%;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
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

/* Applications Page Layout */
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
  max-width: 620px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
}

.editorial-modal-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--omni-border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  background: var(--omni-bg-elevated);
  z-index: 10;
}

.editorial-modal-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* Preference Cards & Controls */
.editorial-pref-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.editorial-pref-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.editorial-pref-label {
  font-family: var(--omni-font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--omni-text-muted);
}

.editorial-pref-status {
  font-family: var(--omni-font-mono);
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--omni-accent-primary);
  font-weight: 600;
}

.editorial-pref-card {
  background: var(--omni-bg-surface);
  border: 1px solid var(--omni-border-subtle);
  border-radius: var(--omni-radius-sm);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
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
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
  align-items: center;
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
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 16px 48px;
  user-select: none;
  color: var(--omni-text-muted);
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
`;
