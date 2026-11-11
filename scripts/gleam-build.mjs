#!/usr/bin/env node
// Builds / tests / format-checks every Gleam package under gleam/ in dependency order.
// Dependencies between packages are `path` deps declared in each gleam.toml.
//
// Usage: node scripts/gleam-build.mjs [build|test|check] [--only <package_name>]
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "gleam");
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

function findPackages(dir) {
  const found = [];
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "build" || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (existsSync(join(full, "gleam.toml"))) found.push(full);
    else found.push(...findPackages(full));
  }
  return found;
}

function readPackage(dir) {
  const toml = readFileSync(join(dir, "gleam.toml"), "utf8");
  const name = toml.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
  const deps = [];
  for (const m of toml.matchAll(/^\s*\w+\s*=\s*\{\s*path\s*=\s*"([^"]+)"\s*\}/gm)) {
    deps.push(resolve(dir, m[1]));
  }
  return { dir, name, deps };
}

const packages = findPackages(root).map(readPackage);
const byDir = new Map(packages.map((p) => [p.dir, p]));

// Depth-first topological sort: dependencies first.
const ordered = [];
const state = new Map();
function visit(pkg, trail = []) {
  if (state.get(pkg.dir) === "done") return;
  if (state.get(pkg.dir) === "visiting") {
    throw new Error(`Dependency cycle: ${[...trail, pkg.name].join(" -> ")}`);
  }
  state.set(pkg.dir, "visiting");
  for (const dep of pkg.deps) {
    const depPkg = byDir.get(dep);
    if (!depPkg) throw new Error(`${pkg.name} has a path dependency on unknown package at ${dep}`);
    visit(depPkg, [...trail, pkg.name]);
  }
  state.set(pkg.dir, "done");
  ordered.push(pkg);
}
packages.sort((a, b) => a.name.localeCompare(b.name)).forEach((p) => visit(p));

const targets = only ? ordered.filter((p) => p.name === only) : ordered;
if (only && targets.length === 0) {
  console.error(`No Gleam package named "${only}"`);
  process.exit(2);
}

let failed = false;
for (const pkg of targets) {
  console.log(`\n=== gleam ${modes[mode].join(" ")} :: ${pkg.name} ===`);
  const r = spawnSync("gleam", modes[mode], { cwd: pkg.dir, stdio: "inherit" });
  if (r.status !== 0) {
    failed = true;
    break;
  }
}
process.exit(failed ? 1 : 0);
