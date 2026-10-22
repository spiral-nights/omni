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
  z-index: 2;
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

/* Individual App Page Container */
.editorial-app-page {
  width: 100%;
  min-height: 100%;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  display: none;
  flex-direction: column;
  -webkit-overflow-scrolling: touch;
}

.editorial-app-page.active {
  display: flex;
}

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

/* ==========================================================================
   Editorial Feed & Social Timeline Styling (Sacred Broadsheet Folio)
   ========================================================================== */

.feed-container {
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

/* Sticky Feed Sub-Header */
.feed-top-header {
  display: flex !important;
  justify-content: space-between !important;
  align-items: center !important;
  padding: 10px 4px 14px 4px !important;
  border-bottom: 1px solid var(--omni-border-subtle) !important;
  background: transparent !important;
  position: sticky !important;
  top: 0 !important;
  z-index: 20 !important;
  margin-bottom: 16px !important;
  flex-wrap: nowrap !important;
  width: 100% !important;
  box-sizing: border-box !important;
}

/* Redundant in Editorial shell since page header already displays app title */
.feed-top-header .feed-title {
  display: none !important;
}

.feed-nav-group {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  flex: 1 !important;
  min-width: 0 !important;
}

/* Feed Tabs: Following vs Global */
.feed-tabs {
  display: inline-flex !important;
  align-items: center !important;
  gap: 2px !important;
  background: var(--omni-bg-surface) !important;
  border: 1px solid var(--omni-border-subtle) !important;
  padding: 2px !important;
  border-radius: var(--omni-radius-sm) !important;
  flex-shrink: 0 !important;
}

.feed-tab-btn {
  background: transparent !important;
  color: var(--omni-text-muted) !important;
  border: none !important;
  border-radius: var(--omni-radius-sm) !important;
  padding: 4px 12px !important;
  font-family: var(--omni-font-mono) !important;
  font-size: 0.68rem !important;
  letter-spacing: 0.08em !important;
  text-transform: uppercase !important;
  cursor: pointer !important;
  transition: all 0.15s ease !important;
  white-space: nowrap !important;
}

.feed-tab-btn.active {
  background: var(--omni-bg-elevated) !important;
  color: var(--omni-text-primary) !important;
  font-weight: 700 !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08) !important;
}

.feed-header-actions {
  display: inline-flex !important;
  flex-direction: row !important;
  flex-wrap: nowrap !important;
  align-items: center !important;
  gap: 6px !important;
  flex-shrink: 0 !important;
}

