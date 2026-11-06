import { StudioFileEntry, PublishedAppRecord, BlossomServerConfig, PublisherState } from "../types.js";
import { sha256Hex } from "../crypto/sha256.js";
import {
  unzipArchiveSync,
  createZipArchiveBytes,
  getMimeInfo,
  inlineHtmlBundle
} from "../zip/zip-engine.js";
import { escapeHtml } from "../utils.js";

export const DEFAULT_SERVERS = [
  "https://cdn.satellite.earth",
  "https://blossom.primal.net",
  "https://nostr.download"
];

export const STORAGE_KEY_SERVERS = "omni_publisher_blossom_servers";
export const STORAGE_KEY_PUBLISHED = "omni_publisher_published_apps";
export const STORAGE_KEY_DELETED = "omni_publisher_deleted_apps_v1";

export function loadConfiguredServers(): BlossomServerConfig[] {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(STORAGE_KEY_SERVERS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    }
  } catch {}
  return DEFAULT_SERVERS.map((url) => ({ url, enabled: true, status: "Ready" }));
}

export function saveConfiguredServers(servers: BlossomServerConfig[]): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY_SERVERS, JSON.stringify(servers));
    }
  } catch {}
}

export function cleanPublishedRecord(app: any): PublishedAppRecord {
  return {
    ...app,
    htmlContent: "",
    rawEvent: app.rawEvent ? { ...app.rawEvent, content: "" } : undefined
  };
}

export function loadPublishedApps(): PublishedAppRecord[] {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(STORAGE_KEY_PUBLISHED);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          let needsResave = false;
          const cleaned = parsed.map((app) => {
            if (app && (app.htmlContent || (app.rawEvent && app.rawEvent.content))) {
              needsResave = true;
              return cleanPublishedRecord(app);
            }
            return app;
          });
          if (needsResave) {
            savePublishedApps(cleaned);
          }
          return cleaned;
        }
      }
    }
  } catch {}
  return [];
}

export function savePublishedApps(apps: PublishedAppRecord[]): void {
  try {
    if (typeof localStorage !== "undefined") {
      const cleaned = apps.map(cleanPublishedRecord);
      localStorage.setItem(STORAGE_KEY_PUBLISHED, JSON.stringify(cleaned));
    }
  } catch {}
}

export function loadDeletedAppIds(): Set<string> {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(STORAGE_KEY_DELETED);
      return new Set(raw ? JSON.parse(raw) : []);
    }
  } catch {}
  return new Set();
}

export function saveDeletedAppIds(set: Set<string>): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY_DELETED, JSON.stringify(Array.from(set)));
    }
  } catch {}
}

export function getCurrentRouteView(): string {
  try {
    const win =
      typeof window !== "undefined"
        ? (window as any)
        : typeof globalThis !== "undefined"
          ? (globalThis as any)
          : {};
    const search = win.location?.search || win.__OMNI_SEARCH__ || win.__OMNI_ROUTE__ || "";
    if (search) {
      const qIdx = search.indexOf("?");
      const qs = qIdx !== -1 ? search.slice(qIdx) : search;
      const params = new URLSearchParams(qs);
      const v = params.get("view");
      if (v) return v;
    }
    if (win.__OMNI_VIEW__ && win.__OMNI_VIEW__ !== "main") {
      return String(win.__OMNI_VIEW__);
    }
  } catch {}
  return "main";
}

function getInitialActiveTab(): "create" | "published" | "servers" {
  const v = getCurrentRouteView();
  if (v === "published" || v === "servers") return v;
  return "create";
}

export const publisherStore = {
  activeTab: getInitialActiveTab(),
  servers: loadConfiguredServers(),
  deletedAppIds: loadDeletedAppIds(),
  publishedApps: loadPublishedApps().filter((p) => !loadDeletedAppIds().has(p.id) && !loadDeletedAppIds().has(p.eventId || "")),
  extractedFiles: [] as StudioFileEntry[],
  entryFilePath: "index.html",
  bundledHtmlOutput: "",
  rawEntryHtmlOutput: "",
  appName: "",
  appId: "",
  appVersion: "1.0.0",
  appDescription: "",
  appIcon: "globe",
  appViews: [] as Array<{ id: string; title: string; path: string }>,
  packagingMode: "inlined" as "inlined" | "multifile",
  remoteUrlInputVal: "",
  newServerUrlVal: "",
  statusLogs: [] as string[],
  lastPublishedResult: null as PublishedAppRecord | null,
  uploadProgress: null as { current: number; total: number; label: string } | null,
  isUploading: false,
  updateListeners: [] as Array<() => void>
};

