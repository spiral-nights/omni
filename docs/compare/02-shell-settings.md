# Settings Parity

Audit of the SETTINGS experience between the TypeScript/MoonBit app at `/tmp/omni-develop` (`develop`) and the Gleam rewrite at `/home/spiralnights/code/omni` (`gleam-rewrite`). The OLD app ships two settings surfaces: a three-tab modal in the Editorial shell and an untabbed "System" pivot in the Panorama shell. The NEW app has one shared settings page used by all three shells.

## Summary

- **The top-of-page buttons are materially different.** OLD Editorial has exactly **3 settings tabs** (`Appearance & Shells`, `Plugins & Viewports`, `Workspace & Sync`). NEW has **5 static tabs** (`Profile & Keys`, `Relays & Scoping`, `Apps & Permissions`, `Workspace & Viewports`, `Shells & Theme`) **plus one dynamic tab per app that declares `?view=settings`**. With the default 7 installed apps, 6 declare a settings view, so the NEW top bar renders **11 buttons**.
- **OLD nests per-app configuration inside one expandable "Installed Plugins" card.** Each app card contains, in order: placements and routes, custom plugin settings, relay access scoping, general permissions, Nostr write-kind permissions, and handled intents. NEW splits the same concerns across four different tabs and moves custom plugin settings into its own top-level tab.
- **NEW adds a much stronger key-custody surface** (export nsec, passphrase enable/remove/unlock, multi-account list). OLD only had "Switch Account by nsec/hex" and "Generate New Keypair" inside the separate Profile app's Keys tab.
- **NEW loses all editable capability grants.** OLD exposed toggles for `storage:kv`, `intents:dispatch`, `system:geolocation`, `nostr:read`, conditional `relays:manage` and `identity:manage_keys`, plus a full Nostr write-kind grant editor (wildcard, seven standard kinds, custom numeric kinds, revocation). NEW renders read-only status pills whose state is derived only from `app.enabled`.
- **NEW loses per-action default intent routing ("Default Applications").** OLD Panorama let the user choose a default handler per action (or "Prompt every time"). NEW has per-app intent enable/disable only, and never populates the `defaultIntents` workspace field.
- **NEW loses shell install/uninstall.** OLD had installed-shell cards, Activate, Uninstall for custom shells, a curated catalog ("Mantra"), and a custom shell installer (ID/Name/Description). NEW lists three hard-coded built-ins and can activate them only.
- **Theme fidelity regressed.** OLD Editorial offered Light / Dark / **System Automatic** and restored the choice. NEW offers Dark / Light only, and the Editorial theme hard-codes a second `data-theme-mode="dark"` attribute, so the selector cannot make Editorial light. OLD also restored the accent color; NEW persists it but never reads it back at boot.
- **Four of the six dynamic app settings tabs do not open a distinct settings view.** `relays`, `profiles`, `notes` and `publisher` declare `?view=settings` in config but their route parsers fall through to their main view (for Relays this means the normal Relay Pool Manager). Only `feed` and `checklist` implement dedicated settings views.
- **Relay management is richer in NEW** (read/write scopes, reconnect, NIP-65 publish, latency, validation banner) **but loses presets and Refresh**, and the plugin UI never seeds itself from the persisted relay pool.

## Top-Level Settings Organization: OLD vs NEW

### OLD Editorial (`base-shell` type + `editorial-shell` modal)

| # | Tab label | Icon | Purpose | Source |
|---|-----------|------|---------|--------|
| 1 | **Appearance** / sub-label **& Shells** | `layout` | Theme mode, accent illumination, installed shells | `editorial-shell.ts:2237-2241` |
| 2 | **Plugins** / sub-label **& Viewports** | `plugins` | Installed apps, placements, custom settings, relay scoping, permissions, intents | `editorial-shell.ts:2242-2246` |
| 3 | **Workspace** / sub-label **& Sync** | `cloud` | NIP-78 workspace sync | `editorial-shell.ts:2247-2251` |

The unused legacy type still lists four conceptual tabs (`profile`, `relays`, `plugins`, `workspace`) at `base-shell.ts:53`, but no shell renders them.

### OLD Panorama

No settings tab bar at all. "Settings & System" navigates to the `system` pivot (`panorama-shell.ts:2011-2020`), which stacks cards in this order:

| # | Section | Purpose | Source |
|---|---------|---------|--------|
| 1 | Identity card (name, npub) | Identity display | `panorama-shell.ts:584-594` |
| 2 | Installed Shells (count, Install Shell, quick switcher, cards) | Shell management | `panorama-shell.ts:596-618` |
| 3 | Accent Color (hex, custom picker, swatch grid) | Theme accent | `panorama-shell.ts:621-637` |
| 4 | Cloud Workspace Sync (Sync, Restore) | NIP-78 | `panorama-shell.ts:639-650` |
| 5 | Installed Plugins (+ Install nsite, count, list of expandable config cards) | Apps + all per-app settings | `panorama-shell.ts:652-662` |
| 6 | Default Applications (appended inside the plugin list) | Intent default routing | `panorama-shell.ts:1449`, `base-shell.ts:1801-1977` |

### NEW (all shells share `settings/tabs.gleam`)

| # | Tab label | Icon | Purpose | Source |
|---|-----------|------|---------|--------|
| 1 | **Profile & Keys** | `user` | Identity card, import/export key, passphrase, accounts | `settings/tabs.gleam:82-87` |
| 2 | **Relays & Scoping** | `relays` | Per-app relay access mode | `settings/tabs.gleam:89-94` |
| 3 | **Apps & Permissions** | `plugins` | Custom URL install, app enable/uninstall, capability status, intents | `settings/tabs.gleam:96-101` |
| 4 | **Workspace & Viewports** | `widgets` | NIP-78 auto-sync + sync now, companion placements | `settings/tabs.gleam:103-108` |
| 5 | **Shells & Theme** | `layout` | Shell switching, Dark/Light, accent palette | `settings/tabs.gleam:110-115` |
| 6..N | **<App name>** dynamic | app icon | One tab for every enabled app with a `settings` view | `settings/tabs.gleam:120-131`, `apps_with_settings_view` at `38-46` |

### Side-by-side mapping

