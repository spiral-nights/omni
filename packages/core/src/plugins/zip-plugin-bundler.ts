import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/curves/abstract/utils";
import { NostrEvent, PluginViewDeclaration, UnsignedEvent } from "@omni/types";
import { NostrPluginResolver } from "./nostr-plugin-resolver.js";

export const BLOSSOM_AUTH_KIND = 24242;
export const BLOSSOM_SERVER_LIST_KIND = 10063;

export interface ExtractedPluginFile {
  path: string;
  bytes: Uint8Array;
  size: number;
  sha256: string;
  mimeType: string;
  isText: boolean;
  textContent?: string;
}

export interface InferredPluginMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  icon: string;
  views: PluginViewDeclaration[];
  handledIntents: string[];
}

export interface ExtractedPluginArchive {
  files: ExtractedPluginFile[];
  entryFile: string;
  inferredMeta: InferredPluginMetadata;
  /** Self-contained HTML with relative CSS, JS, and assets inlined (Option A) */
  bundledHtml: string;
  /** Entry HTML/script with relative paths optionally mapped to Blossom URLs (Option B) */
  multiFileEntryHtml: string;
  blossomHashes: Record<string, string>;
}

export interface BlossomUploadResult {
  path: string;
  sha256: string;
  mimeType: string;
  size: number;
  server: string;
  url: string;
  uploaded: boolean;
  error?: string;
}

const MIME_MAP: Record<string, { mime: string; isText: boolean }> = {
  ".html": { mime: "text/html", isText: true },
  ".htm": { mime: "text/html", isText: true },
  ".js": { mime: "application/javascript", isText: true },
  ".mjs": { mime: "application/javascript", isText: true },
  ".cjs": { mime: "application/javascript", isText: true },
  ".css": { mime: "text/css", isText: true },
  ".json": { mime: "application/json", isText: true },
  ".webmanifest": { mime: "application/manifest+json", isText: true },
  ".svg": { mime: "image/svg+xml", isText: true },
  ".txt": { mime: "text/plain", isText: true },
  ".md": { mime: "text/markdown", isText: true },
  ".png": { mime: "image/png", isText: false },
  ".jpg": { mime: "image/jpeg", isText: false },
  ".jpeg": { mime: "image/jpeg", isText: false },
  ".gif": { mime: "image/gif", isText: false },
  ".webp": { mime: "image/webp", isText: false },
  ".ico": { mime: "image/x-icon", isText: false },
  ".woff": { mime: "font/woff", isText: false },
  ".woff2": { mime: "font/woff2", isText: false },
  ".ttf": { mime: "font/ttf", isText: false },
  ".wasm": { mime: "application/wasm", isText: false }
};

export function detectMimeType(filePath: string): { mime: string; isText: boolean } {
  const lower = filePath.toLowerCase();
  const dotIdx = lower.lastIndexOf(".");
  if (dotIdx !== -1) {
    const ext = lower.slice(dotIdx);
    if (MIME_MAP[ext]) {
      return MIME_MAP[ext];
    }
  }
  return { mime: "application/octet-stream", isText: false };
}

export function uint8ToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function utf8ToBase64(str: string): string {
  return uint8ToBase64(strToU8(str));
}

export function slugifyPluginId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/\.zip$|\.html?$|\.js$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `nsite-${Date.now()}`;
}

/**
 * Normalizes a relative asset path against a base directory path.
 */
