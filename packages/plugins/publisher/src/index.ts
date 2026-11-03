/**
 * @omni/plugin-publisher — Plugin Studio & Nsite Blossom Uploader
 * 100% Standard Web & Nostr Application (Zero Proprietary SDKs).
 * Supports pure declarative Schema for Web Worker execution & DOM fallback.
 */

import type { OmniComponentNode, OmniAction } from "@omni/types";

function escapeHtml(str: string): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ============================================================================
// 1. Self-Contained SHA-256 & NIP-19 Bech32 (naddr) Implementation
// ============================================================================
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

function rotr(n: number, x: number): number {
  return (x >>> n) | (x << (32 - n));
}

function sha256Hex(data: Uint8Array): string {
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const bitLen = data.byteLength * 8;
  const padLen = ((data.byteLength + 9 + 63) & ~63);
  const padded = new Uint8Array(padLen);
  padded.set(data);
  padded[data.byteLength] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(padLen - 4, bitLen >>> 0, false);

  const w = new Uint32Array(64);
  for (let i = 0; i < padLen; i += 64) {
    for (let t = 0; t < 16; t++) {
      w[t] = view.getUint32(i + t * 4, false);
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(7, w[t - 15]) ^ rotr(18, w[t - 15]) ^ (w[t - 15] >>> 3);
      const s1 = rotr(17, w[t - 2]) ^ rotr(19, w[t - 2]) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[t] + w[t]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const hex = (n: number) => n.toString(16).padStart(8, "0");
  return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4) + hex(h5) + hex(h6) + hex(h7);
}

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >> i) & 1) chk ^= GEN[i];
    }
  }
  return chk;
}

function convertBits(data: Uint8Array, fromBits: number, toBits: number, pad: boolean): number[] {
  let acc = 0;
  let bits = 0;
  const ret: number[] = [];
  const maxv = (1 << toBits) - 1;
  for (let i = 0; i < data.length; i++) {
    acc = (acc << fromBits) | data[i];
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (pad && bits > 0) {
    ret.push((acc << (toBits - bits)) & maxv);
  }
  return ret;
}

function encodeBech32(hrp: string, dataBytes: Uint8Array): string {
  const words = convertBits(dataBytes, 8, 5, true);
  const hrpExpanded: number[] = [];
  for (let i = 0; i < hrp.length; i++) hrpExpanded.push(hrp.charCodeAt(i) >> 5);
  hrpExpanded.push(0);
  for (let i = 0; i < hrp.length; i++) hrpExpanded.push(hrp.charCodeAt(i) & 31);

  const polymod = bech32Polymod([...hrpExpanded, ...words, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum: number[] = [];
  for (let p = 0; p < 6; p++) {
    checksum.push((polymod >> (5 * (5 - p))) & 31);
  }
  return hrp + "1" + [...words, ...checksum].map((d) => BECH32_CHARSET[d]).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function encodeNaddr(params: { identifier: string; pubkey: string; kind: number; relays?: string[] }): string {
  const chunks: number[] = [];
  const dBytes = new TextEncoder().encode(params.identifier);
  chunks.push(0, dBytes.length, ...Array.from(dBytes));

  for (const r of (params.relays || []).slice(0, 3)) {
    const rBytes = new TextEncoder().encode(r);
    if (rBytes.length <= 255) {
      chunks.push(1, rBytes.length, ...Array.from(rBytes));
    }
  }

  const pkBytes = hexToBytes(params.pubkey);
  if (pkBytes.length === 32) {
    chunks.push(2, 32, ...Array.from(pkBytes));
  }

  const k = params.kind >>> 0;
  chunks.push(3, 4, (k >>> 24) & 0xff, (k >>> 16) & 0xff, (k >>> 8) & 0xff, k & 0xff);

  return encodeBech32("naddr", new Uint8Array(chunks));
}

// ============================================================================
// 3. Self-Contained ZIP Archive Reader & Writer (Store + Deflate support)
// ============================================================================
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

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZipArchiveBytes(files: Record<string, string | Uint8Array>): Uint8Array {
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

function inflateRawSync(src: Uint8Array, _uncompressedSize?: number): Uint8Array {
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

function unzipArchiveSync(zipBytes: Uint8Array): Record<string, Uint8Array> {
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

// ============================================================================
// 4. Asset Extraction, MIME Detection & Bundling Engine
// ============================================================================
export interface StudioFileEntry {
  path: string;
  bytes: Uint8Array;
  size: number;
  sha256: string;
  mimeType: string;
  isText: boolean;
  textContent?: string;
}

export interface PublishedAppRecord {
  id: string;
  name: string;
  version: string;
  description: string;
  icon: string;
  naddr: string;
  eventId: string;
  pubkey: string;
  createdAt: number;
  packagingMode: "inlined" | "multifile" | "local";
  fileCount: number;
  files: Array<{ path: string; sha256: string; mimeType: string }>;
  servers: string[];
  rawEvent?: any;
  htmlContent?: string;
}

export interface PublisherState {
  activeTab: "create" | "published" | "servers";
  servers: Array<{ url: string; enabled: boolean; status?: string }>;
  publishedApps: PublishedAppRecord[];
  extractedFiles: StudioFileEntry[];
  entryFilePath: string;
  appName: string;
  appId: string;
  appVersion: string;
  appDescription: string;
  appIcon: string;
  packagingMode: "inlined" | "multifile";
  remoteUrlInputVal: string;
  newServerUrlVal: string;
  statusLogs: string[];
  lastPublishedResult: PublishedAppRecord | null;
  uploadProgress: { current: number; total: number; label: string } | null;
  isUploading: boolean;
}

const DEFAULT_SERVERS = [
  "https://cdn.satellite.earth",
  "https://blossom.primal.net",
  "https://nostr.download"
];

const STORAGE_KEY_SERVERS = "omni_publisher_blossom_servers";
const STORAGE_KEY_PUBLISHED = "omni_publisher_published_apps";
const STORAGE_KEY_DELETED = "omni_publisher_deleted_apps_v1";

function getMimeInfo(filePath: string): { mime: string; isText: boolean } {
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

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function resolveRelPath(baseFile: string, relRef: string): string {
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

function inlineHtmlBundle(htmlContent: string, entryPath: string, fileMap: Map<string, StudioFileEntry>): string {
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

// ============================================================================
// 5. Starter Multi-File Plugin Template Generator (.zip)
// ============================================================================
function buildStarterPluginZip(): Uint8Array {
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

// ============================================================================
// 6. State & Storage Helpers
// ============================================================================
function loadConfiguredServers(): Array<{ url: string; enabled: boolean; status?: string }> {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(STORAGE_KEY_SERVERS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    }
  } catch {}
  return DEFAULT_SERVERS.map((url) => ({ url, enabled: true, status: "Ready" }));
}

function saveConfiguredServers(servers: Array<{ url: string; enabled: boolean; status?: string }>): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY_SERVERS, JSON.stringify(servers));
    }
  } catch {}
}

function cleanPublishedRecord(app: any): PublishedAppRecord {
  return {
    ...app,
    htmlContent: "",
    rawEvent: app.rawEvent ? { ...app.rawEvent, content: "" } : undefined
  };
}

function loadPublishedApps(): PublishedAppRecord[] {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(STORAGE_KEY_PUBLISHED);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          let needsResave = false;
          const cleaned = parsed.map((app) => {
            if (app && (app.htmlContent || (app.rawEvent && app.rawEvent.content))) {
              needsResave = true;
              return cleanPublishedRecord(app);
            }
            return app;
          });
          if (needsResave) {
            savePublishedApps(cleaned);
          }
          return cleaned;
        }
      }
    }
  } catch {}
  return [];
}

function savePublishedApps(apps: PublishedAppRecord[]): void {
  try {
    if (typeof localStorage !== "undefined") {
      const cleaned = apps.map(cleanPublishedRecord);
      localStorage.setItem(STORAGE_KEY_PUBLISHED, JSON.stringify(cleaned));
    }
  } catch {}
}

function loadDeletedAppIds(): Set<string> {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(STORAGE_KEY_DELETED);
      return new Set(raw ? JSON.parse(raw) : []);
    }
  } catch {}
  return new Set();
}

