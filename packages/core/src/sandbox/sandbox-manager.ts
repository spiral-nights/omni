import { OmniManifest, OmniInitMessage } from "@omni/types";
import { RemoteDomHost } from "../remote-dom/remote-dom-host.js";
import { JsonRpcDispatcher } from "../ipc/json-rpc-dispatcher.js";
import { AclEngine } from "../acl/acl-engine.js";
import { PluginStorageManager } from "../storage/plugin-storage-manager.js";
import { IntentBroker } from "../intents/intent-broker.js";
import { SubscriptionCoordinator } from "../nostr/subscription-coordinator.js";
import { WebCryptoKeystore } from "../crypto/webcrypto-keystore.js";
import { RelayPool } from "../nostr/relay-pool.js";
import { LocalEventStore } from "../nostr/event-store.js";
import { DEFAULT_OMNI_RUNTIME } from "./default-runtime.js";

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
  onSlotAction?: (action: "toggle" | "open" | "close", slot: string) => void;
  onHandleUri?: (uri: string, sourcePluginId: string) => Promise<any>;
  onHandleShare?: (payload: any, sourcePluginId: string) => Promise<any>;
  theme?: any;
}

export class SandboxInstance {
  readonly manifest: OmniManifest;
  private iframe: HTMLIFrameElement | null = null;
  private remoteDomHosts: Map<string, RemoteDomHost> = new Map();
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

