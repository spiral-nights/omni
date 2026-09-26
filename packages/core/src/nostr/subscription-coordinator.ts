import { NostrEvent, NostrFilter, EventMetadata } from "@omni/types";
import { LocalEventStore } from "./event-store.js";
import { RelayPool } from "./relay-pool.js";

export type CoordinatorEventCallback = (event: NostrEvent, metadata: EventMetadata) => void;
export type CoordinatorEoseCallback = () => void;

export class SubscriptionCoordinator {
  private eventStore: LocalEventStore;
  private relayPool: RelayPool;

  constructor(eventStore: LocalEventStore, relayPool: RelayPool) {
    this.eventStore = eventStore;
    this.relayPool = relayPool;
  }

  async subscribe(
    subId: string,
    filters: NostrFilter[],
    onEvent: CoordinatorEventCallback,
    onEose?: CoordinatorEoseCallback
  ): Promise<() => void> {
    const seenEventIds = new Set<string>();

    // 1. Immediate 0ms Local Cache Query
    for (const filter of filters) {
      try {
        const cachedEvents = await this.eventStore.getEvents(filter);
        for (const ev of cachedEvents) {
          if (!seenEventIds.has(ev.id)) {
            seenEventIds.add(ev.id);
            onEvent(ev, { fromCache: true });
          }
        }
      } catch (err) {
        console.warn("Error querying local event store:", err);
      }
    }

    // 2. Start Live Multiplexed Relay Subscription
    const unsubscribeRelays = this.relayPool.subscribe(
      subId,
      filters,
      async (event, relayUrl) => {
        const isNew = !seenEventIds.has(event.id);
        seenEventIds.add(event.id);

        // Ingest into local store for future 0ms hits
        await this.eventStore.saveEvent(event);

        if (isNew) {
          onEvent(event, { fromCache: false, relay: relayUrl });
        }
      },
      () => {
        if (onEose) onEose();
      }
    );

    return () => {
      unsubscribeRelays();
      seenEventIds.clear();
    };
  }
}
