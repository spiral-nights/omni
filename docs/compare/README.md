# Omni Gleam Rewrite — Full Parity Audit (develop vs gleam-rewrite)

> Historical analysis snapshot. `docs/10-fix-backlog.md` is the canonical
> backlog; the consolidated lists below are retained for reference only.

Comparison target: `develop` @ `1e9d5a3` (the TypeScript + MoonBit app, checked out read-only at
`/tmp/omni-develop`) versus `gleam-rewrite` (this working tree, Gleam/JS).

Method: eight independent read-only audits, each reading the OLD implementation in full and then
verifying the NEW equivalent by rendering/handling analysis and targeted greps. Every claim in the
detail reports cites `file:line`. Where a feature was absent in OLD too, it is labelled as shared
absence rather than a regression.

| # | Report | Scope |
|---|--------|-------|
| 01 | [01-shell-chrome.md](01-shell-chrome.md) | Header, dock, viewports, shells, back nav, app store, update modal, PWA |
| 02 | [02-shell-settings.md](02-shell-settings.md) | Settings IA, every control, ACL/intents/placements/shells/relays |
| 03 | [03-feed.md](03-feed.md) | Timeline, filters, note cards, thread view, composer, reactions, zaps, search |
| 04 | [04-profiles.md](04-profiles.md) | Directory, profile detail/editor, key custody, generated avatars |
| 05 | [05-secondary-plugins.md](05-secondary-plugins.md) | Relays, Checklist, Notes, Timer, Publisher |
| 06 | [06-icons-and-visuals.md](06-icons-and-visuals.md) | Icon inventory, logo/PWA assets, generated avatars, emoji |
| 07 | [07-core-runtime.md](07-core-runtime.md) | Kernel, store, relay pool, ACL, intents, RPC, sandbox, schema, rich text |
| 08 | [08-styles.md](08-styles.md) | Tokens, palettes, typography, per-shell CSS, responsive, motion |

---

## 1. Executive summary — the 20 most consequential losses

Ordered by user-visible damage, not by file.

1. **Rich text rendering is gone.** Note bodies are emitted with `element.text(content)`, so URLs,
   `[label](url)`, inline `npub`/`nprofile` chips, and `note`/`nevent` quote cards render as raw
   text. This affects every note in feed, threads, profiles and notes (`07 §Rich Content`).
2. **The feed composer and reply box could not accept input.** The `Textarea` primitive had no
   change action, so `PublishNote` always published an empty draft (`03`, `05 Notes`). *(Fixed during
   the audit — see §7.)*
3. **Notes body could not be edited**, for the same reason, and the editor never publishes on
   create/switch/delete/star/tag — only Save publishes (`05 Notes`).
4. **The Timer never counts down.** `Tick` exists in the reducer but no host or plugin ever
   dispatches it; the completion chime is unreachable (`05 Timer`).
5. **Note detail navigation was wiped by background refreshes.** The host re-navigated the active
   plugin to its (empty) stored route on every shell message, and every relay event triggers one, so
   opening a note immediately fell back to the timeline. Same class of bug hit profile drill-down
   (`03`, `04`). *(Fixed during the audit.)*
6. **Guest RPC surface shrank from ~40 methods to 18.** Missing `nostr.subscribe/unsubscribe`,
   `nostr.getRelays`, `intent.*`, `kernel.handleUri`, `kernel.history*`, `ui.*`, `profile.*`,
   `auth.getNpub/getNsec/generateKey`, `blossom.upload`, `http.fetch` (`07 §JSON-RPC`).
7. **`nostr.publish` from the bundled bridge is rejected** (sends `{draft}`, codec requires
   `{event}`), and **`auth.switchKey` silently does not switch the signing key** (`07`).
8. **NIP-44 RPC requests are answered with NIP-04 ciphertext** (`07`).
9. **`intent.dispatch` is a stub**, so all cross-app actions (open note/profile in another app,
   compose, pay) no-op (`07`).