export function resolveRelativeArchivePath(baseFilePath: string, relativeRef: string): string {
  const cleanRef = relativeRef.split("?")[0].split("#")[0].trim();
  if (!cleanRef || /^(https?:|data:|blob:|nostr:|mailto:|javascript:|\/\/)/i.test(cleanRef)) {
    return "";
  }
  const baseParts = baseFilePath.split("/").slice(0, -1);
  const relParts = cleanRef.replace(/^\/+/, "").split("/");
  const stack = cleanRef.startsWith("/") ? [] : [...baseParts];

  for (const part of relParts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  return stack.join("/");
}

/**
 * Inlines CSS (<link rel="stylesheet">), JS (<script src="...">), and images (<img src="...">)
 * from a map of extracted files into a single standalone HTML document.
 */
export function inlineAssetsIntoHtml(
  htmlContent: string,
  entryPath: string,
  fileMap: Map<string, ExtractedPluginFile>
): string {
  let result = htmlContent;

  const lookupFile = (rawRef: string): ExtractedPluginFile | undefined => {
    const resolved = resolveRelativeArchivePath(entryPath, rawRef);
    if (!resolved) return undefined;
    return (
      fileMap.get(resolved) ||
      fileMap.get(rawRef.replace(/^\.\//, "").replace(/^\/+/, ""))
    );
  };

  // 1. Inline <link rel="stylesheet" href="...">
  result = result.replace(
    /<link\b([^>]*?)>/gi,
    (fullMatch, attrs: string) => {
      const isStylesheet = /rel\s*=\s*["']stylesheet["']/i.test(attrs);
      if (!isStylesheet) return fullMatch;
      const hrefMatch = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
      if (!hrefMatch) return fullMatch;
      const targetFile = lookupFile(hrefMatch[1]);
      if (targetFile && targetFile.textContent !== undefined) {
        return `<style data-inlined-from="${targetFile.path}">\n${targetFile.textContent}\n</style>`;
      }
      return fullMatch;
    }
  );

  // 2. Inline <script src="..."></script>
  result = result.replace(
    /<script\b([^>]*?)>\s*<\/script>/gi,
    (fullMatch, attrs: string) => {
      const srcMatch = attrs.match(/src\s*=\s*["']([^"']+)["']/i);
      if (!srcMatch) return fullMatch;
      const targetFile = lookupFile(srcMatch[1]);
      if (targetFile && targetFile.textContent !== undefined) {
        const isModule = /type\s*=\s*["']module["']/i.test(attrs);
        const typeAttr = isModule ? ` type="module"` : "";
        return `<script${typeAttr} data-inlined-from="${targetFile.path}">\n${targetFile.textContent}\n</script>`;
      }
      return fullMatch;
    }
  );

  // 3. Inline relative <img src="..."> as Data URIs
  result = result.replace(
    /<img\b([^>]*?)>/gi,
    (fullMatch, attrs: string) => {
      const srcMatch = attrs.match(/src\s*=\s*["']([^"']+)["']/i);
      if (!srcMatch) return fullMatch;
      const targetFile = lookupFile(srcMatch[1]);
      if (targetFile) {
        const b64 = uint8ToBase64(targetFile.bytes);
        const dataUri = `data:${targetFile.mimeType};base64,${b64}`;
        const updatedAttrs = attrs.replace(
          /src\s*=\s*["']([^"']+)["']/i,
          `src="${dataUri}"`
        );
        return `<img${updatedAttrs}>`;
      }
      return fullMatch;
    }
  );

  return result;
}

/**
 * Rewrites relative CSS, JS, and image references in HTML to Blossom content-addressed URLs
 * (`https://<blossomServer>/<sha256>`).
 */
export function rewriteHtmlRelativeUrlsToBlossom(
  htmlContent: string,
  entryPath: string,
  fileMap: Map<string, ExtractedPluginFile>,
  blossomServer: string
): string {
  const cleanServer = blossomServer.replace(/\/+$/, "");
  let result = htmlContent;

  const lookupFile = (rawRef: string): ExtractedPluginFile | undefined => {
    const resolved = resolveRelativeArchivePath(entryPath, rawRef);
    if (!resolved) return undefined;
    return (
      fileMap.get(resolved) ||
      fileMap.get(rawRef.replace(/^\.\//, "").replace(/^\/+/, ""))
    );
  };

  result = result.replace(
    /(<link\b[^>]*?href\s*=\s*["'])([^"']+)(["'][^>]*?>)/gi,
    (fullMatch, prefix, href, suffix) => {
      if (/rel\s*=\s*["']alternate["']/i.test(fullMatch)) return fullMatch;
      const f = lookupFile(href);
      if (f) return `${prefix}${cleanServer}/${f.sha256}${suffix}`;
      return fullMatch;
    }
  );

  result = result.replace(
    /(<script\b[^>]*?src\s*=\s*["'])([^"']+)(["'][^>]*?>)/gi,
    (fullMatch, prefix, src, suffix) => {
      const f = lookupFile(src);
      if (f) return `${prefix}${cleanServer}/${f.sha256}${suffix}`;
      return fullMatch;
    }
  );

  result = result.replace(
    /(<img\b[^>]*?src\s*=\s*["'])([^"']+)(["'][^>]*?>)/gi,
    (fullMatch, prefix, src, suffix) => {
      const f = lookupFile(src);
      if (f) return `${prefix}${cleanServer}/${f.sha256}${suffix}`;
      return fullMatch;
    }
  );

  return result;
}

/**
 * Creates a ZIP archive (Uint8Array) from a map of file paths to string or binary contents.
 */
export function createPluginZipArchive(
  files: Record<string, string | Uint8Array>
): Uint8Array {
  const rawEntries: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(files)) {
    rawEntries[path] = typeof content === "string" ? strToU8(content) : content;
  }
  return zipSync(rawEntries, { level: 6 });
}

/**
 * Extracts and analyzes a plugin `.zip` archive in memory.
 * Computes SHA-256 hashes for all files, infers plugin metadata & views,
 * and produces both an inlined single-file bundle (Option A) and multi-file Blossom structure (Option B).
 */
export function extractPluginFromZip(
  zipBytes: Uint8Array,
  options: { defaultName?: string; blossomServer?: string } = {}
): ExtractedPluginArchive {
  const rawUnzipped = unzipSync(zipBytes);
  const rawPaths = Object.keys(rawUnzipped).filter((p) => {
    if (p.endsWith("/")) return false;
    if (p.startsWith("__MACOSX/") || p.includes("/__MACOSX/")) return false;
    if (p.endsWith(".DS_Store") || p.startsWith(".DS_Store")) return false;
    return true;
  });

  if (rawPaths.length === 0) {
    throw new Error("The ZIP archive does not contain any valid plugin files.");
  }

  // Strip common single top-level directory prefix if all files share one (e.g. "my-app/index.html" -> "index.html")
  let commonPrefix = "";
  const firstSlash = rawPaths[0].indexOf("/");
  if (firstSlash !== -1) {
    const candidatePrefix = rawPaths[0].slice(0, firstSlash + 1);
    if (rawPaths.every((p) => p.startsWith(candidatePrefix))) {
      commonPrefix = candidatePrefix;
    }
  }

  const files: ExtractedPluginFile[] = [];
  const fileMap = new Map<string, ExtractedPluginFile>();
  const blossomHashes: Record<string, string> = {};

  for (const origPath of rawPaths) {
    const normalizedPath = (commonPrefix ? origPath.slice(commonPrefix.length) : origPath).replace(/^\/+/, "");
    if (!normalizedPath) continue;

    const bytes = rawUnzipped[origPath];
    const hash = bytesToHex(sha256(bytes));
    const { mime, isText } = detectMimeType(normalizedPath);
    const textContent = isText ? strFromU8(bytes) : undefined;

    const entry: ExtractedPluginFile = {
      path: normalizedPath,
      bytes,
      size: bytes.byteLength,
      sha256: hash,
      mimeType: mime,
      isText,
      textContent
    };
    files.push(entry);
    fileMap.set(normalizedPath, entry);
    blossomHashes[normalizedPath] = hash;
  }

  // Locate primary entry file
  const entryCandidates = [
    "index.html",
    "dist/index.html",
    "public/index.html",
    "index.htm",
    "index.js",
    "dist/index.js",
    "main.js"
  ];
  let entryFile = entryCandidates.find((c) => fileMap.has(c)) || "";
  if (!entryFile) {
    const htmlFile = files.find((f) => f.path.endsWith(".html") || f.path.endsWith(".htm"));
    const jsFile = files.find((f) => f.path.endsWith(".js") || f.path.endsWith(".mjs"));
    entryFile = htmlFile?.path || jsFile?.path || files[0].path;
  }

  const entryFileObj = fileMap.get(entryFile)!;
  let baseHtml = entryFileObj.textContent || "";

  // If entry is a JS file, wrap it in a standard HTML5 document
  if (entryFile.endsWith(".js") || entryFile.endsWith(".mjs")) {
    baseHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${options.defaultName || "Decentralized App"}</title>
</head>
<body>
  <div id="root"></div>
  <script type="module">
${baseHtml}
  </script>
</body>
</html>`;
  }

  // Extract metadata from manifest.webmanifest, manifest.json, package.json, or HTML tags
  let inferredName = options.defaultName ? options.defaultName.replace(/\.zip$/i, "") : "";
  let inferredId = "";
  let inferredVersion = "1.0.0";
  let inferredDesc = "";
  let inferredIcon = "globe";
  const handledIntents: string[] = [];

  const manifestFile =
    fileMap.get("manifest.webmanifest") ||
    fileMap.get("manifest.json") ||
    fileMap.get("omni.manifest.json") ||
    fileMap.get("package.json");

  if (manifestFile && manifestFile.textContent) {
    try {
      const parsed = JSON.parse(manifestFile.textContent);
      if (parsed.name && typeof parsed.name === "string") inferredName = parsed.name;
      if (parsed.short_name && !inferredName) inferredName = parsed.short_name;
      if (parsed.id && typeof parsed.id === "string") inferredId = parsed.id;
      if (parsed.version && typeof parsed.version === "string") inferredVersion = parsed.version;
      if (parsed.description && typeof parsed.description === "string") inferredDesc = parsed.description;
      if (parsed.icon && typeof parsed.icon === "string") inferredIcon = parsed.icon;
      if (Array.isArray(parsed.handledIntents)) {
        handledIntents.push(...parsed.handledIntents);
      }
      if (parsed.share_target) {
        handledIntents.push("share");
      }
    } catch {
      // Ignore malformed JSON
    }
  }

  // Fallback to HTML <title> and <meta> tags
  const titleMatch = baseHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch && (!inferredName || inferredName === "archive" || inferredName === "plugin")) {
    inferredName = titleMatch[1].trim();
  }
  if (!inferredName) {
    inferredName = "Custom Nsite App";
  }

  const descMetaMatch =
    baseHtml.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ||
    baseHtml.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i);
  if (descMetaMatch && !inferredDesc) {
    inferredDesc = descMetaMatch[1].trim();
  }

  const idMetaMatch = baseHtml.match(/<meta\s+name=["']application-name["']\s+content=["']([^"']+)["']/i);
  if (idMetaMatch && !inferredId) {
    inferredId = slugifyPluginId(idMetaMatch[1]);
  }
  if (!inferredId) {
    inferredId = slugifyPluginId(inferredName);
  }

  // Starbright app icon heuristic fallback
  if ((!inferredIcon || inferredIcon === "globe") && (inferredId.toLowerCase().includes("starbright") || inferredName.toLowerCase().includes("starbright"))) {
    inferredIcon = "✨";
  }

  // Build Option A (Single-file inlined HTML bundle)
  const bundledHtml = inlineAssetsIntoHtml(baseHtml, entryFile, fileMap);

  // Build Option B (Multi-file HTML with Blossom URLs if server is specified)
  const multiFileEntryHtml = options.blossomServer
    ? rewriteHtmlRelativeUrlsToBlossom(baseHtml, entryFile, fileMap, options.blossomServer)
    : baseHtml;

  // Detect views from HTML + Web App Manifest
  const views = NostrPluginResolver.detectPluginViews(null, bundledHtml);
  if (manifestFile && manifestFile.textContent) {
    const manifestViews = NostrPluginResolver.detectPluginViews(
      null,
      `<script type="application/manifest+json">${manifestFile.textContent}</script>`
    );
    for (const mv of manifestViews) {
      if (!views.some((v) => v.id === mv.id)) {
        views.push(mv);
      }
    }
  }

  return {
    files,
    entryFile,
    inferredMeta: {
      id: inferredId,
      name: inferredName,
      version: inferredVersion,
      description: inferredDesc || `Decentralized nsite packaged from ${files.length} file(s).`,
      icon: inferredIcon,
      views,
      handledIntents: Array.from(new Set(handledIntents))
    },
    bundledHtml,
    multiFileEntryHtml,
    blossomHashes
  };
}

/**
 * Creates a Blossom BUD-06 authorization event draft (`kind: 24242`).
 */
export function createBlossomAuthEventDraft(
  sha256Hash: string,
  fileName?: string,
  action: "upload" | "get" | "list" | "delete" = "upload",
  expirationSeconds = 3600
): UnsignedEvent {
  const now = Math.floor(Date.now() / 1000);
  return {
    kind: BLOSSOM_AUTH_KIND,
    content: fileName ? `${action} ${fileName}` : `${action} ${sha256Hash}`,
    tags: [
      ["t", action],
      ["x", sha256Hash.toLowerCase()],
      ["expiration", String(now + expirationSeconds)]
    ],
    created_at: now
  };
}

/**
 * Encodes a signed Nostr `kind: 24242` event into a Blossom `Authorization: Nostr <base64>` header value.
 */
export function encodeBlossomAuthHeader(signedEvent: NostrEvent): string {
  return `Nostr ${utf8ToBase64(JSON.stringify(signedEvent))}`;
}

/**
 * Creates a BUD-03 User Blossom Server List event draft (`kind: 10063`).
 */
export function createBlossomServerListEventDraft(servers: string[]): UnsignedEvent {
  const cleanServers = Array.from(
    new Set(
      servers
        .map((s) => s.trim().replace(/\/+$/, ""))
        .filter((s) => s.startsWith("http://") || s.startsWith("https://"))
    )
  );
  return {
    kind: BLOSSOM_SERVER_LIST_KIND,
    content: "",
    tags: cleanServers.map((s) => ["server", s]),
    created_at: Math.floor(Date.now() / 1000)
  };
}

/**
 * Uploads a single file blob to a Blossom server according to BUD-01 / BUD-02 / BUD-06.
 */
export async function uploadFileToBlossom(
  file: { path: string; bytes: Uint8Array; sha256: string; mimeType: string },
  serverUrl: string,
  signEvent: (draft: UnsignedEvent) => Promise<NostrEvent>,
  fetchImpl: typeof fetch = fetch
): Promise<BlossomUploadResult> {
  const cleanServer = serverUrl.trim().replace(/\/+$/, "");
  const uploadUrl = `${cleanServer}/upload`;
  const blobUrl = `${cleanServer}/${file.sha256}`;

  try {
    const authDraft = createBlossomAuthEventDraft(file.sha256, file.path, "upload");
    const signedAuth = await signEvent(authDraft);
    const authHeader = encodeBlossomAuthHeader(signedAuth);

    const response = await fetchImpl(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "Authorization": authHeader,
        "X-SHA-256": file.sha256
      },
      body: file.bytes as any
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText || "Upload rejected"}`);
    }

    return {
      path: file.path,
      sha256: file.sha256,
      mimeType: file.mimeType,
      size: file.bytes.byteLength,
      server: cleanServer,
      url: blobUrl,
      uploaded: true
    };
  } catch (err: any) {
    return {
      path: file.path,
      sha256: file.sha256,
      mimeType: file.mimeType,
      size: file.bytes.byteLength,
      server: cleanServer,
      url: blobUrl,
      uploaded: false,
      error: err?.message || String(err)
    };
  }
}
