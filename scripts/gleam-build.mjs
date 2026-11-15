#!/usr/bin/env node
// Builds / tests / format-checks every Gleam package under gleam/ in dependency order.
//
// Usage: node scripts/gleam-build.mjs [build|test|check] [--only <package_name>]
import { spawnSync } from "node:child_process";
import { orderedPackages, rootPackages, syncConfigFingerprints } from "./lib/gleam-packages.mjs";
import { buildInterop } from "./vite-plugin-gleam.mjs";

const modes = {
  build: ["build"],
  test: ["test"],
  check: ["format", "--check"],
};

const mode = process.argv[2] ?? "build";
if (!modes[mode]) {
  console.error(`Unknown mode "${mode}". Use: ${Object.keys(modes).join(", ")}`);
  process.exit(2);
}
const onlyIdx = process.argv.indexOf("--only");
const only = onlyIdx > -1 ? process.argv[onlyIdx + 1] : null;
const allPackages = process.argv.includes("--all");

const ordered = orderedPackages();
if (mode === "build" || mode === "test") {
  syncConfigFingerprints(ordered);
}
const defaultTargets = mode === "build" && !allPackages ? rootPackages() : ordered;
const targets = only ? ordered.filter((p) => p.name === only) : defaultTargets;
if (only && targets.length === 0) {
  console.error(`No Gleam package named "${only}"`);
  process.exit(2);
}

for (const pkg of targets) {
  console.log(`\n=== gleam ${modes[mode].join(" ")} :: ${pkg.name} ===`);
  if (mode === "build" && pkg.name === "omni_interop") {
    buildInterop();
    continue;
  }
  const r = spawnSync("gleam", modes[mode], { cwd: pkg.dir, stdio: "inherit" });
  if (r.status !== 0) process.exit(1);
  if (mode === "build" || mode === "test") {
    syncConfigFingerprints(ordered);
  }
}
