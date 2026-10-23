/**
 * @omni/plugin-publisher — Plugin Studio & Nsite Blossom Uploader
 * 100% Standard Web & Nostr Application (Zero Proprietary SDKs).
 */

function escapeHtml(str: string): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ============================================================================
// 1. Monochrome Geometric SVG Icons (Strict Iconography Rule: Zero Emojis)
// ============================================================================
function svgIcon(name: string, size = 16): string {
  const attrs = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"`;
  switch (name) {
    case "upload":
      return `<svg ${attrs}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`;
    case "package":
      return `<svg ${attrs}><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`;
    case "server":
      return `<svg ${attrs}><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>`;
    case "check":
      return `<svg ${attrs}><polyline points="20 6 9 17 4 12"/></svg>`;
    case "copy":
      return `<svg ${attrs}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    case "file":
      return `<svg ${attrs}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
    case "globe":
      return `<svg ${attrs}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
    case "plus":
      return `<svg ${attrs}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    case "trash":
      return `<svg ${attrs}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`;
    case "refresh":
      return `<svg ${attrs}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`;
    case "code":
      return `<svg ${attrs}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
    default:
      return `<svg ${attrs}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`;
  }
}

// ============================================================================
// 2. Self-Contained SHA-256 & NIP-19 Bech32 (naddr) Implementation
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

/**
 * Creates a standard ZIP archive (method 0 Store) from a map of filenames to contents.
 */
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
    // Local file header
    view.setUint32(localOffset, 0x04034b50, true);
    view.setUint16(localOffset + 4, 20, true); // version needed
    view.setUint16(localOffset + 6, 0, true); // flags
    view.setUint16(localOffset + 8, 0, true); // compression: 0 (store)
    view.setUint16(localOffset + 10, 0, true); // mod time
    view.setUint16(localOffset + 12, 0, true); // mod date
    view.setUint32(localOffset + 14, e.crc, true);
    view.setUint32(localOffset + 18, e.dataBytes.length, true);
    view.setUint32(localOffset + 22, e.dataBytes.length, true);
    view.setUint16(localOffset + 26, e.nameBytes.length, true);
    view.setUint16(localOffset + 28, 0, true); // extra len
    out.set(e.nameBytes, localOffset + 30);
    out.set(e.dataBytes, localOffset + 30 + e.nameBytes.length);
    localOffset += 30 + e.nameBytes.length + e.dataBytes.length;

    // Central directory header
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

  // End of central directory record
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

// RFC 1951 Pure-JS Inflate (for Deflate method 8 in ZIP archives)
function inflateRawSync(src: Uint8Array, uncompressedSize?: number): Uint8Array {
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
      readBits(16); // nlen
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
interface StudioFileEntry {
  path: string;
  bytes: Uint8Array;
  size: number;
  sha256: string;
  mimeType: string;
  isText: boolean;
  textContent?: string;
}

interface PublishedAppRecord {
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
  rawEvent: any;
  htmlContent: string;
}

const DEFAULT_SERVERS = [
  "https://cdn.satellite.earth",
  "https://blossom.primal.net",
  "https://nostr.download"
];

const STORAGE_KEY_SERVERS = "omni_publisher_blossom_servers";
const STORAGE_KEY_PUBLISHED = "omni_publisher_published_apps";
const STORAGE_KEY_PREFS = "omni_publisher_preferences";

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
    const raw = localStorage.getItem(STORAGE_KEY_SERVERS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_SERVERS.map((url) => ({ url, enabled: true, status: "Ready" }));
}

function saveConfiguredServers(servers: Array<{ url: string; enabled: boolean; status?: string }>): void {
  try {
    localStorage.setItem(STORAGE_KEY_SERVERS, JSON.stringify(servers));
  } catch {}
}

function loadPublishedApps(): PublishedAppRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PUBLISHED);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function savePublishedApps(apps: PublishedAppRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_PUBLISHED, JSON.stringify(apps));
  } catch {}
}

function getCurrentRouteView(): string {
  try {
    const search = window.location.search || (window as any).__OMNI_SEARCH__ || "";
    const params = new URLSearchParams(search);
    const v = params.get("view") || (window as any).__OMNI_VIEW__ || "main";
    return v;
  } catch {
    return "main";
  }
}

// ============================================================================
// 7. Main Full-Page Application UI (Plugin Studio)
// ============================================================================
function mountPublisherStudio(root: HTMLElement) {
  let activeTab: "create" | "published" | "servers" = "create";
  if (getCurrentRouteView() === "servers") activeTab = "servers";
  else if (getCurrentRouteView() === "published") activeTab = "published";

  let servers = loadConfiguredServers();
  let publishedApps = loadPublishedApps();

  // Extracted zip state
  let extractedFiles: StudioFileEntry[] = [];
  let entryFilePath = "index.html";
  let bundledHtmlOutput = "";
  let rawEntryHtmlOutput = "";

  // Metadata form state
  let appName = "";
  let appId = "";
  let appVersion = "1.0.0";
  let appDescription = "";
  let appIcon = "globe";
  let appViews: Array<{ id: string; title: string; path: string }> = [];
  let packagingMode: "inlined" | "multifile" = "multifile";
  let remoteUrlInputVal = "";
  let statusLogs: string[] = [];
  let lastPublishedResult: PublishedAppRecord | null = null;

  const container = document.createElement("div");
  container.className = "publisher-studio-container";
  container.style.cssText =
    "display: flex; flex-direction: column; gap: 18px; padding: 20px; color: var(--omni-text-primary, #ede8df); font-family: var(--omni-font-sans, system-ui, sans-serif); max-width: 960px; margin: 0 auto; box-sizing: border-box;";

  function appendLog(msg: string) {
    statusLogs.push(msg);
    renderStudio();
  }

  function processZipBytes(zipBytes: Uint8Array, sourceFileName = "plugin.zip") {
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

    // Infer metadata from manifest.json / manifest.webmanifest / package.json or HTML
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
      detectedDesc = descMatch[1].trim();
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
    appDescription = detectedDesc || `Packaged nsite (${fileEntries.length} files).`;
    appIcon = detectedIcon;
    appViews = detectedViews;

    rawEntryHtmlOutput = baseHtml;
    bundledHtmlOutput = inlineHtmlBundle(baseHtml, entryFilePath, fileMap);

    appendLog(`Extracted ${fileEntries.length} file(s) from '${sourceFileName}'. Entry: ${entryFilePath}`);
  }

  function processSingleHtmlOrJsFile(bytes: Uint8Array, fileName: string) {
    const zipBytes = createZipArchiveBytes({
      [fileName.endsWith(".js") ? "index.js" : "index.html"]: bytes
    });
    processZipBytes(zipBytes, fileName);
  }

  async function handleRemoteUrlInput(rawTarget: string, autoInstall = true) {
    const trimmed = (rawTarget || "").trim();
    if (!trimmed) {
      appendLog("Please enter an arbitrary .zip URL, web app URL, or NIP-5A naddr1 address.");
      return;
    }

    if (trimmed.startsWith("naddr1") || trimmed.startsWith("nostr:naddr1")) {
      const cleanNaddr = trimmed.replace(/^nostr:/i, "");
      appendLog(`Opening NIP-5A address in Omni: nostr:${cleanNaddr}`);
      try {
        window.open(`nostr:${cleanNaddr}`);
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

  async function syncPublishedFromRelays() {
    try {
      const nostr = (window as any).nostr;
      if (!nostr || typeof nostr.getPublicKey !== "function") return;
      const myPubkey = await nostr.getPublicKey();
      if (!myPubkey) return;

      const ws = new WebSocket("wss://relay.damus.io");
      const subId = `pub-studio-${Date.now()}`;
      ws.onopen = () => {
        ws.send(JSON.stringify(["REQ", subId, { kinds: [35129, 10063], authors: [myPubkey], limit: 50 }]));
      };
      ws.onmessage = (ev) => {
        try {
          const frame = JSON.parse(ev.data);
          if (frame[0] === "EVENT" && frame[2]) {
            const event = frame[2];
            if (event.kind === 10063 && Array.isArray(event.tags)) {
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
              }
            } else if (event.kind === 35129 && Array.isArray(event.tags)) {
              const dTag = event.tags.find((t: string[]) => t[0] === "d")?.[1] || event.id;
              const nameTag = event.tags.find((t: string[]) => t[0] === "name" || t[0] === "title")?.[1] || dTag;
              const verTag = event.tags.find((t: string[]) => t[0] === "version")?.[1] || "1.0.0";
              const descTag = event.tags.find((t: string[]) => t[0] === "description")?.[1] || "";
              const iconTag = event.tags.find((t: string[]) => t[0] === "icon")?.[1] || "globe";
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
                rawEvent: event,
                htmlContent: event.content || ""
              };

              if (existingIdx === -1) {
                publishedApps.unshift(record);
                savePublishedApps(publishedApps);
                if (activeTab === "published") renderStudio();
              } else if (event.created_at * 1000 >= publishedApps[existingIdx].createdAt) {
                publishedApps[existingIdx] = record;
                savePublishedApps(publishedApps);
                if (activeTab === "published") renderStudio();
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

  async function executePublishWorkflow(skipBlossom = false) {
    if (extractedFiles.length === 0) {
      appendLog("Please select or drop a .zip or .html file first.");
      return;
    }

    statusLogs = [];
    const nostr = (window as any).nostr;
    if (!nostr || typeof nostr.signEvent !== "function") {
      appendLog("Error: NIP-07 window.nostr signer is not available.");
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

    // 1. Upload files to selected Blossom servers (BUD-01 / BUD-06)
    if (!skipBlossom && activeServers.length > 0) {
      appendLog(
        `Uploading ${filesToUpload.length} file(s) in '${packagingMode === "inlined" ? "Single-File Inlined" : "Multi-File Blossom"}' mode to ${activeServers.length} Blossom server(s)...`
      );

      for (const file of filesToUpload) {
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
      }
    } else {
      appendLog("Packaging for direct Nostr & local 0ms store installation (Blossom upload skipped)...");
    }

    // 2. Construct & Sign NIP-5A Event (kind: 35129)
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
        relays: ["wss://relay.damus.io"]
      });

      const record: PublishedAppRecord = {
        id: cleanId,
        name: cleanName,
        version: cleanVer,
        description: cleanDesc,
        icon: appIcon || "globe",
        naddr,
        eventId: signedEvent.id,
        pubkey: signedEvent.pubkey,
        createdAt: signedEvent.created_at * 1000,
        packagingMode: skipBlossom ? "local" : packagingMode,
        fileCount: filesToUpload.length,
        files: filesToUpload.map((f) => ({ path: f.path, sha256: f.sha256, mimeType: f.mimeType })),
        servers: activeServers,
        rawEvent: signedEvent,
        htmlContent: bundledHtmlOutput
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

      // Broadcast over Virtual WebSocket (writes to 0ms LocalEventStore + connected Nostr relays)
      await new Promise<void>((resolve) => {
        try {
          const ws = new WebSocket("wss://relay.damus.io");
          const timer = setTimeout(() => resolve(), 250);
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
        // Trigger immediate installation in Omni via protocol handler
        try {
          window.open(`nostr:${naddr}`);
        } catch {}
      }
    } catch (err: any) {
      appendLog(`Failed to sign/publish NIP-5A event: ${err?.message || String(err)}`);
    }
  }

  async function publishBlossomServerList() {
    try {
      const nostr = (window as any).nostr;
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
      renderStudio();
    } catch {}
  }

  function renderStudio() {
    container.replaceChildren();

    // Header & Tab Navigation
    const headerCard = document.createElement("div");
    headerCard.style.cssText =
      "display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; padding-bottom: 14px; border-bottom: 1px solid var(--omni-border-subtle, #2e2b26);";
    headerCard.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="width: 36px; height: 36px; border-radius: var(--omni-radius-sm, 6px); background: var(--omni-bg-card, #22201d); border: 1px solid var(--omni-border-strong, #3d3933); display: flex; align-items: center; justify-content: center; color: var(--omni-accent-primary, #d4a373);">
          ${svgIcon("package", 18)}
        </div>
        <div>
          <h2 style="margin: 0; font-size: 1.15rem; font-weight: 600; color: var(--omni-text-primary, #ede8df);">Plugin Studio & Blossom Publisher</h2>
          <p style="margin: 2px 0 0 0; font-size: 0.78rem; color: var(--omni-text-secondary, #9e988f);">Package .zip archives into NIP-5A nsites, upload to Blossom servers, or install directly.</p>
        </div>
      </div>
      <div style="display: flex; gap: 6px;">
        <button id="tab-btn-create" class="studio-tab-btn" style="padding: 7px 14px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.8rem; font-weight: 600; cursor: pointer; border: 1px solid ${activeTab === "create" ? "var(--omni-accent-primary, #d4a373)" : "var(--omni-border-strong, #3d3933)"}; background: ${activeTab === "create" ? "var(--omni-accent-primary, #d4a373)" : "var(--omni-bg-card, #22201d)"}; color: ${activeTab === "create" ? "#141312" : "var(--omni-text-primary, #ede8df)"};">
          Create & Upload
        </button>
        <button id="tab-btn-published" class="studio-tab-btn" style="padding: 7px 14px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.8rem; font-weight: 600; cursor: pointer; border: 1px solid ${activeTab === "published" ? "var(--omni-accent-primary, #d4a373)" : "var(--omni-border-strong, #3d3933)"}; background: ${activeTab === "published" ? "var(--omni-accent-primary, #d4a373)" : "var(--omni-bg-card, #22201d)"}; color: ${activeTab === "published" ? "#141312" : "var(--omni-text-primary, #ede8df)"};">
          My Published Plugins (${publishedApps.length})
        </button>
        <button id="tab-btn-servers" class="studio-tab-btn" style="padding: 7px 14px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.8rem; font-weight: 600; cursor: pointer; border: 1px solid ${activeTab === "servers" ? "var(--omni-accent-primary, #d4a373)" : "var(--omni-border-strong, #3d3933)"}; background: ${activeTab === "servers" ? "var(--omni-accent-primary, #d4a373)" : "var(--omni-bg-card, #22201d)"}; color: ${activeTab === "servers" ? "#141312" : "var(--omni-text-primary, #ede8df)"};">
          Blossom Servers (${servers.filter((s) => s.enabled).length})
        </button>
      </div>
    `;

    headerCard.querySelector("#tab-btn-create")?.addEventListener("click", () => {
      activeTab = "create";
      renderStudio();
    });
    headerCard.querySelector("#tab-btn-published")?.addEventListener("click", () => {
      activeTab = "published";
      syncPublishedFromRelays();
      renderStudio();
    });
    headerCard.querySelector("#tab-btn-servers")?.addEventListener("click", () => {
      activeTab = "servers";
      renderStudio();
    });

    container.appendChild(headerCard);

    // ========================================================================
    // TAB 1: CREATE & UPLOAD (.zip / Blossom / Direct Install)
    // ========================================================================
    if (activeTab === "create") {
      const createPane = document.createElement("div");
      createPane.style.cssText = "display: flex; flex-direction: column; gap: 16px;";

      // 1. Dropzone Card
      const dropzoneCard = document.createElement("div");
      dropzoneCard.id = "studio-zip-dropzone";
      dropzoneCard.setAttribute("data-dropzone", "true");
      dropzoneCard.style.cssText =
        "background: var(--omni-bg-surface, #191816); border: 2px dashed var(--omni-border-strong, #3d3933); border-radius: var(--omni-radius-md, 10px); padding: 24px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px; transition: border-color 0.15s;";
      dropzoneCard.innerHTML = `
        <div style="color: var(--omni-accent-primary, #d4a373);">${svgIcon("upload", 28)}</div>
        <div style="font-size: 0.95rem; font-weight: 600; color: var(--omni-text-primary, #ede8df);">
          Drop a Plugin Archive (.zip) or HTML/JS Bundle Here
        </div>
        <div style="font-size: 0.78rem; color: var(--omni-text-secondary, #9e988f); max-width: 520px;">
          Extracts all files in-browser, computes SHA-256 hashes, and packages your app for either Multi-File Blossom upload or Single-File Inlined execution.
        </div>
        <input id="studio-file-input" type="file" accept=".zip,.html,.htm,.js" style="display: none;" />
        <div style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 6px;">
          <button id="btn-browse-zip" data-file-input="studio-file-input" style="background: var(--omni-accent-primary, #d4a373); color: #141312; border: none; padding: 8px 16px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.82rem; font-weight: 600; cursor: pointer;">
            Select .zip or .html File
          </button>
          <button id="btn-load-starter-zip" style="background: var(--omni-bg-card, #22201d); color: var(--omni-text-primary, #ede8df); border: 1px solid var(--omni-border-strong, #3d3933); padding: 8px 16px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.82rem; cursor: pointer;">
            Load Multi-File Starter Template (.zip)
          </button>
        </div>
      `;

      const fileInput = dropzoneCard.querySelector("#studio-file-input") as HTMLInputElement;
      dropzoneCard.querySelector("#btn-browse-zip")?.addEventListener("click", () => {
        fileInput?.click();
      });

      const handleFilesSelected = async (fileList: any) => {
        if (!fileList || fileList.length === 0) return;
        const file = fileList[0];
        const name = file.name || "plugin.zip";
        let bytes: Uint8Array;
        if (file.bytes instanceof Uint8Array) {
          bytes = file.bytes;
        } else if (typeof file.arrayBuffer === "function") {
          const ab = await file.arrayBuffer();
          bytes = new Uint8Array(ab);
        } else {
          return;
        }

        if (name.toLowerCase().endsWith(".zip") || (bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b)) {
          processZipBytes(bytes, name);
        } else {
          processSingleHtmlOrJsFile(bytes, name);
        }
      };

      fileInput?.addEventListener("change", (e: any) => {
        const files = e.detail?.files || fileInput.files;
        handleFilesSelected(files);
      });

      dropzoneCard.addEventListener("drop", (e: any) => {
        e.preventDefault?.();
        const files = e.dataTransfer?.files || e.detail?.files;
        handleFilesSelected(files);
      });

      dropzoneCard.querySelector("#btn-load-starter-zip")?.addEventListener("click", () => {
        const starterZip = buildStarterPluginZip();
        processZipBytes(starterZip, "pomodoro-focus-studio.zip");
      });

      createPane.appendChild(dropzoneCard);

      // 1b. Arbitrary URL / NIP-5A naddr Loader & Installer Card
      const urlCard = document.createElement("div");
      urlCard.id = "studio-url-installer-card";
      urlCard.style.cssText =
        "background: var(--omni-bg-surface, #191816); border: 1px solid var(--omni-border-subtle, #2e2b26); border-radius: var(--omni-radius-md, 10px); padding: 16px; display: flex; flex-direction: column; gap: 10px;";
      urlCard.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong style="font-size: 0.88rem; color: var(--omni-text-primary, #ede8df);">Install or Package from Arbitrary URL / NIP-5A naddr</strong>
          <span style="font-size: 0.73rem; color: var(--omni-text-muted, #6b665f);">Supports remote .zip, .html, or naddr1...</span>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          <input
            id="input-studio-arbitrary-url"
            type="text"
            value="${escapeHtml(remoteUrlInputVal)}"
            placeholder="https://example.com/plugin.zip, https://.../index.html, or naddr1..."
            style="flex: 1; min-width: 240px; background: var(--omni-bg-subtle, #2a2723); border: 1px solid var(--omni-border-strong, #3d3933); color: var(--omni-text-primary, #ede8df); padding: 8px 12px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.82rem;"
          />
          <button id="btn-studio-fetch-url" style="background: var(--omni-bg-card, #22201d); color: var(--omni-text-primary, #ede8df); border: 1px solid var(--omni-border-strong, #3d3933); padding: 8px 14px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.8rem; cursor: pointer;">
            Fetch &amp; Inspect
          </button>
          <button id="btn-studio-install-url" style="background: var(--omni-accent-primary, #d4a373); color: #141312; border: none; padding: 8px 16px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.8rem; font-weight: 600; cursor: pointer;">
            Install from URL
          </button>
        </div>
      `;

      const urlInputEl = urlCard.querySelector("#input-studio-arbitrary-url") as HTMLInputElement;
      urlInputEl?.addEventListener("input", () => {
        remoteUrlInputVal = urlInputEl.value;
      });
      urlCard.querySelector("#btn-studio-fetch-url")?.addEventListener("click", () => {
        handleRemoteUrlInput(urlInputEl?.value || remoteUrlInputVal, false);
      });
      urlCard.querySelector("#btn-studio-install-url")?.addEventListener("click", () => {
        handleRemoteUrlInput(urlInputEl?.value || remoteUrlInputVal, true);
      });

      createPane.appendChild(urlCard);

      // 2. Extracted Files Table & Metadata Form (shown when files are loaded)
      if (extractedFiles.length > 0) {
        const filesCard = document.createElement("div");
        filesCard.style.cssText =
          "background: var(--omni-bg-surface, #191816); border: 1px solid var(--omni-border-subtle, #2e2b26); border-radius: var(--omni-radius-md, 10px); padding: 16px; display: flex; flex-direction: column; gap: 10px;";
        filesCard.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong style="font-size: 0.88rem; color: var(--omni-text-primary, #ede8df);">Extracted Archive Files (${extractedFiles.length})</strong>
            <span style="font-size: 0.75rem; color: var(--omni-accent-primary, #d4a373); font-family: monospace;">Entry: ${escapeHtml(entryFilePath)}</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${extractedFiles
              .map(
                (f) => `
              <div class="extracted-file-row" style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: var(--omni-bg-card, #22201d); border: 1px solid var(--omni-border-subtle, #2e2b26); border-radius: var(--omni-radius-sm, 6px); font-size: 0.78rem;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  ${svgIcon("file", 14)}
                  <strong style="color: var(--omni-text-primary, #ede8df);">${escapeHtml(f.path)}</strong>
                  <span style="color: var(--omni-text-muted, #6b665f);">${escapeHtml(f.mimeType)} (${f.size} B)</span>
                </div>
                <code style="font-size: 0.72rem; color: var(--omni-text-secondary, #9e988f);" title="SHA-256: ${f.sha256}">sha256:${f.sha256.slice(0, 16)}...</code>
              </div>`
              )
              .join("")}
          </div>
        `;
        createPane.appendChild(filesCard);

        // Metadata & Packaging Options Card
        const configCard = document.createElement("div");
        configCard.style.cssText =
          "background: var(--omni-bg-surface, #191816); border: 1px solid var(--omni-border-subtle, #2e2b26); border-radius: var(--omni-radius-md, 10px); padding: 16px; display: flex; flex-direction: column; gap: 14px;";
        configCard.innerHTML = `
          <strong style="font-size: 0.9rem; color: var(--omni-text-primary, #ede8df);">Plugin Metadata & Blossom Packaging Mode</strong>
          <div style="display: grid; grid-template-columns: 1fr 1fr 120px; gap: 10px;">
            <label style="display: flex; flex-direction: column; gap: 4px; font-size: 0.78rem; color: var(--omni-text-secondary, #9e988f);">
              Plugin Name:
              <input id="input-studio-name" type="text" value="${escapeHtml(appName)}" style="background: var(--omni-bg-subtle, #2a2723); border: 1px solid var(--omni-border-strong, #3d3933); color: var(--omni-text-primary, #ede8df); padding: 7px 10px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.82rem;" />
            </label>
            <label style="display: flex; flex-direction: column; gap: 4px; font-size: 0.78rem; color: var(--omni-text-secondary, #9e988f);">
              App Slug (NIP-5A 'd' tag):
              <input id="input-studio-id" type="text" value="${escapeHtml(appId)}" style="background: var(--omni-bg-subtle, #2a2723); border: 1px solid var(--omni-border-strong, #3d3933); color: var(--omni-text-primary, #ede8df); padding: 7px 10px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.82rem; font-family: monospace;" />
            </label>
            <label style="display: flex; flex-direction: column; gap: 4px; font-size: 0.78rem; color: var(--omni-text-secondary, #9e988f);">
              Version:
              <input id="input-studio-version" type="text" value="${escapeHtml(appVersion)}" style="background: var(--omni-bg-subtle, #2a2723); border: 1px solid var(--omni-border-strong, #3d3933); color: var(--omni-text-primary, #ede8df); padding: 7px 10px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.82rem;" />
            </label>
          </div>

          <label style="display: flex; flex-direction: column; gap: 4px; font-size: 0.78rem; color: var(--omni-text-secondary, #9e988f);">
            Description:
            <input id="input-studio-desc" type="text" value="${escapeHtml(appDescription)}" style="background: var(--omni-bg-subtle, #2a2723); border: 1px solid var(--omni-border-strong, #3d3933); color: var(--omni-text-primary, #ede8df); padding: 7px 10px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.82rem;" />
          </label>

          <div style="display: flex; flex-direction: column; gap: 8px;">
            <span style="font-size: 0.78rem; font-weight: 600; color: var(--omni-text-secondary, #9e988f);">Upload & Packaging Format:</span>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <div id="mode-card-multifile" style="padding: 10px 12px; border-radius: var(--omni-radius-sm, 6px); cursor: pointer; border: 1px solid ${packagingMode === "multifile" ? "var(--omni-accent-primary, #d4a373)" : "var(--omni-border-subtle, #2e2b26)"}; background: var(--omni-bg-card, #22201d);">
                <div style="font-size: 0.82rem; font-weight: 600; color: var(--omni-text-primary, #ede8df);">Option B: Multi-File Blossom Upload</div>
                <div style="font-size: 0.73rem; color: var(--omni-text-muted, #6b665f); margin-top: 2px;">Extracts and uploads each file separately to Blossom with individual ['f', path, sha256, mime] tags.</div>
              </div>
              <div id="mode-card-inlined" style="padding: 10px 12px; border-radius: var(--omni-radius-sm, 6px); cursor: pointer; border: 1px solid ${packagingMode === "inlined" ? "var(--omni-accent-primary, #d4a373)" : "var(--omni-border-subtle, #2e2b26)"}; background: var(--omni-bg-card, #22201d);">
                <div style="font-size: 0.82rem; font-weight: 600; color: var(--omni-text-primary, #ede8df);">Option A: Single-File Inlined Bundle</div>
                <div style="font-size: 0.73rem; color: var(--omni-text-muted, #6b665f); margin-top: 2px;">Inlines all CSS, JS, and assets from the zip into a single self-contained HTML bundle.</div>
              </div>
            </div>
          </div>

          <div style="display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; padding-top: 6px; border-top: 1px solid var(--omni-border-subtle, #2e2b26);">
            <button id="btn-install-local-direct" style="background: var(--omni-bg-card, #22201d); color: var(--omni-text-primary, #ede8df); border: 1px solid var(--omni-border-strong, #3d3933); padding: 9px 16px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.82rem; font-weight: 600; cursor: pointer;">
              Install Locally in Omni (No Blossom Needed)
            </button>
            <button id="btn-publish-blossom-nostr" style="background: var(--omni-accent-primary, #d4a373); color: #141312; border: none; padding: 9px 18px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.82rem; font-weight: 600; cursor: pointer;">
              Upload to Blossom & Publish to Nostr (NIP-5A)
            </button>
          </div>
        `;

        const nameInput = configCard.querySelector("#input-studio-name") as HTMLInputElement;
        const idInput = configCard.querySelector("#input-studio-id") as HTMLInputElement;
        const verInput = configCard.querySelector("#input-studio-version") as HTMLInputElement;
        const descInput = configCard.querySelector("#input-studio-desc") as HTMLInputElement;

        nameInput?.addEventListener("input", () => { appName = nameInput.value; });
        idInput?.addEventListener("input", () => { appId = idInput.value; });
        verInput?.addEventListener("input", () => { appVersion = verInput.value; });
        descInput?.addEventListener("input", () => { appDescription = descInput.value; });

        configCard.querySelector("#mode-card-multifile")?.addEventListener("click", () => {
          packagingMode = "multifile";
          renderStudio();
        });
        configCard.querySelector("#mode-card-inlined")?.addEventListener("click", () => {
          packagingMode = "inlined";
          renderStudio();
        });

        configCard.querySelector("#btn-install-local-direct")?.addEventListener("click", () => {
          executePublishWorkflow(true);
        });
        configCard.querySelector("#btn-publish-blossom-nostr")?.addEventListener("click", () => {
          executePublishWorkflow(false);
        });

        createPane.appendChild(configCard);
      }

      // 3. Published Output & naddr Card
      if (lastPublishedResult) {
        const res = lastPublishedResult;
        const resultCard = document.createElement("div");
        resultCard.id = "studio-published-result-card";
        resultCard.style.cssText =
          "background: var(--omni-bg-surface, #191816); border: 1px solid var(--omni-accent-primary, #d4a373); border-radius: var(--omni-radius-md, 10px); padding: 16px; display: flex; flex-direction: column; gap: 10px;";
        resultCard.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong style="font-size: 0.92rem; color: var(--omni-accent-primary, #d4a373);">Published Nsite Ready: ${escapeHtml(res.name)} (v${escapeHtml(res.version)})</strong>
            <span style="font-size: 0.72rem; color: var(--omni-text-secondary, #9e988f);">Kind 35129 • ${res.fileCount} file(s)</span>
          </div>
          <div style="background: var(--omni-bg-card, #22201d); padding: 8px 10px; border-radius: var(--omni-radius-sm, 6px); font-family: monospace; font-size: 0.75rem; word-break: break-all; color: var(--omni-text-primary, #ede8df);" id="studio-result-naddr">${escapeHtml(res.naddr)}</div>
          <div style="display: flex; gap: 8px; justify-content: flex-end;">
            <button id="btn-copy-result-naddr" style="background: var(--omni-bg-subtle, #2a2723); color: var(--omni-text-primary, #ede8df); border: 1px solid var(--omni-border-strong, #3d3933); padding: 6px 12px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.78rem; cursor: pointer;">
              Copy naddr
            </button>
            <a href="nostr:${escapeHtml(res.naddr)}" id="btn-install-result-now" style="background: var(--omni-accent-primary, #d4a373); color: #141312; text-decoration: none; padding: 6px 14px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.78rem; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
              Install / Open in Omni
            </a>
          </div>
        `;
        resultCard.querySelector("#btn-copy-result-naddr")?.addEventListener("click", (e) => {
          const btn = e.currentTarget as HTMLButtonElement;
          try {
            navigator.clipboard?.writeText(res.naddr);
            btn.textContent = "Copied!";
            setTimeout(() => { btn.textContent = "Copy naddr"; }, 1500);
          } catch {}
        });
        createPane.appendChild(resultCard);
      }

      // 4. Activity Log Console
      if (statusLogs.length > 0) {
        const logCard = document.createElement("div");
        logCard.style.cssText =
          "background: var(--omni-bg-card, #22201d); border: 1px solid var(--omni-border-subtle, #2e2b26); border-radius: var(--omni-radius-sm, 6px); padding: 12px; font-family: monospace; font-size: 0.75rem; color: var(--omni-text-secondary, #9e988f); display: flex; flex-direction: column; gap: 4px;";
        logCard.innerHTML = statusLogs.map((l) => `<div>&gt; ${escapeHtml(l)}</div>`).join("");
        createPane.appendChild(logCard);
      }

      container.appendChild(createPane);
    }

    // ========================================================================
    // TAB 2: MY PUBLISHED PLUGINS (Tracks published apps & Blossom servers)
    // ========================================================================
    else if (activeTab === "published") {
      const pubPane = document.createElement("div");
      pubPane.style.cssText = "display: flex; flex-direction: column; gap: 14px;";

      const topBar = document.createElement("div");
      topBar.style.cssText = "display: flex; justify-content: space-between; align-items: center;";
      topBar.innerHTML = `
        <div style="font-size: 0.84rem; color: var(--omni-text-secondary, #9e988f);">
          Plugins signed by your Nostr identity (stored in Omni's 0ms local cache and connected Nostr relays as <code>kind: 35129</code> events).
        </div>
        <button id="btn-refresh-published" style="background: var(--omni-bg-card, #22201d); color: var(--omni-text-primary, #ede8df); border: 1px solid var(--omni-border-strong, #3d3933); padding: 6px 12px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.78rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
          ${svgIcon("refresh", 13)} Query Relays
        </button>
      `;
      topBar.querySelector("#btn-refresh-published")?.addEventListener("click", () => {
        syncPublishedFromRelays();
      });
      pubPane.appendChild(topBar);

      if (publishedApps.length === 0) {
        const emptyCard = document.createElement("div");
        emptyCard.style.cssText =
          "background: var(--omni-bg-surface, #191816); border: 1px solid var(--omni-border-subtle, #2e2b26); border-radius: var(--omni-radius-md, 10px); padding: 28px; text-align: center; color: var(--omni-text-muted, #6b665f); font-size: 0.85rem;";
        emptyCard.textContent = "No published plugins yet. Use the 'Create & Upload' tab to package a .zip archive and publish it.";
        pubPane.appendChild(emptyCard);
      } else {
        for (const app of publishedApps) {
          const card = document.createElement("div");
          card.className = "published-app-card";
          card.style.cssText =
            "background: var(--omni-bg-surface, #191816); border: 1px solid var(--omni-border-subtle, #2e2b26); border-radius: var(--omni-radius-md, 10px); padding: 16px; display: flex; flex-direction: column; gap: 10px;";

          const serversBadge =
            app.servers && app.servers.length > 0
              ? app.servers.map((s) => `<span style="background: var(--omni-bg-subtle, #2a2723); padding: 2px 7px; border-radius: 4px; font-size: 0.7rem; color: var(--omni-text-secondary, #9e988f);">${escapeHtml(s)}</span>`).join(" ")
              : `<span style="background: var(--omni-bg-subtle, #2a2723); padding: 2px 7px; border-radius: 4px; font-size: 0.7rem; color: var(--omni-text-secondary, #9e988f);">Inline Nostr Event / Local Store</span>`;

          card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
              <div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <strong style="font-size: 0.96rem; color: var(--omni-text-primary, #ede8df);">${escapeHtml(app.name)}</strong>
                  <span style="font-size: 0.72rem; background: var(--omni-bg-card, #22201d); border: 1px solid var(--omni-border-strong, #3d3933); padding: 1px 6px; border-radius: 4px; color: var(--omni-accent-primary, #d4a373);">v${escapeHtml(app.version)}</span>
                  <span style="font-size: 0.7rem; color: var(--omni-text-muted, #6b665f); font-family: monospace;">d:${escapeHtml(app.id)}</span>
                </div>
                <p style="margin: 4px 0 0 0; font-size: 0.8rem; color: var(--omni-text-secondary, #9e988f);">${escapeHtml(app.description)}</p>
              </div>
              <div style="display: flex; gap: 6px; flex-shrink: 0;">
                <a href="nostr:${escapeHtml(app.naddr)}" class="btn-install-published" style="background: var(--omni-accent-primary, #d4a373); color: #141312; text-decoration: none; padding: 6px 12px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.76rem; font-weight: 600;">
                  Install in Omni
                </a>
                <button class="btn-copy-published-naddr" style="background: var(--omni-bg-card, #22201d); color: var(--omni-text-primary, #ede8df); border: 1px solid var(--omni-border-strong, #3d3933); padding: 6px 10px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.76rem; cursor: pointer;">
                  Copy naddr
                </button>
                <button class="btn-delete-published" style="background: var(--omni-bg-card, #22201d); color: var(--omni-text-muted, #6b665f); border: 1px solid var(--omni-border-subtle, #2e2b26); padding: 6px 8px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.76rem; cursor: pointer;" title="Remove from list">
                  ${svgIcon("trash", 13)}
                </button>
              </div>
            </div>
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 0.74rem; color: var(--omni-text-muted, #6b665f);">
              <span>Blossom Storage:</span> ${serversBadge}
              <span>• Files (${app.files?.length || 1}): ${app.files?.map((f) => escapeHtml(f.path)).join(", ") || "index.html"}</span>
            </div>
            <div style="background: var(--omni-bg-card, #22201d); padding: 6px 10px; border-radius: 4px; font-family: monospace; font-size: 0.72rem; color: var(--omni-text-secondary, #9e988f); word-break: break-all;">
              ${escapeHtml(app.naddr)}
            </div>
          `;

          card.querySelector(".btn-copy-published-naddr")?.addEventListener("click", (e) => {
            const btn = e.currentTarget as HTMLButtonElement;
            try {
              navigator.clipboard?.writeText(app.naddr);
              btn.textContent = "Copied!";
              setTimeout(() => { btn.textContent = "Copy naddr"; }, 1500);
            } catch {}
          });

          card.querySelector(".btn-delete-published")?.addEventListener("click", () => {
            publishedApps = publishedApps.filter((p) => p.id !== app.id);
            savePublishedApps(publishedApps);
            renderStudio();
          });

          pubPane.appendChild(card);
        }
      }

      container.appendChild(pubPane);
    }

    // ========================================================================
    // TAB 3: BLOSSOM SERVERS MANAGER (BUD-03 kind: 10063)
    // ========================================================================
    else if (activeTab === "servers") {
      const srvPane = document.createElement("div");
      srvPane.style.cssText = "display: flex; flex-direction: column; gap: 14px;";

      const infoCard = document.createElement("div");
      infoCard.style.cssText =
        "background: var(--omni-bg-surface, #191816); border: 1px solid var(--omni-border-subtle, #2e2b26); border-radius: var(--omni-radius-md, 10px); padding: 16px; display: flex; flex-direction: column; gap: 12px;";
      infoCard.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong style="font-size: 0.92rem; color: var(--omni-text-primary, #ede8df);">Blossom Server Endpoints (BUD-01 / Kind 10063)</strong>
            <p style="margin: 4px 0 0 0; font-size: 0.78rem; color: var(--omni-text-secondary, #9e988f);">
              Public Blossom servers store content-addressed blobs by SHA-256 hash using your Nostr signature (kind 24242) for authentication—you do not need to host your own server.
            </p>
          </div>
          <button id="btn-sync-kind-10063" style="background: var(--omni-accent-primary, #d4a373); color: #141312; border: none; padding: 8px 14px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.78rem; font-weight: 600; cursor: pointer; flex-shrink: 0;">
            Publish Server List (Kind 10063)
          </button>
        </div>

        <div style="display: flex; gap: 8px;">
          <input id="input-new-blossom-server" type="text" placeholder="https://blossom.example.com" style="flex: 1; background: var(--omni-bg-subtle, #2a2723); border: 1px solid var(--omni-border-strong, #3d3933); color: var(--omni-text-primary, #ede8df); padding: 8px 12px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.82rem;" />
          <button id="btn-add-blossom-server" style="background: var(--omni-bg-card, #22201d); color: var(--omni-text-primary, #ede8df); border: 1px solid var(--omni-border-strong, #3d3933); padding: 8px 16px; border-radius: var(--omni-radius-sm, 6px); font-size: 0.82rem; font-weight: 600; cursor: pointer;">
            + Add Server
          </button>
        </div>

        <div id="blossom-servers-list" style="display: flex; flex-direction: column; gap: 8px;"></div>
      `;

      infoCard.querySelector("#btn-sync-kind-10063")?.addEventListener("click", () => {
        publishBlossomServerList();
      });

      const newSrvInput = infoCard.querySelector("#input-new-blossom-server") as HTMLInputElement;
      infoCard.querySelector("#btn-add-blossom-server")?.addEventListener("click", () => {
        let raw = (newSrvInput?.value || "").trim();
        if (!raw) return;
        if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
          raw = `https://${raw}`;
        }
        raw = raw.replace(/\/+$/, "");
        if (!servers.some((s) => s.url === raw)) {
          servers.push({ url: raw, enabled: true, status: "Added" });
          saveConfiguredServers(servers);
          newSrvInput.value = "";
          renderStudio();
        }
      });

      const listEl = infoCard.querySelector("#blossom-servers-list")!;
      for (const srv of servers) {
        const row = document.createElement("div");
        row.className = "blossom-server-row";
        row.style.cssText =
          "display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: var(--omni-bg-card, #22201d); border: 1px solid var(--omni-border-subtle, #2e2b26); border-radius: var(--omni-radius-sm, 6px);";
        row.innerHTML = `
          <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; font-size: 0.84rem; color: var(--omni-text-primary, #ede8df);">
            <input type="checkbox" class="chk-blossom-srv" ${srv.enabled ? "checked" : ""} />
            <span>${escapeHtml(srv.url)}</span>
            <span style="font-size: 0.7rem; color: var(--omni-text-muted, #6b665f);">(${escapeHtml(srv.status || "Ready")})</span>
          </label>
          <button class="btn-remove-blossom-srv" style="background: transparent; border: none; color: var(--omni-text-muted, #6b665f); cursor: pointer; padding: 4px;">
            ${svgIcon("trash", 14)}
          </button>
        `;
        const chk = row.querySelector(".chk-blossom-srv") as HTMLInputElement;
        chk?.addEventListener("change", () => {
          srv.enabled = chk.checked;
          saveConfiguredServers(servers);
          renderStudio();
        });
        row.querySelector(".btn-remove-blossom-srv")?.addEventListener("click", () => {
          servers = servers.filter((s) => s.url !== srv.url);
          saveConfiguredServers(servers);
          renderStudio();
        });
        listEl.appendChild(row);
      }

      srvPane.appendChild(infoCard);
      container.appendChild(srvPane);
    }
  }

  renderStudio();
  root.appendChild(container);
  syncPublishedFromRelays();
}

