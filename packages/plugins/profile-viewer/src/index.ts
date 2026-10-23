/// <reference types="@omni/types" />

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
  return escaped.replace(urlRegex, (rawUrl) => {
    const url = rawUrl.replace(/^http:\/\//i, "https://");
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: var(--accent-primary, #d4a373); text-decoration: underline;">${url}</a>`;
  });
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

// Compact standard Bech32 encoder for Nostr npub addresses
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

const profileCache = new Map<string, ProfileMetadata>();

async function mountProfileViewer(root: HTMLElement) {
  let activeTab: "profile" | "following" | "blocked" = "profile";
  let activePubkey = "";
  let myPubkey = "";
  let myFollows = new Set<string>();
  let myFollowTags: string[][] = [];
  let myMutes = new Set<string>();
  let myMuteTags: string[][] = [];

  let activeWs: WebSocket | null = null;
  let activeNotesSubId: string | null = null;
  let activeProfileSubId: string | null = null;
  let isLoading = false;
  let eoseTimeout: any = null;
  const renderedNoteIds = new Set<string>();
  let noteCount = 0;

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
    } catch (_) {}

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
    } catch (_) {}
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
      } catch (_) {}
    } else {
      let fired = false;
      const onOpen = () => {
        if (fired) return;
        fired = true;
        try {
          ws.send(raw);
        } catch (_) {}
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
      if (aWrap && meta.picture) {
        let pic = String(meta.picture).trim();
        if (pic.startsWith("http://")) pic = pic.replace(/^http:\/\//i, "https://");
        if (pic.startsWith("https://") || pic.startsWith("data:image/")) {
          aWrap.innerHTML = `<img src="${escapeHtml(pic)}" alt="" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
        }
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
            } catch (_) {}
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
            } catch (_) {}
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
            if (ev.pubkey === activePubkey) {
              renderProfileMetadata(activePubkey, meta);
            }
            updateUserCards(ev.pubkey, meta);
          } catch (_) {}
        }

        // Kind 1: Timeline Notes for activePubkey
        else if (k === 1 && (subId === activeNotesSubId || (!subId && ev.pubkey === activePubkey))) {
          if (eoseTimeout) {
            clearTimeout(eoseTimeout);
            eoseTimeout = null;
          }
          if (!renderedNoteIds.has(ev.id)) {
            renderedNoteIds.add(ev.id);
            if (noteCount === 0 && notesListEl) {
              notesListEl.innerHTML = "";
            }
            noteCount++;
            if (notesCountEl) notesCountEl.textContent = `${noteCount} note${noteCount === 1 ? "" : "s"}`;
            if (notesListEl) notesListEl.appendChild(renderNoteCard(ev));
          }
        }
      } else if (type === "EOSE") {
        if (subId === activeNotesSubId) {
          if (eoseTimeout) {
            clearTimeout(eoseTimeout);
            eoseTimeout = null;
          }
          isLoading = false;
          if (noteCount === 0 && notesListEl) {
            notesListEl.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-muted, #78716c); font-size: 0.85rem;">No public notes published by this user yet.</div>`;
            if (notesCountEl) notesCountEl.textContent = "0 notes";
          }
        }
      }
    } catch (_) {}
  }

  const container = html<HTMLDivElement>`
    <div class="profile-viewer-container" style="display: flex; flex-direction: column; gap: 16px; padding: 12px; max-width: 760px; margin: 0 auto; color: var(--text-primary, #ede8df); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      
      <!-- Top App Header & Viewport Tabs -->
      <div class="people-header" style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 2px 0; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
          <h2 style="margin: 0; font-size: 1.25rem; font-weight: 700; color: var(--text-primary, #ede8df);">People</h2>
          <div class="people-tabs">
            <button class="people-tab-btn btn-tab-profile active" data-tab="profile">Profile</button>
            <button class="people-tab-btn btn-tab-following" data-tab="following">Following (<span class="count-following">0</span>)</button>
            <button class="people-tab-btn btn-tab-blocked" data-tab="blocked">Blocked (<span class="count-blocked">0</span>)</button>
          </div>
        </div>
        <button class="btn-toggle-lookup btn-secondary" title="Search by npub or hex pubkey">
          ${ICONS.search}
          <span>Lookup npub</span>
        </button>
      </div>

      <!-- PROFILE TAB VIEW -->
      <div class="pv-tab-content pv-tab-profile">
        <!-- Back button when opened from Following / Blocked list -->
        <div class="pv-profile-top-bar" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px;">
          <button class="btn-profile-back btn-secondary" style="display: none;">
            ${ICONS.arrowLeft}
            <span class="btn-profile-back-text">Back to Following</span>
          </button>
        </div>

        <!-- Top Search & Switch Bar (Hidden by default, toggled on demand) -->
        <div class="pv-search-bar" style="display: none; align-items: center; gap: 8px; padding: 6px 10px; margin-bottom: 16px;">
          <span style="color: var(--text-muted, #78716c); display: flex; align-items: center;">${ICONS.search}</span>
          <input class="pv-search-input" type="text" placeholder="Lookup pubkey (hex) or npub1..." style="flex: 1; background: transparent; border: none; outline: none; color: inherit; font-family: var(--font-mono, monospace); font-size: 0.8rem;" />
          <button class="pv-search-btn btn-secondary">Lookup</button>
        </div>

        <!-- Hero Banner & Card -->
        <div class="pv-card" style="border-radius: var(--radius-md, 10px); overflow: hidden; display: flex; flex-direction: column;">
          
          <!-- Banner Image / Header -->
          <div class="pv-banner" style="height: 140px; background: linear-gradient(135deg, #1f1d1a, #2a2723); background-size: cover; background-position: center; position: relative;"></div>

          <!-- Identity & Metadata Section -->
          <div class="pv-info-section" style="padding: 16px 20px; display: flex; flex-direction: column; gap: 14px; position: relative;">
            
            <!-- Avatar Overlapping Banner -->
            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: -54px; margin-bottom: 4px;">
              <div class="pv-avatar-wrap" style="width: 80px; height: 80px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.4); flex-shrink: 0;">
                <div class="pv-avatar-fallback" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; font-weight: 700; color: #fff;">?</div>
              </div>
              
              <div class="pv-action-buttons" style="display: flex; align-items: center; gap: 8px;">
                <button class="pv-btn-follow btn-follow-toggle" title="Follow or Unfollow user" style="display: none;">Follow</button>
                <button class="pv-btn-block btn-block-toggle" title="Block or Unblock user" style="display: none;">Block</button>
                <button class="pv-btn-refresh btn-secondary" title="Refresh Profile & Notes">
                  ${ICONS.refresh}
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            <!-- Name & Handles -->
            <div style="display: flex; flex-direction: column; gap: 3px;">
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <h2 class="pv-display-name" style="margin: 0; font-size: 1.25rem; font-weight: 700;">Loading Profile...</h2>
                <span class="pv-nip05-badge" style="display: none; align-items: center; gap: 4px; font-size: 0.72rem; padding: 2px 8px; border-radius: 12px; background: rgba(212, 163, 115, 0.15); color: var(--accent-primary, #d4a373); border: 1px solid rgba(212, 163, 115, 0.3);">
                  ${ICONS.checkCircle}
                  <span class="pv-nip05-text"></span>
                </span>
              </div>
              <div class="pv-handle" style="font-size: 0.84rem; color: var(--text-secondary, #9e988f);">@...</div>
            </div>

            <!-- Npub Copy Pill -->
            <div class="pv-npub-row" style="display: flex; align-items: center; gap: 8px;">
              <div class="pv-npub-pill" style="display: flex; align-items: center; gap: 6px; padding: 4px 10px; font-family: var(--font-mono, monospace); font-size: 0.74rem; color: var(--text-muted, #78716c); max-width: 100%; overflow: hidden;">
                <span class="pv-npub-text" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">npub...</span>
              </div>
              <button class="pv-btn-copy-npub btn-secondary" title="Copy npub to clipboard">
                ${ICONS.copy}
                <span class="pv-copy-label">Copy</span>
              </button>
            </div>

            <!-- Bio / About -->
            <div class="pv-about" style="font-size: 0.88rem; line-height: 1.5; color: var(--text-primary, #ede8df); white-space: pre-wrap; word-break: break-word; display: none;"></div>

            <!-- Extra Metadata Row (Website / Lightning) -->
            <div class="pv-meta-links" style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap; font-size: 0.78rem; border-top: 1px solid var(--border-subtle, #272522); padding-top: 10px; margin-top: 2px;">
              <div class="pv-lud16-wrap" style="display: none; align-items: center; gap: 4px; color: var(--accent-primary, #d4a373);">
                ${ICONS.bolt}
                <span class="pv-lud16-text"></span>
              </div>
              <div class="pv-website-wrap" style="display: none; align-items: center; gap: 4px; color: var(--text-secondary, #9e988f);">
                ${ICONS.link}
                <a class="pv-website-link" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none;"></a>
              </div>
            </div>
          </div>
        </div>

        <!-- Notes Feed Section -->
        <div class="pv-notes-section" style="display: flex; flex-direction: column; gap: 10px; margin-top: 16px;">
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-subtle, #272522); padding-bottom: 8px;">
            <h3 style="margin: 0; font-size: 0.95rem; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; color: var(--text-primary, #ede8df);">
              ${ICONS.notes}
              <span>Recent Notes</span>
            </h3>
            <span class="pv-notes-count" style="font-size: 0.75rem; color: var(--text-muted, #78716c);">0 notes</span>
          </div>

          <div class="pv-notes-list" style="display: flex; flex-direction: column; gap: 10px;">
            <div class="pv-notes-loading" style="padding: 24px; text-align: center; color: var(--text-muted, #78716c); font-size: 0.85rem;">
              Loading timeline notes...
            </div>
          </div>
        </div>
      </div>

      <!-- FOLLOWING TAB VIEW -->
      <div class="pv-tab-content pv-tab-following" style="display: none;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 14px;">
          <input class="following-filter-input" type="text" placeholder="Filter followed accounts..." style="flex: 1; background: var(--bg-surface, #191816); border: 1px solid var(--border-subtle, #272522); border-radius: var(--radius-md, 8px); padding: 8px 12px; color: var(--text-primary, #ede8df); outline: none; font-size: 0.82rem;" />
        </div>
        <div class="following-list-container people-list-container">
          <div class="following-loading" style="padding: 24px; text-align: center; color: var(--text-muted, #78716c); font-size: 0.85rem;">
            Loading following accounts...
          </div>
        </div>
      </div>

      <!-- BLOCKED TAB VIEW -->
      <div class="pv-tab-content pv-tab-blocked" style="display: none;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 14px;">
          <input class="blocked-filter-input" type="text" placeholder="Filter blocked accounts..." style="flex: 1; background: var(--bg-surface, #191816); border: 1px solid var(--border-subtle, #272522); border-radius: var(--radius-md, 8px); padding: 8px 12px; color: var(--text-primary, #ede8df); outline: none; font-size: 0.82rem;" />
        </div>
        <div class="blocked-list-container people-list-container">
          <div class="blocked-loading" style="padding: 24px; text-align: center; color: var(--text-muted, #78716c); font-size: 0.85rem;">
            Loading blocked accounts...
          </div>
        </div>
      </div>

    </div>
  `;

  // Tab elements
  const btnTabProfile = container.querySelector<HTMLButtonElement>(".btn-tab-profile")!;
  const btnTabFollowing = container.querySelector<HTMLButtonElement>(".btn-tab-following")!;
  const btnTabBlocked = container.querySelector<HTMLButtonElement>(".btn-tab-blocked")!;
  const countFollowingEl = container.querySelector<HTMLElement>(".count-following")!;
  const countBlockedEl = container.querySelector<HTMLElement>(".count-blocked")!;

  const tabProfile = container.querySelector<HTMLElement>(".pv-tab-profile")!;
  const tabFollowing = container.querySelector<HTMLElement>(".pv-tab-following")!;
  const tabBlocked = container.querySelector<HTMLElement>(".pv-tab-blocked")!;

  const followingListEl = container.querySelector<HTMLElement>(".following-list-container")!;
  const blockedListEl = container.querySelector<HTMLElement>(".blocked-list-container")!;
  const followingFilterInput = container.querySelector<HTMLInputElement>(".following-filter-input")!;
  const blockedFilterInput = container.querySelector<HTMLInputElement>(".blocked-filter-input")!;

  // Profile elements
  const btnToggleLookup = container.querySelector<HTMLButtonElement>(".btn-toggle-lookup")!;
  const btnProfileBack = container.querySelector<HTMLButtonElement>(".btn-profile-back")!;
  const btnProfileBackText = container.querySelector<HTMLElement>(".btn-profile-back-text")!;
  const searchBarEl = container.querySelector<HTMLElement>(".pv-search-bar")!;

  const bannerEl = container.querySelector<HTMLElement>(".pv-banner")!;
  const avatarWrapEl = container.querySelector<HTMLElement>(".pv-avatar-wrap")!;
  const displayNameEl = container.querySelector<HTMLElement>(".pv-display-name")!;
  const handleEl = container.querySelector<HTMLElement>(".pv-handle")!;
  const nip05BadgeEl = container.querySelector<HTMLElement>(".pv-nip05-badge")!;
  const nip05TextEl = container.querySelector<HTMLElement>(".pv-nip05-text")!;
  const npubTextEl = container.querySelector<HTMLElement>(".pv-npub-text")!;
  const copyBtn = container.querySelector<HTMLButtonElement>(".pv-btn-copy-npub")!;
  const copyLabel = container.querySelector<HTMLElement>(".pv-copy-label")!;
  const aboutEl = container.querySelector<HTMLElement>(".pv-about")!;
  const lud16Wrap = container.querySelector<HTMLElement>(".pv-lud16-wrap")!;
  const lud16Text = container.querySelector<HTMLElement>(".pv-lud16-text")!;
  const websiteWrap = container.querySelector<HTMLElement>(".pv-website-wrap")!;
  const websiteLink = container.querySelector<HTMLAnchorElement>(".pv-website-link")!;
  const notesListEl = container.querySelector<HTMLElement>(".pv-notes-list")!;
  const notesCountEl = container.querySelector<HTMLElement>(".pv-notes-count")!;
  const searchInput = container.querySelector<HTMLInputElement>(".pv-search-input")!;
  const searchBtn = container.querySelector<HTMLButtonElement>(".pv-search-btn")!;
  const btnRefresh = container.querySelector<HTMLButtonElement>(".pv-btn-refresh")!;
  const btnFollow = container.querySelector<HTMLButtonElement>(".pv-btn-follow")!;
  const btnBlock = container.querySelector<HTMLButtonElement>(".pv-btn-block")!;

  root.appendChild(container);

  let previousTab: "following" | "blocked" | null = null;

  function updateProfileBackButton() {
    if (previousTab && activeTab === "profile") {
      btnProfileBack.style.display = "inline-flex";
      btnProfileBackText.textContent = previousTab === "blocked" ? "Back to Blocked" : "Back to Following";
    } else {
      btnProfileBack.style.display = "none";
    }
  }

  // Tab switching with optional pushState
  function switchTab(tab: "profile" | "following" | "blocked", pushState = true) {
    const isSameTab = activeTab === tab;
    activeTab = tab;
    btnTabProfile.classList.toggle("active", tab === "profile");
    btnTabFollowing.classList.toggle("active", tab === "following");
    btnTabBlocked.classList.toggle("active", tab === "blocked");

    tabProfile.style.display = tab === "profile" ? "block" : "none";
    tabFollowing.style.display = tab === "following" ? "block" : "none";
    tabBlocked.style.display = tab === "blocked" ? "block" : "none";

    updateProfileBackButton();

    if (pushState && !isSameTab) {
      try {
        window.history.pushState(
          { type: "omni-people-view", tab, pubkey: activePubkey, from: previousTab },
          "",
          `?view=${tab}${tab === "profile" && activePubkey ? `&pubkey=${activePubkey}` : ""}`
        );
      } catch (_) {}
    }

    if (tab === "following") {
      if (myPubkey && myFollows.size === 0) {
        loadCachedSocialGraph(myPubkey);
        sendWs(["REQ", "pv_my_contacts", { kinds: [3], authors: [myPubkey], limit: 1 }]);
      }
      renderFollowingList();
    } else if (tab === "blocked") {
      if (myPubkey && myMutes.size === 0) {
        loadCachedSocialGraph(myPubkey);
        sendWs(["REQ", "pv_my_mutes", { kinds: [10000], authors: [myPubkey], limit: 1 }]);
      }
      renderBlockedList();
    }
  }

  btnTabProfile.addEventListener("click", () => {
    previousTab = null;
    switchTab("profile", true);
  });
  btnTabFollowing.addEventListener("click", () => {
    previousTab = null;
    switchTab("following", true);
  });
  btnTabBlocked.addEventListener("click", () => {
    previousTab = null;
    switchTab("blocked", true);
  });

  // Profile back button handler
  btnProfileBack.addEventListener("click", () => {
    if (typeof window !== "undefined" && window.history.state?.type === "omni-people-view") {
      window.history.back();
    } else {
      const target = previousTab || "following";
      previousTab = null;
      updateProfileBackButton();
      switchTab(target, false);
    }
  });

  // Toggle npub lookup bar
  btnToggleLookup.addEventListener("click", () => {
    const isHidden = searchBarEl.style.display === "none" || !searchBarEl.style.display;
    searchBarEl.style.display = isHidden ? "flex" : "none";
    if (isHidden) {
      if (activeTab !== "profile") {
        previousTab = null;
        switchTab("profile", true);
      }
      setTimeout(() => searchInput.focus(), 50);
    }
  });

  // Copy npub handler
  copyBtn.addEventListener("click", async () => {
    const npub = hexToNpub(activePubkey);
    if (!npub) return;
    try {
      await navigator.clipboard.writeText(npub);
      copyLabel.textContent = "Copied!";
      setTimeout(() => {
        copyLabel.textContent = "Copy";
      }, 1500);
    } catch (_) {}
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
      loadProfile(raw);
      switchTab("profile", true);
    } else {
      alert("Please enter a valid 64-character hex pubkey or bech32 npub1 string.");
    }
  };

  searchBtn.addEventListener("click", handleLookup);
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLookup();
  });

  btnRefresh.addEventListener("click", () => {
    if (activePubkey) {
      loadProfile(activePubkey);
    }
  });

  function updateActionButtons(pubkey: string) {
    if (!pubkey || (myPubkey && pubkey === myPubkey)) {
      btnFollow.style.display = "none";
      btnBlock.style.display = "none";
      return;
    }

    // Follow button
    btnFollow.style.display = "inline-flex";
    const isFollowing = myFollows.has(pubkey);
    btnFollow.classList.toggle("is-following", isFollowing);
    btnFollow.textContent = isFollowing ? "Following" : "Follow";

    // Block button
    btnBlock.style.display = "inline-flex";
    const isBlocked = myMutes.has(pubkey);
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
      } catch (_) {}
    }

    countFollowingEl.textContent = String(myFollows.size);
    updateActionButtons(activePubkey);
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
      } catch (_) {}
    }

    countBlockedEl.textContent = String(myMutes.size);
    updateActionButtons(activePubkey);
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

  btnFollow.addEventListener("click", () => toggleFollow(activePubkey));
  btnBlock.addEventListener("click", () => toggleBlock(activePubkey));

  function renderProfileMetadata(pubkey: string, meta: ProfileMetadata | null) {
    const npub = hexToNpub(pubkey);
    const initial = (meta?.display_name || meta?.name || pubkey)[0]?.toUpperCase() || "?";

    npubTextEl.textContent = npub || pubkey;

    // Avatar
    avatarWrapEl.innerHTML = "";
    if (meta?.picture && typeof meta.picture === "string") {
      let pic = meta.picture.trim();
      if (pic.startsWith("http://")) pic = pic.replace(/^http:\/\//i, "https://");
      if (pic.startsWith("https://") || pic.startsWith("data:image/")) {
        const img = document.createElement("img");
        img.src = pic;
        img.alt = meta.display_name || meta.name || "";
        img.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 50%;";
        img.addEventListener("error", () => {
          avatarWrapEl.innerHTML = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; font-weight: 700; color: #fff; background: ${getAvatarGradient(pubkey)};">${escapeHtml(initial)}</div>`;
        });
        avatarWrapEl.appendChild(img);
      } else {
        avatarWrapEl.innerHTML = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; font-weight: 700; color: #fff; background: ${getAvatarGradient(pubkey)};">${escapeHtml(initial)}</div>`;
      }
    } else {
      avatarWrapEl.innerHTML = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; font-weight: 700; color: #fff; background: ${getAvatarGradient(pubkey)};">${escapeHtml(initial)}</div>`;
    }

    // Banner
    if (meta?.banner && typeof meta.banner === "string") {
      let banner = meta.banner.trim();
      if (banner.startsWith("http://")) banner = banner.replace(/^http:\/\//i, "https://");
      if (banner.startsWith("https://") || banner.startsWith("data:image/")) {
        bannerEl.style.backgroundImage = `url("${banner}")`;
      } else {
        bannerEl.style.backgroundImage = `linear-gradient(135deg, #1f1d1a, #2a2723)`;
      }
    } else {
      bannerEl.style.backgroundImage = `linear-gradient(135deg, #1f1d1a, #2a2723)`;
    }

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

  function renderNoteCard(event: any): HTMLElement {
    const timeStr = event.created_at ? formatTime(event.created_at) : "just now";
    const card = html<HTMLDivElement>`
      <div class="pv-note-card" style="background: var(--bg-surface, #191816); border: 1px solid var(--border-subtle, #272522); border-radius: var(--radius-sm, 8px); padding: 14px; display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: var(--text-muted, #78716c);">
          <span style="font-family: var(--font-mono, monospace);">kind: 1</span>
          <span>${escapeHtml(timeStr)}</span>
        </div>
        <div style="font-size: 0.88rem; line-height: 1.45; color: var(--text-primary, #ede8df); white-space: pre-wrap; word-break: break-word;">
          ${formatContent(event.content || "")}
        </div>
      </div>
    `;
    return card;
  }

  function loadProfile(pubkey: string) {
    if (!pubkey) return;
    if (pubkey === activePubkey && (isLoading || activeProfileSubId)) {
      return;
    }
    activePubkey = pubkey;
    isLoading = true;

    try {
      localStorage.setItem("omni_active_profile_pubkey", pubkey);
    } catch (_) {}

    if (eoseTimeout) {
      clearTimeout(eoseTimeout);
      eoseTimeout = null;
    }

    notesListEl.innerHTML = `<div class="pv-notes-loading" style="padding: 24px; text-align: center; color: var(--text-muted, #78716c); font-size: 0.85rem;">Loading timeline notes...</div>`;
    notesCountEl.textContent = "Loading...";

    const cached = profileCache.get(pubkey);
    renderProfileMetadata(pubkey, cached || null);

    if (activeProfileSubId) {
      sendWs(["CLOSE", activeProfileSubId]);
    }
    if (activeNotesSubId) {
      sendWs(["CLOSE", activeNotesSubId]);
    }

    const profileSubId = `pv_prof_${Math.random().toString(36).slice(2, 8)}`;
    const notesSubId = `pv_notes_${Math.random().toString(36).slice(2, 8)}`;
    activeProfileSubId = profileSubId;
    activeNotesSubId = notesSubId;

    renderedNoteIds.clear();
    noteCount = 0;

    // Send subscriptions safely via sendWs (buffered if socket not open yet)
    sendWs(["REQ", profileSubId, { kinds: [0], authors: [pubkey], limit: 1 }]);
    sendWs(["REQ", notesSubId, { kinds: [1], authors: [pubkey], limit: 30 }]);

    eoseTimeout = setTimeout(() => {
      isLoading = false;
      if (noteCount === 0) {
        notesListEl.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-muted, #78716c); font-size: 0.85rem;">No public notes published by this user yet.</div>`;
        notesCountEl.textContent = "0 notes";
      }
    }, 3000);
  }

  // Build user card row for Following / Blocked lists
  function buildUserCard(pubkey: string, isBlockList = false): HTMLElement {
    const meta = profileCache.get(pubkey);
    const initial = (meta?.display_name || meta?.name || pubkey)[0]?.toUpperCase() || "?";
    const displayName = meta?.display_name || meta?.name || `nostr:${pubkey.slice(0, 8)}`;
    const handle = meta?.name ? `@${meta.name}` : `@npub1${pubkey.slice(0, 8)}`;
    const about = meta?.about || "";
    const npub = hexToNpub(pubkey);

    const card = html<HTMLDivElement>`
      <div class="people-user-card" data-pubkey="${escapeHtml(pubkey)}">
        <div class="people-avatar" style="width: 44px; height: 44px; border-radius: 50%; overflow: hidden; background: ${getAvatarGradient(pubkey)}; display: flex; align-items: center; justify-content: center; font-weight: 700; color: #fff; flex-shrink: 0; cursor: pointer;">
          <span>${escapeHtml(initial)}</span>
        </div>
        <div class="people-user-info">
          <div class="people-user-name">${escapeHtml(displayName)}</div>
          <div class="people-user-handle">${escapeHtml(handle)}</div>
          ${about ? `<div class="people-user-about">${escapeHtml(about)}</div>` : ""}
        </div>
        <div class="people-user-actions">
          ${isBlockList
            ? `<button class="btn-block-toggle is-blocked btn-unblock-row" title="Unblock user">Unblock</button>`
            : `<button class="btn-follow-toggle is-following btn-unfollow-row" title="Unfollow user">Unfollow</button>`
          }
        </div>
      </div>
    `;

    // Click on info/avatar navigates to profile tab
    const openUser = () => {
      previousTab = isBlockList ? "blocked" : "following";
      loadProfile(pubkey);
      switchTab("profile", true);
    };
    card.querySelector<HTMLElement>(".people-avatar")?.addEventListener("click", openUser);
    card.querySelector<HTMLElement>(".people-user-info")?.addEventListener("click", openUser);

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

    if (meta?.picture) {
      let pic = String(meta.picture).trim();
      if (pic.startsWith("http://")) pic = pic.replace(/^http:\/\//i, "https://");
      if (pic.startsWith("https://") || pic.startsWith("data:image/")) {
        const aWrap = card.querySelector<HTMLElement>(".people-avatar");
        if (aWrap) {
          aWrap.innerHTML = `<img src="${escapeHtml(pic)}" alt="" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
        }
      }
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
        <div style="padding: 32px 16px; text-align: center; color: var(--text-muted, #78716c);">
          <div style="margin-bottom: 8px; display: inline-flex;">${ICONS.users}</div>
          <div style="font-weight: 600; color: var(--text-primary, #ede8df); margin-bottom: 4px;">No followed accounts</div>
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
        <div style="padding: 32px 16px; text-align: center; color: var(--text-muted, #78716c);">
          <div style="margin-bottom: 8px; display: inline-flex;">${ICONS.shieldOff}</div>
          <div style="font-weight: 600; color: var(--text-primary, #ede8df); margin-bottom: 4px;">No blocked accounts</div>
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

  // Register Intent Handler for 'view_profile'
  const handleViewProfile = (data: any) => {
    if (data?.pubkey) {
      loadProfile(data.pubkey);
      switchTab("profile", false);
    }
  };

  if (typeof (window as any).omni !== "undefined" && (window as any).omni.intents?.handle) {
    (window as any).omni.intents.handle("view_profile", handleViewProfile);
  } else {
    window.addEventListener("omni:intent", (e: any) => {
      if (e.detail?.action === "view_profile" && e.detail?.data) {
        handleViewProfile(e.detail.data);
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
          loadProfile(state.pubkey);
        }
        switchTab(state.tab, false);
        return;
      }

      const searchParams = new URLSearchParams(window.location.search || window.location.hash.replace("#", "?"));
      const pk = searchParams.get("pubkey");
      const v = searchParams.get("view");
      if (v === "following" || v === "blocked" || v === "profile") {
        switchTab(v as any, false);
      } else if (previousTab) {
        const target = previousTab;
        previousTab = null;
        switchTab(target, false);
      }
      if (pk && pk !== activePubkey) {
        loadProfile(pk);
      }
    } catch (_) {}
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
    } catch (_) {}
    try {
      const omniObj = typeof window !== "undefined" ? (window as any).omni : null;
      if (omniObj?.nostr?.getPublicKey) {
        const pk = await omniObj.nostr.getPublicKey();
        if (pk) return pk;
      }
    } catch (_) {}
    try {
      const omniObj = typeof window !== "undefined" ? (window as any).omni : null;
      if (omniObj?.session?.userPubkey) {
        return omniObj.session.userPubkey;
      }
    } catch (_) {}
    return "";
  }

  // Resolve initial pubkey to inspect strictly using standard Web APIs
  let initialPubkey = "";
  try {
    const searchParams = new URLSearchParams(window.location.search || window.location.hash.replace("#", "?"));
    initialPubkey = searchParams.get("pubkey") || "";
    const v = searchParams.get("view");
    if (v === "following" || v === "blocked") {
      switchTab(v as any, false);
    }
  } catch (_) {}

  if (!initialPubkey) {
    try {
      initialPubkey = localStorage.getItem("omni_active_profile_pubkey") || "";
    } catch (_) {}
  }

  if (initialPubkey) {
    loadProfile(initialPubkey);
  }

  resolveUserPubkey().then((pk) => {
    if (pk) {
      initUserSocialGraph(pk);
      if (!initialPubkey && !activePubkey) {
        loadProfile(pk);
      }
    } else if (!initialPubkey && !activePubkey) {
      displayNameEl.textContent = "Enter a pubkey or npub above to view profile";
    }
  }).catch(() => {
    if (!initialPubkey && !activePubkey) {
      displayNameEl.textContent = "Enter a pubkey or npub above to view profile";
    }
  });

  return {
    switchTab,
    loadProfile,
    toggleFollow,
    toggleBlock,
    getMyFollows: () => myFollows,
    getMyMutes: () => myMutes,
    getActivePubkey: () => activePubkey
  };
}

// Auto-mount
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mountProfileViewer(document.body));
  } else {
    mountProfileViewer(document.body);
  }
}

export { mountProfileViewer };
