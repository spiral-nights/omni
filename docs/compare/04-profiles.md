# Profiles Plugin Parity

Audit of the Profiles plugin between the TypeScript reference (`/tmp/omni-develop/packages/plugins/profile-viewer/src`, branch `develop`) and the Gleam rewrite (`/home/spiralnights/code/omni/gleam/plugins/profiles/src/plugin/profiles`, branch `gleam-rewrite`). Every claim was checked against the cited lines; features absent from both versions are marked as such rather than counted as regressions.

## Summary

- NEW is a **read-only directory + thin detail view**, not a port of the OLD identity manager: OLD had a tabbed app (Profile / Edit / Keys / Following) with live relay sync, local caching, note interaction stats and key switching; NEW has four views (directory, profile, metadata, keys) with no tabs and no relay subscriptions of its own.
- **Saving metadata silently destroys data**: NEW publishes Kind 0 with only `name`, `about`, `picture` (`update.gleam:100-104`), dropping `nip05`, `lud16`, `website` and `display_name` that OLD preserved (`action-handler.ts:62-69`).
- **The `about` field cannot be edited**: NEW uses `Textarea`, which has no change-action field (`node.gleam:269-275`) and attaches no `on_input` (`input.gleam:266-286`); only name and picture inputs dispatch updates.
- **The plugin has no signer identity**: `my_pubkey` is the hard-coded seed `a1a1…` (`model.gleam:23-24,89`); OLD resolved the real pubkey via NIP-07, host session, then localStorage (`index.ts:66-104`).
- **Follows are not persisted**: `app_spec_with_storage` saves only `next_model.profiles` (`main.gleam:43-47`); OLD cached the Kind 3 set in localStorage (`index.ts:116-128`, `action-handler.ts:142-147`).
- **Navigation survives shell re-renders but is not URL-addressable**: the host now only re-navigates on page change or explicit open (`boot.gleam:440-453`, commit `4aa7851`), so a selected profile stays; but selecting a profile pushes no history, has no back button, and browser back/deep links fall back to the directory.
- **Generated avatars are restored in shared code but the banner is not rendered at all**: `avatar.banner_gradient` exists (`avatar.gleam:180-193`) and has zero call sites.
- **Note interactions are display-only**: NEW renders note cards with `show_actions: False`, `on_like/repost/zap: None` (`view.gleam:500-514`), and passes `stats.empty_stats` (`view.gleam:294`); OLD had like/repost/reply/zap buttons and aggregated counts (`profile-schema.ts:202-241`, `profile-store.ts:103-177`).

## Navigation & Double-Navigation

**OLD** opened a profile through the action name `view_profile` (alias `view-profile`), handled in `/tmp/omni-develop/packages/plugins/profile-viewer/src/schema/action-handler.ts:195-289`. It:
- remembered the current tab in `schemaPreviousTab` (`action-handler.ts:209-211`), set `schemaTargetUser` from the profile cache (`:212-240`), set `currentSchemaTab = "user-profile"` (`:241`), loaded cached notes (`:257`) and issued Kind 0 + Kind 1 REQs (`:282-288`);
- pushed or replaced browser history with `?view=user-profile&pubkey=<hex>` and state `{tab, pubkey, from}` (`action-handler.ts:259-280`), and emitted a page declaration with the same URL (`profile-schema.ts:684-704`);
- rendered a back bar whose action was `back` with `navigate: {back: true}` (`profile-schema.ts:268-283`), which called `history.back()` (`action-handler.ts:29-39`);
- restored state on `popstate` (`index.ts:298-320`), and also accepted `?pubkey=` / `?view=edit|following|keys` at init (`index.ts:152-215`).
- Double-navigation existed in OLD too: the `omni:intent` handler opened a profile and then, if the pubkey equalled the current identity, dispatched a second `switch-tab` to `my-profile` (`index.ts:262-286`).

