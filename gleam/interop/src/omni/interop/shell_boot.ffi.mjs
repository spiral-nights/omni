function resolveHost(selector) {
  if (typeof document === "undefined" || !selector) return null;
  const raw = String(selector);
  if (raw.startsWith("#") && !/[\s\[>,+~:]/.test(raw)) {
    const byId = document.getElementById(raw.slice(1));
    if (byId) return byId;
  }
  try {
    return document.querySelector(raw);
  } catch (_) {
    return document.getElementById(raw.startsWith("#") ? raw.slice(1) : raw);
  }
}

const islandHosts = new Map();
const workerHosts = new Map();
const wasmHosts = new Map();

function decodeWasmBytes(content) {
  let raw = String(content || "").trim();
  if (raw.startsWith("data:application/wasm;base64,")) {
    raw = raw.slice("data:application/wasm;base64,".length);
  }
  if (raw.startsWith("AGFzbQ") || !raw.startsWith("\0asm")) {
    try {
      const binary = atob(raw);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    } catch (_) {}
  }
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) & 0xff;
  return bytes;
}

class WasmHostInstance {
  constructor({ pluginId, wasmBytes, userPubkey, onSchema, onRpc }) {
    this.pluginId = pluginId;
    this.wasmBytes = wasmBytes;
    this.userPubkey = userPubkey || "";
    this.onSchema = onSchema;
    this.onRpc = onRpc;
    this.instance = null;
    this.memory = null;
    this.bumpPointer = 0;
    this.destroyed = false;
  }

  async boot() {
    const importObject = this.createImportObject();
    const module = await WebAssembly.compile(this.wasmBytes);
    this.instance = await WebAssembly.instantiate(module, importObject);
    this.memory = this.instance.exports.memory || this.memory;
    this.invokeInit();
  }

  createImportObject() {
    this.memory = new WebAssembly.Memory({ initial: 2, maximum: 256 });
    const readString = (ptr, len) => {
      if (!this.memory) return "";
      const slice = new Uint8Array(this.memory.buffer, ptr, len);
      return new TextDecoder("utf-8").decode(slice);
    };

    const deliverSchema = (jsonStr) => {
      if (typeof this.onSchema === "function") {
        try {
          this.onSchema(jsonStr);
        } catch (_) {}
      }
    };

    return {
      ui: {
        render: (viewPtr, viewLen) => deliverSchema(readString(viewPtr, viewLen)),
        "render-component": (_compIdPtr, _compIdLen, viewPtr, viewLen) => {
          deliverSchema(readString(viewPtr, viewLen));
        },
        omni_ui_render: (viewPtr, viewLen) => deliverSchema(readString(viewPtr, viewLen)),
      },
      nostr: {
        "get-public-key": (retPtr) => {
          this.writeStringToReturnPtr(retPtr, this.userPubkey);
        },
        omni_nostr_get_public_key: (retPtr) => {
          this.writeStringToReturnPtr(retPtr, this.userPubkey);
        },
      },
      wasi_snapshot_preview1: {
        fd_write: (_fd, iovs, iovsLen, nwritten) => {
          if (!this.memory) return 0;
          let total = 0;
          const view = new DataView(this.memory.buffer);
          let outStr = "";
          for (let i = 0; i < iovsLen; i++) {
            const ptr = view.getUint32(iovs + i * 8, true);
            const len = view.getUint32(iovs + i * 8 + 4, true);
            const slice = new Uint8Array(this.memory.buffer, ptr, len);
            outStr += new TextDecoder("utf-8").decode(slice);
            total += len;
          }
          if (nwritten) view.setUint32(nwritten, total, true);
          const trimmed = outStr.trim();
          if (
            (trimmed.startsWith("{") && trimmed.includes('"type"')) ||
            (trimmed.startsWith("[") && trimmed.includes('"type"'))
          ) {
            deliverSchema(trimmed);
          } else {
            console.log(`[WasmGuestHost:${this.pluginId}]`, outStr);
          }
          return 0;
        },
        proc_exit: (_rval) => {},
        environ_sizes_get: (_countPtr, _sizePtr) => 0,
        environ_get: (_environPtr, _environBufPtr) => 0,
      },
      env: {
        memory: this.memory,
      },
    };
  }

