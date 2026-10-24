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

.panorama-shell-root {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
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

/* Guarantee non-visual elements are never displayed in host DOM */
style, script, head, title, meta, link,
.omni-component-slot style,
.omni-slot style {
  display: none !important;
}

/* 1. Panorama Hero Header & Pivot Navigation */
.panorama-hero-header {
  padding: 10px 16px 6px 16px;
  flex-shrink: 0;
  background: #000000;
  z-index: 10;
  position: relative;
  border-bottom: 1px solid #161616;
}

.panorama-header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.panorama-pivot-nav {
  display: flex;
  gap: 20px;
  overflow-x: auto;
  scrollbar-width: none;
  white-space: nowrap;
  scroll-behavior: smooth;
  padding: 0;
  flex: 1;
  min-width: 0;
}

.panorama-pivot-nav::-webkit-scrollbar {
  display: none;
}

.panorama-pivot-item {
  background: transparent;
  border: none;
  color: #666666;
  font-size: 1.6rem;
  font-weight: 300;
  letter-spacing: -0.03em;
  line-height: 1.1;
  cursor: pointer;
  padding: 2px 0;
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
  font-weight: 500;
}

.panorama-header-profile-wrap {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.panorama-header-user-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  color: #fff;
  transition: opacity 0.15s ease;
}

.panorama-header-user-btn:hover {
  opacity: 0.85;
}

.panorama-header-avatar {
  width: 28px;
  height: 28px;
  border-radius: 0px;
  background: #1a1a1a;
  border: 1px solid #333333;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: var(--omni-accent-primary, #00a4ef);
  flex-shrink: 0;
  transition: border-color 0.15s ease;
}

.panorama-header-user-btn:hover .panorama-header-avatar {
  border-color: var(--omni-accent-primary, #00a4ef);
}

.panorama-header-name {
  font-size: 0.8rem;
  font-weight: 400;
  color: #ccc;
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 600px) {
  .panorama-hero-header {
    padding: 8px 12px 6px 12px;
  }
  .panorama-pivot-nav {
    gap: 16px;
  }
  .panorama-pivot-item {
    font-size: 1.5rem;
    line-height: 1.1;
  }
  .panorama-header-name {
    display: none;
  }
}

/* Left Pane Peek Hint Indicator (Pure Metro Typography) */
.panorama-left-peek-hint {
  background: transparent;
  border: none;
  padding: 0;
  color: #666666;
  font-family: inherit;
  font-size: 1.05rem;
  font-weight: 300;
  letter-spacing: -0.02em;
  text-transform: lowercase;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: color 0.15s ease, opacity 0.2s ease;
  user-select: none;
  flex-shrink: 0;
}

.panorama-left-peek-hint:hover {
  color: #ffffff;
}

.panorama-left-peek-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  color: inherit;
}

/* 2. Panorama Horizontal Canvas */
.panorama-canvas {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  scroll-padding-left: 20px;
  scroll-padding-right: 48px;
  position: relative;
}

.panorama-canvas::-webkit-scrollbar {
  display: none;
}

.panorama-section {
  flex: 0 0 calc(100vw - 44px);
  max-width: calc(100vw - 44px);
  height: 100%;
  scroll-snap-align: start;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 16px 24px 16px;
  display: flex;
  flex-direction: column;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  -ms-overflow-style: none;
  box-sizing: border-box;
}

#panorama-section-system {
  padding-bottom: 32px;
}

.panorama-section::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

@media (min-width: 768px) {
  .panorama-section {
    flex: 0 0 min(540px, calc(100vw - 64px));
    max-width: min(540px, calc(100vw - 64px));
    padding: 8px 24px 24px 24px;
  }

  #panorama-section-system {
    padding-bottom: 32px;
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

.panorama-section-content::after {
  content: "";
  display: block;
  height: 24px;
  flex-shrink: 0;
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
  display: none;
}

.panorama-apps-active-view .panorama-section-title-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  padding: 2px 0;
}

.panorama-section-title-bar h2 {
  font-size: 1.15rem;
  font-weight: 300;
  color: #ffffff;
  letter-spacing: -0.02em;
  text-transform: lowercase;
}

/* 3. Live Accent Tiles (Windows Phone Tile Grid) */
.panorama-tiles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 12px;
}

