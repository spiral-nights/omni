# Core Runtime & Content Rendering Parity

Reference roots used for every citation below:

- OLD = `/tmp/omni-develop` (branch `develop`); paths are relative to that root.
- NEW = `/home/spiralnights/code/omni` (branch `gleam-rewrite`); paths are relative to that root.

Status legend: ✅ parity · ⚠️ partial / different shape · ❌ missing · ➕ new capability with no OLD equivalent.

## Summary

- **The headless kernel is split up but roughly complete.** NEW `gleam/kernel/src/omni/kernel/kernel.gleam` composes event store, keystore, relay pool, coordinator, ACL, capability store, registry, intent broker, layout, history, rate limiter, and quota. OLD `OmniKernel` additionally owned plugin/sandbox lifecycle, profile helpers, NIP-65 helpers, NIP-78 app-data helpers, nsite publishing, and NIP-89 handler discovery; those are now spread over `gleam/web/src/omni/web/boot.gleam`, `gleam/interop/src/omni/interop/shell_boot.gleam`, and plugin code, with several not replaced at all.
- **Event store is functionally equivalent for reads/writes, cheaper on indexes, and loses the tag index and event cache.** NEW keeps one `events` store with `pubkey`, `kind`, `created_at` indexes (`gleam/kernel/src/omni/kernel/nostr/event_store_index.gleam:23-40`); OLD had `kind_created` plus a separate `event_tags` store (`packages/core/src/nostr/event-store.ts:78-93`). NEW query planning falls back to a full scan whenever a filter has more than one kind, no single author, or any time bound (`event_store_index.gleam:50-75`).
- **Relay pool in NEW is materially ahead of OLD**: NIP-42 AUTH, per-relay read/write scopes, `OK` publish receipts, `CLOSED`/`NOTICE` handling, and multiplexed subscribers per sub id (`gleam/kernel/src/omni/kernel/nostr/relay_pool.gleam:288-400`). OLD had none of AUTH/OK/CLOSED/NOTICE (`packages/core/src/nostr/relay-pool.ts:289-360`).
- **But NEW lost per-instance relay scoping** (`allowedRelays`) that OLD threaded through `nostr.subscribe`, `nostr.fetch`, `nostr.publish`, `relays.list` (`packages/core/src/ipc/json-rpc-dispatcher.ts:179-190, 261-270, 375-390, 447-478`). NEW publishes to every write relay and subscribes on every read relay.
- **Subscription coordinator NEW adds NIP-65 outbox routing with an author-hint cache** (`gleam/kernel/src/omni/kernel/nostr/coordinator.gleam:142-240`), which OLD only approximated by writing `authorRelays` into the pool (`packages/core/src/kernel/omni-kernel.ts:850-925`). NEW dropped OLD's 2.5 s EOSE fallback timer (`packages/core/src/nostr/subscription-coordinator.ts:60-80`), so `on_eose` may never fire for live `subscribe`.
- **Capability vocabulary is at exact parity (10 capabilities)** (`gleam/protocol/src/omni/protocol/capability.gleam:11-21` vs OLD strings in `packages/core/src/kernel/omni-kernel.ts:211-280`). NEW adds rate limiting and a 10 MB per-plugin storage quota (`gleam/kernel/src/omni/kernel/kernel.gleam:90-91`); OLD's manifest `quotaMb` was never enforced.
- **ACL semantics mostly match, with three regressions**: NEW's `auth.switchKey` does not switch the signing key (only the event-store user pubkey, `gleam/kernel/src/omni/kernel/rpc/dispatcher.gleam:700-720`); NEW uninstall neither revokes grants nor clears storage (`gleam/kernel/src/omni/kernel/plugins/registry.gleam:133-140`); NEW never auto-grants from a manifest, only from the built-in app list (`gleam/web/src/omni/web/boot.gleam:300-330`).
- **Intents are structurally modelled but not executable from plugins.** NEW broker resolves/defaults/disable work (`broker.gleam:167-269`), but `intent.dispatch` is a stub that returns `{success, action}` without invoking anything (`dispatcher.gleam:656-678`), and there is no `intent.handle`/`intent.emit` method at all.
- **JSON-RPC surface is the single biggest functional hole.** OLD exposed ~40 methods; NEW decodes 18 method names (`gleam/protocol/src/omni/protocol/rpc/codec.gleam:262-513`). Notably missing: `nostr.subscribe`/`nostr.unsubscribe`/`nostr.getRelays`, `intent.handle`/`intent.emit`, `kernel.handleUri`, all `kernel.history*`, all `ui.*Slot*`/`ui.scrollTo`, `profile.*`, `auth.getNpub`/`getNsec`/`generateKey`, `blossom.upload`/`http.fetch`, `system.*` (speech, geolocation).
- **NIP-44 is silently NIP-04 over RPC in NEW.** `nostr.nip44.encrypt` is decoded into the same `NostrEncrypt` ADT and dispatched to `nip44.nip04_encrypt` (`codec.gleam:343-368`, `dispatcher.gleam:277, 323`). The platform NIP-44 implementation itself is real (`gleam/platform/src/omni/platform/nip44.ffi.mjs:264-310`).
- **Sandbox hosting regressed from three runtimes to one shell.** OLD shipped a 1 683-line guest runtime (`packages/core/src/sandbox/omni-runtime.js`) that shimmed localStorage, virtual WebSocket, fetch, speechSynthesis, `window.nostr` (incl. `doc()`), `window.omni`, `navigator.share`, geolocation, history/Location, scroll, protocol links, plus iframe/worker/WASM hosts. NEW has a Gleam bridge (`gleam/bridge/js/guest-runtime.mjs`) covering `window.nostr` (partial), WebSocket, partitioned localStorage, links, share, and schema actions; there is no `window.omni`, no fetch, no speech, no geolocation, no history/Location/scroll virtualization, and **no WASM host implementation** (`gleam/sandbox/src/omni/sandbox/manager.gleam:226-246` is a stub `GuestHost`).
- **Schema renderer: all 24 primitive types exist in both** (`packages/types/src/schema.ts:8-30` vs `gleam/protocol/src/omni/protocol/schema/node.gleam:171-270`). NEW renders plain HTML with `.omni-*` classes; OLD used custom elements. NEW lost: rich text rendering inside `text`, automatic form-state merging into action payloads, `page`-driven history frames, IntersectionObserver load-more, and virtual-list scroll preservation.
- **Rich content rendering is the largest user-visible regression.** OLD `formatTextWithLinks` (`packages/core/src/schema/components/primitive-elements.ts:489-620`) did URL linkification, markdown-style `[label](url)` links, image/video callouts and optional inline images, inline `npub`/`nprofile` chips resolved to cached display names, `note`/`nevent` quote cards, and `naddr` chips. NEW `render_text` emits `element.text(content)` (`gleam/ui/src/omni/ui/render/text.gleam:86`) and note cards use `builder.text(n.content)` (`gleam/social_ui/src/omni/social_ui/note_card.gleam:296`) — **no linkification or NIP-19 rendering anywhere**.
- **Some things are absent in both** (so not regressions): full Markdown, hashtag linkification, emoji shortcodes / kind-30030 custom emoji, content warnings, OpenGraph link previews, HTML media playback in feed text.
- **Plugin resolution NEW is pure and cautious but unverified.** OLD verified manifest Schnorr signatures and verified Blossom blob SHA-256, inlined only referenced companion CSS/JS, and detected views/icon from Nostr tags *and* HTML/PWA manifests (`packages/core/src/plugins/nostr-plugin-resolver.ts:100-300, 302-470, 471-530`). NEW has no signature verification, no blob hash verification, no HTML view/icon detection; it inlines *all* fetched assets unconditionally (`gleam/web/src/omni/web/installer.gleam:182-300`).
- **Keystore NEW is ahead** (NIP-44 real, passphrase-at-rest, multi-account: `gleam/kernel/src/omni/kernel/crypto/keystore.gleam:99-560`); OLD was single-key and NIP-44 threw "Phase 2" (`packages/core/src/crypto/webcrypto-keystore.ts:203-208`).
- **Routing: NEW has a working shell URL sync + popstate** (`gleam/interop/src/omni/interop/shell_boot.ffi.mjs:68-145`) with `?app=`/`?view=&tab=` URLs (`shell_boot.gleam:196-258`), but the kernel navigation model is a plain string stack (`gleam/kernel/src/omni/kernel/navigation/history.gleam:9-70`) with no frame/state/scroll/intent-coalescing logic that OLD had (`packages/core/src/navigation/navigation-manager.ts:1-565`).
- **Error handling is quieter in NEW.** Error codes are at parity (`gleam/protocol/src/omni/protocol/rpc/error_code.gleam:20-60` vs `packages/types/src/rpc.ts:5-14`), but NEW returns `Error(String)` and logs almost nowhere (only `idb.ffi.mjs` and `nip44.ffi.mjs`), whereas OLD had extensive `console.warn/error` and a JSON-RPC error thrown on every failure path.

---

## Kernel

