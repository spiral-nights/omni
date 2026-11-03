import { OmniAction, OmniComponentNode } from "@omni/types";
import {
  publisherStore,
  saveConfiguredServers,
  appendLog,
  processZipBytes,
  processSingleHtmlOrJsFile
} from "../state/publisher-store.js";
import { buildStarterPluginZip } from "../zip/zip-engine.js";
import {
  syncPublishedFromRelays,
  handleRemoteUrlInput,
  executePublishWorkflow,
  deletePublishedApp,
  publishBlossomServerList
} from "../blossom/blossom-uploader.js";
import { getPublisherSchema } from "./publisher-schema.js";

export async function handlePublisherAction(
  action: OmniAction,
  payload?: any
): Promise<OmniComponentNode> {
  const name = action.name;

  // Capture input fields from payload
  if (payload?.appName !== undefined) publisherStore.appName = String(payload.appName);
  if (payload?.appId !== undefined) publisherStore.appId = String(payload.appId);
  if (payload?.appVersion !== undefined) publisherStore.appVersion = String(payload.appVersion);
  if (payload?.appDescription !== undefined) publisherStore.appDescription = String(payload.appDescription);
  if (payload?.arbitraryUrl !== undefined) publisherStore.remoteUrlInputVal = String(payload.arbitraryUrl);
  if (payload?.newServerUrl !== undefined) publisherStore.newServerUrlVal = String(payload.newServerUrl);

  switch (name) {
    case "switch-tab":
      publisherStore.activeTab = payload?.tab || payload?.id || "create";
      try {
        if (typeof window !== "undefined" && window.history && typeof window.history.pushState === "function") {
          window.history.pushState({ tab: publisherStore.activeTab }, "", `?tab=${publisherStore.activeTab}`);
        }
      } catch (_) {}
      if (publisherStore.activeTab === "published") {
        syncPublishedFromRelays().catch(() => {});
      }
      break;

    case "file-selected": {
      const bytes = payload?.fileBytes;
      const fileName = payload?.fileName || payload?.value || "plugin.zip";
      if (bytes instanceof Uint8Array || (bytes && typeof bytes.byteLength === "number")) {
        const u8 = new Uint8Array(bytes.buffer || bytes, bytes.byteOffset || 0, bytes.byteLength);
        if (fileName.toLowerCase().endsWith(".zip") || (u8.length > 4 && u8[0] === 0x50 && u8[1] === 0x4b)) {
          processZipBytes(u8, fileName);
        } else {
          processSingleHtmlOrJsFile(u8, fileName);
        }
      }
      break;
    }

    case "load-starter": {
      const starterZip = buildStarterPluginZip();
      processZipBytes(starterZip, "pomodoro-focus-studio.zip");
      break;
    }

    case "fetch-url":
      await handleRemoteUrlInput(publisherStore.remoteUrlInputVal, false);
      break;

    case "install-url":
      await handleRemoteUrlInput(publisherStore.remoteUrlInputVal, true);
      break;

    case "set-packaging-mode":
      publisherStore.packagingMode = payload?.mode === "multifile" ? "multifile" : "inlined";
      break;

    case "install-local":
      await executePublishWorkflow(true);
      break;

    case "publish-blossom":
      await executePublishWorkflow(false);
      break;

    case "copy-naddr": {
      const targetNaddr = payload?.naddr || (publisherStore.lastPublishedResult ? publisherStore.lastPublishedResult.naddr : "");
      if (targetNaddr) {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(targetNaddr);
            appendLog(`Copied naddr to clipboard: ${targetNaddr.slice(0, 16)}...`);
          } catch {}
        }
      }
      break;
    }

    case "open-naddr": {
      const targetNaddr = payload?.naddr || (publisherStore.lastPublishedResult ? publisherStore.lastPublishedResult.naddr : "");
      if (targetNaddr && typeof window !== "undefined") {
        try {
          window.open(`nostr:${targetNaddr}`);
        } catch {}
      }
      break;
    }

    case "open-studio": {
      if (typeof window !== "undefined") {
        try {
          window.open("?view=main");
        } catch {}
      }
      break;
    }

    case "refresh-published":
      await syncPublishedFromRelays();
      break;

    case "prepare-update": {
      publisherStore.activeTab = "create";
      if (payload?.appId) publisherStore.appId = payload.appId;
      if (payload?.appName) publisherStore.appName = payload.appName;
      if (payload?.appDescription) publisherStore.appDescription = payload.appDescription;
      const verParts = (payload?.appVersion || publisherStore.appVersion || "1.0.0").split(".");
      if (verParts.length === 3) {
        publisherStore.appVersion = `${verParts[0]}.${verParts[1]}.${parseInt(verParts[2], 10) + 1}`;
      }
      break;
    }

    case "delete-app": {
      const targetId = payload?.appId || payload?.id;
      const target = publisherStore.publishedApps.find((a) => a.id === targetId);
      if (target) {
        await deletePublishedApp(target);
      }
      break;
    }

    case "publish-servers-list":
      await publishBlossomServerList();
      break;

    case "add-server": {
      let raw = (publisherStore.newServerUrlVal || payload?.newServerUrl || "").trim();
      if (raw) {
        if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
          raw = `https://${raw}`;
        }
        raw = raw.replace(/\/+$/, "");
        if (!publisherStore.servers.some((s) => s.url === raw)) {
          publisherStore.servers.push({ url: raw, enabled: true, status: "Added" });
          saveConfiguredServers(publisherStore.servers);
          publisherStore.newServerUrlVal = "";
        }
      }
      break;
    }

    case "toggle-server": {
      const srvUrl = payload?.url;
      const srv = publisherStore.servers.find((s) => s.url === srvUrl);
      if (srv) {
        srv.enabled = !srv.enabled;
        saveConfiguredServers(publisherStore.servers);
      }
      break;
    }

    case "remove-server": {
      const srvUrl = payload?.url;
      publisherStore.servers = publisherStore.servers.filter((s) => s.url !== srvUrl);
      saveConfiguredServers(publisherStore.servers);
      break;
    }
  }

  return getPublisherSchema();
}
