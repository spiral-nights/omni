// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import omniRuntimeScript from "../../../core/src/sandbox/omni-runtime.js?raw";
import "fake-indexeddb/auto";
import { OmniKernel } from "@omni/core";
import { PanoramaShell } from "../src/panorama-shell.js";
import { EditorialShell } from "../src/editorial-shell.js";
import {
  shellRegistry,
  ShellRegistry,
  OMNI_SHELL_STYLE_ELEMENT_ID
} from "../src/index.js";

describe("Decoupled Shell Styling & Dynamic Shell Registry", () => {
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

    localStorage.clear();
    document.body.innerHTML = "";
  });

  it("lists default built-in shells (editorial and panorama)", () => {
    const shells = shellRegistry.list();
    expect(shells.length).toBeGreaterThanOrEqual(2);
    expect(shells.some((s) => s.id === "editorial")).toBe(true);
    expect(shells.some((s) => s.id === "panorama")).toBe(true);
  });

  it("registers and creates a custom user-installed shell", () => {
    const customShellFactory = {
      id: "minimalist",
      name: "Minimalist Shell",
      description: "An ultra-minimalist terminal-style shell",
      create: (options: any) => {
        return new EditorialShell(options);
      }
    };
    shellRegistry.register(customShellFactory);
    expect(shellRegistry.get("minimalist")?.name).toBe("Minimalist Shell");
    expect(shellRegistry.list().some((s) => s.id === "minimalist")).toBe(true);

    const testRoot = document.createElement("div");
    const testKernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
    const created = shellRegistry.create("minimalist", {
      root: testRoot,
      kernel: testKernel,
      installedPlugins: []
    });
    expect(created).toBeInstanceOf(EditorialShell);

    // Clean up
    shellRegistry.unregister("minimalist");
    expect(shellRegistry.get("minimalist")).toBeUndefined();
  });

  it("installs, lists, and uninstalls custom shells via shellRegistry with persistence", () => {
    const customShell = {
      id: "test-cyberpunk",
      name: "Cyberpunk Terminal",
      description: "Neon high-contrast shell",
      author: "Neo",
      version: "2.0.0"
    };

    shellRegistry.install(customShell, true);
    expect(shellRegistry.get("test-cyberpunk")?.name).toBe("Cyberpunk Terminal");
    expect(shellRegistry.list().some((s) => s.id === "test-cyberpunk")).toBe(true);
    expect(shellRegistry.isBuiltin("test-cyberpunk")).toBe(false);

    // Verify persistence in localStorage
    const saved = localStorage.getItem(ShellRegistry.STORAGE_KEY_INSTALLED);
    expect(saved).toBeTruthy();
    expect(saved).toContain("test-cyberpunk");

    // Test activating custom shell
    shellRegistry.setActiveShell("test-cyberpunk");
    expect(shellRegistry.getActiveShellId()).toBe("test-cyberpunk");

    // Uninstall custom shell
    const uninstalled = shellRegistry.uninstall("test-cyberpunk");
    expect(uninstalled).toBe(true);
    expect(shellRegistry.get("test-cyberpunk")).toBeUndefined();
    expect(shellRegistry.getActiveShellId()).toBe("editorial");
  });

  it("prevents uninstalling built-in shells", () => {
    expect(shellRegistry.isBuiltin("editorial")).toBe(true);
    expect(shellRegistry.isBuiltin("panorama")).toBe(true);
    expect(() => shellRegistry.uninstall("editorial")).toThrow();
    expect(() => shellRegistry.uninstall("panorama")).toThrow();
  });

  it("includes curated shell experiences like Mantra in catalog", () => {
    const catalog = shellRegistry.getCuratedCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(1);
    const mantra = catalog.find((c) => c.id === "mantra");
    expect(mantra).toBeTruthy();
    expect(mantra?.name).toBe("Mantra");
    expect(mantra?.description).toContain("Sacred Editorial");
  });

  it("renders dedicated Installed Shells section in PanoramaShell and supports installing Mantra", () => {
    const testRoot = document.createElement("div");
    document.body.appendChild(testRoot);
    const testKernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
    const testShell = new PanoramaShell({
      root: testRoot,
      kernel: testKernel,
      installedPlugins: []
    });

    testShell.mount();

    // Check for dedicated Installed Shells section & cards
    const shellsSection = testRoot.querySelector("#panorama-shells-card");
    expect(shellsSection).toBeTruthy();
    const shellsList = testRoot.querySelector("#panorama-installed-shells-list");
    expect(shellsList).toBeTruthy();
    const shellCards = testRoot.querySelectorAll(".panorama-shell-card");
    expect(shellCards.length).toBeGreaterThanOrEqual(2);

    // Open install shell modal
    const btnInstall = testRoot.querySelector("#btn-panorama-install-shell") as HTMLElement | null;
    expect(btnInstall).toBeTruthy();
    btnInstall?.click();

    const modal = testRoot.querySelector("#panorama-install-shell-modal") as HTMLElement | null;
    expect(modal?.style.display).toBe("flex");

    // Verify Mantra is listed in curated catalog inside modal
    const catalogEl = testRoot.querySelector("#panorama-curated-shell-catalog");
    expect(catalogEl?.textContent).toContain("Mantra");

    // Install Mantra from curated catalog
    const installMantraBtn = catalogEl?.querySelector(".btn-install-curated-shell[data-shell-id='mantra']") as HTMLElement | null;
    if (installMantraBtn) {
      installMantraBtn.click();
      expect(shellRegistry.get("mantra")).toBeTruthy();
      expect(testRoot.querySelectorAll(".panorama-shell-card").length).toBeGreaterThanOrEqual(3);
    }

    // Cleanup
    shellRegistry.uninstall("mantra");
    testShell.destroy();
    testRoot.remove();
  });

  it("injects editorial stylesheet upon EditorialShell mount and removes it on destroy", () => {
    const testRoot = document.createElement("div");
    document.body.appendChild(testRoot);
    const testKernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
    const testShell = new EditorialShell({
      root: testRoot,
      kernel: testKernel,
      installedPlugins: []
    });

    testShell.mount();
    const styleEl = document.getElementById(OMNI_SHELL_STYLE_ELEMENT_ID);
    expect(styleEl).toBeTruthy();
    expect(styleEl?.textContent).toContain("--omni-bg-canvas");
    expect(document.documentElement.classList.contains("theme-panorama")).toBe(false);

    testShell.destroy();
    expect(document.getElementById(OMNI_SHELL_STYLE_ELEMENT_ID)).toBeNull();
    testRoot.remove();
  });

  it("injects panorama stylesheet upon PanoramaShell mount and removes it on destroy", () => {
    const testRoot = document.createElement("div");
    document.body.appendChild(testRoot);
    const testKernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
    const testShell = new PanoramaShell({
      root: testRoot,
      kernel: testKernel,
      installedPlugins: []
    });

    testShell.mount();
    const styleEl = document.getElementById(OMNI_SHELL_STYLE_ELEMENT_ID);
    expect(styleEl).toBeTruthy();
    expect(styleEl?.textContent).toContain("--omni-bg-canvas: #000000");
    expect(document.documentElement.classList.contains("theme-panorama")).toBe(true);

    testShell.destroy();
    expect(document.getElementById(OMNI_SHELL_STYLE_ELEMENT_ID)).toBeNull();
    expect(document.documentElement.classList.contains("theme-panorama")).toBe(false);
    testRoot.remove();
  });

  it("renders dynamic shell buttons from shellRegistry in settings", () => {
    const testRoot = document.createElement("div");
    document.body.appendChild(testRoot);
    const testKernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
    const testShell = new PanoramaShell({
      root: testRoot,
      kernel: testKernel,
      installedPlugins: []
    });

    testShell.mount();
    const buttons = testRoot.querySelectorAll("#panorama-shell-switcher-buttons button");
    expect(buttons.length).toBeGreaterThanOrEqual(2);

    testShell.destroy();
    testRoot.remove();
  });

  it("dynamically installs nsite via resolveAndInstallNsite with HTML content", async () => {
    const testRoot = document.createElement("div");
    document.body.appendChild(testRoot);
    const testKernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
    const testShell = new EditorialShell({
      root: testRoot,
      kernel: testKernel,
      installedPlugins: []
    });
    testShell.mount();

    const htmlApp = `<!DOCTYPE html>
<html>
<head><title>Dynamic Notes</title></head>
<body><h1>Hello Dynamic nsite</h1></body>
</html>`;

    const installed = await testShell.resolveAndInstallNsite(htmlApp);
    expect(installed.name).toBe("Dynamic Notes");
    expect(testShell.installedPlugins.some((p) => p.id === installed.id)).toBe(true);

    // Verify uninstallation
    testShell.uninstallPlugin(installed.id);
    expect(testShell.installedPlugins.some((p) => p.id === installed.id)).toBe(false);

    testShell.destroy();
    testRoot.remove();
  });
});
