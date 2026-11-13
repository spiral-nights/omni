# Sandbox Hosting & Guest Bridge

> Current state. Implementation: `gleam/sandbox` (host side) and
> `gleam/bridge` (guest side), with the bundled runtime produced by
> `scripts/build-bridge.mjs`.

## Host strategies

`omni/sandbox` models three guest hosts behind one interface:

| Strategy | Use | Notes |
|---|---|---|
| `IframeHost` | Visual nsites / HTML+JS apps | `sandbox="allow-scripts"`, `connect-src 'none'`, srcdoc with CSP + tokens + bridge |
| `WorkerHost` | Declarative Schema plugins rendered by the shell | no DOM in the guest, Schema over Channel 1 |
| `WasmHost` | Compiled components (Rust/Zig/C/Go) | declared type only; no host module ships (see "WASM hosts") |

`SandboxManager` tracks active hosts, virtual ports, and blob URLs, and
spawns/terminates them. `iframe_host.build_srcdoc` injects:

1. strict CSP meta tag,
2. design tokens style tag,
3. the guest bridge script,
4. the plugin markup.

`omni_web/boot.spawn_sandbox` registers the host and returns the mount
descriptor; `omni_interop/shell_boot.spawn_plugin` inserts the iframe into the
`[data-plugin-slot]` island.

### WASM hosts

There is no WASM host implementation. `host.gleam` still declares
`WasmHost` and `sandbox/manager` returns the WIT-shaped descriptor for a
`?host=wasm` hint, but no loader, WASM runtime binding, or `WIT` bridge
exists in `gleam/sandbox` or `gleam/bridge`.

Decision: **defer** rather than half-ship it. No first-party plugin targets
WASM, and iframe/worker hosts cover every current guest. A real WASM host
means adding:

1. a runtime (e.g. `wasmtime`/`wasmer` via JS bindings) behind a new
   quarantined port,
2. the component-model import surface (`window.nostr`, relays, storage) as
   WIT, mirroring the JSON-RPC methods,
3. the same Channel 1 schema contract the worker host already implements.

Until then, `?host=wasm` plugins are rejected by `SandboxManager` with the
unsupported-format error; there is no silent iframe fallback.

## Dual-channel IPC

On `omni:init` the host transfers two `MessagePort`s:

- **Channel 1 (schema bus)** — guest emits `omni:schema` trees; host sends
  `omni:action` messages back.
- **Channel 2 (kernel RPC)** — JSON-RPC 2.0 requests (`nostr.*`, `relays.*`,
  `storage.*`, intents, navigation, share) plus streaming notifications.

## Guest bridge

`omni_bridge` implements the shims the legacy runtime provided, all reachable
through standard APIs:

| Shim | Module | Surface |
|---|---|---|
| Storage | `storage_shim` | partitioned `localStorage` |
| NIP-07 + extended nostr | `nostr_shim` | `getPublicKey`, `signEvent`, `nip04/44`, `relays`, `fetch`, `subscribe`, `publish`, `doc` |
| Virtual WebSocket | `websocket_shim` | `REQ`/`CLOSE`/`EVENT` frames ↔ RPC, `EVENT`/`EOSE` back |
| Protocol links | `links_shim` | `nostr:`, `lightning:`, `cashu:` → intents |
| Share | `share_shim` | `navigator.share` → shell composer |
| Schema bus | `schema_bridge` | `omni:schema` encode, `omni:action` decode |

`gleam/bridge/js/guest-runtime.mjs` installs them, performs the `omni:init`
handshake, maps JSON-RPC ids to promises, and routes stream notifications.
`scripts/build-bridge.mjs` bundles it to
`gleam/bridge/dist/guest-runtime.js`, which the host imports raw and passes
through `start_with_bridge`.

## Testing

- `tests/bridge/bridge-parity.test.ts` (happy-dom) pins the contract for each
  shim.
- `tests/bridge/bridge-bundle.test.ts` loads the real bundle, completes a
  `MessageChannel` handshake, and exercises `getPublicKey` end to end.
