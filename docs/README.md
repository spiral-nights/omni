# Omni Documentation Index & Reading Guide

> **Current Architecture Status (November 2026):**  
> The codebase is actively migrating from legacy TypeScript (`packages/*`) and MoonBit (`packages/plugins/feed/feed.mbt`) to a clean, idiomatic **Gleam** multi-package architecture under `gleam/` (JS target via `gleam 1.19.2`).

---

## 1. Authoritative Documents (Start Here)

If you are an AI assistant or human developer working on Omni today, **read these first**:

1. **[`09-gleam-migration-handoff.md`](09-gleam-migration-handoff.md)**:  
   *Current status, package-by-package progress, exact list of remaining tasks, critical Gleam FFI constraints, and how to verify.*
2. **[`07-gleam-migration-checklist.md`](07-gleam-migration-checklist.md)**:  
   *The living checklist of migration phases (Phases 0–8). Mark completed items `[x]` as they finish.*
3. **[`gleam-rewrite-plan.md`](gleam-rewrite-plan.md)**:  
   *The foundational architectural blueprint for the Gleam rewrite (package boundaries, Lustre Light DOM schema rendering, Elm-style harnesses, and shared `omni_social` design).*
4. **[`08-gleam-toolchain.md`](08-gleam-toolchain.md)**:  
   *Pinned Gleam compiler & package versions, build commands (`pnpm gleam:check`, `pnpm gleam:test`), and test harness guide.*
5. **[`10-bridge-parity.md`](10-bridge-parity.md)**:  
   *Dual-run conformance harness and cutover plan for the Gleam guest bridge.*
6. **[`../AGENTS.md`](../AGENTS.md)**:  
   *Core system mandates: zero proprietary `omni.*` SDKs, pure standard nsites, no emojis, zero hardcoded plugin IDs in shell/styles, Light DOM, warm paper dark theme.*

---

## 2. Legacy / Historical Documents (Read With Caution)

The documents listed below were written for the original TypeScript / MoonBit codebase. While they explain the high-level Nostr protocol concepts and wire schemas, **their code examples and package references are legacy and being replaced**:

| Document | Status | What It Covers | How to Interpret During Gleam Rewrite |
|---|---|---|---|
| **[`01-architecture.md`](01-architecture.md)** | *Partially Deprecated* | TS monorepo layout, `@omni/core`, `@omni/plugin-shell` | Architecture concepts remain valid, but implementation is now under `gleam/*`. |
| **[`02-protocols-and-storage.md`](02-protocols-and-storage.md)** | *Concepts Valid* | Nostr event formats, 0ms caching, NIP-78 sync, Blossom | Pure protocol rules still apply; implementation is now in `omni_nostr` and `omni_kernel`. |
| **[`03-plugin-developer-guide.md`](03-plugin-developer-guide.md)** | *Partially Deprecated* | TS plugin creation, manifest-free nsites | Guidelines on pure standard nsites remain, but plugins are now authored using `omni_plugin_kit`. |
| **[`04-intents-and-permissions.md`](04-intents-and-permissions.md)** | *Concepts Valid* | Standard Omni intents (`view_note`, `create_note`, etc.) and kind-level ACL | Wire schemas still apply; now implemented in `omni_protocol/intent.gleam` and `omni_kernel/acl/`. |
| **[`05-web-worker-runtime-plan.md`](05-web-worker-runtime-plan.md)** | *Historical Design* | Discussion of off-thread Web Worker hosting | Unified `GuestHost` abstraction now implemented in `gleam/sandbox/src/omni/sandbox/host.gleam`. |
| **[`06-nostr-extensions-and-schema.md`](06-nostr-extensions-and-schema.md)** | *Concepts Valid* | Declarative schema primitives JSON schema and wire format | Wire format is identical; AST is defined in `omni_protocol/schema/node.gleam` and rendered by `omni_ui/render.gleam`. |
| **[`migration_plan.md`](migration_plan.md)** | *Historical* | Early TS modularization notes | Superseded entirely by `gleam-rewrite-plan.md`. |
| **[`CODEBASE_REVIEW.md`](CODEBASE_REVIEW.md)** | *Historical* | Code review of earlier TS shell code | Useful historical context only. |

*(Note: During Phase 8.2 of the migration checklist, these older documents will be updated and consolidated).*
