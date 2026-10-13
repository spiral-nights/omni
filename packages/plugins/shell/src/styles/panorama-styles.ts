/**
 * Panorama Shell Stylesheet (Windows Phone Metro / People Hub theme)
 */
export const PANORAMA_SHELL_CSS = /* css */ `
/* ==========================================================================
   PanoramaShell — Windows Phone Modern / People Hub Design System
   ========================================================================== */

:root.theme-panorama,
body.theme-panorama,
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
  --omni-border-focus: #00a4ef;

  --omni-accent-primary: #00a4ef;
  --omni-accent-hover: #0078d7;
  --omni-accent-contrast: #ffffff;

  --omni-status-online: #00a4ef;
  --omni-status-badge: #00a4ef;

  --omni-radius-sm: 0px;
  --omni-radius-md: 0px;
  --omni-radius-lg: 0px;
  --omni-radius-pill: 0px;

  /* Standard Generic Tokens used by standalone plugins */
  --bg-canvas: #000000;
  --bg-surface: #111111;
  --bg-elevated: #161616;
  --bg-subtle: #222222;

  --text-primary: #ffffff;
  --text-secondary: #aaaaaa;
  --text-muted: #666666;

  --border-subtle: #1e1e1e;
  --border-strong: #333333;
  --border-focus: #00a4ef;

  --accent-primary: #00a4ef;
  --accent-hover: #0078d7;
  --accent-contrast: #ffffff;

  --status-online: #00a4ef;
  --status-badge: #00a4ef;

  --radius-sm: 0px;
  --radius-md: 0px;
  --radius-lg: 0px;
  --radius-pill: 0px;
}

.panorama-shell-root {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  background-color: #000000;
  color: #ffffff;
  overflow: hidden;
  position: relative;
  font-family: -apple-system, "Segoe UI", "Segoe UI Web Light", "Segoe UI Light", Roboto, Helvetica, Arial, sans-serif;
  user-select: none;
}

.panorama-shell-root,
.panorama-shell-root * {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.panorama-shell-root::-webkit-scrollbar,
.panorama-shell-root *::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

/* 1. Panorama Hero Header & Pivot Navigation */
.panorama-hero-header {
  padding: 24px 24px 8px 24px;
  flex-shrink: 0;
  background: #000000;
  z-index: 10;
}

.panorama-hero-title {
  font-size: 3.2rem;
  font-weight: 200;
  letter-spacing: -0.04em;
  line-height: 1;
  color: #ffffff;
  margin: 0 0 12px 0;
  text-transform: lowercase;
}

.panorama-pivot-nav {
  display: flex;
  gap: 28px;
  overflow-x: auto;
  scrollbar-width: none;
  white-space: nowrap;
  scroll-behavior: smooth;
  padding-right: calc(100vw - 120px);
}

.panorama-pivot-nav::-webkit-scrollbar {
  display: none;
}

.panorama-pivot-item {
  background: transparent;
  border: none;
  color: #666666;
  font-size: 1.55rem;
  font-weight: 300;
  letter-spacing: -0.03em;
  cursor: pointer;
  padding: 0;
  text-transform: lowercase;
  transition: color 0.15s ease;
  font-family: inherit;
  flex-shrink: 0;
}

.panorama-pivot-item:hover {
  color: #aaaaaa;
}

.panorama-pivot-item.active {
  color: #ffffff;
  font-weight: 400;
}

/* 2. Panorama Horizontal Canvas */
.panorama-canvas {
  flex: 1;
  display: flex;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.panorama-canvas::-webkit-scrollbar {
  display: none;
}

.panorama-section {
  flex: 0 0 100vw;
  max-width: 100vw;
  height: 100%;
  scroll-snap-align: start;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 24px 24px 24px;
  display: flex;
  flex-direction: column;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.panorama-section::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

@media (min-width: 768px) {
  .panorama-section {
    flex: 0 0 540px;
    max-width: 540px;
  }
}

.panorama-section-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  min-height: 100%;
  height: auto;
  flex: 1;
}

/* Full page vertical scroll effect: prevent slots from clipping or trapping inner scrollbars */
.panorama-section .omni-slot,
.panorama-slot-main,
.panorama-feed-slot,
.panorama-main-viewport-slot {
  overflow: visible !important;
  height: auto !important;
  min-height: 100% !important;
  contain: none !important;
  flex: 1;
}

.panorama-section-title-bar {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 4px;
}

.panorama-section-title-bar h2 {
  font-size: 1.25rem;
  font-weight: 300;
  color: #ffffff;
  letter-spacing: -0.02em;
  text-transform: lowercase;
}

.panorama-badge {
  font-size: 0.72rem;
  color: #888888;
  font-weight: 400;
}

/* 3. Live Accent Tiles (Windows Phone Tile Grid) */
.panorama-tiles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 12px;
}

.panorama-tile {
  aspect-ratio: 1 / 1;
  background-color: #00a4ef;
  color: #ffffff;
  padding: 14px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: relative;
  cursor: pointer;
  transition: transform 0.12s ease, opacity 0.12s ease;
  user-select: none;
}

.panorama-tile:hover {
  transform: scale(0.97);
}

.panorama-tile:active {
  transform: scale(0.94);
  opacity: 0.85;
}

.panorama-tile-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
}

.panorama-tile-title {
  font-size: 0.85rem;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.01em;
  word-break: break-word;
}

.panorama-tile-pin {
  position: absolute;
  top: 8px;
  right: 8px;
  opacity: 0.6;
}

/* 4. Panorama Widgets & System Cards */
.panorama-widgets-grid {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.panorama-system-card {
  background: #111111;
  border: 1px solid #222222;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.panorama-system-card-header {
  display: flex;
  align-items: center;
  gap: 14px;
}

.panorama-system-avatar {
  width: 48px;
  height: 48px;
  background: #00a4ef;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  color: #ffffff;
}

.panorama-system-identity {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.panorama-system-identity strong {
  font-size: 1rem;
  font-weight: 500;
  color: #ffffff;
}

.panorama-system-identity code {
  font-size: 0.72rem;
  color: #888888;
  font-family: var(--omni-font-mono);
}

.btn-panorama-action {
  background: #222222;
  border: 1px solid #333333;
  color: #ffffff;
  padding: 6px 12px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
}

.btn-panorama-action:hover {
  background: #333333;
}

.btn-panorama-action.active {
  background: #00a4ef;
  border-color: #00a4ef;
  color: #ffffff;
  font-weight: 600;
}

.panorama-system-plugin-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #1a1a1a;
}

/* 5. Embedded Active Application in Applications Section */
.panorama-full-app-overlay {
  position: relative;
  width: 100%;
  min-height: 100%;
  flex: 1;
  background: transparent;
  display: none;
  flex-direction: column;
  gap: 12px;
}

.panorama-full-app-overlay.open {
  display: flex;
}

.panorama-section.has-active-app {
  flex: 0 0 90vw;
  max-width: 90vw;
}

@media (min-width: 768px) {
  .panorama-section.has-active-app {
    flex: 0 0 620px;
    max-width: 620px;
  }
}

.panorama-full-app-header {
  height: 56px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  gap: 16px;
  border-bottom: 1px solid #1a1a1a;
  background: #000000;
  flex-shrink: 0;
}

.panorama-full-app-header h2 {
  font-size: 1.2rem;
  font-weight: 400;
  color: #ffffff;
  letter-spacing: -0.02em;
}

.panorama-full-app-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.panorama-full-app-container::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.panorama-app-page {
  width: 100%;
  min-height: 100%;
  height: auto;
  overflow: visible !important;
}

.panorama-app-page .omni-slot {
  overflow: visible !important;
  height: auto !important;
  min-height: 100% !important;
  contain: none !important;
}

/* 6. Action Circle Buttons (Header / Inspector / Dialogs) */
.btn-app-bar-circle {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 2px solid #ffffff;
  background: transparent;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  padding: 0;
}

.btn-app-bar-circle:hover {
  background: #ffffff;
  color: #000000;
}

.btn-app-bar-circle:active {
  transform: scale(0.92);
}

.panorama-drawer-item:hover {
  background: #2a2a2a;
}

/* 8. Panorama Feed, Composer & Companion Widget Styles */

/* Feed Container */
.feed-container {
  width: 100%;
  max-width: 100%;
  margin: 0;
  display: flex;
  flex-direction: column;
  min-height: 100%;
  height: auto;
  background: transparent;
  padding: 0;
  box-sizing: border-box;
}

.feed-top-header {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 4px 0 12px 0;
  background: transparent;
  border-bottom: 1px solid #1a1a1a;
}

.feed-top-header .feed-title {
  display: none;
}

.btn-refresh-feed {
  background: #111111;
  border: 1px solid #222222;
  color: #aaaaaa;
  font-size: 0.76rem;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 0px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: all 0.15s ease;
}

.btn-refresh-feed:hover {
  color: #ffffff;
  border-color: #00a4ef;
  background: #161616;
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
  gap: 6px;
}

.btn-search-feed {
  background: #111111;
  border: 1px solid #222222;
  color: #aaaaaa;
  font-size: 0.76rem;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 0px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: all 0.15s ease;
}

.btn-search-feed:hover {
  color: #ffffff;
  border-color: #00a4ef;
  background: #161616;
}

.btn-search-back {
  background: transparent;
  border: none;
  color: #aaaaaa;
  font-size: 0.76rem;
  font-weight: 500;
  padding: 4px 8px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: color 0.15s ease;
}

.btn-search-back:hover {
  color: #ffffff;
}

.feed-search-bar {
  display: flex;
  gap: 8px;
  padding: 10px 0;
  align-items: center;
}

.feed-search-input {
  flex: 1;
  background: #111111;
  border: 1px solid #222222;
  color: #ffffff;
  border-radius: 0px;
  padding: 8px 12px;
  font-size: 0.85rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s ease;
}

.feed-search-input:focus {
  border-color: #00a4ef;
}

.feed-search-input::placeholder {
  color: #555555;
}

.btn-do-search {
  background: #00a4ef;
  border: none;
  color: #000000;
  font-size: 0.78rem;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 0px;
  cursor: pointer;
  transition: filter 0.15s ease;
}

.btn-do-search:hover {
  filter: brightness(1.15);
}

.search-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 8px 0;
  padding: 4px 6px 4px 10px;
  font-size: 0.72rem;
  color: #aaaaaa;
  background: #161616;
  border: 1px solid #222222;
  border-radius: 0px;
  width: fit-content;
}

.search-chip .chip-remove {
  background: transparent;
  border: none;
  color: #666666;
  font-size: 0.9rem;
  line-height: 1;
  padding: 0 4px;
  cursor: pointer;
}

.search-chip .chip-remove:hover {
  color: #ffffff;
}

.search-section-title {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #666666;
  padding: 12px 0 6px 0;
}

.search-status {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 0;
  color: #666666;
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
  padding: 10px 0;
  border-bottom: 1px solid #1a1a1a;
  cursor: pointer;
  transition: background 0.15s ease;
}

.search-person-row:hover {
  background: #0d0d0d;
}

.search-person-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.search-person-name {
  color: #ffffff;
  font-size: 0.85rem;
}

.search-person-about {
  color: #666666;
  font-size: 0.74rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 420px;
}

.search-person-open {
  margin-left: auto;
  color: #555555;
  display: inline-flex;
}

.search-notes-list {
  display: flex;
  flex-direction: column;
}

/* Note Composer */
.feed-composer,
.composer-card {
  display: flex;
  gap: 14px;
  padding: 14px 0;
  border: none;
  background: transparent;
  border-radius: 0;
  margin-bottom: 0;
  border-bottom: 1px solid #1a1a1a;
  box-sizing: border-box;
}

.composer-avatar-col {
  flex-shrink: 0;
}

.composer-avatar {
  width: 40px;
  height: 40px;
  border-radius: 0px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-weight: 700;
  font-size: 0.95rem;
  background: #00a4ef;
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
  color: #ffffff;
  font-family: inherit;
  font-size: 1.05rem;
  line-height: 1.45;
  resize: vertical;
  min-height: 52px;
  outline: none;
  padding: 4px 0;
  box-sizing: border-box;
}

.composer-input::placeholder {
  color: #666666;
}

.composer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 6px;
}

.btn-publish {
  background: #00a4ef;
  color: #ffffff;
  font-weight: 600;
  border: none;
  padding: 6px 18px;
  border-radius: 0px;
  cursor: pointer;
  font-size: 0.84rem;
  transition: all 0.15s ease;
  margin-left: auto;
}

.btn-publish:hover {
  background: #0078d7;
}

.btn-publish:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Timeline Notes Stream */
.notes-list {
  display: flex;
  flex-direction: column;
  width: 100%;
  overflow: visible;
  padding: 0;
  margin: 0;
}

.feed-container .notes-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow: visible;
  flex: 1;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 32px 16px;
  color: #666666;
  font-size: 0.88rem;
}

.loading-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid #333333;
  border-top-color: #00a4ef;
  border-radius: 50%;
  animation: omni-spin 0.8s linear infinite;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  gap: 8px;
  text-align: center;
  color: #777777;
}

.empty-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  background: #111111;
  border: 1px solid #222222;
  margin-bottom: 4px;
  color: #00a4ef;
}

.empty-state-title {
  font-size: 1.1rem;
  font-weight: 300;
  letter-spacing: -0.01em;
  color: #ffffff;
}

.empty-state-subtitle {
  font-size: 0.85rem;
  color: #777777;
  max-width: 340px;
  line-height: 1.4;
}


/* Individual Post / Note Card */
.feed-post,
.note-card {
  display: flex;
  gap: 14px;
  padding: 14px 0;
  border: none;
  border-bottom: 1px solid #161616;
  background: transparent;
  transition: background 0.12s ease;
  text-decoration: none;
  box-sizing: border-box;
}

.feed-post:hover,
.note-card:hover {
  background: transparent;
}

.feed-post-avatar-col {
  flex-shrink: 0;
}

.feed-avatar {
  width: 40px;
  height: 40px;
  border-radius: 0px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-weight: 700;
  font-size: 0.9rem;
  user-select: none;
  background: #1f1f1f;
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
  color: #ffffff;
  white-space: nowrap;
}

.feed-author-handle {
  font-size: 0.82rem;
  color: #666666;
  white-space: nowrap;
}

.feed-dot {
  font-size: 0.8rem;
  color: #666666;
}

.feed-time,
.note-meta {
  font-size: 0.82rem;
  color: #666666;
  white-space: nowrap;
}

.feed-reply-badge {
  font-size: 0.76rem;
  color: #888888;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.feed-post-content,
.note-content {
  font-size: 0.95rem;
  line-height: 1.5;
  color: #eeeeee;
  margin: 6px 0 10px 0;
  word-break: break-word;
  white-space: pre-wrap;
}

.feed-link {
  color: #00a4ef;
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

.feed-action-btn,
.note-action-btn {
  background: transparent;
  border: none;
  outline: none;
  box-shadow: none;
  padding: 0;
  margin: 0;
  border-radius: 0;
  color: #888888;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  line-height: 1;
  cursor: pointer;
  transition: color 0.15s ease;
}

.feed-action-btn:hover,
.note-action-btn:hover {
  color: #00a4ef;
}

.new-posts-pill {
  position: sticky;
  top: 10px;
  align-self: center;
  background: #00a4ef;
  color: #ffffff;
  font-size: 0.8rem;
  font-weight: 600;
  padding: 6px 16px;
  border-radius: 0px;
  border: none;
  cursor: pointer;
  z-index: 25;
}

.cache-indicator {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.74rem;
  color: #00a4ef;
  font-weight: 500;
}

/* Companion Widgets (Timer, Checklist, etc.) */
.widget-card,
.timer-widget-card,
.checklist-widget-card,
.checklist-card {
  background: #111111;
  border: 1px solid #222222;
  border-radius: 0px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
}

.timer-digits {
  color: #00a4ef;
  font-size: 2.5rem;
  font-weight: 200;
  font-variant-numeric: tabular-nums;
  text-align: center;
  margin: 8px 0;
}

.btn-timer-start,
.btn-add-task {
  background: #00a4ef;
  color: #ffffff;
  border: none;
  border-radius: 0px;
  padding: 8px 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-timer-start:hover,
.btn-add-task:hover {
  background: #0078d7;
}

.btn-timer-pause,
.btn-timer-reset {
  background: #1a1a1a;
  border: 1px solid #333333;
  color: #ffffff;
  border-radius: 0px;
  padding: 8px 16px;
  cursor: pointer;
}

.btn-timer-pause:hover,
.btn-timer-reset:hover {
  background: #252525;
}

/* Form Controls in Panorama Theme */
.panorama-shell-root textarea:not(.composer-input),
.panorama-shell-root input[type="text"],
.panorama-shell-root input[type="number"],
.panorama-shell-root select {
  border-radius: 0px;
  background: #161616;
  border: 1px solid #333333;
  color: #ffffff;
  padding: 6px 10px;
  font-size: 0.88rem;
  box-sizing: border-box;
}

.panorama-shell-root input[type="checkbox"] {
  accent-color: #00a4ef;
  cursor: pointer;
}

.panorama-shell-root .omni-toggle {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 22px;
  flex-shrink: 0;
}

.panorama-shell-root .omni-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
  margin: 0;
  padding: 0;
  pointer-events: none;
}

.panorama-shell-root .toggle-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  border-radius: 0px;
  border: 2px solid #555555;
  background-color: transparent;
  transition: 0.15s ease;
}

.panorama-shell-root .toggle-slider:before {
  position: absolute;
  content: "";
  border-radius: 0px;
  width: 14px;
  height: 14px;
  left: 2px;
  bottom: 2px;
  background-color: #ffffff;
  transition: 0.15s ease;
}

.panorama-shell-root .omni-toggle input:checked + .toggle-slider {
  background-color: #00a4ef;
  border-color: #00a4ef;
}

.panorama-shell-root .omni-toggle input:checked + .toggle-slider:before {
  transform: translateX(22px);
  background-color: #000000;
}

/* 9. Panorama Plugin Configuration & Inspector */
.panorama-plugin-config-card {
  background: #111111;
  border: 1px solid #222222;
  transition: border-color 0.15s ease;
}

.panorama-plugin-config-card:hover {
  border-color: #333333;
}

.panorama-inspector-modal {
  position: absolute;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.85);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.panorama-inspector-content {
  background: #111111;
  border: 2px solid #00a4ef;
  max-width: 560px;
  width: 100%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panorama-inspector-header {
  padding: 14px 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #222222;
}

.panorama-inspector-body {
  padding: 18px;
  overflow-y: auto;
}


`;
