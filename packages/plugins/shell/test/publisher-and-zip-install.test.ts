// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { OmniKernel, createPluginZipArchive } from "@omni/core";
import { OmniShell, PanoramaShell, EditorialShell, InstalledPluginEntry } from "../src/index.js";

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

    let shell!: OmniShell;
    const kernel = new OmniKernel({
      bootstrapRelays: [],
      runtimeScript,
      slotResolver: (pluginId, compId, slot) => shell?.getContainerForPluginSlot(pluginId, slot, compId),
      onHandleUri: (uri, srcId) => shell?.handleUri(uri, srcId)
    });

    const initialPlugins: InstalledPluginEntry[] = [
      {
        id: "org.omni.plugin.publisher",
        name: "Plugin Studio",
        displayName: "Publisher",
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

    shell = new OmniShell({ root: rootEl, kernel, installedPlugins: [] });
    shell.mount();
    await kernel.boot();

    for (const p of initialPlugins) {
      await shell.installPluginEntry(p);
    }
    shell.showPage("org.omni.plugin.publisher");
    await wait(200);

    const pubContainer = shell.getContainerForPluginSlot("org.omni.plugin.publisher", "main")!;
    expect(pubContainer).toBeTruthy();
    expect(pubContainer.textContent).toContain("Plugin Studio & Blossom Publisher");

    // Verify clicking #btn-browse-zip synchronously triggers the host DOM <input type="file">
    const hostFileInput = pubContainer.querySelector("#studio-file-input") as HTMLInputElement;
    expect(hostFileInput).toBeTruthy();
    const clickSpy = vi.spyOn(hostFileInput, "click");
    const btnBrowseZip = pubContainer.querySelector("#btn-browse-zip") as HTMLButtonElement;
    expect(btnBrowseZip).toBeTruthy();
    btnBrowseZip.click();
    expect(clickSpy).toHaveBeenCalledTimes(1);

    // 1. Click "Load Multi-File Starter Template (.zip)"
    const btnStarter = pubContainer.querySelector("#btn-load-starter-zip") as HTMLButtonElement;
    expect(btnStarter).toBeTruthy();
    btnStarter.click();
    await wait(150);

    // Verify all 4 files from the starter .zip were extracted and hashed
    const fileRows = pubContainer.querySelectorAll(".extracted-file-row");
    expect(fileRows.length).toBe(4);
    expect(pubContainer.textContent).toContain("index.html");
    expect(pubContainer.textContent).toContain("style.css");
    expect(pubContainer.textContent).toContain("app.js");
    expect(pubContainer.textContent).toContain("manifest.json");

    // 2. Toggle between Option A (Single-File Inlined) and Option B (Multi-File Blossom)
    const modeInlined = pubContainer.querySelector("#mode-card-inlined") as HTMLElement;
    expect(modeInlined).toBeTruthy();
    modeInlined.click();
    await wait(80);

    // 3. Publish to Nostr (NIP-5A)
    const btnPublish = pubContainer.querySelector("#btn-publish-blossom-nostr") as HTMLButtonElement;
    expect(btnPublish).toBeTruthy();
    btnPublish.click();
    await wait(350);

    const naddrEl = pubContainer.querySelector("#studio-result-naddr");
    expect(naddrEl, "LOGS: " + pubContainer.textContent?.slice(-400)).toBeTruthy();
    expect(naddrEl?.textContent?.startsWith("naddr1")).toBe(true);

    // 4. Switch to "My Published Plugins" tab and verify our published plugin is listed
    const tabPublished = pubContainer.querySelector("#tab-btn-published") as HTMLButtonElement;
    tabPublished.click();
    await wait(150);

    const publishedCards = pubContainer.querySelectorAll(".published-app-card");
    expect(publishedCards.length).toBeGreaterThanOrEqual(1);
    expect(pubContainer.textContent).toContain("Pomodoro Focus Studio");

    // 5. Switch to "Blossom Servers" tab and add a custom Blossom server
    const tabServers = pubContainer.querySelector("#tab-btn-servers") as HTMLButtonElement;
    tabServers.click();
    await wait(150);

    const srvRowsBefore = pubContainer.querySelectorAll(".blossom-server-row").length;
    expect(srvRowsBefore).toBe(3);

    const newSrvInput = pubContainer.querySelector("#input-new-blossom-server") as HTMLInputElement;
    newSrvInput.value = "https://blossom.my-custom-node.org";
    newSrvInput.dispatchEvent(new Event("input", { bubbles: true }));
    await wait(50);

    const btnAddSrv = pubContainer.querySelector("#btn-add-blossom-server") as HTMLButtonElement;
    btnAddSrv.click();
    await wait(120);

    const srvRowsAfter = pubContainer.querySelectorAll(".blossom-server-row").length;
    expect(srvRowsAfter).toBe(4);
    expect(pubContainer.textContent).toContain("https://blossom.my-custom-node.org");

    shell.destroy();
  });

  it("installs a dropped .zip archive directly into Omni across Classic, Panorama, and Editorial shells purely via @omni/plugin-publisher", async () => {
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
      name: "Plugin Studio",
      displayName: "Publisher",
      description: "Package .zip archives into NIP-5A nsites and upload to Blossom.",
      icon: "globe",
      viewport: "main",
      views: [{ id: "main", title: "Plugin Studio", path: "" }],
      scriptContent: publisherScript,
      sourceUrl: "local:@omni/plugin-publisher",
      enabled: true
    });

    // 1. Classic Shell (via @omni/plugin-publisher)
    {
      let classicShell!: OmniShell;
      const kernel = new OmniKernel({
        bootstrapRelays: [],
        runtimeScript,
        slotResolver: (id, compId, slot) => classicShell?.getContainerForPluginSlot(id, slot, compId),
        onHandleUri: (uri, srcId) => classicShell?.handleUri(uri, srcId)
      });
      classicShell = new OmniShell({ root: rootEl, kernel, installedPlugins: [] });
      classicShell.mount();
      await kernel.boot();
      await classicShell.installPluginEntry(makePublisherEntry());
      classicShell.showPage("org.omni.plugin.publisher");
      await wait(150);

      const pubContainer = classicShell.getContainerForPluginSlot("org.omni.plugin.publisher", "main")!;
      const dropzone = pubContainer.querySelector("#studio-zip-dropzone")!;
      expect(dropzone).toBeTruthy();

      dropzone.dispatchEvent(new CustomEvent("drop", { detail: { files: [mockZipFile] } }));
      await wait(150);

      const btnInstallLocal = pubContainer.querySelector("#btn-install-local-direct") as HTMLButtonElement;
      expect(btnInstallLocal).toBeTruthy();
      btnInstallLocal.click();
      await wait(350);

      expect(classicShell.installedPlugins.some((p) => p.id === "org.omni.plugin.dropped-zip")).toBe(true);
      classicShell.destroy();
    }

    // 2. Panorama Shell (via @omni/plugin-publisher)
    {
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
      const dropzone = pubContainer.querySelector("#studio-zip-dropzone")!;
      dropzone.dispatchEvent(new CustomEvent("drop", { detail: { files: [mockZipFile] } }));
      await wait(150);

      const btnInstallLocal = pubContainer.querySelector("#btn-install-local-direct") as HTMLButtonElement;
      btnInstallLocal.click();
      await wait(350);

      expect(panoShell.installedPlugins.some((p) => p.id === "org.omni.plugin.dropped-zip")).toBe(true);
      panoShell.destroy();
    }

    // 3. Editorial Shell (via @omni/plugin-publisher)
    {
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
      const dropzone = pubContainer.querySelector("#studio-zip-dropzone")!;
      dropzone.dispatchEvent(new CustomEvent("drop", { detail: { files: [mockZipFile] } }));
      await wait(150);

      const btnInstallLocal = pubContainer.querySelector("#btn-install-local-direct") as HTMLButtonElement;
      btnInstallLocal.click();
      await wait(350);

      expect(edShell.installedPlugins.some((p) => p.id === "org.omni.plugin.dropped-zip")).toBe(true);
      edShell.destroy();
    }
  });

  it("installs plugins from arbitrary remote .zip URLs and HTML URLs with <base href> injection via @omni/plugin-publisher", async () => {
    let shell!: OmniShell;
    const kernel = new OmniKernel({
      bootstrapRelays: [],
      runtimeScript,
      slotResolver: (id, compId, slot) => shell?.getContainerForPluginSlot(id, slot, compId),
      onHandleUri: (uri, srcId) => shell?.handleUri(uri, srcId)
    });
    shell = new OmniShell({ root: rootEl, kernel, installedPlugins: [] });
    shell.mount();
    await kernel.boot();

    await shell.installPluginEntry({
      id: "org.omni.plugin.publisher",
      name: "Plugin Studio",
      displayName: "Publisher",
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

    const pubContainer = shell.getContainerForPluginSlot("org.omni.plugin.publisher", "main")!;

    // 1. Install from remote .zip URL via @omni/plugin-publisher
    const urlInput1 = pubContainer.querySelector("#input-studio-arbitrary-url") as HTMLInputElement;
    urlInput1.value = "https://example.com/releases/remote-release.zip";
    urlInput1.dispatchEvent(new Event("input", { bubbles: true }));
    await wait(50);

    const btnInstallUrl1 = pubContainer.querySelector("#btn-studio-install-url") as HTMLButtonElement;
    btnInstallUrl1.click();
    await wait(400);

    const zipInstalled = shell.installedPlugins.find((p) => p.id === "org.omni.plugin.remote-release");
    expect(zipInstalled).toBeDefined();
    expect(zipInstalled?.name).toBe("Remote Release Zip");

    // 2. Install from arbitrary HTML URL via @omni/plugin-publisher and verify <base href> is injected
    const urlInput2 = pubContainer.querySelector("#input-studio-arbitrary-url") as HTMLInputElement;
    urlInput2.value = "https://apps.example.org/notes/index.html";
    urlInput2.dispatchEvent(new Event("input", { bubbles: true }));
    await wait(50);

    const btnInstallUrl2 = pubContainer.querySelector("#btn-studio-install-url") as HTMLButtonElement;
    btnInstallUrl2.click();
    await wait(400);

    const htmlInstalled = shell.installedPlugins.find((p) => p.id === "org.omni.plugin.external-tool");
    expect(htmlInstalled).toBeDefined();
    expect(htmlInstalled?.name).toBe("External Tool");
    expect(htmlInstalled?.scriptContent).toContain('<base href="https://apps.example.org/notes/">');

    shell.destroy();
  });
});
