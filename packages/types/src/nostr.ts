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

/**
 * Options for window.nostr.fetch
 */
export interface NostrFetchOptions {
  timeoutMs?: number;
  localOnly?: boolean;
  relays?: string[];
}

/**
 * Result returned by window.nostr.publish
 */
export interface NostrPublishResult {
  id: string;
  pubkey: string;
  sig: string;
  relays: string[];
}

/**
 * Subscription handle returned by window.nostr.subscribe
 */
export interface NostrSubscriptionHandle {
  id: string;
  unsubscribe(): void;
}

/**
 * Specification for addressable/replaceable document via window.nostr.doc
 */
export interface NostrDocSpec {
  /** Event kind: defaults to 30078 (NIP-78 app-specific data) */
  kind?: number;
  /** Parameterized identifier tag ["d", "<identifier>"] (NIP-33) */
  d?: string;
  /** When true, content is encrypted using NIP-44 (with NIP-04 fallback) to self */
  encrypted?: boolean;
  /** Specific encryption algorithm: "nip44" (default) or "nip04" */
  encryptionType?: "nip44" | "nip04";
}

/**
 * Live addressable/replaceable document interface returned by window.nostr.doc
 */
export interface NostrDoc<T = any> {
  readonly kind: number;
  readonly d?: string;
  readonly data: T | null;
  readonly event: NostrEvent | null;
  /** Saves new data to document, encrypts if configured, updates 0ms store and relays */
  set(data: T, extraTags?: string[][]): Promise<NostrEvent>;
  /** Subscribes to live multi-device updates */
  onUpdate(callback: (data: T, event: NostrEvent) => void): () => void;
  /** Reloads document from 0ms store and connected relays */
  reload(): Promise<T | null>;
}

/**
 * Extended NIP-07 Signer with High-Level Convenience Methods (Omni Runtime)
 */
export interface OmniNostrClient extends Nip07Signer {
  /**
   * One-shot fetch returning events matching filters, combining 0ms local store and relays until EOSE or timeout.
   */
  fetch(filters: NostrFilter | NostrFilter[], options?: NostrFetchOptions): Promise<NostrEvent[]>;

  /**
   * Real-time subscription streaming matching events from 0ms store and live relays.
   */
  subscribe(
    filters: NostrFilter | NostrFilter[],
    onEvent: (event: NostrEvent, metadata?: { fromCache?: boolean; relay?: string }) => void,
    onEose?: () => void
  ): NostrSubscriptionHandle;

  /**
   * One-call publishing: fills defaults, signs via keystore if unsigned, saves to 0ms store, and broadcasts to relays.
   */
  publish(event: Partial<UnsignedEvent> & { kind: number; content: string }): Promise<NostrPublishResult>;

  /**
   * High-level addressable/replaceable document manager (Kind 30078, Kind 0, Kind 10002, Kind 30000, Kind 30023, etc.).
   */
  doc<T = any>(dTagOrSpec: string | NostrDocSpec, options?: { encrypted?: boolean }): Promise<NostrDoc<T>>;
}
