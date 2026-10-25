# Omni — AI Agent Developer & Architecture Guide

> **Preserved Reference for Autonomous Coding Agents, Subagents, and Human Collaborators.**  
> *Last Updated: October 2026*

---

## 1. System Overview & Core Philosophy

Omni is an extensible, local-first Nostr web client and sandboxed micro-frontend runtime for 100% standard Nostr sites (nsites).

### The Fundamental Architectural Mandates
1. **Every Functional Domain is a Standalone Plugin**:
   - The timeline feed and composer (`@omni/plugin-feed`) is a plugin.
   - The relay pool inspector and manager (`@omni/plugin-relays`) is a plugin.
   - The profile editor, key custody, and people browser (`@omni/plugin-profile-viewer`) is a unified "Profiles" plugin.
   - The task list (`@omni/plugin-checklist`) is a plugin.
   - The plugin studio & Blossom publisher (`@omni/plugin-publisher`) is a plugin.
   - The host UI frame itself (`@omni/plugin-shell`) is a first-class plugin.
2. **The Host Bootloader (`apps/web`) is a Minimal Microkernel**:
   - `apps/web/index.html` is strictly a ~15-line skeleton with `<div id="omni-root"></div>`.
   - `apps/web/src/main.ts` initializes `OmniKernel`, instantiates `OmniShell`, and mounts the shell UI into `#omni-root`.
3. **Pure Standalone nsites (Zero Proprietary Manifests or SDKs)**:
   - There is NO `omni.manifest.json`.
   - Every app and widget is a 100% standard web app (nsite) mounting to `document.body` or `#root`.
   - **Zero Proprietary SDKs**: Plugins must NEVER reference `omni.*` (`omni.registerComponent`, `omni.storage`, `omni.profile`, etc.).
   - Standard Web & Nostr APIs are used exclusively:
     - DOM auto-mirroring via `document.body` mounting.
     - View navigation via standard `window.location.search` (`?view=settings`, `?view=widget`).
     - Persistent storage via standard `window.localStorage` (partitioned per plugin).
     - Signing & key queries via standard `window.nostr` (NIP-07).
     - Relay communication via standard `window.WebSocket`.
   - Sub-views and routes are declared via standard Nostr tags (`["view", "<id>", "<title>", "<path>"]`) or HTML `<link rel="alternate">` / Web Manifest shortcuts.
4. **Strict Shell vs. Kernel Separation**:
   - **Kernel (`@omni/core`) is Headless**: Manages sandboxes, WebCrypto keystore, relay pooling, 0ms local event caching, capability store (ACL), and Remote DOM transport. It has zero knowledge of UI layouts, slot semantics, or user pages.
   - **Shell (`@omni/plugin-shell`) Owns Presentation & Styling**: Manages viewport slots (`main`, `dock`, `sidebar`, `header-actions`), layout mapping (`LayoutManager`), desktop/mobile navigation docks, widgets dashboard grid, settings tabs, and NIP-78 workspace synchronization. Each shell bundles its own stylesheet self-contained in `packages/plugins/shell/src/styles/` (`classic-styles.ts`, `panorama-styles.ts`, `editorial-styles.ts`), injected dynamically into the host DOM upon `mount()`.
   - **User-Swappable Shell Registry (`ShellRegistry`)**: Shells are swappable first-class plugins registered in `shellRegistry`. Users can select between Omni Classic, Panorama Hub, Editorial Shell, or custom installed shells dynamically in Settings.
5. **User-Defined Companion Viewports & Route Assignment (Zero Hardcoded Slots)**:
   - Developers never declare or configure "slots". Every installed plugin is an application by default.
   - Users can optionally assign companion viewports and choose specific routes directly in Settings:
     - **Navigation Dock Shortcut** (`dock`): Quick launcher pinned to navigation dock.
     - **Workspace Widget** (`sidebar`): Interactive card inside the multi-column Widgets Dashboard.
     - **Header Quick Action** (`header-actions`): Compact status icon/pill in top navigation.
   - *"Full-Page App" is not a viewport assignment*: full-page application presentation is native to every installed plugin. Viewport assignment is used strictly for companion surfaces.
   - Any declared `settings` route (`?view=settings`) is automatically surfaced in the plugin's dedicated section in the Settings menu.
6. **Decentralized Workspace Sync (NIP-78)**:
   - Layout configurations, viewport assignments, route selections, and enabled plugins sync via `kind: 30078`, tag `["d", "omni/workspace/v1"]`, backed by 0ms local storage fallback.
