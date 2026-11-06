// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { IframeAppHost, buildTokenStyleTag, buildGuestBridgeScript } from "../src/sandbox/iframe-app-host.js";

describe("IframeAppHost (Direct Visual IFrame Embed)", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  it("mounts an iframe element with sandbox attributes and injected bridge", () => {
    const host = new IframeAppHost({
      container,
      pluginId: "org.omni.plugin.testapp",
      htmlContent: "<h1>Hello from nsite</h1>"
    });

    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("sandbox")).toContain("allow-scripts");
    expect(iframe?.getAttribute("sandbox")).toContain("allow-forms");
    expect(iframe?.getAttribute("allow")).toContain("geolocation");

    const srcdoc = iframe?.srcdoc || "";
    expect(srcdoc).toContain("Hello from nsite");
    expect(srcdoc).toContain("omni-design-tokens");
    expect(srcdoc).toContain("omni-guest-bridge");
    expect(srcdoc).toContain("window.nostr =");
    expect(srcdoc).toContain("createStorageShim");

    host.destroy();
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("builds CSS design tokens properly", () => {
    const styleTag = buildTokenStyleTag({
      "--omni-bg-canvas": "#141312",
      "--omni-accent-primary": "#d4a373"
    });

    expect(styleTag).toContain(":root");
    expect(styleTag).toContain("--omni-bg-canvas: #141312;");
    expect(styleTag).toContain("--omni-accent-primary: #d4a373;");
  });

  it("bridges protocol URI clicks to onHandleUri", async () => {
    const onHandleUri = vi.fn().mockResolvedValue(true);
    const host = new IframeAppHost({
      container,
      pluginId: "org.omni.plugin.testapp",
      htmlContent: "<p>App</p>",
      onHandleUri
    });

    const iframe = host.getIframe();

    // Simulate postMessage from iframe
    window.dispatchEvent(
      new MessageEvent("message", {
        source: iframe.contentWindow,
        data: {
          __omni_uri_intent: true,
          pluginId: "org.omni.plugin.testapp",
          uri: "nostr:npub12345"
        }
      })
    );

    expect(onHandleUri).toHaveBeenCalledTimes(1);
    expect(onHandleUri).toHaveBeenCalledWith("nostr:npub12345", "org.omni.plugin.testapp");

    host.destroy();
  });
});