10. **Settings had 11 top-level buttons** (5 fixed + one per installed app) instead of OLD's 3, and
    the per-app controls were split across four tabs instead of one expandable app card (`02`).
11. **Capability governance was reduced to read-only pills** derived from `enabled`; OLD had editable
    grants and a Nostr write-kind grant editor with revocation. Boot grants everything by default
    (`02`).
12. **Shell install/uninstall, curated catalog, and custom shell installer are gone**; only the
    built-ins can be activated (`01`, `02`).
13. **Publisher lost most of the studio**: template zip, URL/naddr import, file inventory, inlined
    bundling, local install, update flow, kind-5 delete, kind-10063 sync, and all persistence — the
    Published tab resets every reload (`05`).
14. **Profiles published Kind 0 with only name/about/picture**, erasing NIP-05, lightning address,
    website and display name, and displayed a hard-coded placeholder pubkey as "you" (`04`).
    *(Metadata preservation and real identity fixed during the audit.)*
15. **Checklist changed its NIP-78 address and JSON shape**, orphaning existing task docs; Notes
    changed NIP-04→NIP-44 and its JSON shape, so old notes are neither decryptable nor decodable
    (`05`).
16. **Zap, relay search, and `PayInvoice` were dead ends**: the effects were queued but the host
    never drained them (`03`). *(Wired during the audit; the push loop bug this introduced was also
    fixed.)*
17. **`Textarea` change action, `Text` action, and card click propagation**: clicks on Like/Zap/
    Reply/avatar bubbled into the card action, opening the thread as a side effect (`03`). *(Fixed
    during the audit.)*
18. **A third built-in shell, "Omni Classic", exists only in the rewrite** and should be removed;
    OLD shipped Editorial + Panorama plus a curated catalog (`01 §Classic`).
19. **Sandbox runtimes shrank from three to one partial.** No WASM host, worker host is built but
    never instantiated, and the guest bridge lost `window.omni`, fetch, geolocation, speech, history/
    Location and scroll shims (`07`).
20. **Per-shell accent identity collapsed**: every shell defaults to sandstone `#d4a373`; accent
    hover/contrast/focus/status are never derived, and the accent is not propagated to document root
    or sandboxes. Editorial light mode was unreachable (duplicate `data-theme-mode`). *(The theme
    attribute and accent restore were fixed; the derivation bundle is still missing.)*

---

## 2. The four reported symptoms

| Report | Root cause (pre-fix) | Current state |
|--------|----------------------|---------------|
| Settings organisation differs; top buttons don't match | 5 static tabs + one tab per app declaring `?view=settings` (6 of 7 default apps) = 11 buttons; per-app controls split across `Apps & Permissions`, `Relays & Scoping`, `Workspace & Viewports` and a dynamic tab | **Reworked** to the OLD 3-section bar (`Appearance & Shells`, `Plugins & Viewports`, `Workspace & Sync`); per-app settings button on each app card; companion viewports moved back under plugins |
| Feed has duplicate following/global/replies buttons | `render_feed_tabs` rendered both a `Tabs` primitive and a hand-built button row in the same container | **Fixed** (one tab bar) |
| Clicking into a note is broken | `boot.dispatch_normal` called `app.navigate(shell_route)` on every message; every relay event calls `push_views`, which re-dispatched `SelectView(view_from_route(""))` = timeline | **Fixed** (route sync only on page change / explicit open), regression test added |
| Profile click navigates away then to the list | Same host re-navigation bug, plus pure `view_from_route` with no history/deep-link support | **Root cause fixed**; deep links, browser history and a profile back button are still missing (`04`) |
| Missing dynamically generated profile icons | `Avatar` fell back to a bare initial; the deterministic SVG existed only in the shell | **Restored** in `gleam/ui/src/omni/ui/avatar.gleam`, wired into avatars and list rows; banner gradient now used on profile detail |
| Remove Omni Classic | New-only third built-in shell | **Documented, not removed** (removal plan in `01 §Classic Shell Removal Notes`) |

