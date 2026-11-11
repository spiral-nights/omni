# Omni — Agent & Developer Guide

> Pure Gleam implementation (JS target, Gleam 1.19.2). Host page: `apps/web`.
> Start with [`docs/README.md`](docs/README.md) and [`docs/01-architecture.md`](docs/01-architecture.md).

## 1. What Omni Is

An extensible, local-first Nostr client and sandboxed micro-frontend runtime for
100% standard Nostr sites (nsites).

### Mandates

1. **Every functional domain is a plugin.** Feed, relays, profiles, checklist,
   notes, timer, and publisher are separate `plugin_*` packages under
   `gleam/plugins/`. The shell itself is `omni_shell`.
2. **The host is a microkernel.** `apps/web` paints the shell into
   `#omni-root`; all behavior lives in Gleam packages.
3. **Zero proprietary SDKs and manifests.** Plugins use standard `window.nostr`,
   `window.WebSocket`, `localStorage`, `navigator.share`, protocol links, and
   Declarative Schema messages. There is no `omni.*` API.
4. **Kernel is headless; shell owns presentation.** `omni_kernel` handles
   storage, crypto, relays, ACL, RPC, and plugin resolution. `omni_shell`
   handles layouts, dock, widgets, settings, and themes.
5. **Shells are swappable plugins.** `classic`, `panorama`, and `editorial`
   implement the same `Theme` interface and are chosen through the
   storage-backed `ShellRegistry`.
6. **No hard-coded plugin IDs in shell, UI, or styles.** Ever. Tests use
   generic IDs such as `example.app.alpha`.
7. **No emojis.** Use monochrome geometric SVG line icons (`omni_ui/icons`).
8. **No cross-plugin imports.** Shared code is statically linked from
   `omni_social`, `omni_social_ui`, and `omni_plugin_kit`.
9. **Workspace sync is decentralized.** NIP-78 `kind: 30078`,
   `["d", "omni/workspace/v1"]`, with a 0ms local fallback.

## 2. Repository Structure

```
omni/
├── apps/web/                     # Host page: index.html + main.ts (interop calls only)
├── gleam/
│   ├── platform/                 # FFI quarantine: crypto, IndexedDB, WebSocket, storage, URL
│   ├── nostr/                    # Events, filters, bech32/NIP-19, relay frames
│   ├── protocol/                 # Schema AST, RPC, workspace, intents, capabilities
│   ├── kernel/                   # ACL, keystore, event store, relay pool, RPC, plugins
│   ├── sandbox/                  # Guest hosts (iframe/worker/wasm), CSP, tokens, manager
│   ├── ui/                       # Icons, tokens, sanitizer, Schema renderer
│   ├── shell/                    # Elm model/update, layouts, settings, registry, themes
│   ├── web/                      # Bootloader: config, boot/dispatch/view, sandbox spawning
│   ├── plugin_kit/               # Plugin harness, typed window.nostr, routes, local stores
│   ├── social/ + social_ui/      # Shared note/profile domain and note card views
│   ├── bridge/                   # Guest shims + bundled guest runtime (FFI quarantine)
│   ├── interop/                  # TypeScript-facing facade for apps/web (temporary)
│   ├── testkit/                  # Fake ports, generators, golden snapshots (dev only)
│   └── plugins/                  # feed, notes, timer, profiles, checklist, relays, publisher
├── assets/styles/                # tokens.css, schema.css, shell-modules.css, theme CSS
├── tests/bridge/                 # Guest-bridge conformance and bundle tests (Vitest)
├── scripts/                      # Ordered Gleam build/test, architecture lint, bridge bundler
└── docs/                         # Architecture, protocols, plugin guide, sandboxing, schema
```

Conventions: directory `gleam/<name>` → package `omni_<name>` → modules
`omni/<name>/...`; plugins `gleam/plugins/<name>` → `plugin_<name>` → modules
`plugin/<name>/...`.

## 3. Sandbox Execution & Virtual APIs

Guests run in `<iframe sandbox="allow-scripts">` with `connect-src 'none'`,
Web Workers, or Wasm hosts. Omni virtualizes standard interfaces:

- **`window.nostr`** — NIP-07 (`getPublicKey`, `signEvent`, `getRelays`,
  `nip04`, `nip44`) plus `fetch`, `subscribe`, `publish`, and `doc` for
  reactive replaceable documents. Backed by the host keystore and ACL.
- **`window.WebSocket`** — virtual relay socket translating `REQ`/`CLOSE`/
  `EVENT` frames to kernel RPC and stream notifications back to the guest.
- **`localStorage`** — partitioned per plugin (`omni:plugin:<pluginId>:key`).
- **`navigator.share`** — routed to the shell composer.
- **Protocol URIs** — `nostr:`, `lightning:`, `cashu:` links become intents
  handled by the "Open With…" chooser.

Host side: `omni_sandbox` (CSP, tokens, srcdoc, manager); guest side:
`omni_bridge`, bundled to `gleam/bridge/dist/guest-runtime.js` by
`scripts/build-bridge.mjs`. Details: [`docs/05-sandbox-hosting.md`](docs/05-sandbox-hosting.md).

## 4. UI Architecture

### Declarative Schema (primary)

Plugins emit a Schema tree (`{ type: "omni:schema", schema }`) over Channel 1
or an inline `<script type="application/json" id="omni-schema">`.
`omni_ui` mounts plain Lustre Light DOM elements (no Shadow DOM, no custom
elements), and actions return as `{ type: "omni:action", action }`.
AST: `omni/protocol/schema/node`; builders: `builder.gleam`;
renderer: `omni_ui/render/*`. Details:
[`docs/06-nostr-extensions-and-schema.md`](docs/06-nostr-extensions-and-schema.md).

### Direct sandboxed iframe

Full standalone HTML apps mount as visible iframes. Design tokens are injected;
NIP-07, relay sockets, and protocol links are bridged transparently.

### WebAssembly

Components built against the WIT surface export `init()`/`handle-action` and
render through the same Schema pipeline.

### Navigation

Dock items follow `<button class="dock-item">`, with a
`<div class="dock-icon-wrapper">` icon and a label span. Themes emit their own
markup from `omni_shell`.

## 5. Security & Storage

- **Dual-channel IPC**: Channel 1 = schema/actions; Channel 2 = JSON-RPC.
- **Namespaced subscriptions**: `${pluginId}:${subId}`; no cross-plugin leakage.
- **Kind-level ACL filtering**: sensitive kinds (4, 13, 14, 1059, 1060) require
  an explicit grant before they reach a plugin's query results.
- **Capability prompts**: allow/deny/prompt per plugin and capability, stored
  through the injectable storage port.
- **0ms cache**: IndexedDB `omni_event_store` with an in-memory index.
- **NIP-78 workspace state**: cached locally under `omni_workspace_state`.

## 6. Aesthetic Guidelines

Warm Paper Dark palette (tokens in `assets/styles/tokens.css`):

| Token | Value |
|---|---|
| Canvas | `#141312` |
| Surface | `#191816` |
| Elevated | `#22201d` |
| Text primary | `#ede8df` |
| Text secondary | `#9e988f` |
| Text muted | `#6b665f` |
| Accent | `#d4a373` |

Icons: geometric monochrome SVG, 1.5–1.8px stroke, inheriting `currentColor`.
Never emojis.

## 7. Workflows

```bash
pnpm install          # JS tooling
pnpm build            # ordered Gleam build + guest bridge bundle + Vite host build
pnpm dev              # http://localhost:3000
pnpm test             # bridge conformance + all Gleam package suites
pnpm gleam:check      # format --check + type-check + architecture lint
pnpm bundle:report    # built asset sizes
```

Rules:

1. `pnpm build`, `pnpm test`, and `pnpm gleam:check` must pass before committing.
2. FFI (`@external`, `.mjs`) only in `platform`, `bridge`, `testkit`, and
   `interop`; one `<module>.ffi.mjs` per module. Bundler entries may live under
   `gleam/*/js/`.
3. Use Gleam record update syntax (`Model(..model, field: value)`).
4. No comments that restate the code; comment *why*.
5. Commit incrementally with Conventional Commits (`feat(scope): …`, `fix(…)`,
   `docs(…)`, `test(…)`, `chore(…)`).
