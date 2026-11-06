import {
  currentFeedState,
  allKnownNotes,
  schemaThreadReplies,
  schemaFollowingPubkeys,
  schemaMyUserPubkey,
  setSchemaMyUserPubkey,
  schemaOldestTimestamp,
  setSchemaOldestTimestamp,
  schemaIsLoadingOlder,
  setSchemaIsLoadingOlder,
  schemaGlobalSubId,
  setSchemaGlobalSubId,
  schemaWs,
  setSchemaWs
} from "../state.js";
import {
  profileCache,
  persistProfileCache,
  extractDisplayName,
  queueProfileFetch,
  flushProfileBatch
} from "./profiles.js";
import { isContentFiltered, loadFilterPatterns } from "../filter/content-filter.js";
import { isWidgetRoute, isCompactRoute } from "../routes.js";
import { getFeedSchema } from "../schema/feed-schema.js";
import { extractReplyInfo } from "../format/content.js";
import { extractQuotedNoteId } from "../format/bech32.js";
import type { FeedNoteItem } from "../types.js";

function registerNoteInGlobalCache(note: {
  id: string;
  pubkey?: string;
  authorName?: string;
  avatar?: string;
  content?: string;
  created_at?: number;
}) {
  if (typeof window !== "undefined") {
    const cache = (window as any).__omni_event_cache || new Map();
    (window as any).__omni_event_cache = cache;
    const existing = cache.get(note.id) || { id: note.id };
    if (note.pubkey) existing.pubkey = note.pubkey;
    if (note.authorName) existing.authorName = note.authorName;
    if (note.avatar) existing.avatar = note.avatar;
    if (note.content !== undefined) existing.content = note.content;
    if (note.created_at) existing.created_at = note.created_at;
    cache.set(note.id, existing);
    try {
      window.dispatchEvent(
        new CustomEvent("omni:event_cached", { detail: { id: note.id, event: existing } })
      );
    } catch (_) {}
  }
}

let schemaDispatchTimeout: any = null;
const queriedInteractionNoteIds = new Set<string>();
let feedInteractionsTimer: any = null;

