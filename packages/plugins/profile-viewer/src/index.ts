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

interface NoteInteractionStats {
  likes: number;
  replies: number;
  reposts: number;
  zaps: number;
  liked?: boolean;
  reposted?: boolean;
}

const noteStatsMap = new Map<string, NoteInteractionStats>();
const likePubkeysByNote = new Map<string, Set<string>>();
const replyIdsByNote = new Map<string, Set<string>>();
const repostPubkeysByNote = new Map<string, Set<string>>();
const queriedInteractionNoteIds = new Set<string>();

function getOrCreateNoteStats(noteId: string): NoteInteractionStats {
  let stats = noteStatsMap.get(noteId);
  if (!stats) {
    stats = { likes: 0, replies: 0, reposts: 0, zaps: 0 };
    noteStatsMap.set(noteId, stats);
  }
  return stats;
}

function processIncomingInteraction(ev: any, isSchema = true) {
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
        if (currentProfilePubkey && ev.pubkey === currentProfilePubkey) {
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
    } else if (k === 6 && ev.id !== targetNoteId) {
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
      if (currentProfilePubkey && ev.pubkey === currentProfilePubkey) {
        stats.reposted = true;
        changed = true;
      }
    }

    if (changed) {
      const note = schemaUserNotes.find((n) => n.id === targetNoteId);
      if (note) {
        note.likes = stats.likes;
        note.replies = stats.replies;
        note.reposts = stats.reposts;
        if (stats.liked) note.liked = true;
        if (stats.reposted) note.reposted = true;
      }
      scheduleSchemaUpdate();
    }
  }
}

function fetchInteractionsBatch(noteIds: string[], sendFn: (frame: any[]) => void, prefix: string) {
  const unqueried = noteIds.filter((id) => id && !queriedInteractionNoteIds.has(id));
  if (unqueried.length === 0) return;
  unqueried.forEach((id) => queriedInteractionNoteIds.add(id));

  const CHUNK_SIZE = 50;
  for (let i = 0; i < unqueried.length; i += CHUNK_SIZE) {
    const chunk = unqueried.slice(i, i + CHUNK_SIZE);
    const subId = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const req = [
      "REQ",
      subId,
      {
        kinds: [1, 6, 7],
        "#e": chunk,
        limit: chunk.length * 50
      }
    ];
    sendFn(req);
  }
}

let schemaInteractionsTimer: any = null;
function scheduleSchemaInteractionsFetch() {
  if (schemaInteractionsTimer) clearTimeout(schemaInteractionsTimer);
  schemaInteractionsTimer = setTimeout(() => {
    const ids = schemaUserNotes.map((n) => n.id).filter(Boolean);
    if (ids.length > 0) {
      fetchInteractionsBatch(ids, sendSchemaWs, "pv_s_react");
    }
  }, 100);
}

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

