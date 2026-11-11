# Gleam Toolchain

Verified on 2026-11-11 with Gleam 1.19.2 (JavaScript target, Node 26).
The compiler is the only non-Node toolchain required.

## Pinned dependencies

| Package | Constraint | Purpose | Notes |
|---|---|---|---|
| `gleam_stdlib` | `>= 1.0.0 and < 2.0.0` | core | resolved 1.0.5 |
| `gleam_json` | `>= 3.1.0 and < 4.0.0` | JSON codecs | resolved 3.1.0 |
| `gleam_javascript` | `>= 1.0.1 and < 2.0.0` | `Promise`, arrays, symbols | resolved 1.0.1 |
| `lustre` | `>= 5.7.1 and < 6.0.0` | UI (shell, schema renderer) | resolved 5.7.1 |
| `gleeunit` | `>= 1.0.0 and < 2.0.0` | test runner | dev; `assert` supported |
| `qcheck` | `>= 1.0.5 and < 2.0.0` | property tests | dev; verified on JS target |

## Build & run

```bash
pnpm build          # ordered Gleam build + guest bridge bundle + Vite host build
pnpm test           # bridge conformance (Vitest) + every Gleam package suite
pnpm gleam:check    # format --check + type-check + architecture lint
pnpm dev            # Vite dev server with Gleam interop rebuild on change
```

Each package's tests run with `gleam test` from its directory; the ordered
runner (`scripts/gleam-build.mjs`) topologically sorts path dependencies.

## Test framework

- **Runner:** `gleeunit` (`gleam test`, JS target on Node).
- **Property tests:** `qcheck`, used for bech32, filters, replaceable selection, ACL policy, codecs.
- **Snapshots:** `birdie` is **not usable**: it requires `gleam_erlang` (Erlang target only). Instead `testkit` provides a small file-based snapshot/golden helper (`testkit/golden`) backed by Node `fs`. `testkit` is a dev-only package and is the one other place besides `platform` and `bridge` allowed to contain `.mjs`.
- **DOM tests:** `happy-dom`, used by the Vitest bridge conformance suite in `tests/bridge/`.
- `startest` rejected: dependency conflicts with current `tom` constraints.

## Constraints

- Path dependencies across packages and the shared `omni/` module namespace
  work (see `gleam/protocol/test`).
- **Lustre components always use Shadow DOM** (`open_shadow_root` only toggles
  open/closed). The Schema renderer therefore uses plain Lustre elements, not
  custom elements.
- `gleam/**/manifest.toml` is committed for reproducible builds.
- FFI (`.mjs`, `@external`) is quarantined to `platform`, `bridge`, `testkit`,
  and `interop`; one `<module>.ffi.mjs` per module. Bundler entries may live
  under `gleam/*/js/`.
