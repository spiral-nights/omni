# Guest Bridge Parity & Cutover Plan

> Phase 7.10 shipped the Gleam guest bridge (`gleam/bridge`, `omni_bridge`).
> Phase 7.11 is the dual-run: prove the new bridge honours the same external
> contract as `packages/core/src/sandbox/omni-runtime.js`, then swap it in.

## Conformance harness

`packages/core/test/bridge-parity.test.ts` runs in happy-dom and exercises the
compiled-by-Vite FFI entry points directly, asserting the behaviour every
injected guest runtime must provide:

| Contract | Test | New module |
|---|---|---|
| Per-plugin `localStorage` isolation | `storage partition` | `storage_shim.ffi.mjs` |
| `nostr:`/`lightning:`/`cashu:` anchor interception | `protocol links` | `links_shim.ffi.mjs` |
| `navigator.share` routed to the shell | `share` | `share_shim.ffi.mjs` |
| `omni:action` delivery to the guest | `schema actions` | `schema_bridge.ffi.mjs` |
| NIP-07 + fetch/subscribe/publish over RPC | `window.nostr` | `nostr_shim.ffi.mjs` |
| Relay frames (`REQ`/`CLOSE`/`EVENT`) and stream frames (`EVENT`/`EOSE`) | `virtual WebSocket` | `websocket_shim.ffi.mjs` |

Run: `pnpm exec vitest run packages/core/test/bridge-parity.test.ts`.

## Guest bundle

`node scripts/build-bridge.mjs` (also run by `pnpm gleam:build`) compiles
`gleam/bridge/js/guest-runtime.mjs` into `gleam/bridge/dist/guest-runtime.js`,
a single IIFE that:

- installs the storage/links/share/schema/nostr/websocket shims,
- listens for the `omni:init` handshake and captures the schema + RPC ports,
- forwards JSON-RPC requests over Channel 2 and routes
  `nostr.stream.event` / `nostr.stream.eose` notifications to the shims.

`packages/core/test/bridge-bundle.test.ts` loads the bundle in happy-dom,
completes the handshake with a `MessageChannel`, and asserts a full
`getPublicKey` round-trip.

Inject it through `IframeConfig.bridge_script` (or the kernel
`runtimeScript` option) instead of the legacy file.

## Remaining cutover work

1. **Host wiring**: pass the bundle to the sandbox host when `omni_web` mounts
   plugin islands (the Gleam iframe/worker hosts already accept a
   `bridge_script` / `runtime_script` string), then make it the default.
2. **Dual-run**: for one release, inject both runtimes behind a flag
   (`runtimeScript` env/config) and run the existing sandbox test suites
   (`transparent-api`, `subscription-isolation`, `nip78-workspace`, plugin
   schema tests) against each.
3. **Cut over**: make the Gleam bundle the default, delete
   `omni-runtime.js`, and drop the `?raw` import from the host.
4. **Parity gaps to close first**: the legacy runtime also shims
   `speechSynthesis`, `fetch` (Blossom/HTTP RPC), `window.open`,
   `location`/`history`, scroll APIs, and theme/token injection. Those are
   host-side or `platform` concerns; decide per shim whether to port or drop.
