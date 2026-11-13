# Shell Chrome & Layout Parity

## Summary

- **The new `classic` shell is a third built-in theme that did not exist in OLD.** OLD shipped only `editorial` and `panorama` as built-ins plus a curated `mantra` catalog. The new `classic` is referenced in `gleam/shell/src/omni/shell/registry.gleam:13`, `gleam/shell/src/omni/shell/settings/shells.gleam:28`, `gleam/shell/src/omni/shell/styles.gleam:21`, and `gleam/interop/src/omni/interop/shell_boot.gleam:1037`. Removing it touches 6+ files and 3 CSS/theme paths.
- **The header search button is missing in NEW.** OLD `editorial-shell.ts` renders `#btn-editorial-search` in the header (`editorial-shell.ts:2051-2082`) and wires `wireHeaderControls` (`editorial-shell.ts:1578-1580`). NEW `editorial.gleam` renders no search button in the header (`editorial.gleam:88-137`).
- **The new app index is a "store" with a single catalog view, not a "broadsheet apps index" with grid/ledger, pinned/unpinned sections, and per-app search.** OLD `editorial-shell.ts` has `renderAppsIndex` with `#editorial-apps-search-input`, `#editorial-apps-view-grid`, `#editorial-apps-view-ledger`, pinned/unpinned sections (`editorial-shell.ts:1375-1500`). NEW `app_store.gleam` renders `render_app_store` with a single `#input-app-store-search` and a single grid (`app_store.gleam:155-260`).
- **The new "shell manager" is a read-only built-in list.** OLD `editorial-shell.ts` calls `renderShellManager` → `renderInstalledShellsList` + `renderCuratedShellCatalog` (`editorial-shell.ts:1771-1782`). NEW `shells.gleam` `render_shells_panel` only renders `builtin_shells()` (`shells.gleam:73-113`).
- **The new navigation is a simple `back_stack` list; OLD had a full `NavigationManager` with intent coalescing, deduplication, root-frame hydration, and browser history sync.** OLD `navigation-manager.ts:1-350`; NEW `model.gleam:117` (`back_stack: List(Page)`) and `update.gleam:120-130`.
- **The new pull-to-refresh threshold is 72px vs OLD 50px.** OLD `pull-to-refresh.ts:33` (`threshold = 50`); NEW `pull_to_refresh.gleam:20` (`threshold_px = 72.0`).
- **The new plugin update modal is a read-only confirmation dialog with no file upload or URL fetch.** OLD `plugin-update-modal.ts` has a `.zip`/`.html` dropzone, file input, and "Fetch Update" URL (`plugin-update-modal.ts:1-161`). NEW `update_modal.gleam` only renders `ConfirmPluginUpdate` / `DismissUpdateModal` (`update_modal.gleam:1-123`).
- **The new app store has no "featured" or "curated" section UI; OLD app-store-catalog had a curated `CURATED_APPS` list with categories and install.** OLD `app-store-catalog.ts:1-100`; NEW `app_store.gleam:1-100` (`curated_catalog()`).
- **The new shell has no notification/toast, no keyboard shortcuts, no scroll restoration, no mobile menu in `editorial`/`panorama`, and no "exit fullscreen" button.** NEW only has a `mobile_menu` in `classic.gleam:106-176`; OLD `editorial-shell.ts` has no hamburger but has a floating exit button and Escape handling (`editorial-shell.ts:300-330`).
- **The new shell has no PWA/install prompt or service worker in the shell layer; the OLD base shell had a `manifest` and `beforeinstallprompt`-style logic.** NEW `boot.gleam` has no service worker; `installer.gleam` handles plugin manifests, not PWA install.

## Detailed Differences

### 1. Window Chrome Structure

