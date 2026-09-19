# 01. System Overview & Philosophy

## 1. Executive Summary

**Omni** is an open-source, modular, micro-frontend Nostr client and runtime shell where the entire user interface, navigation chrome, workflows, and feature sets are built as isolated, swappable mini-app plugins. 

Traditional Nostr clients hard-code their user experience (feeds, chat, media viewers, settings) into monolithic applications. Omni breaks this paradigm by acting as a lightweight **Nostr micro-kernel and host runtime**. 

Omni's core handles only the fundamental operating system-level primitives:
1. **Nostr Protocol Management:** Relay pool connections, NIP-65 gossip routing, subscription deduplication, and local event caching.
2. **Key Security & Cryptography:** Zero-trust key custody, hardware/extension/bunker signing, and NIP-04/44 encryption/decryption.
3. **Capability & Access Control (ACL):** Sandboxing plugins with strict Content Security Policies and granular user-granted permissions per event kind, intent, and egress target.
4. **Local Intent Engine:** An asynchronous inter-plugin message broker enabling composable cross-app workflows (e.g. sharing media, opening zaps, navigating events, viewing profiles).
5. **Slot-Based Layout Engine:** A minimalist mounting system allowing a Root Shell Plugin to compose widgets, viewports, docks, and modals without rendering traps.

---

## 2. Core Architectural Principles

```
+---------------------------------------------------------------------------------------------------+
|                                             OMNI CORE                                             |
|                                                                                                   |
|  +---------------------------------------------------------------------------------------------+  |
|  |                                  Layout & Slot Manager                                      |  |
|  |       (Mounts Sandboxes, Orchestrates Viewports, Auto-sizes Dynamic Frames & Widgets)       |  |
|  +---------------------------------------------------------------------------------------------+  |
|                                                  |                                                |
|  +-----------------------------------------------+------------------------------------------+  |
|  |                                       Runtime Broker                                     |  |
|  |                                                                                          |  |
|  |   +------------------------------------+           +---------------------------------+   |  |
|  |   |           Intent Engine            |           |    Permission & ACL Manager     |   |  |
|  |   |  (Unicast RPC, UI Sheets, Pub/Sub) |           |  (Kind Policies, Intent Grants) |   |  |
|  |   +------------------------------------+           +---------------------------------+   |  |
|  +---------------------------------------+--------------------------------------------------+  |
|                                          |                                                        |
|                    postMessage RPC Bus   |  (Strict CSP: connect-src 'none')                      |
|                                          v                                                        |
|       +---------------------------------------------------------------------+                     |
|       |                     Sandboxed Execution Boundary                    |                     |
|       |  +--------------------------+        +---------------------------+  |                     |
|       |  |   Root Shell Plugin      |        |    Feature Plugins        |  |                     |
|       |  |   (Nav, Chrome, Slots)   |        | (Feed, Chat, Notes, etc.) |  |                     |
|       |  +--------------------------+        +---------------------------+  |                     |
|       |  |   Widget Components      |        |    Background Workers     |  |                     |
|       |  | (Status bar, Mini-player)|        | (Indexers, Notifications) |  |                     |
|       |  +--------------------------+        +---------------------------+  |                     |
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

### 1. Everything is a Plugin
The Omni core renders zero end-user application views. Even the default navigation header, sidebar dock, feed reader, and user profile page are standalone plugins. If a user prefers a tiled dashboard layout over a mobile-style column layout, they simply swap the Root Layout plugin.

### 2. Nostr-Native Zero-Trust Runtime
Plugins never touch raw private keys (`nsec`), never open unmediated WebSocket connections, and cannot make arbitrary network calls. All interactions with the Nostr protocol and external networks are governed by the Omni Capability Broker.

### 3. Local-First Responsiveness
Omni integrates an embedded IndexedDB local event store. Subscriptions are answered instantaneously from local storage while delta updates stream concurrently from Gossip/NIP-65 relays.

### 4. Intent-Driven Composition
Instead of hard-coded API integrations, plugins interact using standard semantic Intents (e.g., `omni.intents.dispatch("wallet.send-payment", { amount: 2100 })`). If multiple wallet plugins are installed, Omni provides a system chooser dialog, maintaining complete modularity.

---

## 3. Subsystem Overview

| Subsystem | Primary Role | Reference Document |
| :--- | :--- | :--- |
| **Host Core & Kernel** | Manages application state, plugin life cycles, and capability permissions. | [02-host-core-and-kernel.md](02-host-core-and-kernel.md) |
| **Sandbox & IPC** | Enforces iframe / Web Worker isolation, CSP egress rules, and JSON-RPC 2.0 communication. | [03-sandbox-and-ipc-spec.md](03-sandbox-and-ipc-spec.md) |
| **Layout & Widget Engine** | Powers plugin-defined layouts, slot registration, and bidirectional auto-resizing. | [04-layout-and-widget-engine.md](04-layout-and-widget-engine.md) |
| **Nostr Relay & Cache** | Coordinates WebSocket pools, NIP-65 outbox routing, subscription deduplication, and local DB caching. | [05-nostr-relay-and-cache-layer.md](05-nostr-relay-and-cache-layer.md) |
| **Intent Engine** | Brokers Unicast RPC, Interactive UI Sheets/Modals, and Pub/Sub broadcasts between plugins. | [06-intent-protocol-spec.md](06-intent-protocol-spec.md) |
| **Key & Security Model** | Orchestrates WebCrypto, NIP-07, and NIP-46 signers, and enforces NIP-04/44 encryption ACLs. | [07-key-and-security-model.md](07-key-and-security-model.md) |
| **Plugin Developer SDK** | Developer tooling, manifest formats, `@omni/sdk` APIs, and NIP-78/89 distribution. | [08-plugin-developer-guide.md](08-plugin-developer-guide.md) |
