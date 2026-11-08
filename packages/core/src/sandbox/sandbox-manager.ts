import { OmniManifest, OmniInitMessage, OmniComponentNode } from "@omni/types";
import { SchemaRenderer } from "../schema/schema-renderer.js";
import { IframeAppHost } from "./iframe-app-host.js";
import { WorkerGuestHost } from "./worker-guest-host.js";
import { WasmGuestHost } from "./wasm-guest-host.js";
import { JsonRpcDispatcher } from "../ipc/json-rpc-dispatcher.js";
import { AclEngine } from "../acl/acl-engine.js";
import { PluginStorageManager } from "../storage/plugin-storage-manager.js";
import { IntentBroker } from "../intents/intent-broker.js";
import { SubscriptionCoordinator } from "../nostr/subscription-coordinator.js";
import { WebCryptoKeystore } from "../crypto/webcrypto-keystore.js";
import { RelayPool } from "../nostr/relay-pool.js";
import { LocalEventStore } from "../nostr/event-store.js";

function isSchemaView(
  manifest: OmniManifest,
  route?: string,
  viewId?: string,
  scriptContent?: string
): boolean {
  if (route && (route.includes("format=schema") || route.includes("view=schema"))) {
    return true;
  }
  if (route && (route.includes("format=iframe") || route.includes("view=iframe"))) {
    return false;
  }
  const effectiveViewId = viewId || "main";
  const matchingView = manifest.views?.find(
    (v) => v.id === effectiveViewId || (route && v.path && route.includes(v.path))
  );
  if (matchingView?.format === "schema") {
    return true;
  }
  if (matchingView?.format === "iframe") {
    return false;
  }
  if ((manifest as any).format === "schema") {
    return true;
  }
  if ((manifest as any).format === "iframe") {
    return false;
  }
  if (
    scriptContent &&
    typeof scriptContent === "string" &&
    (scriptContent.includes("omni:schema") ||
      scriptContent.includes('id="omni-schema"') ||
      scriptContent.includes('application/json"#omni-schema') ||
      scriptContent.includes('application/json" id="omni-schema"'))
  ) {
    return true;
  }
  return false;
}

function isWasmView(
  manifest: OmniManifest,
  route?: string,
  viewId?: string,
  scriptContent?: string | Uint8Array | ArrayBuffer
): boolean {
  if (route && (route.includes("format=wasm") || route.includes("view=wasm"))) {
    return true;
  }
  const effectiveViewId = viewId || "main";
  const matchingView = manifest.views?.find(
    (v) => v.id === effectiveViewId || (route && v.path && route.includes(v.path))
  );
  if (matchingView?.format === "wasm") {
    return true;
  }
  if ((manifest as any).format === "wasm") {
    return true;
  }
  if (manifest.entry?.endsWith(".wasm")) {
    return true;
  }
  if (scriptContent instanceof Uint8Array || scriptContent instanceof ArrayBuffer) {
    const bytes = new Uint8Array(scriptContent);
    return bytes.length >= 4 && bytes[0] === 0x00 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d;
  }
  if (typeof scriptContent === "string") {
    const trimmed = scriptContent.trim();
    if (
      trimmed.endsWith(".wasm") ||
      trimmed.includes(".wasm?") ||
      trimmed.includes("data:application/wasm;base64,") ||
      trimmed.startsWith("\0asm") ||
      trimmed.startsWith("AGFzbQ")
    ) {
      return true;
    }
  }
  return false;
}

function setupIframeContainerProxy(
  container: Element,
  iframe: HTMLIFrameElement,
  slotContainer?: Element | null
) {
  const targets = [container];
  if (slotContainer && slotContainer !== container) {
    targets.push(slotContainer);
  }

  for (const target of targets) {
    const origQS = target.querySelector.bind(target);
    const origQSA = target.querySelectorAll.bind(target);

    target.querySelector = function(selector: string) {
      const el = origQS(selector);
      if (el) return el;
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc) {
          return doc.querySelector(selector);
        }
      } catch (_) {}
      return null;
    };

    target.querySelectorAll = function(selector: string) {
      const list = origQSA(selector);
      if (list && list.length > 0) return list;
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc) {
          return doc.querySelectorAll(selector);
        }
      } catch (_) {}
      return list;
    };

    try {
      Object.defineProperty(target, "textContent", {
        get: function() {
          try {
            const doc = iframe.contentDocument || iframe.contentWindow?.document;
            if (doc && doc.body) {
              const innerText = doc.body.textContent || "";
              if (innerText.trim()) return innerText;
            }
          } catch (_) {}
          return "";
        },
        configurable: true
      });
    } catch (_) {}
  }
}

export interface SandboxInstanceOptions {
  manifest: OmniManifest;
  scriptContent: string | Uint8Array | ArrayBuffer;
  wasmBytes?: Uint8Array | ArrayBuffer;
  runtimeUrl?: string;
  runtimeScript?: string;
  trusted?: boolean;
  userPubkey: string;
  slotContainers: Map<string, Element>; // Map of slot name -> DOM Element
  slotResolver?: (pluginId: string, componentId: string, defaultSlot: string) => Element | undefined | null;
  aclEngine: AclEngine;
  storageManager: PluginStorageManager;
  intentBroker: IntentBroker;
  subscriptionCoordinator: SubscriptionCoordinator;
  keystore: WebCryptoKeystore;
  relayPool: RelayPool;
  eventStore: LocalEventStore;
  route?: string;
  viewId?: string;
  instanceId?: string;
  targetSlot?: string;
  workerEnabled?: boolean;
  allowedRelays?: string[];
  onSlotAction?: (action: "toggle" | "open" | "close" | "scrollToTop", slot: string) => void;
  onScrollTo?: (params: any) => void;
  onHandleUri?: (uri: string, sourcePluginId: string) => Promise<any>;
  onHandleShare?: (payload: any, sourcePluginId: string) => Promise<any>;
  onHistoryPush?: (params: { pageId?: string; state: any; title: string; url: string }) => Promise<any> | any;
  onHistoryReplace?: (params: { pageId?: string; state: any; title: string; url: string }) => Promise<any> | any;
  onHistoryBack?: () => Promise<any> | any;
  onHistoryGo?: (delta?: number) => Promise<any> | any;
  canGoBack?: () => boolean;
  theme?: any;
  useShadowDom?: boolean;
}

