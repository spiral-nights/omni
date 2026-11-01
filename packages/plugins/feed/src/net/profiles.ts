import {
  activeWs,
  schemaWs,
  pendingProfileFetches,
  queuedProfilePubkeys
} from "../state.js";

export const PROFILE_CACHE_KEY = "omni_profile_cache_v2";
export const PROFILE_CACHE_TTL = 14 * 24 * 60 * 60 * 1000; // 14 days expiration (2 weeks)

export interface CachedProfileEntry {
  meta: { name?: string; display_name?: string; displayName?: string; username?: string; picture?: string; nip05?: string };
  timestamp: number;
}

export function extractDisplayName(meta: any): string {
  if (!meta || typeof meta !== "object") return "";
  const name =
    meta.display_name ||
    meta.displayName ||
    meta.name ||
    meta.username ||
    (meta.nip05 && typeof meta.nip05 === "string" ? meta.nip05.split("@")[0] : "");
  if (name && typeof name === "string" && name.trim()) {
    return name.trim();
  }
  return "";
}

export function loadPersistedProfileCache(): Map<string, any> {
  const map = new Map<string, any>();
  try {
    if (typeof localStorage === "undefined") return map;
    const cacheKeys = [PROFILE_CACHE_KEY, "omni_profile_viewer_cache_v2", "omni_profile_cache_v1"];
    for (const key of cacheKeys) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const records = JSON.parse(raw);
        for (const [pubkey, entry] of Object.entries(records)) {
          if (!entry) continue;
          const meta = (entry as any).meta || entry;
          if (meta && typeof meta === "object") {
            const existing = map.get(pubkey);
            if (!existing || (!extractDisplayName(existing) && extractDisplayName(meta))) {
              map.set(pubkey, meta);
            }
          }
        }
      } catch (_) {}
    }
  } catch (_) {}
  return map;
}

let saveCacheTimer: any = null;
export function persistProfileCache(cache: Map<string, any>) {
  if (typeof localStorage === "undefined") return;
  if (saveCacheTimer) clearTimeout(saveCacheTimer);
  saveCacheTimer = setTimeout(() => {
    try {
      const records: Record<string, CachedProfileEntry> = {};
      const now = Date.now();
      for (const [pubkey, meta] of cache.entries()) {
        records[pubkey] = { meta, timestamp: now };
      }
      const serialized = JSON.stringify(records);
      localStorage.setItem(PROFILE_CACHE_KEY, serialized);
      try {
        localStorage.setItem("omni_profile_viewer_cache_v2", serialized);
      } catch (_) {}
    } catch (_) {}
  }, 1000);
}

export const profileCache = loadPersistedProfileCache();

let profileBatchTimer: any = null;

export function queueProfileFetch(pubkey: string) {
  if (!pubkey) return;
  const cached = profileCache.get(pubkey);
  if (cached && extractDisplayName(cached)) return;
  if (pendingProfileFetches.has(pubkey)) return;
  queuedProfilePubkeys.add(pubkey);
  if (!profileBatchTimer) {
    profileBatchTimer = setTimeout(flushProfileBatch, 80);
  }
}

export function flushProfileBatch() {
  profileBatchTimer = null;
  const ws =
    (activeWs && activeWs.readyState === WebSocket.OPEN)
      ? activeWs
      : (schemaWs && schemaWs.readyState === WebSocket.OPEN ? schemaWs : null);
  if (queuedProfilePubkeys.size === 0) return;
  if (!ws) {
    profileBatchTimer = setTimeout(flushProfileBatch, 250);
    return;
  }

  const batch = Array.from(queuedProfilePubkeys).slice(0, 50);
  for (const pk of batch) {
    queuedProfilePubkeys.delete(pk);
    pendingProfileFetches.add(pk);
  }

  if (queuedProfilePubkeys.size > 0) {
    profileBatchTimer = setTimeout(flushProfileBatch, 100);
  }

  const subId = `prof_batch_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  try {
    ws.send(JSON.stringify(["REQ", subId, { kinds: [0], authors: batch, limit: batch.length }]));
  } catch (_) {}
}

export function getAuthorMeta(pubkey: string) {
  if (!pubkey) return { name: "anonymous", handle: "@anon", initial: "?", picture: "" };
  const cached = profileCache.get(pubkey);
  const resolvedName = extractDisplayName(cached);
  const name = resolvedName || (pubkey ? `nostr:${pubkey.slice(0, 8)}` : "anonymous");
  const handle = cached?.nip05 ? `@${cached.nip05}` : `@npub1${pubkey.slice(0, 8)}`;
  const initial = ((resolvedName || pubkey)[0] || "?").toUpperCase();
  return {
    name,
    handle,
    initial,
    picture: cached?.picture || ""
  };
}
