# Gleam Rewrite Regression Checklist (`main` vs `gleam-rewrite`)

> Tracked comparison of regressions, broken wiring, and styling differences
> between the original TypeScript/MoonBit app on `main` and the Gleam rewrite
> on `gleam-rewrite`. Check items off as each fix is implemented and verified.

---

## A. Styling & CSS Regressions (`omni_ui` ↔ `assets/styles/`)

### A1. `schema.css` ↔ `omni_ui` Class & Attribute Mismatches (High Impact)

- [x] **A1.1 `Box` layout attributes:** Align `gleam/ui/src/omni/ui/render/layout.gleam` (`data-gap`, `data-padding`, `data-align`, `data-justify`) with `assets/styles/schema.css` (`[gap=...]`, `[padding=...]`, `[align=...]`, `[justify=...]`, `.omni-box-gap-*`, `.omni-box-padding-*`, `.omni-box-align-*`, `.omni-box-justify-*`) so `Box` containers get their gap, padding, and flex alignment/justification.
- [x] **A1.2 `Text` tone classes:** Align `gleam/ui/src/omni/ui/render/text.gleam` (`.omni-tone-secondary`, `.omni-tone-muted`, `.omni-tone-accent`, `.omni-tone-error`, `.omni-tone-success`, `data-tone`) with `assets/styles/schema.css` (`.omni-text[tone="..."]`, `.omni-text-muted`, etc.).
- [x] **A1.3 `Button` / `IconButton` variants & icons:** Align `gleam/ui/src/omni/ui/render/input.gleam` (`data-variant`, `data-icon`) with `assets/styles/schema.css` (`[variant="secondary"]`, `[icon="heart"|"repeat"|"zap"]`) so liked/reposted/zapped note-card buttons get their semantic colors and SVG fills.
- [x] **A1.4 `StatusIndicator` pulse class:** Align `.omni-status-pulse` in `gleam/ui/src/omni/ui/render/feedback.gleam` with `.omni-pulse` in `assets/styles/schema.css`.
- [x] **A1.5 `ListItem` interactive class:** Align `.omni-list-item-interactive` in `gleam/ui/src/omni/ui/render/list.gleam` with `[clickable]` / `.omni-list-item-clickable` in `assets/styles/schema.css`.

### A2. Missing CSS Rules & Theme Styling

- [x] **A2.1 Unstyled `omni_ui` classes in `schema.css`:** Add styles for `.omni-input-with-prefix`, `.omni-input-prefix-icon` (`input.gleam`), `.omni-progress-circular`, `.omni-progress-svg-label` (`feedback.gleam`), and `#omni-boot-root` / `.omni-boot-root` (`boot.gleam`).
- [x] **A2.2 Pre-boot / error styling:** Ensure `.omni-boot-error` (`apps/web/src/main.ts`) has token/component styling available before `omni_web` mounts `<div class="omni-shell-stylesheets">`.
- [x] **A2.3 System theme mode in `editorial.css`:** Support `data-theme-mode="system"` (or resolve `prefers-color-scheme: dark` in `apply_document_theme`) so selecting `"System"` in `shells.gleam` works as on `main`.
- [x] **A2.4 `classic` theme / `classic.css`:** Decide whether to restore `classic` theme or remove references to `classic` from `AGENTS.md` / `ISSUES_AND_ROADMAP.md`.
- [x] **A2.5 Plugin-specific layout/visual parity:**
  - `notes`: Restore split-pane sidebar (320px) + editor visual layout (or add equivalent `schema.css` / layout styling).
  - `timer`: Restore SVG `ProgressDisk` rendering instead of raw `conic-gradient` `Box`.

---

## B. Schema Renderer (`omni_ui`) Functional Bugs

