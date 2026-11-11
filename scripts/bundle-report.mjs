#!/usr/bin/env node
// Reports built asset sizes for the Gleam host and the guest bridge bundle.
import { existsSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const targets = [
  ["guest bridge", "gleam/bridge/dist/guest-runtime.js"],
  ["host index.html", "apps/web/dist/index.html"],
];

const distDir = "apps/web/dist/assets";
if (existsSync(distDir)) {
  for (const file of readdirSync(distDir)) {
    targets.push([`host asset ${file}`, join(distDir, file)]);
  }
}

let totalRaw = 0;
let totalGzip = 0;
for (const [label, path] of targets) {
  if (!existsSync(path)) {
    console.log(`${label.padEnd(34)} (missing: run pnpm build)`);
    continue;
  }
  const bytes = readFileSync(path);
  const gzip = gzipSync(bytes).length;
  totalRaw += bytes.length;
  totalGzip += gzip;
  console.log(
    `${label.padEnd(34)} ${(bytes.length / 1024).toFixed(1).padStart(8)} kB  ${(gzip / 1024).toFixed(1).padStart(7)} kB gzip`,
  );
}
console.log(
  `${"total".padEnd(34)} ${(totalRaw / 1024).toFixed(1).padStart(8)} kB  ${(totalGzip / 1024).toFixed(1).padStart(7)} kB gzip`,
);
