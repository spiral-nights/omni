import { NostrEvent, NostrFilter, EventMetadata } from "@omni/types";
import { LocalEventStore } from "./event-store.js";
import { RelayPool } from "./relay-pool.js";
import { AclEngine } from "../acl/acl-engine.js";

export type CoordinatorEventCallback = (event: NostrEvent, metadata: EventMetadata) => void;
export type CoordinatorEoseCallback = () => void;

export class SubscriptionCoordinator {
  private eventStore: LocalEventStore;
  private relayPool: RelayPool;
  private aclEngine?: AclEngine;

  constructor(eventStore: LocalEventStore, relayPool: RelayPool, aclEngine?: AclEngine) {
    this.eventStore = eventStore;
    this.relayPool = relayPool;
    this.aclEngine = aclEngine;
  }

  async subscribe(
    subId: string,
    filters: NostrFilter[],
    onEvent: CoordinatorEventCallback,
    onEose?: CoordinatorEoseCallback,
    targetRelays?: string[]
  ): Promise<() => void> {
    const seenEventIds = new Set<string>();
    const pluginId = subId.includes(":") ? subId.slice(0, subId.indexOf(":")) : undefined;

    // 1. Immediate 0ms Local Cache Query with ACL Filtering
    for (const filter of filters) {
      try {
        const cachedEvents = await this.eventStore.getEvents(filter);
        for (const ev of cachedEvents) {
          if (!seenEventIds.has(ev.id)) {
            if (this.aclEngine && pluginId) {
              const allowed = await this.aclEngine.canReadEvent(pluginId, ev);
              if (!allowed) continue;
            }
            seenEventIds.add(ev.id);
            onEvent(ev, { fromCache: true });
          }
        }
      } catch (err) {
        console.warn("Error querying local event store:", err);
      }
    }

    // If targetRelays is explicitly an empty array (offline / local-only), skip remote relay network calls
    if (targetRelays !== undefined && targetRelays.length === 0) {
      if (onEose) {
        queueMicrotask(() => onEose());
      }
      return () => {
        seenEventIds.clear();
      };
    }

    // 2. Start Live Multiplexed Relay Subscription with ACL Filtering
    const eosedRelays = new Set<string>();
    let eoseFired = false;
    let eoseFallbackTimer: any = null;

    const fireEoseOnce = () => {
      if (eoseFired) return;
      eoseFired = true;
      if (eoseFallbackTimer) {
        clearTimeout(eoseFallbackTimer);
        eoseFallbackTimer = null;
      }
      if (onEose) onEose();
    };

    const allRelays = this.relayPool.getAllRelays().map((r) => r.url);
    const normalizedTargets = targetRelays && targetRelays.length > 0
      ? new Set(targetRelays.map((u) => u.trim().replace(/\/+$/, "")))
      : null;
    const expectedRelays = allRelays.filter((u) => !normalizedTargets || normalizedTargets.has(u.trim().replace(/\/+$/, "")));

    if (onEose && expectedRelays.length > 0) {
      eoseFallbackTimer = setTimeout(() => {
        fireEoseOnce();
      }, 2500);
    }

    const unsubscribeRelays = this.relayPool.subscribe(
      subId,
      filters,
      async (event, relayUrl) => {
        if (this.aclEngine && pluginId) {
          const allowed = await this.aclEngine.canReadEvent(pluginId, event);
          if (!allowed) return;
        }

        const isNew = !seenEventIds.has(event.id);
        if (seenEventIds.size >= 5000) {
          const oldest = seenEventIds.values().next().value;
          if (oldest) seenEventIds.delete(oldest);
        }
        seenEventIds.add(event.id);

        // Ingest into local store in background so UI rendering is never delayed
        this.eventStore.saveEvent(event).catch(() => {});

        if (isNew) {
          onEvent(event, { fromCache: false, relay: relayUrl });
        }
      },
      (relayUrl) => {
        if (relayUrl) {
          eosedRelays.add(relayUrl.trim().replace(/\/+$/, ""));
        }
        if (expectedRelays.length === 0 || expectedRelays.every((r) => eosedRelays.has(r))) {
          fireEoseOnce();
        }
      },
      targetRelays
    );

    if (this.relayPool.getAllRelays().length === 0 && onEose) {
      queueMicrotask(() => fireEoseOnce());
    }

    return () => {
      if (eoseFallbackTimer) {
        clearTimeout(eoseFallbackTimer);
        eoseFallbackTimer = null;
      }
      unsubscribeRelays();
      seenEventIds.clear();
    };
  }
}