.panorama-tile {
  aspect-ratio: 1 / 1;
  background-color: var(--omni-accent-primary, #00a4ef);
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
  background: var(--omni-accent-primary, #00a4ef);
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
  background: var(--omni-accent-primary, #00a4ef);
  border-color: var(--omni-accent-primary, #00a4ef);
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
#panorama-section-apps {
  perspective: 1200px;
  position: relative;
}

#panorama-apps-grid-view {
  transform-origin: center center;
  backface-visibility: hidden;
  will-change: transform, opacity;
}

.panorama-full-app-overlay {
  position: relative;
  width: 100%;
  min-height: 100%;
  flex: 1;
  background: transparent;
  display: none;
  flex-direction: column;
  gap: 12px;
  transform-origin: center center;
  backface-visibility: hidden;
  will-change: transform, opacity;
}

.panorama-full-app-overlay.open,
.panorama-full-app-overlay.card-flip-out-right {
  display: flex;
}

.card-flip-out-left {
  animation: panoramaCardFlipOutLeft 0.26s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

.card-flip-in-right {
  animation: panoramaCardFlipInRight 0.30s cubic-bezier(0.1, 0.9, 0.2, 1) forwards;
}

.card-flip-out-right {
  animation: panoramaCardFlipOutRight 0.26s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

.card-flip-in-left {
  animation: panoramaCardFlipInLeft 0.30s cubic-bezier(0.1, 0.9, 0.2, 1) forwards;
}

@keyframes panoramaCardFlipOutLeft {
  0% {
    transform: perspective(1200px) rotateY(0deg) scale(1);
    opacity: 1;
  }
  100% {
    transform: perspective(1200px) rotateY(-85deg) scale(0.94);
    opacity: 0;
  }
}

@keyframes panoramaCardFlipInRight {
  0% {
    transform: perspective(1200px) rotateY(85deg) scale(0.94);
    opacity: 0;
  }
  100% {
    transform: perspective(1200px) rotateY(0deg) scale(1);
    opacity: 1;
  }
}

@keyframes panoramaCardFlipOutRight {
  0% {
    transform: perspective(1200px) rotateY(0deg) scale(1);
    opacity: 1;
  }
  100% {
    transform: perspective(1200px) rotateY(85deg) scale(0.94);
    opacity: 0;
  }
}

@keyframes panoramaCardFlipInLeft {
  0% {
    transform: perspective(1200px) rotateY(-85deg) scale(0.94);
    opacity: 0;
  }
  100% {
    transform: perspective(1200px) rotateY(0deg) scale(1);
    opacity: 1;
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
  justify-content: space-between;
  align-items: center;
  padding: 4px 0 10px 0;
  background: transparent;
  border-bottom: 1px solid #1a1a1a;
  overflow-x: auto;
  overflow-y: hidden;
  white-space: nowrap;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  gap: 8px;
  width: 100%;
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

.feed-top-header .feed-title {
  display: none;
}

.feed-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
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
  flex-shrink: 0;
}

.btn-refresh-feed:hover {
  color: #ffffff;
  border-color: var(--omni-accent-primary, #00a4ef);
  background: #161616;
}

.btn-refresh-feed.spinning svg {
  animation: omni-spin 0.8s linear infinite;
}

@keyframes omni-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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
  flex-shrink: 0;
}

.btn-settings-feed {
  display: none !important;
}

.btn-search-feed:hover,
.btn-settings-feed:hover {
  color: #ffffff;
  border-color: var(--omni-accent-primary, #00a4ef);
  background: #161616;
}

.btn-search-feed.active,
.btn-settings-feed.active {
  color: #ffffff;
  border-color: var(--omni-accent-primary, #00a4ef);
  background: var(--omni-accent-primary, #00a4ef);
}

.btn-feed-back-to-top {
  background: #111111;
  border: 1px solid #222222;
  color: #aaaaaa;
  font-size: 0.76rem;
  font-weight: 500;
  padding: 6px 14px;
  border-radius: 0px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s ease;
}

.btn-feed-back-to-top:hover {
  color: #ffffff;
  border-color: var(--omni-accent-primary, #00a4ef);
  background: #161616;
}

.panorama-back-to-top {
  position: fixed;
  bottom: calc(56px + env(safe-area-inset-bottom, 0px));
  right: 24px;
  z-index: 99;
  background: #111111;
  color: #ffffff;
  border: 1px solid var(--omni-accent-primary, #00a4ef);
  padding: 8px 14px;
  font-size: 0.8rem;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transform: translateY(10px);
  transition: opacity 0.2s ease, transform 0.2s ease, background 0.15s ease;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6);
}

.panorama-back-to-top.visible {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.panorama-back-to-top:hover {
  background: var(--omni-accent-primary, #00a4ef);
  color: #000000;
}

@media (max-width: 600px) {
  .feed-top-header {
    padding: 4px 0 8px 0;
    gap: 6px;
  }
  .feed-nav-group {
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
  .panorama-back-to-top {
    bottom: calc(52px + env(safe-area-inset-bottom, 0px));
    right: 16px;
    padding: 6px 10px;
    font-size: 0.75rem;
  }
}

.btn-search-back,
.btn-settings-back,
.btn-thread-back {
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

.btn-search-back:hover,
.btn-settings-back:hover,
.btn-thread-back:hover {
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
  border-color: var(--omni-accent-primary, #00a4ef);
}

.feed-search-input::placeholder {
  color: #555555;
}

.btn-do-search {
  background: var(--omni-accent-primary, #00a4ef);
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

/* Feed Tabs (Following vs Global) */
.feed-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #111111;
  padding: 2px 3px;
  border: 1px solid #222222;
}

.feed-tab-btn {
  background: transparent;
  color: #888888;
  border: none;
  padding: 4px 10px;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.feed-tab-btn.active {
  background: var(--omni-accent-primary, #00a4ef);
  color: #ffffff;
  font-weight: 600;
}

.feed-tab-btn:hover:not(.active) {
  color: #ffffff;
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
  border-left: 3px solid var(--omni-accent-primary, #00a4ef);
  background: #111111;
  margin: 6px 0;
  padding: 4px 0;
}

.thread-focused-note .feed-post-content {
  font-size: 1.02rem;
  line-height: 1.5;
}

.thread-reply-composer {
  margin: 10px 0;
  padding: 12px;
  background: #111111;
  border: 1px solid #222222;
}

.thread-replies-list {
  display: flex;
  flex-direction: column;
}

.thread-reply-nested {
  margin-left: 20px;
  border-left: 2px solid #222222;
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
  background: #222222;
}

.thread-reply-indicator {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.73rem;
  color: #888888;
  margin-bottom: 4px;
  background: #161616;
  padding: 2px 8px;
  border-radius: 0;
  width: fit-content;
}

.thread-reply-indicator .reply-target-author {
  color: var(--omni-accent-primary, #00a4ef);
  font-weight: 500;
}

.btn-profile-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid #333333;
  color: #ffffff;
  padding: 5px 12px;
  font-size: 0.78rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-profile-back:hover {
  background: #1a1a1a;
  border-color: var(--omni-accent-primary, #00a4ef);
  color: var(--omni-accent-primary, #00a4ef);
}

.btn-toggle-lookup {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid #333333;
  color: #aaaaaa;
  padding: 4px 10px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-toggle-lookup:hover {
  color: #ffffff;
  border-color: var(--omni-accent-primary, #00a4ef);
}

.following-filter-input,
.blocked-filter-input {
  background: #111111;
  border: 1px solid #333333;
  color: #ffffff;
  padding: 8px 12px;
  border-radius: 0;
  outline: none;
  font-size: 0.82rem;
  transition: border-color 0.15s ease;
  width: 100%;
  box-sizing: border-box;
}

.following-filter-input:focus,
.blocked-filter-input:focus {
  border-color: var(--omni-accent-primary, #00a4ef);
}

/* People App Tabs & Views */
.people-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #111111;
  padding: 3px 4px;
  border-radius: 0;
}

.people-tab-btn {
  background: transparent;
  color: #999999;
  border: none;
  border-radius: 0;
  padding: 5px 12px;
  font-size: 0.78rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.people-tab-btn.active {
  background: var(--omni-accent-primary, #00a4ef);
  color: #ffffff;
  font-weight: 600;
}

.people-tab-btn:hover:not(.active) {
  color: #ffffff;
}

.people-list-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.people-user-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: #111111;
  border: 1px solid #222222;
  border-radius: 0;
  transition: border-color 0.15s ease;
}

.people-user-card:hover {
  border-color: var(--omni-accent-primary, #00a4ef);
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
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.people-user-handle {
  font-size: 0.78rem;
  color: #999999;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.people-user-about {
  font-size: 0.76rem;
  color: #666666;
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
  border-radius: 0;
  cursor: pointer;
  transition: all 0.15s ease;
  font-weight: 500;
  border: 1px solid #333333;
  background: #1a1a1a;
  color: #ffffff;
}

.btn-follow-toggle.is-following {
  background: color-mix(in srgb, var(--omni-accent-primary, #00a4ef) 20%, transparent);
  border-color: var(--omni-accent-primary, #00a4ef);
  color: var(--omni-accent-primary, #00a4ef);
}

.btn-follow-toggle.is-following:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: #ef4444;
  color: #ef4444;
}

.btn-block-toggle.is-blocked {
  background: rgba(239, 68, 68, 0.2);
  border-color: #ef4444;
  color: #ef4444;
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
  background: var(--omni-accent-primary, #00a4ef);
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
  background: var(--omni-accent-primary, #00a4ef);
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
  background: var(--omni-accent-hover, #0078d7);
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
  border-top-color: var(--omni-accent-primary, #00a4ef);
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
  color: var(--omni-accent-primary, #00a4ef);
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
  padding: 14px 8px;
  border: none;
  border-bottom: 1px solid #1a1a1a;
  background: transparent;
  transition: background 0.15s ease, border-left-color 0.15s ease;
  text-decoration: none;
  box-sizing: border-box;
  cursor: pointer;
  border-left: 2px solid transparent;
}

.feed-post:hover,
.note-card:hover {
  background: #141414;
  border-left-color: var(--omni-accent-primary, #00a4ef);
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
  color: var(--omni-accent-primary, #00a4ef);
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
  color: var(--omni-accent-primary, #00a4ef);
}

.new-posts-pill {
  position: sticky;
  top: 10px;
  align-self: center;
  background: var(--omni-accent-primary, #00a4ef);
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
  color: var(--omni-accent-primary, #00a4ef);
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
  color: var(--omni-accent-primary, #00a4ef);
  font-size: 2.5rem;
  font-weight: 200;
  font-variant-numeric: tabular-nums;
  text-align: center;
  margin: 8px 0;
}

.btn-timer-start,
.btn-add-task {
  background: var(--omni-accent-primary, #00a4ef);
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
  background: var(--omni-accent-hover, #0078d7);
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
  accent-color: var(--omni-accent-primary, #00a4ef);
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
  background-color: var(--omni-accent-primary, #00a4ef);
  border-color: var(--omni-accent-primary, #00a4ef);
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
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.panorama-inspector-content {
  background: #111111;
  border: 2px solid var(--omni-accent-primary, #00a4ef);
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

/* 7. Theme Accent Color Chooser */
.panorama-color-swatches-grid {
  display: grid;
  gap: 8px;
}

.panorama-color-swatch {
  aspect-ratio: 1 / 1;
  border: 2px solid transparent;
  cursor: pointer;
  position: relative;
  transition: transform 0.12s ease, border-color 0.12s ease;
  padding: 0;
  outline: none;
  min-height: 36px;
}

.panorama-color-swatch:hover {
  transform: scale(1.08);
  z-index: 2;
}

.panorama-color-swatch.active {
  border: 2px solid #ffffff !important;
  box-shadow: 0 0 0 1px #000000;
}

.panorama-color-swatch.active::after {
  content: "✓";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
}

/* 8. Compact Live Tiles & Context Menu */
.panorama-tile.has-compact-view {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 10px 12px;
}

.panorama-tile-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.panorama-tile-compact-container {
  flex: 1;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  margin-top: 4px;
}

.panorama-tile-compact-container .omni-component-slot {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.panorama-tile-context-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
  z-index: 9998;
}

.panorama-tile-context-menu {
  position: fixed;
  background: #161616;
  border: 1px solid #333333;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.85);
  min-width: 220px;
  max-width: 280px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  padding: 6px 0;
  animation: contextMenuPop 0.15s cubic-bezier(0.1, 0.9, 0.2, 1);
}

@keyframes contextMenuPop {
  0% { opacity: 0; transform: scale(0.95); }
  100% { opacity: 1; transform: scale(1); }
}

.panorama-tile-context-header {
  padding: 8px 16px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #888888;
  border-bottom: 1px solid #222222;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.context-menu-item {
  background: transparent;
  border: none;
  color: #ffffff;
  padding: 10px 16px;
  font-size: 0.84rem;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s ease;
  font-family: inherit;
  width: 100%;
}

.context-menu-item:hover {
  background: #242424;
}

.context-menu-cancel {
  border-top: 1px solid #222222;
  color: #888888;
  margin-top: 4px;
}

/* 9. Dynamic App Pane */
.panorama-dynamic-app-pane {
  min-width: 320px;
  max-width: 720px;
  width: 88vw;
  flex-shrink: 0;
  transition: opacity 0.22s cubic-bezier(0.1, 0.9, 0.2, 1), transform 0.22s cubic-bezier(0.1, 0.9, 0.2, 1);
  transform-origin: center left;
}

.panorama-dynamic-app-pane.pane-closing {
  opacity: 0;
  transform: scale(0.96);
  pointer-events: none;
}

/* Header & Dynamic App Close Controls */
.btn-header-close-app {
  background: transparent;
  border: 1px solid #444444;
  color: #ffffff;
  padding: 3px 8px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.8rem;
  letter-spacing: -0.01em;
  transition: all 0.15s ease;
  user-select: none;
  flex-shrink: 0;
  box-sizing: border-box;
}

.btn-header-close-app:hover {
  border-color: #ffffff;
  background: #1e1e1e;
  color: #ffffff;
}

.btn-header-close-app:active {
  transform: scale(0.95);
}

.btn-header-close-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
}

.btn-header-close-label {
  line-height: 1;
  text-transform: lowercase;
}

.dynamic-pivot-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-left: 8px;
  border-radius: 50%;
  border: 1px solid #555555;
  color: #cccccc;
  cursor: pointer;
  transition: all 0.15s ease;
  vertical-align: middle;
  flex-shrink: 0;
  box-sizing: border-box;
}

.panorama-dynamic-pivot:hover .dynamic-pivot-close,
.dynamic-pivot-close:hover {
  border-color: #ffffff;
  color: #ffffff;
  background: rgba(255, 255, 255, 0.2);
}

.dynamic-pivot-close:active {
  transform: scale(0.9);
}

/* 10. Desktop Edge Hover Gliders */
.panorama-edge-glider {
  position: fixed;
  top: 50%;
  transform: translateY(-50%);
  width: 38px;
  height: 52px;
  background: rgba(18, 18, 18, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(8px);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 100;
  opacity: 0;
  transition: opacity 0.2s ease, transform 0.2s ease, background 0.2s ease;
  user-select: none;
}

.panorama-edge-glider.glider-left {
  left: 10px;
}

.panorama-edge-glider.glider-right {
  right: 10px;
}

@media (hover: hover) and (min-width: 768px) {
  .panorama-shell-root:hover .panorama-edge-glider:not(.disabled) {
    opacity: 0.35;
  }
  .panorama-edge-glider:hover:not(.disabled) {
    opacity: 1 !important;
    transform: translateY(-50%) scale(1.06);
    background: rgba(28, 28, 28, 0.95);
    border-color: rgba(255, 255, 255, 0.3);
  }
}

.panorama-edge-glider.disabled {
  opacity: 0 !important;
  pointer-events: none !important;
}

@media (max-width: 767px) {
  .panorama-edge-glider {
    display: none !important;
  }
}

/* 11. Metro Bottom App Bar */
.panorama-bottom-app-bar {
  position: relative;
  flex-shrink: 0;
  width: 100%;
  background: #0a0a0a;
  border-top: 1px solid #1c1c1c;
  display: flex;
  flex-direction: column;
  z-index: 900;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.app-bar-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 44px;
  padding: 0 16px;
}

.app-bar-actions {
  display: flex;
  align-items: center;
  gap: 14px;
}

.btn-app-bar-action {
  background: transparent;
  border: none;
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 4px;
  outline: none;
}

.app-bar-icon-circle {
  width: 28px;
  height: 28px;
  border: 1px solid #444444;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.12s ease;
  color: #ffffff;
}

.btn-app-bar-action:hover .app-bar-icon-circle {
  border-color: var(--omni-accent-primary, #00a4ef);
  color: var(--omni-accent-primary, #00a4ef);
}

.btn-app-bar-action:active .app-bar-icon-circle {
  transform: scale(0.92);
}

.btn-app-bar-more {
  background: transparent;
  border: none;
  color: #888888;
  cursor: pointer;
  padding: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.12s ease;
}

.btn-app-bar-more:hover {
  color: #ffffff;
}

.panorama-app-bar-menu {
  position: absolute;
  bottom: calc(44px + env(safe-area-inset-bottom, 0px));
  left: 0;
  right: 0;
  background: #111111;
  border-top: 1px solid #222222;
  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.8);
  display: flex;
  flex-direction: column;
  padding: 6px 0;
  z-index: 901;
  animation: appMenuSlideUp 0.18s cubic-bezier(0.1, 0.9, 0.2, 1);
}

@keyframes appMenuSlideUp {
  0% { opacity: 0; transform: translateY(12px); }
  100% { opacity: 1; transform: translateY(0); }
}

.app-bar-menu-item {
  background: transparent;
  border: none;
  color: #ffffff;
  padding: 10px 20px;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background 0.1s ease;
}

.app-bar-menu-item:hover {
  background: #1e1e1e;
}

/* 12. Skeletons & Empty States */
@keyframes omni-skeleton-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.omni-skeleton-shimmer {
  background: linear-gradient(90deg, #161616 25%, #222222 37%, #161616 63%);
  background-size: 400% 100%;
  animation: omni-skeleton-shimmer 1.4s ease infinite;
}

.panorama-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  gap: 12px;
  border: 1px dashed #262626;
  color: #888888;
}

.panorama-empty-state h4 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 500;
  color: #ffffff;
}

.panorama-empty-state p {
  margin: 0;
  font-size: 0.78rem;
  color: #777777;
  max-width: 280px;
}

/* 13. App Bar Refresh Spin & Metro Toast Notifications */
.btn-app-bar-action.is-refreshing .app-bar-icon-circle svg {
  animation: omni-app-bar-spin 0.6s linear infinite;
}

@keyframes omni-app-bar-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
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
  background: #141414;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 20px;
  padding: 6px 14px;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.75);
  color: #ffffff;
  font-family: inherit;
  font-size: 0.78rem;
  letter-spacing: -0.01em;
  user-select: none;
}

.omni-pull-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: var(--omni-accent-primary, #00a4ef);
  transition: transform 0.05s ease;
}

.omni-pull-to-refresh.ready .omni-pull-indicator-content {
  border-color: var(--omni-accent-primary, #00a4ef);
  background: #1a1a1a;
  color: #ffffff;
}

.omni-pull-to-refresh.is-refreshing .omni-pull-icon svg {
  animation: omni-app-bar-spin 0.6s linear infinite;
}

.panorama-toast-container {
  position: fixed;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 99999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.panorama-toast-notification {
  pointer-events: auto;
  background: #191816;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-left: 4px solid var(--accent-primary, #00a4ef);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  color: #ffffff;
  font-family: inherit;
  font-size: 0.85rem;
  padding: 10px 18px;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 200px;
  max-width: 440px;
  animation: omniToastSlideDown 0.22s cubic-bezier(0.1, 0.9, 0.2, 1) forwards;
}

.panorama-toast-notification.toast-leaving {
  animation: omniToastSlideUp 0.18s cubic-bezier(0.9, 0.1, 1, 0.2) forwards;
}

@keyframes omniToastSlideDown {
  from {
    opacity: 0;
    transform: translateY(-16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes omniToastSlideUp {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(-16px);
  }
}

/* 14. Responsive Mobile Settings & Action Buttons */
.plugin-actions-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
  flex-wrap: wrap;
}

.plugin-actions-row .btn-panorama-action {
  flex: 1;
  min-width: 90px;
  text-align: center;
  justify-content: center;
  padding: 6px 12px;
  height: 32px;
  box-sizing: border-box;
}

.btn-panorama-action {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.plugin-placement-row {
  box-sizing: border-box;
}

.plugin-placement-fields select {
  box-sizing: border-box;
  height: 32px;
}

.default-applications-box {
  box-sizing: border-box;
}

.default-applications-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 10px;
}

.default-app-card {
  box-sizing: border-box;
}

.panorama-installed-plugins-card {
  margin-bottom: 32px;
}

.default-app-select {
  box-sizing: border-box;
  height: 32px;
}

.default-app-select:focus {
  border-color: var(--omni-accent-primary, #00a4ef) !important;
}

@media (max-width: 600px) {
  .panorama-installed-plugins-card {
    margin-bottom: 32px;
  }

  #panorama-section-system {
    padding-bottom: 36px !important;
  }

  #panorama-section-system .panorama-section-content {
    padding-bottom: 24px !important;
  }

  .default-applications-grid {
    grid-template-columns: 1fr !important;
  }

  .plugin-actions-row {
    flex-direction: column;
    width: 100%;
    gap: 8px;
  }

  .plugin-actions-row .btn-panorama-action {
    width: 100%;
    height: 36px;
    font-size: 0.8rem;
    padding: 8px 12px;
  }

  .plugin-placement-fields {
    grid-template-columns: 1fr !important;
  }

  .panorama-plugin-config-header {
    padding: 12px 10px !important;
  }
}
`;