.btn-refresh-feed,
.btn-search-feed,
.btn-settings-feed {
  background: var(--omni-bg-surface);
  border: 1px solid var(--omni-border-subtle);
  color: var(--omni-text-secondary);
  font-family: var(--omni-font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 6px 10px;
  border-radius: var(--omni-radius-sm);
  cursor: pointer;
  display: inline-flex !important;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 6px;
  white-space: nowrap !important;
  flex-shrink: 0 !important;
  transition: all 0.15s ease;
}

.btn-refresh-feed:hover,
.btn-search-feed:hover,
.btn-settings-feed:hover {
  color: var(--omni-text-primary);
  border-color: var(--omni-border-strong);
  background: var(--omni-bg-elevated);
}

.btn-refresh-feed svg,
.btn-search-feed svg,
.btn-settings-feed svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

@media (max-width: 600px) {
  .feed-top-header {
    padding: 6px 2px 10px 2px !important;
    gap: 6px !important;
  }
  .feed-header-actions {
    display: inline-flex !important;
    flex-direction: row !important;
    flex-wrap: nowrap !important;
    align-items: center !important;
    gap: 4px !important;
    flex-shrink: 0 !important;
  }
  .feed-header-actions .btn-label {
    display: none !important;
  }
  .btn-refresh-feed,
  .btn-search-feed,
  .btn-settings-feed {
    padding: 6px !important;
    min-width: 32px !important;
    width: 32px !important;
    height: 32px !important;
    box-sizing: border-box !important;
    justify-content: center !important;
  }
  .feed-tab-btn {
    padding: 4px 8px !important;
    font-size: 0.65rem !important;
  }
}

.btn-refresh-feed.spinning svg {
  animation: omni-spin 0.8s linear infinite;
}

@keyframes omni-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Feed Composer (Sacred Reading Post Folio) */
.feed-composer,
.composer-card {
  display: flex;
  gap: 14px;
  padding: 16px 18px;
  background: var(--omni-bg-elevated) !important;
  border: 1px solid var(--omni-border-subtle) !important;
  border-radius: var(--omni-radius-sm) !important;
  margin-bottom: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.composer-avatar-col {
  flex-shrink: 0;
  width: 38px;
}

.composer-avatar {
  width: 38px !important;
  height: 38px !important;
  min-width: 38px !important;
  min-height: 38px !important;
  max-width: 38px !important;
  max-height: 38px !important;
  border-radius: 50% !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  color: #ffffff;
  font-family: var(--omni-font-mono);
  font-weight: 700;
  font-size: 0.85rem;
  background: var(--omni-accent-primary);
  user-select: none;
  overflow: hidden !important;
  box-sizing: border-box;
}

.composer-avatar img {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
  border-radius: 50% !important;
  display: block;
}

.thread-composer-avatar {
  width: 32px !important;
  height: 32px !important;
  min-width: 32px !important;
  min-height: 32px !important;
  max-width: 32px !important;
  max-height: 32px !important;
  border-radius: 50% !important;
  overflow: hidden !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  box-sizing: border-box;
}

.thread-composer-avatar img {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
  border-radius: 50% !important;
  display: block;
}

.composer-main-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  max-width: 100%;
}

.composer-input {
  width: 100%;
  box-sizing: border-box;
  background: transparent;
  border: none;
  color: var(--omni-text-primary);
  font-family: var(--omni-font-serif);
  font-size: 1.05rem;
  line-height: 1.55;
  resize: vertical;
  min-height: 54px;
  outline: none;
  padding: 2px 0;
}

.composer-input::placeholder {
  color: var(--omni-text-muted);
  font-style: italic;
}

.composer-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  border-top: 1px solid var(--omni-border-subtle);
  padding-top: 10px;
}

.btn-publish {
  background: var(--omni-accent-primary);
  color: var(--omni-accent-contrast);
  font-family: var(--omni-font-mono);
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  border: none;
  padding: 6px 16px;
  border-radius: var(--omni-radius-sm);
  cursor: pointer;
  font-size: 0.72rem;
  transition: opacity 0.15s ease;
}

.btn-publish:hover {
  opacity: 0.9;
}

.btn-publish:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Timeline Notes List */
.notes-list {
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 10px;
  max-width: 100%;
  box-sizing: border-box;
  overflow-x: hidden;
}

/* Individual Note Card (Broadsheet Folio Card) */
.feed-post,
.note-card {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 14px;
  padding: 16px 18px;
  background: var(--omni-bg-elevated) !important;
  border: 1px solid var(--omni-border-subtle) !important;
  border-radius: var(--omni-radius-sm) !important;
  transition: border-color 0.15s ease, transform 0.15s ease;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  overflow: hidden;
  overflow-wrap: break-word;
  word-break: break-word;
}

.feed-post:hover,
.note-card:hover {
  border-color: var(--omni-border-strong) !important;
}

.feed-post-avatar-col {
  flex-shrink: 0;
  width: 40px;
}

.feed-avatar {
  width: 40px !important;
  height: 40px !important;
  min-width: 40px !important;
  min-height: 40px !important;
  max-width: 40px !important;
  max-height: 40px !important;
  border-radius: 50% !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  color: #ffffff;
  font-weight: 700;
  font-size: 0.85rem;
  user-select: none;
  overflow: hidden !important;
  border: 1px solid var(--omni-border-subtle);
  box-sizing: border-box;
}

.feed-avatar img {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
  border-radius: 50% !important;
  display: block;
}

