# Omni — Roadmap & Backlog

> Current state, November 2026. The runtime is pure Gleam (`gleam/`), the host is
> `apps/web`, and the feature-complete base (shell, themes, plugins, sandbox
> bridge) is shipped. See [`docs/README.md`](docs/README.md) for architecture.

## Shipped

- Headless kernel: ACL/capabilities, keystore, 0ms event store, relay pool,
  RPC dispatcher, plugin resolver, intent broker, NIP-78 workspace sync.
- Swappable shell (`omni_shell`) with Editorial and Panorama themes,
  storage-backed shell registry, settings for profile/relays/plugins/placements/
  permissions/intents/workspace/shells, app store, update modal.
- First-party plugins: feed, notes, timer, profiles, checklist, relays,
  publisher — all pure standard nsites on `omni_plugin_kit`.
- Guest bridge: NIP-07 + extended nostr, virtual WebSocket, partitioned storage,
  protocol links, share, Schema bus; bundled and conformance-tested.

## Next

The authoritative, always-current work list is
[`docs/10-fix-backlog.md`](docs/10-fix-backlog.md). Nothing else in this repo is
a backlog; this file only records what has shipped.

## Shipped recently

- Host RPC binder, key bootstrap, default capability grants, iframe handshake.
- Publish pipeline for feed notes/replies/likes/reposts and profile metadata/follows.
- NIP-44 v2 encryption, NIP-78 workspace publish/restore, encrypted note publish.
- Browser history/deep links, hosted-app rendering, live event ingestion.
