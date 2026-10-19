// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mountProfile } from "../src/index.js";

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

    await mountProfile(root);

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

  it("imports nsec, switches identity, fetches remote profile, and returns to profile tab", async () => {
    (window as any).omni.session.viewId = "main";
    (window as any).__OMNI_ROUTE__ = "";

    await mountProfile(root);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const btnTabKeys = document.querySelector<HTMLButtonElement>("#btn-tab-keys")!;
    const btnTabProfile = document.querySelector<HTMLButtonElement>("#btn-tab-profile")!;
    const paneProfile = document.querySelector<HTMLDivElement>(".pane-profile")!;
    const paneKeys = document.querySelector<HTMLDivElement>(".pane-keys")!;
    const inpImport = document.querySelector<HTMLInputElement>("#key-import")!;
    const btnImport = document.querySelector<HTMLButtonElement>("#btn-import-key")!;
    const rowDName = document.querySelector<HTMLInputElement>("#prof-display-name")!;

    // Switch to keys tab
    btnTabKeys.click();
    expect(paneKeys.style.display).toBe("flex");
    expect(paneProfile.style.display).toBe("none");

    // Enter nsec and click import
    inpImport.value = "nsec1mocktestprivkey12345";
    (window as any).omni.auth.switchKey = vi.fn().mockResolvedValue({
      pubkey: "d020d220a06692cdbeba6858e8ea47183354cb7b7ea08d277dd8354c0e66d3a4",
      npub: "npub1mocktestkey1234567890"
    });
    (window as any).omni.profile.get = vi.fn().mockResolvedValue({
      name: "alice_switched",
      display_name: "Alice Switched",
      about: "Switched account bio"
    });

    btnImport.click();
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect((window as any).omni.auth.switchKey).toHaveBeenCalledWith("nsec1mocktestprivkey12345");
    expect((window as any).omni.profile.get).toHaveBeenCalledWith(
      "d020d220a06692cdbeba6858e8ea47183354cb7b7ea08d277dd8354c0e66d3a4",
      { syncRemote: true }
    );

    // Profile pane should be active now
    expect(paneProfile.style.display).toBe("flex");
    expect(paneKeys.style.display).toBe("none");
    expect(rowDName.value).toBe("Alice Switched");
  });

  it("loads and displays active public key hex and derives npub without sticking on Loading...", async () => {
    const pubHex = "d020d220a06692cdbeba6858e8ea47183354cb7b7ea08d277dd8354c0e66d3a4";
    (window as any).nostr = {
      getPublicKey: vi.fn().mockResolvedValue(pubHex)
    };
    // Delete omni.auth so we specifically test standalone NIP-19 bech32 npub derivation
    delete (window as any).omni.auth;

    await mountProfile(root);
    await new Promise((resolve) => setTimeout(resolve, 60));

    const inpPubkey = document.querySelector<HTMLInputElement>("#key-hex")!;
    const inpNpub = document.querySelector<HTMLInputElement>("#key-npub")!;
    const spanNpub = document.querySelector<HTMLElement>(".preview-npub")!;

    expect(inpPubkey.value).toBe(pubHex);
    expect(inpPubkey.getAttribute("value")).toBe(pubHex);
    expect(inpNpub.value).toMatch(/^npub1/);
    expect(inpNpub.getAttribute("value")).toMatch(/^npub1/);
    expect(spanNpub.textContent).toMatch(/^npub1/);
    expect(inpPubkey.value).not.toContain("Loading");
    expect(inpNpub.value).not.toContain("Loading");
  });

  it("clicking Keys & Custody tab triggers refreshIdentity and ensures inputs are updated", async () => {
    await mountProfile(root);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const btnTabKeys = document.querySelector<HTMLButtonElement>("#btn-tab-keys")!;
    const inpPubkey = document.querySelector<HTMLInputElement>("#key-hex")!;
    const inpNpub = document.querySelector<HTMLInputElement>("#key-npub")!;

    btnTabKeys.click();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(inpPubkey.value).toBe("d020d220a06692cdbeba6858e8ea47183354cb7b7ea08d277dd8354c0e66d3a4");
    expect(inpNpub.value).toMatch(/^npub1[a-z0-9]{58}$/);
  });

  it("mounts widget view (?view=widget) and displays identity npub", async () => {
    (window as any).__OMNI_ROUTE__ = "?view=widget";

    await mountProfile(root);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const npubEl = document.querySelector<HTMLElement>(".profile-widget-npub")!;
    const nameEl = document.querySelector<HTMLElement>(".profile-widget-name")!;

    expect(npubEl.textContent).toContain("npub1");
    expect(npubEl.textContent).not.toContain("No Key Loaded");
    expect(nameEl.textContent).toBe("Alice in Nostrland");
  });
});
