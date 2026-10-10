# Omni — AI Agent Developer & Architecture Guide

> **Preserved Reference for Autonomous Coding Agents, Subagents, and Human Collaborators.**  
> *Last Updated: September 2026*

---

## 1. System Overview & Core Philosophy

Omni is an extensible, local-first Nostr web client and sandboxed micro-frontend runtime.

### The Fundamental Architectural Mandate
**Every functional domain in Omni is a first-class, standalone plugin.**
- The timeline feed and composer (`@omni/plugin-feed`) is a plugin.
- The relay pool inspector and manager (`@omni/plugin-relays`) is a plugin.
- The profile editor and key custody manager (`@omni/plugin-profile`) is a plugin.
- The task list (`@omni/plugin-checklist`) and focus timer (`@omni/plugin-timer`) are plugins.
- The host shell (`apps/web`) is strictly an **orchestration kernel** (`OmniKernel`), dynamic layout frame (`LayoutManager`), and design token container. It does NOT hardcode client features.

---

## 2. Repository Structure

Omni is structured as a `pnpm` monorepo:

```
omni/
├── apps/
│   └── web/                               # Host Web Shell & UI Frame
│       ├── index.html                     # HTML skeleton with layout slots
│       ├── public/omni-runtime.js         # Injected sandbox bridge script
│       └── src/
│           ├── main.ts                    # Kernel boot, layout wiring, and modal controllers
│           ├── icons.ts                   # Geometric SVG line icon library
│           └── style.css                  # Design tokens and responsive styles
│
├── packages/
│   ├── types/                             # Canonical TypeScript interfaces
│   │   └── src/                           # OmniManifest, NostrEvent, OmniNostrApi, etc.
│   │
│   ├── core/                              # Orchestration & Security Runtime
│   │   ├── src/
│   │   │   ├── kernel/omni-kernel.ts      # OmniKernel: boots storage, ACL, sandboxes, relays
│   │   │   ├── acl/                       # CapabilityStore & AclEngine (permission governance)
│   │   │   ├── crypto/                    # WebCryptoKeystore (secp256k1, Schnorr, bech32)
│   │   │   ├── layout/                    # LayoutManager (slot mapping, customizer)
│   │   │   ├── nostr/                     # LocalEventStore (0ms hits), RelayPool, Coordinator
│   │   │   ├── plugins/                   # NostrPluginResolver (NIP-5A nsites, Blossom, naddr)
│   │   │   ├── remote-dom/                # RemoteDomHost (@remote-dom/core host receiver)
│   │   │   └── sandbox/                   # SandboxInstance & default-runtime.ts
│   │   └── test/                          # Unit & integration tests (vitest + happy-dom)
│   │
│   └── plugins/                           # Modular First-Class System Plugins
│       ├── feed/                          # @omni/plugin-feed (Timeline feed & composer)
│       ├── relays/                        # @omni/plugin-relays (Relay status & pool manager)
│       ├── profile/                       # @omni/plugin-profile (Identity & key custody)
│       ├── checklist/                     # @omni/plugin-checklist (Daily checklist widget)
│       └── timer/                         # @omni/plugin-timer (Focus timer / Pomodoro)
```

---

## 3. Plugin Architecture Specification

### 3.1 Anatomy of a Plugin (Pure Standalone nsite)
Each plugin in Omni is a **100% standard Nostr site (nsite)**:
1. `index.html` / `dist/index.js`: Standard web app or widget that mounts directly into `document.body` or `#root`.
2. **Zero Proprietary Manifests**: No `omni.manifest.json` is required. The host shell resolves plugin metadata (name, about, icon) directly from standard NIP-5A tags (`name`, `description`, `icon`, `d`) or installed entries.
3. **No Bundled Dock Components**: Apps do NOT bundle inner dock icon components. The host Shell automatically manages navigation dock launcher icons for all installed apps.
4. **Standalone Companion Widgets**: If an application offers an interactive widget (e.g. countdown timer, checklist, mini player), that widget is published as its **own independent companion nsite** with its own `naddr`, targeting the `sidebar` (Widgets Grid) viewport.