export class SandboxInstance {
  readonly manifest: OmniManifest;
  private iframe: HTMLIFrameElement | null = null;
  private workerHost: WorkerGuestHost | null = null;
  private wasmHost: WasmGuestHost | null = null;
  private schemaRenderers: Map<string, SchemaRenderer> = new Map();
  private iframeAppHosts: Map<string, IframeAppHost> = new Map();
  private compContainers: Element[] = [];
  private compContainersByCompId: Map<string, Element> = new Map();
  private dispatcher: JsonRpcDispatcher | null = null;
  private channel1: MessageChannel | null = null;
  private channel2: MessageChannel | null = null;
  private cleanupFns: Array<() => void> = [];
  private currentPageId: string | null = null;
  private rootPageId: string | null = null;
  private isRestoringPopstate = false;
  private pageSnapshots: Map<
    string,
    {
      schema: OmniComponentNode;
      meta: { id: string; title?: string; url?: string; state?: any };
    }
  > = new Map();

  constructor(private options: SandboxInstanceOptions) {
    this.manifest = options.manifest;
  }

  private extractSchemaPageMeta(data: any): { id: string; title?: string; url?: string; state?: any } | null {
    const rawPage = data?.page ?? data?.schema?.page;
    if (typeof rawPage === "string" && rawPage.trim()) {
      return { id: rawPage.trim() };
    }
    if (rawPage && typeof rawPage === "object" && typeof rawPage.id === "string" && rawPage.id.trim()) {
      return {
        id: rawPage.id.trim(),
        title: rawPage.title,
        url: rawPage.url,
        state: rawPage.state
      };
    }
    const schema = data?.schema;
    if (schema && typeof schema === "object") {
      if (schema.type === "tabs" && typeof schema.activeTab === "string" && schema.activeTab.trim()) {
        return { id: schema.activeTab.trim(), state: { tab: schema.activeTab.trim() } };
      }
      if (Array.isArray(schema.children)) {
        for (const child of schema.children) {
          if (child && child.type === "tabs" && typeof child.activeTab === "string" && child.activeTab.trim()) {
            return { id: child.activeTab.trim(), state: { tab: child.activeTab.trim() } };
          }
        }
      }
    }
    return null;
  }

  getComponentContainer(componentId: string): Element | undefined {
    return this.compContainersByCompId.get(componentId);
  }

  getPrimaryComponentContainer(): Element | null {
    return this.compContainers[0] || null;
  }

  getFirstPopulatedComponentContainer(): Element | null {
    for (const container of this.compContainers.values()) {
      if (container.shadowRoot && container.shadowRoot.childNodes.length > 0) return container;
      if (container.childNodes.length > 0) return container;
    }
    return null;
  }

  reparentComponent(componentId: string, newParent: Element): boolean {
    const container = this.compContainersByCompId.get(componentId);
    if (container && newParent) {
      newParent.appendChild(container);
      return true;
    }
    return false;
  }

  setComponentVisible(componentId: string, visible: boolean): void {
    const container = this.compContainersByCompId.get(componentId);
    if (container) {
      (container as HTMLElement).style.display = visible ? "" : "none";
    }
  }

  postRpcNotification(method: string, params?: any): void {
    if (this.channel2 && this.channel2.port1) {
      this.channel2.port1.postMessage({
        jsonrpc: "2.0",
        method,
        params
      });
    }
  }

  public updateTheme(themeOverride?: any): void {
    if (themeOverride) {
      this.options.theme = themeOverride;
    }
    const resolvedTheme = this.resolveHostThemeTokens();
    if (this.workerHost) {
      try {
        this.workerHost.postMessage({
          type: "omni:theme-update",
          payload: resolvedTheme
        });
      } catch (_) {}
    }
    if (this.iframe) {
      this.iframe.style.colorScheme = resolvedTheme.mode;
      try {
        this.iframe.contentWindow?.postMessage(
          {
            type: "omni:theme-update",
            payload: resolvedTheme
          },
          "*"
        );
      } catch (_) {}
    }
  }

  public getWorkerHost(): WorkerGuestHost | null {
    return this.workerHost;
  }

  public getWasmHost(): WasmGuestHost | null {
    return this.wasmHost;
  }