| Concern | OLD location | NEW location | Status |
|---------|--------------|--------------|--------|
| Theme mode / accent | Editorial tab 1 "Appearance & Shells" | Tab 5 "Shells & Theme" | Moved |
| Shell switching | Editorial tab 1 §Installed Shells; Panorama system card | Tab 5 "Shells & Theme" | Moved, install/uninstall dropped |
| Identity / keys | Separate Profile app → Keys tab; Panorama identity card | Tab 1 "Profile & Keys" | Moved + expanded |
| Relay CRUD | Relays app | Relays app (no settings tab equivalence) | App-level only |
| Per-app relay scoping | Nested in each app card, Editorial tab 2 / Panorama §5 | Tab 2 "Relays & Scoping" | Moved + flattened |
| App lifecycle (update/pin/uninstall/enable) | In each app card | Split: Apps & Permissions (enable/uninstall/install URL) + Workspace & Viewports (pin) | Split, update missing |
| Custom plugin settings | Nested inline `Configure Settings` in each app card | Dynamic top-level app tab | Moved to top bar |
| Placements / routes | Nested in each app card | Tab 4 "Workspace & Viewports" | Moved + simplified |
| Capability grants | Nested in each app card | Tab 3 read-only pills | Regressed |
| Nostr write-kind grants | Nested in each app card | Tab 3 fixed kind badges only | Missing |
| Intents toggles | Nested in each app card | Tab 3 second panel | Moved |
| Default per-action handlers | Panorama §6 "Default Applications" | None | Missing |
| NIP-78 sync | Editorial tab 3; Panorama §4 | Tab 4 first card | Moved, Restore missing |
| App search / expand-all | Editorial tab 2 header | None | Missing |

## Top Toolbar / Buttons Comparison

| Aspect | OLD Editorial | OLD Panorama | NEW |
|---|---|---|---|
| Container | Centered modal overlay `#editorial-settings-modal` (`editorial-shell.ts:2210-2213`) | Full "system" pivot page (`panorama-shell.ts:581-662`) | Full page inside the active shell main area (`editorial.gleam:234-241`, `tabs.gleam:54-75`) |
| Page title | `Settings & Preferences` + uppercase subtitle `Appearance, Plugins, Viewports & Workspace` (`editorial-shell.ts:2214-2216`) | none (system pivot title bar only) | `Workspace & System Settings` (`tabs.gleam:67-69`) |
| Dismiss | Close X button `#btn-editorial-close-settings` (`editorial-shell.ts:2217-2219`), backdrop click (`1683`) | navigate away via pivots | Shell back arrow only when `back_stack` is non-empty (`header_actions.gleam:26-41`); no close button |
| Top tabs | **3**, each with icon + title + sub-label, uppercase mono (`editorial-shell.ts:2236-2252`) | **0** | **5 static + 1 dynamic per settings-declaring app**, icon + single label, pills (`tabs.gleam:79-140`) |
| Mobile navigation | Dedicated `<select>` "Section:" with the 3 tabs (`editorial-shell.ts:2224-2234`), shown at <=680px (`editorial-styles.ts:1278-1290`) | n/a | No dropdown; `.omni-settings-tabs { flex-wrap: wrap }` (`assets/styles/shell-modules.css:322-326`) lets 11 pills wrap |
| In-page actions | Page title + tabs only | Install Shell, Install nsite, Sync/Restore, custom color | No global actions; each panel has its own buttons |
| Tab styling | Uppercase mono, segmented square-ish buttons, active = elevated bg + accent (`editorial-styles.ts:1197-1243`) | n/a | Lowercase pill chips, active = accent border/text (`shell-modules.css:328-349`) |
| Total top-level buttons in default install | 3 | 0 (6 stacked sections) | **11** (5 + feed, checklist, notes, relays, profiles, publisher) |

The count of 11 follows from `config.gleam:32-239`: Feed, Checklist, Notes, Relays, Profiles and Publisher declare `ViewOption(id: "settings", path: "/?view=settings")`; Timer does not. `apps_with_settings_view` filters only on that declaration (`tabs.gleam:38-46`).

## Per-Tab Control Inventory

### Profile & Keys (NEW) ↔ Keys tab / identity card (OLD)

| Control | OLD (file:line) | NEW (file:line) | Type | Default | Persisted key | Status |
|---|---|---|---|---|---|---|
| Identity summary | Profile app Keys tab: Active Public Key metric + Keystore status + npub code block (`profile-schema.ts:437-472`); Panorama identity card (`panorama-shell.ts:584-594`) | Avatar, display name, full npub, optional NIP-05 (`tabs.gleam:190-230`) | display | — | — | Equivalent, NEW also shows NIP-05 here |
| NIP-05 display | Profile "my-profile" badge (`profile-schema.ts:603-611`); not in Keys tab | Same profile card (`tabs.gleam:211-215`) | display | none | — | Same data, moved into settings |
| Private key input | Text input `keyInput`, placeholder "nsec1... or 64-char hex private key to switch account" (`profile-schema.ts:479-483`) | `type=password` input `#input-import-key`, placeholder "nsec1... or hex private key" (`tabs.gleam:303-311`) | text vs password | empty | in-memory `key_input` | Different control type/label |
| Import/switch | Button "Switch Account" (`profile-schema.ts:490-494`) → `switch-key` action (`action-handler.ts:96-117`) | Button "Import Key" (`tabs.gleam:312-320`) → `ImportKeyEffect` (`update.gleam:497-505`; `shell_boot.gleam:302-316`) | button | — | keystore storage `omni_private_key` / account records | Same function, different label |
| Error/success messaging | none — `switch-key` wraps `authApi.switchKey` in `try/catch` with empty catch (`action-handler.ts:96-117`) | `key_message` text: "Key imported. Signing as the new identity." or keystore error string (`update.gleam:509-516`); errors include "Invalid secp256k1 private key", "Remove passphrase encryption before importing a new key" (`keystore.gleam:717-761`) | inline text | none | — | NEW better |
| Generate new keypair | Button "Generate New Keypair" (`profile-schema.ts:495-500`) → `generate-key` (`action-handler.ts:118-136`) | **none** | button | — | — | **Missing** |
| Export nsec | **none** in OLD UI | Button "Export nsec" (`tabs.gleam:321-328`) → `export_key_nsec` (`boot.gleam:590-592`), renders plaintext in `#exported-nsec` (`tabs.gleam:278-289`) | button + code box | hidden | — | **EXTRA-IN-NEW** |
| Passphrase protection | **none** in OLD UI | Status text, one password field, Enable/Remove/Unlock button (`tabs.gleam:391-480`) | password + button | unencrypted, unlocked | keystore `omni_key_encrypted` / salt | **EXTRA-IN-NEW** |
| Passphrase confirmation / strength | n/a | No repeat field, no minimum length; only rejects `""` (`update.gleam:519-530`) | n/a | — | — | NEW weak validation |
| Account list | **none**; only replace-by-paste | "Accounts" list of truncated hex, Active badge or Switch button (`tabs.gleam:340-383`) | list + button | active pubkey | keystore account records (`keystore.gleam:132`, `remember_account` in `switch_key_unencrypted`) | **EXTRA-IN-NEW** |
| Profile editing | Separate Profile app Edit tab (`profile-schema.ts:380-436`) | Not in Settings; copy tells user to open Profile app (`tabs.gleam:220-225`) | n/a | — | — | Same separation for NEW; OLD had no editor in settings either |

