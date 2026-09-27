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
import { NostrPluginResolver, ResolvedNostrPlugin, PublishNsiteOptions } from "../plugins/nostr-plugin-resolver.js";
import { LayoutManager } from "../layout/layout-manager.js";

export interface OmniKernelOptions {
  privateKeyHex?: string;
  bootstrapRelays?: string[];
  promptHandler?: PermissionPromptHandler;
  layoutManager?: LayoutManager;
  runtimeScript?: string;
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
  readonly layoutManager: LayoutManager;

  private sandboxes: Map<string, SandboxInstance> = new Map();
  private runtimeScript?: string;
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
    this.layoutManager = options.layoutManager || new LayoutManager();
    this.runtimeScript = options.runtimeScript;
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

    // Initialize default permissions in capabilityStore if not already explicitly configured
    if (manifest.permissions) {
      if (manifest.permissions.storage && this.capabilityStore.getGrant(manifest.id, "storage:kv") === null) {
        this.capabilityStore.setGrant(manifest.id, "storage:kv", "always");
      }
      if (manifest.permissions.intents) {
        if (this.capabilityStore.getGrant(manifest.id, "intents:dispatch") === null) {
          this.capabilityStore.setGrant(manifest.id, "intents:dispatch", "always");
        }
        if (this.capabilityStore.getGrant(manifest.id, "intents:handle") === null) {
          this.capabilityStore.setGrant(manifest.id, "intents:handle", "always");
        }
      }
      if (manifest.permissions.nostr) {
        if (this.capabilityStore.getGrant(manifest.id, "nostr:read") === null) {
          this.capabilityStore.setGrant(manifest.id, "nostr:read", "always");
        }
        if (this.capabilityStore.getGrant(manifest.id, "nostr:write") === null) {
          this.capabilityStore.setGrant(manifest.id, "nostr:write", "always");
        }
      }
    }

    this.layoutManager.registerPlugin(manifest);

    const userPubkey = await this.getUserPubkey();
    const sandbox = new SandboxInstance({
      manifest,
      scriptContent,
      runtimeScript: this.runtimeScript,
      trusted: manifest.trusted || manifest.id.startsWith("org.omni."),
      userPubkey,
      slotContainers,
      slotResolver: (pluginId: string, componentId: string, defaultSlot: string) => {
        const targetSlot = this.layoutManager.getSlotForComponent(pluginId, componentId) || defaultSlot;
        return slotContainers.get(targetSlot) || slotContainers.get(defaultSlot);
      },
      aclEngine: this.aclEngine,
      storageManager: this.storageManager,
      intentBroker: this.intentBroker,
      subscriptionCoordinator: this.subscriptionCoordinator,
      keystore: this.keystore,
      relayPool: this.relayPool,
      eventStore: this.eventStore,
      onSlotAction: this.onSlotAction
    });

    await sandbox.mount();
    this.sandboxes.set(manifest.id, sandbox);
    return sandbox;
  }

  isPluginEnabled(pluginId: string): boolean {
    return this.sandboxes.has(pluginId);
  }

  getSandbox(pluginId: string): SandboxInstance | undefined {
    return this.sandboxes.get(pluginId);
  }

  reparentPluginComponent(
    pluginId: string,
    componentId: string,
    targetSlot: string,
    targetContainer: Element
  ): boolean {
    this.layoutManager.setComponentSlot(pluginId, componentId, targetSlot);
    const sandbox = this.sandboxes.get(pluginId);
    if (sandbox) {
      return sandbox.reparentComponent(componentId, targetContainer);
    }
    return false;
  }

  disablePlugin(pluginId: string): void {
    const sandbox = this.sandboxes.get(pluginId);
    if (sandbox) {
      sandbox.destroy();
      this.sandboxes.delete(pluginId);
    }
  }

  async enablePlugin(
    manifest: OmniManifest,
    scriptContent: string,
    slotContainers: Map<string, Element>
  ): Promise<SandboxInstance> {
    this.disablePlugin(manifest.id);
    return this.registerPlugin(manifest, scriptContent, slotContainers);
  }

  setPluginPermission(pluginId: string, category: string, granted: boolean): void {
    this.capabilityStore.setGrant(pluginId, category, granted ? "always" : "deny");
  }

  getPluginPermission(pluginId: string, category: string): boolean {
    const grant = this.capabilityStore.getGrant(pluginId, category);
    return grant === "always" || grant === "session";
  }

  uninstallPlugin(pluginId: string): void {
    const sandbox = this.sandboxes.get(pluginId);
    if (sandbox) {
      sandbox.destroy();
      this.sandboxes.delete(pluginId);
    }
    this.layoutManager.unregisterPlugin(pluginId);
    this.capabilityStore.revoke(pluginId);
    this.storageManager.clear(pluginId).catch(console.error);
  }

  async getNpub(): Promise<string> {
    return this.keystore.getNpub();
  }

  getNsec(): string {
    return this.keystore.getNsec();
  }

  switchPrivateKey(keyHexOrNsec: string): void {
    this.keystore.setPrivateKey(keyHexOrNsec);
  }

  async getProfile(pubkey?: string): Promise<Record<string, any> | null> {
    const targetPubkey = pubkey || (await this.getUserPubkey());
    const events = await this.eventStore.getEvents({
      kinds: [0],
      authors: [targetPubkey],
      limit: 1
    });
    if (events.length > 0) {
      try {
        return JSON.parse(events[0].content);
      } catch {
        return null;
      }
    }
    return null;
  }

  async publishProfile(metadata: Record<string, any>): Promise<NostrEvent> {
    const pubkey = await this.getUserPubkey();
    const content = JSON.stringify(metadata);
    const draft = {
      kind: 0,
      content,
      tags: [],
      created_at: Math.floor(Date.now() / 1000)
    };

    const signed = await this.keystore.signEvent(draft);
    await this.eventStore.saveEvent(signed);
    await this.relayPool.publish(signed);
    return signed;
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

  async resolveNsitePlugin(target: string | NostrEvent): Promise<ResolvedNostrPlugin> {
    return NostrPluginResolver.resolve(target, {
      relayPool: this.relayPool,
      eventStore: this.eventStore
    });
  }

  async publishNsitePlugin(
    manifest: OmniManifest,
    scriptContent: string,
    options?: PublishNsiteOptions
  ): Promise<ResolvedNostrPlugin> {
    return NostrPluginResolver.publishPlugin(
      manifest,
      scriptContent,
      this.keystore,
      {
        relayPool: this.relayPool,
        eventStore: this.eventStore
      },
      options
    );
  }
}