function mountPublisherWidget(root: HTMLElement) {
  const published = loadPublishedApps();
  const servers = loadConfiguredServers();

  const card = document.createElement("div");
  card.className = "publisher-widget-card";
  card.style.cssText =
    "background: var(--omni-bg-surface, #191816); border: 1px solid var(--omni-border-strong, #3d3933); border-radius: var(--omni-radius-md, 10px); padding: 14px; display: flex; flex-direction: column; gap: 8px; color: var(--omni-text-primary, #ede8df);";
  card.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <strong style="font-size: 0.9rem;">Plugin Studio</strong>
      <span style="font-size: 0.72rem; color: var(--omni-accent-primary, #d4a373);">${published.length} published</span>
    </div>
    <div style="font-size: 0.76rem; color: var(--omni-text-secondary, #9e988f);">
      ${servers.filter((s) => s.enabled).length} active Blossom server(s) configured.
    </div>
  `;
  root.appendChild(card);
}

function init() {
  if (typeof document === "undefined") return;
  const view = getCurrentRouteView();
  if (view === "widget" || view === "compact") {
    mountPublisherWidget(document.body);
  } else {
    mountPublisherStudio(document.body);
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}

export {
  mountPublisherStudio,
  mountPublisherWidget,
  buildStarterPluginZip,
  unzipArchiveSync,
  createZipArchiveBytes
};
