# Secondary Plugins Parity

Audit of RELAYS, CHECKLIST, NOTES, TIMER and PUBLISHER between the TypeScript reference (`/tmp/omni-develop`, branch `develop`) and the Gleam/JS rewrite (`/home/spiralnights/code/omni`, branch `gleam-rewrite`). Every claim below was checked against the cited lines. Where a feature named in the brief does not exist in the OLD version, that is stated explicitly rather than assumed.

Host context used throughout:
- Built-in apps are started and stored in `/home/spiralnights/code/omni/gleam/web/src/omni/web/builtin.gleam:57-72`.
- Effects are drained in `/home/spiralnights/code/omni/gleam/interop/src/omni/interop/shell_boot.gleam:175-185` (fetch/relay/chime/publish) and separately in `/home/spiralnights/code/omni/gleam/web/src/omni/web/boot.gleam:619-659` (uploads/publish/searches). `take_relay_commands`, `take_chimes` and `take_urls` are **never drained by `boot.gleam`**; only `shell_boot.gleam` handles them (`/home/spiralnights/code/omni/gleam/interop/src/omni/interop/shell_boot.gleam:474-528`).
- Per-app view routes are only applied for the *active* primary app (`/home/spiralnights/code/omni/gleam/web/src/omni/web/boot.gleam:435-441`). Dock, app store, widget grid and deep links open apps with `route = None` (`/home/spiralnights/code/omni/gleam/shell/src/omni/shell/layout/dock.gleam:82`, `/home/spiralnights/code/omni/gleam/shell/src/omni/shell/app_store.gleam:281`, `/home/spiralnights/code/omni/gleam/shell/src/omni/shell/layout/widgets_grid.gleam:57`, `/home/spiralnights/code/omni/gleam/interop/src/omni/interop/shell_boot.gleam:225`). Only header quick-action placements pass a route (`/home/spiralnights/code/omni/gleam/shell/src/omni/shell/layout/header_actions.gleam:113`).
- Embedded plugin schemas are a single tree per app (`/home/spiralnights/code/omni/gleam/web/src/omni/web/boot.gleam:143`, `/home/spiralnights/code/omni/gleam/web/src/omni/web/boot.gleam:448`, `/home/spiralnights/code/omni/gleam/shell/src/omni/shell/layout/viewport_host.gleam:56-66`), so a Sidebar placement shares the active app's last-rendered view.

## Summary

- All five plugins were ported to Gleam and are hosted in-process, but each is materially narrower than its TypeScript reference; none is a full parity port.
- **Timer is non-functional**: the pure `update` handles `Tick` and emits `PlayChime` (`/home/spiralnights/code/omni/gleam/plugins/timer/src/plugin/timer/update.gleam:40-59`), but no host or plugin code ever dispatches `Tick`; there is no interval/scheduler anywhere in the repo. The countdown never advances and the completion chime is unreachable except via an external `complete` action.
- **Notes cannot be edited in the body**: the editor uses `Textarea`, which has no change action field (`/home/spiralnights/code/omni/gleam/protocol/src/omni/protocol/schema/node.gleam:269-275`) and its renderer attaches no `on_input` (`/home/spiralnights/code/omni/gleam/ui/src/omni/ui/render/input.gleam:266-286`). Only title, search and tag inputs emit actions.
- Notes only publishes on explicit **Save**; typing/title changes autosave locally, and selecting another note, creating, deleting, starring, archiving or retagging never publishes (`/home/spiralnights/code/omni/gleam/plugins/notes/src/plugin/notes/update.gleam:29-160`, `/home/spiralnights/code/omni/gleam/plugins/notes/src/plugin/notes/update.gleam:230-250`). OLD autosaved and published 400 ms after each edit and published a deletion tombstone (`/tmp/omni-develop/packages/plugins/notes/src/ui/notes-ui.ts:725-751`, `/tmp/omni-develop/packages/plugins/notes/src/ui/notes-ui.ts:691-711`).
- Notes encryption changed from **NIP-04** (OLD) to **NIP-44** (NEW) with the same `omni/notes/v1/<id>` d-tag prefix but incompatible JSON (`html`→`content`, camelCase→snake_case). Old notes are neither decryptable nor decodable; unencrypted NEW docs are published plaintext but the host always NIP-44-decrypts incoming docs, so they are never ingested (`/home/spiralnights/code/omni/gleam/interop/src/omni/interop/shell_boot.gleam:805-827`).
- Checklist changed its NIP-78 address from `omni/tasks/v1` to `omni/checklist/v1` **and** its JSON shape (`id:number,text,done` → `id:string,title,completed,created_at,priority`), so existing task docs are orphaned (`/tmp/omni-develop/packages/plugins/checklist/src/index.ts:22`, `/tmp/omni-develop/packages/plugins/checklist/src/index.ts:43-48`, `/home/spiralnights/code/omni/gleam/plugins/checklist/src/plugin/checklist/model.gleam:62-90`).
- Checklist still has **no daily reset, timezone handling, streaks, per-day history, templates, reorder or archive** in either version; NEW added filters, a progress bar, per-task priority, `show_completed` and a sync toggle.
- Relays gained real NIP-65 publish, per-relay read/write toggles, reconnect, per-relay status and latency UI, but lost the two-tab Connected/Add structure and all five one-click presets; latency, event counters and error states are rendered but never populated (`/home/spiralnights/code/omni/gleam/web/src/omni/web/builtin.gleam:131-137` passes only `connected` with latency `None`; `/home/spiralnights/code/omni/gleam/plugins/relays/src/plugin/relays/view.gleam:206-221`, `:261-268`).
- Relays no longer persists its list locally and never ingests its own kind-10002 list into the plugin model; NIP-65-discovered relays mutate the host pool only (`/home/spiralnights/code/omni/gleam/web/src/omni/web/boot.gleam:977-997`).
- Publisher lost most of the studio: starter template zip, URL/naddr fetch+install, extracted file inventory, inlined bundling, local install, progress/logs, published-plugin relay sync, NIP-09 delete, kind-10063 server-list publish/sync, update flow, and **all persistence** (no store is passed to the publisher app: `/home/spiralnights/code/omni/gleam/web/src/omni/web/builtin.gleam:179-199`).
- Publisher records a "Queued" published entry locally before any publish outcome and ignores the host's publish result; the Published tab empties on reload because `Model.published` starts `[]` (`/home/spiralnights/code/omni/gleam/plugins/publisher/src/plugin/publisher/model.gleam:99-113`, `/home/spiralnights/code/omni/gleam/plugins/publisher/src/plugin/publisher/update.gleam:367-378`).
- Publisher naddr generation uses **no relay hints** (`/home/spiralnights/code/omni/gleam/plugins/publisher/src/plugin/publisher/update.gleam:330-339`), while OLD used the bootstrap relay set (`/tmp/omni-develop/packages/plugins/publisher/src/blossom/blossom-uploader.ts:642-647`).
- All view variants declared in `config.gleam` (checklist widget/settings, timer widget, notes settings, relay settings, publisher settings) are unreachable from the normal shell navigation because apps are opened with `route=None` and only the active page route is pushed. Timer and Notes additionally ignore the route in their own view functions.
- `notes.start_widget_app` and `timer.start_widget_app` are exported but never referenced outside tests (`/home/spiralnights/code/omni/gleam/plugins/notes/src/plugin/notes/main.gleam:78-93`, `/home/spiralnights/code/omni/gleam/plugins/timer/src/plugin/timer/main.gleam:33-48`).
- `CodeBlock(copyable: true)` is inert: it only emits a `data-copyable` attribute, with no clipboard handler in `gleam/ui` or `gleam/shell` (`/home/spiralnights/code/omni/gleam/ui/src/omni/ui/render/text.gleam:302-330`). OLD copy-naddr called `navigator.clipboard.writeText` (`/tmp/omni-develop/packages/plugins/publisher/src/schema/action-handler.ts:86-97`).
- Notes' sanitizer regressed from a tag **allowlist** (13 tag families) to a **denylist** of 10 container tags: `<img>`, `<table>`, `<video>`, `<input>` (form only is denied), arbitrary `style` attributes, `src`, etc. now survive (`/tmp/omni-develop/packages/plugins/notes/src/editor/sanitizer.ts:6-13`, `/home/spiralnights/code/omni/gleam/ui/src/omni/ui/sanitize.gleam:347-360`, `:424-470`).

