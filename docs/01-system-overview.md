# 01. System Overview & Philosophy

## 1. Executive Summary

**Omni** is an open-source, extensible Nostr web application and runtime engine. It unifies a **first-class native Nostr web client**—complete with a live timeline feed, note composer, identity management, and theme system—with an isolated, multi-widget **sandboxed plugin runtime**.

Traditional Nostr clients face a false dichotomy:
1. **Monolithic clients:** Fast and cohesive, but completely rigid. Users cannot add custom sidebar tools, dock mini-apps, alternative feed algorithms, or custom media viewers without forking the entire codebase.
2. **Iframe-based micro-frontends:** Highly modular, but visually disjointed, plagued by nested scrollbars, modal clipping, theme mismatches, and severe performance overhead from heavy iframe layouts.

Omni solves this by adopting **Shopify Remote DOM (`@remote-dom/core`)** for UI projection paired with a **zero-trust micro-kernel**:
- The **Host Web App** provides a polished, responsive default client with real native DOM nodes and design tokens.
- **Plugins** execute safely inside sandboxed environments (sandboxed iframes or Web Workers with `connect-src 'none'`).
- Instead of rendering isolated iframes, plugins construct lightweight remote element trees. These trees are serialized across a `MessageChannel` and projected directly into the Host's native layout slots (`dock`, `sidebar`, `main`, and custom widget slots).
- Plugins gain full modularity with multiple component contributions (`icon`, `sidebar`, `main`, `widget`) while the user enjoys a seamless, unified, accessible native UI.

---

## 2. Core Architectural Principles

```
+---------------------------------------------------------------------------------------------------+
|                                        OMNI HOST WEB APP                                          |
|                                                                                                   |
|  +---------------------------------------------------------------------------------------------+  |
|  |  Native Default Client UI                                                                   |  |
|  |  - Global Navigation Header & Pubkey Profile Status                                         |  |
|  |  - Primary Timeline Feed (Instant 0ms IDB Cache + Live Relay Multiplexer)                   |  |
|  |  - Note Composer (Sign, Tag, Broadcast)                                                     |  |
|  |  - Native Layout Slots: [slot: dock]  [slot: sidebar]  [slot: main]  [slot: custom]        |  |
|  +---------------------------------------------------------------------------------------------+  |
|                                                  |                                                |
|  +-----------------------------------------------+------------------------------------------+  |
|  |                                  Host Remote DOM Engine                                  |  |
|  |   - RemoteReceiver per slot / widget container                                           |  |
|  |   - Projects guest elements to real DOM custom elements (<ui-button>, <ui-card>, etc.)    |  |
|  |   - Inherits host CSS theme variables, fluid layout grid, native scroll, zero clip bugs   |  |
|  +-----------------------------------------------+------------------------------------------+  |
|                                                  |                                                |
|  +-----------------------------------------------+------------------------------------------+  |
|  |                                      Host Kernel Broker                                  |  |
|  |   +------------------------------------+           +---------------------------------+   |  |
|  |   |           Intent Broker            |           |    Permission & ACL Manager     |   |  |
|  |   |  (Unicast RPC, UI Sheets, Pub/Sub) |           |  (Kind Policies, Storage, Sign) |   |  |
|  |   +------------------------------------+           +---------------------------------+   |  |
|  +---------------------------------------+--------------------------------------------------+  |
|                                          |                                                        |
|        Dual-Port MessageChannel          |  Strict CSP: connect-src 'none'                        |
|  [Port 1: Remote DOM | Port 2: JSON-RPC] |                                                        |
|                                          v                                                        |
|       +---------------------------------------------------------------------+                     |
|       |                     Sandboxed Execution Boundary                    |                     |
|       |                     (Hidden Iframe or Web Worker)                   |                     |
|       |                                                                     |                     |
|       |  +---------------------------------------------------------------+  |                     |
|       |  |  Plugin Bundle (e.g. Zap Wallet / Media Player / Chat)        |  |                     |
|       |  |                                                               |  |                     |
|       |  |  Exported Components:                                         |  |                     |
|       |  |  - Icon Component    --> Remote DOM Root (Dock slot)          |  |                     |
|       |  |  - Sidebar Component --> Remote DOM Root (Sidebar slot)       |  |                     |
|       |  |  - Main Component    --> Remote DOM Root (Main view slot)     |  |                     |
|       |  |                                                               |  |                     |
|       |  |  Zero bundled SDK: Uses injected window.nostr & window.omni   |  |                     |
|       |  +---------------------------------------------------------------+  |                     |
|       +---------------------------------------------------------------------+                     |
|                                          |                                                        |
|  +---------------------------------------+--------------------------------------------------+  |
|  |                                  Host Nostr Engine                                       |  |
|  |  +--------------------------------+           +---------------------------------------+  |  |
|  |  |     Multi-Tier Signer Core     |           |     Local-First Event Store (IDB)     |  |  |
|  |  | (nsec, NIP-07, NIP-46 Bunker)  |           | (0ms Cache, Indexing, Tag Search)     |  |  |
|  |  +--------------------------------+           +---------------------------------------+  |  |
|  |  |   Relay Pool & Gossip Router   |           |     Subscription Multiplexer (REQ)    |  |  |
|  |  | (NIP-65 Outbox, WS Health)     |           | (Deduplication, EOSE Aggregation)     |  |  |
|  |  +--------------------------------+           +---------------------------------------+  |  |
|  +------------------------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------------------------+
                                                   |
                                                   v
                                   [ Global Nostr Relay Network ]
```

