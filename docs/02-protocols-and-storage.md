# Omni — Nostr Protocols, Storage & Decentralized Distribution

> **Authoritative Reference for Nostr Specifications, Storage, and Protocol Interop.**  
> *Version 2.0 (Consolidated) — October 2026*

---

## 1. Local-First Event Storage & Relay Multiplexing

Omni operates on a local-first principle: all reads hit persistent local storage with 0ms latency, while background pools multiplex live WebSocket connections to decentralized relays.

```
┌─────────────────────────────────────────────────────────────┐
│                       Omni Application                      │
└──────────────┬───────────────────────────────┬──────────────┘
               │ 0ms Immediate Query           │ Live Stream
               ▼                               ▼
┌──────────────────────────────┐ ┌────────────────────────────┐
│   LocalEventStore (IDB)      │ │     RelayPool (WebSockets) │
│   • Database: omni_event_store│ │   • wss://relay.damus.io   │
│   • Indexed: kind, pubkey,   │ │   • wss://relay.ditto.pub  │
│     created_at, tags (#p, #e)│ │   • Automatic reconnect    │
└──────────────────────────────┘ └────────────────────────────┘
```

### 1.1 `LocalEventStore` (IndexedDB Embedded Cache & In-Memory LRU)
- **Database**: `omni_event_store` (IndexedDB).
- **Indices**:
  - `pubkey`, `kind`, `created_at`, compound `["kind", "created_at"]`.
  - Tag index store `event_tags` indexing single-letter tags (`#p`, `#e`, `#d`, `#t`).
- **Selective Persistence & Bounded Caching**:
  - **In-Memory LRU Cache**: Fast memory ring-buffer (up to 500 events) for 0ms queries without disk transactions.
  - **Ephemeral Events (`kind: 20000..29999`)**: Dispatched to live subscribers and cached in memory, but never written to disk per Nostr standard (NIP-01/16).
  - **Replaceable Events (`kind: 0, 3, 10000..19999`)**: Older versions from the same author are automatically pruned to prevent stale profiles and data bloat (NIP-16).
  - **Parameterized Replaceable Events (`kind: 30000..39999`)**: Older versions matching `(kind, pubkey, d-tag)` are pruned so only the latest workspace states or nsite definitions persist.
  - **Bounded Feed Notes (`kind: 1, 6, 7`)**: Public timeline notes are capped to `maxFeedNotes` (default: 100) via background LRU pruning to prevent storage quota exhaustion, while preserving the user's own authored notes permanently.
- **Guarantees**:
  - Every note, profile metadata, or NIP-78 workspace state published through the kernel is written to `LocalEventStore` **before** relay broadcast.
  - Subscriptions query `LocalEventStore` first, providing instant 0ms rendering even completely offline.

### 1.2 `RelayPool` (Live WebSocket Multiplexer)
- Default bootstrap relays:
  - `wss://relay.damus.io`
  - `wss://relay.ditto.pub`
- Handles automatic reconnect with exponential backoff on dropped sockets.
- Multiplexes subscriptions across all active relays, deduplicating events by ID before dispatching to listeners.

---

## 2. NIP-78 Workspace Layout Synchronization

Omni uses **NIP-78** (Arbitrary Custom App Data, `kind: 30078`) to synchronize user layout configurations, viewport assignments, and installed apps across all devices over Nostr.

### 2.1 Event Schema & Identifier
- **Kind**: `30078` (Parameterized Replaceable Event).
- **Tag**: `["d", "omni/workspace/v1"]`.
- **Content**: Serialized `OmniWorkspaceState` JSON payload:

```json
{
  "version": 1,
  "updatedAt": 1790456789000,
  "activePage": "org.omni.plugin.feed",
  "autoSync": true,
  "plugins": [
    {
      "id": "org.omni.plugin.feed",
      "viewport": "main",
      "enabled": true
    },
    {
      "id": "org.omni.plugin.profile-viewer",
      "viewport": "sidebar",
      "enabled": true
    },
    {
      "id": "org.omni.plugin.checklist",
      "viewport": "sidebar",
      "enabled": true
    }
  ]
}
```

### 2.2 Synchronization Engine
1. **0ms Local Persistence Fallback**:
   - Every layout customization (changing a viewport dropdown, toggling an app, reordering dock shortcuts) immediately writes to browser `localStorage` (`omni_workspace_state`).
   - On bootloader startup, `shell.loadInitialWorkspace()` reads this state instantly so apps mount directly into their saved slots with zero layout shift.
2. **Debounced Background Sync**:
   - Layout adjustments trigger a 1.2s debounced background call to `kernel.publishWorkspaceState()`.
   - The kernel signs the `kind: 30078` event via the active keystore, writes it to `LocalEventStore`, and broadcasts it to connected relays.
