const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function bech32Polymod(values: number[]): number {
  const gen = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      chk ^= ((top >> i) & 1) ? gen[i] : 0;
    }
  }
  return chk;
}

export function bech32Decode(str: string): { hrp: string; words: number[] } | null {
  try {
    const s = str.toLowerCase().trim();
    const pos = s.lastIndexOf("1");
    if (pos < 1 || pos + 7 > s.length || s.length > 5000) return null;
    const hrp = s.slice(0, pos);
    for (const ch of hrp) if (ch.charCodeAt(0) < 33 || ch.charCodeAt(0) > 126) return null;
    const words: number[] = [];
    for (const ch of s.slice(pos + 1)) {
      const idx = BECH32_CHARSET.indexOf(ch);
      if (idx === -1) return null;
      words.push(idx);
    }
    if (bech32Polymod([
      ...hrp.split("").map((c) => c.charCodeAt(0) >> 5),
      0,
      ...hrp.split("").map((c) => c.charCodeAt(0) & 31),
      ...words
    ]) !== 1) return null;
    return { hrp, words: words.slice(0, -6) };
  } catch (_) {
    return null;
  }
}

function convertBits(data: number[], fromBits: number, toBits: number): number[] {
  let acc = 0;
  let bits = 0;
  const ret: number[] = [];
  const maxv = (1 << toBits) - 1;
  for (const v of data) {
    acc = (acc << fromBits) | v;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (bits > 0) ret.push((acc << (toBits - bits)) & maxv);
  return ret;
}

export function wordsToBytes(words: number[]): number[] {
  return convertBits(words, 5, 8).slice(0, Math.floor((words.length * 5) / 8));
}

export function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface DecodedNostrEntity {
  type: "npub" | "nprofile" | "note" | "nevent" | "naddr";
  hex?: string;
  kind?: number;
  pubkey?: string;
  identifier?: string;
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
      let i = 0;
      while (i + 2 <= bytes.length) {
        const tag = bytes[i];
        const len = bytes[i + 1];
        const val = bytes.slice(i + 2, i + 2 + len);
        if (tag === 0 && len === 32) pubkey = bytesToHex(val);
        i += 2 + len;
      }
      return pubkey ? { type: "nprofile", pubkey } : null;
    }
    case "nevent": {
      let eventId: string | undefined;
      let i = 0;
      while (i + 2 <= bytes.length) {
        const tag = bytes[i];
        const len = bytes[i + 1];
        if (tag === 0 && len === 32) eventId = bytesToHex(bytes.slice(i + 2, i + 2 + len));
        i += 2 + bytes[i + 1];
      }
      return eventId ? { type: "nevent", hex: eventId } : null;
    }
    case "naddr": {
      let kind: number | undefined;
      let pubkey: string | undefined;
      let identifier: string | undefined;
      let i = 0;
      while (i + 2 <= bytes.length) {
        const tag = bytes[i];
        const len = bytes[i + 1];
        const val = bytes.slice(i + 2, i + 2 + len);
        if (tag === 0 && len === 4) kind = (val[0] << 24) | (val[1] << 16) | (val[2] << 8) | val[3];
        if (tag === 1 && len === 32) pubkey = bytesToHex(val);
        if (tag === 2) identifier = String.fromCharCode(...val);
        i += 2 + len;
      }
      return kind !== undefined && pubkey ? { type: "naddr", kind, pubkey, identifier } : null;
    }
    default:
      return null;
  }
}

export function extractQuotedNoteId(content: string): string | null {
  if (!content) return null;
  const match = content.match(/(?:nostr:)?((?:note|nevent)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{20,})/i);
  if (!match) return null;
  const decoded = decodeNostrEntity(match[1]);
  return (decoded?.type === "note" || decoded?.type === "nevent") && decoded.hex ? decoded.hex : null;
}
