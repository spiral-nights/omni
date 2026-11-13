# Design System & CSS Parity

Scope: OLD (`/tmp/omni-develop`, `develop`) vs NEW (`/home/spiralnights/code/omni`, `gleam-rewrite`).
OLD CSS lives in three TS template strings (`packages/plugins/shell/src/styles/{editorial,panorama,schema}-styles.ts`) injected by `loader.ts`. NEW ships the same rules as static files under `assets/styles/`, plus two new files (`classic.css`, `shell-modules.css`) and a token layer (`tokens.css`), loaded as `<link>` elements by `gleam/shell/src/omni/shell/styles.gleam`.

Line counts (rule blocks / unique class names):

| Sheet | OLD | NEW | Notes |
|---|---|---|---|
| editorial | 1827 lines, 214 rules, 119 classes | `assets/styles/editorial.css` 1827 lines, 214 rules, 120 classes | Byte-identical port except one added `.omni-card` alias at `editorial.css:1617` |
| panorama | 2568 lines, 345 rules, 219 classes | `assets/styles/panorama.css` 2567 lines, 345 rules, 219 classes | Identical except a dropped leading blank line |
| schema | 1179 lines, 206 rules, 73 classes | `assets/styles/schema.css` 1485 lines, 211 rules, 162 classes | Superset: old custom-element selectors kept, `.omni-*` class aliases added |
| classic | — (no classic sheet in OLD) | `assets/styles/classic.css` 2092 lines, 256 rules, 179 classes | New shell; derived from old base-shell markup classes |
| shell-modules | — (settings/overlay CSS was inside shell sheets) | `assets/styles/shell-modules.css` 1288 lines, 177 rules, 192 classes | New shared chrome layer |
| tokens | — (tokens were defined per shell) | `assets/styles/tokens.css` 171 lines | New global token layer + reset |

## Summary

- **Rule parity for the three OLD shells is essentially perfect.** `editorial.css` and `panorama.css` are literal copies of the OLD TS strings; `schema.css` is a strict superset. No OLD selector block was deleted from those files.
- **The regressions are in the token/wiring layer, not the rules.** NEW introduces a global `tokens.css` "Warm Paper Dark" palette that the OLD app never had, plus a per-shell token model that only partially overrides it.
- **Theme-mode wiring is broken in Editorial, and only partial elsewhere.** Editorial renders `data-theme-mode` twice (`model.theme_mode` then a hard-coded `"dark"`, `themes/editorial.gleam:57-58`), so Light is unreachable. Panorama has no light rules at all (as in OLD), so its Light button does nothing. Classic picks up the generic `tokens.css` light block on the shell root, but `classic.css:2` keeps dark `:root` values on `<html>/<body>` and Classic's own status colours (`#4ade80`) never switch, so the page frame and status dots stay dark in light mode.
- **The 3-way Light / Dark / System mode is gone.** OLD supported `system` + `prefers-color-scheme` (`editorial-shell.ts:105, 484-508`); NEW offers only Dark/Light (`settings/shells.gleam:177-178`) and normalises every non-`"light"` value to `"dark"` (`update.gleam:488-493`).
- **Accent application is much weaker.** OLD wrote primary, contrast (YIQ-computed), border-focus, status-online and status-badge to both the shell root and `document.documentElement`, then synced sandboxes (`editorial-shell.ts:640-663`). NEW writes only `--omni-accent-primary` on the shell root (`themes/editorial.gleam:59`, `themes/panorama.gleam:56`), so hover/focus/status/contrast stay at the static CSS defaults.
- **Accent palette identity changed.** OLD Editorial presets were cobalt/terracotta/saffron/pine/bone (`editorial-shell.ts:35-41`), OLD Panorama used Metro cyan/lime/gold etc. with default `#00a4ef` (`panorama-shell.ts:32-46,73`). NEW has one warm set (sandstone/terracotta/sage/cobalt ink/amber, `settings/shells.gleam:62-69`) and a single default `#d4a373` for every shell (`model.gleam:154-155`).
- **Some NEW markup has no matching CSS.** Tabs render `.omni-tab`/`.omni-tab-active` (`ui/render/input.gleam:425-468`) but CSS only styles `.omni-tabs-nav`/`.omni-tab-btn` (`schema.css:1029-1097`). Progress bars render `.omni-progress-fill` (`ui/render/feedback.gleam:125`) but CSS styles `.omni-progress-bar` (`schema.css:1200`). Circular/ring/dial progress, `.omni-shell-card`, relay-scope buttons, intent-toggle buttons and route chips have no rules.
- **Tokens referenced by Gleam but never defined in CSS:** `--omni-success`, `--omni-warning`, `--omni-error` (`protocol/schema/style.gleam:86-88`, `ui/tokens.gleam:49-53`) and `--omni-border-default` (`ui/tokens.gleam:57`). Protocol colour props therefore resolve to `var()` with no value.
- **`tokens.gleam` defaults drift from `tokens.css`:** subtle `#292623` vs `#2a2824`, accent-hover `#deb489` vs `#c89666`, space-xl `2rem` vs `36px`, radius-lg `14px` vs `16px`, and a different sans stack (`ui/tokens.gleam:97-135` vs `tokens.css:5-58`).
- **A large share of each shell sheet is now dead CSS.** OLD settings/app pages used `editorial-*` / `panorama-*` classes; the Gleam shell emits generic `omni-*` classes. Roughly 62 of 81 `editorial-*` class names and 47 of 62 `panorama-*` class names never appear in Gleam source (e.g. `.editorial-mode-switcher`, `.editorial-swatch-item`, `.panorama-color-swatch`, `.panorama-full-app-*`). The sheets are shipped whole but most of their settings/app chrome is unused.
- **No visual assets were lost from the CSS itself:** paper-grain SVG overlay (`editorial.css:137-152`), backdrop blurs, gradients, scrollbar hiding, safe-area insets and all OLD `@keyframes` are preserved.

