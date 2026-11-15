// Shared discovery and dependency ordering of Gleam packages under gleam/.
// Dependencies between packages are `path` deps declared in each gleam.toml.
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const gleamRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "gleam");

/** Recursively find directories containing a gleam.toml. */
export function findPackages(dir = gleamRoot) {
  const found = [];
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "build" || entry.name === "dist" || entry.name === "node_modules") continue;
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

/**
 * Packages that no other Gleam package depends on (leaf/root build targets).
 * Compiling these with `gleam build` compiles the entire dependency graph without
 * repeating `gleam build` in every intermediate package directory.
 */
export function rootPackages() {
  const ordered = orderedPackages();
  const dependedOn = new Set();
  for (const pkg of ordered) {
    for (const dep of pkg.deps) {
      dependedOn.add(dep);
    }
  }
  return ordered.filter((pkg) => !dependedOn.has(pkg.dir));
}

/**
 * Gleam 1.19's `ManifestUpdated::gleam_toml_changed` checks
 * `build/packages/<local_dep>.config_fingerprint` for every local `path`
 * dependency in `manifest.toml`. On a fresh checkout (`build/` is gitignored),
 * those fingerprint files are missing, causing `gleam build` / `gleam test` to
 * hit the remote Hex API (`Resolving versions`) in every package and trigger
 * HTTP 429 rate-limit failures in CI.
 *
 * Pre-seeding and syncing `<pkg>.config_fingerprint` across packages ensures
 * `gleam` uses the committed `manifest.toml` directly without querying the Hex
 * API.
 */
const KNOWN_CONFIG_FINGERPRINTS = {
  omni_kernel: "2689747082959571761",
  omni_nostr: "8899079069289192649",
  omni_platform: "2343797400461880199",
  omni_plugin_kit: "2065856417810315290",
  omni_protocol: "3066591235036090489",
  omni_sandbox: "15511289451715415724",
  omni_shell: "7383470455550203468",
  omni_social: "17350719567501637415",
  omni_social_ui: "4381747902448024769",
  omni_testkit: "6817748373294405171",
  omni_ui: "2038530022532356954",
  omni_web: "17023794420749444401",
  plugin_checklist: "14532981848688457319",
  plugin_feed: "15407284713441986075",
  plugin_notes: "8593345721642402352",
  plugin_profiles: "7036698404621277619",
  plugin_publisher: "7490054156309273082",
  plugin_relays: "1862683124975354739",
  plugin_timer: "11030532790692333228",
};

export function syncConfigFingerprints(packages = orderedPackages()) {
  const fingerprints = new Map(
    Object.entries(KNOWN_CONFIG_FINGERPRINTS).map(([k, v]) => [
      `${k}.config_fingerprint`,
      v,
    ]),
  );

  for (const pkg of packages) {
    const bp = join(pkg.dir, "build", "packages");
    if (!existsSync(bp)) continue;
    for (const file of readdirSync(bp)) {
      if (file.endsWith(".config_fingerprint")) {
        fingerprints.set(file, readFileSync(join(bp, file), "utf8").trim());
      }
    }
  }

  for (const pkg of packages) {
    const bp = join(pkg.dir, "build", "packages");
    mkdirSync(bp, { recursive: true });
    for (const [file, value] of fingerprints) {
      const target = join(bp, file);
      if (!existsSync(target)) {
        writeFileSync(target, value);
      }
    }
  }
}