.feed-post-body {
  flex: 1;
  min-width: 0;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.note-header,
.feed-post-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
  width: 100%;
  max-width: 100%;
}

.feed-author-name,
.note-author {
  font-family: var(--omni-font-serif);
  font-weight: 600;
  font-size: 1.02rem;
  color: var(--omni-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feed-author-handle,
.note-meta {
  font-family: var(--omni-font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--omni-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-content,
.feed-post-content {
  font-family: var(--omni-font-serif);
  font-size: 1.05rem;
  line-height: 1.65;
  color: var(--omni-text-primary);
  margin: 6px 0 12px 0;
  overflow-wrap: break-word !important;
  word-break: break-word !important;
  word-wrap: break-word !important;
  hyphens: auto;
  white-space: pre-wrap !important;
  max-width: 100% !important;
  min-width: 0 !important;
}

.feed-link {
  color: var(--omni-accent-primary);
  text-decoration: underline;
  text-underline-offset: 3px;
  word-break: break-all;
}

.note-actions,
.feed-post-actions {
  display: flex;
  align-items: center;
  gap: 20px;
  border-top: 1px solid var(--omni-border-subtle);
  padding-top: 10px;
  margin-top: 4px;
}

.note-action-btn,
.feed-action-btn {
  background: transparent;
  border: none;
  color: var(--omni-text-muted);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--omni-font-mono);
  font-size: 0.72rem;
  cursor: pointer;
  transition: color 0.15s ease;
  padding: 2px 4px;
}

.note-action-btn:hover,
.feed-action-btn:hover {
  color: var(--omni-accent-primary);
}

.note-action-btn svg,
.feed-action-btn svg {
  width: 15px;
  height: 15px;
  stroke-width: 1.6;
}

/* Feed Footer & Back to Top */
.feed-footer-actions {
  display: flex;
  justify-content: center;
  padding: 24px 0 20px 0;
}

.btn-feed-back-to-top {
  background: var(--omni-bg-elevated);
  border: 1px solid var(--omni-border-subtle);
  color: var(--omni-text-secondary);
  font-family: var(--omni-font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 7px 18px;
  border-radius: var(--omni-radius-sm);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all 0.15s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.btn-feed-back-to-top:hover {
  color: var(--omni-text-primary);
  border-color: var(--omni-border-strong);
  background: var(--omni-bg-surface);
  transform: translateY(-1px);
}

.btn-feed-back-to-top svg {
  width: 13px;
  height: 13px;
  stroke-width: 1.8;
}

/* Back Buttons Across Feed Views (Search, Thread, Settings) */
.btn-search-back,
.btn-settings-back,
.btn-thread-back,
.btn-back,
.btn-profile-back {
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

.btn-search-back:hover,
.btn-settings-back:hover,
.btn-thread-back:hover,
.btn-back:hover,
.btn-profile-back:hover {
  color: var(--omni-accent-primary);
  border-color: var(--omni-border-strong);
  background: var(--omni-bg-elevated);
}

.btn-search-back svg,
.btn-settings-back svg,
.btn-thread-back svg,
.btn-back svg,
.btn-profile-back svg {
  width: 14px;
  height: 14px;
  stroke-width: 1.8;
}

/* Feed Search & Thread Pages */
.feed-search-page,
.feed-thread-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 12px;
  box-sizing: border-box;
}

.feed-search-bar {
  display: flex;
  gap: 10px;
  padding: 12px 0;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
}

.feed-search-input {
  flex: 1;
  background: var(--omni-bg-elevated);
  border: 1px solid var(--omni-border-subtle);
  border-radius: var(--omni-radius-sm);
  color: var(--omni-text-primary);
  padding: 8px 14px;
  font-family: var(--omni-font-sans);
  font-size: 0.88rem;
  outline: none;
}

.feed-search-input:focus {
  border-color: var(--omni-accent-primary);
}

.btn-do-search {
  background: var(--omni-accent-primary);
  color: var(--omni-accent-contrast);
  border: 1px solid var(--omni-accent-primary);
  border-radius: var(--omni-radius-sm);
  font-family: var(--omni-font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 8px 18px;
  cursor: pointer;
  transition: opacity 0.15s ease;
  white-space: nowrap;
}

.btn-do-search:hover {
  opacity: 0.9;
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

/* ==========================================================================
   Editorial First-Class Applications & Widgets Styling
   ========================================================================== */

/* App Viewports & Container Polish */
.editorial-app-page {
  width: 100%;
  min-height: 100%;
  display: none;
  flex-direction: column;
}

.editorial-app-page.active {
  display: flex !important;
}

.editorial-app-container {
  width: 100%;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px 16px 40px;
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

/* Checklist Application & Widget Card */
.checklist-widget-card {
  background: var(--omni-bg-elevated) !important;
  border: 1px solid var(--omni-border-subtle) !important;
  border-radius: var(--omni-radius-sm) !important;
  padding: 24px 20px !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 16px !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03) !important;
  max-width: 600px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}

.checklist-widget-card .widget-header h3 {
  font-family: var(--omni-font-serif) !important;
  font-size: 1.25rem !important;
  font-weight: 500 !important;
  color: var(--omni-text-primary) !important;
  margin: 0 !important;
}

.task-input-row {
  display: flex !important;
  gap: 8px !important;
}

.task-input-row input {
  background: var(--omni-bg-surface) !important;
  border: 1px solid var(--omni-border-subtle) !important;
  border-radius: var(--omni-radius-sm) !important;
  color: var(--omni-text-primary) !important;
  font-family: var(--omni-font-sans) !important;
  font-size: 0.88rem !important;
  padding: 8px 14px !important;
}

.task-input-row button {
  background: var(--omni-accent-primary) !important;
  color: var(--omni-accent-contrast) !important;
  border: 1px solid var(--omni-accent-primary) !important;
  border-radius: var(--omni-radius-sm) !important;
  font-family: var(--omni-font-mono) !important;
  font-size: 0.85rem !important;
  font-weight: 700 !important;
  padding: 8px 16px !important;
  cursor: pointer;
}

.task-item {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  padding: 10px 4px !important;
  border-bottom: 1px solid var(--omni-border-subtle) !important;
  font-family: var(--omni-font-sans) !important;
  font-size: 0.9rem !important;
  color: var(--omni-text-primary) !important;
}

/* Relays Management Application & Widget Card */
.relays-container,
.relays-widget-card {
  background: var(--omni-bg-elevated) !important;
  border: 1px solid var(--omni-border-subtle) !important;
  border-radius: var(--omni-radius-sm) !important;
  padding: 24px 20px !important;
  max-width: 660px;
  width: 100%;
  margin: 0 auto;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03) !important;
  box-sizing: border-box;
}

.relay-row {
  background: var(--omni-bg-surface) !important;
  border: 1px solid var(--omni-border-subtle) !important;
  border-radius: var(--omni-radius-sm) !important;
  padding: 10px 14px !important;
  margin-bottom: 8px !important;
  transition: border-color 0.15s ease !important;
}

.relay-row:hover {
  border-color: var(--omni-border-strong) !important;
}

/* Profile Editor & Identity Custody */
.profile-modal-container,
.profile-editor-container {
  max-width: 640px;
  width: 100%;
  margin: 0 auto;
  background: var(--omni-bg-elevated) !important;
  border: 1px solid var(--omni-border-subtle) !important;
  border-radius: var(--omni-radius-sm) !important;
  padding: 24px 20px !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03) !important;
  box-sizing: border-box;
}

.preview-box {
  background: var(--omni-bg-surface) !important;
  border: 1px solid var(--omni-border-subtle) !important;
  border-radius: var(--omni-radius-sm) !important;
}

.preview-name {
  font-family: var(--omni-font-serif) !important;
  font-size: 1.05rem !important;
  font-weight: 500 !important;
  color: var(--omni-text-primary) !important;
}

.preview-npub {
  font-family: var(--omni-font-mono) !important;
  font-size: 0.7rem !important;
  color: var(--omni-text-muted) !important;
}

/* People / Profile Viewer Application */
.profile-viewer-container {
  max-width: 720px;
  width: 100%;
  margin: 0 auto;
}

.pv-profile-card {
  background: var(--omni-bg-elevated) !important;
  border: 1px solid var(--omni-border-subtle) !important;
  border-radius: var(--omni-radius-sm) !important;
  padding: 20px !important;
  margin-bottom: 16px;
}

.people-user-card {
  background: var(--omni-bg-elevated) !important;
  border: 1px solid var(--omni-border-subtle) !important;
  border-radius: var(--omni-radius-sm) !important;
  padding: 14px 16px !important;
  margin-bottom: 8px !important;
  transition: border-color 0.15s ease !important;
}

.people-user-card:hover {
  border-color: var(--omni-border-strong) !important;
}

.people-user-name {
  font-family: var(--omni-font-serif) !important;
  font-size: 1.05rem !important;
  font-weight: 500 !important;
  color: var(--omni-text-primary) !important;
}

.people-user-handle {
  font-family: var(--omni-font-mono) !important;
  font-size: 0.72rem !important;
  color: var(--omni-text-muted) !important;
}

/* ==========================================================================
   Profile & Key Custody Plugin (@omni/plugin-profile) & People Controls
   ========================================================================== */
.profile-full-container {
  display: flex !important;
  flex-direction: column !important;
  gap: 18px !important;
  max-width: 680px !important;
  width: 100% !important;
  margin: 0 auto !important;
  padding: 8px 4px 40px !important;
  box-sizing: border-box !important;
}

/* Profile Tabs */
.profile-full-container .modal-tabs {
  display: flex !important;
  gap: 6px !important;
  border-bottom: 1px solid var(--omni-border-subtle) !important;
  padding-bottom: 10px !important;
  margin-bottom: 6px !important;
}

.profile-full-container .modal-tab-btn {
  background: var(--omni-bg-surface) !important;
  border: 1px solid var(--omni-border-subtle) !important;
  color: var(--omni-text-muted) !important;
  font-family: var(--omni-font-mono) !important;
  font-size: 0.72rem !important;
  letter-spacing: 0.1em !important;
  text-transform: uppercase !important;
  font-weight: 500 !important;
  padding: 6px 14px !important;
  border-radius: var(--omni-radius-sm) !important;
  cursor: pointer !important;
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  transition: all 0.15s ease !important;
}

.profile-full-container .modal-tab-btn:hover {
  color: var(--omni-text-primary) !important;
  border-color: var(--omni-border-strong) !important;
  background: var(--omni-bg-elevated) !important;
}

.profile-full-container .modal-tab-btn.active {
  background: var(--omni-bg-elevated) !important;
  color: var(--omni-text-primary) !important;
  border-color: var(--omni-border-strong) !important;
  font-weight: 700 !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08) !important;
}

.profile-full-container .modal-tab-btn svg {
  width: 13px !important;
  height: 13px !important;
}

/* Profile Identity Card Preview */
.profile-full-container .preview-box {
  background: var(--omni-bg-elevated) !important;
  border: 1px solid var(--omni-border-subtle) !important;
  border-radius: var(--omni-radius-sm) !important;
  padding: 16px 18px !important;
}

.profile-full-container #prof-avatar-preview {
  background: var(--omni-bg-surface) !important;
  border: 1px solid var(--omni-border-subtle) !important;
}

/* Profile Form Labels & Inputs */
.profile-full-container label {
  font-family: var(--omni-font-mono) !important;
  font-size: 0.72rem !important;
  letter-spacing: 0.06em !important;
  text-transform: uppercase !important;
  color: var(--omni-text-secondary) !important;
  font-weight: 600 !important;
}

.profile-full-container input[type="text"],
.profile-full-container input[type="password"],
.profile-full-container textarea {
  background: var(--omni-bg-surface) !important;
  border: 1px solid var(--omni-border-subtle) !important;
  border-radius: var(--omni-radius-sm) !important;
  color: var(--omni-text-primary) !important;
  font-family: var(--omni-font-sans) !important;
  font-size: 0.88rem !important;
  padding: 9px 12px !important;
  transition: border-color 0.15s ease !important;
  width: 100% !important;
  box-sizing: border-box !important;
}

.profile-full-container input[type="text"]:focus,
.profile-full-container input[type="password"]:focus,
.profile-full-container textarea:focus {
  border-color: var(--omni-accent-primary) !important;
  outline: none !important;
}

.profile-full-container input[readonly] {
  background: var(--omni-bg-surface) !important;
  font-family: var(--omni-font-mono) !important;
  font-size: 0.78rem !important;
}

/* Secondary Profile Action Buttons (Sync, Copy, Reveal, Cancel) */
.profile-full-container .btn-secondary,
.profile-full-container #btn-sync-profile,
.profile-full-container #btn-copy-npub,
.profile-full-container #btn-copy-hex,
.profile-full-container #btn-copy-nsec,
.profile-full-container #btn-reveal-nsec,
.profile-full-container #btn-cancel-reveal {
  background: var(--omni-bg-surface) !important;
  border: 1px solid var(--omni-border-subtle) !important;
  border-radius: var(--omni-radius-sm) !important;
  color: var(--omni-text-primary) !important;
  font-family: var(--omni-font-mono) !important;
  font-size: 0.72rem !important;
  letter-spacing: 0.08em !important;
  text-transform: uppercase !important;
  font-weight: 600 !important;
  padding: 7px 14px !important;
  cursor: pointer !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 6px !important;
  transition: all 0.15s ease !important;
}

.profile-full-container .btn-secondary:hover,
.profile-full-container #btn-sync-profile:hover,
.profile-full-container #btn-copy-npub:hover,
.profile-full-container #btn-copy-hex:hover,
.profile-full-container #btn-copy-nsec:hover,
.profile-full-container #btn-reveal-nsec:hover,
.profile-full-container #btn-cancel-reveal:hover {
  background: var(--omni-bg-elevated) !important;
  border-color: var(--omni-border-strong) !important;
  color: var(--omni-text-primary) !important;
}

/* Primary Action Buttons (Save & Publish, Import & Switch) */
.profile-full-container #btn-save-profile,
.profile-full-container #btn-import-key,
.profile-full-container .btn-publish {
  background: var(--omni-accent-primary) !important;
  border: 1px solid var(--omni-accent-primary) !important;
  border-radius: var(--omni-radius-sm) !important;
  color: var(--omni-accent-contrast) !important;
  font-family: var(--omni-font-mono) !important;
  font-size: 0.74rem !important;
  letter-spacing: 0.1em !important;
  text-transform: uppercase !important;
  font-weight: 700 !important;
  padding: 8px 18px !important;
  cursor: pointer !important;
  transition: opacity 0.15s ease !important;
}

.profile-full-container #btn-save-profile:hover,
.profile-full-container #btn-import-key:hover,
.profile-full-container .btn-publish:hover {
  opacity: 0.9 !important;
}

/* Danger Confirm Reveal Button */
.profile-full-container #btn-confirm-reveal {
  background: #dc2626 !important;
  border: 1px solid #dc2626 !important;
  border-radius: var(--omni-radius-sm) !important;
  color: #ffffff !important;
  font-family: var(--omni-font-mono) !important;
  font-size: 0.72rem !important;
  letter-spacing: 0.08em !important;
  text-transform: uppercase !important;
  font-weight: 700 !important;
  padding: 7px 14px !important;
  cursor: pointer !important;
  transition: opacity 0.15s ease !important;
}