| Aspect | OLD (file:line) | NEW (file:line) | Status |
|---|---|---|---|
| Header bar | `editorial-shell.ts:2051-2082` (`editorial-header`), `panorama-shell.ts:526-549` (`panorama-hero-header`) | `editorial.gleam:88-137` (`render_header`), `panorama.gleam:69-82` (`render_header`), `classic.gleam:74-104` (`render_header`) | PRESENT-PARITY |
| Brand/logo | `editorial-shell.ts:2062-2065` (`editorial-brand-container`, `OMNI`), `panorama-shell.ts:526-549` | `editorial.gleam:104-120` (`editorial-brand-container`, `OMNI`), `panorama.gleam:74-80` (pivot nav), `classic.gleam:90-100` (`brand-logo`) | PRESENT-PARITY |
| Back button | `editorial-shell.ts:2054` (`#btn-editorial-back`), `panorama-shell.ts` (`#btn-panorama-back`) | `header_actions.gleam:32-45` (`render_back_button`), `classic.gleam:92`, `panorama.gleam:77` | PRESENT-PARITY |
| Search button | `editorial-shell.ts:1578-1580` (`#btn-editorial-search`), `editorial-shell.ts:2051` | **No `render_search_button` in `header_actions.gleam:32-167`** | MISSING |
| Settings button | `editorial-shell.ts:2074` (`#btn-editorial-settings`) | `editorial.gleam:91-100` (`btn-editorial-dock-settings`), `classic.gleam:92` (`render_header_actions`) | PRESENT-PARITY |
| Profile avatar | `editorial-shell.ts:2077-2079` (`#btn-editorial-profile-toggle`), `panorama-shell.ts:541-545` | `editorial.gleam:136-186` (`render_profile_avatar`), `panorama.gleam:179-220` (`render_profile_tile`), `header_actions.gleam:125-160` (`render_profile_button`) | PRESENT-PARITY |
| Fullscreen toggle | `editorial-shell.ts:2069` (`#btn-editorial-toggle-fullscreen`) | `editorial.gleam:125-135` (`#btn-editorial-toggle-fullscreen`), `header_actions.gleam:110-125` (`#btn-shell-toggle-fullscreen`) | PRESENT-PARITY |
| Exit fullscreen button | `editorial-shell.ts:2090-2096` (`#btn-editorial-exit-fullscreen`) | **No `exit_fullscreen` element in `editorial.gleam`** | MISSING |
| Theme toggle | `editorial-shell.ts:2074` + `renderShellManager` (theme mode in settings) | `editorial.gleam:88-137` (no theme toggle in header); `shells.gleam:180-200` (`theme_mode_button`) | DIFFERENT-VISUAL |
| Install button | `editorial-shell.ts:2074` (install via settings) | `editorial.gleam:88-137` (no install button); `app_store.gleam:155-260` (install via store) | DIFFERENT-VISUAL |
| Notifications | `editorial-shell.ts:2074` (no notification button in header) | **No notification icon in `header_actions.gleam` or `editorial.gleam`** | MISSING |

The OLD header renders a **left back button**, a **center brand**, and a **right settings + profile + fullscreen** cluster. The NEW header renders a **left back button**, a **center brand**, and a **right settings + fullscreen + profile** cluster. The OLD `editorial-shell.ts` has a **search button** (`#btn-editorial-search`) in the header; the NEW `editorial.gleam` has no search button. The OLD has a **floating exit fullscreen** button; the NEW `editorial.gleam` only has a toggle. The NEW `classic` header has a **mobile hamburger** and a **brand tag**; the OLD `editorial`/`panorama` have no hamburger.

### 2. Navigation

| Aspect | OLD (file:line) | NEW (file:line) | Status |
|---|---|---|---|
| Desktop dock | `editorial-shell.ts:2199-2200` (`editorial-dock`), `editorial-shell.ts:716-789` (`renderDock`) | `editorial.gleam:246-312` (`render_dock`), `dock.gleam:1-117` (`render_dock`) | PRESENT-PARITY |
| Dock items | `editorial-shell.ts:716-789` (pinned apps + Apps + Widgets + Settings) | `editorial.gleam:246-312` (dock apps + Apps + Widgets + Settings) | PRESENT-PARITY |
| Dock order | `editorial-shell.ts:716-789` (pinned apps, Apps, Widgets, Settings) | `editorial.gleam:246-312` (pinned apps, Apps, Widgets, Settings) | PRESENT-PARITY |
| Active indicator | `editorial-shell.ts:724` (`editorial-active-dot`), `editorial-shell.ts:748` | `editorial.gleam:312-340` (`editorial-active-dot`) | PRESENT-PARITY |
| Badges | `editorial-shell.ts:740-760` (no badge on dock items) | `editorial.gleam:312-340` (no badge) | PRESENT-PARITY |
| Overflow ("more") | **No overflow menu in `editorial-shell.ts:716-789`** | **No overflow menu in `dock.gleam:1-117`** | MISSING |
| Mobile hamburger | **No hamburger in `editorial-shell.ts`; only `panorama-shell.ts:810` (`panorama-app-bar-menu`)** | `classic.gleam:106-176` (`render_mobile_menu`), `classic.gleam:80` (`btn-shell-mobile-menu`) | EXTRA-IN-NEW |
| Mobile menu contents | **No mobile menu in `editorial-shell.ts`; `panorama-shell.ts:810` has a hidden app bar** | `classic.gleam:106-176` (dock apps + Widgets + Apps + Settings) | EXTRA-IN-NEW |
| Dock auto-hide | `editorial-shell.ts:1827-1835` (`dock-hidden` on scroll) | **No `dock-hidden` in `editorial.gleam:246-312`** | MISSING |