OLD `OmniKernel` is a 1 323-line façade (`packages/core/src/kernel/omni-kernel.ts`). NEW `OmniKernel` is a 133-line headless composition root (`gleam/kernel/src/omni/kernel/kernel.gleam:34-133`); lifecycle, mounting, profiles, and nsite work moved to `omni_web`/`omni_interop`/plugins.

| Responsibility | OLD | NEW | Status |
|---|---|---|---|
| Subsystem composition | ctor `omni-kernel.ts:83-114` | `kernel.gleam:59-110` | ✅ |
| Boot: event-store init, user pubkey, storage init, relay connect | `omni-kernel.ts:119-145` | `gleam/web/src/omni/web/boot.gleam:102-190` | ⚠️ boot does not seed event-store user pubkey from keystore before first read; it does construct store with current pubkey (`kernel.gleam:68-79`) |
| Key-change fan-out to sandboxes + refetch relay list | `omni-kernel.ts:127-138` | none | ❌ |
| `window` `omni:request_event` cross-plugin event cache feed | `omni-kernel.ts:140-168` | none | ❌ (kills quote-card lazy loading) |
| Register plugin → sandbox + slot containers + pending notifications drain | `omni-kernel.ts:179-380` | `boot.gleam:1031-1072` (`spawn_sandbox`) | ⚠️ iframe only, no pending notification buffer |
| Enable/disable/unload plugin instance, alias instance keys (`::app`, `::main-primary`) | `omni-kernel.ts:382-537` | `boot.gleam:1078-1092`, `manager.terminate` | ⚠️ single instance per plugin id |
| Mount plugin settings sandbox | `omni-kernel.ts:548-627` | none (settings are shell-native) | ❌ for schema-plugin settings views |
| Reparent component / reparent live component into a slot | `omni-kernel.ts:438-496` | none | ❌ |
| `notifyPlugin` + notification buffering | `omni-kernel.ts:415-436` | none | ❌ |
| Theme sync into sandboxes | `omni-kernel.ts:629-639` | none (theme tokens only injected at srcdoc build) | ❌ |
| `dispatchHistoryPopstate` per plugin | `omni-kernel.ts:641-655` | none | ❌ |
| Permission get/set + per-kind read helpers | `omni-kernel.ts:657-686` | `capability_store.gleam` primitives; UI in `gleam/shell/src/omni/shell/settings/permissions.gleam` | ⚠️ |
| Uninstall (disable + layout unregister + revoke grants + clear storage) | `omni-kernel.ts:687-692` | `registry.uninstall` only | ❌ |
| `getNpub` / `getNsec` / `switchPrivateKey` | `omni-kernel.ts:694-708` | `keystore.gleam:323-340` + `rpc.gleam:53-60` | ✅ |
| `getProfile`, `fetchRemoteProfile` (debounce + EOSE + timeout) | `omni-kernel.ts:709-803` | `social/profile.gleam`, `profile_cache.gleam`, interop `request_missing_profiles` (`shell_boot.gleam:418-470`) | ⚠️ no debounced latest-event preference helper in shared code |
| `publishProfile`, `publishRelayList`, `getRelayList`, `fetchRemoteRelayList` | `omni-kernel.ts:804-926` | relays plugin publishes 10002 (`gleam/plugins/relays/src/plugin/relays/update.gleam:87`); `gleam/web/src/omni/web/nip65.gleam` applies hints | ⚠️ no kernel-level get/fetch remote relay list |
| `publishNote` | `omni-kernel.ts:927-941` | plugins publish directly | ⚠️ |
| `subscribeTimeline` | `omni-kernel.ts:942-951` | `coordinator.subscribe` | ✅ |
| NIP-78 `publishAppData`/`getAppData`/`fetchRemoteAppData` (generic) | `omni-kernel.ts:953-1060` | workspace-specific publish debounce in `boot.gleam:907-930`; no generic plugin API | ❌ generic |
| Workspace state publish/get/fetch/merge | `omni-kernel.ts:1061-1079` | `workspace/sync.gleam:34-160`, `boot.gleam:907-930` | ✅ |
| Resolve/publish nsite plugin + publish nsite | `omni-kernel.ts:1080-1103` | `web/installer.gleam`, `publisher/bundle.gleam` | ⚠️ no publish-nsite entry point |
| `handleUri` / `handleShare` | `omni-kernel.ts:1127-1142` | `sandbox/protocol_shims.gleam`, stub RPC `Share` (`dispatcher.gleam:738-750`) | ⚠️ |
| `resolveAppHandlers` (installed + NIP-89 kind 31989) + scheme defaults | `omni-kernel.ts:1144-1322` | none | ❌ |
| Trusted plugin IDs / manifest trust | `omni-kernel.ts:56-60, 175-177` | config-level built-in grants only (`boot.gleam:300-330`) | ⚠️ |

---

## Event Store

| Aspect | OLD (`packages/core/src/nostr/event-store.ts`) | NEW (`gleam/kernel/src/omni/kernel/nostr/event_store.gleam`, `..._index.gleam`) | Status |
|---|---|---|---|
| Backing store | IndexedDB `omni_event_store` v1, `events` + `event_tags` | IndexedDB via `omni/platform/idb`, `events` only | ⚠️ |
| Indexes | `pubkey`, `kind`, `created_at`, compound `kind_created` (`:78-81`); tags `tag_lookup`, `eventId` (`:89-92`) | `pubkey`, `kind`, `created_at` (`event_store_index.gleam:23-40`) | ⚠️ no compound index, no tag index |
| 0 ms cache | LRU `Map`, default 500, LRU-touch on hit (`:160-174`) | `Ref(Dict)` default 500, insertion-order eviction, **no LRU touch on read** (`event_store.gleam:115-140`) | ⚠️ weaker eviction |
| Ephemeral kinds 20000-29999 | memory-only (`:307-311`) | memory-only (`event_store.gleam:192-200`) | ✅ |
| Replaceable / addressable conflict | delete older same kind/d-tag (`:133-175`) | `replaceable.should_replace` + delete matching (`event_store.gleam:249-277`) | ✅ |
| NIP-09 kind 5 deletion | same author; `e` and `a` targets (`:177-230`) | same author; `e` and coordinate (`event_store_index.gleam:166-192`) | ✅ |
| Query planning | ids→get, single author→pubkey, single kind→`kind_created` range, else `created_at` range (`:418-500`) | ids (full hex only)→get, single author→pubkey, single kind→kind, else full scan (`event_store_index.gleam:50-75`) | ❌ time-bounded/multi-kind queries degrade to scan |
| Filter semantics | ids/authors/kinds/since/until/NIP-50 `search`/`#tag` (`:545-573`) | same + hex-prefix ids/authors (`filter.gleam:193-266`) | ✅ |
| Limit handling | early stop when created-ordered | always fetch all then sort then take (`event_store.gleam:362-400`) | ⚠️ |
| Prune transient notes 1/6/7, protect own notes | `:240-302` | `event_store.gleam:418-440`, `find_prunable_events` | ✅ |
| Multiple DB versions / migration | version 1, additive upgrade | `idb.open(name, version, on_upgrade)` supported; only create-store migration (`event_store_index.gleam:42-45`) | ⚠️ no versioning policy |
| Global event cache for quote rendering | `registerOmniEvent`, `window.__omni_event_cache`, `omni:event_cached` (`primitive-elements.ts:347-392`) fed on every save (`event-store.ts:315-323`) | none | ❌ |
| Extra APIs | `getEventById`, `deleteEvent`, `clear`, `saveEvents`, `pruneFeedNotes`, `matchesFilter` | `get_event_by_id`, `delete_event`, `clear`, `save_events`, `prune`, `count_events` | ✅ (+count) |
| Offline behaviour | served entirely by local cache; empty targetRelays short-circuits (`subscription-coordinator.ts:43-51`) | `fetch(local_only: True)` and cache-first then relay (`coordinator.gleam:438-470`) | ✅ |

---

## Relay Pool & Coordinator

### Relay pool