function saveDeletedAppIds(set: Set<string>): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY_DELETED, JSON.stringify(Array.from(set)));
    }
  } catch {}
}

function getCurrentRouteView(): string {
  try {
    if (typeof window !== "undefined") {
      const search = window.location.search || (window as any).__OMNI_SEARCH__ || "";
      const params = new URLSearchParams(search);
      const v = params.get("view") || (window as any).__OMNI_VIEW__ || "main";
      return v;
    }
  } catch {}
  return "main";
}

// ============================================================================
// 7. Shared Publisher Core & State Engine (Dual Mode: Schema & DOM)
// ============================================================================
let activeTab: "create" | "published" | "servers" = "create";
let servers = loadConfiguredServers();
let deletedAppIds = loadDeletedAppIds();
let publishedApps = loadPublishedApps().filter((p) => !deletedAppIds.has(p.id) && !deletedAppIds.has(p.eventId || ""));

let extractedFiles: StudioFileEntry[] = [];
let entryFilePath = "index.html";
let bundledHtmlOutput = "";
let rawEntryHtmlOutput = "";

let appName = "";
let appId = "";
let appVersion = "1.0.0";
let appDescription = "";
let appIcon = "globe";
let appViews: Array<{ id: string; title: string; path: string }> = [];
let packagingMode: "inlined" | "multifile" = "inlined";
let remoteUrlInputVal = "";
let newServerUrlVal = "";
let statusLogs: string[] = [];
let lastPublishedResult: PublishedAppRecord | null = null;
let uploadProgress: { current: number; total: number; label: string } | null = null;
let isUploading = false;

let onStateChangedCallback: (() => void) | null = null;

function notifyStateChanged(): void {
  dispatchPublisherSchema(getPublisherSchema());
  if (onStateChangedCallback) {
    onStateChangedCallback();
  }
}

function getPublisherState(): PublisherState {
  return {
    activeTab,
    servers: [...servers],
    publishedApps: [...publishedApps],
    extractedFiles: [...extractedFiles],
    entryFilePath,
    appName,
    appId,
    appVersion,
    appDescription,
    appIcon,
    packagingMode,
    remoteUrlInputVal,
    newServerUrlVal,
    statusLogs: [...statusLogs],
    lastPublishedResult,
    uploadProgress,
    isUploading
  };
}

function resetPublisherState(initial?: Partial<PublisherState>): void {
  activeTab = initial?.activeTab || "create";
  servers = initial?.servers ? [...initial.servers] : loadConfiguredServers();
  deletedAppIds = loadDeletedAppIds();
  publishedApps = initial?.publishedApps ? [...initial.publishedApps] : loadPublishedApps().filter((p) => !deletedAppIds.has(p.id));
  extractedFiles = initial?.extractedFiles ? [...initial.extractedFiles] : [];
  entryFilePath = initial?.entryFilePath || "index.html";
  bundledHtmlOutput = "";
  rawEntryHtmlOutput = "";
  appName = initial?.appName || "";
  appId = initial?.appId || "";
  appVersion = initial?.appVersion || "1.0.0";
  appDescription = initial?.appDescription || "";
  appIcon = initial?.appIcon || "globe";
  packagingMode = initial?.packagingMode || "inlined";
  remoteUrlInputVal = initial?.remoteUrlInputVal || "";
  newServerUrlVal = initial?.newServerUrlVal || "";
  statusLogs = initial?.statusLogs ? [...initial.statusLogs] : [];
  lastPublishedResult = initial?.lastPublishedResult || null;
  uploadProgress = initial?.uploadProgress || null;
  isUploading = initial?.isUploading || false;
}

function appendLog(msg: string): void {
  statusLogs.push(msg);
  notifyStateChanged();
}

