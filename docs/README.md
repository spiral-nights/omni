# Omni Documentation

Omni is an extensible, local-first Nostr web client and sandboxed micro-frontend
runtime for standard Nostr sites (nsites). The runtime is written in Gleam and
compiled to JavaScript; `apps/web` is the thin host page.

## Start here

1. **[`../README.md`](../README.md)** — prerequisites, `pnpm build`, `pnpm test`,
   `pnpm dev`, and the architecture summary.
2. **[`01-architecture.md`](01-architecture.md)** — package layers, boot path,
   shell/theme model, runtime boundaries.
3. **[`03-plugin-developer-guide.md`](03-plugin-developer-guide.md)** — build a
   plugin with `omni_plugin_kit` and Declarative Schema.

## Reference

| Document | What it covers |
|---|---|
| [`01-architecture.md`](01-architecture.md) | Package layering, boot sequence, shell/theme registry, boundaries |
| [`02-protocols-and-storage.md`](02-protocols-and-storage.md) | Nostr events/filters/relay frames, relay pool, 0ms store, NIP-78, distribution |
| [`03-plugin-developer-guide.md`](03-plugin-developer-guide.md) | Plugin harness, routes, persistence, shared social libraries, package layout |
| [`04-intents-and-permissions.md`](04-intents-and-permissions.md) | Intents, capability grants, kind-level filtering, RPC governance |
| [`05-sandbox-hosting.md`](05-sandbox-hosting.md) | Iframe/worker/Wasm hosts, CSP, dual-channel IPC, guest bridge shims |
| [`06-nostr-extensions-and-schema.md`](06-nostr-extensions-and-schema.md) | Extended `window.nostr`, Schema AST/builders/actions, rendering pipeline |
| [`07-toolchain.md`](07-toolchain.md) | Pinned compiler/dependency versions, commands, test harness |
| [`08-perf-baseline.md`](08-perf-baseline.md) | Bundle-size baseline and how to reproduce it |

## Ground rules

The non-negotiable system mandates (no proprietary `omni.*` SDKs, pure standard
nsites, no emojis, no hard-coded plugin IDs in shell/UI, Light DOM, warm paper
dark palette) live in [`../AGENTS.md`](../AGENTS.md). They are enforced by
`scripts/lint-gleam-architecture.mjs`, which runs as part of `pnpm gleam:check`.
