import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Offline-First PWA (Service Worker & Cache-First Architecture)", () => {
  const rootDir = path.resolve(__dirname, "../../../../");
  const manifestPath = path.resolve(rootDir, "apps/web/public/manifest.webmanifest");
  const swPath = path.resolve(rootDir, "apps/web/public/sw.js");
  const indexPath = path.resolve(rootDir, "apps/web/index.html");
  const iconPath = path.resolve(rootDir, "apps/web/public/icon.svg");

  it("provides a valid standard Web App Manifest (manifest.webmanifest)", () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    const content = fs.readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(content);

    expect(manifest.name).toBe("Omni — Modular Nostr Runtime");
    expect(manifest.short_name).toBe("Omni");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toMatch(/^(\/|\.\/)/);
    expect(manifest.theme_color).toBe("#141312");
    expect(manifest.background_color).toBe("#141312");
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);
    expect(Array.isArray(manifest.shortcuts)).toBe(true);
    expect(manifest.shortcuts.length).toBeGreaterThan(0);
  });

  it("provides offline-first Service Worker (sw.js) with cache strategies", () => {
    expect(fs.existsSync(swPath)).toBe(true);
    const swContent = fs.readFileSync(swPath, "utf-8");

    // Precache shell skeleton
    expect(swContent).toContain("PRECACHE_ASSETS");
    expect(swContent).toContain("addEventListener(\"install\"");
    expect(swContent).toContain("skipWaiting()");

    // Cache management & client claim
    expect(swContent).toContain("addEventListener(\"activate\"");
    expect(swContent).toContain("clients.claim()");

    // Offline-first fetch strategy
    expect(swContent).toContain("addEventListener(\"fetch\"");
    expect(swContent).toContain("caches.match");
  });

  it("links manifest and PWA mobile meta tags in apps/web/index.html", () => {
    expect(fs.existsSync(indexPath)).toBe(true);
    const htmlContent = fs.readFileSync(indexPath, "utf-8");

    expect(htmlContent).toContain('rel="manifest"');
    expect(htmlContent).toContain('manifest.webmanifest');
    expect(htmlContent).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(htmlContent).toContain('name="theme-color" content="#141312"');
    expect(htmlContent).toContain('icon.svg');
  });

  it("provides valid geometric monochrome vector PWA icon (icon.svg)", () => {
    expect(fs.existsSync(iconPath)).toBe(true);
    const iconContent = fs.readFileSync(iconPath, "utf-8");

    expect(iconContent).toContain("<svg");
    expect(iconContent).toContain('fill="#141312"');
    expect(iconContent).toContain('stroke="#d4a373"');
  });
});
