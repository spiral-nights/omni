import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/curves/abstract/utils";
import { NostrEvent, OmniManifest } from "@omni/types";
import { WebCryptoKeystore } from "../crypto/webcrypto-keystore.js";
import { RelayPool } from "../nostr/relay-pool.js";
import { LocalEventStore } from "../nostr/event-store.js";

export const NSITE_MANIFEST_KIND = 35129;

export const DEFAULT_BLOSSOM_SERVERS = [
  "https://cdn.satellite.earth",
  "https://blossom.primal.net",
  "https://nostr.download"
];

export interface ResolvedNostrPlugin {
  manifest: OmniManifest;
  scriptContent: string;
  event: NostrEvent;
  naddr: string;
  authorPubkey: string;
  authorNpub: string;
  verified: boolean;
  blossomHashes?: Record<string, string>;
}

export interface PublishNsiteOptions {
  blossomServers?: string[];
  relays?: string[];
}

export class NostrPluginResolver {
  /**
   * Resolve an omni plugin from a Nostr identifier:
   * Accepts:
   * - naddr1... (NIP-19 addressable event)
   * - 35129:<pubkey>:<d-tag> (NIP-33 / NIP-01 coordinate)
   * - Raw NostrEvent object
   */
  static async resolve(
    target: string | NostrEvent,
    context: { relayPool: RelayPool; eventStore: LocalEventStore }
  ): Promise<ResolvedNostrPlugin> {
    let event: NostrEvent | null = null;
    let identifier = "";
    let pubkey = "";
    let kind = NSITE_MANIFEST_KIND;
    let relayHints: string[] = [];

    if (typeof target !== "string") {
      event = target;
      identifier = event.tags.find((t) => t[0] === "d")?.[1] || "";
      pubkey = event.pubkey;
      kind = event.kind;
    } else {
      target = target.trim();

      if (target.startsWith("naddr1")) {
        const decoded = WebCryptoKeystore.decodeNaddr(target);
        identifier = decoded.identifier;
        pubkey = decoded.pubkey;
        kind = decoded.kind || NSITE_MANIFEST_KIND;
        relayHints = decoded.relays || [];
      } else if (target.includes(":")) {
        const parts = target.split(":");
        if (parts.length === 3) {
          kind = parseInt(parts[0], 10);
          pubkey = parts[1];
          identifier = parts[2];
        } else if (parts.length === 2) {
          pubkey = parts[0];
          identifier = parts[1];
        }
      }

      // Connect to any relay hints from naddr
      for (const r of relayHints) {
        context.relayPool.addRelay(r);
      }

      // 1. Try local event store (0ms query)
      const localEvents = await context.eventStore.getEvents({
        kinds: [kind],
        authors: pubkey ? [pubkey] : undefined,
        "#d": identifier ? [identifier] : undefined,
        limit: 1
      });

      if (localEvents.length > 0) {
        event = localEvents[0];
      }

      // 2. Query connected relays if not found locally
      if (!event) {
        event = await context.relayPool.fetchEvent(
          {
            kinds: [kind],
            authors: pubkey ? [pubkey] : undefined,
            "#d": identifier ? [identifier] : undefined
          },
          5000
        );
      }
    }

    if (!event) {
      throw new Error(`Failed to locate Nostr plugin manifest for identifier: '${typeof target === "string" ? target : identifier}'`);
    }

    // Verify cryptographic signature of the manifest event
    const validSig = WebCryptoKeystore.verifyEvent(event);
    if (!validSig) {
      throw new Error(`Invalid Schnorr signature on Nostr plugin manifest event (id: ${event.id})`);
    }

    // Extract Manifest & Script
    let manifest: OmniManifest | null = null;
    let scriptContent = "";
    const blossomHashes: Record<string, string> = {};

    // Read f tags (Blossom files)
    const fTags = event.tags.filter((t) => t[0] === "f");
    for (const tag of fTags) {
      if (tag.length >= 3) {
        const fileName = tag[1];
        const hash = tag[2];
        blossomHashes[fileName] = hash;
      }
    }

    // 1. Check if event content has raw HTML or script
    if (event.content && (event.content.trim().startsWith("<!DOCTYPE") || event.content.trim().startsWith("<") || event.content.includes("<body"))) {
      scriptContent = event.content;
    } else if (event.content && event.content.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(event.content);
        if (parsed.manifest) {
          manifest = parsed.manifest;
        } else if (parsed.id && parsed.name && parsed.components) {
          manifest = parsed as OmniManifest;
        }

        if (typeof parsed.script === "string") {
          scriptContent = parsed.script;
        }
      } catch {
        // Fallback to tags
      }
    }