---

## Relays

Files: OLD `/tmp/omni-develop/packages/plugins/relays/src/index.ts`; NEW `/home/spiralnights/code/omni/gleam/plugins/relays/src/plugin/relays/{main,model,msg,update,view}.gleam`.

### Views

| View | OLD | NEW | Status |
|---|---|---|---|
| default / `relays` tab | Card "Relay Pool Manager" with tabs (`/tmp/omni-develop/packages/plugins/relays/src/index.ts:125-272`) | `ViewMain`, no tabs: metrics bar, add bar, list of relay cards (`/home/spiralnights/code/omni/gleam/plugins/relays/src/plugin/relays/view.gleam:82-195`) | Partial — structure differs |
| `add` tab | Separate tab with input + 5 presets (`/tmp/omni-develop/packages/plugins/relays/src/index.ts:211-263`) | Add input/button always shown on main; presets absent (`/home/spiralnights/code/omni/gleam/plugins/relays/src/plugin/relays/view.gleam:126-148`) | Missing (tab + presets) |
| `compact` | Metric `Relays = relay count`, subtext pool online (`/tmp/omni-develop/packages/plugins/relays/src/index.ts:114-121`, `:329-339`) | Metric `Relays = connected count`, "n/m Online" (`/home/spiralnights/code/omni/gleam/plugins/relays/src/plugin/relays/view.gleam:32-45`, route at `update.gleam:231-237`) | Partial |
| `widget` | none | Card with status indicator + URL list (`/home/spiralnights/code/omni/gleam/plugins/relays/src/plugin/relays/view.gleam:47-80`) | New, but not declared in config and not routable |
| `settings` | none | falls back to `ViewMain` (`/home/spiralnights/code/omni/gleam/plugins/relays/src/plugin/relays/update.gleam:231-237`); config declares it (`/home/spiralnights/code/omni/gleam/web/src/omni/web/config.gleam:181-188`) | Declared but absent |

### UI inventory

| Feature | OLD (file:line) | NEW (file:line) | Status |
|---|---|---|---|
| Two tabs (Connected / Add) with icons + badge | `/tmp/omni-develop/packages/plugins/relays/src/index.ts:125-135` | absent | Missing |
| Pool metric (count + active subtext) | `:139-150` | `/home/spiralnights/code/omni/gleam/plugins/relays/src/plugin/relays/view.gleam:87-96` | Parity (label "Connected Relays") |
| Pool status indicator, pulsing | `:157-162` | only per-relay; pool-level only in widget `view.gleam:50-63` | Partial |
| Refresh button re-syncing host pool | `:163-169`, `:322-324` | absent | Missing |
| Relay list rows with URL + status subtitle | `:186-209` | relay cards with URL title | Partial |
| Static "Connected (Read / Write)" subtitle | `:192-197` | replaced by toggles | Changed |
| Read toggle | none | `/home/spiralnights/code/omni/gleam/plugins/relays/src/plugin/relays/view.gleam:223-233` | New |
| Write toggle | none | `:234-243` | New |
| Per-relay status dot + label | only pool-level OLD | `:197-204`, `:292-308` | New |
| Latency display | model field only (`/tmp/omni-develop/packages/plugins/relays/src/index.ts:10-14`), never rendered | badge `-- ms` / ms `view.gleam:206-221`; never populated (`builtin.gleam:131-137`) | Rendered, dead |
| Events received/sent stats | none | `view.gleam:261-268`; counters never updated → always 0 | Rendered, dead |
| Per-relay Reconnect button | none | `view.gleam:245-251`; host effect `shell_boot.gleam:517-526` | New, wired |
| Remove relay | icon-button `trash` `:199-207` | text "Remove" button `view.gleam:253-259` | Parity |
| Empty-state banner "0ms Local Offline Mode" + Add action | `/tmp/omni-develop/packages/plugins/relays/src/index.ts:176-184` | info banner without action `view.gleam:170-179` | Partial |
| Add input (placeholder, enter-to-add) | `:218-223` | `view.gleam:126-139` | Parity |
| "+ Add Relay" button | `:224-229` | "Add Relay" `view.gleam:141` | Parity |
| Five preset buttons (Ditto/Damus/Nos.lol/Primal/Nostr.band) | `:22-28`, `:254-260` | absent; `add-preset` also unmapped `update.gleam:147-228` | Missing |
| URL validation error | none (only trim/prefix) `:33-40` | error banner + duplicate check `update.gleam:106-144`, `view.gleam:150-168` | New |
| Publish NIP-65 relay list button | none | `view.gleam:105-124`, effect `update.gleam:83-91` | New |
| Bulk import/export of relay lists | none | none | Neither (brief item not present in OLD) |
| Sort/order controls | none | none | Neither |
| Compact metric | `:114-121` | `view.gleam:32-45` | Parity, different value |
| Widget card | none | `view.gleam:47-80` | New, unreachable |

### Data model & persistence

| Aspect | OLD | NEW |
|---|---|---|
| Defaults | damus, ditto, **nos.lol** (`/tmp/omni-develop/packages/plugins/relays/src/index.ts:16-20`) | damus, ditto, **nostr.band** (`/home/spiralnights/code/omni/gleam/plugins/relays/src/plugin/relays/model.gleam:48-54`); host bootstrap is damus/ditto/nos.lol (`/home/spiralnights/code/omni/gleam/web/src/omni/web/config.gleam:23-29`) |
| Local persistence key | `omni_configured_relays` (`index.ts:42-61`) | none (no store referenced in `/home/spiralnights/code/omni/gleam/plugins/relays/src/plugin/relays/main.gleam:13-37`) |
| Host pool sync | `nostr.relays.list/add/remove`, `nostr.getRelays` (`index.ts:63-111`, `:288-321`) | `RelayCommand` effects (`update.gleam:36`, `:47`, `:58`, `:69`, `:101`, `:138`) applied by `shell_boot.gleam:495-528` |
| Status source | host strings online/connecting/offline (`index.ts:75-86`) | `BuiltinApp.relay_status(url, connected)` → `UpdateRelayState(url, state, None)` (`builtin.gleam:131-137`); no error reason, no latency |
| NIP-65 | none published or consumed | publishes kind 10002 with `["r",url,"read"/"write"]` (`model.gleam:96-111`, `update.gleam:83-91`) |
| NIP-65 ingest | none | host applies own kind-10002 to pool (`boot.gleam:977-997`, subscription `shell_boot.gleam:875-890`) but never into the plugin model |
| Relay status → UI | list rebuilt from host each init/refresh | only matching URL entries updated; NIP-65-added relays never appear |

### Actions end-to-end