.profile-full-container #btn-confirm-reveal:hover {
  opacity: 0.9 !important;
}

/* People / Profile Viewer Plugin Buttons & Inputs */
.people-container .people-tab-btn {
  background: var(--omni-bg-surface) !important;
  border: 1px solid var(--omni-border-subtle) !important;
  border-radius: var(--omni-radius-sm) !important;
  color: var(--omni-text-muted) !important;
  font-family: var(--omni-font-mono) !important;
  font-size: 0.72rem !important;
  letter-spacing: 0.08em !important;
  text-transform: uppercase !important;
  padding: 6px 12px !important;
  cursor: pointer !important;
  transition: all 0.15s ease !important;
}

.people-container .people-tab-btn.active {
  background: var(--omni-bg-elevated) !important;
  color: var(--omni-text-primary) !important;
  border-color: var(--omni-border-strong) !important;
  font-weight: 700 !important;
}

.people-container .btn-follow-toggle,
.people-container .pv-btn-follow {
  background: var(--omni-accent-primary) !important;
  border: 1px solid var(--omni-accent-primary) !important;
  border-radius: var(--omni-radius-sm) !important;
  color: var(--omni-accent-contrast) !important;
  font-family: var(--omni-font-mono) !important;
  font-size: 0.72rem !important;
  letter-spacing: 0.08em !important;
  text-transform: uppercase !important;
  font-weight: 700 !important;
  padding: 6px 14px !important;
  cursor: pointer !important;
  transition: opacity 0.15s ease !important;
}

