import { NostrEvent, NostrFilter, Nip65Relay } from "@omni/types";

export const STORAGE_KEY_CONFIGURED_RELAYS = "omni_configured_relays";

export interface RelayPoolOptions {
  bootstrapRelays?: string[];
  maxRelays?: number;
  persistRelays?: boolean;
}

export type EventCallback = (event: NostrEvent, relayUrl: string) => void;
export type EoseCallback = (relayUrl: string) => void;
export type RelayStatusCallback = (relays: Array<{ url: string; status: "connected" | "connecting" | "disconnected" }>) => void;

export function parseNip65Relays(event: NostrEvent): Nip65Relay[] {
  if (event.kind !== 10002) return [];
  const list: Nip65Relay[] = [];
  for (const tag of event.tags) {
    if (tag[0] === "r" && tag[1]) {
      const url = tag[1].trim().replace(/\/+$/, "");
      const marker = tag[2]?.toLowerCase();
      let read = true;
      let write = true;
      if (marker === "read") {
        read = true;
        write = false;
      } else if (marker === "write") {
        read = false;
        write = true;
      }
      list.push({ url, read, write });
    }
  }
  return list;
}

export function buildNip65Tags(relays: Nip65Relay[]): string[][] {
  return relays.map((r) => {
    const norm = r.url.trim().replace(/\/+$/, "");
    if (r.read && !r.write) return ["r", norm, "read"];
    if (!r.read && r.write) return ["r", norm, "write"];
    return ["r", norm];
  });
}

interface ActiveSubscription {
  subId: string;
  filters: NostrFilter[];
  onEvent: EventCallback;
  onEose?: EoseCallback;
}

function getStorage(): Storage | null {
  try {
    if (typeof globalThis !== "undefined") {
      if ((globalThis as any).localStorage) return (globalThis as any).localStorage;
      if ((globalThis as any).window?.localStorage) return (globalThis as any).window.localStorage;
    }
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== "undefined") {
      return localStorage;
    }
  } catch {}
  return null;
}

const WS_CONNECTING = 0;
const WS_OPEN = 1;

export class RelayPool {
  private relays: Map<string, WebSocket> = new Map();
  private subscriptions: Map<string, ActiveSubscription> = new Map();
  private bootstrapUrls: string[];
  private userRelays: Map<string, Nip65Relay> = new Map();
  private authorRelays: Map<string, Nip65Relay[]> = new Map();
  private persistRelays: boolean;
  private statusListeners: Set<RelayStatusCallback> = new Set();

  constructor(options: RelayPoolOptions = {}) {
    this.persistRelays = options.persistRelays ?? true;
    const defaultBootstrap = [
      "wss://relay.damus.io",
      "wss://relay.ditto.pub",
      "wss://nos.lol",
      "wss://relay.nostr.band"
    ];

    if (options.bootstrapRelays !== undefined) {
      this.bootstrapUrls = [...options.bootstrapRelays];
      if (this.persistRelays && this.bootstrapUrls.length > 0) this.savePersistedRelays();
    } else {
      const persisted = this.persistRelays ? this.loadPersistedRelays() : null;
      if (persisted !== null && persisted.length > 0) {
        this.bootstrapUrls = persisted;
      } else {
        this.bootstrapUrls = defaultBootstrap;
      }
    }
  }