| Aspect | OLD (`packages/core/src/nostr/relay-pool.ts`) | NEW (`gleam/kernel/src/omni/kernel/nostr/relay_pool.gleam`) | Status |
|---|---|---|---|
| Bootstrap relays | 4 defaults incl. `relay.nostr.band` (`:96-103`) | 3 defaults, no `relay.nostr.band` (`gleam/web/src/omni/web/config.gleam:23-29`) | ⚠️ |
| Persisted user relays | `omni_configured_relays` (`:38-40, 108-136`) | same key (`relay_pool.gleam:67-86`) | ✅ |
| Connection lifecycle | WebSocket open/close/error, status map | same + per-relay status ADT (`relay_pool.gleam:28-32, 134-170`) | ✅ |
| Reconnect/backoff | 2 000 ms × 1.5^n, cap 30 s, **+ jitter** (`:210-221`) | 500 ms × 2^(n-1), cap 30 s, **no jitter** (`relay_pool.gleam:185-210`) | ⚠️ |
| Replay subscriptions on open | yes (`:186-190`) | yes (`replay_subscriptions`, `relay_pool.gleam:212-240`) | ✅ |
| NIP-42 AUTH | none | `AuthChallenge` → handler → `AUTH` frame (`relay_pool.gleam:296-330, 389`) | ➕ |
| Subscription multiplexing | one callback per subId, one sub per id (`:317-355`) | multiple subscribers per subId + seq keys (`relay_pool.gleam:602-660`) | ➕ |
| CLOSE semantics | sends CLOSE on unsub (`:341-355`) | sends CLOSE only when last subscriber for subId goes away (`relay_pool.gleam:640-670`) | ✅ better |
| CLOSED / NOTICE frames | ignored (`:373-390`) | CLOSED terminates EOSE counting; NOTICE listeners (`relay_pool.gleam:274, 280-287, 360-380`) | ➕ |
| Publish fan-out | to all open sockets or `targetRelays`; returns accepted URLs (`:289-315`) | to all configured write relays; returns `(url, sent, reason)` (`relay_pool.gleam:520-560`) | ⚠️ loses targeted publish |
| OK tracking | none | `publish_tracked` + `PublishReceipt` with timeout (`relay_pool.gleam:335-430`) | ➕ |
| Read/write scopes | via NIP-65 markers only in `getRead/WriteRelayUrls` (`:260-287`) | per-relay `(read, write)` scope registry (`relay_pool.gleam:472-510`) | ➕ |
| Message ordering / dedupe | none (relay order preserved) | none at pool; dedupe in coordinator | ⚠️ same |
| Status listeners | `onStatusChange` (`:145-160`) | `watch_statuses` (`relay_pool.gleam:434-450`) | ✅ |
| `fetchEvent` convenience | yes (`:479-508`) | coordinator `fetch` | ✅ |

### Coordinator

| Aspect | OLD (`packages/core/src/nostr/subscription-coordinator.ts`) | NEW (`gleam/kernel/src/omni/kernel/nostr/coordinator.gleam`) | Status |
|---|---|---|---|
| Cache-first dispatch (0 ms) | sequential per filter (`:26-40`) | parallel per filter, then second sweep after relay registration (`:243-300, 396-404`) | ✅ |
| ACL read filtering per plugin | `pluginId = subId.split(":")[0]`, `canReadEvent` on cache + live (`:24, 34-38, 73-78`) | `plugin_id.parse` of prefix, `can_read_event` on cache + live (`:291-300, 350-380`) | ✅ |
| Dedupe across relays | `Set`, 5 000 cap, evicts first inserted (`:80-85`) | `Set`, 5 000 cap, **resets whole set** (`:120-127`) | ⚠️ |
| EOSE handling | per-relay + 2 500 ms fallback timer + fire-once (`:56-92`) | per-relay count only, **no fallback** (`:325-360`) | ❌ live subscribe can hang |
| Targeted relays | `targetRelays` passthrough (`:52-58, 92-97`) | `subscribe_targeted` + explicit targets (`:112-134`) | ✅ |
| NIP-65 hints resolution | none here (kernel wrote `setAuthorRelays`) | author-scoped filters → per-author read relays, background 10002 refresh, negative TTL cache (`:142-240`, `relay_hints.gleam:1-135`) | ➕ |
| Per-plugin namespacing | `${pluginId}:${subId}` from dispatcher | `plugin_id:name` parsed; unnamed ids bypass ACL | ✅ |
| Auto-ingest into store | yes (`:86`) | yes (`:380`) | ✅ |
| `fetch` one-shot with timeout/localOnly/relays | implemented in dispatcher (`json-rpc-dispatcher.ts:375-436`) | first-class `fetch` (`coordinator.gleam:438-546`) | ✅ |
| Relay hint seeding from every event | n/a | `relay_hints.seed_from_event` on each event (`:378`) | ➕ |

---

## ACL & Capabilities

OLD categories are stringly typed but converge to the same ten names used in OLD grants/manifest (`packages/core/src/kernel/omni-kernel.ts:211-280`, `packages/core/src/acl/acl-engine.ts:62-80`). NEW has an exhaustive enum (`gleam/protocol/src/omni/protocol/capability.gleam:11-66`).

### Full capability table

| Capability (wire) | OLD grant sites | NEW enum / check | Semantics differences |
|---|---|---|---|
| `nostr:read` | auto-granted with `permissions.nostr` (`omni-kernel.ts:239-243`); sensitive kinds gated (`acl-engine.ts:63-77`) | `NostrRead`; `can_read_event` (`engine.gleam:118-141`, `read_filter.gleam:22-48`) | ✅ same sensitive kinds `[4,1059,14]`; exact-kind grant or `nostr:encrypt` unlocks them |
| `nostr:write` + per-kind scope + `*` | manifest write kinds auto-granted per kind; `allKinds` → `*` (`omni-kernel.ts:244-259`) | `NostrWrite`; kind scope + wildcard fallback (`capability_store.gleam:70-110`) | ✅ |
| `nostr:sign` | auto-granted with nostr permission (`:260-262`) | `NostrSign` (`dispatcher.gleam:118-170`) | ✅ |
| `nostr:encrypt` | never auto-granted; only read-filter gate (`acl-engine.ts:64-75`) | `NostrEncrypt`; required for encrypt/decrypt RPC (`dispatcher.gleam:238-330`) and DM reads | ⚠️ OLD NIP-04/44 RPC checked `nostr:sign`, NEW checks `nostr:encrypt` (stricter) |
| `storage:kv` | granted by default for every plugin (`omni-kernel.ts:209-213`) | `StorageKv`; grant from manifest/default list | ⚠️ NEW does not auto-grant to third-party plugins; host default list only covers built-ins (`boot.gleam:300-330`) |
| `intents:dispatch` | manifest `intents` or trusted (`:222-229`) | `IntentsDispatch` | ✅ |
| `intents:handle` | same block (`:230-233`) | `IntentsHandle` | ✅ |
| `relays:manage` | manifest `relays.manage` **and trusted** (`:263-268`) | `RelaysManage` (`dispatcher.gleam:520-650`) | ⚠️ OLD required trust, NEW does not |
| `identity:manage_keys` | manifest `identity` **and trusted** (`:269-277`) | `IdentityManageKeys` (`dispatcher.gleam:690-724`) | ⚠️ OLD required trust |
| `system:geolocation` | manifest `geolocation` auto-grant (`:278-282`) | `SystemGeolocation`; method missing | ❌ RPC method absent |

### Grant / deny semantics

| Aspect | OLD | NEW | Status |
|---|---|---|---|
| Grant levels | `always`, `session`, `deny` (`capability-store.ts:1`) | `Always`, `Session`, `Deny` (`grant.gleam`) | ✅ |
| Persistence | `omni_capability_grants`, only `always`/`deny` persisted (`capability-store.ts:22-66`) | same key, same rule (`capability_store.gleam:30, 92-230`) | ✅ |
| Scope/wildcard lookup | exact then `*` unless disabled (`capability-store.ts:68-80`) | same (`capability_store.gleam:70-110`) | ✅ |
| Prompt hook | `(pluginId, category, details, manifest)` (`acl-engine.ts:5-10`) | `(PluginId, Capability, Option(Int), Option(String))` (`engine.gleam:22-25`) | ⚠️ no manifest passed to prompt |
| Reserved NIP-78 host tags | `omni`, `omni/…`, `omni:…` denied before grants (`acl-engine.ts:21-42`) | same in pure policy (`policy.gleam:56-67`) | ✅ |
| Manifest auto-grant | on `registerPlugin` (`omni-kernel.ts:205-280`) | only `config.system_apps` (`boot.gleam:300-330`) | ❌ |
| Revoke on uninstall | `capabilityStore.revoke` + `storageManager.clear` (`omni-kernel.ts:687-692`) | none (`registry.gleam:133-140`) | ❌ |
| Kind permission list UI hooks | `getPluginKindPermissions`/`setPluginKindPermission` (`omni-kernel.ts:666-686`) | settings UI searches grants directly (`gleam/shell/src/omni/shell/settings/permissions.gleam`) | ⚠️ |
| Rate limiting | none | token bucket 60/20 (`kernel.gleam:90`, `rate_limit.gleam`) | ➕ |
| Storage quota | manifest `quotaMb` declared, unenforced (`packages/types/src/manifest.ts:33-35`) | 10 MB per plugin (`kernel.gleam:91`, `quota.gleam:35-53`) | ➕ |

---

## Intents

