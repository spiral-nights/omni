// Omni Injected Sandbox Runtime Bridge (omni-runtime.js)
(function () {
  let portRemoteDom = null;
  let portKernelRpc = null;
  let sessionInfo = null;
  let initResolved = null;
  const initPromise = new Promise((resolve) => {
    initResolved = resolve;
  });

  const rpcPending = new Map();
  let rpcIdCounter = 1;

  // Active subscription listeners (for window.omni.nostr.subscribe)
  const subscriptions = new Map();
  // Virtual WebSocket subscriptions (subId -> VirtualWebSocket)
  const wsActiveSubscriptions = new Map();
  // Intent handlers
  const intentHandlers = new Map();
  const pendingIntentInvocations = new Map();
  // Component registrations and instances
  const registeredComponents = new Map();
  const componentContexts = new Map();
  let activeNativeToRemote = null;

  // Capture all Element.prototype.addEventListener calls from the very beginning
  // (including synchronous calls during initial script execution prior to omni:init)
  if (typeof Element !== "undefined" && Element.prototype && typeof Element.prototype.addEventListener === "function") {
    const origProtoAddEventListener = Element.prototype.addEventListener;
    Element.prototype.addEventListener = function(type, listener, options) {
      if (!this.__omniListeners) this.__omniListeners = new Set();
      this.__omniListeners.add(type);
      if (activeNativeToRemote) {
        const remoteEl = activeNativeToRemote.get(this);
        if (remoteEl) {
          remoteEl.addEventListener(type, () => {});
        }
      }
      return origProtoAddEventListener.call(this, type, listener, options);
    };
  }

  // 1. Transparent LocalStorage Shim (handles sandboxed opaque origin restrictions)
  const memoryStore = new Map();
  if (typeof window !== "undefined" && window.__OMNI_INITIAL_STORAGE__ && typeof window.__OMNI_INITIAL_STORAGE__ === "object") {
    for (const [k, v] of Object.entries(window.__OMNI_INITIAL_STORAGE__)) {
      memoryStore.set(String(k), String(v));
    }
  }

  const storageShim = {
    getItem(key) {
      return memoryStore.has(String(key)) ? memoryStore.get(String(key)) : null;
    },
    setItem(key, value) {
      const k = String(key);
      const v = String(value);
      memoryStore.set(k, v);
      initPromise.then(() => callRpc("storage.set", { key: k, value: v }).catch(() => {}));
    },
    removeItem(key) {
      const k = String(key);
      memoryStore.delete(k);
      initPromise.then(() => callRpc("storage.delete", { key: k }).catch(() => {}));
    },
    clear() {
      memoryStore.clear();
      initPromise.then(() => callRpc("storage.clear").catch(() => {}));
    },
    key(i) {
      return Array.from(memoryStore.keys())[i] || null;
    },
    get length() {
      return memoryStore.size;
    }
  };

  try {
    window.localStorage.getItem("__omni_probe__");
  } catch (_) {
    try {
      Object.defineProperty(window, "localStorage", {
        value: storageShim,
        configurable: true,
        enumerable: true
      });
    } catch (_) {}
  }

  // 2. Listen for Handshake from Host
  function handleInitMessage(event) {
    const data = event.data;
    if (data && data.type === "omni:init") {
      sessionInfo = data.payload;
      if (sessionInfo) {
        if (sessionInfo.storage && typeof sessionInfo.storage === "object") {
          for (const [k, v] of Object.entries(sessionInfo.storage)) {
            memoryStore.set(String(k), String(v));
          }
        }
        if (sessionInfo.route) {
          window.__OMNI_ROUTE__ = sessionInfo.route;
        }
        if (sessionInfo.viewId) {
          window.__OMNI_VIEW__ = sessionInfo.viewId;
        }
      }
      const ports = (event.ports && event.ports.length >= 2)
        ? event.ports
        : (typeof window !== "undefined" && window.__omniTransferPorts ? window.__omniTransferPorts : []);
      portRemoteDom = ports[0] || null;
      portKernelRpc = ports[1] || null;

      setupKernelRpc();
      setupRemoteDom();

      // Apply Host Theme Tokens to Guest DOM
      if (sessionInfo && sessionInfo.theme && sessionInfo.theme.colors) {
        try {
          const docEl = document.documentElement;
          if (docEl && docEl.style) {
            const colors = sessionInfo.theme.colors;
            if (colors.canvas) {
              docEl.style.setProperty("--bg-canvas", colors.canvas);
              docEl.style.setProperty("--omni-bg-canvas", colors.canvas);
            }
            if (colors.surface) {
              docEl.style.setProperty("--bg-surface", colors.surface);
              docEl.style.setProperty("--omni-bg-surface", colors.surface);
            }
            if (colors.accent) {
              docEl.style.setProperty("--accent-primary", colors.accent);
              docEl.style.setProperty("--omni-accent-primary", colors.accent);
            }
            if (colors.contrast) {
              docEl.style.setProperty("--accent-contrast", colors.contrast);
              docEl.style.setProperty("--omni-accent-contrast", colors.contrast);
            }
            if (colors.radius !== undefined) {
              docEl.style.setProperty("--radius-sm", colors.radius);
              docEl.style.setProperty("--radius-md", colors.radius);
              docEl.style.setProperty("--omni-radius-sm", colors.radius);
              docEl.style.setProperty("--omni-radius-md", colors.radius);
            }
          }
        } catch (_) {}
      }

      initResolved();

      // Schedule component mount resolving best match for placement
      scheduleComponentMount();

      // If no components were explicitly registered via omni.registerComponent, auto-mount DOM
      const runAutoMount = () => {
        if (registeredComponents.size === 0) {
          setupDomAutoMount();
        }
      };
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", runAutoMount, { once: true });
      } else {
        runAutoMount();
      }
    }
  }

  window.addEventListener("message", handleInitMessage);
  if (typeof window !== "undefined" && window.__omniPendingInit) {
    handleInitMessage(window.__omniPendingInit);
    window.__omniPendingInit = null;
  }

  // 3. Kernel RPC Communication
  function setupKernelRpc() {
    if (!portKernelRpc) return;
    portKernelRpc.onmessage = (event) => {
      const msg = event.data;
      if (!msg) return;

      // Handle RPC Responses
      if (msg.id !== undefined && rpcPending.has(msg.id)) {
        const { resolve, reject } = rpcPending.get(msg.id);
        rpcPending.delete(msg.id);
        if (msg.error) {
          reject(new Error(msg.error.message || "RPC Error"));
        } else {
          resolve(msg.result);
        }
        return;
      }

      // Handle Notifications (Streaming events)
      if (msg.method === "nostr.stream.event") {
        const subId = msg.params.subscriptionId;

        // Check window.omni subscriptions
        const sub = subscriptions.get(subId);
        if (sub && sub.onEvent) {
          sub.onEvent(msg.params.event, {
            fromCache: msg.params.fromCache,
            relay: msg.params.relay
          });
        }

        // Check Virtual WebSocket subscriptions
        const ws = wsActiveSubscriptions.get(subId);
        if (ws) {
          const frame = JSON.stringify(["EVENT", subId, msg.params.event]);
          const ev = new MessageEvent("message", { data: frame });
          if (typeof ws.onmessage === "function") {
            try { ws.onmessage(ev); } catch (e) { console.error(e); }
          }
          ws.dispatchEvent(ev);
        }
      } else if (msg.method === "nostr.stream.eose") {
        const subId = msg.params.subscriptionId;

        // Check window.omni subscriptions
        const sub = subscriptions.get(subId);
        if (sub && sub.onEose) {
          sub.onEose();
        }

        // Check Virtual WebSocket subscriptions
        const ws = wsActiveSubscriptions.get(subId);
        if (ws) {
          const frame = JSON.stringify(["EOSE", subId]);
          const ev = new MessageEvent("message", { data: frame });
          if (typeof ws.onmessage === "function") {
            try { ws.onmessage(ev); } catch (e) { console.error(e); }
          }
          ws.dispatchEvent(ev);
        }
      } else if (msg.method === "intent.invoke") {
        const action = msg.params && msg.params.action;
        const effectiveAction = msg.params && msg.params.effectiveAction;
        const data = msg.params && msg.params.data;
        let handler = intentHandlers.get(action);
        if (!handler && effectiveAction) {
          handler = intentHandlers.get(effectiveAction);
        }
        if (handler) {
          try {
            handler(data);
          } catch (e) {
            console.error("Error executing intent handler:", e);
          }
        } else {
          try {
            if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
              window.dispatchEvent(new CustomEvent("omni:intent", { detail: { action, effectiveAction, data, __omniInternal: true } }));
              window.dispatchEvent(new CustomEvent("intent", { detail: { action, effectiveAction, data, __omniInternal: true } }));
            }
          } catch (_) {}
          if (action) {
            if (!pendingIntentInvocations.has(action)) {
              pendingIntentInvocations.set(action, []);
            }
            pendingIntentInvocations.get(action).push(data);
          }
        }
      }
    };
  }

  function callRpc(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++rpcIdCounter;
      rpcPending.set(id, { resolve, reject });
      portKernelRpc.postMessage({
        jsonrpc: "2.0",
        id,
        method,
        params
      });
    });
  }

  // 4. Virtual WebSocket for Transparent Nostr Relay Connections
  class VirtualWebSocket extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    CONNECTING = 0;
    OPEN = 1;
    CLOSING = 2;
    CLOSED = 3;

    constructor(url, protocols) {
      super();
      this.url = String(url || "");
      this.protocols = protocols;
      this.readyState = VirtualWebSocket.CONNECTING;
      this.bufferedAmount = 0;
      this.binaryType = "blob";
      this.onopen = null;
      this.onmessage = null;
      this.onerror = null;
      this.onclose = null;

      this._subscriptions = new Set();

      initPromise.then(() => {
        if (this.readyState === VirtualWebSocket.CONNECTING) {
          this.readyState = VirtualWebSocket.OPEN;
          const openEv = new Event("open");
          if (typeof this.onopen === "function") {
            try { this.onopen(openEv); } catch (e) { console.error(e); }
          }
          this.dispatchEvent(openEv);
        }
      });
    }

    send(data) {
      if (this.readyState !== VirtualWebSocket.OPEN && this.readyState !== VirtualWebSocket.CONNECTING) {
        throw new Error("WebSocket is not open: readyState " + this.readyState);
      }

      initPromise.then(async () => {
        let frame;
        try {
          frame = typeof data === "string" ? JSON.parse(data) : null;
        } catch (_) {}

        if (Array.isArray(frame)) {
          const type = frame[0];
          if (type === "REQ") {
            const subId = frame[1];
            const filters = frame.slice(2);
            this._subscriptions.add(subId);
            wsActiveSubscriptions.set(subId, this);

            try {
              await callRpc("nostr.subscribe", { subscriptionId: subId, filters });
            } catch (err) {
              const noticeEv = new MessageEvent("message", {
                data: JSON.stringify(["NOTICE", "Subscription error: " + (err.message || "Unknown error")])
              });
              if (typeof this.onmessage === "function") this.onmessage(noticeEv);
              this.dispatchEvent(noticeEv);
            }
          } else if (type === "CLOSE") {
            const subId = frame[1];
            this._subscriptions.delete(subId);
            wsActiveSubscriptions.delete(subId);
            await callRpc("nostr.unsubscribe", { subscriptionId: subId });
          } else if (type === "EVENT") {
            const event = frame[1];
            try {
              await callRpc("nostr.publish", { event });
              const okEv = new MessageEvent("message", {
                data: JSON.stringify(["OK", event?.id || "", true, ""])
              });
              if (typeof this.onmessage === "function") this.onmessage(okEv);
              this.dispatchEvent(okEv);
            } catch (err) {
              const okEv = new MessageEvent("message", {
                data: JSON.stringify(["OK", event?.id || "", false, err.message || "Publish failed"])
              });
              if (typeof this.onmessage === "function") this.onmessage(okEv);
              this.dispatchEvent(okEv);
            }
          }
        }
      });
    }

    close(code, reason) {
      if (this.readyState === VirtualWebSocket.CLOSED) return;
      this.readyState = VirtualWebSocket.CLOSING;

      for (const subId of this._subscriptions) {
        wsActiveSubscriptions.delete(subId);
        callRpc("nostr.unsubscribe", { subscriptionId: subId }).catch(() => {});
      }
      this._subscriptions.clear();

      this.readyState = VirtualWebSocket.CLOSED;
      const closeEv = new CloseEvent("close", {
        code: code || 1000,
        reason: reason || "Normal Closure",
        wasClean: true
      });
      if (typeof this.onclose === "function") {
        try { this.onclose(closeEv); } catch (e) { console.error(e); }
      }
      this.dispatchEvent(closeEv);
    }
  }

  window.WebSocket = VirtualWebSocket;
  if (typeof globalThis !== "undefined") {
    globalThis.WebSocket = VirtualWebSocket;
  }

  // 4b. Transparent HTTP / Blossom Fetch Bridge (bypasses sandbox connect-src 'none' via host RPC)
  const nativeFetch = typeof window.fetch === "function" ? window.fetch.bind(window) : null;
  const virtualFetch = async function(input, init) {
    const urlStr = typeof input === "string" ? input : (input && input.url ? String(input.url) : String(input || ""));
    const method = (init && init.method ? String(init.method) : "GET").toUpperCase();
    if ((method === "PUT" || method === "GET") && /^https?:\/\//i.test(urlStr)) {
      await initPromise;
      let bytes = new Uint8Array(0);
      const body = init ? init.body : null;
      if (body instanceof Uint8Array) {
        bytes = body;
      } else if (body instanceof ArrayBuffer) {
        bytes = new Uint8Array(body);
      } else if (typeof body === "string") {
        bytes = new TextEncoder().encode(body);
      }
      const res = await callRpc(method === "PUT" ? "blossom.upload" : "http.fetch", {
        url: urlStr,
        method,
        headers: (init && init.headers) || {},
        bytes
      });
      const bodyText = (res && res.bodyText) || "";
      const respBytes =
        res && res.bytes
          ? new Uint8Array(res.bytes)
          : new TextEncoder().encode(bodyText);
      const contentType = (res && res.contentType) || "";
      return {
        ok: Boolean(res && res.ok),
        status: (res && res.status) || 200,
        headers: {
          get(name) {
            return String(name || "").toLowerCase() === "content-type" ? contentType : null;
          }
        },
        arrayBuffer: async () => respBytes.buffer.slice(respBytes.byteOffset, respBytes.byteOffset + respBytes.byteLength),
        text: async () => bodyText,
        json: async () => {
          try { return JSON.parse(bodyText); } catch (_) { return {}; }
        }
      };
    }
    if (nativeFetch) {
      return nativeFetch(input, init);
    }
    throw new Error("Network fetch disabled in sandbox");
  };
  window.fetch = virtualFetch;
  if (typeof globalThis !== "undefined") {
    globalThis.fetch = virtualFetch;
  }

  // 4b. Virtual SpeechSynthesis Shim
  // Bridges standard window.speechSynthesis to the host window to bypass Chrome's iframe user-activation
  // and autoplay restrictions on sandboxed cross-origin frames.
  if (typeof window !== "undefined") {
    const origSpeech = window.speechSynthesis;
    let cachedHostVoices = [];
    let hostVoicesQueried = false;

    function queryHostVoices() {
      if (hostVoicesQueried) return;
      hostVoicesQueried = true;
      callRpc("system.getVoices", {})
        .then((res) => {
          if (res && Array.isArray(res.voices)) {
            cachedHostVoices = res.voices;
            if (typeof virtualSpeech.onvoiceschanged === "function") {
              try {
                virtualSpeech.onvoiceschanged(new Event("voiceschanged"));
              } catch (_) {}
            }
          }
        })
        .catch(() => {});
    }

    const virtualSpeech = {
      get speaking() {
        return origSpeech ? origSpeech.speaking : false;
      },
      get paused() {
        return origSpeech ? origSpeech.paused : false;
      },
      get pending() {
        return origSpeech ? origSpeech.pending : false;
      },
      get onvoiceschanged() {
        return origSpeech ? origSpeech.onvoiceschanged : null;
      },
      set onvoiceschanged(fn) {
        if (origSpeech) origSpeech.onvoiceschanged = fn;
      },
      getVoices() {
        if (origSpeech && typeof origSpeech.getVoices === "function") {
          const v = origSpeech.getVoices();
          if (v && v.length > 0) return v;
        }
        if (cachedHostVoices.length === 0) {
          queryHostVoices();
        }
        return cachedHostVoices;
      },
      cancel() {
        if (origSpeech) {
          try { origSpeech.cancel(); } catch (_) {}
        }
        callRpc("system.cancelSpeech", {}).catch(() => {});
      },
      pause() {
        if (origSpeech) {
          try { origSpeech.pause(); } catch (_) {}
        }
        callRpc("system.cancelSpeech", {}).catch(() => {});
      },
      resume() {
        if (origSpeech) {
          try { origSpeech.resume(); } catch (_) {}
        }
      },
      speak(utterance) {
        if (!utterance) return;
        const text = utterance.text || String(utterance);
        const rate = utterance.rate || 1;
        const pitch = utterance.pitch || 1;
        const lang = utterance.lang || "";
        const voice = utterance.voice ? (utterance.voice.name || utterance.voice.voiceURI) : undefined;

        // Attempt native speech inside sandbox if browser allows it
        if (origSpeech) {
          try {
            if (origSpeech.paused) origSpeech.resume();
            origSpeech.speak(utterance);
          } catch (_) {}
        }

        // Bridge to host top-level window where user gesture and audio permissions are guaranteed
        callRpc("system.speak", { text, rate, pitch, lang, voice }).catch(() => {});
      }
    };

    try {
      Object.defineProperty(window, "speechSynthesis", {
        value: virtualSpeech,
        configurable: true,
        writable: true
      });
    } catch (_) {
      try {
        window.speechSynthesis = virtualSpeech;
      } catch (_) {}
    }
    if (typeof globalThis !== "undefined") {
      try {
        globalThis.speechSynthesis = virtualSpeech;
      } catch (_) {}
    }
  }

  // 5. Remote DOM Component Engine
  class RemoteDomContext {
    constructor(componentId) {
      this.componentId = componentId;
      this.nodes = new Map();
      this.eventListeners = new Map(); // nodeId -> Map(eventName -> Set(listener))
      this.nextNodeId = 100;
      this.mutationQueue = [];
      this.flushTimeout = null;

      // Root element with id "~"
      this.root = this.createRootElement();
    }

    sendMutation(record) {
      this.mutationQueue.push(record);
      if (!this.flushTimeout) {
        this.flushTimeout = true;
        queueMicrotask(() => {
          this.flushTimeout = false;
          if (portRemoteDom && this.mutationQueue.length > 0) {
            portRemoteDom.postMessage({
              type: "mutate",
              componentId: this.componentId,
              records: this.mutationQueue
            });
            this.mutationQueue = [];
          }
        });
      }
    }

    createRootElement() {
      const self = this;
      class RemoteNode {
        constructor(id, type) {
          this.id = String(id);
          this.nodeType = type;
          this.parentNode = null;
          this.childNodes = [];
          self.nodes.set(this.id, this);
        }

        isConnected() {
          let cur = this;
          while (cur) {
            if (cur.id === "~") return true;
            cur = cur.parentNode;
          }
          return false;
        }

        get parentElement() {
          return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
        }

        remove() {
          if (this.parentNode) {
            this.parentNode.removeChild(this);
          }
        }

        get firstChild() {
          return this.childNodes.length > 0 ? this.childNodes[0] : null;
        }

        get lastChild() {
          return this.childNodes.length > 0 ? this.childNodes[this.childNodes.length - 1] : null;
        }

        get children() {
          return this.childNodes.filter((c) => c.nodeType === 1);
        }

        get firstElementChild() {
          return this.childNodes.find((c) => c.nodeType === 1) || null;
        }

        get lastElementChild() {
          const els = this.children;
          return els.length > 0 ? els[els.length - 1] : null;
        }
      }

      class RemoteText extends RemoteNode {
        constructor(id, text) {
          super(id, 3);
          this._data = String(text ?? "");
        }
        get data() { return this._data; }
        set data(val) {
          this._data = String(val ?? "");
          if (this.isConnected()) {
            self.sendMutation([2, this.id, this._data]);
          }
        }
        get textContent() { return this._data; }
        set textContent(val) { this.data = val; }
      }

      class RemoteElement extends RemoteNode {
        constructor(id, tag) {
          super(id, 1);
          this.localName = tag.toLowerCase();
          this.tagName = tag.toUpperCase();
          this.attributes = new Map();
          this._listeners = new Map();
          self.eventListeners.set(this.id, this._listeners);

          // Auto-sync input & change events for form inputs
          if (this.localName === "input" || this.localName === "textarea" || this.localName === "select") {
            this.addEventListener("input", (e) => {
              if (e.detail) {
                if (e.detail.value !== undefined) this.attributes.set("value", String(e.detail.value));
                if (e.detail.checked !== undefined) this.attributes.set("checked", e.detail.checked ? "true" : "false");
              }
            });
            this.addEventListener("change", (e) => {
              if (e.detail) {
                if (e.detail.value !== undefined) this.attributes.set("value", String(e.detail.value));
                if (e.detail.checked !== undefined) this.attributes.set("checked", e.detail.checked ? "true" : "false");
              }
            });
          }
        }

        setAttribute(name, value) {
          const strVal = String(value);
          this.attributes.set(name, strVal);
          // Only send mutation if not root element '~' and connected to tree
          if (this.id !== "~" && this.isConnected()) {
            // Mutation 3 with updateType 2 (UPDATE_PROPERTY_TYPE_ATTRIBUTE = 2)
            self.sendMutation([3, this.id, name, strVal, 2]);
          }
        }

        removeAttribute(name) {
          this.attributes.delete(name);
          if (this.id !== "~" && this.isConnected()) {
            self.sendMutation([3, this.id, name, null, 2]);
          }
        }

        getAttribute(name) {
          return this.attributes.get(name) || null;
        }

        get className() { return this.getAttribute("class") || ""; }
        set className(val) { this.setAttribute("class", val); }

        get title() { return this.getAttribute("title") || ""; }
        set title(val) { this.setAttribute("title", val); }

        get placeholder() { return this.getAttribute("placeholder") || ""; }
        set placeholder(val) { this.setAttribute("placeholder", val); }

        get type() { return this.getAttribute("type") || ""; }
        set type(val) { this.setAttribute("type", val); }

        get checked() { return this.getAttribute("checked") === "true"; }
        set checked(val) {
          const boolVal = Boolean(val);
          this.setAttribute("checked", boolVal ? "true" : "false");
          if (this.id !== "~" && this.isConnected()) {
            // UPDATE_PROPERTY_TYPE_PROPERTY = 1
            self.sendMutation([3, this.id, "checked", boolVal, 1]);
          }
        }

        get value() { return this.getAttribute("value") || ""; }
        set value(val) {
          const strVal = String(val ?? "");
          this.setAttribute("value", strVal);
          if (this.id !== "~" && this.isConnected()) {
            // UPDATE_PROPERTY_TYPE_PROPERTY = 1
            self.sendMutation([3, this.id, "value", strVal, 1]);
          }
        }

        get style() {
          const elem = this;
          return new Proxy({}, {
            set(_, prop, val) {
              const cssProp = String(prop).replace(/([A-Z])/g, "-$1").toLowerCase();
              elem.setAttribute("style", `${elem.getAttribute("style") || ""}; ${cssProp}: ${val};`);
              return true;
            }
          });
        }

        get textContent() {
          return this.childNodes.map((c) => c.textContent || "").join("");
        }
        set textContent(val) {
          const str = String(val ?? "");
          if (this.childNodes.length === 1 && this.childNodes[0].nodeType === 3) {
            this.childNodes[0].data = str;
            return;
          }
          this.replaceChildren();
          if (str) {
            this.appendChild(new RemoteText(++self.nextNodeId, str));
          }
        }

        get innerHTML() {
          return this.textContent;
        }
        set innerHTML(val) {
          this.replaceChildren();
          if (val) {
            this.textContent = String(val);
          }
        }

        appendChild(child) {
          return this.insertBefore(child, null);
        }

        insertBefore(child, beforeChild) {
          if (child.parentNode) {
            child.parentNode.removeChild(child);
          }
          child.parentNode = this;
          let index = this.childNodes.length;
          if (beforeChild) {
            const idx = this.childNodes.indexOf(beforeChild);
            if (idx !== -1) index = idx;
          }
          this.childNodes.splice(index, 0, child);

          if (this.isConnected()) {
            const serialized = self.serializeNode(child);
            self.sendMutation([0, this.id, serialized, index]);
          }
          return child;
        }

        removeChild(child) {
          const idx = this.childNodes.indexOf(child);
          if (idx !== -1) {
            this.childNodes.splice(idx, 1);
            if (this.isConnected()) {
              self.sendMutation([1, this.id, idx]);
            }
            child.parentNode = null;
          }
          return child;
        }

        replaceChildren(...newChildren) {
          while (this.childNodes.length > 0) {
            this.removeChild(this.childNodes[this.childNodes.length - 1]);
          }
          for (const c of newChildren) {
            if (typeof c === "string") {
              this.appendChild(new RemoteText(++self.nextNodeId, c));
            } else if (c) {
              this.appendChild(c);
            }
          }
        }

        addEventListener(event, listener) {
          if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
            if (this.id !== "~" && this.isConnected()) {
              // Mutation 3 with updateType 3 (UPDATE_PROPERTY_TYPE_EVENT_LISTENER = 3)
              self.sendMutation([3, this.id, event, true, 3]);
            }
          }
          this._listeners.get(event).add(listener);
        }

        removeEventListener(event, listener) {
          if (this._listeners.has(event)) {
            const set = this._listeners.get(event);
            set.delete(listener);
            if (set.size === 0) {
              this._listeners.delete(event);
              if (this.id !== "~" && this.isConnected()) {
                self.sendMutation([3, this.id, event, null, 3]);
              }
            }
          }
        }

        dispatchEvent(eventObj) {
          const set = this._listeners.get(eventObj.type);
          if (set) {
            for (const listener of set) {
              try {
                listener(eventObj);
              } catch (err) {
                console.error("Error in remote event listener:", err);
              }
            }
          }
        }
      }

      this.RemoteTextClass = RemoteText;
      this.RemoteElementClass = RemoteElement;

      // Root element connects to host receiver root using ROOT_ID '~'
      const root = new RemoteElement("~", "div");
      root.attributes.set("class", `omni-component-${this.componentId}`);
      root.createElement = (tag) => new RemoteElement(++this.nextNodeId, tag);
      root.createTextNode = (text) => new RemoteText(++this.nextNodeId, text);
      return root;
    }

    serializeNode(node) {
      if (node.nodeType === 3) {
        return { id: node.id, type: 3, data: node.data };
      }
      const attrs = {};
      for (const [k, v] of node.attributes.entries()) {
        attrs[k] = v;
      }
      const listeners = {};
      if (node._listeners) {
        for (const k of node._listeners.keys()) {
          listeners[k] = true;
        }
      }
      return {
        id: node.id,
        type: 1,
        element: node.localName,
        attributes: attrs,
        eventListeners: listeners,
        children: node.childNodes.map((c) => this.serializeNode(c))
      };
    }

    handleHostEvent(id, eventName, detail) {
      const node = this.nodes.get(id);
      if (node && detail) {
        if (detail.value !== undefined) {
          node.attributes.set("value", String(detail.value));
        }
        if (detail.checked !== undefined) {
          node.attributes.set("checked", detail.checked ? "true" : "false");
        }
      }

      const nodeListeners = this.eventListeners.get(id);
      if (nodeListeners) {
        const listeners = nodeListeners.get(eventName);
        if (listeners) {
          const ev = {
            type: eventName,
            detail: detail || {},
            target: node
          };
          for (const fn of listeners) {
            try { fn(ev); } catch (e) { console.error(e); }
          }
        }
      }
    }
  }

  function setupRemoteDom() {
    if (!portRemoteDom) return;
    portRemoteDom.onmessage = (event) => {
      const data = event.data;
      if (!data) return;

      if (data.type === "event" && data.id && data.eventName) {
        const compId = data.componentId;
        if (compId && componentContexts.has(compId)) {
          componentContexts.get(compId).handleHostEvent(data.id, data.eventName, data.detail);
        } else {
          // If no compId specified, dispatch to all contexts
          for (const ctx of componentContexts.values()) {
            ctx.handleHostEvent(data.id, data.eventName, data.detail);
          }
        }
      }
    };
  }

  let mountScheduled = false;
  function scheduleComponentMount() {
    if (!portRemoteDom) return;
    if (mountScheduled) return;
    mountScheduled = true;
    queueMicrotask(() => {
      mountScheduled = false;
      resolveAndMountComponents();
    });
  }

  function resolveAndMountComponents() {
    if (!portRemoteDom) return;
    if (registeredComponents.size === 0) return;

    const targetComponents = (sessionInfo && sessionInfo.components && sessionInfo.components.length > 0)
      ? sessionInfo.components
      : ["main"];
    const currentView = (sessionInfo && sessionInfo.viewId) || "main";

    for (const targetCompId of targetComponents) {
      if (componentContexts.has(targetCompId)) {
        continue;
      }

      let bestMatchFn = null;

      if (registeredComponents.has(targetCompId)) {
        bestMatchFn = registeredComponents.get(targetCompId);
      } else if (registeredComponents.has(currentView)) {
        bestMatchFn = registeredComponents.get(currentView);
      } else if (sessionInfo && sessionInfo.pluginId && registeredComponents.has(`${sessionInfo.pluginId}-${currentView}`)) {
        bestMatchFn = registeredComponents.get(`${sessionInfo.pluginId}-${currentView}`);
      } else {
        for (const [key, fn] of registeredComponents.entries()) {
          if (key.endsWith(`-${currentView}`) || key.includes(currentView)) {
            bestMatchFn = fn;
            break;
          }
        }
        if (!bestMatchFn && (currentView === "main" || !currentView)) {
          for (const [key, fn] of registeredComponents.entries()) {
            if (key.includes("main")) {
              bestMatchFn = fn;
              break;
            }
          }
        }
        if (!bestMatchFn) {
          const firstEntry = registeredComponents.entries().next().value;
          if (firstEntry) {
            bestMatchFn = firstEntry[1];
          }
        }
      }

      if (bestMatchFn) {
        mountComponent(targetCompId, bestMatchFn);
      }
    }
  }

  function mountComponent(componentId, renderFn) {
    let ctx = componentContexts.get(componentId);
    if (!ctx) {
      ctx = new RemoteDomContext(componentId);
      componentContexts.set(componentId, ctx);
    }

    try {
      renderFn({ root: ctx.root, props: {} });
    } catch (err) {
      console.error(`[Omni Sandbox] Failed to render component ${componentId}:`, err);
    }
  }

  // 6. Transparent DOM Auto-Mount for Pure nsites
  function setupDomAutoMount() {
    if (registeredComponents.size > 0) return;

    const compId = (sessionInfo && sessionInfo.components && sessionInfo.components[0]) ||
                   (sessionInfo && sessionInfo.slots && sessionInfo.slots[0]) ||
                   "main";

    let ctx = componentContexts.get(compId);
    if (!ctx) {
      ctx = new RemoteDomContext(compId);
      componentContexts.set(compId, ctx);
    }

    const nativeToRemote = new WeakMap();
    activeNativeToRemote = nativeToRemote;
    const remoteIdToNative = new Map();
    let isDispatchingHostEvent = false;

    function scopePluginCss(cssText) {
      if (!cssText) return "";
      return String(cssText).replace(/(^|[}\s,])(html|body|:root)(?=[\s,{])/gi, "$1.omni-component-slot");
    }

    // Auto-sync property mutations on form inputs (.value, .checked) from guest scripts to Remote DOM
    function patchNativeProperty(proto, prop, isBool) {
      if (!proto) return;
      const desc = Object.getOwnPropertyDescriptor(proto, prop);
      if (!desc || !desc.set) return;
      Object.defineProperty(proto, prop, {
        get() {
          return desc.get.call(this);
        },
        set(val) {
          desc.set.call(this, val);
          if (isDispatchingHostEvent) return;
          const remoteEl = nativeToRemote.get(this);
          if (remoteEl) {
            if (isBool) {
              remoteEl.checked = Boolean(val);
            } else {
              remoteEl.value = String(val ?? "");
            }
          }
        },
        configurable: true,
        enumerable: true
      });
    }

    if (typeof HTMLInputElement !== "undefined") {
      patchNativeProperty(HTMLInputElement.prototype, "value", false);
      patchNativeProperty(HTMLInputElement.prototype, "checked", true);
      const origInputClick = HTMLInputElement.prototype.click;
      if (typeof origInputClick === "function") {
        HTMLInputElement.prototype.click = function() {
          if (this.type === "file") {
            // File picker activation is handled synchronously on the host DOM via data-file-input
            // to preserve transient user activation and avoid sandbox iframe popup warnings.
            return;
          }
          return origInputClick.apply(this, arguments);
        };
      }
    }
    if (typeof HTMLTextAreaElement !== "undefined") {
      patchNativeProperty(HTMLTextAreaElement.prototype, "value", false);
    }
    if (typeof HTMLSelectElement !== "undefined") {
      patchNativeProperty(HTMLSelectElement.prototype, "value", false);
    }

    function mirrorNode(nativeNode) {
      if (!nativeNode) return null;
      if (nativeToRemote.has(nativeNode)) return nativeToRemote.get(nativeNode);

      if (nativeNode.nodeType === 3) {
        const parentTag = (nativeNode.parentNode && nativeNode.parentNode.nodeName || "").toUpperCase();
        if (parentTag === "SCRIPT" || parentTag === "HEAD" || parentTag === "HTML") {
          return null;
        }
        const isStyleText = parentTag === "STYLE";
        const textData = isStyleText ? scopePluginCss(nativeNode.data || "") : (nativeNode.data || "");
        const remoteText = ctx.root.createTextNode(textData);
        nativeToRemote.set(nativeNode, remoteText);
        remoteIdToNative.set(remoteText.id, nativeNode);
        return remoteText;
      }

      if (nativeNode.nodeType === 1) {
        const tag = nativeNode.tagName.toLowerCase();
        if (tag === "script" || tag === "link" || tag === "head" || tag === "title" || tag === "meta") return null;

        const remoteEl = ctx.root.createElement(tag);
        nativeToRemote.set(nativeNode, remoteEl);
        remoteIdToNative.set(remoteEl.id, nativeNode);

        if (nativeNode.attributes) {
          for (let i = 0; i < nativeNode.attributes.length; i++) {
            const attr = nativeNode.attributes[i];
            remoteEl.setAttribute(attr.name, attr.value);
          }
        }

        if (tag === "input" || tag === "textarea" || tag === "select") {
          if ("value" in nativeNode && nativeNode.value !== undefined && nativeNode.value !== "") {
            remoteEl.value = nativeNode.value;
          }
          if ("checked" in nativeNode && nativeNode.checked !== undefined && nativeNode.checked) {
            remoteEl.checked = nativeNode.checked;
          }
        }

        // Auto-register common interactive listeners
        if (["button", "input", "textarea", "select", "a"].includes(tag) || nativeNode.hasAttribute("onclick")) {
          remoteEl.addEventListener("click", () => {});
          remoteEl.addEventListener("input", () => {});
          remoteEl.addEventListener("change", () => {});
        }

        if (nativeNode.__omniListeners) {
          for (const evType of nativeNode.__omniListeners) {
            remoteEl.addEventListener(evType, () => {});
          }
        }

        for (const child of nativeNode.childNodes) {
          const remoteChild = mirrorNode(child);
          if (remoteChild) {
            remoteEl.appendChild(remoteChild);
          }
        }

        return remoteEl;
      }

      return null;
    }

    // Mirror <style> tags from document.head so external/inlined CSS stylesheets apply to projected DOM
    if (document.head) {
      const headStyles = document.head.querySelectorAll("style");
      for (let i = 0; i < headStyles.length; i++) {
        const remoteStyle = mirrorNode(headStyles[i]);
        if (remoteStyle) {
          ctx.root.appendChild(remoteStyle);
        }
      }
    }

    // Mirror current body contents
    const targetRoot = document.getElementById("root") || document.body;
    if (targetRoot === document.body) {
      for (const child of document.body.childNodes) {
        const remoteChild = mirrorNode(child);
        if (remoteChild) {
          ctx.root.appendChild(remoteChild);
        }
      }
    } else {
      const remoteRoot = mirrorNode(targetRoot);
      if (remoteRoot) {
        ctx.root.appendChild(remoteRoot);
      }
    }

    // Intercept host events and dispatch to native DOM element
    const origHandleHostEvent = ctx.handleHostEvent.bind(ctx);
    ctx.handleHostEvent = function(id, eventName, detail) {
      origHandleHostEvent(id, eventName, detail);
      const nativeNode = remoteIdToNative.get(String(id));
      if (nativeNode) {
        isDispatchingHostEvent = true;
        try {
          let wrappedFiles = null;
          if (detail) {
            if (detail.value !== undefined && "value" in nativeNode && nativeNode.type !== "file") {
              try { nativeNode.value = detail.value; } catch (_) {}
            }
            if (detail.checked !== undefined && "checked" in nativeNode) {
              try { nativeNode.checked = detail.checked; } catch (_) {}
            }
            if (Array.isArray(detail.files)) {
              wrappedFiles = detail.files.map((f) => {
                const u8 = f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes || 0);
                return {
                  name: f.name || "file",
                  size: f.size ?? u8.byteLength,
                  type: f.type || "application/octet-stream",
                  bytes: u8,
                  arrayBuffer: () => Promise.resolve(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)),
                  text: () => Promise.resolve(new TextDecoder().decode(u8))
                };
              });
              try {
                Object.defineProperty(nativeNode, "files", {
                  value: wrappedFiles,
                  configurable: true
                });
              } catch (_) {}
            }
          }
          let ev;
          if (eventName === "click") {
            ev = new MouseEvent("click", { bubbles: true, cancelable: true });
          } else if (eventName === "input" || eventName === "change") {
            ev = new Event(eventName, { bubbles: true, cancelable: true });
            if (wrappedFiles) {
              try {
                Object.defineProperty(ev, "detail", { value: { ...detail, files: wrappedFiles }, configurable: true });
              } catch (_) {}
            }
          } else {
            const customDetail = wrappedFiles ? { ...detail, files: wrappedFiles } : detail;
            ev = new CustomEvent(eventName, { bubbles: true, cancelable: true, detail: customDetail });
          }

          if (detail && typeof detail === "object") {
            for (const prop of ["clientX", "clientY", "pageX", "pageY", "screenX", "screenY", "targetRect", "touches", "changedTouches"]) {
              if (detail[prop] !== undefined && !(prop in ev)) {
                try {
                  Object.defineProperty(ev, prop, { value: detail[prop], configurable: true });
                } catch (_) {}
              }
            }
            if (eventName.startsWith("drag") || eventName === "drop" || wrappedFiles) {
              const dragStore = new Map(Object.entries(detail.dragData || {}));
              const dt = {
                types: Array.from(dragStore.keys()),
                files: wrappedFiles || [],
                getData: (type) => dragStore.get(type) || "",
                setData: (type, val) => { dragStore.set(type, String(val)); },
                clearData: () => dragStore.clear()
              };
              try {
                Object.defineProperty(ev, "dataTransfer", {
                  value: dt,
                  configurable: true
                });
              } catch (_) {}
            }
          }
          nativeNode.dispatchEvent(ev);
        } finally {
          isDispatchingHostEvent = false;
        }
      }
    };

    // Observe future native DOM mutations
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "childList") {
          const isRootTarget = m.target === document.body || m.target === document.head;
          const parentRemote = isRootTarget ? ctx.root : nativeToRemote.get(m.target);
          if (!parentRemote) continue;

          for (const added of m.addedNodes) {
            if (m.target === document.head && (!added.tagName || added.tagName.toLowerCase() !== "style")) {
              continue;
            }
            const remoteChild = mirrorNode(added);
            if (remoteChild && !remoteChild.parentNode) {
              parentRemote.appendChild(remoteChild);
            }
          }

          for (const removed of m.removedNodes) {
            const remoteChild = nativeToRemote.get(removed);
            if (remoteChild) {
              remoteChild.remove();
            }
          }
        } else if (m.type === "attributes") {
          const remoteEl = nativeToRemote.get(m.target);
          if (remoteEl) {
            const attrName = m.attributeName;
            if (attrName) {
              const val = m.target.getAttribute(attrName);
              if (val === null || val === false) {
                remoteEl.removeAttribute(attrName);
              } else {
                remoteEl.setAttribute(attrName, val === true ? "" : String(val));
              }
            }
          }
        } else if (m.type === "characterData") {
          const remoteText = nativeToRemote.get(m.target);
          if (remoteText) {
            const isStyleText = m.target.parentNode && m.target.parentNode.nodeName === "STYLE";
            remoteText.data = isStyleText ? scopePluginCss(m.target.data || "") : (m.target.data || "");
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });
    if (document.head) {
      observer.observe(document.head, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }
  }

  // 7. Standard NIP-07 (window.nostr)
  window.nostr = {
    async getPublicKey() {
      await initPromise;
      if (sessionInfo && sessionInfo.userPubkey) {
        return sessionInfo.userPubkey;
      }
      return callRpc("nostr.getPublicKey");
    },
    async signEvent(event) {
      await initPromise;
      return callRpc("nostr.signEvent", { event });
    },
    async getRelays() {
      await initPromise;
      return callRpc("nostr.getRelays");
    },
    nip04: {
      async encrypt(pubkey, plaintext) {
        await initPromise;
        return callRpc("nostr.nip04.encrypt", { pubkey, plaintext });
      },
      async decrypt(pubkey, ciphertext) {
        await initPromise;
        return callRpc("nostr.nip04.decrypt", { pubkey, ciphertext });
      }
    },
    nip44: {
      async encrypt(pubkey, plaintext) {
        await initPromise;
        return callRpc("nostr.nip44.encrypt", { pubkey, plaintext });
      },
      async decrypt(pubkey, ciphertext) {
        await initPromise;
        return callRpc("nostr.nip44.decrypt", { pubkey, ciphertext });
      }
    }
  };

  // 8. Injected window.omni API (Full backward compatibility)
  window.omni = {
    get session() {
      return sessionInfo;
    },
    async ready() {
      return initPromise;
    },
    registerComponent(id, renderFn) {
      registeredComponents.set(id, renderFn);
      scheduleComponentMount();
    },
    nostr: {
      async getPublicKey() {
        await initPromise;
        if (sessionInfo && sessionInfo.userPubkey) {
          return sessionInfo.userPubkey;
        }
        return callRpc("nostr.getPublicKey");
      },
      async signEvent(event) {
        await initPromise;
        return callRpc("nostr.signEvent", { event });
      },
      async publish(event) {
        await initPromise;
        return callRpc("nostr.publish", { event });
      },
      subscribe(filters, onEvent, onEose) {
        const subId = `sub_${Math.random().toString(36).slice(2, 9)}`;
        let filterList = [];
        let eventCb = onEvent;
        let eoseCb = onEose;

        if (Array.isArray(filters)) {
          filterList = filters;
        } else if (filters && typeof filters === "object") {
          const opts = filters;
          filterList = opts.filters || [{
            kinds: opts.kinds,
            authors: opts.authors,
            ids: opts.ids,
            limit: opts.limit
          }];
          eventCb = opts.onEvent || onEvent;
          eoseCb = opts.onEose || onEose;
        }

        subscriptions.set(subId, {
          onEvent: eventCb,
          onEose: eoseCb
        });

        initPromise.then(() => {
          callRpc("nostr.subscribe", { subscriptionId: subId, filters: filterList });
        });

        return {
          id: subId,
          unsubscribe() {
            subscriptions.delete(subId);
            callRpc("nostr.unsubscribe", { subscriptionId: subId });
          }
        };
      }
    },
    subscribe(options, onEvent, onEose) {
      return this.nostr.subscribe(options, onEvent, onEose);
    },
    storage: {
      async get(key) {
        await initPromise;
        return callRpc("storage.get", { key });
      },
      async set(key, value) {
        await initPromise;
        return callRpc("storage.set", { key, value });
      },
      async delete(key) {
        await initPromise;
        return callRpc("storage.delete", { key });
      },
      async clear() {
        await initPromise;
        return callRpc("storage.clear");
      }
    },
    intents: {
      async dispatch(action, data) {
        await initPromise;
        return callRpc("intent.dispatch", { action, data });
      },
      handle(action, handler) {
        intentHandlers.set(action, handler);
        const pending = pendingIntentInvocations.get(action);
        if (pending && pending.length > 0) {
          pendingIntentInvocations.delete(action);
          for (const d of pending) {
            try {
              handler(d);
            } catch (e) {
              console.error("Error executing pending intent handler:", e);
            }
          }
        }
        initPromise.then(() => {
          callRpc("intent.handle", { action });
        });
      },
      emit(event, data) {
        initPromise.then(() => {
          callRpc("intent.emit", { event, data });
        });
      },
      on(event, listener) {
        return () => {};
      }
    },
    ui: {
      toggleSlot(slot) {
        initPromise.then(() => {
          callRpc("ui.toggleSlot", { slot });
        });
      },
      openSlot(slot) {
        initPromise.then(() => {
          callRpc("ui.openSlot", { slot });
        });
      },
      closeSlot(slot) {
        initPromise.then(() => {
          callRpc("ui.closeSlot", { slot });
        });
      }
    },
    relays: {
      async list() {
        await initPromise;
        return callRpc("relays.list");
      },
      async add(url) {
        await initPromise;
        return callRpc("relays.add", { url });
      },
      async remove(url) {
        await initPromise;
        return callRpc("relays.remove", { url });
      }
    },
    profile: {
      async get(pubkey, options) {
        await initPromise;
        const params = typeof pubkey === "object" ? pubkey : { pubkey, ...(options || {}) };
        return callRpc("profile.get", params);
      },
      async publish(metadata) {
        await initPromise;
        return callRpc("profile.publish", { metadata });
      }
    },
    auth: {
      async getNpub() {
        await initPromise;
        return callRpc("auth.getNpub");
      },
      async getNsec() {
        await initPromise;
        return callRpc("auth.getNsec");
      },
      async switchKey(key) {
        await initPromise;
        const res = await callRpc("auth.switchKey", { key });
        if (res && res.pubkey && sessionInfo) {
          sessionInfo.userPubkey = res.pubkey;
        }
        return res;
      }
    }
  };

  // 9. NIP-21, Lightning & Cashu URI Protocol Interception
  function isProtocolUri(url) {
    if (typeof url !== "string") return false;
    const trimmed = url.trim().toLowerCase();
    return trimmed.startsWith("nostr:") || trimmed.startsWith("lightning:") || trimmed.startsWith("cashu:");
  }

  if (typeof document !== "undefined") {
    document.addEventListener("click", (e) => {
      let target = e.target;
      while (target && target !== document.body && target !== document.documentElement) {
        if (target.tagName === "A" && target.hasAttribute("href")) {
          const href = target.getAttribute("href");
          if (isProtocolUri(href)) {
            e.preventDefault();
            e.stopPropagation();
            initPromise.then(() => callRpc("kernel.handleUri", { uri: href }));
            return;
          }
        }
        target = target.parentNode;
      }
    }, true);
  }

  const originalWindowOpen = window.open;
  window.open = function(url, target, features) {
    if (isProtocolUri(url)) {
      initPromise.then(() => callRpc("kernel.handleUri", { uri: url }));
      return null;
    }
    return originalWindowOpen ? originalWindowOpen.apply(this, [url, target, features]) : null;
  };

  // 10. Web Share API Shim (navigator.share)
  if (typeof navigator !== "undefined") {
    navigator.share = async function(data) {
      await initPromise;
      return callRpc("kernel.handleShare", {
        title: data ? data.title : undefined,
        text: data ? data.text : undefined,
        url: data ? data.url : undefined
      });
    };

    // 11. Geolocation API Virtualization Shim
    const origGeo = navigator.geolocation;
    navigator.geolocation = {
      getCurrentPosition: function(successCallback, errorCallback, options) {
        initPromise.then(() => {
          callRpc("system.getGeolocation", options || {})
            .then((pos) => {
              if (pos && pos.coords) {
                if (typeof successCallback === "function") successCallback(pos);
              } else if (typeof errorCallback === "function") {
                errorCallback({ code: 1, message: "Geolocation denied" });
              }
            })
            .catch((err) => {
              if (origGeo && typeof origGeo.getCurrentPosition === "function") {
                try {
                  origGeo.getCurrentPosition(successCallback, errorCallback, options);
                  return;
                } catch (_) {}
              }
              if (typeof errorCallback === "function") {
                errorCallback({ code: 1, message: err?.message || "Geolocation permission denied" });
              }
            });
        });
      },
      watchPosition: function() { return 0; },
      clearWatch: function() {}
    };
  }

  // 11. Standard Web Intent CustomEvent Interception
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("intent", (e) => {
      const detail = e.detail;
      if (detail && detail.action && !detail.__omniInternal) {
        initPromise.then(() => callRpc("intent.dispatch", {
          action: detail.action,
          data: detail.data !== undefined ? detail.data : detail
        }));
      }
    });
  }

  console.log("⚡ [Omni Sandbox] Injected runtime loaded.");
})();