**NEW** opens a profile through `select-profile` on the directory row (`view.gleam:144`) → `action_to_msg` maps `select-profile`/`view_profile` to `SelectProfile(pubkey)` (`update.gleam:144-148`) → `update` calls `apply_view(model, ViewProfile(cleaned))` (`update.gleam:31-37`), which sets `view`, `selected_pubkey` and a fresh metadata draft (`update.gleam:220-233`). `view` then renders `render_profile` (`view.gleam:32-37,154-290`). The route path is pure: `view_from_route` maps `?view=profile&id|pubkey|npub=` to `ViewProfile` (`model.gleam:72-83`) and `on_route_change` dispatches `SelectView(view_from_route(route))` (`main.gleam:23-25,50-52`).

**Does the detail view survive a shell re-render?** Yes for unrelated messages. `boot.dispatch` now calls `app.navigate` only when `active_page` changed or the message is `OpenApp`/`NavigateTo` (`/home/spiralnights/code/omni/gleam/web/src/omni/web/boot.gleam:440-453`), so streamed `EmbedSchema` refreshes no longer reset the plugin. Residual issues:

- **Deep links are unsupported end-to-end.** The built-in app is always started with `""` (`builtin.gleam:101`), and the browser-URL decoder maps `?app=<id>` to `OpenApp(plugin_id, None)`, discarding `view`/`id` (`shell_boot.gleam:218-225`). `?view=profile&id=` therefore opens the directory even though `view_from_route` could parse it.
- **No back button on the profile detail.** Only the metadata and key-custody views have "Back to Directory" (`view.gleam:361-372,455-466`); `render_profile` has none (`view.gleam:154-290`).
- **Browser back does not update the plugin.** `page_url` for a primary app is only `?app=<id>` (`shell_boot.gleam:196-203`), so returning to it yields `route = None` → `navigate("")` → `parse_search("")` → `ViewDirectory`.
- **Selecting a profile writes no history.** `apply_view` never pushes a route; the shell's `active_page` route stays empty, so the emitted page id (`schema.page("profile")`, `view.gleam:280`) is not reflected in the shell or URL.
- **Explicit re-open still resets the view.** Clicking the app in the dock/header sends `OpenApp` with no route, which re-navigates to `""` and drops the open profile.

## Generated Profile Avatars

**OLD `getAvatarSvg`** (`/tmp/omni-develop/packages/core/src/schema/components/primitive-elements.ts:844-901`): a 32-bit hash `hash = (hash << 5) - hash + charCodeAt(i); hash |= 0`, `seed = |hash|`; palette `palettes[seed % 16]` (16 triples, `gradient.ts:1-18`); composition from the seed — circle 1 at `20 + seed%60`, `20 + (seed>>4)%60`, radius `24 + (seed>>8)%16`, colour `accent` when `seed%2==0` else `#ede8df`, opacity `0.24 + (seed%8)*0.015`; circle 2 mirrored at `100-x,100-y`, radius `20 + (seed>>12)%20`, `stop2` at 0.4; a wave path at `64+seed%10`, control `40+(seed>>3)%14`, end `68+(seed>>6)%12`; a 47.5-radius ring; and a centred monogram (first letter, uppercased) with stroke.

**OLD `getProfileGradientBanner`** (`crypto/gradient.ts:24-34`): same hash/seed, picks `[stop1, stop2, accent] = palettes[seed % 16]`, angle `(seed % 60) + 115`, returns `linear-gradient(<angle>deg, stop2 0%, color-mix(stop1 65%, #141312) 55%, color-mix(accent 30%, #1c1b18) 100%)`.

**Where NEW renders them**: the port lives in `/home/spiralnights/code/omni/gleam/ui/src/omni/ui/avatar.gleam` — `seed` (`:36-44`), `palette_for` (`:62-68`), `render` (`:72-177`, same hash/palette/composition incl. monogram), `banner_gradient` (`:180-193`). It is reached through:
- `render_avatar` in `/home/spiralnights/code/omni/gleam/ui/src/omni/ui/render/text.gleam:208-278`: when `src` is absent/unsanitizable it calls `generated_avatar.render(seed_key, initials)` (`:265-284`), driven by the `Avatar` primitive (`render.gleam:129-130`).
- List items in `/home/spiralnights/code/omni/gleam/ui/src/omni/ui/render/list.gleam:138-176`: when `avatar_url` is absent it renders the generated avatar from `avatar_pubkey` (`:159-176`).
- Profiles call sites: directory rows pass `avatar_url: person.picture` **and** `avatar_pubkey: Some(person.pubkey)` (`view.gleam:140-141`); the detail header uses `Avatar(src: person.picture, pubkey: Some(pubkey), …)` (`view.gleam:162-170`); note cards use `Avatar` via `/home/spiralnights/code/omni/gleam/social_ui/src/omni/social_ui/note_card.gleam:90-98`.

