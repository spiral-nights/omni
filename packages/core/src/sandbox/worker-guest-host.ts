import { OmniInitMessage, OmniComponentNode } from "@omni/types";

export interface WorkerGuestHostOptions {
  pluginId: string;
  runtimeScript: string;
  pluginScript: string;
  channel1: MessageChannel;
  channel2: MessageChannel;
  initPayload: OmniInitMessage["payload"];
  onSchemaUpdate?: (schema: OmniComponentNode, componentId?: string) => void;
  onError?: (error: Error) => void;
}

export class WorkerGuestHost {
  private options: WorkerGuestHostOptions;
  private worker: Worker | null = null;
  private blobUrl: string | null = null;

  constructor(options: WorkerGuestHostOptions) {
    this.options = options;
    this.init();
  }

  private init(): void {
    if (typeof Worker === "undefined") {
      throw new Error("[WorkerGuestHost] Web Worker API is not supported in this environment.");
    }

    // Strip sourcemap comments
    const safeRuntimeCode = (this.options.runtimeScript || "")
      .replace(/\/\/[#@]\s*sourceMappingURL=[^\r\n]*/gi, "")
      .replace(/\/\*#\s*sourceMappingURL=[\s\S]*?\*\//gi, "")
      .replace(/\/\/[#@]\s*sourceURL=[^\r\n]*/gi, "");

    const rawPluginCode = (this.options.pluginScript || "")
      .replace(/\/\/[#@]\s*sourceMappingURL=[^\r\n]*/gi, "")
      .replace(/\/\*#\s*sourceMappingURL=[\s\S]*?\*\//gi, "")
      .replace(/\/\/[#@]\s*sourceURL=[^\r\n]*/gi, "");

    const safePluginCode = rawPluginCode.replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, "");
    const hasEsModuleSyntax = /^\s*(import|export)\s+/m.test(safePluginCode);

    // Hardened worker preamble: defangs host origin storage, caches, and raw network sockets
    const preamble = `
(function() {
  'use strict';

  // 1. Defang unmetered host origin storage & network
  try { delete self.indexedDB; } catch (_) {}
  try { delete self.caches; } catch (_) {}
  try { delete self.cookieStore; } catch (_) {}
  try { delete self.fetch; } catch (_) {}
  try { delete self.XMLHttpRequest; } catch (_) {}
  try { delete self.importScripts; } catch (_) {}
  try { delete self.WebSocket; } catch (_) {}

  // 2. Global aliasing for standard Web & Nostr guest scripts
  if (typeof self.window === 'undefined') {
    self.window = self;
  }
  if (typeof self.parent === 'undefined') {
    self.parent = self;
  }
  if (typeof self.top === 'undefined') {
    self.top = self;
  }

  // 3. Error monitoring
  self.addEventListener('error', function(e) {
    console.error('[Omni Worker Error: ' + ${JSON.stringify(this.options.pluginId)} + ']', e.message || e);
  });
})();
`;

    const configInjection = `
try {
  self.__OMNI_ROUTE__ = ${JSON.stringify(this.options.initPayload.route || "")};
  self.__OMNI_VIEW__ = ${JSON.stringify(this.options.initPayload.viewId || "main")};
  self.__OMNI_INITIAL_STORAGE__ = ${JSON.stringify(this.options.initPayload.storage || {})};
} catch (_) {}
`;

    const executionBlock = hasEsModuleSyntax
      ? safePluginCode
      : `(async function() {\n  try {\n${safePluginCode}\n  } catch (err) {\n    console.error('[Omni Worker Plugin Execution Error: ' + ${JSON.stringify(this.options.pluginId)} + ']', err);\n  }\n})();`;

    const workerScript = `${preamble}\n${safeRuntimeCode}\n${configInjection}\n${executionBlock}`;

    const blob = new Blob([workerScript], { type: "application/javascript" });
    this.blobUrl = URL.createObjectURL(blob);

    this.worker = new Worker(this.blobUrl, {
      type: hasEsModuleSyntax ? "module" : "classic",
      name: `omni-worker-${this.options.pluginId}`
    });

    // Handle schema updates or guest messages from worker
    this.worker.onmessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data) return;
      if ((data.type === "omni:schema" || data.type === "schema") && data.schema) {
        if (this.options.onSchemaUpdate) {
          this.options.onSchemaUpdate(data.schema, data.componentId);
        }
      }
    };

    this.worker.onerror = (err: ErrorEvent) => {
      console.error(`[WorkerGuestHost: ${this.options.pluginId}] Error:`, err.message || err);
      if (this.options.onError) {
        this.options.onError(new Error(err.message || "Worker execution error"));
      }
    };

    // Send initialization handshake with transferred ports
    const initMsg: OmniInitMessage = {
      type: "omni:init",
      payload: this.options.initPayload
    };

    try {
      this.worker.postMessage(initMsg, [
        this.options.channel1.port2,
        this.options.channel2.port2
      ]);
    } catch (e) {
      console.error(`[WorkerGuestHost: ${this.options.pluginId}] Failed to postMessage handshake:`, e);
    }
  }

  public getWorker(): Worker | null {
    return this.worker;
  }

  public getBlobUrl(): string | null {
    return this.blobUrl;
  }

  public postMessage(msg: any, transfer?: Transferable[]): void {
    if (!this.worker) return;
    try {
      if (transfer && transfer.length > 0) {
        this.worker.postMessage(msg, transfer);
      } else {
        this.worker.postMessage(msg);
      }
    } catch (e) {
      console.error(`[WorkerGuestHost: ${this.options.pluginId}] postMessage error:`, e);
    }
  }

  public dispatchAction(componentId: string, action: any, payload: any): void {
    try {
      if (this.worker) {
        this.worker.postMessage({
          type: "omni:action",
          componentId,
          action,
          payload
        });
      }
    } catch (_) {}
  }

  public destroy(): void {
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch (_) {}
      this.worker = null;
    }
    if (this.blobUrl) {
      try {
        URL.revokeObjectURL(this.blobUrl);
      } catch (_) {}
      this.blobUrl = null;
    }
  }
}
