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

  // Active subscription listeners
  const subscriptions = new Map();
  // Intent handlers
  const intentHandlers = new Map();
  // Component registrations and instances
  const registeredComponents = new Map();
  const componentContexts = new Map();

  // 1. Listen for Handshake from Host
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (data && data.type === "omni:init") {
      portRemoteDom = event.ports ? event.ports[0] : null;
      portKernelRpc = event.ports ? event.ports[1] : null;

      setupKernelRpc();
      setupRemoteDom();

      initResolved();

      // Trigger all registered components
      for (const [id, renderFn] of registeredComponents.entries()) {
        mountComponent(id, renderFn);
      }
    }
  });

  // 2. Kernel RPC Communication
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
        const sub = subscriptions.get(msg.params.subscriptionId);
        if (sub && sub.onEvent) {
          sub.onEvent(msg.params.event, {
            fromCache: msg.params.fromCache,
            relay: msg.params.relay
          });
        }
      } else if (msg.method === "nostr.stream.eose") {
        const sub = subscriptions.get(msg.params.subscriptionId);
        if (sub && sub.onEose) {
          sub.onEose();
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

  // 3. Remote DOM Component Engine
  class RemoteDomContext {
    constructor(componentId) {
      this.componentId = componentId;
      this.nodes = new Map();
      this.eventListeners = new Map(); // nodeId -> Map(eventName -> Set(listener))
      this.nextNodeId = 100;
      this.mutationQueue = [];
      this.flushTimeout = null;

      // Root element with id "0"
      this.root = this.createRootElement();
    }

    sendMutation(record) {
      this.mutationQueue.push(record);
      if (!this.flushTimeout) {
        this.flushTimeout = setTimeout(() => {
          if (portRemoteDom && this.mutationQueue.length > 0) {
            portRemoteDom.postMessage({
              type: "mutate",
              componentId: this.componentId,
              records: this.mutationQueue
            });
            this.mutationQueue = [];
          }
          this.flushTimeout = null;
        }, 5);
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
      }

      class RemoteText extends RemoteNode {
        constructor(id, text) {
          super(id, 3);
          this._data = String(text ?? "");
        }
        get data() { return this._data; }
        set data(val) {
          this._data = String(val ?? "");
          self.sendMutation([2, this.id, this._data]);
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
          // Only send mutation if not root element '~'
          if (this.id !== "~") {
            // Mutation 3 with updateType 2 (UPDATE_PROPERTY_TYPE_ATTRIBUTE = 2)
            self.sendMutation([3, this.id, name, strVal, 2]);
          }
        }

        removeAttribute(name) {
          this.attributes.delete(name);
          if (this.id !== "~") {
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
          if (this.id !== "~") {
            // UPDATE_PROPERTY_TYPE_PROPERTY = 1
            self.sendMutation([3, this.id, "checked", boolVal, 1]);
          }
        }

        get value() { return this.getAttribute("value") || ""; }
        set value(val) {
          const strVal = String(val ?? "");
          this.setAttribute("value", strVal);
          if (this.id !== "~") {
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
          this.replaceChildren();
          if (val) {
            this.appendChild(new RemoteText(++self.nextNodeId, val));
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

          const serialized = self.serializeNode(child);
          self.sendMutation([0, this.id, serialized, index]);
          return child;
        }

        removeChild(child) {
          const idx = this.childNodes.indexOf(child);
          if (idx !== -1) {
            this.childNodes.splice(idx, 1);
            child.parentNode = null;
            self.sendMutation([1, this.id, idx]);
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
            // Inform host to listen to this event: Mutation 3 with updateType 3 (UPDATE_PROPERTY_TYPE_EVENT_LISTENER = 3)
            self.sendMutation([3, this.id, event, true, 3]);
          }
          this._listeners.get(event).add(listener);
        }

        removeEventListener(event, listener) {
          if (this._listeners.has(event)) {
            const set = this._listeners.get(event);
            set.delete(listener);
            if (set.size === 0) {
              this._listeners.delete(event);
              self.sendMutation([3, this.id, event, null, 3]);
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
      return {
        id: node.id,
        type: 1,
        element: node.localName,
        attributes: attrs,
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

  // 4. Standard NIP-07 (window.nostr)
  window.nostr = {
    async getPublicKey() {
      await initPromise;
      return callRpc("nostr.getPublicKey");
    },
    async signEvent(event) {
      await initPromise;
      return callRpc("nostr.signEvent", { event });
    }
  };

  // 5. Injected window.omni API
  window.omni = {
    get session() {
      return sessionInfo;
    },
    async ready() {
      return initPromise;
    },
    registerComponent(id, renderFn) {
      registeredComponents.set(id, renderFn);
      if (portRemoteDom) {
        mountComponent(id, renderFn);
      }
    },
    nostr: {
      async getPublicKey() {
        await initPromise;
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
        // Local listener
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
      async get(pubkey) {
        await initPromise;
        return callRpc("profile.get", { pubkey });
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
        return callRpc("auth.switchKey", { key });
      }
    }
  };

  console.log("⚡ [Omni Sandbox] Injected runtime loaded.");
})();
