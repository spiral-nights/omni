# Omni

> **An extensible, local-first Nostr web client and sandboxed micro-frontend runtime for 100% standard Nostr sites (nsites).**

Omni combines a **high-performance, local-first Nostr web client** with a **sandboxed micro-frontend runtime**. Every client domain (feed, relays, profile, tasks, and the shell itself) is a standalone plugin. Third-party applications and companion widgets execute as **100% standard web apps (nsites)** inside isolated sandboxes, projecting directly into the native host DOM via Remote DOM without nested iframes, custom SDKs, or proprietary manifests.

---

## Architectural Summary Matrix

| Subsystem | Architectural Approach | Key Technologies |
| :--- | :--- | :--- |
| **Shell UI & Navigation** | Swappable Shell Registry | `@omni/plugin-shell` with swappable shells (Omni Classic, Panorama Hub, Editorial) |
| **Host Bootloader** | Minimal Microkernel (~30 lines) | `apps/web` boots `OmniKernel` and passes container root to shell |
| **App Model** | Pure Standalone nsites (Zero Manifests) | Standard HTML/JS apps mounting to `document.body` or `#root` |
| **UI Projection** | Remote DOM (Zero Iframe Traps) | Shopify `@remote-dom/core` on dedicated mutation channel (Port 1) |
| **User Viewports** | User-Configured Layout Containers | Dock Shortcut (`dock`), Widget Card (`sidebar`), Header Action (`header-actions`) |
| **Workspace Sync** | Decentralized NIP-78 Sync | `kind: 30078`, `omni/workspace/v1` with 0ms local fallback & relay sync |
| **Nostr Networking** | Transparent Virtual WebSocket | Virtual `window.WebSocket` multiplexed to `RelayPool` with subscription namespacing |
| **Signer & Identity** | Standard NIP-07 Virtualization | `window.nostr` backed by host keystore (secp256k1 Schnorr) & ACL engine |
| **Storage & Cache** | Local-First 0ms Store + Partitioning | IndexedDB `omni_event_store` (0ms hits) + partitioned guest storage |
| **Cross-App Intents** | Open Web & Nostr Protocol Standards | NIP-21 URIs (`nostr:`, `lightning:`, `cashu:`), NIP-89 Handlers, Web Share |
| **App Distribution** | Decentralized NIP-5A & Blossom | Parameterized events (`kind: 35129`), NIP-19 `naddr` resolution, Blossom SHA-256 |

---

## Architectural Highlights

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   OMNI WEB APPLICATION                                 │
│                                                                                        │
│  apps/web/src/main.ts (Host Microkernel Bootloader)                                    │
│  ├── OmniKernel (Keystore, RelayPool, LocalEventStore, AclEngine)                      │
│  └── Mounts @omni/plugin-shell into <div id="omni-root">                               │
│                                                                                        │
│  @omni/plugin-shell (Swappable Shell Experiences via ShellRegistry)                   │
│  ├── Omni Classic (Warm Paper Dark workbench, dock navigation, widgets dashboard)      │
│  ├── Panorama Hub (Windows Phone Metro panoramic canvas, live tiles, fluid swipe)      │
│  └── Editorial (Sacred Swiss typography, Papyrus/Obsidian modes, accent illumination)  │
│  ├── Pluggable Settings (Profile & keys custody, relay manager, plugins & viewports)   │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Container Elements
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                             Shopify Remote DOM Host Layer                              │
│  • Projects guest element trees directly into native host container slots              │
│  • Full inheritance of host CSS variables and Warm Paper Dark design tokens            │
│  • Zero nested iframe scrolling traps, clipped popovers, or theme mismatches           │
└───────────────────────────────────────────▲────────────────────────────────────────────┘
                                            │ MessageChannel (Port 1: Remote DOM mutations)
                                            │ MessageChannel (Port 2: Kernel JSON-RPC 2.0)
┌───────────────────────────────────────────┴────────────────────────────────────────────┘
│                          SANDBOXED NSITE GUEST RUNTIME (iframe)                        │
│                                                                                        │
│  - Standard Web & Nostr Application: React, Svelte, or Vanilla JS                      │
│  - Strict Sandbox Isolation: sandbox="allow-scripts", CSP: connect-src 'none'          │
│  - Virtual window.WebSocket: Standard relay frames (REQ, EVENT) routed via host        │
│  - Standard window.nostr: NIP-07 signer backed by host keystore & ACL checks           │
│  - Auto DOM Mirroring: document.body mutations stream automatically to host container  │
│  - Scoped Storage: localStorage and IndexedDB isolated per pluginId                    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Consolidated Architecture Documentation

