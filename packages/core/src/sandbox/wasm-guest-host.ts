import { OmniInitMessage, OmniComponentNode, OmniAction } from "@omni/types";

export interface WasmGuestHostOptions {
  pluginId: string;
  wasmBytes: ArrayBuffer | Uint8Array;
  channel1: MessageChannel; // Schema / Action bus
  channel2: MessageChannel; // Kernel RPC bus
  initPayload: OmniInitMessage["payload"];
  onSchemaUpdate?: (schema: OmniComponentNode, componentId?: string) => void;
  onError?: (error: Error) => void;
}

export class WasmGuestHost {
  private options: WasmGuestHostOptions;
  private instance: WebAssembly.Instance | null = null;
  private memory: WebAssembly.Memory | null = null;
  private bumpPointer = 0;
  private destroyed = false;

  constructor(options: WasmGuestHostOptions) {
    this.options = options;
  }

  public async boot(): Promise<void> {
    if (typeof WebAssembly === "undefined") {
      throw new Error("[WasmGuestHost] WebAssembly is not supported in this runtime environment.");
    }

    try {
      const importObject = this.createImportObject();
      const bytes = this.options.wasmBytes instanceof Uint8Array
        ? this.options.wasmBytes
        : new Uint8Array(this.options.wasmBytes);

      const module = await WebAssembly.compile(bytes as BufferSource);
      this.instance = await WebAssembly.instantiate(module, importObject);

      // Locate memory: from exports or imported
      this.memory = (this.instance.exports.memory as WebAssembly.Memory) || this.memory;

      // Invoke initialization export if provided
      this.invokeInit();
    } catch (err: any) {
      const error = new Error(`[WasmGuestHost:${this.options.pluginId}] Boot failed: ${err.message || err}`);
      if (this.options.onError) {
        this.options.onError(error);
      } else {
        console.error(error);
      }
      throw error;
    }
  }

