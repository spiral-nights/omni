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
   - The profile editor and key custody manager (`@omni/plugin-profile`) is a plugin.
   - The task list (`@omni/plugin-checklist`) and focus timer (`@omni/plugin-timer`) are plugins.
   - The host UI frame itself (`@omni/plugin-shell`) is a first-class plugin.
2. **The Host Bootloader (`apps/web`) is a Minimal Microkernel**:
   - `apps/web/index.html` is strictly a ~15-line skeleton with `<div id="omni-root"></div>`.
   - `apps/web/src/main.ts` initializes `OmniKernel`, instantiates `OmniShell`, and mounts the shell UI into `#omni-root`.
3. **Pure Standalone nsites (Zero Proprietary Manifests)**:
   - There is NO `omni.manifest.json`.
   - Every app and widget is a 100% standard web app (nsite) mounting to `document.body` or `#root`.
   - Sub-views and routes (e.g. `?view=settings`, `?view=widget`) are declared via standard Nostr tags (`["view", "<id>", "<title>", "<path>"]`) or HTML `<link rel="alternate">` / Web Manifest shortcuts.
4. **User-Defined Viewports & Route Assignment (Zero Hardcoded Slots)**:
   - Developers never declare or configure "slots".
   - Users assign apps and choose specific routes directly in Settings:
     - **Full-Page App** (`main`): Primary center viewport page with dedicated navigation dock link.
     - **Navigation Dock Shortcut** (`dock`): Quick launcher pinned to navigation dock.
     - **Workspace Widget** (`sidebar`): Interactive card inside the multi-column Widgets Dashboard.
     - **Header Quick Action** (`header-actions`): Compact status icon/pill in top navigation.
   - Any declared `settings` route (`?view=settings`) is automatically surfaced in the plugin's dedicated section in the Settings menu.
5. **Decentralized Workspace Sync (NIP-78)**:
   - Layout configurations, viewport assignments, route selections, and enabled plugins sync via `kind: 30078`, tag `["d", "omni/workspace/v1"]`, backed by 0ms local storage fallback.

---

## 2. Repository Structure

Omni is structured as a `pnpm` monorepo:

```
omni/
├── apps/
│   └── web/                               # Host Web Shell & Bootloader (~30 lines)
│       ├── index.html                     # Minimal HTML skeleton (<div id="omni-root">)
│       ├── public/omni-runtime.js         # Injected guest sandbox runtime bridge
│       └── src/
│           ├── main.ts                    # Host microkernel bootloader & shell mount
│           └── style.css                  # Design tokens and responsive styles
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
│   │   │   └── sandbox/                   # SandboxInstance & default-runtime.ts
│   │   └── test/                          # Unit & integration tests (vitest + happy-dom)
│   │
│   └── plugins/                           # Modular First-Class System Plugins
│       ├── shell/                         # @omni/plugin-shell (Header, dock, pages, settings)
│       ├── feed/                          # @omni/plugin-feed (Timeline feed & composer)
│       ├── relays/                        # @omni/plugin-relays (Relay status & pool manager)
│       ├── profile/                       # @omni/plugin-profile (Identity & key custody)
│       ├── checklist/                     # @omni/plugin-checklist (Daily checklist widget)
│       └── timer/                         # @omni/plugin-timer (Focus timer / Pomodoro)
│
└── docs/                                  # Consolidated System Documentation
    ├── 01-architecture.md                 # System Architecture & Core Runtime
    ├── 02-protocols-and-storage.md        # Nostr Protocols, Storage & Decentralized Distribution
    └── 03-plugin-developer-guide.md       # Plugin & nsite Developer Guide
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

# Run comprehensive test suite (59 tests across core, shell, nip78, nip5a, remote-dom)
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
