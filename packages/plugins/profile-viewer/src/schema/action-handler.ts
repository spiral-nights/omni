import { OmniAction, OmniComponentNode } from "@omni/types";
import {
  profileStore,
  getOrCreateNoteStats,
  loadSchemaProfileCache,
  PROFILE_CACHE_KEY
} from "../state/profile-store.js";
import { sendSchemaWs } from "../net/relay-sync.js";
import { getProfileSchema } from "./profile-schema.js";

export async function handleProfileViewerAction(
  action: OmniAction,
  payload?: Record<string, unknown>,
  initSchemaFn?: (pk?: string) => Promise<void>
): Promise<OmniComponentNode> {
  const actName = action.name;
  if (actName === "switch-tab" || actName === "back") {
    const isBack = Boolean(payload?.isBack || action.payload?.isBack || actName === "back");
    const fromPopState = Boolean(payload?.fromPopState || action.payload?.fromPopState);
    const previousTabBeforeSwitch = profileStore.currentSchemaTab;
    const requestedTab = String(
      payload?.tab || payload?.value || action.payload?.tab || (isBack ? (profileStore.schemaPreviousTab || "following") : "my-profile")
    );
    profileStore.currentSchemaTab = requestedTab;
    if (profileStore.currentSchemaTab !== "user-profile") {
      profileStore.schemaTargetUser = null;
    }
    if (isBack) {
      profileStore.schemaPreviousTab = null;
      try {
        const rootHist =
          (typeof window !== "undefined" ? window.history : null) ||
          (typeof self !== "undefined" ? (self as any).history : null) ||
          (typeof globalThis !== "undefined" ? (globalThis as any).history : null);
        if (rootHist && typeof rootHist.back === "function") {
          rootHist.back();
        }
      } catch (_) {}
    } else if (!fromPopState && profileStore.currentSchemaTab !== "user-profile" && requestedTab !== previousTabBeforeSwitch) {
      try {
        const rootHist =
          (typeof window !== "undefined" ? window.history : null) ||
          (typeof self !== "undefined" ? (self as any).history : null) ||
          (typeof globalThis !== "undefined" ? (globalThis as any).history : null);
        if (rootHist && typeof rootHist.pushState === "function") {
          rootHist.pushState({ tab: requestedTab }, "", `?tab=${requestedTab}`);
        }
      } catch (_) {}
    }
    if (profileStore.currentSchemaTab === "my-profile" && profileStore.currentProfilePubkey) {
      profileStore.schemaUserNotes = [];
      sendSchemaWs(["REQ", `pv_schema_my_notes_${Date.now()}`, { kinds: [1], authors: [profileStore.currentProfilePubkey], limit: 20 }]);
    }
  } else if (actName === "save-profile") {
    const updated = {
      name: String(payload?.name ?? profileStore.currentProfileData.name ?? ""),
      displayName: String(payload?.name ?? profileStore.currentProfileData.name ?? ""),
      about: String(payload?.about ?? profileStore.currentProfileData.about ?? ""),
      picture: String(payload?.picture ?? profileStore.currentProfileData.picture ?? ""),
      nip05: String(payload?.nip05 ?? profileStore.currentProfileData.nip05 ?? ""),
      lud16: String(payload?.lud16 ?? profileStore.currentProfileData.lud16 ?? "")
    };
    profileStore.currentProfileData = { ...profileStore.currentProfileData, ...updated };
    if (profileStore.currentProfilePubkey && typeof localStorage !== "undefined") {
      try {
        const rawCache = localStorage.getItem(PROFILE_CACHE_KEY);
        const records = rawCache ? JSON.parse(rawCache) : {};
        records[profileStore.currentProfilePubkey] = { meta: profileStore.currentProfileData, timestamp: Date.now() };
        localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(records));
      } catch (_) {}
    }
    try {
      const rootObj =
        (typeof window !== "undefined" ? (window as any) : null) ||
        (typeof self !== "undefined" ? (self as any) : null);
      const nostrObj = rootObj?.nostr;
      if (nostrObj && typeof nostrObj.signEvent === "function") {
        const ev = {
          kind: 0,
          created_at: Math.floor(Date.now() / 1000),
          tags: [],
          content: JSON.stringify(profileStore.currentProfileData)
        };
        const signed = await nostrObj.signEvent(ev);
        sendSchemaWs(["EVENT", signed]);
      }
    } catch (_) {}
    profileStore.currentSchemaTab = "my-profile";
  } else if (actName === "switch-key") {
    const rawKey = String(payload?.keyInput || payload?.key || payload?.value || "").trim();
    if (rawKey) {
      try {
        const rootObj =
          (typeof window !== "undefined" ? (window as any) : null) ||
          (typeof self !== "undefined" ? (self as any) : null);
        const authApi = rootObj?.omni?.auth;
        if (authApi && typeof authApi.switchKey === "function") {
          const res = await authApi.switchKey(rawKey);
          if (res && res.pubkey) {
            profileStore.currentProfilePubkey = res.pubkey;
            profileStore.currentProfileData.pubkey = res.pubkey;
            profileStore.currentProfileData.npub = res.npub || `npub1${res.pubkey.slice(0, 10)}...`;
            if (initSchemaFn) {
              await initSchemaFn(res.pubkey);
            }
          }
        }
      } catch (_) {}
    }
    profileStore.currentSchemaTab = "my-profile";
  } else if (actName === "generate-key") {
    try {
      const rootObj =
        (typeof window !== "undefined" ? (window as any) : null) ||
        (typeof self !== "undefined" ? (self as any) : null);
      const authApi = rootObj?.omni?.auth;
      if (authApi && typeof authApi.generateKey === "function") {
        const res = await authApi.generateKey();
        if (res && res.pubkey) {
          profileStore.currentProfilePubkey = res.pubkey;
          profileStore.currentProfileData.pubkey = res.pubkey;
          profileStore.currentProfileData.npub = res.npub || `npub1${res.pubkey.slice(0, 10)}...`;
          if (initSchemaFn) {
            await initSchemaFn(res.pubkey);
          }
        }
      }
    } catch (_) {}
    profileStore.currentSchemaTab = "my-profile";
  } else if (actName === "follow") {
    const targetPk = String(payload?.pubkey || action.payload?.pubkey || "");
    if (targetPk) {
      profileStore.schemaFollowsSet.add(targetPk);
      if (profileStore.schemaTargetUser) profileStore.schemaTargetUser.isFollowing = true;
      if (profileStore.currentProfilePubkey && typeof localStorage !== "undefined") {
        try {
          const tags = Array.from(profileStore.schemaFollowsSet).map((pk) => ["p", pk]);
          localStorage.setItem(`omni_people_follows_${profileStore.currentProfilePubkey}`, JSON.stringify(tags));
        } catch (_) {}
      }
      try {
        const rootObj =
          (typeof window !== "undefined" ? (window as any) : null) ||
          (typeof self !== "undefined" ? (self as any) : null);
        const nostrObj = rootObj?.nostr;
        if (nostrObj && typeof nostrObj.signEvent === "function") {
          const tags = Array.from(profileStore.schemaFollowsSet).map((pk) => ["p", pk]);
          const ev = {
            kind: 3,
            created_at: Math.floor(Date.now() / 1000),
            tags,
            content: ""
          };
          const signed = await nostrObj.signEvent(ev);
          sendSchemaWs(["EVENT", signed]);
        }
      } catch (_) {}
    }
  } else if (actName === "unfollow") {
    const targetPk = String(payload?.pubkey || action.payload?.pubkey || "");
    if (targetPk) {
      profileStore.schemaFollowsSet.delete(targetPk);
      if (profileStore.schemaTargetUser) profileStore.schemaTargetUser.isFollowing = false;
      if (profileStore.currentProfilePubkey && typeof localStorage !== "undefined") {
        try {
          const tags = Array.from(profileStore.schemaFollowsSet).map((pk) => ["p", pk]);
          localStorage.setItem(`omni_people_follows_${profileStore.currentProfilePubkey}`, JSON.stringify(tags));
        } catch (_) {}
      }
      try {
        const rootObj =
          (typeof window !== "undefined" ? (window as any) : null) ||
          (typeof self !== "undefined" ? (self as any) : null);
        const nostrObj = rootObj?.nostr;
        if (nostrObj && typeof nostrObj.signEvent === "function") {
          const tags = Array.from(profileStore.schemaFollowsSet).map((pk) => ["p", pk]);
          const ev = {
            kind: 3,
            created_at: Math.floor(Date.now() / 1000),
            tags,
            content: ""
          };
          const signed = await nostrObj.signEvent(ev);
          sendSchemaWs(["EVENT", signed]);
        }
      } catch (_) {}
    }
  } else if (actName === "view_profile" || actName === "view-profile") {
    const targetPk = String(payload?.pubkey || action.payload?.pubkey || "");
    const fromPopState = Boolean(payload?.fromPopState || action.payload?.fromPopState);
    const isFromIntent = Boolean(payload?.isFromIntent || action.payload?.isFromIntent);
    if (targetPk) {
      const wasAlreadyViewingSameProfile =
        profileStore.currentSchemaTab === "user-profile" && profileStore.schemaTargetUser?.pubkey === targetPk;
      const wasAlreadyViewingAnyProfile =
        profileStore.currentSchemaTab === "user-profile" && Boolean(profileStore.schemaTargetUser);
      const isAlreadyActive = Boolean(payload?.isAlreadyActive || action.payload?.isAlreadyActive);
      const shouldReplace = isFromIntent && (!isAlreadyActive || !wasAlreadyViewingAnyProfile);

      if (profileStore.currentSchemaTab !== "user-profile") {
        profileStore.schemaPreviousTab = profileStore.currentSchemaTab || "following";
      }
      loadSchemaProfileCache();
      const cached = profileStore.schemaProfileCache.get(targetPk);
      profileStore.schemaTargetUser = {
        pubkey: targetPk,
        name: cached?.display_name || cached?.name || `User ${targetPk.slice(0, 8)}`,
        about: cached?.about || "Nostr user",
        picture: cached?.picture || "",
        nip05: cached?.nip05 || "",
        isFollowing: profileStore.schemaFollowsSet.has(targetPk)
      };
      if (typeof localStorage !== "undefined" && !cached) {
        try {
          const raw = localStorage.getItem(PROFILE_CACHE_KEY);
          if (raw) {
            const records = JSON.parse(raw);
            const entry = records[targetPk]?.meta || records[targetPk];
            if (entry) {
              profileStore.schemaProfileCache.set(targetPk, entry);
              profileStore.schemaTargetUser = {
                ...profileStore.schemaTargetUser,
                name: entry.display_name || entry.name || profileStore.schemaTargetUser.name,
                about: entry.about ?? profileStore.schemaTargetUser.about,
                picture: entry.picture || "",
                nip05: entry.nip05 || ""
              };
            }
          }
        } catch (_) {}
      }
      profileStore.currentSchemaTab = "user-profile";
      profileStore.schemaUserNotes = [];

      if (!fromPopState) {
        try {
          const rootHist =
            (typeof window !== "undefined" ? window.history : null) ||
            (typeof self !== "undefined" ? (self as any).history : null) ||
            (typeof globalThis !== "undefined" ? (globalThis as any).history : null);
          const nextState = {
            type: "omni-people-view",
            tab: "user-profile",
            pubkey: targetPk,
            from: profileStore.schemaPreviousTab || "following"
          };
          if (rootHist) {
            if (shouldReplace && typeof rootHist.replaceState === "function") {
              rootHist.replaceState(nextState, "", `?view=user-profile&pubkey=${targetPk}`);
            } else if (!wasAlreadyViewingSameProfile && typeof rootHist.pushState === "function") {
              profileStore.schemaPushedHistory = true;
              rootHist.pushState(nextState, "", `?view=user-profile&pubkey=${targetPk}`);
            }
          }
        } catch (_) {}
      }

      sendSchemaWs(["REQ", `pv_schema_target_${Date.now()}`, { kinds: [0], authors: [targetPk], limit: 1 }]);
      sendSchemaWs(["REQ", `pv_schema_target_notes_${Date.now()}`, { kinds: [1], authors: [targetPk], limit: 20 }]);
    }
  } else if (actName === "view_note" || actName === "view-note" || actName === "view-thread") {
    const noteId = String(payload?.id || payload?.eventId || action.payload?.id || action.payload?.eventId || "");
    let noteData: any = payload?.note || action.payload?.note || profileStore.schemaUserNotes.find((n) => n.id === noteId);
    if (noteId) {
      const stats = getOrCreateNoteStats(noteId);
      if (noteData) {
        noteData = {
          ...noteData,
          likes: noteData.likes !== undefined ? noteData.likes : stats.likes,
          replies: noteData.replies !== undefined ? noteData.replies : stats.replies,
          reposts: noteData.reposts !== undefined ? noteData.reposts : stats.reposts,
          zaps: noteData.zaps !== undefined ? noteData.zaps : stats.zaps,
          liked: noteData.liked !== undefined ? noteData.liked : stats.liked,
          reposted: noteData.reposted !== undefined ? noteData.reposted : stats.reposted
        };
      }
      try {
        localStorage.setItem("omni_active_note_id", noteId);
        if (noteData) {
          localStorage.setItem("omni_active_note_data", JSON.stringify(noteData));
        }
      } catch (_) {}
      const rootObj = (typeof window !== "undefined" ? (window as any) : null) || (typeof self !== "undefined" ? (self as any) : null);
      if (rootObj?.omni?.intents?.dispatch) {
        try {
          const res = rootObj.omni.intents.dispatch("view_note", { id: noteId, eventId: noteId, note: noteData });
          if (res && typeof res.catch === "function") {
            res.catch(() => {});
          }
        } catch (_) {}
      } else if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new CustomEvent("omni:intent", { detail: { action: "view_note", data: { id: noteId, eventId: noteId, note: noteData } } }));
        window.dispatchEvent(new CustomEvent("intent", { detail: { action: "view_note", data: { id: noteId, eventId: noteId, note: noteData } } }));
      }
    }
  } else if (actName === "like-note") {
    const id = String(payload?.id || action.payload?.id || "");
    const note = profileStore.schemaUserNotes.find((n) => n.id === id);
    const stats = getOrCreateNoteStats(id);
    if (note) {
      note.liked = !note.liked;
      note.likes = (note.likes || 0) + (note.liked ? 1 : -1);
      stats.liked = note.liked;
      stats.likes = note.likes;
    } else {
      stats.liked = !stats.liked;
      stats.likes = (stats.likes || 0) + (stats.liked ? 1 : -1);
    }
    try {
      const rootObj = (typeof window !== "undefined" ? (window as any) : null) || (typeof self !== "undefined" ? (self as any) : null);
      const nostrObj = rootObj?.nostr;
      if (nostrObj && typeof nostrObj.signEvent === "function" && stats.liked) {
        const ev = {
          kind: 7,
          created_at: Math.floor(Date.now() / 1000),
          tags: [["e", id], ["p", note?.pubkey || ""]],
          content: "+"
        };
        nostrObj.signEvent(ev).then((signed: any) => {
          if (signed) sendSchemaWs(["EVENT", signed]);
        }).catch(() => {});
      }
    } catch (_) {}
  } else if (actName === "repost-note") {
    const id = String(payload?.id || action.payload?.id || "");
    const note = profileStore.schemaUserNotes.find((n) => n.id === id);
    const stats = getOrCreateNoteStats(id);
    if (note) {
      note.reposted = !note.reposted;
      note.reposts = (note.reposts || 0) + (note.reposted ? 1 : -1);
      stats.reposted = note.reposted;
      stats.reposts = note.reposts;
    } else {
      stats.reposted = !stats.reposted;
      stats.reposts = (stats.reposts || 0) + (stats.reposted ? 1 : -1);
    }
    try {
      const rootObj = (typeof window !== "undefined" ? (window as any) : null) || (typeof self !== "undefined" ? (self as any) : null);
      const nostrObj = rootObj?.nostr;
      if (nostrObj && typeof nostrObj.signEvent === "function" && stats.reposted) {
        const ev = {
          kind: 6,
          created_at: Math.floor(Date.now() / 1000),
          tags: [["e", id], ["p", note?.pubkey || ""]],
          content: note ? JSON.stringify(note) : ""
        };
        nostrObj.signEvent(ev).then((signed: any) => {
          if (signed) sendSchemaWs(["EVENT", signed]);
        }).catch(() => {});
      }
    } catch (_) {}
  } else if (actName === "zap-note") {
    const id = String(payload?.id || action.payload?.id || "");
    const note = profileStore.schemaUserNotes.find((n) => n.id === id);
    if (note) {
      note.zaps = (note.zaps || 0) + 21;
    }
  }

  return getProfileSchema(profileStore.currentSchemaTab, profileStore.currentProfileData, {
    activeTab: profileStore.currentSchemaTab,
    targetUser: profileStore.schemaTargetUser,
    isFollowing: profileStore.schemaTargetUser?.isFollowing,
    follows: Array.from(profileStore.schemaFollowsSet).map((pk) => ({ pubkey: pk })),
    followsCount: profileStore.schemaFollowsSet.size
  });
}
