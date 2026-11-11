# Gleam Migration Checklist

Living roadmap for rewriting Omni (TypeScript + MoonBit) in Gleam (JS target).
Design rationale lives in [gleam-rewrite-plan.md](gleam-rewrite-plan.md); this file tracks progress only.
Mark items `[x]` in the same commit that completes them.

**Ground rules**
- Branch: `gleam-rewrite`. One commit per checklist item or tightly related group, Conventional Commits (`feat(gleam/nostr): ...`, `test(...)`, `build(...)`, `docs(...)`, `refactor(...)`, `chore(...)`).
- App stays green at every commit: `pnpm -r run build`, `pnpm test`, and `gleam test` in every touched Gleam package.
- Port behind golden fixtures from the old implementation; delete the TS module only after fixtures pass.
- `@external` / `.mjs` only in `gleam/platform`, `gleam/bridge`, and (dev-only) `gleam/testkit`. One `<module>.ffi.mjs` per module.
- Package naming: dir `gleam/<name>`, package `omni_<name>`, modules `omni/<name>/...`; plugins `plugin_<name>`.
- Plugins never import other plugins. No plugin IDs in shell/CSS. No `omni.*` in plugins.

**Decisions (agreed)**: D1 plain Lustre elements (no custom elements) · D2 feed → Gleam, MoonBit moves to `external-plugins/` example · D4 plinth wrapped in `platform` · D5 bridge ported to Gleam, **last**.
**D3 decided**: gleeunit + qcheck; file-based golden helper in `testkit` (birdie is Erlang-only). See `08-gleam-toolchain.md`.

---

## Phase 0: Spike and tooling
- [x] 0.1 Gleam workspace skeleton: `gleam/` dir, `gleam/README.md`, root `.gitignore` entries for `gleam/**/build`
- [x] 0.2 `omni_platform` and `omni_protocol` skeleton packages; path deps resolve; `gleam test` runs on JS target (Node)
- [x] 0.3 Verify and pin dependency versions (`gleam_stdlib`, `gleam_json`, `gleam_javascript`, `lustre`, `plinth`, test libs); record in `docs/08-gleam-toolchain.md`; decide D3
- [x] 0.4 Verify shared `omni/<pkg>/` module namespace works across path-linked packages
- [x] 0.5 `scripts/gleam-build.mjs`: build all Gleam packages in dependency order; wire into root `build` / `test` scripts
- [x] 0.6 Vite integration: a Gleam module imported by `apps/web`
- [x] 0.7 Lint scripts: FFI quarantine, no `plugin_* -> plugin_*` imports, no plugin IDs in shell/CSS, no `omni.*` in plugins, no emoji
- [x] 0.8 Spike: ACL policy in Gleam + JS facade, `AclEngine.ts` delegates to it; all existing tests green
- [x] 0.9 Spike: Lustre page reparenting a live iframe between containers (state preserved?)
- [x] 0.10 Go/no-go review; write spike findings; resolve open risks

## Phase 1: Foundations
- [ ] 1.1 `platform`: `ref`, `promise_ext`, `clock`, `json` (+ ffi), `storage` (+ in-memory fake)
- [ ] 1.2 `testkit`: fake ports, generators, fixture loader
- [ ] 1.3 `nostr`: `kind`, `pubkey`, `event_id`, `event` + codec
- [ ] 1.4 `nostr`: `bech32` + `nip19` (property tests vs old TS vectors)
- [ ] 1.5 `nostr`: `filter` (matching, merge), `relay_url`, `relay_frame` codec, `replaceable`
- [ ] 1.6 Remove TS/MoonBit bech32 duplicates (facade to Gleam)

## Phase 2: Protocol contracts
- [ ] 2.1 `protocol`: `plugin_id`, `capability`, `grant`, `viewport`
- [ ] 2.2 `protocol/rpc`: envelope, error codes, `Request` ADT, decode/encode + golden fixtures
- [ ] 2.3 `protocol/schema`: `Node` ADT, style, action, codec, builders + golden fixtures
- [ ] 2.4 `protocol`: `workspace` (versioned codec), `intent`, `manifest`, `blossom`, `wit`
- [ ] 2.5 Wire-compat tests against recorded TS output