## Design Token Diff (full table)

Legend: **=** same value, **~** same token with different value, **+** new token, **!** broken/undefined.

OLD had no global `:root` token block — `apps/web/src/style.css:13-17` only hard-coded `background:#000000; color:#ede8df` on `html, body`. Tokens existed only inside shell selectors (`:root.theme-editorial`, `.panorama-shell-root`). NEW adds `tokens.css:5-97` as the global default ("Warm Paper Dark") and keeps per-shell blocks in `editorial.css:12-111` / `panorama.css:12-58`.

| Token | OLD value | NEW value | Status |
|---|---|---|---|
| `--omni-bg-canvas` | editorial dark `#1c1b20`; editorial light `#fbfbf9`; panorama `#000000` | tokens dark `#141312` (`tokens.css:6`); light `#f3efe6` (`tokens.css:102`); editorial/panorama keep OLD values; classic overrides `#141312` (`classic.css:3`) | ~ NEW default palette differs from both OLD shells |
| `--omni-bg-surface` | `#232227` / `#f4f4f2` / `#111111` | tokens `#191816`; light `#faf7f0`; editorial/panorama OLD | ~ |
| `--omni-bg-elevated` | `#2a2930` / `#ffffff` / `#161616` | tokens `#22201d`; light `#ffffff`; editorial/panorama OLD | ~ |
| `--omni-bg-card` | never defined; consumers used fallback `#22201d` (`old-schema.css:670,1088`) | `#22201d`; light `#ffffff` (`tokens.css:8,106`) | + now real |
| `--omni-bg-subtle` | `#33323b` / `#eeeeec` / `#222222` | tokens `#2a2824`; light `#ece6da`; classic `#2a2824`; Gleam default `#292623` (`tokens.gleam:102`) | ~ plus Gleam/CS S drift |
| `--omni-text-primary` | `#e5e1e4` / `#0f172a` / `#ffffff` | tokens `#ede8df`; light `#24221e`; editorial/panorama OLD; classic `#ede8df` | ~ |
| `--omni-text-secondary` | `#c2c6d6` / `#565e74` / `#aaaaaa` | tokens `#9e988f`; light `#5f5a52`; classic `#a8a29e` (`classic.css:9`); editorial/panorama OLD | ~ three different NEW values |
| `--omni-text-muted` | `#8c909f` / `#94a3b8` / `#666666` | tokens `#6b665f`; light `#8a847a`; classic `#78716c` (`classic.css:10`) | ~ |
| `--omni-border-subtle` | `#313038` / `#e2e8f0` / `#1e1e1e` | tokens `#272522`; light `#e2dccf`; editorial/panorama OLD | ~ |
| `--omni-border-strong` | `#42404b` / `#cbd5e1` / `#333333` | tokens `#383530`; light `#cfc7b8` | ~ |
| `--omni-border-focus` | `var(--omni-accent-primary)` → `#1e40af` editorial, `#00a4ef` panorama | tokens `#c89666`; light `#b08050`; classic `#c89666` | ~ focus ring no longer follows accent |
| `--omni-border-active` | — | `#3d3a35`; light `#bdb4a4` (`tokens.css:20`) | + unused by CSS |
| `--omni-border-default` | — | not defined (`ui/tokens.gleam:57` only) | ! undefined |
| `--omni-accent-primary` | editorial `#1e40af`; panorama `#00a4ef` | tokens `#d4a373`; light `#a9743f`; editorial/panorama CSS keep OLD but inline `style="--omni-accent-primary: <model.accent_color>"` (`themes/editorial.gleam:59`, `panorama.gleam:56`) overrides to `#d4a373` | ! default identity changed per shell |
| `--omni-accent-hover` | `#1d4ed8` editorial; `#0078d7` panorama | tokens `#c89666`; editorial still `#1d4ed8`, panorama `#0078d7` (never overridden by inline style) | ! tan primary with blue hover in Editorial |
| `--omni-accent-contrast` | `#ffffff` (both) | tokens `#141312`; light `#fffaf2`; editorial/panorama CSS still `#ffffff`; never recomputed per accent (OLD used YIQ, `editorial-shell.ts:48-66`) | ! |
| `--omni-status-online` | editorial `#1e40af` (accent); panorama `var(--accent)` | tokens `#98c379`; classic `#4ade80`; editorial/panorama keep accent-linked values | ~ |
| `--omni-status-badge` | accent-linked | tokens `#d4a373`; classic `#d4a373`; editorial/panorama accent-linked | ~ |
| `--omni-status-warning` | — | `#e5c07b` (`tokens.css:31`) | + not used in CSS |
| `--omni-status-error` | — | `#e06c75` (`tokens.css:32`) | + used only in `shell-modules.css:150,860` |
| `--omni-success` | — | not defined | ! Gleam references only |
| `--omni-warning` | — | not defined | ! Gleam references only |
| `--omni-error` | — | not defined | ! Gleam references only |
| `--omni-reply-active` | `#61afef` | `#61afef` (`tokens.css:34`) | = |
| `--omni-repost-active` | `#98c379` | `#98c379` | = |
| `--omni-heart-active` | `#e06c75` | `#e06c75` | = |
| `--omni-zap-active` | `#e5c07b` | `#e5c07b` | = |
| `--omni-font-sans` | editorial `"Geist", -apple-system, …`; panorama `-apple-system, "Segoe UI", …` | tokens `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`; light same; classic same; editorial/panorama CSS OLD; Gleam default `system-ui, -apple-system, …` (`tokens.gleam:113-116`) | ~ |
| `--omni-font-serif` | `"Newsreader", "Charter", "Georgia", serif` | same (`tokens.css:40`); classic does **not** define it | ~ missing in classic |
| `--omni-font-mono` | editorial `"Space Mono", ui-monospace, …`; panorama system | tokens `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`; editorial CSS keeps Space Mono; classic has no Space Mono | ~ |
| `--omni-font-headline` | `var(--omni-font-serif)` | `var(--omni-font-serif)` (`tokens.css:43`) | = |
| `--omni-radius-sm` | editorial `2px`; panorama `0` | tokens `6px`; light inherits; classic `6px`; editorial `2px`; panorama `0` | ~ global default much rounder |
| `--omni-radius-md` | `4px` / `0` | tokens `10px`; classic `10px`; editorial `4px`; panorama `0` | ~ |
| `--omni-radius-lg` | `8px` / `0` | tokens `16px`; classic `16px`; editorial `8px`; panorama `0`; Gleam `14px` | ~ |
| `--omni-radius-pill` | `9999px` / `0` | `9999px` everywhere | = |
| `--omni-space-xs` | — | `4px` (`tokens.css:46`), Gleam `0.25rem` | + |
| `--omni-space-sm` | — | `8px`, Gleam `0.5rem` | + |
| `--omni-space-md` | — | `16px`, Gleam `1rem` | + |
| `--omni-space-lg` | — | `24px`, Gleam `1.5rem` | + |
| `--omni-space-xl` | — | `36px`, Gleam `2rem` (32px) | + mismatch |
| `--omni-shadow-sm` | — (raw shadows only) | `0 1px 3px rgba(0,0,0,.2)`; light `rgba(60,50,35,.12)` | + |
| `--omni-shadow-md` | — | `0 4px 16px rgba(0,0,0,.35)`; light `.16` | + |
| `--omni-shadow-lg` | — | `0 12px 36px rgba(0,0,0,.5)`; light `.22` | + used once (`shell-modules.css:1276`) |
| `--omni-transition-fast` | — | `0.12s ease` | + unused in CSS |
| `--omni-transition-base` | — | `0.15s ease` | + unused in CSS |
| `--omni-transition-smooth` | — | `0.25s cubic-bezier(0.16,1,0.3,1)` | + unused in CSS |
| `--omni-accent` | — | not defined; used in `classic.css:473,481,649` with fallback | ! typo / undefined |
| `--editorial-bg-rgb` | `251,251,249` / `28,27,32` | same (`editorial.css:55,88`) | = |
| generic `--bg-*`, `--text-*`, `--border-*`, `--accent-*`, `--status-*`, `--font-*`, `--radius-*` aliases | per-shell only | global in `tokens.css:60-97` + per-shell duplicates in classic/editorial/panorama | ~ classic omits `--font-serif` |