  invokeInit() {
    if (!this.instance) return;
    const exports = this.instance.exports;
    const initFn = exports.init || exports.omni_init || exports._start;
    if (typeof initFn === "function") {
      try {
        const ret = initFn();
        if (typeof ret === "string") {
          this.onSchema?.(ret);
        } else if (typeof ret === "number" && ret > 0) {
          const str = this.readNullTerminatedString(ret);
          if (str) this.onSchema?.(str);
        }
      } catch (e) {
        console.error(`[WasmGuestHost:${this.pluginId}] Error executing init():`, e);
      }
    }
  }

  dispatchAction(actionName, payload) {
    if (!this.instance || this.destroyed) return;
    const exports = this.instance.exports;
    const actionFn =
      exports["handle-action"] || exports.handle_action || exports.omni_handle_action;
    if (typeof actionFn !== "function") return;

    try {
      const actionStr = String(actionName || "");
      const payloadStr = JSON.stringify(payload || {});
      const [actionPtr, actionLen] = this.allocateAndWriteString(actionStr);
      const [payloadPtr, payloadLen] = this.allocateAndWriteString(payloadStr);

      const ret = actionFn(actionPtr, actionLen, payloadPtr, payloadLen);
      if (typeof ret === "string") {
        this.onSchema?.(ret);
      } else if (typeof ret === "number" && ret > 0) {
        const str = this.readNullTerminatedString(ret);
        if (str) this.onSchema?.(str);
      }

      this.deallocateString(actionPtr, actionLen);
      this.deallocateString(payloadPtr, payloadLen);
    } catch (e) {
      console.error(`[WasmGuestHost:${this.pluginId}] Error in dispatchAction:`, e);
    }
  }

  allocateAndWriteString(str) {
    if (!this.memory) return [0, 0];
    const bytes = new TextEncoder().encode(str);
    const len = bytes.length;
    const exports = this.instance?.exports;
    const allocFn = exports?.alloc || exports?.allocate || exports?.malloc;

    let ptr = 0;
    if (typeof allocFn === "function") {
      ptr = allocFn(len + 1);
    } else {
      if (!this.bumpPointer) {
        this.bumpPointer =
          exports?.__heap_base?.value || exports?.__data_end?.value || 65536;
      }
      ptr = this.bumpPointer;
      this.bumpPointer = (this.bumpPointer + len + 16) & ~7;
      if (this.bumpPointer >= this.memory.buffer.byteLength) {
        try {
          this.memory.grow(1);
        } catch (_) {}
      }
    }

    const target = new Uint8Array(this.memory.buffer, ptr, len + 1);
    target.set(bytes);
    target[len] = 0;
    return [ptr, len];
  }

  deallocateString(ptr, len) {
    const deallocFn = this.instance?.exports?.dealloc || this.instance?.exports?.free;
    if (typeof deallocFn === "function" && ptr > 0) {
      try {
        deallocFn(ptr, len);
      } catch (_) {}
    }
  }

  writeStringToReturnPtr(retPtr, str) {
    const [ptr, len] = this.allocateAndWriteString(str);
    if (this.memory && retPtr > 0) {
      const dv = new DataView(this.memory.buffer);
      dv.setUint32(retPtr, ptr, true);
      dv.setUint32(retPtr + 4, len, true);
    }
  }

  readNullTerminatedString(ptr) {
    if (!this.memory || ptr <= 0 || ptr >= this.memory.buffer.byteLength) return "";
    const bytes = new Uint8Array(this.memory.buffer, ptr);
    let end = 0;
    while (end < bytes.length && bytes[end] !== 0) end++;
    return new TextDecoder("utf-8").decode(bytes.subarray(0, end));
  }