| Action | OLD | NEW |
|---|---|---|
| switch-tab | state + pushState (`index.ts:280-287`) | absent (tabs removed) |
| add-relay | normalise, host add, persist (`index.ts:288-306`) | validate, dedupe, append, `RelayAdd` effect (`update.gleam:106-144`); host via `shell_boot.gleam:507-511`. `add-relay` ignores a URL payload and always uses the draft field (`update.gleam:149-158`), unlike OLD which accepted `payload.url` |
| add-preset | host add + persist (`index.ts:288-306`) | not mapped |
| remove-relay | host remove + persist (`index.ts:307-321`) | `RemoveRelay` effect + state (`update.gleam:34-37`); host effect exists |
| refresh-relays | re-read host (`index.ts:322-324`) | absent |
| toggle-read / toggle-write | absent | state + `SetRelayScope` (`update.gleam:39-59`, `:99-104`); wired in `shell_boot.gleam:517-521` |
| reconnect-relay | absent | state `Connecting` + `ReconnectRelay` (`update.gleam:61-70`); wired |
| publish-nip65 | absent | `Publish` kind 10002 (`update.gleam:83-91`); host signs/broadcasts via `boot.gleam:945-963` |
| dismiss-error | absent | `update.gleam:93` |
| URL/enter semantics | enter posted `add-relay` | enter posts `add-relay`; draft updated by `on_change` (`view.gleam:126-139`) |

Gap: relay-pool mutations are applied only by the interop host; the pure web boot never drains `take_relay_commands`, so in that host add/remove/scope/reconnect render state but do not reach the pool.

### Visual / structural

- OLD is tabbed, two screens, one overview bar, flat list rows with icon and trash icon-button. NEW is one long card: metrics (Connected Relays, Events Received) + a NIP-65 button, add row, optional error banner, then one card per relay each with status dot, latency badge, two toggles, Reconnect, Remove, and a received/sent line (`view.gleam:82-290`). NEW is denser but flatter; no per-row icon subtitle, no refresh, no preset row, no empty-state CTA.

---

## Checklist

Files: OLD `/tmp/omni-develop/packages/plugins/checklist/src/index.ts`; NEW `/home/spiralnights/code/omni/gleam/plugins/checklist/src/plugin/checklist/{main,model,msg,update,view}.gleam`.

### Views

| View | OLD | NEW | Status |
|---|---|---|---|
| default/widget | Card "Task List", input + list (`/tmp/omni-develop/packages/plugins/checklist/src/index.ts:194-240`) | `ViewMain`: progress, input, All/Active/Completed tabs, list, footer (`/home/spiralnights/code/omni/gleam/plugins/checklist/src/plugin/checklist/view.gleam:30-143`); `ViewWidget` remains a simpler card (`:162-201`) | Expanded in main; widget parity |
| `settings` | Card "Task List Settings": Total/Completed metrics + Clear button (`index.ts:155-179`) | Card with same metrics plus Sync toggle, Show-completed toggle, default-priority select, Clear button (`view.gleam:203-270`) | Parity plus new controls |
| `compact` | Metric percentage + next pending (`index.ts:181-192`) | same (`view.gleam:145-160`) | Parity |
| route declarations | none | `config.gleam` declares main/widget/settings only (`/home/spiralnights/code/omni/gleam/web/src/omni/web/config.gleam:91-105`); compact absent; Sidebar placement for widget (`:106-112`) | Widget route declared but not reliably routable (see Summary) |

### UI inventory

| Feature | OLD (file:line) | NEW (file:line) | Status |
|---|---|---|---|
| Add-task input (placeholder "Add task...") | `/tmp/omni-develop/packages/plugins/checklist/src/index.ts:205-210` | "Add a new task..." (`view.gleam:88-99`) / "Add task..." in widget (`:169-180`) | Parity |
| "+" add button | `:211-216` | "Add Task" main (`view.gleam:100`), "+" widget (`:181-191`) | Parity |
| Task list with checked state | `:219-237` | `view.gleam:287-305` | Parity |
| Toggle complete | `onCheckAction` `:226` | `on_check_action` `view.gleam:302` | Parity |
| Delete task icon button | `:227-235` | `view.gleam:276-285` | Parity |
| Filter tabs All/Active/Completed with counts | none | `view.gleam:37-61` | New |
| Completion progress bar + label | none | `view.gleam:63-80` | New |
| Footer "n remaining" badge | none | `view.gleam:110-128` | New |
| Clear Completed | settings only (`index.ts:171-176`) | main footer (disabled when 0) and settings (`view.gleam:117-127`, `:245-256`) | Expanded |
| Settings Total/Completed metrics | `index.ts:161-170` | `view.gleam:207-214` | Parity |
| Sync-via-Nostr toggle | none | `view.gleam:216-224` | New |
| Show-completed toggle | none | `view.gleam:226-234` | New |
| Default priority select (low/medium/high) | none | `view.gleam:236-243` | New |
| Per-task priority shown as meta | none | `view.gleam:297` | New |
| Empty state | none (empty list) | "No tasks in this view" (`view.gleam:103-106`) | New |
| Compact metric "Tasks Done/Next" | `index.ts:181-192` | `view.gleam:145-160` | Parity |
| Seed tasks (3: Send Nostr note done, Review Omni PR, Test Focus Timer) | `index.ts:16-20` | `model.gleam:66-90` | Parity (ids/priority differ) |
| Daily reset / timezone / streaks / per-day history | none | none | Neither (not in OLD) |
| Templates / reorder / archive | none | none | Neither |

### Data model & persistence

| Aspect | OLD | NEW |
|---|---|---|
| NIP-78 kind / d-tag | kind 30078, `omni/tasks/v1` (`index.ts:22`, `:43-48`) | kind 30078 (`kind.AppData`), `omni/checklist/v1` (`model.gleam:62-63`, `update.gleam:140-147`) |
| Doc shape | JSON array `{id:number,text,done}` (`index.ts:10-14`) | JSON array `{id:string,title,completed,created_at,priority}` (`model.gleam:194-224`) |
| Encryption | unencrypted (`index.ts:76`) | unencrypted (`model.gleam:283-292`, `update.gleam:140-147`) |
| Transport | `nostr.doc(...)` or raw WebSocket to damus (`index.ts:72-133`) | `Publish` effect via host pool (`update.gleam:136-151`); host ingest of own `d=omni/checklist/v1` (`shell_boot.gleam:789-800`) |
| Merge | remote array replaces local wholesale (`index.ts:78-89`, `:118-126`) | remote array replaces local wholesale (`update.gleam:118-132`) |
| Local storage | `localStorage["tasks"]` (`index.ts:135-151`) | versioned `omni:checklist:tasks` and `omni:checklist:settings` (`model.gleam:260-280`), saved after every update (`main.gleam:54-58`) |
| Sync toggle gate | none (always syncs) | `settings.sync_nostr` gates publishes (`update.gleam:136-139`) but **incoming docs are still ingested** (no gate in `IngestRemoteDoc`) |
| Timestamp/id sequence | `Date.now()` ids (`index.ts:251`) | `task-<n>` ids; after reload the sequence jumps to 100 (`main.gleam:32-37`) |

### Actions end-to-end

| Action | OLD | NEW |
|---|---|---|
| add-task | push, persist, sync (`index.ts:248-254`) | `AddTask` → append + publish (`update.gleam:26-51`); title comes from `draft_title` set by `set-draft-title` input (`view.gleam:88-99`); wired |
| toggle-task | toggle/checked, persist, sync (`index.ts:255-262`) | `ToggleTask` → publish (`update.gleam:53-63`) |
| delete-task | remove, persist, sync (`index.ts:263-270`) | `DeleteTask` → publish (`update.gleam:65-70`) |
| clear-completed | filter, persist, sync (`index.ts:271-275`) | `ClearCompleted` → publish (`update.gleam:72-76`); both views wired |
| set-filter | absent | `SetFilter` from tabs (`update.gleam:179-183`); tabs emit `tab` payload (`/home/spiralnights/code/omni/gleam/ui/src/omni/ui/render/input.gleam:435-441`) |
| toggle-sync-nostr | absent | state only (`update.gleam:84-89`) |
| toggle-show-completed | absent | state only (`update.gleam:91-96`) |
| set-default-priority | absent | select emits value (`view.gleam:236-243`, `update.gleam:98-108`) |
| ingest remote doc | via callback (`index.ts:83-89`, `:118-126`) | `IngestRemoteDoc` (`update.gleam:118-132`), host passes raw content (`shell_boot.gleam:789-800`) |
| switch tab | none | none (filters only) |

