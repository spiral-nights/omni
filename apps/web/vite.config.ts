import { defineConfig } from "vite";
import { gleamInteropPlugin } from "../../scripts/vite-plugin-gleam.mjs";

export default defineConfig({
  base: "./",
  plugins: [gleamInteropPlugin()],
  server: {
    host: true,
    port: 3000,
  },
  preview: {
    host: true,
    port: 3000,
  },
});
