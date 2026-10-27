import { describe, it, expect, beforeEach, vi } from "vitest";
import omniRuntimeScript from "../src/sandbox/omni-runtime.js?raw";
import "fake-indexeddb/auto";
import { WebCryptoKeystore, LocalEventStore, CapabilityStore, AclEngine, OmniKernel } from "../src/index.js";

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

  it("encodes and decodes NIP-19 npub and nsec with checksum verification", async () => {
    // Official Nostr NIP-19 test vector
    const pubHex = "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";
    const expectedNpub = "npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6";
    expect(WebCryptoKeystore.toNpub(pubHex)).toBe(expectedNpub);

    const decodedNpub = WebCryptoKeystore.decodeKey(expectedNpub);
    expect(decodedNpub.type).toBe("npub");
    expect(decodedNpub.hex).toBe(pubHex);

    // Private key roundtrip
    const keystore = new WebCryptoKeystore();
    const privHex = keystore.getPrivateKey();
    const nsec = keystore.getNsec();
    expect(nsec.startsWith("nsec1")).toBe(true);

    const decodedNsec = WebCryptoKeystore.decodeKey(nsec);
    expect(decodedNsec.type).toBe("nsec");
    expect(decodedNsec.hex).toBe(privHex);
  });

  it("supports switching private keys dynamically", async () => {
    const keystore = new WebCryptoKeystore();
    const privHex = "ba46c053d87948f076895950ef09286723dbe84e906fbb01f2aeae6fff374058";
    keystore.setPrivateKey(privHex);

    expect(keystore.getPrivateKey()).toBe(privHex);
    const nsec = keystore.getNsec();
    expect(nsec).toBe("nsec1hfrvq57c09y0qa5ft9gw7zfgvu3ah6zwjphmkq0j46hxllehgpvqnfu36w");

    // Also support switching using nsec string
    keystore.setPrivateKey(nsec);
    expect(keystore.getPrivateKey()).toBe(privHex);
  });

  it("notifies listeners on key change", async () => {
    const keystore = new WebCryptoKeystore();
    let notifiedKey = "";
    const unsub = keystore.onKeyChange((newKey) => {
      notifiedKey = newKey;
    });

    const privHex = "ba46c053d87948f076895950ef09286723dbe84e906fbb01f2aeae6fff374058";
    keystore.setPrivateKey(privHex);
    expect(notifiedKey).toBe(privHex);

    unsub();
    keystore.setPrivateKey("ba46c053d87948f076895950ef09286723dbe84e906fbb01f2aeae6fff374058");
  });

  it("encrypts and decrypts NIP-04 direct messages", async () => {
    const alice = new WebCryptoKeystore();
    const bob = new WebCryptoKeystore();

    const alicePub = await alice.getPublicKey();
    const bobPub = await bob.getPublicKey();

    const plaintext = "Secret nostr message for Bob's eyes only!";
    const encrypted = await alice.nip04Encrypt(bobPub, plaintext);

    expect(encrypted).toContain("?iv=");
    expect(encrypted).not.toBe(plaintext);

    const decrypted = await bob.nip04Decrypt(alicePub, encrypted);
    expect(decrypted).toBe(plaintext);
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

  it("handles in-memory cache and ephemeral events (kind 20000-29999) without disk storage", async () => {
    const keystore = new WebCryptoKeystore();
    const ephemeralEvent = await keystore.signEvent({
      kind: 20001,
      content: "Ephemeral typing status",
      tags: [],
      created_at: 1700000050
    });

    const saved = await store.saveEvent(ephemeralEvent);
    expect(saved).toBe(true);
    expect(store.getMemoryCacheSize()).toBeGreaterThan(0);

    // Ephemeral event should resolve via in-memory cache
    const byId = await store.getEventById(ephemeralEvent.id);
    expect(byId).not.toBeNull();
    expect(byId?.content).toBe("Ephemeral typing status");

    const events = await store.getEvents({ kinds: [20001] });
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe(ephemeralEvent.id);
  });

  it("cleans older versions of replaceable events (kind 0)", async () => {
    const keystore = new WebCryptoKeystore();
    const pubkey = await keystore.getPublicKey();

    const profileV1 = await keystore.signEvent({
      kind: 0,
      content: JSON.stringify({ name: "Alice v1" }),
      tags: [],
      created_at: 1000
    });
    const profileV2 = await keystore.signEvent({
      kind: 0,
      content: JSON.stringify({ name: "Alice v2" }),
      tags: [],
      created_at: 2000
    });

    await store.saveEvent(profileV1);
    await store.saveEvent(profileV2);

    // Allow background replaceable cleanup
    await new Promise((r) => setTimeout(r, 50));

    const profiles = await store.getEvents({ kinds: [0], authors: [pubkey] });
    expect(profiles).toHaveLength(1);
    expect(JSON.parse(profiles[0].content).name).toBe("Alice v2");
  });

  it("cleans older versions of parameterized replaceable events (kind 30078)", async () => {
    const keystore = new WebCryptoKeystore();
    const pubkey = await keystore.getPublicKey();

    const appDataV1 = await keystore.signEvent({
      kind: 30078,
      content: JSON.stringify({ version: 1 }),
      tags: [["d", "workspace"]],
      created_at: 1000
    });
    const appDataV2 = await keystore.signEvent({
      kind: 30078,
      content: JSON.stringify({ version: 2 }),
      tags: [["d", "workspace"]],
      created_at: 2000
    });

    await store.saveEvent(appDataV1);
    await store.saveEvent(appDataV2);

    await new Promise((r) => setTimeout(r, 50));

    const states = await store.getEvents({ kinds: [30078], authors: [pubkey] });
    expect(states).toHaveLength(1);
    expect(JSON.parse(states[0].content).version).toBe(2);
  });

  it("bounds public feed notes to max limit while preserving user's own authored notes", async () => {
    const userKeystore = new WebCryptoKeystore();
    const userPub = await userKeystore.getPublicKey();

    const extKeystore = new WebCryptoKeystore();

    const boundedStore = new LocalEventStore({
      dbName: `test_bounded_${Date.now()}`,
      maxFeedNotes: 3,
      userPubkey: userPub
    });
    await boundedStore.init();

    // 5 external feed notes with increasing timestamps
    for (let i = 1; i <= 5; i++) {
      const extNote = await extKeystore.signEvent({
        kind: 1,
        content: `External note ${i}`,
        tags: [],
        created_at: 1000 + i
      });
      await boundedStore.saveEvent(extNote);
    }

    // 1 user note with an older timestamp
    const userNote = await userKeystore.signEvent({
      kind: 1,
      content: "My own user note",
      tags: [],
      created_at: 900
    });
    await boundedStore.saveEvent(userNote);

    // Prune feed notes to max 3
    const deletedCount = await boundedStore.pruneFeedNotes(3);
    expect(deletedCount).toBe(2); // 5 external - 3 kept = 2 deleted

    const remaining = await boundedStore.getEvents({ kinds: [1] });
    // Total remaining: 3 external + 1 user note = 4
    expect(remaining).toHaveLength(4);

    const hasUserNote = remaining.some((n) => n.id === userNote.id);
    expect(hasUserNote).toBe(true);

    const extNotes = remaining.filter((n) => n.pubkey !== userPub);
    expect(extNotes).toHaveLength(3);
    // Should be the newest external notes (3, 4, 5)
    expect(extNotes.map((n) => n.content)).toEqual(
      expect.arrayContaining(["External note 3", "External note 4", "External note 5"])
    );
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

  it("handles geolocation permission check and toggling per plugin", async () => {
    const capStore = new CapabilityStore("test_geo_grants");
    const acl = new AclEngine(capStore);

    // Initial check without grant
    expect(capStore.getGrant("weather.plugin", "system:geolocation")).toBeNull();

    // Grant geolocation
    capStore.setGrant("weather.plugin", "system:geolocation", "always");
    expect(await acl.checkPermission("weather.plugin", "system:geolocation")).toBe(true);

    // Revoke/deny geolocation
    capStore.setGrant("weather.plugin", "system:geolocation", "deny");
    expect(await acl.checkPermission("weather.plugin", "system:geolocation")).toBe(false);
  });
});

describe("OmniKernel Profile Management", () => {
  it("publishes and retrieves kind-0 profile metadata", async () => {
    const kernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
    await kernel.boot();

    const profileData = {
      name: "alice",
      display_name: "Alice in Wonderland",
      about: "Exploring the rabbit hole of Nostr",
      picture: "https://example.com/alice.png",
      nip05: "alice@example.com",
      lud16: "alice@getalby.com"
    };

    const signedEvent = await kernel.publishProfile(profileData);
    expect(signedEvent.kind).toBe(0);
    expect(signedEvent.id).toHaveLength(64);

    const loadedProfile = await kernel.getProfile();
    expect(loadedProfile).not.toBeNull();
    expect(loadedProfile?.display_name).toBe("Alice in Wonderland");
    expect(loadedProfile?.nip05).toBe("alice@example.com");
    expect(loadedProfile?.lud16).toBe("alice@getalby.com");
  });

  it("does not abort on first EOSE when multiple relays are queried for remote profile", async () => {
    const kernel = new OmniKernel({
      runtimeScript: omniRuntimeScript,
      bootstrapRelays: ["wss://relay1.com", "wss://relay2.com"]
    });
    await kernel.boot();

    // Mock two connected relays in pool
    const mockWs1: any = { readyState: 1, send: vi.fn() };
    const mockWs2: any = { readyState: 1, send: vi.fn() };
    (kernel.relayPool as any).relays.set("wss://relay1.com", mockWs1);
    (kernel.relayPool as any).relays.set("wss://relay2.com", mockWs2);

    const testPubkey = "d020d220a06692cdbeba6858e8ea47183354cb7b7ea08d277dd8354c0e66d3a4";
    const profilePromise = kernel.fetchRemoteProfile(testPubkey, 2000);

    const subId = (kernel.relayPool as any).subscriptions.keys().next().value;

    // Relay 1 sends EOSE with no events
    (kernel.relayPool as any).handleRelayMessage(JSON.stringify(["EOSE", subId]), "wss://relay1.com");

    // Profile promise should NOT have resolved null yet
    let resolvedEarly = false;
    profilePromise.then(() => { resolvedEarly = true; });
    await new Promise((r) => setTimeout(r, 20));
    expect(resolvedEarly).toBe(false);

    // Relay 2 sends Kind 0 event and EOSE
    const kind0Event = {
      id: "ev_kind0",
      pubkey: testPubkey,
      created_at: 1700000000,
      kind: 0,
      tags: [],
      content: JSON.stringify({ name: "bob", display_name: "Bob Nostr" }),
      sig: "sig_mock"
    };
    (kernel.relayPool as any).handleRelayMessage(JSON.stringify(["EVENT", subId, kind0Event]), "wss://relay2.com");
    (kernel.relayPool as any).handleRelayMessage(JSON.stringify(["EOSE", subId]), "wss://relay2.com");

    const result = await profilePromise;
    expect(result).not.toBeNull();
    expect(result?.metadata?.name).toBe("bob");
    expect(result?.metadata?.display_name).toBe("Bob Nostr");
  });
});

describe("OmniKernel NIP-65 Relay List Management", () => {
  it("publishes and retrieves kind-10002 relay list metadata", async () => {
    const kernel = new OmniKernel({ runtimeScript: omniRuntimeScript, bootstrapRelays: [] });
    await kernel.boot();

    const policies = [
      { url: "wss://relay.damus.io", read: true, write: true },
      { url: "wss://write.custom.relay", read: false, write: true },
      { url: "wss://read.custom.relay", read: true, write: false }
    ];

    const signedEvent = await kernel.publishRelayList(policies);
    expect(signedEvent.kind).toBe(10002);
    expect(signedEvent.tags).toHaveLength(3);

    const loadedRelays = await kernel.getRelayList();
    expect(loadedRelays).not.toBeNull();
    expect(loadedRelays).toHaveLength(3);
    expect(loadedRelays![0]).toEqual({ url: "wss://relay.damus.io", read: true, write: true });
    expect(loadedRelays![1]).toEqual({ url: "wss://write.custom.relay", read: false, write: true });
    expect(loadedRelays![2]).toEqual({ url: "wss://read.custom.relay", read: true, write: false });

    // Verify relayPool has registered the write relays
    const writeUrls = kernel.relayPool.getWriteRelayUrls();
    expect(writeUrls).toContain("wss://relay.damus.io");
    expect(writeUrls).toContain("wss://write.custom.relay");
    expect(writeUrls).not.toContain("wss://read.custom.relay");
  });
});
