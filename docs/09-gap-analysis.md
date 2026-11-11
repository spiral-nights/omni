# Functional Gap Analysis: `main` (working TS app) vs `gleam-rewrite`

> **Historical analysis.** The live, canonical fix list is
> [`10-fix-backlog.md`](10-fix-backlog.md); use it for status and ordering.

> Generated November 2026 by comparing `main` (the previous working
> application) against the current Gleam tree. This is the authoritative list of
> what is missing or degraded; it supersedes the optimistic "shipped" summary in
> the roadmap.
>
> **Progress:** the first remediation step (RPC binder + key bootstrap) is
> implemented; rows marked "fixed" below are updated accordingly.

## Why the gap exists

The migration replaced every domain with **pure Gleam models and schema views**
and verified them with unit tests. Those tests cover reducers, codecs, and view
output in isolation. The **integration layers that make a client work were
never ported**, and Phase 8 deleted the TypeScript implementations before the
Gleam replacement had them:

1. **Host ↔ plugin data plane.** On `main`, plugins ran in sandboxes and called
   `window.nostr` / `window.omni`; the kernel implemented `fetch`, `subscribe`,
   `publish`, `doc`, signing, profiles, NIP-65, workspaces. In the rewrite the
   guest bridge forwards those RPCs, but **no host-side RPC dispatcher is bound
   to the ports**, and first-party plugins are embedded in-process with no
   `window.nostr` access at all. `omni_kernel.rpc.dispatcher` exists and is
   unit-tested but is not wired into `boot`.
2. **Signing and key custody were dropped.** `main` had
   `WebCryptoKeystore.generate/import/export`, nsec handling, and a key-custody
   UI in the profile viewer. The Gleam keystore exists and is tested, but the
   host never initializes a key, imports one, or calls `signEvent`.
3. **Plugins were rewritten as simulations.** `handle_like_note`,
   `handle_repost_note`, NIP-65 publishing, Blossom uploads, NIP-78 note sync,
   and metadata publishing in `main` produced real signed events. The Gleam
   plugins mutate local model state and stop there.
4. **Integration features of the shell were not ported.** Browser history
   (only just restored), back buttons per app, plugin install → sandbox mount,
   update modal wiring, intent chooser dispatch, pull-to-refresh gestures,
   theme mode (light/dark), and PWA behaviour existed in TypeScript.
5. **Acceptance testing was unit-only.** No parity/e2e test ever loaded the app,
   fetched a relay event, signed a note, or installed a plugin. Green tests
   therefore said nothing about functional parity.

## Gap matrix

Severity: **S1** = app unusable for the feature, **S2** = degraded/absent
feature, **S3** = polish.

### Identity, signing, publishing

| # | Feature (main) | Current state | Sev |
|---|---|---|---|
| I1 | Generate/import/export nsec, passphrase storage | **fixed (bootstrap):** host generates/persists a key and publishes it into the shell profile; import/export + passphrase UI still missing | S2 |
| I2 | `window.nostr` RPC served by host (`getPublicKey`, `signEvent`, nip04/44, relays) | **fixed:** `omni/web/rpc` binds the kernel dispatcher, iframe spawn transfers ports and answers Channel 2; default grants installed for bundled apps | ok |
| I3 | Publish note (kind 1) with tags | **fixed:** feed emits a `Publish` effect; host signs via keystore, broadcasts via relay pool, stores and ingests the signed event | ok |
| I4 | Reply (kind 1 with NIP-10 tags) | **fixed:** reply drafts publish with root/reply `e` and `p` tags through the host pipeline | ok |
| I5 | Like (kind 7), repost (kind 6), zap request | **fixed** for like/repost (signed events); zap requests still local-only | S2 |
| I6 | Publish profile metadata (kind 0) | **fixed:** editor emits a kind-0 `Publish` effect | ok |
| I7 | Publish/fetch kind 3 follows | **fixed (publish):** follow toggles emit kind-3 events; fetching remote follows still missing | S2 |
| I8 | NIP-65 relay list publish/fetch | Relays builds tag lists locally; no publish/fetch | S1 |
| I9 | NIP-78 app data publish (`publishAppData`) | **fixed:** workspace effects sign and publish kind 30078 (`d: omni/workspace/v1`); remote state is fetched on startup and applied when non-empty | ok |
| I10 | NIP-44 encrypt/decrypt used by notes/DMs | **fixed:** NIP-44 v2 implemented in the platform FFI (ChaCha20 + HKDF + HMAC); encrypted note publishing uses it, verified by a decrypt round-trip test | ok |
| I11 | NIP-17/59 DMs | Never implemented (was roadmap on main too) | S3 |