export function onPublisherStoreUpdate(listener: () => void): () => void {
  publisherStore.updateListeners.push(listener);
  return () => {
    const idx = publisherStore.updateListeners.indexOf(listener);
    if (idx !== -1) publisherStore.updateListeners.splice(idx, 1);
  };
}

export function notifyStateChanged(): void {
  for (const listener of publisherStore.updateListeners) {
    try {
      listener();
    } catch (_) {}
  }
}

export function appendLog(msg: string): void {
  publisherStore.statusLogs.push(msg);
  notifyStateChanged();
}

export function getPublisherState(): PublisherState {
  return {
    activeTab: publisherStore.activeTab,
    servers: [...publisherStore.servers],
    publishedApps: [...publisherStore.publishedApps],
    extractedFiles: [...publisherStore.extractedFiles],
    entryFilePath: publisherStore.entryFilePath,
    appName: publisherStore.appName,
    appId: publisherStore.appId,
    appVersion: publisherStore.appVersion,
    appDescription: publisherStore.appDescription,
    appIcon: publisherStore.appIcon,
    packagingMode: publisherStore.packagingMode,
    remoteUrlInputVal: publisherStore.remoteUrlInputVal,
    newServerUrlVal: publisherStore.newServerUrlVal,
    statusLogs: [...publisherStore.statusLogs],
    lastPublishedResult: publisherStore.lastPublishedResult,
    uploadProgress: publisherStore.uploadProgress,
    isUploading: publisherStore.isUploading
  };
}

export function resetPublisherState(initial?: Partial<PublisherState>): void {
  publisherStore.activeTab = initial?.activeTab || "create";
  publisherStore.servers = initial?.servers ? [...initial.servers] : loadConfiguredServers();
  publisherStore.deletedAppIds = loadDeletedAppIds();
  publisherStore.publishedApps = initial?.publishedApps ? [...initial.publishedApps] : loadPublishedApps().filter((p) => !publisherStore.deletedAppIds.has(p.id));
  publisherStore.extractedFiles = initial?.extractedFiles ? [...initial.extractedFiles] : [];
  publisherStore.entryFilePath = initial?.entryFilePath || "index.html";
  publisherStore.bundledHtmlOutput = "";
  publisherStore.rawEntryHtmlOutput = "";
  publisherStore.appName = initial?.appName || "";
  publisherStore.appId = initial?.appId || "";
  publisherStore.appVersion = initial?.appVersion || "1.0.0";
  publisherStore.appDescription = initial?.appDescription || "";
  publisherStore.appIcon = initial?.appIcon || "globe";
  publisherStore.packagingMode = initial?.packagingMode || "inlined";
  publisherStore.remoteUrlInputVal = initial?.remoteUrlInputVal || "";
  publisherStore.newServerUrlVal = initial?.newServerUrlVal || "";
  publisherStore.statusLogs = initial?.statusLogs ? [...initial.statusLogs] : [];
  publisherStore.lastPublishedResult = initial?.lastPublishedResult || null;
  publisherStore.uploadProgress = initial?.uploadProgress || null;
  publisherStore.isUploading = initial?.isUploading || false;
}

