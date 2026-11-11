# Omni — Roadmap & Backlog

> Current state, November 2026. The runtime is pure Gleam (`gleam/`), the host is
> `apps/web`, and the feature-complete base (shell, themes, plugins, sandbox
> bridge) is shipped. See [`docs/README.md`](docs/README.md) for architecture.

## Shipped

- Headless kernel: ACL/capabilities, keystore, 0ms event store, relay pool,
  RPC dispatcher, plugin resolver, intent broker, NIP-78 workspace sync.
- Swappable shell (`omni_shell`) with Classic, Panorama, and Editorial themes,
  storage-backed shell registry, settings for profile/relays/plugins/placements/
  permissions/intents/workspace/shells, app store, update modal.
- First-party plugins: feed, notes, timer, profiles, checklist, relays,
  publisher — all pure standard nsites on `omni_plugin_kit`.
- Guest bridge: NIP-07 + extended nostr, virtual WebSocket, partitioned storage,
  protocol links, share, Schema bus; bundled and conformance-tested.

## Next

> A complete, evidence-based gap list versus the previous working app lives in
> [`docs/09-gap-analysis.md`](docs/09-gap-analysis.md). The items below are the
> summary; the remediation order there takes precedence.

### 1. Plugin bundle resolution into sandboxes (P1)

The host can spawn a iframe sandbox with the Gleam guest bridge and mount the
descriptor, but it does not yet fetch/build plugin bundles itself.

- Resolve `kind: 35129` nsite trees and Blossom blobs in
  `omni/kernel/plugins/*`, then feed verified HTML into
  `boot.spawn_sandbox`.
- Cache verified bundles for offline 0ms startup.
- Add an end-to-end test that mounts a real first-party plugin.

### 2. Lazy-loading and startup size (P2)

The host bundle is one chunk (~71 kB gzip) containing kernel + shell + themes +
plugins adapters. Split themes and non-default plugins into dynamic chunks and
measure with `pnpm bundle:report`.

### 3. Multi-tier signers (P2)

- NIP-46 remote bunker client in `omni_kernel/crypto` + `omni_plugin_kit/nostr`.
- NIP-07 extension passthrough when no local key is present.
- Surface both in the shell profile/keys settings.

### 4. NIP-65 outbox/gossip routing (P2)

- Query `kind: 10002` for authors in the timeline.
- Route subscriptions/publishes to each author's read/write relays
  (`omni/kernel/nostr/relay_pool` + coordinator).
- Publish the user's own relay list when relays change in settings.

### 5. Multi-account management (P2)

- Encrypted key storage (WebCrypto AES-GCM + PBKDF2/WebAuthn PRF) in
  `omni/platform/webcrypto` / `omni/kernel/crypto`.
- Account switcher in shell settings, per-account cache partitions.

### 6. NIP-17 / NIP-59 direct messaging (P3)

- Gift-wrap pipeline (`kind: 14/13/1059`) in the kernel keystore + NIP-44.
- `messaging.wrapGift` / `messaging.unwrapGift` RPC methods.
- ACL: kinds 4/13/14/1059/1060 require an explicit `nostr:dms` grant.
- First-party `plugin_dms` on top of the shared social/note-card patterns.

### 7. Atomic single-file nsite support (P1)

- Parse `["x", "<sha256>"]` artifacts from `kind: 35129/15129/5129`.
- Verify against Blossom SHA-256 and inject the verified document directly as
  srcdoc.
- Run NIP-5A and NIP-5D applets without host changes.

### 8. Host hardening / SSRF protection (P2)

- Private-IP filtering at DNS resolution time for proxied HTTP/Blossom fetches
  (`omni/kernel/rpc` handler + `omni/platform` fetch).
- Re-validate IPs on redirects; isolate SVG/rich-media parsing.

### 9. Interop retirement (P3)

`omni_interop` exists only so `apps/web` can stay a thin TypeScript host. Once a
minimal Gleam host entry (or a tiny stable JS shim) exists, remove the facade
and its generated declarations.