7. **Strict Shell & Style Plugin Agnosticism (Zero Hard-Coded Plugin Exceptions)**:
   - Shells (`@omni/plugin-shell`) and shell stylesheets (`classic-styles.ts`, `panorama-styles.ts`, `editorial-styles.ts`) must NEVER contain hard-coded plugin IDs (e.g. `isFeed = pluginId === "org.omni.plugin.feed"`, `:not(.feed-active)`), hard-coded plugin conditional checks, or special casing for specific apps.
   - All plugins are equal, autonomous citizens.
   - **Full-Page App Determination**:
     - Any app mapped or opened in the primary `main` viewport is an active full-page app.
     - The shell main viewport container provides expansive, responsive bounds (`max-width: 1360px`, `width: 100%`) so broad applications (dashboards, publishers, games, visual tools) have full breathing room.
     - Content-heavy or reading-focused apps (like feeds or article readers) self-constrain their own reading widths internally (e.g. `.feed-container { max-width: 720px; margin: 0 auto; }`) rather than the shell imposing arbitrary narrow bounds.
     - Fullscreen presentation (`#btn-*-toggle-fullscreen` or W3C Web App Manifest `"display": "fullscreen"`) is a generic presentation capability offered uniformly to all applications.

---

## 2. Repository Structure

Omni is structured as a `pnpm` monorepo:

```
omni/
├── apps/
│   └── web/                               # Host Web Shell & Bootloader (~30 lines)
│       ├── index.html                     # Minimal HTML skeleton (<div id="omni-root">)
│       └── src/
│           ├── main.ts                    # Host microkernel bootloader & shell mount
│           └── style.css                  # Minimal host microkernel skeleton reset (~25 lines)
│
├── packages/
│   ├── types/                             # Canonical TypeScript interfaces
│   │   └── src/                           # NostrEvent, NostrFilter, OmniWorkspaceState, etc.
│   │
│   ├── core/                              # Orchestration & Security Runtime
│   │   ├── src/
│   │   │   ├── kernel/omni-kernel.ts      # OmniKernel: storage, ACL, sandboxes, relays, NIP-78
│   │   │   ├── acl/                       # CapabilityStore & AclEngine (permission governance)
│   │   │   ├── crypto/                    # WebCryptoKeystore (secp256k1, Schnorr, bech32)
│   │   │   ├── layout/                    # LayoutManager (viewport slot mapping & reparenting)
│   │   │   ├── nostr/                     # LocalEventStore (0ms hits), RelayPool, Coordinator
│   │   │   ├── plugins/                   # NostrPluginResolver (NIP-5A nsites, Blossom, naddr)
│   │   │   ├── remote-dom/                # RemoteDomHost (@remote-dom/core host receiver)
│   │   │   └── sandbox/                   # SandboxInstance & omni-runtime.js (guest runtime bridge)
│   │   └── test/                          # Unit & integration tests (vitest + happy-dom)
│   │
│   └── plugins/                           # Modular First-Class System Plugins
│       ├── shell/                         # @omni/plugin-shell (Header, dock, pages, settings)
│       ├── feed/                          # @omni/plugin-feed (Timeline feed & composer)
│       ├── relays/                        # @omni/plugin-relays (Relay status & pool manager)
│       ├── profile-viewer/                # @omni/plugin-profile-viewer ("Profiles": people, metadata editor & key custody)
│       ├── checklist/                     # @omni/plugin-checklist (Daily checklist widget)
│       └── publisher/                     # @omni/plugin-publisher (Plugin Studio & Blossom uploader)
│
└── docs/                                  # Consolidated System Documentation
    ├── 01-architecture.md                 # System Architecture & Core Runtime
    ├── 02-protocols-and-storage.md        # Nostr Protocols, Storage & Decentralized Distribution
    ├── 03-plugin-developer-guide.md       # Plugin & nsite Developer Guide
    └── 04-intents-and-permissions.md      # Standardized Intents, Discovery & Kind-Level ACL
```

---

## 3. Sandbox Execution & Standard Web APIs

