import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const tscBin = path.join(rootDir, "node_modules/.bin/tsc");

/**
 * @typedef {Object} PackageTarget
 * @property {string} name
 * @property {string} dir
 * @property {string} srcDir
 * @property {string} tsconfig
 * @property {string} distTarget
 * @property {boolean} isPlugin
 */

/**
 * Returns all Omni packages in topological dependency order.
 * @returns {PackageTarget[]}
 */
export function getAllPackages() {
  /** @type {PackageTarget[]} */
  const packages = [];

  // 1. Foundation: @omni/types
  const typesDir = path.join(rootDir, "packages/types");
  if (fs.existsSync(typesDir)) {
    packages.push({
      name: "@omni/types",
      dir: typesDir,
      srcDir: path.join(typesDir, "src"),
      tsconfig: path.join(typesDir, "tsconfig.json"),
      distTarget: path.join(typesDir, "dist/index.d.ts"),
      isPlugin: false
    });
  }

  // 2. Headless Kernel: @omni/core
  const coreDir = path.join(rootDir, "packages/core");
  if (fs.existsSync(coreDir)) {
    packages.push({
      name: "@omni/core",
      dir: coreDir,
      srcDir: path.join(coreDir, "src"),
      tsconfig: path.join(coreDir, "tsconfig.json"),
      distTarget: path.join(coreDir, "dist/index.js"),
      isPlugin: false
    });
  }

  // 3. Shell UI Frame: @omni/plugin-shell
  const shellDir = path.join(rootDir, "packages/plugins/shell");
  if (fs.existsSync(shellDir)) {
    packages.push({
      name: "@omni/plugin-shell",
      dir: shellDir,
      srcDir: path.join(shellDir, "src"),
      tsconfig: path.join(shellDir, "tsconfig.json"),
      distTarget: path.join(shellDir, "dist/index.js"),
      isPlugin: true
    });
  }

  // 4. Dynamic First-Class System Plugins in packages/plugins/*
  const pluginsDir = path.join(rootDir, "packages/plugins");
  if (fs.existsSync(pluginsDir)) {
    const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory() || ent.name === "shell") continue;
      const pkgDir = path.join(pluginsDir, ent.name);
      const pkgJsonPath = path.join(pkgDir, "package.json");
      const tsconfigPath = path.join(pkgDir, "tsconfig.json");

      if (fs.existsSync(pkgJsonPath) && fs.existsSync(tsconfigPath)) {
        try {
          const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
          packages.push({
            name: pkgJson.name || `@omni/plugin-${ent.name}`,
            dir: pkgDir,
            srcDir: path.join(pkgDir, "src"),
            tsconfig: tsconfigPath,
            distTarget: path.join(pkgDir, "dist/index.js"),
            isPlugin: true
          });
        } catch (_) {}
      }
    }
  }

  return packages;
}

/**
 * Recursively gets the newest mtime among all files in a directory.
 * @param {string} dir
 * @returns {number}
 */
export function getLatestMtime(dir) {
  let latest = 0;
  if (!fs.existsSync(dir)) return 0;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) {
        latest = Math.max(latest, getLatestMtime(fullPath));
      } else if (entry.isFile()) {
        const stat = fs.statSync(fullPath);
        latest = Math.max(latest, stat.mtimeMs);
      }
    } catch (_) {}
  }
  return latest;
}

/**
 * Checks if a package has source files newer than its dist output.
 * @param {PackageTarget} pkg
 * @returns {boolean}
 */
export function isPackageStale(pkg) {
  if (!fs.existsSync(pkg.distTarget)) return true;

  const distMtime = fs.statSync(pkg.distTarget).mtimeMs;
  const srcMtime = getLatestMtime(pkg.srcDir);

  return srcMtime > distMtime;
}

/**
 * Builds a single package using workspace tsc.
 * @param {PackageTarget} pkg
 * @returns {number} elapsed ms
 */
export function buildPackage(pkg) {
  const start = performance.now();
  if (pkg.name === "@omni/types") {
    execSync(`"${ path.join(rootDir, "node_modules/.bin/jco") }" types wit/omni.wit -o src/wit`, {
      stdio: "inherit",
      cwd: pkg.dir
    });
  } else if (pkg.name === "@omni/core") {
    execSync(`node scripts/generate-wit-host.js`, {
      stdio: "inherit",
      cwd: pkg.dir
    });
  }
  execSync(`"${tscBin}" -p "${pkg.tsconfig}"`, {
    stdio: "inherit",
    cwd: rootDir
  });

  const pkgJsonPath = path.join(pkg.dir, "package.json");
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
      if (pkgJson.scripts?.build?.includes("esbuild")) {
        execSync(`pnpm --filter "${pkg.name}" exec esbuild src/index.ts --bundle --format=esm --target=es2022 --outfile=dist/index.js`, {
          stdio: "inherit",
          cwd: rootDir
        });
      }
    } catch (_) {}
  }

  // Ensure dist target exists and touch its mtime so downstream watchers register the change
  if (fs.existsSync(pkg.distTarget)) {
    const now = new Date();
    try {
      fs.utimesSync(pkg.distTarget, now, now);
    } catch (_) {}
  }

  return Math.round(performance.now() - start);
}

/**
 * Scans all packages, detects stale plugins/packages, and compiles them in order.
 * @returns {{ built: string[]; skipped: string[] }}
 */
export function buildStalePackages() {
  const packages = getAllPackages();
  const built = [];
  const skipped = [];

  let forceRebuildDependents = false;

  for (const pkg of packages) {
    const stale = forceRebuildDependents || isPackageStale(pkg);

    if (stale) {
      console.log(`\x1b[36m⚡ [Omni AutoBuild]\x1b[0m Compiling stale package \x1b[1m${pkg.name}\x1b[0m...`);
      try {
        const ms = buildPackage(pkg);
        console.log(`\x1b[32m✔ [Omni AutoBuild]\x1b[0m Built \x1b[1m${pkg.name}\x1b[0m in ${ms}ms`);
        built.push(pkg.name);

        // If core types or core runtime changed, dependents should also recompile
        if (pkg.name === "@omni/types" || pkg.name === "@omni/core") {
          forceRebuildDependents = true;
        }
      } catch (err) {
        console.error(`\x1b[31m✖ [Omni AutoBuild]\x1b[0m Build failed for ${pkg.name}:`, err);
        throw err;
      }
    } else {
      skipped.push(pkg.name);
    }
  }

  if (built.length === 0) {
    console.log(`\x1b[32m✔ [Omni AutoBuild]\x1b[0m All ${packages.length} packages and plugins are up to date.`);
  }

  return { built, skipped };
}

// If executed directly from CLI: node scripts/autobuild.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    buildStalePackages();
  } catch (_) {
    process.exit(1);
  }
}