---

## 3. Master difference inventory

Each row is a distinct difference. "Status" uses MISSING / DIFFERENT / EXTRA. Detail reports contain
the full per-control and per-row tables.

### 3.1 Shell chrome & layout (`01`)

| Aspect | Difference | Status |
|--------|-----------|--------|
| Header search | OLD `#btn-editorial-search`; NEW has none | MISSING |
| Header actions | OLD settings+profile+fullscreen (and search); NEW settings+fullscreen+profile | DIFFERENT |
| Mobile menu | NEW-only hamburger in Classic; OLD Editorial had none | EXTRA |
| Mobile settings select | OLD `#editorial-settings-mobile-select` | MISSING |
| Dock auto-hide on scroll | OLD `dock-hidden` | MISSING |
| Back-to-top | OLD `#editorial-back-to-top` | MISSING |
| Floating fullscreen exit | OLD button; NEW toggle only | MISSING |
| Escape-key handling | OLD closes fullscreen/settings/modals | MISSING |
| Toasts | OLD intent-enable toast | MISSING |
| App index | OLD grid/ledger toggle, pinned sections, per-app search | DIFFERENT |
| App store curated sections | OLD featured/curated | MISSING |
| Shell manager | OLD install/uninstall/curated/custom; NEW read-only list | DIFFERENT |
| Update modal | OLD zip/html dropzone + URL fetch; NEW confirmation only | MISSING |
| Back stack | OLD NavigationManager (coalescing, dedupe, hydration, history sync); NEW simple list | DIFFERENT |
| Pull-to-refresh | OLD 50 px threshold, 90 px max; NEW 72 px | DIFFERENT |
| PWA | OLD manifest/service worker/install prompt; NEW static shell only | PARTIAL |
| `header-status` slot | OLD slot; NEW absent | MISSING |
| Async/streamed schema refresh | NEW re-navigates plugins (was); fixed | FIXED |

### 3.2 Settings (`02`)

| Aspect | Difference | Status |
|--------|-----------|--------|
| Top-level tabs | OLD 3; NEW was 11 | FIXED/DIFFERENT |
| Per-app grouping | OLD one expandable card per app with placements, custom settings, relay scoping, permissions, write-kinds, intents | DIFFERENT |
| Capability grants | OLD editable toggles + revocation | MISSING |
| Nostr write-kind editor | OLD wildcard/standard/custom/revoke | MISSING |
| Default Applications (intent routing) | OLD per-action defaults or "prompt"; NEW per-app enable only, `defaultIntents` never populated | MISSING |
| Shell install/uninstall/catalog | OLD all three | MISSING |
| Theme mode | OLD Light/Dark/System; NEW Light/Dark, `system` normalised to dark | MISSING |
| Accent presets | OLD per-shell palettes (cobalt / Metro cyan); NEW one warm set | DIFFERENT |
| Accent restore on boot | Was lost | FIXED |
| Plugin search / Expand All | OLD present | MISSING |
| Per-app Update / Clear Storage / Inspect | OLD present | MISSING |
| Multiple placements + viewport/route selects | OLD free-form rows; NEW three fixed toggles + route chips | DIFFERENT |
| Relay scoping custom list | NEW hard-coded to three URLs instead of the configured pool | DIFFERENT |
| Restore workspace from Nostr | OLD button | MISSING |
| Generate new keypair | OLD present | MISSING |
| Deep settings tabs per app | 4 of 6 declare `?view=settings` but fall through to their main view | DIFFERENT |
| Key custody, export nsec, passphrase, accounts, install-from-URL, auto-sync toggle | NEW-only | EXTRA |

### 3.3 Feed (`03`)