  async mount(): Promise<void> {
    if (typeof document === "undefined") return;

    // 1. Determine privilege & sandboxing rules
    // System UI plugins and trusted plugins are exempt from strict opaque origin isolation
    const isTrusted =
      this.options.trusted === true ||
      this.manifest.trusted === true ||
      this.manifest.id.startsWith("org.omni.plugin.") ||
      this.manifest.id.startsWith("org.omni.system") ||
      this.manifest.id.startsWith("org.omni.core");

    this.iframe = document.createElement("iframe");
    // Use strict allow-scripts without allow-same-origin to prevent browser sandbox elevation warnings
    // and maintain proper origin isolation (opaque 'null' origin).
    this.iframe.setAttribute("sandbox", "allow-scripts");
    this.iframe.style.display = "none";
    this.iframe.setAttribute("data-plugin-id", this.manifest.id);

    // 2. Setup MessageChannels
    this.channel1 = new MessageChannel(); // Port 1: Remote DOM
    this.channel2 = new MessageChannel(); // Port 2: Kernel RPC

    // Handle incoming Remote DOM mutations and calls from sandbox
    this.channel1.port1.onmessage = (event) => {
      const data = event.data;
      if (!data) return;

      if (data.type === "mutate") {
        const compId = data.componentId;
        const host = (compId ? this.remoteDomHosts.get(compId) : null) || (this.remoteDomHosts.size === 1 ? this.remoteDomHosts.values().next().value : null);
        if (host && Array.isArray(data.records)) {
          host.mutate(data.records);
        } else if (Array.isArray(data.records)) {
          for (const h of this.remoteDomHosts.values()) {
            h.mutate(data.records);
          }
        }
      } else if (data.type === "call" && data.id && data.method) {
        const compId = data.componentId;
        const host = (compId ? this.remoteDomHosts.get(compId) : null) || (this.remoteDomHosts.size === 1 ? this.remoteDomHosts.values().next().value : null);
        if (host) {
          host.call(data.id, data.method, data.args);
        }
      }
    };

    // 3. Mount Remote DOM Host to target slot containers
    for (const comp of this.manifest.components) {
      let slotContainer: Element | undefined | null = null;
      if (this.options.slotResolver) {
        slotContainer = this.options.slotResolver(this.manifest.id, comp.id, comp.slot);
      }
      if (!slotContainer) {
        slotContainer = this.options.slotContainers.get(comp.slot);
      }

      if (slotContainer) {
        const compContainer = document.createElement("div");
        compContainer.className = `omni-component-slot omni-comp-${comp.id}`;
        slotContainer.appendChild(compContainer);
        this.compContainers.push(compContainer);
        this.compContainersByCompId.set(comp.id, compContainer);

        const domHost = new RemoteDomHost({
          container: compContainer,
          componentId: comp.id,
          onEvent: (componentId, eventData) => {
            this.channel1?.port1.postMessage({
              type: "event",
              componentId,
              ...eventData
            });
          }
        });
        this.remoteDomHosts.set(comp.id, domHost);
      }
    }

    if (this.remoteDomHosts.size === 0) {
      const fallbackContainer = this.options.slotResolver
        ? this.options.slotResolver(this.manifest.id, "main", "main")
        : (this.options.slotContainers.get("settings") ||
           this.options.slotContainers.get("main") ||
           this.options.slotContainers.values().next().value);

      if (fallbackContainer) {
        const compContainer = document.createElement("div");
        compContainer.className = `omni-component-slot omni-comp-fallback`;
        fallbackContainer.appendChild(compContainer);
        this.compContainers.push(compContainer);

        const domHost = new RemoteDomHost({
          container: compContainer,
          componentId: "main",
          onEvent: (componentId, eventData) => {
            this.channel1?.port1.postMessage({
              type: "event",
              componentId,
              ...eventData
            });
          }
        });
        this.remoteDomHosts.set("main", domHost);
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
      onHandleUri: this.options.onHandleUri,
      onHandleShare: this.options.onHandleShare
    });

    // 5. Build srcdoc injecting omni-runtime.js + plugin script
    const csp = isTrusted
      ? "default-src 'self' 'unsafe-inline' blob: http: https: data:; style-src 'unsafe-inline' 'self'; connect-src *;"
      : "default-src 'none'; script-src 'unsafe-inline' blob: 'self' http: https:; style-src 'unsafe-inline'; connect-src 'none';";

    const baseHref = typeof window !== "undefined" && window.location?.origin
      ? `${window.location.origin}/`
      : "/";

    // Strip any sourceMappingURL and sourceURL comments to prevent DevTools URL constructor errors on about:srcdoc
    const runtimeCode = (this.options.runtimeScript || DEFAULT_OMNI_RUNTIME)
      .replace(/\/\/[#@]\s*sourceMappingURL=[^\r\n]*/gi, "")
      .replace(/\/\*#\s*sourceMappingURL=[\s\S]*?\*\//gi, "")
      .replace(/\/\/[#@]\s*sourceURL=[^\r\n]*/gi, "");

    const pluginCode = (this.options.scriptContent || "")
      .replace(/\/\/[#@]\s*sourceMappingURL=[^\r\n]*/gi, "")
      .replace(/\/\*#\s*sourceMappingURL=[\s\S]*?\*\//gi, "")
      .replace(/\/\/[#@]\s*sourceURL=[^\r\n]*/gi, "");

    const isHtmlDoc = pluginCode.trim().startsWith("<!DOCTYPE") ||
      pluginCode.trim().startsWith("<html") ||
      /<head\b/i.test(pluginCode) ||
      /<body\b/i.test(pluginCode);

    const routeVal = this.options.route || "";
    const viewIdVal = this.options.viewId || "main";

    const routeInjectionScript = `
    // Transparent Sub-View & Route Injection for Pure nsites
    try {
      window.__omniPendingInit = null;
      window.addEventListener("message", function(e) {
        if (e.data && e.data.type === "omni:init") {
          window.__omniPendingInit = e;
        }
      });
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "omni:guest-ready", pluginId: ${JSON.stringify(this.manifest.id)} }, "*");
      }
    } catch (_) {}
    try {
      var __omniRoute = ${JSON.stringify(routeVal)};
      if (__omniRoute) {
        window.__OMNI_ROUTE__ = __omniRoute;
        if (__omniRoute.startsWith("#")) {
          window.location.hash = __omniRoute;
        } else if (__omniRoute.startsWith("?")) {
          window.location.hash = __omniRoute.replace("?", "#");
        }
      }
    } catch (_) {}
    `;

    if (isHtmlDoc) {
      const injectedHead = `\n  <base href="${baseHref}">\n  <meta http-equiv="Content-Security-Policy" content="${csp}">\n  <script>\n    window.addEventListener("error", function(e) {\n      console.error("[Omni Sandbox Error: ${this.manifest.id}]", e.message, e.filename, e.lineno);\n    });\n    ${routeInjectionScript}\n  </script>\n  <script>\n    ${runtimeCode}\n  </script>\n`;

      if (/<head\b[^>]*>/i.test(pluginCode)) {
        this.iframe.srcdoc = pluginCode.replace(/<head\b[^>]*>/i, (match) => `${match}${injectedHead}`);
      } else if (/<html\b[^>]*>/i.test(pluginCode)) {
        this.iframe.srcdoc = pluginCode.replace(/<html\b[^>]*>/i, (match) => `${match}\n<head>${injectedHead}</head>`);
      } else {
        this.iframe.srcdoc = `<!DOCTYPE html>\n<html>\n<head>${injectedHead}</head>\n<body>\n${pluginCode}\n</body>\n</html>`;
      }
    } else {
      this.iframe.srcdoc = `<!DOCTYPE html>
<html>
<head>
  <base href="${baseHref}">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <script>
    window.addEventListener("error", function(e) {
      console.error("[Omni Sandbox Error: ${this.manifest.id}]", e.message, e.filename, e.lineno);
    });
    ${routeInjectionScript}
  </script>
  <script>
    ${runtimeCode}
  </script>
</head>
<body>
  <script type="module">
    ${pluginCode}
  </script>
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
            viewId: viewIdVal
          }
        };

        // Transfer channel1 port2 (Remote DOM) and channel2 port2 (Kernel RPC) to iframe
        try {
          this.iframe?.contentWindow?.postMessage(initMsg, "*", [
            this.channel1!.port2,
            this.channel2!.port2
          ]);
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
        document.body.appendChild(this.iframe);
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

  destroy(): void {
    if (this.dispatcher) {
      this.dispatcher.destroy();
    }
    for (const host of this.remoteDomHosts.values()) {
      host.destroy();
    }
    this.remoteDomHosts.clear();

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
