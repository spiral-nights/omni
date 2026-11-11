# Functional Gap Analysis: `main` (working TS app) vs `gleam-rewrite`

> Generated November 2026 by comparing `main` (the previous working
> application) against the current Gleam tree. This is the authoritative list of
> what is missing or degraded; it supersedes the optimistic "shipped" summary in
> the roadmap.

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
| I1 | Generate/import/export nsec, passphrase storage | Keystore exists (`omni/platform/webcrypto`, `omni/kernel/crypto/keystore`) but **never initialized by the host**; no key UI | S1 |
| I2 | `window.nostr` RPC served by host (`getPublicKey`, `signEvent`, nip04/44, relays) | Guest bridge sends RPC; **no host dispatcher connected to Channel 2** | S1 |
| I3 | Publish note (kind 1) with tags | Feed synthesizes a fake local note; nothing signs/broadcasts | S1 |
| I4 | Reply (kind 1 with NIP-10 tags) | Local-only synthetic reply | S1 |
| I5 | Like (kind 7), repost (kind 6), zap request | `LikeNote`/`RepostNote`/`ZapNote` are no-ops | S1 |
| I6 | Publish profile metadata (kind 0) | Profiles editor mutates local dict only | S1 |
| I7 | Publish/fetch kind 3 follows | Toggles local follows only; never fetched | S1 |
| I8 | NIP-65 relay list publish/fetch | Relays builds tag lists locally; no publish/fetch | S1 |
| I9 | NIP-78 app data publish (`publishAppData`) | Shell emits `PublishWorkspaceNip78`; **boot ignores it** | S1 |
| I10 | NIP-44 encrypt/decrypt used by notes/DMs | Bridge + platform implement it; no host path uses it | S2 |
| I11 | NIP-17/59 DMs | Never implemented (was roadmap on main too) | S3 |

### Relay and data plane

| # | Feature (main) | Current state | Sev |
|---|---|---|---|
| R1 | Relay pool connects to bootstrap relays | Host now dials sockets and tracks status | fixed |
| R2 | Subscription REQ/EVENT/EOSE end-to-end | Coordinator+pool exist; host subscribes for feed/profiles, but no re-REQ on reconnect, no per-relay scoping, no lifecycle handling | S1 |
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
| P4 | Notes: encrypted NIP-78 sync (`omn/notes/v1/<id>`) | Local storage only (`local_store`); no `nostr.doc`, no encryption | S1 |
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
| S14 | NIP-78 workspace restore on boot | Boot loads local state only; no remote fetch/publish | S1 |
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
