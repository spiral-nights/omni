// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import {
  getPublisherSchema,
  getPublisherWidgetSchema,
  handlePublisherAction,
  getPublisherState,
  resetPublisherState,
  buildStarterPluginZip,
  createZipArchiveBytes,
  unzipArchiveSync
} from "../src/index.js";
import type { OmniBoxPrimitive, OmniCardPrimitive, OmniTabsPrimitive } from "@omni/types";

describe("@omni/plugin-publisher Declarative Schema & State Machine", () => {
  beforeEach(() => {
    if (typeof localStorage !== "undefined" && typeof localStorage.clear === "function") {
      localStorage.clear();
    }
    resetPublisherState();
  });

  it("renders the Create & Upload tab schema with dropzone and arbitrary URL cards", () => {
    const root = getPublisherSchema("create") as OmniBoxPrimitive;

    expect(root.type).toBe("box");
    expect(root.direction).toBe("column");

    // Header card
    const headerCard = root.children?.[0] as OmniCardPrimitive;
    expect(headerCard.type).toBe("card");
    expect(headerCard.title).toBe("Plugin Studio & Blossom Publisher");

    const tabsNode = headerCard.children?.find((c) => c.type === "tabs") as OmniTabsPrimitive;
    expect(tabsNode).toBeDefined();
    expect(tabsNode.activeTab).toBe("create");
    expect(tabsNode.tabs.length).toBe(3);

    // Dropzone card
    const dropzoneCard = root.children?.find(
      (c) => c.type === "card" && (c as OmniCardPrimitive).title?.includes("Drop or Select")
    ) as OmniCardPrimitive;
    expect(dropzoneCard).toBeDefined();
    const fileInput = dropzoneCard.children?.find((c) => c.type === "input") as any;
    expect(fileInput).toBeDefined();
    expect(fileInput.inputType).toBe("file");
    expect(fileInput.actionOnChange?.name).toBe("file-selected");

    // Starter template button
    const starterBtnBox = dropzoneCard.children?.find((c) => c.type === "box") as any;
    const starterBtn = starterBtnBox?.children?.find((c: any) => c.type === "button");
    expect(starterBtn).toBeDefined();
    expect(starterBtn.action?.name).toBe("load-starter");

    // URL installer card
    const urlCard = root.children?.find(
      (c) => c.type === "card" && (c as OmniCardPrimitive).title?.includes("Arbitrary URL")
    ) as OmniCardPrimitive;
    expect(urlCard).toBeDefined();
  });

  it("handles 'switch-tab' action to published and servers tabs", async () => {
    const pubSchema = (await handlePublisherAction({ name: "switch-tab" }, { tab: "published" })) as OmniBoxPrimitive;
    const headerCardPub = pubSchema.children?.[0] as OmniCardPrimitive;
    const tabsPub = headerCardPub.children?.find((c) => c.type === "tabs") as OmniTabsPrimitive;
    expect(tabsPub.activeTab).toBe("published");

    // Published tab with 0 apps shows empty state
    const emptyState = pubSchema.children?.find((c) => c.type === "empty-state");
    expect(emptyState).toBeDefined();

    const srvSchema = (await handlePublisherAction({ name: "switch-tab" }, { tab: "servers" })) as OmniBoxPrimitive;
    const headerCardSrv = srvSchema.children?.[0] as OmniCardPrimitive;
    const tabsSrv = headerCardSrv.children?.find((c) => c.type === "tabs") as OmniTabsPrimitive;
    expect(tabsSrv.activeTab).toBe("servers");

    // Servers tab lists default Blossom servers
    const srvCard = srvSchema.children?.find(
      (c) => c.type === "card" && (c as OmniCardPrimitive).title?.includes("Blossom Server Endpoints")
    ) as OmniCardPrimitive;
    expect(srvCard).toBeDefined();
    const srvList = srvCard.children?.find((c) => c.type === "list") as any;
    expect(srvList).toBeDefined();
    expect(srvList.items.length).toBeGreaterThanOrEqual(3);
  });

  it("handles 'load-starter' action and extracts multi-file template", async () => {
    const nextSchema = (await handlePublisherAction({ name: "load-starter" })) as OmniBoxPrimitive;

    const state = getPublisherState();
    expect(state.extractedFiles.length).toBe(4);
    expect(state.appName).toBe("Pomodoro Focus Studio");
    expect(state.appId).toBe("org.omni.plugin.pomodoro-studio");
    expect(state.appVersion).toBe("1.0.0");

    // Schema now shows Extracted Archive Files and Plugin Metadata cards
    const extractedCard = nextSchema.children?.find(
      (c) => c.type === "card" && (c as OmniCardPrimitive).title?.includes("Extracted Archive Files")
    ) as OmniCardPrimitive;
    expect(extractedCard).toBeDefined();
    const listNode = extractedCard.children?.find((c) => c.type === "list") as any;
    expect(listNode.items.length).toBe(4);

    const metaCard = nextSchema.children?.find(
      (c) => c.type === "card" && (c as OmniCardPrimitive).title?.includes("Plugin Metadata")
    ) as OmniCardPrimitive;
    expect(metaCard).toBeDefined();
  });

  it("handles 'file-selected' action with custom ZIP archive", async () => {
    const testZip = createZipArchiveBytes({
      "index.html": "<!DOCTYPE html><html><head><title>My Super App</title></head><body>Hello</body></html>",
      "style.css": "body { color: red; }"
    });

    const nextSchema = (await handlePublisherAction(
      { name: "file-selected" },
      { fileName: "super-app.zip", fileBytes: testZip }
    )) as OmniBoxPrimitive;

    const state = getPublisherState();
    expect(state.extractedFiles.length).toBe(2);
    expect(state.appName).toBe("My Super App");
    expect(state.appId).toBe("org.omni.plugin.my-super-app");

    const extractedCard = nextSchema.children?.find(
      (c) => c.type === "card" && (c as OmniCardPrimitive).title?.includes("Extracted Archive Files (2)")
    );
    expect(extractedCard).toBeDefined();
  });

  it("handles packaging mode toggling between inlined and multifile", async () => {
    await handlePublisherAction({ name: "set-packaging-mode" }, { mode: "multifile" });
    expect(getPublisherState().packagingMode).toBe("multifile");

    await handlePublisherAction({ name: "set-packaging-mode" }, { mode: "inlined" });
    expect(getPublisherState().packagingMode).toBe("inlined");
  });

  it("handles Blossom server management (add, toggle, remove)", async () => {
    // Add server
    await handlePublisherAction({ name: "add-server" }, { newServerUrl: "https://blossom.custom.org" });
    let state = getPublisherState();
    expect(state.servers.some((s) => s.url === "https://blossom.custom.org")).toBe(true);

    // Toggle server
    await handlePublisherAction({ name: "toggle-server" }, { url: "https://blossom.custom.org" });
    state = getPublisherState();
    const target = state.servers.find((s) => s.url === "https://blossom.custom.org");
    expect(target?.enabled).toBe(false);

    // Remove server
    await handlePublisherAction({ name: "remove-server" }, { url: "https://blossom.custom.org" });
    state = getPublisherState();
    expect(state.servers.some((s) => s.url === "https://blossom.custom.org")).toBe(false);
  });

  it("handles 'prepare-update' action by filling metadata and incrementing version", async () => {
    await handlePublisherAction(
      { name: "prepare-update" },
      {
        appId: "org.omni.plugin.test",
        appName: "Test Plugin",
        appVersion: "1.2.3",
        appDescription: "Updated desc"
      }
    );

    const state = getPublisherState();
    expect(state.activeTab).toBe("create");
    expect(state.appId).toBe("org.omni.plugin.test");
    expect(state.appName).toBe("Test Plugin");
    expect(state.appVersion).toBe("1.2.4");
    expect(state.appDescription).toBe("Updated desc");
  });

  it("renders the widget companion schema with metric and launcher button", () => {
    const widgetSchema = getPublisherWidgetSchema() as OmniCardPrimitive;
    expect(widgetSchema.type).toBe("card");
    expect(widgetSchema.title).toBe("Plugin Studio");

    const metricNode = widgetSchema.children?.find((c) => c.type === "metric") as any;
    expect(metricNode).toBeDefined();
    expect(metricNode.label).toBe("Published Plugins");

    const buttonNode = widgetSchema.children?.find((c) => c.type === "button") as any;
    expect(buttonNode).toBeDefined();
    expect(buttonNode.action.name).toBe("open-studio");
  });

  it("creates and unzips ZIP archives with full fidelity", () => {
    const files = {
      "index.html": "<!DOCTYPE html><html><body><h1>Hello World</h1></body></html>",
      "nested/style.css": "body { margin: 0; background: #000; }",
      "data.json": JSON.stringify({ version: "1.0.0", active: true })
    };

    const zipBytes = createZipArchiveBytes(files);
    expect(zipBytes.byteLength).toBeGreaterThan(0);

    const extracted = unzipArchiveSync(zipBytes);
    expect(Object.keys(extracted).length).toBe(3);
    expect(new TextDecoder().decode(extracted["index.html"])).toBe(files["index.html"]);
    expect(new TextDecoder().decode(extracted["nested/style.css"])).toBe(files["nested/style.css"]);
    expect(new TextDecoder().decode(extracted["data.json"])).toBe(files["data.json"]);
  });

  it("generates a valid starter template ZIP", () => {
    const starterZip = buildStarterPluginZip();
    expect(starterZip.byteLength).toBeGreaterThan(100);

    const extracted = unzipArchiveSync(starterZip);
    expect(extracted["index.html"]).toBeDefined();
    expect(extracted["style.css"]).toBeDefined();
    expect(extracted["app.js"]).toBeDefined();
    expect(extracted["manifest.json"]).toBeDefined();
  });
});
