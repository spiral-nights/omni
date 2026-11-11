# Nostr Extensions & Declarative Schema

> Current state. Schema AST: `gleam/protocol/src/omni/protocol/schema/node.gleam`;
> builders: `builder.gleam`; wire codec: `codec.gleam`; renderer:
> `gleam/ui/src/omni/ui/render/*` and `host.gleam`.

## Extended `window.nostr`

Beyond NIP-07, the bridge exposes:

```ts
nostr.fetch(filters, options)          // local cache + relays, deduped, newest-first
nostr.subscribe(filters, onEvent, onEose) // streaming subscription
nostr.publish(draft)                   // signs + broadcasts + caches
nostr.doc<T>(dTagOrSpec, options)      // reactive replaceable NIP-78 document
```

`doc` supports optimistic local writes, multi-device `onUpdate`, and optional
NIP-44 encryption. All calls are capability-checked in the kernel.

## Declarative Schema

The guest emits a tree over `{ type: "omni:schema", schema: RootNode }`.
`SchemaRenderer` mounts plain Lustre Light DOM elements (no Shadow DOM, no
custom-element wrapping). Actions return as
`{ type: "omni:action", action: { name, payload } }`.

### Node types

24 primitives cover layout, text, input, feedback, and lists:

- Layout: `Box` (direction/gap/align/justify/wrap/padding), `Card`
  (title/subtitle/icon/header action/footer), `Divider`, `Spacer`, `List`,
  `VirtualList`
- Text: `Text` (variant/tone/truncate/inline images), `Badge`, `CodeBlock`,
  `Metric`
- Input: `Input`, `Textarea`, `Toggle`, `Select`, `Button`, `IconButton`,
  `Tabs` (`TabItem`)
- Feedback: `Banner`, `StatusIndicator`, `Progress`, `EmptyState`
- Media/identity: `Icon`, `Avatar`

Every node carries an optional `NodeBase` (`id`, `key`, `visible`, `style`,
`page`) and can carry an `Action`.

### Actions and navigation

```gleam
Action(name: "select-tab", payload: Some(dict), navigate: None)
```

Payloads are `Option(Dict(String, Dynamic))`; use
`schema.payload_string/int/bool` helpers. Navigation targets open a plugin
route or navigate back. Standard action names used by first-party plugins:
`select-tab`, `open-thread`/`view_note`, `publish-note`, `load-more`,
`select-preset`, `save_active_note`, `toggle_star`, `add_tag`, …
The guest decodes them with `update.action_to_msg`.

### Styling contract

- Use `StyleRaw` for small layout tweaks; prefer tokens and logical variants.
- Shared primitives and `.omni-*` classes are styled by `schema.css`.
- Apps self-constrain reading widths; the shell gives them an expansive canvas.

### Rendering pipeline

`omni_ui/render/{layout,text,input,feedback,list}.gleam` maps nodes to Lustre
elements; `virtual_list.gleam` handles windowed lists; `host.gleam` mounts the
tree, dispatches `omni:action`, and updates nodes in place. Golden snapshots in
`gleam/social_ui/test/golden` pin the shared note card markup.
