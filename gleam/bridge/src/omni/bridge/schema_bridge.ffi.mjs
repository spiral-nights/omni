export function emit_schema(wireJson) {
  const payload = { type: "omni:schema", wire: String(wireJson) };
  if (typeof window !== "undefined" && window.parent && window.parent !== window) {
    window.parent.postMessage(payload, "*");
  }
  if (typeof window !== "undefined" && window.__omniChannelPort) {
    window.__omniChannelPort.postMessage(payload);
  }
}

export function install_actions(onAction) {
  if (typeof window === "undefined") return;
  window.addEventListener("message", (event) => {
    const data = event?.data;
    if (!data || typeof data !== "object") return;
    if (data.type !== "omni:action") return;
    if (typeof onAction === "function") onAction(JSON.stringify(data));
  });
}
