# Feed Plugin Parity

Audit of the FEED timeline between the TypeScript/MoonBit app at `/tmp/omni-develop`
(branch `develop`, commit `1e9d5a3`) and the Gleam rewrite at
`/home/spiralnights/code/omni` (branch `gleam-rewrite`).

**Audit window note.** This audit began at NEW commit `9983d42`. While it was running,
three commits landed that directly target the user-reported symptoms:

| Commit | Title | Relevance |
|---|---|---|
| `500eeb1` | Restore generated gradient profile avatars across profiles and feed | avatar regression |
| `3f243f9` | Remove duplicate Following/Global/Replies controls from the feed | duplicate filter buttons |
| `4aa7851` | Keep plugin detail views when background refreshes arrive | note click / thread navigation |

The report below documents (a) the root cause of each symptom against the pre-fix
baseline (`9983d42`) so the analysis is reproducible, and (b) the state at
`4aa7851` (current HEAD) so the remaining work is actionable. Line numbers for NEW
files are from `4aa7851` unless otherwise stated. `develop` is quoted with absolute
paths.

## Summary

- **Duplicate filter buttons (fixed in `3f243f9`).** At `9983d42`, `render_feed_tabs`
  rendered the filters twice in a single function: once as a `Tabs` primitive built from
  three `TabItem`s and once as three hand-built `Button`s, both placed in the same row:
  `schema.children([tab_buttons, tabs_primitive])`. There are no other render sites in
  the shell or header; the duplication was entirely inside
  `gleam/plugins/feed/src/plugin/feed/view.gleam`.
- **Broken note click (root cause fixed in `4aa7851`).** The plugin handled the click
  correctly (`open-thread` → `OpenThread` → `ViewThread`), but the host re-navigated the
  active plugin to its stored shell route on *every* shell message. Since a full-page
  app's route is `None`/empty, `view_from_route("")` is `ViewTimeline`, so the next
  streamed schema refresh (every relay event calls `push_views`) reset the thread view.
  `4aa7851` limits route syncing to `page_changed || explicit_open`.
- **Generated avatars (fixed in `500eeb1`).** NEW's `Avatar` schema primitive fell back
  to a bare `<span class="omni-avatar-fallback">` initial. The deterministic artwork
  existed in the OLD app in two places (`getAvatarSvg` in the shell and in the schema
  primitive). `500eeb1` added `gleam/ui/src/omni/ui/avatar.gleam` and wired it into
  `render/text.gleam` and `render/list.gleam`; note-card avatars now render the
  generated SVG when a profile has no picture.
- **The composer and the reply composer are functionally dead (still broken).** Both use
  the `Textarea` primitive, which has no action, no `on_input`, no `on_keydown` and no
  action payload (`gleam/ui/src/omni/ui/render/input.gleam:267-290`). Typing never
  reaches `SetComposerDraft`/`SetReplyDraft`, so `PublishNote` publishes
  `model.composer_draft == ""` and `PublishReply` publishes `model.reply_draft == ""`.
  OLD used an `Input` whose Enter handler included the current value in the action
  payload (`packages/core/src/schema/components/primitive-elements.ts:1047-1057`).
- **Click handling has no propagation guard (still broken).** OLD `omni-card`/`omni-box`
  ignored clicks that originated on nested interactive controls
  (`primitive-elements.ts:61-76`, `:147-166`). NEW attaches `event.on_click` to the card
  and to its children with no `stopPropagation` (`render/layout.gleam:87`, `:122`;
  `render/input.gleam:110`). Clicking Like/Repost/Reply/Zap, the avatar, the author
  name, or the reply badge *also* triggers the card's `open-thread`.
- **Zap and relay search are wired to effects the web host never drains.** `SendZap`
  queues a `ZapInvoice` effect and `SubmitSearch` queues `Search`, but
  `boot.process_zap_invoices` (`gleam/web/src/omni/web/boot.gleam:730`) and
  `boot.process_searches` (`:869`) are never called from
  `apps/web/src/main.ts`/`shell_boot.mount_shell`; `drain_urls`
  (`shell_boot.gleam:474`) is never called either. The zap dialog stays on
  “Waiting for Lightning invoice”, the relay-search button does nothing, and Pay never
  opens a wallet.
- **The search view is unreachable from the feed UI.** `ViewSearch` can only be entered
  via a `?view=search` route (`model.gleam:66-84`) or by typing in a search input; the
  only search input lives inside the search view. Timeline/tabs have no search entry
  point, and the shell `page_url` drops the plugin route (`shell_boot.gleam:196-203`).
- **No thread fetching, no deep links.** OLD subscribed to `ids=[focal]` and
  `#e=[focal]` when opening a thread and pushed a page/history frame. NEW opens the
  thread purely from notes already in memory (`model.gleam:191-207`), ignores
  `PageDeclaration.url` in the renderer (`render.gleam:27-30`), and cannot represent a
  thread in the browser URL.
- **The feed is fed by one global relay subscription, not per-tab author filters.**
  NEW ingests `kinds [1,0,6,7]`, `limit 80`, no authors, for every consumer
  (`shell_boot.gleam:1015-1026`, `:753-762`); Following/Global/Replies are client-side
  filters. There is no targeted `#e` interaction query, so reaction/reply counts only
  reflect events that happen to appear in that 80-event window. OLD ran separate author
  filters and a `#e` interaction query (`/tmp/omni-develop/packages/plugins/feed/feed.mbt:113`,
  `:236`, `:928`).

## Duplicate Filter Buttons

### All render sites

| # | Site | What it rendered | Evidence |
|---|---|---|---|
| 1 | `render_feed_tabs` → `TabItem` list → `schema.tabs(...)` | One `Tabs` tablist with `Following` (`users` icon), `Global` (`globe`), `Replies` (`reply`) | `gleam/plugins/feed/src/plugin/feed/view.gleam:124-149` (current) |
| 2 | `render_feed_tabs` → `tab_buttons` (removed) | A second row of three `Button` nodes with the same three labels | pre-fix `gleam/plugins/feed/src/plugin/feed/view.gleam:140-170` at `9983d42`; removed by `3f243f9` |
| — | `layout/header_actions.gleam` | **No** feed filters. Only app launcher pills, sync indicator, fullscreen, profile | `gleam/shell/src/omni/shell/layout/header_actions.gleam:45-77` |
| — | shell view/schema panels (`layout/main_view.gleam`, `viewport_host.gleam`, `settings/tabs.gleam`) | **No** feed filters | `main_view.gleam:17-40`, `viewport_host.gleam:52-65` |