### Appearance & Shells (OLD) ↔ Shells & Theme (NEW)

| Control | OLD (file:line) | NEW (file:line) | Type | Default | Persisted key | Status |
|---|---|---|---|---|---|---|
| Theme mode | 3 buttons: `Papyrus (Light)`, `Obsidian (Dark)`, `System Automatic` (`editorial-shell.ts:2264-2273`); setter `setThemeMode` (`444-450`), system media query (`452-470`) | 2 buttons: `Dark`, `Light` (`shells.gleam:177-178`), `SetThemeMode` normalises anything not "light" to "dark" (`update.gleam:485-493`) | segmented buttons | OLD `"system"` (`editorial-shell.ts:103`); NEW `"dark"` (`model.gleam:118,154`) | OLD `omni_editorial_theme_mode` (`editorial-shell.ts:84,446`); NEW `omni_theme_mode` (`boot.gleam:84,373`) | **Missing System**; NEW persists but Editorial hard-codes dark (`themes/editorial.gleam:57-58`) so selector is a no-op there |
| Accent presets | Editorial 5 presets: Cobalt Glow, Terracotta, Saffron Ochre, Forest Pine, Monochrome Bone (`editorial-shell.ts:35-41`), swatches at `2288-2298` | 5 presets: Warm Sandstone, Terracotta, Sage Emerald, Cobalt Ink, Amber Ochre (`shells.gleam:62-70`), swatches at `106-129` | swatch buttons | OLD Cobalt `#1e40af` light / `#4d8eff` dark; NEW `#d4a373` (`model.gleam:154`) | OLD `omni_editorial_accent_id`, `..._color`, `..._name` (`editorial-shell.ts:85-87`); Panorama `omni_panorama_accent_color` (`panorama-shell.ts:72`); NEW `omni_accent_color` (`boot.gleam:81,368`) | Different presets/defaults; NEW value **is written but never loaded** (`boot.gleam` only calls `storage.set`, never `storage.get` for accent) |
| Custom accent | Native `<input type="color">` (`editorial-shell.ts:2300-2306`); Panorama custom color input (`panorama-shell.ts:628-634`) | Text hex input `#input-custom-accent-color` (`shells.gleam:186-197`) | color picker vs text | OLD `#1e40af`; NEW current accent | same accent key | Different control; no hex validation |
| Installed shells count | `3 installed` badge (`editorial-shell.ts:2316`); Panorama `#panorama-shell-count` (`panorama-shell.ts:601`) | `N installed` badge (`shells.gleam:144-150`) | badge | 2 builtins + curated in OLD; 3 builtins NEW | — | Equivalent |
| Quick shell switcher | Buttons for every shell (`shell-manager-ui.ts:37-54`) | Buttons `#btn-shell-<id>` (`shells.gleam:83-103`) | button row | active editorial | OLD `omni_active_shell` (`shell-registry.ts:78`); NEW `omni_active_shell_id` (`registry.gleam:20`) | Equivalent, key renamed |
| Shell cards | Card with icon, name, Active/Custom badges, author/version, description, Activate/Current, Uninstall (`shell-manager-ui.ts:61-126`) | Card with icon, name, Active/Built-in or Custom badges, author/version, description, Activate/Current (`shells.gleam:216-300`) | list of cards | — | registry | Uninstall **missing** |
| Install Shell | `+ Install Shell` button (`editorial-shell.ts:2318-2320`), curated catalog modal (`2375-2396`), custom shell form in Panorama (`panorama-shell.ts:759-783`; handler `shell-manager-ui.ts:237-263`) | **none** | button + modal | — | OLD `omni_installed_shells` (`shell-registry.ts:77`) | **Missing** |
| Curated shell catalog / uninstall | `Mantra` curated shell, Install Shell/Activate (`shell-registry.ts:47-65`, `shell-manager-ui.ts:129-190`); Uninstall with confirm (`shell-manager-ui.ts:117-123`) | **none**; only 3 built-ins (`shells.gleam:29-59`) | list | — | — | **Missing** |

### Plugins & Viewports (OLD) ↔ Apps & Permissions / Relays & Scoping / Workspace & Viewports (NEW)