The OLD dock has a **smart reading auto-hide** behavior (`dock-hidden` class) based on scroll direction (`editorial-shell.ts:1827-1835`). The NEW `editorial.gleam` dock has no such behavior. The NEW `classic` shell has a **mobile menu** that the OLD `editorial`/`panorama` did not have. The OLD `panorama` has a hidden `panorama-app-bar-menu` (`panorama-shell.ts:810`) but no full mobile menu.

### 3. Viewport System

| Aspect | OLD (file:line) | NEW (file:line) | Status |
|---|---|---|---|
| Named viewports | `viewports.ts:1-20` (`STANDARD_SLOTS`, `STANDARD_VIEWPORTS`) | `viewport.gleam:1-20` (`is_valid`), `model.gleam:52-58` (`PlacementConfig`) | PRESENT-PARITY |
| Slot mounting | `layout-manager.ts:1-100` (`registerPlugin`, `setComponentSlot`) | `viewport_host.gleam:1-66` (`render_slot_anchor`, `render_embedded_or_island`) | PRESENT-PARITY |
| Full-page app | `editorial-shell.ts:1000-1100` (`ensureAppContainer`, `openApp`) | `editorial.gleam:210-240` (`render_active_page`), `viewport_host.gleam:1-66` | PRESENT-PARITY |
| Widget dashboard grid | `editorial-shell.ts:1200-1300` (`renderWidgetsView`), `widgets-grid` (CSS) | `widgets_grid.gleam:1-99` (`render_widgets_grid`) | PRESENT-PARITY |
| Grid columns | `editorial-shell.ts:1200-1300` (CSS) | `widgets_grid.gleam:1-99` (CSS `omni-widgets-grid`) | PRESENT-PARITY |
| Sidebar behavior | `editorial-shell.ts:1200-1300` (`getContainerForPluginSlot` for `sidebar`) | `widgets_grid.gleam:1-99` (`render_widget_card`), `header_actions.gleam:100-130` | PRESENT-PARITY |
| Header status slot | `viewports.ts:10` (`header-status`) | **No `header-status` slot in `model.gleam:52-58` or `viewport_host.gleam`** | MISSING |

The OLD viewport system defines `header-status` as a slot (`viewports.ts:10`); the NEW viewport model only defines `Main`, `Sidebar`, `Dock`, `HeaderActions` (`model.gleam:52-58`). The `header-status` slot is missing in NEW.

### 4. Theme / Shell System

| Aspect | OLD (file:line) | NEW (file:line) | Status |
|---|---|---|---|
| Built-in shells | `shell-registry.ts:18-40` (`editorial`, `panorama`) | `registry.gleam:35` (`editorial`, `panorama`, `classic`) | EXTRA-IN-NEW |
| Curated shells | `shell-registry.ts:42-60` (`mantra`) | **No curated catalog in `shells.gleam:26-73`** | MISSING |
| Shell switching UI | `editorial-shell.ts:1771-1782` (`renderShellManager`), `shell-manager-ui.ts` | `shells.gleam:73-113` (`render_shells_panel`), `tabs.gleam:196` (`TabShells`) | PRESENT-PARITY |
| Persistence keys | `shell-registry.ts:18-19` (`STORAGE_KEY_INSTALLED`, `STORAGE_KEY_ACTIVE`) | `registry.gleam:22` (`active_shell_storage_key`), `registry.gleam:80` (`load_and_persist_active_id`) | PRESENT-PARITY |
| Custom shell install | `shell-registry.ts:100-150` (`install`, `uninstall`, `loadPersistedShells`) | **No custom shell install in `shells.gleam`; only `builtin_shells()`** | MISSING |
| Theme mode | `editorial-shell.ts:114-160` (`STORAGE_KEY_EDITORIAL_MODE`, `setThemeMode`) | `shells.gleam:200-225` (`theme_mode_button`), `model.gleam:117` (`theme_mode`) | PRESENT-PARITY |
| Accent colors | `editorial-shell.ts:120-160` (`EDITORIAL_ACCENTS`, `setAccent`) | `shells.gleam:80-90` (`accent_presets`), `model.gleam:117` (`accent_color`) | PRESENT-PARITY |

