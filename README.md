# Omni

> **A modular, extensible Nostr web application and runtime engine featuring a native default client, multi-widget plugins, and secure Remote DOM UI projection.**

Omni combines a **high-performance, native Nostr web client** (complete with a default timeline feed, note composer, identity management, and theme engine) with a **sandboxed micro-frontend runtime**. Plugins can seamlessly contribute multiple UI components—ranging from dock icons and sidebar widgets to full-page views and custom cards—without the performance penalties, layout clipping, and styling mismatches of nested iframes.

---

## Architectural Summary Matrix

| Subsystem | Architectural Approach | Key Technologies |
| :--- | :--- | :--- |
| **Default Client & Web App** | Mobile-First Native Web App | Fast timeline feed, note composer, "Warm Paper Dark" design tokens |
| **UI Projection** | Remote DOM (Zero Iframe Traps) | Shopify `@remote-dom/core`, native host element rendering, theme token inheritance |
| **Component Types** | Multi-Widget Contribution System | `icon` (dock/bar), `sidebar` (panel/tool), `main` (full view), `widget` (custom slot) |
| **Sandboxing** | Zero-Trust Isolated Sandbox | Sandboxed `iframe` / Web Worker, strict CSP (`connect-src 'none'`), `MessageChannel` |
| **IPC & Communication** | Dual-Channel IPC Architecture | Dedicated Remote DOM mutation port + typed JSON-RPC 2.0 kernel bus |
| **Nostr Storage & Relay** | Local-First + Gossip Outbox | IndexedDB Event Store (0ms cache reads), NIP-65 Outbox Routing, Filter Multiplexer |
| **Inter-App Comm** | Tri-Modal Intent Broker | Unicast RPC, Native Remote DOM UI Sheets/Modals, Pub/Sub Broadcasts |
| **Key Custody** | Multi-Tier Signer Provider | WebCrypto (PBKDF2/AES-GCM), NIP-07 browser extension, NIP-46 Remote Bunker |
| **Plugin Distribution** | Decentralized Manifests | Declarative `omni.manifest.json`, NIP-89 App Manifests, Blossom/IPFS |

---

## Architectural Highlights

```
+---------------------------------------------------------------------------------------------------+
|                                        OMNI WEB APPLICATION                                       |
|                                                                                                   |
|  +---------------------------------------------------------------------------------------------+  |
|  |  Native Default UI Shell                                                                    |  |
|  |  - Header / Navigation Bar (Profile, Relay Status, Theme Toggle)                            |  |
|  |  - Primary Timeline Feed (0ms IndexedDB Cached Notes + Live WebSocket Streaming)            |  |
|  |  - Note Composer (Draft, Sign, Broadcast)                                                  |  |
|  |  - Layout Slots:                                                                            |  |
|  |     [Slot: 'dock']               [Slot: 'sidebar']               [Slot: 'main']             |  |
|  +---------------------------------------------------------------------------------------------+  |
|               |                             |                               |                     |
|               v                             v                               v                     |
|  +---------------------------------------------------------------------------------------------+  |
|  |  Host Remote DOM Engine (Shopify @remote-dom/core)                                          |  |
|  |  - Attaches RemoteReceiver to native host layout slots                                      |  |
|  |  - Renders guest components using Host's native design tokens & UI custom elements          |  |
|  |  - Zero iframe styling boundaries, zero scrollbar traps, natural responsive sizing          |  |
|  +---------------------------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                  MessageChannel / postMessage
                        (Port 1: Remote DOM Tree  |  Port 2: Kernel JSON-RPC)
                                                  |
+---------------------------------------------------------------------------------------------------+
|                           SANDBOXED PLUGIN RUNTIME (iframe / Web Worker)                          |
|                                                                                                   |
|  - Strict isolation: sandbox="allow-scripts", CSP: connect-src 'none'                            |
|  - Zero direct network or raw key access; all I/O is capability-governed                          |
|  - Renders UI via Shopify Remote DOM (RemoteRoot -> serialized mutations)                         |
|  - Exports declared components: icon, sidebar, main, and custom widgets                           |
|  - Host injects standard window.nostr (NIP-07) and window.omni bridge (zero bundle bloat)
|  - Plugins bundle zero runtime framework code (only @omni/types in devDependencies)                    |
+---------------------------------------------------------------------------------------------------+
```

---

## Architecture Documentation

Detailed specifications and architectural deep-dives are documented under the [`docs/`](docs/) directory:

1. **[01. System Overview & Philosophy](docs/01-system-overview.md)**
   * High-level architectural paradigm: Native Web Client + Sandboxed Extension Runtime.
   * Remote DOM vs. Traditional Iframes.
   * Core design principles and zero-trust philosophy.