  private createImportObject(): WebAssembly.Imports {
    const memory = new WebAssembly.Memory({ initial: 2, maximum: 256 });
    this.memory = memory;

    // Helper to read string from WASM memory
    const readString = (ptr: number, len: number): string => {
      const mem = this.getActiveMemory();
      if (!mem) return "";
      const slice = new Uint8Array(mem.buffer, ptr, len);
      return new TextDecoder("utf-8").decode(slice);
    };

    // UI interface implementation
    const uiInterface = {
      // WIT: ui.render(view: string)
      render: (viewPtr: number, viewLen: number) => {
        const jsonStr = readString(viewPtr, viewLen);
        this.handleSchemaPayload(jsonStr, "main");
      },
      // WIT: ui.render-component(component-id: string, view: string)
      "render-component": (compIdPtr: number, compIdLen: number, viewPtr: number, viewLen: number) => {
        const compId = readString(compIdPtr, compIdLen);
        const jsonStr = readString(viewPtr, viewLen);
        this.handleSchemaPayload(jsonStr, compId);
      },
      // Flat/C alias
      omni_ui_render: (viewPtr: number, viewLen: number) => {
        const jsonStr = readString(viewPtr, viewLen);
        this.handleSchemaPayload(jsonStr, "main");
      }
    };

    // Nostr interface implementation
    const nostrInterface = {
      // WIT: nostr.get-public-key() -> string
      "get-public-key": (retPtr: number) => {
        const pubkey = this.options.initPayload.userPubkey || "";
        this.writeStringToReturnPtr(retPtr, pubkey);
      },
      omni_nostr_get_public_key: (retPtr: number) => {
        const pubkey = this.options.initPayload.userPubkey || "";
        this.writeStringToReturnPtr(retPtr, pubkey);
      }
    };

    // WASI Preview 1 compatibility (for standard Rust, Go, Zig compilers)
    const wasiSnapshot = {
      fd_write: (fd: number, iovs: number, iovsLen: number, nwritten: number): number => {
        const mem = this.getActiveMemory();
        if (!mem) return 0;
        let total = 0;
        const view = new DataView(mem.buffer);
        let outStr = "";

        for (let i = 0; i < iovsLen; i++) {
          const ptr = view.getUint32(iovs + i * 8, true);
          const len = view.getUint32(iovs + i * 8 + 4, true);
          const bytes = new Uint8Array(mem.buffer, ptr, len);
          outStr += new TextDecoder("utf-8").decode(bytes);
          total += len;
        }

        if (nwritten) {
          view.setUint32(nwritten, total, true);
        }

        // Intercept standard output: if JSON-formatted schema, render it; otherwise log to console
        const trimmed = outStr.trim();
        if ((trimmed.startsWith("{") && trimmed.includes('"type"')) || (trimmed.startsWith("[") && trimmed.includes('"type"'))) {
          try {
            this.handleSchemaPayload(trimmed, "main");
          } catch (_) {
            console.log(`[WasmGuest:${this.options.pluginId}]`, outStr);
          }
        } else if (trimmed) {
          console.log(`[WasmGuest:${this.options.pluginId}]`, outStr);
        }

        return 0;
      },
      fd_read: () => 0,
      fd_close: () => 0,
      fd_seek: () => 0,
      fd_fdstat_get: (_fd: number, statPtr: number) => {
        const mem = this.getActiveMemory();
        if (mem) {
          new DataView(mem.buffer).setUint8(statPtr, 2); // Character device
        }
        return 0;
      },
      clock_time_get: (_id: number, _precision: bigint, timePtr: number) => {
        const mem = this.getActiveMemory();
        if (mem) {
          const nowNs = BigInt(Date.now()) * 1000000n;
          new DataView(mem.buffer).setBigUint64(timePtr, nowNs, true);
        }
        return 0;
      },
      environ_sizes_get: (countPtr: number, sizePtr: number) => {
        const mem = this.getActiveMemory();
        if (mem) {
          const dv = new DataView(mem.buffer);
          dv.setUint32(countPtr, 0, true);
          dv.setUint32(sizePtr, 0, true);
        }
        return 0;
      },
      environ_get: () => 0,
      proc_exit: (code: number) => {
        if (code !== 0) {
          console.warn(`[WasmGuest:${this.options.pluginId}] Exited with code: ${code}`);
        }
        return 0;
      }
    };

    return {
      // WIT namespaces (W3C Component Model)
      "omni:plugin/ui": uiInterface,
      "omni:plugin/nostr": nostrInterface,
      ui: uiInterface,
      nostr: nostrInterface,
      // C / Rust extern "C" aliases
      env: {
        memory,
        ...uiInterface,
        ...nostrInterface
      },
      wasi_snapshot_preview1: wasiSnapshot
    };
  }

  private getActiveMemory(): WebAssembly.Memory | null {
    if (this.instance && this.instance.exports.memory) {
      return this.instance.exports.memory as WebAssembly.Memory;
    }
    return this.memory;
  }

  private handleSchemaPayload(rawJsonOrObj: string | OmniComponentNode, componentId?: string): void {
    if (this.destroyed) return;
    try {
      let schema: OmniComponentNode;
      if (typeof rawJsonOrObj === "string") {
        schema = JSON.parse(rawJsonOrObj);
      } else {
        schema = rawJsonOrObj;
      }

      if (schema && (schema as any).type) {
        if (this.options.onSchemaUpdate) {
          this.options.onSchemaUpdate(schema, componentId || "main");
        }
        // Also notify via Channel 1 Port 2
        try {
          this.options.channel1.port2.postMessage({
            type: "omni:schema",
            componentId: componentId || "main",
            schema
          });
        } catch (_) {}
      }
    } catch (err) {
      console.warn(`[WasmGuestHost:${this.options.pluginId}] Invalid schema JSON from WASM:`, err);
    }
  }

  private invokeInit(): void {
    if (!this.instance) return;
    const exports = this.instance.exports as Record<string, any>;

    // Try standard init export functions
    const initFn = exports.init || exports.omni_init || exports._start;
    if (typeof initFn === "function") {
      try {
        const ret = initFn();
        // If init returns a string or pointer/len pair
        if (typeof ret === "string") {
          this.handleSchemaPayload(ret, "main");
        } else if (typeof ret === "number" && ret > 0) {
          // If returned an i32 pointer to a null-terminated or length-prefixed string
          const str = this.readNullTerminatedString(ret);
          if (str) this.handleSchemaPayload(str, "main");
        }
      } catch (e: any) {
        console.error(`[WasmGuestHost:${this.options.pluginId}] Error executing init():`, e);
      }
    }
  }