- [x] **B1. `Input` `action_on_enter` (`gleam/ui/src/omni/ui/render/input.gleam`):** Check `key == "Enter"` in `event.on_keydown` (currently fires on every keystroke) and send the live DOM input value instead of the stale `value` prop.
- [x] **B2. `Toggle` double-firing (`gleam/ui/src/omni/ui/render/input.gleam`):** Remove the duplicate `event.on_click` on the wrapping `<label>` when `event.on_check` is already attached to `<input type="checkbox">`.
- [x] **B3. Ambient `collectFormValues()` on action dispatch:** Match `main`'s `SchemaRenderer.collectFormValues()` so clicking an action button collects sibling named `input` / `textarea` / `toggle` values into the action payload.
- [x] **B4. `InputFile` & `clearable` (`gleam/ui/src/omni/ui/render/input.gleam`):** Implement `FileReader.readAsArrayBuffer` (`fileName`, `fileSize`, `fileType`, `fileBytes`) and drag-and-drop (`dragover`/`drop`) for `InputFile`, and render a clear button when `clearable: True`.
- [x] **B5. `List` infinite scroll (`gleam/ui/src/omni/ui/render/list.gleam`):** Wire `IntersectionObserver` / scroll listener on `.omni-list-sentinel` for `on_scroll_end_action`.
- [x] **B6. `VirtualList` scrolling (`gleam/ui/src/omni/ui/virtual_list.gleam`):** Replace hardcoded `scroll_top = 0` / `viewport_height = 800` with live scroll state and container measurement.
- [x] **B7. `ProgressDisk` & `show_ticks` (`gleam/ui/src/omni/ui/render/feedback.gleam`):** Render a filled SVG pie wedge (`<path>`) for `ProgressDisk` and the 12 clock-rim `<line>` ticks when `show_ticks: True`.

---

## C. Sandbox, Guest Bridge & Kernel Wiring

### C1. Guest Bridge & Sandbox (`gleam/bridge`, `gleam/sandbox`, `gleam/interop`)

- [ ] **C1.1 `localStorage` shim `SecurityError` (`gleam/bridge/src/omni/bridge/storage_shim.ffi.mjs`):** Wrap `window.localStorage` access in `try/catch`, seed from `__OMNI_INITIAL_STORAGE__`, and persist `setItem`/`removeItem`/`clear` via `storage.set`/`storage.delete`/`storage.clear` RPCs.
- [ ] **C1.2 Protocol links (`links_shim.ffi.mjs` + `shell_boot.ffi.mjs`):** Route `nostr:` / `lightning:` / `cashu:` clicks through `kernel.handleUri` RPC (or handle them in `shell_boot.ffi.mjs`), instead of dropping them in `handle_guest_schema`.
- [ ] **C1.3 `navigator.share` (`share_shim.ffi.mjs` + `shell_boot.ffi.mjs`):** Route `navigator.share` through `kernel.handleShare` RPC instead of posting an unhandled `omni:share` message to Channel 1.
- [ ] **C1.4 `window.nostr.doc` (`nostr_shim.ffi.mjs` + `method.gleam`/`codec.gleam`/`dispatcher.gleam`):** Implement `"nostr.doc"` RPC or remove/alias it so calls don't fail with `MethodNotFound`.
- [ ] **C1.5 `guest-runtime.mjs` RPC queue & `#omni-schema`:** Queue `callRpc` calls made before `omni:init` instead of rejecting immediately, and auto-emit inline `<script type="application/json" id="omni-schema">` on boot.
- [ ] **C1.6 Worker termination (`gleam/interop/src/omni/interop/shell_boot.gleam`):** Update `terminate_plugin` to also call `unmount_worker(plugin_id)` and `sandbox_manager.terminate`.
- [ ] **C1.7 `.zip` plugin bundle extraction:** Wire `gleam/platform/src/omni/platform/zip.ffi.mjs` into `installer.gleam` / `resolver.gleam` for `.zip` plugin bundles.
- [ ] **C1.8 WASM/WIT plugin host:** Decide whether to restore `WasmGuestHost` support or explicitly deprecate `WasmFormat` in `omni_sandbox`.

### C2. Kernel (`gleam/kernel`, `gleam/interop`)

- [ ] **C2.1 Locked keystore check in `NostrEncrypt` / `NostrDecrypt` (`dispatcher.gleam`):** Check `keystore.is_locked(ctx.keystore)` before calling `nip04`/`nip44` so locked keystores return `"Keystore is locked"` instead of a secp256k1 error.
- [ ] **C2.2 `NostrPublishDraft` ACL check (`dispatcher.gleam`):** Check `capability.NostrSign` in addition to `capability.NostrWrite`.
- [ ] **C2.3 `RelayHintCache` & `refresh_hints` leak (`relay_hints.gleam`, `coordinator.gleam`):** Fix negative-cache TTL handling in `lookup`/`put_missing` and store/close the `"relay_hints_refresh"` subscription instead of discarding the closer.
- [ ] **C2.4 Remove `panic`s on untrusted input (`bech32.gleam`, `keystore.gleam`):** Return `Result` errors instead of panicking on malformed bech32 strings or stored pubkeys.

