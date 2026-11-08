// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WasmGuestHost } from "../src/sandbox/wasm-guest-host.js";
import { SandboxManager } from "../src/sandbox/sandbox-manager.js";
import { OmniKernel } from "../src/kernel/omni-kernel.js";
import omniRuntimeScript from "../src/sandbox/omni-runtime.js?raw";

// Real compiled WebAssembly binary produced by rustc (1.8KB)
// Implements WIT ui::render, init(), and handle_action()
const RUST_WIDGET_WASM_BASE64 =
  "AGFzbQEAAAABFwRgAn9/AGAEf39/fwBgAABgA39/fwF/Ag0BAnVpBnJlbmRlcgAAAwQDAQIDBQMBABEGGQN/AUGAgMAAC38AQYSCwAALfwBBkILAAAsHPAUGbWVtb3J5AgANaGFuZGxlX2FjdGlvbgABBGluaXQAAgpfX2RhdGFfZW5kAwELX19oZWFwX2Jhc2UDAgqMAQMtAAJAIAFBA0cNACAAQYGCwIAAQQMQg4CAgAANAEGFgcCAAEH8ABCAgICAAAsLEQBBgIDAgABBhQEQgICAgAALSgEDf0EAIQMCQCACRQ0AAkADQCAALQAAIgQgAS0AACIFRw0BIABBAWohACABQQFqIQEgAkF/aiICRQ0CDAALCyAEIAVrIQMLIAMLC44CAQBBgIDAAAuEAnsidHlwZSI6ImNhcmQiLCJ0aXRsZSI6IlJ1c3QgQ291bnRlciBXaWRnZXQiLCJpY29uIjoiY3B1IiwiY2hpbGRyZW4iOlt7InR5cGUiOiJidXR0b24iLCJsYWJlbCI6IkluY3JlbWVudCIsImFjdGlvbiI6eyJuYW1lIjoiaW5jIn19XX17InR5cGUiOiJjYXJkIiwidGl0bGUiOiJSdXN0IENvdW50ZXIgV2lkZ2V0IiwiaWNvbiI6ImNwdSIsImNoaWxkcmVuIjpbeyJ0eXBlIjoiYmFkZ2UiLCJsYWJlbCI6IkNvdW50OiAxIiwidG9uZSI6InN1Y2Nlc3MifV19aW5j";

function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

describe("WasmGuestHost — WebAssembly Component Model & WIT Support", () => {
  let channel1: MessageChannel;
  let channel2: MessageChannel;

  beforeEach(() => {
    channel1 = new MessageChannel();
    channel2 = new MessageChannel();
  });

  it("instantiates a WebAssembly module, calls init(), and renders schema via WIT ui::render", async () => {
    const wasmBytes = base64ToUint8Array(RUST_WIDGET_WASM_BASE64);
    let renderedSchema: any = null;

    const host = new WasmGuestHost({
      pluginId: "org.omni.plugin.rust-counter",
      wasmBytes,
      channel1,
      channel2,
      initPayload: {
        pluginId: "org.omni.plugin.rust-counter",
        instanceId: "inst_wasm_1",
        userPubkey: "npub1testpubkey",
        theme: { mode: "dark", colors: {} },
        slots: ["main"],
        components: ["main"]
      },
      onSchemaUpdate: (schema) => {
        renderedSchema = schema;
      }
    });

    await host.boot();

    expect(renderedSchema).not.toBeNull();
    expect(renderedSchema.type).toBe("card");
    expect(renderedSchema.title).toBe("Rust Counter Widget");
    expect(renderedSchema.children[0].type).toBe("button");
    expect(renderedSchema.children[0].label).toBe("Increment");
    expect(renderedSchema.children[0].action.name).toBe("inc");

    host.destroy();
  });

  it("dispatches actions to WASM handle_action and re-renders updated schema", async () => {
    const wasmBytes = base64ToUint8Array(RUST_WIDGET_WASM_BASE64);
    let latestSchema: any = null;

    const host = new WasmGuestHost({
      pluginId: "org.omni.plugin.rust-counter",
      wasmBytes,
      channel1,
      channel2,
      initPayload: {
        pluginId: "org.omni.plugin.rust-counter",
        instanceId: "inst_wasm_1",
        userPubkey: "npub1testpubkey",
        theme: { mode: "dark", colors: {} },
        slots: ["main"],
        components: ["main"]
      },
      onSchemaUpdate: (schema) => {
        latestSchema = schema;
      }
    });

    await host.boot();
    expect(latestSchema.children[0].label).toBe("Increment");

    // Dispatch the "inc" action
    host.dispatchAction("main", { name: "inc" }, {});

    expect(latestSchema).not.toBeNull();
    expect(latestSchema.title).toBe("Rust Counter Widget");
    // Button replaced by badge with "Count: 1"
    expect(latestSchema.children[0].type).toBe("badge");
    expect(latestSchema.children[0].label).toBe("Count: 1");
    expect(latestSchema.children[0].tone).toBe("success");

    host.destroy();
  });

  it("integrates seamlessly into SandboxManager as a full WASM plugin", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const mainSlot = document.createElement("div");
    root.appendChild(mainSlot);

    const kernel = new OmniKernel({ runtimeScript: omniRuntimeScript });
    await kernel.boot();

    const wasmBytes = base64ToUint8Array(RUST_WIDGET_WASM_BASE64);
    const slotContainers = new Map<string, Element>([["main", mainSlot]]);

    const sandbox = await kernel.registerPlugin(
      {
        id: "org.omni.plugin.rust-app",
        name: "Rust WebAssembly App",
        version: "1.0.0",
        entry: "plugin.wasm",
        components: [{ id: "main", type: "main", title: "Counter", slot: "main" }],
        permissions: {},
        views: [{ id: "main", title: "Counter", path: "", format: "wasm" }]
      },
      wasmBytes,
      slotContainers
    );

    expect(sandbox.getWasmHost()).not.toBeNull();

    // Verify Light DOM custom elements are rendered natively in host DOM
    const omniCard = mainSlot.querySelector("omni-card");
    expect(omniCard).not.toBeNull();
    const omniButton = mainSlot.querySelector("omni-button");
    expect(omniButton).not.toBeNull();
    expect(omniButton?.textContent).toContain("Increment");

    // Click the rendered native button in host DOM
    const buttonNative = omniButton?.querySelector("button");
    buttonNative?.click();

    // Allow synchronous microtask execution
    await new Promise((r) => setTimeout(r, 20));

    // Badge rendered in host DOM!
    const omniBadge = mainSlot.querySelector("omni-badge");
    expect(omniBadge).not.toBeNull();
    expect(omniBadge?.textContent).toContain("Count: 1");

    sandbox.destroy();
    root.remove();
  });
});