### Visual / structural

OLD default is the compact widget card; settings is only reachable by `?view=settings`. NEW main is a full page with progress, tabs and footer, while widget is the old-style card. Order in NEW main: progress → input → filters → list; footer carries remaining count and Clear. Priority appears as list-item meta, not a coloured badge. NEW settings is longer (5 rows) than OLD's 3.

---

## Notes

Files: OLD `/tmp/omni-develop/packages/plugins/notes/src/{index.ts,types.ts,ui/notes-ui.ts,editor/sanitizer.ts,net/notes-sync.ts}`; NEW `/home/spiralnights/code/omni/gleam/plugins/notes/src/plugin/notes/{main,model,msg,update,view}.gleam`.

### Views

| View | OLD | NEW | Status |
|---|---|---|---|
| Main notebook | Single two-pane DOM app (sidebar + editor) mounted into `#root` (`/tmp/omni-develop/packages/plugins/notes/src/index.ts:7-23`, `/tmp/omni-develop/packages/plugins/notes/src/ui/notes-ui.ts:549-615`) | Vertical schema page: header, toolbar, folder tabs, note cards, editor card (`/home/spiralnights/code/omni/gleam/plugins/notes/src/plugin/notes/view.gleam:23-37`) | Partial — layout and controls differ |
| `widget` | none | `view_widget` recent-note rows (`view.gleam:40-63`); `start_widget_app` exists (`main.gleam:78-93`) but is never called | New, dead |
| `settings` | none | not implemented; every route change just resets folder (`main.gleam:32-34`, `:51-53`); config declares "Notes Settings" (`/home/spiralnights/code/omni/gleam/web/src/omni/web/config.gleam:157-165`) | Missing |
| mobile list/editor screens | `isMobileView`, `showing-editor` class, back button (`notes-ui.ts:42-46`, `:713-723`) | none (single responsive column) | Missing |

### UI inventory

| Feature | OLD (file:line) | NEW (file:line) | Status |
|---|---|---|---|
| Brand header "Notes" + New button | `/tmp/omni-develop/packages/plugins/notes/src/ui/notes-ui.ts:552-561` | "Notes" + count badge + "New Note" (`view.gleam:65-95`) | Parity |
| Search box filtering title/body | `:563-565`, `:631-634`, `:753-772` | search input, title/content/tags (`view.gleam:98-110`, `model.gleam:147-158`) | Parity plus tags |
| Note list cards with title/snippet/relative time | `:774-799`, `:850-856` | cards with title/snippet/tags, **no timestamp** (`view.gleam:166-197`) | Partial |
| Rich-text toolbar (B/I/U/S, H1/H2/¶, bullets, numbers, quote, code) | `:580-596`, `:639-655` | absent | Missing |
| Contenteditable body | `:608-612` | `Textarea` (`view.gleam:214-221`) whose renderer never sends changes (`/home/spiralnights/code/omni/gleam/ui/src/omni/ui/render/input.gleam:266-286`) | Broken |
| Title input | `:610` | `view.gleam:199-212` | Parity |
| Word count | `:598-599`, `:824-832` | footer text (`view.gleam:255-260`, `:312-318`) | Parity |
| Sync status chip Saved/Saving/Offline | `:600-603`, `:834-848` | "Unsaved" dirty badge only (`view.gleam:66-69`) | Partial |
| Delete note | `:604`, `:691-711`; confirm + tombstone publish | card trash icon (`view.gleam:194`), immediate, local-only (`update.gleam:89-126`) | Partial / data-loss risk |
| Autosave (400 ms) + publish | `notes-ui.ts:745-750` | explicit Save only (`view.gleam:255-262`, `update.gleam:230-250`) | Missing |
| Star / archive | none | buttons on each card + folder tabs (`view.gleam:185-195`, `:128-148`) | New |
| Folder tabs All/Starred/Archive/tag | none | `view.gleam:128-148`, `model.gleam:125-199` | New |
| Tags add/remove | none | tag input + Add Tag + chips (`view.gleam:223-254`); **Add Tag button carries no payload** so `add_tag` maps to `None` (`update.gleam:365-369`); tag input has no `on_change` so typed text never lands in `draft_tag` (`view.gleam:228-241`) | New but broken |
| Encryption toggle | none (always NIP-04 encrypted) | "Encrypted sync" toggle (`view.gleam:112-120`, `update.gleam:258-263`) | New, receive path broken for plaintext |
| Welcome note | `notes-ui.ts:64-75` | `model.gleam:52-63` | Parity (wording/tags differ) |
| Delete/restore (undo) | delete only, no restore | delete only, no restore | Neither |
| Folders as user-defined folders | none (brief item not in OLD) | tags/star/archive only, no folders | Neither |

### Data model & persistence

| Aspect | OLD | NEW |
|---|---|---|
| Storage key | `omni_notes_app_state_v1` (`notes-ui.ts:5`, `:81-93`) | `omni:notes:notebook` versioned envelope (`main.gleam:15-23`) |
| Note record | `{id,title,html,createdAt,updatedAt,deleted}` (`/tmp/omni-develop/packages/plugins/notes/src/types.ts:1-8`) | `{id,title,content,tags,starred,archived,encrypted,updated_at}` (`model.gleam:22-33`, `:256-290`) |
| Kind / d-tag | 30078, `omni/notes/v1/<id>` (`/tmp/omni-develop/packages/plugins/notes/src/net/notes-sync.ts:3`, `:197-199`) | 30078, `omni/notes/v1/<id>` (`model.gleam:11`, `update.gleam:240`) |
| Encryption | NIP-04 `nip04.encrypt/decrypt` (`notes-sync.ts:189-201`, `:45-57`) | NIP-44 host-side (`update.gleam:243-247`, `boot.gleam:921-942`, decrypt `shell_boot.gleam:805-827`) |
| Plaintext mode | not supported | toggle publishes plaintext (`update.gleam:243-247`) but host always attempts NIP-44 decrypt before ingest (`shell_boot.gleam:805-827`) |
| Merge | per-note by `updatedAt` (`notes-ui.ts:114-128`) | per-note by `updated_at >=` (`update.gleam:453-485`) |
| Delete | tombstone `{deleted:true}` published (`notes-ui.ts:698-702`) | note removed locally, nothing published (`update.gleam:89-126`) |
| Timestamps | `Date.now()` (`notes-ui.ts:734`) | synthetic counter `max(updated_at)+1` seeded at 1.7e9 **seconds**; used as `created_at` (`update.gleam:309-315`, `:238`) |
| Sanitizer | tag allowlist (b,strong,i,em,u,s,strike,del,h1-h6,p,div,span,br,hr,ul,ol,li,blockquote,pre,code,a), only safe `href` kept (`/tmp/omni-develop/packages/plugins/notes/src/editor/sanitizer.ts:6-13`, `:50-62`) | denylist of script/style/iframe/object/embed/applet/meta/link/base/form; unknown tags and many attributes survive (`/home/spiralnights/code/omni/gleam/ui/src/omni/ui/sanitize.gleam:347-360`, `:424-470`) |

### Actions end-to-end

