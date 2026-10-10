# Omni — Architecture Roadmap & Issue Tracker

> *Last Updated: September 2026*  
> Tracking completed foundation milestones and remaining architectural capabilities.

---

## 1. Completed Milestones (Archive)

The following core MVP capabilities, architectural refactors, and critical bug fixes have been fully designed, implemented, and verified in the test suite (`pnpm test`):

| Milestone / Issue | Domain | Resolution Summary | Status |
| :--- | :--- | :--- | :--- |
| **ISSUE-01: Monochrome Line Icons** | UI / Design Tokens | Replaced all emoji glyphs with clean, geometric monochrome SVG line icons inheriting `currentColor`. | ✅ Completed (`3216c78`) |
| **ISSUE-02: Plugin Lifecycle & ACL** | Kernel / Security | Built `CapabilityStore` & `AclEngine` with granular toggles (`nostr:read`, `nostr:write`, `nostr:sign`, `storage:kv`). | ✅ Completed (`b8017a9`) |
| **ISSUE-03: Profile & Identity View** | Nostr / Identity | Kind-0 metadata editing, `npub`/`nsec` key custody, and account switching. | ✅ Completed (`5159a29`) |
| **ISSUE-04: Dynamic Layout Engine** | Layout / Shell | Drag & drop widget layout customizer, slot persistence, and multi-slot assignment (`LayoutManager`). | ✅ Completed (`928ed01`) |
| **ISSUE-05: Relay Pool Inspector** | Networking | Real-time relay status pill, connection health, and add/remove relay manager. | ✅ Completed (`463bc6a`) |
| **ISSUE-06: Responsive Navigation** | UI / Responsive | Unified desktop vertical sidebar and mobile slide-out bottom sheet with breakpoint coordination. | ✅ Completed (`928ed01`) |
| **ISSUE-07: Plugin Inspector & Manifest Viewer** | Kernel / DevTools | Added manifest inspector modal displaying component declarations, permissions, and raw JSON. | ✅ Completed (`b8017a9`) |
| **ISSUE-08: NIP-5A (nsites) & Blossom** | Distribution | Decentralized plugin resolution via NIP-19 `naddr1...`, kind-35129 manifest events, and Blossom SHA-256 verification. | ✅ Completed (`98b9bed`) |
| **MODULAR-01: First-Class Plugin Refactor** | Architecture | Converted all UI domains (`feed`, `relays`, `profile`, `checklist`, `timer`) into standalone packages under `packages/plugins/*`. | ✅ Completed (`463bc6a`) |
| **IPC-01: Remote DOM Event Propagation** | Remote DOM | Fixed host listener wrapping in `RemoteDomHost`, enabled `queueMicrotask` batching, and resolved button child hit-testing. | ✅ Completed (`85c88b9`) |
| **SEC-01: Strict Opaque Sandbox Isolation** | Security | Enforced strict `sandbox="allow-scripts"` (opaque origin), eliminating browser sandbox elevation warnings. | ✅ Completed (`adf0245`) |
| **FEED-01: 0ms Local Cache & Composer Sync** | Feed & Nostr | Fixed boot order for 0ms store queries and added capture-phase `InputEvent` detail enrichment for form inputs. | ✅ Completed (`adf0245`) |

---

## 2. Remaining Roadmap & Active Backlog

The remaining roadmap focuses on production readiness, cross-plugin interoperability, and advanced Nostr protocol features:

```
+---------------------------------------------------------------------------------------+
|                                    OMNI ROADMAP                                       |
+---------------------------------------------------------------------------------------+
|  [MILESTONE 1]  Signer Providers: NIP-07 Browser Extension & NIP-46 Remote Bunker     |
|  [MILESTONE 2]  Interactive UI Sheet & Cross-Plugin Pub/Sub Intent Modalities         |
|  [MILESTONE 3]  NIP-65 Gossip / Outbox Relay Routing                                  |
|  [MILESTONE 4]  Multi-Account & Encrypted Keystore Passphrase (PBKDF2 + AES-GCM)      |
|  [MILESTONE 5]  NIP-44 / NIP-04 Direct Messaging Plugin                               |
|  [MILESTONE 6]  Headless Web Workers Sandbox Mode (@remote-dom/core/polyfill)         |
+---------------------------------------------------------------------------------------+
```

### Milestone 1: Multi-Tier Signer Providers (NIP-07 & NIP-46 Bunker)
* **Goal:** Allow users to use hardware signers or browser extensions instead of storing raw keys locally.
* **Scope:**
  1. **NIP-07 Extension Bridge:** Proxy signing and verification to `window.nostr` (Alby, nos2x) when detected, auditing permissions via Omni's ACL engine.
  2. **NIP-46 Remote Signer (Nostr Connect / Amber):** Implement client connection to remote bunker keys over encrypted Nostr relays, keeping private keys completely off the web device.
* **Priority:** High

### Milestone 2: Interactive UI Intents & Pub/Sub Bus
* **Goal:** Full cross-plugin interoperability without plugins taking hard dependencies on each other.
* **Scope:**
  1. **Modality 2 (Interactive UI Intents):** When a plugin dispatches an intent requiring user interaction (e.g. `wallet.send-payment`), Omni Host opens a native modal/sheet and the target plugin projects its interactive UI using Remote DOM.
  2. **Modality 3 (Pub/Sub Event Bus):** 1-to-many event bus allowing background plugins to broadcast state (e.g. audio player track change, incoming notification).
* **Priority:** High

### Milestone 3: NIP-65 Gossip / Outbox Relay Routing
* **Goal:** Smarter, decentralized note delivery without relying on a static list of bootstrap relays.
* **Scope:**
  1. Query kind 10002 relay list metadata for authors in the user's timeline.
  2. Route note requests and subscriptions dynamically to authors' designated read/write relays.
  3. Publish the user's own NIP-65 relay list event when relays are configured in the Relay Manager.
* **Priority:** Medium

### Milestone 4: Multi-Account Management & Keystore Passphrase Encryption
* **Goal:** Support multiple Nostr identities and encrypt local keys at rest.
* **Scope:**
  1. Encrypt stored `nsec` with AES-256-GCM using a PBKDF2-derived passphrase or WebAuthn PRF.
  2. Fast account switcher dropdown in the header actions area.
  3. Per-account scoped local event cache and layout preferences.
* **Priority:** Medium

### Milestone 5: NIP-44 / NIP-04 End-to-End Encrypted Messaging Plugin
* **Goal:** Private communications in Omni.
* **Scope:**
  1. Create `@omni/plugin-messages` contributing a conversation list in the sidebar and thread view in the main slot.
  2. Enforce NIP-44 conversation key exchange and host ACL decryption prompts.
* **Priority:** Medium

### Milestone 6: Web Workers Sandbox Mode
* **Goal:** Headless background execution for non-UI services (indexing, sync, automations).
* **Scope:**
  1. Add Web Worker execution backend to `SandboxInstance` using `@remote-dom/core/polyfill`.
  2. Permit plugins with `manifest.mode = "worker"` to run headlessly without DOM frame overhead.
* **Priority:** Low