## Phase 3: Kernel
- [ ] 3.1 `platform`: `idb`, `websocket`, `message_port`, `webcrypto`, `secp256k1`, `nip44`, `zip`, `url`
- [ ] 3.2 `kernel/acl`: policy, reserved rules, capability store, read filter, engine
- [ ] 3.3 `kernel/nostr`: event store + index (benchmark vs TS)
- [ ] 3.4 `kernel/nostr`: subscription router, relay pool state machine, coordinator, `docs`
- [ ] 3.5 `kernel`: workspace sync (NIP-78), plugin storage, keystore
- [ ] 3.6 `kernel/rpc`: rate limit, quota, dispatcher + handlers (nostr, signer, storage, intents, navigation, share)
- [ ] 3.7 `kernel/plugins`: resolver chain, bundler, registry, updates
- [ ] 3.8 `kernel`: navigation, intent broker, layout model
- [ ] 3.9 `kernel.gleam` composition root; TS `@omni/core` kernel replaced behind facade

## Phase 4: Sandbox hosting (host side)
- [ ] 4.1 `sandbox`: `GuestHost` interface, channel, CSP builder, tokens, CSS scoper
- [ ] 4.2 `sandbox`: iframe host, worker host, wasm host (verify with a Wasm plugin)
- [ ] 4.3 `sandbox`: protocol shims (host side), manager
- [ ] 4.4 Isolation tests unchanged (CSP, `connect-src 'none'`)

## Phase 5: UI layer
- [ ] 5.1 `ui`: icons, tokens, sanitize
- [ ] 5.2 `ui/render`: one pure function per schema node (snapshot tests)
- [ ] 5.3 `ui`: host mount + `omni:action` round trip
- [ ] 5.4 Move CSS to `assets/styles/*.css`

## Phase 6: Shell
- [ ] 6.1 Shell core: model, msg, update (pure, unit-tested)
- [ ] 6.2 Viewport host islands, dock, header actions, widgets grid, main view
- [ ] 6.3 Settings tabs, placements, permissions, intents, relay scoping, shell manager
- [ ] 6.4 App store, update modal, pull-to-refresh
- [ ] 6.5 Classic theme
- [ ] 6.6 Panorama theme
- [ ] 6.7 Editorial theme
- [ ] 6.8 Shell registry; `omni_web` bootloader replaces `apps/web/src/main.ts`

## Phase 7: Plugins and bridge
- [ ] 7.1 `plugin_kit`: typed `window.nostr`, app harness, route, `local_store`, subscribe helper
- [ ] 7.2 `social` + `social_ui` extracted with golden fixtures for the shared note card
- [ ] 7.3 Plugin `checklist`
- [ ] 7.4 Plugin `timer`
- [ ] 7.5 Plugin `relays`
- [ ] 7.6 Plugin `notes`
- [ ] 7.7 Plugin `profiles` (opens threads via intent)
- [ ] 7.8 Plugin `publisher`
- [ ] 7.9 Plugin `feed` (replaces MoonBit); MoonBit version moved to `external-plugins/` example
- [ ] 7.10 `bridge`: port shims one by one (nostr, websocket, storage, links, share, schema bridge)
- [ ] 7.11 Run old and new bridge side by side against the full plugin suite; cut over

## Phase 8: Cleanup and hardening
- [ ] 8.1 Delete remaining TS packages, MoonBit toolchain, unused `jco`/WIT tooling
- [ ] 8.2 Update `AGENTS.md` and `docs/01–06`
- [ ] 8.3 CI: ordered build, `gleam test` per package, `gleam format --check`, lint scripts, e2e smoke test
- [ ] 8.4 Performance and bundle-size comparison vs TS baseline
- [ ] 8.5 Rename `gleam/` to `packages/` (optional)
