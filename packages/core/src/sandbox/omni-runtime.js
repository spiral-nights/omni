// Omni Injected Sandbox Runtime Bridge (omni-runtime.js)
(function () {
  let portSchemaBus = null;
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

  // 1. Transparent LocalStorage Shim (handles sandboxed opaque origin restrictions)
  // 1b. Standard Scroll API Shim (forwards scrollTo & scrollIntoView to host container)
  if (typeof window !== "undefined") {
    const origScrollTo = window.scrollTo;
    window.scrollTo = function (optionsOrX, y) {
      let top = 0;
      let left = 0;
      let behavior = "instant";
      if (typeof optionsOrX === "object" && optionsOrX !== null) {
        top = optionsOrX.top ?? 0;
        left = optionsOrX.left ?? 0;
        behavior = optionsOrX.behavior || "instant";
      } else {
        left = Number(optionsOrX) || 0;
        top = Number(y) || 0;
      }
      try {
        if (typeof origScrollTo === "function") {
          origScrollTo.apply(window, arguments);
        }
      } catch (_) {}
      initPromise.then(() => {
        callRpc("ui.scrollTo", { top, left, behavior }).catch(() => {});
      });
    };
    window.scroll = window.scrollTo;
  }

  if (typeof Element !== "undefined" && Element.prototype) {
    const origScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (arg) {
      try {
        if (typeof origScrollIntoView === "function") {
          origScrollIntoView.apply(this, arguments);
        }
      } catch (_) {}
      initPromise.then(() => {
        callRpc("ui.scrollTo", { top: 0, left: 0, behavior: "instant" }).catch(() => {});
      });
    };
  }

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

  // Schema-based UI forwarding using standard Web postMessage
  let pendingSchema = null;
  let hasDispatchedSchema = false;
  function forwardSchema(schema, componentId) {
    hasDispatchedSchema = true;
    const compId = componentId || (sessionInfo && sessionInfo.viewId) || "main";
    if (portSchemaBus) {
      try {
        portSchemaBus.postMessage({
          type: "schema",
          componentId: compId,
          schema: schema
        });
      } catch (_) {}
    } else {
      pendingSchema = { schema, componentId: compId };
    }

    try {
      if (typeof window !== "undefined" && window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: "omni:schema",
          componentId: compId,
          schema: schema
        }, "*");
      }
    } catch (_) {}
  }

  // Intercept standard window.parent.postMessage when inside an iframe
  try {
    if (typeof window !== "undefined" && window.parent && window.parent !== window) {
      const origParentPost = window.parent.postMessage ? window.parent.postMessage.bind(window.parent) : null;
      window.parent.postMessage = function(msg, targetOrigin, transfer) {
        if (msg && typeof msg === "object" && (msg.type === "omni:schema" || msg.type === "schema") && msg.schema) {
          forwardSchema(msg.schema, msg.componentId);
          return;
        }
        if (origParentPost) {
          return origParentPost(msg, targetOrigin, transfer);
        }
      };
    }
  } catch (_) {}

  // 2. Listen for Handshake and Messages from Host/Guest
  function handleInitMessage(event) {
    const data = event.data;
    if (!data) return;

    if ((data.type === "omni:schema" || data.type === "schema") && data.schema) {
      forwardSchema(data.schema, data.componentId);
      return;
    }

    if (data.type === "omni:init") {
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
      portSchemaBus = ports[0] || null;
      portKernelRpc = ports[1] || null;

      setupKernelRpc();
      setupSchemaBus();

      if (portSchemaBus && pendingSchema) {
        forwardSchema(pendingSchema.schema, pendingSchema.componentId);
        pendingSchema = null;
      }

      // Apply Host Theme Tokens to Guest DOM
      if (typeof document !== "undefined") {
        try {
          const docEl = document.documentElement;
          if (docEl && docEl.style) {
            docEl.style.backgroundColor = "transparent";
            docEl.style.colorScheme = "dark";
          }
          if (document.body && document.body.style) {
            document.body.style.backgroundColor = "transparent";
          }
        } catch (_) {}
      }

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

      // Check for inline JSON schema script
      const runAutoMount = () => {
        try {
          const jsonScript = document.querySelector('script[type="application/json"]#omni-schema, script[type="application/json"][data-omni-schema]');
          if (jsonScript && jsonScript.textContent) {
            const parsed = JSON.parse(jsonScript.textContent);
            if (parsed && typeof parsed === "object") {
              forwardSchema(parsed);
              return;
            }
          }
        } catch (err) {
          console.error("[Omni] Error parsing inline schema script:", err);
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
      } else if (msg.method === "history.popstate") {
        const delta = Number(msg.params && msg.params.delta) || -1;
        const state = msg.params && msg.params.state;
        const targetUrl = msg.params && msg.params.url;
        applyHistoryNavigate(delta, state, targetUrl);
      } else if (msg.method === "auth.keyChanged") {
        if (msg.params && msg.params.pubkey) {
          if (sessionInfo) sessionInfo.userPubkey = msg.params.pubkey;
          try {
            window.dispatchEvent(new CustomEvent("nostr:keychanged", { detail: { pubkey: msg.params.pubkey } }));
          } catch (_) {}
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
            const isLocalOnly = this.url.includes("local") || this.url.includes("offline");
            try {
              await callRpc("nostr.publish", { event, localOnly: isLocalOnly });
              const okEv = new MessageEvent("message", {
                data: JSON.stringify(["OK", event?.id || "", true, isLocalOnly ? "saved-locally" : ""])
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

  // 5. Schema Bus & Action Routing
  function setupSchemaBus() {
    if (!portSchemaBus) return;
    portSchemaBus.onmessage = (event) => {
      const data = event.data;
      if (!data) return;
      if (data.type === "action") {
        window.dispatchEvent(new MessageEvent("message", {
          data: {
            type: "omni:action",
            action: data.action,
            payload: data.payload,
            componentId: data.componentId
          }
        }));
        window.dispatchEvent(new CustomEvent("omni:action", {
          detail: {
            action: data.action,
            payload: data.payload,
            componentId: data.componentId
          }
        }));
      }
    };
  }

  function detectInlineSchema() {
    if (typeof document === "undefined") return;
    const script = document.querySelector('script[type="application/json"]#omni-schema, script[type="omni:schema"]');
    if (script && script.textContent) {
      try {
        const schema = JSON.parse(script.textContent);
        forwardSchema(schema);
      } catch (e) {
        console.error("[OmniRuntime] Failed to parse inline schema script:", e);
      }
    }
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", detectInlineSchema);
    } else {
      detectInlineSchema();
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
    registerComponent(id, renderFn) {},
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
        if (sessionInfo && sessionInfo.userPubkey) {
          return sessionInfo.userPubkey;
        }
        return callRpc("auth.getNpub");
      },
      async switchKey(key) {
        await initPromise;
        const res = await callRpc("auth.switchKey", { key });
        if (res && res.pubkey && sessionInfo) {
          sessionInfo.userPubkey = res.pubkey;
        }
        return res;
      },
      async generateKey() {
        await initPromise;
        const res = await callRpc("auth.generateKey");
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
              if (typeof errorCallback === "function") {
                errorCallback({ code: 1, message: err?.message || "Geolocation permission denied" });
              }
            });
        });
      },
      watchPosition: function(successCallback, errorCallback, options) {
        this.getCurrentPosition(successCallback, errorCallback, options);
        return 1;
      },
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

  // 12. Standard Web History & Sub-Route Virtualization Shim
  const initialSearch = (typeof window !== "undefined" && window.location && window.location.search) || "";
  const initialHash = (typeof window !== "undefined" && window.location && window.location.hash) || "";
  const initialHref = (typeof window !== "undefined" && window.location && window.location.href) || "";

  let virtualSearch = initialSearch;
  let virtualHash = initialHash;

  const virtualHistory = {
    entries: [{
      state: (typeof window !== "undefined" && window.history && window.history.state) || null,
      title: (typeof document !== "undefined" && document.title) || "",
      url: initialHref,
      search: initialSearch,
      hash: initialHash
    }],
    index: 0
  };

  function parseUrlParts(urlStr) {
    if (!urlStr || typeof urlStr !== "string") return { search: virtualSearch, hash: virtualHash };
    let search = "";
    let hash = "";
    const hashIdx = urlStr.indexOf("#");
    let beforeHash = urlStr;
    if (hashIdx !== -1) {
      hash = urlStr.slice(hashIdx);
      beforeHash = urlStr.slice(0, hashIdx);
    }
    const qIdx = beforeHash.indexOf("?");
    if (qIdx !== -1) {
      search = beforeHash.slice(qIdx);
    }
    return { search, hash };
  }

  function updateVirtualLocation(search, hash) {
    if (search !== undefined && search !== null) {
      virtualSearch = search ? (search.startsWith("?") ? search : `?${search}`) : "";
    }
    if (hash !== undefined && hash !== null) {
      virtualHash = hash ? (hash.startsWith("#") ? hash : `#${hash}`) : "";
    }
  }

  function applyHistoryNavigate(delta, state, targetUrl) {
    if (virtualHistory.entries.length > 0) {
      virtualHistory.index = Math.max(0, Math.min(virtualHistory.entries.length - 1, virtualHistory.index + delta));
      const entry = virtualHistory.entries[virtualHistory.index];
      if (entry) {
        if (state !== undefined) entry.state = state;
        updateVirtualLocation(entry.search, entry.hash);
      }
    } else if (targetUrl) {
      const { search, hash } = parseUrlParts(targetUrl);
      updateVirtualLocation(search, hash);
    }
    const popState = state !== undefined ? state : (virtualHistory.entries[virtualHistory.index]?.state ?? null);
    try {
      const popEv = new PopStateEvent("popstate", { state: popState });
      window.dispatchEvent(popEv);
      if (typeof window.onpopstate === "function") {
        window.onpopstate(popEv);
      }
    } catch (e) {
      console.error("Error dispatching virtual popstate:", e);
    }
  }

  if (typeof window !== "undefined") {
    // Intercept History API
    if (window.History) {
      try {
        Object.defineProperty(window.History.prototype, "state", {
          get() {
            return virtualHistory.entries[virtualHistory.index]?.state ?? null;
          },
          configurable: true
        });
        Object.defineProperty(window.History.prototype, "length", {
          get() {
            return virtualHistory.entries.length;
          },
          configurable: true
        });
        window.History.prototype.pushState = function(state, title, url) {
          const { search, hash } = parseUrlParts(url);
          if (virtualHistory.index < virtualHistory.entries.length - 1) {
            virtualHistory.entries = virtualHistory.entries.slice(0, virtualHistory.index + 1);
          }
          virtualHistory.entries.push({
            state,
            title: title || "",
            url: String(url || ""),
            search,
            hash
          });
          virtualHistory.index = virtualHistory.entries.length - 1;
          updateVirtualLocation(search, hash);
          initPromise.then(() => callRpc("kernel.historyPush", {
            state,
            title: title || "",
            url: String(url || "")
          })).catch(() => {});
        };
        window.History.prototype.replaceState = function(state, title, url) {
          const { search, hash } = parseUrlParts(url);
          if (virtualHistory.entries[virtualHistory.index]) {
            virtualHistory.entries[virtualHistory.index] = {
              state,
              title: title || "",
              url: String(url || ""),
              search,
              hash
            };
          }
          updateVirtualLocation(search, hash);
          initPromise.then(() => callRpc("kernel.historyReplace", {
            state,
            title: title || "",
            url: String(url || "")
          })).catch(() => {});
        };
        window.History.prototype.back = function() {
          initPromise.then(() => callRpc("kernel.historyBack", {})).catch(() => {});
        };
        window.History.prototype.forward = function() {
          initPromise.then(() => callRpc("kernel.historyGo", { delta: 1 })).catch(() => {});
        };
        window.History.prototype.go = function(delta) {
          initPromise.then(() => callRpc("kernel.historyGo", { delta: Number(delta) || 0 })).catch(() => {});
        };
      } catch (e) {
        console.warn("Could not shim History.prototype:", e);
      }
    }

    // Intercept Location search and hash getters
    if (window.Location) {
      try {
        Object.defineProperty(window.Location.prototype, "search", {
          get() { return virtualSearch; },
          set(val) {
            virtualSearch = val ? (String(val).startsWith("?") ? String(val) : `?${val}`) : "";
          },
          configurable: true
        });
        Object.defineProperty(window.Location.prototype, "hash", {
          get() { return virtualHash; },
          set(val) {
            virtualHash = val ? (String(val).startsWith("#") ? String(val) : `#${val}`) : "";
          },
          configurable: true
        });
      } catch (e) {
        console.warn("Could not shim Location.prototype:", e);
      }
    }
  }

  console.log("⚡ [Omni Sandbox] Injected runtime loaded.");
})();