### 3.2 Sandbox Execution & Standard Web APIs
Plugins run inside an isolated sandbox (`SandboxInstance`). Omni exposes standard web and Nostr interfaces:
- **`window.nostr`**: Full standard NIP-07 signer (`getPublicKey`, `signEvent`, `getRelays`, `nip04`, `nip44`), backed by the host keystore and ACL governance.
- **`window.WebSocket`**: Virtual WebSocket shim that transparently routes `wss://` Nostr relay frames (`REQ`, `EVENT`, `CLOSE`) through the host's high-performance `RelayPool` and 0ms local event cache.
- **`document.body` Auto-Mount**: Automatic DOM mirroring into the host's Remote DOM container—developers write standard HTML, React, or Svelte without custom host registration.
- **Protocol URIs (NIP-21, Lightning, Cashu)**: Standard `<a href="nostr:...">`, `<a href="lightning:...">`, and `navigator.share()` calls are intercepted at the sandbox boundary and routed to the Shell's "Open With..." chooser.
- **`window.omni`**:
  - `registerComponent(componentId, renderFn)`: Registers a Remote DOM component renderer.
  - `nostr.subscribe(filters, onEvent, onEose)`: Subscribes to events with immediate 0ms cache hits and live relay streaming.
  - `nostr.publish(draftEvent)`: Requests kernel signature and broadcasts to connected relays.
  - `nostr.signEvent(draftEvent)`: Signs a Nostr event via host keystore.
  - `nostr.getPublicKey()`: Returns user's hex pubkey.
  - `storage.get(key)` / `set(key, val)` / `delete(key)` / `clear()`: Scoped persistent IndexedDB storage.
  - `intents.dispatch(action, data)` / `handle(action, handler)` / `emit(event, data)`: Cross-plugin intent bus.
  - `ui.openSlot(slot)` / `closeSlot(slot)` / `toggleSlot(slot)`: Shell slot manipulation.
  - `relays.list()` / `add(url)` / `remove(url)`: Relay management.
  - `profile.get(pubkey)` / `publish(metadata)`: Kind-0 profile management.
- **`window.nostr`**: Standard NIP-07 signer interface for drop-in Nostr library compatibility.

---

## 4. UI Projection & Remote DOM Rules

Omni uses Shopify's `@remote-dom/core` to project guest elements from the sandbox directly into the native host DOM without nested iframes.

### Critical Implementation Rules
1. **Detached Tree Construction**:
   Always construct elements and attach attributes/children detached, then append to `root`:
   ```typescript
   omni.registerComponent("my-widget", ({ root }) => {
     const card = root.createElement("div");
     card.className = "widget-card";

     const btn = root.createElement("button");
     btn.className = "btn-action";
     btn.textContent = "Click Me";

     card.appendChild(btn);
     root.appendChild(card); // Attach to Remote DOM root at the end
   });
   ```
2. **`isConnected()` Traversal Check**:
   The sandbox runtime (`RemoteNode`) enforces `this.isConnected()`. Property and attribute mutations (`Mutation 3`) are only dispatched over IPC if the node is actively attached to the root (`~`). This prevents premature property mutations on unattached nodes before `@remote-dom/core` has attached them.
3. **Root ID (`~`) Handling**:
   `RemoteDomHost.mutate()` intercepts any property mutations on `"~"` and applies them directly to the host container element (e.g., adding classes) without passing them to `DOMRemoteReceiver`, which does not index `"~"`.
4. **Dock Icon Hierarchy**:
   All dock icons contributed to `slot: "dock"` must follow the standard structure:
   ```html
   <button class="dock-item" title="...">
     <div class="dock-icon-wrapper">
       <svg ...></svg>
       <!-- Optional badge: <span class="dock-badge">3</span> -->
     </div>
     <span>Label</span>
   </button>
   ```