.people-container .btn-follow-toggle:hover,
.people-container .pv-btn-follow:hover {
  opacity: 0.9 !important;
}

.people-container .btn-follow-toggle.is-following,
.people-container .btn-unfollow-row {
  background: var(--omni-bg-surface) !important;
  border: 1px solid var(--omni-border-subtle) !important;
  color: var(--omni-text-secondary) !important;
}

.people-container .btn-follow-toggle.is-following:hover,
.people-container .btn-unfollow-row:hover {
  border-color: #ef4444 !important;
  color: #ef4444 !important;
  background: var(--omni-bg-elevated) !important;
}

.people-container .btn-block-toggle,
.people-container .pv-btn-block {
  background: var(--omni-bg-surface) !important;
  border: 1px solid var(--omni-border-subtle) !important;
  border-radius: var(--omni-radius-sm) !important;
  color: var(--omni-text-secondary) !important;
  font-family: var(--omni-font-mono) !important;
  font-size: 0.72rem !important;
  letter-spacing: 0.08em !important;
  text-transform: uppercase !important;
  padding: 6px 12px !important;
  cursor: pointer !important;
}

.people-container .btn-block-toggle.is-blocked,
.people-container .btn-unblock-row {
  border-color: #ef4444 !important;
  color: #ef4444 !important;
}

