import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/curves/abstract/utils";
import {
  NostrEvent,
  PluginViewDeclaration,
  UnsignedEvent,
  BLOSSOM_AUTH_KIND,
  BLOSSOM_SERVER_LIST_KIND,
  detectMimeType,
  uint8ToBase64,
  utf8ToBase64,
  resolveRelativeArchivePath,
  createBlossomAuthEventDraft,
  encodeBlossomAuthHeader,
  createBlossomServerListEventDraft,
  MIME_MAP
} from "@omni/types";
import { NostrPluginResolver } from "./nostr-plugin-resolver.js";

export {
  BLOSSOM_AUTH_KIND,
  BLOSSOM_SERVER_LIST_KIND,
  detectMimeType,
  uint8ToBase64,
  utf8ToBase64,
  resolveRelativeArchivePath,
  createBlossomAuthEventDraft,
  encodeBlossomAuthHeader,
  createBlossomServerListEventDraft,
  MIME_MAP
};

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

export function slugifyPluginId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/\.zip$|\.html?$|\.js$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `nsite-${Date.now()}`;
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

  // Detect icon from HTML or manifest
  if (!inferredIcon || inferredIcon === "globe" || inferredIcon === "widgets") {
    const detected = NostrPluginResolver.detectPluginIcon(null, baseHtml);
    if (detected && detected !== "widgets") {
      inferredIcon = detected;
    }
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
    try {
      const parsed = JSON.parse(manifestFile.textContent);
      if (Array.isArray(parsed.views)) {
        for (const pv of parsed.views) {
          if (pv && pv.id && !views.some((v) => v.id === pv.id)) {
            views.push({
              id: pv.id,
              title: pv.title || (pv.id.charAt(0).toUpperCase() + pv.id.slice(1)),
              path: pv.path !== undefined ? pv.path : (pv.id === "main" ? "" : `?view=${encodeURIComponent(pv.id)}`),
              format: pv.format || "auto"
            });
          }
        }
      }
    } catch {}
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