Plugins execute inside isolated `<iframe>` sandboxes (`sandbox="allow-scripts"`, `connect-src 'none'`). Omni virtualizes standard web interfaces:
- **`window.nostr`**: Full standard NIP-07 signer (`getPublicKey`, `signEvent`, `getRelays`, `nip04`, `nip44`), backed by the host keystore and ACL governance.
- **`window.WebSocket`**: Virtual WebSocket shim that transparently routes `wss://` Nostr relay frames (`REQ`, `EVENT`, `CLOSE`) through the host's `RelayPool` (`wss://relay.damus.io`, `wss://relay.ditto.pub`) and 0ms local event cache.
- **`document.body` Auto-Mount**: Automatic DOM mirroring into the host's Remote DOM container—developers write standard HTML, React, or Svelte without custom host registration.
- **Protocol URIs (NIP-21, Lightning, Cashu)**: Standard `<a href="nostr:...">`, `<a href="lightning:...">`, and `<a href="cashu:...">` links are intercepted at the sandbox boundary and routed to the Shell's "Open With..." chooser.
- **`navigator.share()`**: Web Share API shim routing note drafts directly into the shell composer.
- **`localStorage` & `indexedDB`**: Transparently partitioned per `pluginId`.

---

## 4. UI Projection & Remote DOM Rules

Omni uses Shopify's `@remote-dom/core` to project guest elements from the sandbox directly into the native host DOM without nested iframes.

### Critical Implementation Rules
1. **Detached Tree Construction**:
   Always construct elements and attach attributes/children detached, then append to root/container:
   ```typescript
   const card = root.createElement("div");
   card.className = "widget-card";

   const btn = root.createElement("button");
   btn.className = "btn-action";
   btn.textContent = "Click Me";

   card.appendChild(btn);
   root.appendChild(card);
   ```
2. **`isConnected()` Traversal Check**:
   The sandbox runtime (`RemoteNode`) enforces `this.isConnected()`. Property and attribute mutations (`Mutation 3`) are only dispatched over IPC if the node is actively attached to the root (`~`). This prevents premature property mutations on unattached nodes before `@remote-dom/core` has attached them.
3. **Root ID (`~`) Handling**:
   `RemoteDomHost.mutate()` intercepts property mutations on `"~"` and applies them directly to the host container element (e.g. adding classes) without passing them to `DOMRemoteReceiver`, which does not index `"~"`.
4. **Dock Launcher Hierarchy**:
   All dock icons follow standard structure:
   ```html
   <button class="dock-item" title="...">
     <div class="dock-icon-wrapper">
       <svg ...></svg>
     </div>
     <span>Label</span>
   </button>
   ```

---

## 5. Security, Isolation & Storage Architecture

1. **Dual-Channel IPC**:
   - `channel1` (Port 1): High-speed Remote DOM mutation stream (`@remote-dom/core`).
   - `channel2` (Port 2): JSON-RPC 2.0 kernel bus for capability-governed I/O.
2. **Subscription Namespacing**:
   - Every subscription is tagged `${pluginId}:${subId}`.
   - Incoming relay frames are routed strictly to the requesting plugin's virtual socket, preventing cross-plugin leakage.
3. **ACL-Governed Cache Filtering**:
   - Sensitive note kinds (Encrypted DMs Kind 4 / 1059) are filtered out of local store queries unless the plugin has explicit user grants.
4. **Local-First 0ms Cache (`LocalEventStore`)**:
   - IndexedDB database `omni_event_store` provides instant reads offline.
5. **NIP-78 Workspace Synchronization**:
   - `kind: 30078`, tag `["d", "omni/workspace/v1"]` syncs viewport assignments and active page state across devices.

---

## 6. Aesthetic & UI Guidelines

- **Palette**: "Warm Paper Dark" / e-ink aesthetic:
  - Canvas: `#141312` (rich graphite)
  - Surface: `#191816` (subtle warm charcoal)
  - Elevated / Cards: `#22201d`
  - Text Primary: `#ede8df` (warm ivory)
  - Text Secondary: `#9e988f` (warm sandstone grey)
  - Text Muted: `#6b665f`
  - Accent Primary: `#d4a373` (warm sandstone)
- **Strict Iconography Rule**:
  - **NEVER use colorful emojis** in UI code.
  - **Always use geometric monochrome SVG line icons** (1.5px - 1.8px stroke, inheriting `currentColor`).

---

## 7. Developer & Verification Workflows

```bash
# Build all packages and plugins
pnpm -r run build

# Run comprehensive test suite (264 tests across 19 test suites)
pnpm test

# Run Vite development server for apps/web
pnpm -C apps/web dev

# Check git status
git status
```

Always ensure:
1. All workspace packages build cleanly (`pnpm -r run build`).
2. All unit and integration tests pass (`pnpm test`).
3. Changes are committed incrementally per issue / enhancement.
