/**
 * @omni/plugin-publisher — Plugin Studio & Nsite Blossom Uploader
 * 100% Standard Web & Nostr Application (Zero Proprietary SDKs).
 * Pure declarative Schema UI for sandboxed Light DOM custom elements.
 */

import type { OmniComponentNode } from "@omni/types";
import {
  buildStarterPluginZip,
  unzipArchiveSync,
  createZipArchiveBytes
} from "./zip/zip-engine.js";
import {
  getPublisherState,
  resetPublisherState,
  getCurrentRouteView,
  onPublisherStoreUpdate,
  publisherStore
} from "./state/publisher-store.js";
import { syncPublishedFromRelays } from "./blossom/blossom-uploader.js";
import { getPublisherSchema, getPublisherWidgetSchema } from "./schema/publisher-schema.js";
import { handlePublisherAction } from "./schema/action-handler.js";

export function dispatchPublisherSchema(schema: OmniComponentNode | null): void {
  if (!schema || typeof window === "undefined") return;
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: "omni:schema", componentId: "main", schema }, "*");
  } else {
    window.postMessage({ type: "omni:schema", componentId: "main", schema }, "*");
  }
}

onPublisherStoreUpdate(() => {
  dispatchPublisherSchema(getPublisherSchema());
});

// Auto-Init & Event Listeners (Schema UI Mode)
if (typeof window !== "undefined") {
  window.addEventListener("omni:action", async (event: any) => {
    const detail = event.detail || event;
    if (detail?.__fromSchemaBus) return;
    const action = detail.action;
    const payload = detail.payload;
    if (action) {
      const next = await handlePublisherAction(action, payload);
      dispatchPublisherSchema(next);
    }
  });

  window.addEventListener("message", async (event: MessageEvent) => {
    const data = event.data;
    if (data && (data.type === "omni:action" || data.type === "action") && data.action) {
      const next = await handlePublisherAction(data.action, data.payload);
      dispatchPublisherSchema(next);
    }
  });

  window.addEventListener("popstate", (event: PopStateEvent) => {
    const tab = event?.state?.tab;
    if (tab) {
      publisherStore.activeTab = tab;
      dispatchPublisherSchema(getPublisherSchema(publisherStore.activeTab));
    }
  });

  (async () => {
    await syncPublishedFromRelays().catch(() => {});
    const view = getCurrentRouteView();
    if (view === "widget" || view === "compact") {
      dispatchPublisherSchema(getPublisherWidgetSchema());
    } else {
      dispatchPublisherSchema(getPublisherSchema());
    }
  })();
}

export {
  buildStarterPluginZip,
  unzipArchiveSync,
  createZipArchiveBytes,
  getPublisherSchema,
  getPublisherWidgetSchema,
  handlePublisherAction,
  getPublisherState,
  resetPublisherState
};