| Aspect | Difference | Status |
|--------|-----------|--------|
| Filter controls | OLD Following/Global buttons + "show replies" toggle; NEW three tabs (duplicated, fixed) | DIFFERENT |
| Composer input | Dead (Textarea) | FIXED |
| Reply composer | Dead (Textarea) | FIXED |
| Nested click bubbling | Like/Zap/Reply/avatar also opened the thread | FIXED |
| Thread open | Does not fetch focal event or `#e` replies; shows "not found" for anything outside the 80-event stream | MISSING |
| Thread history/deep link | `PageDeclaration.url` dropped; no popstate restore | MISSING |
| Load more | Only rendered when notes exceed the page limit | DIFFERENT |
| Reaction toggling | Every click re-publishes; no unlike, no NIP-09 | DIFFERENT |
| Interaction counts | Global 80-event stream only; no `#e` query; double counting | DIFFERENT |
| Search | Effect wired during audit, but no header/search entry point on the timeline | PARTIAL |
| Zaps | Dialog + invoice flow existed; host draining was missing | FIXED |
| Compact view | OLD metric card + 30-char preview; NEW maps `compact` to widget, no metric renderer | DIFFERENT |
| Empty/loading states | OLD "No follows found", sync spinner; NEW reduced | DIFFERENT |
| Avatar fallback | Bare initial | FIXED |
| Image error fallback | OLD fell back to the generated SVG; NEW keeps a broken img | MISSING |
| Header/tab counts, sort controls, reaction counters | inspect tables in `03` | DIFFERENT |

### 3.4 Profiles (`04`)

| Aspect | Difference | Status |
|--------|-----------|--------|
| Identity | Placeholder pubkey shown as "you" | FIXED |
| Metadata save | Published only name/about/picture, erasing other fields | FIXED |
| About field | Textarea, not editable | FIXED |
| Gradient banner | OLD deterministic banner per pubkey | FIXED |
| lud16 / website / npub on detail | OLD visible | FIXED (lud16/website); npub still absent |
| Back button / history / deep links | OLD back bar, pushState, popstate | MISSING |
| Follower/following counts | Computed but never rendered | MISSING |
| Following list view | OLD present | MISSING |
| Zap / DM / share / copy npub / mute / report on profile | OLD actions (subset); NEW none | MISSING |
| Editor fields nip05/lud16/website | OLD editable | MISSING |
| Validations | Neither version validates | PARITY |
| NIP-05 verification badge | Neither verifies | PARITY |
| Key switch / generate | OLD auth actions | MISSING |
| Relay backfill/subscriptions | OLD relay-sync.ts | MISSING |
| Note actions/stats on profile timeline | NEW `show_actions: False`, empty stats | DIFFERENT |
| Seeded demo profiles/notes with fake URLs | NEW-only, user-visible fake data | EXTRA |
| Persistence | NEW persists profiles; follows not persisted | DIFFERENT |

### 3.5 Secondary plugins (`05`)

**Relays** — tabs (Connected/Add) MISSING; five presets MISSING; local persistence MISSING; latency/
counters/errors rendered but never populated; own kind-10002 never ingested; read/write scopes,
reconnect, NIP-65 publish, validation banners are NEW-only.

**Checklist** — NIP-78 address `omni/tasks/v1` → `omni/checklist/v1` and JSON shape changed (data
orphaned); sync toggle not honoured on ingest; id sequence jumps; daily reset/streaks/history/
templates/reorder/archive absent in both; NEW adds filters, progress bar, priority, `show_completed`.

**Notes** — body not editable FIXED; autosave/publish-on-leave MISSING; delete tombstone MISSING;
star/archive/tag do not publish MISSING; NIP-04→NIP-44 + JSON shape change (old notes unreadable);
host always NIP-44-decrypts so plaintext docs never ingest; sanitizer regressed from allowlist to
denylist; tag input has no action.

