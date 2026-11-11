> **LEGACY DOCUMENT (TypeScript/MoonBit era).** Concepts and wire formats still apply, but code examples and package paths are historical. The implementation now lives under `gleam/`; start with [`docs/09-gleam-migration-handoff.md`](09-gleam-migration-handoff.md) and [`docs/README.md`](README.md).

# Omni — Web Worker Runtime Architecture & Migration Plan

> **Authoritative Specification & Implementation Plan for Off-Thread Plugin Execution.**  
> *Last Updated: October 2026*

---

## 1. Executive Summary

Omni currently supports two modes of plugin execution:
1. **Direct Sandboxed Iframe (`IframeAppHost`)**: For standalone visual web applications (nsites) mounting HTML/DOM directly.
2. **Headless Iframe with Declarative Schema**: For headless schema-based plugins (`@omni/plugin-feed`, `@omni/plugin-checklist`), which currently instantiate a hidden 0×0 `<iframe>` appended to `document.body` simply to run JavaScript and emit declarative JSON component trees over `postMessage`.

**Goal**: Transition headless and Schema-based plugins from hidden iframes to **dedicated Web Workers (`WorkerGuestHost`)**. This enables 100% off-thread, non-blocking parallel CPU execution, zero-DOM mathematical isolation, and eliminates unnecessary iframe overhead.

---

## 2. Security Impact Analysis: Web Workers vs. Sandboxed Iframes

| Security & Performance Vector | Sandboxed `<iframe>` (`allow-scripts`) | Dedicated `WebWorker` (Hardened Blob) |
| :--- | :--- | :--- |
| **DOM & UI Redressing Isolation** | **Good**: Opaque origin (`origin: "null"`) prevents access to host DOM. However, guest code retains its own DOM tree and can attempt modal popups (`alert`), DOM clobbering, or CSS exfiltration. | **Absolute**: `window`, `document`, `parent`, `top`, and DOM nodes **do not exist**. A rogue plugin cannot perform XSS or UI redressing against the host. |
| **Main Thread CPU Isolation** | **None**: Executes on browser main thread. Intensive Schnorr signature verification (e.g. 500 events) drops frames and freezes scrolling. | **Dedicated Background Thread**: Signature verification, filtering, and JSON serialization run completely off the UI thread without dropping frames. |
| **Storage & Origin Sandboxing** | **Engine-Enforced**: Opaque origin natively blocks access to host `localStorage`, `sessionStorage`, and `indexedDB`. | **Host Origin Inherited**: A standard Blob worker shares `window.location.origin`. **Must be neutralized** by deleting `self.indexedDB`, `self.caches`, and `self.cookieStore`. |
| **Network & CSP Enforcement** | **Per-Frame CSP**: Can enforce `csp="connect-src 'none'"` on the iframe tag. | **Inherited CSP**: Inherits the host CSP. **Must be neutralized** by deleting `self.fetch`, `self.XMLHttpRequest`, and `self.WebSocket`. |
| **Process Lifecycle** | Can only remove iframe from DOM; memory deallocation depends on GC. | Explicit `worker.terminate()` provides instant, deterministic teardown. |

---

## 3. The Hardened Worker Preamble

To ensure Web Workers provide security parity with opaque iframes, Omni injects a security lockdown preamble before any guest code runs:

```javascript
(function() {
  'use strict';

  // 1. Defang unmetered host origin storage & network
  delete self.indexedDB;
  delete self.caches;
  delete self.cookieStore;
  delete self.fetch;
  delete self.XMLHttpRequest;
  delete self.importScripts; // Prevent pulling unapproved external scripts
  delete self.WebSocket;

  // 2. Install Omni virtualized guest shims
  // - Virtual WebSocket routed over Channel 2 (Kernel RPC)
  // - Partitioned localStorage routed over Channel 2
  // - Standard window.nostr (NIP-07) routed over Channel 2
  self.WebSocket = createVirtualWebSocketShim(portKernelRpc);
  self.localStorage = createPartitionedStorageShim(portKernelRpc);
  self.nostr = createNip07SignerShim(portKernelRpc);

  // 3. Listen for initialization handshake & MessagePorts transfer
  self.onmessage = function(e) {
    if (e.data && e.data.type === 'omni:init') {
      const [portSchema, portRpc] = e.ports;
      initOmniGuest(e.data.payload, portSchema, portRpc);
      runPluginScript();
    }
  };
})();
```