The OLD `shell-registry.ts` has `BUILTIN_SHELLS` with `editorial` and `panorama`, plus `CURATED_SHELLS` with `mantra`. The NEW `registry.gleam` has `builtin_themes()` with `editorial`, `panorama`, and `classic`. The NEW `classic` shell is an **extra** that the OLD did not have. The OLD `ShellRegistry` has a custom shell install/install-from-storage mechanism (`install`, `uninstall`, `loadPersistedShells`); the NEW `shells.gleam` only has `builtin_shells()`, no custom install.

### 5. Back Navigation

| Aspect | OLD (file:line) | NEW (file:line) | Status |
|---|---|---|---|
| Back stack | `navigation-manager.ts:1-350` (`NavigationManager` with `push`, `back`, `forward`, `jumpTo`, `handlePopState`) | `model.gleam:117` (`back_stack: List(Page)`), `update.gleam:120-130` (`NavigateBack`) | DIFFERENT-BEHAVIOR |
| Intent coalescing | `navigation-manager.ts:100-150` (`markIntentEntry`, `intentEntry`) | **No `intentEntry` in `model.gleam`** | MISSING |
| Deduplication | `navigation-manager.ts:200-300` (`sameExplicitPage`, `sameNonEmptyUrl`, `sameStateAndUrl`) | **No deduplication in `update.gleam:120-130`** | MISSING |
| Browser history sync | `navigation-manager.ts:300-350` (`window.history.pushState`, `popstate`) | `shell_boot.gleam:198-230` (`page_url`, `msg_from_url`), `mount_dom` | PRESENT-PARITY |
| Root-frame hydration | `navigation-manager.ts:150-200` (`Initial Root Page Hydration`) | **No root-frame hydration in `update.gleam`** | MISSING |

The OLD `NavigationManager` is a sophisticated stack with **intent coalescing**, **deduplication**, **root-frame hydration**, and **browser history sync**. The NEW `back_stack` is a simple `List(Page)` with no coalescing or deduplication. The browser history is handled by `shell_boot.gleam` (`msg_from_url`, `page_url`), but the stack logic is not.

### 6. Pull-to-Refresh

| Aspect | OLD (file:line) | NEW (file:line) | Status |
|---|---|---|---|
| Threshold | `pull-to-refresh.ts:33` (`threshold = 50`) | `pull_to_refresh.gleam:20` (`threshold_px = 72.0`) | DIFFERENT-BEHAVIOR |
| Max distance | `pull-to-refresh.ts:80` (`Math.min(90, diffY * 0.5)`) | `pull_to_refresh.gleam:22` (`max_distance_px = 120.0`) | DIFFERENT-BEHAVIOR |
| State machine | `pull-to-refresh.ts:40-200` (controller with `onTouchStart`, `onTouchMove`, `onTouchEnd`) | `pull_to_refresh.gleam:1-136` (pure state machine) | DIFFERENT-BEHAVIOR |
| Trigger | `pull-to-refresh.ts:200` (`onRefresh()` after 280ms) | `pull_to_refresh.gleam:100-110` (`StartPullRefresh` message) | PRESENT-PARITY |

The OLD pull-to-refresh uses a **50px threshold** and **90px max**; the NEW uses **72px** and **120px max**. The OLD uses a **controller** with a direct `onRefresh` callback; the NEW uses a **pure state machine** emitting a `StartPullRefresh` message. The OLD triggers `onRefresh()` after 280ms; the NEW emits `StartPullRefresh` immediately.

### 7. App Store / Plugin Catalog