function processZipBytes(zipBytes: Uint8Array, sourceFileName = "plugin.zip"): void {
  statusLogs = [];
  lastPublishedResult = null;
  const rawMap = unzipArchiveSync(zipBytes);
  const rawKeys = Object.keys(rawMap).filter(
    (k) => !k.endsWith("/") && !k.startsWith("__MACOSX/") && !k.endsWith(".DS_Store")
  );

  if (rawKeys.length === 0) {
    appendLog("Error: Archive contains no extractable files.");
    return;
  }

  let prefix = "";
  const slashIdx = rawKeys[0].indexOf("/");
  if (slashIdx !== -1) {
    const candidate = rawKeys[0].slice(0, slashIdx + 1);
    if (rawKeys.every((k) => k.startsWith(candidate))) {
      prefix = candidate;
    }
  }

  const fileEntries: StudioFileEntry[] = [];
  const fileMap = new Map<string, StudioFileEntry>();

  for (const origKey of rawKeys) {
    const normPath = (prefix ? origKey.slice(prefix.length) : origKey).replace(/^\/+/, "");
    if (!normPath) continue;
    const bytes = rawMap[origKey];
    const sha = sha256Hex(bytes);
    const { mime, isText } = getMimeInfo(normPath);
    const textContent = isText ? new TextDecoder().decode(bytes) : undefined;
    const entry: StudioFileEntry = {
      path: normPath,
      bytes,
      size: bytes.byteLength,
      sha256: sha,
      mimeType: mime,
      isText,
      textContent
    };
    fileEntries.push(entry);
    fileMap.set(normPath, entry);
  }

  extractedFiles = fileEntries;

  const candidates = ["index.html", "dist/index.html", "index.htm", "index.js", "dist/index.js"];
  entryFilePath =
    candidates.find((c) => fileMap.has(c)) ||
    fileEntries.find((f) => f.path.endsWith(".html"))?.path ||
    fileEntries[0].path;

  const entryObj = fileMap.get(entryFilePath)!;
  let baseHtml = entryObj.textContent || "";
  if (entryFilePath.endsWith(".js")) {
    baseHtml = `<!DOCTYPE html>\n<html>\n<head><meta charset="UTF-8"><title>${escapeHtml(sourceFileName)}</title></head>\n<body><div id="root"></div><script type="module">\n${baseHtml}\n<` + `/script></body>\n</html>`;
  }

  const manFile =
    fileMap.get("manifest.json") ||
    fileMap.get("manifest.webmanifest") ||
    fileMap.get("omni.manifest.json") ||
    fileMap.get("package.json");

  let detectedName = sourceFileName.replace(/\.(zip|html?|js)$/i, "");
  let detectedId = "";
  let detectedVer = "1.0.0";
  let detectedDesc = "";
  let detectedIcon = "globe";
  let detectedViews: Array<{ id: string; title: string; path: string }> = [];

  if (manFile && manFile.textContent) {
    try {
      const parsed = JSON.parse(manFile.textContent);
      if (parsed.name) detectedName = parsed.name;
      if (parsed.id) detectedId = parsed.id;
      if (parsed.version) detectedVer = parsed.version;
      if (parsed.description) detectedDesc = parsed.description;
      if (parsed.icon) detectedIcon = parsed.icon;
      if (Array.isArray(parsed.views)) {
        detectedViews = parsed.views
          .filter((v: any) => v && typeof v.id === "string")
          .map((v: any) => ({
            id: v.id,
            title: v.title || v.id,
            path: v.path || ""
          }));
      }
    } catch {}
  }

  const titleMatch = baseHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch && (!manFile || !detectedName || detectedName === "starter-template")) {
    detectedName = titleMatch[1].trim();
  }

  const descMatch = baseHtml.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
  if (descMatch && !detectedDesc) {
    detectedDesc = descMatch[1].trim().slice(0, 300);
  }

  const iconMetaMatch =
    baseHtml.match(/<meta\s+name=["'](?:icon|app-icon)["']\s+content=["']([^"']+)["']/i) ||
    baseHtml.match(/<meta\s+content=["']([^"']+)["']\s+name=["'](?:icon|app-icon)["']/i);
  if (iconMetaMatch && (!detectedIcon || detectedIcon === "globe" || detectedIcon === "widgets")) {
    detectedIcon = iconMetaMatch[1].trim();
  }

  appName = detectedName || "Custom Nsite";
  appId =
    detectedId ||
    "org.omni.plugin." +
      appName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
  appVersion = detectedVer;
  appDescription = (detectedDesc || `Packaged nsite (${fileEntries.length} files).`).slice(0, 300);
  appIcon = detectedIcon || "widgets";
  appViews = detectedViews;

  rawEntryHtmlOutput = baseHtml;
  bundledHtmlOutput = inlineHtmlBundle(baseHtml, entryFilePath, fileMap);

  appendLog(`Extracted ${fileEntries.length} file(s) from '${sourceFileName}'. Entry: ${entryFilePath}`);
}

function processSingleHtmlOrJsFile(bytes: Uint8Array, fileName: string): void {
  const zipBytes = createZipArchiveBytes({
    [fileName.endsWith(".js") ? "index.js" : "index.html"]: bytes
  });
  processZipBytes(zipBytes, fileName);
}

async function handleRemoteUrlInput(rawTarget: string, autoInstall = true): Promise<void> {
  const trimmed = (rawTarget || "").trim();
  if (!trimmed) {
    appendLog("Please enter an arbitrary .zip URL, web app URL, or NIP-5A naddr1 address.");
    return;
  }

  if (trimmed.startsWith("naddr1") || trimmed.startsWith("nostr:naddr1")) {
    const cleanNaddr = trimmed.replace(/^nostr:/i, "");
    appendLog(`Opening NIP-5A address in Omni: nostr:${cleanNaddr}`);
    try {
      if (typeof window !== "undefined") {
        window.open(`nostr:${cleanNaddr}`);
      }
    } catch {}
    return;
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    appendLog("Error: URL must start with https://, http://, or naddr1...");
    return;
  }

  const cleanUrlPath = trimmed.split("?")[0].split("#")[0];
  const urlFileName = cleanUrlPath.split("/").pop() || "remote-plugin.html";

  try {
    appendLog(`Fetching remote plugin from ${trimmed}...`);
    const fetchFn = (typeof window !== "undefined" && typeof window.fetch === "function") ? window.fetch.bind(window) : fetch;
    const res = await fetchFn(trimmed);
    const contentType = res.headers?.get?.("content-type") || "";
    const ab = await res.arrayBuffer();
    const bytes = new Uint8Array(ab);

    const isZip =
      cleanUrlPath.toLowerCase().endsWith(".zip") ||
      contentType.toLowerCase().includes("application/zip") ||
      (bytes.byteLength >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b);

    if (isZip) {
      processZipBytes(bytes, urlFileName.endsWith(".zip") ? urlFileName : `${urlFileName}.zip`);
    } else {
      const text = new TextDecoder().decode(bytes);
      const baseHref = trimmed.endsWith("/") ? trimmed : trimmed.replace(/\/[^/]*$/, "/");
      let htmlWithBase = text;
      if (text.trim().startsWith("<") || /<html[\s>]/i.test(text)) {
        if (!/<base\s/i.test(htmlWithBase)) {
          if (/<head[^>]*>/i.test(htmlWithBase)) {
            htmlWithBase = htmlWithBase.replace(/<head[^>]*>/i, (m) => `${m}\n  <base href="${baseHref}">`);
          } else {
            htmlWithBase = `<head><base href="${baseHref}"></head>\n${htmlWithBase}`;
          }
        }
      }
      processSingleHtmlOrJsFile(
        new TextEncoder().encode(htmlWithBase),
        urlFileName.endsWith(".js") ? urlFileName : "index.html"
      );
    }

    if (autoInstall) {
      await executePublishWorkflow(true);
    }
  } catch (err: any) {
    let hostTitle = "Remote Web App";
    try {
      const parsedUrl = new URL(trimmed);
      hostTitle = parsedUrl.hostname.replace(/^www\./, "");
    } catch {}
    const fallbackHtml = `<!DOCTYPE html>
<html>
<head>
  <base href="${escapeHtml(trimmed)}">
  <title>${escapeHtml(hostTitle)}</title>
</head>
<body>
  <div style="padding: 16px; background: var(--omni-bg-surface, #191816); border: 1px solid var(--omni-border-subtle, #2e2b26); border-radius: 8px; color: var(--omni-text-primary, #ede8df);">
    <h3 style="margin: 0 0 6px 0; font-size: 0.95rem;">${escapeHtml(hostTitle)}</h3>
    <p style="margin: 0 0 10px 0; font-size: 0.8rem; color: var(--omni-text-secondary, #9e988f);">Remote URL: <code>${escapeHtml(trimmed)}</code></p>
    <a href="${escapeHtml(trimmed)}" target="_blank" rel="noopener noreferrer" style="color: var(--omni-accent-primary, #d4a373); font-size: 0.82rem;">Open External Application</a>
  </div>
</body>
</html>`;
    processSingleHtmlOrJsFile(new TextEncoder().encode(fallbackHtml), `${hostTitle}.html`);
    if (autoInstall) {
      await executePublishWorkflow(true);
    }
  }
}

async function syncPublishedFromRelays(): Promise<void> {
  try {
    const nostr = typeof window !== "undefined" ? (window as any).nostr : (typeof globalThis !== "undefined" ? (globalThis as any).nostr : undefined);
    if (!nostr || typeof nostr.getPublicKey !== "function") return;
    const myPubkey = await nostr.getPublicKey();
    if (!myPubkey) return;

    const ws = new WebSocket("wss://relay.damus.io");
    const subId = `pub-studio-${Date.now()}`;
    ws.onopen = () => {
      ws.send(JSON.stringify(["REQ", subId, { kinds: [5, 35129, 10063], authors: [myPubkey], limit: 50 }]));
    };
    ws.onmessage = (ev) => {
      try {
        const frame = JSON.parse(ev.data);
        if (frame[0] === "EVENT" && frame[2]) {
          const event = frame[2];
          if (event.kind === 5 && Array.isArray(event.tags)) {
            let updated = false;
            for (const t of event.tags) {
              if (t[0] === "a" && t[1]?.startsWith("35129:")) {
                const parts = t[1].split(":");
                if (parts.length >= 3) {
                  const deletedId = parts.slice(2).join(":");
                  if (!deletedAppIds.has(deletedId)) {
                    deletedAppIds.add(deletedId);
                    updated = true;
                  }
                }
              }
              if (t[0] === "e" && t[1]) {
                if (!deletedAppIds.has(t[1])) {
                  deletedAppIds.add(t[1]);
                  updated = true;
                }
              }
            }
            if (updated) {
              saveDeletedAppIds(deletedAppIds);
              publishedApps = publishedApps.filter((p) => !deletedAppIds.has(p.id) && !deletedAppIds.has(p.eventId || ""));
              savePublishedApps(publishedApps);
              notifyStateChanged();
            }
          } else if (event.kind === 10063 && Array.isArray(event.tags)) {
            const relayServers = event.tags
              .filter((t: string[]) => t[0] === "server" && t[1])
              .map((t: string[]) => t[1]);
            if (relayServers.length > 0) {
              for (const sUrl of relayServers) {
                if (!servers.some((s) => s.url === sUrl)) {
                  servers.push({ url: sUrl, enabled: true, status: "Synced (kind: 10063)" });
                }
              }
              saveConfiguredServers(servers);
              notifyStateChanged();
            }
          } else if (event.kind === 35129 && Array.isArray(event.tags)) {
            const dTag = event.tags.find((t: string[]) => t[0] === "d")?.[1] || event.id;
            if (deletedAppIds.has(dTag) || deletedAppIds.has(event.id)) {
              return;
            }
            const nameTag = event.tags.find((t: string[]) => t[0] === "name" || t[0] === "title")?.[1] || dTag;
            const verTag = event.tags.find((t: string[]) => t[0] === "version")?.[1] || "1.0.0";
            const descTag = event.tags.find((t: string[]) => t[0] === "description")?.[1] || "";
            const iconTag = event.tags.find((t: string[]) => t[0] === "icon" || t[0] === "image")?.[1] || "widgets";
            const fTags = event.tags
              .filter((t: string[]) => t[0] === "f" && t.length >= 3)
              .map((t: string[]) => ({ path: t[1], sha256: t[2], mimeType: t[3] || "text/html" }));
            const serverTags = event.tags.filter((t: string[]) => t[0] === "server" && t[1]).map((t: string[]) => t[1]);
            const naddr = encodeNaddr({
              identifier: dTag,
              pubkey: event.pubkey,
              kind: 35129,
              relays: ["wss://relay.damus.io"]
            });

            const existingIdx = publishedApps.findIndex((a) => a.id === dTag);
            const record: PublishedAppRecord = {
              id: dTag,
              name: nameTag,
              version: verTag,
              description: descTag,
              icon: iconTag,
              naddr,
              eventId: event.id,
              pubkey: event.pubkey,
              createdAt: event.created_at * 1000,
              packagingMode: fTags.length > 1 ? "multifile" : "inlined",
              fileCount: fTags.length || 1,
              files: fTags,
              servers: serverTags,
              rawEvent: { ...event, content: "" },
              htmlContent: ""
            };

            if (existingIdx === -1) {
              publishedApps.unshift(record);
              savePublishedApps(publishedApps);
              notifyStateChanged();
            } else if (event.created_at * 1000 >= publishedApps[existingIdx].createdAt) {
              publishedApps[existingIdx] = record;
              savePublishedApps(publishedApps);
              notifyStateChanged();
            }
          }
        } else if (frame[0] === "EOSE") {
          ws.send(JSON.stringify(["CLOSE", subId]));
          ws.close();
        }
      } catch {}
    };
  } catch {}
}

async function deletePublishedApp(app: PublishedAppRecord): Promise<void> {
  deletedAppIds.add(app.id);
  if (app.eventId) deletedAppIds.add(app.eventId);
  saveDeletedAppIds(deletedAppIds);

  publishedApps = publishedApps.filter((p) => p.id !== app.id);
  savePublishedApps(publishedApps);
  notifyStateChanged();

  const nostr = typeof window !== "undefined" ? (window as any).nostr : (typeof globalThis !== "undefined" ? (globalThis as any).nostr : undefined);

  if (nostr && typeof nostr.signEvent === "function") {
    try {
      const myPubkey = await nostr.getPublicKey();
      const deleteDraft = {
        kind: 5,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["a", `35129:${app.pubkey || myPubkey}:${app.id}`],
          ["k", "35129"],
          ...(app.eventId ? [["e", app.eventId]] : [])
        ],
        content: `Deleted app ${app.name || app.id}`
      };
      const signedDelete = await nostr.signEvent(deleteDraft);

      await new Promise<void>((resolve) => {
        try {
          const ws = new WebSocket("wss://relay.damus.io");
          const timer = setTimeout(() => resolve(), 800);
          ws.onopen = () => {
            ws.send(JSON.stringify(["EVENT", signedDelete]));
          };
          ws.onmessage = () => {
            clearTimeout(timer);
            ws.close();
            resolve();
          };
          ws.onerror = () => {
            clearTimeout(timer);
            resolve();
          };
        } catch {
          resolve();
        }
      });
      appendLog(`Published NIP-09 deletion request (kind: 5) for ${app.id} to Nostr relays.`);
    } catch (err: any) {
      appendLog(`Warning: Failed to publish kind: 5 deletion event: ${err?.message || err}`);
    }
  }

  if (nostr && Array.isArray(app.servers) && app.servers.length > 0 && Array.isArray(app.files) && app.files.length > 0) {
    for (const srv of app.servers) {
      const cleanSrv = srv.replace(/\/+$/, "");
      for (const file of app.files) {
        try {
          const now = Math.floor(Date.now() / 1000);
          const authDraft = {
            kind: 24242,
            content: `delete ${file.sha256}`,
            tags: [
              ["t", "delete"],
              ["x", file.sha256],
              ["expiration", String(now + 3600)]
            ],
            created_at: now
          };
          const signedAuth = await nostr.signEvent(authDraft);
          const authHeader = `Nostr ${uint8ToBase64(new TextEncoder().encode(JSON.stringify(signedAuth)))}`;
          if (typeof fetch === "function") {
            const resp = await fetch(`${cleanSrv}/${file.sha256}`, {
              method: "DELETE",
              headers: { Authorization: authHeader }
            });
            if (resp.ok) {
              appendLog(`Deleted blob ${file.sha256.slice(0, 10)}... from Blossom ${cleanSrv}`);
            }
          }
        } catch (_) {}
      }
    }
  }
}

async function executePublishWorkflow(skipBlossom = false): Promise<void> {
  if (extractedFiles.length === 0) {
    appendLog("Please select or drop a .zip or .html file first.");
    return;
  }

  statusLogs = [];
  isUploading = true;
  uploadProgress = { current: 0, total: 100, label: "Preparing package..." };
  notifyStateChanged();

  const nostr = typeof window !== "undefined" ? (window as any).nostr : (typeof globalThis !== "undefined" ? (globalThis as any).nostr : undefined);
  if (!nostr || typeof nostr.signEvent !== "function") {
    appendLog("Error: NIP-07 window.nostr signer is not available.");
    isUploading = false;
    uploadProgress = null;
    notifyStateChanged();
    return;
  }

  const activeServers = skipBlossom ? [] : servers.filter((s) => s.enabled).map((s) => s.url);
  const cleanId = (appId || "custom-nsite").trim();
  const cleanName = (appName || "Custom Nsite").trim();
  const cleanVer = (appVersion || "1.0.0").trim();
  const cleanDesc = (appDescription || "").trim();

  const filesToUpload: StudioFileEntry[] =
    packagingMode === "inlined"
      ? [
          {
            path: "index.html",
            bytes: new TextEncoder().encode(bundledHtmlOutput),
            size: new TextEncoder().encode(bundledHtmlOutput).byteLength,
            sha256: sha256Hex(new TextEncoder().encode(bundledHtmlOutput)),
            mimeType: "text/html",
            isText: true,
            textContent: bundledHtmlOutput
          }
        ]
      : extractedFiles;

  if (!skipBlossom && activeServers.length > 0) {
    appendLog(
      `Uploading ${filesToUpload.length} file(s) in '${packagingMode === "inlined" ? "Single-File Inlined" : "Multi-File Blossom"}' mode to ${activeServers.length} Blossom server(s)...`
    );

    let uploadedCount = 0;
    for (const file of filesToUpload) {
      uploadProgress = {
        current: Math.round((uploadedCount / filesToUpload.length) * 80),
        total: 100,
        label: `Uploading ${file.path} (${uploadedCount + 1}/${filesToUpload.length})...`
      };
      notifyStateChanged();

      const now = Math.floor(Date.now() / 1000);
      const authDraft = {
        kind: 24242,
        content: `upload ${file.path}`,
        tags: [
          ["t", "upload"],
          ["x", file.sha256],
          ["expiration", String(now + 3600)]
        ],
        created_at: now
      };

      let authHeader = "";
      try {
        const signedAuth = await nostr.signEvent(authDraft);
        authHeader = `Nostr ${uint8ToBase64(new TextEncoder().encode(JSON.stringify(signedAuth)))}`;
      } catch (err: any) {
        appendLog(`Warning: Could not sign BUD-06 auth event for ${file.path}: ${err?.message || err}`);
      }

      for (const srv of activeServers) {
        const cleanSrv = srv.replace(/\/+$/, "");
        try {
          if (typeof fetch === "function") {
            const resp = await fetch(`${cleanSrv}/upload`, {
              method: "PUT",
              headers: {
                "Content-Type": file.mimeType,
                ...(authHeader ? { Authorization: authHeader } : {}),
                "X-SHA-256": file.sha256
              },
              body: file.bytes as any
            });
            if (resp.ok) {
              appendLog(`Uploaded ${file.path} (${file.sha256.slice(0, 10)}...) -> ${cleanSrv}`);
            } else {
              appendLog(`Blossom server ${cleanSrv} returned HTTP ${resp.status} for ${file.path} (recorded hash in NIP-5A tags).`);
            }
          }
        } catch {
          appendLog(`Blossom server ${cleanSrv} unreachable from sandbox (hash ${file.sha256.slice(0, 10)}... recorded in NIP-5A event).`);
        }
      }
      uploadedCount++;
    }
  } else {
    appendLog("Packaging for direct Nostr & local 0ms store installation (Blossom upload skipped)...");
  }

  uploadProgress = { current: 85, total: 100, label: "Signing NIP-5A event..." };
  notifyStateChanged();

  const viewTags: string[][] =
    appViews.length > 0
      ? appViews.map((v) => ["view", v.id, v.title, v.path])
      : [
          ["view", "main", cleanName, ""],
          ["view", "widget", `${cleanName} Widget`, "?view=widget"],
          ["view", "settings", `${cleanName} Settings`, "?view=settings"]
        ];

  const tags: string[][] = [
    ["d", cleanId],
    ["name", cleanName],
    ["version", cleanVer],
    ["description", cleanDesc],
    ["icon", appIcon || "globe"],
    ...viewTags
  ];

  for (const f of filesToUpload) {
    tags.push(["f", f.path, f.sha256, f.mimeType]);
  }
  for (const s of activeServers) {
    tags.push(["server", s.replace(/\/+$/, "")]);
  }

  const nsiteDraft = {
    kind: 35129,
    content: bundledHtmlOutput,
    tags,
    created_at: Math.floor(Date.now() / 1000)
  };

  try {
    const signedEvent = await nostr.signEvent(nsiteDraft);

    const naddr = encodeNaddr({
      identifier: cleanId,
      pubkey: signedEvent.pubkey,
      kind: 35129,
      relays: skipBlossom ? [] : ["wss://relay.damus.io"]
    });

    const record: PublishedAppRecord = {
      id: cleanId,
      name: cleanName,
      version: cleanVer,
      description: cleanDesc,
      icon: appIcon || "widgets",
      naddr,
      eventId: signedEvent.id,
      pubkey: signedEvent.pubkey,
      createdAt: signedEvent.created_at * 1000,
      packagingMode: skipBlossom ? "local" : packagingMode,
      fileCount: filesToUpload.length,
      files: filesToUpload.map((f) => ({ path: f.path, sha256: f.sha256, mimeType: f.mimeType })),
      servers: activeServers,
      rawEvent: { ...signedEvent, content: "" },
      htmlContent: ""
    };

    const existingIdx = publishedApps.findIndex((p) => p.id === cleanId);
    if (existingIdx !== -1) {
      publishedApps[existingIdx] = record;
    } else {
      publishedApps.unshift(record);
    }
    savePublishedApps(publishedApps);
    lastPublishedResult = record;

    appendLog(`Signed & published NIP-5A event (kind: 35129, id: ${signedEvent.id.slice(0, 12)}...).`);
    appendLog(`Ready! Address: ${naddr}`);

    await new Promise<void>((resolve) => {
      try {
        const ws = new WebSocket(skipBlossom ? "ws://local" : "wss://relay.damus.io");
        const timer = setTimeout(() => resolve(), 350);
        ws.onopen = () => {
          ws.send(JSON.stringify(["EVENT", signedEvent]));
        };
        ws.onmessage = () => {
          clearTimeout(timer);
          ws.close();
          resolve();
        };
        ws.onerror = () => {
          clearTimeout(timer);
          resolve();
        };
      } catch {
        resolve();
      }
    });

    if (skipBlossom) {
      appendLog(`Saved to local 0ms store only (not broadcasted to remote relays).`);
      try {
        if (typeof window !== "undefined") {
          window.open(`nostr:${naddr}`);
        }
      } catch {}
    } else {
      appendLog(`Broadcasted to connected Nostr relays.`);
    }
  } catch (err: any) {
    appendLog(`Failed to sign/publish NIP-5A event: ${err?.message || String(err)}`);
  } finally {
    isUploading = false;
    uploadProgress = null;
    notifyStateChanged();
  }
}

async function publishBlossomServerList(): Promise<void> {
  try {
    const nostr = typeof window !== "undefined" ? (window as any).nostr : (typeof globalThis !== "undefined" ? (globalThis as any).nostr : undefined);
    if (!nostr || typeof nostr.signEvent !== "function") return;
    const activeUrls = servers.filter((s) => s.enabled).map((s) => s.url.replace(/\/+$/, ""));
    const draft = {
      kind: 10063,
      content: "",
      tags: activeUrls.map((u) => ["server", u]),
      created_at: Math.floor(Date.now() / 1000)
    };
    const signed = await nostr.signEvent(draft);
    const ws = new WebSocket("wss://relay.damus.io");
    ws.onopen = () => {
      ws.send(JSON.stringify(["EVENT", signed]));
      setTimeout(() => ws.close(), 300);
    };
    servers = servers.map((s) => ({ ...s, status: s.enabled ? "Published (kind: 10063)" : "Disabled" }));
    saveConfiguredServers(servers);
    notifyStateChanged();
  } catch {}
}

// ============================================================================
// 8. Declarative Schema UI Generator & Action Handler (Web Worker & Light DOM)
// ============================================================================
function getPublisherSchema(
  tab = activeTab,
  customState?: Partial<PublisherState>
): OmniComponentNode {
  const currentTab = customState?.activeTab || tab;
  const currServers = customState?.servers || servers;
  const currPublished = customState?.publishedApps || publishedApps;
  const currExtracted = customState?.extractedFiles || extractedFiles;
  const currEntry = customState?.entryFilePath || entryFilePath;
  const currName = customState?.appName !== undefined ? customState.appName : appName;
  const currId = customState?.appId !== undefined ? customState.appId : appId;
  const currVer = customState?.appVersion !== undefined ? customState.appVersion : appVersion;
  const currDesc = customState?.appDescription !== undefined ? customState.appDescription : appDescription;
  const currPackMode = customState?.packagingMode || packagingMode;
  const currUrlVal = customState?.remoteUrlInputVal !== undefined ? customState.remoteUrlInputVal : remoteUrlInputVal;
  const currNewSrv = customState?.newServerUrlVal !== undefined ? customState.newServerUrlVal : newServerUrlVal;
  const currLogs = customState?.statusLogs || statusLogs;
  const currResult = customState?.lastPublishedResult !== undefined ? customState.lastPublishedResult : lastPublishedResult;
  const currProgress = customState?.uploadProgress !== undefined ? customState.uploadProgress : uploadProgress;

  const headerCard: OmniComponentNode = {
    type: "card",
    title: "Plugin Studio & Blossom Publisher",
    subtitle: "Package .zip archives into NIP-5A nsites, upload to Blossom servers, or install directly.",
    icon: "package",
    children: [
      {
        type: "tabs",
        activeTab: currentTab,
        action: { name: "switch-tab" },
        tabs: [
          { id: "create", label: "Create & Upload", icon: "upload" },
          { id: "published", label: `My Published Plugins (${currPublished.length})`, icon: "globe" },
          { id: "servers", label: `Blossom Servers (${currServers.filter((s) => s.enabled).length})`, icon: "server" }
        ]
      }
    ]
  };

  const contentChildren: OmniComponentNode[] = [];

  // --------------------------------------------------------------------------
  // TAB 1: CREATE & UPLOAD
  // --------------------------------------------------------------------------
  if (currentTab === "create") {
    // 1. Dropzone / File selection Card
    contentChildren.push({
      type: "card",
      title: "Drop or Select a Plugin Archive (.zip) or HTML/JS Bundle",
      subtitle: "Extracts all files in-browser, computes SHA-256 hashes, and packages your app for either Multi-File Blossom upload or Single-File Inlined execution.",
      icon: "upload",
      children: [
        {
          type: "input",
          name: "pluginFile",
          inputType: "file",
          accept: ".zip,.html,.htm,.js",
          actionOnChange: { name: "file-selected" }
        },
        {
          type: "box",
          direction: "row",
          gap: "sm",
          children: [
            {
              type: "button",
              label: "Load Multi-File Starter Template (.zip)",
              variant: "secondary",
              icon: "package",
              action: { name: "load-starter" }
            }
          ]
        }
      ]
    });

    // 2. Arbitrary URL / NIP-5A Installer Card
    contentChildren.push({
      type: "card",
      title: "Install or Package from Arbitrary URL / NIP-5A naddr",
      subtitle: "Supports remote .zip, .html, or naddr1...",
      icon: "globe",
      children: [
        {
          type: "box",
          direction: "row",
          gap: "sm",
          align: "center",
          children: [
            {
              type: "input",
              name: "arbitraryUrl",
              inputType: "url",
              placeholder: "https://example.com/plugin.zip, https://.../index.html, or naddr1...",
              value: currUrlVal
            },
            {
              type: "button",
              label: "Fetch & Inspect",
              variant: "secondary",
              action: { name: "fetch-url" }
            },
            {
              type: "button",
              label: "Install from URL",
              variant: "primary",
              action: { name: "install-url" }
            }
          ]
        }
      ]
    });

    // 3. Extracted Archive Files (when files are loaded)
    if (currExtracted.length > 0) {
      contentChildren.push({
        type: "card",
        title: `Extracted Archive Files (${currExtracted.length})`,
        subtitle: `Entry point: ${currEntry}`,
        icon: "file",
        children: [
          {
            type: "list",
            items: currExtracted.map((f) => ({
              type: "list-item" as const,
              id: f.path,
              title: f.path,
              subtitle: `${f.mimeType} • ${f.size} B • sha256:${f.sha256.slice(0, 16)}...`,
              icon: "file"
            }))
          }
        ]
      });

      // 4. Metadata & Packaging Options
      contentChildren.push({
        type: "card",
        title: "Plugin Metadata & Packaging Mode",
        children: [
          {
            type: "box",
            direction: "column",
            gap: "sm",
            children: [
              {
                type: "box",
                direction: "row",
                gap: "sm",
                children: [
                  { type: "input", name: "appName", placeholder: "Plugin Name", value: currName },
                  { type: "input", name: "appId", placeholder: "App Slug (NIP-5A 'd' tag)", value: currId },
                  { type: "input", name: "appVersion", placeholder: "Version", value: currVer }
                ]
              },
              { type: "input", name: "appDescription", placeholder: "Description", value: currDesc },
              {
                type: "box",
                direction: "row",
                gap: "sm",
                children: [
                  {
                    type: "button",
                    label: "Option A: Single-File Inlined Bundle",
                    variant: currPackMode === "inlined" ? "primary" : "secondary",
                    action: { name: "set-packaging-mode", payload: { mode: "inlined" } }
                  },
                  {
                    type: "button",
                    label: "Option B: Multi-File Blossom Upload",
                    variant: currPackMode === "multifile" ? "primary" : "secondary",
                    action: { name: "set-packaging-mode", payload: { mode: "multifile" } }
                  }
                ]
              },
              {
                type: "box",
                direction: "row",
                gap: "sm",
                justify: "end",
                children: [
                  {
                    type: "button",
                    label: "Install Locally in Omni (Local Only)",
                    variant: "secondary",
                    action: { name: "install-local" }
                  },
                  {
                    type: "button",
                    label: "Upload to Blossom & Publish (NIP-5A)",
                    variant: "primary",
                    action: { name: "publish-blossom" }
                  }
                ]
              }
            ]
          }
        ]
      });
    }

    // 5. Published Result Card
    if (currResult) {
      contentChildren.push({
        type: "card",
        title: `Published Nsite Ready: ${currResult.name} (v${currResult.version})`,
        subtitle: `Kind 35129 • ${currResult.fileCount} file(s)`,
        icon: "check",
        children: [
          {
            type: "code-block",
            code: currResult.naddr,
            language: "text",
            copyable: true
          },
          {
            type: "box",
            direction: "row",
            gap: "sm",
            justify: "end",
            children: [
              {
                type: "button",
                label: "Copy naddr",
                variant: "secondary",
                action: { name: "copy-naddr", payload: { naddr: currResult.naddr } }
              },
              {
                type: "button",
                label: "Install / Update in Omni",
                variant: "primary",
                action: { name: "open-naddr", payload: { naddr: currResult.naddr } }
              }
            ]
          }
        ]
      });
    }

    // 6. Upload / Publish Progress Bar
    if (currProgress) {
      contentChildren.push({
        type: "card",
        title: "Uploading & Publishing",
        children: [
          {
            type: "progress",
            value: currProgress.current,
            label: currProgress.label
          }
        ]
      });
    }

    // 7. Activity Logs
    if (currLogs.length > 0) {
      contentChildren.push({
        type: "card",
        title: "Activity Logs",
        icon: "code",
        children: [
          {
            type: "code-block",
            code: currLogs.slice(-15).join("\n"),
            language: "text"
          }
        ]
      });
    }
  }

  // --------------------------------------------------------------------------
  // TAB 2: MY PUBLISHED PLUGINS
  // --------------------------------------------------------------------------
  else if (currentTab === "published") {
    contentChildren.push({
      type: "box",
      direction: "row",
      justify: "between",
      align: "center",
      children: [
        {
          type: "text",
          content: "Plugins signed by your Nostr identity (stored in Omni's 0ms local cache and connected Nostr relays as kind: 35129 events).",
          variant: "body",
          tone: "secondary"
        },
        {
          type: "button",
          label: "Query Relays",
          icon: "refresh",
          variant: "secondary",
          action: { name: "refresh-published" }
        }
      ]
    });

    if (currPublished.length === 0) {
      contentChildren.push({
        type: "empty-state",
        title: "No published plugins yet",
        description: "Use the 'Create & Upload' tab to package a .zip archive and publish it."
      });
    } else {
      contentChildren.push({
        type: "box",
        direction: "column",
        gap: "sm",
        children: currPublished.map((app) => ({
          type: "card",
          title: `${app.name} v${app.version}`,
          subtitle: `d:${app.id} • ${app.packagingMode === "multifile" ? `${app.fileCount} files on Blossom` : "Single-File Inlined / Local Store"}`,
          icon: app.icon || "widgets",
          children: [
            {
              type: "text",
              content: app.description || "No description provided.",
              variant: "body"
            },
            {
              type: "code-block",
              code: app.naddr,
              language: "text",
              copyable: true
            },
            {
              type: "box",
              direction: "row",
              gap: "xs",
              justify: "end",
              children: [
                {
                  type: "button",
                  label: "Install / Update",
                  variant: "primary",
                  action: { name: "open-naddr", payload: { naddr: app.naddr } }
                },
                {
                  type: "button",
                  label: "Update .zip",
                  variant: "secondary",
                  action: {
                    name: "prepare-update",
                    payload: { appId: app.id, appName: app.name, appVersion: app.version, appDescription: app.description }
                  }
                },
                {
                  type: "button",
                  label: "Copy naddr",
                  variant: "secondary",
                  action: { name: "copy-naddr", payload: { naddr: app.naddr } }
                },
                {
                  type: "button",
                  label: "Delete",
                  variant: "danger",
                  action: { name: "delete-app", payload: { appId: app.id } }
                }
              ]
            }
          ]
        }))
      });
    }
  }

  // --------------------------------------------------------------------------
  // TAB 3: BLOSSOM SERVERS
  // --------------------------------------------------------------------------
  else if (currentTab === "servers") {
    contentChildren.push({
      type: "card",
      title: "Blossom Server Endpoints (BUD-01 / Kind 10063)",
      subtitle: "Public Blossom servers store content-addressed blobs by SHA-256 hash using your Nostr signature (kind 24242) for authentication.",
      icon: "server",
      children: [
        {
          type: "box",
          direction: "row",
          justify: "end",
          children: [
            {
              type: "button",
              label: "Publish Server List (Kind 10063)",
              variant: "primary",
              action: { name: "publish-servers-list" }
            }
          ]
        },
        {
          type: "box",
          direction: "row",
          gap: "sm",
          align: "center",
          children: [
            {
              type: "input",
              name: "newServerUrl",
              inputType: "url",
              placeholder: "https://blossom.example.com",
              value: currNewSrv
            },
            {
              type: "button",
              label: "+ Add Server",
              variant: "secondary",
              action: { name: "add-server" }
            }
          ]
        },
        {
          type: "list",
          items: currServers.map((s) => ({
            type: "list-item" as const,
            id: s.url,
            title: s.url,
            subtitle: `${s.status || "Ready"} • ${s.enabled ? "Active" : "Disabled"}`,
            icon: "server",
            actions: [
              {
                type: "button" as const,
                label: s.enabled ? "Disable" : "Enable",
                variant: "secondary" as const,
                action: { name: "toggle-server", payload: { url: s.url } }
              },
              {
                type: "button" as const,
                label: "Remove",
                variant: "danger" as const,
                action: { name: "remove-server", payload: { url: s.url } }
              }
            ]
          }))
        }
      ]
    });
  }

  return {
    type: "box",
    direction: "column",
    gap: "md",
    children: [headerCard, ...contentChildren]
  };
}

function getPublisherWidgetSchema(state = getPublisherState()): OmniComponentNode {
  return {
    type: "card",
    title: "Plugin Studio",
    subtitle: "Packaging & Blossom distribution",
    icon: "package",
    children: [
      {
        type: "metric",
        label: "Published Plugins",
        value: String(state.publishedApps.length),
        trend: "up"
      },
      {
        type: "text",
        content: `${state.servers.filter((s) => s.enabled).length} active Blossom server(s) configured.`,
        variant: "body",
        tone: "secondary"
      },
      {
        type: "button",
        label: "Open Plugin Studio",
        variant: "primary",
        action: { name: "open-studio" }
      }
    ]
  };
}

async function handlePublisherAction(
  action: OmniAction,
  payload?: any
): Promise<OmniComponentNode> {
  const name = action.name;

  // Capture input fields from payload
  if (payload?.appName !== undefined) appName = String(payload.appName);
  if (payload?.appId !== undefined) appId = String(payload.appId);
  if (payload?.appVersion !== undefined) appVersion = String(payload.appVersion);
  if (payload?.appDescription !== undefined) appDescription = String(payload.appDescription);
  if (payload?.arbitraryUrl !== undefined) remoteUrlInputVal = String(payload.arbitraryUrl);
  if (payload?.newServerUrl !== undefined) newServerUrlVal = String(payload.newServerUrl);

  switch (name) {
    case "switch-tab":
      activeTab = payload?.tab || payload?.id || "create";
      try {
        if (typeof window !== "undefined" && window.history && typeof window.history.pushState === "function") {
          window.history.pushState({ tab: activeTab }, "", `?tab=${activeTab}`);
        }
      } catch (_) {}
      if (activeTab === "published") {
        syncPublishedFromRelays().catch(() => {});
      }
      break;

    case "file-selected": {
      const bytes = payload?.fileBytes;
      const fileName = payload?.fileName || payload?.value || "plugin.zip";
      if (bytes instanceof Uint8Array || (bytes && typeof bytes.byteLength === "number")) {
        const u8 = new Uint8Array(bytes.buffer || bytes, bytes.byteOffset || 0, bytes.byteLength);
        if (fileName.toLowerCase().endsWith(".zip") || (u8.length > 4 && u8[0] === 0x50 && u8[1] === 0x4b)) {
          processZipBytes(u8, fileName);
        } else {
          processSingleHtmlOrJsFile(u8, fileName);
        }
      }
      break;
    }

    case "load-starter": {
      const starterZip = buildStarterPluginZip();
      processZipBytes(starterZip, "pomodoro-focus-studio.zip");
      break;
    }

    case "fetch-url":
      await handleRemoteUrlInput(remoteUrlInputVal, false);
      break;

    case "install-url":
      await handleRemoteUrlInput(remoteUrlInputVal, true);
      break;

    case "set-packaging-mode":
      packagingMode = payload?.mode === "multifile" ? "multifile" : "inlined";
      break;

    case "install-local":
      await executePublishWorkflow(true);
      break;

    case "publish-blossom":
      await executePublishWorkflow(false);
      break;

    case "copy-naddr": {
      const targetNaddr = payload?.naddr || (lastPublishedResult ? lastPublishedResult.naddr : "");
      if (targetNaddr) {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(targetNaddr);
            appendLog(`Copied naddr to clipboard: ${targetNaddr.slice(0, 16)}...`);
          } catch {}
        }
      }
      break;
    }

    case "open-naddr": {
      const targetNaddr = payload?.naddr || (lastPublishedResult ? lastPublishedResult.naddr : "");
      if (targetNaddr && typeof window !== "undefined") {
        try {
          window.open(`nostr:${targetNaddr}`);
        } catch {}
      }
      break;
    }

    case "open-studio": {
      if (typeof window !== "undefined") {
        try {
          window.open("?view=main");
        } catch {}
      }
      break;
    }

    case "refresh-published":
      await syncPublishedFromRelays();
      break;

    case "prepare-update": {
      activeTab = "create";
      if (payload?.appId) appId = payload.appId;
      if (payload?.appName) appName = payload.appName;
      if (payload?.appDescription) appDescription = payload.appDescription;
      const verParts = (payload?.appVersion || appVersion || "1.0.0").split(".");
      if (verParts.length === 3) {
        appVersion = `${verParts[0]}.${verParts[1]}.${parseInt(verParts[2], 10) + 1}`;
      }
      break;
    }

    case "delete-app": {
      const targetId = payload?.appId || payload?.id;
      const target = publishedApps.find((a) => a.id === targetId);
      if (target) {
        await deletePublishedApp(target);
      }
      break;
    }

    case "publish-servers-list":
      await publishBlossomServerList();
      break;

    case "add-server": {
      let raw = (newServerUrlVal || payload?.newServerUrl || "").trim();
      if (raw) {
        if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
          raw = `https://${raw}`;
        }
        raw = raw.replace(/\/+$/, "");
        if (!servers.some((s) => s.url === raw)) {
          servers.push({ url: raw, enabled: true, status: "Added" });
          saveConfiguredServers(servers);
          newServerUrlVal = "";
        }
      }
      break;
    }

    case "toggle-server": {
      const srvUrl = payload?.url;
      const srv = servers.find((s) => s.url === srvUrl);
      if (srv) {
        srv.enabled = !srv.enabled;
        saveConfiguredServers(servers);
      }
      break;
    }

    case "remove-server": {
      const srvUrl = payload?.url;
      servers = servers.filter((s) => s.url !== srvUrl);
      saveConfiguredServers(servers);
      break;
    }
  }

  return getPublisherSchema();
}

