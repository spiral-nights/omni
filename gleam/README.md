# Omni Gleam packages

Gleam (JavaScript target) rewrite of Omni. See `docs/gleam-rewrite-plan.md` for design and
`docs/07-gleam-migration-checklist.md` for progress.

Layout: directory `gleam/<name>` → package `omni_<name>` → modules `omni/<name>/...`
(plugins: `gleam/plugins/<name>` → `plugin_<name>` → `plugin/<name>/...`).

Dependencies between packages are `path` dependencies. Only `platform` (and later `bridge`)
may contain `@external` / `.mjs` files, one `<module>.ffi.mjs` per Gleam module.

Run a package's tests: `cd gleam/<name> && gleam test`.