| Aspect | OLD (file:line) | NEW (file:line) | Status |
|---|---|---|---|
| Browse | `app-store-catalog.ts:1-100` (`CURATED_APPS`) | `app_store.gleam:1-100` (`curated_catalog()`) | PRESENT-PARITY |
| Featured | `app-store-catalog.ts:1-100` (no "featured" section) | `app_store.gleam:1-100` (no "featured" section) | PRESENT-PARITY |
| Install from URL | `app-store-catalog.ts:1-100` (no install) | `app_store.gleam:155-260` (`custom_url_to_installed_app`) | EXTRA-IN-NEW |
| Install from naddr | `base-shell.ts:1450-1550` (`resolveAndInstallNsite`) | `app_store.gleam:155-260` (`custom_url_to_installed_app`) | PRESENT-PARITY |
| Install from kind | `base-shell.ts:1450-1550` (`resolveAndInstallNsite`) | `app_store.gleam:155-260` (`custom_url_to_installed_app`) | PRESENT-PARITY |
| Uninstall | `base-shell.ts:1600-1700` (`uninstallPlugin`) | `update.gleam:350-380` (`UninstallApp`) | PRESENT-PARITY |
| Update prompts | `base-shell.ts:1700-1800` (`openUpdatePluginModal`) | `update_modal.gleam:1-123` | PRESENT-PARITY |

The OLD app store has a **curated `CURATED_APPS` list** (`app-store-catalog.ts:1-100`) and no explicit "install from URL" in the app store itself. The NEW app store has a **custom install URL** (`app_store.gleam:155-260`) and a **search** (`app_store.gleam:155-260`). The OLD app store has a **uninstall** and **update prompt** in the base shell; the NEW app store has **uninstall** and **update** in `update.gleam` and `update_modal.gleam`.

### 8. Plugin Update Modal

| Aspect | OLD (file:line) | NEW (file:line) | Status |
|---|---|---|---|
| File upload | `plugin-update-modal.ts:1-161` (`#update-file-input`, `#update-zip-dropzone`) | **No file upload in `update_modal.gleam`** | MISSING |
| URL fetch | `plugin-update-modal.ts:1-161` (`#update-url-input`, `#btn-fetch-update-url`) | **No URL fetch in `update_modal.gleam`** | MISSING |
| Changelog | `plugin-update-modal.ts:1-161` (no changelog) | `update_modal.gleam:1-123` (changelog display) | EXTRA-IN-NEW |
| Confirm button | `plugin-update-modal.ts:1-161` (`#btn-confirm-plugin-update`) | `update_modal.gleam:1-123` (`#btn-confirm-plugin-update`) | PRESENT-PARITY |
| Later button | `plugin-update-modal.ts:1-161` (`#btn-update-later`) | `update_modal.gleam:1-123` (`#btn-update-later`) | PRESENT-PARITY |

The OLD plugin update modal has a **`.zip`/`.html` dropzone**, **file input**, and **"Fetch Update" URL**. The NEW `update_modal.gleam` only has a **confirmation dialog** with **changelog** display. The OLD has **file upload** and **URL fetch**; the NEW has **changelog** but no file/URL.

### 9. PWA Behavior

| Aspect | OLD (file:line) | NEW (file:line) | Status |
|---|---|---|---|
| Manifest | `base-shell.ts:31` (`manifest?`), `base-shell.ts:619` (`plugin.manifest?.components?.[0]?.slot === "main"`) | `installer.gleam:2` (`manifest`), `installer.gleam:120` (`fetch_manifest`) | PRESENT-PARITY |
| Service worker | **No service worker in `base-shell.ts`** | **No service worker in `boot.gleam`** | MISSING |
| Install prompt | **No `beforeinstallprompt` in `base-shell.ts`** | **No `beforeinstallprompt` in `boot.gleam`** | MISSING |
| PWA | **No explicit PWA in `base-shell.ts`** | **No explicit PWA in `boot.gleam`** | MISSING |

The OLD `base-shell.ts` has a `manifest` field and `installedPlugins` but no explicit PWA or service worker. The NEW `installer.gleam` handles plugin manifests, but no PWA or service worker. The PWA install prompt is missing in both.

### 10. Chrome-Level Behavior Absent in NEW