**Timer** — never ticks (critical); default 15→25 min; focus/disk visual mode, ±5 m adjustments and 7
presets lost; chime unreachable.

**Publisher** — no persistence; no template/URL/naddr import; no file inventory/inlined bundling; no
local install; no update flow; no kind-5 delete; no kind-10063 sync; no progress/logs; naddr has no
relay hints; "Queued" recorded before the publish result.

**Cross-plugin** — all view variants (widget/settings/compact) are unreachable because apps open with
`route = None`; `CodeBlock(copyable)` is inert; effect draining is split between `boot` and
`shell_boot` and some queues (chimes/relay/urls) are only drained by one of them.

### 3.6 Icons & visual assets (`06`)

* All 62 OLD glyphs are PRESENT-PARITY; NEW adds `menu` and `moon`.
* 11 names referenced by NEW had no glyph (`globe`, `package`, `file`, `code`, `edit`, `send`,
  `image`, `save`, `lock`, `user-check`, `user-plus`) → question-mark fallbacks. *(Glyphs added
  during the audit.)*
* Unknown-name fallback differs (OLD alert circle, NEW help circle).
* Buttons did not re-emit `icon`/`data-icon`, so the CSS that tints reply/repost/like/zap was dead.
  *(Fixed during the audit.)*
* Plugin icon channels lost: OLD accepted raw SVG, image URL/data URI, emoji and aliases; NEW accepts
  only a library name, so community plugin icons fall back to a generic glyph.
* PWA assets are intact (`apps/web/public/*` identical), `assets/` itself is CSS-only.
* OLD shipped color emoji in shell code (🎨 📦 🎉 ✨); NEW has none.
* Sizing: OLD used 10/11/13/36 px in places; NEW range is 12–32.

### 3.7 Core runtime (`07`)

| Area | Regression |
|------|-----------|
| Rich text | Linkification, `[label](url)`, inline npub/nprofile chips with names, note/nevent quote cards, naddr chips — all missing (OLD had these; Markdown/hashtags/OG were absent in both) |
| RPC | ~22 methods absent (subscribe/unsubscribe/getRelays, intents, handleUri, history, ui, profile, auth, blossom, http, system) |
| RPC correctness | NIP-44 answers with NIP-04; `auth.switchKey` no-op; `nostr.publish` contract mismatch; `intent.dispatch` stub |
| Relay pool | Ahead on NIP-42/OK/CLOSED/read-write scopes; lost per-instance `allowedRelays`; coordinator lost the 2.5 s EOSE fallback |
| ACL | Capability list reduced; no manifest auto-grants/trust; uninstall does not revoke or clear storage |
| Intents | No handler execution, no NIP-89 discovery, `default_intents` ignored |
| Sandbox | No WASM host; worker host never instantiated; guest shims for fetch/history/geolocation/speech/scroll/`window.omni` missing |
| Schema renderer | Component coverage mostly intact; `PageDeclaration`/`navigate` not honoured; auto load-more and virtual list missing |
| Store | Compound/tag indexes and time-bounded query planning reduced |
| Plugin resolution | No manifest signature check, no Blossom SHA-256 check, no HTML view/icon discovery; assets always inlined |
| Keystore | Ahead (NIP-44, passphrase, multi-account); passphrase uses `sha256(salt:passphrase)` rather than a KDF |
| Errors | OLD logged every relay/store/sandbox/RPC failure; NEW largely silent |

### 3.8 Design system & CSS (`08`)

* **Rules are not lost**: `editorial.css` and `panorama.css` are near byte-identical ports; `schema.css`
  is a superset. Regressions are in wiring, tokens and markup class names.
* Global `tokens.css` + per-shell overrides created drift (`tokens.gleam` vs `tokens.css`: subtle,
  accent-hover, space-xl, radius-lg, font stack).
* Accent: only `--omni-accent-primary` applied; hover/contrast/focus/status not derived; not painted
  on `documentElement` or sandboxes.
