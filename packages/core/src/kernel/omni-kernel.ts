import { OmniManifest, NostrEvent, NostrFilter, EventMetadata, OmniWorkspaceState, OMNI_WORKSPACE_D_TAG, Nip65Relay } from "@omni/types";
import { WebCryptoKeystore } from "../crypto/webcrypto-keystore.js";
import { LocalEventStore } from "../nostr/event-store.js";
import { RelayPool, parseNip65Relays, buildNip65Tags } from "../nostr/relay-pool.js";
import { SubscriptionCoordinator } from "../nostr/subscription-coordinator.js";
import { CapabilityStore } from "../acl/capability-store.js";
import { AclEngine, PermissionPromptHandler } from "../acl/acl-engine.js";
import { PluginStorageManager } from "../storage/plugin-storage-manager.js";
import { IntentBroker } from "../intents/intent-broker.js";
import { SandboxInstance } from "../sandbox/sandbox-manager.js";
import { NostrPluginResolver, ResolvedNostrPlugin, PublishNsiteOptions } from "../plugins/nostr-plugin-resolver.js";
import { LayoutManager } from "../layout/layout-manager.js";
import { AppHandler, detectUriScheme } from "../intents/app-handler.js";

export interface OmniKernelOptions {
  privateKeyHex?: string;
  bootstrapRelays?: string[];
  promptHandler?: PermissionPromptHandler;
  layoutManager?: LayoutManager;
  runtimeScript?: string;
  onSlotAction?: (action: "toggle" | "open" | "close", slot: string) => void;
  onHandleUri?: (uri: string, sourcePluginId?: string) => Promise<any>;
  onHandleShare?: (payload: { title?: string; text?: string; url?: string }, sourcePluginId?: string) => Promise<any>;
  slotResolver?: (pluginId: string, componentId: string, slot: string) => Element | undefined;
  eventStoreName?: string;
  storageName?: string;
  maxFeedNotes?: number;
  theme?: any;
  useShadowDom?: boolean;
  persistRelays?: boolean;
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
  public theme?: any;
  public readonly useShadowDom: boolean;

  private sandboxes: Map<string, SandboxInstance> = new Map();
  private settingsSandboxes: Map<string, SandboxInstance> = new Map();
  private pendingRegistrations: Map<string, Promise<SandboxInstance>> = new Map();
  private pendingNotifications: Map<string, Array<{ method: string; params?: any }>> = new Map();
  private runtimeScript?: string;
  private slotResolver?: (pluginId: string, componentId: string, slot: string) => Element | undefined;
  private onSlotAction?: (action: "toggle" | "open" | "close", slot: string) => void;
  private onHandleUri?: (uri: string, sourcePluginId?: string) => Promise<any>;
  private onHandleShare?: (payload: { title?: string; text?: string; url?: string }, sourcePluginId?: string) => Promise<any>;
  private defaultHandlersMemory: Record<string, string> = {};

  constructor(options: OmniKernelOptions = {}) {
    this.theme = options.theme;
    this.useShadowDom = Boolean(options.useShadowDom);
    this.keystore = new WebCryptoKeystore(options.privateKeyHex);
    this.eventStore = new LocalEventStore({
      dbName: options.eventStoreName,
      maxFeedNotes: options.maxFeedNotes ?? 100
    });
    this.relayPool = new RelayPool({
      bootstrapRelays: options.bootstrapRelays,
      persistRelays: options.persistRelays
    });
    this.capabilityStore = new CapabilityStore();
    this.aclEngine = new AclEngine(this.capabilityStore, options.promptHandler);
    this.subscriptionCoordinator = new SubscriptionCoordinator(this.eventStore, this.relayPool, this.aclEngine);
    this.storageManager = new PluginStorageManager(options.storageName);
    this.intentBroker = new IntentBroker();
    this.layoutManager = options.layoutManager || new LayoutManager();
    this.runtimeScript = options.runtimeScript;
    this.slotResolver = options.slotResolver;
    this.onSlotAction = options.onSlotAction;
    this.onHandleUri = options.onHandleUri;
    this.onHandleShare = options.onHandleShare;
  }

