import { OmniInitMessage, OmniComponentNode, OmniAction } from "@omni/types";
import type { SubscriptionCoordinator } from "../nostr/subscription-coordinator.js";
import type { LocalEventStore } from "../nostr/event-store.js";
import type { RelayPool } from "../nostr/relay-pool.js";
import type { WebCryptoKeystore } from "../crypto/webcrypto-keystore.js";
import type { AclEngine } from "../acl/acl-engine.js";

export interface WasmGuestHostOptions {
  pluginId: string;
  wasmBytes: ArrayBuffer | Uint8Array;
  channel1?: MessageChannel | null; // Schema / Action bus
  channel2?: MessageChannel | null; // Kernel RPC bus
  initPayload: OmniInitMessage["payload"];
  onSchemaUpdate?: (schema: OmniComponentNode, componentId?: string) => void;
  onError?: (error: Error) => void;
  subscriptionCoordinator?: SubscriptionCoordinator;
  eventStore?: LocalEventStore;
  relayPool?: RelayPool;
  keystore?: WebCryptoKeystore;
  aclEngine?: AclEngine;
}

export class WasmGuestHost {
  private options: WasmGuestHostOptions;
  private instance: WebAssembly.Instance | null = null;
  private memory: WebAssembly.Memory | null = null;
  private bumpPointer = 0;
  private stdoutBuffer = "";
  private destroyed = false;
  private activeSubscriptions: Array<() => void> = [];
  private activeTimelineUnsub: (() => void) | null = null;
  private pendingSchema: { schema: OmniComponentNode; componentId?: string } | null = null;
  private schemaBatchTimer: any = null;
  private isHighFrequencyEvent = false;

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
      const MIN_INITIAL_BYTES = 5 * 1024 * 1024; // 5MB reserved space for safe, non-colliding guest/host memory
      if (this.memory && this.memory.buffer.byteLength < MIN_INITIAL_BYTES) {
        const needed = Math.ceil((MIN_INITIAL_BYTES - this.memory.buffer.byteLength) / 65536);
        try {
          this.memory.grow(needed);
        } catch (_) {}
      }

      // Seed local storage follows and profiles into event store if available so 0ms cache hits immediately
      const userPk = this.options.initPayload?.userPubkey;
      if (typeof localStorage !== "undefined" && this.options.eventStore) {
        try {
          if (userPk) {
            const raw = localStorage.getItem(`omni_people_follows_${userPk}`);
            if (raw) {
              const tags = JSON.parse(raw);
              if (Array.isArray(tags) && tags.length > 0) {
                const syntheticEvent = {
                  id: `contacts_local_${userPk}`,
                  pubkey: userPk,
                  kind: 3,
                  created_at: Math.floor(Date.now() / 1000),
                  tags,
                  content: ""
                };
                await this.options.eventStore.saveEvent(syntheticEvent as any);
              }
            }
          }

          // Seed cached profiles from localStorage into event store so kind 0 queries hit 0ms cache immediately
          const cacheKeys = ["omni_profile_viewer_cache_v2", "omni_profile_cache_v2"];
          for (const key of cacheKeys) {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            const records = JSON.parse(raw);
            for (const [pk, entry] of Object.entries(records)) {
              const meta = (entry as any)?.meta || entry;
              if (meta && typeof meta === "object") {
                const syntheticProfEvent = {
                  id: `profile_local_${pk}`,
                  pubkey: pk,
                  kind: 0,
                  created_at: Math.floor(Date.now() / 1000),
                  tags: [],
                  content: JSON.stringify(meta)
                };
                await this.options.eventStore.saveEvent(syntheticProfEvent as any);
              }
            }
          }
        } catch (_) {}
      }

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

