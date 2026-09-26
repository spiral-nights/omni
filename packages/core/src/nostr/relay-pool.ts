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
        try {
          const data = JSON.parse(event.data);
          if (!Array.isArray(data)) return;

          const [type, subId, payload] = data;

          if (type === "EVENT" && subId) {
            const sub = this.subscriptions.get(subId);
            if (sub) {
              sub.onEvent(payload as NostrEvent, url);
            }
          } else if (type === "EOSE" && subId) {
            const sub = this.subscriptions.get(subId);
            if (sub && sub.onEose) {
              sub.onEose(url);
            }
          }
        } catch {
          // Ignore parse errors from relays
        }
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

  getConnectedRelayCount(): number {
    let count = 0;
    for (const ws of this.relays.values()) {
      if (ws.readyState === WebSocket.OPEN) count++;
    }
    return count;
  }
}