| Control | OLD (file:line) | NEW (file:line) | Type | Default | Persisted key | Status |
|---|---|---|---|---|---|---|
| Plugin search | `#editorial-plugins-search-input` filters by name/id/description (`editorial-shell.ts:2338-2339`, filter `1871-1878`) | **none** | text filter | empty | — | **Missing** |
| Expand/collapse all | `Expand All Viewports` / `Collapse All` (`editorial-shell.ts:2340-2342`, handler `1749-1764`) | **none** | button | collapsed | — | **Missing** |
| App card | Icon, name, version, id, description, Update, Configure, Pin/Unpin, Uninstall (`editorial-shell.ts:1890-1915`) | Icon, name, version, id, description, Enable/Disable, Uninstall (`permissions.gleam:146-284`) | card | enabled | workspace | Different; Update/Pin moved or missing |
| Update app | `Update` button → `openUpdatePluginModal` (`editorial-shell.ts:1903,1937-1939`; Panorama `1134`) | **none in settings**; update modal only appears automatically when a newer version is resolved (`shell_boot.gleam:676-706`) | button | — | — | **Missing manual update control** |
| Pin / unpin | `Pin`/`Unpin` on every app card (`editorial-shell.ts:1909,1920-1925`) | `Pin to Dock` / `Pinned to Dock` (`placements.gleam:158-176`) | toggle button | OLD false; NEW `pinned` (`config`) | workspace `pinned` | Moved to Workspace & Viewports |
| Enable / disable app | Panorama header toggle per app (`panorama-shell.ts:1294-1310`) | `Disable`/`Enable` button (`permissions.gleam:247-258`) | toggle/button | enabled | workspace `enabled` | Equivalent |
| Uninstall | OLD Editorial button + `confirm` (`editorial-shell.ts:1912,1927-1931`); Panorama confirm (`panorama-shell.ts:1432-1436`) | Button, **no confirmation** (`permissions.gleam:261-271`; `UninstallApp` `update.gleam:296-330`) | button | — | workspace | Different: NEW lacks confirm |
| Install app from URL | Not in settings; app store/Panorama install modal (`panorama-shell.ts:712-735`) | Input + Install App (`permissions.gleam:110-148`) | text + button | empty | in-memory `custom_install_url` | **EXTRA-IN-NEW** in settings |
| Custom plugin settings | `Configure Settings` inline mount of `?view=settings` (`placements-ui.ts:283-350`; Editorial adds it `1992-2002`) | One dynamic top-level tab mounting `?view=settings` (`tabs.gleam:566-599`) | button / tab | collapsed | — | Moved out of app card |
| Relay access mode | Radio group: All Configured Relays / Custom Relays / Local Only (`relay-scoping-ui.ts:78-190`) | Three buttons: All Configured / Custom / Local Only (`relay_scoping.gleam:138-193`) | radio vs buttons | all relays | OLD workspace `relays` (`base-shell` export); NEW workspace `relays` (`model.gleam:267-292`) | Equivalent but restyled |
| Custom relay choices | Checkboxes for every relay in `kernel.relayPool.getAllRelays()` (`relay-scoping-ui.ts:92,158-180`) | Chips built from hard-coded 3 defaults + currently selected (`relay_scoping.gleam:27-30,198-230`) | checkbox vs chip | first pool relay | workspace | **Different source of truth**; configured relays outside the 3 defaults cannot be selected |
| General permissions | Toggle per capability: `storage:kv`, `intents:dispatch`, `system:geolocation`, `nostr:read`, conditional `relays:manage`, `identity:manage_keys` (`permissions-intents-ui.ts:570-617`, toggle handler `643-655`) | Read-only pills for `storage:kv`, `nostr:read`, `nostr:write`, `intents:dispatch`, granted strictly from `app.enabled` (`permissions.gleam:167-193`, `286-313`) | toggle vs status | OLD from manifest/grants; NEW all active when app enabled | OLD `omni_capability_grants` (`capability-store.ts:15`); NEW grants exist (`capability_store.gleam:22`) but settings never writes them | **Regressed**; geolocation/relays/identity omitted; no revocation |
| Nostr write-kind grants | Collapsible editor: wildcard "*", seven standard-kind checkboxes, custom numeric kind input, removable custom-kind pills, summary badge (`permissions-intents-ui.ts:55-296`) | Static "Governed Nostr Event Kinds" badges, no inputs (`permissions.gleam:195-205`) | checkbox set vs labels | OLD none/allKinds from grants; NEW fixed list | OLD `omni_capability_grants` scoped by kind; NEW none | **Missing** |
| Handled intents | Per-app checkbox per intent, with info disclosure (`permissions-intents-ui.ts:298-431`) | Per-app Enabled/Disabled toggle, description always visible (`intents.gleam:83-210`) | checkbox vs toggle | enabled | OLD workspace `disabledIntents`; NEW workspace `disabled_intents` | Equivalent |
| Clear plugin storage | Panorama `Clear Storage` (`panorama-shell.ts:1416-1424`) | **none** | button | — | — | **Missing** |
| Inspect plugin | Panorama `Inspect Plugin` (`panorama-shell.ts:1410-1414`) | **none** | button | — | — | **Missing** |

### Workspace & Sync (OLD tab 3 / Panorama card) ↔ Workspace & Viewports (NEW)

| Control | OLD (file:line) | NEW (file:line) | Type | Default | Persisted key | Status |
|---|---|---|---|---|---|---|
| Sync now | Editorial `Sync Workspace to Relays` (`editorial-shell.ts:2360-2362`, handler `1740-1750`); Panorama `Sync` (`panorama-shell.ts:646`) | `Sync Workspace Now` (`tabs.gleam:545-558`) → `TriggerWorkspaceSync` (`update.gleam:573-581`) | button | — | NIP-78 kind 30078, `d=omni/workspace/v1` | Equivalent |
| Restore from relays | Panorama `Restore` (`panorama-shell.ts:647`, handler `2434-2440`) calling `restoreWorkspaceFromNostr` (`base-shell.ts:1015-1035`) | **none** | button | — | — | **Missing** |
| Auto-sync | No visible checkbox; internal `autoSyncNip78 = true` (`base-shell.ts:151`), stale lookup of `#chk-auto-sync-workspace` (`892`) that is never rendered | Toggle `Auto-Sync Enabled/Disabled` (`tabs.gleam:521-543`) | toggle button | `true` (`model.gleam:155`) | workspace `auto_sync` (`model.gleam:291`) | **EXTRA-IN-NEW** (visible control) |
| Sync status | `updateSyncUi` text/dot (`base-shell.ts:1037-1060`) | Status pill Local Ready/Syncing/Synced/Sync Error (`tabs.gleam:507-513`, `format_sync_status` `602-608`) | text/pill | Local Ready | in-memory | Equivalent |
| Description | `kind: 30078, tag ["d","omni/workspace/v1"]` (`editorial-shell.ts:2357`) | Same kind/d tag (`tabs.gleam:503`) | text | — | — | Same |

### Relays (app-level, OLD relays plugin vs NEW `plugin_relays`)

