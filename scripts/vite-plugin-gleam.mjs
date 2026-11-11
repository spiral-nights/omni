// Vite plugin: compiles the Gleam interop package and exposes its output to TS.
//
// All TS -> Gleam calls must go through ONE Gleam build directory. Gleam custom
// types (Ok, Error, List, ...) are JS classes, so importing from two separate
// build dirs would duplicate gleam_stdlib and break `instanceof` checks.
//
// Usage in TS:  import { is_valid } from "@omni/gleam/viewport.mjs";
import { spawnSync } from "node:child_process";
import { join, normalize } from "node:path";
import { gleamRoot } from "./lib/gleam-packages.mjs";

const interopDir = join(gleamRoot, "interop");
const outputDir = join(interopDir, "build/dev/javascript/omni_interop/omni/interop");

function buildInterop() {
  const started = Date.now();
  const r = spawnSync("gleam", ["build"], { cwd: interopDir, stdio: "inherit" });
  if (r.status !== 0) throw new Error("gleam build failed for omni_interop");
  return Date.now() - started;
}

/** @returns {import("vite").Plugin} */
export function gleamInteropPlugin() {
  return {
    name: "omni-gleam-interop",
    config: () => ({ resolve: { alias: { "@omni/gleam": outputDir } } }),
    buildStart() {
      buildInterop();
    },
    configureServer(server) {
      server.watcher.add(gleamRoot);
      const onChange = (file) => {
        const f = normalize(file);
        if (!f.startsWith(normalize(gleamRoot)) || f.includes("/build/")) return;
        if (!/\.(gleam|mjs|toml)$/.test(f)) return;
        try {
          const ms = buildInterop();
          console.log(`[omni-gleam] rebuilt in ${ms}ms`);
          server.ws.send({ type: "full-reload", path: "*" });
        } catch (err) {
          console.error("[omni-gleam] build failed", err);
        }
      };
      server.watcher.on("change", onChange);
      server.watcher.on("add", onChange);
    },
  };
}