// Diverse spectrum of vibrant, sophisticated color harmonies used for avatars and complementary gradient banners
export const AVATAR_PALETTES = [
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

/**
 * Generates a vibrant, dynamic CSS gradient banner derived deterministically from pubkey entropy.
 * Uses complementary harmonies that pair seamlessly with the avatar.
 */
export function getProfileGradientBanner(pubkey: string): string {
  let hash = 0;
  for (let i = 0; i < (pubkey || "").length; i++) {
    hash = (hash << 5) - hash + pubkey.charCodeAt(i);
    hash |= 0;
  }
  const seed = Math.abs(hash);
  const [stop1, stop2, accent] = AVATAR_PALETTES[seed % AVATAR_PALETTES.length];
  const angle = (seed % 60) + 115;
  return `linear-gradient(${angle}deg, ${stop2} 0%, color-mix(in srgb, ${stop1} 65%, #141312) 55%, color-mix(in srgb, ${accent} 30%, #1c1b18) 100%)`;
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
      bannerBackground: getProfileGradientBanner(pubkey || "default"),
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
    { id: "my-profile", label: "Profile", icon: "user" },
    { id: "edit", label: "Edit", icon: "edit" },
    { id: "keys", label: "Keys", icon: "key" },
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

    const stats = getOrCreateNoteStats(note.id);
    const likesCount = note.likes !== undefined ? note.likes : stats.likes;
    const repliesCount = note.replies !== undefined ? note.replies : stats.replies;
    const repostsCount = note.reposts !== undefined ? note.reposts : stats.reposts;
    const zapsCount = note.zaps !== undefined ? note.zaps : stats.zaps;
    const isLiked = Boolean(note.liked || stats.liked);
    const isReposted = Boolean(note.reposted || stats.reposted);

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
        likes: likesCount || 0,
        reposts: repostsCount || 0,
        replies: repliesCount || 0,
        zaps: zapsCount || 0
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
              label: String(repliesCount || "0"),
              action: { name: "view_note", payload: notePayload }
            },
            {
              type: "button",
              variant: isReposted ? "secondary" : "ghost",
              size: "sm",
              icon: "repeat",
              label: String(repostsCount || "0"),
              action: { name: "repost-note", payload: { id: note.id } }
            },
            {
              type: "button",
              variant: isLiked ? "secondary" : "ghost",
              size: "sm",
              icon: "heart",
              label: String(likesCount || "0"),
              action: { name: "like-note", payload: { id: note.id } }
            },
            {
              type: "button",
              variant: "ghost",
              size: "sm",
              icon: "zap",
              label: String(zapsCount || "0"),
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

    const targetPubkey = targetUser.pubkey || "";
    const userBannerGradient = getProfileGradientBanner(targetPubkey || "default");
    children.push({
      type: "box",
      style: `width: 100%; height: 115px; min-height: 115px; border-radius: var(--omni-radius-md, 10px); background: ${userBannerGradient}; margin-bottom: -36px; transition: background 0.25s ease;`,
      children: []
    });

    children.push({
      type: "box",
      direction: "row",
      justify: "between",
      align: "center",
      style: "margin-top: -36px; margin-bottom: 8px; z-index: 1; padding: 0 4px; flex-wrap: wrap; gap: 8px;",
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
              pubkey: targetPubkey,
              size: "xl",
              style: "border: 3px solid var(--omni-bg-elevated, #22201d); border-radius: 50%; box-shadow: 0 4px 16px rgba(0,0,0,0.5); background: var(--omni-bg-surface, #191816); flex-shrink: 0;"
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
          size: "sm",
          action: {
            name: isFollowing ? "unfollow" : "follow",
            payload: { pubkey: targetPubkey }
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
    const bannerGradient = getProfileGradientBanner(pubkey || "default");
    children.push({
      type: "box",
      style: `width: 100%; height: 115px; min-height: 115px; border-radius: var(--omni-radius-md, 10px); background: ${bannerGradient}; margin-bottom: -36px; transition: background 0.25s ease;`,
      children: []
    });

    children.push({
      type: "box",
      direction: "row",
      gap: "md",
      align: "center",
      style: "margin-top: -36px; margin-bottom: 8px; z-index: 1; padding: 0 4px;",
      children: [
        {
          type: "avatar",
          name,
          src: picture,
          pubkey,
          size: "xl",
          style: "border: 3px solid var(--omni-bg-elevated, #22201d); border-radius: 50%; box-shadow: 0 4px 16px rgba(0,0,0,0.5); background: var(--omni-bg-surface, #191816); flex-shrink: 0;"
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

      if (k === 7 || k === 6 || (k === 1 && (ev.tags || []).some((t: any) => t[0] === "e"))) {
        processIncomingInteraction(ev, true);
      }

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
            const stats = getOrCreateNoteStats(ev.id);
            schemaUserNotes.push({
              ...ev,
              likes: stats.likes,
              replies: stats.replies,
              reposts: stats.reposts,
              liked: stats.liked,
              reposted: stats.reposted
            });
            schemaUserNotes.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
            scheduleSchemaUpdate();
            scheduleSchemaInteractionsFetch();
          }
        }
      }
    } else if (type === "EOSE") {
      const subId = frame[1];
      if (typeof subId === "string" && subId.startsWith("pv_s_react_")) {
        try {
          sendSchemaWs(["CLOSE", subId]);
        } catch (_) {}
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
    let noteData: any = payload?.note || action.payload?.note || schemaUserNotes.find((n) => n.id === noteId);
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
    const note = schemaUserNotes.find((n) => n.id === id);
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
    const note = schemaUserNotes.find((n) => n.id === id);
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

  (async () => {
    await initSchemaData();
    dispatchCurrentSchema();
  })();
}