  onKeyChange(listener: (privkeyHex: string) => void): () => void {
    return this.keystore.onKeyChange(listener);
  }

  async boot(): Promise<void> {
    await this.eventStore.init();
    try {
      const pubkey = await this.getUserPubkey();
      this.eventStore.setUserPubkey(pubkey);
      this.fetchRemoteRelayList(pubkey).catch(() => {});
    } catch {}
    this.keystore.onKeyChange(async () => {
      try {
        const pubkey = await this.getUserPubkey();
        this.eventStore.setUserPubkey(pubkey);
        this.fetchRemoteRelayList(pubkey).catch(() => {});
      } catch {}
    });
    await this.storageManager.init();
    this.relayPool.connect().catch(() => {});
  }

  async getUserPubkey(): Promise<string> {
    return this.keystore.getPublicKey();
  }

  async registerPlugin(
    manifest: OmniManifest,
    scriptContent: string,
    slotContainers: Map<string, Element>,
    options?: { route?: string; viewId?: string; instanceId?: string; targetSlot?: string; relays?: string[] }
  ): Promise<SandboxInstance> {
    const instanceKey = options?.instanceId || manifest.id;
    if (this.sandboxes.has(instanceKey)) {
      return this.sandboxes.get(instanceKey)!;
    }
    if (this.pendingRegistrations.has(instanceKey)) {
      return this.pendingRegistrations.get(instanceKey)!;
    }

    const registrationPromise = (async () => {
      try {
        this.aclEngine.registerManifest(manifest);

        // Initialize default permissions in capabilityStore if not already explicitly configured
        if (manifest.permissions) {
          if (manifest.permissions.storage && this.capabilityStore.getGrant(manifest.id, "storage:kv") === null) {
            this.capabilityStore.setGrant(manifest.id, "storage:kv", "always");
          }
          const isTrusted = manifest.trusted === true || manifest.id.startsWith("org.omni.");
          if (manifest.permissions.intents || isTrusted) {
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
            if (manifest.permissions.nostr.write?.kinds && Array.isArray(manifest.permissions.nostr.write.kinds)) {
              for (const k of manifest.permissions.nostr.write.kinds) {
                if (this.capabilityStore.getGrant(manifest.id, "nostr:write", String(k), false) === null) {
                  this.capabilityStore.setGrant(manifest.id, "nostr:write", "always", String(k));
                }
              }
              if (manifest.permissions.nostr.write.allKinds && this.capabilityStore.getGrant(manifest.id, "nostr:write", "*") === null) {
                this.capabilityStore.setGrant(manifest.id, "nostr:write", "always", "*");
              }
            } else if (this.capabilityStore.getGrant(manifest.id, "nostr:write") === null) {
              this.capabilityStore.setGrant(manifest.id, "nostr:write", "always");
            }
            if (this.capabilityStore.getGrant(manifest.id, "nostr:sign") === null) {
              this.capabilityStore.setGrant(manifest.id, "nostr:sign", "always");
            }
          }
          if (
            (manifest.id === "org.omni.plugin.relays" || manifest.permissions?.relays?.manage) &&
            (manifest.trusted || manifest.id.startsWith("org.omni."))
          ) {
            if (this.capabilityStore.getGrant(manifest.id, "relays:manage") === null) {
              this.capabilityStore.setGrant(manifest.id, "relays:manage", "always");
            }
          }
        } else if (manifest.id === "org.omni.plugin.relays" || manifest.trusted || manifest.id.startsWith("org.omni.")) {
          if (this.capabilityStore.getGrant(manifest.id, "relays:manage") === null && manifest.id === "org.omni.plugin.relays") {
            this.capabilityStore.setGrant(manifest.id, "relays:manage", "always");
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
          theme: this.theme,
          route: options?.route,
          viewId: options?.viewId,
          instanceId: options?.instanceId,
          allowedRelays: options?.relays,
          slotResolver: (pluginId: string, componentId: string, defaultSlot: string) => {
            const targetSlot = options?.targetSlot || this.layoutManager.getSlotForComponent(pluginId, componentId) || defaultSlot;
            if (this.slotResolver) {
              const custom = this.slotResolver(pluginId, componentId, targetSlot);
              if (custom) return custom;
            }
            return slotContainers.get(targetSlot) || slotContainers.get(defaultSlot);
          },
          aclEngine: this.aclEngine,
          storageManager: this.storageManager,
          intentBroker: this.intentBroker,
          subscriptionCoordinator: this.subscriptionCoordinator,
          keystore: this.keystore,
          relayPool: this.relayPool,
          eventStore: this.eventStore,
          onSlotAction: this.onSlotAction,
          onHandleUri: (uri, srcId) => this.handleUri(uri, srcId),
          onHandleShare: (payload, srcId) => this.handleShare(payload, srcId),
          useShadowDom: this.useShadowDom
        });

        await sandbox.mount();
        this.sandboxes.set(instanceKey, sandbox);

        // Drain any pending buffered notifications for this plugin or instance
        const pendingForPlugin = this.pendingNotifications.get(manifest.id) || [];
        const pendingForInstance = this.pendingNotifications.get(instanceKey) || [];
        const allPending = [...pendingForPlugin, ...pendingForInstance];
        this.pendingNotifications.delete(manifest.id);
        this.pendingNotifications.delete(instanceKey);

        for (const notif of allPending) {
          sandbox.postRpcNotification(notif.method, notif.params);
        }

        return sandbox;
      } finally {
        this.pendingRegistrations.delete(instanceKey);
      }
    })();

    this.pendingRegistrations.set(instanceKey, registrationPromise);
    return registrationPromise;
  }

