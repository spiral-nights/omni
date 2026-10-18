/**
 * Core Nostr Protocol Event (NIP-01)
 */
export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

/**
 * Unsigned Nostr Draft Event
 */
export interface UnsignedEvent {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
  pubkey?: string;
}

/**
 * Nostr Subscription Filter (NIP-01)
 */
export interface NostrFilter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  search?: string;
  [key: `#${string}`]: string[] | undefined;
}

/**
 * NIP-04 Encryption/Decryption Interface
 */
export interface Nip04Interface {
  encrypt(pubkey: string, plaintext: string): Promise<string>;
  decrypt(pubkey: string, ciphertext: string): Promise<string>;
}

/**
 * NIP-44 Encryption/Decryption Interface
 */
export interface Nip44Interface {
  encrypt(pubkey: string, plaintext: string): Promise<string>;
  decrypt(pubkey: string, ciphertext: string): Promise<string>;
}

/**
 * Standard NIP-07 Browser Extension Signer Interface (window.nostr)
 */
export interface Nip07Signer {
  getPublicKey(): Promise<string>;
  signEvent(event: UnsignedEvent): Promise<NostrEvent>;
  getRelays?(): Promise<Record<string, { read: boolean; write: boolean }>>;
  nip04?: Nip04Interface;
  nip44?: Nip44Interface;
}

/**
 * NIP-65 Relay List Metadata Policy (kind: 10002)
 */
export interface Nip65Relay {
  url: string;
  read: boolean;
  write: boolean;
}