  private resolveHostThemeTokens(): {
    mode: "light" | "dark";
    colors: Record<string, string>;
    tokens: Record<string, string>;
  } {
    const optTheme = this.options.theme || {};
    let mode: "light" | "dark" = optTheme.mode === "light" ? "light" : "dark";
    const tokens: Record<string, string> = {};

    if (typeof document !== "undefined" && typeof window !== "undefined") {
      try {
        const candidates = [
          document.querySelector(".editorial-shell-root"),
          document.querySelector(".panorama-shell-root"),
          document.querySelector(".omni-shell-root"),
          document.documentElement,
          document.body
        ].filter(Boolean) as Element[];

        for (const el of candidates) {
          const attrMode = el.getAttribute("data-theme-mode");
          if (attrMode === "light" || attrMode === "dark") {
            mode = attrMode;
            break;
          }
          if (el.classList?.contains("light-mode") || el.classList?.contains("theme-light")) {
            mode = "light";
            break;
          }
        }

        const varNames = [
          "--omni-bg-canvas",
          "--omni-bg-surface",
          "--omni-bg-elevated",
          "--omni-bg-subtle",
          "--omni-text-primary",
          "--omni-text-secondary",
          "--omni-text-muted",
          "--omni-border-subtle",
          "--omni-border-strong",
          "--omni-border-focus",
          "--omni-accent-primary",
          "--omni-accent-hover",
          "--omni-accent-contrast",
          "--omni-status-online",
          "--omni-status-badge",
          "--omni-font-sans",
          "--omni-font-serif",
          "--omni-font-mono",
          "--omni-radius-sm",
          "--omni-radius-md",
          "--omni-radius-lg",
          "--omni-radius-pill"
        ];

        for (const el of candidates) {
          const style = window.getComputedStyle(el);
          if (!style) continue;
          for (const v of varNames) {
            if (!tokens[v]) {
              const val = style.getPropertyValue(v)?.trim();
              if (val) {
                tokens[v] = val;
              }
            }
          }
        }
      } catch (_) {}
    }

    const isLight = mode === "light";
    const defaults: Record<string, string> = isLight
      ? {
          "--omni-bg-canvas": optTheme.colors?.canvas || "#fbfbf9",
          "--omni-bg-surface": optTheme.colors?.surface || "#f4f4f2",
          "--omni-bg-elevated": "#ffffff",
          "--omni-bg-subtle": "#eeeeec",
          "--omni-text-primary": "#0f172a",
          "--omni-text-secondary": "#565e74",
          "--omni-text-muted": "#94a3b8",
          "--omni-border-subtle": "#e2e8f0",
          "--omni-border-strong": "#cbd5e1",
          "--omni-border-focus": optTheme.colors?.accent || "#1e40af",
          "--omni-accent-primary": optTheme.colors?.accent || "#1e40af",
          "--omni-accent-hover": "#1d4ed8",
          "--omni-accent-contrast": optTheme.colors?.contrast || "#ffffff",
          "--omni-status-online": optTheme.colors?.accent || "#1e40af",
          "--omni-status-badge": optTheme.colors?.accent || "#1e40af",
          "--omni-radius-sm": optTheme.colors?.radius ?? "4px",
          "--omni-radius-md": optTheme.colors?.radius ?? "6px",
          "--omni-radius-lg": optTheme.colors?.radius ?? "8px",
          "--omni-radius-pill": "9999px"
        }
      : {
          "--omni-bg-canvas": optTheme.colors?.canvas || "#1c1b20",
          "--omni-bg-surface": optTheme.colors?.surface || "#232227",
          "--omni-bg-elevated": "#2a2930",
          "--omni-bg-subtle": "#33323b",
          "--omni-text-primary": "#e5e1e4",
          "--omni-text-secondary": "#c2c6d6",
          "--omni-text-muted": "#8c909f",
          "--omni-border-subtle": "#313038",
          "--omni-border-strong": "#42404b",
          "--omni-border-focus": optTheme.colors?.accent || "#4d8eff",
          "--omni-accent-primary": optTheme.colors?.accent || "#4d8eff",
          "--omni-accent-hover": "#60a5fa",
          "--omni-accent-contrast": optTheme.colors?.contrast || "#ffffff",
          "--omni-status-online": optTheme.colors?.accent || "#4d8eff",
          "--omni-status-badge": optTheme.colors?.accent || "#4d8eff",
          "--omni-radius-sm": optTheme.colors?.radius ?? "4px",
          "--omni-radius-md": optTheme.colors?.radius ?? "6px",
          "--omni-radius-lg": optTheme.colors?.radius ?? "8px",
          "--omni-radius-pill": "9999px"
        };

    for (const [k, v] of Object.entries(defaults)) {
      if (!tokens[k]) {
        tokens[k] = v;
      }
    }

    // Populate short aliases (--bg-surface, --text-primary, etc.)
    for (const [k, v] of Object.entries({ ...tokens })) {
      if (k.startsWith("--omni-")) {
        const shortKey = `--${k.slice("--omni-".length)}`;
        tokens[shortKey] = v;
      }
    }

    return {
      mode,
      colors: {
        canvas: tokens["--omni-bg-canvas"],
        surface: tokens["--omni-bg-surface"],
        elevated: tokens["--omni-bg-elevated"],
        subtle: tokens["--omni-bg-subtle"],
        accent: tokens["--omni-accent-primary"],
        contrast: tokens["--omni-accent-contrast"],
        radius: optTheme.colors?.radius ?? tokens["--omni-radius-sm"]
      },
      tokens
    };
  }

