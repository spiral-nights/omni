import { ICON_INNER_SVGS } from "@omni/core";

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

const iconMap: Partial<Record<IconName, string>> = {};
for (const [key, inner] of Object.entries(ICON_INNER_SVGS)) {
  iconMap[key as IconName] = `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

export const ICONS: Record<IconName, string> = iconMap as Record<IconName, string>;

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
