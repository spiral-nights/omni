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

export function isPrivateOrLocalHost(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".local")) {
      return true;
    }
    const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const b1 = parseInt(ipv4Match[1], 10);
      const b2 = parseInt(ipv4Match[2], 10);
      if (b1 === 10) return true;
      if (b1 === 127) return true;
      if (b1 === 169 && b2 === 254) return true;
      if (b1 === 172 && b2 >= 16 && b2 <= 31) return true;
      if (b1 === 192 && b2 === 168) return true;
      if (b1 === 0) return true;
    }
  } catch {}
  return false;
}

let cachedHostVoices: SpeechSynthesisVoice[] = [];
let voiceListenerAttached = false;

function ensureVoiceListener(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || voiceListenerAttached) {
    return;
  }
  voiceListenerAttached = true;
  try {
    if (typeof window.speechSynthesis.getVoices === "function") {
      const v = window.speechSynthesis.getVoices();
      if (Array.isArray(v) && v.length > 0) {
        cachedHostVoices = v;
      }
    }
    if (typeof window.speechSynthesis.addEventListener === "function") {
      window.speechSynthesis.addEventListener("voiceschanged", () => {
        try {
          cachedHostVoices = window.speechSynthesis.getVoices();
        } catch (_) {}
      });
    }
    const prevOnVoices = window.speechSynthesis.onvoiceschanged;
    window.speechSynthesis.onvoiceschanged = (ev) => {
      try {
        cachedHostVoices = window.speechSynthesis.getVoices();
      } catch (_) {}
      if (typeof prevOnVoices === "function") {
        prevOnVoices.call(window.speechSynthesis, ev);
      }
    };
  } catch (_) {}
}

