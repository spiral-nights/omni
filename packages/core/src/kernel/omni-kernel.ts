import { OmniManifest, NostrEvent, NostrFilter, EventMetadata, OmniWorkspaceState, OMNI_WORKSPACE_D_TAG } from "@omni/types";
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
  private settingsSandboxes: Map<string, SandboxInstance> = new Map();
  private runtimeScript?: string;
  private slotResolver?: (pluginId: string, componentId: string, slot: string) => Element | undefined;
  private onSlotAction?: (action: "toggle" | "open" | "close", slot: string) => void;
  private onHandleUri?: (uri: string, sourcePluginId?: string) => Promise<any>;
  private onHandleShare?: (payload: { title?: string; text?: string; url?: string }, sourcePluginId?: string) => Promise<any>;
  private defaultHandlersMemory: Record<string, string> = {};

  constructor(options: OmniKernelOptions = {}) {
    this.keystore = new WebCryptoKeystore(options.privateKeyHex);
    this.eventStore = new LocalEventStore(options.eventStoreName);
    this.relayPool = new RelayPool({ bootstrapRelays: options.bootstrapRelays });
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
    slotContainers: Map<string, Element>,
    options?: { route?: string; viewId?: string; instanceId?: string; targetSlot?: string }
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
      route: options?.route,
      viewId: options?.viewId,
      instanceId: options?.instanceId,
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
      onHandleShare: (payload, srcId) => this.handleShare(payload, srcId)
    });

    await sandbox.mount();
    const instanceKey = options?.instanceId || manifest.id;
    this.sandboxes.set(instanceKey, sandbox);
    return sandbox;
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

  disablePlugin(pluginId: string): void {
    for (const [key, sandbox] of Array.from(this.sandboxes.entries())) {
      if (key === pluginId || key.startsWith(`${pluginId}::`)) {
        sandbox.destroy();
        this.sandboxes.delete(key);
      }
    }
    this.destroyPluginSettings(pluginId);
  }

  async enablePlugin(
    manifest: OmniManifest,
    scriptContent: string,
    slotContainers: Map<string, Element>,
    options?: { route?: string; viewId?: string; instanceId?: string; targetSlot?: string }
  ): Promise<SandboxInstance> {
    this.disablePlugin(manifest.id);
    return this.registerPlugin(manifest, scriptContent, slotContainers, options);
  }

  async mountPluginSettings(
    pluginId: string,
    manifest: OmniManifest,
    scriptContent: string,
    container: Element,
    route: string = "?view=settings"
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
      slotResolver: () => container,
      route,
      viewId: "settings",
      aclEngine: this.aclEngine,
      storageManager: this.storageManager,
      intentBroker: this.intentBroker,
      subscriptionCoordinator: this.subscriptionCoordinator,
      keystore: this.keystore,
      relayPool: this.relayPool,
      eventStore: this.eventStore,
      onSlotAction: this.onSlotAction,
      onHandleUri: (uri, srcId) => this.handleUri(uri, srcId),
      onHandleShare: (payload, srcId) => this.handleShare(payload, srcId)
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

  setPluginPermission(pluginId: string, category: string, granted: boolean): void {
    this.capabilityStore.setGrant(pluginId, category, granted ? "always" : "deny");
  }

  getPluginPermission(pluginId: string, category: string): boolean {
    const grant = this.capabilityStore.getGrant(pluginId, category);
    return grant === "always" || grant === "session";
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

      const finish = async () => {
        if (resolved) return;
        resolved = true;
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
        },
        () => {
          clearTimeout(timer);
          finish();
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
