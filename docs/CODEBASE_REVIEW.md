# Omni Codebase Review & Remediation Plan

This document outlines the technical debt, architectural violations, security risks, memory leaks, code duplication, and code quality issues identified in the Omni codebase, along with a step-by-step remediation plan.

---

## Issue Tracking Checklist

### Phase 1: Security & Sandboxing Isolation
- [x] **1.1 Sandbox Escape Vector**: Remove `allow-same-origin` from `IframeAppHost` iframe sandbox attribute.
- [x] **1.2 Storage Partitioning**: Enforce true per-plugin storage isolation for guest `localStorage` and remove cross-plugin global key access.

### Phase 2: Architectural Mandates & Leaky Abstractions
- [x] **2.1 ACL Bypass**: Remove hardcoded `isRelaysPlugin = pluginId === "org.omni.plugin.relays"` permission bypass from `JsonRpcDispatcher`.
- [x] **2.2 Hardcoded Plugin Exceptions**: Eliminate hardcoded plugin IDs from `sandbox-manager.ts`, `omni-kernel.ts`, `panorama-shell.ts`, and `base-shell.ts`.
- [x] **2.3 Headless Kernel Separation**: Move UI slot definitions (`STANDARD_SLOTS`, `STANDARD_VIEWPORTS`) from `@omni/core` to `@omni/plugin-shell`.
- [x] **2.4 Standard Web API Conformance**: Deprecate proprietary `window.__OMNI_*` globals in plugins in favor of standard `window.location.search`.

### Phase 3: Memory Leaks & Resource Cleanup
- [x] **3.1 Zombie Event Listeners in PanoramaShell**: Store and remove `popstate`, `click`, and `keydown` window/document listeners in `PanoramaShell.destroy()`.
- [x] **3.2 Missing Base Cleanup in EditorialShell**: Ensure `EditorialShell.destroy()` calls `super.destroy()` to clean up pull-to-refresh and debounce timers.
- [x] **3.3 Unbounded Caches**: Add LRU / maximum bounds to `eventMemoryCache` in `primitive-elements.ts` and `seenEventIds` in `SubscriptionCoordinator`.

### Phase 4: Code Duplication Consolidation
- [x] **4.1 Consolidate Bech32 / NIP-19 & TLV Parsing**: Unify Bech32 and NIP-19 TLV parsing into `@omni/core/crypto`, replacing 5 duplicate implementations.
- [x] **4.2 Consolidate SVG Icon Libraries**: Unify SVG icons between core and shell, delete unused `apps/web/src/icons.ts`.
- [x] **4.3 Consolidate ZIP & BUD-06 Blossom Utilities**: Share MIME detection, relative path resolution, and Blossom auth drafts between core and publisher.

### Phase 5: Code Quality, Smells & Bug Fixes
- [x] **5.1 Polymorphism & Type Safety**: Replace `(this as any)` and `(shell as any)` with proper polymorphic methods on `BaseShell` and `OmniShellHost`.
- [x] **5.2 Blossom Binary Verification Bug**: Fix `fetchAndVerifyBlossomBlob` to use `arrayBuffer()` instead of `text()` (preventing binary corruption) and add request timeouts.
- [x] **5.3 IndexedDB Query Optimization**: Implement direct `store.get(id)` for primary key ID lookups in `LocalEventStore` instead of O(N) cursor scans.
- [x] **5.4 Declarative Infinite Scroll**: Replace heuristic `includes("load more")` in `schema-renderer.ts` with declarative attribute checking.
- [x] **5.5 Toast Notifications in PanoramaShell**: Replace browser `alert()` with `showToast()`.
- [x] **5.6 Relay Pool Reconnection Backoff**: Add exponential backoff to `RelayPool` reconnects to prevent connection storms.

### Phase 6: Dead Code Cleanup & Build Config
- [x] **6.1 Remove Dead Files**: Remove `apps/web/src/icons.ts` and `apps/web/public/remote-dom-architecture.html`.
- [x] **6.2 Vitest Configuration**: Add root `vitest.config.ts` to properly scope test discovery and exclude ignored directories.
