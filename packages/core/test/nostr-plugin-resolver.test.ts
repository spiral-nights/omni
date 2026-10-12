// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import omniRuntimeScript from "../src/sandbox/omni-runtime.js?raw";
import "fake-indexeddb/auto";
import {
  WebCryptoKeystore,
  OmniKernel,
  NostrPluginResolver,
  NSITE_MANIFEST_KIND
} from "../src/index.js";
import { OmniManifest } from "@omni/types";

describe("NIP-19 naddr Codec & NIP-5A Nostr Plugin Resolver", () => {
  it("encodes and decodes NIP-19 naddr TLV correctly", () => {
    const original = {
      identifier: "org.omni.plugin.checklist",
      pubkey: "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d",
      kind: NSITE_MANIFEST_KIND,
      relays: ["wss://relay.damus.io"]
    };

    const naddr = WebCryptoKeystore.toNaddr(original);
    expect(naddr.startsWith("naddr1")).toBe(true);

    const decoded = WebCryptoKeystore.decodeNaddr(naddr);
    expect(decoded.identifier).toBe(original.identifier);
    expect(decoded.pubkey).toBe(original.pubkey);
    expect(decoded.kind).toBe(original.kind);
    expect(decoded.relays).toContain("wss://relay.damus.io");

    // Also verify decodeKey handles naddr
    const decodedKey = WebCryptoKeystore.decodeKey(naddr);
    expect(decodedKey.type).toBe("naddr");
    expect(decodedKey.data.identifier).toBe(original.identifier);
  });

  it("publishes and resolves a plugin via Nostr NIP-5A manifest event", async () => {
    const kernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
    await kernel.boot();

    const manifest: OmniManifest = {
      id: "org.omni.plugin.counter",
      name: "Simple Counter",
      version: "1.0.0",
      description: "A lightweight counter widget published to Nostr",
      entry: "dist/index.js",
      components: [
        {
          id: "counter-widget",
          type: "sidebar",
          slot: "sidebar",
          title: "Counter"
        }
      ],
      permissions: {
        storage: { quotaMb: 2 }
      }
    };

    const scriptCode = `
      export default function init() {
        console.log("Counter widget active");
      }
    `;

    // 1. Publish plugin to Nostr
    const published = await kernel.publishNsitePlugin(manifest, scriptCode);

    expect(published.event.kind).toBe(NSITE_MANIFEST_KIND);
    expect(published.event.tags.some((t) => t[0] === "d" && t[1] === manifest.id)).toBe(true);
    expect(published.event.tags.some((t) => t[0] === "f" && t[1] === "dist/index.js")).toBe(true);
    expect(published.naddr.startsWith("naddr1")).toBe(true);
    expect(published.verified).toBe(true);

    // 2. Resolve plugin using naddr
    const resolved = await kernel.resolveNsitePlugin(published.naddr);

    expect(resolved.manifest.id).toBe("org.omni.plugin.counter");
    expect(resolved.manifest.name).toBe("Simple Counter");
    expect(resolved.scriptContent).toBe(scriptCode);
    expect(resolved.authorPubkey).toBe(await kernel.getUserPubkey());
    expect(resolved.verified).toBe(true);

    // 3. Register resolved plugin into sandbox
    const slotContainers = new Map<string, Element>();
    const fakeSlot = document.createElement("div");
    slotContainers.set("sidebar", fakeSlot);

    const sandbox = await kernel.registerPlugin(resolved.manifest, resolved.scriptContent, slotContainers);
    expect(sandbox.manifest.id).toBe("org.omni.plugin.counter");
    expect(kernel.isPluginEnabled("org.omni.plugin.counter")).toBe(true);
  });

  it("rejects manifest events with tampered Schnorr signatures", async () => {
    const kernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
    await kernel.boot();

    const manifest: OmniManifest = {
      id: "org.omni.plugin.tampered",
      name: "Tampered Plugin",
      version: "1.0.0",
      entry: "dist/index.js",
      components: [],
      permissions: {}
    };

    const published = await kernel.publishNsitePlugin(manifest, "console.log('legit')");

    // Tamper with the event content
    const tamperedEvent = {
      ...published.event,
      content: JSON.stringify({ manifest, script: "console.log('malicious injected code!')" })
    };

    await expect(kernel.resolveNsitePlugin(tamperedEvent)).rejects.toThrow(/Invalid Schnorr signature/);
  });

  it("publishes and resolves a zero-manifest pure standalone nsite (index.html)", async () => {
    const kernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
    await kernel.boot();

    const pureNsiteHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Pure Nostr Chess</title>
</head>
<body>
  <div class="chess-board">
    <h2>Nostr Chess Widget</h2>
    <button id="move-pawn">Move E4</button>
  </div>
</body>
</html>`;

    // Publish as standard NIP-5A nsite with zero omni.manifest.json
    const published = await kernel.publishNsite({
      identifier: "world.chess.widget",
      name: "Nostr Chess Widget",
      description: "A pure standalone Nostr web app running without any manifest",
      icon: "chess",
      htmlContent: pureNsiteHtml
    });

    expect(published.event.kind).toBe(NSITE_MANIFEST_KIND);
    expect(published.event.tags.some((t) => t[0] === "d" && t[1] === "world.chess.widget")).toBe(true);
    expect(published.event.tags.some((t) => t[0] === "f" && t[1] === "index.html")).toBe(true);
    expect(published.naddr.startsWith("naddr1")).toBe(true);

    // Resolve pure nsite via naddr
    const resolved = await kernel.resolveNsitePlugin(published.naddr);

    expect(resolved.manifest.id).toBe("world.chess.widget");
    expect(resolved.manifest.name).toBe("Nostr Chess Widget");
    expect(resolved.manifest.entry).toBe("index.html");
    expect(resolved.manifest.components.length).toBeGreaterThanOrEqual(1);
    expect(resolved.manifest.components[0].slot).toBe("main");
    expect(resolved.scriptContent).toContain("Nostr Chess Widget");

    // Mount into SandboxInstance and verify DOM renders
    const slotContainers = new Map<string, Element>();
    const mainSlot = document.createElement("div");
    slotContainers.set("main", mainSlot);

    const sandbox = await kernel.registerPlugin(resolved.manifest, resolved.scriptContent, slotContainers);
    expect(sandbox.manifest.id).toBe("world.chess.widget");
    expect(kernel.isPluginEnabled("world.chess.widget")).toBe(true);
  });

  it("discovers routes and sub-views via Tier 1 Nostr event tags and Tier 2 HTML links", () => {
    // 1. Tier 1: Nostr tags
    const mockEvent = {
      id: "abc",
      pubkey: "11".repeat(32),
      created_at: 1000,
      kind: NSITE_MANIFEST_KIND,
      tags: [
        ["d", "pomodoro-app"],
        ["view", "settings", "Timer Settings"],
        ["view", "widget", "Mini Countdown", "?view=widget"]
      ],
      content: "",
      sig: "def"
    };

    const viewsFromTags = NostrPluginResolver.detectPluginViews(mockEvent as any, "");
    expect(viewsFromTags.length).toBe(3);
    expect(viewsFromTags.find((v) => v.id === "main")?.path).toBe("");
    expect(viewsFromTags.find((v) => v.id === "settings")?.title).toBe("Timer Settings");
    expect(viewsFromTags.find((v) => v.id === "settings")?.path).toBe("?view=settings");
    expect(viewsFromTags.find((v) => v.id === "widget")?.title).toBe("Mini Countdown");
    expect(viewsFromTags.find((v) => v.id === "widget")?.path).toBe("?view=widget");

    // 2. Tier 2: HTML links
    const htmlWithAlternateLinks = `<!DOCTYPE html>
<html>
<head>
  <link rel="alternate" href="?view=settings" title="Custom Settings" />
  <link rel="alternate" href="?view=dashboard" title="Dashboard Card" />
</head>
<body><h1>App</h1></body>
</html>`;

    const viewsFromHtml = NostrPluginResolver.detectPluginViews(null, htmlWithAlternateLinks);
    expect(viewsFromHtml.length).toBe(3);
    expect(viewsFromHtml.find((v) => v.id === "main")).toBeTruthy();
    expect(viewsFromHtml.find((v) => v.id === "settings")?.title).toBe("Custom Settings");
    expect(viewsFromHtml.find((v) => v.id === "dashboard")?.path).toBe("?view=dashboard");
  });
});