## Color Palettes

### OLD

**Editorial — Sacred Editorial (light / Papyrus)** (`editorial-styles.ts:49-79`): canvas `#fbfbf9`, surface `#f4f4f2`, elevated `#ffffff`, subtle `#eeeeec`, ink `#0f172a`, secondary `#565e74`, muted `#94a3b8`, borders `#e2e8f0` / `#cbd5e1`, accent cobalt `#1e40af` (hover `#1d4ed8`), contrast `#ffffff`, status = accent.

**Editorial — Obsidian Sanctuary (dark)** (`editorial-styles.ts:81-111`): canvas `#1c1b20`, surface `#232227`, elevated `#2a2930`, subtle `#33323b`, ink `#e5e1e4`, secondary `#c2c6d6`, muted `#8c909f`, borders `#313038` / `#42404b`, same cobalt accent, focus fallback `#4d8eff`.

**Panorama — Windows Phone Metro** (`panorama-styles.ts:13-58`): pure black canvas `#000000`, surface `#111111`, elevated `#161616`, subtle `#222222`, text `#ffffff` / `#aaaaaa` / `#666666`, borders `#1e1e1e` / `#333333`, cyan accent `#00a4ef`, hover `#0078d7`, contrast `#ffffff`, **all radii 0**. No light variant. Accent presets include Metro cyan/lime/gold (`panorama-shell.ts:32-46`).

**Editorial accent presets** (`editorial-shell.ts:35-41`): Cobalt Glow `#1e40af/#4d8eff`, Terracotta `#c2410c/#e2725b`, Saffron Ochre `#d97706/#f59e0b`, Forest Pine `#15803d/#4e9f78`, Monochrome Bone `#475569/#e5e1e4` (light/dark pairs), plus custom colour and YIQ-derived contrast.

### NEW

**`tokens.css` global "Warm Paper Dark" (dark)** (`tokens.css:5-58`): canvas `#141312`, surface `#191816`, elevated/card `#22201d`, subtle `#2a2824`, ink `#ede8df`, secondary `#9e988f`, muted `#6b665f`, borders `#272522` / `#383530` / active `#3d3a35`, focus `#c89666`, accent `#d4a373`, hover `#c89666`, contrast `#141312`, online `#98c379`, warning `#e5c07b`, error `#e06c75`.

**`tokens.css` light (`[data-theme-mode="light"]`)** (`tokens.css:101-120`): canvas `#f3efe6`, surface `#faf7f0`, elevated/card `#ffffff`, subtle `#ece6da`, ink `#24221e`, secondary `#5f5a52`, muted `#8a847a`, borders `#e2dccf` / `#cfc7b8` / active `#bdb4a4`, focus `#b08050`, accent `#a9743f`, hover `#8f5f31`, contrast `#fffaf2`, light-tuned shadows. Status colours are **not** overridden in light mode.

**Editorial in NEW** (`editorial.css:12-111`): unchanged from OLD (papyrus / obsidian, cobalt default), but the inline accent style overrides primary to `#d4a373`.

**Panorama in NEW** (`panorama.css:12-58`): unchanged Metro palette.

**Classic in NEW** (`classic.css:2-59`): canvas `#141312`, surface `#191816`, elevated `#22201d`, subtle `#2a2824`, ink `#ede8df`, secondary `#a8a29e`, muted `#78716c`, borders `#272522` / `#383530`, focus `#c89666`, accent `#d4a373`, online `#4ade80`. No light block and no `--omni-font-serif`, `--omni-bg-card`, `--omni-space-*`, `--omni-shadow-*`, `--omni-transition-*`.

