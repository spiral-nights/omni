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
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTime(unixSec: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, now - unixSec);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d`;
  const d = new Date(unixSec * 1000);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

const profileCache = new Map<string, { name?: string; display_name?: string; picture?: string; nip05?: string }>();
const pendingProfileFetches = new Set<string>();

function getAuthorMeta(pubkey: string) {
  if (!pubkey) return { name: "anonymous", handle: "@anon", initial: "?", picture: "" };
  const cached = profileCache.get(pubkey);
  const initial = ((cached?.display_name || cached?.name || pubkey)[0] || "?").toUpperCase();
  const name = cached?.display_name || cached?.name || `nostr:${pubkey.slice(0, 6)}`;
  const handle = cached?.nip05 ? `@${cached.nip05}` : `@npub1${pubkey.slice(0, 6)}`;
  return {
    name,
    handle,
    initial,
    picture: cached?.picture || ""
  };
}

// Standard Bech32 decoding (NIP-19) for identifier resolution in search
const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function bech32Polymod(values: number[]): number {
  const gen = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      chk ^= ((top >> i) & 1) ? gen[i] : 0;
    }
  }
  return chk;
}

export function bech32Decode(str: string): { hrp: string; words: number[] } | null {
  try {
    const s = str.toLowerCase().trim();
    const pos = s.lastIndexOf("1");
    if (pos < 1 || pos + 7 > s.length || s.length > 5000) return null;
    const hrp = s.slice(0, pos);
    for (const ch of hrp) if (ch.charCodeAt(0) < 33 || ch.charCodeAt(0) > 126) return null;
    const words: number[] = [];
    for (const ch of s.slice(pos + 1)) {
      const idx = BECH32_CHARSET.indexOf(ch);
      if (idx === -1) return null;
      words.push(idx);
    }
    if (bech32Polymod([
      ...hrp.split("").map((c) => c.charCodeAt(0) >> 5),
      0,
      ...hrp.split("").map((c) => c.charCodeAt(0) & 31),
      ...words
    ]) !== 1) return null;
    return { hrp, words: words.slice(0, -6) };
  } catch (_) {
    return null;
  }
}

function convertBits(data: number[], fromBits: number, toBits: number): number[] {
  let acc = 0;
  let bits = 0;
  const ret: number[] = [];
  const maxv = (1 << toBits) - 1;
  for (const v of data) {
    acc = (acc << fromBits) | v;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (bits > 0) ret.push((acc << (toBits - bits)) & maxv);
  return ret;
}

export function wordsToBytes(words: number[]): number[] {
  return convertBits(words, 5, 8).slice(0, Math.floor((words.length * 5) / 8));
}

export function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface DecodedNostrEntity {
  type: "npub" | "nprofile" | "note" | "nevent" | "naddr";
  hex?: string;
  kind?: number;
  pubkey?: string;
  identifier?: string;
}

export function decodeNostrEntity(raw: string): DecodedNostrEntity | null {
  const s = raw.trim().toLowerCase();
  if (!/^(npub|nprofile|note|nevent|naddr)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/.test(s)) return null;
  const decoded = bech32Decode(s);
  if (!decoded) return null;
  const bytes = wordsToBytes(decoded.words);
  const hex = bytesToHex(bytes);

  switch (decoded.hrp) {
    case "npub":
      return bytes.length === 32 ? { type: "npub", hex } : null;
    case "note":
      return bytes.length === 32 ? { type: "note", hex } : null;
    case "nprofile": {
      let pubkey: string | undefined;
      let i = 0;
      while (i + 2 <= bytes.length) {
        const tag = bytes[i];
        const len = bytes[i + 1];
        const val = bytes.slice(i + 2, i + 2 + len);
        if (tag === 0 && len === 32) pubkey = bytesToHex(val);
        i += 2 + len;
      }
      return pubkey ? { type: "nprofile", pubkey } : null;
    }
    case "nevent": {
      let eventId: string | undefined;
      let i = 0;
      while (i + 2 <= bytes.length) {
        const tag = bytes[i];
        const len = bytes[i + 1];
        if (tag === 0 && len === 32) eventId = bytesToHex(bytes.slice(i + 2, i + 2 + len));
        i += 2 + bytes[i + 1];
      }
      return eventId ? { type: "nevent", hex: eventId } : null;
    }
    case "naddr": {
      let kind: number | undefined;
      let pubkey: string | undefined;
      let identifier: string | undefined;
      let i = 0;
      while (i + 2 <= bytes.length) {
        const tag = bytes[i];
        const len = bytes[i + 1];
        const val = bytes.slice(i + 2, i + 2 + len);
        if (tag === 0 && len === 4) kind = (val[0] << 24) | (val[1] << 16) | (val[2] << 8) | val[3];
        if (tag === 1 && len === 32) pubkey = bytesToHex(val);
        if (tag === 2) identifier = String.fromCharCode(...val);
        i += 2 + len;
      }
      return kind !== undefined && pubkey ? { type: "naddr", kind, pubkey, identifier } : null;
    }
    default:
      return null;
  }
}

export interface ParsedSearchQuery {
  authors: string[];
  keyword: string;
}

export function parseSearchQuery(raw: string): ParsedSearchQuery {
  const authors: string[] = [];
  const keywords: string[] = [];
  for (const token of (raw || "").trim().split(/\s+/).filter(Boolean)) {
    if (token.startsWith("@") && token.length > 1) {
      authors.push(token.slice(1));
    } else {
      keywords.push(token);
    }
  }
  return { authors, keyword: keywords.join(" ").toLowerCase() };
}

export function isNostrIdentifier(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  if (/^[0-9a-fA-F]{64}$/.test(s)) return true;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return true;
  return decodeNostrEntity(s) !== null;
}

function formatContent(text: string): string {
  const escaped = escapeHtml(text || "");
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  return escaped.replace(urlRegex, (rawUrl) => {
    const url = rawUrl.replace(/^http:\/\//i, "https://");
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="feed-link">${url}</a>`;
  });
}

// Crisp geometric monochrome SVG line icons (Bluesky style)
const ICONS = {
  reply: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>`,
  repost: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="17 1 21 5 17 9"/>
    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
    <polyline points="7 23 3 19 7 15"/>
    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
  </svg>`,
  heartOutline: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>`,
  heartFilled: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>`,
  share: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="18" cy="5" r="3"/>
    <circle cx="6" cy="12" r="3"/>
    <circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>`,
  refresh: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="23 4 23 10 17 10"/>
    <polyline points="1 20 1 14 7 14"/>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
  </svg>`,
  search: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="11" r="7"/>
    <line x1="21" y1="21" x2="16.2" y2="16.2"/>
  </svg>`,
  back: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/>
    <polyline points="12 19 5 12 12 5"/>
  </svg>`,
  arrowUp: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="19" x2="12" y2="5"/>
    <polyline points="5 12 12 5 19 12"/>
  </svg>`,
  user: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>`,
  settings: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>`,
  trash: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>`
};

// Configurable regex filter patterns for timeline notes.
// By default, filters out JSON payloads (beginning with { and ending with }, ignoring whitespace).
export const DEFAULT_FILTER_PATTERNS = [
  "^\\s*\\{[\\s\\S]*\\}\\s*$"
];

export const STORAGE_KEY_FEED_FILTERS = "omni_feed_filter_patterns";

export function loadFilterPatterns(): string[] {
  if (typeof localStorage === "undefined") {
    return [...DEFAULT_FILTER_PATTERNS];
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FEED_FILTERS);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((p) => String(p).trim()).filter((p) => p.length > 0);
      }
    }
  } catch (_) {}
  return [...DEFAULT_FILTER_PATTERNS];
}

export function saveFilterPatterns(patterns: string[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_FEED_FILTERS, JSON.stringify(patterns));
  } catch (_) {}
}

export function compileFilterRegex(pattern: string): RegExp | null {
  try {
    const trimmed = pattern.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/^\/(.+)\/([gimsuy]*)$/);
    if (match) {
      return new RegExp(match[1], match[2]);
    }
    return new RegExp(trimmed);
  } catch (_) {
    return null;
  }
}

export function isContentFiltered(content: string, patterns: string[]): boolean {
  if (typeof content !== "string" || !content) return false;
  for (const pat of patterns) {
    const rx = compileFilterRegex(pat);
    if (rx && rx.test(content)) {
      return true;
    }
  }
  return false;
}