export function scheduleFeedInteractionsFetch(ws?: WebSocket | null) {
  const socket = ws || schemaWs;
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  if (feedInteractionsTimer) clearTimeout(feedInteractionsTimer);
  feedInteractionsTimer = setTimeout(() => {
    const unqueried = currentFeedState.notes
      .map((n) => n.id)
      .filter((id) => id && !queriedInteractionNoteIds.has(id));
    if (unqueried.length === 0) return;
    unqueried.forEach((id) => queriedInteractionNoteIds.add(id));

    const CHUNK_SIZE = 50;
    for (let i = 0; i < unqueried.length; i += CHUNK_SIZE) {
      const chunk = unqueried.slice(i, i + CHUNK_SIZE);
      const subId = `feed_s_react_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      try {
        socket.send(JSON.stringify([
          "REQ",
          subId,
          {
            kinds: [1, 6, 7],
            "#e": chunk,
            limit: chunk.length * 50
          }
        ]));
      } catch (_) {}
    }
  }, 120);
}

export function scheduleSchemaDispatch() {
  if (schemaDispatchTimeout) return;
  schemaDispatchTimeout = setTimeout(() => {
    schemaDispatchTimeout = null;
    if (typeof window !== "undefined") {
      const getFeedView = () => (isWidgetRoute() ? "widget" : isCompactRoute() ? "compact" : "main");
      const view = getFeedView();
      const compId = view === "widget" ? "widget" : "main";
      const schema = getFeedSchema(view);
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "omni:schema", componentId: compId, schema }, "*");
      } else {
        window.postMessage({ type: "omni:schema", componentId: compId, schema }, "*");
      }
    }
  }, 100);
}

export function initFeedSchemaSocket() {
  if (typeof WebSocket === "undefined") return;
  const g = typeof globalThis !== "undefined" ? (globalThis as any) : null;
  if (g?.process?.env?.NODE_ENV === "test" || g?.process?.env?.VITEST) return;
  if (typeof window !== "undefined") {
    const w = window as any;
    if (w.happyDOM || w.__VITEST_ENVIRONMENT__) return;
    if (typeof navigator !== "undefined" && navigator.userAgent && (navigator.userAgent.includes("happy-dom") || navigator.userAgent.includes("jsdom"))) return;
  }
  if (schemaWs && schemaWs.readyState === WebSocket.OPEN) return;

  try {
    const ws = new WebSocket("wss://relay.damus.io");
    setSchemaWs(ws);

    ws.onopen = () => {
      const nostr = (typeof window !== "undefined" ? (window as any).nostr : null);
      if (nostr?.getPublicKey) {
        nostr.getPublicKey().then((pk: string) => {
          if (pk) {
            setSchemaMyUserPubkey(pk);
            schemaFollowingPubkeys.add(pk);
            try {
              const raw = localStorage.getItem(`omni_people_follows_${pk}`);
              if (raw) {
                const tags = JSON.parse(raw);
                if (Array.isArray(tags)) {
                  for (const t of tags) {
                    if (t[0] === "p" && t[1]) schemaFollowingPubkeys.add(t[1]);
                  }
                }
              }
            } catch (_) {}
            try {
              ws.send(JSON.stringify(["REQ", "schema-contacts", { kinds: [3], authors: [pk], limit: 1 }]));
            } catch (_) {}
            const hasFollows = Array.from(schemaFollowingPubkeys).some((p) => p !== schemaMyUserPubkey);
            if (currentFeedState.activeTab === "following" && hasFollows) {
              try {
                ws.send(JSON.stringify([
                  "REQ",
                  "schema-following-notes",
                  { kinds: [1], authors: Array.from(schemaFollowingPubkeys).slice(0, 100), limit: 20 }
                ]));
              } catch (_) {}
            }
          }
        }).catch(() => {});
      }
      try {
        if (currentFeedState.activeTab === "global") {
          setSchemaGlobalSubId("schema-feed-init");
          ws.send(JSON.stringify(["REQ", schemaGlobalSubId, { kinds: [1], limit: 20 }]));
        }
        if (currentFeedState.activeThreadNoteId) {
          const tid = currentFeedState.activeThreadNoteId;
          ws.send(JSON.stringify(["REQ", `schema_thread_rep_${tid.slice(0, 8)}`, { kinds: [1], "#e": [tid], limit: 50 }]));
        }
        flushProfileBatch();
      } catch (_) {}
    };

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        const type = data[0];
        const subId = data[1];

        if (type === "EVENT" && data[2]) {
          const ev = data[2];
          if (ev.kind === 0) {
            try {
              const parsed = JSON.parse(ev.content);
              profileCache.set(ev.pubkey, parsed);
              persistProfileCache(profileCache);
              const resolvedName = extractDisplayName(parsed);
              let updated = false;
              for (const n of currentFeedState.notes) {
                if (n.pubkey === ev.pubkey) {
                  if (resolvedName) n.authorName = resolvedName;
                  if (parsed.picture) n.avatar = parsed.picture;
                  updated = true;
                }
                if (n.replyToPubkey === ev.pubkey) {
                  if (resolvedName) n.replyToAuthor = resolvedName;
                  updated = true;
                }
              }
              for (const replies of schemaThreadReplies.values()) {
                for (const r of replies) {
                  if (r.pubkey === ev.pubkey) {
                    if (resolvedName) r.authorName = resolvedName;
                    if (parsed.picture) r.avatar = parsed.picture;
                    updated = true;
                  }
                  if (r.replyToPubkey === ev.pubkey) {
                    if (resolvedName) r.replyToAuthor = resolvedName;
                    updated = true;
                  }
                }
              }
              if (updated) scheduleSchemaDispatch();
            } catch (_) {}
            return;
          }

          if (ev.kind === 3 && ev.pubkey === schemaMyUserPubkey) {
            for (const tag of ev.tags || []) {
              if (tag[0] === "p" && tag[1]) {
                schemaFollowingPubkeys.add(tag[1]);
              }
            }
            try {
              localStorage.setItem(`omni_people_follows_${schemaMyUserPubkey}`, JSON.stringify(ev.tags || []));
            } catch (_) {}
            const hasFollows = Array.from(schemaFollowingPubkeys).some((p) => p !== schemaMyUserPubkey);
            if (currentFeedState.activeTab === "following" && hasFollows) {
              try {
                ws.send(JSON.stringify([
                  "REQ",
                  "schema-following-notes",
                  { kinds: [1], authors: Array.from(schemaFollowingPubkeys).slice(0, 100), limit: 20 }
                ]));
              } catch (_) {}
            }
            scheduleSchemaDispatch();
            return;
          }

          if (ev.kind === 1 && ev.id) {
            allKnownNotes.set(ev.id, ev);

            const initialAuthor = profileCache.get(ev.pubkey);
            const initialAuthorName = extractDisplayName(initialAuthor) || (ev.pubkey ? `nostr:${ev.pubkey.slice(0, 8)}` : "Nostr User");
            registerNoteInGlobalCache({
              id: ev.id,
              pubkey: ev.pubkey,
              authorName: initialAuthorName,
              avatar: initialAuthor?.picture,
              content: ev.content || "",
              created_at: ev.created_at ? ev.created_at * 1000 : undefined
            });

            // Fetch any quoted note if not already in allKnownNotes
            const quotedId = extractQuotedNoteId(ev.content || "");
            if (quotedId && !allKnownNotes.has(quotedId)) {
              try {
                ws.send(JSON.stringify(["REQ", `quote_${quotedId.slice(0, 8)}`, { ids: [quotedId], limit: 1 }]));
              } catch (_) {}
            }

            if (subId?.startsWith("quote_")) {
              if (ev.pubkey && !profileCache.has(ev.pubkey)) {
                queueProfileFetch(ev.pubkey);
              }
              scheduleSchemaDispatch();
              return;
            }

            const repInfo = extractReplyInfo(ev);
            let replyToAuthor = "";
            if (repInfo.replyToPubkey) {
              const repAuthorObj = profileCache.get(repInfo.replyToPubkey);
              replyToAuthor = extractDisplayName(repAuthorObj) || "";
              if (!repAuthorObj) queueProfileFetch(repInfo.replyToPubkey);
            }

            if (
              subId?.startsWith("schema_thread_note_") ||
              subId?.startsWith("schema_thread_anc_") ||
              ev.id === currentFeedState.activeThreadNoteId
            ) {
              const author = profileCache.get(ev.pubkey);
              const authorName = extractDisplayName(author) || (ev.pubkey ? `nostr:${ev.pubkey.slice(0, 8)}` : "Nostr User");
              const existingNote = currentFeedState.notes.find((n) => n.id === ev.id);
              if (existingNote) {
                existingNote.content = ev.content || "";
                if (authorName && (!existingNote.authorName || existingNote.authorName.startsWith("nostr:"))) {
                  existingNote.authorName = authorName;
                }
                if (author?.picture) existingNote.avatar = author.picture;
                if (repInfo.replyToId) existingNote.replyToId = repInfo.replyToId;
                if (repInfo.rootId) existingNote.rootId = repInfo.rootId;
                if (repInfo.replyToPubkey) existingNote.replyToPubkey = repInfo.replyToPubkey;
                if (replyToAuthor) existingNote.replyToAuthor = replyToAuthor;
              } else {
                currentFeedState.notes.push({
                  id: ev.id,
                  pubkey: ev.pubkey,
                  authorName,
                  npub: ev.pubkey ? `npub1${ev.pubkey.slice(0, 8)}...` : "npub1...",
                  avatar: author?.picture,
                  content: ev.content || "",
                  created_at: (ev.created_at || Math.floor(Date.now() / 1000)) * 1000,
                  likes: 0,
                  reposts: 0,
                  replies: schemaThreadReplies.get(ev.id)?.length || 0,
                  zaps: 0,
                  replyToId: repInfo.replyToId,
                  replyToPubkey: repInfo.replyToPubkey,
                  replyToAuthor: replyToAuthor || undefined,
                  rootId: repInfo.rootId
                });
              }
              if (ev.pubkey && !profileCache.has(ev.pubkey)) {
                queueProfileFetch(ev.pubkey);
              }
              scheduleSchemaDispatch();
            }

            // Handle replies indexing
            const eTags = (ev.tags || []).filter((t: string[]) => t[0] === "e" && t[1]);
            const activeTid = currentFeedState.activeThreadNoteId;
            const isForActiveThread = Boolean(
              activeTid && (
                subId?.startsWith(`schema_thread_rep_${activeTid.slice(0, 8)}`) ||
                subId?.startsWith("schema_thread_all_") ||
                eTags.some((t: string[]) => t[1] === activeTid)
              )
            );

            if (isForActiveThread && activeTid) {
              const existing = schemaThreadReplies.get(activeTid) || [];
              if (!existing.some((r) => r.id === ev.id) && ev.id !== activeTid) {
                const author = profileCache.get(ev.pubkey);
                const repAuthorName = extractDisplayName(author) || (ev.pubkey ? `nostr:${ev.pubkey.slice(0, 8)}` : "Nostr User");
                const repItem: FeedNoteItem = {
                  id: ev.id,
                  pubkey: ev.pubkey,
                  authorName: repAuthorName,
                  npub: ev.pubkey ? `npub1${ev.pubkey.slice(0, 8)}...` : "npub1...",
                  avatar: author?.picture,
                  content: ev.content || "",
                  created_at: (ev.created_at || Math.floor(Date.now() / 1000)) * 1000,
                  likes: 0,
                  reposts: 0,
                  replies: 0,
                  zaps: 0,
                  replyToId: repInfo.replyToId,
                  replyToPubkey: repInfo.replyToPubkey,
                  replyToAuthor: replyToAuthor || undefined,
                  rootId: repInfo.rootId
                };
                existing.push(repItem);
                existing.sort((a, b) => a.created_at - b.created_at);
                schemaThreadReplies.set(activeTid, existing);
                const parentNote = currentFeedState.notes.find((n) => n.id === activeTid);
                if (parentNote) {
                  parentNote.replies = existing.length;
                }
                if (ev.pubkey && !profileCache.has(ev.pubkey)) {
                  queueProfileFetch(ev.pubkey);
                }
                scheduleSchemaDispatch();
              }
            }

            for (const t of eTags) {
              const parentId = t[1];
              if (parentId && parentId !== activeTid) {
                const existing = schemaThreadReplies.get(parentId) || [];
                if (!existing.some((r) => r.id === ev.id)) {
                  const author = profileCache.get(ev.pubkey);
                  const repAuthorName = extractDisplayName(author) || (ev.pubkey ? `nostr:${ev.pubkey.slice(0, 8)}` : "Nostr User");
                  const repItem: FeedNoteItem = {
                    id: ev.id,
                    pubkey: ev.pubkey,
                    authorName: repAuthorName,
                    npub: ev.pubkey ? `npub1${ev.pubkey.slice(0, 8)}...` : "npub1...",
                    avatar: author?.picture,
                    content: ev.content || "",
                    created_at: (ev.created_at || Math.floor(Date.now() / 1000)) * 1000,
                    likes: 0,
                    reposts: 0,
                    replies: 0,
                    zaps: 0,
                    replyToId: repInfo.replyToId,
                    replyToPubkey: repInfo.replyToPubkey,
                    replyToAuthor: replyToAuthor || undefined,
                    rootId: repInfo.rootId
                  };
                  existing.push(repItem);
                  existing.sort((a, b) => a.created_at - b.created_at);
                  schemaThreadReplies.set(parentId, existing);
                  const parentNote = currentFeedState.notes.find((n) => n.id === parentId);
                  if (parentNote) {
                    parentNote.replies = existing.length;
                  }
                }
              }
            }

            if (
              subId?.startsWith("schema_thread_rep_") ||
              subId?.startsWith("schema_thread_anc_") ||
              subId?.startsWith("schema_thread_all_")
            ) {
              return;
            }

            if (isContentFiltered(ev.content || "", loadFilterPatterns())) return;
            if (currentFeedState.notes.some((n) => n.id === ev.id)) return;

            if (ev.created_at && ev.created_at < schemaOldestTimestamp) {
              setSchemaOldestTimestamp(ev.created_at);
            }

            const author = profileCache.get(ev.pubkey);
            const npubShort = ev.pubkey ? `npub1${ev.pubkey.slice(0, 8)}...` : "npub1...";
            const authorName = extractDisplayName(author) || (ev.pubkey ? `nostr:${ev.pubkey.slice(0, 8)}` : "Nostr User");
            const avatar = author?.picture;

            const hasFollows = Array.from(schemaFollowingPubkeys).some((p) => p !== schemaMyUserPubkey);
            if (currentFeedState.activeTab === "following" && hasFollows && !schemaFollowingPubkeys.has(ev.pubkey)) {
              return;
            }

            const existingReplies = schemaThreadReplies.get(ev.id);

            currentFeedState.notes.push({
              id: ev.id,
              pubkey: ev.pubkey,
              authorName,
              npub: npubShort,
              avatar,
              content: ev.content || "",
              created_at: (ev.created_at || Math.floor(Date.now() / 1000)) * 1000,
              likes: 0,
              reposts: 0,
              replies: existingReplies?.length || 0,
              zaps: 0,
              replyToId: repInfo.replyToId,
              replyToPubkey: repInfo.replyToPubkey,
              replyToAuthor: replyToAuthor || undefined,
              rootId: repInfo.rootId
            });

            currentFeedState.notes.sort((a, b) => b.created_at - a.created_at);

            if (ev.pubkey && !profileCache.has(ev.pubkey)) {
              queueProfileFetch(ev.pubkey);
            }

            scheduleSchemaDispatch();
            scheduleFeedInteractionsFetch(ws);
          }

          if (ev.kind === 6 || ev.kind === 7) {
            const eTags = (ev.tags || []).filter((t: string[]) => t[0] === "e" && t[1]);
            let updated = false;
            for (const t of eTags) {
              const parentId = t[1];
              const parentNote = currentFeedState.notes.find((n) => n.id === parentId);
              if (parentNote) {
                if (ev.kind === 7) {
                  if (ev.content !== "-") {
                    parentNote.likes = (parentNote.likes || 0) + 1;
                    updated = true;
                  }
                } else if (ev.kind === 6) {
                  parentNote.reposts = (parentNote.reposts || 0) + 1;
                  updated = true;
                }
              }
            }
            if (updated) scheduleSchemaDispatch();
            return;
          }
        } else if (type === "EOSE") {
          if (subId?.startsWith("feed_s_react_")) {
            try {
              ws.send(JSON.stringify(["CLOSE", subId]));
            } catch (_) {}
          }
        }
      } catch (_) {}
    };
  } catch (_) {}
}

export function loadOlderSchemaNotes() {
  if (schemaIsLoadingOlder || !schemaWs || schemaWs.readyState !== WebSocket.OPEN) return;
  setSchemaIsLoadingOlder(true);
  const subId = `older-${Date.now()}`;
  const until = (schemaOldestTimestamp !== Infinity ? schemaOldestTimestamp : Math.floor(Date.now() / 1000)) - 1;
  try {
    if (currentFeedState.activeTab === "following" && schemaFollowingPubkeys.size > 0) {
      schemaWs.send(JSON.stringify([
        "REQ",
        subId,
        { kinds: [1], authors: Array.from(schemaFollowingPubkeys).slice(0, 100), until, limit: 15 }
      ]));
    } else {
      schemaWs.send(JSON.stringify([
        "REQ",
        subId,
        { kinds: [1], until, limit: 15 }
      ]));
    }
  } catch (_) {}
  setTimeout(() => {
    setSchemaIsLoadingOlder(false);
  }, 1200);
}

export function refreshSchemaFeed() {
  if (!schemaWs || schemaWs.readyState !== WebSocket.OPEN) {
    initFeedSchemaSocket();
    return;
  }
  try {
    if (currentFeedState.activeTab === "following" && schemaFollowingPubkeys.size > 0) {
      schemaWs.send(JSON.stringify([
        "REQ",
        `refresh-${Date.now()}`,
        { kinds: [1], authors: Array.from(schemaFollowingPubkeys).slice(0, 100), limit: 20 }
      ]));
    } else {
      schemaWs.send(JSON.stringify([
        "REQ",
        `refresh-${Date.now()}`,
        { kinds: [1], limit: 20 }
      ]));
    }
  } catch (_) {}
}