| Control | OLD (file:line) | NEW (file:line) | Type | Default | Persisted key | Status |
|---|---|---|---|---|---|---|
| Sub-tabs | `Connected Relays` / `Add Relays` (`relays/src/index.ts:125-131`) | No sub-tabs, one page (`relays/view.gleam:96-229`) | tabs | Connected | — | Different |
| Pool metrics | Active Relay Pool metric + "All connected"/"x of y" (`index.ts:136-148`) | Connected Relays + Events Received metrics (`view.gleam:96-141`) | metric | — | — | Equivalent + extra |
| Refresh | `Refresh` button (`index.ts:163-169`) | **none** | button | — | — | **Missing** |
| Relay list | URL, connected status text, trash remove (`index.ts:186-208`) | Card per relay: status indicator, latency badge, received/sent, Read/Write toggles, Reconnect, Remove (`view.gleam:184-229`) | list | 3 bootstrap relays | OLD `omni_configured_relays` (`index.ts:45,58`); NEW relay pool `omni_configured_relays` (`relay_pool.gleam:74`) | NEW richer but plugin UI starts from `default_bootstrap_urls()` (`relays/model.gleam:69-73`) and never loads the pool |
| Read / Write scope per relay | **none**; subtitle always "Connected (Read / Write)" (`index.ts:192-194`) | `Read` and `Write` toggles per relay (`view.gleam:196-214`) → `SetRelayScope` (`update.gleam:46-64`) | toggle | both true | relay pool | **EXTRA-IN-NEW** |
| Reconnect | **none** | `Reconnect` per relay (`view.gleam:219-226`) | button | — | — | **EXTRA-IN-NEW** |
| Add relay | Input + `+ Add Relay` (`index.ts:211-228`) | Input + `Add Relay`, enter-to-add (`view.gleam:143-181`) | input + button | empty | relay pool | Equivalent |
| URL normalisation/validation | Auto-prepends `wss://` when scheme missing, strips trailing slashes (`index.ts:33-40`) | Requires `ws://`/`wss://`; errors "Invalid relay URL…" and "Relay is already in the pool: …" (`update.gleam:107-140`; `relay_url.gleam:30-40`) | validation | — | — | **Different**: `relay.damus.io` works OLD, errors NEW |
| Presets | Five one-click presets: Ditto, Damus, Nos.lol, Primal, Nostr.band (`index.ts:19-28`, rendered `218-235`) | **none** | buttons | — | — | **Missing** |
| NIP-65 publish | **no UI** (`nip65` only in core kernel) | `Publish NIP-65 Relay List` button (`view.gleam:107-120`; `update.gleam:83-95`) | button | — | kind 10002 | **EXTRA-IN-NEW** |
| Empty state | "0ms Local Offline Mode", action to Add Relays (`index.ts:176-184`) | "Local Offline Mode" banner (`view.gleam:183-190`) | banner | — | — | Equivalent |

## Identity / Keys / Accounts

OLD places identity custody in the Profile app (`profile-schema.ts:437-504`), not in the shell settings modal. The Keys tab has:

- Info banner "WebCrypto Keystore Custody (NIP-07)" (`437-443`).
- "Active Public Key" metric truncated to 10 chars and online/offline status (`445-464`).
- Full npub/pubkey code block (`466-472`).
- A **text** input for `nsec1…` or 64-char hex (`479-483`).
- **Switch Account** (`490-494`) and **Generate New Keypair** (`495-500`).
- Success/error feedback: none. `handleProfileViewerAction` wraps the auth call in `try { … } catch (_) {}` and does not surface failure (`action-handler.ts:96-117`, `118-136`).
- No export-nsec action, no passphrase, no account list. A repo-wide search for backup/export/passphrase controls in `packages/` returns no OLD custody UI.

NEW moves the whole flow into Settings → Profile & Keys (`tabs.gleam:183-480`):

- Avatar + display name + full npub + NIP-05 (`190-230`). NIP-05 was previously visible on the Profile page (`profile-schema.ts:603-611`), not in settings.
- Password input (`303-311`) with placeholder "nsec1... or hex private key", Import Key (`312-320`), Export nsec (`321-328`).
- Explicit status message via `key_message` (`update.gleam:509-516`), with keystore errors such as "Invalid secp256k1 private key" and "Remove passphrase encryption before importing a new key" (`keystore.gleam:717-761`).
- Passphrase section: encrypted+locked, encrypted+unlocked, or unencrypted messaging (`391-413`), single password field (`414-431`), Unlock (`432-447`), Remove (`448-458`), Enable (`459-470`). No confirm-passphrase field and no length rule (`update.gleam:519-536`).
- Accounts list of remembered keys (`340-383`), Active badge and Switch (`367-381`); keystore `remember_account` is called on import (`keystore.gleam:744`).
- Export renders the nsec in plaintext in a code block (`tabs.gleam:278-289`) and returns `Error("Keystore is locked. Unlock it with your passphrase.")` if locked (`keystore.gleam:328-335`). No copy button, reveal toggle, or confirmation.
- **Missing**: Generate New Keypair.

## Relays

Two distinct relay surfaces must be compared.

1. **Relay app**: OLD `packages/plugins/relays/src/index.ts` vs NEW `gleam/plugins/relays/...`. Details in the table above. OLD provides tabbed Connected/Add, Refresh, five presets, host-synced list, and removes relays. NEW provides a single page with per-relay Read/Write, Reconnect, latency, counters, NIP-65 publishing and validation banners, but no presets, no Refresh, no host sync, and a stricter URL parser that rejects scheme-less URLs.
2. **Per-app relay scoping** (Settings → Relays & Scoping): OLD's 3-mode radio box is nested inside every app card (`relay-scoping-ui.ts:78-190`); NEW promotes it to a top-level tab (`relay_scoping.gleam:41-195`). Behaviour is equivalent for All / Local Only. For Custom, OLD lists every pool relay (`relay-scoping-ui.ts:92`), while NEW only lists three hard-coded URLs plus whatever is already selected (`relay_scoping.gleam:27-30,202`), so a user cannot scope an app to a relay that is configured in Settings → Relays but is not one of the three defaults.

Persistence: OLD relay list writes `omni_configured_relays` (`index.ts:45,58`), relay scoping and per-app relay arrays go into `omni_workspace_state` via `saveLocalWorkspace` (`base-shell.ts:857-874`). NEW relays pool also persists `omni_configured_relays` (`relay_pool.gleam:74-92`) and per-app scoping lives in workspace state (`model.gleam:267-292`). However the NEW relay plugin initialises from `default_bootstrap_urls()` (`relays/model.gleam:69-75`) and `builtin.gleam:124-125` starts it without storage or pool seeding, so after reload the UI shows the three defaults, not the persisted pool. It also has no Refresh action to re-sync.

## Permissions & Intents

### Capability grants

OLD renders a per-app "Permissions & Capabilities" block (`permissions-intents-ui.ts:542-660`). It always lists:

- `storage:kv` — "Scoped Storage (KV)", quota in description (`570-575`).
- `intents:dispatch` — "Intent Dispatch" (`576-580`).
- `system:geolocation` — "Device Location (GPS)" (`581-585`).
- `nostr:read` — "Nostr Subscriptions (Read)" (`586-590`).
- `relays:manage` — conditionally when the manifest declares relays or the plugin is relay-related (`593-604`).
- `identity:manage_keys` — conditionally for identity/profile plugins (`606-617`).

