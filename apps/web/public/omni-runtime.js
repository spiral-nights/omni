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
  // Component registrations and instances
  const registeredComponents = new Map();
  const componentContexts = new Map();

  // 1. Transparent LocalStorage Shim (handles sandboxed opaque origin restrictions)
  try {
    window.localStorage.getItem("__omni_probe__");
  } catch (_) {
    const memoryStore = new Map();
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
      portRemoteDom = event.ports ? event.ports[0] : null;
      portKernelRpc = event.ports ? event.ports[1] : null;

      setupKernelRpc();
      setupRemoteDom();

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
    const remoteIdToNative = new Map();

    function mirrorNode(nativeNode) {
      if (!nativeNode) return null;
      if (nativeToRemote.has(nativeNode)) return nativeToRemote.get(nativeNode);

      if (nativeNode.nodeType === 3) {
        if (nativeNode.parentNode && (nativeNode.parentNode.nodeName === "SCRIPT" || nativeNode.parentNode.nodeName === "STYLE")) {
          return null;
        }
        const remoteText = ctx.root.createTextNode(nativeNode.data || "");
        nativeToRemote.set(nativeNode, remoteText);
        remoteIdToNative.set(remoteText.id, nativeNode);
        return remoteText;
      }

      if (nativeNode.nodeType === 1) {
        const tag = nativeNode.tagName.toLowerCase();
        if (tag === "script" || tag === "style" || tag === "link") return null;

        const remoteEl = ctx.root.createElement(tag);
        nativeToRemote.set(nativeNode, remoteEl);
        remoteIdToNative.set(remoteEl.id, nativeNode);

        if (nativeNode.attributes) {
          for (let i = 0; i < nativeNode.attributes.length; i++) {
            const attr = nativeNode.attributes[i];
            remoteEl.setAttribute(attr.name, attr.value);
          }
        }

        // Auto-register common interactive listeners
        if (["button", "input", "textarea", "select", "a"].includes(tag) || nativeNode.hasAttribute("onclick")) {
          remoteEl.addEventListener("click", () => {});
          remoteEl.addEventListener("input", () => {});
          remoteEl.addEventListener("change", () => {});
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
        if (detail) {
          if (detail.value !== undefined && "value" in nativeNode) nativeNode.value = detail.value;
          if (detail.checked !== undefined && "checked" in nativeNode) nativeNode.checked = detail.checked;
        }
        let ev;
        if (eventName === "click") {
          ev = new MouseEvent("click", { bubbles: true, cancelable: true });
        } else if (eventName === "input" || eventName === "change") {
          ev = new Event(eventName, { bubbles: true, cancelable: true });
        } else {
          ev = new CustomEvent(eventName, { bubbles: true, cancelable: true, detail });
        }
        nativeNode.dispatchEvent(ev);
      }
    };

    // Observe future native DOM mutations
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "childList") {
          const parentRemote = m.target === document.body ? ctx.root : nativeToRemote.get(m.target);
          if (!parentRemote) continue;

          for (const added of m.addedNodes) {
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
              if (val === null) {
                remoteEl.removeAttribute(attrName);
              } else {
                remoteEl.setAttribute(attrName, val);
              }
            }
          }
        } else if (m.type === "characterData") {
          const remoteText = nativeToRemote.get(m.target);
          if (remoteText) {
            remoteText.data = m.target.data || "";
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
  }

  // 7. Standard NIP-07 (window.nostr)
  window.nostr = {
    async getPublicKey() {
      await initPromise;
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
  }

  console.log("⚡ [Omni Sandbox] Injected runtime loaded.");
})();
