import { NostrEvent, NostrFilter } from "@omni/types";

export interface LocalEventStoreOptions {
  dbName?: string;
  maxFeedNotes?: number; // Maximum non-user feed notes (kinds 1, 6, 7) to keep in IndexedDB. Default: 100
  maxMemoryCacheSize?: number; // In-memory LRU cache size limit. Default: 500
  userPubkey?: string;
}

export class LocalEventStore {
  private db: IDBDatabase | null = null;
  private dbName: string;
  private maxFeedNotes: number;
  private maxMemoryCacheSize: number;
  private userPubkey?: string;
  private memoryCache: Map<string, NostrEvent> = new Map();
  private pruneScheduled = false;

  constructor(options?: string | LocalEventStoreOptions) {
    if (typeof options === "string") {
      this.dbName = options;
      this.maxFeedNotes = 100;
      this.maxMemoryCacheSize = 500;
    } else {
      this.dbName = options?.dbName || "omni_event_store";
      this.maxFeedNotes = options?.maxFeedNotes ?? 100;
      this.maxMemoryCacheSize = options?.maxMemoryCacheSize ?? 500;
      this.userPubkey = options?.userPubkey;
    }
  }

  public setUserPubkey(pubkey: string): void {
    this.userPubkey = pubkey;
  }

  public getUserPubkey(): string | undefined {
    return this.userPubkey;
  }

  public getMemoryCacheSize(): number {
    return this.memoryCache.size;
  }

  public isEphemeral(event: NostrEvent): boolean {
    return event.kind >= 20000 && event.kind < 30000;
  }

  public isReplaceable(event: NostrEvent): boolean {
    return event.kind === 0 || event.kind === 3 || (event.kind >= 10000 && event.kind < 20000);
  }

  public isParameterizedReplaceable(event: NostrEvent): boolean {
    return event.kind >= 30000 && event.kind < 40000;
  }

