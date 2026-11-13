# Icons & Visual Assets Parity

Scope: OLD (`/tmp/omni-develop`, TypeScript + MoonBit reference) vs NEW (`/home/spiralnights/code/omni`, Gleam rewrite).

Primary sources:
- OLD map: `/tmp/omni-develop/packages/core/src/schema/icons.ts` (62 icons, `ICON_INNER_SVGS`, `renderSvgIcon`).
- OLD shell wrapper: `/tmp/omni-develop/packages/plugins/shell/src/icons.ts` (`ICONS`, `icon()`, `renderPluginIcon()`).
- NEW map: `/home/spiralnights/code/omni/gleam/ui/src/omni/ui/icons.gleam` (`icon_names()`, `render_icon`, `lookup_icon_children`).

## Summary

- **The 62-icon core set is a byte-for-byte shape port.** Every OLD glyph (`icons.ts:7-68`) reappears in `icons.gleam:149-946` with identical coordinates, order, and stroke conventions. There are **zero OLD-only glyphs**.
- **NEW adds two glyphs OLD never had: `menu` (hamburger, `icons.gleam:219`) and `moon` (crescent, `icons.gleam:321`).** `menu` is actually used (`themes/classic.gleam:90`), `moon` is used by the Dark/Light switch (`settings/shells.gleam:177`), `sun` by the other half (`shells.gleam:178`).
- **The unknown-name fallback changed shape.** OLD `renderSvgIcon` fell back to an alert/info circle (`icons.ts:72`: straight line + dot); NEW falls back to the help-circle question-mark glyph (`icons.gleam:128-145`, `122`). Any unmapped plugin icon therefore looks different.
- **Eleven icon names are referenced by NEW code but have no glyph**: `globe`, `package`, `file`, `code`, `edit`, `send`, `image`, `save`, `lock`, `user-check`, `user-plus`. Six of those (`globe`, `package`, `file`, `code`, `edit`, `send`) were already unmapped in OLD, so only five are new debt — but all eleven currently render as the fallback question mark.
- **`lock` is a genuine NEW-only regression**: `settings/tabs.gleam:306` asks for `lock` for the "Import or Export Key" card; there is no `lock` in the map, so the key-custody card shows a question mark. OLD used the `key` glyph for the same surface (`profile-schema.ts:115`).
- **Widget/action tint attributes are no longer emitted.** NEW CSS (`assets/styles/schema.css:211-292`) colours reply/repost/like/zap by `omni-button[icon="reply"]`, `[data-icon="reply"]`, `[variant="secondary"]`; the Gleam renderer emits only `data-variant`, `data-size`, `data-action` (`ui/render/input.gleam:105-110`) and puts `data-icon` on the **`<svg>`** (`icons.gleam:115`), not the button. So per-action hover colours and the active repost/like tint silently do nothing.
- **Plugin icons lost their non-glyph channels.** OLD `renderPluginIcon` (`shell/src/icons.ts:74-138`) rendered raw SVG strings, image URLs/data URIs, emoji, and `star`/`sparkle`/`rss` aliases; NEW only takes a name string and calls `render_icon`. App tiles/header pills (`layout/dock.gleam:112`, `layout/header_actions.gleam:116`, `app_store.gleam:317`) will show a fallback glyph for image-URL or emoji plugin icons.
- **PWA assets are intact and byte-identical.** `apps/web/public/{icon.svg,icon-192.png,icon-512.png,manifest.webmanifest}` are the same files on both sides (md5 matched); `apps/web/index.html` is identical (`cmp` clean). The claim that NEW has "only CSS in assets/" is true only for the `assets/` stylesheet folder — it is not true for the app.
- **Avatars are ported faithfully; the gradient banner is present but dead.** `avatar.gleam` reproduces `getAvatarSvg` geometry/hash/palette (minor opacity-string formatting drift), and `banner_gradient` (`avatar.gleam:180`) reproduces `getProfileGradientBanner` exactly — but it has **no call sites** and the profiles plugin hard-codes `banner: None` (`plugins/profiles/src/plugin/profiles/model.gleam:137,149,161`), so profile headers have no generated gradient.
- **Zero color emoji in NEW source** (`rg` over `gleam/` and `apps/web/src` returns nothing). OLD violates its own "zero emojis" rule in shipped shell code (see §8).
- **Visual-asset drift outside the icon map is small**: one external plugin ships its own `icon.svg` with `stroke-width="1.8"` (`external-plugins/omni-plugins/weather/icon.svg:1`), and OLD Notes/Editorial shells hand-rolled SVGs at stroke 2/2.2/2.3 bypassing the 1.75 library (`packages/plugins/notes/src/ui/notes-ui.ts:555,574`).

## OLD Icon Inventory

All 62 entries of `ICON_INNER_SVGS` (`/tmp/omni-develop/packages/core/src/schema/icons.ts:7-68`). "Used at" excludes tests. Where an icon is only reachable through the generic schema primitives, the primitive call site is cited.

### Header / nav

| Icon | Depicts | Used at (file:line) |
|---|---|---|
| `arrow-left` | left arrow (line + chevron) | `packages/plugins/shell/src/panorama-shell.ts:530`, `:565`; `packages/plugins/feed/feed.mbt:551` |
| `arrow-up` | up arrow | `packages/plugins/shell/src/panorama-shell.ts:798`; `packages/plugins/shell/src/editorial-shell.ts:2205` |
| `arrow-down` | down arrow | `packages/plugins/feed/feed.mbt:904` |
| `search` | magnifier | `packages/plugins/shell/src/panorama-shell.ts:1977` |
| `more` | horizontal 3-dot overflow (filled dots) | `packages/plugins/shell/src/panorama-shell.ts:807` |
| `windows` | 2×2 unrounded squares (Metro/"start") | **unused** in OLD source (map only) |
| `apps` | 2×2 rounded-square grid | `packages/plugins/shell/src/shell-registry.ts:42`; `panorama-shell.ts:862`; `base-shell.ts:1394`; `editorial-shell.ts:752` |
| `grid` | 2×2 rounded-square grid (alias of `apps`) | `packages/plugins/shell/src/editorial-shell.ts:2118` |
| `layout` | panel layout (rect + top bar + left rail) | `shell-manager-ui.ts:81`, `:148`; `editorial-shell.ts:767`, `:2122`, `:2238` |
| `chevron-down` | down chevron | `permissions-intents-ui.ts:69`; `editorial-shell.ts:2232` |
| `chevron-up` | up chevron | `editorial-shell.ts:1306` |
| `chevron-left` | left chevron | `panorama-shell.ts:790` |
| `chevron-right` | right chevron | `panorama-shell.ts:793`; `editorial-shell.ts:1481` |
| `user` | single bust/head-and-shoulders | `panorama-shell.ts:543`; `profile-viewer/src/schema/profile-schema.ts:55`, `:113`, `:119`; `core/src/schema/components/primitive-elements.ts:1789` |
| `profile` | single bust (alias of `user`) | `panorama-shell.ts:1257` |
| `users` | two busts (people) | `profile-schema.ts:116`, `:710` |
| `close` | X | `panorama-shell.ts:537`, `:673`, `:686`, `:712`, `:743`, `:1079`, `:1083`, `:1095`, `:1546`; `base-shell.ts:1407`; `editorial-shell.ts:2218`, `:2383`; `plugin-update-modal.ts:34`; `primitive-elements.ts:1696` |
| `x` | X (alias of `close`) | **unused** in OLD source (map only) |
| `pin` | push-pin with needle | `panorama-shell.ts:912`, `:920`, `:1079`; `base-shell.ts:1400`; `placements-ui.ts:252` |

