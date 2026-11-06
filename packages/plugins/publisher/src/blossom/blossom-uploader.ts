import { StudioFileEntry, PublishedAppRecord } from "../types.js";
import { sha256Hex } from "../crypto/sha256.js";
import { encodeNaddr } from "../crypto/bech32.js";
import { createBlossomAuthEventDraft, encodeBlossomAuthHeader, uint8ToBase64 } from "@omni/types";
import { escapeHtml } from "../utils.js";
import {
  publisherStore,
  appendLog,
  notifyStateChanged,
  saveDeletedAppIds,
  savePublishedApps,
  saveConfiguredServers,
  cleanPublishedRecord,
  processZipBytes,
  processSingleHtmlOrJsFile
} from "../state/publisher-store.js";

export const PUBLISHER_CATALOG_D_TAG = "plugin-publisher/catalog/v1";
const DEFAULT_BOOTSTRAP_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.ditto.pub"
];

let activeSyncWs: WebSocket | null = null;
let activeSyncCleanupTimer: any = null;

export async function publishCatalogToRelays(): Promise<void> {
  try {
    const nostr =
      typeof window !== "undefined"
        ? (window as any).nostr
        : typeof globalThis !== "undefined"
          ? (globalThis as any).nostr
          : undefined;
    if (!nostr || typeof nostr.signEvent !== "function") return;

    const catalogPayload = {
      version: 1,
      updatedAt: Date.now(),
      publishedApps: publisherStore.publishedApps
        .filter((p) => p.packagingMode !== "local")
        .map(cleanPublishedRecord),
      deletedAppIds: Array.from(publisherStore.deletedAppIds)
    };

    const draft = {
      kind: 30078,
      content: JSON.stringify(catalogPayload),
      tags: [["d", PUBLISHER_CATALOG_D_TAG]],
      created_at: Math.floor(Date.now() / 1000)
    };

    const signed = await nostr.signEvent(draft);
    await new Promise<void>((resolve) => {
      try {
        const ws = new WebSocket("wss://relay.damus.io");
        const timer = setTimeout(() => {
          try { ws.close(); } catch {}
          resolve();
        }, 800);
        ws.onopen = () => {
          ws.send(JSON.stringify(["EVENT", signed]));
        };
        ws.onmessage = () => {
          clearTimeout(timer);
          try { ws.close(); } catch {}
          resolve();
        };
        ws.onerror = () => {
          clearTimeout(timer);
          resolve();
        };
      } catch {
        resolve();
      }
    });
  } catch {}
}