Comprehensive architecture guides and specifications are consolidated in the [`docs/`](docs/) directory:

1. **[01. System Architecture & Core Runtime](docs/01-architecture.md)**
   * System philosophy, package structure, and microkernel bootloader.
   * Decoupled shell plugin (`@omni/plugin-shell`) and page-centric navigation.
   * Dual-channel sandboxing & Remote DOM execution invariants.
   * Transparent API virtualization (Virtual `window.WebSocket`, `window.nostr`, DOM auto-mount).
   * Subscription namespacing and ACL-governed cache isolation.

2. **[02. Nostr Protocols, Storage & Decentralized Distribution](docs/02-protocols-and-storage.md)**
   * Local-first 0ms IndexedDB event cache (`LocalEventStore`) + multiplexed `RelayPool`.
   * NIP-78 Workspace Layout Sync (`kind: 30078`, `omni/workspace/v1`).
   * Decentralized distribution via NIP-5A (`kind: 35129`), NIP-19 `naddr`, and Blossom.
   * Transparent cross-app intents (NIP-21 URIs, NIP-89 App Handlers, "Open With..." chooser).
   * Key custody and security model (`WebCryptoKeystore`, secp256k1 Schnorr, `CapabilityStore`).

3. **[03. Plugin & nsite Developer Guide](docs/03-plugin-developer-guide.md)**
   * Writing standard web apps and widgets without proprietary SDKs or manifests.
   * Standard APIs (`window.nostr`, `WebSocket`, `localStorage`, `indexedDB`, standard DOM).
   * Multi-viewport responsive styling using CSS Container Queries (`@container`).
   * Publishing standalone companion widgets with distinct `naddr` addresses.
   * "Warm Paper Dark" design tokens and strict geometric monochrome line iconography.

---

## Developer Quickstart

### 1. Prerequisites
- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0

### 2. Install & Build Monorepo
```bash
pnpm install
pnpm -r run build
```

### 3. Run Test Suite
Omni includes 264 automated unit and integration tests across 19 test suites covering crypto, 0ms IndexedDB storage, ACL engine, NIP-78 workspace sync, NIP-5A resolver, shells, and Remote DOM:
```bash
pnpm test
```

### 4. Start Local Development Server
```bash
pnpm -C apps/web dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## Exploring Omni

1. **0ms Cached Notes & Schnorr Publishing**:
   - On first load, Omni initializes a guest Schnorr keypair via Noble secp256k1.
   - Type a note in the composer and click **Publish Note**. The note is signed in WebCrypto, stored in local IndexedDB (0ms query), and broadcast to connected relays (`wss://relay.damus.io`, `wss://relay.ditto.pub`).
2. **Multi-Page App Switching**:
   - The navigation dock provides direct launcher links for all installed full-page applications (e.g. Feed).
   - Switching pages swaps the center viewport cleanly and resets scroll position.
3. **Widgets Dashboard**:
   - Click the **Widgets** button in the navigation dock to open the multi-column tools dashboard containing active widgets (Daily Checklist, Relay Inspector).
4. **Installed Plugins & User Viewports**:
   - Open **Settings (⚙️) -> Plugins**.
   - Change any app's companion viewport dynamically via the dropdown (Navigation Dock Shortcut, Workspace Widget, or Header Quick Action).
   - Notice how the layout instantly adapts.
5. **NIP-78 Workspace Cloud Sync**:
   - View your workspace synchronization status at the top of the Plugins manager.
   - Click **Sync to Nostr** to publish your layout state to relays (`kind: 30078`, `omni/workspace/v1`), or click **Restore** to retrieve it on a new device.

---

## Active Roadmap

For active tracked issues and future roadmap items (NIP-46 Remote Bunker, NIP-65 Outbox routing, PWA offline caching), see **[ISSUES_AND_ROADMAP.md](ISSUES_AND_ROADMAP.md)**.

---

## License

[MIT](LICENSE)