There was no third site: `rg '"Following"|"Global"|"Replies"'` over `gleam/` only hits
feed `view.gleam` (and unrelated Profiles/UI-test strings). The duplication was the
single function rendering both child trees:

```gleam
// 9983d42, view.gleam:140-146 and :163
let tab_buttons =
  schema.box() |> schema.row |> schema.gap("xs")
  |> schema.children([
    tab_button("Following", "following", active_tab == TabFollowing),
    tab_button("Global", "global", active_tab == TabGlobal),
    tab_button("Replies", "replies", active_tab == TabReplies),
  ])
...
|> schema.children([tab_buttons, tabs_primitive])
```

**Root cause:** a half-finished migration from OLD's hand-built `Button` pair to the new
`Tabs` primitive kept both implementations. OLD rendered exactly one row of two buttons
(`feed.mbt:707-739`, only `Following` and `Global`, `variant: primary` for the active
one). The rewrite added the `Replies` tab (not present in OLD) and built both a `Tabs`
and a button row.

**State at `4aa7851`:** only the `Tabs` primitive remains
(`view.gleam:124-149`), so each filter appears once. Recommended follow-up: keep the
`Tabs` renderer as the only source of truth, and add a regression assertion that the
timeline schema contains exactly one node with `data-tab-id` per tab id.

## Broken Note Navigation

### Root cause (pre-fix trace)

1. Click on the note card/body fires the action built by
   `feed_note_card_config.on_open_note = action_with_id("open-thread", id)`
   (`view.gleam:729-741`); the card and body both carry it (`note_card.gleam:283-325`).
2. The renderer maps the action to the host: `HostedSchemaAction(plugin_id, action)`
   (`viewport_host.gleam:57-63`).
3. Host dispatch calls the plugin: `app.handle_action` → `update.action_to_msg`
   (`update.gleam:176-180`) → `OpenThread` → `Model(..model, view: ViewThread(...))`
   (`update.gleam:45-58`). This part is correct and unit-tested
   (`gleam/plugins/feed/test/plugin_feed_test.gleam:194-199`, `:279-283`).
4. The plugin re-renders the thread card (`view.gleam:201-308`).
5. **Reset:** every *other* shell message went through `boot.dispatch_normal`, which
   unconditionally did `case next_model.active_page { PrimaryApp(plugin_id, route) ->
   app.navigate(unwrap(route, "")) }` (pre-`4aa7851` `gleam/web/src/omni/web/boot.gleam:433-441`).
   The feed app was opened with `route: None`
   (`gleam/shell/src/omni/shell/model.gleam:146`), so this dispatched
   `SelectView(view_from_route(""))` = `SelectView(ViewTimeline)`
   (`model.gleam:66-84`, `main.gleam:33-37`).
6. `push_views` dispatches an `EmbedSchema` message for every builtin app
   (`shell_boot.gleam:1028-1032`). It is called from `ingest_public_event`
   (`:397-416`), `refresh_public_feed` (`:573-597`), relay-status callbacks, profile
   fetches and pull-to-refresh. Therefore the next relay event — typically the next few
   hundred milliseconds — reverted the thread view to the timeline. The click “worked”
   only for a flash.

Commit `4aa7851` fixes this by only calling `app.navigate` when the shell page changed
or the user explicitly opened an app (`boot.gleam:433-448`).

### Remaining navigation gaps (still present at `4aa7851`)

| Problem | Evidence | Impact |
|---|---|---|
| **Click propagation**: card and nested controls all dispatch | `render/layout.gleam:87` (box), `:122` (card), `render/input.gleam:110` (button), `render/text.gleam:80`; no `stopPropagation`/`closest()` guard | Clicking Like/Repost/Zap/Reply or the avatar also fires `open-thread`; clicking the author fires `view_profile` **and** `open-thread`; clicking the "Reply to @x" badge opens the parent and then immediately the current note |
| **No targeted fetch on open** | `OpenThread` only sets state (`update.gleam:45-58`); thread is built from `dict.values(model.notes)` (`model.gleam:191-207`) | A note outside the 80-event global window → “Note not found”; replies from relays never fetched |
| **Page declaration URL ignored** | `PageDeclaration.url` set (`view.gleam:293-308`) but renderer reads only `p.id` (`gleam/ui/src/omni/ui/render.gleam:27-30`) | No `?view=thread&id=…` URL, no shareable/deep-linked thread |
| **Browser history not integrated** | shell `page_url` returns only `?app=<id>` (`shell_boot.gleam:196-203`); `msg_from_url` always `OpenApp(plugin_id, None)` (`:215-243`) | Browser Back exits the feed instead of returning to the timeline; no forward/back within a thread |
| **Back button is plugin-local** | `action.navigate_back()` → `NavigateBack` (`view.gleam:202-213`, `update.gleam:60`) | Works inside the plugin, but does not touch shell `back_stack` or history |
| **Widget/list click** | `on_click_action: Some(open_act)` (`view.gleam:469-500`) | Same reset issue as above; with `4aa7851` opens thread but not addressable |

OLD behaviour for comparison: `handle_view_thread` stored `active_thread_id` and
subscribed to `{"kinds":[1],"#e":[id],"limit":50}` plus `{"kinds":[1],"ids":[id]}`,
then rendered a dedicated `Conversation Thread` card with a page declaration
`{id:"thread-"+id, url:"?view=thread&id="+id, state:{view:"thread", id}}`
(`/tmp/omni-develop/packages/plugins/feed/feed.mbt:976-1011`, `:537-601`). The OLD
sandbox manager pushed a history frame whenever the schema page id changed, and
restored it on popstate (`packages/core/src/sandbox/sandbox-manager.ts:522-557`).
Integration tests covered both “click into post” and “history popstate back”
(`packages/plugins/feed/test/feed-integration.test.ts:666-763`).

**Recommended fix:** (1) make `Card`/`Box`/`Text` ignore bubbled clicks whose `closest()`
is a button/input/avatar/action box, exactly like `primitive-elements.ts:61-76` — in
Lustre this means a shared click helper that checks `event.target` before dispatching;
(2) implement `OpenThread` as a fetch effect for `ids` + `#e`; (3) teach the renderer/host
about `PageDeclaration.url` and push/replace history on page-id changes.

## Missing Generated Avatars

