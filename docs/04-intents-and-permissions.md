# Intents & Permissions

> Current state. Contracts live in `gleam/protocol` (`intent`, `capability`,
> `grant`), enforcement in `gleam/kernel/acl`, and discovery/routing in
> `gleam/kernel/intents` plus the shell's intent settings UI.

## Intents

An intent is a standard action name plus a JSON payload, e.g. `view_note`,
`create_note`, `view_profile`, `search`, `share`. Plugins declare the intents
they handle in their descriptor (`handled_intents`); the shell shows and lets
the user toggle them per plugin.

Flow:

1. A component emits an intent (Schema action, protocol link, or `navigator.share`).
2. The shell/intent broker looks up enabled handlers.
3. Exactly one handler opens; multiple candidates produce the "Open With…"
   chooser modal; none available means the request is dropped.
4. The target plugin receives `intent.invoke` with the action and payload over
   its RPC channel.

Plugins never import each other. Opening a note from a profile, for example,
emits `view_note` and lets whichever reader plugin the user chose open it.

## Capabilities and grants

Capabilities describe what a plugin may do:

- `nostr:read:<filter scope>`, `nostr:write:<kind scope>`, `nostr:sign`;
- `storage`, `network:<host>`, `clipboard`, `notifications`, and custom
  plugin-declared capabilities.

`omni/protocol/grant` stores a per-plugin, per-capability grant:
`allow`, `deny`, or `prompt`. The kernel `CapabilityStore` persists grants via
the storage port; the ACL engine decides each request against the policy:

```
request(capability, kind?, d_tag?) + grant -> allow | deny | prompt
```

Prompts surface through the shell's permissions settings and the
`prompt_handler` passed to `KernelPorts`.

## Kind-level read filtering

`omni/kernel/acl/read_filter` removes sensitive kinds from shared queries:

- Encrypted DMs: 4, 13, 14, 1059, 1060
- Anything not explicitly granted for a non-self author

Filters are applied before events reach the local store query results for a
guest, so a plugin cannot read another plugin's private data even if it
subscribes broadly.

## RPC governance

Every guest request goes through the kernel RPC dispatcher over Channel 2:

- **Rate limiting** — per-plugin budget (`omni/kernel/rpc/rate_limit`).
- **Quota** — persistent byte accounting (`omni/kernel/rpc/quota`).
- **Capability checks** — each handler validates before touching the keystore,
  relays, storage, or intents.
- **Namespaced subscriptions** — `${pluginId}:${subId}`, preventing cross-plugin
  event leakage.

## Shell surfaces

The shell exposes the same model to users:

- **Permissions tab** — grant state per capability and standard kind list.
- **Intents tab** — per-plugin handled intents and default application routing.
- **Relay scoping** — per-plugin relay allow-lists or default-pool access.
- **Placements** — companion viewport assignment (dock, sidebar widget,
  header action) and route selection.
