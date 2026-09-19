# Omni

> **A modular, micro-frontend Nostr client and runtime shell where the entire UI and feature set are built as swappable plugins.**

Omni acts as a lightweight **Nostr micro-kernel and host runtime**. The core manages relay connections, key operations, event subscriptions/publishing, an in-client Intent Broker, and a minimal slot-based layout manager, allowing sandboxed plugins to interoperate securely based on granular user permissions.

---

## Architectural Summary Matrix

| Subsystem | Architectural Approach | Key Technologies |
| :--- | :--- | :--- |
| **Platform Target** | Pure Browser SPA / PWA | Web Standards (HTML5, WebCrypto, IndexedDB) |
| **Sandboxing** | Zero-Trust Strict Sandbox | `iframe` (`sandbox="allow-scripts"`), CSP `connect-src 'none'`, Web Workers |
| **Layout Control** | Plugin-Driven Layout Engine | Host-managed Slot Registry, Bidirectional `ResizeObserver` RPC |
| **Nostr Storage** | Local-First + Gossip Outbox | IndexedDB Event Store, NIP-65 Outbox Routing, Filter Multiplexer |
| **Inter-App Comm** | Tri-Modal Intent Broker | Unicast RPC, Interactive UI Modal/Sheet Intents, Pub/Sub Broadcasts |
| **Key Custody** | Multi-Tier Signer Provider | WebCrypto (AES-GCM/PBKDF2), NIP-07, NIP-46 Nostr Connect |
| **Distribution** | Decentralized Nostr Ecosystem | NIP-89 App Manifests, Blossom/IPFS Content Addressing, SRI SHA-256 |
| **State Sync** | Local-First + Nostr Cloud Sync | Scoped Local KV Store + Optional NIP-78 (`kind:30078`) encrypted events |

---

## Architecture Documentation

Detailed specifications and architectural deep-dives are documented under the [`docs/`](docs/) directory:

1. **[01. System Overview & Philosophy](docs/01-system-overview.md)**
   * High-level architectural paradigm: The Micro-Kernel Nostr Host.
   * Core design principles and zero-trust philosophy.
   * End-to-end component topology diagram.

2. **[02. Host Core & Kernel Architecture](docs/02-host-core-and-kernel.md)**
   * Omni Host runtime responsibilities and lifecycle state machine.
   * Capability Manager and Access Control List (ACL) engine.
   * Session state, permission grant lifecycles, and system buses.

3. **[03. Sandbox & IPC Specification](docs/03-sandbox-and-ipc-spec.md)**
   * Execution boundaries: `<iframe sandbox>` and Web Workers.
   * Strict Content Security Policy (`connect-src 'none'`) and egress enforcement.
   * JSON-RPC 2.0 over `postMessage` protocol specification, error handling, and streaming.

4. **[04. Layout & Widget Engine](docs/04-layout-and-widget-engine.md)**
   * Plugin-driven layout architecture (Root Shell / Layout Managers).
   * Slot-based mounting system (menus, widget areas, main content, docks, modals).
   * Eliminating iframe traps: Bidirectional `ResizeObserver` auto-sizing and dynamic layout synchronization.

5. **[05. Nostr Relay & Local Cache Layer](docs/05-nostr-relay-and-cache-layer.md)**
   * Local-first embedded IndexedDB event store (0ms cache hits).
   * Outbox / Gossip Model (NIP-65) dynamic relay routing.
   * Subscription multiplexing, filter deduplication, and delta streaming.

6. **[06. Intent Protocol Specification](docs/06-intent-protocol-spec.md)**
   * Tri-modal Intent Broker (Direct RPC, Interactive UI Intents, Pub/Sub Broadcasts).
   * Resolution flow, UI Chooser dialogs ("Open With..."), and user preferences.
   * NIP-89 fallback discovery for missing intent handlers.

7. **[07. Key Management & Security Model](docs/07-key-and-security-model.md)**
   * Multi-tier Signer Provider: Local WebCrypto `nsec`, NIP-07 browser extensions, and NIP-46 Remote Bunker.
   * NIP-04 and NIP-44 encryption/decryption ACLs with batch consent.
   * Permission scopes, auto-signing policies, and rate limits.

8. **[08. Plugin Developer Guide & SDK](docs/08-plugin-developer-guide.md)**
   * Mini-app manifest schema (`omni.manifest.json`).
   * Multi-entry points: Views, widgets, settings, and background workers.
   * `@omni/sdk` API reference, NIP-89/Blossom packaging, and NIP-78 state persistence.

---

## License

[MIT](LICENSE)