Each row is an `omni-toggle` checkbox wired to `kernel.setPluginPermission(plugin.id, key, input.checked)` (`643-655`). Grants persist in `omni_capability_grants` (`capability-store.ts:15-37`); revocation is simply unchecking, which writes `deny`/removes the grant (`71-88`).

OLD also renders the collapsible "Nostr Publishing Permissions" editor (`permissions-intents-ui.ts:55-296`):

- Summary badge "All Kinds (*)", "N kind(s) allowed", or "None (Revoked)" (`86-95`).
- Wildcard checkbox "Allow All Event Kinds (* wildcard)" (`119-193`).
- Seven standard kind checkboxes (`STANDARD_NOSTR_KINDS` at `10-19`), with kind 4 also toggling 1059 (`173-180`).
- Custom numeric kind input + Add (`195-288`), and removable custom-kind pills with a `×` titled "Revoke Kind N" (`250-270`).
- `kernel.setPluginKindPermission` scopes grants per kind; `onUpdate` saves the workspace.

NEW renders "Installed Applications & Capability Governance" (`permissions.gleam:66-107`). Per-app cards show four pills only: `storage:kv`, `nostr:read`, `nostr:write`, `intents:dispatch` (`167-193`). Each pill's class/status is `granted`/`revoked` based on **`app.enabled`**, not a real grant lookup (`286-313`). Handlers for capability changes do not exist: `Msg` has no `SetPluginPermission` (`msg.gleam:1-86`), and `update.gleam` has no grant branch. Boot grants all system apps `NostrRead`, `NostrWrite`, `NostrSign`, `NostrEncrypt`, `StorageKv`, `RelaysManage`, `IntentsDispatch`, `IntentsHandle` by default (`boot.gleam:297-320`). The fixed "Governed Nostr Event Kinds" list (`permissions.gleam:195-205`) is display-only and omits `1059` and custom kinds.

Result: NEW has no capability-specific grant, no kind-level grant, no wildcard, no custom kinds, no revocation, and omits geolocation/relay/identity capabilities.

### Intents

OLD per-app "Handled Intents & Capabilities" (`permissions-intents-ui.ts:298-431`) lists declared intents plus any registered in the broker, with a checkbox per intent (`375-391`) and an `ⓘ` expandable explanation (`400-430`). Toggle writes `kernel.intentBroker.setPluginIntentEnabled` and updates `plugin.disabledIntents` (`380-390`); `onUpdate` persists the workspace.

NEW "Handled Intents & Protocol Routing" (`intents.gleam:83-210`) maps every installed app to a card, lists `app.handled_intents`, and renders a button that toggles `disabled_intents` (`render_intent_toggle_row` `157-215`; `ToggleAppIntent` `update.gleam:351-376`). Friendly labels/descriptions cover compose/create/view note, share, view/edit profile, create task, pay invoice (`intents.gleam:20-70`). It does **not** include broker-registered intents not declared on the app, unlike OLD.

### Default Applications / per-action routing

OLD Panorama appends "Default Applications" to the installed-plugin list (`panorama-shell.ts:1449`). It renders a 7-card grid (`base-shell.ts:1801-1977`):

- Actions: Compose Note (alias create_note), View Note & Thread, View Profile, Edit Profile, Web Share Target, Lightning Payment, Search (`1828-1866`).
- Each card has a `<select>` seeded with "Prompt every time (None)" plus candidate apps (`1902-1952`).
- Changing writes `kernel.intentBroker.setDefaultHandler` / `clearDefaultHandler` for the action and aliases and saves the workspace (`1953-1969`).
- Defaults are exported to NIP-78 as `defaultIntents` (`base-shell.ts:692`) and restored on apply (`896-900`).

NEW has **no equivalent control**. The workspace protocol still carries `default_intents` (`protocol/workspace.gleam:65`), and the kernel broker has a loader (`kernel/intents/broker.gleam:133`), but `Model.to_workspace_state` hard-codes `default_intents: dict.new()` (`model.gleam:294`) and `apply_workspace_state` ignores the field. No `Msg` sets a default handler. Only the "Open With..." chooser modal exists (`intents.gleam:217-328`).

## Placements & Companion Viewports

OLD `placements-ui.ts`:

- Header "Placements & Viewports" (Editorial) or "Assigned Viewports & Routes" (Panorama) (`50-58`).
- `+ Add Location` button; each click appends a placement with viewport `sidebar`, first plugin view route and `viewId` (`60-84`).
- Empty state "Unassigned — Not currently placed in any viewport." (`87-96`).
- Each placement row numbered "Placement #N", with **Viewport `<select>`** populated from `getAvailableViewports()` (`148-200`) and **View / Route `<select>`** populated from all plugin views, labelled `Title (/path)` (`202-240`).
- Remove button says "Remove" when >1 placement, "Unassign" when only one (`113-139`).
- Multiple placements per app are supported; `getPluginPlacements` returns an array (`base-shell.ts:454-474`).
- Pin button only rendered for `pl.viewport === "main"` (`320-355`), but `getPluginPlacements` filters out `main` (`454-462`), so this control is effectively unreachable in OLD.
- Viewport options are exactly `sidebar` (label "Widget"), `dock` ("Navigation Dock Shortcut"), `header-actions` ("Header Quick Action"); `main` and `header-status` are filtered out (`viewports.ts:15-19`, `base-shell.ts:718-722`).

NEW `settings/placements.gleam`:

- Header "Companion Viewports & Route Assignments" (`80-90`).
- Three fixed surface toggles per app: "Pin to Dock" (`158-176`), "+ Add Workspace Widget" / "Workspace Widget Active" (`178-207`), "+ Add Header Action" / "Header Action Active" (`209-232`). These map exactly to `Dock`, `Sidebar`, `HeaderActions` (`36-56`).
- "Open App" button per app (`140-156`) — **EXTRA-IN-NEW**.
- Existing placements render one row per viewport with a **route-chip list**, not a select (`253-330`).
- Remove button per row (`305-320`).
- One placement per viewport: `AddAppPlacement` filters existing placements with the same viewport (`update.gleam:212-235`).
- Default route for Sidebar is the `widget` view, for HeaderActions the `status` view, falling back to the first view (`placements.gleam:120-123`, `334-359`).
- There is no viewport selector (the viewport is implied by which pill you click), no Add Location, and no way to have two placements of the same viewport.
- Pin is a direct `pinned` boolean and does not assign a route, unlike OLD's dock placement which had a route select.
- `setAppRelays` etc. persist through `workspace_persistence_effects` (`update.gleam:651-658`).

## Shell Manager

