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
|  [MILESTONE 4]  [COMPLETED] Decouple Shell UI into @omni/plugin-shell                 |
|  [MILESTONE 5]  [COMPLETED] User-Defined Viewports (Decoupling "Slots")                |
|  [MILESTONE 6]  [COMPLETED] Transparent Cross-App Intents (NIP-21, NIP-89, Web Share) |
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

### ~~Milestone 4: Decouple Shell UI into `@omni/plugin-shell`~~ [COMPLETED]
* **Goal:** Remove all hardcoded UI markup from `apps/web/index.html`.
* **Status:** Complete (Extracted `@omni/plugin-shell` with dynamic DOM rendering, unified settings modal, visual layout configurator, inspector, and install modals; reduced `apps/web/index.html` to a 15-line bootloader and `main.ts` to a 95-line microkernel).
* **Scope:**
  1. **Minimal Host Bootloader:** [Done] Reduced `apps/web/index.html` to a ~15-line skeleton with `<div id="omni-root"></div>`.
  2. **Extract `@omni/plugin-shell`:** [Done] Created standalone package `packages/plugins/shell` (`OmniShell`) implementing the header, navigation dock, view router, Settings modal (profile, relays, layout, plugins, config), and inspector/install dialogs.
  3. **Microkernel Host (`apps/web/src/main.ts`):** [Done] Host strictly boots `OmniKernel`, instantiates `OmniShell` on `#omni-root`, mounts plugins via `shell.getSlotContainers()`, and delegates the UI frame.
* **Priority:** High / P1

### ~~Milestone 5: User-Defined Viewports (Deconstructing "Slots")~~ [COMPLETED]
* **Goal:** Eliminate named "slots" from developer vocabulary; make layout viewports purely user-driven.
* **Status:** Complete (Updated `STANDARD_VIEWPORTS` in `@omni/core` to user viewports; decoupled developers from slots so pure nsites declare zero slots; added dynamic viewport reassignment in Visual Layout Configurator and plugin manager cards).
* **Scope:**
  1. **Decouple Slots from Developers:** [Done] Pure nsites and widgets declare zero slots in their code or metadata; default to universal execution.
  2. **User-Configured Viewports:** [Done] Shell exposes user viewports:
     - **Full Page Viewport (`main`):** Primary full-screen view.
     - **Widgets Grid Viewport (`sidebar`):** Interactive dashboard cards.
     - **Dock Shortcuts (`dock`):** Pinned icons and quick triggers.
  3. **Universal Placement:** [Done] Any installed nsite can be assigned or reparented to any viewport dynamically via the Visual Layout Configurator and the Installed Plugins viewport selector.
* **Priority:** High / P1

### ~~Milestone 6: Transparent Cross-App Intents (NIP-21, NIP-89 & Web Share)~~ [COMPLETED]
* **Goal:** Replace proprietary `omni.intents` with open web and Nostr standards.
* **Status:** Complete (Implemented NIP-21 protocol click/open interception in sandbox runtime, NIP-89 discovery and handler resolution in OmniKernel, persistent user default handler preferences, elegant "Open With..." chooser modal in OmniShell, and Web Share API shim).
* **Scope:**
  1. **URI Protocol Interception (NIP-21):** [Done] Intercepted link clicks (`<a href="...">`) and `window.open()` targeting `nostr:`, `lightning:`, and `cashu:` protocol URIs at sandbox capture phase; dispatches `kernel.handleUri` over JSON-RPC.
  2. **NIP-89 App Handler Resolution:** [Done] Implemented `OmniKernel.resolveAppHandlers(uri, installedPlugins)` querying installed sandboxes/plugins and `LocalEventStore` for NIP-89 (`kind: 31989`) handler definitions by scheme and kind.
  3. **"Open With..." System Chooser:** [Done] Implemented `#open-with-modal` in `OmniShell` with warm paper styling, monochrome SVG iconography, handler selection list, and "Always open [scheme]: links with this app" checkbox saved via `kernel.setDefaultHandler()`.
  4. **Web Share API (`navigator.share`):** [Done] Shimmed `navigator.share()` inside sandboxes to dispatch `kernel.handleShare`, routing shared notes/links seamlessly into the shell timeline composer.
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