function dispatchPublisherSchema(schema: OmniComponentNode | null): void {
  if (!schema || typeof window === "undefined") return;
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: "omni:schema", componentId: "main", schema }, "*");
  } else {
    window.postMessage({ type: "omni:schema", componentId: "main", schema }, "*");
  }
}

// ============================================================================
// Auto-Init & Event Listeners (Schema UI Mode)
// ============================================================================
if (typeof window !== "undefined") {
  window.addEventListener("omni:action", async (event: any) => {
    const detail = event.detail || event;
    if (detail?.__fromSchemaBus) return;
    const action = detail.action;
    const payload = detail.payload;
    if (action) {
      const next = await handlePublisherAction(action, payload);
      dispatchPublisherSchema(next);
    }
  });

  window.addEventListener("message", async (event: MessageEvent) => {
    const data = event.data;
    if (data && (data.type === "omni:action" || data.type === "action") && data.action) {
      const next = await handlePublisherAction(data.action, data.payload);
      dispatchPublisherSchema(next);
    }
  });

  window.addEventListener("popstate", (event: PopStateEvent) => {
    const tab = event?.state?.tab;
    if (tab) {
      activeTab = tab;
      dispatchPublisherSchema(getPublisherSchema(activeTab));
    }
  });

  (async () => {
    await syncPublishedFromRelays().catch(() => {});
    const view = getCurrentRouteView();
    if (view === "widget" || view === "compact") {
      dispatchPublisherSchema(getPublisherWidgetSchema());
    } else {
      dispatchPublisherSchema(getPublisherSchema());
    }
  })();
}

export {
  buildStarterPluginZip,
  unzipArchiveSync,
  createZipArchiveBytes,
  getPublisherSchema,
  getPublisherWidgetSchema,
  handlePublisherAction,
  getPublisherState,
  resetPublisherState
};