**Accent presets in NEW** (`settings/shells.gleam:62-69`): Warm Sandstone `#d4a373`, Terracotta `#c85d3e`, Sage Emerald `#288755`, Cobalt Ink `#356ec4`, Amber Ochre `#b88320`. Default for every shell is `#d4a373` (`model.gleam:154`). No light/dark accent pairs, no contrast recomputation.

## Typography

**Families**

| Role | OLD | NEW |
|---|---|---|
| Editorial serif | `"Newsreader", "Charter", "Georgia", serif` | same (`editorial.css:17`) |
| Editorial mono | `"Space Mono", ui-monospace, SFMono-Regular, monospace` | same (`editorial.css:18`) |
| Editorial sans | `"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` | same (`editorial.css:19`) |
| Panorama | `-apple-system, "Segoe UI", "Segoe UI Web Light", …` (`panorama-styles.ts:63-73`) | same (`panorama.css:62-73`) |
| Global default sans | OLD app bootloader: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` (`apps/web/src/style.css:15`) | `tokens.css:39` same; `tokens.gleam:113-116` uses a **different** `system-ui, …` stack |
| Global default mono | OLD bootloader: none | `ui-monospace, …` (`tokens.css:41`) |
| Global serif | OLD bootloader: none | `"Newsreader", "Charter", "Georgia", serif` (`tokens.css:40`) — but Newsreader isn't imported outside `editorial.css:1` and classic has no `@import`, so classic falls back to Charter/Georgia |

**Scale / weights / line height / tracking**

- OLD Editorial: brand title `1.15rem` serif, weight 400, uppercase, tracking `0.28em`, line-height 1.2 (`editorial-styles.ts:207-215`); view subtitle `0.62rem` mono, tracking `0.18em` (`:217-227`); body text sizes range `0.60rem`–`1.6rem`; card/body text ~`0.88rem`; base line-height `1.6` (`:124`).
- OLD Panorama: pivot items `1.6rem`, weight 300/500, tracking `-0.03em` (`panorama-styles.ts:99-119`); sizes `0.72rem`–`2.5rem`; small caps/labels heavily uppercase.
- NEW keeps both verbatim because the files are copies. NEW's new `classic.css` uses its own scale (`0.72rem`–`1.15rem` labels/headings) and global `line-height: 1.5` from `tokens.css:144`.
- No tokenised type scale exists in either version (no `--omni-font-size-*`).

## Spacing / Radius / Shadow / Motion

| Area | OLD | NEW |
|---|---|---|
| Spacing | no tokens; raw px/rem (`4/8/12/14/16/20/24/32/96`) | `--omni-space-xs…xl` = `4/8/16/24/36px` (`tokens.css:46-50`); Gleam defaults `0.25/0.5/1/1.5/2rem` (`tokens.gleam:125-129`). Only `--omni-space-*` consumers are the Gleam `SizeToken` renderer; no CSS file uses them |
| Radius | per-shell: editorial 2/4/8; panorama 0; schema used `10px` fallback | tokens 6/10/16 (`tokens.css:53-56`), classic 6/10/16, editorial 2/4/8, panorama 0. Global default is noticeably rounder than OLD Editorial |
| Shadows | raw values everywhere (≈30 distinct), ranging from `0 1px 2px rgba(0,0,0,.06)` to `0 12px 36px -4px rgba(0,0,0,.35)`; shells had light/dark variants | 3 token levels `sm/md/lg` (`tokens.css:59-62`) with light variants (`tokens.css:116-118`); only `--omni-shadow-lg` is actually used (`shell-modules.css:1276`) |
| Motion | raw values: dominant `0.15s ease` (≈40 uses), `0.12s ease`, `0.18s cubic-bezier(0.16,1,0.3,1)`, `0.32s cubic-bezier(0.16,1,0.3,1)`, `0.05s ease` press states | same raw values preserved; new tokens `--omni-transition-fast/base/smooth` (`tokens.css:65-67`) are defined but **not referenced** by any CSS |
| Elevation model | per-shell hand-tuned | tokens exist but the old raw shadows still drive every component |

## Stylesheet Architecture

**OLD**

- `editorial-styles.ts` → `EDITORIAL_SHELL_CSS` string, 1827 lines, scoped to `:root.theme-editorial`, `body.theme-editorial`, `.editorial-shell-root` (`editorial-styles.ts:13-111`). Sections: paper-grain overlay, fixed header, central viewport, fullscreen mode, app page container, app-switch animations, floating capsule dock, auto-hide dock, back-to-top, back button, ledger tables, badges, modals & preference drawers, preference cards, theme-mode switcher, accent swatches, buttons/inputs, stream-end marker, app viewports, companion widgets, pull-to-refresh, plugin placements, context menu, update modal.
- `panorama-styles.ts` → 2568 lines, scoped to `:root.theme-panorama`, `body.theme-panorama`, `.panorama-shell-root` (`panorama-styles.ts:8-58`). Sections 1-14: hero header/pivots, left-pane peek hint, horizontal canvas, live accent tiles, widget cards, embedded app, action circles, feed/composer/widgets, inspector, accent chooser, compact tiles/context menu, dynamic app pane, desktop edge gliders, Metro bottom app bar, skeletons/empty states, refresh spin/toasts, responsive settings.
- `schema-styles.ts` → 1179 lines, unscoped global CSS for custom elements (`omni-box`, `omni-card`, …) plus class hooks (`.omni-card-body`, `.omni-button`, …).
- `loader.ts` injects schema CSS once (`#omni-schema-component-style`) and the active shell CSS into `document.head` as a `<style>` (`loader.ts:9-38`); `unmountShellStyles` removes it (`loader.ts:40-47`).
- `apps/web/src/style.css` is a 34-line boot reset only; `apps/web/index.html` loads `./src/style.css` (identical in NEW).