| Aspect | OLD (`packages/core/src/intents/intent-broker.ts`) | NEW (`gleam/kernel/src/omni/kernel/intents/broker.gleam`, `gleam/protocol/src/omni/protocol/intent.gleam`) | Status |
|---|---|---|---|
| Registration / replacement per plugin+action | `:90-125` | `:37-55` | ✅ |
| Alias handling | bidirectional map `compose_note ↔ create_note` (`:30-33`) | canonical only `compose_note → create_note` (`intent.gleam:55-60`) | ⚠️ reverse alias not normalized |
| Default handler per action | `set/get/clear/getAll` (`:51-80`) | same (`broker.gleam:100-148`) | ✅ |
| Disable per plugin | `set/isPluginIntentEnabled` with aliases (`:82-100`) | same, canonical only (`broker.gleam:150-190`) | ⚠️ |
| Dispatch resolution | async; executes handler; falls back to first candidate; prompts to enable disabled candidate; emits `intent:dispatched` (`:150-245`) | pure `resolve` returning `Resolved/Disambiguate/DisabledCandidate/NoHandler` (`:207-269`) | ⚠️ no execution in broker |
| Plugin RPC `intent.dispatch` | resolves + calls handler (`dispatcher.ts:545-550`) | stub success, ignores payload (`dispatcher.gleam:656-678`) | ❌ |
| Plugin RPC `intent.handle` | registers callback, host sends `intent.invoke` notification (`dispatcher.ts:556-575`) | method absent | ❌ |
| Plugin RPC `intent.emit` / `on` event bus | `emit`/`on` (`:246-270`) | absent | ❌ |
| RPC handler vs in-process fallback retention | `fallbackHandler` retained on RPC replace (`:107-112, 126-145`) | absent | ❌ |
| "Open With…" chooser (multiple candidates) | `disambiguateCallback` (`:12-18`) + shell modal | `Disambiguate` outcome + `ShowIntentPrompt` (`boot.gleam:248-270`, `shell/settings/intents.gleam`) | ⚠️ UI exists; no persistence/default-setting from prompt |
| Default-intent persistence | workspace `defaultIntents` + `omni_default_handlers` (`omni-kernel.ts:1282-1322`) | `WorkspaceState.default_intents` modelled (`workspace/sync.gleam:27,131`) but never loaded into broker or saved | ❌ |
| Protocol URI → intent | `resolveAppHandlers`, NIP-89 kind 31989 discovery, scheme defaults (`omni-kernel.ts:1144-1322`) | `protocol_shims.route_to_intent`: `view_profile`, `view_note`, `view_app`, `pay_invoice`, `receive_cashu`, `open_url` (`protocol_shims.gleam:105-180`) | ⚠️ no NIP-89, no `view_app` handler registry, action names differ from OLD (`pay_invoice` vs `pay_lightning_invoice` in bridge) |
| Open-with candidate list | installed sandboxes + extra plugins + NIP-89 events | `installed_candidates` passed in; `OpenChooser` if ≥2 (`protocol_shims.gleam:183-205`) | ⚠️ |
| Missing intents | `compose_note/create_note`, `view_note`, `view_profile`, `edit_profile`, `create_task`, `share`, `pay_invoice/cashu`, `open_note` etc. derived from handler registrations | static set in `DescribeIntent`; no dynamic discovery | ⚠️ |

---

## JSON-RPC Method Surface

OLD method names from `packages/core/src/ipc/json-rpc-dispatcher.ts`. NEW decode from `gleam/protocol/src/omni/protocol/rpc/codec.gleam:262-513` and dispatch from `gleam/kernel/src/omni/kernel/rpc/dispatcher.gleam`.

| Method | OLD params | OLD | NEW decode | NEW behaviour | Status |
|---|---|---|---|---|---|
| `nostr.getPublicKey` | — | ✅ `:227` | ✅ `codec:264` | ✅ hex pubkey | ✅ |
| `nostr.signEvent` | `{event}` | ✅ `:232`; checks `nostr:sign`, drafts signed, **not persisted** | ✅ `codec:266` | ✅ checks sign, signs, **also saves to store** | ✅ |
| `nostr.publish` | `{event}` draft + `localOnly` | ✅ `:266` signs draft, saves, respects `allowedRelays` | ✅ `codec:323` (requires signed Event; bridge sends `{draft}`) | ⚠️ saves and broadcasts to all write relays; **bridge param name mismatch** (`nostr_shim.ffi.mjs:85-90` sends `draft`) | ❌ practically broken |
| `nostr.subscribe` | `{subscriptionId, filters}` | ✅ `:320` streams `nostr.stream.event/eose` | ❌ UnknownMethod | MethodNotFound | ❌ |
| `nostr.unsubscribe` | `{subscriptionId}` | ✅ `:437` | ❌ | MethodNotFound | ❌ |
| `nostr.fetch` | `{filters, timeoutMs, localOnly, relays}` | ✅ `:375` | ✅ `codec:282` (`filters`/`filter`, `timeoutMs`, `localOnly`, `relays`) | ✅ | ✅ |
| `nostr.getRelays` | — | ✅ `:447` map of scoped relays | ❌ (bridge calls it, `nostr_shim.ffi.mjs:27`) | MethodNotFound | ❌ |
| `nostr.nip04Encrypt` / `.nip04.encrypt` | `{pubkey, plaintext}` | ✅ `:480`, requires `nostr:sign` | ✅ `codec:343` → NIP-04 | ✅ requires `nostr:encrypt` | ✅ |
| `nostr.nip04Decrypt` / `.nip04.decrypt` | `{pubkey, ciphertext}` | ✅ `:494` | ✅ | ✅ | ✅ |
| `nostr.nip44Encrypt` / `.nip44.encrypt` | `{pubkey, plaintext}` | ✅ `:509` (keystore threw in OLD anyway) | ✅ decode but → `NostrEncrypt` | ❌ runs NIP-04 (`dispatcher.gleam:277`) | ❌ |
| `nostr.nip44Decrypt` / `.nip44.decrypt` | `{pubkey, ciphertext}` | ✅ `:514` | ✅ decode → `NostrDecrypt` | ❌ runs NIP-04 (`dispatcher.gleam:323`) | ❌ |
| `storage.get` | `{key}` | ✅ `:520` | ✅ `codec:369` | ✅ | ✅ |
| `storage.set` | `{key, value}` | ✅ `:526` | ✅ `codec:379` | ✅ + quota check | ✅ |
| `storage.delete` | `{key}` | ✅ `:532` | ✅ `codec:390` (+`storage.remove`) | ✅ | ✅ |
| `storage.keys` | — | ❌ | ✅ `codec:400` | ✅ new | ➕ |
| `storage.clear` | — | ✅ `:538` | ✅ `codec:401` | ✅ | ✅ |
| `intent.dispatch` | `{action, data}` | ✅ `:545` executes | ✅ `codec:424` (+`intents.dispatch`) | ❌ stub success `dispatcher.gleam:656-678` | ❌ |
| `intent.emit` | `{event, data}` | ✅ `:551` | ❌ | MethodNotFound | ❌ |
| `intent.handle` | `{action}` | ✅ `:556` registers RPC handler | ❌ | MethodNotFound | ❌ |
| `kernel.handleUri` | `{uri}` | ✅ `:577` | ❌ | MethodNotFound | ❌ |
| `kernel.handleShare` | `{title,text,url}` | ✅ `:587` | ✅ `codec:463` (`share`, `kernel.share`) | ❌ stub `{success:true, handled:true}` (`dispatcher.gleam:738`) | ⚠️ |
| `kernel.historyPush` | `{state,title,url}` | ✅ `:595` | ❌ | MethodNotFound | ❌ |
| `kernel.historyReplace` | same | ✅ `:602` | ❌ | MethodNotFound | ❌ |
| `kernel.historyBack` | — | ✅ `:609` | ❌ | MethodNotFound | ❌ |
| `kernel.historyGo` | `{delta}` | ✅ `:616` | ❌ | MethodNotFound | ❌ |
| `ui.scrollTo` | `{top,left,behavior}` | ✅ `:624` | ❌ | MethodNotFound | ❌ |
| `ui.toggleSlot` | `{slot}` | ✅ `:633` | ❌ | MethodNotFound | ❌ |
| `ui.openSlot` | `{slot}` | ✅ `:638` | ❌ | MethodNotFound | ❌ |
| `ui.closeSlot` | `{slot}` | ✅ `:643` | ❌ | MethodNotFound | ❌ |
| `relays.list` | — | ✅ `:649` (scoped) | ✅ `codec:402` | ✅ statuses, no scoping | ⚠️ |
| `relays.add` | `{url}` | ✅ `:653` w/ `relays:manage` | ✅ `codec:404` | ✅ | ✅ |
| `relays.remove` | `{url}` | ✅ `:669` | ✅ `codec:414` | ✅ | ✅ |
| `profile.get` | `{pubkey, syncRemote, timeoutMs}` | ✅ `:684` local + debounced remote | ❌ | MethodNotFound | ❌ |
| `profile.publish` | `{metadata}` | ✅ `:706` signs/saves/publishes kind 0 | ❌ | MethodNotFound | ❌ |
| `auth.getNpub` | — | ✅ `:724` (also incorrectly returned hex in runtime) | ❌ | MethodNotFound | ❌ |
| `auth.getNsec` | — | ✅ always denied `:728` | ❌ | MethodNotFound | ❌ |
| `auth.switchKey` | `{key}` nsec/hex | ✅ `:735`, checks `identity:manage_keys`, calls `keystore.setPrivateKey` | ✅ `codec:493` (decodes key as pubkey; no nsec) | ⚠️ only `event_store.set_user_pubkey`, **does not change signing key** (`dispatcher.gleam:700-720`) | ❌ |
| `auth.generateKey` | — | ✅ `:772` | ❌ | MethodNotFound | ❌ |
| `blossom.upload` | `{url, method, headers, bytes}` | ✅ `:795` | ❌ | MethodNotFound | ❌ |
| `http.fetch` | same + SSRF guard | ✅ `:796-848` | ❌ | MethodNotFound (`http.fetch` platform exists but ungated) | ❌ |
| `system.getVoices` | — | ✅ `:849` | ❌ | MethodNotFound | ❌ |
| `system.speak` | `{text, rate, pitch, lang, voice}` | ✅ `:872` best-voice selection | ❌ | MethodNotFound | ❌ |
| `system.cancelSpeech` | — | ✅ `:932` | ❌ | MethodNotFound | ❌ |
| `system.getGeolocation` | `{timeout, enableHighAccuracy}` | ✅ `:942` high→low retry | ❌ | MethodNotFound | ❌ |
| `navigation.open` | `{view, page}` | ❌ (OLD used history/uislot) | ✅ `codec:448` (+`navigation.navigate`, `ui.openView`) | ⚠️ stub, no shell routing | ➕/⚠️ |
| Notifications | `nostr.stream.event`, `nostr.stream.eose`, `intent.invoke`, `history.popstate`, `auth.keyChanged` (`sandbox-manager.ts:1284, 1300`) | ✅ | none emitted by dispatcher | — | ❌ |

