function emit(post, rawUrl) {
  if (typeof post === "function") post(String(rawUrl));
}

const PROTOCOL_PREFIXES = ["nostr:", "lightning:", "cashu:"];

export function install(post) {
  if (typeof document !== "undefined") {
    document.addEventListener(
      "click",
      (event) => {
        const anchor = event.target?.closest?.("a[href]");
        if (!anchor) return;
        const href = anchor.getAttribute("href") || "";
        const lower = href.toLowerCase().trim();
        if (!PROTOCOL_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
          return;
        }
        event.preventDefault();
        emit(post, href);
      },
      true,
    );
  }

  if (typeof window !== "undefined") {
    const nativeOpen = window.open;
    window.open = (url, ...rest) => {
      const lower = String(url || "").toLowerCase().trim();
      if (PROTOCOL_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
        emit(post, url);
        return null;
      }
      return nativeOpen.call(window, url, ...rest);
    };
  }
}