    // 2. If manifest was not in content, synthesize cleanly from standard NIP-5A tags
    if (!manifest) {
      const dTag = event.tags.find((t) => t[0] === "d")?.[1] || identifier || event.id;
      const nameTag = event.tags.find((t) => t[0] === "name")?.[1] ||
                      event.tags.find((t) => t[0] === "title")?.[1] ||
                      dTag;
      const verTag = event.tags.find((t) => t[0] === "version")?.[1] || "1.0.0";
      const descTag = event.tags.find((t) => t[0] === "description")?.[1] ||
                      event.tags.find((t) => t[0] === "about")?.[1] ||
                      "";
      const iconTag = event.tags.find((t) => t[0] === "icon" || t[0] === "image")?.[1] || "globe";
      const slotTags = event.tags.filter((t) => t[0] === "slot").map((t) => t[1]);
      const permTags = event.tags.filter((t) => t[0] === "permission").map((t) => t[1]);

      const permissions: Record<string, any> = {
        nostr: { read: { allKinds: true }, write: { allKinds: true }, sign: true },
        storage: { quotaMb: 5 }
      };

      for (const p of permTags) {
        if (p === "storage:kv" || p === "storage") permissions.storage = { quotaMb: 5 };
        else if (p.startsWith("nostr")) permissions.nostr = { read: { allKinds: true }, write: { allKinds: true }, sign: true };
        else if (p.startsWith("intent")) permissions.intents = { allowedIntents: ["*"] };
      }

      const components = slotTags.length > 0
        ? slotTags.map((slot, idx) => {
            let type: "icon" | "sidebar" | "main" | "widget" = "widget";
            if (slot === "icon") type = "icon";
            else if (slot === "sidebar") type = "sidebar";
            else if (slot === "main") type = "main";
            return {
              id: `${dTag}-comp-${idx}`,
              type,
              title: nameTag,
              slot
            };
          })
        : [
            {
              id: `${dTag}-main`,
              type: "main" as const,
              title: nameTag,
              slot: "main"
            }
          ];

      manifest = {
        id: dTag,
        name: nameTag,
        version: verTag,
        description: descTag,
        icon: iconTag,
        entry: "index.html",
        author: { name: WebCryptoKeystore.toNpub(event.pubkey), pubkey: event.pubkey },
        components,
        permissions
      };
    }

    if (!manifest) {
      throw new Error(`Failed to extract valid manifest for Nostr plugin event '${event.id}'`);
    }

    // 3. If script/HTML was not inline, fetch from Blossom by candidate hash
    if (!scriptContent) {
      // Look for index.html, index.js, or dist/index.js
      const htmlFileKey = Object.keys(blossomHashes).find(
        (f) => f === "index.html" || f.endsWith(".html")
      );
      const scriptFileKey = Object.keys(blossomHashes).find(
        (f) => f.endsWith(".js") || f === "index.js" || f === "dist/index.js"
      );
      const targetFileKey = htmlFileKey || scriptFileKey;

      if (targetFileKey) {
        const fileHash = blossomHashes[targetFileKey];
        const serverTags = event.tags.filter((t) => t[0] === "server").map((t) => t[1]);
        const servers = [...serverTags, ...DEFAULT_BLOSSOM_SERVERS];

        scriptContent = await NostrPluginResolver.fetchAndVerifyBlossomBlob(fileHash, servers);
        manifest.entry = targetFileKey;
      }
    }

    if (!scriptContent) {
      throw new Error(
        `Nostr plugin manifest '${manifest.id}' does not include executable script content or a resolvable Blossom bundle.`
      );
    }

    const naddr = WebCryptoKeystore.toNaddr({
      identifier: manifest.id,
      pubkey: event.pubkey,
      kind: event.kind,
      relays: context.relayPool.getConnectedRelayUrls()
    });

