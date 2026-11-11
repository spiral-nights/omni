# Omni — Gleam Migration Handoff & Status Report

> **Branch:** `gleam-rewrite`  
> **Target:** `gleam 1.19.2` targeting JavaScript  
> **Root Directory:** `/home/spiralnights/code/omni`  
> **Date:** October/November 2026  

---

## 1. Executive Summary & Where We Are

The codebase is migrating from TypeScript (~47.6k LOC) and MoonBit (~1.7k LOC) to a clean, idiomatic multi-package Gleam workspace under `gleam/`.

- **Phases 0 through 5 are 100% COMPLETE and committed** to `gleam-rewrite`.
- **Phase 6 (Shell)** is **complete**: Core model/msg/update, layout viewports, dock, header actions, widgets dashboard, settings panels, and all three built-in themes (Classic, Panorama, Editorial) are written and unit tested. The storage-backed `ShellRegistry` and the `omni_web` bootstrap config/bootloader exist and are tested; only wiring `apps/web` to mount the boot tree remains (Phase 6.8).
- **Phase 7 (Plugin Kit & Social)** is **partially complete**:
  - `omni_plugin_kit`: 100% complete and tested.
  - `omni_social` & `omni_social_ui`: 100% complete and golden snapshot tested.
  - First-party plugins (`checklist`, `relays`, `publisher`, `feed`, `notes`, `timer`, `profiles`): scaffolded; several modules created before subagents hit individual rate limits.
- **Phase 8 (Cleanup & Cutover)**: Pending completion of Phase 6 and 7.

---

## 2. Key Document Index

