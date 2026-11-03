import { StudioFileEntry } from "../types.js";
import { escapeHtml } from "../utils.js";

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function createZipArchiveBytes(files: Record<string, string | Uint8Array>): Uint8Array {
  const entries = Object.entries(files).map(([name, content]) => {
    const nameBytes = new TextEncoder().encode(name);
    const dataBytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
    const crc = crc32(dataBytes);
    return { nameBytes, dataBytes, crc };
  });

  let localSize = 0;
  let centralSize = 0;
  for (const e of entries) {
    localSize += 30 + e.nameBytes.length + e.dataBytes.length;
    centralSize += 46 + e.nameBytes.length;
  }

  const totalSize = localSize + centralSize + 22;
  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);

  let localOffset = 0;
  let centralOffset = localSize;

  for (const e of entries) {
    const fileOffset = localOffset;
    view.setUint32(localOffset, 0x04034b50, true);
    view.setUint16(localOffset + 4, 20, true);
    view.setUint16(localOffset + 6, 0, true);
    view.setUint16(localOffset + 8, 0, true);
    view.setUint16(localOffset + 10, 0, true);
    view.setUint16(localOffset + 12, 0, true);
    view.setUint32(localOffset + 14, e.crc, true);
    view.setUint32(localOffset + 18, e.dataBytes.length, true);
    view.setUint32(localOffset + 22, e.dataBytes.length, true);
    view.setUint16(localOffset + 26, e.nameBytes.length, true);
    view.setUint16(localOffset + 28, 0, true);
    out.set(e.nameBytes, localOffset + 30);
    out.set(e.dataBytes, localOffset + 30 + e.nameBytes.length);
    localOffset += 30 + e.nameBytes.length + e.dataBytes.length;

    view.setUint32(centralOffset, 0x02014b50, true);
    view.setUint16(centralOffset + 4, 20, true);
    view.setUint16(centralOffset + 6, 20, true);
    view.setUint16(centralOffset + 8, 0, true);
    view.setUint16(centralOffset + 10, 0, true);
    view.setUint16(centralOffset + 12, 0, true);
    view.setUint16(centralOffset + 14, 0, true);
    view.setUint32(centralOffset + 16, e.crc, true);
    view.setUint32(centralOffset + 20, e.dataBytes.length, true);
    view.setUint32(centralOffset + 24, e.dataBytes.length, true);
    view.setUint16(centralOffset + 28, e.nameBytes.length, true);
    view.setUint16(centralOffset + 30, 0, true);
    view.setUint16(centralOffset + 32, 0, true);
    view.setUint16(centralOffset + 34, 0, true);
    view.setUint16(centralOffset + 36, 0, true);
    view.setUint32(centralOffset + 38, 0, true);
    view.setUint32(centralOffset + 42, fileOffset, true);
    out.set(e.nameBytes, centralOffset + 46);
    centralOffset += 46 + e.nameBytes.length;
  }

  view.setUint32(centralOffset, 0x06054b50, true);
  view.setUint16(centralOffset + 4, 0, true);
  view.setUint16(centralOffset + 6, 0, true);
  view.setUint16(centralOffset + 8, entries.length, true);
  view.setUint16(centralOffset + 10, entries.length, true);
  view.setUint32(centralOffset + 12, centralSize, true);
  view.setUint32(centralOffset + 16, localSize, true);
  view.setUint16(centralOffset + 20, 0, true);

  return out;
}