### Note actions (feed / profile note cards)

| Icon | Depicts | Used at (file:line) |
|---|---|---|
| `reply` | left-pointing reply arrow with return arc | `packages/plugins/feed/feed.mbt:591`, `:616`; `profile-schema.ts:213` |
| `message` | speech bubble with two lines | `packages/plugins/feed/feed.mbt:397` |
| `repeat` | two arrows in a loop (repost) | `feed.mbt:626`; `profile-schema.ts:221` |
| `repost` | two arrows in a loop (alias of `repeat`) | **unused** (map only) |
| `heart` | heart outline | `feed.mbt:385`, `:636`; `profile-schema.ts:229` |
| `like` | heart (alias of `heart`) | **unused** (map only) |
| `zap` | lightning bolt polygon | `feed.mbt:646`; `profile-schema.ts:237` |
| `bolt` | lightning bolt polygon (alias of `zap`) | `packages/plugins/timer/src/schema/timer-schema.ts:213` |
| `lightning` | lightning bolt polygon (alias of `zap`) | **unused** (map only) |
| `trash` | bin with lid | `checklist/src/index.ts:230`; `relays/src/index.ts:202` |
| `copy` | two overlapping sheets | `primitive-elements.ts:1431`, `:1438` |
| `check` | tick | `checklist/src/index.ts:198`; `publisher-schema.ts:211`; `primitive-elements.ts:1436` |
| `check-circle` | tick inside broken circle | `publisher/src/zip/zip-engine.ts:449`; banner default (`primitive-elements.ts:1655`) |

### Composer

| Icon | Depicts | Used at (file:line) |
|---|---|---|
| `plus` | plus | `panorama-shell.ts:609`, `:1921`, `:2059`; `relays/src/index.ts:130` |
| `upload` | tray + up arrow | `publisher-schema.ts:36`, `:55` |
| `download` | tray + down arrow | **unused** in OLD (map only) |
| `external` | box with out-arrow | **unused** in OLD (map only) |
| `eye` | eye with pupil | **unused** in OLD (map only) |

### Settings

| Icon | Depicts | Used at (file:line) |
|---|---|---|
| `settings` | cog (circle + 12-tooth gear) | `panorama-shell.ts:2015`; `base-shell.ts:1403`; `editorial-shell.ts:783`, `:2075` |
| `sliders` | three vertical faders | `panorama-shell.ts:1087` |
| `key` | key with ring and teeth | `profile-schema.ts:115` |
| `help-circle` | question mark in circle | **fallback only** (`icons.ts:72` fallback uses a different alert glyph; `help-circle` itself is only selectable by name) |

### Relays

| Icon | Depicts | Used at (file:line) |
|---|---|---|
| `relay` | two rack units with dots | **unused** (map only; CSS selectors reference `icon="relay"` nowhere) |
| `relays` | two rack units with dots | `panorama-shell.ts:2047` |
| `server` | two rack units with dots (alias) | `relays/src/index.ts:129`, `:198`, `:270`; `publisher-schema.ts:38`, `:378`, `:421` |

### Checklist

| Icon | Depicts | Used at (file:line) |
|---|---|---|
| `check-circle` | tick in broken circle | `publisher/src/zip/zip-engine.ts:449` |
| `star` | 5-point star | **unused** in OLD (map only) |
| `sparkle` | 4-point sparkle + small satellite | **unused** in OLD (map only) |
| `sparkles` | same as `sparkle` | **unused** in OLD (map only; tests cover alias only) |

### Notes

| Icon | Depicts | Used at (file:line) |
|---|---|---|
| `notes` | document with folded corner + 3 lines | **unused** in OLD (map only; the Notes plugin hand-rolls its own SVGs, see §9) |
| `file-text` | same document glyph | **unused** in OLD (map only) |
| `feed` | speech bubble with two lines | `packages/plugins/feed/feed.mbt:915` |
| `star` | star | unused (see Checklist) |
| `sparkle` / `sparkles` | 4-point sparkle | unused in prod; `renderPluginIcon` maps `star`→`star`, `sparkle`/`sparkles`→`sparkle` (`shell/src/icons.ts:117-118`) |

### Timer

| Icon | Depicts | Used at (file:line) |
|---|---|---|
| `timer` | stopwatch (circle + top buttons) | `timer-schema.ts:158` |
| `clock` | clock face with hands | **unused** in OLD (map only) |
| `move` | 4-way move arrows | `timer-schema.ts:166` |

### Publisher

| Icon | Depicts | Used at (file:line) |
|---|---|---|
| `upload` | tray + up arrow | `publisher-schema.ts:36`, `:55` |
| `download` | tray + down arrow | unused in OLD |
| `external` | out-link box | unused in OLD |
| `eye` | eye | unused in OLD |
| `refresh` | two circular arrows | `publisher-schema.ts:294`; `timer-schema.ts:220`; `pull-to-refresh.ts:37`; `panorama-shell.ts:1091`, `:1939`; `base-shell.ts:1397`; `plugin-update-modal.ts:53` |
| `cloud` | cloud outline | `panorama-shell.ts:2026`; `editorial-shell.ts:2248` |

### Editor / shell chrome

| Icon | Depicts | Used at (file:line) |
|---|---|---|
| `move` | 4-way arrows (drag handle) | `timer-schema.ts:166` |
| `sliders` | fader bank (app "configure") | `panorama-shell.ts:1087` |
| `widgets` | dashboard: wide header + 2 tiles | `panorama-shell.ts:1083`, `:1172`; `app-store-catalog.ts:114`, `:210` |
| `plugins` | puzzle-piece outline | `editorial-shell.ts:2243` |
| `windows` | 2×2 squares | unused |
| `grid` | 2×2 rounded squares | `editorial-shell.ts:2118` |

### Misc / status

