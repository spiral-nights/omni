/// <reference types="@omni/types" />
import { OmniComponentNode, OmniAction } from "@omni/types";
import { hexToNpub, npubToHex } from "./crypto/bech32.js";
import { AVATAR_PALETTES, getProfileGradientBanner } from "./crypto/gradient.js";
import {
  profileStore,
  loadSchemaProfileCache,
  onProfileStoreUpdate,
  PROFILE_CACHE_KEY
} from "./state/profile-store.js";
import {
  startSchemaSubscriptions,
  fetchMissingSchemaProfiles,
  loadCachedNotesForPubkey,
  sendSchemaWs
} from "./net/relay-sync.js";
import { getProfileSchema } from "./schema/profile-schema.js";
import { handleProfileViewerAction } from "./schema/action-handler.js";

export { hexToNpub, npubToHex, AVATAR_PALETTES, getProfileGradientBanner, getProfileSchema, handleProfileViewerAction };

function getInitialRouteParams(): URLSearchParams {
  let search = "";
  try {
    if (typeof window !== "undefined" && window.location && window.location.search) {
      search = window.location.search;
    }
  } catch (_) {}
  const omniRoute =
    (typeof self !== "undefined" ? (self as any).__OMNI_ROUTE__ : "") ||
    (typeof window !== "undefined" ? (window as any).__OMNI_ROUTE__ : "");
  if (!search && omniRoute) {
    search = omniRoute.includes("?") ? omniRoute.slice(omniRoute.indexOf("?")) : omniRoute;
  }
  return new URLSearchParams(search || "");
}

export function dispatchProfileSchema(schema: OmniComponentNode | null): void {
  if (!schema) return;
  const rootObj: any =
    (typeof window !== "undefined" ? window : null) ||
    (typeof self !== "undefined" ? self : null) ||
    (typeof globalThis !== "undefined" ? globalThis : null);
  if (!rootObj) return;

  if (rootObj.parent && rootObj.parent !== rootObj) {
    rootObj.parent.postMessage({ type: "omni:schema", componentId: "main", schema }, "*");
  } else if (typeof rootObj.postMessage === "function") {
    rootObj.postMessage({ type: "omni:schema", componentId: "main", schema }, "*");
  }
}

export function dispatchCurrentSchema(): void {
  dispatchProfileSchema(
    getProfileSchema(profileStore.currentSchemaTab, profileStore.currentProfileData, {
      activeTab: profileStore.currentSchemaTab,
      targetUser: profileStore.schemaTargetUser,
      isFollowing: profileStore.schemaTargetUser?.isFollowing,
      follows: Array.from(profileStore.schemaFollowsSet).map((pk) => ({ pubkey: pk })),
      followsCount: profileStore.schemaFollowsSet.size
    })
  );
}

async function resolveUserPubkey(): Promise<string> {
  const rootObj =
    (typeof window !== "undefined" ? (window as any) : null) ||
    (typeof self !== "undefined" ? (self as any) : null) ||
    (typeof globalThis !== "undefined" ? (globalThis as any) : null);

  // 1. Standard window.nostr (NIP-07)
  const nostrObj = rootObj?.nostr;
  if (nostrObj && typeof nostrObj.getPublicKey === "function") {
    try {
      const pkPromise = nostrObj.getPublicKey();
      const timeout = new Promise<string>((resolve) => setTimeout(() => resolve(""), 2000));
      const pk = await Promise.race([pkPromise, timeout]);
      if (pk) return pk;
    } catch (_) {}
  }

  // 2. Host session info via omni runtime
  const omniObj = rootObj?.omni;
  if (omniObj?.session?.userPubkey) {
    return omniObj.session.userPubkey;
  }
  if (omniObj?.nostr && typeof omniObj.nostr.getPublicKey === "function") {
    try {
      const pk = await omniObj.nostr.getPublicKey();
      if (pk) return pk;
    } catch (_) {}
  }

  // 3. Partitioned LocalStorage fallback
  if (typeof localStorage !== "undefined") {
    try {
      const stored = localStorage.getItem("omni_user_pubkey");
      if (stored) return stored;
    } catch (_) {}
  }

  return "";
}

