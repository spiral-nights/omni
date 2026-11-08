import {
  profileStore,
  getOrCreateNoteStats,
  processIncomingInteraction,
  persistSchemaProfileCache,
  scheduleSchemaUpdate,
  queriedInteractionNoteIds
} from "../state/profile-store.js";

export async function loadCachedNotesForPubkey(pubkey: string): Promise<void> {
  if (!pubkey) return;
  // 1. Check window.__omni_event_cache for instant 0ms in-memory notes
  if (typeof window !== "undefined") {
    const memCache = (window as any).__omni_event_cache;
    if (memCache && typeof memCache.values === "function") {
      let found = false;
      for (const ev of memCache.values()) {
        if (ev.pubkey === pubkey && (ev.kind === 1 || (!ev.kind && ev.content !== undefined))) {
          if (!profileStore.schemaUserNotes.some((n) => n.id === ev.id)) {
            const stats = getOrCreateNoteStats(ev.id);
            profileStore.schemaUserNotes.push({
              ...ev,
              kind: ev.kind || 1,
              created_at: ev.created_at ? (ev.created_at > 1e11 ? Math.floor(ev.created_at / 1000) : ev.created_at) : Math.floor(Date.now() / 1000),
              likes: stats.likes,
              replies: stats.replies,
              reposts: stats.reposts,
              liked: stats.liked,
              reposted: stats.reposted
            });
            found = true;
          }
        }
      }
      if (found) {
        profileStore.schemaUserNotes.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
        scheduleSchemaUpdate();
      }
    }
  }

  // 2. Check IndexedDB omni_event_store for local-first persistent events
  if (typeof indexedDB !== "undefined") {
    try {
      const dbReq = indexedDB.open("omni_event_store");
      dbReq.onsuccess = () => {
        const db = dbReq.result;
        if (!db.objectStoreNames.contains("events")) {
          db.close();
          return;
        }
        const tx = db.transaction(["events"], "readonly");
        const store = tx.objectStore("events");
        let req: IDBRequest;
        if (store.indexNames.contains("pubkey")) {
          req = store.index("pubkey").openCursor(IDBKeyRange.only(pubkey), "prev");
        } else {
          req = store.openCursor(null, "prev");
        }
        let added = 0;
        req.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (!cursor || added >= 30) {
            db.close();
            if (added > 0) {
              profileStore.schemaUserNotes.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
              scheduleSchemaUpdate();
              scheduleSchemaInteractionsFetch();
            }
            return;
          }
          const ev = cursor.value;
          if (ev && ev.pubkey === pubkey && ev.kind === 1) {
            if (!profileStore.schemaUserNotes.some((n) => n.id === ev.id)) {
              const stats = getOrCreateNoteStats(ev.id);
              profileStore.schemaUserNotes.push({
                ...ev,
                likes: stats.likes,
                replies: stats.replies,
                reposts: stats.reposts,
                liked: stats.liked,
                reposted: stats.reposted
              });
              added++;
            }
          }
          cursor.continue();
        };
        req.onerror = () => {
          db.close();
        };
      };
    } catch (_) {}
  }
}

export function fetchInteractionsBatch(noteIds: string[], sendFn: (frame: any[]) => void, prefix: string): void {
  const unqueried = noteIds.filter((id) => id && !queriedInteractionNoteIds.has(id));
  if (unqueried.length === 0) return;
  for (const id of unqueried) {
    queriedInteractionNoteIds.add(id);
  }
  const BATCH_SIZE = 40;
  for (let i = 0; i < unqueried.length; i += BATCH_SIZE) {
    const chunk = unqueried.slice(i, i + BATCH_SIZE);
    const subId = `${prefix}_${Date.now()}_${i}`;
    try {
      sendFn([
        "REQ",
        subId,
        {
          kinds: [6, 7, 9735],
          "#e": chunk,
          limit: chunk.length * 5
        }
      ]);
    } catch (_) {}
  }
}

let schemaInteractionsDebounceTimer: any = null;

export function scheduleSchemaInteractionsFetch(): void {
  if (schemaInteractionsDebounceTimer) return;
  schemaInteractionsDebounceTimer = setTimeout(() => {
    schemaInteractionsDebounceTimer = null;
    const ids = profileStore.schemaUserNotes.map((n) => n.id).filter(Boolean);
    if (ids.length > 0) {
      fetchInteractionsBatch(ids, sendSchemaWs, "pv_s_react");
    }
  }, 400);
}

