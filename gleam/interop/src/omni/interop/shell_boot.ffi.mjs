function resolveHost(selector) {
  if (typeof document === "undefined") return null;
  return document.querySelector(selector);
}

export function mount_island(selector, srcdoc, pluginId, onRpc) {
  const host = resolveHost(selector);
  if (!host) return;
  host.innerHTML = "";
  const iframe = document.createElement("iframe");
  iframe.className = "omni-sandbox-iframe";
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.setAttribute("allow", "clipboard-read; clipboard-write");
  iframe.setAttribute("title", "Omni plugin");

  const schemaChannel = new MessageChannel();
  const rpcChannel = new MessageChannel();

  rpcChannel.port1.onmessage = (event) => {
    if (typeof onRpc !== "function") return;
    let raw;
    try {
      raw = JSON.stringify(event.data);
    } catch {
      return;
    }
    onRpc(raw, (responseJson) => {
      try {
        rpcChannel.port1.postMessage(JSON.parse(responseJson));
      } catch {
        rpcChannel.port1.postMessage({
          jsonrpc: "2.0",
          id: event.data && event.data.id,
          error: { code: -32603, message: "Invalid response" },
        });
      }
    });
  };

  iframe.addEventListener("load", () => {
    const target = iframe.contentWindow;
    if (!target) return;
    target.postMessage(
      { type: "omni:init", payload: { pluginId: String(pluginId) } },
      "*",
      [schemaChannel.port2, rpcChannel.port2],
    );
  });

  iframe.srcdoc = String(srcdoc);
  host.appendChild(iframe);
}

export function island_mounted(selector) {
  const host = resolveHost(selector);
  return Boolean(host && host.querySelector("iframe.omni-sandbox-iframe"));
}

export function unmount_island(selector) {
  const host = resolveHost(selector);
  if (!host) return;
  host.innerHTML = "";
}

import { start } from "../../../lustre/lustre/runtime/client/spa.ffi.mjs";
import { Some } from "../../../gleam_stdlib/gleam/option.mjs";

export function mount_dom(selector, init, update, view, parse_url, page_url, pull_start) {
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
  if (spa) window.__omniShellDispatch = (message) => spa.dispatch(message);

  if (spa) {
    let startY = null;
    let fired = false;
    const reset = () => {
      startY = null;
      fired = false;
    };
    document.addEventListener(
      "touchstart",
      (e) => {
        if (!e.touches || e.touches.length !== 1) return;
        startY = (window.scrollY || 0) <= 1 ? e.touches[0].clientY : null;
        fired = false;
      },
      { passive: true },
    );
    document.addEventListener(
      "touchmove",
      (e) => {
        if (startY === null || fired || !e.touches || !e.touches.length) return;
        if (e.touches[0].clientY - startY >= 72) {
          fired = true;
          spa.dispatch(pull_start);
        }
      },
      { passive: true },
    );
    document.addEventListener("touchend", reset, { passive: true });
    document.addEventListener("touchcancel", reset, { passive: true });
  }

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


export function dispatch_shell_msg(message) {
  if (typeof window !== "undefined" && typeof window.__omniShellDispatch === "function") {
    window.__omniShellDispatch(message);
  }
}

export function after_render(callback) {
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    if (typeof callback === "function") callback();
  }, 60);
}