### OLD algorithm (confirmed)

There are two identical implementations in OLD:

- Shell helper `getAvatarSvg(pubkey, letter)`:
  `/tmp/omni-develop/packages/plugins/shell/src/base-shell.ts:70-130`.
- Schema primitive `getAvatarSvg` + `OmniAvatarElement`:
  `/tmp/omni-develop/packages/core/src/schema/components/primitive-elements.ts:844-923`.

Both are deterministic from the pubkey:

1. **Hash:** `hash = 0; for each char: hash = (hash<<5) - hash + charCodeAt(i); hash |= 0`;
   `seed = abs(hash)`.
2. **Palette:** 16 three-colour harmonies (`stop1` background, `stop2` shadow,
   `accent`), index `seed % 16` (`base-shell.ts:48-86`).
3. **Composition:** two offset circles (`c1_x = 20 + seed%60`,
   `c1_y = 20 + (seed>>4)%60`, `c1_r = 24 + (seed>>8)%16`, colour alternating
   accent/cream; `c2` mirrored across the centre, `r = 20 + (seed>>12)%20`), a curved
   bottom wave (`seed`, `seed>>3`, `seed>>6`), a 47.5-radius cream ring, and the
   **first character of the display name, uppercased** (`letter[0] || "?"`) drawn at
   46 px with a dark stroke (`base-shell.ts:88-127`).
4. **Render:** inline `<svg viewBox="0 0 100 100">` with `rect rx=50` and
   `border-radius: 50%` (`base-shell.ts:113-128`).

`OmniAvatarElement.setProps` **ignores `src`/profile pictures entirely** and always calls
`getAvatarSvg(pubkey||name, name[0])` (`primitive-elements.ts:906-921`). So the OLD feed
showed a deterministic gradient monogram for every author, picture or not. The gradient
*banner* (`getProfileGradientBanner` in
`/tmp/omni-develop/packages/plugins/profile-viewer/src/crypto/gradient.ts:1-33`) is a
separate profile-header feature and was not used by the feed.

### NEW state

- `Avatar` primitive: `gleam/ui/src/omni/ui/render/text.gleam:208-278`. With `src:
  Some(url)` it renders `<img class="omni-avatar-img">` (`:253-260`); with `None` it
  renders `generated_avatar.render(seed_key, initials)` (`:261-273`).
- The generator is `gleam/ui/src/omni/ui/avatar.gleam` (`seed` `:36-44`, 16-palette
  `palette_for` `:62-68`, `render` `:72-…`) — a faithful port of `getAvatarSvg`
  including the wave, ring, opacity and initial.
- Feed note cards pass `src: picture_opt` (`gleam/social_ui/src/omni/social_ui/note_card.gleam:84-97`),
  so generated art shows only when the profile has no `picture`.
- Golden output confirms it renders:
  `gleam/social_ui/test/golden/note_card_readonly.html:5-26` contains a full generated
  `<svg>` with `data-avatar-seed="385498624"`.

**Regression explanation:** before `500eeb1`, `render_avatar`'s `None` branch was
`html.span([class("omni-avatar-fallback")], [element.text(initials)])` (diff of
`500eeb1`). No gradient, no per-pubkey colour — just a letter, which is what users saw.
`500eeb1` restored the artwork. Note the remaining **difference from OLD**: OLD always
showed the generated monogram and never loaded a profile picture in `omni-avatar`; NEW
prefers `profile.picture` and only falls back to generated art. A dead/404 picture URL
therefore yields a blank image because the `<img>` has no `onerror` fallback
(`render/text.gleam:253-260`). If visual identity is the requirement, either restore the
“always generated” behaviour for feed avatars or add an error fallback to the generated
SVG.

`Avatar` is also used by the widget list with `avatar_pubkey` (no URL), which now renders
the generated SVG (`view.gleam:469-500`, `render/list.gleam:158-175`).

## Detailed Differences

### Timeline filter controls

| Aspect | OLD (`develop`) | NEW (`4aa7851`) | Status |
|---|---|---|---|
| Control type | Two `Button`s in a row: `Following`, `Global` | One `Tabs` primitive: `Following`, `Global`, `Replies` | DIFFERENT-VISUAL |
| Order | Following, Global | Following, Global, Replies | EXTRA-IN-NEW |
| Icons | none | `users`, `globe`, `reply` | EXTRA-IN-NEW |
| Badges/counts | none | `badge: None` for all three (`view.gleam:126-137`) | PRESENT-PARITY |
| Active styling | active button `variant: primary`, other `ghost` (`feed.mbt:708-719`) | `omni-tab-active` class + `aria-selected` (`render/input.gleam:428-474`) | DIFFERENT-VISUAL |
| Sync indicator | `status-indicator` “Syncing relays…” while `is_syncing`/`is_loading_older` (`feed.mbt:740-748`) | none | MISSING |
| Location | Timeline card, directly above composer (`feed.mbt:707-739`) | Timeline card, above composer, after composer in children order (`view.gleam:71-77`) | DIFFERENT-VISUAL |
| Duplication | none | Was 2× at `9983d42`; fixed `3f243f9` | PRESENT-PARITY (now) |
| Action | `set-tab` payload `{tab}` (`feed.mbt:722-738`) | `select-tab` with `{tab}` payload (`view.gleam:137`), handled `update.gleam:157-162` | PRESENT-PARITY |

The “Replies” filter is new. OLD had no Replies tab; it displayed replies inline in the
timeline with a “Reply to …” badge (see next section).

### Note card anatomy

OLD card: `render_note_card` `/tmp/omni-develop/packages/plugins/feed/feed.mbt:659-705`;
author helper `:251-338`; actions `:604-657`.
NEW card: `gleam/social_ui/src/omni/social_ui/note_card.gleam:276-326`; author
`:66-126`; actions `:182-241`.

