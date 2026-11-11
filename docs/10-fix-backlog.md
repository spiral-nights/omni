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
| REL-4 | S1 | open | `dispatch_frame` ignores `OK`, `NOTICE`, `CLOSED` reasons, and `AUTH` (`relay_pool.gleam:113`). Publish reports "sent", not accepted. | Route all frames; track publish receipts per event id; support NIP-42 challenge/response. |
| REL-5 | S2 | fixed | EOSE fires per relay; `fetch` resolves on the first EOSE (`coordinator.gleam:155`, `278`), missing slower relays. | fixed `aacdb20`: EOSE tracked per relay, fires when all configured relays answered or timeout. |
| REL-6 | S2 | fixed | Relay plugin receives a one-shot status snapshot before sockets open; never updates. | fixed `aacdb20`: `watch_statuses` pushes pool status changes to the Relays app. |
| REL-7 | S2 | open | Read/write scoping is UI-only; every relay gets the same REQ/publish. | Honour `RelayEntry.read/write` in subscribe/publish; per-plugin relay scope. |
| REL-8 | S2 | open | No NIP-65: no kind-10002 fetch, no outbox routing, relay-list publish not wired from the Relays app. | Fetch/store 10002 per author; route REQ/publish; publish own list. |
| REL-9 | S2 | open | Feed pagination/search are local slices; no `until` or targeted queries. | `LoadMore` sends a new REQ with `until=oldest`; use `omni_social/queries` for profiles/replies/search. |
| REL-10 | S3 | open | Host subscriptions bypass ACL by using a non-parsing `"builtin:feed"` sub id (`coordinator.gleam:66`). | Explicit internal-subscription API with a trusted flag. |
| REL-11 | S3 | open | `subscribers` is keyed only by `sub_id`; collisions overwrite handlers. | Namespace internally: `consumerId:subId`. |
| REL-12 | S3 | open | Cache events are emitted before the live subscription registers; events can slip through. | Subscribe first, buffer, then flush cache. |
| REL-13 | S3 | open | `seen_ids` grows unbounded per long-lived subscription. | Bounded/LRU set or clear on EOSE for one-shot fetches. |

## B. Identity & publishing

| ID | Sev | Status | Problem | Fix |
|---|---|---|---|---|
| ID-1 | S2 | fixed | Key bootstrap: host generates/persists a key and shows it in the profile (`boot.session_profile`, commit `4587455`). | Done. |
| ID-2 | S2 | open | No import/export/backup UI, no passphrase-encrypted storage. | Settings key-custody flow: import nsec/hex, export nsec, encrypt at rest. |
| ID-3 | S2 | open | Zap requests not implemented (like/repost publish). | Kind 9734 with `amount`/`lnurl` and receipt tracking. |
| ID-4 | S3 | open | Multi-account support absent. | Account switcher + per-account cache/settings. |
| ID-5 | S3 | deferred | NIP-17/59 DMs. | Gift-wrap pipeline + DMs plugin. |

Publishing itself is wired (commit `7acb942`): feed notes/replies/likes/reposts and
profile metadata/follows sign, broadcast, store, and re-ingest.

## C. Sync & remote state

| ID | Sev | Status | Problem | Fix |
|---|---|---|---|---|
| SYNC-1 | S1 | open | Notes publish encrypted NIP-78 docs (`c5cf6ca`) but never restore/decrypt remote notes. | Subscribe `kind:30078` `omni/notes/v1/*`, NIP-44 decrypt, ingest into the notebook. |
| SYNC-2 | S2 | open | Workspace remote restore applies only when `plugins` is non-empty; no local-first load before merge. | Load local workspace at boot, merge remote by `updated_at`. |
| SYNC-3 | S2 | open | Workspace publish triggers are limited to effect emission points; no debounce/periodic sync. | Publish on layout mutations with debounce; reconcile conflicts. |
| SYNC-4 | S2 | open | Checklist NIP-78 doc (`checklist_doc_spec`) is unused; local storage only. | Publish/subscribe checklist doc like notes. |
| SYNC-5 | S2 | open | Follows (kind 3) are published but not fetched on startup. | Fetch own kind 3 and ingest into Profiles. |
| SYNC-6 | S2 | open | Profile metadata fetch is opportunistic (live kind-0 stream only). | Targeted `profile_for` queries with cache TTL. |
| SYNC-7 | S2 | open | Session/identity not restored from remote (only local keystore). | Restore profile from cache/relays on boot. |

## D. Plugins & shell features

| ID | Sev | Status | Problem | Fix |
|---|---|---|---|---|
| PL-1 | S1 | open | No plugin bundle resolution/loading into sandboxes; built-ins are host-embedded. | Fetch nsite/Blossom bundle, mount with bridge, install/update/uninstall flows. |
| PL-2 | S1 | open | Intent broker never dispatches runtime intents; chooser is display-only. | Wire kernel intent broker + shell chooser to actual navigation. |
| PL-3 | S1 | open | ACL prompts never fire (no `prompt_handler` on the engine). | Connect prompt handler to the shell permissions modal. |
| PL-4 | S2 | open | Relays app mutations (add/remove/reconnect/read-write/NIP-65) don't call the pool. | Expose pool operations to the app and publish kind 10002. |
| PL-5 | S2 | open | Publisher has no zip, Blossom upload, or nsite publish. | Port zip engine + upload + kind publish. |
| PL-6 | S2 | open | Profiles key custody/backup UI missing. | Add custody view backed by keystore API (ID-2). |
| PL-7 | S2 | open | Timer completion has no chime. | Add audio asset + play on `Completed`. |
| PL-8 | S2 | open | App store custom install only records a descriptor. | Validate/fetch the URL before install. |
| PL-9 | S2 | open | Plugin settings tabs render a placeholder; plugin settings content isn't hosted. | Mount plugin settings view in the tab. |
| PL-10 | S2 | open | Theme mode (light/dark) absent; Editorial hardcodes dark. | Persistent mode with `data-theme-mode`. |
| PL-11 | S2 | open | In-app back buttons missing; only browser history works. | Theme header back with per-view stack. |
| PL-12 | S2 | open | Pull-to-refresh has no touch listeners. | Wire gesture stream to the indicator + feed refresh. |
| PL-13 | S2 | open | PWA offline shell/assets caching not implemented. | Workbox/manual service worker precache. |
| PL-14 | S3 | open | Widget/compact routes not rendered for hosted apps. | Route-aware hosted views (widget mode). |
| PL-15 | S3 | open | Mobile menu/gestures unverified. | Add mobile e2e checks. |

## E. Quality & verification

| ID | Sev | Status | Problem | Fix |
|---|---|---|---|---|
| Q-1 | S1 | open | No integration harness with a fake relay; unit-only tests hid the gaps. | happy-dom + in-process fake relay: boot, import key, publish, assert wire + render. |
| Q-2 | S1 | open | No acceptance tests per feature row above. | Every fix adds one; CI runs them. |
| Q-3 | S2 | open | No network e2e smoke in CI. | Optional nightly job against public relays. |
| Q-4 | S3 | open | Duplicate/legacy helper warnings (e.g. unused feed synthetic helpers). | Remove dead code after REL/PL work. |

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