  destroy() {
    this.destroyed = true;
    this.instance = null;
    this.memory = null;
  }
}

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
  islandHosts.set(String(pluginId), { iframe, host, selector: String(selector) });
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
  const wasmEntry = wasmHosts.get(String(pluginId));
  if (wasmEntry && wasmEntry.host) {
    wasmEntry.host.dispatchAction(
      payload.name || (typeof payload === "string" ? payload : ""),
      payload,
    );
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

export function unmount_island(selectorOrPluginId) {
  if (!selectorOrPluginId) return;
  const target = String(selectorOrPluginId);

  // 1. Direct plugin ID lookup in islandHosts
  const entry = islandHosts.get(target);
  if (entry) {
    if (entry.iframe) {
      try {
        entry.iframe.remove();
      } catch (_) {
        if (entry.iframe.parentNode) {
          entry.iframe.parentNode.removeChild(entry.iframe);
        }
      }
    }
    const container =
      entry.host || entry.iframe?.parentElement || entry.iframe?.parentNode;
    if (container) {
      container.innerHTML = "";
    }
    islandHosts.delete(target);
  }

  // 2. DOM selector lookup
  const host = resolveHost(selectorOrPluginId);
  if (host) {
    host.innerHTML = "";
    for (const [pluginId, item] of islandHosts.entries()) {
      if (
        item &&
        (item.host === host ||
          item.selector === target ||
          item.iframe?.parentElement === host ||
          item.iframe?.parentNode === host)
      ) {
        if (item.iframe) {
          try {
            item.iframe.remove();
          } catch (_) {}
        }
        islandHosts.delete(pluginId);
      }
    }
  }
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

export function mount_wasm(
  selector,
  content,
  pluginId,
  userPubkey,
  onRpc,
  onSchema,
) {
  const host = resolveHost(selector);
  if (host) host.innerHTML = "";
  unmount_wasm(pluginId);

  const wasmBytes = decodeWasmBytes(content);
  const wasmHost = new WasmHostInstance({
    pluginId: String(pluginId),
    wasmBytes,
    userPubkey: String(userPubkey || ""),
    onSchema: (data) => {
      if (typeof onSchema !== "function") return;
      try {
        onSchema(typeof data === "string" ? data : JSON.stringify(data));
      } catch (_) {}
    },
    onRpc,
  });

  wasmHosts.set(String(pluginId), { host: wasmHost });
  wasmHost.boot().catch((err) => {
    console.error(`[Omni Wasm Error: ${pluginId}]`, err);
  });
}

export function unmount_wasm(pluginId) {
  const entry = wasmHosts.get(String(pluginId));
  if (!entry) return;
  try {
    entry.host.destroy();
  } catch (_) {}
  wasmHosts.delete(String(pluginId));
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
  if (value instanceof Some) return value[0];
  if (typeof value === "string") return value;
  return undefined;
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

let lastThemeMode = null;
let lastAccentStyle = null;

export function apply_document_theme(themeMode, accentCss) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!root) return;
  const modeStr = String(themeMode || "dark");
  const resolvedMode =
    modeStr === "system"
      ? typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : modeStr;
  const fullStyle = `${String(accentCss || "")};color-scheme:${resolvedMode || "dark"}`;
  if (modeStr !== lastThemeMode) {
    lastThemeMode = modeStr;
    root.setAttribute("data-theme-mode", modeStr);
  }
  if (fullStyle !== lastAccentStyle) {
    lastAccentStyle = fullStyle;
    root.setAttribute("style", fullStyle);
  }
}

let frameScheduled = false;

export function schedule_frame(callback) {
  if (typeof window === "undefined") {
    queueMicrotask(callback);
    return;
  }
  if (frameScheduled) return;
  frameScheduled = true;
  const raf =
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (fn) => window.setTimeout(fn, 16);
  raf(() => {
    frameScheduled = false;
    callback();
  });
}

export function listen_shell_scroll(onChange) {
  if (typeof document === "undefined") return;
  let lastY = 0;
  let lastDown = null;
  let lastAtTop = null;
  let lastAutoLoadAt = 0;
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
      if (down) {
        const el = getActiveScrollElement();
        if (el) {
          const isRoot =
            el === document.documentElement || el === document.scrollingElement;
          const scrollTop = isRoot ? window.scrollY || el.scrollTop || 0 : el.scrollTop;
          const clientHeight = isRoot ? window.innerHeight : el.clientHeight;
          const scrollHeight = el.scrollHeight;
          if (
            scrollHeight > clientHeight + 40 &&
            scrollTop + clientHeight >= scrollHeight - 300
          ) {
            const now = Date.now();
            if (now - lastAutoLoadAt > 800) {
              const btn =
                document.querySelector("#btn-feed-load-more button") ||
                document.getElementById("btn-feed-load-more");
              if (btn && !btn.disabled && typeof btn.click === "function") {
                lastAutoLoadAt = now;
                btn.click();
              }
            }
          }
        }
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

function getActiveScrollTop(eventTarget) {
  let maxScrollTop = window.scrollY || 0;
  if (eventTarget && typeof eventTarget.closest === "function") {
    const container = eventTarget.closest(
      ".editorial-app-page.active, .editorial-viewport-page.active, .panorama-active-section, .omni-main-viewport",
    );
    if (container && typeof container.scrollTop === "number") {
      maxScrollTop = Math.max(maxScrollTop, container.scrollTop);
    }
  }
  const activePage =
    document.querySelector(".editorial-app-page.active") ||
    document.querySelector(".editorial-viewport-page.active") ||
    document.querySelector(".panorama-active-section") ||
    document.querySelector(".omni-main-viewport");
  if (activePage && typeof activePage.scrollTop === "number") {
    maxScrollTop = Math.max(maxScrollTop, activePage.scrollTop);
  }
  return maxScrollTop;
}

export function listen_pull_to_refresh(onStart, onMove, onEnd) {
  if (typeof document === "undefined") return;
  let candidate = false;
  let activePull = false;
  let startY = 0;

  document.addEventListener(
    "touchstart",
    (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      const scrollTop = getActiveScrollTop(e.target);
      if (scrollTop <= 1) {
        candidate = true;
        activePull = false;
        startY = e.touches[0].clientY;
      } else {
        candidate = false;
        activePull = false;
      }
    },
    { passive: true },
  );
  document.addEventListener(
    "touchmove",
    (e) => {
      if (!candidate || !e.touches || !e.touches.length) return;
      const currentY = e.touches[0].clientY;
      const dy = currentY - startY;
      if (!activePull) {
        if (dy < -4 || getActiveScrollTop(e.target) > 1) {
          candidate = false;
          return;
        }
        if (dy > 4) {
          activePull = true;
          onStart(0, startY);
        } else {
          return;
        }
      }
      onMove(currentY);
    },
    { passive: true },
  );
  const finish = () => {
    candidate = false;
    if (!activePull) return;
    activePull = false;
    onEnd();
  };
  document.addEventListener("touchend", finish, { passive: true });
  document.addEventListener("touchcancel", finish, { passive: true });
}

export function listen_app_context_menu(onOpen) {
  if (typeof document === "undefined") return;
  document.addEventListener("contextmenu", (event) => {
    const target = event.target && event.target.closest
      ? event.target.closest("[data-context-app-id]")
      : null;
    if (!target) return;
    const appId = target.getAttribute("data-context-app-id");
    if (!appId) return;
    event.preventDefault();
    const menuW = 210;
    const menuH = 220;
    const vw = typeof window !== "undefined" ? window.innerWidth || 1024 : 1024;
    const vh = typeof window !== "undefined" ? window.innerHeight || 768 : 768;
    const rawX = Math.round(event.clientX || 0);
    const rawY = Math.round(event.clientY || 0);
    const x = Math.max(8, Math.min(rawX, vw - menuW));
    const y = rawY + menuH > vh ? Math.max(8, rawY - menuH) : Math.max(8, rawY);
    onOpen(appId, x, y);
  });

  let timer = null;
  let startX = 0;
  let startY = 0;
  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  document.addEventListener(
    "touchstart",
    (event) => {
      if (!event.touches || event.touches.length !== 1) return;
      const target = event.target && event.target.closest
        ? event.target.closest("[data-context-app-id]")
        : null;
      if (!target) return;
      const appId = target.getAttribute("data-context-app-id");
      if (!appId) return;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        onOpen(appId, Math.round(startX), Math.round(startY));
      }, 500);
    },
    { passive: true },
  );
  document.addEventListener(
    "touchmove",
    (event) => {
      if (timer === null || !event.touches || !event.touches.length) return;
      const dx = Math.abs(event.touches[0].clientX - startX);
      const dy = Math.abs(event.touches[0].clientY - startY);
      if (dx > 10 || dy > 10) clearTimer();
    },
    { passive: true },
  );
  document.addEventListener("touchend", clearTimer, { passive: true });
  document.addEventListener("touchcancel", clearTimer, { passive: true });
}

function getActiveScrollElement() {
  return (
    document.querySelector(".editorial-app-page.active") ||
    document.querySelector(".editorial-viewport-page.active") ||
    document.querySelector(".panorama-active-section") ||
    document.querySelector(".omni-main-viewport") ||
    document.scrollingElement ||
    document.documentElement
  );
}

export function scroll_shell_top() {
  if (typeof document === "undefined") return;
  const target = getActiveScrollElement();
  if (target && typeof target.scrollTo === "function") {
    target.scrollTo({ top: 0, behavior: "smooth" });
  }
  if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

const scrollHistoryStack = [];

function setScrollTopImmediate(y) {
  const target = getActiveScrollElement();
  if (target) {
    if (typeof target.scrollTo === "function") {
      try {
        target.scrollTo({ top: y, behavior: "instant" });
      } catch (_) {
        target.scrollTo(0, y);
      }
    }
    target.scrollTop = y;
  }
  if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
    try {
      window.scrollTo({ top: y, behavior: "instant" });
    } catch (_) {
      window.scrollTo(0, y);
    }
  }
}

export function push_scroll_and_reset_top() {
  if (typeof document === "undefined") return;
  const current = getActiveScrollTop(null);
  scrollHistoryStack.push(current);
  schedule_frame(() => setScrollTopImmediate(0));
}

export function pop_and_restore_scroll() {
  if (typeof document === "undefined") return;
  const prev = scrollHistoryStack.length > 0 ? scrollHistoryStack.pop() : 0;
  schedule_frame(() => {
    schedule_frame(() => setScrollTopImmediate(prev));
  });
}

export function set_timeout(ms, cb) {
  setTimeout(cb, ms);
}

const pendingProfileAuthors = new Set();
let profileFlushTimer = null;
let pendingViewPush = false;
let viewPushScheduled = false;

export function enqueue_ingest_flush(author, needs_view_push, on_flush) {
  if (author) {
    pendingProfileAuthors.add(author);
    if (pendingProfileAuthors.size >= 25) {
      if (profileFlushTimer !== null) {
        clearTimeout(profileFlushTimer);
        profileFlushTimer = null;
      }
      const authorsJoined = Array.from(pendingProfileAuthors).join(",");
      pendingProfileAuthors.clear();
      on_flush(authorsJoined, false);
    } else if (profileFlushTimer === null) {
      profileFlushTimer = setTimeout(() => {
        profileFlushTimer = null;
        const authorsJoined = Array.from(pendingProfileAuthors).join(",");
        pendingProfileAuthors.clear();
        if (authorsJoined) on_flush(authorsJoined, false);
      }, 350);
    }
  }
  if (needs_view_push) {
    pendingViewPush = true;
    if (!viewPushScheduled) {
      viewPushScheduled = true;
      schedule_frame(() => {
        viewPushScheduled = false;
        const shouldPushViews = pendingViewPush;
        pendingViewPush = false;
        if (shouldPushViews) on_flush("", true);
      });
    }
  }
}

const seenOrRequestedEventIds = new Set();
const pendingEventFetchIds = new Set();
let eventFetchTimer = null;

export function mark_event_seen(eventId) {
  if (eventId) seenOrRequestedEventIds.add(eventId);
}

export function enqueue_event_fetch(eventId, on_flush) {
  if (!eventId || seenOrRequestedEventIds.has(eventId)) return;
  seenOrRequestedEventIds.add(eventId);
  pendingEventFetchIds.add(eventId);
  if (pendingEventFetchIds.size >= 25) {
    if (eventFetchTimer !== null) {
      clearTimeout(eventFetchTimer);
      eventFetchTimer = null;
    }
    const idsJoined = Array.from(pendingEventFetchIds).join(",");
    pendingEventFetchIds.clear();
    on_flush(idsJoined);
  } else if (eventFetchTimer === null) {
    eventFetchTimer = setTimeout(() => {
      eventFetchTimer = null;
      const idsJoined = Array.from(pendingEventFetchIds).join(",");
      pendingEventFetchIds.clear();
      if (idsJoined) on_flush(idsJoined);
    }, 350);
  }
}

let pendingPublicEvents = [];
let publicIngestTimer = null;