**Where it still does NOT**:
- **Banner**: `render_profile` builds no banner node at all (`view.gleam:154-290`); `avatar.banner_gradient` has no call sites anywhere in `gleam/`. OLD rendered a 115px gradient banner on both own and target profiles (`profile-schema.ts:286-292,567-573`).
- **Directory/detail raw `<img>`**: `avatar_url`/`src` wins over the pubkey fallback, so any non-empty `picture` is rendered as an `<img>` (`list.gleam:144-157`, `text.gleam:255-263`). The seeded profiles ship placeholder URLs `https://example.com/avatars/alice.png` and `…/bob.png` (`model.gleam:136,148`), so those rows show broken images instead of generated avatars until real metadata arrives.
- **Key custody**: no avatar is rendered (`view.gleam:409-486`), which is acceptable since it shows only the local npub.

Concrete call sites that need the generated banner/avatar work: `view.gleam:276-289` (add banner via `Card.banner_background` or a `Box` with `StyleRaw` background), `view.gleam:162-170` (already falls back, but seeded placeholder `picture` values bypass it), `view.gleam:140-141` (same placeholder problem), and `model.gleam:136,148,161` (drop fake URLs so the deterministic art is used).

## Feature Matrix

| Feature | OLD (file:line) | NEW (file:line) | Status |
|---|---|---|---|
| Directory list | none — only a Following virtual-list (`profile-schema.ts:505-564`) | `render_directory` + `ListItem` rows (`view.gleam:44-94,96-148`) | Extra (NEW only) |
| Search | none | search input + `filtered_profiles` over name/npub/nip05/about (`view.gleam:45-57`, `model.gleam:234-253`) | Extra (NEW only) |
| Follow / unfollow | button + Kind 3 sign/publish + localStorage (`profile-schema.ts:327-336`, `action-handler.ts:137-194`) | `toggle-follow` + `Publish(kind 3)` (`view.gleam:120-132,201-221`, `update.gleam:41-69`) | Partial — follows not persisted |
| Follower / following counts | following count in metric and tab badge (`profile-schema.ts:116,625-644`) | `follow_count` exists but is never rendered (`model.gleam:286-288`); no follower count | Missing |
| Detail header: banner | gradient banner (`profile-schema.ts:286-292`) | none (`view.gleam:154-290`) | Missing |
| Detail header: avatar | `Avatar` with pubkey fallback (`profile-schema.ts:308-315`) | `Avatar` with pubkey fallback (`view.gleam:162-170`) | Parity |
| Detail header: display name | `profile-schema.ts:321` | `view.gleam:172-175` | Parity |
| Detail header: nip05 | badge (`profile-schema.ts:340-351`) | badge (`view.gleam:177-182`) | Parity |
| Detail header: about | `profile-schema.ts:322` | `view.gleam:184-193` | Parity |
| Detail header: lud16 / website / npub | lud16/website in metadata only, npub in keys (`profile-schema.ts:31,466-472`) | not rendered on detail (`view.gleam:154-290`) | Missing |
| Notes tab | note cards with actions (`profile-schema.ts:122-245,374-385,667-681`) | notes list via shared note card, actions hidden (`view.gleam:262-302,500-514`) | Partial |
| Replies / media tabs | none | none | Absent (both) |
| Zap | local counter stub only (`action-handler.ts:381-386`) | `on_zap: None` (`view.gleam:512`) | Missing (stub lost) |
| DM | none | none | Absent (both) |
| Copy npub | code-block in Keys (`profile-schema.ts:466-472`) | copyable `CodeBlock` in Keys only (`view.gleam:418-423`) | Partial — not on detail |
| Share | none | none | Absent (both) |
| Mute / report | none | none | Absent (both) |
| Metadata editor: name | input (`profile-schema.ts:399-404`) | input + change action (`view.gleam:311-323`) | Parity |
| Metadata editor: about | input (`profile-schema.ts:405-410`) | `Textarea` with no action (`view.gleam:325-332`) | Broken |
| Metadata editor: picture | input (`profile-schema.ts:411-416`) | input + change action (`view.gleam:334-346`) | Parity |
| Metadata editor: nip05 / lud16 / website | inputs (`profile-schema.ts:417-428`), published (`action-handler.ts:62-69`) | absent from UI and from published JSON (`update.gleam:98-125`) | Missing (data loss) |
| Validation | none (raw strings, `action-handler.ts:61-70`) | trim-to-empty only (`update.gleam:280-285`) | Absent (both) |
| Picture upload | none | none | Absent (both) |
| Key custody view | banner, metric, status, npub, switch/generate (`profile-schema.ts:437-504`) | npub, status, explanation, refresh (`view.gleam:409-486`) | Partial |
| Import / export key | none | none | Absent (both) |
| Switch / generate key | `switch-key` / `generate-key` via `omni.auth` (`profile-schema.ts:474-504`, `action-handler.ts:96-136`) | none | Missing |
| Relay sync of Kind 0 | REQ + cache + TTL (`relay-sync.ts:199-234,314-346`, `profile-store.ts:69-101`) | host ingest + `Publish` only (`model.gleam:355-371`, `update.gleam:98-125`) | Partial — no request/backfill |
| Contact list (Kind 3) | REQ + ingest + localStorage (`relay-sync.ts:237-252`, `action-handler.ts:137-194`) | ingest + `Publish` (`model.gleam:380-402`, `update.gleam:41-69`) | Partial — no fetch/persistence |
| NIP-05 verification | display only, no fetch (`profile-schema.ts:340-351`) | display only (`view.gleam:177-182`) | Absent (both) |
| Mention autocomplete | none in this plugin | none in this plugin | Absent (both) |

