// Shared discovery and dependency ordering of Gleam packages under gleam/.
// Dependencies between packages are `path` deps declared in each gleam.toml.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const gleamRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "gleam");

/** Recursively find directories containing a gleam.toml. */
export function findPackages(dir = gleamRoot) {
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

/** Read name and path dependencies from a package's gleam.toml. */
export function readPackage(dir) {
  const toml = readFileSync(join(dir, "gleam.toml"), "utf8");
  const name = toml.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
  const deps = [];
  for (const m of toml.matchAll(/^\s*\w+\s*=\s*\{\s*path\s*=\s*"([^"]+)"\s*\}/gm)) {
    deps.push(resolve(dir, m[1]));
  }
  return { dir, name, deps };
}

/** All packages, dependencies first (depth-first topological sort). */
export function orderedPackages() {
  const packages = findPackages().map(readPackage);
  const byDir = new Map(packages.map((p) => [p.dir, p]));
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
  return ordered;
}
