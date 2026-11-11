// @vitest-environment happy-dom
//
// Smoke test for the bundled Gleam guest bridge (Phase 7.11). The bundle is
// produced by `node scripts/build-bridge.mjs` (run by `pnpm gleam:build`).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const bundlePath = join(process.cwd(), "gleam/bridge/dist/guest-runtime.js");
const hasBundle = existsSync(bundlePath);

describe.skipIf(!hasBundle)("bundled Gleam guest bridge", () => {
  it("installs the standard shims and completes the init handshake", async () => {
    await import(bundlePath);

    expect(typeof window.nostr).toBe("object");
    expect(typeof window.nostr.getPublicKey).toBe("function");
    expect(typeof window.WebSocket).toBe("function");
    expect(typeof window.nostr.subscribe).toBe("function");

    const schemaChannel = new MessageChannel();
    const rpcChannel = new MessageChannel();
    const requests: unknown[] = [];
    rpcChannel.port2.onmessage = (event) => requests.push(event.data);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "omni:init", payload: { pluginId: "example.app.alpha" } },
        ports: [schemaChannel.port1, rpcChannel.port1],
      }),
    );

    window.localStorage.setItem("token", "abc");
    expect(window.localStorage.getItem("token")).toBe("abc");

    await new Promise((resolve) => setTimeout(resolve, 10));

    const pending = window.nostr.getPublicKey();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(requests.length).toBe(1);
    const request = requests[0] as {
      id: number;
      method: string;
    };
    expect(request.method).toBe("nostr.getPublicKey");

    rpcChannel.port2.postMessage({
      jsonrpc: "2.0",
      id: request.id,
      result: "f".repeat(64),
    });
    await expect(pending).resolves.toBe("f".repeat(64));
  });
});