| Element | OLD (file:line) | NEW (file:line) | Status |
|---|---|---|---|
| Card chrome | padding 9/12, margin-bottom 5, `cursor:pointer`, `key/id note-<id>`, card action `view-thread` (`feed.mbt:696-704`) | same padding/margin, `key/id note-<id>`, card action `open-thread`; no explicit `cursor` (CSS class `omni-card-interactive`) (`note_card.gleam:315-325`) | PRESENT-PARITY |
| Avatar | `avatar` primitive, size `sm`; generated SVG always (`feed.mbt:318-327`) | `Avatar` with `src=picture`, generated fallback, size `sm` (`note_card.gleam:84-97`) | DIFFERENT-BEHAVIOR (picture preferred; no img error fallback) |
| Avatar/author action | `view-profile` with `initialNote` payload (`feed.mbt:288-327`) | `view_profile` with `{pubkey}` only (`note_card.gleam:79-82`, `:735`); routed through intent broker | DIFFERENT-BEHAVIOR |
| Display name | `author_name`; unknown → first 8 hex chars (`feed.mbt:1330-1336`) | `profile.best_display_name`: display_name → name → truncated npub (`profile.gleam:198-211`); OLD also fell back to nip05 local-part, NEW does not (`json_helpers.mbt:100-117` vs `profile.gleam:196-211`) | DIFFERENT-VISUAL |
| NIP-05 | not displayed in feed | not displayed; parsed and used only for zap (`profile.gleam:104-115`, `view.gleam:372-390`) | PRESENT-PARITY (not displayed) |
| Timestamp | **not shown** | relative time, e.g. `2h` (`note.gleam:134-161`; `note_card.gleam:73-77`) | EXTRA-IN-NEW |
| Npub | separate `caption/muted` line, `npub1` + first 10 chars + `...` (`feed.mbt:256-283`, `:131-142`) | appended to the same meta line as `2h · npub1k2et...v7lr`; prefix 9 + suffix 4 (`profile.gleam:170-194`; `note_card.gleam:73-77`) | DIFFERENT-VISUAL |
| Reply badge | if `reply_to_id` ≠ "": badge `Reply to @name` / `Reply to npub1…` / `Reply to thread`, action opens parent thread (`feed.mbt:660-678`, `:161-192`) | same copy logic (`note_card.gleam:129-179`), action `view_note(reply_id)` | PRESENT-PARITY (but see click propagation) |
| Content | raw `content` text, `body`, pointer + `view-thread` (`feed.mbt:686-693`) | raw `content` text, `body`, pointer + `open-thread` (`note_card.gleam:295-305`) | PRESENT-PARITY |
| Linkification / mentions / emoji | none | none | PRESENT-PARITY (missing) |
| Media attachments | none | none; `show_inline_media` setting exists but is never consulted by the card (`model.gleam:40-43`, `view.gleam:398-418`); `Text` only emits a `data-inline-images` attribute and does not render media (`render/text.gleam:73-82`) | MISSING (no-op setting) |
| Hashtags | not parsed, not rendered | parsed into `note.hashtags` (`note.gleam:44-48`), used only for search (`model.gleam:154-160`), never rendered | PRESENT-PARITY (not rendered) |
| Quote repost (`q` tag) | appends `nostr:<note1…>` to content when a `q` tag exists (`feed.mbt:1367-1379`) | no `q` tag parsing at all (`note.gleam:30-61`) | MISSING |
| Action bar | reply, repost, like, zap; `justify: between`, `max-width 320px` (`feed.mbt:604-657`) | same four buttons and layout (`note_card.gleam:212-241`) | PRESENT-PARITY |
| Reply button | icon `reply`, count, `tooltip/title "Reply"`, action `view-thread` (`feed.mbt:612-623`) | icon `reply`, count, action `start-reply` (`view.gleam:738`); no tooltip (Button primitive has no tooltip, only IconButton) | DIFFERENT-BEHAVIOR |
| Repost button | icon `repeat`, count, secondary when reposted, `tooltip/title "Repost"` (`feed.mbt:624-636`) | icon `repeat`, count, secondary when `reposted_by_me`; no tooltip (`note_card.gleam:225-231`) | DIFFERENT-BEHAVIOR |
| Like button | icon `heart`, count, secondary when liked, `tooltip/title "Like"` (`feed.mbt:637-649`) | icon `heart`, count, secondary when `liked_by_me`; no tooltip (`note_card.gleam:232-238`) | DIFFERENT-BEHAVIOR |
| Zap button | icon `zap`, label hardcoded `"0"`, action `zap-note` which OLD ignores (`feed.mbt:644-653`, `:1424`) | icon `zap`, label = sats or zap count, action `zap-note` opens a full dialog (`note_card.gleam:207-239`, `view.gleam:515+`) | EXTRA-IN-NEW (zap dialog; see reactions) |

### Note click / thread detail

| Aspect | OLD | NEW | Status |
|---|---|---|---|
| Card click | `view-thread` action on card and on content (`feed.mbt:692`, `:701`) | `open-thread` on card and content (`note_card.gleam:302-305`, `:322-325`) | PRESENT-PARITY (handler) |
| Handler | `handle_view_thread`, accepts `id`/`eventId`, fallback scans notes (`feed.mbt:976-1011`) | `action_to_msg` keys `id/noteId/note_id/eventId` → `OpenThread` (`update.gleam:176-180`) | PRESENT-PARITY |
| State | `active_thread_id` in mutable global state (`feed.mbt:30`, `:1000`) | immutable `view: ViewThread(note_id)` (`model.gleam:32-38`, `update.gleam:45-58`) | PRESENT-PARITY |
| Fetch focal + replies | yes: `#e` limit 50 and `ids` limit 1 subscribe (`feed.mbt:1001-1007`) | none | MISSING |
| Survives background refresh | yes (actions are forwarded straight to plugin; no route reset in `base-shell`) | broken pre-`4aa7851`, fixed by route guard (`boot.gleam:433-448`) | PRESENT-PARITY (now) |
| Nested-control guard | OLD ignores bubbled clicks from buttons/avatar/inner action boxes (`primitive-elements.ts:61-76`, `:147-166`) | none (`layout.gleam:87`, `:122`, `input.gleam:110`) | MISSING |
| Deep link / URL | `?view=thread&id=…` page state; host history push (`sandbox-manager.ts:538-557`) | `PageDeclaration.url` dropped; shell URL is `?app=…` (`render.gleam:27-30`, `shell_boot.gleam:196-203`) | MISSING |
| Browser back | returns to timeline via history frame | exits the feed app | DIFFERENT-BEHAVIOR |
| “Back to Feed” | `back-to-feed` + navigate back (`feed.mbt:549-557`) | `NavigateBack` sets `ViewTimeline` (`view.gleam:202-213`, `update.gleam:60`) | PRESENT-PARITY (plugin-local) |

### Thread / reply view