Related but not RPC: NEW guest bridge calls `nostr.subscribe`, `nostr.unsubscribe`, `nostr.getRelays`, `nostr.doc` (`gleam/bridge/src/omni/bridge/nostr_shim.ffi.mjs:27, 63-95`), all of which currently return MethodNotFound; `nostr.publish` sends `{draft}` which the codec does not accept.

---

## Sandbox Hosts & Shimmed APIs

| Capability | OLD iframe (`omni-runtime.js`) | OLD worker (`worker-guest-host.ts`) | OLD WASM (`wasm-guest-host.ts`) | NEW iframe bridge (`gleam/bridge/js/guest-runtime.mjs`, `shell_boot.ffi.mjs`) | NEW worker (`worker_host.gleam`) | NEW WASM | Status |
|---|---|---|---|---|---|---|---|
| Host implementation | real iframe + mirrored DOM (`sandbox-manager.ts:892-1160`) | Blob worker instantiated (`worker-guest-host.ts:1-179`) | `WebAssembly.compile` + WIT shims (`wasm-guest-host.ts:53-230`) | `<iframe srcdoc>` mounted (`shell_boot.ffi.mjs:5-50`) | script builder only (`worker_host.gleam:154-190`); **never instantiated** | none (`manager.gleam:226-246` stub) | ❌ worker/wasm |
| `omni:init` | window postMessage + MessagePorts (`sandbox-manager.ts:1130-1225`) | ports | n/a | port 1 schema / port 2 RPC (`guest-runtime.mjs:86-108`) | handshake descriptor only | n/a | ⚠️ |
| `window.nostr` NIP-07 | getPublicKey, signEvent, getRelays (`omni-runtime.js:887-897`) | yes (new runtime) | getPublicKey import | getPublicKey, signEvent, getRelays (`nostr_shim.ffi.mjs:20-30`) | n/a | n/a | ✅ |
| `window.nostr.nip04/44` | yes (`:899-914`) | yes | none | yes (24-41) | n/a | n/a | ⚠️ (NIP-44 host bug) |
| `window.nostr.relays` | list/add/remove (`:916-930`) | yes | none | list/add/remove (43-53) | n/a | n/a | ✅ |
| `window.nostr.fetch` | yes (`:938-943`) | yes | `omni_nostr_fetch` import | yes (56-61) | n/a | n/a | ✅ |
| `window.nostr.subscribe` | yes (`:944-988`) | yes | `omni_nostr_subscribe` | yes (63-82) | n/a | n/a | ❌ host method missing |
| `window.nostr.doc()` (NIP-78 doc helper with encrypt + live updates) | yes (`:990-1175`) | yes | none | calls `nostr.doc` (91-96); no host method | n/a | n/a | ❌ |
| `window.omni` namespace (session, ready, storage, intents, ui, profile, auth) | yes (`:1181-1360`) | yes | none | **absent** | n/a | n/a | ❌ |
| `localStorage` partitioned shim | yes (`:76-140`) | yes | no | yes (`storage_shim.ffi.mjs:1-90`), eagerly installed before init | n/a | n/a | ✅ |
| `indexedDB` | **not shimmed** (opaque origin; deleted in worker preamble `worker-guest-host.ts:60-66`) | deleted | n/a | not shimmed | n/a | n/a | ⚠️ same |
| Virtual `WebSocket` → relay RPC | yes (`:533-666`) | yes | none | yes (`websocket_shim.ffi.mjs:1-160`) | n/a | n/a | ✅ |
| `fetch` shim | yes, `http.fetch`/`blossom.upload` via RPC, non-http blocked (`:670-724`) | yes | none | **absent** (native fetch blocked by CSP `connect-src 'none'`) | n/a | n/a | ❌ |
| `speechSynthesis` bridge | yes (`:726-830`) | yes | none | absent | n/a | n/a | ❌ |
| `navigator.share` | yes → `kernel.handleShare` (`:1407-1417`) | yes | none | yes (`share_shim.ffi.mjs`) → `omni:share` message; no host consumer | n/a | n/a | ⚠️ |
| `navigator.geolocation` | yes → `system.getGeolocation` (`:1419-1445`) | yes | none | absent | n/a | n/a | ❌ |
| Protocol URI click / `window.open` interception | yes (`:1382-1406`) | yes | n/a | yes (`links_shim.ffi.mjs`) with different intent names | n/a | n/a | ⚠️ |
| Virtual `history` / `Location.search|hash|href` | yes (`:1459-1683`) | yes | n/a | absent | n/a | n/a | ❌ |
| `scrollTo` / `scrollIntoView` forwarding | yes (`:35-73`) | yes | n/a | absent | n/a | n/a | ❌ |
| CustomEvent `intent` interception | yes (`:1446-1457`) | yes | n/a | absent | n/a | n/a | ❌ |
| Theme updates pushed into guest | `omni:theme-update` (`sandbox-manager.ts:290-320`) | yes | n/a | tokens injected as CSS variables at srcdoc build (`iframe_host.gleam:109-161`), no live updates | n/a | n/a | ⚠️ |
| Schema/action channel | Channel 1 ports + window messages (`sandbox-manager.ts:1260-1310`) | ports | WIT `omni_ui_render` + lines | schema port + `omni:action` via `postToHost` and action port (`guest-runtime.mjs:57-83, 132-146`) | n/a | n/a | ✅/⚠️ |
| DOM mounting into slots | mirror containers per component, optional shadow DOM (`sandbox-manager.ts:600-760`) | n/a | n/a | island `<iframe>` mount only (`shell_boot.ffi.mjs:5-50`) | n/a | n/a | ⚠️ |
| CSP | trusted vs untrusted variants, untrusted `connect-src 'none'` (`sandbox-manager.ts:893-896`) | n/a | n/a | locked-down only: `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; connect-src 'none'; img-src …` (`csp.gleam:24-60`) | n/a | n/a | ⚠️ trusted plugins no longer get network |
| Sandbox attrs | host-specific | n/a | n/a | mount uses only `allow-scripts` (`shell_boot.ffi.mjs:10`), discarding `prepare_mount` sandbox string | n/a | n/a | ⚠️ |
| CSS scoping | `scopeCss` available, applied by shells only when injecting guest CSS | — | — | `css_scoper.scope_css` implemented, **unused outside tests** (`gleam/sandbox/src/omni/sandbox/css_scoper.gleam:501`) | — | — | ⚠️ |
| Preamble hardening | worker only | deletes indexedDB/caches/fetch/WebSocket/importScripts (`worker-guest-host.ts:58-74`) | n/a | worker text carries same preamble (`worker_host.gleam:38-60`) but never runs | n/a | n/a | ⚠️ |

Notable integration detail: NEW's production mount (`gleam/interop/src/omni/interop/shell_boot.ffi.mjs:5-48`) creates two `MessageChannel`s and posts `omni:init` with ports; the bundled bridge (`gleam/bridge/js/guest-runtime.mjs:89-105`) consumes them. The separate inline fallback bridge in `iframe_host.gleam:45-107` uses `window.parent.postMessage({__omni_rpc_request:…})` and would not work against that host; it is only used when `bridge_script` is empty (tests).

---

## Schema Renderer Components

All 24 primitive types exist in both; NEW has a closed ADT (`node.gleam:171-270`) and renders to Lustre HTML (`gleam/ui/src/omni/ui/render.gleam:56-290`). OLD registered custom elements (`primitive-elements.ts:2143`) and reconciled DOM in place (`schema-renderer.ts:99-200`).

