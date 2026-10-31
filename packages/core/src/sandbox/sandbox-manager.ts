import { OmniManifest, OmniInitMessage, OmniComponentNode } from "@omni/types";
import { SchemaRenderer } from "../schema/schema-renderer.js";
import { IframeAppHost } from "./iframe-app-host.js";
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
  const matchingView = manifest.views?.find(
    (v) => v.id === viewId || (route && v.path && route.includes(v.path))
  );
  if (matchingView?.format === "schema") {
    return true;
  }
  if (matchingView?.format === "iframe") {
    return false;
  }
  if (manifest.id === "org.omni.plugin.checklist") {
    return true;
  }
  if (manifest.id === "org.omni.plugin.feed") {
    if (route && route.includes("format=iframe")) return false;
    return true;
  }
  if (
    scriptContent &&
    (scriptContent.includes('type="application/json"#omni-schema') ||
      scriptContent.includes('id="omni-schema"') ||
      scriptContent.includes('type="omni:schema"'))
  ) {
    return true;
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
  scriptContent: string;
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
  allowedRelays?: string[];
  onSlotAction?: (action: "toggle" | "open" | "close" | "scrollToTop", slot: string) => void;
  onScrollTo?: (params: any) => void;
  onHandleUri?: (uri: string, sourcePluginId: string) => Promise<any>;
  onHandleShare?: (payload: any, sourcePluginId: string) => Promise<any>;
  onHistoryPush?: (params: { state: any; title: string; url: string }) => Promise<any> | any;
  onHistoryReplace?: (params: { state: any; title: string; url: string }) => Promise<any> | any;
  onHistoryBack?: () => Promise<any> | any;
  onHistoryGo?: (delta?: number) => Promise<any> | any;
  theme?: any;
  useShadowDom?: boolean;
}

export class SandboxInstance {
  readonly manifest: OmniManifest;
  private iframe: HTMLIFrameElement | null = null;
  private schemaRenderers: Map<string, SchemaRenderer> = new Map();
  private iframeAppHosts: Map<string, IframeAppHost> = new Map();
  private compContainers: Element[] = [];
  private compContainersByCompId: Map<string, Element> = new Map();
  private dispatcher: JsonRpcDispatcher | null = null;
  private channel1: MessageChannel | null = null;
  private channel2: MessageChannel | null = null;

  constructor(private options: SandboxInstanceOptions) {
    this.manifest = options.manifest;
  }