| Aspect | OLD | NEW | Status |
|---|---|---|---|
| Entry | `active_thread_id` non-empty → `render_thread_view` (`feed.mbt:868-876`) | `ViewThread` → `render_thread_view` (`view.gleam:201-308`) | PRESENT-PARITY |
| Card | `Conversation Thread` card, icon `reply`, `page url ?view=thread&id=` (`feed.mbt:591-600`) | same title/icon/page declaration (`view.gleam:281-308`) | PRESENT-PARITY (URL not honoured) |
| Parent chain | only the focal note shown as parent header + content + divider (`feed.mbt:454-470`); no multi-ancestor chain | full recursive ancestor chain rendered as complete note cards (`thread.gleam:38-70`; `view.gleam:225-231`) | EXTRA-IN-NEW |
| Focal note actions | not rendered; header+content only | full note card with action bar (`view.gleam:232`) | EXTRA-IN-NEW |
| Reply composer | inline row: `input name=replyText` + `Reply` button, action `publish-reply {replyToId}` (`feed.mbt:472-493`) | `Textarea` + `Reply` button, action `publish-reply {parentId}` (`view.gleam:275-311`) — textarea cannot update state (see composer) | DIFFERENT-BEHAVIOR (broken) |
| Replies | direct+nested replies matching `note_is_reply_to`; rendered as compact cards with avatar/name/content (`feed.mbt:495-533`, `:429-451`) | `thread.build_thread` descendants (nested), rendered as full note cards (`thread.gleam:72-110`; `view.gleam:235-243`) | EXTRA-IN-NEW (nesting goes deeper; cards heavier) |
| Empty replies | “No replies yet. Be the first to reply!” (`feed.mbt:536-543`) | same copy | PRESENT-PARITY |
| Loading replies | spinner + “Fetching conversation replies from relays…” when `replies > 0` and not loaded (`feed.mbt:520-535`) | none; always shows “No replies yet” | MISSING |
| Missing focal note | spinner “Loading note…” then “Note not found or deleted.” (`feed.mbt:562-587`) | `EmptyState` “Note not found” (`view.gleam:219-225`) | DIFFERENT-VISUAL |
| Reply publish tags | `["e", parent, "", "reply"]` only (`feed.mbt:1089-1113`) | root + reply + `p` tags (`update.gleam:589-621`) | EXTRA-IN-NEW (NIP-10-correct) |

The thread view inherits the note-card click-propagation bug: in a thread, every card
still carries `open-thread`, so clicking an ancestor/reply re-opens that note as the
focal note (expected), but clicking Like also navigates to that note.

### Composer

| Aspect | OLD | NEW | Status |
|---|---|---|---|
| Field | single-line `input` `composerText`, placeholder “What's on your mind? Broadcast to Nostr…” (`feed.mbt:760-770`) | `textarea` `composerText`, same placeholder (`view.gleam:89-94`) | DIFFERENT-VISUAL |
| State binding | none needed: Enter/button action carries `composerText` value (`primitive-elements.ts:1047-1057`); handler reads `noteText`/`composerText` (`feed.mbt:1070-1087`) | `SetComposerDraft` msg exists (`msg.gleam:15`, `update.gleam:62`) but the textarea emits no action → draft stays `""` (`render/input.gleam:267-290`) | MISSING (broken) |
| Publish | publishes kind 1 immediately (`feed.mbt:1070-1087`) | `publish_note_effect` publishes kind 1; called with empty draft (`update.gleam:66`, `:570-587`) | DIFFERENT-BEHAVIOR (dead) |
| Publish button | “Publish Note”, primary, icon send (`feed.mbt:772-783`) | “Post Note”, primary, icon send (`view.gleam:96-111`) | DIFFERENT-VISUAL |
| Character/byte counter | none | none | PRESENT-PARITY (missing) |
| Reply-to context | thread only; implicit from `active_thread_id` (`feed.mbt:1089-1093`) | thread only; `replying_to` stored but only used by tests (`update.gleam:51`, `view.gleam:275-311`) | PRESENT-PARITY |
| Media attach | none | none (`UploadBlob` effect exists but unused by feed) | PRESENT-PARITY (missing) |
| Emoji picker | none | none | PRESENT-PARITY (missing) |
| Content warning | none | none | PRESENT-PARITY (missing) |
| Drafts | none (state lost on reload) | in-memory only; only `FeedSettings` persisted (`main.gleam:39-67`, `model.gleam:243-263`) | PRESENT-PARITY |
| Error states | none | none; publish failures are invisible (no error field in `Model`) | PRESENT-PARITY (missing) |
| Widget quick composer | `input` + `Post` (`feed.mbt:391-420`) | `Input` with `on_change=set-composer-draft` + `on_enter=publish-note` (`view.gleam:502-545`) | PRESENT-PARITY (this path works) |

**Highest-impact functional bug in the feed:** the timeline composer and thread reply
box are inert. Recommended fix: extend the `Textarea` primitive with
`action_on_change`/`action_on_enter` exactly like `Input`
(`render/input.gleam:233-263`), add the fields to `node.gleam:269-275`, and wire
`set-composer-draft`/`set-reply-draft`/`publish-note`/`publish-reply` in `view.gleam`.

### Pagination / infinite scroll / refresh

| Aspect | OLD | NEW | Status |
|---|---|---|---|
| Load older | “Load More Notes” button, disabled-text “Loading older notes…”, spinner via `loading`; fetches `until = oldest_timestamp - 1`, `limit 20`; appends (`feed.mbt:884-910`, `:957-974`) | “Load More” button, no loading text/state; `visible_limit += page_size` and `FetchUntil(oldest-1)` (`view.gleam:155-176`, `update.gleam:129-141`) | DIFFERENT-BEHAVIOR |
| When button shows | whenever notes exist (always) (`feed.mbt:884-910`) | only when in-memory notes exceed `visible_limit` (`model.gleam:166-170`, `view.gleam:63-66`) | DIFFERENT-BEHAVIOR |
| Fetch scope | same tab's authors + `until`, limit 20 (`feed.mbt:957-974`) | host fetch `kinds [1,6,7]`, `until`, limit 40, no authors (`shell_boot.gleam:539-567`) | DIFFERENT-BEHAVIOR |
| Dedupe | `insert_note_sorted` scans ids, cap 250 (`feed.mbt:1283-1298`) | `dict` keyed by id, no cap (`update.gleam:300-303`) | DIFFERENT-BEHAVIOR (unbounded growth) |
| Infinite scroll | none (button only) | none (button only) | PRESENT-PARITY |
| Pull-to-refresh | full `window.location.reload()` (`base-shell.ts:218-236`) | shell touch gesture ≥72 px → `StartPullRefresh` → `refresh_public_feed` fetch + `push_views` (`pull_to_refresh.gleam:23-80`, `update.gleam:618-624`, `shell_boot.gleam:573-597`) | EXTRA-IN-NEW (better) |
| Auto-refresh on new events | live relay subscription appends notes (`feed.mbt:1436-1454`, `:1301+`) | live subscription `omni_internal_feed` (`shell_boot.gleam:753-762`, `:397-416`), dict upsert | PRESENT-PARITY |
| Tab-scoped refresh | tab switch re-subscribes the correct filter (`feed.mbt:928-955`) | tab switch only changes client-side filter (`update.gleam:41-44`); refresh always fetches global | DIFFERENT-BEHAVIOR |
| Refresh on widget | n/a | `StartPullRefresh` only wired in `mount_shell`; widget lists reuse feed state | PRESENT-PARITY |