export async function initSchemaData(explicitPk?: string): Promise<void> {
  try {
    loadSchemaProfileCache();
    const pk = explicitPk || (await resolveUserPubkey());
    if (pk) {
      profileStore.currentProfilePubkey = pk;
      profileStore.currentProfileData.pubkey = pk;
      profileStore.currentProfileData.npub = `npub1${pk.slice(0, 10)}...`;

      // 1. Instant 0ms cache restore: follows
      if (typeof localStorage !== "undefined") {
        try {
          const rawFollows = localStorage.getItem(`omni_people_follows_${pk}`);
          if (rawFollows) {
            const tags = JSON.parse(rawFollows);
            if (Array.isArray(tags)) {
              profileStore.schemaFollowsSet.clear();
              for (const t of tags) {
                if (t[0] === "p" && t[1]) profileStore.schemaFollowsSet.add(t[1]);
              }
            }
          }
        } catch (_) {}

        // 2. Instant 0ms cache restore: profile metadata
        try {
          const rawCache = localStorage.getItem(PROFILE_CACHE_KEY);
          if (rawCache) {
            const records = JSON.parse(rawCache);
            const entry = records[pk]?.meta || records[pk];
            if (entry && typeof entry === "object") {
              profileStore.currentProfileData = {
                ...profileStore.currentProfileData,
                ...entry,
                name: entry.display_name || entry.name || profileStore.currentProfileData.name,
                displayName: entry.display_name || entry.name || profileStore.currentProfileData.displayName
              };
            }
          }
        } catch (_) {}
      }

      if (profileStore.schemaFollowsSet.size > 0) {
        fetchMissingSchemaProfiles(Array.from(profileStore.schemaFollowsSet));
      }

      // 3. Parse route view/pubkey and active profile target
      try {
        const searchParams = getInitialRouteParams();
        let targetPk = searchParams.get("pubkey");
        if (!targetPk && typeof localStorage !== "undefined") {
          try {
            const stored = localStorage.getItem("omni_active_profile_pubkey");
            if (stored && stored !== pk) {
              targetPk = stored;
              localStorage.removeItem("omni_active_profile_pubkey");
            }
          } catch (_) {}
        }
        if (targetPk && targetPk !== pk) {
          const cached = profileStore.schemaProfileCache.get(targetPk);
          profileStore.schemaTargetUser = {
            pubkey: targetPk,
            name: cached?.display_name || cached?.name || `User ${targetPk.slice(0, 8)}`,
            about: cached?.about || "Nostr user",
            picture: cached?.picture || "",
            nip05: cached?.nip05 || "",
            isFollowing: profileStore.schemaFollowsSet.has(targetPk)
          };
          profileStore.currentSchemaTab = "user-profile";
          profileStore.schemaUserNotes = [];
          loadCachedNotesForPubkey(targetPk);
          sendSchemaWs(["REQ", `pv_schema_target_${Date.now()}`, { kinds: [0], authors: [targetPk], limit: 1 }]);
          if (profileStore.schemaActiveNotesSubId) {
            try { sendSchemaWs(["CLOSE", profileStore.schemaActiveNotesSubId]); } catch (_) {}
          }
          const targetNotesSubId = `pv_schema_target_notes_${Date.now()}`;
          profileStore.schemaActiveNotesSubId = targetNotesSubId;
          sendSchemaWs(["REQ", targetNotesSubId, { kinds: [1], authors: [targetPk], limit: 20 }]);
        } else if (searchParams.get("view") === "edit") {
          profileStore.currentSchemaTab = "edit";
        } else if (searchParams.get("view") === "following") {
          profileStore.currentSchemaTab = "following";
        } else if (searchParams.get("view") === "keys") {
          profileStore.currentSchemaTab = "keys";
        }
      } catch (_) {}

      // 4. Start live relay subscriptions
      startSchemaSubscriptions(pk);
    }
  } catch (_) {}
}

