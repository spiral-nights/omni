export const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

export function bech32Polymod(values: number[]): number {
  let chk = 1;
  for (const val of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ val;
    if ((top >> 0) & 1) chk ^= 0x3b6a57b2;
    if ((top >> 1) & 1) chk ^= 0x26508e6d;
    if ((top >> 2) & 1) chk ^= 0x1ea119fa;
    if ((top >> 3) & 1) chk ^= 0x3d4233dd;
    if ((top >> 4) & 1) chk ^= 0x2a1462b3;
  }
  return chk;
}

export function expandHrp(hrp: string): number[] {
  const ret: number[] = [];
  for (let p = 0; p < hrp.length; ++p) ret.push(hrp.charCodeAt(p) >> 5);
  ret.push(0);
  for (let p = 0; p < hrp.length; ++p) ret.push(hrp.charCodeAt(p) & 31);
  return ret;
}

export function convertBits(data: number[] | Uint8Array, frombits: number, tobits: number, pad: boolean): number[] | null {
  let acc = 0;
  let bits = 0;
  const ret: number[] = [];
  const maxv = (1 << tobits) - 1;
  for (const value of data) {
    if (value < 0 || value >> frombits !== 0) return null;
    acc = (acc << frombits) | value;
    bits += frombits;
    while (bits >= tobits) {
      bits -= tobits;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) ret.push((acc << (tobits - bits)) & maxv);
  } else if (bits >= frombits || ((acc << (tobits - bits)) & maxv)) {
    return null;
  }
  return ret;
}

export function wordsToBytes(words: number[]): number[] {
  return (convertBits(words, 5, 8, false) || []).slice(0, Math.floor((words.length * 5) / 8));
}

export function bytesToWords(bytes: number[] | Uint8Array): number[] {
  return convertBits(bytes, 8, 5, true) || [];
}

export function bech32Encode(hrp: string, data: number[] | Uint8Array): string {
  const words = data instanceof Uint8Array || (Array.isArray(data) && data.some((v) => v > 31))
    ? bytesToWords(data)
    : Array.from(data);
  const combined = [...expandHrp(hrp), ...words, 0, 0, 0, 0, 0, 0];
  const mod = bech32Polymod(combined) ^ 1;
  const ret: number[] = [];
  for (let p = 0; p < 6; ++p) ret.push((mod >> (5 * (5 - p))) & 31);
  return hrp + "1" + [...words, ...ret].map((p) => BECH32_CHARSET.charAt(p)).join("");
}

export function bech32Decode(str: string): { hrp: string; words: number[] } | null {
  try {
    const s = str.toLowerCase().trim();
    const pos = s.lastIndexOf("1");
    if (pos < 1 || pos + 7 > s.length || s.length > 5000) return null;
    const hrp = s.slice(0, pos);
    for (const ch of hrp) {
      const code = ch.charCodeAt(0);
      if (code < 33 || code > 126) return null;
    }
    const words: number[] = [];
    for (const ch of s.slice(pos + 1)) {
      const idx = BECH32_CHARSET.indexOf(ch);
      if (idx === -1) return null;
      words.push(idx);
    }
    if (bech32Polymod([...expandHrp(hrp), ...words]) !== 1) return null;
    return { hrp, words: words.slice(0, -6) };
  } catch (_) {
    return null;
  }
}

export function bytesToHex(bytes: Uint8Array | number[]): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function toBech32(hrp: string, hex: string): string {
  const bytes = Array.from(hexToBytes(hex));
  const words = convertBits(bytes, 8, 5, true);
  if (!words) throw new Error("Failed to convert bits for bech32 encoding");
  return bech32Encode(hrp, words);
}

export function fromBech32(str: string): { hrp: string; hex: string } {
  const decoded = bech32Decode(str);
  if (!decoded) throw new Error("Invalid bech32 string");
  const bytes = convertBits(decoded.words, 5, 8, false);
  if (!bytes) throw new Error("Failed to convert bits from bech32");
  return { hrp: decoded.hrp, hex: bytesToHex(bytes) };
}

export function hexToNpub(hex: string): string {
  return toBech32("npub", hex);
}

export function npubToHex(npub: string): string {
  return fromBech32(npub).hex;
}

export function hexToNsec(hex: string): string {
  return toBech32("nsec", hex);
}

export function nsecToHex(nsec: string): string {
  return fromBech32(nsec).hex;
}

export interface DecodedNostrEntity {
  type: "npub" | "nprofile" | "note" | "nevent" | "naddr" | "unknown";
  hex?: string;
  kind?: number;
  pubkey?: string;
  identifier?: string;
  relays?: string[];
  eventId?: string;
}