The `Load More` gating is a practical regression: a Following feed with 5 notes has no
button and therefore no way to ask relays for older notes. OLD always offered it.

### Reactions

| Aspect | OLD | NEW | Status |
|---|---|---|---|
| Like | local toggle `liked`+count, publishes kind 7 `+` when liking; unlike only decrements locally, no deletion event (`feed.mbt:1014-1040`) | publishes kind 7 `+` on every click; no toggle, no unlike, no local optimistic update (`update.gleam:87-90`, `:623-642`) | DIFFERENT-BEHAVIOR (no toggle) |
| Repost | local toggle `reposted`+count, publishes kind 6 (`feed.mbt:1042-1068`) | publishes kind 6 every click, no toggle (`update.gleam:92-95`) | DIFFERENT-BEHAVIOR |
| Quote repost | appends `nostr:note…` to content when `q` tag (`feed.mbt:1367-1379`) | none | MISSING |
| Counts source | targeted `#e` query kinds `[1,6,7]` limit `5×ids` (`feed.mbt:236-248`) + live kinds 6/7 (`:1181-1216`) | only events in the global `[1,0,6,7] limit 80` stream, folded into `stats` (`shell_boot.gleam:1015-1026`; `update.gleam:284`; `stats.gleam:49-123`) | DIFFERENT-BEHAVIOR |
| Reply count | increments every `e` tag except self on each kind 1 (`feed.mbt:1268-1281`) | increments the NIP-10 reply target only (`stats.gleam:101-104`, `:147-167`) | DIFFERENT-BEHAVIOR (root counts lower) |
| Own state | `liked_by_me` if event pubkey == `my_pubkey` (`feed.mbt:1198-1216`) | `liked_by_me || is_me` (`stats.gleam:66-99`) | PRESENT-PARITY |
| Dedupe of same reaction event | none (increments per delivery) | none (no event-id seen-set in `apply_event`); can increment twice for publish-then-relay-echo and for public + older-fetch subscriptions (`stats.gleam:49-123`, `boot.gleam:979-990`) | DIFFERENT-BEHAVIOR (more exposed) |
| Optimistic update | yes (instant local toggle) | no; count changes only after the signed event is ingested (`update.gleam:87-95`, boot `publish_pending` at `shell_boot.gleam:179`) | MISSING |
| Zap UI | none: button label hardcoded `0`, `zap-note` is a no-op (`feed.mbt:644-653`, `:1424`) | full dialog: presets 21/100/1000, amount/comment, LNURL resolution, invoice state (`view.gleam:515-673`, `zap.gleam`, `update.gleam:372-514`) | EXTRA-IN-NEW |
| Zap execution | n/a | `ZapInvoice` effect never drained by the app (`boot.process_zap_invoices` at `gleam/web/src/omni/web/boot.gleam:730` has no caller); host stuck pending (`update.gleam:445-463`) | DIFFERENT-BEHAVIOR (broken) |
| Pay invoice | n/a | `PayInvoice` emits `OpenUrl("lightning:…")`; `drain_urls` is defined but never called (`shell_boot.gleam:474-480`) | DIFFERENT-BEHAVIOR (broken) |
| Zap receipt counts | none | kind 9735 → `zaps`/`zap_sats` (`stats.gleam:106-115`, `:186-205`) | EXTRA-IN-NEW (display only) |

### Following vs Global vs Replies data sourcing

| Aspect | OLD | NEW | Status |
|---|---|---|---|
| Following subscription | kind 1, authors = self + first 100 follows, limit 40 (`feed.mbt:107-120`) | none; global stream + client filter by `follows` (`model.gleam:118-143`) | DIFFERENT-BEHAVIOR |
| Global subscription | kind 1, limit 40 (`feed.mbt:938-945`) | host global filter `kinds [1,0,6,7]`, limit 80, no authors (`shell_boot.gleam:1015-1026`) | DIFFERENT-BEHAVIOR |
| Replies | no separate tab; replies appear inline with badge | `TabReplies`: all `is_reply` notes, no author restriction (`model.gleam:125-128`); Following/Global hide replies unless `show_replies` is on (`model.gleam:179-186`) | EXTRA-IN-NEW |
| Follows discovery | kind 3 self, limit 1 (`feed.mbt:946-953`), additive `push_unique`, caps authors at 100 but keeps full list | host subscribes self kind 3 (`shell_boot.gleam:839-857`); `follows.from_event` replaces list with latest when it is mine or currently empty (`update.gleam:311-334`; `follows.gleam:20-33`) | DIFFERENT-BEHAVIOR |
| Filtering when no follows | shows everything (`feed.mbt:796-807`) | shows everything (`model.gleam:217-231`) | PRESENT-PARITY |
| Sorting | `insert_note_sorted`, newest first, cap 250 (`feed.mbt:1283-1298`) | sort by `created_at` desc, tie by id; dict no cap (`model.gleam:200-206`) | PRESENT-PARITY |
| Dedupe | linear id scan (`feed.mbt:1319-1321`) | keyed dict (`update.gleam:300-303`) | PRESENT-PARITY |
| Limits / page size | 40 initial, 20 older, 250 stored | 80 global, 40 older, page size 20 client-side, unbounded stored | DIFFERENT-BEHAVIOR |
| NIP-65 hints | none in feed | kernel has `relay_hints` (`gleam/kernel/src/omni/kernel/nostr/relay_hints.gleam`) and coordinator uses it, but feed/older/profile fetches pass `relays: None` (`shell_boot.gleam:539-567`, `:418-468`) | PRESENT-PARITY (no feed-level hints) |
| Relay set | whatever `@nostr.subscribe` uses | host bootstrap + NIP-65 read/write scopes from identity relay list (`boot.apply_relay_list`), not per-author | DIFFERENT-BEHAVIOR |
| Profile hydration | kind 0 batched in 50s, pending queues, localStorage instant cache (`feed.mbt:194-235`, test `feed-integration.test.ts:440-485`) | host fetches missing profiles (`shell_boot.gleam:418-468`), ingests kind 0; feed model has no persistent profile cache, so names only appear after the fetch resolves | DIFFERENT-BEHAVIOR |

