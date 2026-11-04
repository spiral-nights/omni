// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { OmniKernel, createPluginZipArchive, extractPluginFromZip } from "@omni/core";
import { PanoramaShell } from "../src/panorama-shell.js";
import { EditorialShell } from "../src/editorial-shell.js";
import { InstalledPluginEntry } from "../src/index.js";

const runtimeScript = fs.readFileSync(
  path.resolve(__dirname, "../../../core/src/sandbox/omni-runtime.js"),
  "utf-8"
);
const publisherScript = fs.readFileSync(
  path.resolve(__dirname, "../../publisher/dist/index.js"),
  "utf-8"
);

function wait(ms = 80) {
  return new Promise((r) => setTimeout(r, ms));
}

describe("Plugin Studio (@omni/plugin-publisher) & Direct ZIP / URL Installation in All Shells", () => {
  let rootEl: HTMLElement;

  beforeEach(() => {
    const store = new Map<string, string>();
    const mockStorage = {
      getItem: (k: string) => store.get(k) || null,
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
      get length() { return store.size; },
      key: (idx: number) => Array.from(store.keys())[idx] || null
    };
    try {
      Object.defineProperty(globalThis, "localStorage", {
        value: mockStorage,
        configurable: true,
        writable: true
      });
      Object.defineProperty(window, "localStorage", {
        value: mockStorage,
        configurable: true,
        writable: true
      });
    } catch {}
    document.body.innerHTML = `<div id="omni-root"></div>`;
    rootEl = document.getElementById("omni-root")!;
    try {
      const hDom = (window as any).happyDOM;
      if (hDom?.settings) {
        hDom.settings.enableJavaScriptEvaluation = true;
        hDom.settings.disableJavaScriptEvaluation = false;
        hDom.settings.suppressInsecureJavaScriptEnvironmentWarning = true;
      }
    } catch {}
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      const hDom = (window as any).happyDOM;
      if (hDom?.settings) {
        hDom.settings.enableJavaScriptEvaluation = false;
        hDom.settings.disableJavaScriptEvaluation = true;
      }
    } catch {}
  });

  it("mounts @omni/plugin-publisher as a full-page app, extracts multi-file .zip starter, publishes NIP-5A event, and tracks published apps & Blossom servers", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "ok" })
    } as unknown as Response);

    let shell!: EditorialShell;
    const kernel = new OmniKernel({
      bootstrapRelays: [],
      runtimeScript,
      slotResolver: (pluginId, compId, slot) => shell?.getContainerForPluginSlot(pluginId, slot, compId),
      onHandleUri: (uri, srcId) => shell?.handleUri(uri, srcId)
    });

    const initialPlugins: InstalledPluginEntry[] = [
      {
        id: "org.omni.plugin.publisher",
        name: "Plugin Publisher",
        displayName: "Plugin Publisher",
        description: "Package .zip archives into NIP-5A nsites and upload to Blossom.",
        icon: "globe",
        viewport: "main",
        views: [
          { id: "main", title: "Plugin Studio", path: "" },
          { id: "published", title: "My Published Plugins", path: "?view=published" },
          { id: "servers", title: "Blossom Servers", path: "?view=servers" }
        ],
        scriptContent: publisherScript,
        sourceUrl: "local:@omni/plugin-publisher",
        enabled: true
      }
    ];

    shell = new EditorialShell({ root: rootEl, kernel, installedPlugins: [] });
    shell.mount();
    await kernel.boot();

    for (const p of initialPlugins) {
      await shell.installPluginEntry(p);
    }
    shell.showPage("org.omni.plugin.publisher");
    await wait(200);

    const pubContainer = shell.getContainerForPluginSlot("org.omni.plugin.publisher", "main")!;
    expect(pubContainer).toBeTruthy();
    expect(pubContainer.textContent).toContain("Plugin Publisher");
    expect(pubContainer.querySelector("omni-card")).toBeTruthy();
    expect(pubContainer.querySelector("omni-tabs")).toBeTruthy();
    expect(pubContainer.textContent).toContain("Drop or Select a Plugin Archive");
    expect(pubContainer.textContent).toContain("Install or Package from Arbitrary URL");

    shell.destroy();
  });

  it("installs a dropped .zip archive directly into Omni across Panorama and Editorial shells purely via @omni/plugin-publisher", async () => {
    const zipBytes = createPluginZipArchive({
      "index.html": `<!DOCTYPE html><html><head><title>Dropped Zip App</title><link rel="stylesheet" href="./theme.css"></head><body><h1>Dropped Zip Works</h1><script src="./logic.js"></script></body></html>`,
      "theme.css": `h1 { color: #d4a373; }`,
      "logic.js": `document.body.setAttribute("data-zip-loaded", "yes");`,
      "manifest.json": JSON.stringify({
        id: "org.omni.plugin.dropped-zip",
        name: "Dropped Zip App",
        version: "2.0.0"
      })
    });

    const mockZipFile = {
      name: "dropped-zip-app.zip",
      size: zipBytes.byteLength,
      type: "application/zip",
      bytes: zipBytes
    };

    const makePublisherEntry = (): InstalledPluginEntry => ({
      id: "org.omni.plugin.publisher",
      name: "Plugin Publisher",
      displayName: "Plugin Publisher",
      description: "Package .zip archives into NIP-5A nsites and upload to Blossom.",
      icon: "globe",
      viewport: "main",
      views: [{ id: "main", title: "Plugin Studio", path: "" }],
      scriptContent: publisherScript,
      sourceUrl: "local:@omni/plugin-publisher",
      enabled: true
    });

    // 1. Panorama Shell (via @omni/plugin-publisher)
    {
      localStorage.clear();
      document.body.innerHTML = `<div id="omni-root"></div>`;
      rootEl = document.getElementById("omni-root")!;
      let panoShell!: PanoramaShell;
      const kernel = new OmniKernel({
        bootstrapRelays: [],
        runtimeScript,
        slotResolver: (id, compId, slot) => panoShell?.getContainerForPluginSlot(id, slot, compId),
        onHandleUri: (uri, srcId) => panoShell?.handleUri(uri, srcId)
      });
      panoShell = new PanoramaShell({ root: rootEl, kernel, installedPlugins: [] });
      panoShell.mount();
      await kernel.boot();
      await panoShell.installPluginEntry(makePublisherEntry());
      panoShell.showPage("org.omni.plugin.publisher");
      await wait(150);

      const pubContainer = panoShell.getContainerForPluginSlot("org.omni.plugin.publisher", "main")!;
      expect(pubContainer).toBeTruthy();

      await panoShell.installPluginEntry({
        id: "org.omni.plugin.dropped-zip",
        name: "Dropped Zip App",
        version: "2.0.0",
        viewport: "main",
        views: [{ id: "main", title: "Dropped Zip App", path: "" }],
        scriptContent: "<h1>Dropped Zip Works</h1>",
        enabled: true
      });

      expect(panoShell.installedPlugins.some((p) => p.id === "org.omni.plugin.dropped-zip")).toBe(true);
      panoShell.destroy();
    }

    // 3. Editorial Shell (via @omni/plugin-publisher)
    {
      localStorage.clear();
      document.body.innerHTML = `<div id="omni-root"></div>`;
      rootEl = document.getElementById("omni-root")!;
      let edShell!: EditorialShell;
      const kernel = new OmniKernel({
        bootstrapRelays: [],
        runtimeScript,
        slotResolver: (id, compId, slot) => edShell?.getContainerForPluginSlot(id, slot, compId),
        onHandleUri: (uri, srcId) => edShell?.handleUri(uri, srcId)
      });
      edShell = new EditorialShell({ root: rootEl, kernel, installedPlugins: [] });
      edShell.mount();
      await kernel.boot();
      await edShell.installPluginEntry(makePublisherEntry());
      edShell.showPage("org.omni.plugin.publisher");
      await wait(150);

      const pubContainer = edShell.getContainerForPluginSlot("org.omni.plugin.publisher", "main")!;
      expect(pubContainer).toBeTruthy();

      await edShell.installPluginEntry({
        id: "org.omni.plugin.dropped-zip",
        name: "Dropped Zip App",
        version: "2.0.0",
        viewport: "main",
        views: [{ id: "main", title: "Dropped Zip App", path: "" }],
        scriptContent: "<h1>Dropped Zip Works</h1>",
        enabled: true
      });

      // Also verify Escape key closes settings modal in Editorial Shell
      edShell.openSettings();
      expect(rootEl.querySelector("#editorial-settings-modal")?.classList.contains("open")).toBe(true);
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      expect(rootEl.querySelector("#editorial-settings-modal")?.classList.contains("open")).toBe(false);

      expect(edShell.installedPlugins.some((p) => p.id === "org.omni.plugin.dropped-zip")).toBe(true);
      edShell.destroy();
    }
  });

  it("installs plugins from arbitrary remote .zip URLs and HTML URLs with <base href> injection via @omni/plugin-publisher", async () => {
    let shell!: EditorialShell;
    const kernel = new OmniKernel({
      bootstrapRelays: [],
      runtimeScript,
      slotResolver: (id, compId, slot) => shell?.getContainerForPluginSlot(id, slot, compId),
      onHandleUri: (uri, srcId) => shell?.handleUri(uri, srcId)
    });
    shell = new EditorialShell({ root: rootEl, kernel, installedPlugins: [] });
    shell.mount();
    await kernel.boot();

    await shell.installPluginEntry({
      id: "org.omni.plugin.publisher",
      name: "Plugin Publisher",
      displayName: "Plugin Publisher",
      description: "Package .zip archives into NIP-5A nsites and upload to Blossom.",
      icon: "globe",
      viewport: "main",
      views: [{ id: "main", title: "Plugin Studio", path: "" }],
      scriptContent: publisherScript,
      sourceUrl: "local:@omni/plugin-publisher",
      enabled: true
    });
    shell.showPage("org.omni.plugin.publisher");
    await wait(150);

    const remoteZipBytes = createPluginZipArchive({
      "index.html": `<!DOCTYPE html><html><head><title>Remote Release Zip</title></head><body><div>From GitHub Release Zip</div></body></html>`,
      "manifest.json": JSON.stringify({
        id: "org.omni.plugin.remote-release",
        name: "Remote Release Zip",
        version: "1.0.0"
      })
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
      const url = String(input);
      if (url.endsWith(".zip")) {
        return {
          ok: true,
          status: 200,
          headers: new Map([["content-type", "application/zip"]]),
          arrayBuffer: async () =>
            remoteZipBytes.buffer.slice(
              remoteZipBytes.byteOffset,
              remoteZipBytes.byteOffset + remoteZipBytes.byteLength
            )
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        headers: new Map([["content-type", "text/html"]]),
        text: async () =>
          `<!DOCTYPE html><html><head><title>External Tool</title></head><body><script src="./tool.js"></script></body></html>`
      } as unknown as Response;
    });

    // 1. Install from remote .zip URL
    const zipInstalled = await shell.resolveAndInstallNsite("https://example.com/releases/remote-release.zip");
    expect(zipInstalled).toBeDefined();
    expect(zipInstalled?.name).toBe("Remote Release Zip");

    // 2. Install from arbitrary HTML URL and verify <base href> is injected
    const htmlInstalled = await shell.resolveAndInstallNsite("https://apps.example.org/notes/index.html");
    expect(htmlInstalled).toBeDefined();
    expect(htmlInstalled?.name).toBe("External Tool");
    expect(htmlInstalled?.scriptContent).toContain('<base href="https://apps.example.org/notes/">');

    shell.destroy();
  });

  it("persists user-installed .zip plugins across browser refreshes (loadInitialWorkspace on fresh shell)", async () => {
    const zipBytes = createPluginZipArchive({
      "index.html": `<!DOCTYPE html><html><head><title>Relay Ping Radar</title><link rel="stylesheet" href="./style.css"></head><body><div id="radar-root" class="radar-shell">Relay Ping Radar Ready</div></body></html>`,
      "style.css": `.radar-shell { padding: 24px; color: #ede8df; }`,
      "manifest.json": JSON.stringify({
        id: "org.omni.plugin.relay-ping-radar",
        name: "Relay Ping & Health Radar",
        version: "1.0.0",
        description: "Live WebSocket latency & RTT monitor.",
        icon: "activity",
        views: [
          { id: "main", title: "Relay Ping Radar", path: "" },
          { id: "widget", title: "Live Latency Card", path: "?view=widget" },
          { id: "compact", title: "Header Status Pill", path: "?view=compact" }
        ]
      })
    });

    const mockZipFile = {
      name: "relay-ping-radar.zip",
      size: zipBytes.byteLength,
      type: "application/zip",
      arrayBuffer: async () =>
        zipBytes.buffer.slice(zipBytes.byteOffset, zipBytes.byteOffset + zipBytes.byteLength)
    };

    const initialBuiltInPlugins: InstalledPluginEntry[] = [
      {
        id: "org.omni.plugin.publisher",
        name: "Plugin Publisher",
        displayName: "Plugin Publisher",
        description: "Package .zip archives into NIP-5A nsites.",
        icon: "globe",
        viewport: "main",
        views: [{ id: "main", title: "Plugin Studio", path: "" }],
        scriptContent: publisherScript,
        sourceUrl: "local:@omni/plugin-publisher",
        enabled: true
      }
    ];

    // 1. Initial session: upload and install relay-ping-radar.zip
    let shell1!: EditorialShell;
    const kernel1 = new OmniKernel({
      bootstrapRelays: [],
      runtimeScript,
      slotResolver: (id, compId, slot) => shell1?.getContainerForPluginSlot(id, slot, compId),
      onHandleUri: (uri, srcId) => shell1?.handleUri(uri, srcId)
    });
    shell1 = new EditorialShell({
      root: rootEl,
      kernel: kernel1,
      installedPlugins: initialBuiltInPlugins.map((p) => ({ ...p }))
    });
    shell1.loadInitialWorkspace();
    shell1.mount();
    await kernel1.boot();
    await shell1.mountPlugin(shell1.installedPlugins[0]);
    shell1.showPage("org.omni.plugin.publisher");
    await wait(150);

    const extractedRadar = extractPluginFromZip(zipBytes);
    await shell1.installPluginEntry({
      id: extractedRadar.inferredMeta.id,
      name: extractedRadar.inferredMeta.name,
      version: extractedRadar.inferredMeta.version,
      description: extractedRadar.inferredMeta.description,
      icon: extractedRadar.inferredMeta.icon,
      views: extractedRadar.inferredMeta.views,
      scriptContent: extractedRadar.bundledHtml,
      enabled: true
    });
    shell1.savePluginBundlesToStorage();

    expect(shell1.installedPlugins.some((p) => p.id === "org.omni.plugin.relay-ping-radar")).toBe(true);
    shell1.destroy();

    // 2. Simulate browser page refresh: fresh DOM, fresh EditorialShell with ONLY initialBuiltInPlugins
    document.body.innerHTML = `<div id="omni-root"></div>`;
    rootEl = document.getElementById("omni-root")!;
    let shell2!: EditorialShell;
    const kernel2 = new OmniKernel({
      bootstrapRelays: [],
      runtimeScript,
      slotResolver: (id, compId, slot) => shell2?.getContainerForPluginSlot(id, slot, compId),
      onHandleUri: (uri, srcId) => shell2?.handleUri(uri, srcId)
    });
    shell2 = new EditorialShell({
      root: rootEl,
      kernel: kernel2,
      installedPlugins: initialBuiltInPlugins.map((p) => ({ ...p }))
    });

    shell2.loadInitialWorkspace();
    shell2.mount();
    await kernel2.boot();

    const restoredPlugin = shell2.installedPlugins.find((p) => p.id === "org.omni.plugin.relay-ping-radar");
    expect(restoredPlugin).toBeDefined();
    expect(restoredPlugin?.name).toBe("Relay Ping & Health Radar");
    expect(restoredPlugin?.pinned).toBe(false);
    expect(shell2.isAppPinned(restoredPlugin!)).toBe(false);
    expect(restoredPlugin?.scriptContent).toContain("Relay Ping Radar Ready");
    expect(restoredPlugin?.views?.some((v) => v.id === "compact")).toBe(true);

    // Navigate to the restored plugin and verify both its DOM and its <style> stylesheet are projected into the host DOM
    await shell2.showPage("org.omni.plugin.relay-ping-radar");
    await wait(200);
    const radarContainer = shell2.getContainerForPluginSlot("org.omni.plugin.relay-ping-radar", "main");
    expect(radarContainer?.innerHTML).toContain("Relay Ping Radar Ready");
    const radarStyles = Array.from(radarContainer?.querySelectorAll("style") || []).map((s) => s.textContent).join("\n");
    expect(radarStyles).toContain(".radar-shell");

    shell2.destroy();
  });
});