| Action | OLD | NEW |
|---|---|---|
| create note | `notes-ui.ts:671-689` | `CreateNote` → local only (`update.gleam:29-68`); no publish until Save |
| select note | `notes-ui.ts:791-796` | `SelectNote` commits dirty locally (`update.gleam:71-87`, `:267-272`), **no publish** |
| edit title | input handler `notes-ui.ts:636-637` | `input` with name `title` (`view.gleam:199-212`, `update.gleam:395-402`) |
| edit body | input handler `notes-ui.ts:637` | not wired: `Textarea` has no action field / renderer (`node.gleam:269-275`, `input.gleam:266-286`); `SetDraftContent` only from an external `change` action (`update.gleam:359-363`, `:402-406`) |
| delete | confirm + tombstone (`notes-ui.ts:691-711`) | immediate local removal (`update.gleam:89-126`) |
| star / archive | absent | local state only, updated_at bumped (`update.gleam:128-150`) |
| add/remove tag | absent | remove works (payload tag); add button dead and tag input stale (`view.gleam:223-254`, `update.gleam:162-224`) |
| search | `notes-ui.ts:631-634` | input `search` (`view.gleam:98-110`, `update.gleam:407-411`) |
| save/publish | autosave (`notes-ui.ts:745-750`) | `SaveActiveNote` → `PublishEncrypted`/`Publish` (`update.gleam:230-250`); host signs+broadcasts; only action that reaches relays |
| toggle encryption | absent | state + rewrites every note's `encrypted` flag (`update.gleam:258-263`) |
| ingest remote | `handleRemoteNote` (`notes-ui.ts:95-129`) | `IngestRemoteDoc` (`update.gleam:252-256`, `:453-485`) |
| route change | n/a | resets folder only (`main.gleam:32-34`) |

### Visual / structural

OLD is a bespoke two-pane app with editorial typography, CSS-variable theming, serif brand title, formatting toolbar, contenteditable canvas and a sync dot. NEW is a generic schema column capped at 780 px: header, search+encryption row, folder tabs, stacked note cards each with four footer buttons ("Open", star, archive, trash), then an editor card with title input, 12-row textarea, tag input and word count/Save footer. NEW suppresses relative timestamps and HTML formatting UI; OLD has no folder/archive/tag concepts.

---

## Timer

Files: OLD `/tmp/omni-develop/packages/plugins/timer/src/{index.ts,audio/chime.ts,schema/timer-schema.ts,types.ts}`; NEW `/home/spiralnights/code/omni/gleam/plugins/timer/src/plugin/timer/{main,model,msg,update,view}.gleam`.

### Views

| View | OLD | NEW | Status |
|---|---|---|---|
| Standard/shrunk timer | Card "Visual Timer" with status subtitle, header expand action, disk, controls, fine adjust, presets (`/tmp/omni-develop/packages/plugins/timer/src/schema/timer-schema.ts:154-314`) | Column: "Focus Timer", status text, linear progress, big time, presets, custom input, controls, session count (`/home/spiralnights/code/omni/gleam/plugins/timer/src/plugin/timer/view.gleam:20-40`) | Partial |
| Full-screen focus mode (disk 420, controls hidden, tap to shrink) | `timer-schema.ts:61-141`; auto-entered on start (`/tmp/omni-develop/packages/plugins/timer/src/index.ts:60-68`) | absent | Missing |
| `widget` | none | `view_widget` with time/status/progress/start (`view.gleam:43-59`); `start_widget_app` never called (`main.gleam:33-48`), and `view()` ignores routes (`main.gleam:13-20`, `view.gleam:20`) | Missing in practice |
| route declarations | none | config declares main + widget (`/home/spiralnights/code/omni/gleam/web/src/omni/web/config.gleam:127-135`) but `?view=widget` renders the full timer | Declared, ignored |

### UI inventory

| Feature | OLD (file:line) | NEW (file:line) | Status |
|---|---|---|---|
| Circular progress disk with time label and ticks | `timer-schema.ts:172-193` (size 260), `:94-104` (size 420) | linear `Progress` bar only, no label/ticks (`view.gleam:61-65`) | Missing ring |
| Dynamic disk colour by remaining ratio + emerald on completion | `timer-schema.ts:17-46`, `:54` | none (default progress colour) | Missing |
| Status subtitle "Ready/Running/Paused/Time is up" | `timer-schema.ts:146-157` | status label "Ready/Focusing/Paused/Session complete" (`view.gleam:29`, `model.gleam:84-91`) | Partial |
| Start/Pause button (label switches) | `timer-schema.ts:208-215` | Start/Pause/Resume/Restart (`view.gleam:147-169`) | Parity |
| Reset | `:216-222` | `view.gleam:171-183` | Parity |
| Fine adjust −5m/−1m/+1m/+5m | `:226-278`, handler `/tmp/omni-develop/packages/plugins/timer/src/index.ts:101-111` | absent (`adjust-minutes` unmapped, `update.gleam:117-148`) | Missing |
| Presets 5/10/15/20/30/45/60 m, active highlighted | `timer-schema.ts:56`, `:281-312` | 25/5/15/Custom, no active styling (both variants `None`, `view.gleam:80-99`) | Partial |
| Custom minutes input | none | input + Set (`view.gleam:101-134`); **no `action_on_change`** and Enter/Set action carries no payload, so it always applies the stale `custom_minutes` value (`update.gleam:77-93`, `:135-136`) | New, broken |
| Header expand icon-button | `timer-schema.ts:164-169` | absent | Missing |
| Tap disk to expand/shrink | `:103`, `:118`, `:192` | absent | Missing |
| Time-up badge in focus mode | `:120-127` | absent | Missing |
| Sessions-completed counter | none | `view.gleam:36-38`, incremented on Tick/Complete (`update.gleam:40-73`) | New (unreachable via Tick) |
| Ticker every 1 s | `index.ts:20-43` | none anywhere; `Tick` is only dispatchable as an external action (`update.gleam:123`) | Missing — timer never runs |
| Completion chime | WebAudio 3-tone bell, C5/E5/1046.5 Hz (`/tmp/omni-develop/packages/plugins/timer/src/audio/chime.ts:6-44`) | `PlayChime` effect drained by shell host with a 2-tone 880/1174.66 Hz blip (`update.gleam:44-51`, `/home/spiralnights/code/omni/gleam/interop/src/omni/interop/shell_boot.gleam:483-492`, `/home/spiralnights/code/omni/gleam/platform/src/omni/platform/audio.ffi.mjs:1-29`) | Partial (unreachable without Tick) |
| Document-title / OS notification | none | none | Neither (brief item not in OLD) |
| Persistence across reload | none (module-level state, `/tmp/omni-develop/packages/plugins/timer/src/index.ts:10-18`) | none (no store in `main.gleam:13-30`) | Neither |
| Focus-session history | none | counter only, no history | Neither |

### Data model & persistence

| Aspect | OLD | NEW |
|---|---|---|
| Default duration | 15 min (`/tmp/omni-develop/packages/plugins/timer/src/index.ts:11-12`) | 25 min (`/home/spiralnights/code/omni/gleam/plugins/timer/src/plugin/timer/model.gleam:36`, `:39-48`) |
| Presets | 5,10,15,20,30,45,60 (`timer-schema.ts:56`) | 25,5,15,Custom (`model.gleam:51-58`) |
| Custom duration | ±1/±5 minute adjustments only (`index.ts:101-111`) | text input clamped 1-180 min (`model.gleam:111-117`) |
| State | mutable module `timerState` (`types.ts:1-7`) | immutable `Model` (`model.gleam:24-33`) |
| Storage / Nostr | none | none |
| Timer semantics | wall-clock setInterval decrement (`index.ts:20-43`) | pure `Tick` decrement + `PlayChime` (`update.gleam:40-59`) |
| Session counting | none | `completed_sessions` (`model.gleam:31`, `update.gleam:46-51`, `:65-72`) |

### Actions end-to-end

