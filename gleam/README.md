# Omni Gleam packages

All Omni runtime code, compiled to JavaScript. See `docs/README.md` for the
architecture guides and `docs/01-architecture.md` for the package layering.

Layout: directory `gleam/<name>` → package `omni_<name>` → modules
`omni/<name>/...` (plugins: `gleam/plugins/<name>` → `plugin_<name>` →
`plugin/<name>/...`).

Dependencies between packages are `path` dependencies. FFI (`@external`,
`.mjs`) is quarantined to `platform`, `bridge`, `testkit`, and `interop`.

Commands: `pnpm build`, `pnpm test`, `pnpm gleam:check` from the repo root, or
`cd gleam/<name> && gleam test` for one package.
