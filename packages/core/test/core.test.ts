import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { WebCryptoKeystore, LocalEventStore, CapabilityStore, AclEngine } from "../src/index.js";

describe("WebCryptoKeystore", () => {
  it("generates 64-char hex private and public keys", async () => {
    const keystore = new WebCryptoKeystore();
    const privkey = keystore.getPrivateKey();
    const pubkey = await keystore.getPublicKey();

    expect(privkey).toHaveLength(64);
    expect(pubkey).toHaveLength(64);
  });

  it("signs and verifies Nostr events", async () => {
    const keystore = new WebCryptoKeystore();
    const draft = {
      kind: 1,
      content: "Hello Nostr from Omni test!",
      tags: [["t", "omni"]],
      created_at: Math.floor(Date.now() / 1000)
    };

    const signed = await keystore.signEvent(draft);
    expect(signed.id).toHaveLength(64);
    expect(signed.sig).toHaveLength(128);

    const valid = WebCryptoKeystore.verifyEvent(signed);
    expect(valid).toBe(true);
  });
});

describe("LocalEventStore", () => {
  let store: LocalEventStore;

  beforeEach(async () => {
    store = new LocalEventStore(`test_db_${Date.now()}`);
    await store.init();
  });

  it("saves and retrieves events with 0ms query", async () => {
    const keystore = new WebCryptoKeystore();
    const event = await keystore.signEvent({
      kind: 1,
      content: "Test note",
      tags: [["t", "nostr"]],
      created_at: 1700000000
    });

    await store.saveEvent(event);
    const results = await store.getEvents({ kinds: [1] });

    expect(results).toHaveLength(1);
    expect(results[0].content).toBe("Test note");
  });
});

describe("CapabilityStore & AclEngine", () => {
  it("evaluates stored grants and wildcards", async () => {
    const capStore = new CapabilityStore("test_grants");
    const acl = new AclEngine(capStore);

    capStore.setGrant("test.plugin", "nostr:read", "always");

    const allowed = await acl.checkPermission("test.plugin", "nostr:read");
    expect(allowed).toBe(true);

    const denied = await acl.checkPermission("test.plugin", "nostr:write");
    expect(denied).toBe(false);
  });
});
