import { schnorr, secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes, toBech32, fromBech32, encodeNaddr as canonicalEncodeNaddr, decodeNaddr as canonicalDecodeNaddr } from "./bech32.js";
export { bytesToHex, hexToBytes, toBech32, fromBech32 };
import { NostrEvent, UnsignedEvent } from "@omni/types";

export class WebCryptoKeystore {
  private privateKeyHex: string;
  private keyChangeListeners: Set<(privkeyHex: string) => void> = new Set();

  constructor(privateKeyHex?: string) {
    if (privateKeyHex) {
      this.privateKeyHex = "";
      this.setPrivateKey(privateKeyHex);
    } else {
      this.privateKeyHex = WebCryptoKeystore.generatePrivateKey();
    }
  }

  onKeyChange(listener: (privkeyHex: string) => void): () => void {
    this.keyChangeListeners.add(listener);
    return () => this.keyChangeListeners.delete(listener);
  }

  private notifyKeyChange(): void {
    for (const listener of this.keyChangeListeners) {
      try {
        listener(this.privateKeyHex);
      } catch (err) {
        console.warn("Error in key change listener:", err);
      }
    }
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

  static toNaddr(data: { identifier: string; pubkey: string; kind: number; relays?: string[] }): string {
    return canonicalEncodeNaddr(data);
  }

  static decodeNaddr(naddrStr: string): { identifier: string; pubkey: string; kind: number; relays: string[] } {
    const res = canonicalDecodeNaddr(naddrStr);
    if (!res) throw new Error("Expected naddr bech32 string");
    return {
      identifier: res.identifier || "",
      pubkey: res.pubkey || "",
      kind: res.kind || 0,
      relays: res.relays || []
    };
  }

  static decodeKey(key: string): { type: "npub" | "nsec" | "hex" | "naddr"; hex?: string; data?: any } {
    key = key.trim();
    if (key.startsWith("naddr1")) {
      const data = WebCryptoKeystore.decodeNaddr(key);
      return { type: "naddr", data, hex: data.pubkey };
    }
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
    throw new Error("Invalid Nostr identifier (expected naddr1..., npub1..., nsec1..., or 64-char hex)");
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
    this.notifyKeyChange();
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

  async nip04Encrypt(recipientPubkey: string, plaintext: string): Promise<string> {
    const pubHex = recipientPubkey.length === 64 ? "02" + recipientPubkey : recipientPubkey;
    const shared = secp256k1.getSharedSecret(this.privateKeyHex, pubHex);
    const sharedX = shared.slice(1, 33);
    const key = await crypto.subtle.importKey("raw", sharedX, { name: "AES-CBC" }, false, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const encoded = new TextEncoder().encode(plaintext);
    const encrypted = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, encoded);
    const b64Encrypted = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
    const b64Iv = btoa(String.fromCharCode(...iv));
    return `${b64Encrypted}?iv=${b64Iv}`;
  }

  async nip04Decrypt(senderPubkey: string, ciphertext: string): Promise<string> {
    const parts = ciphertext.split("?iv=");
    if (parts.length !== 2) throw new Error("Invalid NIP-04 ciphertext format (missing ?iv=)");
    const [b64Encrypted, b64Iv] = parts;
    const pubHex = senderPubkey.length === 64 ? "02" + senderPubkey : senderPubkey;
    const shared = secp256k1.getSharedSecret(this.privateKeyHex, pubHex);
    const sharedX = shared.slice(1, 33);
    const key = await crypto.subtle.importKey("raw", sharedX, { name: "AES-CBC" }, false, ["decrypt"]);
    const iv = Uint8Array.from(atob(b64Iv), c => c.charCodeAt(0));
    const encrypted = Uint8Array.from(atob(b64Encrypted), c => c.charCodeAt(0));
    const decrypted = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, encrypted);
    return new TextDecoder().decode(decrypted);
  }

  async nip44Encrypt(_recipientPubkey: string, _plaintext: string): Promise<string> {
    throw new Error("NIP-44 encryption will be available in Phase 2");
  }

  async nip44Decrypt(_senderPubkey: string, _ciphertext: string): Promise<string> {
    throw new Error("NIP-44 decryption will be available in Phase 2");
  }
}

