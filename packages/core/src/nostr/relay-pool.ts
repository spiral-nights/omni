import { NostrEvent, NostrFilter } from "@omni/types";

export interface RelayPoolOptions {
  bootstrapRelays?: string[];
  maxRelays?: number;
}

export type EventCallback = (event: NostrEvent, relayUrl: string) => void;
export type EoseCallback = (relayUrl: string) => void;

interface ActiveSubscription {
  subId: string;
  filters: NostrFilter[];
  onEvent: EventCallback;
  onEose?: EoseCallback;
}

export class RelayPool {
  private relays: Map<string, WebSocket> = new Map();
  private subscriptions: Map<string, ActiveSubscription> = new Map();
  private bootstrapUrls: string[];

  constructor(options: RelayPoolOptions = {}) {
    this.bootstrapUrls = options.bootstrapRelays || [
      "wss://relay.damus.io",
      "wss://nos.lol",
      "wss://relay.nostr.band"
    ];
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
    if (this.relays.has(url)) return;

    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        // Re-send existing subscriptions
        for (const sub of this.subscriptions.values()) {
          ws.send(JSON.stringify(["REQ", sub.subId, ...sub.filters]));
        }
      };

      ws.onmessage = (event) => {
        this.handleRelayMessage(event.data, url);
      };

      ws.onclose = () => {
        this.relays.delete(url);
        // Attempt reconnect after delay
        setTimeout(() => this.connectRelay(url), 5000);
      };

      ws.onerror = () => {
        ws.close();
      };

      this.relays.set(url, ws);
    } catch {
      // Failed to open socket
    }
  }

  async publish(event: NostrEvent): Promise<string[]> {
    const acceptedRelays: string[] = [];
    const message = JSON.stringify(["EVENT", event]);

    for (const [url, ws] of this.relays.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
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
    onEose?: EoseCallback
  ): () => void {
    const sub: ActiveSubscription = { subId, filters, onEvent, onEose };
    this.subscriptions.set(subId, sub);

    const message = JSON.stringify(["REQ", subId, ...filters]);
    for (const ws of this.relays.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }

    return () => {
      this.subscriptions.delete(subId);
      const closeMsg = JSON.stringify(["CLOSE", subId]);
      for (const ws of this.relays.values()) {
        if (ws.readyState === WebSocket.OPEN) {
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
      if (ws.readyState === WebSocket.OPEN) count++;
    }
    return count;
  }

  getConnectedRelayUrls(): string[] {
    const urls: string[] = [];
    for (const [url, ws] of this.relays.entries()) {
      if (ws.readyState === WebSocket.OPEN) urls.push(url);
    }
    return urls.length > 0 ? urls : [...this.bootstrapUrls];
  }

  getAllRelays(): Array<{ url: string; status: "connected" | "connecting" | "disconnected" }> {
    const list: Array<{ url: string; status: "connected" | "connecting" | "disconnected" }> = [];
    const allUrls = Array.from(new Set([...this.bootstrapUrls, ...this.relays.keys()]));
    for (const url of allUrls) {
      const ws = this.relays.get(url);
      if (!ws) {
        list.push({ url, status: "disconnected" });
      } else if (ws.readyState === WebSocket.OPEN) {
        list.push({ url, status: "connected" });
      } else if (ws.readyState === WebSocket.CONNECTING) {
        list.push({ url, status: "connecting" });
      } else {
        list.push({ url, status: "disconnected" });
      }
    }
    return list;
  }

  addRelay(url: string): void {
    if (!this.bootstrapUrls.includes(url)) {
      this.bootstrapUrls.push(url);
    }
    this.connectRelay(url);
  }

  removeRelay(url: string): void {
    const ws = this.relays.get(url);
    if (ws) {
      ws.close();
      this.relays.delete(url);
    }
    const idx = this.bootstrapUrls.indexOf(url);
    if (idx !== -1) {
      this.bootstrapUrls.splice(idx, 1);
    }
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