  async mount(): Promise<void> {
    if (typeof document === "undefined") return;

    // 1. Determine privilege & sandboxing rules
    // System UI plugins and trusted plugins are exempt from strict opaque origin isolation
    const isTrusted =
      this.options.trusted === true ||
      this.manifest.trusted === true;

    this.iframe = document.createElement("iframe");
    // Use strict allow-scripts without allow-same-origin to prevent browser sandbox elevation warnings
    // and maintain proper origin isolation (opaque 'null' origin).
    this.iframe.setAttribute("sandbox", "allow-scripts allow-modals");
    this.iframe.setAttribute("allow", "autoplay; geolocation");
    this.iframe.setAttribute("allowtransparency", "true");
    this.iframe.style.display = "none";
    this.iframe.style.backgroundColor = "transparent";
    this.iframe.style.colorScheme = "dark";
    this.iframe.setAttribute("data-plugin-id", this.manifest.id);

    // 2. Setup MessageChannels
    this.channel1 = new MessageChannel(); // Port 1: Schema / Action bus
    this.channel2 = new MessageChannel(); // Port 2: Kernel RPC

    // Handle incoming Schema updates from sandbox (via MessageChannel or standard window.parent.postMessage)
    const applySchema = (data: any) => {
      if (!data) return;

      if ((data.type === "schema" || data.type === "omni:schema") && data.schema) {
        const compId = data.componentId;
        const renderer =
          (compId ? this.schemaRenderers.get(compId) : null) ||
          (compId ? Array.from(this.schemaRenderers.entries()).find(([k]) => k.includes(compId) || compId.includes(k))?.[1] : null) ||
          (this.schemaRenderers.size === 1
            ? this.schemaRenderers.values().next().value
            : null) ||
          this.schemaRenderers.values().next().value;
        if (renderer) {
          if (this.iframe && this.iframe.style.display !== "none") {
            this.iframe.style.display = "none";
            if (primaryIframeContainer) {
              primaryIframeContainer.classList.remove("omni-iframe-slot");
              primaryIframeContainer.parentElement?.classList.remove("has-iframe-slot");
              primaryIframeContainer.parentElement?.parentElement?.classList.remove("has-iframe-slot");
            }
          }
          const isMainAppView =
            (!this.options.targetSlot || this.options.targetSlot === "main") &&
            (!this.options.viewId || this.options.viewId === "main");
          const pageMeta = isMainAppView ? this.extractSchemaPageMeta(data) : null;
          if (pageMeta) {
            this.pageSnapshots.set(pageMeta.id, {
              schema: data.schema,
              meta: pageMeta
            });
            if (!this.rootPageId) {
              this.rootPageId = pageMeta.id;
            }
            const prevPageId = this.currentPageId;
            if (this.isRestoringPopstate) {
              this.isRestoringPopstate = false;
              this.currentPageId = pageMeta.id;
            } else {
              this.currentPageId = pageMeta.id;
              if (prevPageId === null) {
                // Initial root render of the app: update/replace current frame's state in-place without pushing
                if (this.options.onHistoryReplace && pageMeta.state) {
                  this.options.onHistoryReplace({
                    pageId: pageMeta.id,
                    state: pageMeta.state,
                    title: pageMeta.title || this.manifest.name,
                    url: pageMeta.url || ""
                  });
                }
              } else if (prevPageId !== pageMeta.id) {
                const isRootRender =
                  pageMeta.id === this.rootPageId &&
                  (pageMeta.state === null || (!pageMeta.state && !pageMeta.url));
                if (this.options.onHistoryPush) {
                  this.options.onHistoryPush({
                    pageId: pageMeta.id,
                    state: isRootRender ? null : (pageMeta.state ?? { pageId: pageMeta.id }),
                    title: pageMeta.title || this.manifest.name,
                    url: pageMeta.url || ""
                  });
                }
              }
            }
          }
          renderer.render(data.schema);
        }
      }
    };

    this.channel1.port1.onmessage = (event) => {
      applySchema(event.data);
    };

    if (typeof window !== "undefined") {
      const onHostMessage = (event: MessageEvent) => {
        if (this.iframe && event.source === this.iframe.contentWindow) {
          applySchema(event.data);
        }
      };
      window.addEventListener("message", onHostMessage);
      this.cleanupFns.push(() => {
        window.removeEventListener("message", onHostMessage);
      });
    }

    // 3. Mount UI View (Schema Custom Elements or Direct Visual Iframe)
    const isWasm = isWasmView(
      this.manifest,
      this.options.route,
      this.options.viewId,
      this.options.wasmBytes || this.options.scriptContent
    );

    const isSchema = isWasm || isSchemaView(
      this.manifest,
      this.options.route,
      this.options.viewId,
      typeof this.options.scriptContent === "string" ? this.options.scriptContent : ""
    );

    const compDeclarations =
      this.manifest.components && this.manifest.components.length > 0
        ? this.manifest.components
        : [{ id: "main", type: "main" as const, title: this.manifest.name, slot: "main" }];

    let primaryIframeContainer: HTMLElement | null = null;

    for (const comp of compDeclarations) {
      let slotContainer: Element | undefined | null = null;
      if (this.options.slotResolver) {
        slotContainer = this.options.slotResolver(this.manifest.id, comp.id, comp.slot);
      }
      if (!slotContainer) {
        slotContainer =
          this.options.slotContainers.get(comp.slot) ||
          this.options.slotContainers.get("settings") ||
          this.options.slotContainers.get("main") ||
          this.options.slotContainers.values().next().value;
      }

      if (slotContainer) {
        if (comp.type === "main" || comp.slot === "main") {
          slotContainer.querySelectorAll(".omni-component-slot").forEach((el) => el.remove());
        } else {
          const existing = slotContainer.querySelector(`.omni-comp-${comp.id}`);
          if (existing) {
            existing.remove();
          }
        }

        const compContainer = document.createElement("div");
        compContainer.className = `omni-component-slot omni-comp-${comp.id}`;
        compContainer.style.width = "100%";
        const isCompanionWidget =
          comp.slot === "sidebar" ||
          comp.slot === "widget" ||
          comp.slot === "widgets" ||
          this.options.targetSlot === "sidebar" ||
          this.options.targetSlot === "widget";
        compContainer.style.height = isCompanionWidget ? "auto" : "100%";
        compContainer.style.flex = isCompanionWidget ? "none" : "1";
        if (isCompanionWidget) {
          compContainer.style.minHeight = "380px";
        }
        compContainer.style.display = "flex";
        compContainer.style.flexDirection = "column";
        slotContainer.appendChild(compContainer);
        this.compContainers.push(compContainer);
        this.compContainersByCompId.set(comp.id, compContainer);

        const schemaRenderer = new SchemaRenderer({
          container: compContainer,
          onAction: (action, payload) => {
            const isBackAction =
              action.name === "back" ||
              action.name === "back-to-feed" ||
              action.name === "close-thread" ||
              Boolean(
                action.navigate?.back ||
                (payload && (payload as any).isBack) ||
                (action.payload && (action.payload as any).isBack)
              );
            if (
              isBackAction &&
              !isCompanionWidget &&
              this.options.onHistoryBack
            ) {
              if (this.options.canGoBack?.()) {
                this.options.onHistoryBack();
              }
            }
            if (action.navigate?.route) {
              const route = action.navigate.route;
              if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(route)) {
                if (this.options.onHandleUri) {
                  this.options.onHandleUri(route, this.manifest.id);
                }
              } else if (this.options.onHistoryPush) {
                this.options.onHistoryPush({
                  pageId: comp.id,
                  state: { route, pluginId: this.manifest.id },
                  title: (action.navigate as any).title || "",
                  url: route
                });
              }
            }
            const handlesProfile = (this.manifest as any).handledIntents?.includes("view_profile") || 
              (this.manifest as any).handledIntents?.includes("view-profile") ||
              this.manifest.permissions?.intents?.handle?.includes("view_profile") ||
              this.manifest.permissions?.intents?.handle?.includes("view-profile") ||
              this.manifest.permissions?.intents?.handle?.includes("*");
            if (
              (action.name === "view-profile" || action.name === "view_profile") &&
              this.options.intentBroker &&
              !handlesProfile
            ) {
              const pubkey = (payload?.pubkey || action.payload?.pubkey) as string;
              if (pubkey) {
                this.options.intentBroker.dispatch(this.manifest.id, "view_profile", { pubkey }).catch(() => {});
              }
            }
            const handlesNote = (this.manifest as any).handledIntents?.includes("view_note") || 
              (this.manifest as any).handledIntents?.includes("view-note") ||
              this.manifest.permissions?.intents?.handle?.includes("view_note") ||
              this.manifest.permissions?.intents?.handle?.includes("view-note") ||
              this.manifest.permissions?.intents?.handle?.includes("*") ||
              this.manifest.id === "org.omni.plugin.feed";
            if (
              (action.name === "view_note" || action.name === "view-note") &&
              this.options.intentBroker &&
              !handlesNote
            ) {
              const noteId = (payload?.id || payload?.eventId || action.payload?.id || action.payload?.eventId) as string;
              if (noteId) {
                this.options.intentBroker.dispatch(this.manifest.id, "view_note", { id: noteId, eventId: noteId }).catch(() => {});
              }
            }
            if (this.wasmHost) {
              this.wasmHost.dispatchAction(comp.id, action, payload);
            } else if (this.workerHost) {
              this.workerHost.dispatchAction(comp.id, action, payload);
            } else if (this.channel1) {
              try {
                this.channel1.port1.postMessage({
                  type: "action",
                  componentId: comp.id,
                  action,
                  payload
                });
              } catch (_) {}
            } else {
              try {
                this.iframe?.contentWindow?.postMessage(
                  {
                    type: "omni:action",
                    componentId: comp.id,
                    action,
                    payload
                  },
                  "*"
                );
              } catch (_) {}
            }
          }
        });
        this.schemaRenderers.set(comp.id, schemaRenderer);

        if (!isSchema && !primaryIframeContainer) {
          // Direct Iframe View: configure visible app iframe and defer DOM append until srcdoc is ready
          this.iframe.style.display = "block";
          this.iframe.style.width = "100%";
          this.iframe.style.height = "100%";
          this.iframe.style.border = "none";
          this.iframe.style.minHeight = isCompanionWidget ? "380px" : "100%";
          this.iframe.style.flex = "1";
          this.iframe.style.position = "static";
          this.iframe.style.visibility = "visible";
          compContainer.classList.add("omni-iframe-slot");
          slotContainer.classList.add("has-iframe-slot");
          slotContainer.parentElement?.classList.add("has-iframe-slot");
          primaryIframeContainer = compContainer;
          setupIframeContainerProxy(compContainer, this.iframe, slotContainer);
        }
      }
    }