### Relay and data plane

| # | Feature (main) | Current state | Sev |
|---|---|---|---|
| R1 | Relay pool connects to bootstrap relays | Host now dials sockets and tracks status | fixed |
| R2 | Subscription REQ/EVENT/EOSE end-to-end | Coordinator+pool exist; host subscribes for feed/profiles; **fixed:** socket dialing + status tracking; still no re-REQ on reconnect or per-relay scoping | S2 |
| R3 | Profile metadata fetch/cache across plugins | Profiles ingests live kind 0 events; no targeted fetch (`profile_for` queries unused) | S2 |
| R4 | Timeline pagination (`load-more` → older events) | Feed `LoadMore` only grows a local slice; no `until` query | S1 |
| R5 | Search over relays | Local substring search of ingested notes only | S2 |
| R6 | Relay read/write scoping per plugin | Pool model supports it; live path ignores it | S2 |
| R7 | Reconnect / health / latency | Relays UI models state; no reconnect RPC or latency measurement | S2 |
| R8 | HTTP/Blossom fetch proxy (`fetch` shim) | Guest bridge sends RPC; **no host handler**; kernel RPC has no http handler | S1 |

### Plugins

| # | Feature (main) | Current state | Sev |
|---|---|---|---|
| P1 | Feed timeline with real notes + profiles | Live event ingestion added; rendering works when events arrive | partial |
| P2 | Feed composer, replies, threads | Local schema flows work; publishing (I3/I4) missing | S1 |
| P3 | Feed likes/reposts/zaps with stats | Stats reducer exists; user actions are no-ops | S1 |
| P4 | Notes: encrypted NIP-78 sync (`omni/notes/v1/<id>`) | **publish fixed:** saving a note emits an encrypted kind-30078 doc with a `d` tag; remote restore/decrypt + ingest is still missing | S2 |
| P5 | Notes editor sanitization | Implemented (`omni_ui/sanitize`) and tested | ok |
| P6 | Profiles: people directory, metadata edit | In-process model + seeded data + kind-0 ingestion; no publish | S1 |
| P7 | Profiles: key custody/backup UI | Absent | S1 |
| P8 | Profiles: follow/unfollow publishing kind 3 | Local only | S1 |
| P9 | Relays: NIP-65 publish, add/remove live relays | UI/model only; statuses now fed from pool; no pool mutation or publish | S1 |
| P10 | Checklist: NIP-78 sync | Local storage only; `checklist_doc_spec` unused | S2 |
| P11 | Timer: chime/audio on completion | Absent (main had `timer/src/audio/chime.ts`) | S2 |
| P12 | Publisher: Blossom upload, zip bundling, nsite publish | Schema/model only; no upload or zip | S1 |
| P13 | Publisher: nsite tag generation | Tag helpers exist; no event publish | S2 |
| P14 | Plugin install → fetch nsite bundle → sandbox | App store records descriptors; no resolver/fetch/mount | S1 |
| P15 | Plugin update modal wiring | Shell model + modal; no update check/apply | S2 |

### Shell / host UX

| # | Feature (main) | Current state | Sev |
|---|---|---|---|
| S1 | Browser back/forward + deep links | Restored (URL sync + popstate) | ok |
| S2 | In-app back buttons (thread/search/settings) | Feed/Profiles have NavigateBack; shell header back button absent | S2 |
| S3 | Theme selection persistence | Shell registry + storage works | ok |
| S4 | Light/dark theme mode | Editorial hardcodes `data-theme-mode="dark"`; no toggle | S2 |
| S5 | Accent colour | Applied via CSS var; persistence implemented | ok |
| S6 | Fullscreen | Model/msg exists; header toggle dispatches; works | ok |
| S7 | Mobile menu / responsive docks | CSS + toggle present; not exercised | S3 |
| S8 | Pull-to-refresh gesture | Indicator + pure gesture math exist; **no touch listeners wired** | S2 |
| S9 | Intent chooser / "Open With…" | Modal renders from model; broker never dispatches real intents | S1 |
| S10 | Permission prompts (ACL) | Settings UI + store exist; no runtime prompt handler configured | S1 |
| S11 | Plugin settings tabs (embed plugin settings) | Shell renders tab; no plugin settings content host | S2 |
| S12 | App store custom URL install | Adds descriptor; no fetch/validate | S2 |
| S13 | PWA/service worker + offline | SW registration kept; no offline shell/assets caching strategy for new bundles | S2 |
| S14 | NIP-78 workspace restore on boot | **fixed:** remote workspace is fetched after relays connect and applied when it contains plugins; local-first load still absent | S2 |
| S15 | Signer/profile bootstrap from `localStorage` | Removed with TS host; no session restore | S1 |