export async function handleRemoteUrlInput(rawTarget: string, autoInstall = true): Promise<void> {
  const trimmed = (rawTarget || "").trim();
  if (!trimmed) {
    appendLog("Please enter an arbitrary .zip URL, web app URL, or NIP-5A naddr1 address.");
    return;
  }

  if (trimmed.startsWith("naddr1") || trimmed.startsWith("nostr:naddr1")) {
    const cleanNaddr = trimmed.replace(/^nostr:/i, "");
    appendLog(`Opening NIP-5A address in Omni: nostr:${cleanNaddr}`);
    try {
      if (typeof window !== "undefined") {
        window.open(`nostr:${cleanNaddr}`);
      }
    } catch {}
    return;
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    appendLog("Error: URL must start with https://, http://, or naddr1...");
    return;
  }

  const cleanUrlPath = trimmed.split("?")[0].split("#")[0];
  const urlFileName = cleanUrlPath.split("/").pop() || "remote-plugin.html";

  try {
    appendLog(`Fetching remote plugin from ${trimmed}...`);
    const fetchFn = (typeof window !== "undefined" && typeof window.fetch === "function") ? window.fetch.bind(window) : fetch;
    const res = await fetchFn(trimmed);
    const contentType = res.headers?.get?.("content-type") || "";
    const ab = await res.arrayBuffer();
    const bytes = new Uint8Array(ab);

    const isZip =
      cleanUrlPath.toLowerCase().endsWith(".zip") ||
      contentType.toLowerCase().includes("application/zip") ||
      (bytes.byteLength >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b);

    if (isZip) {
      processZipBytes(bytes, urlFileName.endsWith(".zip") ? urlFileName : `${urlFileName}.zip`);
    } else {
      const text = new TextDecoder().decode(bytes);
      const baseHref = trimmed.endsWith("/") ? trimmed : trimmed.replace(/\/[^/]*$/, "/");
      let htmlWithBase = text;
      if (text.trim().startsWith("<") || /<html[\s>]/i.test(text)) {
        if (!/<base\s/i.test(htmlWithBase)) {
          if (/<head[^>]*>/i.test(htmlWithBase)) {
            htmlWithBase = htmlWithBase.replace(/<head[^>]*>/i, (m) => `${m}\n  <base href="${baseHref}">`);
          } else {
            htmlWithBase = `<head><base href="${baseHref}"></head>\n${htmlWithBase}`;
          }
        }
      }
      processSingleHtmlOrJsFile(
        new TextEncoder().encode(htmlWithBase),
        urlFileName.endsWith(".js") ? urlFileName : "index.html"
      );
    }

    if (autoInstall) {
      await executePublishWorkflow(true);
    }
  } catch (err: any) {
    let hostTitle = "Remote Web App";
    try {
      const parsedUrl = new URL(trimmed);
      hostTitle = parsedUrl.hostname.replace(/^www\./, "");
    } catch {}
    const fallbackHtml = `<!DOCTYPE html>
<html>
<head>
  <base href="${escapeHtml(trimmed)}">
  <title>${escapeHtml(hostTitle)}</title>
</head>
<body>
  <div style="padding: 16px; background: var(--omni-bg-surface, #191816); border: 1px solid var(--omni-border-subtle, #2e2b26); border-radius: 8px; color: var(--omni-text-primary, #ede8df);">
    <h3 style="margin: 0 0 6px 0; font-size: 0.95rem;">${escapeHtml(hostTitle)}</h3>
    <p style="margin: 0 0 10px 0; font-size: 0.8rem; color: var(--omni-text-secondary, #9e988f);">Remote URL: <code>${escapeHtml(trimmed)}</code></p>
    <a href="${escapeHtml(trimmed)}" target="_blank" rel="noopener noreferrer" style="color: var(--omni-accent-primary, #d4a373); font-size: 0.82rem;">Open External Application</a>
  </div>
</body>
</html>`;
    processSingleHtmlOrJsFile(new TextEncoder().encode(fallbackHtml), `${hostTitle}.html`);
    if (autoInstall) {
      await executePublishWorkflow(true);
    }
  }
}

