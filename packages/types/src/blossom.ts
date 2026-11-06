import { NostrEvent, UnsignedEvent } from "./nostr.js";

export const BLOSSOM_AUTH_KIND = 24242;
export const BLOSSOM_SERVER_LIST_KIND = 10063;

export const MIME_MAP: Record<string, { mime: string; isText: boolean }> = {
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
  const g = globalThis as any;
  if (typeof g.Buffer !== "undefined") {
    return g.Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function utf8ToBase64(str: string): string {
  return uint8ToBase64(new TextEncoder().encode(str));
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
export function encodeBlossomAuthHeader(signedEvent: NostrEvent | object): string {
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