**NEW**

- `assets/styles/tokens.css` — global reset + Warm Paper Dark tokens + light override + generic aliases. Loaded first for every shell.
- `assets/styles/schema.css` — same primitive layer, extended with `.omni-*` class aliases for every custom-element selector (e.g. `schema.css:23-90`), plus new `Empty State` block (`schema.css:1411`), avatar sizes, badge variants, text variants, button/input/select/textarea wrappers. Consumers can use Light-DOM elements **or** Lustre classes.
- `assets/styles/shell-modules.css` — new shared chrome for the Gleam shell: root skeleton, header actions/toolbar, sync status pill, dock (mobile bottom / desktop 64px rail), main viewport, widgets grid, settings view (tabs, cards, subsections), app store, shells/accent panel, permissions/intents/placements/relay scoping, modal cards, intent chooser, plugin settings mount. 192 class names, 161 used by Gleam shell code.
- `assets/styles/classic.css` — Classic shell chrome ported from the OLD base-shell markup classes (`.app-header`, `.brand-row`, `.app-layout`, `.mobile-dock`, `.feed-*`, `.people-*`, `.settings-modal-card`, `.composer-*`, `.widgets-*`). 179 class names; only ~29 appear in current Gleam source.
- `assets/styles/editorial.css` / `panorama.css` — literal ports of the OLD strings.
- `styles.gleam:63-75` renders four `<link rel="stylesheet">` elements (`tokens`, `schema`, `shell-modules`, active theme); `web/boot.gleam:1102-1116` places them inside a `.omni-shell-stylesheets` div in the tree rather than in `<head>`. There is no unmount/removal path analogous to `unmountShellStyles`; the href is swapped on shell change.
- **Dead-code consequence:** because the Gleam shell emits `omni-*` chrome classes, the settings/app-store/accent UI inside `editorial.css` and `panorama.css` is no longer exercised. Examples of CSS with no Gleam consumer: `.editorial-mode-switcher` (`editorial.css:1352` block), `.editorial-swatch-item` (`:1400`), `.editorial-pref-card`, `.editorial-ledger-table`, `.editorial-plate-card`; `.panorama-color-swatch` (`panorama.css:1921` block), `.panorama-full-app-*`, `.panorama-edge-glider`, `.panorama-bottom-app-bar`. Roughly 62/81 editorial and 47/62 panorama class names are unused.
- **Duplicated token sources:** `tokens.css:5`, `classic.css:2`, `editorial.css:12`, `panorama.css:12` all declare overlapping tokens, plus `ui/tokens.gleam:97-135` and `protocol/schema/style.gleam:70-80` hold a third copy of the values.

## Schema Component Styling Coverage

OLD `schema-styles.ts` covered 24 primitives (comment "all 24 declarative schema primitives" is in NEW `schema.css:4`; OLD header lists `<omni-box>`, `<omni-card>`, `<omni-button>`, `<omni-input>`, `<omni-list>`). OLD blocks: 1 Box, 2 Card, 2b Condensed note card, 3 Divider & Spacer, 4 Typography & Status, 4b Avatar & Icon, 5 Controls (buttons, inputs, toggles, tabs, select), 6 Collections & Lists, 7 Spinner, 8 Virtual List, plus progress/banner/badge/metric/code.

| Component | OLD | NEW | Notes |
|---|---|---|---|
| Box | ✓ `schema-styles.ts:16-45` | ✓ `schema.css:22-90` | NEW adds `.omni-box-{column,row,wrap,gap-*,align-*,justify-*,padding-*}` classes |
| Card | ✓ `:47-60`, note card `:62-...` | ✓ `schema.css:92-440` | NEW adds `.omni-card` alias; same values |
| Card header/body/footer/icon/titles | ✓ | ✓ | NEW adds `.omni-card-header-action` (emitted `ui/render/layout.gleam:189`) but **no rule** |
| Divider | ✓ `:311` | ✓ `schema.css:443` | NEW adds `.omni-divider-horizontal/vertical` |
| Spacer | ✓ | ✓ | NEW adds `.omni-spacer-{xs…xl}` |
| Text | ✓ `:332` | ✓ `schema.css:486` | NEW adds `.omni-text-{title,subtitle,body,caption,mono,accent,success,error,truncate}` |
| Status indicator | ✓ | ✓ `schema.css:1104-1142` | `.omni-status-pulse` emitted (`ui/render/feedback.gleam:37`) has **no CSS**; `.omni-pulse` does (`schema.css:1132`) |
| Avatar | ✓ `:500` | ✓ + sizes `xs…xl` | NEW adds `.omni-avatar-{xs,sm,md,lg,xl}`, `.omni-avatar-interactive` (emitted, unstyled) |
| Icon / icon button | ✓ | ✓ + `.omni-icon-button-{ghost,danger}` | |
| Button | ✓ `:555` | ✓ + `.omni-button-{primary,secondary,ghost,danger,sm,lg}` | `.omni-button-loading`/`.omni-button-label` emitted but unstyled (cosmetic only) |
| Input | ✓ | ✓ + `.omni-input-wrapper/field` | `.omni-input-with-prefix`, `.omni-input-prefix-icon`, `.omni-input-clearable` emitted (`ui/render/input.gleam:194-208`) but **unstyled** |
| Textarea | ✓ | ✓ + wrapper/field | |
| Select | ✓ | ✓ + wrapper/field | |
| Toggle | ✓ | ✓ | Render emits `.omni-toggle` + `.omni-toggle-thumb` (`ui/render/input.gleam:312,349`); CSS styles `.omni-toggle-track::after` as the thumb, so visual result is equivalent |
| Tabs | ✓ `.omni-tab-btn` | ✓ CSS `schema.css:1019-1101` | **Broken:** render emits `.omni-tab`/`.omni-tab-active` (`ui/render/input.gleam:432,468`) which have no rules. Only the container `.omni-tabs` is styled |
| List / list items | ✓ | ✓ + `.omni-list-item-{checked,clickable,interactive}` variants | `.omni-list-loading` emitted (`ui/render/list.gleam:56`) unstyled |
| Spinner | ✓ | ✓ `schema.css:1446` | |
| Virtual list | ✓ | ✓ | `.omni-virtual-list-spacer-{top,bottom}` emitted but base `.omni-virtual-list-spacer` covers |
| Progress | ✓ bar/track/label | ✓ `schema.css:1185-1210` | **Broken:** render emits `.omni-progress-fill` (`ui/render/feedback.gleam:125`) but CSS styles `.omni-progress-bar`. Circular/ring/dial markup (`.omni-progress-circular`, `.omni-progress-svg-label`) has **no CSS** at all |
| Banner | ✓ | ✓ + `success/warning/error/info` | |
| Badge | ✓ | ✓ + `accent/success/warning/error` | `.omni-badge-label` emitted, unstyled (inherits) |
| Metric | ✓ | ✓ | `.omni-metric-trend`, `.omni-metric-trend-*` emitted (`ui/render/text.gleam:135,173`) have **no CSS** |
| Code block | ✓ | ✓ | `.omni-code` emitted but inherits from `.omni-code-pre` |
| Empty state | ✗ | ✓ `schema.css:1411-1444` | New component |
| Dialog / modal | not in schema; OLD modal CSS `.omni-modal-overlay` existed only in `editorial-styles.ts:1812-1827` | `.omni-modal-card/header/footer/…` in `shell-modules.css:976-1105`; `.omni-modal-overlay` still only in `editorial.css:1813` and `classic.css:2078` — **missing for Panorama** | Intent chooser/update modal in Panorama will not be overlaid |
| Shell cards, route chips, relay scope buttons, intent toggles | n/a | **No CSS**: `.omni-shell-card`, `.omni-route-chip`, `.omni-relay-scope-btn`, `.omni-intent-toggle-btn` emitted (`settings/shells.gleam:264`, `settings/placements.gleam:269`, `settings/relay_scoping.gleam:145`, `settings/intents.gleam:197`) with zero matching rules | Highest-impact NEW markup gap |