    return {
      manifest,
      scriptContent,
      event,
      naddr,
      authorPubkey: event.pubkey,
      authorNpub: WebCryptoKeystore.toNpub(event.pubkey),
      verified: true,
      blossomHashes
    };
  }

  /**
   * Fetch a blob from Blossom servers and verify its cryptographic SHA-256 integrity
   */
  static async fetchAndVerifyBlossomBlob(hash: string, servers: string[]): Promise<string> {
    hash = hash.toLowerCase().trim();
    let lastError: any = null;

    for (const server of servers) {
      const cleanServer = server.replace(/\/+$/, "");
      const url = `${cleanServer}/${hash}`;
      try {
        const resp = await fetch(url);
        if (!resp.ok) continue;

        const text = await resp.text();
        const bytes = new TextEncoder().encode(text);
        const computedHash = bytesToHex(sha256(bytes));

        if (computedHash.toLowerCase() !== hash) {
          throw new Error(
            `Blossom bundle integrity verification failed! Expected SHA-256: ${hash}, got: ${computedHash}`
          );
        }

        return text;
      } catch (err) {
        lastError = err;
      }
    }

    throw new Error(
      `Failed to download verified Blossom blob (${hash}) from available servers: ${lastError?.message || "All servers unreachable"}`
    );
  }

  /**
   * Publish an Omni plugin as a signed NIP-5A manifest event to Nostr
   */
  static async publishPlugin(
    manifest: OmniManifest,
    scriptContent: string,
    keystore: WebCryptoKeystore,
    context: { relayPool: RelayPool; eventStore: LocalEventStore },
    options: PublishNsiteOptions = {}
  ): Promise<ResolvedNostrPlugin> {
    const authorPubkey = await keystore.getPublicKey();
    const scriptBytes = new TextEncoder().encode(scriptContent);
    const scriptHash = bytesToHex(sha256(scriptBytes));

    const manifestJson = JSON.stringify(manifest);
    const manifestBytes = new TextEncoder().encode(manifestJson);
    const manifestHash = bytesToHex(sha256(manifestBytes));

    const blossomServers = options.blossomServers || DEFAULT_BLOSSOM_SERVERS;

    const tags: string[][] = [
      ["d", manifest.id],
      ["name", manifest.name],
      ["version", manifest.version],
      ["description", manifest.description || ""],
      ["f", "dist/index.js", scriptHash, "application/javascript"],
      ["f", "omni.manifest.json", manifestHash, "application/json"],
      ...manifest.components.map((c) => ["slot", c.slot]),
      ...Object.keys(manifest.permissions || {}).map((p) => ["permission", p]),
      ...blossomServers.slice(0, 2).map((s) => ["server", s])
    ];

    // Payload is self-contained so it works immediately across all relays
    const payload = JSON.stringify({
      manifest,
      script: scriptContent
    });

    const draft = {
      kind: NSITE_MANIFEST_KIND,
      content: payload,
      tags,
      created_at: Math.floor(Date.now() / 1000)
    };

    const signedEvent = await keystore.signEvent(draft);

    // Save to local 0ms store
    await context.eventStore.saveEvent(signedEvent);

    // Broadcast to connected relays
    await context.relayPool.publish(signedEvent);

    const naddr = WebCryptoKeystore.toNaddr({
      identifier: manifest.id,
      pubkey: authorPubkey,
      kind: signedEvent.kind,
      relays: context.relayPool.getConnectedRelayUrls()
    });

    return {
      manifest,
      scriptContent,
      event: signedEvent,
      naddr,
      authorPubkey,
      authorNpub: WebCryptoKeystore.toNpub(authorPubkey),
      verified: true,
      blossomHashes: {
        "dist/index.js": scriptHash,
        "omni.manifest.json": manifestHash
      }
    };
  }

  /**
   * Publish a 100% standard standalone nsite (index.html) to Nostr (NIP-5A kind: 35129)
   */
  static async publishNsite(
    nsite: {
      identifier: string;
      name: string;
      description?: string;
      icon?: string;
      htmlContent: string;
    },
    keystore: WebCryptoKeystore,
    context: { relayPool: RelayPool; eventStore: LocalEventStore },
    options: PublishNsiteOptions = {}
  ): Promise<ResolvedNostrPlugin> {
    const authorPubkey = await keystore.getPublicKey();
    const htmlBytes = new TextEncoder().encode(nsite.htmlContent);
    const htmlHash = bytesToHex(sha256(htmlBytes));
    const blossomServers = options.blossomServers || DEFAULT_BLOSSOM_SERVERS;

    const tags: string[][] = [
      ["d", nsite.identifier],
      ["name", nsite.name],
      ["description", nsite.description || ""],
      ["f", "index.html", htmlHash, "text/html"],
      ...blossomServers.slice(0, 2).map((s) => ["server", s])
    ];
    if (nsite.icon) tags.push(["icon", nsite.icon]);

    const draft = {
      kind: NSITE_MANIFEST_KIND,
      content: nsite.htmlContent,
      tags,
      created_at: Math.floor(Date.now() / 1000)
    };

    const signedEvent = await keystore.signEvent(draft);
    await context.eventStore.saveEvent(signedEvent);
    await context.relayPool.publish(signedEvent);

    return NostrPluginResolver.resolve(signedEvent, context);
  }
}

