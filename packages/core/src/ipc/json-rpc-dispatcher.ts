import {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  JsonRpcErrorCode,
  OmniManifest,
  UnsignedEvent
} from "@omni/types";
import { AclEngine } from "../acl/acl-engine.js";
import { PluginStorageManager } from "../storage/plugin-storage-manager.js";
import { IntentBroker } from "../intents/intent-broker.js";
import { SubscriptionCoordinator } from "../nostr/subscription-coordinator.js";
import { WebCryptoKeystore } from "../crypto/webcrypto-keystore.js";
import { RelayPool } from "../nostr/relay-pool.js";

export interface DispatcherContext {
  pluginId: string;
  manifest?: OmniManifest;
  port: MessagePort;
  aclEngine: AclEngine;
  storageManager: PluginStorageManager;
  intentBroker: IntentBroker;
  subscriptionCoordinator: SubscriptionCoordinator;
  keystore: WebCryptoKeystore;
  relayPool: RelayPool;
  onSlotAction?: (action: "toggle" | "open" | "close", slot: string) => void;
}

export class JsonRpcDispatcher {
  private ctx: DispatcherContext;
  private activeSubscriptions: Map<string, () => void> = new Map();

  constructor(ctx: DispatcherContext) {
    this.ctx = ctx;
    this.setupPortListener();
  }

  private setupPortListener(): void {
    this.ctx.port.onmessage = async (event) => {
      const req: JsonRpcRequest = event.data;
      if (!req || req.jsonrpc !== "2.0") return;

      try {
        const result = await this.handleRequest(req.method, req.params);
        const res: JsonRpcResponse = {
          jsonrpc: "2.0",
          id: req.id,
          result
        };
        this.ctx.port.postMessage(res);
      } catch (err: any) {
        const res: JsonRpcResponse = {
          jsonrpc: "2.0",
          id: req.id,
          error: {
            code: err.code || JsonRpcErrorCode.INTERNAL_ERROR,
            message: err.message || "Internal error",
            data: err.data
          }
        };
        this.ctx.port.postMessage(res);
      }
    };
  }

  private async handleRequest(method: string, params: any): Promise<any> {
    switch (method) {
      // 1. Nostr Public Key
      case "nostr.getPublicKey": {
        return this.ctx.keystore.getPublicKey();
      }

      // 2. Sign Event
      case "nostr.signEvent": {
        const draft: UnsignedEvent = params?.event;
        if (!draft || typeof draft.kind !== "number") {
          throw { code: JsonRpcErrorCode.INVALID_PARAMS, message: "Missing or invalid draft event" };
        }

        const allowed = await this.ctx.aclEngine.checkPermission(
          this.ctx.pluginId,
          "nostr:sign",
          { kind: draft.kind }
        );
        if (!allowed) {
          throw {
            code: JsonRpcErrorCode.PERMISSION_DENIED,
            message: `Permission denied to sign event kind ${draft.kind}`
          };
        }

        return this.ctx.keystore.signEvent(draft);
      }

      // 3. Publish Event
      case "nostr.publish": {
        const draft: UnsignedEvent = params?.event;
        if (!draft) {
          throw { code: JsonRpcErrorCode.INVALID_PARAMS, message: "Missing draft event" };
        }

        const allowed = await this.ctx.aclEngine.checkPermission(
          this.ctx.pluginId,
          "nostr:write",
          { kind: draft.kind }
        );
        if (!allowed) {
          throw {
            code: JsonRpcErrorCode.PERMISSION_DENIED,
            message: `Permission denied to write event kind ${draft.kind}`
          };
        }

        const signed = await this.ctx.keystore.signEvent(draft);
        const acceptedRelays = await this.ctx.relayPool.publish(signed);

        return {
          id: signed.id,
          pubkey: signed.pubkey,
          sig: signed.sig,
          relays: acceptedRelays
        };
      }

      // 4. Nostr Subscription
      case "nostr.subscribe": {
        const subId = params?.subscriptionId;
        const filters = params?.filters || [];

        if (!subId || !Array.isArray(filters)) {
          throw { code: JsonRpcErrorCode.INVALID_PARAMS, message: "Invalid subscriptionId or filters" };
        }

        // Check read permission
        const allowed = await this.ctx.aclEngine.checkPermission(
          this.ctx.pluginId,
          "nostr:read",
          { filters }
        );
        if (!allowed) {
          throw { code: JsonRpcErrorCode.PERMISSION_DENIED, message: "Permission denied for nostr:read" };
        }

        // Cancel previous if active with same subId
        if (this.activeSubscriptions.has(subId)) {
          this.activeSubscriptions.get(subId)!();
        }

        const unsub = await this.ctx.subscriptionCoordinator.subscribe(
          `${this.ctx.pluginId}:${subId}`,
          filters,
          (event, metadata) => {
            const notification: JsonRpcNotification = {
              jsonrpc: "2.0",
              method: "nostr.stream.event",
              params: {
                subscriptionId: subId,
                event,
                fromCache: metadata.fromCache,
                relay: metadata.relay
              }
            };
            this.ctx.port.postMessage(notification);
          },
          () => {
            const notification: JsonRpcNotification = {
              jsonrpc: "2.0",
              method: "nostr.stream.eose",
              params: { subscriptionId: subId }
            };
            this.ctx.port.postMessage(notification);
          }
        );

        this.activeSubscriptions.set(subId, unsub);
        return { subscriptionId: subId, status: "subscribed" };
      }

      // 5. Nostr Unsubscribe
      case "nostr.unsubscribe": {
        const subId = params?.subscriptionId;
        if (subId && this.activeSubscriptions.has(subId)) {
          this.activeSubscriptions.get(subId)!();
          this.activeSubscriptions.delete(subId);
        }
        return { subscriptionId: subId, status: "unsubscribed" };
      }

      // 6. Scoped Storage
      case "storage.get": {
        return this.ctx.storageManager.get(this.ctx.pluginId, params.key);
      }

      case "storage.set": {
        return this.ctx.storageManager.set(this.ctx.pluginId, params.key, params.value);
      }

      case "storage.delete": {
        return this.ctx.storageManager.delete(this.ctx.pluginId, params.key);
      }

      case "storage.clear": {
        return this.ctx.storageManager.clear(this.ctx.pluginId);
      }

      // 7. Intents
      case "intent.dispatch": {
        return this.ctx.intentBroker.dispatch(this.ctx.pluginId, params.action, params.data);
      }

      case "intent.emit": {
        this.ctx.intentBroker.emit(params.event, params.data, this.ctx.pluginId);
        return { success: true };
      }

      // 8. UI Slot Actions
      case "ui.toggleSlot": {
        if (this.ctx.onSlotAction) this.ctx.onSlotAction("toggle", params.slot);
        return { success: true };
      }

      default:
        throw { code: JsonRpcErrorCode.METHOD_NOT_FOUND, message: `Unknown method: ${method}` };
    }
  }

  destroy(): void {
    for (const unsub of this.activeSubscriptions.values()) {
      unsub();
    }
    this.activeSubscriptions.clear();
    this.ctx.intentBroker.unregisterHandlers(this.ctx.pluginId);
  }
}