* Light mode: Editorial unreachable (fixed), Panorama inert, Classic (to remove) incomplete.
* System mode removed.
* Emitted-but-unstyled classes: `.omni-tab` vs `.omni-tab-btn` (fixed), `.omni-progress-fill` vs
  `.omni-progress-bar` (fixed), ring/dial progress, `.omni-shell-card`, route chips, relay-scope
  buttons, intent toggles.
* Undefined tokens: `--omni-success/-warning/-error`, `--omni-border-default` (fixed), `--omni-accent`
  typo in classic (fixed).
* Dead CSS: ~62/81 `editorial-*` and ~47/62 `panorama-*` class names are no longer emitted.
* Missing: global `:focus-visible` ring (added), reduced-motion guard for new sheets (added), document
  theme-color/color-scheme painting.

---

## 4. What is explicitly *not* a regression

The audit separated genuine losses from gaps that already existed in `develop`:

* Markdown rendering, hashtag links, custom emoji (kind 30030), content warnings and link/OG previews
  were never in OLD.
* Checklist daily reset, streaks, per-day history, templates, reorder, archive were never in OLD.
* NIP-05 verification: neither version verifies.
* Profile-editor validation: neither validates.
* Feed note-level menus (copy id, open in nostr.app, mute, report, share, bookmark): neither has them.
* Keyboard shortcuts in the feed: neither has them.
* WASM plugins: OLD had a host, but no first-party WASM plugin depends on it today.

---

## 5. Cross-cutting themes

1. **Wiring, not writing.** Several “missing” features exist as pure code with no render call, no
   message handler, or no host drain (Timer `Tick`, zap/search effects, page URLs, view variants,
   `banner_gradient`, `copyable`). A large share of the backlog is connecting existing pieces.
2. **Two hosts, two drain paths.** Effects are drained partly in `boot.gleam` and partly in
   `shell_boot.gleam`; any effect only drained in one place silently stalls depending on entry point.
3. **Schema primitives are the bottleneck.** `Textarea` (no change action), `Text` (no rich content),
   `Button` (no icon attrs), `CodeBlock` (no copy), `PageDeclaration` (unused) each break many plugins
   at once. Fixing the primitive is usually cheaper than fixing every caller.
4. **Data-shape churn without migration.** Checklist and Notes changed both the NIP-78 address and the
   JSON schema, with no dual-read. Publisher and Profiles changed what they persist without fallback.
5. **The shell became plugin-aware in the wrong direction.** The rewrite moved per-app controls into
   shell settings tabs, which multiplied the settings bar and split one app's configuration across
   four places — the opposite of the plugin-agnostic shell mandate.

---

## 6. Consolidated backlog

Deduplicated across the eight reports. Effort S/M/L; impact is user-visible.

### Critical (data loss, unusable features)
1. Rich text + inline Nostr entities in `Text`/note cards — L (`07`)
2. Timer tick loop + chime — S/M (`05`)
3. Notes: publish on create/switch/delete/star/archive/tag + tombstones — S/M (`05`)
4. Notes/Checklist data migration + dual-read (NIP-04, old d-tags, old JSON) — M (`05`)
5. Publisher persistence and relay sync (35129, 10063, kind-5) — M/L (`05`)
6. Guest RPC parity (subscribe/unsubscribe, getRelays, intent.*, auth.*, profile.*) — M (`07`)
7. `nostr.publish` contract, `auth.switchKey`, NIP-44 routing — S (`07`)