2. **[02. Host Core & Kernel Architecture](docs/02-host-core-and-kernel.md)**
   * Omni Host runtime lifecycle and state machine.
   * Capability Manager and Access Control List (ACL) engine.
   * Session initialization, permission grant lifecycles, and system buses.

3. **[03. Sandbox & IPC Specification](docs/03-sandbox-and-ipc-spec.md)**
   * Execution boundaries: Sandboxed `<iframe>` and Web Workers.
   * Dual-channel architecture: Remote DOM port + Kernel JSON-RPC 2.0 port.
   * Request/response envelopes, error codes, and event streaming.

4. **[04. Layout & Remote DOM Engine](docs/04-layout-and-widget-engine.md)**
   * Native layout slots: `dock`, `sidebar`, `main`, and custom widget slots.
   * How Shopify Remote DOM projects guest components into native host DOM.
   * Eliminating iframe resizing hacks, scroll traps, and modal clipping.

5. **[05. Nostr Relay & Local Cache Layer](docs/05-nostr-relay-and-cache-layer.md)**
   * Local-first embedded IndexedDB event store (0ms cache hits).
   * Outbox / Gossip Model (NIP-65) dynamic relay routing.
   * Subscription multiplexing, filter deduplication, and delta streaming.

6. **[06. Intent Protocol Specification](docs/06-intent-protocol-spec.md)**
   * Tri-modal Intent Broker (Direct RPC, Native Remote DOM UI Sheets, Pub/Sub Broadcasts).
   * Intent resolution, action routing, and NIP-89 fallback discovery.

7. **[07. Key Management & Security Model](docs/07-key-and-security-model.md)**
   * Multi-tier Signer Provider: Local WebCrypto `nsec`, NIP-07 browser extensions, and NIP-46 Remote Bunker.
   * Granular ACLs for event signing, NIP-04/44 encryption, and local storage quotas.

8. **[08. Plugin Developer Guide & Manifest Spec](docs/08-plugin-developer-guide.md)**
   * Declarative `omni.manifest.json` schema and multi-component declarations.
   * Host-injected runtime (`window.omni` & `window.nostr`), `@omni/types`, and Remote DOM.
   * Complete example plugin with dock icon, sidebar widget, and main view.

9. **[09. Design System & Aesthetic Specification](docs/09-design-system-and-tokens.md)**
   * Mobile-first responsive layout and bottom navigation dock.
   * "Warm Paper Dark" aesthetic tokens (warm graphite `#191816`, parchment ivory `#ede8df`, sandstone `#d4a373`).
   * Standard styling for host Remote DOM custom elements.

---

## Getting Started & Running Omni

### 1. Prerequisites
- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0 (or pnpm 12)

### 2. Install Dependencies
```bash
pnpm install
```

### 3. Build Packages
Build all monorepo packages (`@omni/types`, `@omni/core`, plugins, and `@omni/web`):
```bash
pnpm build
```

### 4. Run Automated Test Suite
Run the unit and integration tests across crypto, 0ms IndexedDB event storage, ACL capability engine, and standard HTML Remote DOM projection:
```bash
pnpm test
```

### 5. Launch Development Server
Start the local Omni web application:
```bash
pnpm dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser (or use mobile device emulation in browser dev tools for the mobile experience).

### 6. Or Run Production Preview
```bash
pnpm --filter @omni/web preview
```

---

## Exploring the MVP

When you open **http://localhost:3000**:
1. **0ms Cached Feed & Schnorr Signing:**
   - On first load, Omni generates a guest Schnorr keypair via Noble secp256k1 and displays your `npub...` in the header. Click the pill to copy your public key.
   - Type a message in the note composer and click **Publish Note** (or press `Cmd+Enter` / `Ctrl+Enter`). Your note is signed in WebCrypto, stored in local IndexedDB (0ms query), and published to connected relays.
2. **Mobile Dock & Widgets Drawer:**
   - Notice the dock icons for the two MVP plugins at the bottom (or sidebar on desktop):
     - **☑️ Daily Checklist:** Displays active task count badge.
     - **⏱️ Focus Timer (Pomodoro):** Displays live countdown.
   - Click the **📋 Widgets** button in the dock (or either dock icon) to pull up the slide-up drawer sheet.
   - In the **Daily Tasks** widget: Add new tasks, toggle checkboxes, or delete items. State persists directly in the plugin's scoped IndexedDB storage.
   - In the **Focus Timer** widget: Click **Start**, **Pause**, or **Reset** to control the timer. Watch the dock icon badge update dynamically.
3. **Plugin Manager:**
   - Click **🧩** in the header or **⚙️ Plugins** in the dock to open the sandboxed Plugin Manager.
   - Inspect active permissions, verify sandbox isolation, and clear individual plugin storage databases.

---

## License

[MIT](LICENSE)