| Icon | Depicts | Used at (file:line) |
|---|---|---|
| `spinner` | 9px-radius ring at 0.2 opacity + 90° arc | `editorial-shell.ts:1081`, `:2100`; inline duplicate `base-shell.ts:519` |
| `loader` | identical to `spinner` | **unused** (map only) |
| `bell` | bell with clapper | banner default only (`primitive-elements.ts:1655`) |
| `help-circle` | question-mark circle | only via explicit name / fallback path |
| `sun` | sun disc + 8 rays | only alias `shell/src/icons.ts:122` (`"sunny"`), unused |
| `weather` | sun + cloud composite | unused in OLD shell (weather plugin is NEW-only) |
| `heart` | heart | note actions |
| `message` | speech bubble | `feed.mbt:397` |

## NEW Icon Inventory

`gleam/ui/src/omni/ui/icons.gleam`. `icon_names()` declares 64 canonical names (16-79); aliases share a branch. All geometry below was compared token-by-token against the OLD inner SVG strings.

### Header / nav

| Icon | Depicts | Used at (file:line) |
|---|---|---|
| `arrow-left` | left arrow | `gleam/shell/src/omni/shell/layout/header_actions.gleam:39`; `plugins/feed/src/plugin/feed/view.gleam:209`; `plugins/profiles/src/plugin/profiles/view.gleam:368`, `:462` |
| `arrow-up` | up arrow | **unused** in NEW (`rg` finds only the map entry) |
| `arrow-down` | down arrow | `plugins/feed/src/plugin/feed/view.gleam:163` |
| `search` | magnifier | `shell/app_store.gleam:169`, `:208`; `plugins/notes/.../view.gleam:107`; `settings/intents.gleam` via input; `feed/view.gleam:329` (prefix) |
| `more` | 3 filled dots | **unused** in NEW |
| `menu` | 3 horizontal rules (hamburger) | `shell/themes/classic.gleam:90` |
| `windows` | 2×2 squares | `shell/themes/panorama.gleam:39`; `settings/shells.gleam:44` |
| `apps` | 2×2 rounded squares | `shell/app_store.gleam:193`, `:359`; `settings/permissions.gleam:340`; `web/installer.gleam:354` |
| `grid` | alias of `apps` | **unused** in NEW |
| `layout` | panel layout | `layout/header_actions.gleam:68`; `themes/classic.gleam:39`; `settings/shells.gleam:53`, `:140`; `settings/placements.gleam:85` |
| `chevron-down` | down chevron | **unused** in NEW |
| `chevron-up` | up chevron | **unused** in NEW |
| `chevron-left` | left chevron | **unused** in NEW |
| `chevron-right` | right chevron | `settings/intents.gleam:265` |
| `user` | bust | `settings/tabs.gleam:260`; `plugins/profiles/.../view.gleam:279`, `:320`; `app_store.gleam:79` |
| `profile` | alias of `user` | **unused** in NEW |
| `users` | two busts | `plugins/profiles/.../view.gleam:88`; `feed/view.gleam:130`; `web/config.gleam:202` |
| `close` | X | `ui/render/feedback.gleam:306`; `shell/update_modal.gleam:78`; `settings/intents.gleam:307`; `settings/placements.gleam:315` |
| `x` | alias of `close` | **unused** in NEW |
| `pin` | push-pin | `settings/placements.gleam:172` |
| `help-circle` | question-mark circle | fallback glyph only (`icons.gleam:312` returns `fallback_children()`) |

### Note actions

| Icon | Depicts | Used at (file:line) |
|---|---|---|
| `reply` | reply arrow | `gleam/social_ui/src/omni/social_ui/note_card.gleam:219`; `plugins/feed/.../view.gleam:134`, `:257`, `:295` |
| `message` | speech bubble | `plugins/feed/.../view.gleam:507` |
| `repeat` | repost loop | `social_ui/note_card.gleam:225` |
| `repost` | alias of `repeat` | **unused** in NEW |
| `heart` | heart | `social_ui/note_card.gleam:235`; `feed/view.gleam:446` |
| `like` | alias of `heart` | **unused** in NEW |
| `zap` | bolt polygon | `feed/view.gleam:586`, `:640`, `:666`, `:689` |
| `bolt` | alias of `zap` | `settings/intents.gleam:106`; `settings/placements.gleam:238` |
| `lightning` | alias of `zap` | **unused** in NEW |
| `trash` | bin | `plugins/checklist/.../view.gleam:279`; `settings/permissions.gleam:269` |
| `copy` | overlapping sheets | **unused** in NEW (no copy button glyph anywhere) |
| `check` | tick | `plugins/checklist/.../view.gleam:106`, `:135`, `:196`; `app_store.gleam:273`; `update_modal.gleam:115` |
| `check-circle` | tick in broken circle | `app_store.gleam:49`; `settings/tabs.gleam:552`; `web/config.gleam:88` |

### Composer

| Icon | Depicts | Used at (file:line) |
|---|---|---|
| `plus` | plus | `plugins/notes/.../view.gleam:89`; `app_store.gleam:298`; `settings/permissions.gleam:145` |
| `upload` | tray + up arrow | `plugins/publisher/.../view.gleam:197`, `:210`; `app_store.gleam:89`; `web/config.gleam:226` |
| `download` | tray + down arrow | `plugins/notes/.../view.gleam:141`; `publisher/view.gleam:193`; `app_store.gleam:243`; `update_modal.gleam:55`; `permissions.gleam:121` |
| `external` | out-link box | `plugins/notes/.../view.gleam:187`; `layout/widgets_grid.gleam:61`; `app_store.gleam:284`; `themes/editorial.gleam:133`; `settings/placements.gleam:152` |
| `eye` | eye | **unused** in NEW |

### Settings

| Icon | Depicts | Used at (file:line) |
|---|---|---|
| `settings` | cog | `plugins/feed/.../view.gleam:406` |
| `sliders` | fader bank | `layout/widgets_grid.gleam:93`; `themes/editorial.gleam:101`; `settings/relay_scoping.gleam:169`; `settings/tabs.gleam:596` |
| `key` | key | `plugins/profiles/.../view.gleam:245`, `:472`; `settings/relay_scoping.gleam:186`; `settings/permission_prompt.gleam:27` |
| `sun` | sun | `settings/shells.gleam:178` (Light mode button) |
| `moon` | crescent | `settings/shells.gleam:177` (Dark mode button) |
| `cloud` | cloud | `settings/relay_scoping.gleam:152`; `settings/tabs.gleam:513` |

### Relays

| Icon | Depicts | Used at (file:line) |
|---|---|---|
| `relay` | rack units | **unused** in NEW |
| `relays` | rack units | `app_store.gleam:69`; `settings/relay_scoping.gleam:64`; `web/config.gleam:178` |
| `server` | rack units (alias) | `plugins/relays/.../view.gleam:69`, `:75`, `:193`, `:288`; `plugins/publisher/.../view.gleam:75`, `:348` |

