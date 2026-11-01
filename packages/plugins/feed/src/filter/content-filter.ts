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
