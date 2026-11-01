import type { OmniAction, OmniComponentNode } from "@omni/types";
import type { FeedNoteItem } from "../types.js";
import {
  currentFeedState,
  allKnownNotes,
  schemaThreadReplies,
  schemaFollowingPubkeys,
  schemaMyUserPubkey,
  schemaWs,
  activeWs,
  schemaGlobalSubId,
  setSchemaGlobalSubId
} from "../state.js";
import {
  profileCache,
  extractDisplayName
} from "../net/profiles.js";
import {
  initFeedSchemaSocket,
  loadOlderSchemaNotes,
  refreshSchemaFeed
} from "../net/relay-client.js";
import {
  isWidgetRoute,
  isCompactRoute
} from "../routes.js";
import {
  loadInlineImagesPreference,
  saveInlineImagesPreference
} from "../filter/filter-settings.js";
import { getFeedSchema } from "./feed-schema.js";

declare const omni: any;

export function handleFeedAction(
  action: OmniAction,
  payload?: Record<string, unknown>
): OmniComponentNode {
  const actName = action.name;
  if (actName === "set-tab") {
    const tab = String(payload?.tab || action.payload?.tab || "following") as "following" | "global";
    currentFeedState.activeTab = tab;
    try {
      localStorage.setItem("omni_feed_active_tab", tab);
    } catch (_) {}
    if (schemaWs && schemaWs.readyState === WebSocket.OPEN) {
      try {
        if (tab === "following") {
          if (schemaGlobalSubId) {
            try { schemaWs.send(JSON.stringify(["CLOSE", schemaGlobalSubId])); } catch (_) {}
            setSchemaGlobalSubId(null);
          }
          const hasFollows = Array.from(schemaFollowingPubkeys).some((p) => p !== schemaMyUserPubkey);
          if (hasFollows) {
            schemaWs.send(JSON.stringify([
              "REQ",
              `following-${Date.now()}`,
              { kinds: [1], authors: Array.from(schemaFollowingPubkeys).slice(0, 100), limit: 20 }
            ]));
          }
        } else if (tab === "global") {
          const newSubId = `global-${Date.now()}`;
          setSchemaGlobalSubId(newSubId);
          schemaWs.send(JSON.stringify([
            "REQ",
            newSubId,
            { kinds: [1], limit: 20 }
          ]));
        }
      } catch (_) {}
    }
  } else if (actName === "view-profile" || actName === "view_profile") {
    const pk = String(payload?.pubkey || action.payload?.pubkey || "");
    if (pk) {
      try {
        localStorage.setItem("omni_active_profile_pubkey", pk);
      } catch (_) {}
      const omniApi = (typeof omni !== "undefined" ? omni : (typeof window !== "undefined" ? (window as any).omni : null));
      if (omniApi?.intents?.dispatch) {
        omniApi.intents.dispatch("view_profile", { pubkey: pk }).catch(() => {});
      } else if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("intent", { detail: { action: "view_profile", data: { pubkey: pk } } }));
      }
    }
  } else if (actName === "load-more") {
    loadOlderSchemaNotes();
  } else if (actName === "refresh") {
    refreshSchemaFeed();
  } else if (actName === "publish-note") {
    const text = String(payload?.noteText || payload?.value || currentFeedState.composerText || "").trim();
    if (text) {
      const now = Math.floor(Date.now() / 1000);
      const unsigned = {
        kind: 1,
        content: text,
        tags: [],
        created_at: now
      };
      const nostr = (typeof window !== "undefined" ? (window as any).nostr : null);
      if (nostr?.signEvent) {
        nostr.signEvent(unsigned).then((signed: any) => {
          if (signed && schemaWs && schemaWs.readyState === WebSocket.OPEN) {
            schemaWs.send(JSON.stringify(["EVENT", signed]));
          }
        }).catch(() => {});
      }
      currentFeedState.notes.unshift({
        id: `note_${Date.now()}`,
        pubkey: schemaMyUserPubkey || "current_user",
        authorName: "You",
        npub: schemaMyUserPubkey ? `npub1${schemaMyUserPubkey.slice(0, 8)}...` : "npub1you...",
        content: text,
        created_at: Date.now(),
        likes: 0,
        reposts: 0,
        replies: 0,
        zaps: 0
      });
      currentFeedState.composerText = "";
    }
  } else if (actName === "view-thread" || actName === "view_note" || actName === "view-note" || actName === "reply-note") {
    const id = String(payload?.id || payload?.eventId || action.payload?.id || action.payload?.eventId || "");
    const noteData: any = (payload as any)?.note || (action.payload as any)?.note;
    if (id) {
      currentFeedState.activeThreadNoteId = id;
      try {
        if (typeof window !== "undefined" && window.history && typeof window.history.pushState === "function") {
          window.history.pushState({ view: "thread", id }, "", `?note=${id}`);
        }
      } catch (_) {}

      if (noteData && (noteData.id || noteData.content)) {
        const seededId = noteData.id || id;
        allKnownNotes.set(seededId, noteData);
        const author = profileCache.get(noteData.pubkey);
        const resolvedName = extractDisplayName(author);
        const authorName = (noteData.authorName && !noteData.authorName.startsWith("nostr:"))
          ? noteData.authorName
          : (resolvedName || noteData.authorName || (noteData.pubkey ? `nostr:${noteData.pubkey.slice(0, 8)}` : "Nostr User"));

        const existingNote = currentFeedState.notes.find((n) => n.id === seededId);
        if (existingNote) {
          existingNote.content = noteData.content || existingNote.content;
          if (authorName && (!existingNote.authorName || existingNote.authorName.startsWith("nostr:"))) {
            existingNote.authorName = authorName;
          }
          if (noteData.avatar || author?.picture) {
            existingNote.avatar = noteData.avatar || author?.picture;
          }
        } else {
          currentFeedState.notes.push({
            id: seededId,
            pubkey: noteData.pubkey || "",
            authorName,
            npub: noteData.npub || (noteData.pubkey ? `npub1${noteData.pubkey.slice(0, 8)}...` : "npub1..."),
            avatar: noteData.avatar || author?.picture,
            content: noteData.content || "",
            created_at: typeof noteData.created_at === "number"
              ? (noteData.created_at > 1e11 ? noteData.created_at : noteData.created_at * 1000)
              : Date.now(),
            likes: noteData.likes || 0,
            reposts: noteData.reposts || 0,
            replies: noteData.replies || 0,
            zaps: noteData.zaps || 0
          });
        }
      } else if (!allKnownNotes.has(id)) {
        try {
          const rawNoteData = localStorage.getItem("omni_active_note_data");
          if (rawNoteData) {
            const parsed = JSON.parse(rawNoteData);
            if (parsed && (parsed.id === id || parsed.eventId === id)) {
              allKnownNotes.set(id, parsed);
              const author = profileCache.get(parsed.pubkey);
              const resolvedName = extractDisplayName(author);
              const authorName = (parsed.authorName && !parsed.authorName.startsWith("nostr:"))
                ? parsed.authorName
                : (resolvedName || parsed.authorName || (parsed.pubkey ? `nostr:${parsed.pubkey.slice(0, 8)}` : "Nostr User"));

              if (!currentFeedState.notes.some((n) => n.id === id)) {
                currentFeedState.notes.push({
                  id: parsed.id || id,
                  pubkey: parsed.pubkey || "",
                  authorName,
                  npub: parsed.npub || (parsed.pubkey ? `npub1${parsed.pubkey.slice(0, 8)}...` : "npub1..."),
                  avatar: parsed.avatar || author?.picture,
                  content: parsed.content || "",
                  created_at: typeof parsed.created_at === "number"
                    ? (parsed.created_at > 1e11 ? parsed.created_at : parsed.created_at * 1000)
                    : Date.now(),
                  likes: parsed.likes || 0,
                  reposts: parsed.reposts || 0,
                  replies: parsed.replies || 0,
                  zaps: parsed.zaps || 0
                });
              }
            }
          }
        } catch (_) {}
      }

      // Pre-seed any known replies to this note from currentFeedState.notes and allKnownNotes
      const existingReplies = schemaThreadReplies.get(id) || [];
      const replyIds = new Set(existingReplies.map((r) => r.id));

      const checkAndSeed = (ev: any) => {
        if (!ev || !ev.id || ev.id === id || replyIds.has(ev.id)) return;
        if ((ev.tags || []).some((t: any[]) => t[0] === "e" && t[1] === id)) {
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
            zaps: 0
          };
          existingReplies.push(repItem);
          replyIds.add(ev.id);
        }
      };

      for (const n of currentFeedState.notes) {
        checkAndSeed(n);
      }
      for (const ev of allKnownNotes.values()) {
        checkAndSeed(ev);
      }
      existingReplies.sort((a, b) => a.created_at - b.created_at);
      schemaThreadReplies.set(id, existingReplies);

      const targetNote = currentFeedState.notes.find((n) => n.id === id);
      if (targetNote) {
        targetNote.replies = existingReplies.length;
      }

      if (!schemaWs || schemaWs.readyState === WebSocket.CLOSED || schemaWs.readyState === WebSocket.CLOSING) {
        initFeedSchemaSocket();
      }
      const ws = (schemaWs && schemaWs.readyState === WebSocket.OPEN)
        ? schemaWs
        : (activeWs && activeWs.readyState === WebSocket.OPEN ? activeWs : null);
      if (ws) {
        try {
          ws.send(JSON.stringify(["REQ", `schema_thread_note_${id.slice(0, 8)}`, { ids: [id], limit: 1 }]));
          ws.send(JSON.stringify(["REQ", `schema_thread_rep_${id.slice(0, 8)}`, { kinds: [1], "#e": [id], limit: 50 }]));
        } catch (_) {}
      }
    }
  } else if (actName === "close-thread") {
    currentFeedState.activeThreadNoteId = null;
    try {
      if (typeof window !== "undefined" && window.history && typeof window.history.back === "function") {
        window.history.back();
      }
    } catch (_) {}
  } else if (actName === "publish-reply") {
    const replyToId = String(payload?.replyToId || action.payload?.replyToId || currentFeedState.activeThreadNoteId || "");
    const replyText = String(payload?.replyText ?? payload?.composerText ?? "").trim();
    if (replyText && replyToId) {
      const parentNote = currentFeedState.notes.find((n) => n.id === replyToId);
      const parentPubkey = parentNote?.pubkey || "";
      const tags: string[][] = [["e", replyToId, "", "reply"]];
      if (parentPubkey) {
        tags.push(["p", parentPubkey]);
      }
      const myMeta = profileCache.get(schemaMyUserPubkey);
      const myDisplayName = extractDisplayName(myMeta) || "You";
      const newReply: FeedNoteItem = {
        id: `reply_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        pubkey: schemaMyUserPubkey || "current_user",
        authorName: myDisplayName,
        npub: schemaMyUserPubkey ? `npub1${schemaMyUserPubkey.slice(0, 8)}...` : "npub1you...",
        avatar: myMeta?.picture,
        content: replyText,
        created_at: Date.now(),
        likes: 0,
        reposts: 0,
        replies: 0,
        zaps: 0
      };

      const existing = schemaThreadReplies.get(replyToId) || [];
      schemaThreadReplies.set(replyToId, [...existing, newReply]);
      if (parentNote) {
        parentNote.replies = (parentNote.replies || 0) + 1;
      }

      (async () => {
        try {
          const rootObj = (typeof window !== "undefined" ? (window as any) : null) || (typeof self !== "undefined" ? (self as any) : null);
          const nostrObj = rootObj?.nostr;
          if (nostrObj?.signEvent) {
            const ev = {
              kind: 1,
              created_at: Math.floor(Date.now() / 1000),
              tags,
              content: replyText
            };
            const signed = await nostrObj.signEvent(ev);
            const ws = (activeWs && activeWs.readyState === WebSocket.OPEN) ? activeWs : (schemaWs && schemaWs.readyState === WebSocket.OPEN ? schemaWs : null);
            ws?.send(JSON.stringify(["EVENT", signed]));
          }
        } catch (_) {}
      })();
    }
  } else if (actName === "like-note") {
    const id = String(payload?.id || action.payload?.id || "");
    const note = currentFeedState.notes.find((n) => n.id === id);
    if (note) {
      note.liked = !note.liked;
      note.likes += note.liked ? 1 : -1;
    }
  } else if (actName === "repost-note") {
    const id = String(payload?.id || action.payload?.id || "");
    const note = currentFeedState.notes.find((n) => n.id === id);
    if (note) {
      note.reposted = !note.reposted;
      note.reposts += note.reposted ? 1 : -1;
    }
  } else if (actName === "zap-note") {
    const id = String(payload?.id || action.payload?.id || "");
    const note = currentFeedState.notes.find((n) => n.id === id);
    if (note) {
      note.zaps += 21;
    }
  } else if (actName === "toggle-inline-images") {
    const enabled = typeof payload?.enabled === "boolean" ? payload.enabled : !loadInlineImagesPreference();
    saveInlineImagesPreference(enabled);
  }
  const view = isWidgetRoute() ? "widget" : isCompactRoute() ? "compact" : "main";
  return getFeedSchema(view);
}