---

## D. Shell & Theme Regressions (`omni_shell`, `omni_web`, `apps/web`)

- [ ] **D1. Desktop Settings tabs (`gleam/shell/src/omni/shell/settings/tabs.gleam`):** Expose `TabProfile` and `TabRelays` in the desktop tab bar (currently only in the mobile `<select>` hidden above `720px`).
- [ ] **D2. Missing Settings panels (`tabs.gleam`, `intents.gleam`):** Render `placements.render_placements_panel` in `TabPlugins` and restore the **Default Applications** settings grid (`compose_note`, `view_note`, `view_profile`, `edit_profile`, `share`, `pay_invoice`, `search`).
- [ ] **D3. Built-in plugin settings & widgets (`tabs.gleam`, `widgets_grid.gleam`):** Use `viewport_host.render_embedded_or_island` instead of `render_slot_anchor` in `render_plugin_settings_tab` and `render_widget_card` so built-in schema apps render instead of empty `<div>`s.
- [ ] **D4. Theme header actions & sync indicator (`editorial.gleam`, `panorama.gleam`):** Call `header_actions.render_header_actions(model)` in both themes so the NIP-78 sync pill and header companion apps appear.
- [ ] **D5. Profile avatar button target (`editorial.gleam`, `panorama.gleam`):** Dispatch `OpenSettings(TabProfile)` instead of `OpenSettings(tabs.current_tab(model))` on profile avatar clicks; dispatch `OpenSettings(TabShells)` on settings gear/pivot buttons.
- [ ] **D6. Panorama Search & Fullscreen controls (`panorama.gleam`):** Add `OpenSearch`, `ToggleFullscreen`, and fullscreen exit overlay parity with `editorial.gleam`.
- [ ] **D7. Pull-to-refresh drag feedback (`editorial.gleam`, `panorama.gleam`):** Pass live drag state instead of hardcoded `PullIdle` to `pull_to_refresh.render_indicator`.
- [ ] **D8. App context menu:** Restore right-click & 500ms mobile long-press context menu on dock items / app tiles (Open, Update, Pin/Unpin, Configure, Uninstall).
- [ ] **D9. "Open With..." `"Always use this app"` checkbox (`intents.gleam`, `update.gleam`):** Add the checkbox instead of unconditionally saving `default_intents` on every selection.
- [ ] **D10. Manual plugin updates & `.zip` update (`update_modal.gleam`, `shell_boot.gleam`):** Add a UI trigger for `ShowUpdateModal` and support `.zip` unpacking in `upgrade_plugin_from_file`.
- [ ] **D11. Share target routing (`shell_boot.gleam`, `manifest.webmanifest`):** Route incoming `host_share` into the shell's `create_note` / `share` intent composer (and add `share_target` to `manifest.webmanifest` if desired).
- [ ] **D12. Toast auto-dismiss, Escape on permission prompt, & boot widgets:** Add auto-dismiss timer for `toast.gleam`, close `permission_prompt` on `EscapePressed`, and mount companion widgets on boot (`ensureWidgetsMounted`).

---

## E. Per-Plugin Functional Regressions

### E1. `feed` (`gleam/plugins/feed` & `gleam/social_ui`)
- [ ] **E1.1** Restore `ViewCompact` rendering (currently aliased to `ViewWidget`).
- [ ] **E1.2** Wire `show_inline_media` setting into `NoteCardConfig` (`note_card.gleam` currently hardcodes `with_inline_images(True)`).
- [ ] **E1.3** Add an editable control for `page_size` in `render_settings_view` (currently static `Caption`).
- [ ] **E1.4** Allow locally un-toggling `LikeNote` / `RepostNote` when already liked/reposted.
- [ ] **E1.5** Restore relay syncing / loading older notes / thread loading indicators.

