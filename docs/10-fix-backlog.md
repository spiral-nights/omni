# Omni Fix Backlog (canonical)

> **This file is the single source of truth for outstanding fixes.** If you fix
> something, update its row **in the same commit** and add the commit SHA.
> Do not keep parallel to-do lists in other docs; they point here.
>
> Status values: `open`, `in progress`, `fixed`, `deferred`.
> Severity: **S1** blocks core functionality, **S2** missing/degraded feature,
> **S3** polish or risk.
> Definition of done: the fix ships with an acceptance test that exercises the
> real path (network/events/DOM), not just a pure model.

Last updated: 2026-11-11.

---

## A. Relay & data plane

| ID | Sev | Status | Problem | Fix |
|---|---|---|---|---|
| REL-1 | S1 | fixed | Two sockets per relay: `relay_pool.new` dials (`relay_pool.gleam:78`) and `boot.connect_relays` dials again (`boot.gleam:364`), then `attach_socket` overwrites the parsed connection with a status-only one. Publish/REQ use the unparsed socket. | fixed `aacdb20`: pool is the only dialer; duplicate boot connection removed. |
| REL-2 | S1 | fixed | `REQ` is only sent to sockets already `Connected` (`relay_pool.gleam:247`); no replay on open/reconnect. Host works around it with a 1.2 s delay (`main.ts:46`). | fixed `aacdb20`: subscribers store filters and REQ is replayed on every socket open; 1.2 s delay removed. |
| REL-3 | S1 | fixed | No reconnect, backoff, or health checks; close/error only sets `Disconnected` (`relay_pool.gleam:90`). | fixed `aacdb20`: exponential backoff reconnect (500 ms..30 s), retries reset on open, stopped when relay removed. |
| REL-4 | S1 | fixed | `dispatch_frame` ignores `OK`, `NOTICE`, `CLOSED` reasons, and `AUTH` (`relay_pool.gleam:113`). Publish reports "sent", not accepted. | fixed `f266180`: `OK` receipts drive tracked publishes (per-relay accept/deny), NOTICE watchers and a keystore-backed NIP-42 AUTH handler are wired, CLOSED still reaches subscribers. |
| REL-5 | S2 | fixed | EOSE fires per relay; `fetch` resolves on the first EOSE (`coordinator.gleam:155`, `278`), missing slower relays. | fixed `aacdb20`: EOSE tracked per relay, fires when all configured relays answered or timeout. |
| REL-6 | S2 | fixed | Relay plugin receives a one-shot status snapshot before sockets open; never updates. | fixed `aacdb20`: `watch_statuses` pushes pool status changes to the Relays app. |
| REL-7 | S2 | fixed | Read/write scoping is UI-only; every relay gets the same REQ/publish. | fixed `285b663`: pool scopes gate REQ (read) and EVENT (write), including replays. |
| REL-8 | S2 | fixed | No NIP-65: no kind-10002 fetch, no outbox routing, relay-list publish not wired from the Relays app. | fixed (own list) `285b663`: kind-10002 fetch applies relays/scopes; Relays app publishes its list. Outbox routing tracked as REL-8b. |
| REL-8b | S2 | fixed | No outbox/gossip routing: a subscription still sends the same REQ to every read relay instead of routing by each author's 10002 relays. | fixed `64328f5`: coordinator caches per-author NIP-65 read relays (TTL + negative entries), refreshes missing hints via kind-10002 subscriptions, routes fully-hinted author filters to the union of hint relays, falls back to fan-out otherwise, and honors `FetchOptions.relays`. Targeted EOSE now counts only targeted relays. |
| REL-9 | S2 | fixed | Feed pagination/search are local slices; no `until` or targeted queries. | fixed `c247838`: `LoadMore` asks the host for older events with `until=oldest`, which fetches, ingests, and re-renders. Network search split to REL-9b. |
| REL-9b | S3 | open | Feed search is a local slice of already-loaded notes. | Issue a NIP-50 search REQ when the relay supports it, falling back to local. |
| REL-10 | S3 | fixed | Host subscriptions bypass ACL by using a non-parsing `"builtin:feed"` sub id (`coordinator.gleam:66`). | fixed `a195f45`: internal host subscriptions use non-namespaced ids (`omni_internal_*`) so they no longer parse as a plugin ID and never trigger ACL prompts. |
| REL-11 | S3 | open | `subscribers` is keyed only by `sub_id`; collisions overwrite handlers. | Namespace internally: `consumerId:subId`. |
| REL-12 | S3 | open | Cache events are emitted before the live subscription registers; events can slip through. | Subscribe first, buffer, then flush cache. |
| REL-13 | S3 | open | `seen_ids` grows unbounded per long-lived subscription. | Bounded/LRU set or clear on EOSE for one-shot fetches. |

