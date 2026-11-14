export function install(post, rpc) {
  if (typeof navigator === "undefined") return;
  const message = (data) => {
    const payload = {
      type: "omni:share",
    };
    if (data && data.title) payload.title = String(data.title);
    if (data && data.text) payload.text = String(data.text);
    if (data && data.url) payload.url = String(data.url);
    if (typeof rpc === "function") {
      const shareParams = {};
      if (payload.title) shareParams.title = payload.title;
      if (payload.text) shareParams.text = payload.text;
      if (payload.url) shareParams.url = payload.url;
      try {
        rpc("kernel.handleShare", shareParams);
      } catch (_) {}
    } else if (typeof post === "function") {
      post(JSON.stringify(payload));
    }
    return Promise.resolve();
  };
  try {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: message,
    });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
  } catch {
    navigator.share = message;
  }
}