### Checklist

| Icon | Depicts | Used at (file:line) |
|---|---|---|
| `check` | tick | `plugins/checklist/.../view.gleam:106`, `:135`, `:196` |
| `star` | star | `plugins/notes/.../view.gleam:137` ("Starred" tab) |
| `sparkle` | 4-point sparkle | **unused** in NEW |
| `sparkles` | alias of `sparkle` | **unused** in NEW |

### Notes

| Icon | Depicts | Used at (file:line) |
|---|---|---|
| `notes` | document + lines | `plugins/notes/.../view.gleam:136`; `app_store.gleam:59`; `themes/editorial.gleam:41`; `settings/shells.gleam:35`; `web/config.gleam:154` |
| `file-text` | alias of `notes` | **unused** in NEW |
| `feed` | speech bubble with lines | `plugins/feed/.../view.gleam:81`; `app_store.gleam:39`; `social_ui/note_card.gleam:332`; `web/config.gleam:46` |
| `download` | download | `plugins/notes/.../view.gleam:141` |
| `external` | external link | `plugins/notes/.../view.gleam:187` |

### Timer

| Icon | Depicts | Used at (file:line) |
|---|---|---|
| `timer` | stopwatch | `plugins/timer/.../view.gleam:163`; `app_store.gleam:99`; `web/config.gleam:124` |
| `clock` | clock face | `plugins/timer/.../view.gleam:161` (Running state) |
| `move` | 4-way arrows | **unused** in NEW (OLD drag handle gone) |

### Publisher

| Icon | Depicts | Used at (file:line) |
|---|---|---|
| `upload` | tray + up | `plugins/publisher/.../view.gleam:197`, `:210` |
| `download` | tray + down | `plugins/publisher/.../view.gleam:193` |
| `external` | out-link | (not used by publisher) |
| `refresh` | circular arrows | `plugins/profiles/.../view.gleam:449`; `plugins/timer/.../view.gleam:178`; `shell/update_modal.gleam:83`; `settings/tabs.gleam:569` |
| `cloud` | cloud | `settings/relay_scoping.gleam:152` |

### Editor / shell chrome

| Icon | Depicts | Used at (file:line) |
|---|---|---|
| `widgets` | dashboard tiles | `layout/widgets_grid.gleam:76`; `settings/placements.gleam:205` |
| `plugins` | puzzle piece | `settings/permissions.gleam:93` |
| `windows` | 2×2 squares | `themes/panorama.gleam:39`; `settings/shells.gleam:44` |
| `menu` | hamburger | `themes/classic.gleam:90` |
| `layout` | panel layout | see header table |

### Misc / status

| Icon | Depicts | Used at (file:line) |
|---|---|---|
| `spinner` | ring + arc | `ui/render/feedback.gleam:142` |
| `loader` | alias of `spinner` | **unused** in NEW |
| `bell` | bell | default icon for `BannerInfo` (`ui/render/feedback.gleam:244`) |
| `help-circle` | question circle | fallback only |
| `weather` | sun+cloud | **unused** in NEW (weather plugin manifest only names `"sun"`) |
| `close` | X | banner default for error/warning (`feedback.gleam:243`) |

**NEW usage totals:** 64 canonical names, 2 aliases groups; roughly 22 of 64 names have zero call sites (`arrow-up`, `more`, `grid`, `chevron-{down,up,left}`, `profile`, `x`, `repost`, `like`, `lightning`, `copy`, `eye`, `relay`, `sparkle(s)`, `file-text`, `move`, `loader`, `weather`, `help-circle`).

## Icon Diff

Every name in either map (64 rows; OLD 62 + NEW-only `menu`, `moon`). All 62 shared glyphs were compared by parsing both sources into shape/attribute lists.

