import { OmniManifest, NostrEvent, NostrFilter, EventMetadata } from "@omni/types";
import { WebCryptoKeystore } from "../crypto/webcrypto-keystore.js";
import { LocalEventStore } from "../nostr/event-store.js";
import { RelayPool } from "../nostr/relay-pool.js";
import { SubscriptionCoordinator } from "../nostr/subscription-coordinator.js";
import { CapabilityStore } from "../acl/capability-store.js";
import { AclEngine, PermissionPromptHandler } from "../acl/acl-engine.js";
import { PluginStorageManager } from "../storage/plugin-storage-manager.js";
import { IntentBroker } from "../intents/intent-broker.js";
import { SandboxInstance } from "../sandbox/sandbox-manager.js";

export interface OmniKernelOptions {
  privateKeyHex?: string;
  bootstrapRelays?: string[];
  promptHandler?: PermissionPromptHandler;
  onSlotAction?: (action: "toggle" | "open" | "close", slot: string) => void;
}

export class OmniKernel {
  readonly keystore: WebCryptoKeystore;
  readonly eventStore: LocalEventStore;
  readonly relayPool: RelayPool;
  readonly subscriptionCoordinator: SubscriptionCoordinator;
  readonly capabilityStore: CapabilityStore;
  readonly aclEngine: AclEngine;
  readonly storageManager: PluginStorageManager;
  readonly intentBroker: IntentBroker;

  private sandboxes: Map<string, SandboxInstance> = new Map();
  private onSlotAction?: (action: "toggle" | "open" | "close", slot: string) => void;

  constructor(options: OmniKernelOptions = {}) {
    this.keystore = new WebCryptoKeystore(options.privateKeyHex);
    this.eventStore = new LocalEventStore();
    this.relayPool = new RelayPool({ bootstrapRelays: options.bootstrapRelays });
    this.subscriptionCoordinator = new SubscriptionCoordinator(this.eventStore, this.relayPool);
    this.capabilityStore = new CapabilityStore();
    this.aclEngine = new AclEngine(this.capabilityStore, options.promptHandler);
    this.storageManager = new PluginStorageManager();
    this.intentBroker = new IntentBroker();
    this.onSlotAction = options.onSlotAction;
  }

  async boot(): Promise<void> {
    await this.eventStore.init();
    await this.storageManager.init();
    await this.relayPool.connect();
  }

  async getUserPubkey(): Promise<string> {
    return this.keystore.getPublicKey();
  }

  async registerPlugin(
    manifest: OmniManifest,
    scriptContent: string,
    slotContainers: Map<string, Element>
  ): Promise<SandboxInstance> {
    this.aclEngine.registerManifest(manifest);

    const userPubkey = await this.getUserPubkey();
    const sandbox = new SandboxInstance({
      manifest,
      scriptContent,
      userPubkey,
      slotContainers,
      aclEngine: this.aclEngine,
      storageManager: this.storageManager,
      intentBroker: this.intentBroker,
      subscriptionCoordinator: this.subscriptionCoordinator,
      keystore: this.keystore,
      relayPool: this.relayPool,
      onSlotAction: this.onSlotAction
    });

    await sandbox.mount();
    this.sandboxes.set(manifest.id, sandbox);
    return sandbox;
  }

  uninstallPlugin(pluginId: string): void {
    const sandbox = this.sandboxes.get(pluginId);
    if (sandbox) {
      sandbox.destroy();
      this.sandboxes.delete(pluginId);
    }
    this.capabilityStore.revoke(pluginId);
    this.storageManager.clear(pluginId).catch(console.error);
  }

  async publishNote(content: string, tags: string[][] = []): Promise<NostrEvent> {
    const pubkey = await this.getUserPubkey();
    const draft = {
      kind: 1,
      content,
      tags: [...tags, ["client", "omni"]],
      created_at: Math.floor(Date.now() / 1000)
    };

    const signed = await this.keystore.signEvent(draft);
    await this.eventStore.saveEvent(signed);
    await this.relayPool.publish(signed);
    return signed;
  }

  async subscribeTimeline(
    subId: string,
    filters: NostrFilter[],
    onEvent: (event: NostrEvent, metadata: EventMetadata) => void,
    onEose?: () => void
  ): Promise<() => void> {
    return this.subscriptionCoordinator.subscribe(subId, filters, onEvent, onEose);
  }
}
