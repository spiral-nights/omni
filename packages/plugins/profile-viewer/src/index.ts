/// <reference types="@omni/types" />
import {
  OmniCardPrimitive,
  OmniComponentNode,
  OmniAction,
  OmniMetricPrimitive,
  OmniBoxPrimitive,
  OmniTabsPrimitive,
  OmniTabItem,
  OmniStatusIndicatorPrimitive,
  OmniBannerPrimitive,
  OmniCodeBlockPrimitive
} from "@omni/types";


const PROFILE_CACHE_KEY = "omni_profile_viewer_cache_v2";
const PROFILE_CACHE_TTL = 14 * 24 * 60 * 60 * 1000; // 14 days expiration (2 weeks)

let currentSchemaTab = "my-profile";
let schemaPreviousTab: string | null = null;
let schemaPushedHistory = false;
let currentProfilePubkey = "";
let currentProfileData: Record<string, any> = {
  name: "",
  displayName: "",
  about: "",
  picture: "",
  nip05: "",
  lud16: "",
  pubkey: "",
  npub: ""
};
let schemaFollowsSet: Set<string> = new Set();
let schemaProfileCache: Map<string, any> = new Map();
let schemaUserNotes: any[] = [];
let schemaTargetUser: Record<string, any> | null = null;
let schemaWs: WebSocket | null = null;
let schemaUpdateTimer: any = null;
let persistCacheTimer: any = null;
const queriedAuthorsSet = new Set<string>();

function loadSchemaProfileCache() {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (raw) {
      const records = JSON.parse(raw);
      for (const [pk, val] of Object.entries(records)) {
        const meta = (val as any)?.meta || val;
        if (meta && typeof meta === "object") {
          schemaProfileCache.set(pk, meta);
        }
      }
    }
  } catch (_) {}
}

function persistSchemaProfileCache() {
  if (typeof localStorage === "undefined") return;
  if (persistCacheTimer) return;
  persistCacheTimer = setTimeout(() => {
    persistCacheTimer = null;
    try {
      const raw = localStorage.getItem(PROFILE_CACHE_KEY);
      const records = raw ? JSON.parse(raw) : {};
      const now = Date.now();
      for (const [pk, meta] of schemaProfileCache.entries()) {
        records[pk] = { meta, timestamp: now };
      }
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(records));
    } catch (_) {}
  }, 300);
}

function scheduleSchemaUpdate() {
  if (schemaUpdateTimer) return;
  schemaUpdateTimer = setTimeout(() => {
    schemaUpdateTimer = null;
    dispatchCurrentSchema();
  }, 100);
}

function fetchMissingSchemaProfiles(pubkeys: string[]) {
  if (typeof WebSocket === "undefined") return;
  if (typeof navigator !== "undefined" && navigator.userAgent && (navigator.userAgent.includes("happy-dom") || navigator.userAgent.includes("jsdom"))) {
    return;
  }
  const toFetch = pubkeys.filter((pk) => pk && !schemaProfileCache.has(pk) && !queriedAuthorsSet.has(pk));
  if (toFetch.length === 0) return;

  for (const pk of toFetch) {
    queriedAuthorsSet.add(pk);
  }

  for (let i = 0; i < toFetch.length; i += 50) {
    const chunk = toFetch.slice(i, i + 50);
    sendSchemaWs(["REQ", `pv_batch_${Date.now()}_${i}`, { kinds: [0], authors: chunk, limit: chunk.length }]);
  }
}