---

## 4. Plugin Classification: Which Plugins Should Run in Web Workers?

Our design goal is to run **as many plugins as possible in Web Workers** to keep the host UI thread completely unencumbered.

### Tier 1: Immediate Web Worker Migration (Already Schema-Driven)
These plugins already emit declarative Schema JSON and do not touch DOM:
1. **`@omni/plugin-feed`**:
   - *Why*: Performs heavy JSON event parsing, filter indexing, and cryptographic signature checks. Moving to a Web Worker guarantees buttery smooth 120fps timeline scrolling.
2. **`@omni/plugin-checklist`**:
   - *Why*: Pure state machine managing task items. Zero DOM dependencies.

### Tier 2: High-Value Web Worker Conversions (Complex Plugins)
With Omni's expanded Schema primitives (`omni-select`, `omni-tabs`, `omni-status-indicator`, `omni-code-block`, `omni-progress`, `omni-banner`), these can now be converted to pure Schema + Web Worker:
3. **`@omni/plugin-relays`**:
   - *Current*: Direct iframe with HTML table and buttons.
   - *Worker Architecture*: Uses `<omni-tabs>` (All / Active / Add), `<omni-status-indicator>` (online / connecting / offline / error with pulse), `<omni-list>`, `<omni-input>`, and `<omni-button>`. Runs pool ping checks and latency calculations off-thread.
4. **`@omni/plugin-profile-viewer`**:
   - *Current*: Direct iframe with HTML profile header, notes timeline, and custody keys tabs.
   - *Worker Architecture*: Uses `<omni-tabs>` (My Profile / People / Edit / Keys), `<omni-avatar>`, `<omni-code-block>` (for npub/hex), `<omni-input>` and `<omni-textarea>` (for profile metadata editing), and `<omni-list>` (for notes).
5. **`@omni/plugin-publisher` (Plugin Studio & Blossom Publisher)**:
   - *Current*: Direct iframe.
   - *Worker Architecture*: Blossom SHA-256 chunk hashing, JSZip archive decompression, and NIP-5A signing are CPU-heavy and should run in a background worker, emitting `<omni-progress>` and `<omni-card>` primitives to the UI.

### Tier 3: Standalone Visual Nsites (Retained in Sandboxed Iframes)
* Third-party full-stack nsites that rely on complex third-party browser libraries (Canvas, WebGL games, external React/Svelte bundles without Schema output).
* Renders using `IframeAppHost` with standard sandboxing.

---

## 5. Implementation Roadmap

### Phase 1: Core Worker Infrastructure (`WorkerGuestHost`)
- Implement `packages/core/src/sandbox/worker-guest-host.ts`.
- Encapsulate `Worker`, MessageChannel port transfer, and hardened preamble.
- Update `SandboxInstance` / `SandboxManager` to route plugins with `format: "schema"` (or headless scripts) to `WorkerGuestHost` instead of creating hidden 0×0 iframes.

### Phase 2: Runtime Bridge Worker Compatibility
- Verify that `packages/core/src/sandbox/omni-runtime.js` runs cleanly in Worker global scope (`self` instead of `window`).
- Guard any window-specific DOM references (`window.document`, `window.addEventListener`) with `typeof window !== "undefined"`.

### Phase 3: Transition Core Plugins to Web Workers
- Validate `@omni/plugin-feed` and `@omni/plugin-checklist` running inside `WorkerGuestHost`.
- Migrate `@omni/plugin-relays` to declarative Schema tabs and status indicators.

### Phase 4: Verification & Integration Testing
- Add comprehensive vitest suite `packages/core/test/worker-guest-host.test.ts`.
- Ensure all 335+ existing workspace tests pass without regression.
