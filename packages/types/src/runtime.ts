import { NostrEvent, NostrFilter, Nip07Signer } from "./nostr.js";

/**
 * Metadata received alongside subscribed Nostr events
 */
export interface EventMetadata {
  fromCache: boolean;
  relay?: string;
}

/**
 * Subscription Subscription Controller returned by omni.subscribe
 */
export interface OmniSubscription {
  id: string;
  unsubscribe(): void;
}

/**
 * Options for omni.subscribe
 */
export interface SubscribeOptions {
  kinds?: number[];
  authors?: string[];
  ids?: string[];
  filters?: NostrFilter[];
  limit?: number;
  onEvent: (event: NostrEvent, metadata: EventMetadata) => void;
  onEose?: () => void;
}

/**
 * Scoped Local Storage API for plugins
 */
export interface OmniStorageApi {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Intent Engine API for plugins
 */
export interface OmniIntentsApi {
  dispatch<T = unknown, R = unknown>(action: string, data?: T): Promise<R>;
  handle<T = unknown, R = unknown>(action: string, handler: (data: T) => Promise<R> | R): void;
  emit<T = unknown>(event: string, data?: T): void;
  on<T = unknown>(event: string, listener: (data: T) => void): () => void;
}

/**
 * UI Slot Controller API
 */
export interface OmniUiApi {
  toggleSlot(slot: string): void;
  openSlot(slot: string): void;
  closeSlot(slot: string): void;
}

/**
 * Session metadata passed to the plugin
 */
export interface OmniSessionInfo {
  pluginId: string;
  pubkey: string;
  theme: {
    mode: "light" | "dark";
    colors: Record<string, string>;
  };
  slots: string[];
}

/**
 * Remote DOM Component Context
 */
export interface ComponentContext<P = Record<string, unknown>> {
  root: any; // RemoteRoot
  props: P;
}

export type ComponentRenderFn<P = Record<string, unknown>> = (
  ctx: ComponentContext<P>
) => void | Promise<void>;

export interface OmniNostrApi {
  getPublicKey(): Promise<string>;
  signEvent(event: any): Promise<NostrEvent>;
  publish(event: any): Promise<NostrEvent & { relays: string[] }>;
  subscribe(filters: NostrFilter[], onEvent: (event: NostrEvent, meta: EventMetadata) => void, onEose?: () => void): OmniSubscription;
}

export interface OmniRelaysApi {
  list(): Promise<Array<{ url: string; status: "connected" | "connecting" | "disconnected" }>>;
  add(url: string): Promise<{ success: boolean; url: string }>;
  remove(url: string): Promise<{ success: boolean; url: string }>;
}

export interface OmniProfileApi {
  get(pubkey?: string): Promise<Record<string, any> | null>;
  publish(metadata: Record<string, any>): Promise<NostrEvent>;
}

export interface OmniAuthApi {
  getNpub(): Promise<string>;
  getNsec(): Promise<string>;
  switchKey(key: string): Promise<{ pubkey: string; npub: string }>;
}

/**
 * Injected window.omni API Interface
 */
export interface OmniHostApi {
  session: OmniSessionInfo;
  ready(): Promise<void>;
  registerComponent<P = Record<string, unknown>>(
    componentId: string,
    render: ComponentRenderFn<P>
  ): void;
  subscribe(options: SubscribeOptions): OmniSubscription;
  nostr: OmniNostrApi;
  relays: OmniRelaysApi;
  profile: OmniProfileApi;
  auth: OmniAuthApi;
  storage: OmniStorageApi;
  intents: OmniIntentsApi;
  ui: OmniUiApi;
}

declare global {
  const omni: OmniHostApi;
  const nostr: Nip07Signer;
  interface Window {
    nostr?: Nip07Signer;
    omni?: OmniHostApi;
  }
}