## B. Identity & publishing

| ID | Sev | Status | Problem | Fix |
|---|---|---|---|---|
| ID-1 | S2 | fixed | Key bootstrap: host generates/persists a key and shows it in the profile (`boot.session_profile`, commit `4587455`). | Done. |
| ID-2 | S2 | fixed | No import/export/backup UI, no passphrase-encrypted storage. | fixed `18fdcb6` (UI): Settings imports nsec/hex keys by switching identities and exports the active nsec; at-rest passphrase encryption split out as ID-2b. |
| ID-2b | S2 | open | Private keys are stored in plain storage; no passphrase encryption. | Derive a key from a passphrase, encrypt the stored key, and require unlock on boot. |
| ID-3 | S2 | open | Zap requests not implemented (like/repost publish). | Kind 9734 with `amount`/`lnurl` and receipt tracking. |
| ID-4 | S3 | open | Multi-account support absent. | Account switcher + per-account cache/settings. |
| ID-5 | S3 | deferred | NIP-17/59 DMs. | Gift-wrap pipeline + DMs plugin. |

Publishing itself is wired (commit `7acb942`): feed notes/replies/likes/reposts and
profile metadata/follows sign, broadcast, store, and re-ingest.

## C. Sync & remote state

| ID | Sev | Status | Problem | Fix |
|---|---|---|---|---|
| SYNC-1 | S1 | fixed | Notes publish encrypted NIP-78 docs (`c5cf6ca`) but never restore/decrypt remote notes. | fixed `5407761`: host subscribes omni/notes/v1 docs, NIP-44 decrypts, and the notebook upserts by updated_at without clobbering newer edits. |
| SYNC-2 | S2 | fixed | Workspace remote restore applies only when `plugins` is non-empty; no local-first load before merge. | fixed `1fe4f8d`: boot restores the persisted workspace before the first remote merge, remote states are always applied, and `ApplyRemoteWorkspace` merges local and remote by `updated_at`. |
| SYNC-3 | S2 | fixed | Workspace publish triggers are limited to effect emission points; no debounce/periodic sync. | fixed `1fe4f8d`: layout mutations stamp the current time and coalesce into one kind-30078 publish after an 800 ms quiet period. |
| SYNC-4 | S2 | fixed | Checklist NIP-78 doc (`checklist_doc_spec`) is unused; local storage only. | fixed `1fe4f8d`: task mutations publish the kind-30078 checklist doc when sync is enabled, and the host restores remote checklist docs on boot. |
| SYNC-5 | S2 | fixed | Follows (kind 3) are published but not fetched on startup. | fixed `5407761`: the host fetches the user's own kind-3 contact list and feeds Profiles. |
| SYNC-6 | S2 | open | Profile metadata fetch is opportunistic (live kind-0 stream only). | Targeted `profile_for` queries with cache TTL. |
| SYNC-7 | S2 | fixed | Session/identity not restored from remote (only local keystore). | fixed `6a504cf`: boot subscribes to the user's own kind-0 metadata and updates the session profile (name, avatar, NIP-05) from relays. |

## D. Plugins & shell features