export function fetchMissingSchemaProfiles(pubkeys: string[]): void {
  const missing = pubkeys.filter((pk) => pk && !profileStore.schemaProfileCache.has(pk) && !profileStore.queriedAuthorsSet.has(pk));
  if (missing.length === 0) return;
  // Limit missing profile batching so we don't spam 100s of requests on large follow lists
  const limitCount = Math.min(missing.length, 60);
  for (let i = 0; i < limitCount; i++) {
    profileStore.queriedAuthorsSet.add(missing[i]);
  }
  const toQuery = missing.slice(0, limitCount);
  const BATCH_SIZE = 30;
  for (let i = 0; i < toQuery.length; i += BATCH_SIZE) {
    const batch = toQuery.slice(i, i + BATCH_SIZE);
    try {
      sendSchemaWs(["REQ", `pv_s_authors_${Date.now()}_${i}`, { kinds: [0], authors: batch, limit: batch.length }]);
    } catch (_) {}
  }
}

export function sendSchemaWs(frame: any[]): void {
  if (typeof WebSocket === "undefined") return;
  if (typeof navigator !== "undefined" && navigator.userAgent && (navigator.userAgent.includes("happy-dom") || navigator.userAgent.includes("jsdom"))) {
    return;
  }
  if (!profileStore.schemaWs || profileStore.schemaWs.readyState !== WebSocket.OPEN) {
    profileStore.schemaWsQueue.push(frame);
    if (!profileStore.schemaWs || profileStore.schemaWs.readyState === WebSocket.CLOSED) {
      try {
        profileStore.schemaWs = new WebSocket("wss://relay.damus.io");
        profileStore.schemaWs.onopen = () => {
          while (profileStore.schemaWsQueue.length > 0) {
            const nextFrame = profileStore.schemaWsQueue.shift();
            if (nextFrame) {
              try { profileStore.schemaWs?.send(JSON.stringify(nextFrame)); } catch (_) {}
            }
          }
        };
        profileStore.schemaWs.onmessage = handleSchemaWsMessage;
      } catch (_) {}
    }
    return;
  }
  try {
    profileStore.schemaWs.send(JSON.stringify(frame));
  } catch (_) {}
}

