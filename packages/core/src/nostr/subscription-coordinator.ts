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

    // 2. Start Live Multiplexed Relay Subscription with ACL Filtering
    const unsubscribeRelays = this.relayPool.subscribe(
      subId,
      filters,
      async (event, relayUrl) => {
        if (this.aclEngine && pluginId) {
          const allowed = await this.aclEngine.canReadEvent(pluginId, event);
          if (!allowed) return;
        }

        const isNew = !seenEventIds.has(event.id);
        seenEventIds.add(event.id);

        // Ingest into local store in background so UI rendering is never delayed
        this.eventStore.saveEvent(event).catch(() => {});

        if (isNew) {
          onEvent(event, { fromCache: false, relay: relayUrl });
        }
      },
      () => {
        if (onEose) onEose();
      },
      targetRelays
    );

    if (this.relayPool.getAllRelays().length === 0 && onEose) {
      queueMicrotask(() => onEose());
    }

    return () => {
      unsubscribeRelays();
      seenEventIds.clear();
    };
  }
}