| ID | Sev | Status | Problem | Fix |
|---|---|---|---|---|
| PL-1 | S1 | fixed (URL install) | No plugin bundle resolution/loading into sandboxes; built-ins are host-embedded. | fixed (URL install) `02abe96`: custom URL -> platform HTTP fetch -> installed app -> sandbox mount with guest bridge. See PL-1b for naddr/Blossom and lifecycle gaps. |
| PL-1b | S2 | fixed | Nsite `naddr`/kind-35129 + Blossom-fragment resolution is not wired to the installer; uninstall does not terminate the mounted sandbox; update flow is unused. | fixed `a195f45`: installer resolves URL/naddr/coordinates local-first, inlines Blossom CSS/JS assets, mounts cached apps on open, terminates sandboxes on unmount/uninstall, and shows/apply the update modal. |
| PL-2 | S1 | fixed | Intent broker never dispatches runtime intents; chooser is display-only. | fixed `644d92f`: hosted actions route through the intent broker (single handler opens + forwards, multiples prompt), aliases normalized. |
| PL-3 | S1 | fixed | ACL prompts never fire (no `prompt_handler` on the engine). | fixed `644d92f`: kernel prompt handler bridged to a shell Allow/Deny modal; decisions resolve the grant promise. |
| PL-4 | S2 | fixed | Relays app mutations (add/remove/reconnect/read-write/NIP-65) don't call the pool. | fixed `ac190f8`: relay mutations emit typed pool commands (add/remove/scope/force-reconnect) that the host applies to the live pool; NIP-65 publishing was already wired. |
| PL-5 | S2 | open | Publisher has no zip, Blossom upload, or nsite publish. | Port zip engine + upload + kind publish. |
| PL-6 | S2 | fixed | Profiles key custody/backup UI missing. | fixed `18fdcb6`: Settings Identity panel hosts the shared import/export custody card backed by the keystore. |
| PL-7 | S2 | open | Timer completion has no chime. | Add audio asset + play on `Completed`. |
| PL-8 | S2 | fixed | App store custom install only records a descriptor. | fixed `d2deef6`: installation resolves/fetches the bundle first and rolls the optimistic install back if validation fails. |
| PL-9 | S2 | fixed | Plugin settings tabs render a placeholder; plugin settings content isn't hosted. | fixed `df09ed6`: opening a plugin settings tab emits a mount for its `?view=settings` route into the stable island container. |
| PL-10 | S2 | fixed | Theme mode (light/dark) absent; Editorial hardcodes dark. | fixed `a514568`: shell model stores a persisted appearance mode, all themes emit `data-theme-mode`, Settings exposes a Dark/Light toggle, and tokens provide a warm-paper light palette. |
| PL-11 | S2 | fixed | In-app back buttons missing; only browser history works. | fixed `3da7d55`: shell keeps a per-view back stack, all three theme headers render a back button when history exists, and `NavigateBack` pops it. |
| PL-12 | S2 | fixed | Pull-to-refresh has no touch listeners. | fixed `d2deef6`: touch listeners dispatch the refresh at the 72 px threshold, the host re-fetches public events, and `FinishPullRefresh` clears the indicator after the fetch settles. |
| PL-13 | S2 | fixed | PWA offline shell/assets caching not implemented. | fixed: `apps/web/public/sw.js` precaches the shell, uses network-first with cache fallback, and serves an offline navigation fallback. |
| PL-14 | S3 | open | Widget/compact routes not rendered for hosted apps. | Route-aware hosted views (widget mode). |
| PL-15 | S3 | open | Mobile menu/gestures unverified. | Add mobile e2e checks. |

## E. Quality & verification

| ID | Sev | Status | Problem | Fix |
|---|---|---|---|---|
| Q-1 | S1 | fixed | No integration harness with a fake relay; unit-only tests hid the gaps. | fixed `4d90bde`: `kernel/test/fake_relay.gleam` records client frames and injects server frames through pool dispatch; integration tests cover REQ, EOSE, raw delivery. |
| Q-2 | S1 | fixed | No acceptance tests per feature row above. | fixed `aa735aa`: install and publish acceptance tests now exercise the real path (injected fetcher, sandbox spawn, fake relay EVENT/OK, local store, plugin ingest) in `omni_web`; new fixes continue to add one. |
| Q-3 | S2 | open | No network e2e smoke in CI. | Optional nightly job against public relays. |
| Q-4 | S3 | open | Duplicate/legacy helper warnings (e.g. unused feed synthetic helpers). | Remove dead code after REL/PL work. |
| Q-5 | S2 | fixed | Fake-relay harness observed the coordinator `on_event` callback not firing for injected EVENT frames, while raw subscribers and EOSE work; cause unconfirmed. | fixed `732d45a`: the harness fixture used a hard-coded `sub1` sub ID; frames now carry the caller's ID and delivery/dedupe/ingest are verified. |

---

## Recently fixed (reference)

- `4587455` RPC binder + key bootstrap + default grants + iframe port handshake.
- `7acb942` publish effects: notes, replies, likes, reposts, profile metadata, follows.
- `c5cf6ca` NIP-44 v2, workspace publish/restore, encrypted note publishing.
- `3bac23b` browser history, hosted-app styling, relay dialing (superseded by REL-1/2).
- `2d7831e` live event ingestion for feed/profiles, local persistence for built-ins.

## How to keep this file honest

1. Any new bug discovered goes here **before** or **with** its fix, with an ID.
2. Change `open` → `in progress` when starting, `fixed` + commit SHA when done.
3. If a fix is split, split the row; never close a row partially.
4. Cross-link PRs/commits; no other doc may claim to be the backlog.
