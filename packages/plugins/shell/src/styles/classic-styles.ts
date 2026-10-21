/**
 * Omni Classic Shell Stylesheet (Warm Paper Dark theme)
 */
export const CLASSIC_SHELL_CSS = /* css */ `
/* Omni Web App - Warm Paper Dark Design System */
:root {
  --omni-bg-canvas: #141312;
  --omni-bg-surface: #191816;
  --omni-bg-elevated: #22201d;
  --omni-bg-subtle: #2a2824;

  --omni-text-primary: #ede8df;
  --omni-text-secondary: #a8a29e;
  --omni-text-muted: #78716c;

  --omni-border-subtle: #272522;
  --omni-border-strong: #383530;
  --omni-border-focus: #c89666;

  --omni-accent-primary: #d4a373;
  --omni-accent-hover: #c89666;
  --omni-accent-contrast: #141312;

  --omni-status-online: #4ade80;
  --omni-status-badge: #d4a373;

  --omni-font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --omni-font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  --omni-radius-sm: 6px;
  --omni-radius-md: 10px;
  --omni-radius-lg: 16px;
  --omni-radius-pill: 9999px;

  /* Generic Standard Theme Tokens for Standalone Plugins & Nsites */
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

  --accent-primary: var(--omni-accent-primary);
  --accent-hover: var(--omni-accent-hover);
  --accent-contrast: var(--omni-accent-contrast);

  --status-online: var(--omni-status-online);
  --status-badge: var(--omni-status-badge);

  --font-sans: var(--omni-font-sans);
  --font-mono: var(--omni-font-mono);

  --radius-sm: var(--omni-radius-sm);
  --radius-md: var(--omni-radius-md);
  --radius-lg: var(--omni-radius-lg);
  --radius-pill: var(--omni-radius-pill);
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
}

html, body {
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
}

body {
  background-color: var(--omni-bg-canvas);
  color: var(--omni-text-primary);
  font-family: var(--omni-font-sans);
  overflow: hidden;
  line-height: 1.5;
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
}

#omni-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  position: relative;
}

/* 1. Header */
.app-header {
  height: 52px;
  flex-shrink: 0;
  background-color: var(--omni-bg-surface);
  border-bottom: 1px solid var(--omni-border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  position: relative;
  z-index: 100;
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.brand-logo {
  font-weight: 700;
  font-size: 1.2rem;
  letter-spacing: -0.02em;
  color: var(--omni-text-primary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.relay-status-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  background: var(--omni-bg-subtle);
  padding: 4px 10px;
  border-radius: var(--omni-radius-pill);
  color: var(--omni-text-secondary);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--omni-status-online);
}

.user-profile-badge {
  font-family: var(--omni-font-mono);
  font-size: 0.8rem;
  color: var(--omni-text-muted);
  cursor: pointer;
  background: var(--omni-bg-subtle);
  padding: 4px 10px;
  border-radius: var(--omni-radius-pill);
}

/* 2. Main App Content Layout */
.app-layout {
  display: flex;
  flex: 1;
  min-height: 0;
  height: calc(100vh - 52px);
  overflow: hidden;
  position: relative;
}

/* 3. Center Viewport (Composer & Feed) */
.main-viewport {
  flex: 1;
  min-height: 0;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 72px; /* space for mobile dock */
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

/* App Multi-Page System */
.app-page {
  display: none;
  width: 100%;
  flex-direction: column;
  align-items: center;
}

.app-page.active {
  display: flex;
}

.main-viewport-slot {
  width: 100%;
  max-width: 680px;
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Full-Page Widgets Dashboard */
.widgets-page-header {
  width: 100%;
  max-width: 1100px;
  padding: 24px 20px 8px 20px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.widgets-page-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.widgets-page-title {
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--omni-text-primary);
  margin: 0;
}

.widgets-page-badge {
  font-size: 0.7rem;
  background: var(--omni-bg-subtle);
  color: var(--omni-accent-primary);
  padding: 2px 8px;
  border-radius: var(--omni-radius-pill);
  font-family: var(--omni-font-mono);
}

.widgets-page-desc {
  font-size: 0.8rem;
  color: var(--omni-text-muted);
  margin: 0;
}

.widgets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
  width: 100%;
  max-width: 1100px;
  padding: 16px 20px 80px 20px;
}

@media (max-width: 768px) {
  .widgets-grid {
    grid-template-columns: 1fr;
    padding: 12px 14px 72px 14px;
    gap: 16px;
  }
  .widgets-page-header {
    padding: 16px 14px 4px 14px;
  }
}

/* ========================================================
   Timeline Feed (Bluesky-Inspired Modern Social Timeline)
   ======================================================== */

.feed-container {
  width: 100%;
  max-width: 620px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  min-height: 100%;
  height: auto;
  max-height: none; /* Full page scroll: unconstrained */
  box-shadow: none;
  border: none;
  background: transparent;
  padding: 0;
  box-sizing: border-box;
}

/* Top Sticky Navigation Header */
.feed-top-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--omni-border-subtle);
  background: var(--omni-bg-canvas);
  position: sticky;
  top: 0;
  z-index: 20;
  overflow-x: auto;
  overflow-y: hidden;
  white-space: nowrap;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  gap: 8px;
  box-sizing: border-box;
}

.feed-top-header::-webkit-scrollbar {
  display: none;
}

.feed-nav-group {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.btn-feed-back-to-top {
  background: var(--omni-bg-subtle);
  border: 1px solid var(--omni-border-subtle);
  color: var(--omni-text-secondary);
  font-size: 0.78rem;
  font-weight: 500;
  padding: 6px 14px;
  border-radius: var(--omni-radius-pill);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s ease;
}

.btn-feed-back-to-top:hover {
  color: var(--omni-text-primary);
  border-color: var(--omni-border-strong);
  background: var(--omni-bg-elevated);
}

@media (max-width: 600px) {
  .feed-top-header {
    padding: 8px 12px;
    gap: 6px;
  }
  .feed-header-actions .btn-label {
    display: none;
  }
  .btn-search-feed,
  .btn-settings-feed,
  .btn-refresh-feed {
    padding: 5px 8px;
    min-width: 32px;
    justify-content: center;
  }
  .feed-tab-btn {
    padding: 4px 8px;
    font-size: 0.72rem;
  }
}

.feed-title {
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--omni-text-primary);
  margin: 0;
}

.btn-refresh-feed {
  background: var(--omni-bg-subtle);
  border: 1px solid var(--omni-border-subtle);
  color: var(--omni-text-secondary);
  font-size: 0.76rem;
  font-weight: 500;
  padding: 5px 10px;
  border-radius: var(--omni-radius-pill);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: all 0.15s ease;
}

.btn-refresh-feed:hover {
  color: var(--omni-text-primary);
  border-color: var(--omni-border-strong);
  background: var(--omni-bg-elevated);
}

.btn-refresh-feed.spinning svg {
  animation: omni-spin 0.8s linear infinite;
}

@keyframes omni-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Feed Search Page */
.feed-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.btn-search-feed,
.btn-settings-feed {
  background: var(--omni-bg-subtle);
  border: 1px solid var(--omni-border-subtle);
  color: var(--omni-text-secondary);
  font-size: 0.76rem;
  font-weight: 500;
  padding: 5px 10px;
  border-radius: var(--omni-radius-pill);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: all 0.15s ease;
}

.btn-search-feed:hover,
.btn-settings-feed:hover {
  color: var(--omni-text-primary);
  border-color: var(--omni-border-strong);
  background: var(--omni-bg-elevated);
}

.btn-search-back,
.btn-settings-back,
.btn-thread-back {
  background: transparent;
  border: none;
  color: var(--omni-text-secondary);
  font-size: 0.76rem;
  font-weight: 500;
  padding: 5px 8px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: color 0.15s ease;
}

.btn-search-back:hover,
.btn-settings-back:hover,
.btn-thread-back:hover {
  color: var(--omni-text-primary);
}

.feed-search-bar {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  align-items: center;
}

.feed-search-input {
  flex: 1;
  background: var(--omni-bg-subtle);
  border: 1px solid var(--omni-border-subtle);
  color: var(--omni-text-primary);
  border-radius: var(--omni-radius-pill);
  padding: 8px 14px;
  font-size: 0.85rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s ease;
}

.feed-search-input:focus {
  border-color: var(--omni-accent, #d4a373);
}

.feed-search-input::placeholder {
  color: var(--omni-text-muted);
}

.btn-do-search {
  background: var(--omni-accent, #d4a373);
  border: none;
  color: #141312;
  font-size: 0.78rem;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: var(--omni-radius-pill);
  cursor: pointer;
  transition: filter 0.15s ease;
}

.btn-do-search:hover {
  filter: brightness(1.1);
}

.search-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 8px 16px;
  padding: 4px 6px 4px 10px;
  font-size: 0.72rem;
  color: var(--omni-text-secondary);
  background: var(--omni-bg-elevated);
  border: 1px solid var(--omni-border-subtle);
  border-radius: var(--omni-radius-pill);
  width: fit-content;
}

.search-chip .chip-remove {
  background: transparent;
  border: none;
  color: var(--omni-text-muted);
  font-size: 0.9rem;
  line-height: 1;
  padding: 0 4px;
  cursor: pointer;
}

.search-chip .chip-remove:hover {
  color: var(--omni-text-primary);
}

.search-section-title {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--omni-text-muted);
  padding: 14px 16px 6px 16px;
}

.search-status {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 16px;
  color: var(--omni-text-muted);
  font-size: 0.82rem;
}

.search-people-section,
.search-notes-section {
  padding-bottom: 8px;
}

.search-people-list {
  display: flex;
  flex-direction: column;
}

.search-person-row {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid var(--omni-border-subtle);
  cursor: pointer;
  transition: background 0.15s ease;
}

.search-person-row:hover {
  background: var(--omni-bg-surface);
}

.search-person-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.search-person-name {
  color: var(--omni-text-primary);
  font-size: 0.85rem;
}

.search-person-about {
  color: var(--omni-text-muted);
  font-size: 0.74rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 420px;
}

.search-person-open {
  margin-left: auto;
  color: var(--omni-text-muted);
  display: inline-flex;
}

.search-notes-list {
  display: flex;
  flex-direction: column;
}

/* Feed Tabs (Following vs Global) */
.feed-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--omni-bg-subtle, rgba(255, 255, 255, 0.05));
  padding: 2px 3px;
  border-radius: var(--omni-radius-pill, 20px);
}

.feed-tab-btn {
  background: transparent;
  color: var(--omni-text-secondary, #9e988f);
  border: none;
  border-radius: var(--omni-radius-pill, 16px);
  padding: 4px 10px;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.feed-tab-btn.active {
  background: var(--omni-bg-surface, #22201d);
  color: var(--omni-text-primary, #ede8df);
  font-weight: 600;
}

.feed-tab-btn:hover:not(.active) {
  color: var(--omni-text-primary, #ede8df);
}

/* Thread Page & Stream */
.feed-thread-page {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.thread-ancestor-card {
  position: relative;
  opacity: 0.9;
}

.thread-ancestors {
  position: relative;
  display: flex;
  flex-direction: column;
}

.thread-focused-note {
  border-left: 3px solid var(--omni-accent, #d4a373);
  background: var(--omni-bg-surface, #191816);
  border-radius: var(--omni-radius-sm, 6px);
  margin: 6px 0;
}

.thread-focused-note .feed-post-content {
  font-size: 1.02rem;
  line-height: 1.5;
}

.thread-reply-composer {
  margin: 10px 16px;
  padding: 12px;
  background: var(--omni-bg-surface, #191816);
  border: 1px solid var(--omni-border-subtle, #383530);
  border-radius: var(--omni-radius-md, 8px);
}

.thread-replies-list {
  display: flex;
  flex-direction: column;
}

.thread-reply-nested {
  margin-left: 20px;
  border-left: 2px solid var(--omni-border-subtle, #383530);
  padding-left: 12px;
  position: relative;
}

.thread-reply-nested::before {
  content: "";
  position: absolute;
  left: 0;
  top: 24px;
  width: 8px;
  height: 2px;
  background: var(--omni-border-subtle, #383530);
}

.thread-reply-indicator {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.73rem;
  color: var(--omni-text-muted, #78716c);
  margin-bottom: 4px;
  background: var(--omni-bg-subtle, #22201d);
  padding: 2px 8px;
  border-radius: var(--omni-radius-pill, 12px);
  width: fit-content;
}

.thread-reply-indicator .reply-target-author {
  color: var(--omni-accent-primary, #d4a373);
  font-weight: 500;
}

.btn-profile-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--omni-bg-subtle, #22201d);
  border: 1px solid var(--omni-border-subtle, #272522);
  color: var(--omni-text-primary, #ede8df);
  padding: 5px 12px;
  border-radius: var(--omni-radius-pill, 16px);
  font-size: 0.78rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-profile-back:hover {
  background: var(--omni-bg-elevated, #2a2723);
  border-color: var(--omni-accent-primary, #d4a373);
  color: var(--omni-accent-primary, #d4a373);
}

.btn-toggle-lookup {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--omni-bg-subtle, #22201d);
  border: 1px solid var(--omni-border-subtle, #272522);
  color: var(--omni-text-secondary, #9e988f);
  padding: 4px 10px;
  border-radius: var(--omni-radius-pill, 16px);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-toggle-lookup:hover {
  color: var(--omni-text-primary, #ede8df);
  border-color: var(--omni-accent-primary, #d4a373);
}

.following-filter-input,
.blocked-filter-input {
  background: var(--omni-bg-surface, #191816);
  border: 1px solid var(--omni-border-subtle, #272522);
  color: var(--omni-text-primary, #ede8df);
  padding: 8px 12px;
  border-radius: var(--omni-radius-md, 8px);
  outline: none;
  font-size: 0.82rem;
  transition: border-color 0.15s ease;
  width: 100%;
  box-sizing: border-box;
}

.following-filter-input:focus,
.blocked-filter-input:focus {
  border-color: var(--omni-accent-primary, #d4a373);
}

/* People App Tabs & Views */
.people-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--omni-bg-subtle, rgba(255, 255, 255, 0.05));
  padding: 3px 4px;
  border-radius: var(--omni-radius-pill, 20px);
}

.people-tab-btn {
  background: transparent;
  color: var(--omni-text-secondary, #9e988f);
  border: none;
  border-radius: var(--omni-radius-pill, 16px);
  padding: 5px 12px;
  font-size: 0.78rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.people-tab-btn.active {
  background: var(--omni-bg-surface, #22201d);
  color: var(--omni-text-primary, #ede8df);
  font-weight: 600;
}

.people-tab-btn:hover:not(.active) {
  color: var(--omni-text-primary, #ede8df);
}

.people-list-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.people-user-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--omni-bg-surface, #191816);
  border: 1px solid var(--omni-border-subtle, #272522);
  border-radius: var(--omni-radius-md, 8px);
  transition: border-color 0.15s ease, background 0.15s ease;
}

.people-user-card:hover {
  border-color: var(--omni-border-active, #3d3a35);
  background: var(--omni-bg-elevated, #1f1d1a);
}

.people-user-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.people-user-name {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--omni-text-primary, #ede8df);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.people-user-handle {
  font-size: 0.78rem;
  color: var(--omni-text-secondary, #9e988f);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.people-user-about {
  font-size: 0.76rem;
  color: var(--omni-text-muted, #78716c);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.people-user-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.btn-follow-toggle,
.btn-block-toggle {
  font-size: 0.76rem;
  padding: 4px 12px;
  border-radius: var(--omni-radius-pill, 16px);
  cursor: pointer;
  transition: all 0.15s ease;
  font-weight: 500;
  border: 1px solid var(--omni-border-subtle, #383530);
  background: var(--omni-bg-subtle, #22201d);
  color: var(--omni-text-primary, #ede8df);
}

.btn-follow-toggle.is-following {
  background: rgba(212, 163, 115, 0.15);
  border-color: rgba(212, 163, 115, 0.4);
  color: var(--omni-accent-primary, #d4a373);
}

.btn-follow-toggle.is-following:hover {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.4);
  color: #f87171;
}

.btn-block-toggle.is-blocked {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.4);
  color: #f87171;
}

/* Note Composer (Bluesky Seamless Post Box) */
.feed-composer,
.composer-card {
  display: flex;
  gap: 14px;
  padding: 14px 16px;
  border: none !important;
  border-bottom: none !important;
  border-top: none !important;
  border-left: none !important;
  border-right: none !important;
  background: transparent !important;
  border-radius: 0;
  margin-bottom: 0;
  box-shadow: none !important;
}

.composer-avatar-col {
  flex-shrink: 0;
}

.composer-avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-weight: 700;
  font-size: 0.95rem;
  background: linear-gradient(135deg, #00a4ef, #0078d7);
  user-select: none;
}

.composer-main-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.composer-input {
  width: 100%;
  background: transparent;
  border: none;
  color: var(--omni-text-primary);
  font-family: inherit;
  font-size: 1.0rem;
  line-height: 1.5;
  resize: vertical;
  min-height: 52px;
  outline: none;
  padding: 4px 0;
}

.composer-input::placeholder {
  color: var(--omni-text-muted);
}

.composer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: none !important;
  padding-top: 6px;
}

.btn-publish {
  background: var(--omni-accent-primary);
  color: var(--omni-accent-contrast);
  font-weight: 600;
  border: none;
  padding: 6px 18px;
  border-radius: var(--omni-radius-pill);
  cursor: pointer;
  font-size: 0.84rem;
  transition: all 0.15s ease;
  margin-left: auto;
}

.btn-publish:hover {
  background: var(--omni-accent-hover);
  transform: translateY(-1px);
}

.btn-publish:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

/* Timeline Notes List (Unconstrained stream) */
.notes-list {
  display: flex;
  flex-direction: column;
  width: 100%;
  overflow: visible;
}

.feed-container .notes-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow: visible;
  flex: 1;
  padding: 0;
}

/* Individual Post (Bluesky Style Stream Item) */
.feed-post,
.note-card {
  display: flex;
  gap: 14px;
  padding: 14px 16px;
  border: none !important;
  border-top: none !important;
  border-left: none !important;
  border-right: none !important;
  border-bottom: none !important;
  border-radius: var(--omni-radius-md, 8px) !important;
  background: transparent !important;
  box-shadow: none !important;
  transition: background 0.15s ease, opacity 0.12s ease;
  text-decoration: none;
  cursor: pointer !important;
}

.feed-post:hover,
.note-card:hover {
  background: rgba(255, 255, 255, 0.035) !important;
}

.feed-post-avatar-col {
  flex-shrink: 0;
}

.feed-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-weight: 700;
  font-size: 0.9rem;
  user-select: none;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}

.feed-post-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.feed-post-header,
.note-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2px;
}

.feed-post-author-info {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
  line-height: 1.3;
}

.feed-author-name,
.note-author {
  font-weight: 600;
  font-size: 0.94rem;
  color: var(--omni-text-primary);
  white-space: nowrap;
}

.feed-author-handle {
  font-size: 0.82rem;
  color: var(--omni-text-muted);
  white-space: nowrap;
}

.feed-dot {
  font-size: 0.8rem;
  color: var(--omni-text-muted);
}

.feed-time,
.note-meta {
  font-size: 0.82rem;
  color: var(--omni-text-muted);
  white-space: nowrap;
}

.feed-reply-badge {
  font-size: 0.76rem;
  color: var(--omni-text-muted);
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.feed-post-content,
.note-content {
  font-size: 0.95rem;
  line-height: 1.5;
  color: var(--omni-text-primary);
  margin: 6px 0 10px 0;
  word-break: break-word;
  white-space: pre-wrap;
}

.feed-link {
  color: var(--omni-accent-primary);
  text-decoration: none;
  word-break: break-all;
}

.feed-link:hover {
  text-decoration: underline;
}

.feed-post-actions,
.note-actions {
  display: flex;
  align-items: center;
  gap: 24px;
  margin-top: 2px;
  border-top: none;
  padding-top: 0;
}

.omni-slot .feed-action-btn,
.omni-slot .note-action-btn,
.feed-post .feed-action-btn,
.note-card .note-action-btn,
.feed-action-btn,
.note-action-btn {
  background: transparent !important;
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
  padding: 0 !important;
  margin: 0 !important;
  border-radius: 0 !important;
  color: var(--omni-accent-primary, #00a4ef) !important;
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  font-size: 0.82rem !important;
  line-height: 1 !important;
  cursor: pointer !important;
  transition: opacity 0.15s ease, transform 0.1s ease !important;
}

.feed-action-btn:hover,
.note-action-btn:hover {
  opacity: 0.75 !important;
  background: transparent !important;
  color: var(--omni-accent-hover, #0078d7) !important;
}

.feed-action-btn:active,
.note-action-btn:active {
  transform: scale(0.92) !important;
}

.feed-action-btn svg,
.note-action-btn svg {
  stroke: currentColor !important;
  fill: none !important;
  width: 16px !important;
  height: 16px !important;
  display: inline-block !important;
  vertical-align: middle !important;
}

.feed-action-btn .action-count,
.note-action-btn .action-count {
  color: inherit !important;
  font-size: 0.78rem !important;
  font-weight: 500 !important;
  line-height: 1 !important;
}

.feed-action-btn.active-liked,
.btn-like.active-liked {
  color: #f43f5e !important;
}

.feed-action-btn.active-liked svg {
  fill: #f43f5e !important;
  stroke: #f43f5e !important;
}

.feed-action-btn.active-reposted {
  color: #4ade80 !important;
}

.action-count {
  font-size: 0.75rem;
  font-weight: 500;
}

/* Loading & Sentinel States */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  gap: 12px;
  color: var(--omni-text-muted);
  font-size: 0.88rem;
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--omni-border-subtle);
  border-top-color: var(--omni-accent-primary);
  border-radius: 50%;
  animation: omni-spin 0.8s linear infinite;
}

.feed-sentinel {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  gap: 10px;
  text-align: center;
  color: var(--omni-text-muted);
}

.empty-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--omni-bg-surface);
  border: 1px solid var(--omni-border-subtle);
  margin-bottom: 6px;
  color: var(--omni-accent-primary);
}

.empty-state-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--omni-text-primary);
}

.empty-state-subtitle {
  font-size: 0.82rem;
  color: var(--omni-text-muted);
  max-width: 320px;
  line-height: 1.4;
}


/* 4. Mobile Bottom Navigation Dock */
.mobile-dock {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 58px;
  background: var(--omni-bg-surface);
  border-top: 1px solid var(--omni-border-strong);
  display: flex;
  align-items: center;
  justify-content: space-around;
  z-index: 60;
}

.dock-slot-container {
  display: flex;
  align-items: center;
  justify-content: space-around;
  gap: 8px;
}

.dock-slot-container .omni-component-slot {
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: visible !important;
}

.dock-item,
.dock-icon-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--omni-text-secondary);
  font-size: 0.72rem;
  gap: 2px;
  cursor: pointer;
  position: relative;
  min-width: 60px;
  padding: 4px 0;
  transition: color 0.15s ease;
}

.dock-item:hover,
.dock-icon-btn:hover {
  color: var(--omni-text-primary);
}

.dock-item.active,
.dock-icon-btn.active {
  color: var(--omni-accent-primary);
}

.dock-icon-wrapper {
  position: relative;
  font-size: 1.15rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Desktop layout scaling (>= 768px) */
@media (min-width: 768px) {
  .mobile-dock {
    position: relative;
    top: 0;
    left: 0;
    width: 64px;
    height: 100%;
    flex-shrink: 0;
    flex-direction: column;
    justify-content: flex-start;
    padding-top: 24px;
    padding-bottom: 24px;
    gap: 24px;
    border-top: none;
    border-right: 1px solid var(--omni-border-subtle);
    z-index: 40;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .dock-slot-container {
    flex-direction: column;
    gap: 24px;
    width: 100%;
  }

  .dock-slot-container .omni-component-slot {
    width: 100%;
  }

  .main-viewport {
    padding-bottom: 24px;
  }
}

/* 7. Scoped Styling for .omni-slot Standard HTML Elements */
.omni-slot {
  position: relative;
  contain: layout paint;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.omni-slot button {
  background: var(--omni-accent-primary);
  color: var(--omni-accent-contrast);
  border: none;
  border-radius: var(--omni-radius-sm);
  padding: 7px 14px;
  font-family: var(--omni-font-sans);
  font-weight: 500;
  cursor: pointer;
  font-size: 0.88rem;
  transition: opacity 0.15s ease;
}

.omni-slot button:hover {
  opacity: 0.9;
}

.omni-slot button > *,
.omni-slot button *,
.dock-item > *,
.dock-item * {
  pointer-events: none;
}

.omni-slot input[type="text"] {
  background: var(--omni-bg-subtle);
  border: 1px solid var(--omni-border-strong);
  color: var(--omni-text-primary);
  border-radius: var(--omni-radius-sm);
  padding: 8px 12px;
  font-size: 0.88rem;
  font-family: var(--omni-font-sans);
  outline: none;
  width: 100%;
}

.omni-slot input[type="text"]:focus {
  border-color: var(--omni-border-focus);
}

.omni-slot input[type="checkbox"] {
  accent-color: var(--omni-accent-primary);
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.omni-slot ul {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Checklist widget styling inside slot */
.checklist-widget-card,
.timer-widget-card {
  background: var(--omni-bg-surface);
  border: 1px solid var(--omni-border-strong);
  border-radius: var(--omni-radius-md);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.widget-header h3 {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--omni-text-primary);
}

.task-input-row {
  display: flex;
  gap: 8px;
}

.task-input-row button {
  min-width: 40px;
  font-size: 1.1rem;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.task-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid var(--omni-border-subtle);
  font-size: 0.9rem;
}

.task-item span {
  flex: 1;
  margin-left: 10px;
}

.delete-task-btn {
  background: transparent !important;
  color: var(--omni-text-muted) !important;
  font-size: 1.1rem !important;
  padding: 2px 6px !important;
}

/* Timer widget styling inside slot */
.timer-display-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px 0;
}

.timer-digits {
  font-size: 2.4rem;
  font-weight: 700;
  font-family: var(--omni-font-mono);
  color: var(--omni-accent-primary);
  letter-spacing: 0.05em;
}

.timer-status {
  font-size: 0.85rem;
  color: var(--omni-text-secondary);
  margin-top: 4px;
}

.timer-buttons-row {
  display: flex;
  justify-content: center;
  gap: 10px;
}

.btn-timer-reset {
  background: var(--omni-bg-subtle) !important;
  color: var(--omni-text-primary) !important;
  border: 1px solid var(--omni-border-strong) !important;
}

/* Dock badges */
.dock-badge {
  background: var(--omni-status-badge);
  color: var(--omni-accent-contrast);
  font-size: 0.65rem;
  font-weight: bold;
  padding: 1px 5px;
  border-radius: var(--omni-radius-pill);
  position: absolute;
  top: -4px;
  right: -8px;
}

/* 8. Plugin Manager Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  z-index: 100;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.modal-overlay.open {
  display: flex;
}

.modal-card {
  background: var(--omni-bg-elevated);
  border: 1px solid var(--omni-border-strong);
  border-radius: var(--omni-radius-lg);
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.plugin-item-row {
  background: var(--omni-bg-surface);
  border: 1px solid var(--omni-border-subtle);
  border-radius: var(--omni-radius-md);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Secondary & Danger Buttons */
.btn-secondary {
  background: var(--omni-bg-subtle);
  border: 1px solid var(--omni-border-strong);
  color: var(--omni-text-primary);
  padding: 5px 12px;
  border-radius: var(--omni-radius-sm);
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-secondary:hover {
  background: var(--omni-border-strong);
}

.btn-danger {
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #f87171;
  padding: 5px 12px;
  border-radius: var(--omni-radius-sm);
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 0.15s ease;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-danger:hover {
  background: rgba(239, 68, 68, 0.15);
}

/* Toggle Switch */
.omni-toggle {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
}

.omni-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background-color: var(--omni-bg-subtle);
  border: 1px solid var(--omni-border-strong);
  transition: 0.2s;
  border-radius: var(--omni-radius-pill);
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 12px;
  width: 12px;
  left: 3px;
  bottom: 3px;
  background-color: var(--omni-text-muted);
  transition: 0.2s;
  border-radius: 50%;
}

.omni-toggle input:checked + .toggle-slider {
  background-color: var(--omni-accent-primary);
  border-color: var(--omni-accent-hover);
}

.omni-toggle input:checked + .toggle-slider:before {
  transform: translateX(16px);
  background-color: var(--omni-accent-contrast);
}

/* Manifest Code Block */
.manifest-code-block {
  background: var(--omni-bg-canvas);
  border: 1px solid var(--omni-border-subtle);
  border-radius: var(--omni-radius-sm);
  padding: 12px;
  font-family: var(--omni-font-mono);
  font-size: 0.75rem;
  color: var(--omni-text-secondary);
  overflow-x: auto;
  max-height: 260px;
  white-space: pre;
}

/* Tabs */
.modal-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--omni-border-subtle);
  padding-bottom: 8px;
}

.modal-tab-btn {
  background: transparent;
  border: none;
  color: var(--omni-text-muted);
  font-size: 0.82rem;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: var(--omni-radius-sm);
  cursor: pointer;
}

.modal-tab-btn.active {
  background: var(--omni-bg-subtle);
  color: var(--omni-text-primary);
}

/* ==========================================================================
   Unified Settings Modal & Visual Layout Configurator
   ========================================================================== */
.settings-modal-card {
  background: var(--omni-bg-elevated);
  border: 1px solid var(--omni-border-strong);
  border-radius: var(--omni-radius-lg);
  width: 95vw;
  max-width: 920px;
  height: 85vh;
  max-height: 850px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--omni-border-subtle);
  background: var(--omni-bg-surface);
}

.settings-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.settings-nav {
  width: 220px;
  border-right: 1px solid var(--omni-border-subtle);
  background: var(--omni-bg-surface);
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
  overflow-y: auto;
}

.settings-nav-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--omni-radius-sm);
  background: transparent;
  border: none;
  color: var(--omni-text-secondary);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
  width: 100%;
}

.settings-nav-btn:hover {
  background: var(--omni-bg-subtle);
  color: var(--omni-text-primary);
}

.settings-nav-btn.active {
  background: var(--omni-bg-subtle);
  color: var(--omni-accent-primary);
  font-weight: 600;
}

.settings-content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
  background: var(--omni-bg-elevated);
}

.settings-pane {
  display: none;
  flex-direction: column;
  gap: 16px;
}

.settings-pane.active {
  display: flex;
}



/* Responsive Mobile Settings */
@media (max-width: 768px) {
  .settings-modal-card {
    width: 100vw;
    height: 100vh;
    max-height: 100vh;
    border-radius: 0;
    border: none;
  }

  .settings-body {
    flex-direction: column;
  }

  .settings-nav {
    width: 100%;
    flex-direction: row;
    overflow-x: auto;
    border-right: none;
    border-bottom: 1px solid var(--omni-border-subtle);
    padding: 8px 12px;
    gap: 6px;
  }

  .settings-nav-btn {
    white-space: nowrap;
    width: auto;
    padding: 6px 12px;
    font-size: 0.8rem;
  }

  .settings-content {
    padding: 16px 16px calc(80px + env(safe-area-inset-bottom, 24px)) 16px;
  }
}


`;