## Root-cause integration gaps (fix once, many features unlock)

1. **Channel 2 RPC host binder.** Wire `omni/kernel/rpc/dispatcher` to the
   MessagePort pair in `omni_web/boot` (handlers for nostr, signer, relays,
   storage, intents, navigation, share, http). Unlocks I2/I10/R8 and guest
   plugins generally. Also add plugin-ID extraction from the port handshake and
   ACL prompts via the shell modal.
2. **Embedded-plugin host API.** For in-process first-party plugins, provide a
   `HostContext` (publish/fetch/subscribe/doc/sign/keystore) instead of relying
   on `window.nostr`. Alternatively finish bundle loading (P14) and run them as
   real guests. Either way, plugin effects need a data channel; today
   `Effect` is unused by plugins.
3. **Session/key bootstrap UI.** First-run flow: generate or import nsec, hold
   in keystore, publish/restore profile; expose in Settings.
4. **Publish effects.** Define plugin `Effect` payloads for publish/fetch and
   interpret them in `boot` (sign via keystore, broadcast via relay pool,
   optimistic local insert).
5. **Query layer.** Use `omni_social/queries` + coordinator for targeted
   fetches (profiles, replies, pagination, search) instead of one firehose
   subscription.

## Fixed in the publish pass

- New `Publish(UnsignedEvent)` effect in `omni_plugin_kit/app`; `RunningApp`
  queues drafts and exposes `take_publishes`.
- Feed emits publish effects for notes, replies (NIP-10 marked tags), likes
  (kind 7) and reposts (kind 6); it no longer fabricates local-only notes.
- Profiles emits kind 0 on save and kind 3 on follow toggle.
- `omni_web/boot` signs queued drafts, broadcasts via the relay pool, saves them
  to the local store, and feeds them back into the embedded apps; the interop
  layer runs this after every action and refreshes the Schema views.
- Tests: feed publish effects, profiles kind 0/3 effects, and a host pipeline
  test that asserts a signed 64-hex event ID and a local-store entry.

## Fixed in the first remediation pass

- **`omni/web/rpc`**: plugin-scoped `RpcContext` resolution and raw JSON-RPC
  dispatch through the kernel (`nostr.getPublicKey`, `nostr.signEvent`, fetch,
  publish, relays, storage, intents). Integration tests cover signing via frame.
- **Key bootstrap**: the keystore is initialized at boot and surfaced in the
  shell profile (hex pubkey + npub); the key persists across reloads.
- **Default capabilities**: bundled first-party apps receive the standard
  capability set (read/write/sign/encrypt/storage/relays/intents).
- **Sandbox handshake**: iframe mounts now transfer Channel 1/2 ports and forward
  RPC frames to the Gleam binder; responses return over the port.
- Tests: `omni_web` suite now asserts key bootstrap, signing, RPC frames,
  invalid-plugin rejection, and key persistence.

## Recommended order (each ends with an acceptance test)

1. **RPC binder + relay lifecycle** (R2/R8) — guest `window.nostr.fetch` and
   WebSocket work end to end.
2. **Key bootstrap + signing** (I1/I2) — generate/import key, sign an event,
   verify accepted by a relay.
3. **Publish pipeline** (I3–I7, P2/P3/P6/P8) — compose, reply, like, repost,
   follow, metadata edit all produce signed events and appear optimistically.
4. **Workspace + notes sync** (I9/P4/S14) — NIP-78 publish/fetch, remote
   restore, encrypted notes.
5. **Relays + NIP-65** (P9/R6/R7) — publish relay list, reconnect, scoped REQ.
6. **Plugin resolution/install** (P14/S12) — fetch an nsite bundle, mount it in
   a sandbox with the bridge; install/update/uninstall flows.
7. **Shell polish** (S2/S4/S8/S9/S10/S11/S13) — back buttons, theme mode,
   gestures, intent chooser, permission prompts, PWA caching.
8. **Publisher** (P12/P13) — zip, Blossom upload, nsite publish.

## Test strategy to prevent a repeat

- Add an **integration harness** (happy-dom + local relay stub or an in-process
  fake relay) that boots the app, imports a key, publishes a note, and asserts
  the signed event on the wire.
- Every gap row above gets an acceptance test; unit-only tests do not count as
  done.
- Add a feature-parity checklist to CI (manual gates for network-dependent
  flows, automated for RPC/event pipelines).
