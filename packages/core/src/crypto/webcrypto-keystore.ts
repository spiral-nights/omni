import { schnorr } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes } from "@noble/curves/abstract/utils";
import { NostrEvent, UnsignedEvent } from "@omni/types";

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function polymod(values: number[]): number {
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

function hrpExpand(hrp: string): number[] {
  const ret: number[] = [];
  for (let p = 0; p < hrp.length; ++p) ret.push(hrp.charCodeAt(p) >> 5);
  ret.push(0);
  for (let p = 0; p < hrp.length; ++p) ret.push(hrp.charCodeAt(p) & 31);
  return ret;
}

function createChecksum(hrp: string, data: number[]): number[] {
  const values = hrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0]);
  const mod = polymod(values) ^ 1;
  const ret: number[] = [];
  for (let p = 0; p < 6; ++p) ret.push((mod >> (5 * (5 - p))) & 31);
  return ret;
}

function convertBits(data: number[], frombits: number, tobits: number, pad: boolean): number[] | null {
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

export function toBech32(hrp: string, hex: string): string {
  const bytes = Array.from(hexToBytes(hex));
  const words = convertBits(bytes, 8, 5, true)!;
  const checksum = createChecksum(hrp, words);
  return hrp + "1" + words.concat(checksum).map(c => CHARSET.charAt(c)).join("");
}

export function fromBech32(str: string): { hrp: string; hex: string } {
  str = str.toLowerCase().trim();
  const pos = str.lastIndexOf("1");
  if (pos < 1 || pos + 7 > str.length) throw new Error("Invalid bech32 string");
  const hrp = str.slice(0, pos);
  const data: number[] = [];
  for (let i = pos + 1; i < str.length; ++i) {
    const idx = CHARSET.indexOf(str.charAt(i));
    if (idx === -1) throw new Error("Invalid bech32 character: " + str.charAt(i));
    data.push(idx);
  }
  const words = data.slice(0, -6);
  const values = hrpExpand(hrp).concat(data);
  if (polymod(values) !== 1) throw new Error("Invalid bech32 checksum");
  const bytes = convertBits(words, 5, 8, false);
  if (!bytes) throw new Error("Failed to convert bits");
  return { hrp, hex: bytesToHex(new Uint8Array(bytes)) };
}

export class WebCryptoKeystore {
  private privateKeyHex: string;

  constructor(privateKeyHex?: string) {
    this.privateKeyHex = privateKeyHex || WebCryptoKeystore.generatePrivateKey();
  }

  static generatePrivateKey(): string {
    const bytes = schnorr.utils.randomPrivateKey();
    return bytesToHex(bytes);
  }

  static getPublicKey(privateKeyHex: string): string {
    const bytes = hexToBytes(privateKeyHex);
    const pubBytes = schnorr.getPublicKey(bytes);
    return bytesToHex(pubBytes);
  }

  static toNpub(pubkeyHex: string): string {
    return toBech32("npub", pubkeyHex);
  }

  static toNsec(privkeyHex: string): string {
    return toBech32("nsec", privkeyHex);
  }

  static decodeKey(key: string): { type: "npub" | "nsec" | "hex"; hex: string } {
    key = key.trim();
    if (key.startsWith("npub1")) {
      const decoded = fromBech32(key);
      return { type: "npub", hex: decoded.hex };
    }
    if (key.startsWith("nsec1")) {
      const decoded = fromBech32(key);
      return { type: "nsec", hex: decoded.hex };
    }
    if (/^[0-9a-fA-F]{64}$/.test(key)) {
      return { type: "hex", hex: key.toLowerCase() };
    }
    throw new Error("Invalid Nostr key format (expected npub1..., nsec1..., or 64-char hex)");
  }

  async getPublicKey(): Promise<string> {
    return WebCryptoKeystore.getPublicKey(this.privateKeyHex);
  }

  async getNpub(): Promise<string> {
    const pubkey = await this.getPublicKey();
    return WebCryptoKeystore.toNpub(pubkey);
  }

  getPrivateKey(): string {
    return this.privateKeyHex;
  }

  getNsec(): string {
    return WebCryptoKeystore.toNsec(this.privateKeyHex);
  }

  setPrivateKey(privateKeyHex: string): void {
    const trimmed = privateKeyHex.trim();
    let hex = trimmed;
    if (trimmed.startsWith("nsec1")) {
      hex = fromBech32(trimmed).hex;
    }
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new Error("Invalid private key format (expected nsec1... or 64-char hex string)");
    }
    this.privateKeyHex = hex.toLowerCase();
  }

  static serializeEvent(event: UnsignedEvent, pubkey: string): string {
    return JSON.stringify([
      0,
      pubkey,
      event.created_at,
      event.kind,
      event.tags,
      event.content
    ]);
  }

  static getEventHash(event: UnsignedEvent, pubkey: string): string {
    const serialized = WebCryptoKeystore.serializeEvent(event, pubkey);
    const hash = sha256(new TextEncoder().encode(serialized));
    return bytesToHex(hash);
  }

  async signEvent(draft: UnsignedEvent): Promise<NostrEvent> {
    const pubkey = await this.getPublicKey();
    const id = WebCryptoKeystore.getEventHash(draft, pubkey);
    const sigBytes = schnorr.sign(hexToBytes(id), hexToBytes(this.privateKeyHex));
    const sig = bytesToHex(sigBytes);

    return {
      id,
      pubkey,
      created_at: draft.created_at,
      kind: draft.kind,
      tags: draft.tags,
      content: draft.content,
      sig
    };
  }

  static verifyEvent(event: NostrEvent): boolean {
    try {
      const draft: UnsignedEvent = {
        kind: event.kind,
        created_at: event.created_at,
        tags: event.tags,
        content: event.content
      };
      const calculatedId = WebCryptoKeystore.getEventHash(draft, event.pubkey);
      if (calculatedId !== event.id) return false;

      return schnorr.verify(
        hexToBytes(event.sig),
        hexToBytes(event.id),
        hexToBytes(event.pubkey)
      );
    } catch {
      return false;
    }
  }
}