Interaction data is incomplete by design in NEW: `queries.interactions_for`
(`gleam/social/src/omni/social/queries.gleam:46-52`) exists but is never called. Notes in
the timeline routinely show `0` likes/reposts/replies unless those events happened to be
inside the global stream.

### Search

| Aspect | OLD | NEW | Status |
|---|---|---|---|
| Search UI | none in the feed (`rg -i search` over `feed.mbt` returns nothing) | `render_search_view`: search input, “Search Relays” button, results (`view.gleam:318-368`) | EXTRA-IN-NEW (implemented) |
| Entry point from feed | n/a | **none**: `ViewSearch` only from `?view=search` route; no search action in timeline/tabs (`model.gleam:66-84`, `view.gleam:47-176`) | MISSING (unreachable) |
| Local search | n/a | case-insensitive substring on content, hashtags, author display name (`model.gleam:145-171`) | EXTRA-IN-NEW |
| Relay search (NIP-50) | n/a | `SubmitSearch` → `Search` effect (`update.gleam:121-127`); host builder `process_searches` (`boot.gleam:869-917`) but **never called** → no NIP-50 request is ever sent | DIFFERENT-BEHAVIOR (dead) |
| Actions | n/a | `search`/`set-search-query` handled (`update.gleam:261-266`), but typing switches view to search as a side effect | EXTRA-IN-NEW |
| Results dedupe | n/a | dict upsert, same store as timeline | PRESENT-PARITY |

### Avatars / profile display in the feed

| Aspect | OLD | NEW | Status |
|---|---|---|---|
| Default avatar | deterministic `getAvatarSvg`: hash → 16-palette → two circles + wave + ring + initial (`base-shell.ts:70-130`; schema duplicate `primitive-elements.ts:844-897`) | deterministic port `ui/avatar.gleam:36-…`, wired in `render/text.gleam:261-273` (`500eeb1`) | PRESENT-PARITY |
| Initial | first char of display name, uppercase, `?` | same (`avatar.gleam:93-98`) | PRESENT-PARITY |
| Picture handling | ignored entirely (`primitive-elements.ts:906-921`) | `<img>` preferred, generated fallback; no `onerror` (`render/text.gleam:253-260`) | DIFFERENT-BEHAVIOR |
| Sizes | xs 22, sm 28, md 38, lg 52, xl 72 (`schema-styles.ts:523-527`) | same CSS in `apps/web/dist/assets/styles/schema.css:707-717`; `render_avatar` uses `data-size`/`omni-avatar-<size>` classes | PRESENT-PARITY |
| Profile banner gradient | `getProfileGradientBanner` exists for profile pages (`profile-viewer/src/crypto/gradient.ts:1-33`) | `avatar.gleam` has a banner gradient (per `04-profiles.md`), not used in feed | PRESENT-PARITY (not a feed feature) |
| NIP-05 badge | none in feed | none in feed | PRESENT-PARITY |
| Profile picture URL optimisation | `getOptimizedImageUrl` via weserv for shell avatars (`base-shell.ts:51-65`) | none for note avatars (`render/text.gleam:253-260`) | MISSING |

### Empty / loading / error states

| Aspect | OLD | NEW | Status |
|---|---|---|---|
| Following, follows exist, no notes | “No notes from followed creators yet” + guidance; spinner while syncing (`feed.mbt:809-866`) | “No notes from followed creators yet” + guidance, no spinner (`view.gleam:208-231`, `note_card.gleam:329-343`) | DIFFERENT-VISUAL |
| Following, follows not loaded | “Connecting to Nostr relays…” + spinner (`feed.mbt:817-820`) | “No timeline notes yet” (`view.gleam:208-216`) | DIFFERENT-BEHAVIOR |
| Following, loaded, zero follows | “No follows found” + guidance (`feed.mbt:825-828`) | same as no-notes branch, no “No follows found” state | MISSING |
| Global empty | “Connecting to Nostr relays…” + spinner (`feed.mbt:830-833`) | “No global timeline notes yet” (`view.gleam:215`) | DIFFERENT-BEHAVIOR |
| Syncing indicator | pulse status “Syncing relays…” in tab bar, `is_syncing`/`is_loading_older` (`feed.mbt:740-748`) | none | MISSING |
| Skeletons | none | none | PRESENT-PARITY |
| Thread loading | spinner “Loading note…” / “Fetching conversation replies…” (`feed.mbt:520-535`, `:562-580`) | none | MISSING |
| Publish errors | none | none | PRESENT-PARITY (missing) |
| Widget empty | list item “Connecting to relays…” (`feed.mbt:363-380`) | same (`view.gleam:445-456`) | PRESENT-PARITY |

### Keyboard shortcuts / menus / misc actions

| Aspect | OLD | NEW | Status |
|---|---|---|---|
| Feed keyboard shortcuts | none (`base-shell` only uses `Escape` to close app context menu, `base-shell.ts:1422-1437`) | none in feed; generic `Input` Enter handling only (`render/input.gleam:250-262`) | PRESENT-PARITY |
| Note more menu | none | none | PRESENT-PARITY |
| Copy note id / nevent | none | none | PRESENT-PARITY |
| Open in nostr.app | none | none | PRESENT-PARITY |
| Mute / report | none | none | PRESENT-PARITY |
| Share / bookmark | none | none | PRESENT-PARITY |
| Context menu | app icon context menu in shell (`base-shell.ts:1384-1440`) | shell settings/app store, no feed note menu | PRESENT-PARITY (not note-level) |
| Compact mode | metric card “Timeline Notes”, count + 30-char preview, route `?view=compact` (`feed.mbt:341-361`) | `view_from_route` maps `compact` to `ViewWidget`; no metric/compact renderer (`model.gleam:75-84`, `view.gleam:420-512`) | DIFFERENT-BEHAVIOR |
| Widget mode | 3 notes, like icon, quick composer (`feed.mbt:363-427`) | 3 notes, like icon, meta time, click opens thread, quick composer with working Input (`view.gleam:420-512`) | EXTRA-IN-NEW |
| Settings view | none in feed (settings were shell-level) | dedicated `?view=settings` with replies/media toggles + page size, persisted via `local_store` (`view.gleam:372-418`, `model.gleam:243-263`) | EXTRA-IN-NEW |