  public dispatchAction(componentId: string, action: OmniAction, payload?: Record<string, unknown>): void {
    if (!this.instance || this.destroyed) return;
    const exports = this.instance.exports as Record<string, any>;

    const actionFn = exports["handle-action"] || exports.handle_action || exports.omni_handle_action;
    if (typeof actionFn !== "function") return;

    try {
      const actionStr = action.name || "";
      const payloadStr = JSON.stringify(payload || action.payload || {});

      // Allocate memory for arguments in WASM linear memory
      const [actionPtr, actionLen] = this.allocateAndWriteString(actionStr);
      const [payloadPtr, payloadLen] = this.allocateAndWriteString(payloadStr);

      const ret = actionFn(actionPtr, actionLen, payloadPtr, payloadLen);

      // If handle-action returns an updated view string directly (WIT Option B)
      if (typeof ret === "string") {
        this.handleSchemaPayload(ret, componentId);
      } else if (typeof ret === "number" && ret > 0) {
        const str = this.readNullTerminatedString(ret);
        if (str) this.handleSchemaPayload(str, componentId);
      }

      // Cleanup allocated strings if dealloc export exists
      this.deallocateString(actionPtr, actionLen);
      this.deallocateString(payloadPtr, payloadLen);
    } catch (e) {
      console.error(`[WasmGuestHost:${this.options.pluginId}] Error executing handle_action:`, e);
    }
  }

  private allocateAndWriteString(str: string): [number, number] {
    const mem = this.getActiveMemory();
    if (!mem) return [0, 0];

    const bytes = new TextEncoder().encode(str);
    const len = bytes.length;

    const exports = this.instance?.exports as Record<string, any> | undefined;
    const allocFn = exports?.alloc || exports?.allocate || exports?.malloc;

    let ptr = 0;
    if (typeof allocFn === "function") {
      ptr = allocFn(len + 1);
    } else {
      // Fallback bump allocator starting after heap_base or data_end
      if (!this.bumpPointer) {
        const heapBase = exports?.__heap_base?.value || exports?.__data_end?.value || 65536;
        this.bumpPointer = heapBase;
      }
      ptr = this.bumpPointer;
      this.bumpPointer = (this.bumpPointer + len + 16) & ~7;
      if (this.bumpPointer >= mem.buffer.byteLength) {
        try {
          mem.grow(1);
        } catch (_) {}
      }
    }

    const target = new Uint8Array(mem.buffer, ptr, len + 1);
    target.set(bytes);
    target[len] = 0; // Null terminator

    return [ptr, len];
  }

  private deallocateString(ptr: number, len: number): void {
    const exports = this.instance?.exports as Record<string, any> | undefined;
    const deallocFn = exports?.dealloc || exports?.free;
    if (typeof deallocFn === "function" && ptr > 0) {
      try {
        deallocFn(ptr, len);
      } catch (_) {}
    }
  }

  private writeStringToReturnPtr(retPtr: number, str: string): void {
    const [ptr, len] = this.allocateAndWriteString(str);
    const mem = this.getActiveMemory();
    if (mem && retPtr > 0) {
      const dv = new DataView(mem.buffer);
      dv.setUint32(retPtr, ptr, true);
      dv.setUint32(retPtr + 4, len, true);
    }
  }

  private readNullTerminatedString(ptr: number): string {
    const mem = this.getActiveMemory();
    if (!mem || ptr <= 0 || ptr >= mem.buffer.byteLength) return "";
    const bytes = new Uint8Array(mem.buffer, ptr);
    let end = 0;
    while (end < bytes.length && bytes[end] !== 0) {
      end++;
    }
    return new TextDecoder("utf-8").decode(bytes.subarray(0, end));
  }

  public destroy(): void {
    this.destroyed = true;
    this.instance = null;
    this.memory = null;
  }
}