export async function syncPublishedFromRelays(): Promise<void> {
  try {
    const nostr =
      typeof window !== "undefined"
        ? (window as any).nostr
        : typeof globalThis !== "undefined"
          ? (globalThis as any).nostr
          : undefined;
    if (!nostr || typeof nostr.getPublicKey !== "function") return;
    const myPubkey = await nostr.getPublicKey();
    if (!myPubkey) return;

    if (activeSyncCleanupTimer) {
      clearTimeout(activeSyncCleanupTimer);
      activeSyncCleanupTimer = null;
    }
    if (activeSyncWs) {
      try {
        activeSyncWs.close();
      } catch {}
      activeSyncWs = null;
    }

    const seenRemoteCatalogIds = new Set<string>();
    let catalogBackfillScheduled = false;

    const scheduleCatalogBackfillIfNeeded = () => {
      if (catalogBackfillScheduled) return;
      const localShareable = publisherStore.publishedApps.filter(
        (p) => p.packagingMode !== "local" && (!p.pubkey || p.pubkey === myPubkey)
      );
      if (localShareable.some((p) => !seenRemoteCatalogIds.has(p.id))) {
        catalogBackfillScheduled = true;
        publishCatalogToRelays().catch(() => {});
      }
    };

    await new Promise<void>((resolve) => {
      let resolved = false;
      const finishInitialWait = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      const initialTimer = setTimeout(finishInitialWait, 450);

      try {
        const ws = new WebSocket("wss://relay.damus.io");
        activeSyncWs = ws;
        const subId = `pub-studio-${Date.now()}`;

        // Keep subscription open for 12s in background so newly-connecting or slower relays stream events
        activeSyncCleanupTimer = setTimeout(() => {
          scheduleCatalogBackfillIfNeeded();
          try {
            if (activeSyncWs === ws) {
              ws.send(JSON.stringify(["CLOSE", subId]));
              ws.close();
              activeSyncWs = null;
            }
          } catch {}
          finishInitialWait();
        }, 12000);

        ws.onopen = () => {
          ws.send(
            JSON.stringify([
              "REQ",
              subId,
              { kinds: [5, 35129, 10063, 30078], authors: [myPubkey], limit: 100 }
            ])
          );
        };

        ws.onmessage = (ev) => {
          try {
            const frame = JSON.parse(ev.data);
            if (frame[0] === "EVENT" && frame[2]) {
              const event = frame[2];
              if (event.kind === 5 && Array.isArray(event.tags)) {
                let updated = false;
                for (const t of event.tags) {
                  if (t[0] === "a" && t[1]?.startsWith("35129:")) {
                    const parts = t[1].split(":");
                    if (parts.length >= 3) {
                      const deletedId = parts.slice(2).join(":");
                      if (!publisherStore.deletedAppIds.has(deletedId)) {
                        publisherStore.deletedAppIds.add(deletedId);
                        updated = true;
                      }
                    }
                  }
                  if (t[0] === "e" && t[1]) {
                    if (!publisherStore.deletedAppIds.has(t[1])) {
                      publisherStore.deletedAppIds.add(t[1]);
                      updated = true;
                    }
                  }
                }
                if (updated) {
                  saveDeletedAppIds(publisherStore.deletedAppIds);
                  publisherStore.publishedApps = publisherStore.publishedApps.filter(
                    (p) => !publisherStore.deletedAppIds.has(p.id) && !publisherStore.deletedAppIds.has(p.eventId || "")
                  );
                  savePublishedApps(publisherStore.publishedApps);
                  notifyStateChanged();
                }
              } else if (event.kind === 10063 && Array.isArray(event.tags)) {
                const relayServers = event.tags
                  .filter((t: string[]) => t[0] === "server" && t[1])
                  .map((t: string[]) => t[1]);
                if (relayServers.length > 0) {
                  let changed = false;
                  for (const sUrl of relayServers) {
                    if (!publisherStore.servers.some((s) => s.url === sUrl)) {
                      publisherStore.servers.push({ url: sUrl, enabled: true, status: "Synced (kind: 10063)" });
                      changed = true;
                    }
                  }
                  if (changed) {
                    saveConfiguredServers(publisherStore.servers);
                    notifyStateChanged();
                  }
                }
              } else if (event.kind === 30078 && Array.isArray(event.tags)) {
                const dTag = event.tags.find((t: string[]) => t[0] === "d")?.[1];
                if (dTag === PUBLISHER_CATALOG_D_TAG && event.content) {
                  try {
                    const parsed = JSON.parse(event.content);
                    let changed = false;
                    if (Array.isArray(parsed.deletedAppIds)) {
                      for (const delId of parsed.deletedAppIds) {
                        if (typeof delId === "string" && !publisherStore.deletedAppIds.has(delId)) {
                          publisherStore.deletedAppIds.add(delId);
                          changed = true;
                        }
                      }
                      if (changed) {
                        saveDeletedAppIds(publisherStore.deletedAppIds);
                        publisherStore.publishedApps = publisherStore.publishedApps.filter(
                          (p) => !publisherStore.deletedAppIds.has(p.id) && !publisherStore.deletedAppIds.has(p.eventId || "")
                        );
                      }
                    }
                    if (Array.isArray(parsed.publishedApps)) {
                      for (const item of parsed.publishedApps) {
                        if (!item || !item.id) continue;
                        seenRemoteCatalogIds.add(item.id);
                        if (publisherStore.deletedAppIds.has(item.id) || (item.eventId && publisherStore.deletedAppIds.has(item.eventId))) {
                          continue;
                        }
                        const naddr =
                          item.naddr ||
                          encodeNaddr({
                            identifier: item.id,
                            pubkey: item.pubkey || event.pubkey,
                            kind: 35129,
                            relays: DEFAULT_BOOTSTRAP_RELAYS
                          });
                        const record: PublishedAppRecord = cleanPublishedRecord({
                          ...item,
                          naddr,
                          pubkey: item.pubkey || event.pubkey,
                          createdAt: item.createdAt || event.created_at * 1000
                        });
                        const existingIdx = publisherStore.publishedApps.findIndex((a) => a.id === record.id);
                        if (existingIdx === -1) {
                          publisherStore.publishedApps.push(record);
                          changed = true;
                        } else if ((record.createdAt || 0) >= (publisherStore.publishedApps[existingIdx].createdAt || 0)) {
                          publisherStore.publishedApps[existingIdx] = record;
                          changed = true;
                        }
                      }
                    }
                    if (changed) {
                      publisherStore.publishedApps.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                      savePublishedApps(publisherStore.publishedApps);
                      notifyStateChanged();
                    }
                  } catch {}
                }
              } else if (event.kind === 35129 && Array.isArray(event.tags)) {
                const dTag = event.tags.find((t: string[]) => t[0] === "d")?.[1] || event.id;
                seenRemoteCatalogIds.add(dTag);
                if (publisherStore.deletedAppIds.has(dTag) || publisherStore.deletedAppIds.has(event.id)) {
                  return;
                }
                const nameTag = event.tags.find((t: string[]) => t[0] === "name" || t[0] === "title")?.[1] || dTag;
                const verTag = event.tags.find((t: string[]) => t[0] === "version")?.[1] || "1.0.0";
                const descTag = event.tags.find((t: string[]) => t[0] === "description")?.[1] || "";
                const iconTag = event.tags.find((t: string[]) => t[0] === "icon" || t[0] === "image")?.[1] || "widgets";
                const fTags = event.tags
                  .filter((t: string[]) => t[0] === "f" && t.length >= 3)
                  .map((t: string[]) => ({ path: t[1], sha256: t[2], mimeType: t[3] || "text/html" }));
                const serverTags = event.tags.filter((t: string[]) => t[0] === "server" && t[1]).map((t: string[]) => t[1]);
                const naddr = encodeNaddr({
                  identifier: dTag,
                  pubkey: event.pubkey,
                  kind: 35129,
                  relays: DEFAULT_BOOTSTRAP_RELAYS
                });

                const existingIdx = publisherStore.publishedApps.findIndex((a) => a.id === dTag);
                const record: PublishedAppRecord = {
                  id: dTag,
                  name: nameTag,
                  version: verTag,
                  description: descTag,
                  icon: iconTag,
                  naddr,
                  eventId: event.id,
                  pubkey: event.pubkey,
                  createdAt: event.created_at * 1000,
                  packagingMode: fTags.length > 1 ? "multifile" : "inlined",
                  fileCount: fTags.length || 1,
                  files: fTags,
                  servers: serverTags,
                  rawEvent: { ...event, content: "" },
                  htmlContent: ""
                };

                if (existingIdx === -1) {
                  publisherStore.publishedApps.unshift(record);
                  savePublishedApps(publisherStore.publishedApps);
                  notifyStateChanged();
                } else if (event.created_at * 1000 >= publisherStore.publishedApps[existingIdx].createdAt) {
                  publisherStore.publishedApps[existingIdx] = record;
                  savePublishedApps(publisherStore.publishedApps);
                  notifyStateChanged();
                }
              }
            } else if (frame[0] === "EOSE") {
              clearTimeout(initialTimer);
              finishInitialWait();
              setTimeout(scheduleCatalogBackfillIfNeeded, 1500);
            }
          } catch {}
        };

        ws.onerror = () => {
          clearTimeout(initialTimer);
          finishInitialWait();
        };
      } catch {
        clearTimeout(initialTimer);
        finishInitialWait();
      }
    });
  } catch {}
}