### E2. `notes` (`gleam/plugins/notes`)
- [ ] **E2.1** Fix `"Add Tag"` button (`view.gleam` / `update.gleam`): add `action_on_change` to the tag `Input` (or rely on `B3` form collection) so `draft_tag` is populated when clicking `"Add Tag"`.
- [ ] **E2.2** Decide on rich-text WYSIWYG toolbar vs plain `Textarea` (or Markdown preview/toolbar).
- [ ] **E2.3** Restore debounced auto-save & `Saved / Saving... / Offline` status indicator.
- [ ] **E2.4** Re-publish notes when `ToggleEncryptedSync` is toggled.
- [ ] **E2.5** Use wall-clock timestamps (`clock.system().now_ms() / 1000`) instead of monotonic `1_700_000_000` counter in `next_timestamp`.

### E3. `profiles` (`gleam/plugins/profiles`)
- [ ] **E3.1** Remove hardcoded fake `my_pubkey` (`a1a1...`) in non-demo `model.init`.
- [ ] **E3.2** Restore `compact` and `widget` views in `view.gleam`.
- [ ] **E3.3** Restore `"My Profile"` top-level tab (`Profile | Edit | Keys | Following`).
- [ ] **E3.4** Restore `"Switch Account"` and `"Generate New Keypair"` actions in `ViewKeys` (or link directly to Shell Identity settings).
- [ ] **E3.5** Enable interactive `like` / `repost` / `zap` actions on profile note cards (`show_actions: True`).
- [ ] **E3.6** Use wall-clock timestamp instead of `model.now_sec + 1` on `SaveMetadata`, and handle `nip05`/`lud16`/`website` in generic `"input" | "change"` fallback.

### E4. `checklist` (`gleam/plugins/checklist`)
- [ ] **E4.1** Read `payload.title || payload.text || payload.taskText || payload.value` in `add-task` action handler instead of ignoring payload text.
- [ ] **E4.2** Use wall-clock timestamp instead of `1_700_000_000 + model.next_id` in `AddTask`.
- [ ] **E4.3** Verify NIP-78 `d` tag compatibility (`omni/tasks/v1` on `main` vs `omni/checklist/v1` on Gleam).

### E5. `timer` (`gleam/plugins/timer`)
- [ ] **E5.1** Align default duration (15 min on `main` vs 25 min on Gleam) if unintended.
- [ ] **E5.2** Handle `"shrink-timer"` and `"expand-timer"` actions and make the standard timer disk clickable to expand to focus mode.
- [ ] **E5.3** Fix `"set-preset"` payload handling (`minutes` vs `preset`).
- [ ] **E5.4** Allow `AdjustMinutes` to adjust `totalSeconds` and `remainingSeconds` without resetting a running/paused timer.
- [ ] **E5.5** Exit `focus_mode` on `Reset` (matching `main`), and verify host `Tick` interval wiring.

### E6. `relays` (`gleam/plugins/relays`)
- [ ] **E6.1** Include `preset_bar` and `preset_hint` in `all_children` in `view.gleam` (currently dead code, so quick-add preset buttons are missing).
- [ ] **E6.2** Add `local_store` persistence for configured relays (`omni_configured_relays`).
- [ ] **E6.3** Restore `"Refresh Pool"` button / `"refresh-relays"` action and auto-prepend `wss://` to bare hostnames.

### E7. `publisher` (`gleam/plugins/publisher`)
- [ ] **E7.1** Restore single-file inlined vs multi-file Blossom packaging mode toggle (`set-packaging-mode`) and `"Install Locally in Omni"` (`install-local`).
- [ ] **E7.2** Restore arbitrary URL / `naddr1...` `"Fetch & Inspect"` (`fetch-url`) / `"Install from URL"` (`install-url`) and `.html`/`.htm`/`.js` single-file upload.
- [ ] **E7.3** Add `"Query Relays"` (`kind: 35129`), `"Install / Update"` (`open-naddr`), and `"Update .zip"` (`prepare-update`) to the Published tab.
- [ ] **E7.4** Fix widget `"Open Plugin Studio"` button (`view.gleam:46`) to navigate to studio instead of emitting `select-tab`.
- [ ] **E7.5** Replace `let assert Ok(pk) = pubkey_parse(pubkey_hex)` in `publish_bundle` (`update.gleam:396`) with safe `Result` error handling.
