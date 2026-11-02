import { escapeHtml } from "../legacy/dom-helpers.js";
import { decodeNostrEntity } from "./bech32.js";
import { loadInlineImagesPreference } from "../filter/filter-settings.js";
import type { ParsedSearchQuery } from "../types.js";

export function parseSearchQuery(raw: string): ParsedSearchQuery {
  const authors: string[] = [];
  const keywords: string[] = [];
  for (const token of (raw || "").trim().split(/\s+/).filter(Boolean)) {
    if (token.startsWith("@") && token.length > 1) {
      authors.push(token.slice(1));
    } else {
      keywords.push(token);
    }
  }
  return { authors, keyword: keywords.join(" ").toLowerCase() };
}

export function isNostrIdentifier(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  if (/^[0-9a-fA-F]{64}$/.test(s)) return true;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return true;
  return decodeNostrEntity(s) !== null;
}

export function formatContent(text: string, inlineImages = loadInlineImagesPreference()): string {
  const escaped = escapeHtml(text || "");
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  let formatted = escaped.replace(urlRegex, (rawUrl) => {
    const url = rawUrl.replace(/^http:\/\//i, "https://");
    const isVideo = /\.(mp4|webm|mov|m4v|ogv|ogg|mkv)(\?.*)?$/i.test(url);
    const isImage = /\.(png|jpg|jpeg|gif|webp|svg)(\?.*)?$/i.test(url);

    if (isVideo) {
      let displayLabel = url;
      try {
        const parsed = new URL(url);
        const name = parsed.pathname.split("/").filter(Boolean).pop() || parsed.hostname;
        displayLabel = name.length > 28 ? `${name.slice(0, 12)}…${name.slice(-10)}` : name;
      } catch (_) {}
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="feed-media-callout feed-video-link" style="display: inline-flex; align-items: center; gap: 7px; padding: 4px 10px; margin: 3px 0; background: var(--bg-surface, #191816); border: 1px solid var(--border-subtle, #33312c); border-radius: var(--radius-sm, 6px); color: var(--omni-accent-primary, var(--accent-primary, #d4a373)); text-decoration: none; font-size: 0.85em; font-weight: 500; transition: all 0.15s ease; max-width: 100%; word-break: break-all;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg><span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px;">${displayLabel}</span><span class="media-callout-badge" style="font-size: 0.72em; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.85; background: rgba(212, 163, 115, 0.15); padding: 1px 5px; border-radius: 3px; margin-left: 2px;">Video</span></a>`;
    }

    if (isImage && !inlineImages) {
      let displayLabel = url;
      try {
        const parsed = new URL(url);
        const name = parsed.pathname.split("/").filter(Boolean).pop() || parsed.hostname;
        displayLabel = name.length > 28 ? `${name.slice(0, 12)}…${name.slice(-10)}` : name;
      } catch (_) {}
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="feed-media-callout feed-image-link" style="display: inline-flex; align-items: center; gap: 7px; padding: 4px 10px; margin: 3px 0; background: var(--bg-surface, #191816); border: 1px solid var(--border-subtle, #33312c); border-radius: var(--radius-sm, 6px); color: var(--omni-accent-primary, var(--accent-primary, #d4a373)); text-decoration: none; font-size: 0.85em; font-weight: 500; transition: all 0.15s ease; max-width: 100%; word-break: break-all;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg><span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px;">${displayLabel}</span><span class="media-callout-badge" style="font-size: 0.72em; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.85; background: rgba(212, 163, 115, 0.15); padding: 1px 5px; border-radius: 3px; margin-left: 2px;">Image</span></a>`;
    }
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="feed-link">${url}</a>`;
  });

  // NIP-21: nostr:<bech32> URI scheme & bare Nostr entities
  const nostrRegex = /(?:nostr:)?((?:npub|nprofile|note|nevent|naddr)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{20,})/gi;
  formatted = formatted.replace(nostrRegex, (match, entity) => {
    const decoded = decodeNostrEntity(entity);
    if (!decoded) return match;

    if (decoded.type === "note" || decoded.type === "nevent") {
      const hex = decoded.hex;
      const label = decoded.type === "nevent" ? "Event" : "Note";
      const short = `${entity.slice(0, 10)}…${entity.slice(-4)}`;
      return `<a href="nostr:${entity}" data-nostr-entity="${entity}" data-note-id="${hex || ""}" class="feed-nostr-entity feed-nostr-note" title="View Note Thread"><span class="nostr-badge-icon">💬</span> ${label} <code class="nostr-badge-code">${short}</code></a>`;
    }

    if (decoded.type === "npub" || decoded.type === "nprofile") {
      const pubkey = decoded.hex || decoded.pubkey;
      const short = `${entity.slice(0, 9)}…${entity.slice(-4)}`;
      return `<a href="nostr:${entity}" data-nostr-entity="${entity}" data-pubkey="${pubkey || ""}" class="feed-nostr-entity feed-nostr-profile" title="View Profile"><span class="nostr-badge-icon">@</span><code class="nostr-badge-code">${short}</code></a>`;
    }

    if (decoded.type === "naddr") {
      const label = decoded.identifier || `${entity.slice(0, 10)}…`;
      return `<a href="nostr:${entity}" data-nostr-entity="${entity}" class="feed-nostr-entity feed-nostr-addr" title="View Addressable Event"><span class="nostr-badge-icon">📜</span> <code class="nostr-badge-code">${escapeHtml(label)}</code></a>`;
    }

    return match;
  });

  return formatted;
}