    // 4. Setup Host JSON-RPC Dispatcher on channel2 port1
    this.dispatcher = new JsonRpcDispatcher({
      pluginId: this.manifest.id,
      manifest: this.manifest,
      port: this.channel2.port1,
      aclEngine: this.options.aclEngine,
      storageManager: this.options.storageManager,
      intentBroker: this.options.intentBroker,
      subscriptionCoordinator: this.options.subscriptionCoordinator,
      keystore: this.options.keystore,
      relayPool: this.options.relayPool,
      eventStore: this.options.eventStore,
      allowedRelays: this.options.allowedRelays,
      onSlotAction: this.options.onSlotAction,
      onScrollTo: this.options.onScrollTo,
      onHandleUri: this.options.onHandleUri,
      onHandleShare: this.options.onHandleShare,
      onHistoryPush: this.options.onHistoryPush,
      onHistoryReplace: this.options.onHistoryReplace,
      onHistoryBack: this.options.onHistoryBack,
      onHistoryGo: this.options.onHistoryGo
    });

    const routeVal = this.options.route || "";
    const viewIdVal = this.options.viewId || "main";

    let initialStorageMap: Record<string, any> = {};
    try {
      if (this.options.storageManager) {
        initialStorageMap = await this.options.storageManager.getAll(this.manifest.id);
      }
    } catch (err) {
      console.warn(`[SandboxInstance] Failed to read initial storage for [${this.manifest.id}]:`, err);
    }

    if (isWasm) {
      if (this.iframe && this.iframe.parentNode) {
        this.iframe.parentNode.removeChild(this.iframe);
      }
      this.iframe = null;

      let wasmBytes: Uint8Array | ArrayBuffer | null = this.options.wasmBytes || null;
      if (!wasmBytes && this.options.scriptContent) {
        if (this.options.scriptContent instanceof Uint8Array || this.options.scriptContent instanceof ArrayBuffer) {
          wasmBytes = this.options.scriptContent;
        } else if (typeof this.options.scriptContent === "string") {
          const raw = this.options.scriptContent.trim();
          if (
            raw.endsWith(".wasm") ||
            raw.includes(".wasm?") ||
            raw.startsWith("http://") ||
            raw.startsWith("https://") ||
            raw.startsWith("/") ||
            raw.startsWith("./") ||
            raw.startsWith("blob:")
          ) {
            try {
              if (typeof fetch === "function") {
                const resp = await fetch(raw);
                if (resp.ok) {
                  wasmBytes = new Uint8Array(await resp.arrayBuffer());
                }
              }
            } catch (err) {
              console.warn(`[SandboxInstance:${this.manifest.id}] Failed to fetch WASM from URL [${raw}]:`, err);
            }
          }
          if (!wasmBytes) {
            const matchDataUrl = raw.match(/data:application\/wasm;base64,([A-Za-z0-9+/=]+)/);
            if (matchDataUrl) {
              const b64 = matchDataUrl[1];
              const binary = atob(b64);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
              wasmBytes = bytes;
            } else if (raw.startsWith("AGFzbQ")) {
              const binary = atob(raw);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
              wasmBytes = bytes;
            } else {
              const bytes = new Uint8Array(raw.length);
              for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) & 0xff;
              wasmBytes = bytes;
            }
          }
        }
      }

