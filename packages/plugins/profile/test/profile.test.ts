// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("@omni/plugin-profile", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.innerHTML = "";
    document.body.appendChild(root);

    // Mock omni global
    (window as any).omni = {
      nostr: {
        getPublicKey: vi.fn().mockResolvedValue("d020d220a06692cdbeba6858e8ea47183354cb7b7ea08d277dd8354c0e66d3a4")
      },
      auth: {
        getNpub: vi.fn().mockResolvedValue("npub1mocktestkey1234567890"),
        getNsec: vi.fn().mockResolvedValue("nsec1mocktestprivkey12345"),
        switchKey: vi.fn().mockResolvedValue(true)
      },
      profile: {
        get: vi.fn().mockResolvedValue({
          name: "alice",
          display_name: "Alice in Nostrland",
          about: "Building decentralized web apps"
        }),
        publish: vi.fn().mockResolvedValue(true)
      },
      session: {
        viewId: "main",
        route: ""
      }
    };
  });

  it("mounts full profile page cleanly with tabs and inputs without raw HTML text", async () => {
    (window as any).omni.session.viewId = "main";
    (window as any).__OMNI_ROUTE__ = "";

    // Import profile module
    await import("../src/index.js");

    // Wait for async identity fetch
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Must have rendered modal tab buttons
    const tabs = document.querySelectorAll(".modal-tab-btn");
    expect(tabs.length).toBeGreaterThanOrEqual(2);
    expect(tabs[0].textContent).toContain("Profile Info");
    expect(tabs[1].textContent).toContain("Keys & Custody");

    // Must have rendered inputs
    const inputs = document.querySelectorAll("input");
    expect(inputs.length).toBeGreaterThanOrEqual(2);

    // Must NOT contain raw unparsed <span> tags as text
    const text = document.body.textContent || "";
    expect(text).not.toContain("<span style=");
    expect(text).not.toContain("<strong>");
  });
});
