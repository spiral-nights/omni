# Protocols & Storage

> Current state. Implementation lives in `gleam/nostr`, `gleam/protocol`,
> `gleam/kernel`, and `gleam/platform`.

## Nostr wire model

- **Events**: `omni/nostr/event` with typed `EventId`, `Pubkey`, `Kind`; codecs
  preserve canonical JSON and signature bytes.
- **Filters**: `omni/nostr/filter` (ids/authors/kinds/since/until/limit/search/tags)
  with matching, merge, and JSON codecs. `#e` and `e` tag names are normalized.
- **Relay frames**: `omni/nostr/relay_frame` parses `REQ`/`CLOSE`/`EVENT`/`AUTH`
  and serializes `EVENT`/`EOSE`/`OK`/`NOTICE`/`CLOSED`/`AUTH`. The guest bridge
  reuses these functions for its virtual WebSocket.
- **Bech32 / NIP-19**: pure BIP-173/350 implementation with `npub`, `nsec`,
  `note`, `nevent`, `nprofile`, `naddr`.

## Relay pool and subscriptions

`omni/kernel/nostr/relay_pool` models per-relay connection state, read/write
scopes, and metrics. `coordinator` merges subscriptions across the local store
and the pool:

- each subscription is namespaced `${pluginId}:${subId}`;
- cached events are delivered first (`fromCache`), then live relay events;
- `EOSE` is forwarded per subscription;
- stream notifications are `nostr.stream.event` / `nostr.stream.eose`, routed
  by the RPC bridge to the requesting guest only.

## Local-first storage

- `omni/kernel/nostr/event_store` is the 0ms IndexedDB cache (`omni_event_store`)
  with an in-memory index, replaceable-event handling, and bounded limits.
- Guest `localStorage` is partitioned per plugin by the bridge
  (`omni:plugin:<pluginId>:<key>`), so plugins sharing an origin cannot read or
  clobber each other.
- `omni/platform/storage` exposes an injectable port with an in-memory fake for
  tests; the host binds it to `window.localStorage` at boot.

## NIP-78 workspace sync

Layout, viewport assignments, active pages, and enabled plugins sync as a
replaceable `kind: 30078` event with `["d", "omni/workspace/v1"]`.
`omni/protocol/workspace` owns the versioned codec and migration;
`omni/kernel/workspace/sync` persists the latest state under
`omni_workspace_state` for 0ms startup. Shell effects request local persistence
and relay publication separately.

## Sensitive data

Encrypted kinds (4, 13, 14, 1059, 1060) are filtered out of local store queries
unless the requesting plugin has an explicit capability grant. See
`04-intents-and-permissions.md`.

## Distribution

- **NIP-5A / nsites**: plugin manifests are standard `kind: 35129` events;
  `omni/kernel/plugins/*` resolves nsite trees, Blossom blobs, and `naddr`s.
- **Blossom**: blob upload/fetch with SHA-256 integrity; the host proxies HTTP
  through kernel RPC so sandboxes keep `connect-src 'none'`.