export function inflateRawSync(src: Uint8Array, _uncompressedSize?: number): Uint8Array {
  const FIXED_LIT = new Uint8Array(288);
  for (let i = 0; i < 144; i++) FIXED_LIT[i] = 8;
  for (let i = 144; i < 256; i++) FIXED_LIT[i] = 9;
  for (let i = 256; i < 280; i++) FIXED_LIT[i] = 7;
  for (let i = 280; i < 288; i++) FIXED_LIT[i] = 8;
  const FIXED_DIST = new Uint8Array(32);
  FIXED_DIST.fill(5);

  const LEN_BASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
  const LEN_EXTRA = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
  const DIST_BASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
  const DIST_EXTRA = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
  const CL_ORDER = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];

  let bitPos = 0;
  const readBits = (n: number): number => {
    let val = 0;
    for (let i = 0; i < n; i++) {
      const byteIdx = bitPos >> 3;
      const bitIdx = bitPos & 7;
      if (byteIdx < src.length) {
        val |= ((src[byteIdx] >> bitIdx) & 1) << i;
      }
      bitPos++;
    }
    return val;
  };

  const buildTree = (lengths: Uint8Array) => {
    const maxBits = Math.max(...Array.from(lengths), 1);
    const blCount = new Uint16Array(maxBits + 1);
    for (let i = 0; i < lengths.length; i++) {
      if (lengths[i] > 0) blCount[lengths[i]]++;
    }
    const nextCode = new Uint16Array(maxBits + 1);
    let code = 0;
    for (let bits = 1; bits <= maxBits; bits++) {
      code = (code + blCount[bits - 1]) << 1;
      nextCode[bits] = code;
    }
    const map = new Map<number, number>();
    for (let n = 0; n < lengths.length; n++) {
      const len = lengths[n];
      if (len > 0) {
        const c = nextCode[len]++;
        map.set((len << 16) | c, n);
      }
    }
    return { map, maxBits };
  };

  const decodeSymbol = (tree: { map: Map<number, number>; maxBits: number }): number => {
    let code = 0;
    for (let len = 1; len <= tree.maxBits; len++) {
      code = (code << 1) | readBits(1);
      const key = (len << 16) | code;
      const sym = tree.map.get(key);
      if (sym !== undefined) return sym;
    }
    throw new Error("Invalid deflate Huffman code");
  };

  const out: number[] = [];
  let bfinal = 0;
  while (!bfinal) {
    bfinal = readBits(1);
    const btype = readBits(2);
    if (btype === 0) {
      bitPos = (bitPos + 7) & ~7;
      const len = readBits(16);
      readBits(16);
      const byteIdx = bitPos >> 3;
      for (let i = 0; i < len; i++) {
        out.push(src[byteIdx + i]);
      }
      bitPos += len * 8;
    } else if (btype === 1 || btype === 2) {
      let litTree: { map: Map<number, number>; maxBits: number };
      let distTree: { map: Map<number, number>; maxBits: number };
      if (btype === 1) {
        litTree = buildTree(FIXED_LIT);
        distTree = buildTree(FIXED_DIST);
      } else {
        const hlit = readBits(5) + 257;
        const hdist = readBits(5) + 1;
        const hclen = readBits(4) + 4;
        const clLengths = new Uint8Array(19);
        for (let i = 0; i < hclen; i++) {
          clLengths[CL_ORDER[i]] = readBits(3);
        }
        const clTree = buildTree(clLengths);
        const allLengths = new Uint8Array(hlit + hdist);
        let idx = 0;
        while (idx < hlit + hdist) {
          const sym = decodeSymbol(clTree);
          if (sym < 16) {
            allLengths[idx++] = sym;
          } else if (sym === 16) {
            const repeat = readBits(2) + 3;
            const prev = allLengths[idx - 1] || 0;
            for (let r = 0; r < repeat; r++) allLengths[idx++] = prev;
          } else if (sym === 17) {
            const repeat = readBits(3) + 3;
            for (let r = 0; r < repeat; r++) allLengths[idx++] = 0;
          } else if (sym === 18) {
            const repeat = readBits(7) + 11;
            for (let r = 0; r < repeat; r++) allLengths[idx++] = 0;
          }
        }
        litTree = buildTree(allLengths.subarray(0, hlit));
        distTree = buildTree(allLengths.subarray(hlit));
      }

      while (true) {
        const sym = decodeSymbol(litTree);
        if (sym === 256) break;
        if (sym < 256) {
          out.push(sym);
        } else {
          const lenIdx = sym - 257;
          const length = LEN_BASE[lenIdx] + readBits(LEN_EXTRA[lenIdx]);
          const distSym = decodeSymbol(distTree);
          const dist = DIST_BASE[distSym] + readBits(DIST_EXTRA[distSym]);
          const start = out.length - dist;
          for (let i = 0; i < length; i++) {
            out.push(out[start + i]);
          }
        }
      }
    } else {
      throw new Error("Unsupported deflate block type");
    }
  }

  return new Uint8Array(out);
}

