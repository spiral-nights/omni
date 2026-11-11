function resolveHost(selector) {
  if (typeof document === "undefined") return null;
  return document.querySelector(selector);
}

export function mount_island(selector, srcdoc) {
  const host = resolveHost(selector);
  if (!host) return;
  host.innerHTML = "";
  const iframe = document.createElement("iframe");
  iframe.className = "omni-sandbox-iframe";
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.setAttribute("allow", "clipboard-read; clipboard-write");
  iframe.setAttribute("title", "Omni plugin");
  iframe.srcdoc = String(srcdoc);
  host.appendChild(iframe);
}

export function unmount_island(selector) {
  const host = resolveHost(selector);
  if (!host) return;
  host.innerHTML = "";
}

import { start } from "../../../lustre/lustre/runtime/client/spa.ffi.mjs";

export function mount_dom(selector, init, update, view) {
  const result = start({ init, update, view }, selector, undefined);
  if (result && typeof result.isOk === "function" && !result.isOk()) {
    const error = result[0];
    throw new Error(
      error && error.constructor ? error.constructor.name : "mount failed",
    );
  }
}
