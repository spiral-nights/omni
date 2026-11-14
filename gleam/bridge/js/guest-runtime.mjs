// Omni Gleam guest bridge runtime entry (Phase 7.11).
//
// Bundled into a single IIFE by `scripts/build-bridge.mjs` and injected as the
// sandbox `bridge_script`. It wires the Gleam shims to the host's dual-port
// handshake (`omni:init`): port 1 carries schema/action traffic, port 2 carries
// kernel JSON-RPC requests and streaming notifications.

import { Some } from "../build/dev/javascript/gleam_stdlib/gleam/option.mjs";
import { handle_client_frame } from "../build/dev/javascript/omni_bridge/omni/bridge/websocket_shim.mjs";
import { install as installStorage } from "../src/omni/bridge/storage_shim.ffi.mjs";
import { install as installLinks } from "../src/omni/bridge/links_shim.ffi.mjs";
import { install as installShare } from "../src/omni/bridge/share_shim.ffi.mjs";
import {
  emit_schema,
  install_actions,
} from "../src/omni/bridge/schema_bridge.ffi.mjs";
import {
  install as installNostr,
  route_notification as routeNostr,
} from "../src/omni/bridge/nostr_shim.ffi.mjs";
import {
  install as installSocket,
  route_notification as routeSocket,
} from "../src/omni/bridge/websocket_shim.ffi.mjs";

(function bootstrap() {
  if (typeof window === "undefined") return;

  let schemaPort = null;
  let rpcPort = null;
  const pending = new Map();
  const rpcQueue = [];
  let rpcCounter = 1;
  let session = null;

  const callRpc = (method, paramsJson) => {
    let params = {};
    if (paramsJson) {
      if (typeof paramsJson === "string") {
        try {
          params = JSON.parse(paramsJson);
        } catch {
          params = {};
        }
      } else if (typeof paramsJson === "object" && paramsJson !== null) {
        params = paramsJson;
      }
    }
    const id = rpcCounter++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      const frame = { jsonrpc: "2.0", id, method, params };
      if (!rpcPort) {
        rpcQueue.push(frame);
      } else {
        rpcPort.postMessage(frame);
      }
    });
  };

  const postToHost = (message) => {
    if (typeof window.parent !== "undefined" && window.parent !== window) {
      window.parent.postMessage(message, "*");
    }
    if (schemaPort) schemaPort.postMessage(message);
  };

  const emitInlineSchema = () => {
    if (typeof document === "undefined") return;
    const elem = document.getElementById("omni-schema");
    if (elem && elem.textContent) {
      try {
        const schema = JSON.parse(elem.textContent);
        postToHost({ type: "omni:schema", schema });
      } catch (err) {
        console.error("[Omni bridge] Failed to parse inline #omni-schema:", err);
      }
    }
  };

  const routeNotification = (data) => {
    if (!data || typeof data !== "object") return;
    const method = data.method || data.type;
    if (typeof method === "string" && method.startsWith("nostr.stream.")) {
      const raw = JSON.stringify(data);
      routeNostr(raw);
      routeSocket(raw);
      return;
    }
    if (data.type === "omni:action") {
      window.dispatchEvent(new MessageEvent("message", { data }));
    }
  };

  const onRpcMessage = (event) => {
    const message = event && event.data;
    if (!message || typeof message !== "object") return;
    if (message.id !== undefined && pending.has(message.id)) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        entry.reject(new Error(message.error.message || "RPC error"));
      } else {
        entry.resolve(message.result);
      }
      return;
    }
    routeNotification(message);
  };

  window.addEventListener("message", (event) => {
    const data = event && event.data;
    if (!data || data.type !== "omni:init") return;
    session = data.payload || {};
    const ports = (event.ports && event.ports.length > 0 ? event.ports : []);
    schemaPort = ports[0] || null;
    rpcPort = ports[1] || null;
    if (rpcPort) {
      rpcPort.onmessage = onRpcMessage;
      while (rpcQueue.length > 0) {
        const frame = rpcQueue.shift();
        rpcPort.postMessage(frame);
      }
    }
    if (schemaPort) {
      schemaPort.onmessage = (messageEvent) => routeNotification(messageEvent.data);
      emitInlineSchema();
    }
    if (session.pluginId) {
      installStorage(String(session.pluginId), callRpc);
    }
    if (session.route) window.__OMNI_ROUTE__ = session.route;
    if (session.viewId) window.__OMNI_VIEW__ = session.viewId;
  });

  // Standard shims are installed eagerly; RPC calls queue until `omni:init`.
  installNostr(callRpc);
  installSocket(callRpc, (rawFrame, localOnly) => {
    const result = handle_client_frame(rawFrame, localOnly, (method, params) => {
      callRpc(method, params);
    });
    return result instanceof Some ? result[0] : null;
  });
  installLinks(postToHost, callRpc);
  installShare(postToHost, callRpc);
  install_actions((rawAction) => {
    let data;
    try {
      data = JSON.parse(rawAction);
    } catch {
      return;
    }
    postToHost(data);
  });

  // Check inline schema on boot
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", emitInlineSchema);
    } else {
      emitInlineSchema();
    }
  }
})();