| Document | Path | Purpose |
|---|---|---|
| **Architectural Rules & Philosophy** | [`AGENTS.md`](file:///home/spiralnights/code/omni/AGENTS.md) | Absolute system mandates: zero proprietary `omni.*` SDKs, pure standard nsites, no emojis, zero hardcoded plugin IDs in shell/styles, Light DOM, warm paper dark theme. |
| **Comprehensive Migration Plan** | [`docs/gleam-rewrite-plan.md`](file:///home/spiralnights/code/omni/docs/gleam-rewrite-plan.md) | Architectural blueprint, package breakdown, Gleam FFI patterns, D1–D5 decisions. |
| **Migration Checklist** | [`docs/07-gleam-migration-checklist.md`](file:///home/spiralnights/code/omni/docs/07-gleam-migration-checklist.md) | Granular phase-by-phase task checklist. Update `[x]` as tasks finish. |
| **Toolchain Guide** | [`docs/08-gleam-toolchain.md`](file:///home/spiralnights/code/omni/docs/08-gleam-toolchain.md) | Gleam compiler commands, topological builder, golden tests, testkit details. |
| **Architecture Linter** | [`scripts/lint-gleam-architecture.mjs`](file:///home/spiralnights/code/omni/scripts/lint-gleam-architecture.mjs) | Validates FFI quarantine, dependency layering, no `plugin_* -> plugin_*` imports, no hardcoded plugin IDs in shell/UI, no emojis. |

---

## 3. Package Status Breakdown

### A. Fully Completed Packages (Committed & Verified)

1. **`gleam/platform` (`omni_platform`)**:
   - WebCrypto, secp256k1, NIP-44, IndexedDB, WebSocket, Storage, URL, Ref, Clock, JSON.
   - All FFI quarantined strictly to `*.ffi.mjs`. (57 tests passing).
2. **`gleam/nostr` (`omni_nostr`)**:
   - Event, EventId, Pubkey, Kind, EventCodec, Filter, FilterCodec, RelayUrl, RelayFrame, Bech32 (pure BIP-173/350), NIP-19 TLV codecs. (76 tests passing).
3. **`gleam/protocol` (`omni_protocol`)**:
   - Viewport, Capability, Grant, PluginId, Workspace, Intent, Manifest, Blossom.
   - JSON-RPC envelopes, 19 RPC methods & codecs.
   - Declarative Schema: all 24 UI node variants, style tokens, actions, builders, and codecs using concise record update syntax. (43 tests passing).
4. **`gleam/testkit` (`omni_testkit`)**:
   - In-memory fake ports, QCheck generators, Node `fs`-backed `golden.gleam` snapshot assertion harness (`OMNI_UPDATE_GOLDEN=1`). (25 tests passing).
5. **`gleam/kernel` (`omni_kernel`)**:
   - Headless composition root.
   - ACL engine & capability store, local 0ms event store index, relay pool state machine, coordinator, keystore, NIP-78 workspace sync, RPC rate limiting/quota/dispatcher, plugin resolver/registry/updates, router, intent broker, layout model. (124 tests passing).
6. **`gleam/sandbox` (`omni_sandbox`)**:
   - Unified `GuestHost` strategy (`IframeAppHost`, `WorkerGuestHost`), Channel 1/2 dual-port IPC, CSP builder, design token injector, CSS scoper, protocol shims interceptor, SandboxManager. (68 tests passing).
7. **`gleam/ui` (`omni_ui`)**:
   - 62 monochrome SVG icons (`icons.gleam`), `--omni-*` tokens (`tokens.gleam`), pure HTML/URL sanitizer (`sanitize.gleam`).
   - Plain HTML element renderer with `.omni-*` classes for all 24 schema nodes (`render/{layout,text,input,feedback,list}.gleam`, `virtual_list.gleam`).
   - Schema host with `omni:action` round-trip dispatch (`host.gleam`). (30 tests passing).
8. **`assets/styles/*.css`**:
   - `tokens.css`, `schema.css` (dual-supporting custom element tags and `.omni-*` classes), `classic.css`, `panorama.css`, `editorial.css`.
9. **`gleam/plugin_kit` (`omni_plugin_kit`)**:
   - `route.gleam` (`?view=settings`, query parameters).
   - `local_store.gleam` (versioned localStorage JSON store).
   - `schema.gleam` (message encoders/decoders for Channel 1).
   - `nostr.gleam` (typed `window.nostr` client, `mock_client`, reactive `open_doc` with replaceable NIP-78 sync and NIP-44 encryption).
   - `app.gleam` (Elm-style harness `AppSpec`/`RunningApp` for plugins). (8 tests passing).
10. **`gleam/social` (`omni_social`) & `gleam/social_ui` (`omni_social_ui`)**:
    - `profile.gleam`, `note.gleam` (NIP-10 marked/positional resolution), `stats.gleam` (reducer for kinds 1, 6, 7, 9735), `thread.gleam`, `follows.gleam` (Kind 3 contact list), `queries.gleam`, `profile_cache.gleam`.
    - `note_card.gleam`: Shared declarative schema note card builder used by both feed and profiles, verified by golden snapshots. (11 tests passing).

---

## 4. What Is Left (By Area / Package)

### 1. Phase 6: Shell & Web Bootloader
- [x] **Phase 6.5, 6.6, 6.7 — Shell Themes (`gleam/shell/src/omni/shell/themes/`)**:
  - `classic.gleam`, `panorama.gleam`, `editorial.gleam` implement `pub fn theme() -> Theme` and `pub fn view(model: Model) -> Element(Msg)`.
  - Shared shell module styles live in `assets/styles/shell-modules.css` (loaded for every theme).
- [x] **Phase 6.8 (A) — Shell Registry (`gleam/shell/src/omni/shell/registry.gleam`)**:
  - `ShellRegistry` with `new`, `with_builtin_themes`, `register`, `unregister`, `resolve`, `active_theme`, `load_active_id`, `save_active_id` backed by `omni/platform/storage`.
- [x] **Phase 6.8 (B) — Web Bootloader (`gleam/web` — `omni_web`)**:
  - `src/omni/web/config.gleam`: bootstrap relays, default system plugin entries, default shell ID.
  - `src/omni/web/boot.gleam`: `init` builds the kernel/registry/model; `dispatch` applies persistence effects; `select_shell`; `view` renders stylesheets + active theme.
- [x] **Phase 6.8 (C) — `apps/web` wiring**:
  - `omni_interop/shell_boot` exposes `start`/`render`/`select_shell`/navigation helpers to TypeScript.
  - `apps/web/src/main.ts` is now a thin host: boots the Gleam kernel + registry, paints the active theme into `#omni-root`, and keeps only the PWA service-worker registration.
  - Follow-up: interactive event delegation from the painted DOM back into `boot.dispatch` (belongs with the Phase 7.10–7.11 host/bridge work).

### 2. Phase 7: First-Party Plugins (`gleam/plugins/`)
All plugins must be pure standard nsites using `omni_plugin_kit`:
- [ ] **Phase 7.3: `plugin_checklist`**:
  - Tasks data model, filter tabs (All/Active/Completed), progress metric, view modes (`main`, `compact`, `widget`, `settings`). Complete `update.gleam`, `view.gleam`, `main.gleam`, and `plugin_checklist_test.gleam`.
- [ ] **Phase 7.4: `plugin_timer`**:
  - Focus countdown timer, presets (25m, 5m, 15m, custom), status (Idle/Running/Paused/Completed), progress ring/disk, compact widget view. Complete `model`, `update`, `view`, `main`, tests.
- [ ] **Phase 7.5: `plugin_relays`**:
  - Relay connection states, read/write toggles, pool metrics, NIP-65 tag generation and publishing, add/remove relay inputs. Complete `view`, `main`, tests.
- [ ] **Phase 7.6: `plugin_notes`**:
  - Encrypted personal notebook (NIP-78 `omni/notes/v1` + NIP-44), folders/tags, search, markdown editing with `sanitize.strip_unsafe_html`. Complete `view`, `main`, tests.
- [ ] **Phase 7.7: `plugin_profiles`**:
  - Profiles directory, Kind 0 metadata editor, Kind 3 follow toggles, key custody view.
  - **Important Architectural Rule**: Uses `omni/social_ui/note_card` to show author notes. Clicking a note emits `OpenNoteIntent(note_id)` to let the host intent broker route to a feed/reader plugin (no duplicated thread viewer!). Complete `view`, `main`, tests.
- [ ] **Phase 7.8: `plugin_publisher`**:
  - Studio draft form, NIP-5A nsite tag generator, Blossom server manager, published nsites list. Complete `view`, `main`, tests.
- [ ] **Phase 7.9: `plugin_feed`**:
  - Replace MoonBit feed with Gleam→JS using `omni_social` + `omni_social_ui`.
  - Views: Timeline (Following/Global/Replies), Thread (ancestors + focal + replies), Search, Settings, Widget.
  - Move legacy MoonBit code to `external-plugins/feed-moonbit/` as an optional Wasm example.

### 3. Phase 7.10–7.11: Sandbox Guest Bridge (`omni_bridge`)
- [ ] Port `packages/core/src/sandbox/omni-runtime.js` to `gleam/bridge` (`omni_bridge`):
  - Guest-side shims: `nostr_shim`, `websocket_shim`, `storage_shim`, `links_shim`, `share_shim`, `schema_bridge`.
  - Monkey-patching window primitives via `globals.ffi.mjs`.
  - Dual-run old vs new bridge against test suites before final cutover.

### 4. Phase 8: Cleanup & Hardening
- [ ] Delete deprecated TypeScript packages and build artifacts.
- [ ] Update `AGENTS.md` and `docs/01–06` to reflect pure Gleam architecture.
- [ ] Verify `pnpm gleam:check`, `pnpm test`, and bundle size comparisons.

---

## 5. Critical Development & Linting Constraints

Any agent continuing this work must follow these strict rules enforced by `scripts/lint-gleam-architecture.mjs`:

1. **FFI Quarantine**:
   - `@external` and `.mjs` files are **ONLY** permitted in `gleam/platform`, `gleam/bridge`, `gleam/testkit`, and `gleam/interop`.
   - **Never** put `.mjs` or `@external` in `gleam/ui`, `gleam/shell`, `gleam/web`, `gleam/plugin_kit`, `gleam/social`, or any `gleam/plugins/*`.
2. **Zero Proprietary SDKs**:
   - Plugins and plugin libraries must never use `window.omni` or `omni.<ident>`. (Standard `window.nostr`, `window.location.search`, and `window.localStorage` only).
3. **No Hardcoded Plugin IDs in Shell / UI / Styles**:
   - Never write literal `org.omni.plugin.` inside `gleam/shell`, `gleam/ui`, or `assets/styles/*.css`. Use generic IDs in shell tests (e.g. `"app.alpha"`).
4. **No Emojis**:
   - Use monochrome geometric SVG line icons only. Emojis in code or styles fail the build.
5. **Concise Record Update Syntax**:
   - Always use Gleam's record update syntax: `Model(..) as m -> Model(..m, field: val)`. Avoid verbose positional wildcard matching.
6. **Testing and Checking**:
   - Run `node scripts/gleam-build.mjs check && node scripts/lint-gleam-architecture.mjs` (`pnpm gleam:check`).
   - Run `node scripts/gleam-build.mjs test` (`pnpm gleam:test`).
   - Run Vitest regression tests: `pnpm test`.