| Type | OLD props (types file) | OLD renderer notes | NEW node + renderer | Status |
|---|---|---|---|---|
| `box` | direction/gap/align/justify/wrap/padding/background/action/children (`schema.ts:70-81`) | flex container, click action with child-control guards (`primitive-elements.ts:60-127`) | `Box` (`node.gleam:172-185`), `render_box` | ✅ |
| `card` | title/subtitle/icon/headerAction/children/footer/action/bannerBackground (`:83-93`) | header action slot, banner bg, click | `Card` (`:186-196`) | ✅ |
| `divider` | orientation (`:95-98`) | | `Divider` | ✅ |
| `spacer` | size (`:100-103`) | | `Spacer` | ✅ |
| `text` | content/variant/tone/truncate/action/showInlineImages (`:105-113`) | **rich linkification + NIP-19 + media** (`primitive-elements.ts:744`) | `Text` (`:197-206`); `element.text(content)` (`text.gleam:86`) | ❌ content rendering |
| `badge` | label/tone/variant/dot (`:115-121`) | | `Badge` (`:207-213`) | ✅ |
| `metric` | label/value/subtext/trend (`:123-129`) | | `Metric` (`:214-220`); `MetricValue` int/float/string | ✅ |
| `icon` | name/size (`:131-135`) | SVG registry | `Icon`; `icons.gleam` (parity + `moon`, `menu`) | ✅ |
| `avatar` | src/pubkey/name/size/action (`:137-144`) | image + initials fallback, action | `Avatar` (`:221-228`); URL sanitization + generated fallback (`text.gleam:208-305`) | ✅ |
| `button` | label/action/variant/size/icon/iconPosition/disabled/loading (`:146-156`) | | `Button` (`:229-240`) | ✅ |
| `icon-button` | icon/tooltip/action/variant/size/disabled (`:158-166`) | | `IconButton` (`:241-249`) | ✅ |
| `input` | name/placeholder/value/inputType(text,number,search,url,password,**file**)/accept/clearable/prefixIcon/actionOnEnter/actionOnChange (`:168-179`) | file picker/read (`primitive-elements.ts:1037-1153`) | `Input` (`:250-262`); `render_input` | ⚠️ verify file picker in `render/input.gleam` (platform/filepicker exists) |
| `textarea` | name/placeholder/value/rows (`:181-187`) | | `Textarea` (`:263-269`) | ✅ |
| `toggle` | name/label/checked/action/disabled (`:189-201`) | emits checked payload | `Toggle` (`:270-277`) | ✅ |
| `select` | name/value/options/action (`:203-216`) | | `Select` (`:278-284`) | ✅ |
| `tabs` | tabs[{id,label,icon,badge:string|number}]/activeTab/action (`:218-223`) | | `Tabs` (`:285`); badge `Option(String)` only (`:146-152`) | ⚠️ numeric badge widened only as string |
| `status-indicator` | status(online/connecting/offline/error)/label/pulse (`:225-230`) | | `StatusIndicator` (`:286-291`) | ✅ |
| `code-block` | code/language/copyable (`:232-237`) | copy button | `CodeBlock` (`:292-297`); copyable is a data attr only (`text.gleam:307-340`) | ⚠️ no copy action |
| `progress` | value/max/label/variant(bar/spinner/disk/ring)/size/color/showTicks/action (`:239-249`) | disk/ring SVG, clock ticks | `Progress` (`:298-308`); `feedback.render_progress` | ⚠️ verify disk/ring ticks |
| `banner` | tone/title/message/icon/action/actionLabel/dismissible/onDismissAction (`:251-261`) | dismiss | `Banner` (`:309-321`) | ✅ |
| `list` | items/onScrollEndAction/hasMore/loadingMore (`:277-283`) | IntersectionObserver auto `load-more` (`schema-renderer.ts:299-330`) | `List` (`:344-352`); emits `data-scroll-end-action` only (`render/list.gleam:45-47`) | ❌ auto load-more |
| `list-item` | title/subtitle/meta/icon/avatarUrl/avatarPubkey/checked/onCheckAction/onClickAction/actions (`:263-275`) | | `ListItem` (`:353-369`) | ✅ |
| `empty-state` | icon/title/description/action/actionLabel (`:285-292`) | | `EmptyState` (`:370-378`) | ✅ |
| `virtual-list` | items/itemHeight/overscan/maxHeight (`:294-299`) | real virtualization, preserves `scrollTop` on patch (`primitive-elements.ts:2053-2100`) | `VirtualList` (`:379-386`); pure window computation rendered at `scroll_top = 0` (`ui/virtual_list.gleam:104-140`, `render.gleam:281-289`) | ❌ not live-virtualized |

Cross-cutting renderer behaviour:

| Behaviour | OLD | NEW | Status |
|---|---|---|---|
| Styling scope | `id`/`key`/`visible`/`style` applied; `visible:false` removes subtree (`schema-renderer.ts:210-240`); guest CSS scoping helper | `id`/`data-key`/`data-page-id`/style attr; `visible:false` → `element.none()` (`render.gleam:35-53, 59-64`) | ✅ |
| Custom elements | `omni-*` custom elements with `setProps` | plain HTML `.omni-*` classes | ✅ equivalent |
| Action event shape | DOM `omni-action` CustomEvent, `{action:{name,payload,navigate}, payload}`; **ambient form values merged** (`schema-renderer.ts:41-90`) | Lustre `Action` value passed to `on_click`; wire envelope `{type:"omni:action", action, payload, navigate}` (`ui/host.gleam:88-115`) | ⚠️ no form-state merge |
| Navigation from action (`action.navigate.route`) | handled in sandbox: URI intents or history push (`sandbox-manager.ts:665-690`) | encoded only; host routing not implemented | ❌ |
| Cross-app action delegation (`view_note`, `view_profile`) | sandbox dispatches intents if plugin doesn't handle them (`sandbox-manager.ts:690-720`) | none | ❌ |
| `page` declarations → history frames | auto-managed (`sandbox-manager.ts:219-250`) | `data-page-id` attr only (`render.gleam:37-40`) | ❌ |
| Infinite scroll auto `load-more` | IntersectionObserver, 1.2 s throttle, 400 px rootMargin (`schema-renderer.ts:299-330`) | none | ❌ |
| Icons | 60+ names, spinner class (`schema/icons.ts:1-75`) | 60+ names, same fallback (`ui/icons.gleam:13-950`) | ✅ |

---

## Rich Content Rendering

This is the section where the rewrite loses the most shared functionality. Both versions route note/profile text through the `text` primitive (OLD `OmniTextElement`, NEW `Text`), so a fix here fixes feed, notes, profiles, quotes, and thread views at once.

| Feature | OLD | NEW | Status |
|---|---|---|---|
| Plain text escaping | Escape `& < > " '` before linkifying (`primitive-elements.ts:507-513`) | `element.text` (Lustre escapes automatically) (`text.gleam:86`) | ✅ |
| URL linkification | Regex `https?://…`, strips trailing punctuation and HTML entities, upgrades `http→https` (`:516-570`) | **none** | ❌ |
| Markdown inline links `[label](url)` | Placeholder substitution before escaping (`:496-505`) | **none** | ❌ |
| Full Markdown (headings, bold, lists, fences) | **absent** | absent | ⚠️ both missing |
| Image URLs | Callout chip or, when `showInlineImages`/`omni_feed_inline_images`, inline `<img loading=lazy>` appended (`:519-570, 551-568, 605-612`) | **none** | ❌ |
| Video URLs | Callout chip with filename + "Video" badge; no `<video>` playback (`:534-548`) | **none** | ❌ |
| Audio URLs | absent | absent | ⚠️ both missing |
| Inline `npub` / `nprofile` | Chip link, label resolved from cached profile display name (`omni_profile_viewer_cache_v2`, `omni_profile_cache_v2/_v1`), data attrs for host click routing (`:466-487, 571-587`) | **none** (avatar/name only in note header) | ❌ |
| Inline `note` / `nevent` | Quote card with author name, short id, snippet; loaded from global event cache, IndexedDB, or `omni:request_event` (`:466-488, 588-590`; kernel `omni-kernel.ts:140-168`) | **none** | ❌ |
| Inline `naddr` | Chip with identifier label (`:592-604`) | **none** | ❌ |
| Hashtag links | absent | Hashtags parsed into `Note.hashtags` (`social/note.gleam:44-48`) but never rendered | ⚠️ |
| Emoji shortcodes | absent | absent | ⚠️ |
| Custom emoji kind 30030 | absent | absent | ⚠️ |
| Content warnings / NIP-36 | absent | absent | ⚠️ |
| OpenGraph / link previews | absent | absent | ⚠️ |
| Code blocks | `code-block` primitive only (`primitive-elements.ts:1400-1450`) | `code-block` primitive (`text.gleam:307-340`) | ✅ |
| Note reply badge / author header | plugin-owned (feed MoonBit) | shared `social_ui/note_card.gleam:63-160` (avatar, display name, relative time, truncated npub, "Reply to …") | ➕ shared |
| Note body | plugin emitted `text` node; host rendered rich HTML | `builder.text(n.content)` (`note_card.gleam:296`) → plain text | ❌ |
| Profile display name resolution | `getCachedProfileDisplayName` scans three localStorage caches (`:430-465`) | `profile_cache.gleam` + `best_display_name` (`social/profile.gleam:198`) | ✅ (better shape) |
| HTML content sanitizer (notes editor) | Allowlist of `b/strong/i/em/u/s/…/a`; strips all attrs except safe `href` (`packages/plugins/notes/src/editor/sanitizer.ts:6-58`) | Generic `strip_unsafe_html` with a small block-tag denylist and any-tag allowlist (`gleam/ui/src/omni/ui/sanitize.gleam:193-470`); URL scheme allowlist is strong (`sanitize.gleam:36-150`) | ⚠️ weaker tag allowlist, stronger URL guard |
| Media in Notes editor | contenteditable HTML, sanitized on save (`notes-ui.ts:733`) | textarea + plain-text notes (`plugins/notes/src/plugin/notes/view.gleam:214-222`) | ⚠️ (plugin UI; see 05) |