## Prioritized Restoration List

1. **Make the timeline composer and reply composer actually work** — add
   `action_on_change`/`action_on_enter` to the `Textarea` primitive
   (`gleam/protocol/src/omni/protocol/schema/node.gleam:269-275`,
   `gleam/ui/src/omni/ui/render/input.gleam:267-290`) and pass
   `set-composer-draft`/`publish-note` and `set-reply-draft`/`publish-reply` from
   `gleam/plugins/feed/src/plugin/feed/view.gleam:89-122`, `:275-311`. **Effort: M.
   Impact: critical** — posting and replying are currently impossible from the main
   feed UI.
2. **Stop nested clicks from triggering the note card action** — implement the OLD
   `closest("button,input,textarea,avatar,[role=button]")` guard in the shared click
   helper used by `render/layout.gleam:87`, `:122` and `render/text.gleam:80`; or attach
   only one card-level handler and rely on `stopPropagation` in `render/input.gleam:110`.
   **Effort: S/M. Impact: high** — clicking Like/Zap/Reply/avatar currently also opens
   the thread (and the author name opens the profile then the thread).
3. **Fetch on thread open and restore thread loading states** — emit fetch effects for
   `ids=[focal]` and `#e=[focal]` on `OpenThread`, add a `thread_loading`/`thread_loaded`
   field, and render a spinner (“Fetching conversation replies…” / “Loading note…”).
   (`gleam/plugins/feed/src/plugin/feed/update.gleam:45-58`,
   `gleam/plugins/feed/src/plugin/feed/view.gleam:219-243`). **Effort: M. Impact: high** —
   threads currently show “Note not found” or “No replies yet” for anything not already
   in the 80-event stream.
4. **Run the queued host effects for zap and relay search** — call
   `boot.process_zap_invoices` (`gleam/web/src/omni/web/boot.gleam:730`) and
   `boot.process_searches` (`:869`) from the message loop in
   `gleam/interop/src/omni/interop/shell_boot.gleam:168-190`, and call `drain_urls`
   (`:474`) so `PayInvoice` opens the wallet. **Effort: S/M. Impact: high** — the zap
   dialog hangs forever and “Search Relays” is a no-op.
5. **Give search an entry point and honour the thread page URL** — add a search
   button/input to the timeline header (or a keyboard shortcut), and teach the renderer
   and host to consume `PageDeclaration.url`/`state` (push/replace history, restore on
   popstate) as OLD did (`packages/core/src/sandbox/sandbox-manager.ts:538-557`;
   `gleam/ui/src/omni/ui/render.gleam:27-30`;
   `gleam/interop/src/omni/interop/shell_boot.gleam:196-203`). **Effort: M. Impact:
   medium-high** — search is unreachable and threads are not shareable.
6. **Always offer “Load More” and fetch older notes** — render the button whenever the
   notes map is non-empty (or any fetch is possible), not only when
   `dict.size > visible_limit` (`gleam/plugins/feed/src/plugin/feed/model.gleam:166-170`,
   `view.gleam:63-66`), and keep a loading label. **Effort: S. Impact: medium** — a short
   Following feed currently cannot paginate.
7. **Fetch interaction counts with `#e`** — use `queries.interactions_for`
   (`gleam/social/src/omni/social/queries.gleam:46-52`) for visible note ids when notes
   are ingested, as OLD did (`/tmp/omni-develop/packages/plugins/feed/feed.mbt:236-248`),
   and dedupe reaction/repost events by event id in `stats.apply_event`
   (`gleam/social/src/omni/social/stats.gleam:49-123`). **Effort: M. Impact: medium** —
   counts currently show 0 for most notes and can double-count.
8. **Restore reaction toggling** — make `LikeNote`/`RepostNote` toggle based on
   `stats.liked_by_me`/`reposted_by_me`, publish NIP-09 deletions (or at least don’t
   re-publish), and apply an optimistic stats update
   (`gleam/plugins/feed/src/plugin/feed/update.gleam:87-95`, `:623-642`).
   **Effort: M. Impact: medium** — every click adds another like/repost; there is no
   unlike.
9. **Restore the missing empty/loading states** — “No follows found”, sync spinner in the
   tab bar, and the “syncing relays…” status (`view.gleam:124-149`, `:208-231`).
   **Effort: S. Impact: medium** — the user cannot tell whether the feed is still
   loading or genuinely empty.
10. **Add an image error fallback for feed avatars** (generated SVG when the picture
    fails), and consider restoring OLD’s “always generated” identity for feed cards if
    that is the desired visual (`gleam/ui/src/omni/ui/render/text.gleam:253-260`;
    `gleam/social_ui/src/omni/social_ui/note_card.gleam:84-97`). **Effort: S. Impact:
    medium** — dead picture URLs currently produce a blank circle.
11. **Render or remove the inline-media setting** — `show_inline_media` persists but no
    card consults it (`model.gleam:40-43`, `view.gleam:398-418`); either render image /
    video / link-preview attachments or drop the toggle. **Effort: L. Impact: medium.**
12. **Restore compact mode** (`?view=compact` currently maps to the widget view,
    `model.gleam:75-84`) and add the OLD reply-count/root-thread counting semantics if
    parity matters. **Effort: S. Impact: low.**
13. **Deduplicate and cap the note store** — the NEW `dict` is unbounded and the older
    fetch can run repeatedly for the same window; add a max size (OLD used 250) and
    in-flight guards (`gleam/plugins/feed/src/plugin/feed/update.gleam:300-303`,
    `:129-141`). **Effort: S. Impact: low-medium.**

### Deliberately not changed

No source files were modified by this audit; only this report was written. The three
reported symptoms were fixed by `500eeb1`, `3f243f9`, and `4aa7851` while the audit was
running (by a concurrent agent); their analyses above are based on the pre-fix baseline
`9983d42` and verified against the diffs. Remaining items 1–13 are still present at
`4aa7851`.
