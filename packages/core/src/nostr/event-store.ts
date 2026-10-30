import { NostrEvent, NostrFilter } from "@omni/types";

export interface LocalEventStoreOptions {
  dbName?: string;
  maxNotes?: number; // Maximum non-user transient notes (kinds 1, 6, 7) to keep in IndexedDB. Default: 100
  maxFeedNotes?: number; // Backwards-compatible alias for maxNotes
  maxMemoryCacheSize?: number; // In-memory LRU cache size limit. Default: 500
  userPubkey?: string;
}

export class LocalEventStore {
  private db: IDBDatabase | null = null;
  private dbName: string;
  private maxNotes: number;
  private maxMemoryCacheSize: number;
  private userPubkey?: string;
  private memoryCache: Map<string, NostrEvent> = new Map();
  private pruneScheduled = false;

  constructor(options?: string | LocalEventStoreOptions) {
    if (typeof options === "string") {
      this.dbName = options;
      this.maxNotes = 100;
      this.maxMemoryCacheSize = 500;
    } else {
      this.dbName = options?.dbName || "omni_event_store";
      this.maxNotes = options?.maxNotes ?? options?.maxFeedNotes ?? 100;
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

  public isTransientNote(event: NostrEvent): boolean {
    return event.kind === 1 || event.kind === 6 || event.kind === 7;
  }

  public isFeedNote(event: NostrEvent): boolean {
    return this.isTransientNote(event);
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

  private async processDeletionEvent(deletionEvent: NostrEvent): Promise<void> {
    if (!this.db || deletionEvent.kind !== 5) return;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(["events", "event_tags"], "readwrite");
        const store = tx.objectStore("events");
        const tagStore = tx.objectStore("event_tags");
        const pubkeyIndex = store.index("pubkey");
        const req = pubkeyIndex.openCursor(IDBKeyRange.only(deletionEvent.pubkey));

        const targetEventIds = new Set(
          deletionEvent.tags.filter((t) => t[0] === "e" && t[1]).map((t) => t[1])
        );
        const targetCoordinates = new Set(
          deletionEvent.tags.filter((t) => t[0] === "a" && t[1]).map((t) => t[1])
        );

        req.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (!cursor) return;

          const existing = cursor.value as NostrEvent;
          let shouldDelete = false;

          if (targetEventIds.has(existing.id)) {
            shouldDelete = true;
          }

          if (!shouldDelete && targetCoordinates.size > 0 && this.isParameterizedReplaceable(existing)) {
            const existingDTag = existing.tags.find((t) => t[0] === "d")?.[1] || "";
            const coord = `${existing.kind}:${existing.pubkey}:${existingDTag}`;
            if (targetCoordinates.has(coord)) {
              shouldDelete = true;
            }
          }

          if (shouldDelete) {
            cursor.delete();
            this.deleteTagsForEvent(tagStore, existing.id);
            this.memoryCache.delete(existing.id);
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
      this.pruneTransientNotes().catch(() => {});
    }, 500);
  }

  async pruneTransientNotes(maxNotes: number = this.maxNotes): Promise<number> {
    if (!this.db) await this.init();

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(["events", "event_tags"], "readwrite");
        const eventStore = tx.objectStore("events");
        const tagStore = tx.objectStore("event_tags");
        const index = eventStore.index("kind_created");

        const transientKinds = [1, 6, 7];
        let totalDeleted = 0;
        let currentKindIndex = 0;

        const pruneNextKind = () => {
          if (currentKindIndex >= transientKinds.length) {
            return;
          }
          const kind = transientKinds[currentKindIndex++];
          const range = IDBKeyRange.bound([kind, 0], [kind, Number.MAX_SAFE_INTEGER]);
          const req = index.openCursor(range, "prev"); // newest first

          let count = 0;

          req.onsuccess = (e) => {
            const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
            if (!cursor) {
              pruneNextKind();
              return;
            }

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
              totalDeleted++;
            }
            cursor.continue();
          };

          req.onerror = () => pruneNextKind();
        };

        pruneNextKind();

        tx.oncomplete = () => resolve(totalDeleted);
        tx.onerror = () => resolve(totalDeleted);
      } catch {
        resolve(0);
      }
    });
  }

  async pruneFeedNotes(maxNotes?: number): Promise<number> {
    return this.pruneTransientNotes(maxNotes ?? this.maxNotes);
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
          // If NIP-09 event deletion (kind 5), remove matching authored events from storage
          if (event.kind === 5) {
            this.processDeletionEvent(event).catch(() => {});
          }

          // If replaceable or parameterized-replaceable, clean older versions
          if (this.isReplaceable(event) || this.isParameterizedReplaceable(event)) {
            this.cleanOlderReplaceable(event).catch(() => {});
          }

          // If transient public note and not the user's own note, schedule LRU prune
          if (this.isTransientNote(event) && (!this.userPubkey || event.pubkey !== this.userPubkey)) {
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

      // Determine the most selective index to query based on filter
      let req: IDBRequest<IDBCursorWithValue | null>;

      if (filter.kinds && filter.kinds.length === 1) {
        const kind = filter.kinds[0];
        const kindIndex = store.index("kind_created");
        const lowerBound = filter.since !== undefined ? filter.since : 0;
        const upperBound = filter.until !== undefined ? filter.until : Number.MAX_SAFE_INTEGER;
        const range = IDBKeyRange.bound([kind, lowerBound], [kind, upperBound]);
        req = kindIndex.openCursor(range, "prev");
      } else if (filter.authors && filter.authors.length === 1 && (!filter.kinds || filter.kinds.length === 0)) {
        const pubkeyIndex = store.index("pubkey");
        req = pubkeyIndex.openCursor(IDBKeyRange.only(filter.authors[0]), "prev");
      } else {
        const createdIndex = store.index("created_at");
        let range: IDBKeyRange | null = null;
        if (filter.since !== undefined && filter.until !== undefined) {
          range = IDBKeyRange.bound(filter.since, filter.until);
        } else if (filter.since !== undefined) {
          range = IDBKeyRange.lowerBound(filter.since);
        } else if (filter.until !== undefined) {
          range = IDBKeyRange.upperBound(filter.until);
        }
        req = createdIndex.openCursor(range, "prev");
      }

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