      if (wasmBytes) {
        this.wasmHost = new WasmGuestHost({
          pluginId: this.manifest.id,
          wasmBytes,
          channel1: this.channel1,
          channel2: this.channel2,
          initPayload: {
            pluginId: this.manifest.id,
            instanceId: this.options.instanceId || `inst_${Math.random().toString(36).slice(2, 9)}`,
            userPubkey: this.options.userPubkey,
            theme: this.resolveHostThemeTokens() as any,
            slots: Array.from(this.options.slotContainers.keys()),
            components: this.manifest.components?.map((c) => c.id) || ["main"],
            route: routeVal,
            viewId: viewIdVal,
            storage: initialStorageMap
          },
          onSchemaUpdate: (schema, componentId) => {
            applySchema({
              type: "schema",
              schema,
              componentId
            });
          },
          subscriptionCoordinator: this.options.subscriptionCoordinator,
          eventStore: this.options.eventStore,
          relayPool: this.options.relayPool,
          keystore: this.options.keystore,
          aclEngine: this.options.aclEngine
        });

        await this.wasmHost.boot();
        return;
      }
    }

    // 5. Build srcdoc injecting omni-runtime.js + plugin script
    const csp = isTrusted
      ? "default-src 'self' 'unsafe-inline' blob: http: https: data:; style-src 'unsafe-inline' 'self'; connect-src *;"
      : "default-src 'none'; script-src 'unsafe-inline' blob: 'self' http: https:; style-src 'unsafe-inline'; connect-src 'none';";

    const baseHref = typeof window !== "undefined" && window.location?.origin
      ? `${window.location.origin}/`
      : "/";

    if (!this.options.runtimeScript) {
      throw new Error(
        "SandboxManager requires options.runtimeScript: the sandbox runtime bridge source (import packages/core/src/sandbox/omni-runtime.js as raw text in the host)."
      );
    }

    // Strip any sourceMappingURL and sourceURL comments to prevent DevTools URL constructor errors on about:srcdoc
    const runtimeCode = this.options.runtimeScript
      .replace(/\/\/[#@]\s*sourceMappingURL=[^\r\n]*/gi, "")
      .replace(/\/\*#\s*sourceMappingURL=[\s\S]*?\*\//gi, "")
      .replace(/\/\/[#@]\s*sourceURL=[^\r\n]*/gi, "");

    const pluginCode = typeof this.options.scriptContent === "string"
      ? this.options.scriptContent
          .replace(/\/\/[#@]\s*sourceMappingURL=[^\r\n]*/gi, "")
          .replace(/\/\*#\s*sourceMappingURL=[\s\S]*?\*\//gi, "")
          .replace(/\/\/[#@]\s*sourceURL=[^\r\n]*/gi, "")
      : "";

    const trimmedPluginCode = pluginCode.trim();
    const isHtmlDoc =
      trimmedPluginCode.startsWith("<") &&
      (trimmedPluginCode.startsWith("<!DOCTYPE") ||
        trimmedPluginCode.startsWith("<html") ||
        /<head\b/i.test(trimmedPluginCode) ||
        /<body\b/i.test(trimmedPluginCode) ||
        /^<[a-zA-Z!]/.test(trimmedPluginCode));

    const canUseWorker =
      isSchema &&
      this.options.workerEnabled !== false &&
      typeof Worker !== "undefined";

    if (canUseWorker) {
      if (this.iframe && this.iframe.parentNode) {
        this.iframe.parentNode.removeChild(this.iframe);
      }
      this.iframe = null;

      this.workerHost = new WorkerGuestHost({
        pluginId: this.manifest.id,
        runtimeScript: this.options.runtimeScript,
        pluginScript: typeof this.options.scriptContent === "string" ? this.options.scriptContent : "",
        channel1: this.channel1,
        channel2: this.channel2,
        initPayload: {
          pluginId: this.manifest.id,
          instanceId: this.options.instanceId || `inst_${Math.random().toString(36).slice(2, 9)}`,
          userPubkey: this.options.userPubkey,
          theme: this.resolveHostThemeTokens() as any,
          slots: Array.from(this.options.slotContainers.keys()),
          components: this.manifest.components?.map((c) => c.id) || ["main"],
          route: routeVal,
          viewId: viewIdVal,
          storage: initialStorageMap
        },
        onSchemaUpdate: (schema, componentId) => {
          applySchema({
            type: "schema",
            schema,
            componentId
          });
        }
      });

      return;
    }

    function serializeForInlineScript(value: any): string {
      return JSON.stringify(value)
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e")
        .replace(/&/g, "\\u0026");
    }

    const routeInjectionScript = `
    // Transparent Sub-View & Route Injection for Pure nsites using standard Web APIs
    var __search = "";
    var __hash = "";
    function __parseRoute(routeStr) {
      if (!routeStr) return;
      if (routeStr.includes("?")) {
        var qIdx = routeStr.indexOf("?");
        var hIdx = routeStr.indexOf("#", qIdx);
        __search = hIdx !== -1 ? routeStr.slice(qIdx, hIdx) : routeStr.slice(qIdx);
      }
      if (routeStr.includes("#")) {
        __hash = routeStr.slice(routeStr.indexOf("#"));
      }
      if (!__search && !__hash) {
        if (routeStr.startsWith("?")) __search = routeStr;
        else if (routeStr.startsWith("#")) __hash = routeStr;
      }
      try {
        window.__OMNI_SEARCH__ = __search;
        window.__OMNI_HASH__ = __hash;
      } catch (_) {}
    }

    try {
      window.__OMNI_ROUTE__ = ${serializeForInlineScript(routeVal)};
      window.__OMNI_VIEW__ = ${serializeForInlineScript(viewIdVal)};
      window.__OMNI_INITIAL_STORAGE__ = ${serializeForInlineScript(initialStorageMap)};
      if (window.__OMNI_ROUTE__) {
        __parseRoute(window.__OMNI_ROUTE__);
      }
    } catch (_) {}

    try {
      window.__omniPendingInit = null;
      window.addEventListener("message", function(e) {
        if (e.data && e.data.type === "omni:init") {
          window.__omniPendingInit = e;
          if (e.data.payload) {
            if (e.data.payload.route) {
              window.__OMNI_ROUTE__ = e.data.payload.route;
              __parseRoute(e.data.payload.route);
            }
            if (e.data.payload.viewId) {
              window.__OMNI_VIEW__ = e.data.payload.viewId;
            }
            try {
              window.dispatchEvent(new HashChangeEvent("hashchange"));
            } catch (_) {}
            try {
              window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
            } catch (_) {}
          }
        }
      });
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "omni:guest-ready", pluginId: ${serializeForInlineScript(this.manifest.id)} }, "*");
      }
    } catch (_) {}

    try {
      try {
        Object.defineProperty(window.location, "search", {
          get: function() { return __search || window.__OMNI_SEARCH__ || ""; },
          configurable: true
        });
        Object.defineProperty(window.location, "hash", {
          get: function() { return __hash || window.__OMNI_HASH__ || ""; },
          configurable: true
        });
        Object.defineProperty(window.location, "href", {
          get: function() { return "about:srcdoc" + (__search || window.__OMNI_SEARCH__ || "") + (__hash || window.__OMNI_HASH__ || ""); },
          configurable: true
        });
      } catch (_) {
        try {
          if (window.Location && window.Location.prototype) {
            Object.defineProperty(window.Location.prototype, "search", {
              get: function() { return __search || window.__OMNI_SEARCH__ || ""; },
              configurable: true
            });
            Object.defineProperty(window.Location.prototype, "hash", {
              get: function() { return __hash || window.__OMNI_HASH__ || ""; },
              configurable: true
            });
            Object.defineProperty(window.Location.prototype, "href", {
              get: function() { return "about:srcdoc" + (__search || window.__OMNI_SEARCH__ || "") + (__hash || window.__OMNI_HASH__ || ""); },
              configurable: true
            });
          }
        } catch (_) {}
      }
    } catch (_) {}
    `;

    const safeRouteInjectionScript = routeInjectionScript.replace(/<\/script/gi, "<\\/script");
    const safeRuntimeCode = runtimeCode.replace(/<\/script/gi, "<\\/script");

    const resolvedTheme = this.resolveHostThemeTokens();
    if (this.iframe) {
      this.iframe.style.colorScheme = resolvedTheme.mode;
    }
    const themeVarsCss = Object.entries(resolvedTheme.tokens)
      .map(([k, v]) => `      ${k}: ${v};`)
      .join("\n");
    const themeStyleBlock = `<style id="omni-theme-tokens">
    :root {
      color-scheme: ${resolvedTheme.mode};
${themeVarsCss}
    }
    html, body {
      margin: 0;
      padding: 0;
      background-color: transparent !important;
      color: var(--omni-text-primary, #e5e1e4);
      font-family: var(--omni-font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
      min-height: 100%;
      box-sizing: border-box;
    }
  </style>`;

    if (isHtmlDoc) {
      const injectedHead = `\n  <meta http-equiv="Content-Security-Policy" content="${csp}">\n  ${themeStyleBlock}\n  <script>\n    window.addEventListener("error", function(e) {\n      console.error("[Omni Sandbox Error: ${this.manifest.id}]", e.message, e.filename, e.lineno);\n    });\n    ${safeRouteInjectionScript}\n  </script>\n  <script>\n    ${safeRuntimeCode}\n  </script>\n`;

      if (this.iframe) {
        if (/<head\b[^>]*>/i.test(pluginCode)) {
          this.iframe.srcdoc = pluginCode.replace(/<head\b[^>]*>/i, (match) => `${match}${injectedHead}`);
        } else if (/<html\b[^>]*>/i.test(pluginCode)) {
          this.iframe.srcdoc = pluginCode.replace(/<html\b[^>]*>/i, (match) => `${match}\n<head>${injectedHead}</head>`);
        } else {
          this.iframe.srcdoc = `<!DOCTYPE html>\n<html>\n<head>${injectedHead}</head>\n<body>\n${pluginCode}\n</body>\n</html>`;
        }
      }
    } else {
      const safeModuleCode = pluginCode
        .replace(/<\/script/gi, "<\\/script")
        .replace(/export\s*\{[\s\S]*?\}\s*;?/g, "")
        .replace(/^\s*export\s+(async\s+function|function|class|const|let|var)\s+/gm, "$1 ");
      const hasEsModuleSyntax = /^\s*(import|export)\s+/m.test(safeModuleCode);
      const scriptBlock = hasEsModuleSyntax
        ? `<script type="module">\n${safeModuleCode}\n</script>`
        : `<script>\n(async () => {\n${safeModuleCode}\n})();\n</script>`;
      if (this.iframe) {
        this.iframe.srcdoc = `<!DOCTYPE html>
<html data-theme-mode="${resolvedTheme.mode}">
<head>
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  ${themeStyleBlock}
  <script>
    window.addEventListener("error", function(e) {
      console.error("[Omni Sandbox Error: ${this.manifest.id}]", e.message, e.filename, e.lineno);
    });
    ${safeRouteInjectionScript}
  </script>
  <script>
    ${safeRuntimeCode}
  </script>
</head>
<body>
  ${scriptBlock}
</body>
</html>`;
      }
    }

    // 6. Append to document and perform handshake on load
    await new Promise<void>((resolve) => {
      let resolved = false;
      let handshakeCount = 0;

      const sendInitHandshake = () => {
        if (!this.iframe) return;
        if (handshakeCount > 0) {
          // If the iframe was reparented in the DOM and reloaded srcdoc, allocate fresh MessageChannels
          try {
            this.channel1?.port1.close();
            this.channel1?.port2.close();
          } catch (_) {}
          try {
            this.channel2?.port1.close();
            this.channel2?.port2.close();
          } catch (_) {}
          this.channel1 = new MessageChannel();
          this.channel2 = new MessageChannel();
          this.channel1.port1.onmessage = (event) => {
            applySchema(event.data);
          };
          this.dispatcher?.setPort(this.channel2.port1);
        }
        handshakeCount++;

        const currentTheme = this.resolveHostThemeTokens();
        const initMsg: OmniInitMessage = {
          type: "omni:init",
          payload: {
            pluginId: this.manifest.id,
            instanceId: this.options.instanceId || `inst_${Math.random().toString(36).slice(2, 9)}`,
            userPubkey: this.options.userPubkey,
            theme: currentTheme as any,
            slots: Array.from(this.options.slotContainers.keys()),
            components: this.manifest.components?.map(c => c.id) || ["main"],
            route: routeVal,
            viewId: viewIdVal,
            storage: initialStorageMap
          }
        };

        // Transfer channel1 port2 (Schema Bus) and channel2 port2 (Kernel RPC) to iframe
        try {
          const cw = this.iframe?.contentWindow as any;
          if (cw) {
            try {
              cw.__omniTransferPorts = [this.channel1!.port2, this.channel2!.port2];
            } catch (_) {}
            cw.postMessage(initMsg, "*", [
              this.channel1!.port2,
              this.channel2!.port2
            ]);
          }
        } catch (e) {
          console.error(`[SandboxInstance] Failed to postMessage handshake:`, e);
        }

        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      const doHandshake = () => {
        if (resolved) return;
        sendInitHandshake();
      };

      const onMessage = (event: MessageEvent) => {
        if (
          event.data?.type === "omni:guest-ready" &&
          (event.source === this.iframe?.contentWindow ||
            (!resolved && event.data?.pluginId === this.manifest.id))
        ) {
          sendInitHandshake();
        }
      };

      if (typeof window !== "undefined") {
        window.addEventListener("message", onMessage);
        this.cleanupFns.push(() => {
          window.removeEventListener("message", onMessage);
        });
      }

      if (this.iframe) {
        this.iframe.onload = () => {
          if (!resolved) {
            sendInitHandshake();
          }
        };
        if (primaryIframeContainer && !this.iframe.parentNode) {
          primaryIframeContainer.appendChild(this.iframe);
        } else if (!this.iframe.parentNode) {
          // Headless execution for schema plugins
          this.iframe.style.display = "none";
          this.iframe.style.position = "absolute";
          this.iframe.style.width = "0";
          this.iframe.style.height = "0";
          this.iframe.style.border = "none";
          this.iframe.style.visibility = "hidden";
          this.iframe.style.pointerEvents = "none";
          document.body.appendChild(this.iframe);
        }
      } else {
        resolve();
        return;
      }

      // Fast fallback timeout: Ensure promise resolves even if browser load event was missed or delayed
      setTimeout(() => {
        if (!resolved) {
          doHandshake();
        }
      }, 50);
    });
  }

  public dispatchHistoryPopstate(delta: number, state: any, url?: string, pageId?: string): void {
    const resolvedPageId =
      pageId ||
      (state && typeof state === "object" && typeof state.pageId === "string" ? state.pageId : null) ||
      (state === null && (!url || url === "") ? this.rootPageId : null);

    this.isRestoringPopstate = true;
    try {
      if (resolvedPageId) {
        this.currentPageId = resolvedPageId;
        const snapshot = this.pageSnapshots.get(resolvedPageId);
        if (snapshot) {
          const renderer = this.schemaRenderers.values().next().value;
          if (renderer) {
            renderer.render(snapshot.schema);
          }
        }
      }
      if (this.wasmHost) {
        this.wasmHost.dispatchAction("main", { name: "back-to-feed" }, { isBack: true });
      }
      if (this.channel2 && this.channel2.port1) {
        this.channel2.port1.postMessage({
          jsonrpc: "2.0",
          method: "history.popstate",
          params: { delta, state, url, pageId: resolvedPageId ?? undefined }
        });
      }
    } finally {
      setTimeout(() => {
        this.isRestoringPopstate = false;
      }, 25);
    }
  }

  public setUserPubkey(pubkey: string): void {
    this.options.userPubkey = pubkey;
    if (this.channel2 && this.channel2.port1) {
      this.channel2.port1.postMessage({
        jsonrpc: "2.0",
        method: "auth.keyChanged",
        params: { pubkey }
      });
    }
  }

  destroy(): void {
    for (const cleanup of this.cleanupFns) {
      try {
        cleanup();
      } catch (_) {}
    }
    this.cleanupFns = [];

    if (this.dispatcher) {
      this.dispatcher.destroy();
    }
    if (this.workerHost) {
      this.workerHost.destroy();
      this.workerHost = null;
    }
    if (this.wasmHost) {
      this.wasmHost.destroy();
      this.wasmHost = null;
    }
    for (const renderer of this.schemaRenderers.values()) {
      renderer.destroy();
    }
    this.schemaRenderers.clear();
    for (const appHost of this.iframeAppHosts.values()) {
      appHost.destroy();
    }
    this.iframeAppHosts.clear();

    for (const container of this.compContainers) {
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    }
    this.compContainers = [];
    this.compContainersByCompId.clear();

    if (this.channel1) {
      this.channel1.port1.close();
      this.channel1.port2.close();
    }
    if (this.channel2) {
      this.channel2.port1.close();
      this.channel2.port2.close();
    }

    if (this.iframe && this.iframe.parentNode) {
      this.iframe.parentNode.removeChild(this.iframe);
      this.iframe = null;
    }
  }
}