## Missing Features (MISSING rows only)

- **Banner gradient** — `profile-schema.ts:286-292,567-573` rendered a deterministic 115px banner behind both own and target profile headers.
- **Following count / follower count** — `profile-schema.ts:116,625-644` showed the Kind 3 follow count in a metric and tab badge; NEW computes `follow_count` but never renders it (`model.gleam:286-288`).
- **lud16 / website on the detail view** — OLD parsed both (`profile-schema.ts:31`) and used them in the editor; NEW drops them everywhere.
- **Zap action** — `action-handler.ts:381-386` incremented a local zap counter from the note card's zap button; NEW disables the action entirely (`view.gleam:512`).
- **nip05 / lud16 / website editor fields and their preservation on save** — `profile-schema.ts:417-428`, `action-handler.ts:62-69`; NEW publishes only three fields (`update.gleam:100-104`), so saving erases the rest of the Kind 0 document.
- **Switch / generate key** — `profile-schema.ts:474-504`, `action-handler.ts:96-136` called `omni.auth.switchKey` / `generateKey` and re-initialised state.
- **Real signer identity resolution** — `index.ts:66-104` resolved NIP-07 → host session → localStorage; NEW hard-codes the seed pubkey (`model.gleam:23-24,89`).
- **Following list view** — `profile-schema.ts:505-564` rendered the Kind 3 list with per-row unfollow and profile drill-down; NEW only has the all-people directory.
- **Note actions and interaction stats** — `profile-schema.ts:202-241` (reply/repost/like/zap buttons), `profile-store.ts:103-177` and `relay-sync.ts:101-136` (Kind 6/7/9735 aggregation); NEW passes `stats.empty_stats` and `show_actions: False` (`view.gleam:294,503`).
- **History integration and back navigation** — `action-handler.ts:259-280`, `profile-schema.ts:268-283`, `index.ts:298-320`; NEW has no pushState, back bar, or popstate handling.
- **Relay backfill of missing profiles and notes** — `relay-sync.ts:11-99,138-154,314-347`; NEW relies entirely on host ingestion and issues no requests.

