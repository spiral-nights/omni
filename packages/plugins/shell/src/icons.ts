// Minimalist Monochrome SVG Line Icon Library for Omni Shell (Warm Paper Dark Aesthetic)

export type IconName =
  | "feed"
  | "widgets"
  | "plugins"
  | "settings"
  | "user"
  | "profile"
  | "timer"
  | "close"
  | "reply"
  | "like"
  | "trash"
  | "plus"
  | "copy"
  | "check"
  | "relay"
  | "key"
  | "bolt"
  | "layout"
  | "external"
  | "eye"
  | "sliders"
  | "move"
  | "cloud"
  | "sun"
  | "weather"
  | "refresh"
  | "upload"
  | "download"
  | "chevron-down"
  | "chevron-up"
  | "chevron-left"
  | "chevron-right"
  | "grid"
  | "apps"
  | "pin"
  | "help-circle"
  | "arrow-left"
  | "arrow-up"
  | "search"
  | "more"
  | "check-circle"
  | "relays"
  | "users"
  | "windows"
  | "star"
  | "sparkle"
  | "sparkles";

export const ICONS: Record<IconName, string> = {
  "arrow-left": `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/>
    <polyline points="12 19 5 12 12 5"/>
  </svg>`,

  "arrow-up": `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="19" x2="12" y2="5"/>
    <polyline points="5 12 12 5 19 12"/>
  </svg>`,

  search: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>`,

  more: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
    <circle cx="19" cy="12" r="1.5" fill="currentColor"/>
    <circle cx="5" cy="12" r="1.5" fill="currentColor"/>
  </svg>`,

  windows: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="7" height="7"/>
    <rect x="14" y="3" width="7" height="7"/>
    <rect x="14" y="14" width="7" height="7"/>
    <rect x="3" y="14" width="7" height="7"/>
  </svg>`,

  apps: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5"/>
    <rect x="14" y="3" width="7" height="7" rx="1.5"/>
    <rect x="14" y="14" width="7" height="7" rx="1.5"/>
    <rect x="3" y="14" width="7" height="7" rx="1.5"/>
  </svg>`,

  grid: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5"/>
    <rect x="14" y="3" width="7" height="7" rx="1.5"/>
    <rect x="14" y="14" width="7" height="7" rx="1.5"/>
    <rect x="3" y="14" width="7" height="7" rx="1.5"/>
  </svg>`,

  pin: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="17" x2="12" y2="22"/>
    <path d="M5 17h14l-2-7V4H7v6l-2 7z"/>
  </svg>`,

  "help-circle": `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>`,

  cloud: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
  </svg>`,

  sun: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="4.5"/>
    <line x1="12" y1="2" x2="12" y2="4.5"/>
    <line x1="12" y1="19.5" x2="12" y2="22"/>
    <line x1="4.93" y1="4.93" x2="6.7" y2="6.7"/>
    <line x1="17.3" y1="17.3" x2="19.07" y2="19.07"/>
    <line x1="2" y1="12" x2="4.5" y2="12"/>
    <line x1="19.5" y1="12" x2="22" y2="12"/>
    <line x1="4.93" y1="19.07" x2="6.7" y2="17.3"/>
    <line x1="17.3" y1="6.7" x2="19.07" y2="4.93"/>
  </svg>`,

  weather: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2v2"/>
    <path d="M4.93 4.93l1.41 1.41"/>
    <path d="M20 12h2"/>
    <path d="M19.07 4.93l-1.41 1.41"/>
    <path d="M15.5 8.5a4 4 0 0 0-4-4 4 4 0 0 0-3.8 2.7"/>
    <path d="M7 16a4 4 0 0 1 0-8 4.2 4.2 0 0 1 3.5 1.9A5 5 0 0 1 20 13a4.5 4.5 0 0 1-4.5 4.5H7z"/>
  </svg>`,

  refresh: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="23 4 23 10 17 10"/>
    <polyline points="1 20 1 14 7 14"/>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
  </svg>`,

  upload: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>`,

  download: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>`,
  feed: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    <line x1="8" y1="9" x2="16" y2="9"/>
    <line x1="8" y1="13" x2="13" y2="13"/>
  </svg>`,

  widgets: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="18" height="7" rx="1.5"/>
    <line x1="7" y1="6.5" x2="13" y2="6.5"/>
    <rect x="3" y="13" width="8" height="8" rx="1.5"/>
    <rect x="13" y="13" width="8" height="8" rx="1.5"/>
  </svg>`,

  plugins: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 4h4a2 2 0 0 1 2 2v4a1 1 0 0 0 1 1 2 2 0 0 1 0 4 1 1 0 0 0-1 1v4a2 2 0 0 1-2 2h-4a1 1 0 0 0-1-1 2 2 0 0 1-4 0 1 1 0 0 0-1 1H4a2 2 0 0 1-2-2v-4a1 1 0 0 0 1-1 2 2 0 0 1 0-4 1 1 0 0 0-1-1V6a2 2 0 0 1 2-2h4a1 1 0 0 0 1 1 2 2 0 0 1 4 0 1 1 0 0 0 1-1z"/>
  </svg>`,

  settings: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>`,

  user: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>`,

  users: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>`,

  profile: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>`,

  timer: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="13" r="8"/>
    <path d="M12 9v4l2 2"/>
    <path d="M5 3L2 6"/>
    <path d="M22 6l-3-3"/>
    <path d="M10 2h4"/>
  </svg>`,

  close: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`,

  reply: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="9 17 4 12 9 7"/>
    <path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
  </svg>`,

  like: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>`,

  trash: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>`,

  plus: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>`,

  copy: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>`,

  check: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>`,

  "check-circle": `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="16 9 10.5 15 8 12.5"/>
  </svg>`,

  relay: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4.93 4.93a10 10 0 0 1 14.14 0"/>
    <path d="M7.76 7.76a6 6 0 0 1 8.48 0"/>
    <circle cx="12" cy="12" r="2"/>
    <path d="M12 14v7"/>
  </svg>`,

  relays: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4.93 4.93a10 10 0 0 1 14.14 0"/>
    <path d="M7.76 7.76a6 6 0 0 1 8.48 0"/>
    <circle cx="12" cy="12" r="2"/>
    <path d="M12 14v7"/>
  </svg>`,

  key: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 2l-2 2m-1.5 1.5L16 7l-2-2-1.5 1.5M16 10l-4 4m0 0l-1.5-1.5M12 14l-2 2m0 0A6 6 0 1 1 5.34 5.34a6 6 0 0 1 8.49 8.49z"/>
  </svg>`,

  bolt: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>`,

  external: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
    <polyline points="15 3 21 3 21 9"/>
    <line x1="10" y1="14" x2="21" y2="3"/>
  </svg>`,

  layout: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
    <line x1="3" y1="9" x2="21" y2="9"/>
    <line x1="9" y1="21" x2="9" y2="9"/>
  </svg>`,

  eye: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>`,

  sliders: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <line x1="4" y1="21" x2="4" y2="14"/>
    <line x1="4" y1="10" x2="4" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="12"/>
    <line x1="12" y1="8" x2="12" y2="3"/>
    <line x1="20" y1="21" x2="20" y2="16"/>
    <line x1="20" y1="12" x2="20" y2="3"/>
    <line x1="1" y1="14" x2="7" y2="14"/>
    <line x1="9" y1="8" x2="15" y2="8"/>
    <line x1="17" y1="16" x2="23" y2="16"/>
  </svg>`,

  move: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="5 9 2 12 5 15"/>
    <polyline points="9 5 12 2 15 5"/>
    <polyline points="15 19 12 22 9 19"/>
    <polyline points="19 9 22 12 19 15"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <line x1="12" y1="2" x2="12" y2="22"/>
  </svg>`,

  "chevron-down": `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>`,

  "chevron-up": `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="18 15 12 9 6 15"/>
  </svg>`,

  "chevron-left": `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>`,

  "chevron-right": `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>`,

  star: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>`,

  sparkle: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2C12 7.523 16.477 12 22 12C16.477 12 12 16.477 12 22C12 16.477 7.523 12 2 12C7.523 12 12 7.523 12 2Z"/>
  </svg>`,

  sparkles: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3c0 4.5 3.5 8 8 8-4.5 0-8 3.5-8 8 0-4.5-3.5-8-8-8 4.5 0 8-3.5 8-8z"/>
    <path d="M19 17c0 2 1.5 3.5 3.5 3.5-2 0-3.5 1.5-3.5 3.5 0-2-1.5-3.5-3.5-3.5 2 0 3.5-1.5 3.5-3.5z"/>
  </svg>`
};

export function icon(name: IconName, size = 18, className = ""): string {
  const svg = ICONS[name] || "";
  const cls = className ? `omni-icon ${className}` : "omni-icon";
  return `<span class="${cls}" style="display: inline-flex; align-items: center; justify-content: center; width: ${size}px; height: ${size}px; vertical-align: middle;">${svg}</span>`;
}

/**
 * Renders a plugin's icon whether it's an emoji (⭐, ✨), an SVG string,
 * an icon key from ICONS, or an image URL.
 */
export function renderPluginIcon(
  rawIcon?: string,
  size = 18,
  className = "",
  pluginIdentifier?: string
): string {
  let iconValue = (rawIcon || "").trim();

  // If missing or generic, check if the plugin identifier suggests starbright
  if (!iconValue || iconValue === "apps" || iconValue === "widgets" || iconValue === "globe") {
    if (pluginIdentifier && pluginIdentifier.toLowerCase().includes("starbright")) {
      iconValue = "✨";
    }
  }

  if (!iconValue) {
    return icon("apps", size, className);
  }

  // 1. Direct SVG markup
  if (iconValue.startsWith("<svg") && iconValue.includes("</svg>")) {
    const cls = className ? `omni-icon ${className}` : "omni-icon";
    return `<span class="${cls}" style="display: inline-flex; align-items: center; justify-content: center; width: ${size}px; height: ${size}px; vertical-align: middle;">${iconValue}</span>`;
  }

  // 2. Image URL / data URI
  if (
    iconValue.startsWith("data:image/") ||
    iconValue.startsWith("http://") ||
    iconValue.startsWith("https://") ||
    iconValue.startsWith("blob:") ||
    /\.(png|jpg|jpeg|svg|webp|ico)$/i.test(iconValue)
  ) {
    const cls = className ? `omni-icon-img ${className}` : "omni-icon-img";
    return `<img src="${iconValue}" class="${cls}" style="width: ${size}px; height: ${size}px; object-fit: contain; vertical-align: middle;" alt="app icon" />`;
  }

  // 3. Known key in ICONS
  if (ICONS[iconValue as IconName]) {
    return icon(iconValue as IconName, size, className);
  }

  // 3b. Common icon name aliases
  if (iconValue === "star" || iconValue === "star-outline") return icon("star", size, className);
  if (iconValue === "sparkle" || iconValue === "sparkles") return icon("sparkle", size, className);
  if (iconValue === "feed" || iconValue === "rss") return icon("feed", size, className);
  if (iconValue === "profile" || iconValue === "user") return icon("user", size, className);
  if (iconValue === "relays" || iconValue === "relay") return icon("relay", size, className);
  if (iconValue === "sun" || iconValue === "sunny") return icon("sun", size, className);
  if (iconValue === "cloud" || iconValue === "cloudy") return icon("cloud", size, className);
  if (iconValue === "weather") return icon("weather", size, className);

  // 4. Unicode Emoji (e.g. ✨, ⭐, 🌟, 💫, 🚀, etc.)
  const isEmoji =
    /\p{Extended_Pictographic}/u.test(iconValue) ||
    /[\u2600-\u27BF\u{1F300}-\u{1F9FF}]/u.test(iconValue);
  if (isEmoji) {
    const cls = className ? `omni-icon-emoji ${className}` : "omni-icon-emoji";
    const fontSize = Math.max(14, Math.round(size * 0.9));
    return `<span class="${cls}" style="display: inline-flex; align-items: center; justify-content: center; width: ${size}px; height: ${size}px; font-size: ${fontSize}px; line-height: 1; vertical-align: middle; user-select: none;">${iconValue}</span>`;
  }

  // Default fallback
  return icon("apps", size, className);
}