    // Nostr interface implementation (canonical WIT omni:plugin/nostr)
    const nostrInterface = {
      // WIT: nostr.get-public-key() -> string
      "get-public-key": (retPtr: number) => {
        const pubkey = this.options.initPayload.userPubkey || "";
        this.writeStringToReturnPtr(retPtr, pubkey);
      },
      omni_nostr_get_public_key: (retPtr: number) => {
        const pubkey = this.options.initPayload.userPubkey || "";
        this.writeStringToReturnPtr(retPtr, pubkey);
      },

      // WIT: nostr.subscribe(filter: string) -> string
      subscribe: (filterPtr: number, filterLen: number) => {
        const filterStr = readString(filterPtr, filterLen);
        let filters: any[] = [];
        try {
          const parsed = JSON.parse(filterStr);
          filters = Array.isArray(parsed) ? parsed : [parsed];
        } catch (_) {}

        if (filters.length > 0) {
          const isTimeline = filters.some((f) => f.kinds && f.kinds.includes(1) && !f.until && !f["#e"] && !f.authors);
          if (isTimeline && this.activeTimelineUnsub) {
            try {
              this.activeTimelineUnsub();
            } catch (_) {}
            this.activeTimelineUnsub = null;
          }

          const subId = `wasm_sub_${this.options.pluginId.replace(/[^a-zA-Z0-9]/g, "_")}_${Math.random().toString(36).slice(2, 8)}`;
          if (this.options.subscriptionCoordinator) {
            this.options.subscriptionCoordinator.subscribe(
              `${this.options.pluginId}:${subId}`,
              filters,
              (event) => {
                if (event && event.kind === 0 && event.pubkey && event.content) {
                  try {
                    const meta = JSON.parse(event.content);
                    if (typeof localStorage !== "undefined" && meta && typeof meta === "object") {
                      const raw = localStorage.getItem("omni_profile_viewer_cache_v2");
                      const records = raw ? JSON.parse(raw) : {};
                      records[event.pubkey] = { meta, timestamp: Date.now() };
                      localStorage.setItem("omni_profile_viewer_cache_v2", JSON.stringify(records));
                    }
                  } catch (_) {}
                }
                this.dispatchAction("main", { name: "nostr:event" }, event as unknown as Record<string, unknown>);
              }
            ).then((unsub) => {
              this.activeSubscriptions.push(unsub);
              if (isTimeline) {
                this.activeTimelineUnsub = unsub;
              }
            }).catch((err) => console.warn(`[WasmGuestHost:${this.options.pluginId}] subscribe error:`, err));
          } else if (this.options.relayPool) {
            // Immediate 0ms cache query
            if (this.options.eventStore) {
              for (const f of filters) {
                this.options.eventStore.getEvents(f).then((cached) => {
                  if (cached && cached.length > 0) {
                    const sorted = [...cached].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
                    for (const ev of sorted) {
                      this.dispatchAction("main", { name: "nostr:event" }, ev as unknown as Record<string, unknown>);
                    }
                  }
                }).catch(() => {});
              }
            }
            // Multiplexed relay subscription
            const unsub = this.options.relayPool.subscribe(
              subId,
              filters,
              async (ev) => {
                if (this.options.eventStore) {
                  await this.options.eventStore.saveEvent(ev);
                }
                if (ev && ev.kind === 0 && ev.pubkey && ev.content) {
                  try {
                    const meta = JSON.parse(ev.content);
                    if (typeof localStorage !== "undefined" && meta && typeof meta === "object") {
                      const raw = localStorage.getItem("omni_profile_viewer_cache_v2");
                      const records = raw ? JSON.parse(raw) : {};
                      records[ev.pubkey] = { meta, timestamp: Date.now() };
                      localStorage.setItem("omni_profile_viewer_cache_v2", JSON.stringify(records));
                    }
                  } catch (_) {}
                }
                this.dispatchAction("main", { name: "nostr:event" }, ev as unknown as Record<string, unknown>);
              }
            );
            this.activeSubscriptions.push(unsub);
            if (isTimeline) {
              this.activeTimelineUnsub = unsub;
            }
          }
        }
      },
      omni_nostr_subscribe: (filterPtr: number, filterLen: number) => {
        nostrInterface.subscribe(filterPtr, filterLen);
      },

      // WIT: nostr.publish(draft: string) -> string
      publish: (draftPtr: number, draftLen: number) => {
        const draftStr = readString(draftPtr, draftLen);
        let draft: any = null;
        try {
          draft = JSON.parse(draftStr);
        } catch (_) {}

        if (draft && this.options.keystore) {
          (async () => {
            try {
              const userPubkey = this.options.initPayload.userPubkey || (await this.options.keystore!.getPublicKey());
              if (!draft.pubkey) draft.pubkey = userPubkey;
              if (!draft.created_at) draft.created_at = Math.floor(Date.now() / 1000);
              const signed = await this.options.keystore!.signEvent(draft);
              if (this.options.eventStore) {
                await this.options.eventStore.saveEvent(signed);
              }
              if (this.options.relayPool) {
                await this.options.relayPool.publish(signed);
              }
              this.dispatchAction("main", { name: "nostr:event" }, signed as unknown as Record<string, unknown>);
            } catch (err) {
              console.error(`[WasmGuestHost:${this.options.pluginId}] publish error:`, err);
            }
          })();
        }
      },
      omni_nostr_publish: (draftPtr: number, draftLen: number) => {
        nostrInterface.publish(draftPtr, draftLen);
      },

      // WIT: nostr.fetch(filter: string) -> string
      fetch: (filterPtr: number, filterLen: number) => {
        const filterStr = readString(filterPtr, filterLen);
        let filters: any[] = [];
        try {
          const parsed = JSON.parse(filterStr);
          filters = Array.isArray(parsed) ? parsed : [parsed];
        } catch (_) {}

        if (filters.length > 0 && this.options.eventStore) {
          for (const f of filters) {
            this.options.eventStore.getEvents(f).then((cached) => {
              if (cached && cached.length > 0) {
                const sorted = [...cached].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
                for (const ev of sorted) {
                  this.dispatchAction("main", { name: "nostr:event" }, ev as unknown as Record<string, unknown>);
                }
              }
            }).catch(() => {});
          }
        }
      },
      omni_nostr_fetch: (filterPtr: number, filterLen: number) => {
        nostrInterface.fetch(filterPtr, filterLen);
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
          this.stdoutBuffer += new TextDecoder("utf-8").decode(bytes);
          total += len;
        }

        if (nwritten) {
          view.setUint32(nwritten, total, true);
        }

        // Intercept standard output: line-buffered schema JSON or console output
        if (this.stdoutBuffer.includes("\n")) {
          const lines = this.stdoutBuffer.split("\n");
          this.stdoutBuffer = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if ((trimmed.startsWith("{") && trimmed.includes('"type"')) || (trimmed.startsWith("[") && trimmed.includes('"type"'))) {
              try {
                this.handleSchemaPayload(trimmed, "main");
              } catch (_) {
                console.log(`[WasmGuest:${this.options.pluginId}]`, line);
              }
            } else if (trimmed) {
              console.log(`[WasmGuest:${this.options.pluginId}]`, line);
            }
          }
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
      wasi_snapshot_preview1: wasiSnapshot,
      spectest: {
        print_char: (c: number) => {
          if (c === 10) {
            const line = this.stdoutBuffer.trim();
            this.stdoutBuffer = "";
            if ((line.startsWith("{") && line.includes('"type"')) || (line.startsWith("[") && line.includes('"type"'))) {
              this.handleSchemaPayload(line, "main");
            } else if (line) {
              console.log(`[WasmGuest:${this.options.pluginId}]`, line);
            }
          } else {
            this.stdoutBuffer += String.fromCharCode(c);
          }
        }
      }
    };
  }

  private getActiveMemory(): WebAssembly.Memory | null {
    if (this.instance && this.instance.exports.memory) {
      return this.instance.exports.memory as WebAssembly.Memory;
    }
    return this.memory;
  }

  private emitSchemaImmediate(schema: OmniComponentNode, componentId?: string): void {
    if (this.schemaBatchTimer) {
      clearTimeout(this.schemaBatchTimer);
      this.schemaBatchTimer = null;
    }
    this.pendingSchema = null;
    if (this.options.onSchemaUpdate) {
      this.options.onSchemaUpdate(schema, componentId || "main");
    }
    try {
      this.options.channel1?.port2?.postMessage({
        type: "omni:schema",
        componentId: componentId || "main",
        schema
      });
    } catch (_) {}
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
        if (!this.isHighFrequencyEvent) {
          this.emitSchemaImmediate(schema, componentId);
          return;
        }

        this.pendingSchema = { schema, componentId };
        if (!this.schemaBatchTimer) {
          this.schemaBatchTimer = setTimeout(() => {
            this.schemaBatchTimer = null;
            if (this.pendingSchema && !this.destroyed) {
              const { schema: s, componentId: c } = this.pendingSchema;
              this.pendingSchema = null;
              if (this.options.onSchemaUpdate) {
                this.options.onSchemaUpdate(s, c || "main");
              }
              try {
                this.options.channel1?.port2?.postMessage({
                  type: "omni:schema",
                  componentId: c || "main",
                  schema: s
                });
              } catch (_) {}
            }
          }, 35);
        }
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

    const prevHighFreq = this.isHighFrequencyEvent;
    this.isHighFrequencyEvent = action.name === "nostr:event";

    try {
      const actionStr = action.name || "";
      const payloadStr = JSON.stringify(payload || action.payload || {});

      const allocFn = exports.alloc || exports.allocate || exports.malloc;
      let actionPtr: number;
      let actionLen: number;
      let payloadPtr: number;
      let payloadLen: number;

      if (typeof allocFn === "function") {
        const [aPtr, aLen] = this.allocateAndWriteString(actionStr);
        const [pPtr, pLen] = this.allocateAndWriteString(payloadStr);
        actionPtr = aPtr;
        actionLen = aLen;
        payloadPtr = pPtr;
        payloadLen = pLen;
      } else {
        // Dedicated zero-leak IPC communication area in high memory (2MB)
        const mem = this.getActiveMemory();
        if (!mem) return;

        const actionBytes = new TextEncoder().encode(actionStr);
        const payloadBytes = new TextEncoder().encode(payloadStr);

        actionPtr = 2097152; // 2MB offset
        actionLen = actionBytes.length;
        payloadPtr = actionPtr + 4096; // 4KB offset for payload
        payloadLen = payloadBytes.length;

        const totalNeeded = payloadPtr + payloadLen + 64;
        if (totalNeeded > mem.buffer.byteLength) {
          const neededPages = Math.ceil((totalNeeded - mem.buffer.byteLength) / 65536);
          try {
            mem.grow(neededPages);
          } catch (_) {}
        }

        const view = new Uint8Array(this.getActiveMemory()!.buffer);
        view.set(actionBytes, actionPtr);
        view[actionPtr + actionLen] = 0;

        view.set(payloadBytes, payloadPtr);
        view[payloadPtr + payloadLen] = 0;
      }

      const ret = actionFn(actionPtr, actionLen, payloadPtr, payloadLen);

      // If handle-action returns an updated view string directly (WIT Option B)
      if (typeof ret === "string") {
        this.handleSchemaPayload(ret, componentId);
      } else if (typeof ret === "number" && ret > 0) {
        const str = this.readNullTerminatedString(ret);
        if (str) this.handleSchemaPayload(str, componentId);
      }

      // Cleanup allocated strings if dealloc export exists
      if (typeof allocFn === "function") {
        this.deallocateString(actionPtr, actionLen);
        this.deallocateString(payloadPtr, payloadLen);
      }
    } catch (e) {
      console.error(`[WasmGuestHost:${this.options.pluginId}] Error executing handle_action:`, e);
    } finally {
      this.isHighFrequencyEvent = prevHighFreq;
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
      // Fallback bump allocator starting after heap_base or data_end (offset to 128KB to prevent colliding with scratch page)
      if (!this.bumpPointer) {
        const heapBase = exports?.__heap_base?.value || exports?.__data_end?.value || 131072;
        this.bumpPointer = Math.max(heapBase, 131072);
      }
      ptr = this.bumpPointer;
      this.bumpPointer = (this.bumpPointer + len + 16) & ~7;
      if (this.bumpPointer >= mem.buffer.byteLength) {
        try {
          const needed = Math.ceil((this.bumpPointer - mem.buffer.byteLength + 65536) / 65536);
          mem.grow(needed);
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
    const mem = this.getActiveMemory();
    if (!mem || retPtr <= 0) return;

    const exports = this.instance?.exports as Record<string, any> | undefined;
    const allocFn = exports?.alloc || exports?.allocate || exports?.malloc;

    let ptr: number;
    let len: number;

    if (typeof allocFn === "function") {
      const [aPtr, aLen] = this.allocateAndWriteString(str);
      ptr = aPtr;
      len = aLen;
    } else {
      // Dedicated return buffer in high memory (4MB)
      const bytes = new TextEncoder().encode(str);
      len = bytes.length;
      ptr = 4194304; // 4MB

      const totalNeeded = ptr + len + 64;
      if (totalNeeded > mem.buffer.byteLength) {
        const neededPages = Math.ceil((totalNeeded - mem.buffer.byteLength) / 65536);
        try {
          mem.grow(neededPages);
        } catch (_) {}
      }

      const view = new Uint8Array(this.getActiveMemory()!.buffer);
      view.set(bytes, ptr);
      view[ptr + len] = 0;
    }

    const dv = new DataView(this.getActiveMemory()!.buffer);
    dv.setUint32(retPtr, ptr, true);
    dv.setUint32(retPtr + 4, len, true);
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
    if (this.schemaBatchTimer) {
      clearTimeout(this.schemaBatchTimer);
      this.schemaBatchTimer = null;
    }
    this.pendingSchema = null;
    if (this.activeTimelineUnsub) {
      try {
        this.activeTimelineUnsub();
      } catch (_) {}
      this.activeTimelineUnsub = null;
    }
    for (const unsub of this.activeSubscriptions) {
      try {
        unsub();
      } catch (_) {}
    }
    this.activeSubscriptions = [];
    this.instance = null;
    this.memory = null;
  }
}