## Extras In NEW

- People directory with live, case-insensitive search across display name, name, nip05, about, hex pubkey and truncated npub (`view.gleam:44-94`, `model.gleam:234-253`).
- Deterministic seeded directory and notes so the plugin renders without a relay (`model.gleam:129-215`).
- Profile persistence through `local_store` with a versioned `profile_cache` config (`main.gleam:31-54`, `model.gleam:423-425`); newest-wins Kind 0 upsert (`model.gleam:408-420`).
- Shared `omni/social_ui/note_card` rendering with author-click navigation back into the plugin (`view.gleam:292-302,500-514`).
- Signer status indicator and explicit "Refresh Signer" action (`view.gleam:409-486`).
- "Back to Directory" buttons on metadata and keys views (`view.gleam:361-372,455-466`).
- Route aliases for `metadata|edit|editor` and `keys|key-custody|custody|signer` (`model.gleam:79-80`), plus action aliases for hyphen/snake-case names (`update.gleam:136-214`).
- Empty-state cards for no matches and no notes (`view.gleam:61-67,263-266`).
- Pure, testable `view_from_route`/`SelectView` navigation instead of DOM history side effects (`model.gleam:72-83`, `main.gleam:23-25`).

## Prioritized Restoration List

1. **Stop metadata data loss**: include `nip05`, `lud16`, `website` and `display_name` in the published Kind 0 JSON and preserve existing values — `update.gleam:98-125`. Effort S. Impact: high (users currently erase their own profile fields).
2. **Make the `about` field editable**: add a change action to `Textarea` (protocol + renderer) or switch to `Input` — `node.gleam:269-275`, `input.gleam:266-286`, `view.gleam:325-332`. Effort S/M. Impact: high (bio cannot be saved today).
3. **Restore the gradient banner**: render `avatar.banner_gradient(pubkey)` via `Card.banner_background` or a styled `Box` in `render_profile` — `view.gleam:276-289`, `avatar.gleam:180-193`. Effort S. Impact: medium (visual identity).
4. **Resolve the real signer identity and persist follows**: replace the hard-coded `my_pubkey` with host/signer input and save the Kind 3 set in `local_store` — `model.gleam:23-24,89`, `main.gleam:43-47`. Effort M. Impact: high (follow/metadata act on the wrong identity and follows vanish on reload).
5. **Wire deep links and history**: pass the URL search into `start_app_with_storage`, forward `view`/`id` through `OpenApp`, and push `?app=…&view=profile&id=…` on `SelectProfile` — `builtin.gleam:101`, `shell_boot.gleam:196-225`, `update.gleam:31-37`. Effort M. Impact: high (shareable/back-button-able profiles).
6. **Add profile back navigation**: a back bar in `render_profile` and popstate-driven `SelectView` — `view.gleam:154-290`. Effort S/M. Impact: medium.
7. **Restore following list and counts**: a following view backed by `model.follows.followed_pubkeys`, plus follower/following metrics — `view.gleam`, `model.gleam:281-288`. Effort M. Impact: medium.
8. **Restore nip05 / lud16 / website editor fields**: inputs plus draft fields and change messages — `view.gleam:308-403`, `update.gleam:71-96`. Effort S. Impact: medium.
9. **Restore note actions**: enable `show_actions` and wire like/repost/reply/zap messages — `view.gleam:500-514`, `update.gleam:136-214`. Effort M. Impact: medium.
10. **Restore key switch/generate**: buttons plus host auth effects — `view.gleam:409-486`. Effort M. Impact: medium (account switching).
11. **Restore relay backfill**: request Kind 0 for directory/followed authors and Kind 1 for the open profile, with dedupe — `main.gleam` effects, `model.gleam:355-405`. Effort M/L. Impact: medium (profiles appear without waiting for host traffic).
12. **Restore interaction stats**: feed Kind 6/7/9735 into per-note counters instead of `stats.empty_stats` — `view.gleam:294`. Effort M. Impact: low/medium.
