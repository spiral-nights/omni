function resolveHost(selector) {
  if (typeof document === "undefined") return null;
  return document.querySelector(selector);
}

const islandHosts = new Map();
const workerHosts = new Map();

export function mount_island(selector, srcdoc, pluginId, onRpc, onSchema) {
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

  schemaChannel.port1.onmessage = (event) => {
    if (typeof onSchema !== "function") return;
    try {
      onSchema(JSON.stringify(event.data));
    } catch (_) {
      // Ignore malformed schema messages.
    }
  };

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
  islandHosts.set(String(pluginId), { iframe });
}

export function mount_worker(selector, script, pluginId, onRpc, onSchema) {
  const host = resolveHost(selector);
  if (!host) return;
  host.innerHTML = "";
  const parentShim =
    "self.window = self; self.top = self;" +
    "self.parent = { postMessage: function (message) { self.postMessage(message); } };\n";
  const blob = new Blob([parentShim, String(script)], {
    type: "text/javascript",
  });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  const schemaChannel = new MessageChannel();
  const rpcChannel = new MessageChannel();
  const deliverSchema = (data) => {
    if (typeof onSchema !== "function") return;
    try {
      onSchema(JSON.stringify(data));
    } catch (_) {
      // Ignore malformed schema messages.
    }
  };
  schemaChannel.port1.onmessage = (event) => deliverSchema(event.data);
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
  worker.onmessage = (event) => {
    const data = event && event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "omni:schema" || data.type === "omni:action") {
      deliverSchema(data);
    }
  };
  worker.postMessage(
    { type: "omni:init", payload: { pluginId: String(pluginId) } },
    [schemaChannel.port2, rpcChannel.port2],
  );
  workerHosts.set(String(pluginId), { worker, url });
}

export function send_plugin_action(pluginId, actionJson) {
  let payload;
  try {
    payload = JSON.parse(actionJson);
  } catch {
    return;
  }
  const workerEntry = workerHosts.get(String(pluginId));
  if (workerEntry && workerEntry.worker) {
    workerEntry.worker.postMessage({ type: "omni:action", action: payload });
    return;
  }
  const island = islandHosts.get(String(pluginId));
  if (island && island.iframe && island.iframe.contentWindow) {
    island.iframe.contentWindow.postMessage(
      { type: "omni:action", action: payload },
      "*",
    );
  }
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

export function unmount_worker(pluginId) {
  const entry = workerHosts.get(String(pluginId));
  if (!entry) return;
  try {
    entry.worker.terminate();
  } catch (_) {}
  try {
    URL.revokeObjectURL(entry.url);
  } catch (_) {}
  workerHosts.delete(String(pluginId));
}

import { start } from "../../../lustre/lustre/runtime/client/spa.ffi.mjs";
import { Some } from "../../../gleam_stdlib/gleam/option.mjs";

export function mount_dom(
  selector,
  init,
  update,
  view,
  parse_page,
  sync_msg,
  page_url,
  pull_start,
) {
  const currentSearch = () => window.location.search || "";
  let historyIndex = 0;

  const readIndex = (state) =>
    state && typeof state.omniIndex === "number" ? state.omniIndex : null;

  // Compare against the live address bar rather than a cached copy: after a
  // `popstate` the model already describes the URL, so re-pushing it would
  // silently append history entries and make Back appear broken.
  const syncHistory = (model, replace) => {
    const url = page_url(model);
    if (!url || url === currentSearch()) return;
    if (replace) window.history.replaceState({ omniIndex: historyIndex }, "", url);
    else {
      historyIndex += 1;
      window.history.pushState({ omniIndex: historyIndex }, "", url);
    }
  };

  const wrappedInit = (flags) => {
    const booted = window.history.state;
    const restored = readIndex(booted);
    if (restored !== null) historyIndex = restored;
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
        if (e.touches[0].clientY - startY >= 50) {
          fired = true;
          spa.dispatch(pull_start);
        }
      },
      { passive: true },
    );
    document.addEventListener("touchend", reset, { passive: true });
    document.addEventListener("touchcancel", reset, { passive: true });
  }

  window.addEventListener("popstate", (event) => {
    if (!spa) return;
    const target = readIndex(event && event.state);
    const backward = target === null ? true : target < historyIndex;
    if (target !== null) historyIndex = target;
    const raw = `${window.location.pathname}${window.location.search}`;
    const page = parse_page(raw);
    if (page instanceof Some) spa.dispatch(sync_msg(page[0], backward));
  });
}

export function history_back() {
  if (typeof window === "undefined") return;
  window.history.back();
}


export function start_interval(ms, callback) {
  if (typeof window === "undefined") return;
  window.setInterval(() => {
    try {
      callback();
    } catch (_error) {
      // Never let a tick callback break the interval loop.
    }
  }, ms);
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

function optionValue(value) {
  return value instanceof Some ? value[0] : undefined;
}

export function host_share(title, text, url) {
  if (typeof navigator === "undefined") return;
  const payload = {
    title: optionValue(title),
    text: optionValue(text),
    url: optionValue(url),
  };
  if (typeof navigator.share === "function") {
    navigator.share(payload).catch(() => {});
    return;
  }
  const combined = [payload.text, payload.url].filter(Boolean).join(" ");
  if (combined && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(combined).catch(() => {});
  }
}

export function apply_document_theme(themeMode, accentCss) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!root) return;
  root.setAttribute("data-theme-mode", String(themeMode || "dark"));
  root.setAttribute("style", String(accentCss || ""));
}

export function listen_shell_scroll(onChange) {
  if (typeof document === "undefined") return;
  let lastY = 0;
  let lastDown = null;
  let lastAtTop = null;
  document.addEventListener(
    "scroll",
    (event) => {
      const target = event.target;
      const y =
        target && typeof target.scrollTop === "number"
          ? target.scrollTop
          : window.scrollY || 0;
      const down = y > lastY;
      const atTop = y <= 24;
      lastY = y;
      if (down !== lastDown || atTop !== lastAtTop) {
        lastDown = down;
        lastAtTop = atTop;
        onChange(atTop, down);
      }
    },
    true,
  );
}

export function listen_escape(onEscape) {
  if (typeof document === "undefined") return;
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") onEscape();
  });
}

export function scroll_shell_top() {
  if (typeof document === "undefined") return;
  const target =
    document.querySelector(".editorial-viewport-page.active") ||
    document.scrollingElement ||
    document.documentElement;
  if (target && typeof target.scrollTo === "function") {
    target.scrollTo({ top: 0, behavior: "smooth" });
  }
  if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}