| Action | OLD | NEW |
|---|---|---|
| start-timer | running + focus mode + ticker (`index.ts:60-69`) | `Running` (`update.gleam:20-24`); **no ticker effect** |
| pause-timer | stop ticker (`index.ts:71-75`) | `Paused` (`update.gleam:26-30`) |
| reset-timer | reset + shrink (`index.ts:77-84`) | reset to idle (`update.gleam:38`, `:97-99`) |
| toggle/expand/shrink focus | `index.ts:86-99` | not mapped |
| adjust-minutes | clamp and shift (`index.ts:101-111`) | not mapped |
| set-preset | set duration, stop (`index.ts:113-124`) | `SelectPreset` (`update.gleam:75`, `:101-114`) |
| custom duration | n/a | `SetCustomMinutes` / `ApplyCustomDuration` (`update.gleam:77-93`); UI cannot feed the typed value |
| tick | internal interval | `Tick` message exists, no producer (`update.gleam:40-59`, `:123`) |
| complete | internal | `Complete` message exists, no UI/effect producer (`update.gleam:61-73`, `:124`) |
| chime | direct WebAudio call (`index.ts:37`) | `PlayChime` effect, host `audio.play_chime` (`shell_boot.gleam:483-492`) |

### Visual / structural

OLD centres a 260 px circular disk (420 px in focus mode) with tick marks, dynamic warm-to-cold colour, large time text, then a Start/Reset row, "Fine Adjustments" and "Presets" sections; expanding hides all controls for a distraction-free view. NEW is a flat centred column with a 6 px linear bar, 3 rem time text, one preset row, a custom row, controls and a session count. No full-screen mode, no ticks, no colour transitions, no time-up badge.

---

## Publisher

