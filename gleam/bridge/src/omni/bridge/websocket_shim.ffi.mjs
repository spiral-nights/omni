const activeSubscriptions = new Map();

function makeEvent(name, init) {
  try {
    return new MessageEvent(name, init);
  } catch {
    const event = new Event(name);
    if (init && "data" in init) event.data = init.data;
    return event;
  }
}

export function install(call_rpc, handle_frame) {
  if (typeof window === "undefined") return;

  const rpc = (method, params) =>
    Promise.resolve(
      call_rpc(method, params === undefined ? "" : JSON.stringify(params)),
    );

  class VirtualWebSocket extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

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

      Promise.resolve().then(() => {
        if (this.readyState !== VirtualWebSocket.CONNECTING) return;
        this.readyState = VirtualWebSocket.OPEN;
        const event = makeEvent("open", {});
        if (typeof this.onopen === "function") this.onopen(event);
        this.dispatchEvent(event);
      });
    }

    send(data) {
      if (
        this.readyState !== VirtualWebSocket.OPEN &&
        this.readyState !== VirtualWebSocket.CONNECTING
      ) {
        throw new Error(
          "WebSocket is not open: readyState " + this.readyState,
        );
      }

      const raw = typeof data === "string" ? data : String(data);
      let frame = null;
      try {
        frame = JSON.parse(raw);
      } catch {
        frame = null;
      }

      const isLocal =
        this.url.includes("local") || this.url.includes("offline");

      if (Array.isArray(frame)) {
        if (frame[0] === "REQ") {
          this._subscriptions.add(frame[1]);
          activeSubscriptions.set(frame[1], this);
        } else if (frame[0] === "CLOSE") {
          this._subscriptions.delete(frame[1]);
          activeSubscriptions.delete(frame[1]);
        }
      }

      try {
        const echo = handle_frame(raw, isLocal);
        if (typeof echo === "string" && echo.length > 0) {
          const event = makeEvent("message", { data: echo });
          if (typeof this.onmessage === "function") this.onmessage(event);
          this.dispatchEvent(event);
        }
      } catch (err) {
        const notice = makeEvent("message", {
          data: JSON.stringify([
            "NOTICE",
            "Subscription error: " + (err && err.message ? err.message : "Unknown"),
          ]),
        });
        if (typeof this.onmessage === "function") this.onmessage(notice);
        this.dispatchEvent(notice);
      }
    }

    close(code, reason) {
      if (this.readyState === VirtualWebSocket.CLOSED) return;
      this.readyState = VirtualWebSocket.CLOSING;
      for (const subId of this._subscriptions) {
        activeSubscriptions.delete(subId);
        rpc("nostr.unsubscribe", { subscriptionId: subId });
      }
      this._subscriptions.clear();
      this.readyState = VirtualWebSocket.CLOSED;
      const event = makeEvent("close", {
        code: code || 1000,
        reason: reason || "Normal Closure",
        wasClean: true,
      });
      if (typeof this.onclose === "function") this.onclose(event);
      this.dispatchEvent(event);
    }
  }

  window.WebSocket = VirtualWebSocket;
  if (typeof globalThis !== "undefined") globalThis.WebSocket = VirtualWebSocket;
  if (typeof self !== "undefined") self.WebSocket = VirtualWebSocket;
}

export function route_notification(rawNotification) {
  let message;
  try {
    message =
      typeof rawNotification === "string"
        ? JSON.parse(rawNotification)
        : rawNotification;
  } catch {
    return;
  }
  if (!message || typeof message !== "object") return;
  const params = message.params || {};
  const subId = params.subscriptionId;
  if (!subId) return;
  const socket = activeSubscriptions.get(subId);
  if (!socket) return;

  let frame = null;
  if (message.method === "nostr.stream.event") {
    frame = JSON.stringify(["EVENT", subId, params.event]);
  } else if (message.method === "nostr.stream.eose") {
    frame = JSON.stringify(["EOSE", subId]);
  }
  if (!frame) return;

  const event = makeEvent("message", { data: frame });
  if (typeof socket.onmessage === "function") socket.onmessage(event);
  socket.dispatchEvent(event);
}