export function renderFilterSettings(container: HTMLElement, onFiltersChanged?: (patterns: string[]) => void) {
  let patterns = loadFilterPatterns();

  const wrapper = html<HTMLDivElement>`
    <div class="feed-filter-settings" style="display: flex; flex-direction: column; gap: 14px; font-family: inherit; color: var(--text-primary, #ede8df);">
      <div class="filter-header-row">
        <h3 style="margin: 0; font-size: 1rem; font-weight: 600; color: var(--text-primary, #ede8df);">Content Filters</h3>
        <p style="margin: 4px 0 0 0; font-size: 0.8rem; color: var(--text-muted, #78716c);">
          Filter notes out of your feed using regular expressions. By default, raw JSON payloads (starting with { and ending with }, ignoring whitespace) are filtered out.
        </p>
      </div>

      <!-- Add Pattern Box -->
      <div class="filter-add-box" style="display: flex; flex-direction: column; gap: 8px; background: var(--bg-subtle, #22201d); padding: 12px; border-radius: var(--radius-sm, 6px); border: 1px solid var(--border-subtle, #33312c);">
        <label style="font-size: 0.78rem; font-weight: 600; color: var(--text-secondary, #9e988f);" for="input-filter-pattern">
          Add Regex Pattern
        </label>
        <div style="display: flex; gap: 8px;">
          <input id="input-filter-pattern" class="filter-pattern-input" type="text" spellcheck="false" placeholder="e.g. ^\\s*\\{[\\s\\S]*\\}\\s*$ or \\b(spam|bot)\\b" style="flex: 1; background: var(--bg-canvas, #141312); border: 1px solid var(--border-strong, #44413c); color: var(--text-primary, #ede8df); padding: 7px 10px; border-radius: var(--radius-sm, 6px); font-family: monospace; font-size: 0.82rem;" />
          <button class="btn-add-pattern" style="background: var(--omni-accent-primary, var(--accent-primary, #d4a373)); color: var(--accent-contrast, #141312); border: none; padding: 7px 14px; border-radius: var(--radius-sm, 6px); font-size: 0.8rem; font-weight: 600; cursor: pointer;">
            Add Filter
          </button>
        </div>
        <div class="filter-status-message" style="font-size: 0.75rem; min-height: 16px; color: var(--text-muted, #78716c);"></div>
      </div>

      <!-- Active Patterns List -->
      <div class="filter-list-section" style="display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong style="font-size: 0.82rem; color: var(--text-secondary, #9e988f);">Active Patterns (<span class="pattern-count">${patterns.length}</span>)</strong>
          <button class="btn-reset-patterns" style="background: transparent; border: 1px solid var(--border-subtle, #33312c); color: var(--text-muted, #78716c); padding: 4px 10px; border-radius: var(--radius-sm, 6px); font-size: 0.72rem; cursor: pointer;">
            Reset to Defaults
          </button>
        </div>
        <div class="filter-patterns-list" style="display: flex; flex-direction: column; gap: 6px;"></div>
      </div>
    </div>
  `;

  const input = wrapper.querySelector<HTMLInputElement>(".filter-pattern-input")!;
  const btnAdd = wrapper.querySelector<HTMLButtonElement>(".btn-add-pattern")!;
  const btnReset = wrapper.querySelector<HTMLButtonElement>(".btn-reset-patterns")!;
  const statusMsg = wrapper.querySelector<HTMLDivElement>(".filter-status-message")!;
  const patternCount = wrapper.querySelector<HTMLElement>(".pattern-count")!;
  const listEl = wrapper.querySelector<HTMLDivElement>(".filter-patterns-list")!;

  function setStatus(text: string, isError = false) {
    if (!statusMsg) return;
    statusMsg.textContent = text;
    statusMsg.style.color = isError ? "var(--accent-danger, #e11d48)" : "var(--omni-accent-primary, var(--accent-primary, #d4a373))";
    if (text && !isError) {
      setTimeout(() => {
        if (statusMsg.textContent === text) {
          statusMsg.textContent = "";
        }
      }, 3000);
    }
  }

  function renderPatterns() {
    listEl.innerHTML = "";
    patternCount.textContent = String(patterns.length);

    if (patterns.length === 0) {
      const emptyEl = html<HTMLDivElement>`
        <div class="empty-patterns" style="font-size: 0.78rem; color: var(--text-muted, #78716c); font-style: italic; padding: 8px 0;">
          No active filters. All notes will be displayed in the feed.
        </div>
      `;
      listEl.appendChild(emptyEl);
      return;
    }

    for (let i = 0; i < patterns.length; i++) {
      const pat = patterns[i];
      const isJsonDefault = pat === "^\\s*\\{[\\s\\S]*\\}\\s*$";
      const row = html<HTMLDivElement>`
        <div class="pattern-item" data-index="${i}" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; background: var(--bg-surface, #191816); border: 1px solid var(--border-subtle, #2a2824); padding: 8px 12px; border-radius: var(--radius-sm, 6px);">
          <div style="display: flex; align-items: center; gap: 8px; overflow: hidden; min-width: 0;">
            <code class="feed-pattern-code" style="font-family: monospace; font-size: 0.82rem; color: var(--omni-accent-primary, var(--accent-primary, #d4a373)); word-break: break-all;">${escapeHtml(pat)}</code>
            ${isJsonDefault ? `<span class="pattern-badge-default" style="font-size: 0.7rem; color: var(--text-muted, #78716c); white-space: nowrap;">(JSON payloads default)</span>` : ""}
          </div>
          <button class="btn-remove-pattern" data-index="${i}" title="Remove pattern" aria-label="Remove pattern" style="background: transparent; border: none; color: var(--text-muted, #78716c); cursor: pointer; padding: 4px; display: flex; align-items: center;">
            ${ICONS.trash}
          </button>
        </div>
      `;

      row.querySelector<HTMLButtonElement>(".btn-remove-pattern")?.addEventListener("click", () => {
        patterns.splice(i, 1);
        saveFilterPatterns(patterns);
        renderPatterns();
        setStatus("Filter pattern removed.");
        onFiltersChanged?.(patterns);
      });

      listEl.appendChild(row);
    }
  }

  function handleAddPattern() {
    const rawVal = input.value.trim();
    if (!rawVal) {
      setStatus("Please enter a regular expression.", true);
      return;
    }

    const compiled = compileFilterRegex(rawVal);
    if (!compiled) {
      setStatus("Invalid regular expression syntax.", true);
      return;
    }

    if (patterns.includes(rawVal)) {
      setStatus("This filter pattern already exists.", true);
      return;
    }

    patterns.push(rawVal);
    saveFilterPatterns(patterns);
    input.value = "";
    renderPatterns();
    setStatus("Filter pattern added successfully.");
    onFiltersChanged?.(patterns);
  }

  btnAdd.addEventListener("click", handleAddPattern);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleAddPattern();
  });

  btnReset.addEventListener("click", () => {
    patterns = [...DEFAULT_FILTER_PATTERNS];
    saveFilterPatterns(patterns);
    renderPatterns();
    setStatus("Reset to default filters.");
    onFiltersChanged?.(patterns);
  });

  renderPatterns();
  container.appendChild(wrapper);
}

