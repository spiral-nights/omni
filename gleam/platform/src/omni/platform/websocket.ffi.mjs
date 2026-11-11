import { Ok, Error } from "../../gleam.mjs";

export function error_nil() {
  return new Error(undefined);
}

export function connect(url, on_open, on_message, on_close, on_error) {
  let ws;
  let isClosed = false;
  try {
    const WS = typeof WebSocket !== "undefined" ? WebSocket : globalThis.WebSocket;
    if (!WS) {
      throw new globalThis.Error("WebSocket API is not available in environment");
    }
    ws = new WS(url);
  } catch (err) {
    setTimeout(() => {
      on_error(String(err && err.message ? err.message : err));
    }, 0);
    return {
      send() { return false; },
      close() { isClosed = true; },
      raw: null
    };
  }

  ws.onopen = () => {
    if (!isClosed) on_open();
  };
  ws.onmessage = (event) => {
    if (!isClosed) {
      const text = typeof event.data === "string" ? event.data : String(event.data);
      on_message(text);
    }
  };
  ws.onclose = (event) => {
    if (!isClosed) {
      isClosed = true;
      on_close(event.code || 1000, event.reason || "");
    }
  };
  ws.onerror = (event) => {
    if (!isClosed) {
      const msg = event && event.message ? String(event.message) : "WebSocket error";
      on_error(msg);
    }
  };

  return {
    send(text) {
      if (ws && ws.readyState === 1 /* OPEN */ && !isClosed) {
        try {
          ws.send(text);
          return true;
        } catch (_e) {
          return false;
        }
      }
      return false;
    },
    close(code, reason) {
      isClosed = true;
      try {
        if (ws) ws.close(code, reason);
      } catch (_e) {}
    },
    raw: ws
  };
}

export function send(conn, text) {
  if (conn && typeof conn.send === "function") {
    return conn.send(text);
  }
  return false;
}

export function close(conn, code, reason) {
  if (conn && typeof conn.close === "function") {
    conn.close(code, reason);
  }
}

export function make_fake(on_send, on_close) {
  return {
    send(text) {
      return on_send(text);
    },
    close(code, reason) {
      on_close(code, reason);
    },
    raw: null
  };
}