  isPluginEnabled(pluginId: string): boolean {
    for (const key of this.sandboxes.keys()) {
      if (key === pluginId || key.startsWith(`${pluginId}::`)) {
        return true;
      }
    }
    return false;
  }

  getSandbox(pluginId: string): SandboxInstance | undefined {
    if (this.sandboxes.has(pluginId)) {
      return this.sandboxes.get(pluginId);
    }
    for (const [key, sandbox] of this.sandboxes.entries()) {
      if (key.startsWith(`${pluginId}::`)) {
        return sandbox;
      }
    }
    return undefined;
  }

  notifyPlugin(pluginId: string, method: string, params?: any): void {
    let notified = false;
    for (const [key, sandbox] of this.sandboxes.entries()) {
      if (key === pluginId || key.startsWith(`${pluginId}::`)) {
        sandbox.postRpcNotification(method, params);
        notified = true;
      }
    }
    if (!notified) {
      const sandbox = this.getSandbox(pluginId);
      if (sandbox) {
        sandbox.postRpcNotification(method, params);
        notified = true;
      }
    }
    if (!notified) {
      if (!this.pendingNotifications.has(pluginId)) {
        this.pendingNotifications.set(pluginId, []);
      }
      this.pendingNotifications.get(pluginId)!.push({ method, params });
    }
  }

  reparentPluginComponent(
    pluginId: string,
    componentId: string,
    targetSlot: string,
    targetContainer: Element
  ): boolean {
    this.layoutManager.setComponentSlot(pluginId, componentId, targetSlot);
    const sandbox = this.getSandbox(pluginId);
    if (sandbox) {
      return sandbox.reparentComponent(componentId, targetContainer);
    }
    return false;
  }

  /**
   * Moves the first live (populated) mirrored component container of any sandbox
   * belonging to pluginId into targetContainer. Used by shells to recover a live
   * UI surface when a sandbox exists but its mirror is not in the visible slot.
   */
  reparentLiveComponent(pluginId: string, targetContainer: Element): boolean {
    for (const [key, sandbox] of this.sandboxes.entries()) {
      if (key === pluginId || key.startsWith(`${pluginId}::`)) {
        const container = sandbox.getFirstPopulatedComponentContainer();
        if (container) {
          targetContainer.appendChild(container);
          return true;
        }
      }
    }
    return false;
  }

