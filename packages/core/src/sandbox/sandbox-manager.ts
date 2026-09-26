import { OmniManifest, OmniInitMessage } from "@omni/types";
import { RemoteDomHost } from "../remote-dom/remote-dom-host.js";
import { JsonRpcDispatcher } from "../ipc/json-rpc-dispatcher.js";
import { AclEngine } from "../acl/acl-engine.js";
import { PluginStorageManager } from "../storage/plugin-storage-manager.js";
import { IntentBroker } from "../intents/intent-broker.js";
import { SubscriptionCoordinator } from "../nostr/subscription-coordinator.js";
import { WebCryptoKeystore } from "../crypto/webcrypto-keystore.js";
import { RelayPool } from "../nostr/relay-pool.js";

export interface SandboxInstanceOptions {
  manifest: OmniManifest;
  scriptContent: string;
  runtimeUrl?: string;
  userPubkey: string;
  slotContainers: Map<string, Element>; // Map of slot name -> DOM Element
  aclEngine: AclEngine;
  storageManager: PluginStorageManager;
  intentBroker: IntentBroker;
  subscriptionCoordinator: SubscriptionCoordinator;
  keystore: WebCryptoKeystore;
  relayPool: RelayPool;
  onSlotAction?: (action: "toggle" | "open" | "close", slot: string) => void;
}

export class SandboxInstance {
  readonly manifest: OmniManifest;
  private iframe: HTMLIFrameElement | null = null;
  private remoteDomHosts: Map<string, RemoteDomHost> = new Map();
  private compContainers: Element[] = [];
  private dispatcher: JsonRpcDispatcher | null = null;
  private channel1: MessageChannel | null = null;
  private channel2: MessageChannel | null = null;

  constructor(private options: SandboxInstanceOptions) {
    this.manifest = options.manifest;
  }

  async mount(): Promise<void> {
    if (typeof document === "undefined") return;

    // 1. Create hidden iframe with strict isolation
    this.iframe = document.createElement("iframe");
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
        const host = compId ? this.remoteDomHosts.get(compId) : null;
        if (host && Array.isArray(data.records)) {
          host.mutate(data.records);
        } else if (Array.isArray(data.records)) {
          for (const h of this.remoteDomHosts.values()) {
            h.mutate(data.records);
          }
        }
      } else if (data.type === "call" && data.id && data.method) {
        const compId = data.componentId;
        const host = compId ? this.remoteDomHosts.get(compId) : null;
        if (host) {
          host.call(data.id, data.method, data.args);
        }
      }
    };

    // 3. Mount Remote DOM Host to target slot containers
    for (const comp of this.manifest.components) {
      const slotContainer = this.options.slotContainers.get(comp.slot);
      if (slotContainer) {
        const compContainer = document.createElement("div");
        compContainer.className = `omni-component-slot omni-comp-${comp.id}`;
        slotContainer.appendChild(compContainer);
        this.compContainers.push(compContainer);

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
      onSlotAction: this.options.onSlotAction
    });

    // 5. Build srcdoc injecting omni-runtime.js + plugin script
    const runtimeUrl = this.options.runtimeUrl || "/omni-runtime.js";
    const csp = "default-src 'none'; script-src 'unsafe-inline' blob: 'self'; style-src 'unsafe-inline';";

    this.iframe.srcdoc = `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <script src="${runtimeUrl}"></script>
</head>
<body>
  <script type="module">
    // Execute plugin bundle once runtime has loaded
    try {
      ${this.options.scriptContent}
    } catch (err) {
      console.error("[Omni Sandbox Error] Failed to execute plugin ${this.manifest.id}:", err);
    }
  </script>
</body>
</html>`;

    // 6. Append to document and perform handshake on load
    document.body.appendChild(this.iframe);

    await new Promise<void>((resolve) => {
      this.iframe!.onload = () => {
        const initMsg: OmniInitMessage = {
          type: "omni:init",
          payload: {
            pluginId: this.manifest.id,
            instanceId: `inst_${Math.random().toString(36).slice(2, 9)}`,
            userPubkey: this.options.userPubkey,
            theme: {
              mode: "dark",
              colors: {
                canvas: "#141312",
                surface: "#191816",
                accent: "#d4a373"
              }
            },
            slots: Array.from(this.options.slotContainers.keys())
          }
        };

        // Transfer channel1 port2 (Remote DOM) and channel2 port2 (Kernel RPC) to iframe
        this.iframe!.contentWindow?.postMessage(initMsg, "*", [
          this.channel1!.port2,
          this.channel2!.port2
        ]);

        resolve();
      };
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