| Icon (purpose) | OLD | NEW | Status |
|---|---|---|---|
| `arrow-left` (back) | `icons.ts:7` | `icons.gleam:149` | PRESENT-PARITY |
| `arrow-up` (scroll up) | `icons.ts:8` | `icons.gleam:160` | PRESENT-PARITY |
| `arrow-down` (load more) | `icons.ts:9` | `icons.gleam:171` | PRESENT-PARITY |
| `search` (magnifier) | `icons.ts:10` | `icons.gleam:182` | PRESENT-PARITY |
| `more` (3-dot overflow) | `icons.ts:11` | `icons.gleam:197` | PRESENT-PARITY |
| `menu` (hamburger) | — | `icons.gleam:219` | EXTRA-IN-NEW |
| `windows` (start grid) | `icons.ts:12` | `icons.gleam:241` | PRESENT-PARITY |
| `apps` (app grid) | `icons.ts:13` | `icons.gleam:269` | PRESENT-PARITY |
| `grid` (app grid alias) | `icons.ts:14` | `icons.gleam:269` | PRESENT-PARITY |
| `pin` (push-pin) | `icons.ts:15` | `icons.gleam:301` | PRESENT-PARITY |
| `help-circle` (question) | `icons.ts:16` | `icons.gleam:312` → `fallback_children()` | PRESENT-PARITY |
| `cloud` (sync) | `icons.ts:17` | `icons.gleam:314` | PRESENT-PARITY |
| `sun` (light mode) | `icons.ts:18` | `icons.gleam:328` | PRESENT-PARITY |
| `moon` (dark mode) | — | `icons.gleam:321` | EXTRA-IN-NEW |
| `weather` (weather app) | `icons.ts:19` | `icons.gleam:385` | PRESENT-PARITY |
| `refresh` (reload) | `icons.ts:20` | `icons.gleam:400` | PRESENT-PARITY |
| `upload` | `icons.ts:21` | `icons.gleam:412` | PRESENT-PARITY |
| `download` | `icons.ts:22` | `icons.gleam:426` | PRESENT-PARITY |
| `feed` (feed app) | `icons.ts:23` | `icons.gleam:440` | PRESENT-PARITY |
| `notes` (notes app) | `icons.ts:24` | `icons.gleam:462` | PRESENT-PARITY |
| `file-text` (notes alias) | `icons.ts:25` | `icons.gleam:462` | PRESENT-PARITY |
| `widgets` (dashboard) | `icons.ts:26` | `icons.gleam:491` | PRESENT-PARITY |
| `plugins` (puzzle) | `icons.ts:27` | `icons.gleam:522` | PRESENT-PARITY |
| `settings` (cog) | `icons.ts:28` | `icons.gleam:532` | PRESENT-PARITY |
| `user` (person) | `icons.ts:29` | `icons.gleam:547` | PRESENT-PARITY |
| `profile` (person alias) | `icons.ts:30` | `icons.gleam:547` | PRESENT-PARITY |
| `users` (people) | `icons.ts:31` | `icons.gleam:559` | PRESENT-PARITY |
| `timer` (stopwatch) | `icons.ts:32` | `icons.gleam:573` | PRESENT-PARITY |
| `clock` | `icons.ts:33` | `icons.gleam:586` | PRESENT-PARITY |
| `close` (X) | `icons.ts:34` | `icons.gleam:596` | PRESENT-PARITY |
| `x` (X alias) | `icons.ts:35` | `icons.gleam:596` | PRESENT-PARITY |
| `reply` | `icons.ts:36` | `icons.gleam:612` | PRESENT-PARITY |
| `message` (bubble) | `icons.ts:37` | `icons.gleam:618` | PRESENT-PARITY |
| `like` (heart alias) | `icons.ts:38` | `icons.gleam:628` | PRESENT-PARITY |
| `heart` | `icons.ts:39` | `icons.gleam:628` | PRESENT-PARITY |
| `trash` (bin) | `icons.ts:40` | `icons.gleam:638` | PRESENT-PARITY |
| `plus` | `icons.ts:41` | `icons.gleam:649` | PRESENT-PARITY |
| `copy` (two sheets) | `icons.ts:42` | `icons.gleam:665` | PRESENT-PARITY |
| `check` (tick) | `icons.ts:43` | `icons.gleam:683` | PRESENT-PARITY |
| `check-circle` | `icons.ts:44` | `icons.gleam:688` | PRESENT-PARITY |
| `relay` (rack) | `icons.ts:45` | `icons.gleam:696` | PRESENT-PARITY |
| `relays` (rack) | `icons.ts:46` | `icons.gleam:696` | PRESENT-PARITY |
| `server` (rack alias) | `icons.ts:47` | `icons.gleam:696` | PRESENT-PARITY |
| `key` | `icons.ts:48` | `icons.gleam:728` | PRESENT-PARITY |
| `bolt` (bolt alias) | `icons.ts:49` | `icons.gleam:738` | PRESENT-PARITY |
| `zap` (bolt) | `icons.ts:50` | `icons.gleam:738` | PRESENT-PARITY |
| `lightning` (bolt alias) | `icons.ts:51` | `icons.gleam:738` | PRESENT-PARITY |
| `layout` (panel layout) | `icons.ts:52` | `icons.gleam:745` | PRESENT-PARITY |
| `external` (out-link) | `icons.ts:53` | `icons.gleam:768` | PRESENT-PARITY |
| `eye` | `icons.ts:54` | `icons.gleam:785` | PRESENT-PARITY |
| `sliders` (faders) | `icons.ts:55` | `icons.gleam:797` | PRESENT-PARITY |
| `move` (4-way) | `icons.ts:56` | `icons.gleam:855` | PRESENT-PARITY |
| `chevron-down` | `icons.ts:57` | `icons.gleam:875` | PRESENT-PARITY |
| `chevron-up` | `icons.ts:58` | `icons.gleam:880` | PRESENT-PARITY |
| `chevron-left` | `icons.ts:59` | `icons.gleam:885` | PRESENT-PARITY |
| `chevron-right` | `icons.ts:60` | `icons.gleam:890` | PRESENT-PARITY |
| `star` | `icons.ts:61` | `icons.gleam:895` | PRESENT-PARITY |
| `sparkle` | `icons.ts:62` | `icons.gleam:905` | PRESENT-PARITY |
| `sparkles` (alias) | `icons.ts:63` | `icons.gleam:905` | PRESENT-PARITY |
| `repeat` (repost) | `icons.ts:64` | `icons.gleam:921` | PRESENT-PARITY |
| `repost` (alias) | `icons.ts:65` | `icons.gleam:921` | PRESENT-PARITY |
| `bell` | `icons.ts:66` | `icons.gleam:929` | PRESENT-PARITY |
| `spinner` | `icons.ts:67` | `icons.gleam:937` | PRESENT-PARITY |
| `loader` (alias) | `icons.ts:68` | `icons.gleam:937` | PRESENT-PARITY |
| **implicit fallback glyph** (unknown name) | alert/info circle, `icons.ts:72` | help-circle question mark, `icons.gleam:128-145` | **MISSING** (geometry differs; OLD path below) |

Only genuine MISSING row (implicit fallback) — OLD path data for re-adding the old behaviour:

```
<circle cx="12" cy="12" r="10"/>
<line x1="12" y1="8" x2="12" y2="12"/>
<line x1="12" y1="16" x2="12.01" y2="16"/>
```

### Names referenced by code but absent from the map

Neither version has glyphs for these, so they all currently render the fallback question mark. They matter because they are *visible* surfaces, and because the diff between versions is mostly stable except for `lock`, `image`, `save`, `user-check`, `user-plus`.

| Referenced name | OLD call sites | NEW call sites | Status |
|---|---|---|---|
| `globe` | `publisher-schema.ts:37`, `:86` | `feed/view.gleam:133` (Global tab), `relays/view.gleam:112`, `publisher/view.gleam:69`, `:288` | MISSING in both |
| `package` | `publisher-schema.ts:29`, `:73`, `:461` | `publisher/view.gleam:50`, `:63`, `:86` | MISSING in both |
| `file` | `publisher-schema.ts:124`, `:133` | `publisher/view.gleam:278` | MISSING in both |
| `code` | `publisher-schema.ts:263` | `publisher/view.gleam:240` | MISSING in both |
| `edit` | `profile-schema.ts:114` | `profiles/view.gleam:234`, `:390`; `publisher/view.gleam:222` | MISSING in both |
| `send` | `feed.mbt:779` | `feed/view.gleam:103` | MISSING in both |
| `book` | `shell-registry.ts:29`, `:61` | — (NEW uses `notes`/`layout` for shells, `themes/editorial.gleam:41`) | MISSING in OLD only |
| `document` | `app-store-catalog.ts:21` | — | MISSING in OLD only |
| `lock` | — | `settings/tabs.gleam:306` | **MISSING-in-NEW (NEW-only reference)** |
| `image` | — | `profiles/view.gleam:343` | MISSING-in-both (NEW-only call) |
| `save` | — | `profiles/view.gleam:355` | MISSING-in-both (NEW-only call) |
| `user-check` | — | `profiles/view.gleam:116`, `:215` | MISSING-in-both (NEW-only call) |
| `user-plus` | — | `profiles/view.gleam:117`, `:216` | MISSING-in-both (NEW-only call) |

Note `user-check` / `user-plus` are chosen via `case follow` (`profiles/view.gleam:115-118`), so the Follow/Unfollow button on the People directory **always** shows a question mark, on every row, in NEW.

## Logo, Favicon, PWA Assets

`apps/web/index.html` is **identical** on both sides (`cmp` reports no difference; 994 bytes). It declares:

- `link rel="manifest" href="./manifest.webmanifest"` (`index.html:13`)
- `link rel="icon" type="image/svg+xml" href="./icon.svg"` (`:14`)
- `link rel="icon" type="image/png" sizes="192x192" href="./icon-192.png"` (`:15`)
- `link rel="apple-touch-icon" href="./icon-192.png"` (`:16`)
- theme colour `#141312`, Apple mobile meta, `viewport-fit=cover`.

Image files that exist in OLD (`find`, excluding node_modules):

| File | Notes |
|---|---|
| `/tmp/omni-develop/apps/web/public/icon.svg` | 512×512, rounded `#141312` square + `#d4a373` ring (r=140, stroke 24) + 8-point star polygon |
| `/tmp/omni-develop/apps/web/public/icon-192.png` | 13 KB, md5 `4920d95e…` |
| `/tmp/omni-develop/apps/web/public/icon-512.png` | 35 KB, md5 `75b22f5b…` |
| `/tmp/omni-develop/apps/web/public/manifest.webmanifest` | name/theme/categories + 3 icons + 3 shortcuts (Feed/Tasks/Relays) |

OLD has **no** `apps/web/dist/` directory and no other image assets (docs/mockups are HTML only).

Image files that exist in NEW (`ls -R` + `find`):

| File | Notes |
|---|---|
| `/home/spiralnights/code/omni/apps/web/public/icon.svg` | byte-identical to OLD (`cmp` clean) |
| `/home/spiralnights/code/omni/apps/web/public/icon-192.png` | md5 identical to OLD |
| `/home/spiralnights/code/omni/apps/web/public/icon-512.png` | md5 identical to OLD |
| `/home/spiralnights/code/omni/apps/web/public/manifest.webmanifest` | identical to OLD |
| `/home/spiralnights/code/omni/apps/web/dist/{icon.svg,icon-192.png,icon-512.png,manifest.webmanifest}` | build copies of the same files |
| `/home/spiralnights/code/omni/external-plugins/omni-plugins/weather/icon.svg` | sun glyph, `stroke-width="1.8"` (off-standard) |
| `/home/spiralnights/code/omni/external-plugins/omni-plugins/weather/{manifest.webmanifest,dist/icon.svg,dist/manifest.webmanifest}` | weather plugin PWA metadata, NEW-only |

`/home/spiralnights/code/omni/assets/` contains **only six CSS files** (`editorial.css`, `panorama.css`, `shell-modules.css`, `classic.css`, `schema.css`, `tokens.css`) — no images. The "NEW has only CSS in assets/" report is accurate for that folder but **not** for the app: PWA/favicon assets are present, identical, and correctly referenced. There is no regression in logo, favicon, or manifest.

## Generated Profile Avatars

### OLD `getAvatarSvg` — `packages/core/src/schema/components/primitive-elements.ts:844-899`

Duplicated verbatim in `packages/plugins/shell/src/base-shell.ts:70-125` (shell-side copy, used at `base-shell.ts:1191`).

**Inputs:** `pubkey: string` (hash seed) and `letter: string` (single monogram char).

**Hash:** classic 32-bit djb2 variant, no modulo bias handling:

```ts
let hash = 0;
for (let i = 0; i < (pubkey || "").length; i++) {
  hash = (hash << 5) - hash + pubkey.charCodeAt(i);
  hash |= 0;
}
const seed = Math.abs(hash);
```

**Palette:** 16 triples `[base, shadow, accent]` (`primitive-elements.ts:853-870`, mirrored in `packages/plugins/profile-viewer/src/crypto/gradient.ts:1-18`). Index = `seed % 16`. Examples: `#c85d3e/#3d190e/#ffd2c2` (terracotta), `#288755/#0b2e1b/#bcf5d4` (emerald), `#356ec4/#102347/#cce0ff` (cobalt).

**Composition (`viewBox 0 0 100 100`, `width/height 100%`, `border-radius: 50%` inline):**
1. `rect w=100 h=100 rx=50` filled with `stop1`.
2. Circle 1 at `(20 + seed%60, 20 + (seed>>4)%60)`, `r = 24 + (seed>>8)%16`, fill = `accent` when `seed` even else `#ede8df`, `fill-opacity = 0.24 + (seed%8)*0.015` (2 dp).
3. Circle 2 mirrored: `(100-c1x, 100-c1y)`, `r = 20 + (seed>>12)%20`, fill `stop2`, opacity `0.4`.
4. Bottom wave: `M 0 {64+seed%10} Q 50 {40+(seed>>3)%14} 100 {68+(seed>>6)%12} L 100 100 L 0 100 Z`, fill `#141312` at `0.3`.
5. Ring: `circle r=47.5`, stroke `#ede8df` @ `0.25`, width `1.5`.
6. Monogram: first char of `letter` uppercased (default `?`), `x=50 y=52`, system font stack, `font-size=46`, `font-weight=900`, fill `#ffffff`, stroke `#141312` @ `0.5`, `stroke-width=2`, `text-anchor=middle`, `dominant-baseline=central`, `paint-order=stroke fill`.

Used by: `OmniAvatarElement.setProps` (`primitive-elements.ts:922`), card/header avatar fallback (`:1787`, `:1796`), and shell dock/profile avatar (`base-shell.ts:1191`).

### OLD `getProfileGradientBanner` — `packages/plugins/profile-viewer/src/crypto/gradient.ts:24-34`

Same hash and palette; `angle = 115 + seed%60`; returns

```
linear-gradient({angle}deg, {stop2} 0%, color-mix(in srgb, {stop1} 65%, #141312) 55%, color-mix(in srgb, {accent} 30%, #1c1b18) 100%)
```

Applied as `Card.bannerBackground` at `profile-schema.ts:56`, `:286`, `:567` (profile page header, other-user header, own profile).

### NEW

`gleam/ui/src/omni/ui/avatar.gleam` now owns both.

- `seed(key)` (`avatar.gleam:37-47`): same recurrence with explicit 32-bit wrap (`signed_32`, `:49-55`) and `int.absolute_value`. Uses UTF codepoints rather than UTF-16 code units; equivalent for hex pubkeys.
- `palette_for(key)` (`:62-69`): 16 triples (`:15-32`), `seed % 16`, same order and values.
- `render(key, letter)` (`:73-175`): identical geometry/opacity maths, `viewBox 0 0 100 100`, `width/height 100%`, `style="display: block; border-radius: 50%;"`.
  - Small differences: adds `role="img"`, `aria-hidden="true"` (contradictory — the avatar is both an image and hidden), and `data-avatar-seed`; `fill-opacity` is emitted with **three** decimals (`0.240`) via `opacity_string` (`:196-205`) vs OLD's `0.24`; letter is `string.trim`-ed before slicing (`:106-111`).
  - Otherwise the monogram is identical (46 px, weight 900, white with `#141312` 2 px stroke).