  private loadPersistedRelays(): string[] | null {
    const storage = getStorage();
    if (!storage) return null;
    try {
      const raw = storage.getItem(STORAGE_KEY_CONFIGURED_RELAYS);
      if (raw === null) return null;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((u: string) => {
          let s = String(u).trim();
          if (!s.startsWith("ws://") && !s.startsWith("wss://")) s = `wss://${s}`;
          return s.replace(/\/+$/, "");
        }).filter(Boolean);
      }
    } catch {
      // Ignore parse error
    }
    return null;
  }

  private savePersistedRelays(): void {
    if (!this.persistRelays) return;
    const storage = getStorage();
    if (!storage) return;
    try {
      storage.setItem(STORAGE_KEY_CONFIGURED_RELAYS, JSON.stringify(this.bootstrapUrls));
    } catch {
      // Ignore quota error
    }
  }

  onStatusChange(callback: RelayStatusCallback): () => void {
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  private notifyStatusChange(): void {
    if (this.statusListeners.size === 0) return;
    const all = this.getAllRelays();
    for (const listener of this.statusListeners) {
      try {
        listener(all);
      } catch {}
    }
  }

  async connect(): Promise<void> {
    if (typeof WebSocket === "undefined") {
      // In non-browser tests without global WebSocket
      return;
    }

    for (const url of this.bootstrapUrls) {
      this.connectRelay(url);
    }
  }

  private connectRelay(url: string): void {
    const normalized = url.trim().replace(/\/+$/, "");
    const existing = this.relays.get(normalized);
    if (existing && (existing.readyState === WS_OPEN || existing.readyState === WS_CONNECTING)) {
      return;
    }

    try {
      const ws = new WebSocket(normalized);

      ws.onopen = () => {
        // Re-send existing subscriptions
        for (const sub of this.subscriptions.values()) {
          ws.send(JSON.stringify(["REQ", sub.subId, ...sub.filters]));
        }
        this.notifyStatusChange();
      };

      ws.onmessage = (event) => {
        this.handleRelayMessage(event.data, normalized);
      };

      ws.onclose = () => {
        this.relays.delete(normalized);
        this.notifyStatusChange();
        // Attempt reconnect after delay
        setTimeout(() => this.connectRelay(normalized), 5000);
      };

      ws.onerror = () => {
        this.notifyStatusChange();
        ws.close();
      };

      this.relays.set(normalized, ws);
      this.notifyStatusChange();
    } catch {
      // Failed to open socket
    }
  }

  setUserRelays(relays: Nip65Relay[]): void {
    this.userRelays.clear();
    for (const r of relays) {
      const norm = r.url.trim().replace(/\/+$/, "");
      this.userRelays.set(norm, { ...r, url: norm });
      if (r.read || r.write) {
        this.addRelay(norm);
      }
    }
  }

  getUserRelays(): Nip65Relay[] {
    return Array.from(this.userRelays.values());
  }

  setAuthorRelays(pubkey: string, relays: Nip65Relay[]): void {
    const normalized = relays.map((r) => ({ ...r, url: r.url.trim().replace(/\/+$/, "") }));
    this.authorRelays.set(pubkey, normalized);
    for (const r of normalized) {
      if (r.read || r.write) {
        this.addRelay(r.url);
      }
    }
  }

  getAuthorRelays(pubkey: string): Nip65Relay[] | undefined {
    return this.authorRelays.get(pubkey);
  }

  getWriteRelayUrls(pubkey?: string): string[] {
    if (pubkey && this.authorRelays.has(pubkey)) {
      const writes = this.authorRelays.get(pubkey)!.filter((r) => r.write).map((r) => r.url);
      if (writes.length > 0) return Array.from(new Set(writes));
    }
    if (this.userRelays.size > 0) {
      const writes = Array.from(this.userRelays.values()).filter((r) => r.write).map((r) => r.url);
      if (writes.length > 0) return Array.from(new Set(writes));
    }
    return this.getConnectedRelayUrls();
  }

  getReadRelayUrls(pubkey?: string): string[] {
    if (pubkey && this.authorRelays.has(pubkey)) {
      const reads = this.authorRelays.get(pubkey)!.filter((r) => r.read).map((r) => r.url);
      if (reads.length > 0) return Array.from(new Set(reads));
    }
    if (this.userRelays.size > 0) {
      const reads = Array.from(this.userRelays.values()).filter((r) => r.read).map((r) => r.url);
      if (reads.length > 0) return Array.from(new Set(reads));
    }
    return this.getConnectedRelayUrls();
  }

  async publish(event: NostrEvent, targetRelays?: string[]): Promise<string[]> {
    const acceptedRelays: string[] = [];
    const message = JSON.stringify(["EVENT", event]);

    const targets = targetRelays && targetRelays.length > 0
      ? targetRelays
      : (this.userRelays.size > 0 ? this.getWriteRelayUrls(event.pubkey) : null);

    const normalizedTargets = targets
      ? new Set(targets.map((u) => u.trim().replace(/\/+$/, "")))
      : null;

    for (const [url, ws] of this.relays.entries()) {
      if (normalizedTargets && !normalizedTargets.has(url)) {
        continue;
      }
      if (ws.readyState === WS_OPEN) {
        ws.send(message);
        acceptedRelays.push(url);
      }
    }

    return acceptedRelays;
  }

  subscribe(
    subId: string,
    filters: NostrFilter[],
    onEvent: EventCallback,
    onEose?: EoseCallback,
    targetRelays?: string[]
  ): () => void {
    const sub: ActiveSubscription = { subId, filters, onEvent, onEose };
    this.subscriptions.set(subId, sub);

    const normalizedTargets = targetRelays && targetRelays.length > 0
      ? new Set(targetRelays.map((u) => u.trim().replace(/\/+$/, "")))
      : null;

    const message = JSON.stringify(["REQ", subId, ...filters]);
    for (const [url, ws] of this.relays.entries()) {
      if (normalizedTargets && !normalizedTargets.has(url)) {
        continue;
      }
      if (ws.readyState === WS_OPEN) {
        ws.send(message);
      }
    }

    return () => {
      this.subscriptions.delete(subId);
      const closeMsg = JSON.stringify(["CLOSE", subId]);
      for (const [url, ws] of this.relays.entries()) {
        if (normalizedTargets && !normalizedTargets.has(url)) {
          continue;
        }
        if (ws.readyState === WS_OPEN) {
          ws.send(closeMsg);
        }
      }
    };
  }

  disconnect(): void {
    for (const ws of this.relays.values()) {
      ws.close();
    }
    this.relays.clear();
    this.subscriptions.clear();
  }

  handleRelayMessage(messageData: string, relayUrl: string = "wss://mock.relay"): void {
    try {
      const data = JSON.parse(messageData);
      if (!Array.isArray(data)) return;

      const [type, subId, payload] = data;

      if (type === "EVENT" && subId) {
        const sub = this.subscriptions.get(subId);
        if (sub) {
          sub.onEvent(payload as NostrEvent, relayUrl);
        }
      } else if (type === "EOSE" && subId) {
        const sub = this.subscriptions.get(subId);
        if (sub && sub.onEose) {
          sub.onEose(relayUrl);
        }
      }
    } catch {
      // Ignore parse errors from relays
    }
  }

  getConnectedRelayCount(): number {
    let count = 0;
    for (const ws of this.relays.values()) {
      if (ws.readyState === WS_OPEN) count++;
    }
    return count;
  }

  getConnectedRelayUrls(): string[] {
    const urls: string[] = [];
    for (const [url, ws] of this.relays.entries()) {
      if (ws.readyState === WS_OPEN) urls.push(url);
    }
    return urls.length > 0 ? Array.from(new Set(urls)) : Array.from(new Set(this.bootstrapUrls));
  }

  getAllRelays(): Array<{ url: string; status: "connected" | "connecting" | "disconnected" }> {
    const list: Array<{ url: string; status: "connected" | "connecting" | "disconnected" }> = [];
    const allUrls = Array.from(new Set([
      ...this.bootstrapUrls.map((u) => u.trim().replace(/\/+$/, "")),
      ...Array.from(this.relays.keys()).map((u) => u.trim().replace(/\/+$/, ""))
    ]));
    for (const url of allUrls) {
      const ws = this.relays.get(url);
      if (!ws) {
        list.push({ url, status: "disconnected" });
      } else if (ws.readyState === WS_OPEN) {
        list.push({ url, status: "connected" });
      } else if (ws.readyState === WS_CONNECTING) {
        list.push({ url, status: "connecting" });
      } else {
        list.push({ url, status: "disconnected" });
      }
    }
    return list;
  }

  addRelay(url: string): void {
    let normalized = url.trim();
    if (!normalized.startsWith("ws://") && !normalized.startsWith("wss://")) {
      normalized = `wss://${normalized}`;
    }
    normalized = normalized.replace(/\/+$/, "");

    if (!this.bootstrapUrls.some((u) => u.trim().replace(/\/+$/, "") === normalized)) {
      this.bootstrapUrls.push(normalized);
      this.savePersistedRelays();
    }
    this.connectRelay(normalized);
    this.notifyStatusChange();
  }

  removeRelay(url: string): void {
    let normalized = url.trim();
    if (!normalized.startsWith("ws://") && !normalized.startsWith("wss://")) {
      normalized = `wss://${normalized}`;
    }
    normalized = normalized.replace(/\/+$/, "");

    const ws = this.relays.get(normalized);
    if (ws) {
      ws.close();
      this.relays.delete(normalized);
    }
    const idx = this.bootstrapUrls.findIndex((u) => u.trim().replace(/\/+$/, "") === normalized);
    if (idx !== -1) {
      this.bootstrapUrls.splice(idx, 1);
      this.savePersistedRelays();
    }
    this.notifyStatusChange();
  }

  async fetchEvent(filter: NostrFilter, timeoutMs = 4000): Promise<NostrEvent | null> {
    return new Promise((resolve) => {
      let resolved = false;
      const subId = `query_${Math.random().toString(36).slice(2, 9)}`;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          unsub();
          resolve(null);
        }
      }, timeoutMs);

      const unsub = this.subscribe(
        subId,
        [filter],
        (event) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            unsub();
            resolve(event);
          }
        },
        () => {
          // On EOSE
        }
      );
    });
  }
}