Files: OLD `/tmp/omni-develop/packages/plugins/publisher/src/*` (index, types, utils, schema/*, zip/zip-engine, state/publisher-store, blossom/blossom-uploader); NEW `/home/spiralnights/code/omni/gleam/plugins/publisher/src/plugin/publisher/{main,model,msg,update,view,bundle}.gleam`.

### Views

| View | OLD | NEW | Status |
|---|---|---|---|
| `create` tab ("Create & Upload") | Dropzone, starter template, URL/naddr installer, extracted files, metadata+packaging, result card, progress, logs (`/tmp/omni-develop/packages/plugins/publisher/src/schema/publisher-schema.ts:49-273`) | `TabStudio`: metadata form, bundle URL/Choose .zip, hash inspector, NIP-5A preview (`/home/spiralnights/code/omni/gleam/plugins/publisher/src/plugin/publisher/view.gleam:153-282`) | Partial |
| `published` tab | Sync from relays, query button, empty state, per-app cards with install/update/delete/copy (`publisher-schema.ts:278-367`) | In-memory list cards only; no actions, no refresh (`view.gleam:284-312`) | Partial / mostly missing |
| `servers` tab | Publish kind-10063, add, list with enable/remove (`publisher-schema.ts:373-440`) | Add + list with enable/remove; no publish 10063 (`view.gleam:314-391`) | Partial |
| `widget`/`compact` | Card metric + active servers + Open Studio (`publisher-schema.ts:456-482`; route `index.ts:33-43`) | Same card, Open = switch internal tab (`view.gleam:31-52`); config declares no widget view (`/home/spiralnights/code/omni/gleam/web/src/omni/web/config.gleam:229-236`) | Partial |
| `settings` route | n/a | declared (`config.gleam:229-236`) but resolves to `TabStudio` (`main.gleam:65-73`, `update.gleam:544-551`) | Declared, absent |

### UI inventory

| Feature | OLD (file:line) | NEW (file:line) | Status |
|---|---|---|---|
| Three tabs with counts/icons | `publisher-schema.ts:31-40` | `view.gleam:59-93` | Parity |
| File dropzone (`input type=file`, accept .zip/.html/.htm/.js) | `:57-63` | local `.zip` picker button only (`view.gleam:195-197`, `update.gleam:111-121`) | Partial |
| "Load Multi-File Starter Template (.zip)" | `:65-77`; template `zip/zip-engine.ts:327-461` | absent | Missing |
| Arbitrary URL/naddr input + Fetch & Inspect + Install from URL | `:87-114`; handler `blossom-uploader.ts:81-169` | bundle zip URL + Load Bundle (`view.gleam:183-203`, `update.gleam:68-109`); no HTML/JS, no naddr, no install | Partial |
| Extracted file list (path, mime, size, sha prefix) | `:119-137` | absent; only entry hash/size inspector (`view.gleam:230-244`) | Missing |
| Metadata: name, id/d-tag, version, description, icon | name/id/version/description `:149-159`; icon auto-detected | name/id/version/description/icon inputs (`view.gleam:156-181`) | Parity (icon now user field) |
| Packaging mode A inlined / B multifile | `:164-177`; inliner `zip-engine.ts:287-326` | absent — always multi-file upload (`update.gleam:292-310`) | Missing |
| Install Locally in Omni (local only) | `:186-190`; `update` legacy `blossom-uploader.ts:703-709` | absent | Missing |
| Upload to Blossom & Publish (NIP-5A) | `:191-196` | `view.gleam:205-216`, `update.gleam:231-379` | Parity |
| Published result card with naddr code block | `:206-241` | only `status_message` banner (`view.gleam:130-148`) and hash inspector | Partial |
| Copy naddr | `:225-230`; clipboard `action-handler.ts:86-97` | CodeBlock `copyable` only; inert (`view.gleam:294-301`, `/home/spiralnights/code/omni/gleam/ui/src/omni/ui/render/text.gleam:302-330`) | Rendered, dead |
| Install / Update in Omni via `nostr:naddr` | `:231-236`, `action-handler.ts:99-107`; also after local publish `blossom-uploader.ts:703-709` | absent | Missing |
| Upload progress bar | `:244-256`; store `publisher-store.ts:509`, `:551-556` | absent | Missing |
| Activity logs (last 15 lines) | `:259-272`; `appendLog` `publisher-store.ts:173-176` | absent | Missing |
| Published tab: description/query relays | `:278-299` | no description/refresh (`view.gleam:284-312`) | Partial |
| Published empty state | `:301-306` | `view.gleam:285-288` | Parity |
| Published per-app Update .zip (prepare-update, version bump) | `:342-349`, `action-handler.ts:122-132` | absent | Missing |
| Published per-app Delete (kind 5 + Blossom DELETE) | `:356-361`, `blossom-uploader.ts:425-499` | absent | Missing |
| Query relays (kind 5/35129/10063/30078 sync) | `:292-297`, `blossom-uploader.ts:171-423` | absent | Missing |
| Servers: publish list kind 10063 | `:386-391`, `blossom-uploader.ts:723-744` | absent | Missing |
| Servers: add input + Add | `:393-412`, `action-handler.ts:147-161` | `view.gleam:315-338`, `update.gleam:389-445` | Parity |
| Servers: enable/disable + remove | `:415-437` | `view.gleam:356-391` | Parity |
| Server status sync from kind 10063 | `blossom-uploader.ts:280-296` | absent | Missing |
| Widget open studio | `publisher-schema.ts:475-480` (`window.open("?view=main")`) | internal tab switch (`view.gleam:44-45`) | Partial |
| Persistence (servers/published/deleted) | `publisher-store.ts:17-101` | none | Missing |
| Code editor | none | none | Neither (brief item not in OLD) |
| Zip export/download | zip writer + starter only (`zip-engine.ts:29-99`, `:327-461`) | none | Missing |

### Data model & persistence

| Aspect | OLD | NEW |
|---|---|---|
| Published record | full `PublishedAppRecord` incl. eventId, pubkey, files, servers, packagingMode, rawEvent (`/tmp/omni-develop/packages/plugins/publisher/src/types.ts:11-31`) | `{id,name,version,description,icon,blossom_sha256,blossom_url,naddr,published_at}` (`model.gleam:16-29`) |
| Manifest kind | 35129 (`blossom-uploader.ts:632-637`) | 35129 (`model.gleam:116-152`, `update.gleam:321-328`, `blossom.nsite_manifest_kind_int` `/home/spiralnights/code/omni/gleam/protocol/src/omni/protocol/blossom.gleam:20`) |
| Manifest tags | `d,name,version,description,icon`, 3 default or manifest-derived `view`, `f` per uploaded file, `server` per active server (`blossom-uploader.ts:600-623`) | `d,name,version,description,icon`, fixed 3 `view`, **`x` entry hash**, `f` per file, `server` per enabled server (`model.gleam:134-151`) |
| Manifest content | inlined bundle, omitted for multi-file or >16 KB uploaded (`blossom-uploader.ts:625-637`) | entry HTML only when no servers configured; otherwise `""` (`update.gleam:312-319`) |
| Inlined bundling | CSS/JS/img inlined (`zip-engine.ts:287-326`) | none |
| naddr relays | bootstrap relays damus/nos.lol/ditto (`blossom-uploader.ts:19-23`, `:642-647`) | `[]` (`update.gleam:330-339`) |
| Blossom servers default | satellite.earth, blossom.primal.net, nostr.download (`publisher-store.ts:11-15`) | same three (`model.gleam:68-82`) |
| Blossom upload | all enabled servers, BUD-06 auth, per-file status (`blossom-uploader.ts:544-592`) | `UploadBlob` per file, host uploads to **first accepting** server only (`update.gleam:292-304`, `/home/spiralnights/code/omni/gleam/kernel/src/omni/kernel/blossom/upload.gleam:12-71`) |
| Server list kind | publishes 10063 and syncs it (`blossom-uploader.ts:723-744`, `:280-296`) | none |
| Deletion | kind 5 + Blossom DELETE + catalog update (`blossom-uploader.ts:425-499`) | none |
| Catalog doc | kind 30078 `plugin-publisher/catalog/v1` {version,updatedAt,publishedApps,deletedAppIds} (`blossom-uploader.ts:18`, `:28-79`) | none |
| Local storage | `omni_publisher_blossom_servers`, `omni_publisher_published_apps`, `omni_publisher_deleted_apps_v1` (`publisher-store.ts:17-19`) | none; model starts with `published: []`, default servers every launch (`model.gleam:99-113`) |
| User pubkey | `nostr.getPublicKey()` per operation, key-change listener (`index.ts:80-82`, `blossom-uploader.ts:180-181`) | captured once at construction (`/home/spiralnights/code/omni/gleam/web/src/omni/web/builtin.gleam:70`, `main.gleam:33-58`); no key-change refresh |

### Actions end-to-end

| Action | OLD | NEW |
|---|---|---|
| switch-tab / select-tab | state + pushState (`action-handler.ts:34-44`) | state only (`update.gleam:36`, `:457-468`) |
| load-starter | builds and extracts starter zip (`action-handler.ts:60-64`) | not mapped |
| file-selected | zip/html/js ingest with hash + metadata (`action-handler.ts:46-58`, `publisher-store.ts:223-356`) | `choose-local-zip` → picker → `BundleLoaded` → zip parse (`update.gleam:111-179`); no single HTML/JS, no metadata extraction |
| fetch-url / install-url | fetch zip/html/naddr, auto-install (`action-handler.ts:66-72`, `blossom-uploader.ts:81-169`) | `load-bundle` only for http(s) zip (`update.gleam:68-109`) |
| set-packaging-mode | inlined/multifile (`action-handler.ts:74-76`) | not mapped |
| install-local | local-only publish (`action-handler.ts:78-80`) | not mapped |
| publish-blossom / publish-package | upload + sign + broadcast + catalog + record (`blossom-uploader.ts:501-721`) | uploads + `Publish` + local record (`update.gleam:231-379`); publish result ignored by plugin |
| copy-naddr | clipboard (`action-handler.ts:86-97`) | not mapped (inert CodeBlock) |
| open-naddr | `window.open("nostr:"+naddr)` (`action-handler.ts:99-107`) | not mapped |
| open-studio | navigate to main (`action-handler.ts:109-116`) | internal tab (`view.gleam:44-45`) |
| refresh-published | relay sync (`action-handler.ts:118-120`) | not mapped |
| prepare-update | prefill + bump version (`action-handler.ts:122-132`) | not mapped |
| delete-app | kind 5 + blobs + catalog (`action-handler.ts:134-141`) | not mapped |
| publish-servers-list | kind 10063 (`action-handler.ts:143-145`) | not mapped |
| add/toggle/remove server | normalise + persist (`action-handler.ts:147-178`) | normalise/validate in state (`update.gleam:198-222`, `:389-445`); **not persisted** |
| dismiss-banner | n/a | `update.gleam:224-227`, `view.gleam:117-143` |

### Visual / structural

OLD is a multi-card studio: dropzone card, installer card, extracted-file card, metadata card, result card, progress card, log card — with progress and activity feedback driven by a store that notifies listeners. NEW is three cards (form, hash inspector, event preview) plus banners. OLD's Published tab is the management surface (install/update/delete/copy/refresh); NEW's is a read-only list of in-memory records. NEW shows a live kind-35129 tag JSON preview, which OLD did not.

---

## Cross-Plugin Gaps

1. **NIP-78 / relay document sync is broadly thinned out.** Notes sync is save-only and one-way in practice (no publish on edit/delete, no plaintext ingest). Checklist sync works but under a new address. Publisher's entire 30078 catalog sync, kind-5 delete sync and kind-10063 server sync are gone. Relays only publishes 10002; it does not ingest it into the UI.
2. **Encryption migration is absent.** Notes moved NIP-04→NIP-44 with no fallback decrypt, no old-field decoder, and the host always tries NIP-44 even for plaintext toggles. Old note events and old `html` field values cannot be recovered.
3. **Document identity/schema migrations are absent.** Checklist `omni/tasks/v1`→`omni/checklist/v1` plus field renames; Notes `html`→`content`/camelCase→snake_case; Publisher store keys eliminated. No migration code path exists in any of the new plugins.
4. **Widget and sub-view variants are unreachable.** `config.gleam` declares widget/settings routes for checklist, timer, notes, relays and publisher, but dock/app-store/widget/deep-link open with `route=None`, only the active app receives navigation, embedded schemas are one tree per app, and `start_widget_app` for notes/timer is never called. Timer and Notes ignore routes outright.
5. **Persistence differs per plugin.** Relays and publisher have no local store at all; checklist and notes use new versioned keys under `omni:` so old localStorage data is not read. Storage is only passed to feed, checklist, notes and profiles (`/home/spiralnights/code/omni/gleam/web/src/omni/web/builtin.gleam:61-69`); timer, relays and publisher get none.
6. **Rendered-but-inert controls**: relays latency/event counters, notes Add Tag/textarea, timer custom minutes, publisher `copyable` code blocks, relays `add-relay` URL payload.
7. **Effect draining is split across two hosts.** Relay commands, chimes and external URLs are only drained in the interop shell; `boot.gleam` drains uploads/publishes/searches but not those, so behaviour depends on which host mounts the app.
8. **Sanitisation model changed** from allowlist to denylist in the shared UI layer, widening what note HTML may carry.
9. **Publisher distribution loop is truncated**: create → upload → publish exists, but install/update/delete/refresh/catalog/server-list flows that made the studio usable are absent.
10. **Default data diverges**: relay bootstrap list (nostr.band vs nos.lol), checklist d-tag, timer default 15→25 min and preset set, notes welcome wording/tags, publisher default draft `example.nsite.app` vs empty fields.

## Prioritized Restoration List

1. **Timer** — add a host-driven tick loop (interval effect or `Async` self-scheduling `Tick`) so start/pause actually counts down; wire `PlayChime` when it hits zero. Where: `/home/spiralnights/code/omni/gleam/plugins/timer/src/plugin/timer/update.gleam:20-59`, host mount in `/home/spiralnights/code/omni/gleam/interop/src/omni/interop/shell_boot.gleam:168-193`. Effort **S–M**. Impact **critical** (feature currently unusable).
2. **Notes editor body** — add `action_on_change` to `Textarea` (node + renderer) or replace with an input that emits, then wire `SetDraftContent`, autosave/debounce, and publish-on-save/leave. Files: `/home/spiralnights/code/omni/gleam/protocol/src/omni/protocol/schema/node.gleam:269-275`, `/home/spiralnights/code/omni/gleam/ui/src/omni/ui/render/input.gleam:266-286`, `/home/spiralnights/code/omni/gleam/plugins/notes/src/plugin/notes/view.gleam:214-221`. Effort **M**. Impact **critical** (notes cannot be written).
3. **Notes data compatibility** — NIP-04 decrypt fallback, accept both `html/content` and camelCase fields, accept plaintext docs when `sync_encrypted=false`, and stop always decrypting in the host. Where: `/home/spiralnights/code/omni/gleam/plugins/notes/src/plugin/notes/model.gleam:270-370`, `/home/spiralnights/code/omni/gleam/interop/src/omni/interop/shell_boot.gleam:782-837`. Effort **M**. Impact **high** (existing notes lost).
4. **Notes delete/commit publishing** — publish tombstones on delete, publish on note switch/create and on star/archive/tag, with confirmation. Where: `/home/spiralnights/code/omni/gleam/plugins/notes/src/plugin/notes/update.gleam:29-160`, `:267-272`. Effort **S–M**. Impact **high** (silent data loss).
5. **Checklist migration** — read `omni/tasks/v1` and old `{id,text,done}` docs, map to new records, then re-publish under `omni/checklist/v1`; also subscribe both d-tags during transition. Where: `/home/spiralnights/code/omni/gleam/plugins/checklist/src/plugin/checklist/model.gleam:62-63`, `:205-224`, `update.gleam:118-132`, host subscription `/home/spiralnights/code/omni/gleam/interop/src/omni/interop/shell_boot.gleam:789-800`. Effort **S–M**. Impact **high** (task data lost).
6. **Publisher persistence + relay sync** — pass a `Storage` store to the publisher app, persist servers/published/deleted; restore the 30078 catalog, kind-35129 ingest, kind-5 tombstones and kind-10063 server sync. Where: `/home/spiralnights/code/omni/gleam/web/src/omni/web/builtin.gleam:179-199`, `/home/spiralnights/code/omni/gleam/plugins/publisher/src/plugin/publisher/{main,model}.gleam`. Effort **M–L**. Impact **high** (Published tab resets every reload).
7. **Publisher import/bundling parity** — starter template zip, single HTML/JS import, URL/naddr fetch, extracted-file inventory and inlined bundling. Where: `/home/spiralnights/code/omni/gleam/plugins/publisher/src/plugin/publisher/bundle.gleam:27-125`, `/home/spiralnights/code/omni/gleam/plugins/publisher/src/plugin/publisher/update.gleam:68-179`, `/home/spiralnights/code/omni/gleam/plugins/publisher/src/plugin/publisher/view.gleam:153-282`. Effort **M–L**. Impact **high**.
8. **Publisher install/update/delete flows** — open `nostr:<naddr>` (install own plugin), prepare-update with version bump, delete with kind-5 + Blossom DELETE, refresh from relays. Where: `/home/spiralnights/code/omni/gleam/plugins/publisher/src/plugin/publisher/update.gleam:454-541`, `view.gleam:284-312`. Effort **M**. Impact **high**.
9. **Publisher naddr relay hints + shared server uploads** — include bootstrap relay hints; upload to all enabled servers or report per-server failures. Where: `/home/spiralnights/code/omni/gleam/plugins/publisher/src/plugin/publisher/update.gleam:285-339`, `/home/spiralnights/code/omni/gleam/kernel/src/omni/kernel/blossom/upload.gleam:40-71`. Effort **S–M**. Impact **medium–high**.
10. **Relays presets, tabs and refresh** — restore the 5 preset buttons (map `add-preset`), persisted configured list, and a refresh that re-reads the host pool. Where: `/home/spiralnights/code/omni/gleam/plugins/relays/src/plugin/relays/{update,view,model}.gleam`. Effort **S–M**. Impact **medium**.
11. **Relays live data** — push latency/error/event counts from `relay_pool.get_statuses` (and actually maintain counters), ingest the user's kind-10002 relays into the plugin list. Where: `/home/spiralnights/code/omni/gleam/web/src/omni/web/builtin.gleam:131-137`, `/home/spiralnights/code/omni/gleam/interop/src/omni/interop/shell_boot.gleam:905-922`, `/home/spiralnights/code/omni/gleam/web/src/omni/web/boot.gleam:977-997`. Effort **M**. Impact **medium**.
12. **Route/view reachability** — pass view routes when opening apps (dock/app store/widget/deep link), render placements with their own view instance or honour placement route before rendering embedded trees; make timer/notes respect `Route.view`. Where: `/home/spiralnights/code/omni/gleam/shell/src/omni/shell/layout/dock.gleam:82`, `/home/spiralnights/code/omni/gleam/shell/src/omni/shell/app_store.gleam:281`, `/home/spiralnights/code/omni/gleam/interop/src/omni/interop/shell_boot.gleam:225`, `/home/spiralnights/code/omni/gleam/plugins/timer/src/plugin/timer/main.gleam:13-20`. Effort **S–M**. Impact **medium** (all declared views currently dead).
13. **Checklist sync settings semantics / id sequence** — gate ingest on `sync_nostr`, and derive the next id from parsed ids rather than jumping to 100. Where: `/home/spiralnights/code/omni/gleam/plugins/checklist/src/plugin/checklist/main.gleam:32-37`, `update.gleam:118-132`. Effort **S**. Impact **low–medium**.
14. **Notes tag UX** — give "Add Tag" a payload and add `on_change` to the tag input; wire star/archive to publish. Where: `/home/spiralnights/code/omni/gleam/plugins/notes/src/plugin/notes/view.gleam:223-254`, `update.gleam:162-224`. Effort **S**. Impact **medium**.
15. **Timer custom duration and preset highlight** — send the typed minutes on change/Enter/Set and mark the active preset. Where: `/home/spiralnights/code/omni/gleam/plugins/timer/src/plugin/timer/view.gleam:80-134`. Effort **S**. Impact **medium**.
16. **Relays `add-relay` payload handling** — honour a URL payload (quick actions/integrations) instead of always using the draft field. Where: `/home/spiralnights/code/omni/gleam/plugins/relays/src/plugin/relays/update.gleam:149-158`. Effort **S**. Impact **low**.
17. **Copy-to-clipboard for CodeBlock** — add the click handler the `data-copyable` markup implies (or restore explicit copy actions). Where: `/home/spiralnights/code/omni/gleam/ui/src/omni/ui/render/text.gleam:302-330`. Effort **S**. Impact **low–medium**.
18. **Sanitizer parity** — restore a tag/attribute allowlist for note content while keeping the new URL checks. Where: `/home/spiralnights/code/omni/gleam/ui/src/omni/ui/sanitize.gleam:193-202`, `:347-360`. Effort **M**. Impact **medium** (security/parity).
19. **Publisher manifest view tags** — derive `view` tags from the bundle's manifest (as OLD did) instead of always emitting main/widget/settings. Where: `/home/spiralnights/code/omni/gleam/plugins/publisher/src/plugin/publisher/model.gleam:134-152`, `bundle.gleam:27-54`. Effort **S**. Impact **low–medium**.
20. **Timer visual parity** — circular disk with ticks/dynamic colour and focus-expand mode; optional time-up badge. Where: `/home/spiralnights/code/omni/gleam/plugins/timer/src/plugin/timer/view.gleam:61-65`. Effort **M**. Impact **medium** (visual identity).
