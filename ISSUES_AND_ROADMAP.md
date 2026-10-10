# Omni — Active Architecture Roadmap

> *Last Updated: October 2026*  
> Tracking active architectural evolutions, remaining capabilities, and technical backlog. All previously completed MVP items have been cleared.

---

## 1. Active Focus: Transparent nsites, Zero Manifests, & Microkernel Shell

The primary objective is transitioning Omni from requiring proprietary SDKs and manifests into a **universal micro-frontend runtime for 100% standard Nostr sites (nsites)** with a pluggable microkernel shell.

```
+---------------------------------------------------------------------------------------+
 phase 1: transparent nsites & microkernel shell (active)                               |
+---------------------------------------------------------------------------------------+
|  [MILESTONE 1]  [COMPLETED] Transparent APIs: Virtual WebSocket & NIP-07 Shim         |
|  [MILESTONE 2]  [COMPLETED] Subscription Namespacing & Cache Isolation                |
|  [MILESTONE 3]  [COMPLETED] Zero-Manifest Pure nsite Loader (kind 35129)              |
|  [MILESTONE 4]  Decouple Shell UI into @omni/plugin-shell                             |
|  [MILESTONE 5]  User-Defined Viewports (Decoupling "Slots" from Developers)           |
|  [MILESTONE 6]  Transparent Cross-App Intents (NIP-21, NIP-89 & Web Share)            |
+---------------------------------------------------------------------------------------+
```

### ~~Milestone 1: Transparent APIs (Virtual WebSocket & NIP-07)~~ [COMPLETED]
* **Goal:** Allow developers to write standard web applications with zero Omni-specific SDK code.
* **Status:** Complete (Implemented `VirtualWebSocket` shim, full NIP-07 `window.nostr` with NIP-04 ECDH AES-CBC encryption/decryption, transparent `document.body` DOM auto-mount, and storage fallback).
* **Scope:**
  1. **Virtual `window.WebSocket` Shim:** [Done] Provide a drop-in virtual WebSocket in the sandbox runtime that intercepts `new WebSocket("wss://...")` and pipes Nostr relay frames (`REQ`, `EVENT`, `CLOSE`) through the host's `RelayPool`.
  2. **Standard NIP-07 (`window.nostr`):** [Done] Implement full `window.nostr` in sandboxes (`getPublicKey`, `signEvent`, `getRelays`, `nip04`, `nip44`), backed by the host keystore and capability checks.
  3. **Standard DOM Auto-Mount:** [Done] Automatically map `document.body` or `#root` directly to the host Remote DOM tree, eliminating `omni.registerComponent()`.
  4. **Standard Storage:** [Done] Transparently partition `localStorage` and `indexedDB` per plugin sandbox.
* **Priority:** Immediate / P0

### ~~Milestone 2: Subscription Namespacing & Cache Isolation~~ [COMPLETED]
* **Goal:** Ensure data requested by Plugin 1 never leaks into or crosses over to Plugin 2.
* **Status:** Complete (Namespaced subId routing `${pluginId}:${subId}`, strict ACL-governed cache filtering for sensitive kinds 4/1059/14, and per-plugin IndexedDB compound key storage partitioning).
* **Scope:**
  1. **Subscription Namespacing:** [Done] Prefix all subscription IDs with the requesting plugin ID (`${pluginId}:${subId}`). Incoming `EVENT` and `EOSE` frames from relays are routed strictly to the originating plugin's virtual socket.
  2. **ACL-Governed Cache Filtering:** [Done] When plugins query the shared `LocalEventStore` (0ms cache), enforce ACL filtering so low-privilege plugins cannot read sensitive events (e.g. Kind-4/1059 DMs) even if they exist in the local database.
  3. **Storage Partitioning:** [Done] Sandbox-isolated IndexedDB databases ensuring zero cross-plugin state access.
* **Priority:** Immediate / P0

### ~~Milestone 3: Zero-Manifest Pure nsite Loader~~ [COMPLETED]
* **Goal:** Eliminate `omni.manifest.json`. Any standard NIP-5A nsite runs as a plugin.
* **Status:** Complete (Pure NIP-5A kind: 35129 nsite resolver for `index.html` on Blossom and inline HTML, automatic metadata synthesis from standard Nostr tags, direct HTML document injection in sandboxes, and standalone companion widget publishing).
* **Scope:**
  1. **Eliminate Manifest Requirement:** [Done] Remove mandatory `omni.manifest.json` parsing from `NostrPluginResolver` and `SandboxInstance`.
  2. **Pure Standalone nsites:** [Done] Resolve any standard NIP-5A `kind: 35129` event by reading `["f", "index.html", <hash>]` from Blossom or inline HTML payload.
  3. **Standalone Companion Widgets:** [Done] Companion widgets are published as their own standalone nsites with their own `naddr` (e.g., `chess-game` vs `chess-widget`), maintaining 100% web compatibility with zero custom schemas.
* **Priority:** High / P1

