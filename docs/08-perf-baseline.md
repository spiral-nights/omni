# Bundle Size Baseline (Phase 8.4)

Measured on the current Gleam build. Run
`pnpm build && pnpm bundle:report` to reproduce.

| Asset | Raw | gzip |
|---|---|---|
| Guest bridge (`gleam/bridge/dist/guest-runtime.js`) | 92.3 kB | 18.8 kB |
| Host JS (kernel + shell + UI + interop in one chunk) | 267.0 kB | 71.4 kB |
| Host CSS | 0.5 kB | 0.3 kB |
| `index.html` | 1.0 kB | 0.5 kB |
| **Total** | **360.8 kB** | **91.0 kB gzip** |

Notes:

- The host JS chunk contains the entire Gleam runtime (kernel, shell, themes,
  UI, plugin kit, web bootloader) because `apps/web` imports one facade.
  Splitting the shell themes and plugin adapters into lazy chunks is the
  obvious first optimization if startup size matters.
- These numbers are the reference point for future regressions.
