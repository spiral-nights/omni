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
import { Some } from "../../../gleam_stdlib/gleam/option.mjs";

export function mount_dom(selector, init, update, view, parse_url, page_url) {
  let lastUrl = null;

  const syncHistory = (model, replace) => {
    const url = page_url(model);
    if (!url || url === lastUrl) return;
    lastUrl = url;
    if (replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
  };

  const wrappedInit = (flags) => {
    const pair = init(flags);
    syncHistory(pair[0], true);
    return pair;
  };

  const wrappedUpdate = (model, message) => {
    const pair = update(model, message);
    syncHistory(pair[0], false);
    return pair;
  };

  const result = start(
    { init: wrappedInit, update: wrappedUpdate, view },
    selector,
    undefined,
  );

  if (result && typeof result.isOk === "function" && !result.isOk()) {
    const error = result[0];
    throw new Error(
      error && error.constructor ? error.constructor.name : "mount failed",
    );
  }

  const spa = result && result.isOk ? result[0] : null;

  window.addEventListener("popstate", () => {
    if (!spa) return;
    const raw = `${window.location.pathname}${window.location.search}`;
    const message = parse_url(raw);
    if (message instanceof Some) {
      lastUrl = `${window.location.pathname}${window.location.search}`;
      spa.dispatch(message[0]);
    }
  });
}