- Call sites: `ui/render/text.gleam:272` (Avatar primitive fallback), `ui/render/list.gleam:173` (list-item leading avatar), `shell/src/omni/shell/shell.gleam:31` (profile dock avatar).

**Gradient banner:** `avatar.gleam:180-195` (`banner_gradient`) reproduces the OLD CSS string exactly (same angle formula, same `color-mix` stops). But `rg 'banner_gradient' gleam --glob '*.gleam'` returns **only its definition** — zero call sites. `ui/render/layout.gleam:106,113,126` still accepts/renders `banner_background`, and the profiles plugin sets `banner: None` in all three profile constructors (`plugins/profiles/src/plugin/profiles/model.gleam:137,149,161`) and never passes `banner_background` to a Card. Net effect: **profile headers have no generated gradient banner in NEW**, even though the function to produce it exists.

## Emoji Audit

Production (non-test, non-docs) color emoji / pictographs in OLD:

| File:line | Emoji | Context |
|---|---|---|
| `packages/plugins/shell/src/permissions-intents-ui.ts:476` | `✦` | accent star in permission row |
| `packages/plugins/shell/src/panorama-shell.ts:587` | `✦` | system avatar placeholder |
| `packages/plugins/shell/src/panorama-shell.ts:631` | `🎨` | app-tile "widget" badge (color emoji) |
| `packages/plugins/shell/src/panorama-shell.ts:2476` | `✦` | "Decentralized Wisdom" heading |
| `packages/plugins/shell/src/base-shell.ts:824` | `✨` | starbright plugin default icon (color emoji) |
| `packages/plugins/shell/src/base-shell.ts:1666` | `✦` | empty-state glyph |
| `packages/plugins/shell/src/base-shell.ts:1670` | `✕` | close glyph (not an SVG) |
| `packages/plugins/shell/src/base-shell.ts:1742`, `:2039` | `✦` | dynamic app icon fallback |
| `packages/plugins/shell/src/editorial-shell.ts:1477`, `:1530` | `★` | "Pinned" badge |
| `packages/plugins/shell/src/editorial-shell.ts:2293` | `✓` | accent-swatch checkmark |
| `packages/plugins/shell/src/app-store-catalog.ts:84`, `:255` | `✦` | curated catalog copy |
| `packages/plugins/shell/src/app-store-catalog.ts:260` | `♜♞♝♛♙♘♗♔` | chess piece board glyphs |
| `packages/plugins/shell/src/plugin-update-modal.ts:41` | `📦` | update modal header (color emoji) |
| `packages/plugins/shell/src/plugin-update-modal.ts:110`, `:149` | `🎉` | success toast text |
| `packages/plugins/shell/src/styles/panorama-styles.ts:1952` | `✓` | CSS `content:` checkmark |
| `packages/plugins/shell/src/icons.ts:85`, `:126-133` | `✨`/`⭐`/`🌟`/`💫`/`🚀` | emoji branch of `renderPluginIcon` |
| `apps/web/src/main.ts:197,203,226,242,265,287,301,309,319,322` | `⚡ ✦ 🚀` | console logs only |
| `apps/web/vite.config.ts:55,59,70` | `⚡ ✔ ✖` | build logs only |
| `docs/mockups/editorial-app-list-mockups.html:757+` | `★ ✨` | design mockups |

Tests/notes: `packages/plugins/shell/test/editorial-shell.test.ts:811-877` explicitly asserts emoji rendering; `packages/plugins/feed/test/feed-integration.test.ts:576` uses emoji as UTF-8 test data — not UI.

**NEW:** `rg '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{FE0F}]' gleam apps/web/src --glob '*.gleam' --glob '*.ts' --glob '*.css' --glob '*.html'` → **no output**. Zero emoji, including no emoji fallback path for plugin icons. NEW is cleaner than OLD here.

## Rendering Mechanism Differences

| Aspect | OLD | NEW |
|---|---|---|
| Data model | `ICON_INNER_SVGS: Record<string,string>` of inner-SVG markup (`core/schema/icons.ts:6-69`); shell wraps it in another `<svg>` (`shell/src/icons.ts:57-60`) | Typed `lookup_icon_children(name) -> Result(List(Element), Nil)` building Lustre SVG nodes (`icons.gleam:147-949`); no string markup |
| Public API | `renderSvgIcon(name, size=16)` (`icons.ts:71`); `icon(name, size=18, className="")` (`shell/src/icons.ts:64`); `renderPluginIcon(rawIcon, size=18, className, pluginIdentifier)` (`:74`) | `render_icon(name, size)` (`:98`); `render_icon_default(name)` = 16 (`:91`); `icon_names()` (`:13`); `has_icon(name)` (`:83`) |
| Default size | core 16, shell 18 | 16 (`render_icon_default`, `Icon` primitive default `ui/render/text.gleam:192`) |
| Size units | inline `style="width:18px;height:18px"` on wrapper `<span>`; `<svg width=…>` in core | `width`/`height` attributes in px on the `<svg>` (`icons.gleam:107-108`) |
| Sizes actually used | 10, 11, 12, 13, 14, 15, 16, 18, 20, 28, 36 | 12, 14, 15, 16, 17, 18, 20, 22, 28, 32 |
| Missing sizes | — | no 10 (dynamic-pivot close), no 11 (pin badge), no 13 (settings grid/layout toggle), no 36 (empty-state) |
| Stroke | 1.75 everywhere in library; hand-rolled SVGs use 1.8/2/2.2/2.3 (`notes-ui.ts:555,574`, `editorial-shell.ts:2055,2070,2086`, `primitive-elements.ts:478,485,547,563,583,593`) | 1.75 hard-coded in `render_icon` (`icons.gleam:111`); every glyph inherits it |
| Colour | `stroke="currentColor"`, CSS `.omni-icon { color: currentColor }` (`schema-styles.ts:552`) | `stroke="currentColor"` (`:110`), class `.omni-icon` (`assets/styles/schema.css:749`) |
| Class names | `<svg class="omni-primitive-icon">` (core) or none (shell, wrapper gets `omni-icon`) | `<svg class="omni-icon">` / `omni-icon omni-icon-spin` (`:100-103`) |
| Filled vs stroked | all stroked; `more` dots use `fill="currentColor"` (`icons.ts:11`) | same (`icons.gleam:203,209,215`); all else stroked |
| Fallback | `renderSvgIcon`: alert circle; `icon()`: empty string when name unknown (`shell/src/icons.ts:65`) | help-circle + `data-icon-fallback="true"` (`:120-124`) |
| Hooks for CSS/JS | none on SVG; `omni-button`/`omni-icon-button` set `icon` **and** `data-icon` attributes on host (`primitive-elements.ts:968-970`, `:1022-1025`) | SVG gets `data-icon="<name>"` (`:115`); Buttons emit `data-variant`/`data-size`/`data-action` but **not** `icon`/`data-icon` (`ui/render/input.gleam:104-110`, `:154-159`) → note-action tint selectors in `assets/styles/schema.css:211-292` never match |
| ARIA | none | none on icons; `aria-label` on icon buttons (`input.gleam:150`); avatar has `role="img"` + `aria-hidden="true"` |
| Spin | `.omni-icon-spin` (`schema-styles.ts:1156-1159`), 0.8 s, accent colour; separate inline spinner at `base-shell.ts:519` | `.omni-icon-spin` (`schema.css:1456-1462`), same 0.8 s + accent; `omni-spinner` border spinner still used for Button loading (`input.gleam:86`) |
| Plugin icons | raw SVG markup, image URL/data URI (`<img>`), emoji, alias table, starbright heuristic (`shell/src/icons.ts:93-137`) | name only → `render_icon`; no image/emoji/SVG branch. `app.icon` strings are fed straight to `render_icon` (`layout/dock.gleam:112`, `layout/header_actions.gleam:116`, `app_store.gleam:317`) |
| Bespoke SVG | Notes plugin (plus/back), editorial settings tabs (15/17/13 px at stroke 2/1.8/2.2), note entity chips (12/13 px at stroke 2), media callouts (14 px at stroke 2), avatar, progress ring | Only icon library + avatar + progress ring (`ui/render/feedback.gleam:172-215`); no bespoke note-entity/media-callout SVG at all (no matching renderer in `gleam/`) |

