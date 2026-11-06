import { JsonRpcDispatcher } from "../ipc/json-rpc-dispatcher.js";

export interface IframeAppHostOptions {
  container: HTMLElement;
  pluginId: string;
  src?: string;
  htmlContent?: string;
  dispatcher?: JsonRpcDispatcher;
  themeTokens?: Record<string, string>;
  onHandleUri?: (uri: string, sourcePluginId: string) => Promise<any>;
}

export const OMNI_DEFAULT_DESIGN_TOKENS: Record<string, string> = {
  "--omni-bg-canvas": "#141312",
  "--omni-bg-surface": "#191816",
  "--omni-bg-elevated": "#22201d",
  "--omni-text-primary": "#ede8df",
  "--omni-text-secondary": "#9e988f",
  "--omni-text-muted": "#6b665f",
  "--omni-border-subtle": "#272522",
  "--omni-border-strong": "#383530",
  "--omni-accent-primary": "#d4a373",
  "--omni-radius-sm": "6px",
  "--omni-radius-md": "10px",
  "--omni-font-sans": "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  "--omni-font-mono": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
};

/**
 * Builds standard CSS tokens style tag string to inject into guest iframes.
 */
export function buildTokenStyleTag(tokens: Record<string, string> = OMNI_DEFAULT_DESIGN_TOKENS): string {
  const rules = Object.entries(tokens)
    .map(([prop, val]) => `  ${prop}: ${val};`)
    .join("\n");
  return `<style id="omni-design-tokens">\n:root {\n${rules}\n}\n</style>`;
}

/**
 * Generates the minimal standard web bridge script for direct visual iframes.
 * Provides standard window.nostr (NIP-07) and protocol link routing.
 */
export function buildGuestBridgeScript(pluginId: string): string {
  return `<script id="omni-guest-bridge">
(function() {
  var pluginId = "${pluginId}";
  var rpcSeq = 1;
  var pending = new Map();

  window.addEventListener("message", function(e) {
    var data = e.data;
    if (data && data.__omni_rpc_response && pending.has(data.id)) {
      var p = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) p.reject(data.error);
      else p.resolve(data.result);
    }
  });

  function callRpc(method, params) {
    return new Promise(function(resolve, reject) {
      var id = "rpc_" + (rpcSeq++);
      pending.set(id, { resolve: resolve, reject: reject });
      window.parent.postMessage({
        __omni_rpc_request: true,
        pluginId: pluginId,
        id: id,
        method: method,
        params: params
      }, "*");
    });
  }

  // Standard NIP-07 Signer (window.nostr)
  window.nostr = {
    getPublicKey: function() { return callRpc("nostr.getPublicKey"); },
    signEvent: function(event) { return callRpc("nostr.signEvent", { event: event }); },
    getRelays: function() { return callRpc("nostr.getRelays"); },
    nip04: {
      encrypt: function(pubkey, text) { return callRpc("nostr.nip04Encrypt", { pubkey: pubkey, plaintext: text }); },
      decrypt: function(pubkey, ciphertext) { return callRpc("nostr.nip04Decrypt", { pubkey: pubkey, ciphertext: ciphertext }); }
    },
    nip44: {
      encrypt: function(pubkey, text) { return callRpc("nostr.nip44Encrypt", { pubkey: pubkey, plaintext: text }); },
      decrypt: function(pubkey, ciphertext) { return callRpc("nostr.nip44Decrypt", { pubkey: pubkey, ciphertext: ciphertext }); }
    }
  };

  // Intercept standard protocol links (nostr:, lightning:, cashu:)
  document.addEventListener("click", function(e) {
    var anchor = e.target.closest("a");
    if (anchor && anchor.href) {
      var href = anchor.getAttribute("href") || "";
      if (href.startsWith("nostr:") || href.startsWith("lightning:") || href.startsWith("cashu:")) {
        e.preventDefault();
        window.parent.postMessage({
          __omni_uri_intent: true,
          pluginId: pluginId,
          uri: href
        }, "*");
      }
    }
  }, true);
})();
</script>`;
}

export class IframeAppHost {
  private iframe: HTMLIFrameElement;
  private container: HTMLElement;
  private messageListener: ((e: MessageEvent) => void) | null = null;
  private dispatcher?: JsonRpcDispatcher;
  private onHandleUri?: (uri: string, sourcePluginId: string) => Promise<any>;
  readonly pluginId: string;

  constructor(options: IframeAppHostOptions) {
    this.container = options.container;
    this.pluginId = options.pluginId;
    this.dispatcher = options.dispatcher;
    this.onHandleUri = options.onHandleUri;

    this.iframe = document.createElement("iframe");
    this.iframe.className = `omni-app-iframe omni-app-${options.pluginId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    this.iframe.setAttribute(
      "sandbox",
      "allow-scripts allow-forms allow-modals allow-popups allow-downloads"
    );
    this.iframe.style.width = "100%";
    this.iframe.style.height = "100%";
    this.iframe.style.border = "none";
    this.iframe.style.display = "block";
    this.iframe.style.minHeight = "100%";
    this.iframe.style.flex = "1";

    this.setupMessageListener();
    this.mountContent(options);
    this.container.appendChild(this.iframe);
  }

  getIframe(): HTMLIFrameElement {
    return this.iframe;
  }

  private mountContent(options: IframeAppHostOptions): void {
    const tokens = options.themeTokens || OMNI_DEFAULT_DESIGN_TOKENS;
    const tokenStyle = buildTokenStyleTag(tokens);
    const bridgeScript = buildGuestBridgeScript(this.pluginId);

    if (options.htmlContent) {
      let html = options.htmlContent;
      // Inject token styles and bridge script right before </head> or <body>
      const headIdx = html.indexOf("</head>");
      if (headIdx !== -1) {
        html = html.slice(0, headIdx) + `${tokenStyle}\n${bridgeScript}\n` + html.slice(headIdx);
      } else {
        html = `<!DOCTYPE html><html><head>${tokenStyle}\n${bridgeScript}</head><body>${html}</body></html>`;
      }
      this.iframe.srcdoc = html;
    } else if (options.src) {
      this.iframe.src = options.src;
    }
  }

  private setupMessageListener(): void {
    this.messageListener = async (e: MessageEvent) => {
      // Security check: ensure event source matches our iframe
      if (e.source !== this.iframe.contentWindow) return;
      const data = e.data;
      if (!data) return;

      // Handle JSON-RPC request from guest
      if (data.__omni_rpc_request && this.dispatcher) {
        try {
          const result = await this.dispatcher.dispatchRaw({
            jsonrpc: "2.0",
            id: data.id,
            method: data.method,
            params: data.params
          });
          this.iframe.contentWindow?.postMessage(
            {
              __omni_rpc_response: true,
              id: data.id,
              result: result?.result,
              error: result?.error
            },
            "*"
          );
        } catch (err: any) {
          this.iframe.contentWindow?.postMessage(
            {
              __omni_rpc_response: true,
              id: data.id,
              error: { code: -32603, message: err?.message || String(err) }
            },
            "*"
          );
        }
      }

      // Handle protocol URI intent from guest
      if (data.__omni_uri_intent && data.uri && this.onHandleUri) {
        this.onHandleUri(data.uri, this.pluginId).catch((err) => {
          console.warn(`[Omni] Error handling URI intent ${data.uri}:`, err);
        });
      }
    };

    window.addEventListener("message", this.messageListener);
  }

  destroy(): void {
    if (this.messageListener) {
      window.removeEventListener("message", this.messageListener);
      this.messageListener = null;
    }
    this.iframe.remove();
  }
}