## Responsive Behavior

| Breakpoint | OLD | NEW |
|---|---|---|
| `max-width: 480px` | editorial back button shrink (`editorial-styles.ts:299`) | same (`editorial.css:299`) |
| `max-width: 768px`, `(hover: none) and (pointer: coarse)` | editorial dock/header/app sizing (`editorial-styles.ts:459`) | same (`editorial.css:459`) |
| `max-width: 600px` | editorial (768/915/1245), panorama (205/852/1352/2531), schema (232/254/843) | same; plus `classic.css:339,905` and `schema.css:1079` |
| `max-width: 640px` / `680px` | editorial (`915`, `1245`) | same |
| `min-width: 768px` | panorama canvas, desktop edge gliders; schema none | same + `shell-modules.css:172` (dock becomes 64px rail) + `classic.css:1482` (`.mobile-dock` rail) |
| `max-width: 767px` | panorama mobile layout (`panorama-styles.ts:2193`) | same |
| `hover: hover and min-width:768px` | panorama edge gliders (`:2176`) | same |
| `max-width: 760px` | — | **new** `shell-modules.css:1279` mobile menu panel (note: 760 vs the 768px dock breakpoint — 8px dead zone) |
| `prefers-reduced-motion: reduce` | editorial (`:547`) | same (`editorial.css:546`) |

- **Mobile dock:** OLD editorial floating capsule dock (`editorial-styles.ts:603`) and panorama Metro bottom bar (`:2199`) are preserved. NEW shared `.omni-dock` (`shell-modules.css:157-200`) is 58px tall, fixed bottom, and becomes a 64px left rail at `≥768px`. Classic's `.mobile-dock` (`classic.css:1416-1510`) duplicates this behaviour; only `.omni-dock` is emitted by `layout/dock.gleam:64`, so `.mobile-dock` is dead.
- **Safe-area insets:** fully preserved. Editorial: `editorial.css:367,562,605,723,769,783,790,793,1545`; Panorama: `panorama.css:820,874,2208,2276`; shell-modules: `shell-modules.css:1202`. Classic adds a fallback `env(safe-area-inset-bottom, 24px)` (`classic.css:1941`).
- **Touch targets:** OLD header buttons 38px (`editorial-styles.ts:237-245`), dock items `min-width:60px` (`classic` only). NEW dock container 58px; shared `.omni-mobile-menu-btn` has only `padding:4px` (`shell-modules.css:33-46`) which can yield a sub-44px target. The classic `.dock-item` keeps `min-width:60px` (`classic.css:1448`).
- **Viewport meta:** identical `maximum-scale=1, user-scalable=no, viewport-fit=cover` (`apps/web/index.html:5`) — no zoom, an accessibility issue in both.

## Animations & Transitions

OLD keyframes (all preserved verbatim in NEW):

| Keyframe | OLD | NEW |
|---|---|---|
| `editorialAppFadeIn` / `editorialAppFadeOut` | `editorial-styles.ts:513` block | `editorial.css:513` |
| `omniCtxFadeIn` | `editorial-styles.ts:1729` block | `editorial.css:1729` (and duplicated in `classic.css`) |
| `appMenuSlideUp`, `contextMenuPop` | panorama 8-block | `panorama.css:1960` block |
| `panoramaCardFlipIn/Out Left/Right` | panorama tiles | `panorama.css` |
| `omni-app-bar-spin`, `omni-skeleton-shimmer`, `omni-spin`, `omniToastSlideDown/Up` | panorama 12/13 | `panorama.css:2313,2351` block |
| `omni-pulse-glow`, `omni-spin` | schema | `schema.css:1135,1460` |

