// Vite plugin: keeps the Gleam interop package compiled during `vite` / `vite build`.
//
// TS reaches Gleam only through the workspace package @omni/gleam-interop
// (gleam/interop/package.json exports its build output), e.g.
//   import { decide } from "@omni/gleam-interop/acl";
// All TS -> Gleam calls must go through that ONE Gleam build directory. Gleam
// custom types (Ok, Error, List, ...) are JS classes, so importing from two
// separate build dirs would duplicate gleam_stdlib and break `instanceof`.
import { spawnSync } from "node:child_process";
import { join, normalize } from "node:path";
import { gleamRoot } from "./lib/gleam-packages.mjs";

const interopDir = join(gleamRoot, "interop");

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