---

## 5. Layout Engine & Available Slots

The host provides 5 standard layout slots managed by `LayoutManager`:

| Slot ID | Slot Name | Description | Typical Components |
| :--- | :--- | :--- | :--- |
| `main` | Main Viewport | Primary center viewport | `feed-main`, task manager dashboards |
| `sidebar` | Sidebar / Drawer | Desktop right sidebar / mobile pull-up drawer | `relays-widget`, `checklist-sidebar-widget`, `timer-sidebar-widget` |
| `dock` | Navigation Dock | Desktop left sidebar (vertical) / mobile bottom bar (horizontal) | `feed-dock-icon`, `checklist-dock-icon`, `timer-dock-icon` |
| `header-status` | Header Status Area | Top header next to brand logo | `relay-status-pill` |
| `header-actions` | Header Actions | Top right header area | `profile-badge`, layout & plugin triggers |

### Responsive Dock Behavior
- **Mobile (`< 768px`)**: `.mobile-dock` is fixed to the bottom (`flex-direction: row; height: 58px;`).
- **Desktop (`>= 768px`)**: `.mobile-dock` switches to a vertical left sidebar (`width: 64px; flex-direction: column; gap: 24px;`).
- **`.dock-slot-container`**: Dynamically adjusts from horizontal row on mobile to `flex-direction: column; width: 100%` on desktop.

---

## 6. Security & Sandboxing Model

- **Dual-Channel IPC**:
  - `channel1` (Port 1): High-speed Remote DOM mutation stream.
  - `channel2` (Port 2): JSON-RPC 2.0 kernel bus for capability-governed I/O.
- **Privilege Separation**:
  - **System / Trusted Plugins** (`org.omni.plugin.*`, `org.omni.system`, or `trusted: true`): Run with `sandbox="allow-scripts allow-same-origin"` and permissive CSP to allow local resource fetching.
  - **Third-Party Plugins**: Run with strict sandboxing (`sandbox="allow-scripts"`, `connect-src 'none'`), fully air-gapped from direct network, origin storage, or raw cryptographic keys.
- **Access Control (ACL)**:
  `CapabilityStore` persists permission grants per plugin:
  - `nostr:read`: Allows event subscriptions.
  - `nostr:write`: Allows requesting event publishing to relays.
  - `nostr:sign`: Allows signing specific event kinds.
  - `storage:kv`: Allows scoped IndexedDB persistent storage.
  - `intents:dispatch`: Allows routing actions across plugins.

---

## 7. Decentralized Distribution (NIP-5A nsites & Blossom)

Omni supports decentralized distribution and verification of plugins:
1. **NIP-5A Manifest Events (`kind: 35129`)**:
   Plugin authors publish parameterized replaceable events containing:
   - `["d", <plugin-id>]`
   - `["name", <plugin-name>]`
   - `["f", "dist/index.js", <sha256_hash>, "application/javascript"]`
   - `["f", "omni.manifest.json", <sha256_hash>, "application/json"]`
   - `["slot", <slot-name>]`
   - `["permission", <permission-key>]`
2. **NIP-19 `naddr` Resolution**:
   Plugins can be installed and resolved via `naddr1...` identifiers encoding the pubkey, kind `35129`, identifier `d`, and bootstrap relays.
3. **Blossom Integrity Verification**:
   Before executing in the sandbox, downloaded plugin bundles are verified against their SHA-256 hash. Any signature mismatch or hash discrepancy causes immediate rejection.

---

## 8. Aesthetic & UI Guidelines

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

## 9. Developer & Verification Workflows

```bash
# Build all packages and plugins
pnpm -r run build

# Run comprehensive test suite (23+ tests across core, layout, relays, nip5a, remote-dom)
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