  getComponentContainer(componentId: string): Element | undefined {
    return this.compContainersByCompId.get(componentId);
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
    this.iframe.style.display = "none";
    this.iframe.setAttribute("data-plugin-id", this.manifest.id);

    // 2. Setup MessageChannels
    this.channel1 = new MessageChannel(); // Port 1: Schema / Action bus
    this.channel2 = new MessageChannel(); // Port 2: Kernel RPC

    // Handle incoming Schema updates from sandbox
    this.channel1.port1.onmessage = (event) => {
      const data = event.data;
      if (!data) return;

      if (data.type === "schema" && data.schema) {
        const compId = data.componentId;
        const renderer =
          (compId ? this.schemaRenderers.get(compId) : null) ||
          (this.schemaRenderers.size === 1
            ? this.schemaRenderers.values().next().value
            : null);
        if (renderer) {
          if (this.iframe && this.iframe.style.display !== "none") {
            this.iframe.style.display = "none";
          }
          renderer.render(data.schema);
        }
      }
    };

    // 3. Mount UI View (Schema Custom Elements or Direct Visual Iframe)
    const isSchema = isSchemaView(
      this.manifest,
      this.options.route,
      this.options.viewId,
      this.options.scriptContent
    );

    const compDeclarations =
      this.manifest.components && this.manifest.components.length > 0
        ? this.manifest.components
        : [{ id: "main", type: "main" as const, title: this.manifest.name, slot: "main" }];

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
        const existing = slotContainer.querySelector(`.omni-comp-${comp.id}`);
        if (existing) {
          existing.remove();
        }

        const compContainer = document.createElement("div");
        compContainer.className = `omni-component-slot omni-comp-${comp.id}`;
        compContainer.style.width = "100%";
        compContainer.style.height = "100%";
        compContainer.style.display = "flex";
        compContainer.style.flexDirection = "column";
        slotContainer.appendChild(compContainer);
        this.compContainers.push(compContainer);
        this.compContainersByCompId.set(comp.id, compContainer);

        const schemaRenderer = new SchemaRenderer({
          container: compContainer,
          onAction: (action, payload) => {
            if (action.navigate?.route && this.options.onHandleUri) {
              this.options.onHandleUri(action.navigate.route, this.manifest.id);
            }
            try {
              this.channel1?.port1.postMessage({
                type: "action",
                componentId: comp.id,
                action,
                payload
              });
            } catch (_) {}
          }
        });
        this.schemaRenderers.set(comp.id, schemaRenderer);

        if (!isSchema && !this.iframe.parentNode) {
          // Direct Iframe View: render visible app iframe into the primary container
          this.iframe.style.display = "block";
          this.iframe.style.width = "100%";
          this.iframe.style.height = "100%";
          this.iframe.style.border = "none";
          this.iframe.style.minHeight = "100%";
          this.iframe.style.flex = "1";
          this.iframe.style.position = "static";
          this.iframe.style.visibility = "visible";
          compContainer.appendChild(this.iframe);
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

    const pluginCode = (this.options.scriptContent || "")
      .replace(/\/\/[#@]\s*sourceMappingURL=[^\r\n]*/gi, "")
      .replace(/\/\*#\s*sourceMappingURL=[\s\S]*?\*\//gi, "")
      .replace(/\/\/[#@]\s*sourceURL=[^\r\n]*/gi, "");

    const trimmedPluginCode = pluginCode.trim();
    const isHtmlDoc =
      trimmedPluginCode.startsWith("<") &&
      (trimmedPluginCode.startsWith("<!DOCTYPE") ||
        trimmedPluginCode.startsWith("<html") ||
        /<head\b/i.test(trimmedPluginCode) ||
        /<body\b/i.test(trimmedPluginCode) ||
        /^<[a-zA-Z!]/.test(trimmedPluginCode));

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

    if (isHtmlDoc) {
      const injectedHead = `\n  <meta http-equiv="Content-Security-Policy" content="${csp}">\n  <script>\n    window.addEventListener("error", function(e) {\n      console.error("[Omni Sandbox Error: ${this.manifest.id}]", e.message, e.filename, e.lineno);\n    });\n    ${safeRouteInjectionScript}\n  </script>\n  <script>\n    ${safeRuntimeCode}\n  </script>\n`;

      if (/<head\b[^>]*>/i.test(pluginCode)) {
        this.iframe.srcdoc = pluginCode.replace(/<head\b[^>]*>/i, (match) => `${match}${injectedHead}`);
      } else if (/<html\b[^>]*>/i.test(pluginCode)) {
        this.iframe.srcdoc = pluginCode.replace(/<html\b[^>]*>/i, (match) => `${match}\n<head>${injectedHead}</head>`);
      } else {
        this.iframe.srcdoc = `<!DOCTYPE html>\n<html>\n<head>${injectedHead}</head>\n<body>\n${pluginCode}\n</body>\n</html>`;
      }
    } else {
      const safeModuleCode = pluginCode
        .replace(/<\/script/gi, "<\\/script")
        .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, "");
      const hasEsModuleSyntax = /^\s*(import|export)\s+/m.test(safeModuleCode);
      const scriptBlock = hasEsModuleSyntax
        ? `<script type="module">\n${safeModuleCode}\n</script>`
        : `<script>\n(async () => {\n${safeModuleCode}\n})();\n</script>`;
      this.iframe.srcdoc = `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Security-Policy" content="${csp}">
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

    // 6. Append to document and perform handshake on load
    await new Promise<void>((resolve) => {
      let resolved = false;
      const doHandshake = () => {
        if (resolved) return;
        resolved = true;
        if (typeof window !== "undefined" && onMessage) {
          window.removeEventListener("message", onMessage);
        }

        const initMsg: OmniInitMessage = {
          type: "omni:init",
          payload: {
            pluginId: this.manifest.id,
            instanceId: this.options.instanceId || `inst_${Math.random().toString(36).slice(2, 9)}`,
            userPubkey: this.options.userPubkey,
            theme: this.options.theme || {
              mode: "dark",
              colors: {
                canvas: "#141312",
                surface: "#191816",
                accent: "#d4a373"
              }
            },
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

        resolve();
      };

      const onMessage = (event: MessageEvent) => {
        if (
          event.data?.type === "omni:guest-ready" &&
          (event.source === this.iframe?.contentWindow || event.data?.pluginId === this.manifest.id)
        ) {
          doHandshake();
        }
      };

      if (typeof window !== "undefined") {
        window.addEventListener("message", onMessage);
      }

      if (this.iframe) {
        this.iframe.onload = doHandshake;
        this.iframe.addEventListener("load", doHandshake, { once: true });
        if (!this.iframe.parentNode) {
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
        if (typeof window !== "undefined") {
          window.removeEventListener("message", onMessage);
        }
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

  public dispatchHistoryPopstate(delta: number, state: any, url?: string): void {
    if (this.channel2 && this.channel2.port1) {
      this.channel2.port1.postMessage({
        jsonrpc: "2.0",
        method: "history.popstate",
        params: { delta, state, url }
      });
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
    if (this.dispatcher) {
      this.dispatcher.destroy();
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
