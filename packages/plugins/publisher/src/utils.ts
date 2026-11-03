export function escapeHtml(str: string): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "Recent";
  try {
    return new Date(seconds * 1000).toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  } catch {
    return "Recent";
  }
}