export function selectBestVoice(
  voices: SpeechSynthesisVoice[],
  targetLang: string = "en-US",
  preferredVoiceName?: string
): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  // 1. Explicit preference match
  if (preferredVoiceName) {
    const cleanPref = preferredVoiceName.toLowerCase();
    const exact = voices.find(
      (v) => (v.name && v.name.toLowerCase() === cleanPref) || (v.voiceURI && v.voiceURI.toLowerCase() === cleanPref)
    );
    if (exact) return exact;
    const partial = voices.find(
      (v) => (v.name && v.name.toLowerCase().includes(cleanPref)) || (v.voiceURI && v.voiceURI.toLowerCase().includes(cleanPref))
    );
    if (partial) return partial;
  }

  const langPrefix = (targetLang || "en").split("-")[0].toLowerCase();
  const matchingVoices = voices.filter((v) => {
    const vLang = (v.lang || "").replace("_", "-").toLowerCase();
    return vLang.startsWith(langPrefix);
  });

  const pool = matchingVoices.length > 0 ? matchingVoices : voices;

  function scoreVoice(v: SpeechSynthesisVoice): number {
    const name = (v.name || "").toLowerCase();
    const uri = (v.voiceURI || "").toLowerCase();
    let score = 0;

    // Heavily penalize robotic engines like eSpeak
    if (name.includes("espeak") || uri.includes("espeak")) {
      return -100;
    }

    // Chrome's built-in Google voices & Natural neural voices
    if (name.includes("google us english")) score += 80;
    else if (name.includes("google") && name.includes("english")) score += 70;
    else if (name.includes("natural")) score += 65;
    else if (name.includes("google")) score += 50;
    else if (name.includes("premium") || name.includes("enhanced")) score += 45;
    else if (name.includes("samantha") || name.includes("jenny") || name.includes("aria") || name.includes("ava")) score += 35;

    // Non-local service in Chrome indicates high-quality remote/network synthesizer
    if (!v.localService) score += 20;

    // Exact language match (e.g. en-US vs just en)
    const targetNorm = targetLang.replace("_", "-").toLowerCase();
    const voiceNorm = (v.lang || "").replace("_", "-").toLowerCase();
    if (voiceNorm === targetNorm) score += 10;
    else if (voiceNorm.startsWith(langPrefix)) score += 5;

    // Browser default voice flag (only positive if not espeak)
    if (v.default) score += 2;

    return score;
  }

  let bestVoice = pool[0];
  let highestScore = scoreVoice(bestVoice);

  for (let i = 1; i < pool.length; i++) {
    const s = scoreVoice(pool[i]);
    if (s > highestScore) {
      highestScore = s;
      bestVoice = pool[i];
    }
  }

  return bestVoice;
}

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
  onSlotAction?: (action: "toggle" | "open" | "close" | "scrollToTop", slot: string) => void;
  onScrollTo?: (params: any) => void;
  onHandleUri?: (uri: string, sourcePluginId: string) => Promise<any>;
  onHandleShare?: (payload: any, sourcePluginId: string) => Promise<any>;
  onHistoryPush?: (params: { state: any; title: string; url: string }) => Promise<any> | any;
  onHistoryReplace?: (params: { state: any; title: string; url: string }) => Promise<any> | any;
  onHistoryBack?: () => Promise<any> | any;
  onHistoryGo?: (delta?: number) => Promise<any> | any;
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
        await this.ctx.eventStore.saveEvent(signed);

        if (params?.localOnly === true) {
          return {
            id: signed.id,
            pubkey: signed.pubkey,
            sig: signed.sig,
            relays: []
          };
        }

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

      // 7d. History & Navigation Virtualization
      case "kernel.historyPush": {
        if (this.ctx.onHistoryPush) {
          return this.ctx.onHistoryPush(params);
        }
        return { success: true };
      }

      case "kernel.historyReplace": {
        if (this.ctx.onHistoryReplace) {
          return this.ctx.onHistoryReplace(params);
        }
        return { success: true };
      }

      case "kernel.historyBack": {
        if (this.ctx.onHistoryBack) {
          return this.ctx.onHistoryBack();
        }
        return { success: true };
      }

      case "kernel.historyGo": {
        if (this.ctx.onHistoryGo) {
          return this.ctx.onHistoryGo(params?.delta);
        }
        return { success: true };
      }

      // 8. UI Slot Actions
      case "ui.scrollTo": {
        if (this.ctx.onScrollTo) {
          this.ctx.onScrollTo(params);
        } else if (this.ctx.onSlotAction) {
          this.ctx.onSlotAction("scrollToTop", params?.slot || "main");
        }
        return { success: true };
      }

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
        let url = params?.url?.trim();
        if (!url) {
          throw { code: JsonRpcErrorCode.INVALID_PARAMS, message: "Missing relay url" };
        }
        if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
          url = `wss://${url}`;
        }
        this.ctx.relayPool.addRelay(url);
        return { success: true, url };
      }

      case "relays.remove": {
        const allowed = await this.ctx.aclEngine.checkPermission(this.ctx.pluginId, "relays:manage");
        if (!allowed) {
          throw { code: JsonRpcErrorCode.PERMISSION_DENIED, message: "Permission denied for relays:manage" };
        }
        let url = params?.url?.trim();
        if (!url) throw { code: JsonRpcErrorCode.INVALID_PARAMS, message: "Missing relay url" };
        if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
          url = `wss://${url}`;
        }
        this.ctx.relayPool.removeRelay(url);
        return { success: true, url };
      }

      // 10. Profile & Identity
      case "profile.get": {
        const pubkey = params?.pubkey || (await this.ctx.keystore.getPublicKey());
        const events = await this.ctx.eventStore.getEvents({ kinds: [0], authors: [pubkey], limit: 1 });
        if (events.length > 0 && !params?.syncRemote) {
          try {
            return JSON.parse(events[0].content);
          } catch {
            return null;
          }
        }
        const remote = await this.fetchRemoteProfile(pubkey, params?.timeoutMs || 3000);
        if (remote) return remote;
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
        const allowed = await this.ctx.aclEngine.checkPermission(this.ctx.pluginId, "nostr:write", { kind: 0 });
        if (!allowed) {
          throw { code: JsonRpcErrorCode.PERMISSION_DENIED, message: "Permission denied for nostr:write (kind 0)" };
        }
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
        throw {
          code: JsonRpcErrorCode.PERMISSION_DENIED,
          message: "Access to private key (nsec) is strictly prohibited. Use standard NIP-07 (window.nostr) for cryptographic operations."
        };
      }

      case "auth.switchKey": {
        const hasPermission = await this.ctx.aclEngine.checkPermission(
          this.ctx.pluginId,
          "identity:manage_keys",
          { action: "switchKey" }
        );
        if (!hasPermission) {
          throw {
            code: JsonRpcErrorCode.PERMISSION_DENIED,
            message: `Plugin '${this.ctx.pluginId}' does not have the 'identity:manage_keys' permission to switch the active identity.`
          };
        }

        const key = String(params?.key || params?.privateKey || "").trim();
        if (!key) {
          throw {
            code: JsonRpcErrorCode.INVALID_PARAMS,
            message: "Missing private key string (expected nsec1... or 64-char hex string)"
          };
        }

        try {
          this.ctx.keystore.setPrivateKey(key);
        } catch (err: any) {
          throw {
            code: JsonRpcErrorCode.INVALID_PARAMS,
            message: err?.message || "Invalid private key format"
          };
        }

        return {
          success: true,
          pubkey: await this.ctx.keystore.getPublicKey(),
          npub: await this.ctx.keystore.getNpub()
        };
      }

      case "auth.generateKey": {
        const hasPermission = await this.ctx.aclEngine.checkPermission(
          this.ctx.pluginId,
          "identity:manage_keys",
          { action: "generateKey" }
        );
        if (!hasPermission) {
          throw {
            code: JsonRpcErrorCode.PERMISSION_DENIED,
            message: `Plugin '${this.ctx.pluginId}' does not have the 'identity:manage_keys' permission.`
          };
        }

        const freshHex = WebCryptoKeystore.generatePrivateKey();
        this.ctx.keystore.setPrivateKey(freshHex);

        return {
          success: true,
          pubkey: await this.ctx.keystore.getPublicKey(),
          npub: await this.ctx.keystore.getNpub()
        };
      }

      case "blossom.upload":
      case "http.fetch": {
        const url = String(params?.url || "");
        const reqMethod = String(params?.method || "GET").toUpperCase();
        const headers = params?.headers || {};
        const bodyBytes =
          params?.bytes instanceof Uint8Array
            ? params.bytes
            : Array.isArray(params?.bytes)
            ? new Uint8Array(params.bytes)
            : new Uint8Array(0);

        if (!url || !/^https?:\/\//i.test(url)) {
          throw { code: JsonRpcErrorCode.INVALID_PARAMS, message: "Invalid HTTP URL" };
        }
        // SSRF protection: reject private network and metadata endpoints
        if (isPrivateOrLocalHost(url)) {
          throw {
            code: JsonRpcErrorCode.PERMISSION_DENIED,
            message: "Access to private or local network resources is restricted (SSRF protection)."
          };
        }
        const fetchInit: RequestInit = {
          method: reqMethod,
          headers
        };
        if (reqMethod !== "GET" && reqMethod !== "HEAD") {
          fetchInit.body = bodyBytes as any;
        }
        const resp = await fetch(url, fetchInit);
        const contentType =
          typeof resp?.headers?.get === "function" ? resp.headers.get("content-type") || "" : "";
        let respBytes = new Uint8Array(0);
        let text = "";
        try {
          if (typeof resp?.arrayBuffer === "function") {
            const ab = await resp.arrayBuffer();
            respBytes = new Uint8Array(ab);
            text = new TextDecoder().decode(respBytes);
          } else if (typeof resp?.text === "function") {
            text = await resp.text();
            respBytes = new TextEncoder().encode(text);
          }
        } catch {}
        return {
          ok: Boolean(resp?.ok),
          status: resp?.status || 200,
          contentType,
          bytes: Array.from(respBytes),
          bodyText: text
        };
      }

      // 12. Host Speech Synthesis Bridge (Text-to-Speech)
      case "system.getVoices": {
        ensureVoiceListener();
        let list: any[] = [];
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          try {
            let voices = cachedHostVoices;
            if ((!voices || voices.length === 0) && typeof window.speechSynthesis.getVoices === "function") {
              voices = cachedHostVoices = window.speechSynthesis.getVoices();
            }
            if (Array.isArray(voices)) {
              list = voices.map((v) => ({
                name: v.name,
                lang: v.lang,
                voiceURI: v.voiceURI,
                default: v.default,
                localService: v.localService
              }));
            }
          } catch (_) {}
        }
        return { voices: list };
      }

      case "system.speak": {
        const text = String(params?.text || "").trim();
        if (!text) return { success: false };
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          try {
            ensureVoiceListener();
            if (window.speechSynthesis.paused) {
              window.speechSynthesis.resume();
            }
            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            if (params.rate) utterance.rate = Number(params.rate);
            if (params.pitch) utterance.pitch = Number(params.pitch);
            if (params.lang) utterance.lang = String(params.lang);

            // Select highest quality / natural voice for clear speech
            let voices = cachedHostVoices;
            if (!voices || voices.length === 0) {
              if (typeof window.speechSynthesis.getVoices === "function") {
                const fresh = window.speechSynthesis.getVoices();
                if (Array.isArray(fresh) && fresh.length > 0) {
                  voices = cachedHostVoices = fresh;
                }
              }
            }
            const chosenVoice = selectBestVoice(voices, params?.lang || "en-US", params?.voice);
            if (chosenVoice) {
              utterance.voice = chosenVoice;
            }

            // Keep reference on window to prevent Chrome V8 garbage-collection bug
            (window as any).__omniActiveUtterance = utterance;
            utterance.onend = utterance.onerror = () => {
              if ((window as any).__omniActiveUtterance === utterance) {
                (window as any).__omniActiveUtterance = null;
              }
            };

            // In Chrome, cancel() is asynchronous; small timeout ensures utterance is queued properly
            setTimeout(() => {
              try {
                if (window.speechSynthesis.paused) {
                  window.speechSynthesis.resume();
                }
                window.speechSynthesis.speak(utterance);
              } catch (e) {
                console.warn("[Omni Host] Speech speak error:", e);
              }
            }, 15);

            return { success: true };
          } catch (err: any) {
            console.warn("[Omni Host] SpeechSynthesis dispatch error:", err);
            return { success: false, error: String(err) };
          }
        }
        return { success: false, reason: "SpeechSynthesis not supported on host" };
      }

      case "system.cancelSpeech": {
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          try {
            window.speechSynthesis.cancel();
            (window as any).__omniActiveUtterance = null;
          } catch (_) {}
        }
        return { success: true };
      }

      case "system.getGeolocation": {
        const allowed = await this.ctx.aclEngine.checkPermission(
          this.ctx.pluginId,
          "system:geolocation"
        );
        if (!allowed) {
          throw {
            code: JsonRpcErrorCode.PERMISSION_DENIED,
            message: `Location access denied for "${this.ctx.pluginId}". Enable GPS in Omni Settings -> Plugins.`
          };
        }

        if (typeof navigator === "undefined" || !navigator.geolocation) {
          throw { code: JsonRpcErrorCode.INTERNAL_ERROR, message: "Geolocation not supported by host environment" };
        }

        return new Promise((resolve, reject) => {
          const timeout = typeof params?.timeout === "number" ? Math.max(params.timeout, 15000) : 15000;
          const highAccuracy = params?.enableHighAccuracy ?? true;

          const requestCoords = (useHighAccuracy: boolean) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                resolve({
                  coords: {
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    altitude: pos.coords.altitude,
                    altitudeAccuracy: pos.coords.altitudeAccuracy,
                    heading: pos.coords.heading,
                    speed: pos.coords.speed
                  },
                  timestamp: pos.timestamp
                });
              },
              (err) => {
                // If high accuracy failed (e.g. timeout or unavailable on Linux/desktop without GPS hardware),
                // automatically retry with standard accuracy.
                if (useHighAccuracy && (err.code === 2 || err.code === 3)) {
                  requestCoords(false);
                  return;
                }
                let msg = err.message || "Geolocation permission denied";
                if (err.code === 1) {
                  msg = "Browser location permission denied. Check your browser address bar location settings.";
                } else if (err.code === 2) {
                  msg = "Location unavailable. Please search by city or zip code.";
                } else if (err.code === 3) {
                  msg = "Location request timed out. Please try again or search by city.";
                }
                reject({ code: JsonRpcErrorCode.INTERNAL_ERROR, message: msg });
              },
              { enableHighAccuracy: useHighAccuracy, timeout, maximumAge: 60000 }
            );
          };

          requestCoords(highAccuracy);
        });
      }

      default:
        throw { code: JsonRpcErrorCode.METHOD_NOT_FOUND, message: `Unknown method: ${method}` };
    }
  }

  private async fetchRemoteProfile(pubkey: string, timeoutMs = 3000): Promise<Record<string, any> | null> {
    const filter = { kinds: [0], authors: [pubkey], limit: 1 };
    return new Promise((resolve) => {
      let resolved = false;
      let latestEvent: any = null;
      let debounceTimer: any = null;
      const eosedRelays = new Set<string>();

      const finish = async () => {
        if (resolved) return;
        resolved = true;
        if (debounceTimer) clearTimeout(debounceTimer);
        clearTimeout(timer);
        unsubscribe();
        if (latestEvent) {
          await this.ctx.eventStore.saveEvent(latestEvent);
          try {
            resolve(JSON.parse(latestEvent.content));
          } catch {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      };

      const timer = setTimeout(finish, timeoutMs);
      const subId = `profile-get-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const unsubscribe = this.ctx.relayPool.subscribe(
        subId,
        [filter],
        (ev) => {
          if (!latestEvent || ev.created_at > latestEvent.created_at) {
            latestEvent = ev;
          }
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            finish();
          }, 300);
        },
        (relayUrl) => {
          if (relayUrl) eosedRelays.add(relayUrl);
          const connectedCount = this.ctx.relayPool.getConnectedRelayCount();
          const targetCount = connectedCount > 0 ? connectedCount : 1;
          if (eosedRelays.size >= targetCount) {
            if (debounceTimer) clearTimeout(debounceTimer);
            clearTimeout(timer);
            finish();
          }
        }
      );
    });
  }

  destroy(): void {
    for (const unsub of this.activeSubscriptions.values()) {
      unsub();
    }
    this.activeSubscriptions.clear();
    this.ctx.intentBroker.unregisterHandlers(this.ctx.pluginId);
  }
}