export async function deletePublishedApp(app: PublishedAppRecord): Promise<void> {
  publisherStore.deletedAppIds.add(app.id);
  if (app.eventId) publisherStore.deletedAppIds.add(app.eventId);
  saveDeletedAppIds(publisherStore.deletedAppIds);

  publisherStore.publishedApps = publisherStore.publishedApps.filter((p) => p.id !== app.id);
  savePublishedApps(publisherStore.publishedApps);
  notifyStateChanged();

  const nostr = typeof window !== "undefined" ? (window as any).nostr : (typeof globalThis !== "undefined" ? (globalThis as any).nostr : undefined);

  if (nostr && typeof nostr.signEvent === "function") {
    try {
      const myPubkey = await nostr.getPublicKey();
      const deleteDraft = {
        kind: 5,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["a", `35129:${app.pubkey || myPubkey}:${app.id}`],
          ["k", "35129"],
          ...(app.eventId ? [["e", app.eventId]] : [])
        ],
        content: `Deleted app ${app.name || app.id}`
      };
      const signedDelete = await nostr.signEvent(deleteDraft);

      await new Promise<void>((resolve) => {
        try {
          const ws = new WebSocket("wss://relay.damus.io");
          const timer = setTimeout(() => resolve(), 800);
          ws.onopen = () => {
            ws.send(JSON.stringify(["EVENT", signedDelete]));
          };
          ws.onmessage = () => {
            clearTimeout(timer);
            ws.close();
            resolve();
          };
          ws.onerror = () => {
            clearTimeout(timer);
            resolve();
          };
        } catch {
          resolve();
        }
      });
      await publishCatalogToRelays();
      appendLog(`Published NIP-09 deletion request (kind: 5) for ${app.id} to Nostr relays.`);
    } catch (err: any) {
      appendLog(`Warning: Failed to publish kind: 5 deletion event: ${err?.message || err}`);
    }
  }

  if (nostr && Array.isArray(app.servers) && app.servers.length > 0 && Array.isArray(app.files) && app.files.length > 0) {
    for (const srv of app.servers) {
      const cleanSrv = srv.replace(/\/+$/, "");
      for (const file of app.files) {
        try {
          const authDraft = createBlossomAuthEventDraft(file.sha256, undefined, "delete");
          const signedAuth = await nostr.signEvent(authDraft);
          const authHeader = encodeBlossomAuthHeader(signedAuth);
          if (typeof fetch === "function") {
            const resp = await fetch(`${cleanSrv}/${file.sha256}`, {
              method: "DELETE",
              headers: { Authorization: authHeader }
            });
            if (resp.ok) {
              appendLog(`Deleted blob ${file.sha256.slice(0, 10)}... from Blossom ${cleanSrv}`);
            }
          }
        } catch (_) {}
      }
    }
  }
}

