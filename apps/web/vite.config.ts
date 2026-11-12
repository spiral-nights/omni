import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { gleamInteropPlugin } from "../../scripts/vite-plugin-gleam.mjs";

const stylesDir = resolve(__dirname, "../../assets/styles");
const STYLE_FILES = [
  "tokens.css",
  "schema.css",
  "shell-modules.css",
  "panorama.css",
  "editorial.css",
];

// Shell views reference theme CSS as `assets/styles/<file>.css`. In dev that
// path is not under apps/web, so serve it; on build, copy it into dist/assets.
function omniAssetsPlugin(): Plugin {
  return {
    name: "omni-assets",
    configureServer(server) {
      server.middlewares.use("/assets/styles", (req, res, next) => {
        const file = (req.url || "/").split("?")[0].replace(/^\//, "");
        if (!STYLE_FILES.includes(file)) return next();
        const path = join(stylesDir, file);
        if (!existsSync(path)) return next();
        res.setHeader("Content-Type", "text/css; charset=utf-8");
        res.end(readFileSync(path));
      });
    },
    closeBundle() {
      const dist = resolve(__dirname, "dist/assets/styles");
      mkdirSync(dist, { recursive: true });
      for (const file of STYLE_FILES) {
        const source = join(stylesDir, file);
        if (existsSync(source)) copyFileSync(source, join(dist, file));
      }
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [gleamInteropPlugin(), omniAssetsPlugin()],
  server: {
    host: true,
    port: 3000,
  },
  preview: {
    host: true,
    port: 3000,
  },
});
