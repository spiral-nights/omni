# 05. Nostr Relay & Local Cache Layer

## 1. Local-First Nostr Engine Architecture

In Omni, relay queries, event subscriptions, and caching are unified into a single host-level subsystem. Both the **native default feed in the Omni Web App** and all **sandboxed plugin widgets** share this exact same local-first Nostr engine and IndexedDB event store.

```
+-----------------------------------------------------------------------------------------------+
|                                      Omni Nostr Subsystem                                     |
|                                                                                               |
|  +-----------------------------------------------------------------------------------------+  |
|  |                            Unified Subscription Coordinator                             |  |
|  |       (Coordinates requests from Native Shell Feed and Sandboxed Plugin Components)     |  |
|  +-----------------------------------------------------------------------------------------+  |
|                   |                                                         |                 |
|       (1) Immediate Local Query                                 (2) Multiplexed Relay Sync    |
|                   v                                                         v                 |
|  +---------------------------------+                   +-----------------------------------+  |
|  |    Local IndexedDB Event Store  |                   |    Subscription Multiplexer (REQ) |  |
|  |  (Schema, Indices, Tag Lookup)  |                   | (Deduplication, Range Optimization)|  |
|  +---------------------------------+                   +-----------------------------------+  |
|                   |                                                         |                 |
|          [ 0ms Instant Yield ]                                              v                 |
|                   |                                    +-----------------------------------+  |
|                   |                                    |       Outbox & Gossip Router      |  |
|                   |                                    | (NIP-65 dynamic author write pool)|  |
|                   |                                    +-----------------------------------+  |
|                   |                                                         |                 |
|                   |                                    +-----------------------------------+  |
|                   |                                    |      Managed Relay Pool (WS)      |  |
|                   |                                    |  (Health, Reconnect, Backoff)     |  |
|                   |                                    +-----------------------------------+  |
|                   |                                                         |                 |
|                   v                                                         v                 |
|  +-----------------------------------------------------------------------------------------+  |
|  |                             Event Ingestion & Deduplication Pipeline                    |  |
|  |                 (Cryptographic Sig Check -> Store in IDB -> Stream to UI & Plugins)     |  |
|  +-----------------------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------------------+
```

---

## 2. Local-First 0ms Query Pipeline

When the native feed loads or when any plugin requests a subscription (`omni.nostr.subscribe(filters)`):

1. **Phase 1: Local Cache Lookup (0ms):**
   * Omni queries the local IndexedDB database matching the filters.
   * Cached events are sorted chronologically and immediately dispatched to the UI with `{ fromCache: true }`.
   * The feed/widget renders instantaneously without waiting for network round-trips.
2. **Phase 2: Network Delta Query:**
   * Omni computes the newest `created_at` timestamp present in the cache for those filters (`since: max_timestamp`).
   * Omni multiplexes the delta filter across the appropriate Nostr relays.
3. **Phase 3: Live Streaming & Cache Ingestion:**
   * As new events arrive from relays, they pass signature and schema verification, are saved to IndexedDB, and stream to the UI with `{ fromCache: false }`.
   * When relays report `EOSE`, Omni forwards the EOSE notification to the subscriber.

---

## 3. Local IndexedDB Event Store Schema

Omni uses an optimized IndexedDB schema designed for high-throughput Nostr event querying:

### Object Stores & Indexes

#### 1. `events` Store (Primary Key: `id` [Hex String])
* **Index: `pubkey`** -> Author public key
* **Index: `kind`** -> Event kind integer (1, 6, 30023, etc.)
* **Index: `created_at`** -> Creation unix timestamp
* **Index: `kind_created`** -> Compound Index `[kind, created_at]` for instant chronological feeds
* **Index: `kind_pubkey_created`** -> Compound Index `[kind, pubkey, created_at]` for author timelines
* **Index: `d_tag`** -> For parameterized replaceable events (`kind >= 30000 && kind < 40000`)

#### 2. `event_tags` Store (Primary Key: auto-increment `[eventId, tagKey, tagValue]`)
* **Index: `tag_lookup`** -> `[tagKey, tagValue, created_at]` (Enables instant `#e`, `#p`, `#t` tag resolution).

#### 3. `nip65_relay_lists` Store (Primary Key: `pubkey`)
* Stores parsed NIP-65 relay lists (`kind: 10002`) mapping authors to their preferred read/write relays.

---

## 4. Gossip & Outbox Routing Engine (NIP-65)

Rather than forcing all queries through a static list of 5-10 relays, Omni dynamically resolves relays based on the **Outbox Model**:

```
[ Subscribe to Authors: Alice, Bob, Charlie ]
                     |
                     v
   +------------------------------------+
   |  Query NIP-65 Cache for Each User  |
   +------------------------------------+
                     |
     Alice -> [wss://relay.alice.com, wss://damus.io]
     Bob   -> [wss://relay.primal.net, wss://damus.io]
     Charlie -> [wss://nos.lol, wss://relay.damus.io]
                     |
                     v
   +------------------------------------+
   |  Group and Budget Active Relays    |
   +------------------------------------+
     * wss://damus.io      -> Filter: [Alice, Bob, Charlie]
     * wss://relay.alice.com -> Filter: [Alice]
     * wss://relay.primal.net -> Filter: [Bob]
     * wss://nos.lol       -> Filter: [Charlie]
```

* **Relay Connection Budget:** Omni limits active simultaneous WebSockets (e.g. max 15-20 connections) using an LRU connection pool to preserve browser resources and battery.
* **Fallback Relays:** If an author has no published NIP-65 list, Omni falls back to the user's default configured bootstrap relays.

---

## 5. Filter Multiplexing & Deduplication

When multiple UI components or plugins request overlapping filters (e.g., Default Feed, Sidebar Trending Widget, and Chat Plugin all requesting `kind: 1` or profile metadata `kind: 0` for the same pubkeys):

1. **Filter Merging:** Omni merges identical filters over the shared WebSocket channel into a single Nostr `REQ`.
2. **Fan-Out Dispatch:** When an event arrives on the socket, Omni checks which active subscriptions match the event's tags, kind, and author, broadcasting it to all eligible subscribers simultaneously.
3. **Tear-Down:** When a subscriber unsubscribes, the host only closes the relay `REQ` if no other component or plugin is currently listening to that filter subset.

---

## 6. Cache Retention & Garbage Collection

To prevent IndexedDB from growing unbounded on web platforms:
* **Replaceable Events (NIP-01, NIP-16, NIP-33):** Newer versions of kind 0, 3, 10002, and 30000+ automatically overwrite/delete older versions.
* **Ephemeral Events (kind 20000-29999):** Dispatched in memory and **never written** to IndexedDB.
* **LRU Pruning:** An automated background job prunes regular events (e.g. kind 1 notes older than 30 days) if local storage exceeds a configurable threshold (e.g. 250MB), retaining pinned and favorited items.