NEW additions: `omni-spin` + `omniCtxFadeIn` in `classic.css`; `filter 0.15s ease`, `background 0.12s ease, color 0.12s ease`, `0.2s` transitions in shell-modules/classic. Nothing was removed.

Behaviour gaps:
- `.omni-status-pulse` (emitted by the Gleam status indicator, `ui/render/feedback.gleam:37`) has no animation rule; only `.omni-pulse` does (`schema.css:1132`).
- Theme switching is instantaneous in both versions; there is no cross-fade on either side, but NEW also lost the body/document background + `color-scheme` swap that OLD performed on mode change (`editorial-shell.ts:490-506`), so light/dark changes do not repaint scrollbars, form controls or the iOS status bar.

## Accessibility

| Feature | OLD | NEW |
|---|---|---|
| `:focus-visible` ring | single rule for floating exit-fullscreen button (`editorial-styles.ts:429-450`) | same (`editorial.css:428-455`) |
| Keyboard focus on buttons/tabs/toggles | none (global `outline:none` patterns in components) | same; no new focus styles |
| Input/textarea/select focus | border colour only (`old-schema.css:662,704,776`) | same + wrapper/field variants (`schema.css:879,933,1013`) |
| `prefers-reduced-motion` | editorial page fades only (`editorial-styles.ts:547`) | same (`editorial.css:546`); classic/shell-modules animate without a reduced-motion guard |
| Screen-reader-only utility | none | none |
| `forced-colors` / high-contrast | none | none |
| `color-scheme` | set on `<html>` per mode (`editorial-shell.ts:494`) | only in `editorial.css:52,82`; never on document root, so native controls may mismatch |
| Zoom | disabled via viewport meta | same |
| ARIA roles on tabs | `.omni-tab-btn` markup (OLD shell-generated) | render sets `role="tablist"`/`role="tab"`/`aria-selected` (`ui/render/input.gleam:424-476`) but the buttons are unstyled — semantics are actually better than OLD even though visuals are broken |

Net: accessibility is at parity, with the same pre-existing gaps (no global focus ring, no sr-only utility, zoom disabled). No a11y styling was lost; none was added either.

## Lost Visual Effects (enumerated)

The CSS rules themselves survive; these effects are lost through wiring, palette or markup mismatches:

1. **Per-shell accent identity.** Editorial renders tan `#d4a373` instead of cobalt `#1e40af`; Panorama instead of Metro cyan `#00a4ef`, because `model.accent_color` default overrides the stylesheet (`themes/editorial.gleam:59`, `panorama.gleam:56`, `model.gleam:154`).
2. **Accent-matched hover, focus ring, status dot and contrast text.** Only `--omni-accent-primary` is set inline; hover stays blue in Editorial (`editorial.css:19` vs inline), border-focus stays `#c89666`/`#00a4ef`, online badge stays accent-old, and `--omni-accent-contrast` is never recomputed (OLD: `editorial-shell.ts:640-663`).
3. **Accent propagation to document root and sandboxes.** OLD wrote the accent to `document.documentElement` and called `syncThemeToSandboxes`; NEW only styles the shell root, so plugin iframes/nsites inside sandboxes do not see the chosen accent.
4. **Light mode in Editorial.** Unreachable: duplicate `data-theme-mode` attribute with `"dark"` last (`themes/editorial.gleam:57-58`).
5. **Light mode correctness outside Editorial.** Classic gets the generic light palette on the shell root from `tokens.css:101`, but `classic.css:2` keeps dark tokens on `<html>/<body>` and defines status colours (`#4ade80`) that the light block never overrides — page frame and status dots stay dark. Panorama's light block is inert because `panorama.css:12` (loaded after `tokens.css`) re-declares the same tokens on the same element.
6. **System theme mode.** OLD 3-way switch with `prefers-color-scheme` listener (`editorial-shell.ts:105,466-490`); NEW has only dark/light buttons (`settings/shells.gleam:177-178`).
7. **Dynamic browser chrome.** OLD updated `<meta name="theme-color">` and `documentElement.style.colorScheme` per mode (`editorial-shell.ts:497-506`); NEW leaves the static `#141312` (`apps/web/index.html:6`).
8. **Round editorial accent swatches** with checkmark, 32px circles, hover scale 1.08 and active outline (`editorial.css:1400-1434`) are replaced by rectangular chip buttons (`.omni-accent-swatch`, `shell-modules.css:753-778`) because the Gleam markup uses the new class names.
9. **Panorama accent chooser** circular square swatches with `✓` and white active border (`panorama.css:1921-1958`) are unused; the warm chip UI is shown instead.
10. **Tabs visual language** — underline indicator, active accent border and mobile tab sizing (`schema.css:1029-1101`) never apply because the Gleam renderer emits `.omni-tab` (`ui/render/input.gleam:468`).
11. **Progress bar fill** — height/background/rounded ends/width transition (`schema.css:1200-1205`) never apply to `.omni-progress-fill`; plus no styling at all for circular/ring/dial variants (`ui/render/feedback.gleam:199-220`).
12. **Settings shell cards** — `.omni-shell-card` container has no background/border/padding rule (only `-header`, `-icon`, `-name`, etc. exist, `shell-modules.css:680-728`); OLD `.editorial-plate-card` / shell cards were fully styled.
13. **Relay scope buttons, route chips and intent toggles** are raw `<button>` elements with no border, padding or active state (`settings/relay_scoping.gleam:145`, `placements.gleam:269`, `intents.gleam:197`).
14. **Default mono/serif typefaces outside Editorial** — `Space Mono` and `Newsreader` are only imported by `editorial.css:1`; `tokens.css:40-41` advertises them globally but never loads them, and `classic.css` has no `@import`.
15. **Editorial/panorama settings and app chrome CSS** (preference cards, ledger tables, plate cards, mode switcher, inspector, dynamic pane, edge gliders, Metro app bar) is dead code: shipped, never applied.
16. **Protocol semantic colours** (`success`/`warning`/`error`) render as inherited text because `--omni-success/-warning/-error` are undefined (`protocol/schema/style.gleam:86-88`).
17. **`--omni-accent` typo** in `classic.css:473,481,649` — falls back to `#d4a373` and ignores the user's accent.