export async function executePublishWorkflow(skipBlossom = false): Promise<void> {
  if (publisherStore.extractedFiles.length === 0) {
    appendLog("Please select or drop a .zip or .html file first.");
    return;
  }

  publisherStore.statusLogs = [];
  publisherStore.isUploading = true;
  publisherStore.uploadProgress = { current: 0, total: 100, label: "Preparing package..." };
  notifyStateChanged();

  const nostr = typeof window !== "undefined" ? (window as any).nostr : (typeof globalThis !== "undefined" ? (globalThis as any).nostr : undefined);
  if (!nostr || typeof nostr.signEvent !== "function") {
    appendLog("Error: NIP-07 window.nostr signer is not available.");
    publisherStore.isUploading = false;
    publisherStore.uploadProgress = null;
    notifyStateChanged();
    return;
  }

  const activeServers = skipBlossom ? [] : publisherStore.servers.filter((s) => s.enabled).map((s) => s.url);
  const cleanId = (publisherStore.appId || "custom-nsite").trim();
  const cleanName = (publisherStore.appName || "Custom Nsite").trim();
  const cleanVer = (publisherStore.appVersion || "1.0.0").trim();
  const cleanDesc = (publisherStore.appDescription || "").trim();

  const filesToUpload: StudioFileEntry[] =
    publisherStore.packagingMode === "inlined"
      ? [
          {
            path: "index.html",
            bytes: new TextEncoder().encode(publisherStore.bundledHtmlOutput),
            size: new TextEncoder().encode(publisherStore.bundledHtmlOutput).byteLength,
            sha256: sha256Hex(new TextEncoder().encode(publisherStore.bundledHtmlOutput)),
            mimeType: "text/html",
            isText: true,
            textContent: publisherStore.bundledHtmlOutput
          }
        ]
      : publisherStore.extractedFiles;

  let anyBlossomUploadSucceeded = false;

  if (!skipBlossom && activeServers.length > 0) {
    appendLog(
      `Uploading ${filesToUpload.length} file(s) in '${publisherStore.packagingMode === "inlined" ? "Single-File Inlined" : "Multi-File Blossom"}' mode to ${activeServers.length} Blossom server(s)...`
    );

    let uploadedCount = 0;
    for (const file of filesToUpload) {
      publisherStore.uploadProgress = {
        current: Math.round((uploadedCount / filesToUpload.length) * 80),
        total: 100,
        label: `Uploading ${file.path} (${uploadedCount + 1}/${filesToUpload.length})...`
      };
      notifyStateChanged();

      const authDraft = createBlossomAuthEventDraft(file.sha256, file.path, "upload");
      let authHeader = "";
      try {
        const signedAuth = await nostr.signEvent(authDraft);
        authHeader = encodeBlossomAuthHeader(signedAuth);
      } catch (err: any) {
        appendLog(`Warning: Could not sign BUD-06 auth event for ${file.path}: ${err?.message || err}`);
      }

      for (const srv of activeServers) {
        const cleanSrv = srv.replace(/\/+$/, "");
        try {
          if (typeof fetch === "function") {
            const resp = await fetch(`${cleanSrv}/upload`, {
              method: "PUT",
              headers: {
                "Content-Type": file.mimeType,
                ...(authHeader ? { Authorization: authHeader } : {}),
                "X-SHA-256": file.sha256
              },
              body: file.bytes as any
            });
            if (resp.ok) {
              anyBlossomUploadSucceeded = true;
              appendLog(`Uploaded ${file.path} (${file.sha256.slice(0, 10)}...) -> ${cleanSrv}`);
            } else {
              appendLog(`Blossom server ${cleanSrv} returned HTTP ${resp.status} for ${file.path} (recorded hash in NIP-5A tags).`);
            }
          }
        } catch {
          appendLog(`Blossom server ${cleanSrv} unreachable from sandbox (hash ${file.sha256.slice(0, 10)}... recorded in NIP-5A event).`);
        }
      }
      uploadedCount++;
    }
  } else {
    appendLog("Packaging for direct Nostr & local 0ms store installation (Blossom upload skipped)...");
  }

  publisherStore.uploadProgress = { current: 85, total: 100, label: "Signing NIP-5A event..." };
  notifyStateChanged();

  const viewTags: string[][] =
    publisherStore.appViews.length > 0
      ? publisherStore.appViews.map((v) => ["view", v.id, v.title, v.path])
      : [
          ["view", "main", cleanName, ""],
          ["view", "widget", `${cleanName} Widget`, "?view=widget"],
          ["view", "settings", `${cleanName} Settings`, "?view=settings"]
        ];

  const tags: string[][] = [
    ["d", cleanId],
    ["name", cleanName],
    ["version", cleanVer],
    ["description", cleanDesc],
    ["icon", publisherStore.appIcon || "globe"],
    ...viewTags
  ];

  for (const f of filesToUpload) {
    tags.push(["f", f.path, f.sha256, f.mimeType]);
  }
  for (const s of activeServers) {
    tags.push(["server", s.replace(/\/+$/, "")]);
  }

  // Keep event payload compact (<16KB) when hosted on Blossom so public Nostr relays never reject oversized events
  const shouldOmitInlineContentForRelays =
    !skipBlossom &&
    activeServers.length > 0 &&
    (publisherStore.packagingMode === "multifile" ||
      (anyBlossomUploadSucceeded && publisherStore.bundledHtmlOutput.length > 16000));

  const nsiteDraft = {
    kind: 35129,
    content: shouldOmitInlineContentForRelays ? "" : publisherStore.bundledHtmlOutput,
    tags,
    created_at: Math.floor(Date.now() / 1000)
  };

  try {
    const signedEvent = await nostr.signEvent(nsiteDraft);

    const naddr = encodeNaddr({
      identifier: cleanId,
      pubkey: signedEvent.pubkey,
      kind: 35129,
      relays: skipBlossom ? [] : DEFAULT_BOOTSTRAP_RELAYS
    });

    const record: PublishedAppRecord = {
      id: cleanId,
      name: cleanName,
      version: cleanVer,
      description: cleanDesc,
      icon: publisherStore.appIcon || "widgets",
      naddr,
      eventId: signedEvent.id,
      pubkey: signedEvent.pubkey,
      createdAt: signedEvent.created_at * 1000,
      packagingMode: skipBlossom ? "local" : publisherStore.packagingMode,
      fileCount: filesToUpload.length,
      files: filesToUpload.map((f) => ({ path: f.path, sha256: f.sha256, mimeType: f.mimeType })),
      servers: activeServers,
      rawEvent: { ...signedEvent, content: "" },
      htmlContent: ""
    };

    publisherStore.deletedAppIds.delete(cleanId);
    saveDeletedAppIds(publisherStore.deletedAppIds);

    const existingIdx = publisherStore.publishedApps.findIndex((p) => p.id === cleanId);
    if (existingIdx !== -1) {
      publisherStore.publishedApps[existingIdx] = record;
    } else {
      publisherStore.publishedApps.unshift(record);
    }
    savePublishedApps(publisherStore.publishedApps);
    publisherStore.lastPublishedResult = record;

    appendLog(`Signed & published NIP-5A event (kind: 35129, id: ${signedEvent.id.slice(0, 12)}...).`);
    appendLog(`Ready! Address: ${naddr}`);

    await new Promise<void>((resolve) => {
      try {
        const ws = new WebSocket(skipBlossom ? "ws://local" : "wss://relay.damus.io");
        const timer = setTimeout(() => resolve(), 1200);
        ws.onopen = () => {
          ws.send(JSON.stringify(["EVENT", signedEvent]));
        };
        ws.onmessage = () => {
          clearTimeout(timer);
          ws.close();
          resolve();
        };
        ws.onerror = () => {
          clearTimeout(timer);
          resolve();
        };
      } catch {
        resolve();
      }
    });

    if (skipBlossom) {
      appendLog(`Saved to local 0ms store only (not broadcasted to remote relays).`);
      try {
        if (typeof window !== "undefined") {
          window.open(`nostr:${naddr}`);
        }
      } catch {}
    } else {
      await publishCatalogToRelays();
      appendLog(`Broadcasted to connected Nostr relays.`);
    }
  } catch (err: any) {
    appendLog(`Failed to sign/publish NIP-5A event: ${err?.message || String(err)}`);
  } finally {
    publisherStore.isUploading = false;
    publisherStore.uploadProgress = null;
    notifyStateChanged();
  }
}

export async function publishBlossomServerList(): Promise<void> {
  try {
    const nostr = typeof window !== "undefined" ? (window as any).nostr : (typeof globalThis !== "undefined" ? (globalThis as any).nostr : undefined);
    if (!nostr || typeof nostr.signEvent !== "function") return;
    const activeUrls = publisherStore.servers.filter((s) => s.enabled).map((s) => s.url.replace(/\/+$/, ""));
    const draft = {
      kind: 10063,
      content: "",
      tags: activeUrls.map((u) => ["server", u]),
      created_at: Math.floor(Date.now() / 1000)
    };
    const signed = await nostr.signEvent(draft);
    const ws = new WebSocket("wss://relay.damus.io");
    ws.onopen = () => {
      ws.send(JSON.stringify(["EVENT", signed]));
      setTimeout(() => ws.close(), 300);
    };
    publisherStore.servers = publisherStore.servers.map((s) => ({ ...s, status: s.enabled ? "Published (kind: 10063)" : "Disabled" }));
    saveConfiguredServers(publisherStore.servers);
    notifyStateChanged();
  } catch {}
}