export function handleSchemaWsMessage(event: any): void {
  try {
    const raw = event.data !== undefined ? event.data : event;
    const frame = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(frame)) return;
    const type = frame[0];
    if (type === "EVENT" && frame[2]) {
      const ev = frame[2];
      const k = Number(ev.kind);

      if (k === 7 || k === 6 || (k === 1 && (ev.tags || []).some((t: any) => t[0] === "e"))) {
        processIncomingInteraction(ev);
      }

      // Kind 0: Profile Metadata
      if (k === 0) {
        try {
          const meta = typeof ev.content === "string" ? JSON.parse(ev.content) : ev.content;
          if (ev.pubkey && meta && typeof meta === "object") {
            profileStore.schemaProfileCache.set(ev.pubkey, meta);
            persistSchemaProfileCache();
          }

          if (profileStore.currentProfilePubkey && ev.pubkey === profileStore.currentProfilePubkey) {
            profileStore.currentProfileData = {
              ...profileStore.currentProfileData,
              ...meta,
              name: meta.display_name || meta.name || profileStore.currentProfileData.name,
              displayName: meta.display_name || meta.name || profileStore.currentProfileData.displayName,
              about: meta.about ?? profileStore.currentProfileData.about,
              picture: meta.picture ?? profileStore.currentProfileData.picture,
              banner: meta.banner ?? profileStore.currentProfileData.banner,
              nip05: meta.nip05 ?? profileStore.currentProfileData.nip05,
              lud16: meta.lud16 ?? profileStore.currentProfileData.lud16,
              website: meta.website ?? profileStore.currentProfileData.website
            };
            scheduleSchemaUpdate();
          } else if (profileStore.schemaTargetUser && ev.pubkey === profileStore.schemaTargetUser.pubkey) {
            profileStore.schemaTargetUser = {
              ...profileStore.schemaTargetUser,
              name: meta.display_name || meta.name || profileStore.schemaTargetUser.name,
              about: meta.about ?? profileStore.schemaTargetUser.about,
              picture: meta.picture ?? profileStore.schemaTargetUser.picture,
              nip05: meta.nip05 ?? profileStore.schemaTargetUser.nip05
            };
            scheduleSchemaUpdate();
          } else if (profileStore.schemaFollowsSet.has(ev.pubkey)) {
            scheduleSchemaUpdate();
          }
        } catch (_) {}
      }

      // Kind 3: Contact List / Following
      else if (k === 3 && profileStore.currentProfilePubkey && ev.pubkey === profileStore.currentProfilePubkey) {
        profileStore.schemaFollowsSet.clear();
        const tags = ev.tags || [];
        for (const tag of tags) {
          if (tag[0] === "p" && tag[1]) {
            profileStore.schemaFollowsSet.add(tag[1]);
          }
        }
        if (typeof localStorage !== "undefined") {
          try {
            localStorage.setItem(`omni_people_follows_${profileStore.currentProfilePubkey}`, JSON.stringify(tags));
          } catch (_) {}
        }
        fetchMissingSchemaProfiles(Array.from(profileStore.schemaFollowsSet));
        scheduleSchemaUpdate();
      }

      // Kind 1: User notes
      else if (k === 1 && ev.id) {
        if (typeof window !== "undefined") {
          const cache = (window as any).__omni_event_cache || new Map();
          (window as any).__omni_event_cache = cache;
          const author = profileStore.schemaProfileCache.get(ev.pubkey);
          const existing = cache.get(ev.id) || { id: ev.id };
          existing.pubkey = ev.pubkey;
          if (author?.name) existing.authorName = author.name;
          if (author?.picture) existing.avatar = author.picture;
          existing.content = ev.content;
          existing.created_at = ev.created_at ? ev.created_at * 1000 : undefined;
          cache.set(ev.id, existing);
          try {
            window.dispatchEvent(new CustomEvent("omni:event_cached", { detail: { id: ev.id, event: existing } }));
          } catch (_) {}
        }

        const activePk =
          profileStore.currentSchemaTab === "user-profile"
            ? profileStore.schemaTargetUser?.pubkey
            : (profileStore.currentSchemaTab === "my-profile" ? profileStore.currentProfilePubkey : "");
        if (activePk && ev.pubkey === activePk) {
          if (!profileStore.schemaUserNotes.some((n) => n.id === ev.id)) {
            const stats = getOrCreateNoteStats(ev.id);
            profileStore.schemaUserNotes.push({
              ...ev,
              likes: stats.likes,
              replies: stats.replies,
              reposts: stats.reposts,
              liked: stats.liked,
              reposted: stats.reposted
            });
            profileStore.schemaUserNotes.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
            scheduleSchemaUpdate();
            scheduleSchemaInteractionsFetch();
          }
        }
      }
    } else if (type === "EOSE") {
      const subId = frame[1];
      if (typeof subId === "string") {
        if (
          subId.startsWith("pv_s_react_") ||
          subId.startsWith("pv_s_authors_") ||
          subId.startsWith("pv_schema_prof_") ||
          subId.startsWith("pv_schema_contacts_") ||
          subId.startsWith("pv_schema_target_") ||
          subId.startsWith("pv_schema_my_notes_") ||
          subId.startsWith("pv_schema_target_notes_")
        ) {
          try {
            sendSchemaWs(["CLOSE", subId]);
          } catch (_) {}
        }
      }
    }
  } catch (_) {}
}

export function startSchemaSubscriptions(pk: string): void {
  if (typeof WebSocket === "undefined") return;
  if (typeof navigator !== "undefined" && navigator.userAgent && (navigator.userAgent.includes("happy-dom") || navigator.userAgent.includes("jsdom"))) {
    return;
  }
  try {
    const reqAll = () => {
      try {
        profileStore.schemaWs?.send(JSON.stringify(["REQ", `pv_schema_prof_${Date.now()}`, { kinds: [0], authors: [pk], limit: 1 }]));
        profileStore.schemaWs?.send(JSON.stringify(["REQ", `pv_schema_contacts_${Date.now()}`, { kinds: [3], authors: [pk], limit: 1 }]));
        const myNotesSubId = `pv_schema_my_notes_${Date.now()}`;
        profileStore.schemaActiveNotesSubId = myNotesSubId;
        profileStore.schemaWs?.send(JSON.stringify(["REQ", myNotesSubId, { kinds: [1], authors: [pk], limit: 20 }]));
        fetchMissingSchemaProfiles(Array.from(profileStore.schemaFollowsSet));
      } catch (_) {}
    };

    if (!profileStore.schemaWs || profileStore.schemaWs.readyState === WebSocket.CLOSED) {
      profileStore.schemaWs = new WebSocket("wss://relay.damus.io");
      profileStore.schemaWs.onopen = () => {
        reqAll();
        while (profileStore.schemaWsQueue.length > 0) {
          const nextFrame = profileStore.schemaWsQueue.shift();
          if (nextFrame) {
            try { profileStore.schemaWs?.send(JSON.stringify(nextFrame)); } catch (_) {}
          }
        }
      };
      profileStore.schemaWs.onmessage = handleSchemaWsMessage;
    } else if (profileStore.schemaWs.readyState === WebSocket.OPEN) {
      reqAll();
    }
  } catch (_) {}
}
