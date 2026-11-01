import { defineConfig, type Plugin } from "vite";
import path from "node:path";
import {
  buildStalePackages,
  getAllPackages,
  buildPackage
} from "../../scripts/autobuild.js";

function omniAutoBuildPlugin(): Plugin {
  let isBuilding = false;
  const buildQueue = new Set<string>();
  let debounceTimer: NodeJS.Timeout | null = null;

  return {
    name: "omni-autobuild-plugin",

    // 1. On startup (dev server or build): detect and compile any stale packages
    buildStart() {
      buildStalePackages();
    },

    // 2. During dev: watch all packages/*/src directories and auto-compile on changes
    configureServer(server) {
      const allPkgs = getAllPackages();

      // Add all package src directories to Vite file watcher
      for (const pkg of allPkgs) {
        server.watcher.add(pkg.srcDir);
      }

      const handleFileChange = (filePath: string) => {
        const normPath = path.normalize(filePath);
        // Find which package this changed file belongs to
        const matchedPkg = allPkgs.find((p) =>
          normPath.startsWith(path.normalize(p.srcDir))
        );

        if (!matchedPkg) return;

        buildQueue.add(matchedPkg.name);

        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (isBuilding) return;
          isBuilding = true;

          const toBuild = Array.from(buildQueue);
          buildQueue.clear();

          try {
            for (const pkgName of toBuild) {
              const target = allPkgs.find((p) => p.name === pkgName);
              if (target) {
                console.log(
                  `\x1b[36m⚡ [Omni AutoBuild]\x1b[0m File changed in \x1b[1m${target.name}\x1b[0m. Rebuilding...`
                );
                const ms = buildPackage(target);
                console.log(
                  `\x1b[32m✔ [Omni AutoBuild]\x1b[0m Rebuilt \x1b[1m${target.name}\x1b[0m in ${ms}ms.`
                );
              }
            }

            // Invalidate module graph and trigger full reload in browser
            server.ws.send({
              type: "full-reload",
              path: "*"
            });
          } catch (err) {
            console.error("\x1b[31m✖ [Omni AutoBuild]\x1b[0m Auto-build failed:", err);
          } finally {
            isBuilding = false;
          }
        }, 150);
      };

      server.watcher.on("change", handleFileChange);
      server.watcher.on("add", handleFileChange);
      server.watcher.on("unlink", handleFileChange);
    }
  };
}

export default defineConfig({
  base: "./",
  plugins: [omniAutoBuildPlugin()],
  server: {
    host: true,
    port: 3000
  },
  preview: {
    host: true,
    port: 3000
  }
});