## Prioritized Restoration List

1. **Add the `lock` glyph.** `settings/tabs.gleam:306` renders a question mark on the "Import or Export Key" settings card — a key-custody surface. Target: `gleam/ui/src/omni/ui/icons.gleam` (new case + `icon_names()` entry). Effort **S**. Impact: high (every visit to Settings shows a broken icon).
2. **Add `user-check` and `user-plus`, or map Follow/Unfollow to existing glyphs.** `plugins/profiles/src/plugin/profiles/view.gleam:116-117,215-216` — every row of the People directory currently shows a question mark in the follow button. Target: `icons.gleam` (+ `with_icon` names). Effort **S**. Impact: high.
3. **Add `globe`, `package`, `file`, `code`, `edit`, `send`, `image`, `save`.** These are referenced by feed tabs, publisher tabs and profile actions (`feed/view.gleam:103,133`; `publisher/view.gleam:50,69,75,240,278`; `profiles/view.gleam:234,343,355,390`). Target: `icons.gleam`. Effort **M** (8 glyphs). Impact: high — several top-level tabs and header cards are currently question marks in both versions.
4. **Re-emit `icon` / `data-icon` / `variant` attributes from the button renderers.** `ui/render/input.gleam:104-110` (button) and `:154-159` (icon button) omit the attributes that `assets/styles/schema.css:211-292` uses for reply/repost/like/zap hover colours and active tints. Add `attribute("icon", …)` and `attribute("data-icon", …)` plus `attribute("variant", vr_str)`. Effort **S**. Impact: high — the coloured note-action affordance is currently dead.
5. **Restore the plugin-icon renderer's non-glyph channels.** Port `renderPluginIcon`'s SVG-string / image-URL / emoji / alias handling (`/tmp/omni-develop/packages/plugins/shell/src/icons.ts:74-138`) or at minimum an `<img>` branch for `http(s)`/`data:` icons. Call sites: `shell/layout/dock.gleam:112`, `shell/layout/header_actions.gleam:116`, `shell/app_store.gleam:317`, `shell/settings/permissions.gleam:217`. Effort **M**. Impact: medium-high (community plugin icons).
6. **Wire the profile gradient banner.** `avatar.banner_gradient` exists (`avatar.gleam:180`) but nothing calls it; profiles pass `banner: None` (`plugins/profiles/.../model.gleam:137,149,161`). Set `banner_background` on the profile Card and pass `banner_gradient(pubkey)`. Effort **S**. Impact: high visual identity for profile pages.
7. **Restore the old unknown-name fallback or stop depending on it.** NEW's fallback is the help-circle question mark (`icons.gleam:128-145`); OLD `renderSvgIcon` used the alert circle (`icons.ts:72`: `r=10` circle + vertical line to y=12 + dot at y=16). If the missing names in items 1-3 are added the visual difference mostly disappears; otherwise re-add the alert glyph. Effort **S**. Impact: medium.
8. **Restore lost icon usages on specific surfaces.** Concretely: timer Start/Pause (`timer-schema.ts:213` used `bolt`/`close`; NEW uses `timer`/`clock`, `plugins/timer/.../view.gleam:161-165`), timer drag handle `move` (`timer-schema.ts:166`), timer Card header icon (`timer-schema.ts:158`; NEW has no Card), settings `cloud` workspace tab is present but the timer/notes cards lost their header icons. Target: `gleam/plugins/timer/src/plugin/timer/view.gleam`, `gleam/plugins/notes/src/plugin/notes/view.gleam`. Effort **M**. Impact: medium.
9. **Add the missing small/large sizes.** OLD used 10 px (`panorama-shell.ts:1546` pivot close), 11 px (`:912` pin badge), 13 px (`editorial-shell.ts:2118,2122,2205`), 36 px (`primitive-elements.ts:1943` empty state; NEW uses 32 at `ui/render/feedback.gleam:343`). Sizes are per-call, so this is a call-site change, not a library change. Effort **S**. Impact: low-medium (badge/pin optics, empty-state weight).
10. **Converge the hand-rolled SVGs onto the library.** `external-plugins/omni-plugins/weather/icon.svg:1` uses `stroke-width="1.8"`; OLD legacies at `notes-ui.ts:555,574` (2.2/2.3) and `editorial-shell.ts:2055,2070,2086` (2/1.8/2.2) no longer exist in NEW, so this is only the weather asset plus any future plugin assets. Effort **S**. Impact: low.
11. **Consider `aria-hidden="true"` on decorative icons.** NEW marks avatars `role="img"` + `aria-hidden="true"` (`avatar.gleam:135-136`) but leaves icon `<svg>`s with no ARIA at all while adding `data-icon`. Adding `aria-hidden="true"` (or `role="img"` + title) would make the icon system internally consistent. Effort **S**. Impact: low.
12. **Fix the avatar opacity formatting drift (cosmetic).** `opacity_string` emits `0.240` where OLD emitted `0.24` (`avatar.gleam:196-205`). Harmless but makes string-diff testing against the TS reference fail. Effort **S**. Impact: none visually.