| Aspect | OLD (file:line) | NEW (file:line) | Status |
|---|---|---|---|
| Keyboard shortcuts | `editorial-shell.ts:300-330` (`boundKeydownHandler`, Escape), `editorial-shell.ts:1578-1580` | **No keyboard handling in `editorial.gleam`** | MISSING |
| Toast notifications | `editorial-shell.ts:1578-1580` (`showIntentEnableToast`), `permissions-intents-ui.ts:448` | **No toast in `editorial.gleam`** | MISSING |
| Focus handling | `editorial-shell.ts:1578-1580` (`wireHeaderControls`) | **No focus handling in `editorial.gleam`** | MISSING |
| Scroll restoration | `editorial-shell.ts:1827-1835` (`boundScrollHandler`, `dock-hidden`) | **No scroll handling in `editorial.gleam`** | MISSING |
| Route/URL handling | `editorial-shell.ts:1578-1580` (`handlePopState`), `navigation-manager.ts:1-350` | `shell_boot.gleam:198-230` (`msg_from_url`, `page_url`) | PRESENT-PARITY |
| Deep links | `editorial-shell.ts:1578-1580` (`handleUri`), `base-shell.ts:1450-1550` | `shell_boot.gleam:198-230` (`msg_from_url`) | PRESENT-PARITY |
| Theme sync | `editorial-shell.ts:300-330` (`applyThemeMode`) | `shells.gleam:200-225` (`theme_mode_button`) | PRESENT-PARITY |
| Mobile settings select | `editorial-shell.ts:2227` (`#editorial-settings-mobile-select`) | **No mobile settings select in `editorial.gleam`** | MISSING |
| Back to top | `editorial-shell.ts:1827-1835` (`#editorial-back-to-top`) | **No back-to-top in `editorial.gleam`** | MISSING |
| Fullscreen exit | `editorial-shell.ts:2090-2096` (`#btn-editorial-exit-fullscreen`) | **No fullscreen exit in `editorial.gleam`** | MISSING |

The OLD `editorial-shell.ts` has **Escape key handling**, **back-to-top**, **smart dock auto-hide**, and a **mobile settings select**. The NEW `editorial.gleam` has none of these. The NEW `classic.gleam` has a **mobile menu** but the OLD `editorial`/`panorama` did not.

## Classic Shell Removal Notes

The NEW `classic` shell is a **built-in third theme** that did not exist in OLD. It is referenced in:

1. **`gleam/shell/src/omni/shell/themes/classic.gleam`** — the entire file. `theme()` at `classic.gleam:34-45`, `view()` at `classic.gleam:48-70`, `render_header()` at `classic.gleam:74-104`, `render_mobile_menu()` at `classic.gleam:106-176`, `render_mobile_menu_item()` at `classic.gleam:150-176`.
2. **`gleam/shell/src/omni/shell/registry.gleam:13`** — `import omni/shell/themes/classic`. `builtin_themes()` at `registry.gleam:35` returns `[editorial.theme(), panorama.theme(), classic.theme()]`.
3. **`gleam/shell/src/omni/shell/settings/shells.gleam:28`** — `builtin_shells()` includes a `ShellInfo` for `"classic"` with `name: "Omni Classic"` at `shells.gleam:50-55`.
4. **`gleam/shell/src/omni/shell/styles.gleam:21`** — `classic_css_path = "assets/styles/classic.css"` at `styles.gleam:21`. `stylesheet_path()` at `styles.gleam:35` returns `"classic" -> Some(classic_css_path)`. `shell_stylesheet_path()` at `styles.gleam:45` returns `"classic" -> classic_css_path`.
5. **`gleam/interop/src/omni/interop/shell_boot.gleam:1037`** — comment `The active shell theme ID ("classic", "panorama", "editorial")`.
6. **`gleam/shell/src/omni/shell/theme.gleam:3`** — comment `All shell themes (classic, panorama, editorial, and custom installed shells)`.

**What breaks if removed:**
- `builtin_themes()` will return 2 themes; `registry.gleam` will fail to compile if `classic` is not removed from the import list.
- `shells.gleam` `builtin_shells()` will return 2 shells; the `ShellInfo` for `classic` must be removed.
- `styles.gleam` `classic_css_path` must be removed or `stylesheet_path`/`shell_stylesheet_path` will return `None` for `"classic"`.
- Any code that calls `styles.shell_stylesheet_path("classic")` will return `None` (if not handled).
- `classic.gleam` will be orphaned; `render_mobile_menu`, `render_header`, `render_mobile_menu_item` are all in `classic.gleam` and will be unused.