3. **Cloud Restore & Remote Polling**:
   - On boot, the client kicks off a background query for the latest remote `kind: 30078` event.
   - If a newer state from another device is resolved, the shell applies it seamlessly.
   - Users can manually trigger **"Sync to Nostr"** or **"Restore from Relays"** at any time from the Plugins Manager in Settings.

---

## 3. Decentralized Distribution (NIP-5A nsites & Blossom)

Omni eliminates proprietary manifests in favor of decentralized, open standards:

### 3.1 Pure NIP-5A Manifest Events (`kind: 35129`)
Apps and widgets are published as standard parameterized replaceable NIP-5A events:
- **Kind**: `35129`
- **Tags**:
  - `["d", "<identifier>"]`: Unique app slug.
  - `["name", "<App Name>"]`: Human-readable title.
  - `["description", "<Summary>"]`: Description.
  - `["icon", "<icon-url-or-name>"]`: Monochrome icon.
  - `["f", "index.html", "<sha256_hash>", "text/html"]`: File entry pointing to Blossom.
  - `["server", "https://cdn.satellite.earth"]`: Blossom CDN servers.

### 3.2 NIP-19 `naddr` Resolution
Users can install any app by pasting its `naddr1...` identifier:
1. `NostrPluginResolver.resolve(naddr)` decodes the TLV structure (author pubkey, kind `35129`, identifier `d`, and bootstrap relays).
2. Fetches the NIP-5A manifest event from relays or local cache.
3. Downloads the `index.html` bundle from Blossom and verifies the SHA-256 hash.
4. Mounts the verified nsite directly into an isolated sandbox.

---

## 4. Transparent Cross-App Intents & Protocol Handlers

In Omni, cross-application workflows are powered by open web and Nostr standards rather than proprietary buses:

```
┌─────────────────────────────────────────────────────────────┐
│               Originating nsite (Feed / Notes)              │
│                                                             │
│   <a href="nostr:nevent1...">View Thread</a>                │
│   <a href="lightning:lnbc...">Pay Invoice</a>               │
│   <a href="cashu:ey...">Claim Ecash</a>                     │
│   navigator.share({ title, text, url })                     │
└──────────────────────────────┬──────────────────────────────┘
                               │ Click / Call intercepted by sandbox
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     Omni Host Kernel                        │
│                                                             │
│   1. Inspects URI scheme (nostr:, lightning:, cashu:)       │
│   2. Resolves capable handlers:                             │
│      • Installed nsites declaring support                   │
│      • NIP-89 App Handler events (kind: 31989 / 31990)      │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│               "Open With..." System Chooser                 │
│                                                             │
│   • Displays compatible apps                                │
│   • Optional checkbox: "Always open with this app"          │
│   • Launches/focuses target app with the URI                │
└─────────────────────────────────────────────────────────────┘
```

### 4.1 Supported Protocol URI Schemes (NIP-21, Lightning, Cashu)
- **`nostr:<bech32>`**: Profiles (`npub`, `nprofile`), notes/events (`note`, `nevent`), addressable nsites (`naddr`).
- **`lightning:<invoice>`**: BOLT-11 Lightning payment invoices.
- **`cashu:<token>`**: Cashu Ecash tokens.

### 4.2 NIP-89 Application Handlers (`kind: 31989` & `kind: 31990`)
- **Handler Definitions (`kind: 31989`)**: Apps publish handlers declaring supported event kinds (`["k", "1"]` for notes, `["k", "30023"]` for long-form) or schemes.
- **App Recommendations (`kind: 31990`)**: Users publish recommendations for their preferred apps.
- When an intent URI is clicked, Omni queries local handlers and relays for matching apps and displays the system chooser.

### 4.3 Web Share API Shim (`navigator.share`)
- When an nsite calls `navigator.share({ title, text, url })`, the sandbox bridge routes the payload to the host shell.
- The shell opens the note composer with the pre-populated content and focuses the feed.

---

## 5. Key Custody, Keystore & Access Control

### 5.1 `WebCryptoKeystore`
- Uses standard W3C WebCrypto with `@noble/curves/secp256k1`.
- Cryptographic keys:
  - Generates and imports 32-byte private keys.
  - Derives public keys and performs Schnorr signatures (`schnorr.sign` / `schnorr.verify`) adhering to BIP-340 / NIP-01.
  - Supports NIP-19 bech32 encoding/decoding (`nsec`, `npub`).
  - Implements NIP-04 ECDH AES-CBC encryption/decryption with PKCS#7 padding.

### 5.2 Capability Governance (`CapabilityStore` & `AclEngine`)
- Access to keystore signing, relay writing, and storage is strictly mediated per plugin ID:
  - `nostr:read`: Permitted to query public notes.
  - `nostr:write`: Permitted to publish events to connected relays.
  - `nostr:sign`: Permitted to request Schnorr signatures for specific kinds.
  - `storage:kv`: Permitted to persist scoped IndexedDB records.
- Third-party apps never touch raw private keys (`nsec`). All signing happens in the host process following user approval or capability grant.
