import { decodeNostrEntity } from "./bech32.js";
import { loadInlineImagesPreference } from "../filter/filter-settings.js";
import type { ParsedSearchQuery } from "../types.js";

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
      const short = `${entity.slice(0, 10)}…${entity.slice(-4)}`;
      const cache = typeof window !== "undefined" ? (window as any).__omni_event_cache : null;
      const cached = hex && cache ? cache.get(hex) : null;
      const author = cached?.authorName || (cached?.pubkey ? `nostr:${cached.pubkey.slice(0, 8)}` : "Nostr User");
      const hasContent = Boolean(cached?.content);
      const snippet = hasContent ? escapeHtml(cached.content) : "Loading quoted note…";

      return `<div class="omni-quote-card feed-quote-card ${hasContent ? '' : 'loading'}" data-note-id="${hex || ""}" data-entity="${entity}" style="display: block; margin: 8px 0; background: var(--omni-bg-surface, #191816); border: 1px solid var(--omni-border-subtle, #33312c); border-radius: 6px; padding: 10px 12px; cursor: pointer; text-decoration: none; color: inherit; user-select: text;">
        <div class="omni-quote-header" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; font-size: 0.85em;">
          <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0; color: var(--omni-accent-primary, #d4a373);"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <strong class="omni-quote-author" style="font-weight: 600; color: var(--omni-text-primary, #ede8df); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${author}</strong>
            <span class="omni-quote-id" style="font-family: monospace; font-size: 0.85em; color: var(--omni-text-muted, #78716c);">${short}</span>
          </div>
          <span class="omni-quote-badge" style="font-size: 0.72em; text-transform: uppercase; letter-spacing: 0.05em; color: var(--omni-accent-primary, #d4a373); background: rgba(212, 163, 115, 0.12); padding: 1px 6px; border-radius: 3px; flex-shrink: 0;">Quoted Note</span>
        </div>
        <div class="omni-quote-content" style="font-size: 0.9em; line-height: 1.45; color: var(--omni-text-secondary, #9e988f); overflow: hidden; word-break: break-word; ${hasContent ? '' : 'font-style: italic; opacity: 0.75;'}">${snippet}</div>
        <a href="nostr:${entity}" data-nostr-entity="${entity}" data-note-id="${hex || ""}" class="feed-nostr-entity feed-nostr-note" style="display: none;"></a>
      </div>`;
    }

    if (decoded.type === "npub" || decoded.type === "nprofile") {
      const pubkey = decoded.hex || decoded.pubkey;
      const short = `${entity.slice(0, 9)}…${entity.slice(-4)}`;
      return `<a href="nostr:${entity}" data-nostr-entity="${entity}" data-pubkey="${pubkey || ""}" class="feed-nostr-entity feed-nostr-profile" title="View Profile" style="display: inline-flex; align-items: center; gap: 4px; padding: 1px 6px; margin: 0 2px; background: rgba(212, 163, 115, 0.12); border: 1px solid rgba(212, 163, 115, 0.28); border-radius: 4px; color: var(--omni-accent-primary, #d4a373); text-decoration: none; font-size: 0.88em; font-weight: 500; vertical-align: baseline; font-family: monospace; transition: all 0.15s ease;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg><span>@${short}</span></a>`;
    }

    if (decoded.type === "naddr") {
      const label = decoded.identifier || `${entity.slice(0, 10)}…`;
      return `<a href="nostr:${entity}" data-nostr-entity="${entity}" class="feed-nostr-entity feed-nostr-addr" title="View Addressable Event" style="display: inline-flex; align-items: center; gap: 4px; padding: 1px 6px; margin: 0 2px; background: rgba(212, 163, 115, 0.12); border: 1px solid rgba(212, 163, 115, 0.28); border-radius: 4px; color: var(--omni-accent-primary, #d4a373); text-decoration: none; font-size: 0.88em; font-weight: 500; vertical-align: baseline; font-family: monospace; transition: all 0.15s ease;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> <span>${escapeHtml(label)}</span></a>`;
    }

    return match;
  });

  return formatted;
}

export function extractReplyInfo(ev: { tags?: string[][] }): {
  rootId?: string;
  replyToId?: string;
  replyToPubkey?: string;
} {
  const tags = ev?.tags || [];
  const eTags = tags.filter((t) => t[0] === "e" && t[1]);
  if (eTags.length === 0) return {};

  let rootId: string | undefined;
  let replyToId: string | undefined;

  const markedRoot = eTags.find((t) => t[3] === "root");
  const markedReply = eTags.find((t) => t[3] === "reply");

  if (markedRoot || markedReply) {
    rootId = markedRoot ? markedRoot[1] : undefined;
    replyToId = markedReply ? markedReply[1] : markedRoot?.[1];
  } else {
    if (eTags.length === 1) {
      rootId = eTags[0][1];
      replyToId = eTags[0][1];
    } else if (eTags.length >= 2) {
      rootId = eTags[0][1];
      replyToId = eTags[eTags.length - 1][1];
    }
  }

  const pTags = tags.filter((t) => t[0] === "p" && t[1]);
  const replyToPubkey = pTags.length > 0 ? pTags[0][1] : undefined;

  return { rootId, replyToId, replyToPubkey };
}
