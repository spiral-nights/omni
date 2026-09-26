import { NostrEvent, NostrFilter } from "@omni/types";

export class LocalEventStore {
  private db: IDBDatabase | null = null;
  private dbName: string;

  constructor(dbName: string = "omni_event_store") {
    this.dbName = dbName;
  }

  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 1. Events store
        if (!db.objectStoreNames.contains("events")) {
          const eventStore = db.createObjectStore("events", { keyPath: "id" });
          eventStore.createIndex("pubkey", "pubkey", { unique: false });
          eventStore.createIndex("kind", "kind", { unique: false });
          eventStore.createIndex("created_at", "created_at", { unique: false });
          eventStore.createIndex("kind_created", ["kind", "created_at"], { unique: false });
        }

        // 2. Event tags store
        if (!db.objectStoreNames.contains("event_tags")) {
          const tagStore = db.createObjectStore("event_tags", {
            autoIncrement: true
          });
          tagStore.createIndex("tag_lookup", ["tagKey", "tagValue", "created_at"], {
            unique: false
          });
          tagStore.createIndex("eventId", "eventId", { unique: false });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  async saveEvent(event: NostrEvent): Promise<boolean> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(["events", "event_tags"], "readwrite");
      const eventStore = tx.objectStore("events");
      const tagStore = tx.objectStore("event_tags");

      const putReq = eventStore.put(event);

      putReq.onsuccess = () => {
        // Index tags (#p, #e, #t, etc.)
        for (const tag of event.tags) {
          if (tag.length >= 2 && tag[0].length === 1) {
            tagStore.add({
              eventId: event.id,
              tagKey: tag[0],
              tagValue: tag[1],
              created_at: event.created_at
            });
          }
        }
      };

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => {
        // Likely already exists or constraint
        resolve(false);
      };
    });
  }

  async saveEvents(events: NostrEvent[]): Promise<number> {
    let saved = 0;
    for (const event of events) {
      const ok = await this.saveEvent(event);
      if (ok) saved++;
    }
    return saved;
  }

  async getEventById(id: string): Promise<NostrEvent | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(["events"], "readonly");
      const store = tx.objectStore("events");
      const req = store.get(id);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async getEvents(filter: NostrFilter): Promise<NostrEvent[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(["events"], "readonly");
      const store = tx.objectStore("events");
      const events: NostrEvent[] = [];

      // Open cursor on created_at in reverse (newest first)
      const index = store.index("created_at");
      const req = index.openCursor(null, "prev");

      req.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (!cursor) {
          resolve(events);
          return;
        }

        const ev = cursor.value as NostrEvent;
        if (this.matchesFilter(ev, filter)) {
          events.push(ev);
          if (filter.limit && events.length >= filter.limit) {
            resolve(events);
            return;
          }
        }

        cursor.continue();
      };

      req.onerror = () => reject(req.error);
    });
  }

  private matchesFilter(event: NostrEvent, filter: NostrFilter): boolean {
    if (filter.ids && !filter.ids.includes(event.id)) return false;
    if (filter.authors && !filter.authors.includes(event.pubkey)) return false;
    if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
    if (filter.since && event.created_at < filter.since) return false;
    if (filter.until && event.created_at > filter.until) return false;

    // Check tag filters like `#p`, `#t`, `#e`
    for (const [key, values] of Object.entries(filter)) {
      if (key.startsWith("#") && Array.isArray(values)) {
        const tagLetter = key.slice(1);
        const hasMatchingTag = event.tags.some(
          (t) => t[0] === tagLetter && values.includes(t[1])
        );
        if (!hasMatchingTag) return false;
      }
    }

    return true;
  }
}