.people-container .pv-btn-refresh,
.people-container .pv-btn-copy-npub,
.people-container .pv-search-btn,
.people-container .btn-toggle-lookup {
  background: var(--omni-bg-surface) !important;
  border: 1px solid var(--omni-border-subtle) !important;
  border-radius: var(--omni-radius-sm) !important;
  color: var(--omni-text-primary) !important;
  font-family: var(--omni-font-mono) !important;
  font-size: 0.72rem !important;
  letter-spacing: 0.08em !important;
  text-transform: uppercase !important;
  padding: 6px 12px !important;
  cursor: pointer !important;
  transition: all 0.15s ease !important;
}

.people-container .pv-btn-refresh:hover,
.people-container .pv-btn-copy-npub:hover,
.people-container .pv-search-btn:hover,
.people-container .btn-toggle-lookup:hover {
  background: var(--omni-bg-elevated) !important;
  border-color: var(--omni-border-strong) !important;
}

.people-container .people-search-input,
.people-container .people-filter-input {
  background: var(--omni-bg-surface) !important;
  border: 1px solid var(--omni-border-subtle) !important;
  border-radius: var(--omni-radius-sm) !important;
  color: var(--omni-text-primary) !important;
  font-family: var(--omni-font-sans) !important;
  font-size: 0.88rem !important;
  padding: 7px 12px !important;
}

`;
