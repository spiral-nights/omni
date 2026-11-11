import {
  to_bech32,
  from_bech32,
  hex_to_npub,
  npub_to_hex,
  hex_to_nsec,
  nsec_to_hex,
  decode_nostr_entity,
  encode_naddr
} from "@omni/gleam-interop/bech32";

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
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return to_bech32(hrp, bytesToHex(bytes));
}

export function bech32Decode(str: string): { hrp: string; words: number[] } | null {
  try {
    const res = from_bech32(str) as { hrp: string; hex: string };
    if (!res || !res.hrp || res.hex === undefined) return null;
    const bytes = hexToBytes(res.hex);
    const words = bytesToWords(bytes);
    return { hrp: res.hrp, words };
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
  return to_bech32(hrp, hex);
}

export function fromBech32(str: string): { hrp: string; hex: string } {
  return from_bech32(str) as { hrp: string; hex: string };
}

export function hexToNpub(hex: string): string {
  return hex_to_npub(hex);
}

export function npubToHex(npub: string): string {
  return npub_to_hex(npub);
}

export function hexToNsec(hex: string): string {
  return hex_to_nsec(hex);
}

export function nsecToHex(nsec: string): string {
  return nsec_to_hex(nsec);
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
  const entity = decode_nostr_entity(raw);
  return (entity as DecodedNostrEntity) || null;
}

export function encodeNaddr(params: { identifier: string; pubkey: string; kind: number; relays?: string[] }): string {
  return encode_naddr(params);
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
