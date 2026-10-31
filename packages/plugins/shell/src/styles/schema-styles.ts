/**
 * Omni Schema Component Styles (Warm Paper Dark Design Tokens)
 * Styles for <omni-box>, <omni-card>, <omni-button>, <omni-input>, <omni-list>, etc.
 */

export const SCHEMA_COMPONENT_STYLES = /* css */ `
/* Viewport Slot Container Layout */
.omni-comp-main {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.omni-comp-main > omni-box {
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
}

/* 1. Box Primitive */
omni-box {
  display: flex;
  box-sizing: border-box;
}
omni-box[direction="column"] {
  flex-direction: column;
}
omni-box[direction="row"] {
  flex-direction: row;
}
omni-box[wrap] {
  flex-wrap: wrap;
}
omni-box[gap="xs"] { gap: 4px; }
omni-box[gap="sm"] { gap: 8px; }
omni-box[gap="md"] { gap: 14px; }
omni-box[gap="lg"] { gap: 20px; }
omni-box[align="start"] { align-items: flex-start; }
omni-box[align="center"] { align-items: center; }
omni-box[align="end"] { align-items: flex-end; }
omni-box[align="stretch"] { align-items: stretch; }
omni-box[justify="start"] { justify-content: flex-start; }
omni-box[justify="center"] { justify-content: center; }
omni-box[justify="between"] { justify-content: space-between; }
omni-box[justify="end"] { justify-content: flex-end; }
omni-box[padding="xs"] { padding: 4px; }
omni-box[padding="sm"] { padding: 8px; }
omni-box[padding="md"] { padding: 16px; }
omni-box[padding="lg"] { padding: 24px; }

/* 2. Card Primitive */
omni-card {
  display: flex;
  flex-direction: column;
  background: var(--omni-bg-elevated, #22201d);
  border: 1px solid var(--omni-border-subtle, #272522);
  border-radius: var(--omni-radius-md, 10px);
  padding: 16px 18px;
  box-sizing: border-box;
  color: var(--omni-text-primary, #ede8df);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  width: 100%;
  transition: border-color 0.15s ease;
}
omni-card:hover {
  border-color: var(--omni-border-strong, #383530);
}
.omni-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--omni-border-subtle, #272522);
}
.omni-card-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--omni-accent-primary, #d4a373);
}
.omni-card-titles {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.omni-card-title {
  margin: 0;
  font-family: var(--omni-font-serif, inherit);
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--omni-text-primary, #ede8df);
}
.omni-card-subtitle {
  margin: 2px 0 0 0;
  font-size: 0.78rem;
  color: var(--omni-text-muted, #78716c);
}
.omni-card-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
}
.omni-card-footer {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid var(--omni-border-subtle, #272522);
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 3. Divider & Spacer */
omni-divider {
  display: block;
  background: var(--omni-border-subtle, #272522);
}
omni-divider[orientation="horizontal"] {
  height: 1px;
  width: 100%;
  margin: 10px 0;
}
omni-divider[orientation="vertical"] {
  width: 1px;
  height: 100%;
  margin: 0 10px;
}
omni-spacer[size="xs"] { height: 4px; width: 4px; }
omni-spacer[size="sm"] { height: 8px; width: 8px; }
omni-spacer[size="md"] { height: 16px; width: 16px; }
omni-spacer[size="lg"] { height: 24px; width: 24px; }
omni-spacer[size="xl"] { height: 36px; width: 36px; }

/* 4. Typography & Status */
omni-text {
  display: block;
  color: var(--omni-text-primary, #ede8df);
  font-size: 0.88rem;
  line-height: 1.45;
}
omni-text[variant="title"] {
  font-size: 1.15rem;
  font-weight: 600;
  font-family: var(--omni-font-serif, inherit);
}
omni-text[variant="subtitle"] {
  font-size: 0.95rem;
  font-weight: 500;
}
omni-text[variant="caption"] {
  font-size: 0.75rem;
}
omni-text[variant="mono"] {
  font-family: var(--omni-font-mono, monospace);
  font-size: 0.8rem;
}
omni-text[tone="secondary"] { color: var(--omni-text-secondary, #9e988f); }
omni-text[tone="muted"] { color: var(--omni-text-muted, #78716c); }
omni-text[tone="accent"] { color: var(--omni-accent-primary, #d4a373); }
omni-text[tone="error"] { color: #e06c75; }
omni-text[tone="success"] { color: #98c379; }
omni-text[truncate] {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

omni-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 0.72rem;
  font-weight: 500;
  line-height: 1.2;
  background: var(--omni-bg-surface, #191816);
  border: 1px solid var(--omni-border-subtle, #272522);
  color: var(--omni-text-secondary, #9e988f);
}
omni-badge[tone="success"] {
  background: rgba(152, 195, 121, 0.12);
  border-color: rgba(152, 195, 121, 0.3);
  color: #98c379;
}
omni-badge[tone="warning"] {
  background: rgba(229, 192, 123, 0.12);
  border-color: rgba(229, 192, 123, 0.3);
  color: #e5c07b;
}
omni-badge[tone="error"] {
  background: rgba(224, 108, 117, 0.12);
  border-color: rgba(224, 108, 117, 0.3);
  color: #e06c75;
}
omni-badge[tone="accent"] {
  background: rgba(212, 163, 115, 0.15);
  border-color: rgba(212, 163, 115, 0.35);
  color: var(--omni-accent-primary, #d4a373);
}
.omni-badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

omni-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.omni-metric-value {
  font-family: var(--omni-font-mono, monospace);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--omni-text-primary, #ede8df);
  line-height: 1.1;
}
.omni-metric-label {
  font-size: 0.76rem;
  color: var(--omni-text-muted, #78716c);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.omni-metric-subtext {
  font-size: 0.72rem;
  color: var(--omni-text-secondary, #9e988f);
}

/* 4b. Avatar & Icon Primitives */
omni-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  box-sizing: border-box;
  background: var(--omni-bg-surface, #191816);
  border: 1px solid var(--omni-border-subtle, #272522);
}
omni-avatar svg {
  width: 100%;
  height: 100%;
  display: block;
  border-radius: 50%;
}
omni-avatar[size="xs"] { width: 22px; height: 22px; font-size: 0.65rem; }
omni-avatar[size="sm"] { width: 28px; height: 28px; font-size: 0.75rem; }
omni-avatar[size="md"], omni-avatar:not([size]) { width: 38px; height: 38px; font-size: 0.9rem; }
omni-avatar[size="lg"] { width: 52px; height: 52px; font-size: 1.25rem; }
omni-avatar[size="xl"] { width: 72px; height: 72px; font-size: 1.6rem; }

.omni-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: 50%;
}

.omni-avatar-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--omni-bg-elevated, #2a2824);
  color: var(--omni-accent-primary, #d4a373);
  font-family: var(--omni-font-mono, monospace);
  font-weight: 700;
  text-transform: uppercase;
  user-select: none;
  border-radius: 50%;
}

omni-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: currentColor;
  flex-shrink: 0;
}

/* 5. Controls: Buttons, Inputs, Toggles */
omni-button {
  display: inline-block;
}
.omni-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: var(--omni-accent-primary, #d4a373);
  color: #141312;
  border: none;
  border-radius: var(--omni-radius-sm, 6px);
  padding: 7px 14px;
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.1s ease;
}
.omni-button:hover:not(:disabled) {
  opacity: 0.9;
}
.omni-button:active:not(:disabled) {
  transform: scale(0.98);
}
.omni-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.omni-button[variant="secondary"] {
  background: var(--omni-bg-surface, #191816);
  color: var(--omni-text-primary, #ede8df);
  border: 1px solid var(--omni-border-subtle, #383530);
}
.omni-button[variant="secondary"]:hover:not(:disabled) {
  border-color: var(--omni-accent-primary, #d4a373);
}
.omni-button[variant="ghost"] {
  background: transparent;
  color: var(--omni-text-secondary, #9e988f);
  border: none;
}
.omni-button[variant="ghost"]:hover:not(:disabled) {
  color: var(--omni-text-primary, #ede8df);
  background: rgba(255, 255, 255, 0.05);
}
.omni-button[variant="danger"] {
  background: rgba(224, 108, 117, 0.15);
  color: #e06c75;
  border: 1px solid rgba(224, 108, 117, 0.3);
}

omni-icon-button {
  display: inline-flex;
}
.omni-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--omni-text-muted, #78716c);
  padding: 6px;
  border-radius: var(--omni-radius-sm, 6px);
  cursor: pointer;
  transition: color 0.15s ease, background-color 0.15s ease;
}
.omni-icon-button:hover:not(:disabled) {
  color: var(--omni-text-primary, #ede8df);
  background: rgba(255, 255, 255, 0.05);
}
.omni-icon-button[variant="danger"]:hover:not(:disabled) {
  color: #e06c75;
  background: rgba(224, 108, 117, 0.15);
}

omni-input {
  display: flex;
  width: 100%;
}
.omni-input {
  width: 100%;
  background: var(--omni-bg-surface, #191816);
  border: 1px solid var(--omni-border-subtle, #383530);
  border-radius: var(--omni-radius-sm, 6px);
  color: var(--omni-text-primary, #ede8df);
  font-family: inherit;
  font-size: 0.88rem;
  padding: 8px 12px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s ease;
}
.omni-input:focus {
  border-color: var(--omni-accent-primary, #d4a373);
}
.omni-input[type="file"] {
  cursor: pointer;
  padding: 6px 10px;
}
.omni-input[type="file"]::file-selector-button {
  background: var(--omni-bg-card, #22201d);
  color: var(--omni-text-primary, #ede8df);
  border: 1px solid var(--omni-border-strong, #3d3933);
  padding: 4px 10px;
  border-radius: var(--omni-radius-sm, 4px);
  margin-right: 10px;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.8rem;
  transition: border-color 0.15s ease;
}
.omni-input[type="file"]::file-selector-button:hover {
  border-color: var(--omni-accent-primary, #d4a373);
}

omni-textarea {
  display: flex;
  width: 100%;
}
.omni-textarea {
  width: 100%;
  min-height: 80px;
  background: var(--omni-bg-surface, #191816);
  border: 1px solid var(--omni-border-subtle, #383530);
  border-radius: var(--omni-radius-sm, 6px);
  color: var(--omni-text-primary, #ede8df);
  font-family: inherit;
  font-size: 0.88rem;
  padding: 10px 12px;
  outline: none;
  resize: vertical;
  box-sizing: border-box;
  transition: border-color 0.15s ease;
}
.omni-textarea:focus {
  border-color: var(--omni-accent-primary, #d4a373);
}

omni-toggle {
  display: inline-flex;
}
.omni-toggle-container {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}
.omni-toggle-checkbox {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
.omni-toggle-track {
  width: 34px;
  height: 18px;
  background: var(--omni-bg-surface, #191816);
  border: 1px solid var(--omni-border-subtle, #383530);
  border-radius: 9999px;
  position: relative;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}
.omni-toggle-track::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  background: var(--omni-text-muted, #78716c);
  border-radius: 50%;
  transition: transform 0.2s ease, background-color 0.2s ease;
}
.omni-toggle-checkbox:checked + .omni-toggle-track {
  background: rgba(212, 163, 115, 0.2);
  border-color: var(--omni-accent-primary, #d4a373);
}
.omni-toggle-checkbox:checked + .omni-toggle-track::after {
  transform: translateX(16px);
  background: var(--omni-accent-primary, #d4a373);
}
.omni-toggle-label {
  font-size: 0.85rem;
  color: var(--omni-text-primary, #ede8df);
}

/* Select Dropdown */
omni-select {
  display: flex;
  width: 100%;
}
.omni-select {
  width: 100%;
  background: var(--omni-bg-surface, #191816);
  border: 1px solid var(--omni-border-subtle, #383530);
  border-radius: var(--omni-radius-sm, 6px);
  color: var(--omni-text-primary, #ede8df);
  font-family: inherit;
  font-size: 0.88rem;
  padding: 8px 12px;
  outline: none;
  cursor: pointer;
  box-sizing: border-box;
  transition: border-color 0.15s ease;
}
.omni-select:focus {
  border-color: var(--omni-accent-primary, #d4a373);
}

/* Tabs */
omni-tabs {
  display: flex;
  width: 100%;
}
.omni-tabs-nav {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid var(--omni-border-subtle, #272522);
  width: 100%;
  padding-bottom: 4px;
}
.omni-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 6px 12px;
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--omni-text-secondary, #9e988f);
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.omni-tab-btn:hover {
  color: var(--omni-text-primary, #ede8df);
}
.omni-tab-btn.active {
  color: var(--omni-accent-primary, #d4a373);
  border-bottom-color: var(--omni-accent-primary, #d4a373);
}
.omni-tab-badge {
  font-size: 0.7rem;
  font-family: var(--omni-font-mono, monospace);
  padding: 1px 6px;
  border-radius: 9999px;
  background: var(--omni-bg-surface, #191816);
  color: var(--omni-text-muted, #78716c);
}

/* Status Indicator */
omni-status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.omni-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}
.omni-status-online {
  background: #98c379;
  box-shadow: 0 0 6px rgba(152, 195, 121, 0.4);
}
.omni-status-connecting {
  background: var(--omni-accent-primary, #d4a373);
  box-shadow: 0 0 6px rgba(212, 163, 115, 0.4);
}
.omni-status-offline {
  background: var(--omni-text-muted, #78716c);
}
.omni-status-error {
  background: #e06c75;
  box-shadow: 0 0 6px rgba(224, 108, 117, 0.4);
}
.omni-pulse {
  animation: omni-pulse-glow 1.8s infinite ease-in-out;
}
@keyframes omni-pulse-glow {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.55; transform: scale(1.15); }
}
.omni-status-label {
  font-size: 0.8rem;
  color: var(--omni-text-secondary, #9e988f);
}

/* Code Block */
omni-code-block {
  display: block;
  position: relative;
  width: 100%;
}
.omni-code-pre {
  background: var(--omni-bg-canvas, #141312);
  border: 1px solid var(--omni-border-subtle, #272522);
  border-radius: var(--omni-radius-sm, 6px);
  padding: 12px 14px;
  margin: 0;
  overflow-x: auto;
  font-family: var(--omni-font-mono, monospace);
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--omni-text-primary, #ede8df);
}
.omni-code-copy-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  background: var(--omni-bg-surface, #191816);
  border: 1px solid var(--omni-border-subtle, #383530);
  border-radius: 4px;
  color: var(--omni-text-muted, #78716c);
  padding: 4px 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.omni-code-copy-btn:hover {
  color: var(--omni-accent-primary, #d4a373);
  border-color: var(--omni-accent-primary, #d4a373);
}

/* Progress */
omni-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}
.omni-progress-track {
  width: 100%;
  height: 6px;
  background: var(--omni-bg-surface, #191816);
  border-radius: 9999px;
  overflow: hidden;
}
.omni-progress-bar {
  height: 100%;
  background: var(--omni-accent-primary, #d4a373);
  border-radius: 9999px;
  transition: width 0.3s ease;
}
.omni-progress-label {
  font-size: 0.78rem;
  color: var(--omni-text-muted, #78716c);
  font-family: var(--omni-font-mono, monospace);
}

/* Banner / Alert */
omni-banner {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border-radius: var(--omni-radius-sm, 6px);
  border: 1px solid var(--omni-border-subtle, #272522);
  background: var(--omni-bg-surface, #191816);
  color: var(--omni-text-primary, #ede8df);
  box-sizing: border-box;
  width: 100%;
}
.omni-banner-info {
  border-left: 3px solid var(--omni-accent-primary, #d4a373);
}
.omni-banner-success {
  border-left: 3px solid #98c379;
}
.omni-banner-warning {
  border-left: 3px solid #e5c07b;
}
.omni-banner-error {
  border-left: 3px solid #e06c75;
}
.omni-banner-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding-top: 1px;
}
.omni-banner-info .omni-banner-icon { color: var(--omni-accent-primary, #d4a373); }
.omni-banner-success .omni-banner-icon { color: #98c379; }
.omni-banner-warning .omni-banner-icon { color: #e5c07b; }
.omni-banner-error .omni-banner-icon { color: #e06c75; }
.omni-banner-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.omni-banner-title {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--omni-text-primary, #ede8df);
}
.omni-banner-message {
  font-size: 0.82rem;
  line-height: 1.4;
  color: var(--omni-text-secondary, #9e988f);
}
.omni-banner-action-btn {
  background: transparent;
  border: 1px solid var(--omni-border-subtle, #383530);
  border-radius: 4px;
  color: var(--omni-text-primary, #ede8df);
  font-size: 0.78rem;
  font-weight: 600;
  padding: 4px 10px;
  cursor: pointer;
  transition: border-color 0.15s ease;
  white-space: nowrap;
}
.omni-banner-action-btn:hover {
  border-color: var(--omni-accent-primary, #d4a373);
}
.omni-banner-dismiss-btn {
  background: transparent;
  border: none;
  color: var(--omni-text-muted, #78716c);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s ease;
}
.omni-banner-dismiss-btn:hover {
  color: var(--omni-text-primary, #ede8df);
}

/* 6. Collections & Lists */
omni-list {
  display: flex;
  flex-direction: column;
  width: 100%;
}
.omni-list-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}
omni-list-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--omni-radius-sm, 6px);
  background: var(--omni-bg-surface, #191816);
  border: 1px solid var(--omni-border-subtle, #272522);
  transition: background-color 0.15s ease, border-color 0.15s ease;
}
omni-list-item[clickable] {
  cursor: pointer;
}
omni-list-item[clickable]:hover {
  background: rgba(255, 255, 255, 0.03);
  border-color: var(--omni-border-strong, #383530);
}
.omni-list-item-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  flex-shrink: 0;
  color: var(--omni-text-secondary, #9e988f);
  background: var(--omni-bg-card, #22201d);
  overflow: hidden;
  border: 1px solid var(--omni-border-subtle, #272522);
}
.omni-list-item-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  display: block;
}
.omni-list-item-checkbox {
  cursor: pointer;
  accent-color: var(--omni-accent-primary, #d4a373);
  width: 16px;
  height: 16px;
  margin: 0;
}
.omni-list-item-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.omni-list-item-title {
  font-size: 0.85rem;
  color: var(--omni-text-primary, #ede8df);
}
omni-list-item[checked] .omni-list-item-title {
  text-decoration: line-through;
  color: var(--omni-text-muted, #78716c);
}
.omni-list-item-subtitle {
  font-size: 0.75rem;
  color: var(--omni-text-muted, #78716c);
}
.omni-list-item-meta {
  font-family: var(--omni-font-mono, monospace);
  font-size: 0.7rem;
  color: var(--omni-text-muted, #78716c);
}
.omni-list-item-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.omni-list-sentinel {
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 7. Spinner */
.omni-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: omni-spin 0.6s linear infinite;
  display: inline-block;
}
@keyframes omni-spin {
  to { transform: rotate(360deg); }
}
`;
