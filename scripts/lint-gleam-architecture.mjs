#!/usr/bin/env node
// Architecture lint for the Gleam rewrite. Enforces the rules in
// docs/gleam-rewrite-plan.md that the compiler cannot:
//   1. FFI quarantine: @external / .mjs only in platform, bridge, testkit
//   2. Layering: allowed path dependencies between packages
//   3. Plugin isolation: no plugin_* -> plugin_* dependency or import
//   4. No hard-coded plugin ids in shell, ui, or shared stylesheets
//   5. No proprietary `omni.*` SDK references in plugins and plugin libraries
//   6. No emoji in source or styles
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative, resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gleamRoot, findPackages, readPackage } from "./lib/gleam-packages.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Packages (by gleam/ directory name) that may contain FFI. */
const FFI_ALLOWED = new Set(["platform", "bridge", "testkit", "interop"]);

/** package name -> package names it may depend on (path deps). Unlisted => no gleam deps. */
const ALLOWED_DEPS = {
  omni_platform: [],
  omni_nostr: ["omni_platform"],
  omni_protocol: ["omni_nostr", "omni_platform"],
  omni_kernel: ["omni_protocol", "omni_nostr", "omni_platform"],
  omni_sandbox: ["omni_kernel", "omni_protocol", "omni_nostr", "omni_platform"],
  omni_bridge: ["omni_protocol", "omni_nostr", "omni_platform"],
  omni_ui: ["omni_protocol", "omni_platform", "omni_testkit"],
  omni_plugin_kit: ["omni_protocol", "omni_nostr", "omni_platform"],
  omni_social: ["omni_nostr", "omni_protocol", "omni_plugin_kit", "omni_platform"],
  omni_social_ui: ["omni_social", "omni_protocol", "omni_ui", "omni_nostr"],
  omni_shell: ["omni_kernel", "omni_sandbox", "omni_ui", "omni_protocol", "omni_nostr", "omni_platform"],
  omni_web: ["omni_shell", "omni_kernel", "omni_sandbox", "omni_ui", "omni_protocol", "omni_platform"],
  omni_interop: ["*"], // temporary TS facade; may depend on anything
  omni_testkit: ["omni_platform", "omni_nostr", "omni_protocol"],
};
const PLUGIN_LIB_ALLOWED = [
  "omni_plugin_kit", "omni_social", "omni_social_ui", "omni_ui",
  "omni_protocol", "omni_nostr", "omni_platform", "omni_testkit",
];
const PLUGIN_OR_LIB = /^(plugin_|omni_(plugin_kit|social|social_ui)$)/;

const errors = [];
const fail = (file, msg) => errors.push(`${relative(repoRoot, file)}: ${msg}`);

function walk(dir, visit) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "build" || entry.name === "node_modules" || entry.name === ".git") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, visit);
    else visit(full);
  }
}

const packages = findPackages().map(readPackage);
const dirNameOf = (p) => relative(gleamRoot, p.dir).split(sep)[0];

for (const pkg of packages) {
  const top = dirNameOf(pkg);
  const isPlugin = pkg.name?.startsWith("plugin_");
  const depNames = pkg.deps.map((d) => packages.find((p) => p.dir === d)?.name).filter(Boolean);

  // 2 + 3: layering and plugin isolation
  const allowed = isPlugin ? PLUGIN_LIB_ALLOWED : ALLOWED_DEPS[pkg.name];
  if (!allowed) {
    fail(join(pkg.dir, "gleam.toml"), `package "${pkg.name}" is not in the layering table (scripts/lint-gleam-architecture.mjs)`);
  } else if (!allowed.includes("*")) {
    for (const dep of depNames) {
      if (isPlugin && dep.startsWith("plugin_")) fail(join(pkg.dir, "gleam.toml"), `plugin "${pkg.name}" must not depend on plugin "${dep}"`);
      else if (!allowed.includes(dep)) fail(join(pkg.dir, "gleam.toml"), `"${pkg.name}" must not depend on "${dep}"`);
    }
  }

  const isPluginOrLib = PLUGIN_OR_LIB.test(pkg.name ?? "");
  const isUiLayer = ["shell", "ui"].includes(top);

  walk(pkg.dir, (file) => {
    const rel = relative(pkg.dir, file);
    const isGleam = file.endsWith(".gleam");
    const isMjs = file.endsWith(".mjs");
    const text = isGleam || isMjs ? readFileSync(file, "utf8") : "";

    // 1: FFI quarantine (the plugin dir name is "plugins")
    if (!FFI_ALLOWED.has(top)) {
      if (isMjs) fail(file, `.mjs files are only allowed in: ${[...FFI_ALLOWED].join(", ")}`);
      if (isGleam && /@external\s*\(/.test(text)) fail(file, `@external is only allowed in: ${[...FFI_ALLOWED].join(", ")}`);
    }
    if (isMjs && FFI_ALLOWED.has(top) && !/\.ffi\.mjs$/.test(file)) fail(file, `FFI files must be named <module>.ffi.mjs`);

    if (isGleam) {
      // 3: plugin imports another plugin
      if (pkg.name?.startsWith("plugin_")) {
        const own = pkg.name.replace(/^plugin_/, "");
        for (const m of text.matchAll(/^import\s+plugin\/([a-z0-9_]+)/gm)) {
          if (m[1] !== own) fail(file, `plugin imports another plugin: plugin/${m[1]}`);
        }
      }
      // 4: hard-coded plugin ids in shell/ui
      if (isUiLayer && /org\.omni\.plugin\./.test(text)) fail(file, "hard-coded plugin id in shell/ui code");
      // 5: proprietary SDK references
      if (isPluginOrLib) {
        const stripped = text.replace(/org\.omni\./g, "").replace(/\/\/.*$/gm, "");
        if (/(?<![\w.\/])(window\.)?omni\.[a-zA-Z_]/.test(stripped)) fail(file, "reference to proprietary omni.* SDK");
      }
    }
    if (isMjs && isPluginOrLib && /(?<![\w.\/])window\.omni\b|(?<![\w.\/])omni\.[a-zA-Z_]/.test(text.replace(/org\.omni\./g, ""))) {
      fail(file, "reference to proprietary omni.* SDK");
    }
    // 6: emoji
    if ((isGleam || isMjs) && /\p{Extended_Pictographic}/u.test(text)) fail(file, "emoji in source (use monochrome SVG icons)");
  });
}

// 4 + 6 for shared stylesheets
walk(join(repoRoot, "assets", "styles"), (file) => {
  if (!file.endsWith(".css")) return;
  const text = readFileSync(file, "utf8");
  if (/org\.omni\.plugin|\.feed-active|plugin-id|data-plugin-id=/.test(text)) fail(file, "stylesheet references a specific plugin");
  if (/\p{Extended_Pictographic}/u.test(text)) fail(file, "emoji in stylesheet");
});

if (errors.length) {
  console.error(`Gleam architecture lint failed (${errors.length}):\n` + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}
console.log(`Gleam architecture lint passed (${packages.length} packages).`);