export function unzipArchiveSync(zipBytes: Uint8Array): Record<string, Uint8Array> {
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  let eocdOffset = -1;
  for (let i = zipBytes.byteLength - 22; i >= Math.max(0, zipBytes.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  const files: Record<string, Uint8Array> = {};

  if (eocdOffset !== -1) {
    const entryCount = view.getUint16(eocdOffset + 10, true);
    const cdOffset = view.getUint32(eocdOffset + 16, true);
    let ptr = cdOffset;
    for (let i = 0; i < entryCount && ptr + 46 <= zipBytes.byteLength; i++) {
      if (view.getUint32(ptr, true) !== 0x02014b50) break;
      const compression = view.getUint16(ptr + 10, true);
      const compSize = view.getUint32(ptr + 20, true);
      const uncompSize = view.getUint32(ptr + 24, true);
      const nameLen = view.getUint16(ptr + 28, true);
      const extraLen = view.getUint16(ptr + 30, true);
      const commentLen = view.getUint16(ptr + 32, true);
      const localHeaderOffset = view.getUint32(ptr + 42, true);

      const fileName = new TextDecoder().decode(zipBytes.subarray(ptr + 46, ptr + 46 + nameLen));
      ptr += 46 + nameLen + extraLen + commentLen;

      if (fileName.endsWith("/")) continue;
      if (localHeaderOffset + 30 > zipBytes.byteLength) continue;
      const localNameLen = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
      const compressedSlice = zipBytes.subarray(dataStart, dataStart + compSize);

      if (compression === 0) {
        files[fileName] = new Uint8Array(compressedSlice);
      } else if (compression === 8) {
        files[fileName] = inflateRawSync(compressedSlice, uncompSize);
      }
    }
    return files;
  }

  throw new Error("Invalid or corrupted ZIP file (End of Central Directory signature not found).");
}

export function getMimeInfo(filePath: string): { mime: string; isText: boolean } {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return { mime: "text/html", isText: true };
  if (lower.endsWith(".js") || lower.endsWith(".mjs")) return { mime: "application/javascript", isText: true };
  if (lower.endsWith(".css")) return { mime: "text/css", isText: true };
  if (lower.endsWith(".json") || lower.endsWith(".webmanifest")) return { mime: "application/json", isText: true };
  if (lower.endsWith(".svg")) return { mime: "image/svg+xml", isText: true };
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return { mime: "text/plain", isText: true };
  if (lower.endsWith(".png")) return { mime: "image/png", isText: false };
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return { mime: "image/jpeg", isText: false };
  if (lower.endsWith(".webp")) return { mime: "image/webp", isText: false };
  return { mime: "application/octet-stream", isText: false };
}

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function resolveRelPath(baseFile: string, relRef: string): string {
  const clean = relRef.split("?")[0].split("#")[0].trim();
  if (!clean || /^(https?:|data:|blob:|nostr:|\/\/)/i.test(clean)) return "";
  const stack = clean.startsWith("/") ? [] : baseFile.split("/").slice(0, -1);
  for (const part of clean.replace(/^\/+/, "").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

export function inlineHtmlBundle(htmlContent: string, entryPath: string, fileMap: Map<string, StudioFileEntry>): string {
  let out = htmlContent;
  const lookup = (ref: string) => {
    const resolved = resolveRelPath(entryPath, ref);
    return (resolved ? fileMap.get(resolved) : undefined) || fileMap.get(ref.replace(/^\.\//, "").replace(/^\/+/, ""));
  };

  out = out.replace(/<link\b([^>]*?)>/gi, (m, attrs) => {
    if (!/rel\s*=\s*["']stylesheet["']/i.test(attrs)) return m;
    const href = attrs.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    const f = href ? lookup(href) : undefined;
    if (f && f.textContent !== undefined) {
      return `<style data-inlined-from="${escapeHtml(f.path)}">\n${f.textContent}\n</style>`;
    }
    return m;
  });

  out = out.replace(new RegExp("<script\\b([^>]*?)>\\s*<" + "/script>", "gi"), (m, attrs) => {
    const src = attrs.match(/src\s*=\s*["']([^"']+)["']/i)?.[1];
    const f = src ? lookup(src) : undefined;
    if (f && f.textContent !== undefined) {
      const isMod = /type\s*=\s*["']module["']/i.test(attrs);
      return `<script${isMod ? ' type="module"' : ""} data-inlined-from="${escapeHtml(f.path)}">\n${f.textContent}\n<` + `/script>`;
    }
    return m;
  });

  out = out.replace(/<img\b([^>]*?)>/gi, (m, attrs) => {
    const src = attrs.match(/src\s*=\s*["']([^"']+)["']/i)?.[1];
    const f = src ? lookup(src) : undefined;
    if (f) {
      const uri = `data:${f.mimeType};base64,${uint8ToBase64(f.bytes)}`;
      return `<img${attrs.replace(/src\s*=\s*["']([^"']+)["']/i, `src="${uri}"`)}>`;
    }
    return m;
  });

  return out;
}

export function buildStarterPluginZip(): Uint8Array {
  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Pomodoro Focus Studio</title>
  <meta name="description" content="Minimalist cypherpunk Pomodoro timer and session tracker for Omni.">
  <link rel="stylesheet" href="./style.css">
  <link rel="alternate" href="?view=widget" title="Focus Mini Widget">
  <link rel="alternate" href="?view=settings" title="Timer Settings">
</head>
<body>
  <div id="app" class="focus-card">
    <div class="focus-header">
      <span class="focus-title">Pomodoro Focus Studio</span>
      <span id="session-badge" class="focus-badge">25:00</span>
    </div>
    <p class="focus-subtitle">Deep work sprint timer running as a sandboxed Nostr nsite.</p>
    <div class="focus-controls">
      <button id="btn-start" class="btn-primary">Start Sprint</button>
      <button id="btn-reset" class="btn-secondary">Reset</button>
    </div>
  </div>
  <script type="module" src="./app.js"><` + `/script>
</body>
</html>`;

  const styleCss = `.focus-card {
  background: var(--omni-bg-surface, #191816);
  border: 1px solid var(--omni-border-strong, #3d3933);
  border-radius: var(--omni-radius-md, 10px);
  padding: 20px;
  color: var(--omni-text-primary, #ede8df);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.focus-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.focus-title {
  font-size: 1.05rem;
  font-weight: 600;
}
.focus-badge {
  font-family: monospace;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--omni-accent-primary, #d4a373);
}
.focus-subtitle {
  margin: 0;
  font-size: 0.84rem;
  color: var(--omni-text-secondary, #9e988f);
}
.focus-controls {
  display: flex;
  gap: 8px;
}
.btn-primary {
  background: var(--omni-accent-primary, #d4a373);
  color: #141312;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
}
.btn-secondary {
  background: var(--omni-bg-subtle, #2a2723);
  color: var(--omni-text-primary, #ede8df);
  border: 1px solid var(--omni-border-strong, #3d3933);
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
}`;

  const appJs = `let seconds = 25 * 60;
let timer = null;
const badge = document.getElementById("session-badge");
const btnStart = document.getElementById("btn-start");
const btnReset = document.getElementById("btn-reset");

function formatTime(s) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const rem = (s % 60).toString().padStart(2, "0");
  return m + ":" + rem;
}

if (btnStart) {
  btnStart.addEventListener("click", () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
      btnStart.textContent = "Resume Sprint";
    } else {
      btnStart.textContent = "Pause";
      timer = setInterval(() => {
        if (seconds > 0) seconds--;
        if (badge) badge.textContent = formatTime(seconds);
      }, 1000);
    }
  });
}

if (btnReset) {
  btnReset.addEventListener("click", () => {
    if (timer) { clearInterval(timer); timer = null; }
    seconds = 25 * 60;
    if (badge) badge.textContent = formatTime(seconds);
    if (btnStart) btnStart.textContent = "Start Sprint";
  });
}`;

  const manifestJson = JSON.stringify(
    {
      id: "org.omni.plugin.pomodoro-studio",
      name: "Pomodoro Focus Studio",
      version: "1.0.0",
      description: "Minimalist cypherpunk Pomodoro timer and session tracker for Omni.",
      icon: "check-circle"
    },
    null,
    2
  );

  return createZipArchiveBytes({
    "index.html": indexHtml,
    "style.css": styleCss,
    "app.js": appJs,
    "manifest.json": manifestJson
  });
}