### 1. Polished Native Experience Out of the Box
Omni is not a blank canvas. It ships with a complete, performant Nostr client featuring a default timeline feed, note composer, identity keys, and theme controls. Users get immediate utility on first load, with the ability to progressively customize and extend the client with plugins.

### 2. Multi-Widget Component Architecture
A plugin is not restricted to a single full-page window. A single plugin (for example, a Bitcoin/Lightning wallet) can register:
* An **`icon`** widget: A status icon in the dock showing connection status or unread counts.
* A **`sidebar`** widget: A quick glance at balances and recent transactions.
* A **`main`** component: A full transaction history and routing explorer.
* A **`widget`** component: A floating quick-pay card embeddable in any custom layout slot.

### 3. Remote DOM: Sandboxing Without Iframe Traps
Instead of wrapping each widget in its own isolated `<iframe>`, plugins run inside a headless sandbox (iframe or Web Worker) and construct UI using **Shopify Remote DOM**.
- The guest sandbox creates a remote element tree.
- Mutations stream over a dedicated `MessagePort`.
- The Host attaches a `RemoteReceiver` to the target slot and renders real, native DOM elements.
- UI elements naturally adapt to host CSS themes, responsive grid containers, keyboard navigation, and native scrolling without nested scrollbar bugs or modal clipping.

### 4. Zero-Trust Security Boundary
Plugins never handle raw private keys (`nsec`), cannot open raw WebSocket connections, and are restricted by strict CSP (`connect-src 'none'`). All cryptographic operations, Nostr relay queries, storage access, and cross-plugin communications must pass through Omni's capability-checked JSON-RPC broker.

### 5. Local-First Responsiveness
Omni integrates an embedded IndexedDB local event store. Timeline subscriptions hit local storage instantly (0ms), while delta updates stream concurrently from Gossip/NIP-65 relays.

### 6. Host-Injected Standard Runtime (Zero Bundle Bloat)
Plugins never bundle an IPC library or proprietary SDK into their builds. Instead, the sandbox environment injects standard `window.nostr` (NIP-07) for signing/crypto and `window.omni` for component registration and subscriptions. Plugins only require `@omni/types` as a devDependency, ensuring tiny bundle sizes, instant forward-compatibility upgrades, and drop-in support for standard Nostr libraries.

---

## 3. Subsystem Overview

| Subsystem | Primary Role | Reference Document |
| :--- | :--- | :--- |
| **Host Core & Kernel** | Manages application state, plugin life cycles, and capability permissions. | [02-host-core-and-kernel.md](02-host-core-and-kernel.md) |
| **Sandbox & IPC** | Enforces sandbox isolation, CSP egress rules, and dual-channel MessageChannel IPC. | [03-sandbox-and-ipc-spec.md](03-sandbox-and-ipc-spec.md) |
| **Layout & Remote DOM** | Native slot system (`dock`, `sidebar`, `main`, `widget`) and Remote DOM element projection. | [04-layout-and-widget-engine.md](04-layout-and-widget-engine.md) |
| **Nostr Relay & Cache** | Coordinates WebSocket pools, NIP-65 outbox routing, subscription deduplication, and local DB caching. | [05-nostr-relay-and-cache-layer.md](05-nostr-relay-and-cache-layer.md) |
| **Intent Engine** | Brokers Unicast RPC, Remote DOM UI Sheets/Modals, and Pub/Sub broadcasts between plugins. | [06-intent-protocol-spec.md](06-intent-protocol-spec.md) |
| **Key & Security Model** | Orchestrates WebCrypto, NIP-07, and NIP-46 signers, and enforces NIP-04/44 encryption ACLs. | [07-key-and-security-model.md](07-key-and-security-model.md) |
| **Plugin Developer Guide** | Declarative manifest specification (`omni.manifest.json`), host-injected runtime (`window.omni`/`window.nostr`), and `@omni/types`. | [08-plugin-developer-guide.md](08-plugin-developer-guide.md) |