export function decodeNostrEntity(raw: string): DecodedNostrEntity | null {
  const s = raw.trim().replace(/^nostr:/i, "").toLowerCase();
  if (!/^(npub|nprofile|note|nevent|naddr)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/.test(s)) return null;
  const decoded = bech32Decode(s);
  if (!decoded) return null;
  const bytes = wordsToBytes(decoded.words);
  const hex = bytesToHex(bytes);

  switch (decoded.hrp) {
    case "npub":
      return bytes.length === 32 ? { type: "npub", hex } : null;
    case "note":
      return bytes.length === 32 ? { type: "note", hex } : null;
    case "nprofile": {
      let pubkey: string | undefined;
      const relays: string[] = [];
      let i = 0;
      const textDecoder = new TextDecoder();
      while (i + 2 <= bytes.length) {
        const tag = bytes[i];
        const len = bytes[i + 1];
        const val = bytes.slice(i + 2, i + 2 + len);
        if (tag === 0 && len === 32) pubkey = bytesToHex(val);
        else if (tag === 1) relays.push(textDecoder.decode(new Uint8Array(val)));
        i += 2 + len;
      }
      return pubkey ? { type: "nprofile", pubkey, hex: pubkey, relays: relays.length > 0 ? relays : undefined } : null;
    }
    case "nevent": {
      let eventId: string | undefined;
      let pubkey: string | undefined;
      const relays: string[] = [];
      let i = 0;
      const textDecoder = new TextDecoder();
      while (i + 2 <= bytes.length) {
        const tag = bytes[i];
        const len = bytes[i + 1];
        const val = bytes.slice(i + 2, i + 2 + len);
        if (tag === 0 && len === 32) eventId = bytesToHex(val);
        else if (tag === 1) relays.push(textDecoder.decode(new Uint8Array(val)));
        else if (tag === 2 && len === 32) pubkey = bytesToHex(val);
        i += 2 + len;
      }
      return eventId ? { type: "nevent", hex: eventId, eventId, pubkey, relays: relays.length > 0 ? relays : undefined } : null;
    }
    case "naddr": {
      let kind: number | undefined;
      let pubkey: string | undefined;
      let identifier: string | undefined;
      const relays: string[] = [];
      let i = 0;
      const textDecoder = new TextDecoder();
      while (i + 2 <= bytes.length) {
        const tag = bytes[i];
        const len = bytes[i + 1];
        const val = bytes.slice(i + 2, i + 2 + len);
        if (tag === 0) {
          if (len === 4) kind = (val[0] << 24) | (val[1] << 16) | (val[2] << 8) | val[3];
          else identifier = textDecoder.decode(new Uint8Array(val));
        } else if (tag === 1) {
          if (len === 32) pubkey = bytesToHex(val);
          else relays.push(textDecoder.decode(new Uint8Array(val)));
        } else if (tag === 2) {
          if (len === 32) pubkey = bytesToHex(val);
          else identifier = textDecoder.decode(new Uint8Array(val));
        } else if (tag === 3 && len === 4) {
          kind = (val[0] << 24) | (val[1] << 16) | (val[2] << 8) | val[3];
        }
        i += 2 + len;
      }
      return kind !== undefined && pubkey ? { type: "naddr", kind, pubkey, identifier, relays: relays.length > 0 ? relays : undefined } : null;
    }
    default:
      return null;
  }
}

export function encodeNaddr(params: { identifier: string; pubkey: string; kind: number; relays?: string[] }): string {
  const chunks: Uint8Array[] = [];
  const textEncoder = new TextEncoder();

  // Type 0: identifier (d-tag)
  const dBytes = textEncoder.encode(params.identifier);
  chunks.push(new Uint8Array([0, dBytes.length]), dBytes);

  // Type 1: relays
  for (const r of params.relays || []) {
    const rBytes = textEncoder.encode(r);
    chunks.push(new Uint8Array([1, rBytes.length]), rBytes);
  }

  // Type 2: author pubkey (32 bytes)
  const pubBytes = hexToBytes(params.pubkey);
  chunks.push(new Uint8Array([2, pubBytes.length]), pubBytes);

  // Type 3: kind (4 bytes big-endian)
  const kindBuf = new Uint8Array(4);
  new DataView(kindBuf.buffer).setUint32(0, params.kind, false);
  chunks.push(new Uint8Array([3, 4]), kindBuf);

  const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
  const combined = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    combined.set(c, offset);
    offset += c.length;
  }

  return toBech32("naddr", bytesToHex(combined));
}

export function decodeNaddr(naddrStr: string): { identifier: string; pubkey: string; kind: number; relays?: string[] } | null {
  const decoded = decodeNostrEntity(naddrStr);
  if (!decoded || decoded.type !== "naddr" || decoded.kind === undefined || !decoded.pubkey || decoded.identifier === undefined) {
    return null;
  }
  return {
    identifier: decoded.identifier,
    pubkey: decoded.pubkey,
    kind: decoded.kind,
    relays: decoded.relays
  };
}
