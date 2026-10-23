// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/curves/abstract/utils";
import {
  createPluginZipArchive,
  extractPluginFromZip,
  createBlossomAuthEventDraft,
  encodeBlossomAuthHeader,
  createBlossomServerListEventDraft,
  uploadFileToBlossom,
  BLOSSOM_AUTH_KIND,
  BLOSSOM_SERVER_LIST_KIND,
  WebCryptoKeystore,
  NostrPluginResolver,
  RelayPool,
  LocalEventStore
} from "../src/index.js";

describe("ZIP Plugin Bundler, Multi-File Blossom Upload & Resolution", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts a multi-file .zip archive, strips common folder prefix, computes SHA-256 hashes, and supports both Option A (inlined) and Option B (multi-file Blossom)", () => {
    const zipBytes = createPluginZipArchive({
      "my-folder/index.html": `<!DOCTYPE html>
<html>
<head>
  <title>Zip Task App</title>
  <meta name="description" content="Multi-file zip plugin test">
  <link rel="stylesheet" href="./style.css">
  <link rel="alternate" href="?view=widget" title="Task Widget">
</head>
<body>
  <div id="app">Hello Zip</div>
  <script type="module" src="./app.js"></script>
</body>
</html>`,
      "my-folder/style.css": `body { background: #141312; color: #ede8df; }`,
      "my-folder/app.js": `console.log("Loaded from app.js");`,
      "my-folder/manifest.json": JSON.stringify({
        id: "org.omni.plugin.zip-task",
        name: "Zip Task App",
        version: "1.2.0",
        icon: "check-circle"
      })
    });

    const extracted = extractPluginFromZip(zipBytes, {
      blossomServer: "https://cdn.satellite.earth"
    });

    expect(extracted.files.length).toBe(4);
    expect(extracted.entryFile).toBe("index.html");
    expect(extracted.inferredMeta.id).toBe("org.omni.plugin.zip-task");
    expect(extracted.inferredMeta.name).toBe("Zip Task App");
    expect(extracted.inferredMeta.version).toBe("1.2.0");
    expect(extracted.inferredMeta.views.some((v) => v.id === "widget")).toBe(true);

    // Verify Option A: Single-File Inlined Bundle
    expect(extracted.bundledHtml).toContain("<style data-inlined-from=\"style.css\">");
    expect(extracted.bundledHtml).toContain("background: #141312;");
    expect(extracted.bundledHtml).toContain("<script type=\"module\" data-inlined-from=\"app.js\">");
    expect(extracted.bundledHtml).toContain("Loaded from app.js");

    // Verify Option B: Multi-File Blossom URLs
    const cssHash = extracted.blossomHashes["style.css"];
    const jsHash = extracted.blossomHashes["app.js"];
    expect(cssHash).toMatch(/^[0-9a-f]{64}$/);
    expect(jsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(extracted.multiFileEntryHtml).toContain(`https://cdn.satellite.earth/${cssHash}`);
    expect(extracted.multiFileEntryHtml).toContain(`https://cdn.satellite.earth/${jsHash}`);
  });

  it("signs BUD-06 kind 24242 auth events, uploads files to Blossom via PUT /upload, and creates BUD-03 kind 10063 server list events", async () => {
    const keystore = new WebCryptoKeystore();
    const contentBytes = new TextEncoder().encode("console.log('blossom test');");
    const hash = bytesToHex(sha256(contentBytes));

    const authDraft = createBlossomAuthEventDraft(hash, "app.js", "upload");
    expect(authDraft.kind).toBe(BLOSSOM_AUTH_KIND);
    expect(authDraft.tags).toContainEqual(["t", "upload"]);
    expect(authDraft.tags).toContainEqual(["x", hash]);

    const signedAuth = await keystore.signEvent(authDraft);
    const header = encodeBlossomAuthHeader(signedAuth);
    expect(header.startsWith("Nostr ")).toBe(true);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK"
    });

    const uploadRes = await uploadFileToBlossom(
      {
        path: "app.js",
        bytes: contentBytes,
        sha256: hash,
        mimeType: "application/javascript"
      },
      "https://cdn.satellite.earth/",
      (draft) => keystore.signEvent(draft),
      mockFetch as any
    );

    expect(uploadRes.uploaded).toBe(true);
    expect(uploadRes.url).toBe(`https://cdn.satellite.earth/${hash}`);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe("https://cdn.satellite.earth/upload");
    expect(calledInit.method).toBe("PUT");
    expect(calledInit.headers["Authorization"]).toMatch(/^Nostr /);
    expect(calledInit.headers["X-SHA-256"]).toBe(hash);

    const serverListDraft = createBlossomServerListEventDraft([
      "https://cdn.satellite.earth/",
      "https://blossom.primal.net"
    ]);
    expect(serverListDraft.kind).toBe(BLOSSOM_SERVER_LIST_KIND);
    expect(serverListDraft.tags).toEqual([
      ["server", "https://cdn.satellite.earth"],
      ["server", "https://blossom.primal.net"]
    ]);
  });

  it("resolves and SHA-256 verifies a multi-file Blossom NIP-5A event (index.html + style.css + app.js)", async () => {
    const keystore = new WebCryptoKeystore();
    const relayPool = new RelayPool([]);
    const eventStore = new LocalEventStore(`test_multifile_${Date.now()}`);

    const htmlText = `<!DOCTYPE html><html><head><title>MultiFile App</title><link rel="stylesheet" href="./style.css"></head><body><script src="./app.js"></script></body></html>`;
    const cssText = `.multi-box { color: #d4a373; }`;
    const jsText = `window.__multiFileLoaded = true;`;

    const htmlHash = bytesToHex(sha256(new TextEncoder().encode(htmlText)));
    const cssHash = bytesToHex(sha256(new TextEncoder().encode(cssText)));
    const jsHash = bytesToHex(sha256(new TextEncoder().encode(jsText)));

    const signedEvent = await keystore.signEvent({
      kind: 35129,
      content: "", // Empty content: forces multi-file Blossom resolution
      tags: [
        ["d", "multifile-blossom-app"],
        ["name", "MultiFile Blossom App"],
        ["f", "index.html", htmlHash, "text/html"],
        ["f", "style.css", cssHash, "text/css"],
        ["f", "app.js", jsHash, "application/javascript"],
        ["server", "https://cdn.satellite.earth"]
      ],
      created_at: Math.floor(Date.now() / 1000)
    });

    await eventStore.saveEvent(signedEvent);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
      const url = String(input);
      if (url.endsWith(htmlHash)) return { ok: true, text: async () => htmlText } as Response;
      if (url.endsWith(cssHash)) return { ok: true, text: async () => cssText } as Response;
      if (url.endsWith(jsHash)) return { ok: true, text: async () => jsText } as Response;
      return { ok: false, status: 404 } as Response;
    });

    const resolved = await NostrPluginResolver.resolve(signedEvent, { relayPool, eventStore });
    expect(resolved.verified).toBe(true);
    expect(resolved.scriptContent).toContain(".multi-box { color: #d4a373; }");
    expect(resolved.scriptContent).toContain("window.__multiFileLoaded = true;");
  });
});
