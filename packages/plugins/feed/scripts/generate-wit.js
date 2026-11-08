import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..");
const witPath = path.resolve(pluginRoot, "../../types/wit/omni.wit");

execFileSync("wit-bindgen", ["moonbit", witPath, "--out-dir", ".", "--ignore-stub"], {
  cwd: pluginRoot,
  stdio: "inherit"
});

const worldDir = path.join(pluginRoot, "gen/world/omni-plugin");
fs.mkdirSync(worldDir, { recursive: true });

fs.writeFileSync(
  path.join(worldDir, "moon.pkg"),
  `import {\n  "omni/plugin",\n}\n\nwarnings = "-44"\n`,
  "utf8"
);

fs.writeFileSync(
  path.join(worldDir, "impl.mbt"),
  `// Auto-generated WIT entrypoint bridge. DO NOT EDIT.\n///|\npub fn init_() -> String {\n  @plugin.start()\n  ""\n}\n\n///|\npub fn handle_action(action : String, payload : String) -> String {\n  @plugin.handle_action_impl(action, payload)\n  ""\n}\n`,
  "utf8"
);

execFileSync("moon", ["fmt"], { cwd: pluginRoot, stdio: "inherit" });