**Storage/default implications:**
- `registry.gleam` `default_shell_id = "editorial"` (`registry.gleam:22`). If `classic` is removed, the default remains `editorial`.
- `active_shell_storage_key = "omni_active_shell_id"` (`registry.gleam:22`). If a user has `classic` stored, `load_active_id` (`registry.gleam:80`) will ignore it because `classic` is not in `shells` (the `load_active_id` function checks `dict.has_key`).
- `shells.gleam` `builtin_shells()` returns `[editorial, panorama, classic]`. Removing `classic` means the settings UI shows 2 built-in shells.

**Recommended fix:**
1. Remove `classic` from `registry.gleam` `builtin_themes()` and the `import omni/shell/themes/classic`.
2. Remove `classic` from `shells.gleam` `builtin_shells()`.
3. Remove `classic_css_path` from `styles.gleam` and the `"classic"` cases in `stylesheet_path`/`shell_stylesheet_path`.
4. Delete `classic.gleam` (or move the `render_mobile_menu` to a new location if the mobile menu is needed).
5. Update `theme.gleam` comment.
6. Update `shell_boot.gleam` comment.

## Prioritized Restoration List

1. **Restore header search button** (`#btn-editorial-search`). Location: `editorial.gleam` `render_header` (88-137). Add `header_actions.render_search_button` or a `render_search_button` in `header_actions.gleam`. Effort: S. Impact: users lose the search affordance in the header.
2. **Restore apps index search/filter and grid/ledger views** (`#editorial-apps-search-input`, `#editorial-apps-view-grid`, `#editorial-apps-view-ledger`). Location: `editorial.gleam` `render_app_store` (210-240) or `app_store.gleam` (155-260). Effort: M. Impact: users lose the app index search and view mode.
3. **Restore shell manager (custom installs, curated catalog)**. Location: `shells.gleam` `render_shells_panel` (73-113). Effort: M. Impact: users lose ability to install custom shells and browse the curated catalog.
4. **Restore plugin update file upload and URL fetch** (`#update-file-input`, `#update-url-input`, `#btn-fetch-update-url`). Location: `update_modal.gleam` (1-123). Effort: M. Impact: users lose ability to update from `.zip`/`.html` or URL.
5. **Restore smart dock auto-hide** (`dock-hidden`). Location: `editorial.gleam` `render_dock` (246-312). Effort: S. Impact: users lose the reading-focused dock auto-hide.
6. **Restore back-to-top button** (`#editorial-back-to-top`). Location: `editorial.gleam` `render_active_page` (210-240). Effort: S. Impact: users lose the back-to-top affordance.
7. **Restore fullscreen exit button** (`#btn-editorial-exit-fullscreen`). Location: `editorial.gleam` `render_header` (88-137). Effort: S. Impact: users lose the fullscreen exit.
8. **Restore keyboard Escape handling** (`Escape` closes fullscreen, settings, profile drawer, open-with modal). Location: `editorial.gleam` (88-137) or `shell_boot.gleam` `mount_dom`. Effort: S. Impact: users lose Escape to close.
9. **Restore mobile settings select** (`#editorial-settings-mobile-select`). Location: `tabs.gleam` or `editorial.gleam`. Effort: S. Impact: users lose mobile settings tab switching.
10. **Restore toast notifications** (`showIntentEnableToast`). Location: `editorial.gleam` or `permissions.gleam`. Effort: S. Impact: users lose intent enable toast.
11. **Restore navigation intent coalescing and deduplication**. Location: `model.gleam` `back_stack` (117) and `update.gleam` `NavigateBack` (120-130). Effort: L. Impact: users lose proper back navigation (duplicate frames, phantom roots).
12. **Restore PWA service worker and install prompt**. Location: `boot.gleam` or `web/installer.gleam`. Effort: M. Impact: users lose PWA installability.
13. **Restore pull-to-refresh threshold 50px and max 90px**. Location: `pull_to_refresh.gleam` (20, 22). Effort: S. Impact: users lose the old pull-to-refresh feel.
14. **Restore `header-status` slot**. Location: `model.gleam` (52-58) and `viewport_host.gleam` (1-66). Effort: S. Impact: users lose header status placements.
15. **Restore curated app store "featured" and "curated" sections**. Location: `app_store.gleam` (1-100). Effort: S. Impact: users lose curated sections.