---

## Storage

| Aspect | OLD (`packages/core/src/storage/plugin-storage-manager.ts`) | NEW (`gleam/kernel/src/omni/kernel/rpc/quota.gleam`, `gleam/platform/src/omni/platform/storage.gleam`, dispatcher) | Status |
|---|---|---|---|
| Backend | IndexedDB `omni_plugin_storage`, store `plugin_kv`, compound key `[pluginId, key]` (`:3-25`) | `localStorage` (host) with key `<pluginId>::<key>` (`quota.gleam:23-30`) | ⚠️ different durability/quota model |
| Value type | arbitrary JSON (`get<T>`, `set<T>`) (`:40-101`) | strings only (`StorageGet` returns string, `set` converts) | ⚠️ no JSON round-trip helper in kernel |
| Partitioning | `pluginId` index + compound key | prefix + `storage.keys` filtering (`dispatcher.gleam:470-520`) | ✅ |
| Quota | declared `quotaMb` in manifest, not enforced (`packages/types/src/manifest.ts:33-35`) | 10 MB/plugin, checked on set, `QuotaExceeded` error (`dispatcher.gleam:400-440`) | ➕ |
| Quota errors | n/a | `error_code.QuotaExceeded` (-32005) | ➕ |
| `getAll` / key listing | `getAll(pluginId)` (`:57-80`) | `storage.keys` RPC returns unprefixed keys (`dispatcher.gleam:470-500`) | ✅ |
| `clear` | cursor delete for plugin (`:105-135`) | iterate keys with prefix and remove (`dispatcher.gleam:502-520`) | ✅ |
| Migration | none | none | ⚠️ both |
| Guest localStorage shim persistence | guest keys persisted through RPC storage, hydrated at mount via `__OMNI_INITIAL_STORAGE__` (`sandbox-manager.ts:780-830`) | bridge localStorage writes directly to host localStorage with `omni:plugin:<id>:` prefix (`storage_shim.ffi.mjs:20-90`), **separate namespace from `<id>::` RPC storage** | ❌ two disjoint storage namespaces |
| Uninstall cleanup | `clear(pluginId)` (`omni-kernel.ts:687-692`) | none | ❌ |

---

## Plugin Resolution

| Aspect | OLD (`packages/core/src/plugins/nostr-plugin-resolver.ts`, `zip-plugin-bundler.ts`) | NEW (`gleam/kernel/src/omni/kernel/plugins/resolver.gleam`, `gleam/web/src/omni/web/installer.gleam`, `plugins/publisher/src/plugin/publisher/bundle.gleam`) | Status |
|---|---|---|---|
| Targets | `naddr1`, `kind:pubkey:d`, `pubkey:d`, or `NostrEvent` (`:41-120`) | `naddr1`, `kind:pubkey:d`, `pubkey:d`, **`https://` URL**, `Event` (`resolver.gleam:63-119`) | ✅ + URL |
| Resolution order | local store → relay `fetchEvent` 5 s → verify sig (`:82-118`) | local-only 250 ms → network 2 s → no verify (`installer.gleam:117-155`) | ⚠️ |
| Relay hints from naddr | added to pool (`:77-80`) | ignored (`installer.gleam:117-155`) | ❌ |
| Signature verification | `verifyEvent` (`:101-105`) | none | ❌ |
| Manifest extraction | content JSON, tag fallbacks, `components`, permissions (`:120-200`) | tag-only + content heuristic; no permissions/components (`resolver.gleam:160-288`) | ⚠️ |
| Blossom `f`/`server` tags | parsed (`:120-145`) | parsed (`resolver.gleam:131-160`) | ✅ |
| Blossom fetch | per-file with **SHA-256 verify**, server fallback list (`:471-530`) | fetch all files, **no hash verify**, server fallback (`installer.gleam:220-265`) | ❌ |
| Companion CSS/JS | only referenced files inlined, `<link>`/`<script src>` rewritten (`:236-270`) | all CSS/JS inlined unconditionally (`installer.gleam:267-330`) | ⚠️ |
| `index.html` vs `index.js` | picks HTML(s) then JS (`:221-236`) | `index.html` then `index.js` (`installer.gleam:214-222`) | ✅ |
| View discovery | event `view`/`route`/`views` tags **and** HTML `<link rel=alternate>`, PWA shortcuts (`:302-400`) | tag-based only via `manifest.parse_view_tags` (`resolver.gleam:210`) | ❌ HTML tier |
| Icon discovery | event tags + `<meta name=icon>`, `<link rel=icon>`, manifest JSON (`:416-465`) | event tag only (`resolver.gleam:188-206`) | ❌ |
| naddr generation | rebuilt with connected relay hints (`:282-292`) | `nip19.encode(Naddr(...))` with empty relays (`resolver.gleam:216-232`) | ⚠️ |
| Caching | event store + relay pool | event store + relay pool | ✅ |
| HTTPS / local install | ❌ | ➕ `resolve_url` text fetch (`installer.gleam:35-52`) | ➕ |
| ZIP install/publish | full extract + asset inline + metadata inference + Blossom upload (`zip-plugin-bundler.ts:231-430`) | zip port (`platform/zip.gleam`) and `bundle.from_zip_bytes` (`publisher/bundle.gleam:25-90`); no inlining/metadata inference in installer | ⚠️ partial |
| Update check | not modelled here (shell) | `plugins/updates.gleam`, version compare, update modal (`shell_boot.gleam:673-735`) | ➕ |

---

## Keystore & Crypto

| Capability | OLD (`packages/core/src/crypto/webcrypto-keystore.ts`) | NEW (`gleam/kernel/src/omni/kernel/crypto/keystore.gleam`, `gleam/platform/src/omni/platform/nip44.ffi.mjs`) | Status |
|---|---|---|---|
| Key generation | `schnorr.utils.randomPrivateKey` (`:32-35`) | `secp256k1` port + random (`keystore.gleam:62-90`) | ✅ |
| Sign / event id | BIP-340 schnorr, NIP-01 serialization (`:127-160`) | same (`keystore.gleam:343-390`) | ✅ |
| Verify | `verifyEvent` (`:162-184`) | platform `schnorr_verify` exists, not used in ingest/resolver | ⚠️ |
| npub/nsec/hex parsing | accepts nsec/npub/naddr/hex (`:70-98`) | nsec/hex (`keystore.gleam:62-80`) | ✅ |
| NIP-04 | AES-256-CBC shared secret (`:186-216`) | same (`nip44.ffi.mjs:43-110`) | ✅ |
| NIP-44 | **throws "Phase 2"** (`:203-208`) | full v2 ChaCha20+HMAC-SHA256 implementation (`nip44.ffi.mjs:180-310`) | ➕ |
| NIP-44 RPC path | threw | decoded but routed to NIP-04 (`dispatcher.gleam:277,323`) | ❌ wiring |
| Passphrase at rest | none | `enable_passphrase`/`disable_passphrase`/`unlock`, NIP-44-encrypted blob, salt, locked state (`keystore.gleam:404-560`) | ➕ |
| Key derivation | n/a | `sha256(salt <> ":" <> passphrase)` as secp key (`keystore.gleam:404-411`) — not a KDF | ⚠️ |
| Multi-account | none (single `privateKeyHex`) | `omni_accounts`, per-account plain/encrypted keys, `switch_account` (`keystore.gleam:99-240`) | ➕ |
| Key-change listeners | `onKeyChange` (`:21-30`) | none | ❌ |
| nsec exposure | `getNsec()` in kernel; plugin RPC denied (`dispatcher.ts:728`) | `get_nsec` errors while locked (`keystore.gleam:328-340`); no RPC | ✅ |
| `auth.switchKey` semantics | replaces signing key (`dispatcher.ts:735-770`) | only event-store pubkey (`dispatcher.gleam:700-720`) | ❌ |
| `auth.generateKey` | replaces key (`dispatcher.ts:772-794`) | absent | ❌ |
| Bech32/naddr | `bech32.ts` re-export | `gleam/nostr/src/omni/nostr/bech32.gleam`, `nip19.gleam` | ✅ |

---

## Routing, History, Deep Links

