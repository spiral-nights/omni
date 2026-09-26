import { schnorr } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes } from "@noble/curves/abstract/utils";
import { NostrEvent, UnsignedEvent } from "@omni/types";

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

  async getPublicKey(): Promise<string> {
    return WebCryptoKeystore.getPublicKey(this.privateKeyHex);
  }

  getPrivateKey(): string {
    return this.privateKeyHex;
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