| Capability | OLD | NEW | Status |
|---|---|---|---|
| List installed shells with count | `shell-manager-ui.ts:13-35` | `shells.gleam:73-170` | Equivalent |
| Quick switcher row | `shell-manager-ui.ts:37-54` | `shells.gleam:83-103` | Equivalent |
| Shell card metadata (icon, name, Active/Custom, author, version, description) | `shell-manager-ui.ts:61-110` | `shells.gleam:216-283` | Equivalent (NEW uses Built-in/Custom instead of only Custom) |
| Activate | `shell-manager-ui.ts:96-98,112-115` | `shells.gleam:228-241` → `SelectShell` (`update.gleam:471-479`) | Equivalent |
| Uninstall custom shell | `shell-manager-ui.ts:102-106`, `confirm` at `117-123`, registry `uninstall` at `shell-registry.ts:136-150` | No Msg, no button; `registry.unregister` exists (`registry.gleam:55-64`) but is unwired | **Missing** |
| Install curated shell | `Mantra` in curated catalog (`shell-registry.ts:47-65`), Install Shell/Activate (`shell-manager-ui.ts:129-190`) | No curated catalog; three hard-coded built-ins (`shells.gleam:29-59`) | **Missing** |
| Install custom shell | Panorama form ID/Name/Description + validation alert (`panorama-shell.ts:759-783`, `shell-manager-ui.ts:237-263`); Editorial only curated modal (`editorial-shell.ts:2375-2396`) | **none** | **Missing** |
| Install Shell modal / button | `+ Install Shell` (`editorial-shell.ts:2318-2320`), modal (`2375-2396`); Panorama button (`panorama-shell.ts:608-611`), modal (`738-786`) | **none** | **Missing** |
| Built-in shells | `editorial`, `panorama` (`shell-registry.ts:25-46`) | `editorial`, `panorama`, `classic` (`shells.gleam:29-59`) | **EXTRA-IN-NEW: classic** |
| Persistence | `omni_installed_shells`, `omni_active_shell` (`shell-registry.ts:77-78`) | `omni_active_shell_id` (`registry.gleam:20`); no installed-shell list | List persistence gone |

## Visual & Structural Differences

- **Modal vs page.** OLD Editorial settings is a centered modal overlay with a header, scrolling body, and close X (`editorial-shell.ts:2210-2255`); OLD Panorama is a full pivot page. NEW is always an in-shell full page (`editorial.gleam:234-241`, `panorama.gleam:284-302`, `classic.gleam:65`).
- **Title.** "Settings & Preferences" + subtitle in OLD (`editorial-shell.ts:2214-2216`); "Workspace & System Settings" in NEW (`tabs.gleam:67-69`).
- **Tab visual language.** OLD: uppercase mono segmented buttons with two-line title/sub-label and a separate mobile `<select>` (`editorial-styles.ts:1188-1290`). NEW: lowercase pill chips with icon+single label, wrapping over multiple rows (`shell-modules.css:322-349`).
- **Number of top buttons.** 3 OLD vs 11 NEW in default install. This is the direct source of the reported "buttons on top do not match".
- **Grouping.** OLD groups by *concern inside an app* using `editorial-pref-group` + `editorial-pref-card` headers with status badges (`editorial-shell.ts:2257-2366`). NEW groups each concern into its own top-level panel/card (`omni-settings-panel`/`omni-settings-card`, `tabs.gleam` and child modules), so one app appears in four panels.
- **In-settings search/filter.** OLD has plugin search + Expand All (`editorial-shell.ts:2338-2342`); NEW has none.
- **Back/close.** OLD close X and backdrop click (`editorial-shell.ts:2217-2219,1683`); NEW relies on the shell `btn-shell-back` only when history exists (`header_actions.gleam:26-41`). On a cold open of Settings, NEW has no visible close control.
- **Mobile.** OLD provides a labelled section dropdown (`editorial-shell.ts:2224-2234`). NEW has no mobile-specific navigation; all pills wrap.
- **Theme control fidelity.** OLD's selector had 3 states and system media-query behavior (`editorial-shell.ts:452-470`). NEW has 2 states, and `themes/editorial.gleam:57-58` emits `data-theme-mode` twice, the second hard-coded `"dark"`, so Editorial ignores the Light selection. Classic and Panorama apply it once (`classic.gleam:55`, `panorama.gleam:55`).
- **Accent control fidelity.** OLD offers native color pickers and restores per-shell accent (`editorial-shell.ts:2288-2306,615-690`; `panorama-shell.ts:2650-2695`). NEW offers a free-text hex field and persists but never restores (`boot.gleam:81,368`).
- **Section icons.** OLD tabs: layout/plugins/cloud. NEW tabs: user/relays/plugins/widgets/layout plus each app's icon.

## OLD Settings With No NEW Equivalent, and EXTRA-IN-NEW

### OLD-only (missing or regressed in NEW)

1. **Default Applications** per-action handler selects, including Search and "Prompt every time" (`base-shell.ts:1801-1977`, `panorama-shell.ts:1449`).
2. **Capability grant toggles** for `storage:kv`, `intents:dispatch`, `system:geolocation`, `nostr:read`, `relays:manage`, `identity:manage_keys` (`permissions-intents-ui.ts:570-655`).
3. **Nostr write-kind grant editor** (wildcard, standard kinds, custom kinds, revoke pills) (`permissions-intents-ui.ts:55-296`).
4. **Generate New Keypair** (`profile-schema.ts:495-500`).
5. **Per-app Update button** in settings (`editorial-shell.ts:1903,1937-1939`).
6. **Per-app Clear Storage** (`panorama-shell.ts:1416-1424`).
7. **Per-app Inspect Plugin** (`panorama-shell.ts:1410-1414`).
8. **Plugin search filter and Expand All Viewports** (`editorial-shell.ts:2338-2342`).
9. **Multiple placements per app, viewport `<select>`, route `<select>`, and "+ Add Location"** (`placements-ui.ts:60-84,148-240`).
10. **Shell install, curated catalog, custom shell install, and uninstall** (`shell-manager-ui.ts:129-263`, `panorama-shell.ts:759-783`, `shell-registry.ts:47-65`).
11. **"System Automatic" theme mode** (`editorial-shell.ts:2271-2273`).
12. **Per-shell accent storage and restoration** (`editorial-shell.ts:85-87,615-690`; `panorama-shell.ts:72`).
13. **Restore Workspace from Nostr** (`panorama-shell.ts:647`; `base-shell.ts:1015-1035`).
14. **Relay Add presets** and **Refresh** (`relays/src/index.ts:19-28,163-169,218-235`).
15. **Permissive relay URL entry** (auto-prepends `wss://`) (`relays/src/index.ts:33-40`).
16. **Default Applications' `search` action** and OLD intent friendlier naming are absent from the NEW settings UI.
17. **Per-plugin grouping**: a single expandable card that contains all settings for one app (`editorial-shell.ts:1941-2038`, `panorama-shell.ts:1330-1403`).