Not lost (verified preserved): paper-grain turbulence overlay (`editorial.css:137-152`), header/dock backdrop blurs (16/12/20px + saturate), all gradients, hidden-scrollbar styling, `100dvh`, all safe-area insets, all keyframes, all OLD responsive breakpoints, all OLD shadows/radii within each shell sheet.

## Prioritized Restoration List

1. **Fix Editorial light mode** — remove the duplicate `attribute.attribute("data-theme-mode", "dark")` at `gleam/shell/src/omni/shell/themes/editorial.gleam:58`; keep only `model.theme_mode`. Effort **S**, impact **high** (light mode currently unreachable).
2. **Apply the accent bundle, not just primary** — in `themes/editorial.gleam:59` / `panorama.gleam:56` / `classic.gleam` set `--omni-accent-primary`, `--omni-accent-hover` (darkened), `--omni-accent-contrast` (YIQ), `--omni-border-focus`, `--omni-status-online`, `--omni-status-badge` on the shell root **and** `document.documentElement`, and re-add sandbox sync. Effort **M**, impact **high** (hover/contrast/status currently inconsistent with the chosen accent).
3. **Make Light mode coherent across sheets** — add status colours and html/body background to the `tokens.css` light block (`tokens.css:101`), add a light block for Classic's overrides (`classic.css:2`), and either add light tokens to `panorama.css` or hide the Light button for Panorama. Effort **M**, impact **high**.
4. **Style the Gleam-emitted tab classes** — add `.omni-tab`, `.omni-tab.active`, `.omni-tab-icon`, `.omni-tab-label` rules in `assets/styles/schema.css` (mirroring `.omni-tab-btn` at `schema.css:1049-1097`) or change `ui/render/input.gleam:468` to `.omni-tab-btn`. Effort **S**, impact **high** (every tab bar is unstyled).
5. **Fix progress bar fill** — rename `.omni-progress-bar` to `.omni-progress-fill` (or emit the old class) and add ring/dial styles for `.omni-progress-circular`/`.omni-progress-svg-label` (`schema.css:1185-1210`, `ui/render/feedback.gleam:125,199-220`). Effort **M**, impact **medium-high**.
6. **Style shell cards, route chips, relay-scope buttons, intent toggles** — add container/card and active-state rules in `assets/styles/shell-modules.css` for `.omni-shell-card`, `.omni-route-chip(.active)`, `.omni-relay-scope-btn(.active)`, `.omni-intent-toggle-btn(.active)`. Effort **M**, impact **medium** (Settings > Shells / Relay Scoping / Intents currently render as bare text/buttons).
7. **Define the missing tokens** — add `--omni-success`, `--omni-warning`, `--omni-error`, `--omni-border-default` to `assets/styles/tokens.css` (and light variant), and fix `--omni-accent` → `--omni-accent-primary` in `classic.css:473,481,649`. Effort **S**, impact **medium** (protocol colour props are currently no-ops).
8. **Reconcile Gleam token defaults with CSS** — align `gleam/ui/src/omni/ui/tokens.gleam:97-135` (subtle `#2a2824`, accent-hover `#c89666`, space-xl `36px`, radius-lg `16px`, same sans stack) or make `tokens.css` the single source. Effort **S**, impact **medium** (inline styles can contradict stylesheet values).
9. **Restore the System theme mode** — persist `"system"` in `update.gleam:488-493`, resolve via `prefers-color-scheme` in the boot/shell, and add a third button at `settings/shells.gleam:177`. Effort **M**, impact **medium**.
10. **Re-add document-level theme painting** — set `data-theme-mode`, `color-scheme`, body background and `<meta name="theme-color">` when the mode changes (port `editorial-shell.ts:490-506`). Effort **S**, impact **medium** (browser chrome, scrollbars, native controls).
11. **Restore per-shell accent palettes** — either feed shell-specific preset lists into `settings/shells.gleam:62-69` (cobalt for Editorial, Metro cyan/lime/gold for Panorama) or at least set shell-specific defaults instead of the single `#d4a373` in `model.gleam:154`. Effort **M**, impact **medium** (brand identity of both shells).
12. **Add a global `:focus-visible` ring** — e.g. `outline: 2px solid var(--omni-accent-primary); outline-offset: 2px` for `button, [tabindex], a, .omni-button, .omni-tab, .omni-input, .omni-select, .omni-textarea` in `assets/styles/schema.css`/`shell-modules.css`. Effort **S**, impact **medium** (keyboard users; pre-existing gap).
13. **Style the emitted-but-unstyled primitives** — `.omni-card-header-action`, `.omni-input-with-prefix`, `.omni-input-prefix-icon`, `.omni-input-clearable`, `.omni-metric-trend(-*)`, `.omni-status-pulse` (alias to `.omni-pulse` animation), `.omni-empty-state-action`. Effort **S**, impact **low-medium**.
14. **Guard animation on reduced motion** — extend the `prefers-reduced-motion` block to `classic.css` and `shell-modules.css` (spinners/toasts/context menus). Effort **S**, impact **low-medium**.
15. **Prune or re-wire dead shell CSS** — ~62 editorial and ~47 panorama class names (plus most of `.mobile-dock`/`.feed-*` in `classic.css`) are unused; either wire the Gleam views to the richer existing markup or delete the dead blocks to prevent drift. Effort **L**, impact **low** (maintainability, bundle size).
16. **Raise the mobile menu / dock touch target and align breakpoints** — `shell-modules.css:33-46` menu button padding and the 760px vs 768px mismatch (`shell-modules.css:1279`). Effort **S**, impact **low**.
