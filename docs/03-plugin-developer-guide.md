# Plugin Developer Guide

> Current state. Plugins are authored with `omni_plugin_kit` and built as Gleam
> packages under `gleam/plugins/<name>` (`plugin_<name>`, modules `plugin/<name>/...`).

## What a plugin is

A plugin is a **standard nsite**: plain HTML/JS, or Gleam compiled to JS that
renders Declarative Schema. It uses only standard web APIs and the host's
virtualised surfaces:

- `window.nostr` — NIP-07 plus extended `fetch`, `subscribe`, `publish`, `doc`.
- `window.WebSocket` — virtual relay socket over the host relay pool.
- `localStorage` — partitioned per plugin by the guest bridge.
- `navigator.share`, `nostr:`/`lightning:`/`cashu:` links — routed to the shell.
- Schema messages — the plugin emits UI as a Schema tree.

There is no `omni.*` SDK, no manifest file, and no cross-plugin import.

## The plugin harness

```gleam
import omni/plugin_kit/app.{AppSpec}
import omni/plugin_kit/route
import omni/plugin_kit/schema
import omni/plugin_kit/nostr

pub fn app_spec() -> AppSpec(Model, Msg) {
  AppSpec(
    init: fn(initial_route) { #(model.init(initial_route), []) },
    update: update.update,
    view: view.view,
    on_action: update.action_to_msg,
    on_route_change: Some(fn(route) { SelectView(model.view_from_route(route)) }),
  )
}
```

- `init(route)` returns `#(model, effects)`.
- `update(model, msg)` is pure and returns `#(model, effects)`.
- `view(model)` returns `Schema.Node`.
- `on_action(action)` decodes `{ name, payload }` from host clicks/inputs.
- `on_route_change` maps `?view=...` routes to messages.

Start a running instance with `app.start(spec, route, emit_schema)`; the host
receives the tree over Channel 1 and mounts it in Light DOM.

## Routes

Parse with `omni/plugin_kit/route` (`route.parse_search("?view=widget")`,
`route.get_param(route, "id")`). Any `?view=settings` route is surfaced in the
shell's Settings automatically.

## State & persistence

- `omni/plugin_kit/local_store` provides versioned JSON configs
  (`StoreConfig(key, version, encode, decoder, default)`); load on init, save on
  update.
- `omni/plugin_kit/nostr.open_doc` gives a reactive replaceable NIP-78 document
  with optimistic local writes, multi-device updates, and optional NIP-44
  encryption.

## Shared domain code

- `omni_social`: notes, profiles, threads (NIP-10), stats (kinds 1/6/7/9735),
  follows (kind 3), queries, profile cache.
- `omni_social_ui`: the shared note card (`NoteCardConfig` toggles interactive
  vs read-only), used by feed and profiles. Clicking a note emits the standard
  `view_note` intent instead of implementing a thread viewer.

Shared libraries are statically linked into each plugin bundle: plugins stay
autonomous, no runtime dependency between them.

## Writing a plugin package

1. Create `gleam/plugins/<name>/gleam.toml` (`plugin_<name>`, JS target,
   `omni_plugin_kit`, `omni_protocol`, `omni_platform`).
2. Add `model.gleam`, `msg.gleam`, `update.gleam`, `view.gleam`, `main.gleam`,
   and `test/plugin_<name>_test.gleam`.
3. Use declarative Schema builders (`omni/protocol/schema/builder`) for UI and
   never construct raw HTML.
4. Keep `update` pure; emit effects for host work.
5. Run `cd gleam/plugins/<name> && gleam format && gleam test`.

Existing implementations to copy from: `plugins/feed`, `plugins/notes`,
`plugins/checklist`, `plugins/profiles`, `plugins/timer`, `plugins/relays`,
`plugins/publisher`.