  disablePlugin(pluginId: string): void {
    for (const [key, sandbox] of Array.from(this.sandboxes.entries())) {
      if (key === pluginId || key.startsWith(`${pluginId}::`)) {
        sandbox.destroy();
        this.sandboxes.delete(key);
      }
    }
    for (const key of Array.from(this.pendingRegistrations.keys())) {
      if (key === pluginId || key.startsWith(`${pluginId}::`)) {
        this.pendingRegistrations.delete(key);
      }
    }
    this.pendingNotifications.delete(pluginId);
    this.destroyPluginSettings(pluginId);
  }

  async enablePlugin(
    manifest: OmniManifest,
    scriptContent: string,
    slotContainers: Map<string, Element>,
    options?: { route?: string; viewId?: string; instanceId?: string; targetSlot?: string; relays?: string[] }
  ): Promise<SandboxInstance> {
    this.disablePlugin(manifest.id);
    return this.registerPlugin(manifest, scriptContent, slotContainers, options);
  }

  async mountPluginSettings(
    pluginId: string,
    manifest: OmniManifest,
    scriptContent: string,
    container: Element,
    route: string = "?view=settings",
    relays?: string[]
  ): Promise<SandboxInstance> {
    this.destroyPluginSettings(pluginId);

    const slotContainers = new Map<string, Element>();
    slotContainers.set("main", container);
    slotContainers.set("settings", container);
    slotContainers.set("sidebar", container);
    slotContainers.set("dock", container);
    slotContainers.set("header-actions", container);
    slotContainers.set("header-status", container);
    if (manifest.components) {
      for (const comp of manifest.components) {
        if (comp.slot) slotContainers.set(comp.slot, container);
      }
    }

    const userPubkey = await this.getUserPubkey();
    const sandbox = new SandboxInstance({
      manifest,
      scriptContent,
      runtimeScript: this.runtimeScript,
      trusted: manifest.trusted || manifest.id.startsWith("org.omni."),
      userPubkey,
      slotContainers,
      theme: this.theme,
      slotResolver: () => container,
      route,
      viewId: "settings",
      allowedRelays: relays,
      aclEngine: this.aclEngine,
      storageManager: this.storageManager,
      intentBroker: this.intentBroker,
      subscriptionCoordinator: this.subscriptionCoordinator,
      keystore: this.keystore,
      relayPool: this.relayPool,
      eventStore: this.eventStore,
      onSlotAction: this.onSlotAction,
      onHandleUri: (uri, srcId) => this.handleUri(uri, srcId),
      onHandleShare: (payload, srcId) => this.handleShare(payload, srcId),
      useShadowDom: this.useShadowDom
    });

    await sandbox.mount();
    this.settingsSandboxes.set(pluginId, sandbox);
    return sandbox;
  }

  destroyPluginSettings(pluginId: string): void {
    const sandbox = this.settingsSandboxes.get(pluginId);
    if (sandbox) {
      sandbox.destroy();
      this.settingsSandboxes.delete(pluginId);
    }
  }

  getPluginSettingsSandbox(pluginId: string): SandboxInstance | undefined {
    return this.settingsSandboxes.get(pluginId);
  }

  setPluginPermission(pluginId: string, category: string, granted: boolean, scope?: string): void {
    this.capabilityStore.setGrant(pluginId, category, granted ? "always" : "deny", scope);
  }

  getPluginPermission(pluginId: string, category: string, scope?: string): boolean {
    const grant = this.capabilityStore.getGrant(pluginId, category, scope);
    return grant === "always" || grant === "session";
  }

  getPluginKindPermissions(pluginId: string): { allKinds: boolean; kinds: number[] } {
    const allGrant = this.capabilityStore.getGrant(pluginId, "nostr:write", "*");
    const allKinds = allGrant === "always" || allGrant === "session";
    const allGrants = this.capabilityStore.getAllGrants(pluginId);
    const kinds: number[] = [];
    for (const [key, grant] of Object.entries(allGrants)) {
      if (key.startsWith("nostr:write:") && (grant === "always" || grant === "session")) {
        const scope = key.split(":")[2];
        if (scope && scope !== "*") {
          const num = parseInt(scope, 10);
          if (!isNaN(num)) kinds.push(num);
        }
      }
    }
    return { allKinds, kinds };
  }

