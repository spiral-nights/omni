import { NoteInteractionStats, ProfileMetadata, TargetUserProfile } from "../types.js";

export const PROFILE_CACHE_KEY = "omni_profile_viewer_cache_v2";
export const PROFILE_CACHE_TTL = 14 * 24 * 60 * 60 * 1000; // 14 days expiration (2 weeks)

export const profileStore = {
  currentSchemaTab: "my-profile",
  schemaPreviousTab: null as string | null,
  schemaPushedHistory: false,
  currentProfilePubkey: "",
  currentProfileData: {
    name: "",
    displayName: "",
    about: "",
    picture: "",
    nip05: "",
    lud16: "",
    pubkey: "",
    npub: ""
  } as ProfileMetadata,
  schemaFollowsSet: new Set<string>(),
  schemaProfileCache: new Map<string, any>(),
  schemaUserNotes: [] as any[],
  schemaTargetUser: null as TargetUserProfile | null,
  schemaWs: null as WebSocket | null,
  schemaUpdateTimer: null as any,
  persistCacheTimer: null as any,
  queriedAuthorsSet: new Set<string>(),
  updateListeners: [] as Array<() => void>
};

export const noteStatsMap = new Map<string, NoteInteractionStats>();
export const likePubkeysByNote = new Map<string, Set<string>>();
export const replyIdsByNote = new Map<string, Set<string>>();
export const repostPubkeysByNote = new Map<string, Set<string>>();
export const queriedInteractionNoteIds = new Set<string>();

export function getOrCreateNoteStats(noteId: string): NoteInteractionStats {
  let stats = noteStatsMap.get(noteId);
  if (!stats) {
    stats = { likes: 0, replies: 0, reposts: 0, zaps: 0 };
    noteStatsMap.set(noteId, stats);
  }
  return stats;
}

export function onProfileStoreUpdate(listener: () => void): () => void {
  profileStore.updateListeners.push(listener);
  return () => {
    const idx = profileStore.updateListeners.indexOf(listener);
    if (idx !== -1) profileStore.updateListeners.splice(idx, 1);
  };
}

export function scheduleSchemaUpdate(): void {
  if (profileStore.schemaUpdateTimer) return;
  profileStore.schemaUpdateTimer = setTimeout(() => {
    profileStore.schemaUpdateTimer = null;
    for (const listener of profileStore.updateListeners) {
      try {
        listener();
      } catch (_) {}
    }
  }, 100);
}

export function loadSchemaProfileCache(): void {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return;
    const records = JSON.parse(raw);
    const now = Date.now();
    for (const [pk, val] of Object.entries(records)) {
      const entry = val as any;
      const meta = entry?.meta || entry;
      const ts = entry?.timestamp || now;
      if (now - ts < PROFILE_CACHE_TTL && meta && typeof meta === "object") {
        profileStore.schemaProfileCache.set(pk, meta);
      }
    }
  } catch (_) {}
}

export function persistSchemaProfileCache(): void {
  if (typeof localStorage === "undefined") return;
  if (profileStore.persistCacheTimer) return;
  profileStore.persistCacheTimer = setTimeout(() => {
    profileStore.persistCacheTimer = null;
    try {
      const records: Record<string, { meta: any; timestamp: number }> = {};
      const now = Date.now();
      for (const [pk, meta] of profileStore.schemaProfileCache.entries()) {
        records[pk] = { meta, timestamp: now };
      }
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(records));
    } catch (_) {}
  }, 500);
}

export function processIncomingInteraction(ev: any): void {
  if (!ev || !ev.tags) return;
  const k = Number(ev.kind);
  const eTags = (ev.tags || []).filter((t: string[]) => t[0] === "e" && t[1]);
  if (eTags.length === 0) return;

  for (const tag of eTags) {
    const targetNoteId = tag[1];
    if (!targetNoteId) continue;

    const stats = getOrCreateNoteStats(targetNoteId);
    let changed = false;

    if (k === 7) {
      const content = (ev.content || "").trim();
      if (content !== "-") {
        let likeSet = likePubkeysByNote.get(targetNoteId);
        if (!likeSet) {
          likeSet = new Set<string>();
          likePubkeysByNote.set(targetNoteId, likeSet);
        }
        if (!likeSet.has(ev.pubkey)) {
          likeSet.add(ev.pubkey);
          stats.likes = likeSet.size;
          changed = true;
        }
        if (profileStore.currentProfilePubkey && ev.pubkey === profileStore.currentProfilePubkey) {
          stats.liked = true;
          changed = true;
        }
      }
    } else if (k === 1 && ev.id !== targetNoteId) {
      let replySet = replyIdsByNote.get(targetNoteId);
      if (!replySet) {
        replySet = new Set<string>();
        replyIdsByNote.set(targetNoteId, replySet);
      }
      if (!replySet.has(ev.id)) {
        replySet.add(ev.id);
        stats.replies = replySet.size;
        changed = true;
      }
    } else if (k === 6) {
      let repostSet = repostPubkeysByNote.get(targetNoteId);
      if (!repostSet) {
        repostSet = new Set<string>();
        repostPubkeysByNote.set(targetNoteId, repostSet);
      }
      if (!repostSet.has(ev.pubkey)) {
        repostSet.add(ev.pubkey);
        stats.reposts = repostSet.size;
        changed = true;
      }
      if (profileStore.currentProfilePubkey && ev.pubkey === profileStore.currentProfilePubkey) {
        stats.reposted = true;
        changed = true;
      }
    } else if (k === 9735) {
      stats.zaps = (stats.zaps || 0) + 1;
      changed = true;
    }

    if (changed) {
      const activeNote = profileStore.schemaUserNotes.find((n) => n.id === targetNoteId);
      if (activeNote) {
        activeNote.likes = stats.likes;
        activeNote.replies = stats.replies;
        activeNote.reposts = stats.reposts;
        activeNote.liked = stats.liked;
        activeNote.reposted = stats.reposted;
      }
      scheduleSchemaUpdate();
    }
  }
}
