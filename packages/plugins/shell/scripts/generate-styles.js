import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stylesDir = path.resolve(__dirname, "../src/styles");

const classicCss = fs.readFileSync(path.join(stylesDir, "classic.css"), "utf-8");
fs.writeFileSync(
  path.join(stylesDir, "classic-styles.ts"),
  `// Auto-generated from classic.css. Do not edit directly.\nexport const CLASSIC_SHELL_CSS = ${JSON.stringify(classicCss)};\n`
);

const panoramaCss = fs.readFileSync(path.join(stylesDir, "panorama.css"), "utf-8");
fs.writeFileSync(
  path.join(stylesDir, "panorama-styles.ts"),
  `// Auto-generated from panorama.css. Do not edit directly.\nexport const PANORAMA_SHELL_CSS = ${JSON.stringify(panoramaCss)};\n`
);

console.log("✓ Generated shell style modules (classic-styles.ts & panorama-styles.ts)");
