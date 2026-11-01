export const FEED_CSS = /* css */ `
/* Feed Container */
.feed-container {
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  min-height: 100%;
  box-sizing: border-box;
}

/* Sticky Feed Sub-Header */
.feed-top-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 4px 14px 4px;
  border-bottom: 1px solid var(--omni-border-subtle, var(--border-subtle, #272522));
  background: transparent;
  position: sticky;
  top: 0;
  z-index: 20;
  margin-bottom: 16px;
  flex-wrap: nowrap;
  width: 100%;
  box-sizing: border-box;
}

.feed-title {
  font-family: var(--omni-font-serif, inherit);
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--omni-text-primary, var(--text-primary, #ede8df));
  margin: 0;
}

.feed-thread-page .feed-title,
.feed-search-page .feed-title,
.feed-settings-page .feed-title {
  font-family: var(--omni-font-serif, inherit);
  font-size: 1.15rem;
  font-weight: 500;
  color: var(--omni-text-primary, var(--text-primary, #ede8df));
  margin: 0;
  display: block;
}

.feed-nav-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

/* Feed Tabs: Following vs Global */
.feed-tabs {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: var(--omni-bg-surface, var(--bg-surface, #191816));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #272522));
  padding: 2px;
  border-radius: var(--omni-radius-sm, 6px);
  flex-shrink: 0;
}

.feed-tab-btn {
  background: transparent;
  color: var(--omni-text-muted, var(--text-muted, #78716c));
  border: none;
  border-radius: var(--omni-radius-sm, 4px);
  padding: 4px 12px;
  font-family: var(--omni-font-mono, monospace);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.feed-tab-btn:hover {
  color: var(--omni-text-primary, var(--text-primary, #ede8df));
  background: var(--omni-bg-elevated, var(--bg-subtle, #2a2824));
}

.feed-tab-btn.active {
  background: var(--omni-bg-elevated, var(--bg-subtle, #2a2824));
  color: var(--omni-text-primary, var(--text-primary, #ede8df));
  font-weight: 700;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.feed-header-actions {
  display: inline-flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.btn-refresh-feed,
.btn-search-feed {
  background: var(--omni-bg-surface, var(--bg-surface, #191816));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #272522));
  color: var(--omni-text-secondary, var(--text-secondary, #9e988f));
  font-family: var(--omni-font-mono, monospace);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 6px 10px;
  border-radius: var(--omni-radius-sm, 6px);
  cursor: pointer;
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.btn-settings-feed {
  display: none !important;
}

.btn-refresh-feed:hover,
.btn-search-feed:hover {
  color: var(--omni-text-primary, var(--text-primary, #ede8df));
  border-color: var(--omni-border-strong, var(--border-strong, #383530));
  background: var(--omni-bg-elevated, var(--bg-subtle, #2a2824));
}

.btn-refresh-feed svg,
.btn-search-feed svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.btn-refresh-feed.spinning svg {
  animation: omni-spin 0.8s linear infinite;
}

@keyframes omni-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Feed Composer */
.feed-composer,
.composer-card {
  display: flex;
  gap: 14px;
  padding: 16px 18px;
  background: var(--omni-bg-elevated, var(--bg-surface, #191816));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #272522));
  border-radius: var(--omni-radius-sm, 8px);
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
  width: 38px;
  height: 38px;
  min-width: 38px;
  min-height: 38px;
  max-width: 38px;
  max-height: 38px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-family: var(--omni-font-mono, monospace);
  font-weight: 700;
  font-size: 0.85rem;
  background: var(--omni-accent-primary, #d4a373);
  user-select: none;
  overflow: hidden;
  box-sizing: border-box;
}

.composer-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  display: block;
}

.thread-composer-avatar {
  width: 32px;
  height: 32px;
  min-width: 32px;
  min-height: 32px;
  max-width: 32px;
  max-height: 32px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.thread-composer-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
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
  color: var(--omni-text-primary, var(--text-primary, #ede8df));
  font-family: var(--omni-font-serif, inherit);
  font-size: 1.05rem;
  line-height: 1.55;
  resize: vertical;
  min-height: 54px;
  outline: none;
  padding: 2px 0;
}

.composer-input::placeholder {
  color: var(--omni-text-muted, var(--text-muted, #78716c));
  font-style: italic;
}

.composer-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  border-top: 1px solid var(--omni-border-subtle, var(--border-subtle, #272522));
  padding-top: 10px;
}

.btn-publish {
  background: var(--omni-accent-primary, #d4a373);
  color: var(--omni-accent-contrast, #141312);
  font-family: var(--omni-font-mono, monospace);
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  border: none;
  padding: 6px 16px;
  border-radius: var(--omni-radius-sm, 4px);
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

/* Individual Note Card */
.feed-post,
.note-card {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 14px;
  padding: 16px 18px;
  background: var(--omni-bg-elevated, var(--bg-surface, #191816));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #272522));
  border-radius: var(--omni-radius-sm, 8px);
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
  border-color: var(--omni-border-strong, var(--border-strong, #383530));
}

.feed-post-avatar-col {
  flex-shrink: 0;
  width: 40px;
}

.feed-avatar {
  width: 40px;
  height: 40px;
  min-width: 40px;
  min-height: 40px;
  max-width: 40px;
  max-height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-weight: 700;
  font-size: 0.85rem;
  user-select: none;
  overflow: hidden;
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #272522));
  box-sizing: border-box;
}

.feed-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
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
  font-family: var(--omni-font-serif, inherit);
  font-weight: 600;
  font-size: 1.02rem;
  color: var(--omni-text-primary, var(--text-primary, #ede8df));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feed-author-handle,
.note-meta {
  font-family: var(--omni-font-mono, monospace);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--omni-text-muted, var(--text-muted, #78716c));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-content,
.feed-post-content {
  font-family: var(--omni-font-serif, inherit);
  font-size: 1.05rem;
  line-height: 1.65;
  color: var(--omni-text-primary, var(--text-primary, #ede8df));
  margin: 6px 0 12px 0;
  overflow-wrap: break-word;
  word-break: break-word;
  word-wrap: break-word;
  hyphens: auto;
  white-space: pre-wrap;
  max-width: 100%;
  min-width: 0;
}

.feed-link {
  color: var(--omni-accent-primary, #d4a373);
  text-decoration: underline;
  text-underline-offset: 3px;
  word-break: break-all;
}

/* NIP-21 Mentions & References */
.feed-nostr-entity {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: var(--omni-bg-surface, var(--bg-surface, #191816));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #272522));
  border-radius: var(--omni-radius-sm, 4px);
  padding: 1px 6px;
  font-size: 0.8rem;
  color: var(--omni-accent-primary, #d4a373);
  text-decoration: none;
  cursor: pointer;
  transition: all 0.15s ease;
  vertical-align: baseline;
}

.feed-nostr-entity:hover {
  background: var(--omni-bg-elevated, var(--bg-subtle, #2a2824));
  border-color: var(--omni-accent-primary, #d4a373);
  text-decoration: none;
}

.feed-nostr-entity .nostr-badge-code {
  font-family: var(--omni-font-mono, monospace);
  font-size: 0.76rem;
}

/* NIP-21 / Quote Repost Preview Cards */
.feed-quote-card {
  margin-top: 10px;
  padding: 10px 14px;
  background: var(--omni-bg-surface, var(--bg-surface, #191816));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #272522));
  border-left: 3px solid var(--omni-accent-primary, #d4a373);
  border-radius: var(--omni-radius-sm, 6px);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.feed-quote-card:hover {
  background: var(--omni-bg-elevated, var(--bg-subtle, #2a2824));
  border-color: var(--omni-border-strong, var(--border-strong, #383530));
  border-left-color: var(--omni-accent-primary, #d4a373);
}

.feed-quote-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
  color: var(--omni-text-muted, var(--text-muted, #78716c));
}

.feed-quote-badge {
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--omni-accent-primary, #d4a373);
}

.feed-quote-author {
  font-weight: 600;
  color: var(--omni-text-primary, var(--text-primary, #ede8df));
}

.feed-quote-content {
  font-size: 0.84rem;
  line-height: 1.45;
  color: var(--omni-text-primary, var(--text-primary, #ede8df));
  word-break: break-word;
}

.note-actions,
.feed-post-actions {
  display: flex;
  align-items: center;
  gap: 20px;
  border-top: 1px solid var(--omni-border-subtle, var(--border-subtle, #272522));
  padding-top: 10px;
  margin-top: 4px;
}

.note-action-btn,
.feed-action-btn {
  background: transparent;
  border: none;
  color: var(--omni-text-muted, var(--text-muted, #78716c));
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--omni-font-mono, monospace);
  font-size: 0.72rem;
  cursor: pointer;
  transition: color 0.15s ease;
  padding: 2px 4px;
}

.note-action-btn:hover,
.feed-action-btn:hover {
  color: var(--omni-accent-primary, #d4a373);
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
  background: var(--omni-bg-elevated, var(--bg-surface, #191816));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #272522));
  color: var(--omni-text-secondary, var(--text-secondary, #9e988f));
  font-family: var(--omni-font-mono, monospace);
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 7px 18px;
  border-radius: var(--omni-radius-sm, 6px);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all 0.15s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.btn-feed-back-to-top:hover {
  color: var(--omni-text-primary, var(--text-primary, #ede8df));
  border-color: var(--omni-border-strong, var(--border-strong, #383530));
  background: var(--omni-bg-surface, var(--bg-subtle, #2a2824));
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
.btn-back {
  background: var(--omni-bg-surface, var(--bg-surface, #191816));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #272522));
  color: var(--omni-text-primary, var(--text-primary, #ede8df));
  font-family: var(--omni-font-mono, monospace);
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 6px 14px;
  border-radius: var(--omni-radius-sm, 6px);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s ease;
}

.btn-search-back:hover,
.btn-settings-back:hover,
.btn-thread-back:hover,
.btn-back:hover {
  color: var(--omni-accent-primary, #d4a373);
  border-color: var(--omni-border-strong, var(--border-strong, #383530));
  background: var(--omni-bg-elevated, var(--bg-subtle, #2a2824));
}

.btn-search-back svg,
.btn-settings-back svg,
.btn-thread-back svg,
.btn-back svg {
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
  background: var(--omni-bg-elevated, var(--bg-surface, #191816));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #272522));
  border-radius: var(--omni-radius-sm, 6px);
  color: var(--omni-text-primary, var(--text-primary, #ede8df));
  padding: 8px 14px;
  font-family: var(--omni-font-sans, inherit);
  font-size: 0.88rem;
  outline: none;
}

.feed-search-input:focus {
  border-color: var(--omni-accent-primary, #d4a373);
}

.btn-do-search {
  background: var(--omni-accent-primary, #d4a373);
  color: var(--omni-accent-contrast, #141312);
  border: 1px solid var(--omni-accent-primary, #d4a373);
  border-radius: var(--omni-radius-sm, 6px);
  font-family: var(--omni-font-mono, monospace);
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

@media (max-width: 600px) {
  .feed-top-header {
    padding: 6px 2px 10px 2px;
    gap: 6px;
  }
  .feed-header-actions {
    display: inline-flex;
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }
  .feed-header-actions .btn-label {
    display: none !important;
  }
  .btn-refresh-feed,
  .btn-search-feed,
  .btn-settings-feed {
    padding: 6px;
    min-width: 32px;
    width: 32px;
    height: 32px;
    box-sizing: border-box;
    justify-content: center;
  }
  .feed-tab-btn {
    padding: 4px 8px;
    font-size: 0.65rem;
  }
}
`;