### Milestone 4: Decouple Shell UI into `@omni/plugin-shell`
* **Goal:** Remove all hardcoded UI markup from `apps/web/index.html`.
* **Scope:**
  1. **Minimal Host Bootloader:** Reduce `apps/web/index.html` to a ~30-line skeleton with `<div id="omni-root"></div>`.
  2. **Extract `@omni/plugin-shell`:** Create a standalone shell package implementing the header, dock, view router, Settings modal, and Visual Layout Configurator.
  3. **Microkernel Host (`apps/web/src/main.ts`):** Host strictly boots `OmniKernel`, loads the active shell plugin, and delegates the UI frame.
* **Priority:** High / P1

### Milestone 5: User-Defined Viewports (Deconstructing "Slots")
* **Goal:** Eliminate named "slots" from developer vocabulary; make layout viewports purely user-driven.
* **Scope:**
  1. **Decouple Slots from Developers:** Developers never declare slots in their code.
  2. **User-Configured Viewports:** Shell exposes visual containers:
     - **Full Page Viewport:** Primary full-screen view.
     - **Widgets Grid Viewport:** Interactive dashboard cards.
     - **Dock Shortcuts:** Pinned items.
  3. **Universal Placement:** Any installed nsite can be assigned to any viewport dynamically via the Visual Layout Configurator.
* **Priority:** High / P1

### Milestone 6: Transparent Cross-App Intents (NIP-21, NIP-89 & Web Share)
* **Goal:** Replace proprietary `omni.intents` with open web and Nostr standards.
* **Scope:**
  1. **URI Protocol Interception (NIP-21):** Intercept navigations and clicks on `nostr:`, `lightning:`, and `cashu:` protocol links (`<a href="...">` and `window.open()`) in sandboxes.
  2. **NIP-89 App Handler Resolution:** Check installed nsites and resolve NIP-89 (`kind: 31989/31990`) handler metadata for URI schemes and event kinds.
  3. **"Open With..." System Chooser:** Provide an elegant modal chooser when multiple handlers exist, supporting "Always use this app" default handler preferences.
  4. **Web Share API (`navigator.share`):** Shim standard `navigator.share()` inside sandboxes to route notes/links seamlessly to the host composer or preferred sharing nsite.
* **Priority:** High / P1

---

## 2. Upcoming Backlog: Advanced Protocol & Client Capabilities

```
+---------------------------------------------------------------------------------------+
 phase 2: advanced nostr protocol & client capabilities                                 |
+---------------------------------------------------------------------------------------+
|  [MILESTONE 7]  Multi-Tier Signers: NIP-46 Remote Bunker & Hardware Keys              |
|  [MILESTONE 8]  NIP-65 Gossip / Outbox Relay Routing                                  |
|  [MILESTONE 9]  Multi-Account Management & Passphrase Encryption                      |
|  [MILESTONE 10] NIP-44 End-to-End Encrypted Messaging                                 |
|  [MILESTONE 11] Headless Web Worker Sandbox Mode                                      |
+---------------------------------------------------------------------------------------+
```

### Milestone 7: Multi-Tier Signers (NIP-46 Remote Bunker)
* **Goal:** Allow users to use remote bunker keys or hardware signers, keeping private keys completely off the web device.
* **Scope:**
  1. **NIP-46 Remote Bunker Client:** Connect to Amber, nsecBunker, or Nostr Connect over encrypted relays.
  2. **NIP-07 Browser Extension Passthrough:** Seamless fallback to installed browser extensions (Alby, nos2x) when detected.
* **Priority:** Medium / P2

### Milestone 8: NIP-65 Gossip / Outbox Relay Routing
* **Goal:** Dynamic, decentralized note delivery without relying on a static bootstrap relay list.
* **Scope:**
  1. Query Kind 10002 relay list metadata for authors in the user's timeline.
  2. Route note requests and subscriptions dynamically to authors' designated read/write relays.
  3. Publish the user's own NIP-65 relay list event when relays are added/removed in Settings.
* **Priority:** Medium / P2

### Milestone 9: Multi-Account Management & Passphrase Encryption
* **Goal:** Multiple Nostr identities and local key encryption at rest.
* **Scope:**
  1. Encrypt stored `nsec` with AES-256-GCM using a PBKDF2-derived passphrase or WebAuthn PRF.
  2. Account switcher in the profile settings area.
  3. Per-account scoped local cache and layout preferences.
* **Priority:** Medium / P2

### Milestone 10: NIP-44 End-to-End Encrypted Messaging
* **Goal:** Private communications in Omni using the modern NIP-44 standard.
* **Scope:**
  1. Implement conversation key exchange and NIP-44 message encryption/decryption.
  2. Enforce host ACL prompts before plugins can access encrypted conversation streams.
* **Priority:** Medium / P2

### Milestone 11: Headless Web Worker Sandbox Mode
* **Goal:** Background headless execution for non-UI services (indexing, sync, notifications).
* **Scope:**
  1. Add Web Worker execution backend to `SandboxInstance` using `@remote-dom/core/polyfill`.
  2. Permit background services to run headlessly without DOM frame overhead.
* **Priority:** Low / P3