export function processZipBytes(zipBytes: Uint8Array, sourceFileName = "plugin.zip"): void {
  publisherStore.statusLogs = [];
  publisherStore.lastPublishedResult = null;
  const rawMap = unzipArchiveSync(zipBytes);
  const rawKeys = Object.keys(rawMap).filter(
    (k) => !k.endsWith("/") && !k.startsWith("__MACOSX/") && !k.endsWith(".DS_Store")
  );

  if (rawKeys.length === 0) {
    appendLog("Error: Archive contains no extractable files.");
    return;
  }

  let prefix = "";
  const slashIdx = rawKeys[0].indexOf("/");
  if (slashIdx !== -1) {
    const candidate = rawKeys[0].slice(0, slashIdx + 1);
    if (rawKeys.every((k) => k.startsWith(candidate))) {
      prefix = candidate;
    }
  }

  const fileEntries: StudioFileEntry[] = [];
  const fileMap = new Map<string, StudioFileEntry>();

  for (const origKey of rawKeys) {
    const normPath = (prefix ? origKey.slice(prefix.length) : origKey).replace(/^\/+/, "");
    if (!normPath) continue;
    const bytes = rawMap[origKey];
    const sha = sha256Hex(bytes);
    const { mime, isText } = getMimeInfo(normPath);
    const textContent = isText ? new TextDecoder().decode(bytes) : undefined;
    const entry: StudioFileEntry = {
      path: normPath,
      bytes,
      size: bytes.byteLength,
      sha256: sha,
      mimeType: mime,
      isText,
      textContent
    };
    fileEntries.push(entry);
    fileMap.set(normPath, entry);
  }

  publisherStore.extractedFiles = fileEntries;

  const candidates = ["index.html", "dist/index.html", "index.htm", "index.js", "dist/index.js"];
  publisherStore.entryFilePath =
    candidates.find((c) => fileMap.has(c)) ||
    fileEntries.find((f) => f.path.endsWith(".html"))?.path ||
    fileEntries[0].path;

  const entryObj = fileMap.get(publisherStore.entryFilePath)!;
  let baseHtml = entryObj.textContent || "";
  if (publisherStore.entryFilePath.endsWith(".js")) {
    baseHtml = `<!DOCTYPE html>\n<html>\n<head><meta charset="UTF-8"><title>${escapeHtml(sourceFileName)}</title></head>\n<body><div id="root"></div><script type="module">\n${baseHtml}\n<` + `/script></body>\n</html>`;
  }

  const manFile =
    fileMap.get("manifest.json") ||
    fileMap.get("manifest.webmanifest") ||
    fileMap.get("omni.manifest.json") ||
    fileMap.get("package.json");

  let detectedName = sourceFileName.replace(/\.(zip|html?|js)$/i, "");
  let detectedId = "";
  let detectedVer = "1.0.0";
  let detectedDesc = "";
  let detectedIcon = "globe";
  let detectedViews: Array<{ id: string; title: string; path: string }> = [];

  if (manFile && manFile.textContent) {
    try {
      const parsed = JSON.parse(manFile.textContent);
      if (parsed.name) detectedName = parsed.name;
      if (parsed.id) detectedId = parsed.id;
      if (parsed.version) detectedVer = parsed.version;
      if (parsed.description) detectedDesc = parsed.description;
      if (parsed.icon) detectedIcon = parsed.icon;
      if (Array.isArray(parsed.views)) {
        detectedViews = parsed.views
          .filter((v: any) => v && typeof v.id === "string")
          .map((v: any) => ({
            id: v.id,
            title: v.title || v.id,
            path: v.path || ""
          }));
      }
    } catch {}
  }

  const titleMatch = baseHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch && (!manFile || !detectedName || detectedName === "starter-template")) {
    detectedName = titleMatch[1].trim();
  }

  const descMatch = baseHtml.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
  if (descMatch && !detectedDesc) {
    detectedDesc = descMatch[1].trim().slice(0, 300);
  }

  const iconMetaMatch =
    baseHtml.match(/<meta\s+name=["'](?:icon|app-icon)["']\s+content=["']([^"']+)["']/i) ||
    baseHtml.match(/<meta\s+content=["']([^"']+)["']\s+name=["'](?:icon|app-icon)["']/i);
  if (iconMetaMatch && (!detectedIcon || detectedIcon === "globe" || detectedIcon === "widgets")) {
    detectedIcon = iconMetaMatch[1].trim();
  }

  publisherStore.appName = detectedName || "Custom Nsite";
  publisherStore.appId =
    detectedId ||
    "org.omni.plugin." +
      publisherStore.appName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
  publisherStore.appVersion = detectedVer;
  publisherStore.appDescription = (detectedDesc || `Packaged nsite (${fileEntries.length} files).`).slice(0, 300);
  publisherStore.appIcon = detectedIcon || "widgets";
  publisherStore.appViews = detectedViews;

  publisherStore.rawEntryHtmlOutput = baseHtml;
  publisherStore.bundledHtmlOutput = inlineHtmlBundle(baseHtml, publisherStore.entryFilePath, fileMap);

  appendLog(`Extracted ${fileEntries.length} file(s) from '${sourceFileName}'. Entry: ${publisherStore.entryFilePath}`);
}

export function processSingleHtmlOrJsFile(bytes: Uint8Array, fileName: string): void {
  const zipBytes = createZipArchiveBytes({
    [fileName.endsWith(".js") ? "index.js" : "index.html"]: bytes
  });
  processZipBytes(zipBytes, fileName);
}
