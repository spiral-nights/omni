function emit(post, rawUrl, rpc) {
  if (typeof rpc === "function") {
    try {
      rpc("kernel.handleUri", { uri: String(rawUrl) });
    } catch (_) {}
  } else if (typeof post === "function") {
    post(String(rawUrl));
  }
}

const PROTOCOL_PREFIXES = ["nostr:", "lightning:", "cashu:"];

export function install(post, rpc) {
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
        emit(post, href, rpc);
      },
      true,
    );
  }

  if (typeof window !== "undefined") {
    const nativeOpen = window.open;
    window.open = (url, ...rest) => {
      const lower = String(url || "").toLowerCase().trim();
      if (PROTOCOL_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
        emit(post, url, rpc);
        return null;
      }
      return nativeOpen.call(window, url, ...rest);
    };
  }
}
