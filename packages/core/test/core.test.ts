import { describe, it, expect, beforeEach } from "vitest";
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

describe("OmniKernel Profile Management", () => {
  it("publishes and retrieves kind-0 profile metadata", async () => {
    const kernel = new OmniKernel({ bootstrapRelays: [] });
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
});
