export function open_external(url) {
  if (typeof window === "undefined") return;
  try {
    const opened = window.open(String(url), "_blank", "noopener,noreferrer");
    if (!opened) window.location.href = String(url);
  } catch {
    window.location.href = String(url);
  }
}