| Aspect | OLD | NEW | Status |
|---|---|---|---|
| Navigation model | `NavigationFrame` stack with app/section/subroute, pageId, url, state, timestamp, `intentEntry` (`navigation-manager.ts:1-40`) | `PageStack` of strings + current (`navigation/history.gleam:9-70`) | ⚠️ |
| Push/replace/back/forward/go | yes (`:180-420`) | push/pop/replace only (`history.gleam:40-66`) | ⚠️ no forward/go |
| Browser history sync | `pushState`/`replaceState` with serialized frame (`:227-300`) | `page_url()` + `pushState/replaceState` in `shell_boot.ffi.mjs:68-86` | ✅ |
| Popstate handling | `handlePopState` → dispatch plugin frames (`:429-470`), shell listeners (`editorial-shell.ts:343-363`) | `parse_url` → `msg_from_url` → dispatch (`shell_boot.ffi.mjs:138-146`, `shell_boot.gleam:217-240`) | ⚠️ shell-level only, no plugin page state |
| URL scheme | opaque history frames; URL text carried in state | `?app=<pluginId>`, `?view=widgets|apps|settings`, `?tab=…` (`shell_boot.gleam:196-258`) | ⚠️ fewer deep-link shapes (`pubkey`, `note` etc. absent) |
| `window.location.search` view params | plugin sandbox virtualized `search/hash/href` (`omni-runtime.js:1459-1683`) | only `route.parse_route` helpers (`navigation/router.gleam:1-161`); guests see real iframe URL | ❌ guest view params |
| Per-plugin page state / history | `onHistoryPush/Replace/Back/Go`, page declarations, popstate dispatch (`omni-kernel.ts:641-655`, `sandbox-manager.ts:219-250`) | no RPC methods, no page registration | ❌ |
| Intent coalescing (open app + target page = one frame) | yes (`navigation-manager.ts:55-150`) | none | ❌ |
| Scroll restoration | virtual list preserves `scrollTop` on patch (`primitive-elements.ts:2053-2075`); shells reset on page change | none | ❌ |
| Focus management | shell focuses search input (`panorama-shell.ts:1994`) | none found | ⚠️ |
| Pull-to-refresh | shell | shared `shell/gestures/pull_to_refresh.gleam` + touch FFI (`shell_boot.ffi.mjs:100-130`) | ✅ |
| Deep link install (`?install=naddr…`) | not in core | not in core | ⚠️ both |

---

## Prioritized Restoration List

1. **Restore rich text rendering in the shared `Text`/note-card path.** Where: `gleam/ui/src/omni/ui/render/text.gleam:29-86` and `gleam/social_ui/src/omni/social_ui/note_card.gleam:288-305`. Effort: L. Impact: critical — every feed/thread/profile note currently shows raw URLs, `nostr:` identifiers, and `[label](url)` markup as literal text.
2. **Implement `nostr.subscribe` / `nostr.unsubscribe` RPC streaming.** Where: `gleam/protocol/src/omni/protocol/rpc/codec.gleam:262-513`, `gleam/kernel/src/omni/kernel/rpc/dispatcher.gleam`. Effort: M. Impact: critical — guest plugins cannot receive live events; the bridge already calls these (`nostr_shim.ffi.mjs:63-83`).
3. **Restore `nostr.getRelays`, `auth.getNpub`, `auth.generateKey`, `auth.switchKey` real key switch, `profile.get/publish`.** Where: dispatcher + codec. Effort: M. Impact: high — NIP-07 clients and the guest bridge's `getRelays` fail; key switching is a silent no-op.
4. **Fix NIP-44 RPC routing.** Where: `codec.gleam:343-368`, `dispatcher.gleam:238-330`. Effort: S. Impact: high — encrypted DMs currently get NIP-04 ciphertext when NIP-44 is requested.
5. **Fix `nostr.publish` contract and bridge param name.** Where: `gleam/bridge/src/omni/bridge/nostr_shim.ffi.mjs:85-90`, `codec.gleam:323-340`, `dispatcher.gleam:200-270`. Effort: S. Impact: high — publishing unsigned drafts from guests fails; host semantics changed from "sign+publish" to "broadcast signed".
6. **Implement the guest fetch / `http.fetch` / `blossom.upload` shim with SSRF guard.** Where: new bridge shim + two dispatcher methods; reference `omni-runtime.js:670-724` and `json-rpc-dispatcher.ts:795-848`. Effort: M. Impact: high — image/blob upload, relay discovery, and many plugins depend on fetch.
7. **Re-add `kernel.handleUri`, `ui.scrollTo`, `ui.*Slot` and all `kernel.history*` RPC methods.** Where: codec + dispatcher + `omni_web` host effects. Effort: M. Impact: high — sandbox scroll forwarding, slot controls, and plugin-driven history all fail.
8. **Restore intent execution from plugins (`intent.dispatch`, `intent.handle`, `intent.emit`).** Where: `dispatcher.gleam:656-678`, broker, bridge. Effort: M. Impact: high — all cross-app actions (view note/profile, compose, pay) currently no-op.
9. **Make action routing honour `action.navigate` and delegate unhandled `view_note`/`view_profile` to the intent broker.** Where: `gleam/ui/src/omni/ui/host.gleam` + `boot.gleam:230-300`; OLD `sandbox-manager.ts:665-720`. Effort: M. Impact: high.
10. **Restore EOSE fallback for live subscriptions.** Where: `gleam/kernel/src/omni/kernel/nostr/coordinator.gleam:300-360`; OLD `subscription-coordinator.ts:60-80`. Effort: S. Impact: high — fetches can hang until timeout when relays never send EOSE.
11. **Add a WASM guest host or explicitly document its removal.** Where: `gleam/sandbox/src/omni/sandbox/manager.gleam:226-246`, missing `wasm_host.gleam`; OLD `wasm-guest-host.ts`. Effort: L. Impact: high for MoonBit/WASM plugins; none for JS nsites.
12. **Instantiate the worker guest host.** Where: `gleam/sandbox/src/omni/sandbox/worker_host.gleam` (script builder only) + host FFI to create Blob worker. Effort: M. Impact: medium-high (off-thread schema plugins, worker-style nsites).
13. **Re-add guest `window.omni` compatibility API, geolocation, speech synthesis, virtual history/Location, and scroll shims.** Where: `gleam/bridge/js/guest-runtime.mjs` + new FFI shims. Effort: L. Impact: medium-high for legacy plugins; parity for plugin APIs.
14. **Restore `page`-driven history, popstate dispatch into plugins, and scroll restoration.** Where: `render.gleam:35-53` (page attr), `kernel/navigation/*`, host FFI; OLD `sandbox-manager.ts:219-250`, `navigation-manager.ts`. Effort: L. Impact: medium-high (back button, per-tab page state, thread navigation).
15. **Re-add event store tag/compound indexes and time-bounded query planning.** Where: `event_store_index.gleam:23-75`; OLD `event-store.ts:78-93, 470-500`. Effort: M. Impact: medium (large local stores, `since`-scoped feeds, `#d` lookups).
16. **Restore the global event cache used by quote cards.** Where: new kernel/store + `social_ui`; OLD `primitive-elements.ts:347-392`, `omni-kernel.ts:140-168`. Effort: S/M. Impact: medium (quote cards inline).
17. **Add manifest auto-grants, `isPluginTrusted`, and revoke-on-uninstall.** Where: `boot.gleam:300-330`, `registry.gleam:133-140`, `kernel.gleam`. Effort: M. Impact: medium (third-party plugins currently get no storage/intent grants; uninstall leaves data and permissions).
18. **Restore per-instance `allowedRelays` scoping.** Where: `RpcContext` + coordinator/pool targets; OLD `json-rpc-dispatcher.ts:179-190` etc. Effort: M. Impact: medium (relay-scoped widgets and private relay plugins).
19. **Add NIP-89 handler discovery + scheme default-handler persistence and load `WorkspaceState.default_intents` into the broker.** Where: `boot.gleam:183-214`, `broker.gleam:138-148`; OLD `omni-kernel.ts:1144-1322`. Effort: M. Impact: medium ("Open with" and remembered defaults).
20. **Re-add manifest signature verification and Blossom SHA-256 verification; add HTML view/icon discovery.** Where: `installer.gleam`, `resolver.gleam`; OLD `nostr-plugin-resolver.ts:100-300, 302-470, 471-530`. Effort: M. Impact: medium-high (security + correct plugin metadata).
21. **Implement auto load-more (IntersectionObserver equivalent) and live virtual list.** Where: `render/list.gleam:45-47`, `ui/virtual_list.gleam`, host FFI; OLD `schema-renderer.ts:299-330`, `primitive-elements.ts:1965-2100`. Effort: M. Impact: medium (long feeds stop paginating on scroll).
22. **Unify guest localStorage namespace with RPC `storage:kv` and clear both on uninstall.** Where: `gleam/bridge/src/omni/bridge/storage_shim.gleam:11`, `quota.gleam:23-30`, `registry.gleam:133`. Effort: S. Impact: medium.
23. **Restore logging/user-visible error surfaces for relay, store, sandbox, and RPC failures.** Where: kernel modules; OLD had `console.warn/error` at every failure boundary (`relay-pool.ts:130-230`, `event-store.ts`, `sandbox-manager.ts:1125`). Effort: S/M. Impact: medium (diagnosability).
24. **Re-add `nostr.doc()` host support or remove the bridge API.** Where: `gleam/bridge/src/omni/bridge/nostr_shim.ffi.mjs:91-96`, dispatcher. Effort: M. Impact: medium (NIP-78 document plugins).
25. **Restore trusted-plugin CSP network access (or document the change).** Where: `gleam/sandbox/src/omni/sandbox/csp.gleam:24-60`, `iframe_host.gleam:163-176`; OLD `sandbox-manager.ts:893-896`. Effort: S. Impact: low-medium.
