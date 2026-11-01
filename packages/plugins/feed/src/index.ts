/// <reference types="@omni/types" />
import type { OmniAction, OmniComponentNode } from "@omni/types";

// Public Types
export type {
  FeedNoteItem,
  FeedSchemaState,
  DecodedNostrEntity,
  ParsedSearchQuery
} from "./types.js";

// Bech32 / Nostr Entity Helpers
export {
  bech32Decode,
  wordsToBytes,
  bytesToHex,
  decodeNostrEntity,
  extractQuotedNoteId
} from "./format/bech32.js";

// Content Formatting & Query Helpers
export {
  formatContent,
  isNostrIdentifier,
  parseSearchQuery
} from "./format/content.js";

// Filtering & Moderation Engine
export {
  DEFAULT_FILTER_PATTERNS,
  STORAGE_KEY_FEED_FILTERS,
  loadFilterPatterns,
  saveFilterPatterns,
  compileFilterRegex,
  isContentFiltered
} from "./filter/content-filter.js";

// Settings & Preferences
export {
  STORAGE_KEY_FEED_INLINE_IMAGES,
  loadInlineImagesPreference,
  saveInlineImagesPreference,
  renderFilterSettings,
  mountFeedSettings
} from "./filter/filter-settings.js";

// Route Detection Helpers
export {
  getAppRoute,
  isSearchRoute,
  isSettingsRoute,
  isWidgetRoute,
  isCompactRoute,
  isSchemaRoute,
  isIframeRoute
} from "./routes.js";

// Profile Metadata Resolution
export { extractDisplayName } from "./net/profiles.js";

// Declarative Schema UI & Action Handlers
export { getFeedSchema } from "./schema/feed-schema.js";
export { handleFeedAction } from "./schema/actions.js";

// Legacy DOM Fallback
export { mountFeed } from "./legacy/dom-feed.js";

// Internal Runtime Imports
import { isSchemaRoute, isSettingsRoute, isSearchRoute, isWidgetRoute, isCompactRoute } from "./routes.js";
import { getFeedSchema } from "./schema/feed-schema.js";
import { handleFeedAction } from "./schema/actions.js";
import { mountFeed } from "./legacy/dom-feed.js";
import { mountFeedSettings } from "./filter/filter-settings.js";
import { initFeedSchemaSocket } from "./net/relay-client.js";

// ── Window Schema Runtime Event Bus ──────────────────────────────────────────

if (typeof window !== "undefined") {
  const getFeedView = () => (isWidgetRoute() ? "widget" : isCompactRoute() ? "compact" : "main");

  const dispatchFeedSchema = (schema: OmniComponentNode) => {
    const view = getFeedView();
    const compId = view === "widget" ? "widget" : "main";
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "omni:schema", componentId: compId, schema }, "*");
    } else {
      window.postMessage({ type: "omni:schema", componentId: compId, schema }, "*");
    }
  };

  const onActionMsg = (action: OmniAction, payload?: Record<string, unknown>) => {
    if (!action) return;
    const nextSchema = handleFeedAction(action, payload);
    dispatchFeedSchema(nextSchema);
  };

  const checkPendingActiveNote = () => {
    try {
      const savedNoteId = localStorage.getItem("omni_active_note_id");
      if (savedNoteId) {
        localStorage.removeItem("omni_active_note_id");
        let noteData: any = null;
        try {
          const raw = localStorage.getItem("omni_active_note_data");
          if (raw) {
            noteData = JSON.parse(raw);
            localStorage.removeItem("omni_active_note_data");
          }
        } catch (_) {}
        onActionMsg({ name: "view-thread", payload: { id: savedNoteId, note: noteData } });
      }
    } catch (_) {}
  };

  const handleIntent = (detail: any) => {
    if (!detail) return;
    const action = detail.action || detail.effectiveAction;
    const data = detail.data;
    if (action === "view_note" || action === "view-note") {
      const noteId = data?.eventId || data?.id;
      if (noteId) {
        onActionMsg({ name: "view-thread", payload: { id: noteId, note: data?.note } });
      }
    }
  };

  window.addEventListener("omni:intent", (e: any) => handleIntent(e.detail));
  window.addEventListener("intent", (e: any) => handleIntent(e.detail));

  window.addEventListener("omni:action", (event: any) => {
    const detail = event.detail;
    if (detail?.action) {
      onActionMsg(detail.action, detail.payload);
    }
  });

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data) return;

    if (data.type === "omni:init" && isSchemaRoute()) {
      initFeedSchemaSocket();
      checkPendingActiveNote();
      dispatchFeedSchema(getFeedSchema(getFeedView()));
      return;
    }

    if (
      (data.type === "omni:action" || data.type === "action") &&
      data.action
    ) {
      onActionMsg(data.action, data.payload);
    }
  });

  window.addEventListener("storage", (e) => {
    if (e.key === "omni_active_note_id") {
      checkPendingActiveNote();
    } else if (e.key === "omni_feed_inline_images") {
      dispatchFeedSchema(getFeedSchema(getFeedView()));
    }
  });

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        checkPendingActiveNote();
      }
    });
  }

  if (isSchemaRoute()) {
    initFeedSchemaSocket();
    checkPendingActiveNote();
    dispatchFeedSchema(getFeedSchema(getFeedView()));
  }
}

// ── Fallback DOM Auto-mount (when running in isolated iframe or test mode) ─────

function init() {
  if (typeof document !== "undefined") {
    const root = document.body;
    if (isSchemaRoute()) {
      return;
    }
    if (isSettingsRoute()) {
      mountFeedSettings(root);
    } else {
      const feed = mountFeed(root);
      if (isSearchRoute()) {
        feed.showSearchPage();
      }
    }
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
