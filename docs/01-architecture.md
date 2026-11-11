# Omni Architecture

> Current state, November 2026. Omni is a pure Gleam (JavaScript target)
> application: `apps/web` hosts a Gleam shell built on a headless Gleam kernel.
> There is no TypeScript runtime, no MoonBit toolchain, and no proprietary SDK.

## Layers

```
apps/web (index.html + main.ts)
        │  imports @omni/gleam-interop (compiled Gleam)
        ▼
omni_web          bootloader: config, kernel wiring, dispatch, theme view
        │
        ├── omni_shell      Elm loop (model/msg/update), layouts, settings, themes
        ├── omni_kernel     ACL, keystore, event store, relay pool, RPC, plugins
        ├── omni_sandbox    guest hosts (iframe/worker/wasm), CSP, tokens, manager
        ├── omni_ui         icons, tokens, sanitizer, Schema renderer
        ├── omni_protocol   contracts: Schema AST, RPC, workspace, intents, manifests
        ├── omni_nostr      events, filters, bech32/NIP-19, relay frames
        └── omni_platform   FFI quarantine: crypto, IndexedDB, WebSocket, storage, URL
```

Plugin-facing packages sit beside the shell:

- `omni_plugin_kit` — Elm harness (`AppSpec`/`RunningApp`), typed `window.nostr`,
  routes, versioned local storage, schema message codecs.
- `omni_social` / `omni_social_ui` — shared note/profile domain and the shared
  note-card Schema view, statically linked into each plugin that uses them.
- `omni_bridge` — guest-side shims plus the bundled guest runtime.
- `omni_testkit` — fake ports, generators, golden snapshots (dev only).

`omni_interop` is the one deliberately temporary package: a TypeScript-facing
facade so `apps/web` can call `start_with_bridge`, `render`, `spawn_plugin`, etc.

## Boot path

1. `apps/web/src/main.ts` imports the interop facade and the bundled guest
   bridge (`gleam/bridge/dist/guest-runtime.js?raw`).
2. `shell_boot.start_with_bridge("omni_shell", bridge)` opens IndexedDB,
   builds `KernelPorts`, and calls `omni_web/boot.init_with_bridge`.
3. `boot` creates the kernel, loads the persisted shell registry selection,
   seeds the shell model with the default system apps, and owns a
   `SandboxManager` plus the guest bridge script.
4. `boot.view` resolves the active `Theme` and renders stylesheets + the theme
   view. The host paints it into `#omni-root`.
5. User messages flow through `boot.dispatch`, which applies persistence
   effects (workspace, accent, active shell) and returns host effects (mount
   plugin, intent, update, …). `boot.spawn_sandbox` registers a tracked host and
   builds the iframe mount descriptor with CSP, tokens, and the guest bridge.

## Shell and theme model

`omni_shell` owns one Elm loop shared by every theme. Themes (`classic`,
`panorama`, `editorial`) implement `theme() -> Theme` and `view(model)`, and are
selected through the storage-backed `ShellRegistry`. The shell is strictly
plugin-agnostic: no hard-coded plugin IDs, no layout knowledge of any plugin.
Shared `omni-*` layout styles live in `assets/styles/shell-modules.css`;
theme chrome lives in `classic.css`, `panorama.css`, `editorial.css`.
Design tokens are `tokens.css`; Schema primitives are `schema.css`.

## Runtime boundaries

- **Kernel is headless** — storage, crypto, relays, ACL, RPC, plugin resolution.
- **Shell owns presentation** — layouts, dock, widgets, settings, themes.
- **Plugins are standard nsites** — `window.nostr`, `WebSocket`, `localStorage`,
  `navigator.share`, protocol links, and Declarative Schema messages. No `omni.*`.
- **Sandboxes are isolated** — iframe `sandbox="allow-scripts"` with
  `connect-src 'none'`, or worker/Wasm hosts for non-DOM clients.

See `02-protocols-and-storage.md`, `05-sandbox-hosting.md`, and
`06-nostr-extensions-and-schema.md` for the details.
