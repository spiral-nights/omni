import { describe, it, expect, beforeEach } from "vitest";
import { RelayPool } from "../src/nostr/relay-pool.js";

describe("RelayPool Management (Issue 5)", () => {
  let pool: RelayPool;

  beforeEach(() => {
    pool = new RelayPool({
      bootstrapRelays: ["wss://relay.damus.io", "wss://nos.lol"]
    });
  });

  it("lists all relays with status information", () => {
    const relays = pool.getAllRelays();
    expect(relays.length).toBe(2);
    expect(relays.some((r) => r.url === "wss://relay.damus.io")).toBe(true);
    expect(relays.some((r) => r.url === "wss://nos.lol")).toBe(true);
    for (const r of relays) {
      expect(["connected", "connecting", "disconnected"]).toContain(r.status);
    }
  });

  it("allows adding and removing relays dynamically", () => {
    pool.addRelay("wss://relay.nostr.band");
    let relays = pool.getAllRelays();
    expect(relays.length).toBe(3);
    expect(relays.some((r) => r.url === "wss://relay.nostr.band")).toBe(true);

    pool.removeRelay("wss://relay.nostr.band");
    relays = pool.getAllRelays();
    expect(relays.length).toBe(2);
    expect(relays.some((r) => r.url === "wss://relay.nostr.band")).toBe(false);
  });
});