  setPluginKindPermission(pluginId: string, kind: number, granted: boolean): void {
    this.capabilityStore.setGrant(pluginId, "nostr:write", granted ? "always" : "deny", String(kind));
  }

  uninstallPlugin(pluginId: string): void {
    this.disablePlugin(pluginId);
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
    this.getUserPubkey().then((pubkey) => {
      this.eventStore.setUserPubkey(pubkey);
    }).catch(() => {});
  }

  async getProfile(pubkey?: string, fetchIfMissing = false): Promise<Record<string, any> | null> {
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
    if (fetchIfMissing) {
      const res = await this.fetchRemoteProfile(targetPubkey);
      return res?.metadata || null;
    }
    return null;
  }

  async fetchRemoteProfile(
    pubkey?: string,
    timeoutMs = 3500
  ): Promise<{ metadata: Record<string, any>; event: NostrEvent } | null> {
    const targetPubkey = pubkey || (await this.getUserPubkey());
    const filter: NostrFilter = {
      kinds: [0],
      authors: [targetPubkey],
      limit: 1
    };

    return new Promise((resolve) => {
      let resolved = false;
      let latestEvent: NostrEvent | null = null;
      let debounceTimer: any = null;
      const eosedRelays = new Set<string>();

      const finish = async () => {
        if (resolved) return;
        resolved = true;
        if (debounceTimer) clearTimeout(debounceTimer);
        clearTimeout(timer);
        unsubscribe();
        if (latestEvent) {
          await this.eventStore.saveEvent(latestEvent);
          try {
            const parsed = JSON.parse(latestEvent.content);
            resolve({ metadata: parsed, event: latestEvent });
          } catch {
            resolve({ metadata: {}, event: latestEvent });
          }
        } else {
          const local = await this.getProfile(targetPubkey, false);
          if (local) {
            resolve({ metadata: local, event: null as any });
          } else {
            resolve(null);
          }
        }
      };

      const timer = setTimeout(finish, timeoutMs);

      const subId = `profile-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const unsubscribe = this.relayPool.subscribe(
        subId,
        [filter],
        (ev) => {
          if (!latestEvent || ev.created_at > latestEvent.created_at) {
            latestEvent = ev;
          }
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            finish();
          }, 300);
        },
        (relayUrl) => {
          if (relayUrl) eosedRelays.add(relayUrl);
          const connectedCount = this.relayPool.getConnectedRelayCount();
          const targetCount = connectedCount > 0 ? connectedCount : 1;
          if (eosedRelays.size >= targetCount) {
            if (debounceTimer) clearTimeout(debounceTimer);
            clearTimeout(timer);
            finish();
          }
        }
      );
    });
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

  // --- NIP-65: Relay List Metadata (kind 10002) & Outbox Model ---

  async publishRelayList(relays: Nip65Relay[]): Promise<NostrEvent> {
    const pubkey = await this.getUserPubkey();
    const draft = {
      kind: 10002,
      content: "",
      tags: buildNip65Tags(relays),
      created_at: Math.floor(Date.now() / 1000)
    };
    const signed = await this.keystore.signEvent(draft);
    await this.eventStore.saveEvent(signed);
    this.relayPool.setUserRelays(relays);
    await this.relayPool.publish(signed);
    return signed;
  }

  async getRelayList(pubkey?: string): Promise<Nip65Relay[] | null> {
    const targetPubkey = pubkey || (await this.getUserPubkey());
    const events = await this.eventStore.getEvents({
      kinds: [10002],
      authors: [targetPubkey],
      limit: 1
    });
    if (events.length > 0) {
      return parseNip65Relays(events[0]);
    }
    return null;
  }

  async fetchRemoteRelayList(
    pubkey?: string,
    timeoutMs = 3500
  ): Promise<{ relays: Nip65Relay[]; event: NostrEvent } | null> {
    const targetPubkey = pubkey || (await this.getUserPubkey());
    const filter: NostrFilter = {
      kinds: [10002],
      authors: [targetPubkey],
      limit: 1
    };

    return new Promise((resolve) => {
      let resolved = false;
      let latestEvent: NostrEvent | null = null;
      let debounceTimer: any = null;
      const eosedRelays = new Set<string>();

      const finish = async () => {
        if (resolved) return;
        resolved = true;
        if (debounceTimer) clearTimeout(debounceTimer);
        clearTimeout(timer);
        unsubscribe();
        if (latestEvent) {
          await this.eventStore.saveEvent(latestEvent);
          const parsed = parseNip65Relays(latestEvent);
          const isUser = (await this.getUserPubkey()) === targetPubkey;
          if (isUser) {
            this.relayPool.setUserRelays(parsed);
          } else {
            this.relayPool.setAuthorRelays(targetPubkey, parsed);
          }
          resolve({ relays: parsed, event: latestEvent });
        } else {
          const local = await this.getRelayList(targetPubkey);
          if (local) {
            resolve({ relays: local, event: null as any });
          } else {
            resolve(null);
          }
        }
      };

      const timer = setTimeout(finish, timeoutMs);
      const subId = `nip65-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const unsubscribe = this.relayPool.subscribe(
        subId,
        [filter],
        (ev) => {
          if (!latestEvent || ev.created_at > latestEvent.created_at) {
            latestEvent = ev;
          }
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            finish();
          }, 300);
        },
        (relayUrl) => {
          if (relayUrl) eosedRelays.add(relayUrl);
          const connectedCount = this.relayPool.getConnectedRelayCount();
          const targetCount = connectedCount > 0 ? connectedCount : 1;
          if (eosedRelays.size >= targetCount) {
            if (debounceTimer) clearTimeout(debounceTimer);
            clearTimeout(timer);
            finish();
          }
        }
      );
    });
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

  // --- NIP-78: Arbitrary Custom App Data & Workspace Sync ---

  async publishAppData(identifier: string, data: any, extraTags: string[][] = []): Promise<NostrEvent> {
    const pubkey = await this.getUserPubkey();
    const content = typeof data === "string" ? data : JSON.stringify(data);
    const draft = {
      kind: 30078,
      content,
      tags: [["d", identifier], ["client", "omni"], ...extraTags],
      created_at: Math.floor(Date.now() / 1000)
    };

    const signed = await this.keystore.signEvent(draft);
    await this.eventStore.saveEvent(signed);
    await this.relayPool.publish(signed);
    return signed;
  }

  async getAppData<T = any>(identifier: string, pubkey?: string): Promise<{ data: T; event: NostrEvent } | null> {
    const targetPubkey = pubkey || (await this.getUserPubkey());
    const events = await this.eventStore.getEvents({
      kinds: [30078],
      authors: [targetPubkey],
      "#d": [identifier],
      limit: 1
    });

    if (events.length > 0) {
      try {
        const parsed = JSON.parse(events[0].content);
        return { data: parsed as T, event: events[0] };
      } catch {
        return { data: events[0].content as unknown as T, event: events[0] };
      }
    }
    return null;
  }

  async fetchRemoteAppData<T = any>(
    identifier: string,
    pubkey?: string,
    timeoutMs = 3000
  ): Promise<{ data: T; event: NostrEvent } | null> {
    const targetPubkey = pubkey || (await this.getUserPubkey());
    const filter: NostrFilter = {
      kinds: [30078],
      authors: [targetPubkey],
      "#d": [identifier],
      limit: 1
    };

    return new Promise((resolve) => {
      let resolved = false;
      let latestEvent: NostrEvent | null = null;
      let debounceTimer: any = null;
      const eosedRelays = new Set<string>();

      const finish = async () => {
        if (resolved) return;
        resolved = true;
        if (debounceTimer) clearTimeout(debounceTimer);
        clearTimeout(timer);
        unsubscribe();
        if (latestEvent) {
          await this.eventStore.saveEvent(latestEvent);
          try {
            const parsed = JSON.parse(latestEvent.content);
            resolve({ data: parsed as T, event: latestEvent });
          } catch {
            resolve({ data: latestEvent.content as unknown as T, event: latestEvent });
          }
        } else {
          const local = await this.getAppData<T>(identifier, targetPubkey);
          resolve(local);
        }
      };

      const timer = setTimeout(finish, timeoutMs);

      const subId = `nip78-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const unsubscribe = this.relayPool.subscribe(
        subId,
        [filter],
        (ev) => {
          if (!latestEvent || ev.created_at > latestEvent.created_at) {
            latestEvent = ev;
          }
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            finish();
          }, 300);
        },
        (relayUrl) => {
          if (relayUrl) eosedRelays.add(relayUrl);
          const connectedCount = this.relayPool.getConnectedRelayCount();
          const targetCount = connectedCount > 0 ? connectedCount : 1;
          if (eosedRelays.size >= targetCount) {
            if (debounceTimer) clearTimeout(debounceTimer);
            clearTimeout(timer);
            finish();
          }
        }
      );
    });
  }

  async publishWorkspaceState(state: OmniWorkspaceState): Promise<NostrEvent> {
    return this.publishAppData(OMNI_WORKSPACE_D_TAG, state);
  }

  async getWorkspaceState(pubkey?: string): Promise<{ state: OmniWorkspaceState; event: NostrEvent } | null> {
    const res = await this.getAppData<OmniWorkspaceState>(OMNI_WORKSPACE_D_TAG, pubkey);
    if (!res) return null;
    return { state: res.data, event: res.event };
  }

  async fetchRemoteWorkspaceState(
    pubkey?: string,
    timeoutMs?: number
  ): Promise<{ state: OmniWorkspaceState; event: NostrEvent } | null> {
    const res = await this.fetchRemoteAppData<OmniWorkspaceState>(OMNI_WORKSPACE_D_TAG, pubkey, timeoutMs);
    if (!res) return null;
    return { state: res.data, event: res.event };
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

  async publishNsite(
    nsite: {
      identifier: string;
      name: string;
      description?: string;
      icon?: string;
      htmlContent: string;
    },
    options?: PublishNsiteOptions
  ): Promise<ResolvedNostrPlugin> {
    return NostrPluginResolver.publishNsite(
      nsite,
      this.keystore,
      {
        relayPool: this.relayPool,
        eventStore: this.eventStore
      },
      options
    );
  }

  // --- Milestone 6: Transparent Cross-App Intents (NIP-21, NIP-89 & Web Share) ---

  async handleUri(uri: string, sourcePluginId?: string): Promise<any> {
    if (this.onHandleUri) {
      return this.onHandleUri(uri, sourcePluginId);
    }
    return { success: true, uri, handled: false };
  }

  async handleShare(
    payload: { title?: string; text?: string; url?: string },
    sourcePluginId?: string
  ): Promise<any> {
    if (this.onHandleShare) {
      return this.onHandleShare(payload, sourcePluginId);
    }
    return { success: true, payload, handled: false };
  }

  async resolveAppHandlers(
    uri: string,
    extraPlugins?: Array<{ id: string; name?: string; manifest?: any; description?: string }>
  ): Promise<AppHandler[]> {
    const { scheme, kind } = detectUriScheme(uri);
    const handlers: AppHandler[] = [];

    // 1. Gather active sandboxes and extra/installed plugins
    const candidates: Array<{ id: string; name: string; icon?: string; description?: string }> = [];

    for (const [id, sandbox] of this.sandboxes.entries()) {
      const pluginId = sandbox.manifest?.id || id.split("::")[0];
      if (!candidates.some((c) => c.id === pluginId)) {
        candidates.push({
          id: pluginId,
          name: sandbox.manifest?.name || pluginId,
          icon: sandbox.manifest?.icon,
          description: sandbox.manifest?.description
        });
      }
    }

    if (extraPlugins) {
      for (const p of extraPlugins) {
        if (!candidates.some((c) => c.id === p.id)) {
          candidates.push({
            id: p.id,
            name: p.manifest?.name || p.name || p.id,
            icon: p.manifest?.icon,
            description: p.manifest?.description || p.description
          });
        }
      }
    }

    for (const cand of candidates) {
      const id = cand.id;
      const name = cand.name;
      let matched = false;
      const schemes: string[] = [];

      if (scheme === "nostr") {
        if (
          id.includes("feed") ||
          name.toLowerCase().includes("feed") ||
          name.toLowerCase().includes("timeline")
        ) {
          matched = true;
          schemes.push("nostr");
        } else if (
          id.includes("profile") ||
          name.toLowerCase().includes("profile")
        ) {
          if (kind === 0) matched = true;
          schemes.push("nostr");
        } else {
          schemes.push("nostr");
          matched = true;
        }
      } else if (scheme === "lightning") {
        if (
          id.includes("wallet") ||
          id.includes("lightning") ||
          name.toLowerCase().includes("wallet")
        ) {
          matched = true;
          schemes.push("lightning");
        }
      } else if (scheme === "cashu") {
        if (
          id.includes("cashu") ||
          name.toLowerCase().includes("cashu") ||
          id.includes("wallet")
        ) {
          matched = true;
          schemes.push("cashu");
        }
      }

      if (matched) {
        handlers.push({
          id,
          name,
          icon: cand.icon || "globe",
          description: cand.description || "Installed application",
          isInstalled: true,
          schemes,
          kinds: kind !== undefined ? [kind] : undefined
        });
      }
    }

    // 2. Query LocalEventStore for NIP-89 App Handler Definition Events (kind: 31989)
    try {
      const nip89Filter: any = { kinds: [31989], limit: 20 };
      if (kind !== undefined) {
        nip89Filter["#k"] = [String(kind)];
      }
      const nip89Events = await this.eventStore.getEvents(nip89Filter);
      for (const ev of nip89Events) {
        const dTag = ev.tags.find((t) => t[0] === "d")?.[1] || ev.id;
        if (!handlers.some((h) => h.id === dTag)) {
          let name = ev.tags.find((t) => t[0] === "name")?.[1] || dTag;
          let about = "";
          try {
            const meta = JSON.parse(ev.content);
            if (meta.name) name = meta.name;
            if (meta.about) about = meta.about;
          } catch {}

          handlers.push({
            id: dTag,
            name,
            description: about || "Discovered via Nostr (NIP-89)",
            isInstalled: false,
            schemes: [scheme],
            kinds: kind !== undefined ? [kind] : undefined,
            naddr: WebCryptoKeystore.toNaddr({
              kind: 31989,
              pubkey: ev.pubkey,
              identifier: dTag,
              relays: []
            })
          });
        }
      }
    } catch {}

    return handlers;
  }

  getDefaultHandler(scheme: string): string | null {
    try {
      const storage = typeof window !== "undefined" && window.localStorage ? window.localStorage : (typeof localStorage !== "undefined" ? localStorage : null);
      if (storage) {
        const raw = storage.getItem("omni_default_handlers");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed[scheme]) return parsed[scheme];
        }
      }
    } catch {}
    return this.defaultHandlersMemory[scheme] || null;
  }

  setDefaultHandler(scheme: string, handlerId: string): void {
    this.defaultHandlersMemory[scheme] = handlerId;
    try {
      const storage = typeof window !== "undefined" && window.localStorage ? window.localStorage : (typeof localStorage !== "undefined" ? localStorage : null);
      if (storage) {
        const raw = storage.getItem("omni_default_handlers");
        const map = raw ? JSON.parse(raw) : {};
        map[scheme] = handlerId;
        storage.setItem("omni_default_handlers", JSON.stringify(map));
      }
    } catch {}
  }

  clearDefaultHandler(scheme: string): void {
    delete this.defaultHandlersMemory[scheme];
    try {
      const storage = typeof window !== "undefined" && window.localStorage ? window.localStorage : (typeof localStorage !== "undefined" ? localStorage : null);
      if (storage) {
        const raw = storage.getItem("omni_default_handlers");
        if (raw) {
          const map = JSON.parse(raw);
          delete map[scheme];
          storage.setItem("omni_default_handlers", JSON.stringify(map));
        }
      }
    } catch {}
  }
}