// Wire store reactive updates to automatically refresh Schema
onProfileStoreUpdate(() => {
  dispatchCurrentSchema();
});

const rootContext: any =
  (typeof window !== "undefined" ? window : null) ||
  (typeof self !== "undefined" ? self : null) ||
  (typeof globalThis !== "undefined" ? globalThis : null);

if (rootContext && typeof rootContext.addEventListener === "function") {
  rootContext.addEventListener("omni:action", async (event: any) => {
    const detail = event.detail || event;
    if (detail?.__fromSchemaBus) return;
    const action = detail.action;
    const payload = detail.payload;
    if (action) {
      const next = await handleProfileViewerAction(action, payload, initSchemaData);
      dispatchProfileSchema(next);
    }
  });

  rootContext.addEventListener("message", async (event: MessageEvent) => {
    const data = event.data;
    if (!data) return;

    if (data.type === "omni:init") {
      const pubkey = data.payload?.userPubkey;
      await initSchemaData(pubkey);
      dispatchCurrentSchema();
      return;
    }

    if ((data.type === "omni:action" || data.type === "action") && data.action) {
      const next = await handleProfileViewerAction(data.action, data.payload, initSchemaData);
      dispatchProfileSchema(next);
    }
  });

  rootContext.addEventListener("omni:intent", async (event: any) => {
    const detail = event.detail;
    if (detail && (detail.action === "view_profile" || detail.action === "view-profile")) {
      const pubkey = detail.data?.pubkey;
      if (pubkey && pubkey !== profileStore.currentProfilePubkey) {
        const next = await handleProfileViewerAction({
          name: "view_profile",
          payload: {
            pubkey,
            isFromIntent: true,
            isAlreadyActive: Boolean(detail.data?.isAlreadyActive)
          }
        }, undefined, initSchemaData);
        dispatchProfileSchema(next);
      } else {
        const next = await handleProfileViewerAction({
          name: "switch-tab",
          payload: { tab: "my-profile" }
        }, undefined, initSchemaData);
        dispatchProfileSchema(next);
      }
    }
  });

  rootContext.addEventListener("nostr:keychanged", async (e: any) => {
    if (e.detail?.pubkey) {
      profileStore.currentProfilePubkey = e.detail.pubkey;
      profileStore.currentProfileData.pubkey = e.detail.pubkey;
      profileStore.currentProfileData.npub = `npub1${e.detail.pubkey.slice(0, 10)}...`;
      await initSchemaData(e.detail.pubkey);
      dispatchCurrentSchema();
    }
  });

  rootContext.addEventListener("popstate", (event: any) => {
    const state = event?.state ?? event?.detail?.state;
    const targetTab =
      state?.tab ||
      (state?.pluginState && state.pluginState.tab) ||
      (state?.from as string) ||
      (state === null ? "my-profile" : (profileStore.schemaPreviousTab || "my-profile"));
    const targetPk = state?.pubkey || (state?.pluginState && state.pluginState.pubkey);
    profileStore.schemaPreviousTab = (state?.from as string) || null;
    profileStore.schemaPushedHistory = false;
    if (targetTab === "user-profile" && targetPk) {
      handleProfileViewerAction(
        { name: "view_profile", payload: { pubkey: targetPk, fromPopState: true } },
        undefined,
        initSchemaData
      ).then(dispatchProfileSchema);
    } else {
      profileStore.currentSchemaTab = targetTab;
      profileStore.schemaTargetUser = null;
      dispatchCurrentSchema();
    }
  });

  (async () => {
    await initSchemaData();
    dispatchCurrentSchema();
  })();
}