### High
8. Feed thread fetch (`ids` + `#e`), loading states, deep links/history — M (`03`)
9. Reaction toggling + NIP-09 + `#e` interaction queries + dedupe — M (`03`)
10. Capability grant editors + write-kind grants + revocation — L (`02`)
11. Default Applications / intent defaults persisted and honoured — M (`02`)
12. Shell install/uninstall + curated/custom catalog — M (`01`,`02`)
13. Settings per-app card composition (placements + settings + scoping + permissions + intents) — L (`02`)
14. System theme mode + document-level theme painting + accent derivation bundle — M (`08`)
15. App-view routes honoured everywhere (dock, app store, widget, deep link, placements) — S/M (`05`)
16. Header search entry point + search view wiring — S (`01`,`03`)
17. WASM host or documented removal; worker host instantiation; guest shims — L (`07`)
18. Intent execution from plugins + NIP-89 discovery — M (`07`)
19. Publisher import/bundling/install/update/delete flows — M/L (`05`)
20. Profiles back navigation, following list, editor fields, key switch/generate — M (`04`)
21. Relays presets/tabs/persistence + live latency/counters + own 10002 ingest — S/M (`05`)
22. Rich sanitizer allowlist parity (notes editor) — M (`05`)
23. Icon channels for plugin icons (SVG/URL/emoji) — M (`06`)

### Medium
24. App index grid/ledger/search; curated app store sections — M (`01`)
25. Update modal file upload + URL fetch — M (`01`)
26. Dock auto-hide, back-to-top, fullscreen exit, Escape handling, toasts, mobile settings select — S each (`01`)
27. Navigation manager parity (coalescing, dedupe, root hydration) — L (`01`)
28. Pull-to-refresh 50/90 px tuning — S (`01`)
29. PWA service worker + install prompt — M (`01`)
30. Event-store compound indexes + query planning — M (`07`)
31. Per-instance `allowedRelays` scoping — M (`07`)
32. EOSE fallback in the coordinator — S (`07`)
33. Uninstall revokes grants and clears storage; manifest auto-grants — M (`07`)
34. Manifest signature + Blossom SHA-256 verification; HTML view/icon discovery — M (`07`)
35. Dead/unstyled CSS classes, focus ring, reduced motion, token reconciliation — S/M (`08`)
36. Timer visual parity (disk, focus mode, presets, custom duration) — M (`05`)
37. Checklist sync toggle + id sequence — S (`05`)
38. `CodeBlock` copy handler — S (`05`)
39. Publisher naddr relay hints + multi-server upload reports — S/M (`05`)
40. Seeds: remove demo profiles/notes or gate them behind a demo flag — S (`04`)

### Low
41. OLD alert-circle fallback for unknown icon names — S (`06`)
42. Avatar opacity string formatting parity (`0.240` vs `0.24`) — S (`06`)
43. Decorative icon ARIA consistency — S (`06`)
44. Logging/user-visible errors at relay/store/sandbox/RPC boundaries — S/M (`07`)
45. Prune or re-wire dead shell CSS — L (`08`)

---

## 7. Repository changes made during the audit

The instruction was analysis; these were committed before that was clarified. Each is self-contained
and revertible.

| Commit | Change |
|--------|--------|
| `500eeb1` | Restore deterministic generated gradient avatars (UI avatar module, list/avatar renderers, shell header delegate) |
| `3f243f9` | Remove the duplicate Following/Global/Replies tab bar |
| `4aa7851` | Stop background schema/relay refreshes from resetting plugin detail views (feed notes, profile drill-down) |
| `d4e9db2` | Restore the 3-section settings layout; per-app settings buttons; accent restore; drop hard-coded Editorial dark attribute |
| `30489ee` | Add `Textarea` change action (composer, reply, notes body, profile bio); stop nested clicks bubbling into cards; add missing icon glyphs; align tab/progress CSS classes; define missing tokens |
| `91f15af` | Feed the real signer pubkey into Profiles; preserve Kind 0 fields on save; profile banner gradient + lud16/website; drain zap/search/URL effects (with loop guard) |

Open item from the interrupted work: **Omni Classic removal was planned and reverted** — the tree is
back at `91f15af` with the shell intact. The removal plan and exact touch points are in
`01-shell-chrome.md §Classic Shell Removal Notes`.