  public isFeedNote(event: NostrEvent): boolean {
    return event.kind === 1 || event.kind === 6 || event.kind === 7;
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

  private putInMemoryCache(event: NostrEvent): void {
    if (this.memoryCache.has(event.id)) {
      this.memoryCache.delete(event.id);
    } else if (this.memoryCache.size >= this.maxMemoryCacheSize) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey) {
        this.memoryCache.delete(oldestKey);
      }
    }
    this.memoryCache.set(event.id, event);
  }

  private deleteTagsForEvent(tagStore: IDBObjectStore, eventId: string): void {
    try {
      const tagIndex = tagStore.index("eventId");
      const tagReq = tagIndex.openCursor(IDBKeyRange.only(eventId));
      tagReq.onsuccess = (te) => {
        const tagCursor = (te.target as IDBRequest<IDBCursor>).result;
        if (tagCursor) {
          tagCursor.delete();
          tagCursor.continue();
        }
      };
    } catch {
      // Ignore background tag deletion errors
    }
  }

  private async cleanOlderReplaceable(event: NostrEvent): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(["events", "event_tags"], "readwrite");
        const store = tx.objectStore("events");
        const tagStore = tx.objectStore("event_tags");
        const pubkeyIndex = store.index("pubkey");
        const req = pubkeyIndex.openCursor(IDBKeyRange.only(event.pubkey));

        const isParameterized = this.isParameterizedReplaceable(event);
        const dTag = isParameterized ? (event.tags.find((t) => t[0] === "d")?.[1] || "") : undefined;

        req.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (!cursor) return;

          const existing = cursor.value as NostrEvent;
          if (existing.id !== event.id && existing.kind === event.kind && existing.created_at <= event.created_at) {
            if (isParameterized) {
              const existingDTag = existing.tags.find((t) => t[0] === "d")?.[1] || "";
              if (existingDTag === dTag) {
                cursor.delete();
                this.deleteTagsForEvent(tagStore, existing.id);
                this.memoryCache.delete(existing.id);
              }
            } else {
              cursor.delete();
              this.deleteTagsForEvent(tagStore, existing.id);
              this.memoryCache.delete(existing.id);
            }
          }
          cursor.continue();
        };

        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  private schedulePrune(): void {
    if (this.pruneScheduled) return;
    this.pruneScheduled = true;
    setTimeout(() => {
      this.pruneScheduled = false;
      this.pruneFeedNotes().catch(() => {});
    }, 500);
  }

  async pruneFeedNotes(maxNotes: number = this.maxFeedNotes): Promise<number> {
    if (!this.db) await this.init();

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(["events", "event_tags"], "readwrite");
        const eventStore = tx.objectStore("events");
        const tagStore = tx.objectStore("event_tags");
        const index = eventStore.index("kind_created");

        const range = IDBKeyRange.bound([1, 0], [1, Number.MAX_SAFE_INTEGER]);
        const req = index.openCursor(range, "prev"); // newest first

        let count = 0;
        let deleted = 0;

        req.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (!cursor) return;

          const ev = cursor.value as NostrEvent;
          // Protect user's own authored notes from being pruned
          if (this.userPubkey && ev.pubkey === this.userPubkey) {
            cursor.continue();
            return;
          }

          count++;
          if (count > maxNotes) {
            cursor.delete();
            this.deleteTagsForEvent(tagStore, ev.id);
            this.memoryCache.delete(ev.id);
            deleted++;
          }
          cursor.continue();
        };

        tx.oncomplete = () => resolve(deleted);
        tx.onerror = () => resolve(deleted);
      } catch {
        resolve(0);
      }
    });
  }

  async saveEvent(event: NostrEvent): Promise<boolean> {
    if (!this.db) await this.init();

    // 1. In-memory LRU cache update
    this.putInMemoryCache(event);

    // 2. Ephemeral events (kind 20000..29999) MUST NOT be persisted to disk per Nostr spec
    if (this.isEphemeral(event)) {
      return true;
    }

    return new Promise((resolve) => {
      try {
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

        tx.oncomplete = () => {
          // If replaceable or parameterized-replaceable, clean older versions
          if (this.isReplaceable(event) || this.isParameterizedReplaceable(event)) {
            this.cleanOlderReplaceable(event).catch(() => {});
          }

          // If public feed note and not the user's own note, schedule LRU prune
          if (this.isFeedNote(event) && (!this.userPubkey || event.pubkey !== this.userPubkey)) {
            this.schedulePrune();
          }

          resolve(true);
        };

        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
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

  async deleteEvent(id: string): Promise<boolean> {
    if (!this.db) await this.init();

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(["events", "event_tags"], "readwrite");
        const eventStore = tx.objectStore("events");
        const tagStore = tx.objectStore("event_tags");

        eventStore.delete(id);
        this.deleteTagsForEvent(tagStore, id);
        this.memoryCache.delete(id);

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  async getEventById(id: string): Promise<NostrEvent | null> {
    // Check in-memory LRU cache first (0ms instant)
    if (this.memoryCache.has(id)) {
      return this.memoryCache.get(id)!;
    }

    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(["events"], "readonly");
      const store = tx.objectStore("events");
      const req = store.get(id);

      req.onsuccess = () => {
        const ev = (req.result as NostrEvent) || null;
        if (ev) {
          this.putInMemoryCache(ev);
        }
        resolve(ev);
      };
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
          // Merge with any in-memory events that match filter (e.g. ephemeral events or live additions)
          const seen = new Set(events.map((e) => e.id));
          for (const ev of this.memoryCache.values()) {
            if (!seen.has(ev.id) && this.matchesFilter(ev, filter)) {
              events.push(ev);
              seen.add(ev.id);
            }
          }
          events.sort((a, b) => b.created_at - a.created_at);
          if (filter.limit && events.length > filter.limit) {
            events.length = filter.limit;
          }
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

  public matchesFilter(event: NostrEvent, filter: NostrFilter): boolean {
    if (filter.ids && !filter.ids.includes(event.id)) return false;
    if (filter.authors && !filter.authors.includes(event.pubkey)) return false;
    if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
    if (filter.since && event.created_at < filter.since) return false;
    if (filter.until && event.created_at > filter.until) return false;

    // NIP-50 search filter matching
    if ((filter as any).search && typeof (filter as any).search === "string" && (filter as any).search.trim()) {
      const searchTerms = (filter as any).search.toLowerCase().split(/\s+/).filter(Boolean);
      const content = (event.content || "").toLowerCase();
      if (!searchTerms.every((term: string) => content.includes(term))) {
        return false;
      }
    }

    // Check tag filters like `#p`, `#t`, `#e`, `#d`
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

  async clear(): Promise<void> {
    this.memoryCache.clear();
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(["events", "event_tags"], "readwrite");
        tx.objectStore("events").clear();
        tx.objectStore("event_tags").clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }
}