function mountFeed(root: any) {
  const container = html<HTMLDivElement>`
    <div class="feed-container">
      <!-- Top Timeline Navigation Header -->
      <div class="feed-top-header">
        <div class="feed-nav-group" style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
          <h2 class="feed-title">Feed</h2>
          <div class="feed-tabs">
            <button class="feed-tab-btn btn-tab-following" data-tab="following">Following</button>
            <button class="feed-tab-btn btn-tab-global" data-tab="global">Global</button>
          </div>
        </div>
        <div class="feed-header-actions">
          <button class="btn-search-feed" title="Search Notes" aria-label="Search Notes">
            ${ICONS.search}
            <span class="btn-label">Search</span>
          </button>
          <button class="btn-settings-feed" title="Feed Settings" aria-label="Feed Settings">
            ${ICONS.settings}
            <span class="btn-label">Settings</span>
          </button>
          <button class="btn-refresh-feed" title="Refresh Feed" aria-label="Refresh Feed">
            ${ICONS.refresh}
            <span class="btn-label">Refresh</span>
          </button>
        </div>
      </div>

      <!-- Note Composer (Seamless Bluesky Post Box) -->
      <div class="feed-composer composer-card">
        <div class="composer-avatar-col">
          <div class="composer-avatar" id="my-composer-avatar">
            <span>U</span>
          </div>
        </div>
        <div class="composer-main-col">
          <textarea class="composer-input" placeholder="What's happening?" rows="2"></textarea>
          <div class="composer-toolbar">
            <div class="composer-tools"></div>
            <button class="btn-publish">Post</button>
          </div>
        </div>
      </div>

      <!-- Timeline Notes Stream -->
      <div class="notes-list">
        <div class="loading-state">
          <div class="loading-spinner"></div>
          <span>Loading timeline notes...</span>
        </div>
      </div>

      <!-- Infinite Scroll Sentinel -->
      <div class="feed-sentinel" id="feed-sentinel"></div>

      <!-- Back to Top Footer Action -->
      <div class="feed-footer-actions" style="display: flex; justify-content: center; padding: 24px 0 16px 0;">
        <button class="btn-feed-back-to-top" data-action="scroll-top" title="Back to top" aria-label="Back to top">
          ${ICONS.arrowUp}
          <span>Back to top</span>
        </button>
      </div>

      <!-- Search Page (hidden until activated from the header) -->
      <div class="feed-search-page" style="display: none;">
        <div class="feed-top-header">
          <button class="btn-search-back" title="Back to Feed">
            ${ICONS.back}
            <span>Back</span>
          </button>
          <h2 class="feed-title">Search</h2>
        </div>
        <div class="feed-search-bar">
          <input class="feed-search-input" type="search" spellcheck="false"
            placeholder="Search notes, @author, or paste npub / note / nevent" />
          <button class="btn-do-search">Search</button>
        </div>
        <div class="feed-search-chips"></div>
        <div class="feed-search-results"></div>
      </div>

      <!-- Settings Page (hidden until activated from the header) -->
      <div class="feed-settings-page" style="display: none;">
        <div class="feed-top-header">
          <button class="btn-settings-back" title="Back to Feed">
            ${ICONS.back}
            <span>Back</span>
          </button>
          <h2 class="feed-title">Feed Settings</h2>
        </div>
        <div class="feed-settings-content" style="padding: 16px 20px;"></div>
      </div>

      <!-- Thread View Page (hidden until activated from clicking a note or view_note intent) -->
      <div class="feed-thread-page" style="display: none;">
        <div class="feed-top-header">
          <button class="btn-thread-back" title="Back to Feed">
            ${ICONS.back}
            <span>Back</span>
          </button>
          <h2 class="feed-title">Thread</h2>
        </div>
        <div class="feed-thread-content">
          <!-- Parent / Ancestor notes (if any) -->
          <div class="thread-ancestors"></div>
          <!-- Main focused note -->
          <div class="thread-focused-note"></div>
          <!-- Inline reply composer -->
          <div class="thread-reply-composer composer-card">
            <div style="display: flex; gap: 10px; width: 100%;">
              <div class="thread-composer-avatar" style="width: 32px; height: 32px; border-radius: 50%; background: var(--omni-accent-primary, var(--omni-accent, #d4a373)); color: #141312; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 0.8rem; flex-shrink: 0;">
                <span>U</span>
              </div>
              <div style="flex: 1; display: flex; flex-direction: column; gap: 8px;">
                <textarea class="thread-reply-input" placeholder="Post your reply..." rows="2" style="width: 100%; box-sizing: border-box; background: transparent; border: none; color: var(--omni-text-primary, #ede8df); resize: vertical; outline: none; font-family: inherit; font-size: 0.9rem; line-height: 1.4;"></textarea>
                <div style="display: flex; justify-content: flex-end; align-items: center;">
                  <button class="btn-thread-reply btn-publish" style="padding: 5px 14px; font-size: 0.78rem;">Reply</button>
                </div>
              </div>
            </div>
          </div>
          <!-- Replies section header & stream -->
          <div class="thread-replies-header" style="padding: 10px 16px 4px 16px; font-size: 0.78rem; font-weight: 600; color: var(--omni-text-muted, #78716c); text-transform: uppercase; letter-spacing: 0.05em;">
            Replies
          </div>
          <div class="thread-replies-list"></div>
        </div>
      </div>
    </div>
  `;

  const textarea = container.querySelector<HTMLTextAreaElement>(".composer-input")!;
  const btnPublish = container.querySelector<HTMLButtonElement>(".btn-publish")!;
  const btnRefresh = container.querySelector<HTMLButtonElement>(".btn-refresh-feed")!;
  const notesList = container.querySelector<HTMLDivElement>(".notes-list")!;
  const loadingState = container.querySelector<HTMLDivElement>(".loading-state")!;
  const myAvatarEl = container.querySelector<HTMLElement>("#my-composer-avatar")!;
  const sentinelEl = container.querySelector<HTMLElement>("#feed-sentinel")!;

  const searchPage = container.querySelector<HTMLDivElement>(".feed-search-page")!;
  const btnSearchBack = container.querySelector<HTMLButtonElement>(".btn-search-back")!;
  const btnSearchOpen = container.querySelector<HTMLButtonElement>(".btn-search-feed")!;
  const searchInput = container.querySelector<HTMLInputElement>(".feed-search-input")!;
  const btnDoSearch = container.querySelector<HTMLButtonElement>(".btn-do-search")!;
  const searchChips = container.querySelector<HTMLDivElement>(".feed-search-chips")!;
  const searchResults = container.querySelector<HTMLDivElement>(".feed-search-results")!;

  const settingsPage = container.querySelector<HTMLDivElement>(".feed-settings-page")!;
  const btnSettingsBack = container.querySelector<HTMLButtonElement>(".btn-settings-back")!;
  const btnSettingsOpen = container.querySelector<HTMLButtonElement>(".btn-settings-feed")!;
  const settingsContent = container.querySelector<HTMLDivElement>(".feed-settings-content")!;

  const threadPage = container.querySelector<HTMLDivElement>(".feed-thread-page")!;
  const btnThreadBack = container.querySelector<HTMLButtonElement>(".btn-thread-back")!;
  const threadAncestors = container.querySelector<HTMLDivElement>(".thread-ancestors")!;
  const threadFocusedNote = container.querySelector<HTMLDivElement>(".thread-focused-note")!;
  const threadReplyInput = container.querySelector<HTMLTextAreaElement>(".thread-reply-input")!;
  const btnThreadReply = container.querySelector<HTMLButtonElement>(".btn-thread-reply")!;
  const threadRepliesList = container.querySelector<HTMLDivElement>(".thread-replies-list")!;
  const threadComposerAvatar = container.querySelector<HTMLElement>(".thread-composer-avatar")!;

  const btnTabFollowing = container.querySelector<HTMLButtonElement>(".btn-tab-following")!;
  const btnTabGlobal = container.querySelector<HTMLButtonElement>(".btn-tab-global")!;

  root.appendChild(container);

  let activeTab: "following" | "global" = "global";
  try {
    const savedTab = localStorage.getItem("omni_feed_active_tab");
    if (savedTab === "following" || savedTab === "global") {
      activeTab = savedTab;
    }
  } catch (_) {}

  const followingPubkeys = new Set<string>();
  let myUserPubkey = "";

  function updateTabButtons() {
    if (activeTab === "following") {
      btnTabFollowing.classList.add("active");
      btnTabGlobal.classList.remove("active");
    } else {
      btnTabGlobal.classList.add("active");
      btnTabFollowing.classList.remove("active");
    }
  }
  updateTabButtons();

  function shouldDisplayInActiveTab(event: any): boolean {
    if (activeTab === "following") {
      return followingPubkeys.has(event.pubkey);
    }
    return true;
  }

  // Initialize composer avatar with user pubkey if available
  try {
    const nostr = (window as any).nostr;
    if (nostr?.getPublicKey) {
      nostr.getPublicKey().then((pk: string) => {
        if (pk) {
          myUserPubkey = pk;
          followingPubkeys.add(pk);
          if (myAvatarEl) {
            myAvatarEl.style.background = getAvatarGradient(pk);
            myAvatarEl.textContent = (pk[0] || "U").toUpperCase();
          }
          if (threadComposerAvatar) {
            threadComposerAvatar.style.background = getAvatarGradient(pk);
            threadComposerAvatar.textContent = (pk[0] || "U").toUpperCase();
          }
          fetchFollowingList(pk);
          if (activeTab === "following") {
            subscribeFollowingNotes();
          }
        }
      }).catch(() => {});
    }
  } catch {}

  const renderedIds = new Set<string>();
  const timelineNotes = new Map<string, any>();
  const allKnownNotes = new Map<string, any>();
  let filterPatterns = loadFilterPatterns();
  let oldestTimestamp = Infinity;
  let latestTimestamp = 0;
  let isLoadingOlder = false;
  let activeWs: any = null;

  function fetchFollowingList(pk: string) {
    if (!pk || !activeWs || activeWs.readyState !== WebSocket.OPEN) return;
    try {
      activeWs.send(JSON.stringify(["REQ", "feed-contacts", { kinds: [3], authors: [pk], limit: 1 }]));
    } catch (_) {}
  }

  function subscribeFollowingNotes() {
    if (!activeWs || activeWs.readyState !== WebSocket.OPEN || followingPubkeys.size === 0) return;
    try {
      activeWs.send(JSON.stringify(["REQ", "feed-following", { kinds: [1], authors: Array.from(followingPubkeys).slice(0, 100), limit: 50 }]));
    } catch (_) {}
  }

  function showEmptyState() {
    if (loadingState.parentElement) {
      loadingState.remove();
    }
    if (renderedIds.size === 0 && !notesList.querySelector(".empty-state")) {
      const emptyEl = html<HTMLDivElement>`
        <div class="empty-state">
          <div class="empty-icon-wrap">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div class="empty-state-title">No timeline notes yet</div>
          <div class="empty-state-subtitle">Be the first to share an update or follow relays in Settings.</div>
        </div>
      `;
      notesList.appendChild(emptyEl);
    }
  }

  function showFollowingEmptyState() {
    if (loadingState.parentElement) {
      loadingState.remove();
    }
    if (renderedIds.size === 0 && !notesList.querySelector(".empty-state")) {
      const emptyEl = html<HTMLDivElement>`
        <div class="empty-state">
          <div class="empty-icon-wrap">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div class="empty-state-title">No notes from followed accounts yet</div>
          <div class="empty-state-subtitle">Follow accounts in the People app or switch to the Global tab.</div>
        </div>
      `;
      notesList.appendChild(emptyEl);
    }
  }

  const initialLoadTimeout = setTimeout(() => {
    if (renderedIds.size === 0) {
      if (activeTab === "following") {
        showFollowingEmptyState();
      } else {
        showEmptyState();
      }
    }
  }, 3000);

  function renderNote(event: any, prepend = false) {
    if (!event || !event.id) return;
    if (renderedIds.has(event.id)) return;
    if (isContentFiltered(event.content || "", filterPatterns)) return;
    if (!shouldDisplayInActiveTab(event)) return;
    renderedIds.add(event.id);
    timelineNotes.set(event.id, event);

    clearTimeout(initialLoadTimeout);

    if (loadingState.parentElement) {
      loadingState.remove();
    }
    const existingEmpty = notesList.querySelector(".empty-state");
    if (existingEmpty) {
      existingEmpty.remove();
    }

    if (event.created_at && event.created_at < oldestTimestamp) {
      oldestTimestamp = event.created_at;
    }
    if (event.created_at && event.created_at > latestTimestamp) {
      latestTimestamp = event.created_at;
    }

    const card = buildNoteCard(event);

    if (prepend && notesList.firstChild) {
      notesList.insertBefore(card, notesList.firstChild);
    } else {
      notesList.appendChild(card);
    }
  }

  function buildNoteCard(event: any): HTMLElement {

    const { name, handle, initial, picture } = getAuthorMeta(event.pubkey);
    const avatarGradient = getAvatarGradient(event.pubkey || "");
    const timeStr = event.created_at ? formatTime(event.created_at) : "just now";
    const isReply = (event.tags || []).some((t: any[]) => t[0] === "e");

    let sanitizedPic = picture ? picture.trim() : "";
    if (sanitizedPic.startsWith("http://")) sanitizedPic = sanitizedPic.replace(/^http:\/\//i, "https://");
    const avatarInner = (sanitizedPic && (sanitizedPic.startsWith("https://") || sanitizedPic.startsWith("data:image/")))
      ? `<img src="${escapeHtml(sanitizedPic)}" alt="" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`
      : `<span>${escapeHtml(initial)}</span>`;

    // Deterministic counts based on note id to give authentic social feed feel
    const pseudoRand = (event.id || "").split("").reduce((acc: number, ch: string) => acc + ch.charCodeAt(0), 0);
    const initLikes = pseudoRand % 19;
    const initReposts = pseudoRand % 7;
    const initReplies = pseudoRand % 5;

    const card = html<HTMLElement>`
      <article class="feed-post note-card" data-note-id="${escapeHtml(event.id || "")}" data-author-pubkey="${escapeHtml(event.pubkey || "")}" title="Click to view conversation thread">
        <div class="feed-post-avatar-col">
          <div class="feed-avatar" role="button" tabindex="0" style="background: ${avatarGradient}; cursor: pointer;" title="View profile">
            ${avatarInner}
          </div>
        </div>
        <div class="feed-post-body">
          <div class="feed-post-header note-header">
            <div class="feed-post-author-info">
              <strong class="feed-author-name note-author" role="button" tabindex="0" style="cursor: pointer;" title="View profile">${escapeHtml(name)}</strong>
              <span class="feed-author-handle" role="button" tabindex="0" style="cursor: pointer;" title="View profile">${escapeHtml(handle)}</span>
              <span class="feed-dot">·</span>
              <span class="feed-time note-meta">${escapeHtml(timeStr)}</span>
            </div>
          </div>
          ${isReply ? `<div class="feed-reply-badge">↳ Replying to thread</div>` : ""}
          <div class="feed-post-content note-content">${formatContent(event.content || "")}</div>
          <div class="feed-post-actions note-actions">
            <button class="feed-action-btn note-action-btn action-reply btn-reply" title="Reply">
              ${ICONS.reply}
              <span class="action-count">${initReplies > 0 ? initReplies : ""}</span>
            </button>
            <button class="feed-action-btn note-action-btn action-repost" title="Repost">
              ${ICONS.repost}
              <span class="action-count">${initReposts > 0 ? initReposts : ""}</span>
            </button>
            <button class="feed-action-btn note-action-btn action-like btn-like" title="Like">
              <span class="icon-heart-wrap">${ICONS.heartOutline}</span>
              <span class="action-count">${initLikes > 0 ? initLikes : ""}</span>
            </button>
            <button class="feed-action-btn note-action-btn action-share" title="Share & Copy Note ID">
              ${ICONS.share}
            </button>
          </div>
        </div>
      </article>
    `;

    // Interactive Action Buttons
    const btnLike = card.querySelector<HTMLButtonElement>(".action-like")!;
    const heartWrap = card.querySelector<HTMLElement>(".icon-heart-wrap")!;
    const likeCountSpan = card.querySelector<HTMLElement>(".action-like .action-count")!;
    let isLiked = false;
    let currentLikes = initLikes;

    btnLike.addEventListener("click", () => {
      isLiked = !isLiked;
      if (isLiked) {
        currentLikes++;
        heartWrap.innerHTML = ICONS.heartFilled;
        btnLike.classList.add("active-liked");
      } else {
        currentLikes = Math.max(0, currentLikes - 1);
        heartWrap.innerHTML = ICONS.heartOutline;
        btnLike.classList.remove("active-liked");
      }
      likeCountSpan.textContent = currentLikes > 0 ? String(currentLikes) : "";
    });

    const btnRepost = card.querySelector<HTMLButtonElement>(".action-repost")!;
    const repostCountSpan = card.querySelector<HTMLElement>(".action-repost .action-count")!;
    let isReposted = false;
    let currentReposts = initReposts;
    btnRepost.addEventListener("click", () => {
      isReposted = !isReposted;
      currentReposts = isReposted ? currentReposts + 1 : Math.max(0, currentReposts - 1);
      btnRepost.classList.toggle("active-reposted", isReposted);
      repostCountSpan.textContent = currentReposts > 0 ? String(currentReposts) : "";
    });

    const btnShare = card.querySelector<HTMLButtonElement>(".action-share")!;
    btnShare.addEventListener("click", async () => {
      try {
        const textToCopy = event.id ? `nostr:${event.id}` : window.location.href;
        await navigator.clipboard.writeText(textToCopy);
        const originalTitle = btnShare.title;
        btnShare.title = "Copied to clipboard!";
        btnShare.style.color = "var(--omni-accent-primary, var(--accent-primary, #00a4ef))";
        setTimeout(() => {
          btnShare.title = originalTitle;
          btnShare.style.color = "";
        }, 1500);
      } catch {}
    });

    const btnReply = card.querySelector<HTMLButtonElement>(".action-reply")!;
    btnReply.addEventListener("click", (e) => {
      e.stopPropagation();
      openThread(event, true);
    });

    // Clicking note card (excluding links, action buttons, and author details) opens the full thread
    card.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.closest(".feed-avatar, .feed-author-name, .feed-author-handle, .note-action-btn, a, button")) {
        return;
      }
      openThread(event);
    });

    // Profile intent trigger when clicking author avatar or name
    const avatarEl = card.querySelector<HTMLElement>(".feed-avatar");
    const authorNameEl = card.querySelector<HTMLElement>(".feed-author-name");
    const authorHandleEl = card.querySelector<HTMLElement>(".feed-author-handle");

    const onProfileClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (event.pubkey) {
        dispatchViewProfile(event.pubkey);
      }
    };

    avatarEl?.addEventListener("click", onProfileClick);
    authorNameEl?.addEventListener("click", onProfileClick);
    authorHandleEl?.addEventListener("click", onProfileClick);

    // Queue author metadata lookup if not in cache
    if (event.pubkey && !profileCache.has(event.pubkey) && !pendingProfileFetches.has(event.pubkey)) {
      pendingProfileFetches.add(event.pubkey);
      if (activeWs && activeWs.readyState === WebSocket.OPEN) {
        const subId = `prof_${event.pubkey.slice(0, 8)}`;
        try {
          activeWs.send(JSON.stringify(["REQ", subId, { kinds: [0], authors: [event.pubkey], limit: 1 }]));
        } catch (_) {}
      }
    }

    return card;
  }

  function handleIncomingEvent(event: any, prepend = false) {
    if (!event || !event.id) return;
    allKnownNotes.set(event.id, event);
    if (renderedIds.has(event.id)) return;
    if (isContentFiltered(event.content || "", filterPatterns)) return;
    if (!shouldDisplayInActiveTab(event)) return;
    renderNote(event, prepend);
  }

  function renderActiveFeedTab() {
    renderedIds.clear();
    timelineNotes.clear();
    notesList.innerHTML = "";
    oldestTimestamp = Infinity;
    latestTimestamp = 0;

    const remaining = Array.from(allKnownNotes.values())
      .filter((ev) => !isContentFiltered(ev.content || "", filterPatterns) && shouldDisplayInActiveTab(ev))
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

    if (remaining.length === 0) {
      if (activeTab === "following") {
        showFollowingEmptyState();
      } else {
        showEmptyState();
      }
    } else {
      for (const ev of remaining) {
        renderNote(ev, false);
      }
    }
  }

  function switchFeedTab(tab: "following" | "global") {
    activeTab = tab;
    try {
      localStorage.setItem("omni_feed_active_tab", tab);
    } catch (_) {}
    updateTabButtons();
    renderActiveFeedTab();
    if (tab === "following" && followingPubkeys.size > 0) {
      subscribeFollowingNotes();
    }
  }

  btnTabFollowing.addEventListener("click", () => switchFeedTab("following"));
  btnTabGlobal.addEventListener("click", () => switchFeedTab("global"));

  function reapplyFilters() {
    filterPatterns = loadFilterPatterns();
    renderActiveFeedTab();
  }

  // Refresh Feed
  let lastRefreshStartCount = 0;
  function refreshFeed() {
    if (!activeWs || activeWs.readyState !== WebSocket.OPEN) return;
    btnRefresh.classList.add("spinning");
    lastRefreshStartCount = renderedIds.size;
    const refreshSubId = `refresh-${Date.now()}`;
    const sinceTime = latestTimestamp > 0 ? latestTimestamp : Math.floor(Date.now() / 1000) - 120;
    activeWs.send(JSON.stringify(["REQ", refreshSubId, { kinds: [1], since: sinceTime, limit: 30 }]));
    setTimeout(() => {
      btnRefresh.classList.remove("spinning");
    }, 1500);
  }

  btnRefresh.addEventListener("click", refreshFeed);

  // ===== Search, Settings & Thread Pages =====
  const feedSections: HTMLElement[] = [
    container.querySelector<HTMLElement>(":scope > .feed-top-header") as HTMLElement,
    container.querySelector<HTMLElement>(".feed-composer") as HTMLElement,
    notesList,
    sentinelEl
  ];

  let searchSeq = 0;
  let searchWs: any = null;
  let currentThreadNote: any = null;

  function showSearchPage(arg: boolean | string = true) {
    const pushHistory = typeof arg === "boolean" ? arg : true;
    const initialQuery = typeof arg === "string" ? arg : undefined;

    for (const el of feedSections) {
      if (el) el.style.display = "none";
    }
    settingsPage.style.display = "none";
    threadPage.style.display = "none";
    searchPage.style.display = "block";
    btnSearchOpen?.classList.add("active");
    btnSettingsOpen?.classList.remove("active");
    if (pushHistory) {
      try {
        window.history.pushState({ omniFeedView: "search" }, "", window.location.href);
      } catch (_) {}
    }
    if (initialQuery !== undefined) {
      searchInput.value = initialQuery;
      triggerSearch();
    }
    const focusInput = () => {
      try {
        searchInput.focus();
        searchInput.select?.();
      } catch (_) {}
    };
    focusInput();
    setTimeout(focusInput, 50);
    setTimeout(focusInput, 150);
    setTimeout(focusInput, 300);
  }

  function showSettingsPage(pushHistory = true) {
    for (const el of feedSections) {
      if (el) el.style.display = "none";
    }
    searchPage.style.display = "none";
    threadPage.style.display = "none";
    settingsPage.style.display = "block";
    btnSettingsOpen?.classList.add("active");
    btnSearchOpen?.classList.remove("active");
    if (pushHistory) {
      try {
        window.history.pushState({ omniFeedView: "settings" }, "", window.location.href);
      } catch (_) {}
    }
  }

  function showThreadPage(pushHistory = true) {
    for (const el of feedSections) {
      if (el) el.style.display = "none";
    }
    searchPage.style.display = "none";
    settingsPage.style.display = "none";
    threadPage.style.display = "block";
    btnSearchOpen?.classList.remove("active");
    btnSettingsOpen?.classList.remove("active");
    if (pushHistory && currentThreadNote?.id) {
      try {
        window.history.pushState({ omniFeedView: "thread", noteId: currentThreadNote.id }, "", window.location.href);
      } catch (_) {}
    }
  }

  function showFeedPage(pushHistory = true) {
    searchPage.style.display = "none";
    settingsPage.style.display = "none";
    threadPage.style.display = "none";
    btnSearchOpen?.classList.remove("active");
    btnSettingsOpen?.classList.remove("active");
    for (const el of feedSections) {
      if (el) el.style.display = "";
    }
  }

  function getDirectParentId(event: any, fallbackRootId: string): string {
    const eTags = (event.tags || []).filter((t: any[]) => t[0] === "e" && t[1]);
    if (eTags.length === 0) return fallbackRootId;
    const replyTag = eTags.find((t: any[]) => t[3] === "reply");
    if (replyTag) return replyTag[1];
    if (eTags.length === 1) return eTags[0][1];
    return eTags[eTags.length - 1][1];
  }

  function buildThreadReplyCard(rep: any, parentNote: any, isNested: boolean): HTMLElement {
    const card = buildNoteCard(rep);
    if (isNested) {
      card.classList.add("thread-reply-nested");
    }
    const bodyEl = card.querySelector(".feed-post-body");
    const contentEl = card.querySelector(".feed-post-content");
    if (bodyEl && contentEl) {
      let targetAuthorName = "";
      if (parentNote?.pubkey) {
        const meta = getAuthorMeta(parentNote.pubkey);
        targetAuthorName = meta.handle || meta.name;
      } else {
        const pTag = (rep.tags || []).find((t: any[]) => t[0] === "p" && t[1]);
        if (pTag) {
          const meta = getAuthorMeta(pTag[1]);
          targetAuthorName = meta.handle || meta.name;
        }
      }
      if (targetAuthorName) {
        const indicator = html<HTMLDivElement>`
          <div class="thread-reply-indicator">
            <span>↳ Replying to</span>
            <span class="reply-target-author">${escapeHtml(targetAuthorName)}</span>
          </div>
        `;
        bodyEl.insertBefore(indicator, contentEl);
      }
    }
    return card;
  }

  function appendThreadReply(rep: any) {
    if (!currentThreadNote || threadRepliesList.querySelector(`[data-note-id="${rep.id}"]`)) return;
    const parentId = getDirectParentId(rep, currentThreadNote.id);
    const parentNote = allKnownNotes.get(parentId) || currentThreadNote;
    const isNested = parentId !== currentThreadNote.id;
    const card = buildThreadReplyCard(rep, parentNote, isNested);

    if (isNested) {
      const parentEl = threadRepliesList.querySelector(`[data-note-id="${parentId}"]`);
      if (parentEl && parentEl.nextSibling) {
        threadRepliesList.insertBefore(card, parentEl.nextSibling);
        return;
      }
    }
    threadRepliesList.appendChild(card);
  }

  function renderThreadView(note: any, focusReply = false, pushHistory = true) {
    currentThreadNote = note;
    allKnownNotes.set(note.id, note);
    showThreadPage(pushHistory);

    threadAncestors.innerHTML = "";
    threadFocusedNote.innerHTML = "";
    threadRepliesList.innerHTML = "";
    threadReplyInput.value = "";

    // 1. Focused note
    const focusedCard = buildNoteCard(note);
    threadFocusedNote.appendChild(focusedCard);

    // 2. Ancestor notes leading up to this note
    const existingETags = (note.tags || []).filter((t: any[]) => t[0] === "e" && t[1]);
    const ancestorIds = existingETags.map((t: any[]) => t[1]);
    const missingAncIds: string[] = [];

    for (const ancId of ancestorIds) {
      const anc = allKnownNotes.get(ancId) || timelineNotes.get(ancId);
      if (anc) {
        const ancCard = buildNoteCard(anc);
        ancCard.classList.add("thread-ancestor-card");
        threadAncestors.appendChild(ancCard);
      } else {
        missingAncIds.push(ancId);
      }
    }

    if (missingAncIds.length > 0 && activeWs && activeWs.readyState === WebSocket.OPEN) {
      try {
        activeWs.send(JSON.stringify(["REQ", `thread_anc_${note.id.slice(0, 8)}`, { ids: missingAncIds, limit: 10 }]));
      } catch (_) {}
    }

    // 3. Replies
    const replies = Array.from(allKnownNotes.values()).filter((ev) => {
      if (ev.kind !== 1 || ev.id === note.id) return false;
      return (ev.tags || []).some((t: any[]) => t[0] === "e" && t[1] === note.id);
    });
    replies.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));

    // Build tree
    const directReplies: any[] = [];
    const childMap = new Map<string, any[]>();

    for (const rep of replies) {
      const parentId = getDirectParentId(rep, note.id);
      if (parentId === note.id) {
        directReplies.push(rep);
      } else {
        const existing = childMap.get(parentId) || [];
        existing.push(rep);
        childMap.set(parentId, existing);
      }
    }

    function renderSubtree(parentId: string, parentNote: any, depth = 0) {
      const children = childMap.get(parentId) || [];
      for (const child of children) {
        const childCard = buildThreadReplyCard(child, parentNote, true);
        threadRepliesList.appendChild(childCard);
        renderSubtree(child.id, child, depth + 1);
      }
    }

    for (const directRep of directReplies) {
      const repCard = buildThreadReplyCard(directRep, note, false);
      threadRepliesList.appendChild(repCard);
      renderSubtree(directRep.id, directRep, 1);
    }

    // Orphan replies whose parent wasn't in tree
    const renderedReplyIds = new Set<string>();
    threadRepliesList.querySelectorAll(".note-card").forEach((el) => {
      const id = el.getAttribute("data-note-id");
      if (id) renderedReplyIds.add(id);
    });
    for (const rep of replies) {
      if (!renderedReplyIds.has(rep.id)) {
        const parentId = getDirectParentId(rep, note.id);
        const parentNote = allKnownNotes.get(parentId) || note;
        const repCard = buildThreadReplyCard(rep, parentNote, parentId !== note.id);
        threadRepliesList.appendChild(repCard);
      }
    }

    if (activeWs && activeWs.readyState === WebSocket.OPEN) {
      try {
        activeWs.send(JSON.stringify(["REQ", `thread_rep_${note.id.slice(0, 8)}`, { kinds: [1], "#e": [note.id], limit: 50 }]));
      } catch (_) {}
    }

    if (focusReply) {
      setTimeout(() => {
        try {
          threadReplyInput.focus();
        } catch (_) {}
      }, 50);
    }
  }

  function openThread(target: any, focusReply = false, pushHistory = true) {
    if (!target) return;
    if (typeof target === "string") {
      const existing = allKnownNotes.get(target) || timelineNotes.get(target);
      if (existing) {
        renderThreadView(existing, focusReply, pushHistory);
      } else {
        showThreadPage(pushHistory);
        threadAncestors.innerHTML = "";
        threadRepliesList.innerHTML = "";
        threadFocusedNote.innerHTML = `
          <div class="search-status" style="padding: 24px; text-align: center;">
            <div class="loading-spinner"></div>
            <span>Loading note thread...</span>
          </div>
        `;
        if (activeWs && activeWs.readyState === WebSocket.OPEN) {
          try {
            activeWs.send(JSON.stringify(["REQ", `thread_focus_${target.slice(0, 8)}`, { ids: [target], limit: 1 }]));
          } catch (_) {}
        }
      }
    } else {
      renderThreadView(target, focusReply, pushHistory);
    }
  }

  btnThreadBack.addEventListener("click", () => {
    showFeedPage();
    if (typeof window !== "undefined" && window.history.state?.omniFeedView === "thread") {
      try { window.history.replaceState(null, "", window.location.href); } catch (_) {}
    }
  });

  btnThreadReply.addEventListener("click", async () => {
    if (!currentThreadNote) return;
    const text = threadReplyInput.value?.trim();
    if (!text) return;

    btnThreadReply.disabled = true;
    btnThreadReply.textContent = "Replying...";

    try {
      const tags: string[][] = [["client", "omni"]];
      const existingETags = (currentThreadNote.tags || []).filter((t: any[]) => t[0] === "e" && t[1]);
      let rootId: string | null = null;
      const rootTag = existingETags.find((t: any[]) => t[3] === "root");
      if (rootTag) {
        rootId = rootTag[1];
      } else if (existingETags.length > 0) {
        rootId = existingETags[0][1];
      }

      if (rootId && rootId !== currentThreadNote.id) {
        tags.push(["e", rootId, "", "root"]);
        tags.push(["e", currentThreadNote.id, "", "reply"]);
      } else {
        tags.push(["e", currentThreadNote.id, "", "root"]);
        tags.push(["e", currentThreadNote.id, "", "reply"]);
      }

      const pPubkeys = new Set<string>();
      if (currentThreadNote.pubkey) pPubkeys.add(currentThreadNote.pubkey);
      for (const t of currentThreadNote.tags || []) {
        if (t[0] === "p" && t[1]) pPubkeys.add(t[1]);
      }
      if (myUserPubkey) pPubkeys.delete(myUserPubkey);
      for (const pk of pPubkeys) {
        tags.push(["p", pk]);
      }

      const nostr = (window as any).nostr || (typeof omni !== "undefined" ? (omni as any).nostr : null);
      if (nostr) {
        let published: any;
        if (typeof nostr.publish === "function") {
          published = await nostr.publish({
            kind: 1,
            content: text,
            tags,
            created_at: Math.floor(Date.now() / 1000)
          });
        } else if (typeof nostr.signEvent === "function") {
          published = await nostr.signEvent({
            kind: 1,
            content: text,
            tags,
            created_at: Math.floor(Date.now() / 1000)
          });
          if (activeWs && activeWs.readyState === WebSocket.OPEN) {
            activeWs.send(JSON.stringify(["EVENT", published]));
          }
        }

        if (published) {
          threadReplyInput.value = "";
          const replyNote = {
            id: published.id,
            pubkey: published.pubkey,
            content: text,
            tags,
            created_at: Math.floor(Date.now() / 1000)
          };
          allKnownNotes.set(replyNote.id, replyNote);
          appendThreadReply(replyNote);
        }
      }
    } catch (err: any) {
      console.error("Failed to post reply:", err);
    } finally {
      btnThreadReply.disabled = false;
      btnThreadReply.textContent = "Reply";
    }
  });

  btnSearchOpen.addEventListener("click", () => showSearchPage(true));
  btnSearchBack.addEventListener("click", () => {
    showFeedPage();
    if (typeof window !== "undefined" && window.history.state?.omniFeedView === "search") {
      try { window.history.replaceState(null, "", window.location.href); } catch (_) {}
    }
  });

  btnSettingsOpen.addEventListener("click", () => showSettingsPage(true));
  btnSettingsBack.addEventListener("click", () => {
    showFeedPage();
    reapplyFilters();
    if (typeof window !== "undefined" && window.history.state?.omniFeedView === "settings") {
      try { window.history.replaceState(null, "", window.location.href); } catch (_) {}
    }
  });

  if (typeof window !== "undefined") {
    window.addEventListener("popstate", (e: any) => {
      const state = e.state;
      if (state?.omniFeedView === "thread" && state.noteId) {
        openThread(state.noteId, false, false);
      } else if (state?.omniFeedView === "search") {
        showSearchPage(false);
      } else if (state?.omniFeedView === "settings") {
        showSettingsPage(false);
      } else {
        if (threadPage.style.display !== "none" || searchPage.style.display !== "none" || settingsPage.style.display !== "none") {
          showFeedPage(false);
        }
      }
    });
  }

  renderFilterSettings(settingsContent, (newPatterns) => {
    filterPatterns = newPatterns;
    reapplyFilters();
  });

  function setSearchStatus(text: string, isloading = false) {
    searchResults.querySelectorAll(".search-status").forEach((el) => el.remove());
    if (!text) return;
    const el = html<HTMLDivElement>`
      <div class="search-status">
        ${isloading ? `<div class="loading-spinner"></div>` : ""}
        <span>${escapeHtml(text)}</span>
      </div>
    `;
    searchResults.appendChild(el);
  }

  function renderPeopleSection(people: Array<{ pubkey: string; meta: any }>) {
    const existing = searchResults.querySelector(".search-people-section");
    if (existing) existing.remove();
    if (people.length === 0) return;

    const section = html<HTMLDivElement>`
      <div class="search-people-section">
        <div class="search-section-title">People</div>
        <div class="search-people-list"></div>
      </div>
    `;
    const list = section.querySelector<HTMLDivElement>(".search-people-list")!;

    for (const person of people.slice(0, 8)) {
      const meta = person.meta || {};
      const name = meta.display_name || meta.name || `nostr:${person.pubkey.slice(0, 6)}`;
      const handle = meta.nip05 ? `@${meta.nip05}` : `@npub1${person.pubkey.slice(0, 6)}`;
      const about = (meta.about || "").slice(0, 120);
      let pic = String(meta.picture || "").trim();
      if (pic.startsWith("http://")) pic = pic.replace(/^http:\/\//i, "https://");
      const avatarInner = (pic && (pic.startsWith("https://") || pic.startsWith("data:image/")))
        ? `<img src="${escapeHtml(pic)}" alt="" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`
        : `<span>${escapeHtml(name[0] || "?").toUpperCase()}</span>`;

      const row = html<HTMLDivElement>`
        <div class="search-person-row" role="button" tabindex="0">
          <div class="feed-avatar" style="background: ${getAvatarGradient(person.pubkey)};">${avatarInner}</div>
          <div class="search-person-info">
            <strong class="search-person-name">${escapeHtml(name)}</strong>
            <span class="feed-author-handle">${escapeHtml(handle)}</span>
            ${about ? `<div class="search-person-about">${escapeHtml(about)}</div>` : ""}
          </div>
          <span class="search-person-open">${ICONS.user}</span>
        </div>
      `;
      row.addEventListener("click", () => dispatchViewProfile(person.pubkey));
      row.addEventListener("keydown", (e) => {
        if ((e as KeyboardEvent).key === "Enter") dispatchViewProfile(person.pubkey);
      });
      list.appendChild(row);
    }
    searchResults.insertBefore(section, searchResults.querySelector(".search-notes-section"));
  }

  function renderNotesSection(events: any[]) {
    const existing = searchResults.querySelector(".search-notes-section");
    if (existing) existing.remove();
    if (events.length === 0) return;

    const section = html<HTMLDivElement>`
      <div class="search-notes-section">
        <div class="search-section-title">Notes</div>
        <div class="search-notes-list"></div>
      </div>
    `;
    const list = section.querySelector<HTMLDivElement>(".search-notes-list")!;
    for (const ev of events.slice(0, 30)) {
      list.appendChild(buildNoteCard(ev));
    }
    searchResults.appendChild(section);
  }

  function dispatchViewProfile(pubkey: string) {
    if (!pubkey) return;
    const omni = (window as any).omni;
    if (omni?.intents?.dispatch) {
      omni.intents.dispatch("view_profile", { pubkey }).catch(() => {});
    } else if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent("intent", { detail: { action: "view_profile", data: { pubkey } } }));
    }
  }

  function matchesNote(ev: any, keyword: string, authorHexes: string[], authorTerms: string[]): boolean {
    if (keyword && keyword.trim()) {
      const terms = keyword.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const content = (ev.content || "").toLowerCase();
      if (!terms.every((term) => content.includes(term))) return false;
    }
    if (authorHexes.length > 0 && !authorHexes.includes(ev.pubkey)) return false;
    if (authorHexes.length === 0 && authorTerms.length > 0) {
      const meta = profileCache.get(ev.pubkey);
      const hay = meta ? `${meta.display_name || ""} ${meta.name || ""} ${meta.nip05 || ""}`.toLowerCase() : "";
      const matched = authorTerms.some((t) => t === ev.pubkey.slice(0, t.length) || (hay && hay.includes(t)));
      if (!matched) return false;
    }
    return true;
  }

  function localPeopleMatches(term: string): Array<{ pubkey: string; meta: any }> {
    const t = term.toLowerCase();
    const results: Array<{ pubkey: string; meta: any }> = [];
    for (const [pubkey, meta] of profileCache.entries()) {
      const hay = `${meta.display_name || ""} ${meta.name || ""} ${meta.nip05 || ""}`.toLowerCase();
      if (t && hay.includes(t)) results.push({ pubkey, meta });
    }
    return results;
  }

  function openSearchWebSocket(onReady: (ws: any) => void) {
    try {
      if (searchWs) {
        try { searchWs.close(); } catch (_) {}
      }
      const ws = new WebSocket("wss://relay.nostr.band");
      searchWs = ws;
      ws.onopen = () => onReady(ws);
      ws.onerror = () => {};
      return ws;
    } catch (_) {
      return null;
    }
  }

  function collectSubscription(ws: any, subId: string, filter: any, onEvent: (ev: any) => void, onDone: () => void) {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try { ws.send(JSON.stringify(["CLOSE", subId])); } catch (_) {}
      try { ws.close(); } catch (_) {}
      onDone();
    };
    // Hard cap for the whole subscription
    const hardTimer = setTimeout(finish, 10000);
    // The coordinator fires EOSE on the FIRST relay response; search-capable
    // indexers (e.g. relay.nostr.band) are usually slower, so wait a grace
    // period after the first EOSE before treating the result set as final.
    let eoseTimer: any = null;
    ws.onmessage = (msg: any) => {
      try {
        const data = JSON.parse(msg.data);
        const [type, sid] = data;
        if (type === "EVENT" && sid === subId && data[2]) {
          onEvent(data[2]);
        } else if (type === "EOSE" && sid === subId) {
          if (!eoseTimer) eoseTimer = setTimeout(() => {
            clearTimeout(hardTimer);
            finish();
          }, 1500);
        }
      } catch (_) {}
    };
    try {
      ws.send(JSON.stringify(["REQ", subId, filter]));
    } catch (_) {
      clearTimeout(hardTimer);
      finish();
    }
  }

  async function resolveNip05(raw: string): Promise<string | null> {
    const m = raw.trim().match(/^_?([^\s@]+)@([^\s@]+\.[^\s@]+)$/);
    if (!m) return null;
    try {
      const res = await fetch(`https://${m[2]}/.well-known/nostr.json?name=${encodeURIComponent(m[1])}`);
      if (!res.ok) return null;
      const data = await res.json();
      const pk = data?.names?.[m[1]];
      return typeof pk === "string" && /^[0-9a-fA-F]{64}$/.test(pk) ? pk.toLowerCase() : null;
    } catch (_) {
      return null;
    }
  }

  async function runSearch(rawQuery: string) {
    const query = rawQuery.trim();
    if (!query) return;
    const seq = ++searchSeq;
    const parsed = parseSearchQuery(query);
    searchChips.innerHTML = "";

    // 1. Identifier resolution: pasting npub / note / nevent / naddr / hex / NIP-05 navigates directly
    const decoded = decodeNostrEntity(query);
    const isHex = /^[0-9a-fA-F]{64}$/.test(query);
    if (decoded || isHex) {
      setSearchStatus("Opening...");
      if (decoded?.type === "npub" || decoded?.type === "nprofile" || isHex) {
        setSearchStatus("");
        dispatchViewProfile(decoded?.pubkey || decoded?.hex || query.toLowerCase());
      } else if (decoded?.type === "note" || decoded?.type === "nevent") {
        fetchNoteById(decoded.hex!, seq);
      } else if (decoded?.type === "naddr") {
        fetchNoteByAddress(decoded, seq);
      }
      return;
    }
    const nip05Match = query.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    if (nip05Match && !parsed.keyword && parsed.authors.length === 0) {
      setSearchStatus("Resolving address...");
      const pk = await resolveNip05(query);
      if (seq !== searchSeq) return;
      setSearchStatus("");
      if (pk) {
        dispatchViewProfile(pk);
      } else {
        setSearchStatus("Could not resolve that NIP-05 address.");
      }
      return;
    }

    // 2. Author filter chips
    let authorHexes: string[] = [];
    for (const term of parsed.authors) {
      const d = decodeNostrEntity(term.startsWith("@") ? term : `@${term}`);
      if (d?.hex && (d.type === "npub" || d.type === "nprofile")) {
        authorHexes.push(d.hex);
        addAuthorChip(`npub1${d.hex.slice(0, 8)}...`);
      } else {
        addAuthorChip(term);
      }
    }

    setSearchStatus("Searching local cache and relays...", true);

    // 3. Resolve author tokens to pubkeys via local profile cache
    for (const term of parsed.authors) {
      const local = localPeopleMatches(term);
      for (const p of local) {
        if (!authorHexes.includes(p.pubkey)) authorHexes.push(p.pubkey);
      }
    }

    // 4. Local results (0ms) render immediately
    const localNotes: any[] = [];
    const seenLocalIds = new Set<string>();
    for (const ev of [...timelineNotes.values(), ...allKnownNotes.values()]) {
      if (!seenLocalIds.has(ev.id) && matchesNote(ev, parsed.keyword, authorHexes, parsed.authors)) {
        seenLocalIds.add(ev.id);
        localNotes.push(ev);
      }
    }
    localNotes.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    if (seq !== searchSeq) return;
    if (localNotes.length > 0) {
      renderNotesSection(localNotes);
      if (!parsed.keyword || parsed.keyword.length === 0) setSearchStatus("");
    }

    // 5. People results: local profiles + NIP-50 kind:0 relay search
    const people = new Map<string, any>();
    for (const term of parsed.authors) {
      for (const p of localPeopleMatches(term)) people.set(p.pubkey, p.meta);
    }
    if (people.size > 0) {
      renderPeopleSection(Array.from(people.entries()).map(([pubkey, meta]) => ({ pubkey, meta })));
    }

    // 6. NIP-50 relay search (network-wide)
    const relayNotes = new Map<string, any>();
    const renderMerged = () => {
      const merged = new Map<string, any>();
      for (const ev of localNotes) merged.set(ev.id, ev);
      for (const ev of relayNotes.values()) merged.set(ev.id, ev);
      const finalNotes = Array.from(merged.values())
        .filter((ev) => matchesNote(ev, parsed.keyword, authorHexes, parsed.authors))
        .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      renderNotesSection(finalNotes);
      return finalNotes;
    };

    const ws = openSearchWebSocket((socket) => {
      let noteCount = 0;
      const relayPeople = new Map<string, any>();
      let subsPending = 1;

      const maybeFinish = () => {
        subsPending -= 1;
        if (subsPending > 0) return;
        if (seq !== searchSeq) return;
        const finalNotes = renderMerged();

        for (const ev of relayPeople.values()) {
          try {
            const meta = JSON.parse(ev.content || "{}");
            if (!people.has(ev.pubkey)) people.set(ev.pubkey, meta);
          } catch (_) {}
        }
        renderPeopleSection(Array.from(people.entries()).map(([pubkey, meta]) => ({ pubkey, meta })));

        if (finalNotes.length === 0 && people.size === 0) {
          setSearchStatus("No results. Try a keyword, @author, or paste an npub / note / nevent.");
        } else {
          setSearchStatus("");
        }
      };

      const noteFilter: any = { kinds: [1], limit: 120 };
      if (parsed.keyword) noteFilter.search = parsed.keyword;
      if (authorHexes.length > 0) noteFilter.authors = authorHexes;
      collectSubscription(socket, `search-notes-${seq}`, noteFilter, (ev) => {
        noteCount++;
        relayNotes.set(ev.id, ev);
        if (seq !== searchSeq) return;
        renderMerged();
        setSearchStatus(`Searching relays... ${noteCount} notes so far`, true);
      }, maybeFinish);

      if (parsed.authors.length > 0 && authorHexes.length === 0) {
        subsPending = 2;
        collectSubscription(socket, `search-people-${seq}`, {
          kinds: [0], search: parsed.authors[0], limit: 12
        }, (ev) => {
          relayPeople.set(ev.pubkey, ev);
        }, maybeFinish);
      }
    });
    if (!ws) {
      if (localNotes.length === 0 && people.size === 0) {
        setSearchStatus("Relay search unavailable. No local matches. Try a keyword or @author.");
      } else {
        setSearchStatus("");
      }
    }
  }

  function addAuthorChip(label: string) {
    const chip = html<HTMLSpanElement>`
      <span class="search-chip">Author: ${escapeHtml(label)}<button class="chip-remove" title="Clear author filter" aria-label="Clear author filter">&times;</button></span>
    `;
    chip.querySelector<HTMLButtonElement>(".chip-remove")?.addEventListener("click", () => {
      const remaining = searchInput.value
        .split(/\s+/)
        .filter((t) => !(t.startsWith("@") && t.slice(1) === label));
      searchInput.value = remaining.join(" ").trim();
      runSearch(searchInput.value);
    });
    searchChips.appendChild(chip);
  }

  function fetchNoteById(hexId: string, seq: number) {
    const local = timelineNotes.get(hexId);
    if (local) {
      if (seq === searchSeq) {
        setSearchStatus("");
        renderNotesSection([local]);
      }
      return;
    }
    const ws = openSearchWebSocket((socket) => {
      collectSubscription(socket, `note-${seq}`, { ids: [hexId], limit: 1 }, (ev) => {
        timelineNotes.set(ev.id, ev);
        if (ev.id === hexId && seq === searchSeq) {
          setSearchStatus("");
          renderNotesSection([ev]);
        }
      }, () => {
        if (seq !== searchSeq) return;
        if (!timelineNotes.has(hexId)) {
          setSearchStatus("Note not found in local cache or relays.");
        }
      });
    });
    if (!ws) setSearchStatus("Relay search unavailable.");
  }

  function fetchNoteByAddress(decoded: DecodedNostrEntity, seq: number) {
    const ws = openSearchWebSocket((socket) => {
      let foundEv: any = null;
      collectSubscription(
        socket,
        `addr-${seq}`,
        { kinds: [decoded.kind!], authors: [decoded.pubkey!], "#d": [decoded.identifier || ""], limit: 1 },
        (ev) => {
          foundEv = ev;
          timelineNotes.set(ev.id, ev);
        },
        () => {
          if (seq !== searchSeq) return;
          if (foundEv) {
            setSearchStatus("");
            renderNotesSection([foundEv]);
          } else {
            setSearchStatus("Addressed note not found.");
          }
        }
      );
    });
    if (!ws) setSearchStatus("Relay search unavailable.");
  }

  function triggerSearch() {
    runSearch(searchInput.value);
  }

  btnDoSearch.addEventListener("click", (e) => {
    e.preventDefault();
    triggerSearch();
  });
  searchInput.addEventListener("keydown", (e: any) => {
    if (e.key === "Enter" || e.keyCode === 13) {
      e.preventDefault();
      triggerSearch();
    }
  });
  searchInput.addEventListener("keyup", (e: any) => {
    if (e.key === "Enter" || e.keyCode === 13) {
      e.preventDefault();
      triggerSearch();
    }
  });

  // Seamless Infinite Scrolling (Load Older Notes)
  function loadOlderNotes() {
    if (isLoadingOlder || oldestTimestamp === Infinity || !activeWs || activeWs.readyState !== WebSocket.OPEN) return;
    isLoadingOlder = true;
    const olderSubId = `older-${Date.now()}`;
    activeWs.send(JSON.stringify(["REQ", olderSubId, { kinds: [1], until: oldestTimestamp - 1, limit: 25 }]));
  }

  if (sentinelEl && typeof IntersectionObserver !== "undefined") {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingOlder && oldestTimestamp !== Infinity) {
          loadOlderNotes();
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(sentinelEl);
  }

  // Publish Note Handler
  btnPublish.addEventListener("click", async () => {
    const text = textarea.value?.trim();
    if (!text) return;

    btnPublish.disabled = true;
    btnPublish.textContent = "Posting...";

    try {
      const nostr = (window as any).nostr || (typeof omni !== "undefined" ? (omni as any).nostr : null);
      if (nostr) {
        let published: any;
        if (typeof nostr.publish === "function") {
          published = await nostr.publish({
            kind: 1,
            content: text,
            tags: [["client", "omni"]],
            created_at: Math.floor(Date.now() / 1000)
          });
        } else if (typeof nostr.signEvent === "function") {
          published = await nostr.signEvent({
            kind: 1,
            content: text,
            tags: [["client", "omni"]],
            created_at: Math.floor(Date.now() / 1000)
          });
          if (activeWs && activeWs.readyState === WebSocket.OPEN) {
            activeWs.send(JSON.stringify(["EVENT", published]));
          }
        }

        if (published) {
          textarea.value = "";
          renderNote(
            {
              id: published.id,
              pubkey: published.pubkey,
              content: text,
              created_at: Math.floor(Date.now() / 1000)
            },
            true
          );
        }
      }
    } catch (err: any) {
      console.error("Failed to publish note from plugin:", err);
    } finally {
      btnPublish.disabled = false;
      btnPublish.textContent = "Post";
    }
  });

  // Subscribe to Timeline Notes via standard WebSocket
  try {
    if (typeof WebSocket !== "undefined") {
      const ws = new WebSocket("wss://relay.damus.io");
      activeWs = ws;

      ws.onopen = () => {
        if (myUserPubkey) {
          fetchFollowingList(myUserPubkey);
        }
        if (activeTab === "following" && followingPubkeys.size > 0) {
          subscribeFollowingNotes();
        } else {
          ws.send(JSON.stringify(["REQ", "feed-initial", { kinds: [1], limit: 40 }]));
        }
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
                const cards = container.querySelectorAll(`[data-author-pubkey="${ev.pubkey}"]`);
                for (const c of Array.from(cards)) {
                  const nEl = c.querySelector<HTMLElement>(".feed-author-name");
                  const hEl = c.querySelector<HTMLElement>(".feed-author-handle");
                  const aEl = c.querySelector<HTMLElement>(".feed-avatar");
                  if (nEl && (parsed.display_name || parsed.name)) {
                    nEl.textContent = parsed.display_name || parsed.name;
                  }
                  if (hEl && parsed.nip05) {
                    hEl.textContent = `@${parsed.nip05}`;
                  }
                  if (aEl && parsed.picture) {
                    let pic = String(parsed.picture).trim();
                    if (pic.startsWith("http://")) pic = pic.replace(/^http:\/\//i, "https://");
                    if (pic.startsWith("https://") || pic.startsWith("data:image/")) {
                      aEl.innerHTML = `<img src="${escapeHtml(pic)}" alt="" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                    }
                  }
                }
              } catch (_) {}
              return;
            }

            if (ev.kind === 3 && ev.pubkey === myUserPubkey) {
              for (const tag of ev.tags || []) {
                if (tag[0] === "p" && tag[1]) {
                  followingPubkeys.add(tag[1]);
                }
              }
              if (activeTab === "following") {
                renderActiveFeedTab();
                subscribeFollowingNotes();
              }
              return;
            }

            clearTimeout(initialLoadTimeout);
            allKnownNotes.set(ev.id, ev);

            // Handle thread-specific arrivals
            if (subId?.startsWith("thread_focus_")) {
              renderThreadView(ev);
              return;
            }
            if (subId?.startsWith("thread_anc_")) {
              if (currentThreadNote && (currentThreadNote.tags || []).some((t: any[]) => t[0] === "e" && t[1] === ev.id)) {
                const existing = threadAncestors.querySelector(`[data-note-id="${ev.id}"]`);
                if (!existing) {
                  const ancCard = buildNoteCard(ev);
                  ancCard.classList.add("thread-ancestor-card");
                  threadAncestors.appendChild(ancCard);
                }
              }
              return;
            }
            if (subId?.startsWith("thread_rep_")) {
              if (currentThreadNote && (ev.tags || []).some((t: any[]) => t[0] === "e" && t[1] === currentThreadNote.id)) {
                const existing = threadRepliesList.querySelector(`[data-note-id="${ev.id}"]`);
                if (!existing) {
                  const repCard = buildNoteCard(ev);
                  threadRepliesList.appendChild(repCard);
                }
              }
              return;
            }

            // If active thread view is open and incoming note is a reply to current note, append to thread
            if (currentThreadNote && (ev.tags || []).some((t: any[]) => t[0] === "e" && t[1] === currentThreadNote.id)) {
              const existing = threadRepliesList.querySelector(`[data-note-id="${ev.id}"]`);
              if (!existing) {
                const repCard = buildNoteCard(ev);
                threadRepliesList.appendChild(repCard);
              }
            }

            const isRefresh = subId?.startsWith("refresh-");
            handleIncomingEvent(ev, isRefresh);
          } else if (type === "EOSE") {
            if (subId === "feed-initial") {
              clearTimeout(initialLoadTimeout);
              if (renderedIds.size === 0) {
                if (activeTab === "following") {
                  showFollowingEmptyState();
                } else {
                  showEmptyState();
                }
              }
              // Close initial subscription to prevent continuous noisy background firehose
              ws.send(JSON.stringify(["CLOSE", "feed-initial"]));
            } else if (subId?.startsWith("older-")) {
              isLoadingOlder = false;
              ws.send(JSON.stringify(["CLOSE", subId]));
            } else if (subId?.startsWith("refresh-")) {
              btnRefresh.classList.remove("spinning");
              ws.send(JSON.stringify(["CLOSE", subId]));
              if (renderedIds.size === lastRefreshStartCount) {
                const label = btnRefresh.querySelector<HTMLElement>("span");
                if (label) {
                  const original = label.textContent;
                  label.textContent = "None new";
                  setTimeout(() => { label.textContent = original; }, 1500);
                }
              }
            }
          } else if (type === "NOTICE") {
            if (renderedIds.size === 0) {
              if (activeTab === "following") {
                showFollowingEmptyState();
              } else {
                showEmptyState();
              }
            }
          }
        } catch {}
      };

      ws.onerror = () => {
        if (renderedIds.size === 0) {
          if (activeTab === "following") {
            showFollowingEmptyState();
          } else {
            showEmptyState();
          }
        }
      };

    } else if (typeof omni !== "undefined" && (omni as any).nostr?.subscribe) {
      (omni as any).nostr.subscribe(
        [{ kinds: [1], limit: 40 }],
        (ev: any) => {
          clearTimeout(initialLoadTimeout);
          handleIncomingEvent(ev);
        },
        () => {
          clearTimeout(initialLoadTimeout);
          if (renderedIds.size === 0) {
            showEmptyState();
          }
        }
      );
    }
  } catch (err) {
    console.error("Feed subscription failed:", err);
  }

  const handleIncomingIntent = (action: string, data: any) => {
    if (action === "create_note" || action === "compose_note") {
      showFeedPage();
      const text = data?.text || data?.content || "";
      if (text) {
        textarea.value = text;
      }
      textarea.focus();
    } else if (action === "view_note") {
      const noteId = data?.eventId || data?.id;
      if (noteId) {
        openThread(noteId);
      }
    } else if (action === "search") {
      showSearchPage(data?.query);
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("intent", (e: any) => {
      const detail = e.detail;
      if (detail && detail.action) {
        handleIncomingIntent(detail.action, detail.data);
      }
    });
    window.addEventListener("omni:intent", (e: any) => {
      const detail = e.detail;
      if (detail && detail.action) {
        handleIncomingIntent(detail.action, detail.data);
      }
    });
  }

  const omniRef = (window as any).omni;
  if (omniRef?.intents?.registerHandler) {
    omniRef.intents.registerHandler("create_note", async (data: any) => {
      handleIncomingIntent("create_note", data);
      return { handled: true };
    });
    omniRef.intents.registerHandler("compose_note", async (data: any) => {
      handleIncomingIntent("compose_note", data);
      return { handled: true };
    });
    omniRef.intents.registerHandler("view_note", async (data: any) => {
      handleIncomingIntent("view_note", data);
      return { handled: true };
    });
    omniRef.intents.registerHandler("search", async (data: any) => {
      handleIncomingIntent("search", data);
      return { handled: true };
    });
  }

  try {
    const savedNoteId = localStorage.getItem("omni_active_note_id");
    if (savedNoteId) {
      localStorage.removeItem("omni_active_note_id");
      setTimeout(() => {
        handleIncomingIntent("view_note", { eventId: savedNoteId });
      }, 300);
    }
  } catch (_) {}

  return {
    showSearchPage,
    showSettingsPage,
    showFeedPage,
    showThreadPage,
    openThread,
    switchFeedTab,
    getActiveTab: () => activeTab,
    getFollowingPubkeys: () => followingPubkeys,
    reapplyFilters
  };
}

export function getAppRoute(): string {
  if (typeof window === "undefined") return "";
  try {
    if (window.location?.search && window.location.search !== "") {
      return window.location.search;
    }
    if (window.location?.hash && window.location.hash !== "") {
      return window.location.hash;
    }
    if ((window as any).__OMNI_ROUTE__) {
      return String((window as any).__OMNI_ROUTE__);
    }
    if ((window as any).__OMNI_SEARCH__) {
      return String((window as any).__OMNI_SEARCH__);
    }
    if ((window as any).__OMNI_VIEW__) {
      return `?view=${(window as any).__OMNI_VIEW__}`;
    }
  } catch (_) {}
  return "";
}

export function isSearchRoute(): boolean {
  try {
    const route = getAppRoute();
    if (!route) return false;
    const qIdx = route.indexOf("?");
    const query = qIdx !== -1 ? route.slice(qIdx) : route;
    const params = new URLSearchParams(query);
    if (params.get("view") === "search") return true;
    if (route.includes("view=search") || route === "search") return true;
  } catch (_) {}
  return false;
}

export function isSettingsRoute(): boolean {
  try {
    const route = getAppRoute();
    if (!route) return false;
    const qIdx = route.indexOf("?");
    const query = qIdx !== -1 ? route.slice(qIdx) : route;
    const params = new URLSearchParams(query);
    if (params.get("view") === "settings") return true;
    if (route.includes("view=settings") || route.includes("settings")) return true;
  } catch (_) {}
  return false;
}

export function mountFeedSettings(root: any) {
  const container = html<HTMLDivElement>`
    <div class="feed-standalone-settings" style="padding: 16px 20px; font-family: inherit; color: var(--text-primary, #ede8df);">
      <div class="feed-settings-content"></div>
    </div>
  `;
  const content = container.querySelector<HTMLDivElement>(".feed-settings-content")!;
  renderFilterSettings(content);
  root.appendChild(container);
  return container;
}

function init() {
  if (typeof document !== "undefined") {
    const root = document.body;
    if (isSettingsRoute()) {
      mountFeedSettings(root);
    } else {
      const feed = mountFeed(root);
      if (isSearchRoute()) {
        feed.showSearchPage();
      }
    }
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