export function getProfileSchema(
  view = "widget",
  profile?: Record<string, any>,
  extraState?: Record<string, any>
): OmniComponentNode {
  loadSchemaProfileCache();
  const p = profile || currentProfileData;
  const pubkey = p?.pubkey || currentProfilePubkey || "";
  const name =
    p?.display_name ||
    p?.displayName ||
    p?.name ||
    (pubkey ? `User ${pubkey.slice(0, 8)}` : "Nostr User");
  const about =
    p?.about ||
    (pubkey ? "Decentralized Nostr identity." : "Decentralized identity on Nostr");
  const picture = p?.picture || p?.avatar || "";
  const nip05 = p?.nip05 || "";
  const lud16 = p?.lud16 || "";
  const npub = p?.npub || (pubkey ? `npub1${pubkey.slice(0, 10)}...` : "");
  const followsCount = Array.isArray(extraState?.follows)
    ? extraState?.follows.length
    : (extraState?.followsCount ?? schemaFollowsSet.size);
  const activeTab =
    extraState?.activeTab ||
    (view === "keys" || view === "following" || view === "edit" || view === "settings" || view === "my-profile" || view === "user-profile"
      ? (view === "settings" ? "edit" : view)
      : currentSchemaTab);

  if (view === "compact") {
    return {
      type: "metric",
      label: "Identity",
      value: name,
      subtext: pubkey ? `${pubkey.slice(0, 8)}...` : "Active"
    };
  }

  if (view === "widget") {
    return {
      type: "card",
      title: "Active Identity",
      icon: "user",
      children: [
        {
          type: "box",
          direction: "row",
          gap: "md",
          align: "center",
          children: [
            {
              type: "avatar",
              name,
              src: picture,
              pubkey,
              size: "md"
            },
            {
              type: "box",
              direction: "column",
              gap: "xs",
              children: [
                {
                  type: "text",
                  content: name,
                  variant: "title"
                },
                {
                  type: "text",
                  content: about,
                  variant: "caption",
                  tone: "muted",
                  truncate: true
                }
              ]
            }
          ]
        },
        {
          type: "button",
          label: "View Profile",
          variant: "secondary",
          action: {
            name: "open-profile",
            navigate: {
              pluginId: "org.omni.plugin.profile-viewer",
              view: "app"
            }
          }
        }
      ]
    };
  }

  // Full Page Application View (Tabs: My Profile, Edit Metadata, Key Custody, Following)
  const isViewingOtherUser = activeTab === "user-profile" && (extraState?.targetUser || schemaTargetUser);
  const targetUser = extraState?.targetUser || schemaTargetUser || {};

  const tabs: OmniTabItem[] = [
    { id: "my-profile", label: "My Profile", icon: "user" },
    { id: "edit", label: "Edit Metadata", icon: "edit" },
    { id: "keys", label: "Key Custody", icon: "key" },
    { id: "following", label: "Following", icon: "users", badge: followsCount }
  ];
  if (isViewingOtherUser) {
    tabs.unshift({ id: "user-profile", label: targetUser.name || "User Profile", icon: "user" });
  }

  const renderSchemaNoteCard = (note: any, authorName: string, authorPubkey: string): OmniComponentNode => {
    const timeStr = note.created_at
      ? new Date(note.created_at * 1000).toLocaleString([], { dateStyle: "short", timeStyle: "short" })
      : "Recent";
    const npubShort = authorPubkey ? `npub1${authorPubkey.slice(0, 8)}...` : "";

    const notePayload = {
      id: note.id,
      eventId: note.id,
      note: {
        id: note.id,
        pubkey: authorPubkey,
        authorName,
        npub: npubShort,
        avatar: note.avatar,
        content: note.content || "",
        created_at: note.created_at,
        likes: note.likes || 0,
        reposts: note.reposts || 0,
        replies: note.replies || 0,
        zaps: note.zaps || 0
      }
    };

    return {
      type: "card",
      action: { name: "view_note", payload: notePayload },
      children: [
        {
          type: "box",
          direction: "row",
          justify: "between",
          align: "center",
          children: [
            {
              type: "box",
              direction: "row",
              gap: "sm",
              align: "center",
              children: [
                {
                  type: "avatar",
                  pubkey: authorPubkey,
                  name: authorName,
                  size: "sm"
                },
                {
                  type: "box",
                  direction: "column",
                  gap: "xs",
                  children: [
                    {
                      type: "text",
                      content: authorName,
                      variant: "body",
                      tone: "primary"
                    },
                    {
                      type: "text",
                      content: npubShort ? `${timeStr} · ${npubShort}` : timeStr,
                      variant: "caption",
                      tone: "muted"
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          type: "text",
          content: note.content || "",
          variant: "body",
          action: { name: "view_note", payload: notePayload }
        },
        {
          type: "divider"
        },
        {
          type: "box",
          direction: "row",
          justify: "between",
          align: "center",
          children: [
            {
              type: "button",
              variant: "ghost",
              size: "sm",
              icon: "reply",
              label: String(note.replies || "0"),
              action: { name: "view_note", payload: notePayload }
            },
            {
              type: "button",
              variant: note.reposted ? "secondary" : "ghost",
              size: "sm",
              icon: "repeat",
              label: String(note.reposts || "0"),
              action: { name: "repost-note", payload: { id: note.id } }
            },
            {
              type: "button",
              variant: note.liked ? "secondary" : "ghost",
              size: "sm",
              icon: "heart",
              label: String(note.likes || "0"),
              action: { name: "like-note", payload: { id: note.id } }
            },
            {
              type: "button",
              variant: "ghost",
              size: "sm",
              icon: "zap",
              label: String(note.zaps || "0"),
              action: { name: "zap-note", payload: { id: note.id } }
            }
          ]
        }
      ]
    };
  };

  const tabsNode: OmniTabsPrimitive = {
    type: "tabs",
    activeTab,
    tabs,
    action: { name: "switch-tab" }
  };

  const children: OmniComponentNode[] = [tabsNode];

  if (activeTab === "user-profile" && isViewingOtherUser) {
    const isFollowing = extraState?.isFollowing ?? targetUser.isFollowing;
    const backTarget = schemaPreviousTab === "blocked" ? "blocked" : "following";
    const backLabel = schemaPreviousTab === "blocked" ? "← Back to Blocked" : "← Back to Following";
    children.push({
      type: "box",
      direction: "row",
      justify: "between",
      align: "center",
      children: [
        {
          type: "button",
          label: backLabel,
          variant: "secondary",
          size: "sm",
          action: { name: "switch-tab", payload: { tab: backTarget, isBack: true } }
        }
      ]
    });

    children.push({
      type: "box",
      direction: "row",
      justify: "between",
      align: "center",
      children: [
        {
          type: "box",
          direction: "row",
          gap: "md",
          align: "center",
          children: [
            {
              type: "avatar",
              name: targetUser.name || "Nostr User",
              src: targetUser.picture || "",
              pubkey: targetUser.pubkey || "",
              size: "lg"
            },
            {
              type: "box",
              direction: "column",
              gap: "xs",
              children: [
                { type: "text", content: targetUser.name || "Nostr User", variant: "title" },
                { type: "text", content: targetUser.about || "Decentralized Nostr user", variant: "body", tone: "muted" }
              ]
            }
          ]
        },
        {
          type: "button",
          label: isFollowing ? "Unfollow" : "+ Follow",
          variant: isFollowing ? "secondary" : "primary",
          action: {
            name: isFollowing ? "unfollow" : "follow",
            payload: { pubkey: targetUser.pubkey }
          }
        }
      ]
    });

    if (targetUser.nip05) {
      children.push({
        type: "box",
        direction: "row",
        align: "center",
        gap: "xs",
        children: [
          { type: "badge", label: targetUser.nip05, tone: "accent" }
        ]
      });
    }

    if (targetUser.pubkey) {
      children.push({
        type: "code-block",
        code: targetUser.pubkey,
        language: "text"
      });
    }

    children.push({
      type: "divider"
    });

    children.push({
      type: "text",
      content: "Recent Posts",
      variant: "title"
    });

    if (schemaUserNotes.length === 0) {
      children.push({
        type: "banner",
        tone: "info",
        message: "No posts found for this user."
      });
    } else {
      for (const note of schemaUserNotes) {
        children.push(renderSchemaNoteCard(note, targetUser.name || "User", targetUser.pubkey || note.pubkey));
      }
    }
  } else if (activeTab === "edit") {
    children.push({
      type: "banner",
      tone: "info",
      title: "Public Nostr Identity (Kind 0)",
      message: "Update your public profile. Changes will be signed with your private key in local WebCrypto custody and published to the relay pool."
    });

    children.push({
      type: "box",
      direction: "column",
      gap: "sm",
      children: [
        {
          type: "input",
          name: "name",
          placeholder: "Display Name",
          value: name
        },
        {
          type: "input",
          name: "about",
          placeholder: "Bio / About Me",
          value: about
        },
        {
          type: "input",
          name: "picture",
          placeholder: "Avatar Image URL (https://...)",
          value: picture
        },
        {
          type: "input",
          name: "nip05",
          placeholder: "NIP-05 Identifier (e.g. user@domain.com)",
          value: nip05
        },
        {
          type: "input",
          name: "lud16",
          placeholder: "Lightning Address (e.g. user@getalby.com)",
          value: lud16
        },
        {
          type: "button",
          label: "Save & Publish Profile (Kind 0)",
          variant: "primary",
          action: { name: "save-profile" }
        }
      ]
    });
  } else if (activeTab === "keys") {
    children.push({
      type: "banner",
      tone: "info",
      title: "WebCrypto Keystore Custody (NIP-07)",
      message: "Omni stores your private keys locally in hardware-isolated WebCrypto custody. Plugins and nsites never access raw keys; they sign events through standard window.nostr."
    });

    children.push({
      type: "box",
      direction: "row",
      align: "center",
      justify: "between",
      children: [
        {
          type: "metric",
          label: "Active Public Key",
          value: pubkey ? `${pubkey.slice(0, 10)}...` : "None",
          subtext: "Hardware-isolated custody"
        },
        {
          type: "status-indicator",
          status: pubkey ? "online" : "offline",
          label: pubkey ? "Keystore Active" : "No Key Active",
          pulse: !!pubkey
        }
      ]
    });

    if (pubkey) {
      children.push({
        type: "code-block",
        code: npub || pubkey,
        language: "text"
      });
    }

    children.push({
      type: "box",
      direction: "column",
      gap: "sm",
      children: [
        {
          type: "input",
          name: "keyInput",
          placeholder: "nsec1... or 64-char hex private key to switch account"
        },
        {
          type: "box",
          direction: "row",
          gap: "sm",
          children: [
            {
              type: "button",
              label: "Switch Account",
              variant: "primary",
              action: { name: "switch-key" }
            },
            {
              type: "button",
              label: "Generate New Keypair",
              variant: "secondary",
              action: { name: "generate-key" }
            }
          ]
        }
      ]
    });
  } else if (activeTab === "following") {
    children.push({
      type: "banner",
      tone: "info",
      title: "Nostr Contact Graph (Kind 3)",
      message: "Decentralized list of public keys you follow across the network."
    });

    const followsList = Array.isArray(extraState?.follows)
      ? extraState?.follows
      : Array.from(schemaFollowsSet).map((pk) => ({ pubkey: pk }));

    if (followsList.length === 0) {
      children.push({
        type: "banner",
        tone: "info",
        message: "You are not following anyone yet."
      });
    } else {
      children.push({
        type: "list",
        items: followsList.map((f: any) => {
          const fPk = typeof f === "string" ? f : f.pubkey;
          const meta = schemaProfileCache.get(fPk);
          const fName =
            (typeof f === "object" && f.name && f.name !== `${fPk.slice(0, 8)}...` ? f.name : null) ||
            meta?.display_name ||
            meta?.name ||
            `User ${fPk.slice(0, 8)}`;
          const fAbout = (typeof f === "object" && f.about ? f.about : null) || meta?.about || "";
          const fPic = (typeof f === "object" && (f.picture || f.avatar) ? (f.picture || f.avatar) : null) || meta?.picture || "";
          const fNip05 = (typeof f === "object" && f.nip05 ? f.nip05 : null) || meta?.nip05 || "";

          return {
            type: "list-item",
            id: fPk,
            title: fName,
            subtitle: fAbout ? (fAbout.length > 80 ? fAbout.slice(0, 80) + "..." : fAbout) : (fNip05 || `${fPk.slice(0, 16)}...`),
            meta: fNip05 || `${fPk.slice(0, 8)}...`,
            avatarPubkey: fPk,
            onClickAction: {
              name: "view_profile",
              payload: { pubkey: fPk }
            },
            actions: [
              {
                type: "button",
                label: "Unfollow",
                size: "sm",
                variant: "secondary",
                action: { name: "unfollow", payload: { pubkey: fPk } }
              }
            ]
          };
        })
      });
    }
  } else {
    // "my-profile"
    children.push({
      type: "box",
      direction: "row",
      gap: "md",
      align: "center",
      children: [
        {
          type: "avatar",
          name,
          src: picture,
          pubkey,
          size: "lg"
        },
        {
          type: "box",
          direction: "column",
          gap: "xs",
          children: [
            { type: "text", content: name, variant: "title" },
            { type: "text", content: about, variant: "body", tone: "muted" }
          ]
        }
      ]
    });

    if (nip05) {
      children.push({
        type: "box",
        direction: "row",
        align: "center",
        gap: "xs",
        children: [
          { type: "badge", label: nip05, tone: "accent" }
        ]
      });
    }

    if (pubkey) {
      children.push({
        type: "code-block",
        code: npub || pubkey,
        language: "text"
      });
    }

    children.push({
      type: "box",
      direction: "row",
      gap: "md",
      children: [
        {
          type: "metric",
          label: "Following",
          value: followsCount,
          subtext: "Kind 3 contacts"
        },
        {
          type: "metric",
          label: "Relay Security",
          value: "NIP-07",
          subtext: "WebCrypto Custody"
        }
      ]
    });

    children.push({
      type: "box",
      direction: "row",
      gap: "sm",
      children: [
        {
          type: "button",
          label: "Edit Profile",
          variant: "primary",
          action: { name: "switch-tab", payload: { tab: "edit" } }
        },
        {
          type: "button",
          label: "Key Custody",
          variant: "secondary",
          action: { name: "switch-tab", payload: { tab: "keys" } }
        }
      ]
    });

    if (schemaUserNotes.length > 0) {
      children.push({
        type: "divider"
      });
      children.push({
        type: "text",
        content: "Recent Posts",
        variant: "title"
      });
      for (const note of schemaUserNotes) {
        children.push(renderSchemaNoteCard(note, name || "You", pubkey || note.pubkey));
      }
    }
  }

  return {
    type: "card",
    title: "Profiles & Key Custody",
    subtitle: "Decentralized Nostr identity and custody manager",
    icon: "users",
    children
  };
}

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

function sendSchemaWs(frame: any[]) {
  if (typeof WebSocket === "undefined") return;
  if (typeof navigator !== "undefined" && navigator.userAgent && (navigator.userAgent.includes("happy-dom") || navigator.userAgent.includes("jsdom"))) {
    return;
  }
  if (!schemaWs || schemaWs.readyState !== WebSocket.OPEN) {
    try {
      schemaWs = new WebSocket("wss://relay.damus.io");
      schemaWs.onopen = () => {
        try { schemaWs?.send(JSON.stringify(frame)); } catch (_) {}
      };
      schemaWs.onmessage = handleSchemaWsMessage;
    } catch (_) {}
    return;
  }
  try {
    schemaWs.send(JSON.stringify(frame));
  } catch (_) {}
}

function handleSchemaWsMessage(event: any) {
  try {
    const raw = event.data !== undefined ? event.data : event;
    const frame = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(frame)) return;
    const type = frame[0];
    if (type === "EVENT" && frame[2]) {
      const ev = frame[2];
      const k = Number(ev.kind);

      // Kind 0: Profile Metadata
      if (k === 0) {
        try {
          const meta = typeof ev.content === "string" ? JSON.parse(ev.content) : ev.content;
          if (ev.pubkey && meta && typeof meta === "object") {
            schemaProfileCache.set(ev.pubkey, meta);
            persistSchemaProfileCache();
          }

          if (currentProfilePubkey && ev.pubkey === currentProfilePubkey) {
            currentProfileData = {
              ...currentProfileData,
              ...meta,
              name: meta.display_name || meta.name || currentProfileData.name,
              displayName: meta.display_name || meta.name || currentProfileData.displayName,
              about: meta.about ?? currentProfileData.about,
              picture: meta.picture ?? currentProfileData.picture,
              banner: meta.banner ?? currentProfileData.banner,
              nip05: meta.nip05 ?? currentProfileData.nip05,
              lud16: meta.lud16 ?? currentProfileData.lud16,
              website: meta.website ?? currentProfileData.website
            };
            scheduleSchemaUpdate();
          } else if (schemaTargetUser && ev.pubkey === schemaTargetUser.pubkey) {
            schemaTargetUser = {
              ...schemaTargetUser,
              name: meta.display_name || meta.name || schemaTargetUser.name,
              about: meta.about ?? schemaTargetUser.about,
              picture: meta.picture ?? schemaTargetUser.picture,
              nip05: meta.nip05 ?? schemaTargetUser.nip05
            };
            scheduleSchemaUpdate();
          } else if (schemaFollowsSet.has(ev.pubkey)) {
            scheduleSchemaUpdate();
          }
        } catch (_) {}
      }

      // Kind 3: Contact List / Following
      else if (k === 3 && currentProfilePubkey && ev.pubkey === currentProfilePubkey) {
        schemaFollowsSet.clear();
        const tags = ev.tags || [];
        for (const tag of tags) {
          if (tag[0] === "p" && tag[1]) {
            schemaFollowsSet.add(tag[1]);
          }
        }
        if (typeof localStorage !== "undefined") {
          try {
            localStorage.setItem(`omni_people_follows_${currentProfilePubkey}`, JSON.stringify(tags));
          } catch (_) {}
        }
        fetchMissingSchemaProfiles(Array.from(schemaFollowsSet));
        scheduleSchemaUpdate();
      }

      // Kind 1: User notes
      else if (k === 1 && ev.id) {
        const activePk = currentSchemaTab === "user-profile" ? schemaTargetUser?.pubkey : (currentSchemaTab === "my-profile" ? currentProfilePubkey : "");
        if (activePk && ev.pubkey === activePk) {
          if (!schemaUserNotes.some((n) => n.id === ev.id)) {
            schemaUserNotes.push(ev);
            schemaUserNotes.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
            scheduleSchemaUpdate();
          }
        }
      }
    }
  } catch (_) {}
}

function startSchemaSubscriptions(pk: string) {
  if (typeof WebSocket === "undefined") return;
  if (typeof navigator !== "undefined" && navigator.userAgent && (navigator.userAgent.includes("happy-dom") || navigator.userAgent.includes("jsdom"))) {
    return;
  }
  try {
    const reqAll = () => {
      try {
        schemaWs?.send(JSON.stringify(["REQ", `pv_schema_prof_${Date.now()}`, { kinds: [0], authors: [pk], limit: 1 }]));
        schemaWs?.send(JSON.stringify(["REQ", `pv_schema_contacts_${Date.now()}`, { kinds: [3], authors: [pk], limit: 1 }]));
        schemaWs?.send(JSON.stringify(["REQ", `pv_schema_my_notes_${Date.now()}`, { kinds: [1], authors: [pk], limit: 20 }]));
        fetchMissingSchemaProfiles(Array.from(schemaFollowsSet));
      } catch (_) {}
    };

    if (!schemaWs || schemaWs.readyState === WebSocket.CLOSED) {
      schemaWs = new WebSocket("wss://relay.damus.io");
      schemaWs.onopen = () => reqAll();
      schemaWs.onmessage = handleSchemaWsMessage;
    } else if (schemaWs.readyState === WebSocket.OPEN) {
      reqAll();
    }
  } catch (_) {}
}

export async function handleProfileViewerAction(
  action: OmniAction,
  payload?: Record<string, unknown>
): Promise<OmniComponentNode> {
  const actName = action.name;
  if (actName === "switch-tab" || actName === "back") {
    const isBack = Boolean(payload?.isBack || action.payload?.isBack || actName === "back");
    const fromPopState = Boolean(payload?.fromPopState || action.payload?.fromPopState);
    const previousTabBeforeSwitch = currentSchemaTab;
    const requestedTab = String(
      payload?.tab || payload?.value || action.payload?.tab || (isBack ? (schemaPreviousTab || "following") : "my-profile")
    );
    currentSchemaTab = requestedTab;
    if (currentSchemaTab !== "user-profile") {
      schemaTargetUser = null;
    }
    if (isBack) {
      schemaPreviousTab = null;
      try {
        const rootHist =
          (typeof window !== "undefined" ? window.history : null) ||
          (typeof self !== "undefined" ? (self as any).history : null) ||
          (typeof globalThis !== "undefined" ? (globalThis as any).history : null);
        if (rootHist && typeof rootHist.back === "function") {
          rootHist.back();
        }
      } catch (_) {}
    } else if (!fromPopState && currentSchemaTab !== "user-profile" && requestedTab !== previousTabBeforeSwitch) {
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
    if (currentSchemaTab === "my-profile" && currentProfilePubkey) {
      schemaUserNotes = [];
      sendSchemaWs(["REQ", `pv_schema_my_notes_${Date.now()}`, { kinds: [1], authors: [currentProfilePubkey], limit: 20 }]);
    }
  } else if (actName === "save-profile") {
    const updated = {
      name: String(payload?.name ?? currentProfileData.name ?? ""),
      displayName: String(payload?.name ?? currentProfileData.name ?? ""),
      about: String(payload?.about ?? currentProfileData.about ?? ""),
      picture: String(payload?.picture ?? currentProfileData.picture ?? ""),
      nip05: String(payload?.nip05 ?? currentProfileData.nip05 ?? ""),
      lud16: String(payload?.lud16 ?? currentProfileData.lud16 ?? "")
    };
    currentProfileData = { ...currentProfileData, ...updated };
    if (currentProfilePubkey && typeof localStorage !== "undefined") {
      try {
        const rawCache = localStorage.getItem(PROFILE_CACHE_KEY);
        const records = rawCache ? JSON.parse(rawCache) : {};
        records[currentProfilePubkey] = { meta: currentProfileData, timestamp: Date.now() };
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
          content: JSON.stringify(currentProfileData)
        };
        const signed = await nostrObj.signEvent(ev);
        sendSchemaWs(["EVENT", signed]);
      }
    } catch (_) {}
    currentSchemaTab = "my-profile";
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
            currentProfilePubkey = res.pubkey;
            currentProfileData.pubkey = res.pubkey;
            currentProfileData.npub = res.npub || `npub1${res.pubkey.slice(0, 10)}...`;
            await initSchemaData(res.pubkey);
          }
        }
      } catch (_) {}
    }
    currentSchemaTab = "my-profile";
  } else if (actName === "generate-key") {
    try {
      const rootObj =
        (typeof window !== "undefined" ? (window as any) : null) ||
        (typeof self !== "undefined" ? (self as any) : null);
      const authApi = rootObj?.omni?.auth;
      if (authApi && typeof authApi.generateKey === "function") {
        const res = await authApi.generateKey();
        if (res && res.pubkey) {
          currentProfilePubkey = res.pubkey;
          currentProfileData.pubkey = res.pubkey;
          currentProfileData.npub = res.npub || `npub1${res.pubkey.slice(0, 10)}...`;
          await initSchemaData(res.pubkey);
        }
      }
    } catch (_) {}
    currentSchemaTab = "my-profile";
  } else if (actName === "follow") {
    const targetPk = String(payload?.pubkey || action.payload?.pubkey || "");
    if (targetPk) {
      schemaFollowsSet.add(targetPk);
      if (schemaTargetUser) schemaTargetUser.isFollowing = true;
      if (currentProfilePubkey && typeof localStorage !== "undefined") {
        try {
          const tags = Array.from(schemaFollowsSet).map((pk) => ["p", pk]);
          localStorage.setItem(`omni_people_follows_${currentProfilePubkey}`, JSON.stringify(tags));
        } catch (_) {}
      }
      try {
        const rootObj =
          (typeof window !== "undefined" ? (window as any) : null) ||
          (typeof self !== "undefined" ? (self as any) : null);
        const nostrObj = rootObj?.nostr;
        if (nostrObj && typeof nostrObj.signEvent === "function") {
          const tags = Array.from(schemaFollowsSet).map((pk) => ["p", pk]);
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
      schemaFollowsSet.delete(targetPk);
      if (schemaTargetUser) schemaTargetUser.isFollowing = false;
      if (currentProfilePubkey && typeof localStorage !== "undefined") {
        try {
          const tags = Array.from(schemaFollowsSet).map((pk) => ["p", pk]);
          localStorage.setItem(`omni_people_follows_${currentProfilePubkey}`, JSON.stringify(tags));
        } catch (_) {}
      }
      try {
        const rootObj =
          (typeof window !== "undefined" ? (window as any) : null) ||
          (typeof self !== "undefined" ? (self as any) : null);
        const nostrObj = rootObj?.nostr;
        if (nostrObj && typeof nostrObj.signEvent === "function") {
          const tags = Array.from(schemaFollowsSet).map((pk) => ["p", pk]);
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
        currentSchemaTab === "user-profile" && schemaTargetUser?.pubkey === targetPk;
      if (currentSchemaTab !== "user-profile") {
        schemaPreviousTab = currentSchemaTab || "following";
      }
      loadSchemaProfileCache();
      const cached = schemaProfileCache.get(targetPk);
      schemaTargetUser = {
        pubkey: targetPk,
        name: cached?.display_name || cached?.name || `User ${targetPk.slice(0, 8)}`,
        about: cached?.about || "Nostr user",
        picture: cached?.picture || "",
        nip05: cached?.nip05 || "",
        isFollowing: schemaFollowsSet.has(targetPk)
      };
      if (typeof localStorage !== "undefined" && !cached) {
        try {
          const raw = localStorage.getItem(PROFILE_CACHE_KEY);
          if (raw) {
            const records = JSON.parse(raw);
            const entry = records[targetPk]?.meta || records[targetPk];
            if (entry) {
              schemaProfileCache.set(targetPk, entry);
              schemaTargetUser = {
                ...schemaTargetUser,
                name: entry.display_name || entry.name || schemaTargetUser.name,
                about: entry.about ?? schemaTargetUser.about,
                picture: entry.picture || "",
                nip05: entry.nip05 || ""
              };
            }
          }
        } catch (_) {}
      }
      currentSchemaTab = "user-profile";
      schemaUserNotes = [];

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
            from: schemaPreviousTab || "following"
          };
          if (rootHist) {
            if (isFromIntent && typeof rootHist.replaceState === "function") {
              rootHist.replaceState(nextState, "", `?view=user-profile&pubkey=${targetPk}`);
            } else if (!wasAlreadyViewingSameProfile && typeof rootHist.pushState === "function") {
              schemaPushedHistory = true;
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
    const noteData = payload?.note || action.payload?.note || schemaUserNotes.find((n) => n.id === noteId);
    if (noteId) {
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
    const note = schemaUserNotes.find((n) => n.id === id);
    if (note) {
      note.liked = !note.liked;
      note.likes = (note.likes || 0) + (note.liked ? 1 : -1);
      try {
        const rootObj = (typeof window !== "undefined" ? (window as any) : null) || (typeof self !== "undefined" ? (self as any) : null);
        const nostrObj = rootObj?.nostr;
        if (nostrObj && typeof nostrObj.signEvent === "function" && note.liked) {
          const ev = {
            kind: 7,
            created_at: Math.floor(Date.now() / 1000),
            tags: [["e", id], ["p", note.pubkey || ""]],
            content: "+"
          };
          nostrObj.signEvent(ev).then((signed: any) => {
            if (signed) sendSchemaWs(["EVENT", signed]);
          }).catch(() => {});
        }
      } catch (_) {}
    }
  } else if (actName === "repost-note") {
    const id = String(payload?.id || action.payload?.id || "");
    const note = schemaUserNotes.find((n) => n.id === id);
    if (note) {
      note.reposted = !note.reposted;
      note.reposts = (note.reposts || 0) + (note.reposted ? 1 : -1);
      try {
        const rootObj = (typeof window !== "undefined" ? (window as any) : null) || (typeof self !== "undefined" ? (self as any) : null);
        const nostrObj = rootObj?.nostr;
        if (nostrObj && typeof nostrObj.signEvent === "function" && note.reposted) {
          const ev = {
            kind: 6,
            created_at: Math.floor(Date.now() / 1000),
            tags: [["e", id], ["p", note.pubkey || ""]],
            content: JSON.stringify(note)
          };
          nostrObj.signEvent(ev).then((signed: any) => {
            if (signed) sendSchemaWs(["EVENT", signed]);
          }).catch(() => {});
        }
      } catch (_) {}
    }
  } else if (actName === "zap-note") {
    const id = String(payload?.id || action.payload?.id || "");
    const note = schemaUserNotes.find((n) => n.id === id);
    if (note) {
      note.zaps = (note.zaps || 0) + 21;
    }
  }

  return getProfileSchema(currentSchemaTab, currentProfileData, {
    activeTab: currentSchemaTab,
    targetUser: schemaTargetUser,
    isFollowing: schemaTargetUser?.isFollowing,
    follows: Array.from(schemaFollowsSet).map((pk) => ({ pubkey: pk })),
    followsCount: schemaFollowsSet.size
  });
}

const PROFILE_VIEWER_CSS = /* css */ `
html, body {
  background-color: transparent !important;
  color: var(--omni-text-primary, var(--text-primary, #e5e1e4));
}

/* Profile Editor & Identity Custody Containers */
.profile-modal-container,
.profile-editor-container {
  max-width: 640px;
  width: 100%;
  margin: 0 auto;
  background: var(--omni-bg-elevated, var(--bg-elevated, #2a2930));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038));
  border-radius: var(--omni-radius-sm, 8px);
  padding: 24px 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
  box-sizing: border-box;
}

.preview-box {
  background: var(--omni-bg-surface, var(--bg-surface, #232227));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038));
  border-radius: var(--omni-radius-sm, 6px);
}

.preview-name {
  font-family: var(--omni-font-serif, inherit);
  font-size: 1.05rem;
  font-weight: 500;
  color: var(--omni-text-primary, var(--text-primary, #e5e1e4));
}

.preview-npub {
  font-family: var(--omni-font-mono, monospace);
  font-size: 0.7rem;
  color: var(--omni-text-muted, var(--text-muted, #8c909f));
}

/* People / Profile Viewer Application Container */
.profile-viewer-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 4px 40px;
  max-width: 720px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
  color: var(--omni-text-primary, var(--text-primary, #e5e1e4));
}

.pv-profile-card {
  background: var(--omni-bg-elevated, var(--bg-elevated, #2a2930));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038));
  border-radius: var(--omni-radius-sm, 8px);
  padding: 20px;
  margin-bottom: 16px;
}

.people-user-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--omni-bg-elevated, var(--bg-elevated, #2a2930));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038));
  border-radius: var(--omni-radius-sm, 8px);
  padding: 14px 16px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.people-user-card:hover {
  border-color: var(--omni-border-strong, var(--border-strong, #42404b));
  background: var(--omni-bg-surface, var(--bg-subtle, #33323b));
}

.search-person-row {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038));
  cursor: pointer;
  transition: background 0.15s ease;
}

.search-person-row:hover {
  background: var(--omni-bg-surface, var(--bg-subtle, #33323b));
}

.people-user-name {
  font-family: var(--omni-font-serif, inherit);
  font-size: 1.05rem;
  font-weight: 500;
  color: var(--omni-text-primary, var(--text-primary, #e5e1e4));
}

.people-user-handle {
  font-family: var(--omni-font-mono, monospace);
  font-size: 0.72rem;
  color: var(--omni-text-muted, var(--text-muted, #8c909f));
}

.profile-full-container {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 100%;
  width: 100%;
  margin: 0 auto;
  padding: 8px 4px 40px;
  box-sizing: border-box;
}

/* Profile Tabs */
.modal-tabs,
.profile-full-container .modal-tabs {
  display: flex;
  gap: 6px;
  border-bottom: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038));
  padding-bottom: 10px;
  margin-bottom: 6px;
}

.modal-tab-btn,
#btn-tab-profile,
#btn-tab-keys,
.profile-full-container .modal-tab-btn {
  background: var(--omni-bg-surface, var(--bg-surface, #232227));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038));
  color: var(--omni-text-muted, var(--text-muted, #8c909f));
  font-family: var(--omni-font-mono, monospace);
  font-size: 0.72rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-weight: 500;
  padding: 6px 14px;
  border-radius: var(--omni-radius-sm, 6px);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s ease;
}

.modal-tab-btn:hover,
#btn-tab-profile:hover,
#btn-tab-keys:hover,
.profile-full-container .modal-tab-btn:hover {
  color: var(--omni-text-primary, var(--text-primary, #e5e1e4));
  border-color: var(--omni-border-strong, var(--border-strong, #42404b));
  background: var(--omni-bg-elevated, var(--bg-subtle, #33323b));
}

.modal-tab-btn.active,
#btn-tab-profile.active,
#btn-tab-keys.active,
.profile-full-container .modal-tab-btn.active {
  background: var(--omni-bg-elevated, var(--bg-subtle, #33323b));
  color: var(--omni-text-primary, var(--text-primary, #e5e1e4));
  border-color: var(--omni-border-strong, var(--border-strong, #42404b));
  font-weight: 700;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.modal-tab-btn svg,
#btn-tab-profile svg,
#btn-tab-keys svg,
.profile-full-container .modal-tab-btn svg {
  width: 13px;
  height: 13px;
}

/* Profile Form Labels & Inputs */
.profile-full-container label {
  font-family: var(--omni-font-mono, monospace);
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--omni-text-secondary, var(--text-secondary, #c2c6d6));
  font-weight: 600;
}

.profile-full-container input[type="text"],
.profile-full-container input[type="password"],
.profile-full-container textarea {
  background: var(--omni-bg-surface, var(--bg-surface, #232227));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038));
  border-radius: var(--omni-radius-sm, 6px);
  color: var(--omni-text-primary, var(--text-primary, #e5e1e4));
  font-family: var(--omni-font-sans, inherit);
  font-size: 0.88rem;
  padding: 9px 12px;
  transition: border-color 0.15s ease;
  width: 100%;
  box-sizing: border-box;
}

.profile-full-container input[type="text"]:focus,
.profile-full-container input[type="password"]:focus,
.profile-full-container textarea:focus {
  border-color: var(--omni-accent-primary, var(--accent-primary, #4d8eff));
  outline: none;
}

.profile-full-container input[readonly] {
  background: var(--omni-bg-surface, var(--bg-surface, #232227));
  font-family: var(--omni-font-mono, monospace);
  font-size: 0.78rem;
}

/* Secondary Action Buttons */
#btn-sync-profile,
#btn-copy-npub,
#btn-copy-hex,
#btn-copy-nsec,
#btn-reveal-nsec,
#btn-cancel-reveal,
.profile-full-container .btn-secondary {
  background: var(--omni-bg-surface, var(--bg-surface, #232227));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038));
  border-radius: var(--omni-radius-sm, 6px);
  color: var(--omni-text-primary, var(--text-primary, #e5e1e4));
  font-family: var(--omni-font-mono, monospace);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 600;
  padding: 7px 14px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.15s ease;
}

#btn-sync-profile:hover,
#btn-copy-npub:hover,
#btn-copy-hex:hover,
#btn-copy-nsec:hover,
#btn-reveal-nsec:hover,
#btn-cancel-reveal:hover,
.profile-full-container .btn-secondary:hover {
  background: var(--omni-bg-elevated, var(--bg-subtle, #33323b));
  border-color: var(--omni-border-strong, var(--border-strong, #42404b));
  color: var(--omni-text-primary, var(--text-primary, #e5e1e4));
}

/* Primary Action Buttons */
#btn-save-profile,
#btn-import-key,
.profile-full-container .btn-publish {
  background: var(--omni-accent-primary, var(--accent-primary, #4d8eff));
  border: 1px solid var(--omni-accent-primary, var(--accent-primary, #4d8eff));
  border-radius: var(--omni-radius-sm, 6px);
  color: var(--omni-accent-contrast, var(--accent-contrast, #ffffff));
  font-family: var(--omni-font-mono, monospace);
  font-size: 0.74rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-weight: 700;
  padding: 8px 18px;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

#btn-save-profile:hover,
#btn-import-key:hover,
.profile-full-container .btn-publish:hover {
  opacity: 0.9;
}

/* Danger Confirm Reveal Button */
#btn-confirm-reveal,
.profile-full-container #btn-confirm-reveal {
  background: #dc2626;
  border: 1px solid #dc2626;
  border-radius: var(--omni-radius-sm, 6px);
  color: #ffffff;
  font-family: var(--omni-font-mono, monospace);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
  padding: 7px 14px;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

#btn-confirm-reveal:hover,
.profile-full-container #btn-confirm-reveal:hover {
  opacity: 0.9;
}

/* People Tabs & Views */
.people-tabs {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: var(--omni-bg-surface, var(--bg-surface, #232227));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038));
  padding: 2px;
  border-radius: var(--omni-radius-sm, 6px);
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  box-sizing: border-box;
}

.people-tabs::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.people-tab-btn {
  background: transparent;
  color: var(--omni-text-muted, var(--text-muted, #8c909f));
  border: none;
  border-radius: var(--omni-radius-sm, 4px);
  padding: 5px 12px;
  font-family: var(--omni-font-mono, monospace);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.people-tab-btn:hover {
  color: var(--omni-text-primary, var(--text-primary, #e5e1e4));
  background: var(--omni-bg-elevated, var(--bg-subtle, #33323b));
}

.people-tab-btn.active {
  background: var(--omni-bg-elevated, var(--bg-subtle, #33323b));
  color: var(--omni-text-primary, var(--text-primary, #e5e1e4));
  font-weight: 700;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.btn-toggle-lookup {
  background: var(--omni-bg-surface, var(--bg-surface, #232227));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038));
  border-radius: var(--omni-radius-sm, 6px);
  color: var(--omni-text-secondary, var(--text-secondary, #c2c6d6));
  font-family: var(--omni-font-mono, monospace);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 6px 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s ease;
}

.btn-toggle-lookup:hover {
  background: var(--omni-bg-elevated, var(--bg-subtle, #33323b));
  border-color: var(--omni-border-strong, var(--border-strong, #42404b));
  color: var(--omni-text-primary, var(--text-primary, #e5e1e4));
}

.btn-toggle-lookup svg {
  width: 14px;
  height: 14px;
}

.btn-profile-back {
  background: var(--omni-bg-surface, var(--bg-surface, #232227));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038));
  border-radius: var(--omni-radius-sm, 6px);
  color: var(--omni-text-secondary, var(--text-secondary, #c2c6d6));
  font-family: var(--omni-font-mono, monospace);
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 6px 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s ease;
}

.btn-profile-back:hover {
  background: var(--omni-bg-elevated, var(--bg-subtle, #33323b));
  border-color: var(--omni-border-strong, var(--border-strong, #42404b));
  color: var(--omni-text-primary, var(--text-primary, #e5e1e4));
}

.btn-profile-back svg {
  width: 14px;
  height: 14px;
}

.pv-search-btn {
  background: var(--omni-bg-elevated, var(--bg-surface, #232227));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038));
  border-radius: var(--omni-radius-sm, 6px);
  color: var(--omni-text-primary, var(--text-primary, #e5e1e4));
  font-family: var(--omni-font-mono, monospace);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 6px 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.pv-search-btn:hover {
  border-color: var(--omni-border-strong, var(--border-strong, #42404b));
  background: var(--omni-bg-surface, var(--bg-subtle, #33323b));
}

.btn-follow-toggle,
.pv-btn-follow {
  background: var(--omni-accent-primary, var(--accent-primary, #4d8eff));
  border: 1px solid var(--omni-accent-primary, var(--accent-primary, #4d8eff));
  border-radius: var(--omni-radius-sm, 6px);
  color: var(--omni-accent-contrast, var(--accent-contrast, #ffffff));
  font-family: var(--omni-font-mono, monospace);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
  padding: 7px 16px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.15s ease;
}

.btn-follow-toggle:hover,
.pv-btn-follow:hover {
  opacity: 0.9;
}

.btn-follow-toggle.is-following,
.btn-unfollow-row {
  background: var(--omni-bg-surface, var(--bg-surface, #232227));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038));
  color: var(--omni-text-secondary, var(--text-secondary, #c2c6d6));
  font-weight: 600;
}

.btn-follow-toggle.is-following:hover,
.btn-unfollow-row:hover {
  border-color: #ef4444;
  color: #ef4444;
  background: var(--omni-bg-elevated, var(--bg-subtle, #33323b));
}

.btn-block-toggle,
.pv-btn-block {
  background: var(--omni-bg-surface, var(--bg-surface, #232227));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038));
  border-radius: var(--omni-radius-sm, 6px);
  color: var(--omni-text-secondary, var(--text-secondary, #c2c6d6));
  font-family: var(--omni-font-mono, monospace);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 600;
  padding: 7px 14px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.btn-block-toggle:hover,
.pv-btn-block:hover {
  background: var(--omni-bg-elevated, var(--bg-subtle, #33323b));
  border-color: var(--omni-border-strong, var(--border-strong, #42404b));
  color: var(--omni-text-primary, var(--text-primary, #e5e1e4));
}

.btn-block-toggle.is-blocked,
.btn-unblock-row {
  border-color: #ef4444;
  color: #ef4444;
}

.pv-btn-refresh {
  background: var(--omni-bg-surface, var(--bg-surface, #232227));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038));
  border-radius: var(--omni-radius-sm, 6px);
  color: var(--omni-text-primary, var(--text-primary, #e5e1e4));
  font-family: var(--omni-font-mono, monospace);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 600;
  padding: 7px 14px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s ease;
}

.pv-btn-refresh:hover {
  background: var(--omni-bg-elevated, var(--bg-subtle, #33323b));
  border-color: var(--omni-border-strong, var(--border-strong, #42404b));
}

.pv-btn-refresh svg {
  width: 13px;
  height: 13px;
}

.pv-btn-copy-npub {
  background: var(--omni-bg-surface, var(--bg-surface, #232227));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038));
  border-radius: var(--omni-radius-sm, 6px);
  color: var(--omni-text-secondary, var(--text-secondary, #c2c6d6));
  font-family: var(--omni-font-mono, monospace);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 600;
  padding: 5px 10px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: all 0.15s ease;
}

.pv-btn-copy-npub:hover {
  background: var(--omni-bg-elevated, var(--bg-subtle, #33323b));
  border-color: var(--omni-border-strong, var(--border-strong, #42404b));
  color: var(--omni-text-primary, var(--text-primary, #e5e1e4));
}

.pv-btn-copy-npub svg {
  width: 12px;
  height: 12px;
}

.pv-card {
  background: var(--omni-bg-elevated, var(--bg-elevated, #2a2930));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038));
  border-radius: var(--omni-radius-sm, 8px);
}

.pv-search-bar {
  background: var(--omni-bg-surface, var(--bg-surface, #232227));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038));
  border-radius: var(--omni-radius-sm, 6px);
}

.pv-npub-pill {
  background: var(--omni-bg-surface, var(--bg-surface, #232227));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038));
  border-radius: var(--omni-radius-sm, 6px);
  font-family: var(--omni-font-mono, monospace);
}

.pv-display-name {
  font-family: var(--omni-font-serif, inherit);
  color: var(--omni-text-primary, var(--text-primary, #e5e1e4));
}

.pv-handle {
  font-family: var(--omni-font-mono, monospace);
  color: var(--omni-text-muted, var(--text-muted, #8c909f));
}

.pv-about {
  font-family: var(--omni-font-sans, inherit);
  color: var(--omni-text-primary, var(--text-primary, #e5e1e4));
}

.people-search-input,
.pv-search-input,
.people-filter-input {
  background: var(--omni-bg-surface, var(--bg-surface, #232227));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038));
  border-radius: var(--omni-radius-sm, 6px);
  color: var(--omni-text-primary, var(--text-primary, #e5e1e4));
  font-family: var(--omni-font-sans, inherit);
  font-size: 0.88rem;
  padding: 7px 12px;
}

@media (max-width: 600px) {
  .people-header {
    gap: 8px !important;
  }
  .people-header-left {
    width: 100% !important;
    gap: 8px !important;
  }
  .people-tabs {
    width: 100% !important;
    max-width: 100% !important;
    display: flex !important;
    overflow-x: auto !important;
    white-space: nowrap !important;
    scrollbar-width: none !important;
    -webkit-overflow-scrolling: touch !important;
    padding: 2px !important;
    box-sizing: border-box !important;
  }
  .people-tab-btn {
    padding: 5px 8px !important;
    font-size: 0.65rem !important;
    flex-shrink: 0 !important;
  }
  .btn-toggle-lookup {
    padding: 5px 10px !important;
    font-size: 0.65rem !important;
  }
  .pv-info-section {
    padding: 14px 10px !important;
  }
  .pv-avatar-actions-header {
    gap: 8px !important;
  }
  .pv-action-buttons {
    gap: 6px !important;
    justify-content: flex-end !important;
    max-width: 100% !important;
  }
  .btn-follow-toggle,
  .pv-btn-follow {
    padding: 6px 10px !important;
    font-size: 0.68rem !important;
  }
  .btn-block-toggle,
  .pv-btn-block {
    padding: 6px 10px !important;
    font-size: 0.68rem !important;
  }
  .pv-btn-refresh,
  .pv-btn-my-sync {
    padding: 6px 8px !important;
    font-size: 0.68rem !important;
  }
}
`;

/**
 * Native zero-dependency HTML template helper using standard <template>.
 */
function html<T extends HTMLElement = HTMLElement>(
  strings: TemplateStringsArray,
  ...values: any[]
): T {
  const template = document.createElement("template");
  template.innerHTML = strings.reduce((acc, str, i) => acc + str + (values[i] ?? ""), "").trim();
  return template.content.firstElementChild as T;
}

function escapeHtml(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatContent(text: string): string {
  const escaped = escapeHtml(text || "");
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  let formatted = escaped.replace(urlRegex, (rawUrl) => {
    const url = rawUrl.replace(/^http:\/\//i, "https://");
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: var(--omni-accent-primary, var(--accent-primary, #4d8eff)); text-decoration: underline;">${url}</a>`;
  });

  const nostrRegex = /(?:nostr:)?((?:npub|nprofile|note|nevent|naddr)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{20,})/gi;
  formatted = formatted.replace(nostrRegex, (_match, entity) => {
    const short = `${entity.slice(0, 9)}…${entity.slice(-4)}`;
    return `<span class="pv-nostr-entity" style="color: var(--omni-accent-primary, var(--accent-primary, #4d8eff)); font-family: var(--omni-font-mono, monospace); font-size: 0.8rem; background: var(--omni-bg-canvas, var(--bg-canvas, #1c1b20)); padding: 1px 5px; border-radius: 4px; border: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038));">${escapeHtml(short)}</span>`;
  });

  return formatted;
}

function formatTime(unixSec: number): string {
  if (!unixSec) return "";
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, now - unixSec);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d`;
  const d = new Date(unixSec * 1000);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Compact standard Bech32 encoder/decoder for Nostr npub addresses
const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    if ((top >> 0) & 1) chk ^= 0x3b6a57b2;
    if ((top >> 1) & 1) chk ^= 0x26508e6d;
    if ((top >> 2) & 1) chk ^= 0x1ea119fa;
    if ((top >> 3) & 1) chk ^= 0x3d4233dd;
    if ((top >> 4) & 1) chk ^= 0x2a1462b3;
  }
  return chk;
}

function hrpExpand(hrp: string): number[] {
  const ret: number[] = [];
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) >> 5);
  ret.push(0);
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) & 31);
  return ret;
}

function convertBits(data: number[], fromBits: number, toBits: number, pad = true): number[] {
  let acc = 0;
  let bits = 0;
  const ret: number[] = [];
  const maxv = (1 << toBits) - 1;
  for (const val of data) {
    acc = (acc << fromBits) | val;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (pad && bits > 0) {
    ret.push((acc << (toBits - bits)) & maxv);
  }
  return ret;
}

export function hexToNpub(hex: string): string {
  if (!hex || hex.length !== 64) return hex;
  try {
    const bytes: number[] = [];
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.slice(i, i + 2), 16));
    }
    const words = convertBits(bytes, 8, 5, true);
    const hrp = "npub";
    const mod = polymod(hrpExpand(hrp).concat(words).concat([0, 0, 0, 0, 0, 0])) ^ 1;
    const checksum: number[] = [];
    for (let p = 0; p < 6; p++) {
      checksum.push((mod >> (5 * (5 - p))) & 31);
    }
    let result = hrp + "1";
    for (const w of words.concat(checksum)) {
      result += BECH32_CHARSET.charAt(w);
    }
    return result;
  } catch (_) {
    return hex;
  }
}

export function npubToHex(npub: string): string {
  if (!npub || !npub.startsWith("npub1")) return npub;
  try {
    const data = npub.slice(5);
    const words: number[] = [];
    for (let i = 0; i < data.length - 6; i++) {
      const idx = BECH32_CHARSET.indexOf(data[i]);
      if (idx === -1) return npub;
      words.push(idx);
    }
    const bytes = convertBits(words, 5, 8, false);
    return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (_) {
    return npub;
  }
}

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #0284c7, #0369a1)",
  "linear-gradient(135deg, #2563eb, #1d4ed8)",
  "linear-gradient(135deg, #7c3aed, #6d28d9)",
  "linear-gradient(135deg, #db2777, #be185d)",
  "linear-gradient(135deg, #059669, #047857)",
  "linear-gradient(135deg, #d97706, #b45309)",
  "linear-gradient(135deg, #4f46e5, #4338ca)",
  "linear-gradient(135deg, #e11d48, #be123c)"
];

function getAvatarGradient(pubkey: string): string {
  let hash = 0;
  for (let i = 0; i < (pubkey || "").length; i++) {
    hash = (hash << 5) - hash + pubkey.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[idx];
}

// Geometric monochrome SVG line icons
const ICONS = {
  user: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>`,
  edit: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>`,
  key: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="7.5" cy="15.5" r="5.5"/>
    <path d="m21 2-9.6 9.6"/>
    <path d="m15.5 7.5 3 3"/>
  </svg>`,
  shield: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>`,
  check: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>`,
  x: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`,
  arrowLeft: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/>
    <polyline points="12 19 5 12 12 5"/>
  </svg>`,
  users: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>`,
  shieldOff: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
  </svg>`,
  checkCircle: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </svg>`,
  copy: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>`,
  search: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>`,
  bolt: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>`,
  link: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>`,
  refresh: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="23 4 23 10 17 10"/>
    <polyline points="1 20 1 14 7 14"/>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
  </svg>`,
  notes: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>`,
  reply: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>`,
  repost: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="17 1 21 5 17 9"/>
    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
    <polyline points="7 23 3 19 7 15"/>
    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
  </svg>`,
  heartOutline: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>`,
  heartFilled: `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>`,
  share: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="18" cy="5" r="3"/>
    <circle cx="6" cy="12" r="3"/>
    <circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>`
};

export interface ProfileMetadata {
  name?: string;
  display_name?: string;
  about?: string;
  picture?: string;
  banner?: string;
  nip05?: string;
  lud16?: string;
  website?: string;
}

function getOptimizedImageUrl(rawUrl: string, width = 96, height = 96): string {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  let trimmed = rawUrl.trim();
  if (trimmed.startsWith("http://")) {
    trimmed = trimmed.replace(/^http:\/\//i, "https://");
  }
  if (!trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.includes("images.weserv.nl")) {
    return trimmed;
  }
  return `https://images.weserv.nl/?url=${encodeURIComponent(trimmed)}&w=${width}&h=${height}&fit=cover&output=webp&q=80`;
}

function getAvatarSvg(pubkey: string, letter: string): string {
  let hash = 0;
  for (let i = 0; i < (pubkey || "").length; i++) {
    hash = (hash << 5) - hash + pubkey.charCodeAt(i);
    hash |= 0;
  }
  const seed = Math.abs(hash);

  // Diverse spectrum of vibrant, sophisticated color harmonies
  const palettes = [
    ["#c85d3e", "#3d190e", "#ffd2c2"], // Terracotta / Rust
    ["#288755", "#0b2e1b", "#bcf5d4"], // Emerald / Forest
    ["#356ec4", "#102347", "#cce0ff"], // Cobalt / Royal Blue
    ["#85419c", "#2b1036", "#f3cbff"], // Plum / Violet
    ["#aa3148", "#3b0d17", "#ffd0d9"], // Crimson / Wine
    ["#23858a", "#0a2d2f", "#bdf4f7"], // Deep Teal / Marine
    ["#b88320", "#3d2905", "#ffe6b0"], // Ochre / Amber Gold
    ["#4d5ec2", "#161b42", "#d4dcff"], // Indigo / Dusk
    ["#c24965", "#3b0f1b", "#ffd2dc"], // Coral / Rose
    ["#6b8028", "#222c09", "#e4f7a8"], // Olive / Moss
    ["#8e4a7d", "#2e1227", "#f9d0ee"], // Berry / Heather
    ["#1c83a8", "#072b38", "#bceeff"], // Azure / Vibrant Cyan
    ["#bd5726", "#381506", "#ffd3bb"], // Burnt Sienna
    ["#6a47b8", "#1e113d", "#e0d4ff"], // Violet / Lavender
    ["#25846f", "#092d24", "#bcf5e6"], // Jade / Spruce
    ["#a16328", "#331c07", "#fedec0"]  // Warm Copper / Cinnamon
  ];
  const [stop1, stop2, accent] = palettes[seed % palettes.length];

  // Varied placement of nested circles derived from pubkey entropy
  const c1_x = 20 + (seed % 60);
  const c1_y = 20 + ((seed >> 4) % 60);
  const c1_r = 24 + ((seed >> 8) % 16);
  const c1_color = (seed % 2 === 0) ? accent : "#ede8df";
  const c1_opacity = (0.24 + ((seed % 8) * 0.015)).toFixed(2);

  const c2_x = 100 - c1_x;
  const c2_y = 100 - c1_y;
  const c2_r = 20 + ((seed >> 12) % 20);

  // Varied curved bottom contour
  const waveY = 64 + (seed % 10);
  const waveControlY = 40 + ((seed >> 3) % 14);
  const waveEndY = 68 + ((seed >> 6) % 12);

  const cleanLetter = (letter || "?").slice(0, 1).toUpperCase();

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%" style="display: block; border-radius: 50%;">
  <rect width="100" height="100" rx="50" fill="${stop1}" />
  <circle cx="${c1_x}" cy="${c1_y}" r="${c1_r}" fill="${c1_color}" fill-opacity="${c1_opacity}" />
  <circle cx="${c2_x}" cy="${c2_y}" r="${c2_r}" fill="${stop2}" fill-opacity="0.4" />
  <path d="M 0 ${waveY} Q 50 ${waveControlY} 100 ${waveEndY} L 100 100 L 0 100 Z" fill="#141312" fill-opacity="0.3" />
  <circle cx="50" cy="50" r="47.5" fill="none" stroke="#ede8df" stroke-opacity="0.25" stroke-width="1.5" />
  <text x="50" y="52" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="46" font-weight="900" fill="#ffffff" stroke="#141312" stroke-width="2" stroke-opacity="0.5" text-anchor="middle" dominant-baseline="central" paint-order="stroke fill">${cleanLetter}</text>
</svg>`;
}


interface CachedProfileViewerEntry {
  meta: ProfileMetadata;
  timestamp: number;
}

function loadPersistedProfileCache(): Map<string, ProfileMetadata> {
  const map = new Map<string, ProfileMetadata>();
  try {
    if (typeof localStorage === "undefined") return map;
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return map;
    const records: Record<string, CachedProfileViewerEntry> = JSON.parse(raw);
    const now = Date.now();
    let hasExpired = false;
    for (const [pubkey, entry] of Object.entries(records)) {
      if (entry && entry.timestamp && (now - entry.timestamp) < PROFILE_CACHE_TTL) {
        map.set(pubkey, entry.meta);
      } else {
        hasExpired = true;
      }
    }
    if (hasExpired) {
      persistProfileCache(map);
    }
  } catch (_) {}
  return map;
}

let saveCacheTimer: any = null;
function persistProfileCache(cache: Map<string, ProfileMetadata>) {
  if (typeof localStorage === "undefined") return;
  if (saveCacheTimer) clearTimeout(saveCacheTimer);
  saveCacheTimer = setTimeout(() => {
    try {
      const records: Record<string, CachedProfileViewerEntry> = {};
      const now = Date.now();
      for (const [pubkey, meta] of cache.entries()) {
        records[pubkey] = { meta, timestamp: now };
      }
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(records));
    } catch (err) {
      console.error("WS message error:", err);
    }
  }, 1000);
}

const profileCache = loadPersistedProfileCache();

function getCurrentView(): string {
  const route =
    (typeof window !== "undefined" && window.location?.search) ||
    (typeof window !== "undefined" && window.location?.hash?.replace("#", "?")) ||
    (typeof window !== "undefined" && (window as any).__OMNI_ROUTE__) ||
    "";
  if (route) {
    try {
      const q = route.includes("?") ? route.slice(route.indexOf("?")) : `?${route.replace(/^#/, "")}`;
      const params = new URLSearchParams(q);
      const v = params.get("view");
      if (v) return v;
    } catch (err) {
      console.error("WS message error:", err);
    }
  }
  return "main";
}

/**
 * Compact Live Tile View (pinned to dock or companion surface)
 */
async function mountProfileCompact(root: HTMLElement) {
  const card = html<HTMLDivElement>`
    <div class="profile-compact-card" style="background: transparent; border: none; padding: 0 2px 2px 2px; display: flex; flex-direction: column; justify-content: flex-end; height: 100%; width: 100%; box-sizing: border-box; color: #ffffff;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <div class="profile-compact-avatar" style="width: 28px; height: 28px; border-radius: 50%; overflow: hidden; background: rgba(255, 255, 255, 0.22); border: 1px solid rgba(255, 255, 255, 0.45); display: flex; align-items: center; justify-content: center; color: #ffffff; flex-shrink: 0;">
          ${ICONS.user}
        </div>
        <div style="display: flex; flex-direction: column; gap: 1px; overflow: hidden; min-width: 0;">
          <strong class="profile-compact-name" style="font-size: 0.85rem; font-weight: 600; color: #ffffff; text-shadow: 0 1px 2px rgba(0,0,0,0.45); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Loading...</strong>
          <span class="profile-compact-npub" style="font-family: var(--font-mono, monospace); font-size: 0.68rem; color: rgba(255, 255, 255, 0.85); text-shadow: 0 1px 2px rgba(0,0,0,0.45); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">...</span>
        </div>
      </div>
    </div>
  `;

  const strongEl = card.querySelector<HTMLElement>(".profile-compact-name")!;
  const npubEl = card.querySelector<HTMLElement>(".profile-compact-npub")!;
  const avatarEl = card.querySelector<HTMLElement>(".profile-compact-avatar")!;

  root.appendChild(card);

  (async () => {
    try {
      let pubkey = "";
      if (typeof window !== "undefined" && (window as any).nostr?.getPublicKey) {
        pubkey = await (window as any).nostr.getPublicKey();
      }
      const npub = pubkey ? hexToNpub(pubkey) : "";
      const meta = pubkey ? profileCache.get(pubkey) : null;
      strongEl.textContent = meta?.display_name || meta?.name || "Active Identity";
      npubEl.textContent = npub ? `${npub.slice(0, 8)}...${npub.slice(-4)}` : (pubkey ? `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}` : "No Key");
      if (pubkey) {
        const initial = (strongEl.textContent || "U")[0]?.toUpperCase() || "U";
        avatarEl.innerHTML = getAvatarSvg(pubkey, initial);
      }
    } catch (err) {
      console.error("WS message error:", err);
    }
  })();
}

/**
 * Companion Widget View (cards dashboard)
 */
async function mountProfileWidget(root: HTMLElement) {
  const card = html<HTMLDivElement>`
    <div class="profile-widget-card" style="background: var(--omni-bg-surface, var(--bg-surface, #232227)); border: 1px solid var(--omni-border-strong, var(--border-strong, #42404b)); border-radius: var(--omni-radius-md, 10px); padding: 16px; display: flex; flex-direction: column; gap: 10px; color: var(--omni-text-primary, var(--text-primary, #e5e1e4));">
      <style class="omni-profile-viewer-styles">${PROFILE_VIEWER_CSS}</style>
      <div class="widget-header" style="display: flex; align-items: center; justify-content: space-between;">
        <h3 style="margin: 0; font-size: 0.92rem; font-weight: 600; color: var(--omni-text-primary, var(--text-primary, #e5e1e4)); display: flex; align-items: center; gap: 7px;">
          <span style="color: var(--omni-accent-primary, var(--accent-primary, #4d8eff)); display: flex; align-items: center;">${ICONS.user}</span> Active Identity
        </h3>
      </div>
      <div style="display: flex; align-items: center; gap: 12px; margin-top: 2px;">
        <div class="profile-widget-avatar" style="width: 36px; height: 36px; border-radius: 50%; overflow: hidden; background: var(--omni-bg-subtle, var(--bg-subtle, #33323b)); border: 1px solid var(--omni-border-strong, var(--border-strong, #42404b)); display: flex; align-items: center; justify-content: center; color: var(--omni-accent-primary, var(--accent-primary, #4d8eff)); flex-shrink: 0;">
          ${ICONS.user}
        </div>
        <div style="display: flex; flex-direction: column; gap: 2px; overflow: hidden; min-width: 0;">
          <strong class="profile-widget-name" style="font-size: 0.88rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Loading identity...</strong>
          <span class="profile-widget-npub" style="font-family: var(--omni-font-mono, monospace); font-size: 0.72rem; color: var(--omni-text-muted, var(--text-muted, #8c909f)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">...</span>
        </div>
      </div>
    </div>
  `;

  const strongEl = card.querySelector<HTMLElement>(".profile-widget-name")!;
  const npubEl = card.querySelector<HTMLElement>(".profile-widget-npub")!;
  const avatarEl = card.querySelector<HTMLElement>(".profile-widget-avatar")!;

  root.appendChild(card);

  (async () => {
    try {
      let pubkey = "";
      if (typeof window !== "undefined" && (window as any).nostr?.getPublicKey) {
        pubkey = await (window as any).nostr.getPublicKey();
      }
      const npub = pubkey ? hexToNpub(pubkey) : "";
      const meta = pubkey ? profileCache.get(pubkey) : null;
      strongEl.textContent = meta?.display_name || meta?.name || "Active Identity";
      npubEl.textContent = npub ? `${npub.slice(0, 10)}...${npub.slice(-6)}` : (pubkey ? `${pubkey.slice(0, 10)}...${pubkey.slice(-4)}` : "No Key Loaded");
      if (pubkey) {
        const initial = (strongEl.textContent || "U")[0]?.toUpperCase() || "U";
        avatarEl.innerHTML = getAvatarSvg(pubkey, initial);
      }
    } catch (err) {
      console.error("WS message error:", err);
    }
  })();
}

/**
 * Unified Standalone Profiles Application (View, Edit, Custody, Following, Blocked)
 */
async function mountProfileViewer(root: HTMLElement) {
  const currentView = getCurrentView();
  if (currentView === "compact") {
    return mountProfileCompact(root);
  }
  if (currentView === "widget" || currentView === "pill" || currentView === "badge") {
    return mountProfileWidget(root);
  }

  let activeTab: "my-profile" | "user-profile" | "following" | "blocked" | "profile" = "my-profile";
  let activeUserPubkey = "";
  let activePubkey = "";
  let myPubkey = "";
  let myFollows = new Set<string>();
  let myFollowTags: string[][] = [];
  let myMutes = new Set<string>();
  let myMuteTags: string[][] = [];

  let activeWs: WebSocket | null = null;
  let activeUserNotesSubId: string | null = null;
  let activeUserProfileSubId: string | null = null;
  let activeOlderUserSubId: string | null = null;
  let oldestUserNoteTimestamp = Infinity;
  let isLoadingOlderUserNotes = false;
  let olderUserNotesBatchCount = 0;

  let activeMyNotesSubId: string | null = null;
  let activeMyProfileSubId: string | null = null;
  let activeOlderMySubId: string | null = null;
  let oldestMyNoteTimestamp = Infinity;
  let isLoadingOlderMyNotes = false;
  let olderMyNotesBatchCount = 0;

  let isLoading = false;
  let eoseTimeout: any = null;
  const renderedNoteIds = new Set<string>();
  let noteCount = 0;
  const myRenderedNoteIds = new Set<string>();
  let myNoteCount = 0;
  let myProfileRendered = false;

  function getFollowsStorageKey(pk: string): string {
    return `omni_people_follows_${pk}`;
  }
  function getMutesStorageKey(pk: string): string {
    return `omni_people_mutes_${pk}`;
  }

  function loadCachedSocialGraph(pk: string) {
    if (!pk) return;
    try {
      const raw = localStorage.getItem(getFollowsStorageKey(pk));
      if (raw) {
        const tags = JSON.parse(raw);
        if (Array.isArray(tags)) {
          myFollowTags = tags;
          myFollows.clear();
          for (const t of tags) {
            if (t[0] === "p" && t[1]) myFollows.add(t[1]);
          }
          if (countFollowingEl) countFollowingEl.textContent = String(myFollows.size);
          updateActionButtons(activePubkey);
          if (activeTab === "following") {
            renderFollowingList();
          }
        }
      }
    } catch (err) {
      console.error("WS message error:", err);
    }

    try {
      const raw = localStorage.getItem(getMutesStorageKey(pk));
      if (raw) {
        const tags = JSON.parse(raw);
        if (Array.isArray(tags)) {
          myMuteTags = tags;
          myMutes.clear();
          for (const t of tags) {
            if (t[0] === "p" && t[1]) myMutes.add(t[1]);
          }
          if (countBlockedEl) countBlockedEl.textContent = String(myMutes.size);
          updateActionButtons(activePubkey);
          if (activeTab === "blocked") {
            renderBlockedList();
          }
        }
      }
    } catch (err) {
      console.error("WS message error:", err);
    }
  }

  function addWsListener(ws: any, type: string, handler: Function) {
    if (typeof ws.addEventListener === "function") {
      ws.addEventListener(type, handler as any);
    } else {
      const prev = ws[`on${type}`];
      ws[`on${type}`] = function (ev: any) {
        if (typeof prev === "function") {
          try { prev.call(ws, ev); } catch (_) {}
        }
        handler(ev);
      };
    }
  }

  function getWebSocket(): WebSocket {
    if (!activeWs || activeWs.readyState === WebSocket.CLOSED) {
      activeWs = new WebSocket("wss://relay.damus.io");
      addWsListener(activeWs, "message", handleIncomingWsMessage);
    }
    return activeWs;
  }

  function sendWs(payload: any) {
    const ws = getWebSocket();
    const raw = JSON.stringify(payload);
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(raw);
      } catch (err) {
      console.error("WS message error:", err);
    }
    } else {
      let fired = false;
      const onOpen = () => {
        if (fired) return;
        fired = true;
        try {
          ws.send(raw);
        } catch (err) {
      console.error("WS message error:", err);
    }
        if (typeof ws.removeEventListener === "function") {
          ws.removeEventListener("open", onOpen);
        }
      };
      addWsListener(ws, "open", onOpen);
    }
  }

  function updateUserCards(pubkey: string, meta: ProfileMetadata) {
    if (!container) return;
    const cards = container.querySelectorAll<HTMLElement>(`.people-user-card[data-pubkey="${pubkey}"]`);
    cards.forEach((card) => {
      const nameEl = card.querySelector<HTMLElement>(".people-user-name");
      const handleEl = card.querySelector<HTMLElement>(".people-user-handle");
      const aboutEl = card.querySelector<HTMLElement>(".people-user-about");
      const aWrap = card.querySelector<HTMLElement>(".people-avatar");
      if (nameEl && (meta.display_name || meta.name)) nameEl.textContent = meta.display_name || meta.name || "";
      if (handleEl && meta.name) handleEl.textContent = `@${meta.name}`;
      if (aboutEl && meta.about) aboutEl.textContent = meta.about;
      if (aWrap) {
        const initial = (meta.display_name || meta.name || pubkey)[0]?.toUpperCase() || "?";
        aWrap.innerHTML = getAvatarSvg(pubkey, initial);
      }
    });
  }

  function handleIncomingWsMessage(event: any) {
    try {
      const rawData = event.data !== undefined ? event.data : event;
      const frame = typeof rawData === "string" ? JSON.parse(rawData) : rawData;
      if (!Array.isArray(frame)) return;
      const type = frame[0];
      const subId = frame[1];

      if (type === "EVENT" && frame[2]) {
        const ev = frame[2];
        const k = Number(ev.kind);

        // Kind 3: Contact List for current user
        if (k === 3 && (subId === "pv_my_contacts" || (myPubkey && ev.pubkey === myPubkey))) {
          if (!myPubkey && ev.pubkey) myPubkey = ev.pubkey;
          myFollows.clear();
          myFollowTags = ev.tags || [];
          for (const tag of myFollowTags) {
            if (tag[0] === "p" && tag[1]) {
              myFollows.add(tag[1]);
            }
          }
          if (myPubkey) {
            try {
              localStorage.setItem(getFollowsStorageKey(myPubkey), JSON.stringify(myFollowTags));
            } catch (err) {
      console.error("WS message error:", err);
    }
          }
          if (countFollowingEl) countFollowingEl.textContent = String(myFollows.size);
          updateActionButtons(activePubkey);
          if (activeTab === "following") {
            renderFollowingList();
          }
        }

        // Kind 10000: Mute List for current user
        else if (k === 10000 && (subId === "pv_my_mutes" || (myPubkey && ev.pubkey === myPubkey))) {
          if (!myPubkey && ev.pubkey) myPubkey = ev.pubkey;
          myMutes.clear();
          myMuteTags = ev.tags || [];
          for (const tag of myMuteTags) {
            if (tag[0] === "p" && tag[1]) {
              myMutes.add(tag[1]);
            }
          }
          if (myPubkey) {
            try {
              localStorage.setItem(getMutesStorageKey(myPubkey), JSON.stringify(myMuteTags));
            } catch (err) {
      console.error("WS message error:", err);
    }
          }
          if (countBlockedEl) countBlockedEl.textContent = String(myMutes.size);
          updateActionButtons(activePubkey);
          if (activeTab === "blocked") {
            renderBlockedList();
          }
        }

        // Kind 0: Profile Metadata
        else if (k === 0 && ev.pubkey) {
          try {
            const meta: ProfileMetadata = JSON.parse(ev.content);
            profileCache.set(ev.pubkey, meta);
            persistProfileCache(profileCache);
            if (ev.pubkey === myPubkey) {
              renderMyProfileMetadata(meta);
              populateEditForm(meta);
            }
            if (ev.pubkey === activeUserPubkey) {
              renderUserProfileMetadata(activeUserPubkey, meta);
            }
            updateUserCards(ev.pubkey, meta);
          } catch (err) {
      console.error("WS message error:", err);
    }
        }

        // Kind 1: Timeline Notes
        else if (k === 1) {
          // My profile notes
          if (subId === activeMyNotesSubId || subId === activeOlderMySubId || (!subId && myPubkey && ev.pubkey === myPubkey)) {
            if (!myRenderedNoteIds.has(ev.id)) {
              myRenderedNoteIds.add(ev.id);
              if (ev.created_at && ev.created_at < oldestMyNoteTimestamp) {
                oldestMyNoteTimestamp = ev.created_at;
              }
              if (subId === activeOlderMySubId) {
                olderMyNotesBatchCount++;
              }
              if (myNoteCount === 0 && myNotesListEl) {
                myNotesListEl.innerHTML = "";
              }
              myNoteCount++;
              if (myNotesCountEl) myNotesCountEl.textContent = `${myNoteCount} note${myNoteCount === 1 ? "" : "s"}`;
              if (myNotesCountPill) myNotesCountPill.textContent = String(myNoteCount);
              if (myNotesListEl) insertNoteCard(myNotesListEl, ev);
              if (mySentinelEl && myNoteCount >= 10) {
                mySentinelEl.style.display = "flex";
              }
            }
          }
          // User profile notes
          if (subId === activeUserNotesSubId || subId === activeOlderUserSubId || (!subId && activeUserPubkey && ev.pubkey === activeUserPubkey)) {
            if (eoseTimeout) {
              clearTimeout(eoseTimeout);
              eoseTimeout = null;
            }
            if (!renderedNoteIds.has(ev.id)) {
              renderedNoteIds.add(ev.id);
              if (ev.created_at && ev.created_at < oldestUserNoteTimestamp) {
                oldestUserNoteTimestamp = ev.created_at;
              }
              if (subId === activeOlderUserSubId) {
                olderUserNotesBatchCount++;
              }
              if (noteCount === 0 && notesListEl) {
                notesListEl.innerHTML = "";
              }
              noteCount++;
              if (notesCountEl) notesCountEl.textContent = `${noteCount} note${noteCount === 1 ? "" : "s"}`;
              if (notesListEl) insertNoteCard(notesListEl, ev);
              if (userSentinelEl && noteCount >= 10) {
                userSentinelEl.style.display = "flex";
              }
            }
          }
        }
      } else if (type === "EOSE") {
        if (subId?.startsWith("pv_batch_") || subId?.startsWith("pv_sync_")) {
          sendWs(["CLOSE", subId]);
        }
        if (subId === activeOlderUserSubId) {
          sendWs(["CLOSE", subId]);
          isLoadingOlderUserNotes = false;
          activeOlderUserSubId = null;
          if (btnUserNotesLoadMore) {
            if (olderUserNotesBatchCount === 0 || olderUserNotesBatchCount < 10) {
              btnUserNotesLoadMore.textContent = "No more notes";
              btnUserNotesLoadMore.disabled = true;
            } else {
              btnUserNotesLoadMore.textContent = "Load more notes";
              btnUserNotesLoadMore.disabled = false;
            }
          }
        }
        if (subId === activeUserNotesSubId) {
          if (eoseTimeout) {
            clearTimeout(eoseTimeout);
            eoseTimeout = null;
          }
          isLoading = false;
          if (noteCount === 0 && notesListEl) {
            notesListEl.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--omni-text-muted, var(--text-muted, #8c909f)); font-size: 0.85rem;">No public notes published by this user yet.</div>`;
            if (notesCountEl) notesCountEl.textContent = "0 notes";
            if (userSentinelEl) userSentinelEl.style.display = "none";
          } else if (noteCount > 0 && userSentinelEl) {
            if (noteCount < 10) {
              userSentinelEl.style.display = "none";
            } else {
              userSentinelEl.style.display = "flex";
              if (btnUserNotesLoadMore) {
                btnUserNotesLoadMore.textContent = "Load more notes";
                btnUserNotesLoadMore.disabled = false;
              }
            }
          }
        }
        if (subId === activeOlderMySubId) {
          sendWs(["CLOSE", subId]);
          isLoadingOlderMyNotes = false;
          activeOlderMySubId = null;
          if (btnMyNotesLoadMore) {
            if (olderMyNotesBatchCount === 0 || olderMyNotesBatchCount < 10) {
              btnMyNotesLoadMore.textContent = "No more notes";
              btnMyNotesLoadMore.disabled = true;
            } else {
              btnMyNotesLoadMore.textContent = "Load more notes";
              btnMyNotesLoadMore.disabled = false;
            }
          }
        }
        if (subId === activeMyNotesSubId) {
          if (myNoteCount === 0 && myNotesListEl) {
            myNotesListEl.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--omni-text-muted, var(--text-muted, #8c909f)); font-size: 0.85rem;">You haven't published any public notes yet.</div>`;
            if (myNotesCountEl) myNotesCountEl.textContent = "0 notes";
            if (myNotesCountPill) myNotesCountPill.textContent = "0";
            if (mySentinelEl) mySentinelEl.style.display = "none";
          } else if (myNoteCount > 0 && mySentinelEl) {
            if (myNoteCount < 10) {
              mySentinelEl.style.display = "none";
            } else {
              mySentinelEl.style.display = "flex";
              if (btnMyNotesLoadMore) {
                btnMyNotesLoadMore.textContent = "Load more notes";
                btnMyNotesLoadMore.disabled = false;
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("WS message error:", err);
    }
  }

  const container = html<HTMLDivElement>`
    <div class="profile-viewer-container" style="display: flex; flex-direction: column; gap: 16px; padding: 12px; max-width: 760px; margin: 0 auto; color: var(--omni-text-primary, var(--text-primary, #e5e1e4)); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <style class="omni-profile-viewer-styles">${PROFILE_VIEWER_CSS}</style>
      
      <!-- Top App Header & Viewport Tabs -->
      <div class="people-header" style="display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 2px 0; flex-wrap: wrap; width: 100%; box-sizing: border-box;">
        <div class="people-header-left" style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; max-width: 100%; min-width: 0;">
          <h2 style="margin: 0; font-size: 1.25rem; font-weight: 700; color: var(--omni-text-primary, var(--text-primary, #e5e1e4)); flex-shrink: 0;">Profiles</h2>
          <div class="people-tabs" style="display: inline-flex; align-items: center; gap: 2px; max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; box-sizing: border-box;">
            <button class="people-tab-btn btn-tab-profile btn-tab-my-profile active" data-tab="my-profile">Profile</button>
            <button class="people-tab-btn btn-tab-user-profile btn-tab-user" data-tab="user-profile" style="display: none;">User Profile</button>
            <button class="people-tab-btn btn-tab-following" data-tab="following">Following (<span class="count-following">0</span>)</button>
            <button class="people-tab-btn btn-tab-blocked" data-tab="blocked">Blocked (<span class="count-blocked">0</span>)</button>
          </div>
        </div>
        <button class="btn-toggle-lookup btn-secondary" title="Search by npub or hex pubkey">
          ${ICONS.search}
          <span>Lookup npub</span>
        </button>
      </div>

      <!-- 1. MY PROFILE TAB VIEW -->
      <div class="pv-tab-content pv-tab-my-profile pv-tab-profile">
        <!-- My Profile Card -->
        <div class="pv-card pv-my-card" style="background: var(--omni-bg-surface, var(--bg-surface, #232227)); border: 1px solid var(--omni-border-strong, var(--border-strong, #42404b)); border-radius: var(--omni-radius-md, 10px); overflow: hidden; display: flex; flex-direction: column; width: 100%; box-sizing: border-box;">
          
          <!-- Identity & Metadata Section -->
          <div class="pv-info-section" style="padding: 20px; display: flex; flex-direction: column; gap: 14px; position: relative; width: 100%; box-sizing: border-box;">
            
            <!-- Avatar & Actions Header -->
            <div class="pv-avatar-actions-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; gap: 8px; flex-wrap: wrap; width: 100%; box-sizing: border-box;">
              <div class="pv-avatar-wrap pv-my-avatar-wrap" style="width: 72px; height: 72px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.4); flex-shrink: 0; padding: 0;">
                <div class="pv-avatar-fallback pv-my-avatar-fallback" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; font-weight: 700; color: #fff;">?</div>
              </div>
              
              <div class="pv-action-buttons pv-my-action-buttons" style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; max-width: 100%; min-width: 0; flex-shrink: 1;">
                <button class="pv-btn-edit-profile-card btn-secondary" style="white-space: nowrap; flex-shrink: 0;" title="Edit Profile Details">
                  ${ICONS.edit}
                  <span>Edit Profile</span>
                </button>
                <button class="pv-btn-my-sync btn-secondary" style="white-space: nowrap; flex-shrink: 0;" title="Sync metadata from Relays">
                  ${ICONS.refresh}
                  <span>Sync from Relays</span>
                </button>
              </div>
            </div>

            <!-- Name & Handles -->
            <div style="display: flex; flex-direction: column; gap: 3px;">
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <h2 class="pv-display-name pv-my-display-name" style="margin: 0; font-size: 1.25rem; font-weight: 700;">Loading Profile...</h2>
                <span class="pv-nip05-badge pv-my-nip05-badge" style="display: none; align-items: center; gap: 4px; font-size: 0.72rem; padding: 2px 8px; border-radius: 12px; background: color-mix(in srgb, var(--omni-accent-primary, var(--accent-primary, #4d8eff)) 15%, transparent); color: var(--omni-accent-primary, var(--accent-primary, #4d8eff)); border: 1px solid color-mix(in srgb, var(--omni-accent-primary, var(--accent-primary, #4d8eff)) 30%, transparent);">
                  ${ICONS.checkCircle}
                  <span class="pv-nip05-text pv-my-nip05-text"></span>
                </span>
              </div>
              <div class="pv-handle pv-my-handle" style="font-size: 0.84rem; color: var(--omni-text-secondary, var(--text-secondary, #c2c6d6));">@...</div>
            </div>

            <!-- Npub Copy Pill -->
            <div class="pv-npub-row" style="display: flex; align-items: center; gap: 8px;">
              <div class="pv-npub-pill pv-my-npub-pill" style="display: flex; align-items: center; gap: 6px; padding: 4px 10px; font-family: var(--omni-font-mono, monospace); font-size: 0.74rem; color: var(--omni-text-muted, var(--text-muted, #8c909f)); max-width: 100%; overflow: hidden;">
                <span class="pv-npub-text pv-my-npub-text" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">npub...</span>
              </div>
              <button class="pv-btn-copy-npub pv-btn-copy-my-npub btn-secondary" title="Copy npub to clipboard">
                ${ICONS.copy}
                <span class="pv-copy-label pv-my-copy-label">Copy</span>
              </button>
            </div>

            <!-- Bio / About -->
            <div class="pv-about pv-my-about" style="font-size: 0.88rem; line-height: 1.5; color: var(--omni-text-primary, var(--text-primary, #e5e1e4)); white-space: pre-wrap; word-break: break-word; display: none;"></div>

            <!-- Extra Metadata Row (Website / Lightning) -->
            <div class="pv-meta-links pv-my-meta-links" style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap; font-size: 0.78rem; border-top: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038)); padding-top: 10px; margin-top: 2px;">
              <div class="pv-lud16-wrap pv-my-lud16-wrap" style="display: none; align-items: center; gap: 4px; color: var(--omni-accent-primary, var(--accent-primary, #4d8eff));">
                ${ICONS.bolt}
                <span class="pv-lud16-text pv-my-lud16-text"></span>
              </div>
              <div class="pv-website-wrap pv-my-website-wrap" style="display: none; align-items: center; gap: 4px; color: var(--omni-text-secondary, var(--text-secondary, #c2c6d6));">
                ${ICONS.link}
                <a class="pv-website-link pv-my-website-link" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none;"></a>
              </div>
            </div>
          </div>
        </div>

        <!-- My Profile Subtabs Navigation -->
        <div class="pv-my-subtabs modal-tabs" style="display: flex; gap: 8px; border-bottom: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038)); padding: 4px 0 8px 0; margin-top: 14px; width: 100%;">
          <button class="modal-tab-btn pv-btn-my-notes active" id="btn-tab-my-notes" style="background: transparent; border: none; font-size: 0.86rem; font-weight: 600; cursor: pointer; color: var(--omni-accent-primary, var(--accent-primary, #4d8eff)); padding: 6px 12px; display: flex; align-items: center; gap: 6px; border-radius: var(--omni-radius-sm, 6px);">
            ${ICONS.notes} <span>Notes (<span class="pv-my-notes-count-pill">0</span>)</span>
          </button>
          <button class="modal-tab-btn pv-btn-edit-profile" id="btn-tab-profile" style="background: transparent; border: none; font-size: 0.86rem; font-weight: 500; cursor: pointer; color: var(--omni-text-muted, var(--text-muted, #8c909f)); padding: 6px 12px; display: flex; align-items: center; gap: 6px; border-radius: var(--omni-radius-sm, 6px);">
            ${ICONS.edit} <span>Edit Profile</span>
          </button>
          <button class="modal-tab-btn pv-btn-keys" id="btn-tab-keys" style="background: transparent; border: none; font-size: 0.86rem; font-weight: 500; cursor: pointer; color: var(--omni-text-muted, var(--text-muted, #8c909f)); padding: 6px 12px; display: flex; align-items: center; gap: 6px; border-radius: var(--omni-radius-sm, 6px);">
            ${ICONS.key} <span>Keys & Custody</span>
          </button>
        </div>

        <!-- Integrated Profile Panels (Full Width) -->
        <div class="pv-edit-panel profile-full-container" style="display: flex; width: 100%; box-sizing: border-box; background: var(--omni-bg-surface, var(--bg-surface, #232227)); border: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038)); border-radius: var(--omni-radius-md, 10px); padding: 18px 20px; margin-top: 10px; flex-direction: column; gap: 14px;">
          
          <!-- Non-blocking inline Toast notification banner -->
          <div id="prof-toast" style="display: none; padding: 8px 12px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.8rem; font-weight: 500; align-items: center; gap: 8px; transition: all 0.2s ease;"></div>

          <!-- Pane 1: Profile Info -->
          <div class="pane-profile" style="display: none; flex-direction: column; gap: 12px; width: 100%; box-sizing: border-box;">
            <div style="display: flex; flex-direction: column; gap: 10px;">
              <label style="font-size: 0.78rem; color: var(--omni-text-secondary, var(--text-secondary, #c2c6d6)); display: flex; flex-direction: column; gap: 3px;">
                Display Name:
                <input id="prof-display-name" type="text" placeholder="e.g. Alice Smith" style="background: var(--omni-bg-subtle, var(--bg-subtle, #33323b)); border: 1px solid var(--omni-border-strong, var(--border-strong, #42404b)); color: var(--omni-text-primary, var(--text-primary, #e5e1e4)); padding: 8px 12px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.84rem; outline: none; width: 100%; box-sizing: border-box;" />
              </label>
              <label style="font-size: 0.78rem; color: var(--omni-text-secondary, var(--text-secondary, #c2c6d6)); display: flex; flex-direction: column; gap: 3px;">
                Username / Handle:
                <input id="prof-name" type="text" placeholder="e.g. alice" style="background: var(--omni-bg-subtle, var(--bg-subtle, #33323b)); border: 1px solid var(--omni-border-strong, var(--border-strong, #42404b)); color: var(--omni-text-primary, var(--text-primary, #e5e1e4)); padding: 8px 12px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.84rem; outline: none; width: 100%; box-sizing: border-box;" />
              </label>
              <label style="font-size: 0.78rem; color: var(--omni-text-secondary, var(--text-secondary, #c2c6d6)); display: flex; flex-direction: column; gap: 3px;">
                About / Bio:
                <textarea id="prof-about" rows="3" placeholder="Tell the Nostr network about yourself..." style="background: var(--omni-bg-subtle, var(--bg-subtle, #33323b)); border: 1px solid var(--omni-border-strong, var(--border-strong, #42404b)); color: var(--omni-text-primary, var(--text-primary, #e5e1e4)); padding: 8px 12px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.84rem; outline: none; resize: vertical; width: 100%; box-sizing: border-box;"></textarea>
              </label>
              <label style="font-size: 0.78rem; color: var(--omni-text-secondary, var(--text-secondary, #c2c6d6)); display: flex; flex-direction: column; gap: 3px;">
                Avatar URL:
                <input id="prof-picture" type="text" placeholder="https://example.com/avatar.jpg" style="background: var(--omni-bg-subtle, var(--bg-subtle, #33323b)); border: 1px solid var(--omni-border-strong, var(--border-strong, #42404b)); color: var(--omni-text-primary, var(--text-primary, #e5e1e4)); padding: 8px 12px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.84rem; outline: none; width: 100%; box-sizing: border-box;" />
              </label>
              <label style="font-size: 0.78rem; color: var(--omni-text-secondary, var(--text-secondary, #c2c6d6)); display: flex; flex-direction: column; gap: 3px;">
                Banner URL:
                <input id="prof-banner" type="text" placeholder="https://example.com/banner.jpg" style="background: var(--omni-bg-subtle, var(--bg-subtle, #33323b)); border: 1px solid var(--omni-border-strong, var(--border-strong, #42404b)); color: var(--omni-text-primary, var(--text-primary, #e5e1e4)); padding: 8px 12px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.84rem; outline: none; width: 100%; box-sizing: border-box;" />
              </label>
              <label style="font-size: 0.78rem; color: var(--omni-text-secondary, var(--text-secondary, #c2c6d6)); display: flex; flex-direction: column; gap: 3px;">
                NIP-05 Identifier:
                <input id="prof-nip05" type="text" placeholder="alice@domain.com" style="background: var(--omni-bg-subtle, var(--bg-subtle, #33323b)); border: 1px solid var(--omni-border-strong, var(--border-strong, #42404b)); color: var(--omni-text-primary, var(--text-primary, #e5e1e4)); padding: 8px 12px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.84rem; outline: none; width: 100%; box-sizing: border-box;" />
              </label>
              <label style="font-size: 0.78rem; color: var(--omni-text-secondary, var(--text-secondary, #c2c6d6)); display: flex; flex-direction: column; gap: 3px;">
                Lightning Address (lud16):
                <input id="prof-lud16" type="text" placeholder="alice@getalby.com" style="background: var(--omni-bg-subtle, var(--bg-subtle, #33323b)); border: 1px solid var(--omni-border-strong, var(--border-strong, #42404b)); color: var(--omni-text-primary, var(--text-primary, #e5e1e4)); padding: 8px 12px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.84rem; outline: none; width: 100%; box-sizing: border-box;" />
              </label>
              <label style="font-size: 0.78rem; color: var(--omni-text-secondary, var(--text-secondary, #c2c6d6)); display: flex; flex-direction: column; gap: 3px;">
                Website:
                <input id="prof-website" type="text" placeholder="https://alice.example.com" style="background: var(--omni-bg-subtle, var(--bg-subtle, #33323b)); border: 1px solid var(--omni-border-strong, var(--border-strong, #42404b)); color: var(--omni-text-primary, var(--text-primary, #e5e1e4)); padding: 8px 12px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.84rem; outline: none; width: 100%; box-sizing: border-box;" />
              </label>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px;">
              <button id="btn-sync-profile" class="btn-secondary">
                ${ICONS.refresh} <span>Sync from Relays</span>
              </button>
              <button id="btn-save-profile" class="btn-publish">Save & Publish Profile (kind 0)</button>
            </div>
          </div>

          <!-- Pane 2: Keys & Custody -->
          <div class="pane-keys" style="display: none; flex-direction: column; gap: 14px; width: 100%; box-sizing: border-box;">
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <span style="font-size: 0.78rem; color: var(--text-secondary, #a8a29e);">Public Key (npub):</span>
              <div style="display: flex; gap: 6px;">
                <input id="key-npub" type="text" readonly style="flex: 1; padding: 6px 10px; font-family: var(--font-mono, monospace); font-size: 0.74rem; outline: none;" placeholder="Loading npub..." value="" />
                <button id="btn-copy-npub" class="btn-secondary">
                  ${ICONS.copy} <span>Copy</span>
                </button>
              </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 4px;">
              <span style="font-size: 0.78rem; color: var(--text-secondary, #a8a29e);">Public Key (Hex):</span>
              <div style="display: flex; gap: 6px;">
                <input id="key-hex" type="text" readonly style="flex: 1; padding: 6px 10px; font-family: var(--font-mono, monospace); font-size: 0.74rem; outline: none;" placeholder="Loading hex pubkey..." value="" />
                <button id="btn-copy-hex" class="btn-secondary">
                  ${ICONS.copy} <span>Copy</span>
                </button>
              </div>
            </div>

            <!-- Key Custody & Security Policy Notice -->
            <div style="border-top: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038)); padding-top: 12px; display: flex; flex-direction: column; gap: 8px;">
              <div style="display: flex; align-items: center; gap: 8px; color: var(--omni-accent-primary, var(--accent-primary, #4d8eff)); font-size: 0.82rem; font-weight: 600;">
                <span style="display: flex; align-items: center; flex-shrink: 0;">${ICONS.shield}</span>
                <span>Cryptographic Key Custody & Security</span>
              </div>
              <p style="margin: 0; font-size: 0.78rem; line-height: 1.5; color: var(--omni-text-secondary, var(--text-secondary, #c2c6d6));">
                Your private key (nsec) is strictly isolated and guarded by the host microkernel. Sandboxed plugins and nsites never have access to raw private keys and interact exclusively through standard NIP-07 (<code style="font-family: var(--omni-font-mono, monospace); color: var(--omni-accent-primary, var(--accent-primary, #4d8eff));">window.nostr</code>) signing.
              </p>
            </div>

            <!-- Switch Identity / Import Key Section -->
            <div style="border-top: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038)); padding-top: 14px; display: flex; flex-direction: column; gap: 10px;">
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <span style="font-size: 0.82rem; font-weight: 600; color: var(--omni-text-primary, var(--text-primary, #e5e1e4));">Switch Identity / Import Account:</span>
                <span style="font-family: var(--omni-font-mono, monospace); font-size: 0.65rem; color: var(--omni-accent-primary, var(--accent-primary, #4d8eff)); text-transform: uppercase;">Write-Only Custody</span>
              </div>
              <p style="margin: 0; font-size: 0.76rem; color: var(--omni-text-muted, var(--text-muted, #8c909f)); line-height: 1.4;">
                Paste an existing Nostr private key (<code style="font-family: var(--omni-font-mono, monospace); color: var(--omni-accent-primary, var(--accent-primary, #4d8eff));">nsec1...</code> or 64-char hex) to switch your active signing identity. The key is securely passed write-only to the host keystore.
              </p>
              <div style="display: flex; gap: 8px;">
                <input id="key-import" type="password" placeholder="Paste nsec1... or 64-char hex private key" style="flex: 1; padding: 8px 12px; font-family: var(--omni-font-mono, monospace); font-size: 0.78rem; outline: none; background: var(--omni-bg-subtle, var(--bg-subtle, #33323b)); border: 1px solid var(--omni-border-strong, var(--border-strong, #42404b)); border-radius: var(--omni-radius-sm, 6px); color: var(--omni-text-primary, var(--text-primary, #e5e1e4));" />
                <button id="btn-import-key" class="btn-publish" style="white-space: nowrap;">Import & Switch</button>
              </div>
              <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 2px;">
                <button id="btn-generate-key" class="btn-secondary" style="font-size: 0.74rem;">
                  Generate Fresh Keypair
                </button>
              </div>
            </div>
          </div>

          <!-- Pane 3: My Notes Feed Section -->
          <div class="pane-notes pv-notes-section pv-my-notes-section" style="display: flex; flex-direction: column; gap: 10px; width: 100%; box-sizing: border-box;">
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038)); padding-bottom: 8px;">
              <h3 style="margin: 0; font-size: 0.95rem; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; color: var(--omni-text-primary, var(--text-primary, #e5e1e4));">
                ${ICONS.notes}
                <span>My Published Notes</span>
              </h3>
              <span class="pv-notes-count pv-my-notes-count" style="font-size: 0.75rem; color: var(--omni-text-muted, var(--text-muted, #8c909f));">0 notes</span>
            </div>

            <div class="pv-notes-list pv-my-notes-list" style="display: flex; flex-direction: column; gap: 10px;">
              <div class="pv-notes-loading" style="padding: 24px; text-align: center; color: var(--omni-text-muted, var(--text-muted, #8c909f)); font-size: 0.85rem;">
                Loading timeline notes...
              </div>
            </div>

            <!-- Infinite Scroll Sentinel & Load More Trigger -->
            <div class="pv-sentinel pv-my-sentinel" data-sentinel="true" style="display: none; justify-content: center; padding: 16px 0 8px 0;">
              <button class="btn-feed-load-more btn-my-notes-load-more btn-secondary" style="font-size: 0.84rem; padding: 8px 24px; border-radius: 20px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                <span>Load more notes</span>
              </button>
            </div>
          </div>

        </div>
      </div>

      <!-- 2. USER PROFILE TAB VIEW (INSPECT EXTERNAL USER) -->
      <div class="pv-tab-content pv-tab-user-profile pv-tab-user" style="display: none;">
        <!-- Top bar with Back button -->
        <div class="pv-profile-top-bar" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px;">
          <button class="btn-profile-back btn-secondary" style="display: none;">
            ${ICONS.arrowLeft}
            <span class="btn-profile-back-text">Back to Following</span>
          </button>
        </div>

        <!-- Top Search Bar -->
        <div class="pv-search-bar" style="display: none; align-items: center; gap: 8px; padding: 6px 10px; margin-bottom: 16px;">
          <span style="color: var(--omni-text-muted, var(--text-muted, #8c909f)); display: flex; align-items: center;">${ICONS.search}</span>
          <input class="pv-search-input" type="text" placeholder="Lookup pubkey (hex) or npub1..." style="flex: 1; background: transparent; border: none; outline: none; color: inherit; font-family: var(--omni-font-mono, monospace); font-size: 0.8rem;" />
          <button class="pv-search-btn btn-secondary">Lookup</button>
        </div>

        <!-- Empty state when no external user is selected -->
        <div class="pv-user-empty-state" style="background: var(--omni-bg-surface, var(--bg-surface, #232227)); border: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038)); border-radius: var(--radius-md, 10px); padding: 36px 20px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px;">
          <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--omni-bg-subtle, var(--bg-subtle, #33323b)); display: flex; align-items: center; justify-content: center; color: var(--omni-accent-primary, var(--accent-primary, #4d8eff));">
            ${ICONS.user}
          </div>
          <h3 style="margin: 0; font-size: 1.05rem; font-weight: 600; color: var(--omni-text-primary, var(--text-primary, #e5e1e4));">Inspect a Profile</h3>
          <p style="margin: 0; font-size: 0.85rem; color: var(--omni-text-secondary, var(--text-secondary, #c2c6d6)); max-width: 420px; line-height: 1.5;">
            Enter an npub or hex public key above, or select an account from your Following list to inspect their profile and notes.
          </p>
          <div style="display: flex; gap: 8px; margin-top: 6px;">
            <button class="btn-empty-browse-following btn-secondary" style="padding: 6px 14px; font-size: 0.82rem;">
              ${ICONS.users} Browse Following
            </button>
          </div>
        </div>

        <!-- Target User Card -->
        <div class="pv-card pv-user-card" style="display: none; background: var(--omni-bg-surface, var(--bg-surface, #232227)); border: 1px solid var(--omni-border-strong, var(--border-strong, #42404b)); border-radius: var(--omni-radius-md, 10px); overflow: hidden; flex-direction: column; width: 100%; max-width: 100%; box-sizing: border-box;">
          
          <!-- Identity & Metadata Section -->
          <div class="pv-info-section" style="padding: 16px; display: flex; flex-direction: column; gap: 14px; position: relative; width: 100%; max-width: 100%; box-sizing: border-box; overflow: hidden;">
            
            <!-- Avatar & Actions Header -->
            <div class="pv-avatar-actions-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; gap: 8px; flex-wrap: wrap; width: 100%; box-sizing: border-box;">
              <div class="pv-avatar-wrap pv-user-avatar-wrap" style="width: 72px; height: 72px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.4); flex-shrink: 0; padding: 0;">
                <div class="pv-avatar-fallback pv-user-avatar-fallback" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; font-weight: 700; color: #fff;">?</div>
              </div>
              
              <div class="pv-action-buttons pv-user-action-buttons" style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; max-width: 100%; min-width: 0; flex-shrink: 1;">
                <button class="pv-btn-follow btn-follow-toggle" style="display: none; white-space: nowrap; flex-shrink: 0;" title="Follow or Unfollow user">Follow</button>
                <button class="pv-btn-block btn-block-toggle" style="display: none; white-space: nowrap; flex-shrink: 0;" title="Block or Unblock user">Block</button>
                <button class="pv-btn-refresh btn-secondary" style="white-space: nowrap; flex-shrink: 0;" title="Refresh Profile & Notes">
                  ${ICONS.refresh}
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            <!-- Name & Handles -->
            <div style="display: flex; flex-direction: column; gap: 3px;">
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <h2 class="pv-display-name pv-user-display-name" style="margin: 0; font-size: 1.25rem; font-weight: 700;">Loading Profile...</h2>
                <span class="pv-nip05-badge pv-user-nip05-badge" style="display: none; align-items: center; gap: 4px; font-size: 0.72rem; padding: 2px 8px; border-radius: 12px; background: color-mix(in srgb, var(--omni-accent-primary, var(--accent-primary, #4d8eff)) 15%, transparent); color: var(--omni-accent-primary, var(--accent-primary, #4d8eff)); border: 1px solid color-mix(in srgb, var(--omni-accent-primary, var(--accent-primary, #4d8eff)) 30%, transparent);">
                  ${ICONS.checkCircle}
                  <span class="pv-nip05-text pv-user-nip05-text"></span>
                </span>
              </div>
              <div class="pv-handle pv-user-handle" style="font-size: 0.84rem; color: var(--omni-text-secondary, var(--text-secondary, #c2c6d6));">@...</div>
            </div>

            <!-- Npub Copy Pill -->
            <div class="pv-npub-row" style="display: flex; align-items: center; gap: 8px;">
              <div class="pv-npub-pill pv-user-npub-pill" style="display: flex; align-items: center; gap: 6px; padding: 4px 10px; font-family: var(--omni-font-mono, monospace); font-size: 0.74rem; color: var(--omni-text-muted, var(--text-muted, #8c909f)); max-width: 100%; overflow: hidden;">
                <span class="pv-npub-text pv-user-npub-text" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">npub...</span>
              </div>
              <button class="pv-btn-copy-npub pv-btn-copy-user-npub btn-secondary" title="Copy npub to clipboard">
                ${ICONS.copy}
                <span class="pv-copy-label pv-user-copy-label">Copy</span>
              </button>
            </div>

            <!-- Bio / About -->
            <div class="pv-about pv-user-about" style="font-size: 0.88rem; line-height: 1.5; color: var(--omni-text-primary, var(--text-primary, #e5e1e4)); white-space: pre-wrap; word-break: break-word; display: none;"></div>

            <!-- Extra Metadata Row (Website / Lightning) -->
            <div class="pv-meta-links pv-user-meta-links" style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap; font-size: 0.78rem; border-top: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038)); padding-top: 10px; margin-top: 2px;">
              <div class="pv-lud16-wrap pv-user-lud16-wrap" style="display: none; align-items: center; gap: 4px; color: var(--omni-accent-primary, var(--accent-primary, #4d8eff));">
                ${ICONS.bolt}
                <span class="pv-lud16-text pv-user-lud16-text"></span>
              </div>
              <div class="pv-website-wrap pv-user-website-wrap" style="display: none; align-items: center; gap: 4px; color: var(--omni-text-secondary, var(--text-secondary, #c2c6d6));">
                ${ICONS.link}
                <a class="pv-website-link pv-user-website-link" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none;"></a>
              </div>
            </div>
          </div>
        </div>

        <!-- Target User Notes Feed Section -->
        <div class="pv-notes-section pv-user-notes-section" style="display: none; flex-direction: column; gap: 10px; margin-top: 16px;">
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038)); padding-bottom: 8px;">
            <h3 style="margin: 0; font-size: 0.95rem; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; color: var(--omni-text-primary, var(--text-primary, #e5e1e4));">
              ${ICONS.notes}
              <span>Recent Notes</span>
            </h3>
            <span class="pv-notes-count pv-user-notes-count" style="font-size: 0.75rem; color: var(--omni-text-muted, var(--text-muted, #8c909f));">0 notes</span>
          </div>

          <div class="pv-notes-list pv-user-notes-list" style="display: flex; flex-direction: column; gap: 10px;">
            <div class="pv-notes-loading" style="padding: 24px; text-align: center; color: var(--omni-text-muted, var(--text-muted, #8c909f)); font-size: 0.85rem;">
              Loading timeline notes...
            </div>
          </div>

          <!-- Infinite Scroll Sentinel & Load More Trigger -->
          <div class="pv-sentinel pv-user-sentinel" data-sentinel="true" style="display: none; justify-content: center; padding: 16px 0 8px 0;">
            <button class="btn-feed-load-more btn-user-notes-load-more btn-secondary" style="font-size: 0.84rem; padding: 8px 24px; border-radius: 20px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
              <span>Load more notes</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 3. FOLLOWING TAB VIEW -->
      <div class="pv-tab-content pv-tab-following" style="display: none;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 14px;">
          <input class="following-filter-input" type="text" placeholder="Filter followed accounts..." style="flex: 1; background: var(--omni-bg-surface, var(--bg-surface, #232227)); border: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038)); border-radius: var(--omni-radius-md, 8px); padding: 8px 12px; color: var(--omni-text-primary, var(--text-primary, #e5e1e4)); outline: none; font-size: 0.82rem;" />
        </div>
        <div class="following-list-container people-list-container">
          <div class="following-loading" style="padding: 24px; text-align: center; color: var(--omni-text-muted, var(--text-muted, #8c909f)); font-size: 0.85rem;">
            Loading following accounts...
          </div>
        </div>
      </div>

      <!-- 4. BLOCKED TAB VIEW -->
      <div class="pv-tab-content pv-tab-blocked" style="display: none;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 14px;">
          <input class="blocked-filter-input" type="text" placeholder="Filter blocked accounts..." style="flex: 1; background: var(--omni-bg-surface, var(--bg-surface, #232227)); border: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038)); border-radius: var(--omni-radius-md, 8px); padding: 8px 12px; color: var(--omni-text-primary, var(--text-primary, #e5e1e4)); outline: none; font-size: 0.82rem;" />
        </div>
        <div class="blocked-list-container people-list-container">
          <div class="blocked-loading" style="padding: 24px; text-align: center; color: var(--omni-text-muted, var(--text-muted, #8c909f)); font-size: 0.85rem;">
            Loading blocked accounts...
          </div>
        </div>
      </div>

    </div>
  `;

  // Tab elements
  const btnTabMyProfile = container.querySelector<HTMLButtonElement>(".btn-tab-my-profile")!;
  const btnTabUserProfile = container.querySelector<HTMLButtonElement>(".btn-tab-user-profile")!;
  const btnTabProfile = btnTabMyProfile; // Alias for backward compatibility
  const btnTabFollowing = container.querySelector<HTMLButtonElement>(".btn-tab-following")!;
  const btnTabBlocked = container.querySelector<HTMLButtonElement>(".btn-tab-blocked")!;
  const countFollowingEl = container.querySelector<HTMLElement>(".count-following")!;
  const countBlockedEl = container.querySelector<HTMLElement>(".count-blocked")!;

  const tabMyProfile = container.querySelector<HTMLElement>(".pv-tab-my-profile")!;
  const tabUserProfile = container.querySelector<HTMLElement>(".pv-tab-user-profile")!;
  const tabProfile = tabMyProfile; // Alias for backward compatibility
  const tabFollowing = container.querySelector<HTMLElement>(".pv-tab-following")!;
  const tabBlocked = container.querySelector<HTMLElement>(".pv-tab-blocked")!;

  const followingListEl = container.querySelector<HTMLElement>(".following-list-container")!;
  const blockedListEl = container.querySelector<HTMLElement>(".blocked-list-container")!;
  const followingFilterInput = container.querySelector<HTMLInputElement>(".following-filter-input")!;
  const blockedFilterInput = container.querySelector<HTMLInputElement>(".blocked-filter-input")!;

  // User Profile elements (for inspecting external users)
  const userEmptyState = tabUserProfile.querySelector<HTMLElement>(".pv-user-empty-state")!;
  const userCardEl = tabUserProfile.querySelector<HTMLElement>(".pv-user-card")!;
  const userNotesSectionEl = tabUserProfile.querySelector<HTMLElement>(".pv-user-notes-section")!;
  const btnEmptyBrowseFollowing = tabUserProfile.querySelector<HTMLButtonElement>(".btn-empty-browse-following")!;

  const btnToggleLookup = container.querySelector<HTMLButtonElement>(".btn-toggle-lookup")!;
  const btnProfileBack = tabUserProfile.querySelector<HTMLButtonElement>(".btn-profile-back")!;
  const btnProfileBackText = tabUserProfile.querySelector<HTMLElement>(".btn-profile-back-text")!;
  const searchBarEl = tabUserProfile.querySelector<HTMLElement>(".pv-search-bar")!;

  const bannerEl = tabUserProfile.querySelector<HTMLElement>(".pv-user-banner");
  const avatarWrapEl = tabUserProfile.querySelector<HTMLElement>(".pv-user-avatar-wrap")!;
  const displayNameEl = tabUserProfile.querySelector<HTMLElement>(".pv-user-display-name")!;
  const handleEl = tabUserProfile.querySelector<HTMLElement>(".pv-user-handle")!;
  const nip05BadgeEl = tabUserProfile.querySelector<HTMLElement>(".pv-user-nip05-badge")!;
  const nip05TextEl = tabUserProfile.querySelector<HTMLElement>(".pv-user-nip05-text")!;
  const npubTextEl = tabUserProfile.querySelector<HTMLElement>(".pv-user-npub-text")!;
  const copyBtn = tabUserProfile.querySelector<HTMLButtonElement>(".pv-btn-copy-npub")!;
  const copyLabel = tabUserProfile.querySelector<HTMLElement>(".pv-user-copy-label")!;
  const aboutEl = tabUserProfile.querySelector<HTMLElement>(".pv-user-about")!;
  const lud16Wrap = tabUserProfile.querySelector<HTMLElement>(".pv-user-lud16-wrap")!;
  const lud16Text = tabUserProfile.querySelector<HTMLElement>(".pv-user-lud16-text")!;
  const websiteWrap = tabUserProfile.querySelector<HTMLElement>(".pv-user-website-wrap")!;
  const websiteLink = tabUserProfile.querySelector<HTMLAnchorElement>(".pv-user-website-link")!;
  const notesListEl = tabUserProfile.querySelector<HTMLElement>(".pv-user-notes-list")!;
  const userSentinelEl = tabUserProfile.querySelector<HTMLElement>(".pv-user-sentinel")!;
  const btnUserNotesLoadMore = tabUserProfile.querySelector<HTMLButtonElement>(".btn-user-notes-load-more")!;
  const notesCountEl = tabUserProfile.querySelector<HTMLElement>(".pv-user-notes-count")!;
  const searchInput = tabUserProfile.querySelector<HTMLInputElement>(".pv-search-input")!;
  const searchBtn = tabUserProfile.querySelector<HTMLButtonElement>(".pv-search-btn")!;
  const btnRefresh = tabUserProfile.querySelector<HTMLButtonElement>(".pv-btn-refresh")!;
  const btnFollow = tabUserProfile.querySelector<HTMLButtonElement>(".pv-btn-follow")!;
  const btnBlock = tabUserProfile.querySelector<HTMLButtonElement>(".pv-btn-block")!;

  // My Profile elements (for authenticated identity)
  const myBannerEl = tabMyProfile.querySelector<HTMLElement>(".pv-my-banner");
  const myAvatarWrapEl = tabMyProfile.querySelector<HTMLElement>(".pv-my-avatar-wrap")!;
  const myDisplayNameEl = tabMyProfile.querySelector<HTMLElement>(".pv-my-display-name")!;
  const myHandleEl = tabMyProfile.querySelector<HTMLElement>(".pv-my-handle")!;
  const myNip05BadgeEl = tabMyProfile.querySelector<HTMLElement>(".pv-my-nip05-badge")!;
  const myNip05TextEl = tabMyProfile.querySelector<HTMLElement>(".pv-my-nip05-text")!;
  const myNpubTextEl = tabMyProfile.querySelector<HTMLElement>(".pv-my-npub-text")!;
  const myCopyBtn = tabMyProfile.querySelector<HTMLButtonElement>(".pv-btn-copy-my-npub")!;
  const myCopyLabel = tabMyProfile.querySelector<HTMLElement>(".pv-my-copy-label")!;
  const myAboutEl = tabMyProfile.querySelector<HTMLElement>(".pv-my-about")!;
  const myLud16Wrap = tabMyProfile.querySelector<HTMLElement>(".pv-my-lud16-wrap")!;
  const myLud16Text = tabMyProfile.querySelector<HTMLElement>(".pv-my-lud16-text")!;
  const myWebsiteWrap = tabMyProfile.querySelector<HTMLElement>(".pv-my-website-wrap")!;
  const myWebsiteLink = tabMyProfile.querySelector<HTMLAnchorElement>(".pv-my-website-link")!;
  const myBtnEditProfile = tabMyProfile.querySelector<HTMLButtonElement>(".pv-btn-edit-profile")!;
  const myBtnKeys = tabMyProfile.querySelector<HTMLButtonElement>(".pv-btn-keys")!;
  const myBtnMyNotes = tabMyProfile.querySelector<HTMLButtonElement>(".pv-btn-my-notes");
  const myBtnSync = tabMyProfile.querySelector<HTMLButtonElement>(".pv-btn-my-sync")!;
  const myNotesListEl = tabMyProfile.querySelector<HTMLElement>(".pv-my-notes-list")!;
  const mySentinelEl = tabMyProfile.querySelector<HTMLElement>(".pv-my-sentinel")!;
  const btnMyNotesLoadMore = tabMyProfile.querySelector<HTMLButtonElement>(".btn-my-notes-load-more")!;
  const myNotesCountEl = tabMyProfile.querySelector<HTMLElement>(".pv-my-notes-count")!;
  const myNotesCountPill = tabMyProfile.querySelector<HTMLElement>(".pv-my-notes-count-pill");

  // Edit Panel elements (inside My Profile)
  const editPanel = tabMyProfile.querySelector<HTMLElement>(".pv-edit-panel")!;
  const btnEditProfile = myBtnEditProfile;
  const btnKeys = myBtnKeys;
  const btnCloseEdit = container.querySelector<HTMLButtonElement>(".btn-close-edit");
  const btnInnerTabProfile = tabMyProfile.querySelector<HTMLButtonElement>("#btn-tab-profile")!;
  const btnInnerTabKeys = tabMyProfile.querySelector<HTMLButtonElement>("#btn-tab-keys")!;
  const btnInnerTabMyNotes = tabMyProfile.querySelector<HTMLButtonElement>("#btn-tab-my-notes");
  const paneProfile = editPanel.querySelector<HTMLElement>(".pane-profile")!;
  const paneKeys = editPanel.querySelector<HTMLElement>(".pane-keys")!;
  const paneNotes = editPanel.querySelector<HTMLElement>(".pane-notes");
  const toastBanner = editPanel.querySelector<HTMLElement>("#prof-toast")!;

  // Edit form fields
  const rowDName = editPanel.querySelector<HTMLInputElement>("#prof-display-name")!;
  const rowName = editPanel.querySelector<HTMLInputElement>("#prof-name")!;
  const inpAbout = editPanel.querySelector<HTMLTextAreaElement>("#prof-about")!;
  const rowPic = editPanel.querySelector<HTMLInputElement>("#prof-picture")!;
  const rowBanner = editPanel.querySelector<HTMLInputElement>("#prof-banner")!;
  const rowNip05 = editPanel.querySelector<HTMLInputElement>("#prof-nip05")!;
  const rowLud16 = editPanel.querySelector<HTMLInputElement>("#prof-lud16")!;
  const rowWebsite = editPanel.querySelector<HTMLInputElement>("#prof-website")!;
  const btnSave = editPanel.querySelector<HTMLButtonElement>("#btn-save-profile")!;
  const btnSync = editPanel.querySelector<HTMLButtonElement>("#btn-sync-profile")!;

  // Keys fields
  const inpNpub = editPanel.querySelector<HTMLInputElement>("#key-npub")!;
  const inpPubkey = editPanel.querySelector<HTMLInputElement>("#key-hex")!;
  const btnCopyNpub = editPanel.querySelector<HTMLButtonElement>("#btn-copy-npub")!;
  const btnCopyHex = editPanel.querySelector<HTMLButtonElement>("#btn-copy-hex")!;
  const inpImportKey = editPanel.querySelector<HTMLInputElement>("#key-import");
  const btnImportKey = editPanel.querySelector<HTMLButtonElement>("#btn-import-key");
  const btnGenerateKey = editPanel.querySelector<HTMLButtonElement>("#btn-generate-key");

  root.appendChild(container);

  let previousTab: "following" | "blocked" | null = null;

  const showToast = (message: string, isError = false) => {
    if (!toastBanner) return;
    toastBanner.style.display = "flex";
    toastBanner.style.background = isError ? "rgba(239, 68, 68, 0.15)" : "rgba(34, 197, 94, 0.15)";
    toastBanner.style.color = isError ? "#f87171" : "#4ade80";
    toastBanner.style.border = `1px solid ${isError ? "rgba(239, 68, 68, 0.3)" : "rgba(34, 197, 94, 0.3)"}`;
    toastBanner.innerHTML = `<span style="flex-shrink: 0; display: flex; align-items: center;">${isError ? ICONS.shield : ICONS.check}</span><span>${escapeHtml(message)}</span>`;
    setTimeout(() => {
      toastBanner.style.display = "none";
    }, 3500);
  };

  const updateLiveAvatarPreview = (_url?: string) => {
    const initial = (rowDName.value || rowName.value || myPubkey || "?")[0]?.toUpperCase() || "?";
    myAvatarWrapEl.innerHTML = getAvatarSvg(myPubkey || "default", initial);
  };

  rowPic.addEventListener("input", () => {
    updateLiveAvatarPreview(rowPic.value);
  });
  rowDName.addEventListener("input", () => {
    updateLiveAvatarPreview();
    myDisplayNameEl.textContent = rowDName.value.trim() || (myPubkey ? `nostr:${myPubkey.slice(0, 8)}` : "Active Identity");
  });
  rowName.addEventListener("input", () => {
    updateLiveAvatarPreview();
    myHandleEl.textContent = rowName.value.trim() ? `@${rowName.value.trim()}` : `@npub1${(myPubkey || "").slice(0, 8)}`;
  });
  rowNip05.addEventListener("input", () => {
    const val = rowNip05.value.trim();
    if (val) {
      myNip05TextEl.textContent = val;
      myNip05BadgeEl.style.display = "inline-flex";
    } else {
      myNip05BadgeEl.style.display = "none";
    }
  });

  function populateEditForm(meta: ProfileMetadata | null) {
    if (myPubkey) {
      const npub = hexToNpub(myPubkey);
      if (inpNpub) inpNpub.value = npub;
      if (inpPubkey) inpPubkey.value = myPubkey;
    }
    if (meta) {
      rowDName.value = meta.display_name || "";
      rowName.value = meta.name || "";
      inpAbout.value = meta.about || "";
      rowPic.value = meta.picture || "";
      rowBanner.value = meta.banner || "";
      rowNip05.value = meta.nip05 || "";
      rowLud16.value = meta.lud16 || "";
      rowWebsite.value = meta.website || "";
      updateLiveAvatarPreview(meta.picture);
    }
  }

  function toggleEditPanel(targetPane: "profile" | "keys" | "notes" = "notes", _forceOpen?: boolean) {
    editPanel.style.display = "flex";

    btnInnerTabProfile.classList.toggle("active", targetPane === "profile");
    btnInnerTabProfile.style.color = targetPane === "profile" ? "var(--omni-accent-primary, var(--accent-primary, #4d8eff))" : "var(--omni-text-muted, var(--text-muted, #8c909f))";

    btnInnerTabKeys.classList.toggle("active", targetPane === "keys");
    btnInnerTabKeys.style.color = targetPane === "keys" ? "var(--omni-accent-primary, var(--accent-primary, #4d8eff))" : "var(--omni-text-muted, var(--text-muted, #8c909f))";

    if (btnInnerTabMyNotes) {
      btnInnerTabMyNotes.classList.toggle("active", targetPane === "notes");
      btnInnerTabMyNotes.style.color = targetPane === "notes" ? "var(--omni-accent-primary, var(--accent-primary, #4d8eff))" : "var(--omni-text-muted, var(--text-muted, #8c909f))";
    }

    paneProfile.style.display = targetPane === "profile" ? "flex" : "none";
    paneKeys.style.display = targetPane === "keys" ? "flex" : "none";
    if (paneNotes) {
      paneNotes.style.display = targetPane === "notes" ? "flex" : "none";
    }

    if (myPubkey) {
      const cached = profileCache.get(myPubkey);
      populateEditForm(cached || null);
    }
  }

  const btnEditCard = tabMyProfile.querySelector<HTMLButtonElement>(".pv-btn-edit-profile-card");
  btnEditCard?.addEventListener("click", () => {
    toggleEditPanel("profile");
    editPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  btnInnerTabProfile.addEventListener("click", () => toggleEditPanel("profile"));
  btnInnerTabKeys.addEventListener("click", () => toggleEditPanel("keys"));
  if (btnInnerTabMyNotes) {
    btnInnerTabMyNotes.addEventListener("click", () => toggleEditPanel("notes"));
  }
  btnCloseEdit?.addEventListener("click", () => toggleEditPanel("profile"));

  // Key Copy Handlers
  const copyText = (val: string, btn: HTMLButtonElement) => {
    if (typeof navigator !== "undefined" && navigator.clipboard && val) {
      navigator.clipboard.writeText(val);
      const span = btn.querySelector("span");
      if (span) span.textContent = "Copied!";
      setTimeout(() => {
        if (span) span.textContent = "Copy";
      }, 1400);
    }
  };

  btnCopyNpub.addEventListener("click", () => copyText(inpNpub.value, btnCopyNpub));
  btnCopyHex.addEventListener("click", () => copyText(inpPubkey.value, btnCopyHex));

  btnImportKey?.addEventListener("click", async () => {
    const keyVal = inpImportKey?.value.trim();
    if (!keyVal) {
      showToast("Please enter a private key (nsec1... or 64-char hex)", true);
      return;
    }

    const origText = btnImportKey.textContent || "Import & Switch";
    btnImportKey.textContent = "Switching Identity...";
    btnImportKey.disabled = true;

    try {
      const omniObj = typeof window !== "undefined" ? (window as any).omni : null;
      if (!omniObj?.auth?.switchKey) {
        throw new Error("Key switching is not supported by the runtime.");
      }

      const res = await omniObj.auth.switchKey(keyVal);
      if (res?.pubkey) {
        myPubkey = res.pubkey;
        populateEditForm(profileCache.get(res.pubkey) || null);
        initUserSocialGraph(res.pubkey);
        loadMyProfile(res.pubkey);
      }
      if (inpImportKey) {
        inpImportKey.value = "";
      }
      showToast("Identity switched successfully!");
    } catch (err: any) {
      showToast(`Failed to switch identity: ${err?.message || String(err)}`, true);
    } finally {
      btnImportKey.textContent = origText;
      btnImportKey.disabled = false;
    }
  });

  btnGenerateKey?.addEventListener("click", async () => {
    const confirmed = typeof window !== "undefined" && window.confirm
      ? window.confirm("Generate and switch to a fresh Nostr keypair? This will activate a new anonymous identity.")
      : true;
    if (!confirmed) return;

    const origText = btnGenerateKey.textContent || "Generate Fresh Keypair";
    btnGenerateKey.textContent = "Generating...";
    btnGenerateKey.disabled = true;

    try {
      const omniObj = typeof window !== "undefined" ? (window as any).omni : null;
      if (!omniObj?.auth?.generateKey) {
        throw new Error("Key generation is not supported by the runtime.");
      }

      const res = await omniObj.auth.generateKey();
      if (res?.pubkey) {
        myPubkey = res.pubkey;
        populateEditForm(profileCache.get(res.pubkey) || null);
        initUserSocialGraph(res.pubkey);
        loadMyProfile(res.pubkey);
      }
      showToast("New Nostr keypair generated and activated!");
    } catch (err: any) {
      showToast(`Failed to generate key: ${err?.message || String(err)}`, true);
    } finally {
      btnGenerateKey.textContent = origText;
      btnGenerateKey.disabled = false;
    }
  });

  // Save & Publish Profile (kind 0)
  btnSave.addEventListener("click", async () => {
    btnSave.disabled = true;
    btnSave.textContent = "Publishing to Nostr...";
    try {
      const meta: ProfileMetadata = {};
      if (rowDName.value.trim()) meta.display_name = rowDName.value.trim();
      if (rowName.value.trim()) meta.name = rowName.value.trim();
      if (inpAbout.value.trim()) meta.about = inpAbout.value.trim();
      if (rowPic.value.trim()) meta.picture = rowPic.value.trim();
      if (rowBanner.value.trim()) meta.banner = rowBanner.value.trim();
      if (rowNip05.value.trim()) meta.nip05 = rowNip05.value.trim();
      if (rowLud16.value.trim()) meta.lud16 = rowLud16.value.trim();
      if (rowWebsite.value.trim()) meta.website = rowWebsite.value.trim();

      const omniObj = typeof window !== "undefined" ? (window as any).omni : null;
      const nostr = typeof window !== "undefined" ? (window as any).nostr : null;

      if (omniObj?.profile?.publish) {
        await omniObj.profile.publish(meta);
      } else if (nostr?.signEvent) {
        const draft = {
          kind: 0,
          content: JSON.stringify(meta),
          tags: [],
          created_at: Math.floor(Date.now() / 1000)
        };
        const signed = await nostr.signEvent(draft);
        sendWs(["EVENT", signed]);
      }

      if (myPubkey) {
        profileCache.set(myPubkey, meta);
        persistProfileCache(profileCache);
        renderMyProfileMetadata(myPubkey, meta);
      }

      btnSave.textContent = "Profile Published!";
      showToast("Profile published to Nostr relays!");
      setTimeout(() => {
        btnSave.disabled = false;
        btnSave.textContent = "Save & Publish Profile (kind 0)";
      }, 1800);
    } catch (err: any) {
      showToast(`Failed to publish profile: ${err?.message || String(err)}`, true);
      btnSave.disabled = false;
      btnSave.textContent = "Save & Publish Profile (kind 0)";
    }
  });

  // Sync profile metadata from relays
  btnSync.addEventListener("click", async () => {
    btnSync.disabled = true;
    btnSync.innerHTML = `${ICONS.refresh} Syncing...`;
    try {
      if (myPubkey) {
        sendWs(["REQ", `pv_sync_${Date.now()}`, { kinds: [0], authors: [myPubkey], limit: 1 }]);
      }
      setTimeout(() => {
        btnSync.disabled = false;
        btnSync.innerHTML = `${ICONS.refresh} Sync from Relays`;
        showToast("Synchronized profile metadata from relays!");
      }, 1000);
    } catch (_) {
      btnSync.disabled = false;
      btnSync.innerHTML = `${ICONS.refresh} Sync from Relays`;
    }
  });

  function updateProfileBackButton() {
    if (previousTab && (activeTab === "user-profile" || (activeTab as any) === "profile")) {
      btnProfileBack.style.display = "inline-flex";
      btnProfileBackText.textContent = previousTab === "blocked" ? "Back to Blocked" : "Back to Following";
    } else {
      btnProfileBack.style.display = "none";
    }
  }

  // Tab switching with optional pushState
  function switchTab(
    tab: "my-profile" | "user-profile" | "following" | "blocked" | "profile",
    pushState = true
  ) {
    const normalizedTab = tab === "profile" ? "my-profile" : tab;
    const isSameTab = activeTab === normalizedTab;
    activeTab = normalizedTab;

    btnTabMyProfile.classList.toggle("active", normalizedTab === "my-profile");
    btnTabUserProfile.classList.toggle("active", normalizedTab === "user-profile");
    btnTabFollowing.classList.toggle("active", normalizedTab === "following");
    btnTabBlocked.classList.toggle("active", normalizedTab === "blocked");

    if (normalizedTab === "user-profile") {
      btnTabUserProfile.style.display = "inline-flex";
    } else if (!activeUserPubkey) {
      btnTabUserProfile.style.display = "none";
    }

    tabMyProfile.style.display = normalizedTab === "my-profile" ? "block" : "none";
    tabUserProfile.style.display = normalizedTab === "user-profile" ? "block" : "none";
    tabFollowing.style.display = normalizedTab === "following" ? "block" : "none";
    tabBlocked.style.display = normalizedTab === "blocked" ? "block" : "none";

    updateProfileBackButton();

    // Ensure viewport resets to top when navigating across tabs or profiles
    try {
      if (typeof window !== "undefined") {
        if (typeof window.scrollTo === "function") {
          window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        }
        if (document.documentElement) document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
      }
      container.scrollIntoView({ behavior: "instant", block: "start" });
    } catch (_) {}

    if (pushState && !isSameTab) {
      try {
        const queryPubkey = normalizedTab === "user-profile" ? activeUserPubkey : "";
        window.history.pushState(
          { type: "omni-people-view", tab: normalizedTab, pubkey: queryPubkey, from: previousTab },
          "",
          `?view=${normalizedTab}${queryPubkey ? `&pubkey=${queryPubkey}` : ""}`
        );
      } catch (err) {
      console.error("WS message error:", err);
    }
    }

    if (normalizedTab === "following") {
      if (myPubkey && myFollows.size === 0) {
        loadCachedSocialGraph(myPubkey);
        sendWs(["REQ", "pv_my_contacts", { kinds: [3], authors: [myPubkey], limit: 1 }]);
      }
      renderFollowingList();
    } else if (normalizedTab === "blocked") {
      if (myPubkey && myMutes.size === 0) {
        loadCachedSocialGraph(myPubkey);
        sendWs(["REQ", "pv_my_mutes", { kinds: [10000], authors: [myPubkey], limit: 1 }]);
      }
      renderBlockedList();
    } else if (normalizedTab === "my-profile") {
      if (myPubkey && !myProfileRendered) {
        loadMyProfile(myPubkey);
      }
    } else if (normalizedTab === "user-profile") {
      if (activeUserPubkey && activePubkey !== activeUserPubkey) {
        loadUserProfile(activeUserPubkey);
      } else if (!activeUserPubkey) {
        renderUserProfileMetadata("", null);
      }
    }
  }

  btnTabMyProfile.addEventListener("click", () => {
    previousTab = null;
    activeUserPubkey = "";
    btnTabUserProfile.style.display = "none";
    switchTab("my-profile", true);
  });
  btnTabUserProfile.addEventListener("click", () => {
    previousTab = null;
    btnTabUserProfile.style.display = "inline-flex";
    switchTab("user-profile", true);
  });
  btnTabFollowing.addEventListener("click", () => {
    previousTab = null;
    activeUserPubkey = "";
    btnTabUserProfile.style.display = "none";
    switchTab("following", true);
  });
  btnTabBlocked.addEventListener("click", () => {
    previousTab = null;
    activeUserPubkey = "";
    btnTabUserProfile.style.display = "none";
    switchTab("blocked", true);
  });
  btnEmptyBrowseFollowing.addEventListener("click", () => {
    previousTab = null;
    activeUserPubkey = "";
    btnTabUserProfile.style.display = "none";
    switchTab("following", true);
  });

  // Profile back button handler: returns directly to following (or blocked) list without popping shell app history
  btnProfileBack.addEventListener("click", () => {
    activeUserPubkey = "";
    btnTabUserProfile.style.display = "none";
    const target = previousTab || "following";
    previousTab = null;
    updateProfileBackButton();

    // Ensure viewport resets to top when navigating across tabs or profiles
    try {
      if (typeof window !== "undefined") {
        if (typeof window.scrollTo === "function") {
          window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        }
        if (document.documentElement) document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
      }
      container.scrollIntoView({ behavior: "instant", block: "start" });
    } catch (_) {}

    try {
      if (typeof window !== "undefined" && window.history.replaceState) {
        window.history.replaceState(
          { type: "omni-people-view", tab: target },
          "",
          `?view=${target}`
        );
      }
    } catch (_) {}

    switchTab(target as any, false);
  });

  // Toggle npub lookup bar
  btnToggleLookup.addEventListener("click", () => {
    const isHidden = searchBarEl.style.display === "none" || !searchBarEl.style.display;
    searchBarEl.style.display = isHidden ? "flex" : "none";
    if (isHidden) {
      if (activeTab !== "user-profile") {
        previousTab = null;
        switchTab("user-profile", true);
      }
      setTimeout(() => searchInput.focus(), 50);
    }
  });

  // Copy npub handlers
  copyBtn.addEventListener("click", async () => {
    const target = activeUserPubkey || activePubkey;
    const npub = hexToNpub(target);
    if (!npub) return;
    try {
      await navigator.clipboard.writeText(npub);
      copyLabel.textContent = "Copied!";
      setTimeout(() => {
        copyLabel.textContent = "Copy";
      }, 1500);
    } catch (err) {
      console.error("WS message error:", err);
    }
  });

  myCopyBtn.addEventListener("click", async () => {
    const npub = hexToNpub(myPubkey);
    if (!npub) return;
    try {
      await navigator.clipboard.writeText(npub);
      myCopyLabel.textContent = "Copied!";
      setTimeout(() => {
        myCopyLabel.textContent = "Copy";
      }, 1500);
    } catch (err) {
      console.error("WS message error:", err);
    }
  });

  // Search / Lookup handler
  const handleLookup = () => {
    let raw = searchInput.value?.trim() || "";
    if (!raw) return;
    if (raw.startsWith("npub1")) {
      raw = npubToHex(raw);
    }
    if (raw.length === 64) {
      previousTab = null;
      loadUserProfile(raw);
      switchTab("user-profile", true);
    } else {
      alert("Please enter a valid 64-character hex pubkey or bech32 npub1 string.");
    }
  };

  searchBtn.addEventListener("click", handleLookup);
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLookup();
  });

  btnRefresh.addEventListener("click", () => {
    if (activeUserPubkey) {
      loadUserProfile(activeUserPubkey);
    }
  });

  function updateActionButtons(pubkey?: string) {
    const target = pubkey || activeUserPubkey;
    const isSelf = Boolean(target && myPubkey && target === myPubkey);

    if (isSelf || !target) {
      btnFollow.style.display = "none";
      btnBlock.style.display = "none";
      return;
    }

    // Follow button
    btnFollow.style.display = "inline-flex";
    const isFollowing = myFollows.has(target);
    btnFollow.classList.toggle("is-following", isFollowing);
    btnFollow.textContent = isFollowing ? "Following" : "Follow";

    // Block button
    btnBlock.style.display = "inline-flex";
    const isBlocked = myMutes.has(target);
    btnBlock.classList.toggle("is-blocked", isBlocked);
    btnBlock.textContent = isBlocked ? "Blocked" : "Block";
  }

  // Follow / Unfollow logic (Kind 3)
  async function toggleFollow(targetPubkey: string) {
    if (!targetPubkey) return;
    const isCurrentlyFollowing = myFollows.has(targetPubkey);

    if (isCurrentlyFollowing) {
      myFollows.delete(targetPubkey);
      myFollowTags = myFollowTags.filter((t) => !(t[0] === "p" && t[1] === targetPubkey));
    } else {
      myFollows.add(targetPubkey);
      if (!myFollowTags.some((t) => t[0] === "p" && t[1] === targetPubkey)) {
        myFollowTags.push(["p", targetPubkey, "", ""]);
      }
    }

    if (myPubkey) {
      try {
        localStorage.setItem(getFollowsStorageKey(myPubkey), JSON.stringify(myFollowTags));
      } catch (err) {
      console.error("WS message error:", err);
    }
    }

    countFollowingEl.textContent = String(myFollows.size);
    updateActionButtons(activeUserPubkey);
    if (activeTab === "following") {
      renderFollowingList();
    }

    // Publish Kind 3
    try {
      const nostr = (window as any).nostr;
      if (nostr?.signEvent) {
        const draft = {
          kind: 3,
          content: "",
          tags: myFollowTags,
          created_at: Math.floor(Date.now() / 1000)
        };
        const signed = await nostr.signEvent(draft);
        sendWs(["EVENT", signed]);
      }
    } catch (err) {
      console.error("Failed to sign/publish kind 3 follow update:", err);
    }
  }

  // Block / Unblock logic (Kind 10000)
  async function toggleBlock(targetPubkey: string) {
    if (!targetPubkey) return;
    const isCurrentlyBlocked = myMutes.has(targetPubkey);

    if (isCurrentlyBlocked) {
      myMutes.delete(targetPubkey);
      myMuteTags = myMuteTags.filter((t) => !(t[0] === "p" && t[1] === targetPubkey));
    } else {
      myMutes.add(targetPubkey);
      if (!myMuteTags.some((t) => t[0] === "p" && t[1] === targetPubkey)) {
        myMuteTags.push(["p", targetPubkey]);
      }
    }

    if (myPubkey) {
      try {
        localStorage.setItem(getMutesStorageKey(myPubkey), JSON.stringify(myMuteTags));
      } catch (err) {
      console.error("WS message error:", err);
    }
    }

    countBlockedEl.textContent = String(myMutes.size);
    updateActionButtons(activeUserPubkey);
    if (activeTab === "blocked") {
      renderBlockedList();
    }

    // Publish Kind 10000
    try {
      const nostr = (window as any).nostr;
      if (nostr?.signEvent) {
        const draft = {
          kind: 10000,
          content: "",
          tags: myMuteTags,
          created_at: Math.floor(Date.now() / 1000)
        };
        const signed = await nostr.signEvent(draft);
        sendWs(["EVENT", signed]);
      }
    } catch (err) {
      console.error("Failed to sign/publish kind 10000 block update:", err);
    }
  }

  btnFollow.addEventListener("click", () => toggleFollow(activeUserPubkey));
  btnBlock.addEventListener("click", () => toggleBlock(activeUserPubkey));

  function renderUserProfileMetadata(pubkey: string, meta: ProfileMetadata | null) {
    if (!pubkey) {
      userEmptyState.style.display = "flex";
      userCardEl.style.display = "none";
      userNotesSectionEl.style.display = "none";
      return;
    }

    userEmptyState.style.display = "none";
    userCardEl.style.display = "flex";
    userNotesSectionEl.style.display = "flex";

    const npub = hexToNpub(pubkey);
    const initial = (meta?.display_name || meta?.name || pubkey)[0]?.toUpperCase() || "?";

    npubTextEl.textContent = npub || pubkey;

    // Dynamic vector avatar (0 KB remote downloads)
    avatarWrapEl.innerHTML = getAvatarSvg(pubkey, initial);

    // Names
    displayNameEl.textContent = meta?.display_name || meta?.name || `nostr:${pubkey.slice(0, 8)}`;
    handleEl.textContent = meta?.name ? `@${meta.name}` : `@npub1${pubkey.slice(0, 8)}`;

    // NIP-05
    if (meta?.nip05) {
      nip05TextEl.textContent = meta.nip05;
      nip05BadgeEl.style.display = "inline-flex";
    } else {
      nip05BadgeEl.style.display = "none";
    }

    // About
    if (meta?.about) {
      aboutEl.innerHTML = formatContent(meta.about);
      aboutEl.style.display = "block";
    } else {
      aboutEl.style.display = "none";
    }

    // Lightning Address (LUD-16)
    if (meta?.lud16) {
      lud16Text.textContent = meta.lud16;
      lud16Wrap.style.display = "inline-flex";
    } else {
      lud16Wrap.style.display = "none";
    }

    // Website
    if (meta?.website && typeof meta.website === "string") {
      let site = meta.website.trim();
      if (site.startsWith("http://")) site = site.replace(/^http:\/\//i, "https://");
      else if (!site.startsWith("https://")) site = `https://${site}`;
      websiteLink.href = site;
      websiteLink.textContent = site.replace(/^https?:\/\//i, "");
      websiteWrap.style.display = "inline-flex";
    } else {
      websiteWrap.style.display = "none";
    }

    updateActionButtons(pubkey);
  }

  function renderMyProfileMetadata(pubkeyOrMeta?: any, maybeMeta?: any) {
    const pubkey = (typeof pubkeyOrMeta === "string" ? pubkeyOrMeta : myPubkey) || "";
    const meta: ProfileMetadata | null = typeof pubkeyOrMeta === "object" && pubkeyOrMeta !== null ? pubkeyOrMeta : (maybeMeta || null);
    if (!pubkey) return;

    myProfileRendered = true;
    const npub = hexToNpub(pubkey);
    const initial = (meta?.display_name || meta?.name || pubkey)[0]?.toUpperCase() || "?";

    myNpubTextEl.textContent = npub || pubkey;

    // Dynamic vector avatar (0 KB remote downloads)
    myAvatarWrapEl.innerHTML = getAvatarSvg(pubkey, initial);

    // Names
    myDisplayNameEl.textContent = meta?.display_name || meta?.name || `nostr:${pubkey.slice(0, 8)}`;
    myHandleEl.textContent = meta?.name ? `@${meta.name}` : `@npub1${pubkey.slice(0, 8)}`;

    // NIP-05
    if (meta?.nip05) {
      myNip05TextEl.textContent = meta.nip05;
      myNip05BadgeEl.style.display = "inline-flex";
    } else {
      myNip05BadgeEl.style.display = "none";
    }

    // About
    if (meta?.about) {
      myAboutEl.innerHTML = formatContent(meta.about);
      myAboutEl.style.display = "block";
    } else {
      myAboutEl.style.display = "none";
    }

    // Lightning Address (LUD-16)
    if (meta?.lud16) {
      myLud16Text.textContent = meta.lud16;
      myLud16Wrap.style.display = "inline-flex";
    } else {
      myLud16Wrap.style.display = "none";
    }

    // Website
    if (meta?.website && typeof meta.website === "string") {
      let site = meta.website.trim();
      if (site.startsWith("http://")) site = site.replace(/^http:\/\//i, "https://");
      else if (!site.startsWith("https://")) site = `https://${site}`;
      myWebsiteLink.href = site;
      myWebsiteLink.textContent = site.replace(/^https?:\/\//i, "");
      myWebsiteWrap.style.display = "inline-flex";
    } else {
      myWebsiteWrap.style.display = "none";
    }
  }

  function renderProfileMetadata(pubkey: string, meta: ProfileMetadata | null) {
    if (pubkey && myPubkey && pubkey === myPubkey) {
      renderMyProfileMetadata(pubkey, meta);
    } else {
      renderUserProfileMetadata(pubkey, meta);
    }
  }

  function openNoteInFeed(eventId: string, noteData?: any) {
    if (!eventId) return;
    try {
      localStorage.setItem("omni_active_note_id", eventId);
      if (noteData) {
        localStorage.setItem("omni_active_note_data", JSON.stringify(noteData));
      }
    } catch (err) {
      console.error("Storage error:", err);
    }

    const omniRef = (window as any).omni;
    if (omniRef?.intents?.dispatch) {
      omniRef.intents.dispatch("view_note", { eventId, id: eventId, note: noteData }).catch(() => {});
    }

    window.dispatchEvent(
      new CustomEvent("intent", {
        detail: { action: "view_note", data: { eventId, id: eventId, note: noteData } }
      })
    );
    window.dispatchEvent(
      new CustomEvent("omni:intent", {
        detail: { action: "view_note", data: { eventId, id: eventId, note: noteData } }
      })
    );
  }

  function renderNoteCard(event: any): HTMLElement {
    const timeStr = event.created_at ? formatTime(event.created_at) : "just now";
    const initialReplies = Number(event.replies || 0);
    const initialReposts = Number(event.reposts || 0);
    const initialLikes = Number(event.likes || 0);

    const card = html<HTMLDivElement>`
      <div class="pv-note-card note-card" data-note-id="${escapeHtml(event.id || "")}" data-timestamp="${event.created_at || 0}" style="background: var(--omni-bg-surface, var(--bg-surface, #232227)); border: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038)); border-radius: var(--omni-radius-sm, 8px); padding: 14px; display: flex; flex-direction: column; gap: 8px; cursor: pointer; transition: border-color 0.15s ease, background 0.15s ease;" title="View thread in Feed">
        <div style="display: flex; justify-content: flex-end; align-items: center; font-size: 0.75rem; color: var(--omni-text-muted, var(--text-muted, #8c909f));">
          <span>${escapeHtml(timeStr)}</span>
        </div>
        <div style="font-size: 0.88rem; line-height: 1.45; color: var(--omni-text-primary, var(--text-primary, #e5e1e4)); white-space: pre-wrap; word-break: break-word;">
          ${formatContent(event.content || "")}
        </div>
        <div class="feed-post-actions note-actions" style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038)); padding-top: 8px; margin-top: 4px;">
          <button class="feed-action-btn note-action-btn action-reply btn-reply" style="background: none; border: none; cursor: pointer; display: flex; align-items: center; gap: 4px; color: var(--omni-text-muted, var(--text-muted, #8c909f)); font-size: 0.8rem;" title="View conversation thread in Feed">
            ${ICONS.reply}
            <span class="action-count">${initialReplies > 0 ? initialReplies : ""}</span>
          </button>
          <button class="feed-action-btn note-action-btn action-repost btn-repost" style="background: none; border: none; cursor: pointer; display: flex; align-items: center; gap: 4px; color: var(--omni-text-muted, var(--text-muted, #8c909f)); font-size: 0.8rem;" title="Repost note">
            ${ICONS.repost}
            <span class="action-count">${initialReposts > 0 ? initialReposts : ""}</span>
          </button>
          <button class="feed-action-btn note-action-btn action-like btn-like" style="background: none; border: none; cursor: pointer; display: flex; align-items: center; gap: 4px; color: var(--omni-text-muted, var(--text-muted, #8c909f)); font-size: 0.8rem;" title="Like note">
            <span class="icon-heart-wrap">${ICONS.heartOutline}</span>
            <span class="action-count">${initialLikes > 0 ? initialLikes : ""}</span>
          </button>
          <button class="feed-action-btn note-action-btn action-share btn-share" style="background: none; border: none; cursor: pointer; display: flex; align-items: center; gap: 4px; color: var(--omni-text-muted, var(--text-muted, #8c909f)); font-size: 0.8rem;" title="Share & Copy Note ID">
            ${ICONS.share}
          </button>
        </div>
      </div>
    `;

    // Action button wiring
    const btnReply = card.querySelector<HTMLButtonElement>(".action-reply")!;
    btnReply.addEventListener("click", (e) => {
      e.stopPropagation();
      openNoteInFeed(event.id, event);
    });

    const btnRepost = card.querySelector<HTMLButtonElement>(".action-repost")!;
    const repostCountSpan = card.querySelector<HTMLElement>(".action-repost .action-count")!;
    let isReposted = false;
    let currentReposts = initialReposts;
    btnRepost.addEventListener("click", (e) => {
      e.stopPropagation();
      isReposted = !isReposted;
      currentReposts = isReposted ? currentReposts + 1 : Math.max(0, currentReposts - 1);
      btnRepost.classList.toggle("active-reposted", isReposted);
      btnRepost.style.color = isReposted ? "var(--omni-accent-primary, #d4a373)" : "";
      repostCountSpan.textContent = currentReposts > 0 ? String(currentReposts) : "";
    });

    const btnLike = card.querySelector<HTMLButtonElement>(".action-like")!;
    const heartWrap = card.querySelector<HTMLElement>(".icon-heart-wrap")!;
    const likeCountSpan = card.querySelector<HTMLElement>(".action-like .action-count")!;
    let isLiked = false;
    let currentLikes = initialLikes;
    btnLike.addEventListener("click", (e) => {
      e.stopPropagation();
      isLiked = !isLiked;
      if (isLiked) {
        currentLikes++;
        heartWrap.innerHTML = ICONS.heartFilled;
        btnLike.classList.add("active-liked");
        btnLike.style.color = "#ef4444";
      } else {
        currentLikes = Math.max(0, currentLikes - 1);
        heartWrap.innerHTML = ICONS.heartOutline;
        btnLike.classList.remove("active-liked");
        btnLike.style.color = "";
      }
      likeCountSpan.textContent = currentLikes > 0 ? String(currentLikes) : "";
    });

    const btnShare = card.querySelector<HTMLButtonElement>(".action-share")!;
    btnShare.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        const textToCopy = event.id ? `nostr:${event.id}` : window.location.href;
        await navigator.clipboard.writeText(textToCopy);
        const originalTitle = btnShare.title;
        btnShare.title = "Copied to clipboard!";
        btnShare.style.color = "var(--omni-accent-primary, #d4a373)";
        setTimeout(() => {
          btnShare.title = originalTitle;
          btnShare.style.color = "";
        }, 1500);
      } catch {}
    });

    card.addEventListener("mouseenter", () => {
      card.style.borderColor = "var(--omni-border-strong, var(--border-strong, #42404b))";
      card.style.background = "var(--omni-bg-elevated, var(--bg-elevated, #2a2930))";
    });
    card.addEventListener("mouseleave", () => {
      card.style.borderColor = "var(--omni-border-subtle, var(--border-subtle, #313038))";
      card.style.background = "var(--omni-bg-surface, var(--bg-surface, #232227))";
    });

    card.addEventListener("click", (e) => {
      const sel = window.getSelection()?.toString()?.trim();
      if (sel && sel.length > 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("a, button")) return;
      openNoteInFeed(event.id, event);
    });

    return card;
  }

  function insertNoteCard(listEl: HTMLElement, event: any) {
    const card = renderNoteCard(event);
    card.setAttribute("data-timestamp", String(event.created_at || 0));
    const ts = event.created_at || 0;

    const children = Array.from(listEl.children) as HTMLElement[];
    for (const child of children) {
      if (child.classList?.contains("pv-notes-loading")) continue;
      const childTs = Number(child.getAttribute("data-timestamp") || 0);
      if (ts > childTs) {
        listEl.insertBefore(card, child);
        return;
      }
    }
    listEl.appendChild(card);
  }

  function loadOlderUserNotes() {
    if (isLoadingOlderUserNotes || oldestUserNoteTimestamp === Infinity || !activeUserPubkey || !activeWs || activeWs.readyState !== WebSocket.OPEN) return;
    isLoadingOlderUserNotes = true;
    olderUserNotesBatchCount = 0;
    if (btnUserNotesLoadMore) {
      btnUserNotesLoadMore.disabled = true;
      btnUserNotesLoadMore.textContent = "Loading older notes...";
    }
    const olderSubId = `pv_older_user_${Date.now()}`;
    activeOlderUserSubId = olderSubId;
    sendWs(["REQ", olderSubId, { kinds: [1], authors: [activeUserPubkey], until: oldestUserNoteTimestamp - 1, limit: 10 }]);
  }

  function loadOlderMyNotes() {
    if (isLoadingOlderMyNotes || oldestMyNoteTimestamp === Infinity || !myPubkey || !activeWs || activeWs.readyState !== WebSocket.OPEN) return;
    isLoadingOlderMyNotes = true;
    olderMyNotesBatchCount = 0;
    if (btnMyNotesLoadMore) {
      btnMyNotesLoadMore.disabled = true;
      btnMyNotesLoadMore.textContent = "Loading older notes...";
    }
    const olderSubId = `pv_older_my_${Date.now()}`;
    activeOlderMySubId = olderSubId;
    sendWs(["REQ", olderSubId, { kinds: [1], authors: [myPubkey], until: oldestMyNoteTimestamp - 1, limit: 10 }]);
  }

  if (userSentinelEl) {
    userSentinelEl.addEventListener("click", () => loadOlderUserNotes());
    userSentinelEl.addEventListener("intersect", () => loadOlderUserNotes());
  }
  if (btnUserNotesLoadMore) {
    btnUserNotesLoadMore.addEventListener("click", () => loadOlderUserNotes());
  }
  if (userSentinelEl && typeof IntersectionObserver !== "undefined") {
    try {
      const obs = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !isLoadingOlderUserNotes && oldestUserNoteTimestamp !== Infinity) {
          loadOlderUserNotes();
        }
      }, { rootMargin: "400px" });
      obs.observe(userSentinelEl);
    } catch (err) {
      console.error("WS message error:", err);
    }
  }

  if (mySentinelEl) {
    mySentinelEl.addEventListener("click", () => loadOlderMyNotes());
    mySentinelEl.addEventListener("intersect", () => loadOlderMyNotes());
  }
  if (btnMyNotesLoadMore) {
    btnMyNotesLoadMore.addEventListener("click", () => loadOlderMyNotes());
  }
  if (mySentinelEl && typeof IntersectionObserver !== "undefined") {
    try {
      const obs = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !isLoadingOlderMyNotes && oldestMyNoteTimestamp !== Infinity) {
          loadOlderMyNotes();
        }
      }, { rootMargin: "400px" });
      obs.observe(mySentinelEl);
    } catch (err) {
      console.error("WS message error:", err);
    }
  }

  function loadUserProfile(pubkey: string) {
    if (!pubkey) {
      activeUserPubkey = "";
      btnTabUserProfile.style.display = "none";
      renderUserProfileMetadata("", null);
      return;
    }
    activeUserPubkey = pubkey;
    btnTabUserProfile.style.display = "inline-flex";
    activePubkey = pubkey;
    isLoading = true;

    // Reset viewport scroll to top when opening an inspected user profile
    try {
      if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      }
      container.scrollIntoView({ behavior: "instant", block: "start" });
    } catch (_) {}

    oldestUserNoteTimestamp = Infinity;
    isLoadingOlderUserNotes = false;
    olderUserNotesBatchCount = 0;
    if (userSentinelEl) userSentinelEl.style.display = "none";
    if (btnUserNotesLoadMore) {
      btnUserNotesLoadMore.textContent = "Load more notes";
      btnUserNotesLoadMore.disabled = false;
    }

    if (eoseTimeout) {
      clearTimeout(eoseTimeout);
      eoseTimeout = null;
    }

    notesListEl.innerHTML = `<div class="pv-notes-loading" style="padding: 24px; text-align: center; color: var(--omni-text-muted, var(--text-muted, #8c909f)); font-size: 0.85rem;">Loading timeline notes...</div>`;
    notesCountEl.textContent = "Loading...";

    const cached = profileCache.get(pubkey);
    renderUserProfileMetadata(pubkey, cached || null);

    if (activeUserProfileSubId) {
      sendWs(["CLOSE", activeUserProfileSubId]);
    }
    if (activeUserNotesSubId) {
      sendWs(["CLOSE", activeUserNotesSubId]);
    }
    if (activeOlderUserSubId) {
      sendWs(["CLOSE", activeOlderUserSubId]);
      activeOlderUserSubId = null;
    }

    const profileSubId = `pv_prof_${Math.random().toString(36).slice(2, 8)}`;
    const notesSubId = `pv_notes_${Math.random().toString(36).slice(2, 8)}`;
    activeUserProfileSubId = profileSubId;
    activeUserNotesSubId = notesSubId;

    renderedNoteIds.clear();
    noteCount = 0;

    // Send subscriptions safely via sendWs (buffered if socket not open yet)
    sendWs(["REQ", profileSubId, { kinds: [0], authors: [pubkey], limit: 1 }]);
    sendWs(["REQ", notesSubId, { kinds: [1], authors: [pubkey], limit: 10 }]);

    eoseTimeout = setTimeout(() => {
      isLoading = false;
      if (noteCount === 0) {
        notesListEl.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--omni-text-muted, var(--text-muted, #8c909f)); font-size: 0.85rem;">No public notes published by this user yet.</div>`;
        notesCountEl.textContent = "0 notes";
      }
    }, 3000);
  }

  function loadMyProfile(pubkey: string) {
    if (!pubkey) return;
    myPubkey = pubkey;
    if (!activeUserPubkey) {
      activePubkey = pubkey;
    }

    oldestMyNoteTimestamp = Infinity;
    isLoadingOlderMyNotes = false;
    olderMyNotesBatchCount = 0;
    if (mySentinelEl) mySentinelEl.style.display = "none";
    if (btnMyNotesLoadMore) {
      btnMyNotesLoadMore.textContent = "Load more notes";
      btnMyNotesLoadMore.disabled = false;
    }

    const cached = profileCache.get(pubkey);
    renderMyProfileMetadata(pubkey, cached || null);
    populateEditForm(cached || null);

    if (activeMyProfileSubId) {
      sendWs(["CLOSE", activeMyProfileSubId]);
    }
    if (activeMyNotesSubId) {
      sendWs(["CLOSE", activeMyNotesSubId]);
    }
    if (activeOlderMySubId) {
      sendWs(["CLOSE", activeOlderMySubId]);
      activeOlderMySubId = null;
    }

    const myProfSubId = `pv_myprof_${Math.random().toString(36).slice(2, 8)}`;
    const myNotesSubId = `pv_mynotes_${Math.random().toString(36).slice(2, 8)}`;
    activeMyProfileSubId = myProfSubId;
    activeMyNotesSubId = myNotesSubId;

    myRenderedNoteIds.clear();
    myNoteCount = 0;

    sendWs(["REQ", myProfSubId, { kinds: [0], authors: [pubkey], limit: 1 }]);
    sendWs(["REQ", myNotesSubId, { kinds: [1], authors: [pubkey], limit: 10 }]);

    setTimeout(() => {
      if (myNoteCount === 0) {
        myNotesListEl.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--omni-text-muted, var(--text-muted, #8c909f)); font-size: 0.85rem;">No public notes published yet.</div>`;
        myNotesCountEl.textContent = "0 notes";
        if (myNotesCountPill) myNotesCountPill.textContent = "0";
      }
    }, 3000);
  }

  function loadProfile(pubkey: string) {
    if (!pubkey) return;
    if (myPubkey && pubkey === myPubkey) {
      loadMyProfile(pubkey);
    } else {
      loadUserProfile(pubkey);
    }
  }

  // Build user card row for Following / Blocked lists
  function buildUserCard(pubkey: string, isBlockList = false): HTMLElement {
    const meta = profileCache.get(pubkey);
    const initial = (meta?.display_name || meta?.name || pubkey)[0]?.toUpperCase() || "?";
    const displayName = meta?.display_name || meta?.name || `nostr:${pubkey.slice(0, 8)}`;
    const handle = meta?.name ? `@${meta.name}` : `@npub1${pubkey.slice(0, 8)}`;
    const about = meta?.about || "";

    const card = html<HTMLDivElement>`
      <div class="people-user-card" data-pubkey="${escapeHtml(pubkey)}" style="display: flex; align-items: center; gap: 12px; cursor: pointer; user-select: none;">
        <div class="people-avatar" style="width: 44px; height: 44px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: pointer; padding: 0;">
          ${getAvatarSvg(pubkey, initial)}
        </div>
        <div class="people-user-info" style="cursor: pointer; flex: 1; min-width: 0;">
          <div class="people-user-name">${escapeHtml(displayName)}</div>
          <div class="people-user-handle">${escapeHtml(handle)}</div>
          ${about ? `<div class="people-user-about">${escapeHtml(about)}</div>` : ""}
        </div>
        <div class="people-user-actions" style="flex-shrink: 0;">
          ${isBlockList
            ? `<button class="btn-block-toggle is-blocked btn-unblock-row" title="Unblock user">Unblock</button>`
            : `<button class="btn-follow-toggle is-following btn-unfollow-row" title="Unfollow user">Unfollow</button>`
          }
        </div>
      </div>
    `;

    // Click on any part of the card (empty space, avatar, or info) navigates to user profile
    const openUser = (e?: MouseEvent) => {
      if (e) {
        const target = e.target as HTMLElement | null;
        if (target && target.closest("button, .btn-follow-toggle, .btn-block-toggle, a")) {
          return;
        }
      }
      previousTab = isBlockList ? "blocked" : "following";
      loadUserProfile(pubkey);
      switchTab("user-profile", true);
    };

    card.addEventListener("click", openUser);

    if (isBlockList) {
      card.querySelector<HTMLButtonElement>(".btn-unblock-row")?.addEventListener("click", async (e) => {
        e.stopPropagation();
        await toggleBlock(pubkey);
        card.remove();
      });
    } else {
      card.querySelector<HTMLButtonElement>(".btn-unfollow-row")?.addEventListener("click", async (e) => {
        e.stopPropagation();
        await toggleFollow(pubkey);
        card.remove();
      });
    }

    return card;
  }

  function renderFollowingList() {
    followingListEl.innerHTML = "";
    const filter = (followingFilterInput.value || "").trim().toLowerCase();

    const pubkeys = Array.from(myFollows).filter((pk) => {
      if (!filter) return true;
      const meta = profileCache.get(pk);
      const hay = `${pk} ${hexToNpub(pk)} ${meta?.name || ""} ${meta?.display_name || ""} ${meta?.about || ""}`.toLowerCase();
      return hay.includes(filter);
    });

    if (pubkeys.length === 0) {
      followingListEl.innerHTML = `
        <div style="padding: 32px 16px; text-align: center; color: var(--omni-text-muted, var(--text-muted, #8c909f));">
          <div style="margin-bottom: 8px; display: inline-flex;">${ICONS.users}</div>
          <div style="font-weight: 600; color: var(--omni-text-primary, var(--text-primary, #e5e1e4)); margin-bottom: 4px;">No followed accounts</div>
          <div style="font-size: 0.82rem;">Explore notes in Feed or lookup pubkeys above to follow accounts.</div>
        </div>
      `;
      return;
    }

    for (const pk of pubkeys) {
      followingListEl.appendChild(buildUserCard(pk, false));
    }

    // Batch fetch metadata for missing profiles
    fetchMissingProfiles(pubkeys);
  }

  function renderBlockedList() {
    blockedListEl.innerHTML = "";
    const filter = (blockedFilterInput.value || "").trim().toLowerCase();

    const pubkeys = Array.from(myMutes).filter((pk) => {
      if (!filter) return true;
      const meta = profileCache.get(pk);
      const hay = `${pk} ${hexToNpub(pk)} ${meta?.name || ""} ${meta?.display_name || ""} ${meta?.about || ""}`.toLowerCase();
      return hay.includes(filter);
    });

    if (pubkeys.length === 0) {
      blockedListEl.innerHTML = `
        <div style="padding: 32px 16px; text-align: center; color: var(--omni-text-muted, var(--text-muted, #8c909f));">
          <div style="margin-bottom: 8px; display: inline-flex;">${ICONS.shieldOff}</div>
          <div style="font-weight: 600; color: var(--omni-text-primary, var(--text-primary, #e5e1e4)); margin-bottom: 4px;">No blocked accounts</div>
          <div style="font-size: 0.82rem;">Your block / mute list is currently empty.</div>
        </div>
      `;
      return;
    }

    for (const pk of pubkeys) {
      blockedListEl.appendChild(buildUserCard(pk, true));
    }

    fetchMissingProfiles(pubkeys);
  }

  followingFilterInput.addEventListener("input", renderFollowingList);
  blockedFilterInput.addEventListener("input", renderBlockedList);

  function fetchMissingProfiles(pubkeys: string[]) {
    const missing = pubkeys.filter((pk) => !profileCache.has(pk)).slice(0, 50);
    if (missing.length === 0) return;
    sendWs(["REQ", `pv_batch_${Date.now()}`, { kinds: [0], authors: missing, limit: missing.length }]);
  }

  // Load Contact List (Kind 3) and Mute List (Kind 10000) for current user
  function initUserSocialGraph(pk: string) {
    if (!pk) return;
    myPubkey = pk;

    // 1. Immediately populate from local cache (0ms hit)
    loadCachedSocialGraph(pk);

    // 2. Fetch latest live updates from relay / local event store
    sendWs(["REQ", "pv_my_contacts", { kinds: [3], authors: [pk], limit: 1 }]);
    sendWs(["REQ", "pv_my_mutes", { kinds: [10000], authors: [pk], limit: 1 }]);
  }

  // Register Intent Handler for 'view_profile' and 'edit_profile'
  const handleViewProfile = (data: any) => {
    const pk = data?.pubkey;
    if (pk && pk !== myPubkey) {
      loadUserProfile(pk);
      switchTab("user-profile", false);
    } else {
      activeUserPubkey = "";
      btnTabUserProfile.style.display = "none";
      if (myPubkey) loadMyProfile(myPubkey);
      switchTab("my-profile", false);
    }
    toggleEditPanel("notes", false);
  };

  const handleEditProfile = (data: any) => {
    activeUserPubkey = "";
    btnTabUserProfile.style.display = "none";
    if (myPubkey) {
      loadMyProfile(myPubkey);
    }
    switchTab("my-profile", false);
    toggleEditPanel("profile", true);
  };

  if (typeof (window as any).omni !== "undefined" && (window as any).omni.intents?.handle) {
    (window as any).omni.intents.handle("view_profile", handleViewProfile);
    (window as any).omni.intents.handle("edit_profile", handleEditProfile);
  } else {
    window.addEventListener("omni:intent", (e: any) => {
      if (e.detail?.action === "view_profile" && e.detail?.data) {
        handleViewProfile(e.detail.data);
      } else if (e.detail?.action === "edit_profile") {
        handleEditProfile(e.detail?.data);
      }
    });
  }

  // Listen for route navigation changes using standard web APIs (popstate / hashchange)
  const syncRouteFromLocation = (e?: any) => {
    try {
      if (e?.state?.type === "omni-people-view") {
        const state = e.state;
        previousTab = state.from || null;
        if (state.pubkey && state.pubkey !== activePubkey) {
          if (myPubkey && state.pubkey === myPubkey) {
            loadMyProfile(state.pubkey);
          } else {
            loadUserProfile(state.pubkey);
          }
        }
        switchTab(state.tab, false);
        return;
      }

      const searchParams = new URLSearchParams(window.location.search || window.location.hash.replace("#", "?"));
      const pk = searchParams.get("pubkey");
      const v = searchParams.get("view");
      if (v === "following" || v === "blocked" || v === "user-profile" || v === "my-profile" || v === "profile") {
        switchTab(v as any, false);
      } else if (v === "edit") {
        switchTab("my-profile", false);
        toggleEditPanel("profile", true);
      } else if (previousTab) {
        const target = previousTab;
        previousTab = null;
        switchTab(target, false);
      }
      if (pk) {
        if (myPubkey && pk === myPubkey) {
          loadMyProfile(pk);
        } else {
          loadUserProfile(pk);
          if (!v) switchTab("user-profile", false);
        }
      }
    } catch (err) {
      console.error("WS message error:", err);
    }
  };

  window.addEventListener("popstate", syncRouteFromLocation);
  window.addEventListener("hashchange", syncRouteFromLocation);

  // Robust user pubkey resolution using standard NIP-07 or omni session
  async function resolveUserPubkey(): Promise<string> {
    try {
      const nostr = (window as any).nostr;
      if (nostr?.getPublicKey) {
        const pk = await nostr.getPublicKey();
        if (pk) return pk;
      }
    } catch (err) {
      console.error("WS message error:", err);
    }
    try {
      const omniObj = typeof window !== "undefined" ? (window as any).omni : null;
      if (omniObj?.nostr?.getPublicKey) {
        const pk = await omniObj.nostr.getPublicKey();
        if (pk) return pk;
      }
    } catch (err) {
      console.error("WS message error:", err);
    }
    try {
      const omniObj = typeof window !== "undefined" ? (window as any).omni : null;
      if (omniObj?.session?.userPubkey) {
        return omniObj.session.userPubkey;
      }
    } catch (err) {
      console.error("WS message error:", err);
    }
    return "";
  }

  // Resolve initial pubkey to inspect strictly using standard Web APIs
  let initialPubkey = "";
  try {
    const searchParams = new URLSearchParams(window.location.search || window.location.hash.replace("#", "?"));
    initialPubkey = searchParams.get("pubkey") || "";
    if (!initialPubkey && typeof localStorage !== "undefined") {
      initialPubkey = localStorage.getItem("omni_active_profile_pubkey") || "";
      if (initialPubkey) {
        localStorage.removeItem("omni_active_profile_pubkey");
      }
    }
    const v = searchParams.get("view");
    if (v === "following" || v === "blocked" || v === "user-profile" || v === "my-profile") {
      switchTab(v as any, false);
    } else if (v === "edit") {
      switchTab("my-profile", false);
      toggleEditPanel("profile", true);
    }
  } catch (_) {}

  resolveUserPubkey().then((pk) => {
    if (pk) {
      myPubkey = pk;
      initUserSocialGraph(pk);
      loadMyProfile(pk);
      if (initialPubkey && initialPubkey !== pk) {
        loadUserProfile(initialPubkey);
        if (activeTab === "user-profile") {
          updateActionButtons(initialPubkey);
        }
      }
    } else if (initialPubkey) {
      loadUserProfile(initialPubkey);
    }
  }).catch(() => {
    if (initialPubkey) {
      loadUserProfile(initialPubkey);
    }
  });

  return {
    switchTab,
    loadProfile,
    loadUserProfile,
    loadMyProfile,
    toggleFollow,
    toggleBlock,
    toggleEditPanel,
    getMyFollows: () => myFollows,
    getMyMutes: () => myMutes,
    getActivePubkey: () => activePubkey,
    getActiveUserPubkey: () => activeUserPubkey,
    getMyPubkey: () => myPubkey
  };
}

let mounted = false;
function initMount(root: HTMLElement) {
  if (mounted) return;
  mounted = true;
  mountProfileViewer(root);
}

function isSchemaMode(): boolean {
  if (typeof document === "undefined") return true;
  try {
    const search = window.location.search || window.location.hash || "";
    if (search.includes("format=schema") || search.includes("view=schema")) return true;
    if ((window as any).__OMNI_ROUTE__?.includes("format=schema")) return true;
    if ((window as any).__OMNI_FORMAT__ === "schema") return true;
    if ((window as any).__OMNI_VIEW__ === "main" && (window as any).__OMNI_FORMAT__ !== "iframe") {
      return true;
    }
  } catch (_) {}
  return false;
}

function dispatchProfileSchema(schema: OmniComponentNode | null) {
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

function dispatchCurrentSchema() {
  if (!isSchemaMode()) return;
  dispatchProfileSchema(
    getProfileSchema(currentSchemaTab, currentProfileData, {
      activeTab: currentSchemaTab,
      targetUser: schemaTargetUser,
      isFollowing: schemaTargetUser?.isFollowing,
      follows: Array.from(schemaFollowsSet).map((pk) => ({ pubkey: pk })),
      followsCount: schemaFollowsSet.size
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

async function initSchemaData(explicitPk?: string) {
  try {
    loadSchemaProfileCache();
    const pk = explicitPk || (await resolveUserPubkey());
    if (pk) {
      currentProfilePubkey = pk;
      currentProfileData.pubkey = pk;
      currentProfileData.npub = `npub1${pk.slice(0, 10)}...`;

      // 1. Instant 0ms cache restore: follows
      if (typeof localStorage !== "undefined") {
        try {
          const rawFollows = localStorage.getItem(`omni_people_follows_${pk}`);
          if (rawFollows) {
            const tags = JSON.parse(rawFollows);
            if (Array.isArray(tags)) {
              schemaFollowsSet.clear();
              for (const t of tags) {
                if (t[0] === "p" && t[1]) schemaFollowsSet.add(t[1]);
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
              currentProfileData = {
                ...currentProfileData,
                ...entry,
                name: entry.display_name || entry.name || currentProfileData.name,
                displayName: entry.display_name || entry.name || currentProfileData.displayName
              };
            }
          }
        } catch (_) {}
      }

      if (schemaFollowsSet.size > 0) {
        fetchMissingSchemaProfiles(Array.from(schemaFollowsSet));
      }

      // 3. Parse route view/pubkey
      try {
        const searchParams = getInitialRouteParams();
        const targetPk = searchParams.get("pubkey");
        if (targetPk && targetPk !== pk) {
          schemaTargetUser = {
            pubkey: targetPk,
            name: `User ${targetPk.slice(0, 8)}`,
            about: "Nostr user",
            isFollowing: schemaFollowsSet.has(targetPk)
          };
          currentSchemaTab = "user-profile";
        } else if (searchParams.get("view") === "edit") {
          currentSchemaTab = "edit";
        } else if (searchParams.get("view") === "following") {
          currentSchemaTab = "following";
        } else if (searchParams.get("view") === "keys") {
          currentSchemaTab = "keys";
        }
      } catch (_) {}

      // 4. Start live relay subscriptions
      startSchemaSubscriptions(pk);
    }
  } catch (_) {}
}

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
      const next = await handleProfileViewerAction(action, payload);
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
      const next = await handleProfileViewerAction(data.action, data.payload);
      dispatchProfileSchema(next);
    }
  });

  rootContext.addEventListener("omni:intent", async (event: any) => {
    const detail = event.detail;
    if (detail && (detail.action === "view_profile" || detail.action === "view-profile") && detail.data?.pubkey) {
      const next = await handleProfileViewerAction({
        name: "view_profile",
        payload: { pubkey: detail.data.pubkey, isFromIntent: true }
      });
      dispatchProfileSchema(next);
    }
  });

  rootContext.addEventListener("nostr:keychanged", async (e: any) => {
    if (e.detail?.pubkey) {
      currentProfilePubkey = e.detail.pubkey;
      currentProfileData.pubkey = e.detail.pubkey;
      currentProfileData.npub = `npub1${e.detail.pubkey.slice(0, 10)}...`;
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
      schemaPreviousTab ||
      "my-profile";
    const targetPk = state?.pubkey || (state?.pluginState && state.pluginState.pubkey);
    schemaPreviousTab = (state?.from as string) || null;
    schemaPushedHistory = false;
    if (targetTab === "user-profile" && targetPk) {
      handleProfileViewerAction({ name: "view_profile", payload: { pubkey: targetPk, fromPopState: true } }).then(
        dispatchProfileSchema
      );
    } else {
      currentSchemaTab = targetTab;
      schemaTargetUser = null;
      dispatchCurrentSchema();
    }
  });

  if (isSchemaMode()) {
    (async () => {
      await initSchemaData();
      dispatchCurrentSchema();
    })();
  }
}

// Auto-mount DOM if not in schema mode
if (typeof document !== "undefined" && !isSchemaMode()) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initMount(document.body));
  } else {
    initMount(document.body);
  }
}

const mountProfiles = mountProfileViewer;
const mountProfile = mountProfileViewer;

export {
  mountProfileViewer,
  mountProfiles,
  mountProfile,
  mountProfileCompact,
  mountProfileWidget
};
