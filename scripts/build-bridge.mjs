#!/usr/bin/env node
// Bundles the Gleam guest bridge into one injectable IIFE script.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import { gleamRoot, syncConfigFingerprints } from "./lib/gleam-packages.mjs";

const bridgeDir = join(gleamRoot, "bridge");
const entry = join(bridgeDir, "js", "guest-runtime.mjs");
const outfile = join(bridgeDir, "dist", "guest-runtime.js");

syncConfigFingerprints();
const compile = spawnSync("gleam", ["build"], {
  cwd: bridgeDir,
  stdio: "inherit",
});
if (compile.status !== 0) process.exit(compile.status ?? 1);
syncConfigFingerprints();

const compiledModule = join(
  bridgeDir,
  "build",
  "dev",
  "javascript",
  "omni_bridge",
  "omni",
  "bridge",
  "websocket_shim.mjs",
);
if (!existsSync(compiledModule)) {
  console.error("Gleam bridge did not produce compiled modules");
  process.exit(1);
}

mkdirSync(join(bridgeDir, "dist"), { recursive: true });

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  legalComments: "none",
  banner: {
    js: "/* Omni guest bridge (Gleam omni_bridge) */",
  },
});

console.log(`[omni-bridge] wrote ${outfile}`);