### EXTRA-IN-NEW

1. **Profile & Keys as a first-class settings tab** with NIP-05 shown in Settings (`tabs.gleam:82-87,190-230`).
2. **Export nsec** (`tabs.gleam:321-328`).
3. **Passphrase enable/remove/unlock** (`tabs.gleam:391-480`).
4. **Multi-account list with Switch** (`tabs.gleam:340-383`).
5. **Visible Auto-Sync toggle** for NIP-78 (`tabs.gleam:521-543`).
6. **Install Application from URL / Blossom / naddr inside settings** (`permissions.gleam:110-148`).
7. **"Open App" button per placement** (`placements.gleam:140-156`).
8. **Three fixed companion-surface toggles with direct Dock pinning** (`placements.gleam:158-232`).
9. **Omni Classic built-in shell** (`shells.gleam:45-59`).
10. **Per-relay Read/Write toggles, Reconnect, latency, sent/received counters, NIP-65 publish** (`relays/view.gleam:184-229`, `96-141`; `update.gleam:83-95`).
11. **Relay URL validation banners** (`relays/update.gleam:107-140`).
12. **Dedicated per-app settings tab in the top tab bar** (`tabs.gleam:120-131`).
13. **Dark/Light button styling and custom hex text input** as an explicit accent control (`shells.gleam:172-197`).

## Prioritized Restoration List

1. **Restore the 3-tab top-level IA (or collapse the 5+dynamic bar to 3 entries).** Where: `gleam/shell/src/omni/shell/settings/tabs.gleam:79-140`. Effort: **M**. Impact: **Very high** — directly fixes the user's complaint; removes 11 top buttons and the split-app confusion.
2. **Re-group per-app settings into one expandable app card.** Where: new `settings/permissions.gleam`, `placements.gleam`, `relay_scoping.gleam`, `intents.gleam`; add an app-card composition module. Effort: **L**. Impact: **Very high** — restores the OLD mental model (all controls for one app in one place).
3. **Restore capability grant toggles and revocation.** Where: `settings/permissions.gleam:167-313`; add `SetPluginCapability` Msg and a `capability_store.set_grant` effect (`kernel/acl/capability_store.gleam:95-111`). Effort: **L**. Impact: **High** — security/governance regression.
4. **Restore the Nostr write-kind grant editor** (wildcard, standard kinds, custom numeric kinds, revoke). Where: `settings/permissions.gleam:195-205`; reuse OLD behaviour from `permissions-intents-ui.ts:119-288`. Effort: **L**. Impact: **High**.
5. **Restore Default Applications per-action routing.** Where: new module, mounted in the old Plugins tab; persist `defaultIntents` from `model.gleam:294`. Effort: **M**. Impact: **High**.
6. **Fix theme correctness and restore System mode.** Where: `themes/editorial.gleam:57-58` (duplicate dark attribute), `settings/shells.gleam:177-178` (add System), `update.gleam:485-493` (accept "system"), plus a `matchMedia` effect. Effort: **M**. Impact: **High**.
7. **Restore per-shell accent presets, custom color picker, and persistence restore.** Where: `settings/shells.gleam:62-70,106-129,186-197`; load `accent_color_storage_key` in `boot.gleam` alongside theme mode. Effort: **M**. Impact: **High**.
8. **Restore shell install/uninstall/curated catalog/custom installer.** Where: `settings/shells.gleam:216-300` plus a registry install/uninstall UI; `registry.gleam` already supports unregister. Effort: **M**. Impact: **High**.
9. **Make all dynamic app tabs open a distinct settings view (or remove dead declarations).** Where: `config.gleam:64-66,100-102,160-162,184-186,208-210,232-234` and the route parsers `relays/update.gleam:231-236`, `profiles/model.gleam:72-83`, `publisher/update.gleam:544-550`, Notes `model/view`. Either implement `ViewSettings` or remove the declaration so no dead tab appears. Effort: **M**. Impact: **High**.
10. **Restore plugin search and Expand All.** Where: `settings/permissions.gleam` app list. Effort: **S**. Impact: **Medium**.
11. **Restore per-app Update / Clear Storage / Inspect actions.** Where: `settings/permissions.gleam` action row; wire update modal and a storage-clear effect. Effort: **M**. Impact: **Medium**.
12. **Restore multi-placement + viewport/route selects.** Where: `settings/placements.gleam`; replace fixed toggles with OLD-style rows, or keep toggles as quick-add but add a full "Advanced placements" row editor. Effort: **M**. Impact: **Medium**.
13. **Use the actual relay pool in per-app custom relay scoping.** Where: `settings/relay_scoping.gleam:27-30,198-230`; inject configured relays into the model instead of the hard-coded three. Effort: **S**. Impact: **Medium**.
14. **Seed the relay plugin UI from the persisted pool and restore Refresh/presets.** Where: `web/src/omni/web/builtin.gleam:124-125`, `plugins/relays/src/plugin/relays/model.gleam:69-75`, `view.gleam:96-141`; add Refresh/Reload and the five presets. Effort: **S/M**. Impact: **Medium**.
15. **Restore Restore Workspace from NIP-78.** Where: `settings/tabs.gleam:488-560`; add a Restore button and effect calling `apply_remote_workspace`/fetch. Effort: **S**. Impact: **Medium**.
16. **Restore Generate New Keypair; harden export/passphrase UX** (copy button, reveal/hide, confirm passphrase, min length). Where: `settings/tabs.gleam:321-328,391-480`; keystore already exposes key generation (`keystore.gleam:261`). Effort: **S/M**. Impact: **Medium**.
17. **Fix accent persistence regression.** Where: `web/src/omni/web/boot.gleam:140-165`; read `accent_color_storage_key` into `Model.accent_color`. Effort: **S**. Impact: **High** (currently every reload loses the accent).
18. **Add a confirmation before uninstalling apps** to match OLD. Where: `settings/permissions.gleam:261-271` / `UninstallApp`. Effort: **S**. Impact: **Medium**.
