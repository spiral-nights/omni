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
import { LocalEventStore } from "../nostr/event-store.js";

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
  eventStore: LocalEventStore;
  allowedRelays?: string[];
  onSlotAction?: (action: "toggle" | "open" | "close", slot: string) => void;
  onHandleUri?: (uri: string, sourcePluginId: string) => Promise<any>;
  onHandleShare?: (payload: any, sourcePluginId: string) => Promise<any>;
}

export class JsonRpcDispatcher {
  private ctx: DispatcherContext;
  private activeSubscriptions: Map<string, () => void> = new Map();

  constructor(ctx: DispatcherContext) {
    this.ctx = ctx;
    this.setupPortListener();
  }

  private getAllowedRelays(): string[] | undefined {
    if (this.ctx.allowedRelays && this.ctx.allowedRelays.length > 0) {
      return this.ctx.allowedRelays;
    }
    return undefined;
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

        // Defense against NIP-78 host workspace tampering:
        // Reserve the 'omni/*' and 'omni:*' d-tag namespace exclusively for the host shell.
        if (draft.kind === 30078 && Array.isArray(draft.tags)) {
          const dTag = draft.tags.find((t) => Array.isArray(t) && t[0] === "d")?.[1];
          if (typeof dTag === "string" && (dTag === "omni" || dTag.startsWith("omni/") || dTag.startsWith("omni:"))) {
            throw {
              code: JsonRpcErrorCode.PERMISSION_DENIED,
              message: `Permission denied: '${dTag}' NIP-78 identifier is reserved for Omni host workspace synchronization.`
            };
          }
        }

        const allowed = await this.ctx.aclEngine.checkPermission(
          this.ctx.pluginId,
          "nostr:sign",
          { kind: draft.kind, tags: draft.tags }
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

        // Defense against NIP-78 host workspace tampering:
        // Reserve the 'omni/*' and 'omni:*' d-tag namespace exclusively for the host shell.
        if (draft.kind === 30078 && Array.isArray(draft.tags)) {
          const dTag = draft.tags.find((t) => Array.isArray(t) && t[0] === "d")?.[1];
          if (typeof dTag === "string" && (dTag === "omni" || dTag.startsWith("omni/") || dTag.startsWith("omni:"))) {
            throw {
              code: JsonRpcErrorCode.PERMISSION_DENIED,
              message: `Permission denied: '${dTag}' NIP-78 identifier is reserved for Omni host workspace synchronization.`
            };
          }
        }

        const allowed = await this.ctx.aclEngine.checkPermission(
          this.ctx.pluginId,
          "nostr:write",
          { kind: draft.kind, tags: draft.tags }
        );
        if (!allowed) {
          throw {
            code: JsonRpcErrorCode.PERMISSION_DENIED,
            message: `Permission denied to write event kind ${draft.kind}`
          };
        }

        const signed = await this.ctx.keystore.signEvent(draft);
        const acceptedRelays = await this.ctx.relayPool.publish(signed, this.getAllowedRelays());

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
          },
          this.getAllowedRelays()
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

      // 5b. Nostr Get Relays (NIP-07)
      case "nostr.getRelays": {
        const allowed = this.getAllowedRelays();
        const normalizedAllowed = allowed && allowed.length > 0
          ? new Set(allowed.map((u) => u.trim().replace(/\/+$/, "")))
          : null;

        const relays = this.ctx.relayPool.getAllRelays();
        const map: Record<string, { read: boolean; write: boolean }> = {};
        for (const r of relays) {
          const norm = r.url.trim().replace(/\/+$/, "");
          if (normalizedAllowed && !normalizedAllowed.has(norm)) {
            continue;
          }
          map[r.url] = { read: true, write: true };
        }

        // If the plugin has explicitly specified custom relays that aren't yet in the pool
        if (normalizedAllowed) {
          for (const u of allowed!) {
            const norm = u.trim().replace(/\/+$/, "");
            if (!map[norm]) {
              map[norm] = { read: true, write: true };
            }
          }
        }

        return map;
      }

      // 5c. Nostr NIP-04 Encrypt/Decrypt
      case "nostr.nip04.encrypt": {
        const pubkey = params?.pubkey;
        const plaintext = params?.plaintext;
        if (!pubkey || plaintext === undefined) {
          throw { code: JsonRpcErrorCode.INVALID_PARAMS, message: "Missing pubkey or plaintext" };
        }
        const allowed = await this.ctx.aclEngine.checkPermission(this.ctx.pluginId, "nostr:sign");
        if (!allowed) {
          throw { code: JsonRpcErrorCode.PERMISSION_DENIED, message: "Permission denied for nostr:sign" };
        }
        return this.ctx.keystore.nip04Encrypt(pubkey, String(plaintext));
      }

      case "nostr.nip04.decrypt": {
        const pubkey = params?.pubkey;
        const ciphertext = params?.ciphertext;
        if (!pubkey || !ciphertext) {
          throw { code: JsonRpcErrorCode.INVALID_PARAMS, message: "Missing pubkey or ciphertext" };
        }
        const allowed = await this.ctx.aclEngine.checkPermission(this.ctx.pluginId, "nostr:sign");
        if (!allowed) {
          throw { code: JsonRpcErrorCode.PERMISSION_DENIED, message: "Permission denied for nostr:sign" };
        }
        return this.ctx.keystore.nip04Decrypt(pubkey, String(ciphertext));
      }

      // 5d. Nostr NIP-44 Encrypt/Decrypt
      case "nostr.nip44.encrypt": {
        return this.ctx.keystore.nip44Encrypt(params?.pubkey, params?.plaintext);
      }

      case "nostr.nip44.decrypt": {
        return this.ctx.keystore.nip44Decrypt(params?.pubkey, params?.ciphertext);
      }

      // 6. Scoped Storage
      case "storage.get": {
        const allowed = await this.ctx.aclEngine.checkPermission(this.ctx.pluginId, "storage:kv");
        if (!allowed) throw { code: JsonRpcErrorCode.PERMISSION_DENIED, message: "Permission denied for storage:kv" };
        return this.ctx.storageManager.get(this.ctx.pluginId, params.key);
      }

      case "storage.set": {
        const allowed = await this.ctx.aclEngine.checkPermission(this.ctx.pluginId, "storage:kv");
        if (!allowed) throw { code: JsonRpcErrorCode.PERMISSION_DENIED, message: "Permission denied for storage:kv" };
        return this.ctx.storageManager.set(this.ctx.pluginId, params.key, params.value);
      }

      case "storage.delete": {
        const allowed = await this.ctx.aclEngine.checkPermission(this.ctx.pluginId, "storage:kv");
        if (!allowed) throw { code: JsonRpcErrorCode.PERMISSION_DENIED, message: "Permission denied for storage:kv" };
        return this.ctx.storageManager.delete(this.ctx.pluginId, params.key);
      }

      case "storage.clear": {
        const allowed = await this.ctx.aclEngine.checkPermission(this.ctx.pluginId, "storage:kv");
        if (!allowed) throw { code: JsonRpcErrorCode.PERMISSION_DENIED, message: "Permission denied for storage:kv" };
        return this.ctx.storageManager.clear(this.ctx.pluginId);
      }

      // 7. Intents
      case "intent.dispatch": {
        const allowed = await this.ctx.aclEngine.checkPermission(this.ctx.pluginId, "intents:dispatch");
        if (!allowed) throw { code: JsonRpcErrorCode.PERMISSION_DENIED, message: "Permission denied for intents:dispatch" };
        return this.ctx.intentBroker.dispatch(this.ctx.pluginId, params.action, params.data);
      }

      case "intent.emit": {
        this.ctx.intentBroker.emit(params.event, params.data, this.ctx.pluginId);
        return { success: true };
      }

      case "intent.handle": {
        const action = params?.action;
        if (!action) throw { code: JsonRpcErrorCode.INVALID_PARAMS, message: "Missing action" };
        this.ctx.intentBroker.registerHandler(
          this.ctx.pluginId,
          action,
          async (data) => {
            const notification: JsonRpcNotification = {
              jsonrpc: "2.0",
              method: "intent.invoke",
              params: { action, data }
            };
            this.ctx.port.postMessage(notification);
            return { handled: true };
          },
          { name: this.ctx.manifest?.name, description: this.ctx.manifest?.description, isRpc: true }
        );
        return { success: true };
      }

      // 7b. Transparent Cross-App Protocol Link & Intent Interception (NIP-21, Lightning, Cashu)
      case "kernel.handleUri": {
        const uri = params?.uri;
        if (!uri) throw { code: JsonRpcErrorCode.INVALID_PARAMS, message: "Missing uri parameter" };
        if (this.ctx.onHandleUri) {
          return this.ctx.onHandleUri(uri, this.ctx.pluginId);
        }
        return { success: true, uri, handled: false };
      }

      // 7c. Web Share API Interception
      case "kernel.handleShare": {
        if (this.ctx.onHandleShare) {
          return this.ctx.onHandleShare(params, this.ctx.pluginId);
        }
        return { success: true, handled: false };
      }

      // 8. UI Slot Actions
      case "ui.toggleSlot": {
        if (this.ctx.onSlotAction) this.ctx.onSlotAction("toggle", params.slot);
        return { success: true };
      }

      case "ui.openSlot": {
        if (this.ctx.onSlotAction) this.ctx.onSlotAction("open", params.slot);
        return { success: true };
      }

      case "ui.closeSlot": {
        if (this.ctx.onSlotAction) this.ctx.onSlotAction("close", params.slot);
        return { success: true };
      }

      // 9. Relays Management
      case "relays.list": {
        return this.ctx.relayPool.getAllRelays();
      }

      case "relays.add": {
        const allowed = await this.ctx.aclEngine.checkPermission(this.ctx.pluginId, "relays:manage");
        if (!allowed) {
          throw { code: JsonRpcErrorCode.PERMISSION_DENIED, message: "Permission denied for relays:manage" };
        }
        if (!params?.url || !params.url.startsWith("ws")) {
          throw { code: JsonRpcErrorCode.INVALID_PARAMS, message: "Invalid relay URL (must start with ws:// or wss://)" };
        }
        this.ctx.relayPool.addRelay(params.url);
        return { success: true, url: params.url };
      }

      case "relays.remove": {
        const allowed = await this.ctx.aclEngine.checkPermission(this.ctx.pluginId, "relays:manage");
        if (!allowed) {
          throw { code: JsonRpcErrorCode.PERMISSION_DENIED, message: "Permission denied for relays:manage" };
        }
        if (!params?.url) throw { code: JsonRpcErrorCode.INVALID_PARAMS, message: "Missing relay url" };
        this.ctx.relayPool.removeRelay(params.url);
        return { success: true, url: params.url };
      }

      // 10. Profile & Identity
      case "profile.get": {
        const pubkey = params?.pubkey || (await this.ctx.keystore.getPublicKey());
        const events = await this.ctx.eventStore.getEvents({ kinds: [0], authors: [pubkey], limit: 1 });
        if (events.length > 0) {
          try {
            return JSON.parse(events[0].content);
          } catch {
            return null;
          }
        }
        return null;
      }

      case "profile.publish": {
        const pubkey = await this.ctx.keystore.getPublicKey();
        const draft = {
          kind: 0,
          content: JSON.stringify(params.metadata || {}),
          tags: [],
          created_at: Math.floor(Date.now() / 1000)
        };
        const signed = await this.ctx.keystore.signEvent(draft);
        await this.ctx.eventStore.saveEvent(signed);
        await this.ctx.relayPool.publish(signed);
        return signed;
      }

      case "auth.getNpub": {
        return this.ctx.keystore.getNpub();
      }

      case "auth.getNsec": {
        return this.ctx.keystore.getNsec();
      }

      case "auth.switchKey": {
        if (!params?.key) throw { code: JsonRpcErrorCode.INVALID_PARAMS, message: "Missing key" };
        this.ctx.keystore.setPrivateKey(params.key);
        return {
          pubkey: await this.ctx.keystore.getPublicKey(),
          npub: await this.ctx.keystore.getNpub()
        };
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
