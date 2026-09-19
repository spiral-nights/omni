# 08. Plugin Developer Guide & SDK

## 1. Plugin Manifest Specification (`omni.manifest.json`)

Every Omni plugin is defined by a JSON manifest declaring its identity, entry points, capability requests, and intent handlers.

```json
{
  "$schema": "https://omni.nostr.net/schemas/v1/plugin-manifest.json",
  "id": "org.omni.plugins.notes",
  "name": "Omni Notes",
  "version": "1.2.0",
  "description": "Clean, responsive short-form Nostr note viewer and composer.",
  "author": {
    "name": "Satoshi Nostr",
    "pubkey": "npub1..."
  },
  "icon": "assets/icon.png",
  "entryPoints": {
    "main": {
      "path": "dist/index.html",
      "displayType": "fullscreen",
      "title": "Notes Feed"
    },
    "widget": {
      "path": "dist/widget.html",
      "displayType": "inline-card",
      "title": "Quick Note Composer",
      "preferredDimensions": { "minHeight": 180, "maxHeight": 300 }
    }
  },
  "permissions": {
    "nostr": {
      "read": { "kinds": [0, 1, 6, 7] },
      "write": { "kinds": [1, 6, 7] }
    },
    "intents": {
      "call": ["wallet.pay-invoice", "media.pick", "social.view-profile"],
      "handle": ["social.compose-note", "social.open-thread"]
    },
    "storage": {
      "quotaMb": 10
    }
  },
  "intents": {
    "handlers": [
      {
        "action": "social.compose-note",
        "entryPoint": "widget",
        "title": "Compose in Omni Notes"
      }
    ]
  }
}
```

---

## 2. `@omni/sdk` Reference API

Plugins interact with the Host Core using the lightweight TypeScript library `@omni/sdk`.

### 2.1. Initialization & Handshake

```typescript
import { omni } from "@omni/sdk";

// Wait for host handshake to complete
await omni.ready();

console.log("Active User Pubkey:", omni.session.pubkey);
console.log("Granted Capabilities:", omni.session.capabilities);
```

---

### 2.2. Nostr Protocol APIs

#### Querying & Subscribing to Events
```typescript
// Instant 0ms cache hits from local IndexedDB + live multiplexed relay streaming
const sub = omni.nostr.subscribe({
  filters: [
    { kinds: [1], limit: 25 }
  ],
  onEvent: (event, metadata) => {
    console.log(`Received event ${event.id}, cached: ${metadata.fromCache}`);
    renderNote(event);
  },
  onEose: () => {
    console.log("All stored events loaded from relays.");
  }
});

// To unsubscribe:
sub.unsubscribe();
```

#### Publishing Events
```typescript
// Submits draft event to Omni for validation, user signing, and relay broadcast
const receipt = await omni.nostr.publish({
  kind: 1,
  content: "Building on Omni! #nostr",
  tags: [["t", "nostr"], ["t", "omni"]],
  created_at: Math.floor(Date.now() / 1000)
});

console.log("Published event ID:", receipt.id);
console.log("Broadcasted to relays:", receipt.relays);
```

---

### 2.3. Intent Broker APIs

#### Emitting an Intent (RPC or UI Modal)
```typescript
// 1. Interactive UI Intent (e.g. Zap / Pay Invoice)
try {
  const result = await omni.intents.dispatch("wallet.pay-invoice", {
    invoice: "lnbc...",
    amountSats: 1000
  });
  console.log("Payment successful! Preimage:", result.preimage);
} catch (err) {
  console.error("Payment failed or cancelled by user:", err);
}

// 2. Pub/Sub Broadcast
omni.intents.emit("social.note-created", {
  noteId: receipt.id
});
```

#### Handling an Intent (in Intent/Widget Entry Points)
```typescript
// Listen for intent invocation in a widget/modal entry point
omni.intents.onInvoke(async (intent) => {
  if (intent.action === "social.compose-note") {
    const userText = await showComposerUI(intent.data.defaultText);
    
    // Complete the intent and return data to caller
    omni.intents.completeUI({ success: true, text: userText });
  }
});
```

---

### 2.4. Scoped Storage & NIP-78 Sync

```typescript
// Local Key-Value Store (persisted in Host IndexedDB)
await omni.storage.set("draft_content", "Draft text...");
const draft = await omni.storage.get("draft_content");

// Optional Encrypted Cloud Sync via Nostr (NIP-78 kind: 30078)
await omni.storage.syncCloud({
  dTag: "omni-notes-settings",
  encrypt: true
});
```

---

### 2.5. UI Auto-Resizing & Sizing Handshake

```typescript
// Enable automatic height reporting for widgets to eliminate scrollbars
omni.ui.enableAutoResize({ targetElement: document.getElementById("app") });

// Or manually request a dimension change:
omni.ui.requestResize({ height: 420 });

// Listen for theme changes:
omni.theme.onChange((theme) => {
  document.documentElement.setAttribute("data-theme", theme.mode);
});
```

---

## 3. Distribution, Packaging & Verification

```
+------------------------------------+
|  Build Plugin -> (dist/bundle.zip) |
+------------------------------------+
                  |
                  v
+------------------------------------+
| Upload to Blossom / IPFS Server    | ---> Returns Content Hash (SHA-256)
+------------------------------------+
                  |
                  v
+------------------------------------+
| Publish NIP-89 Announcement        | ---> Event kind 31989 / 31990 signed by dev
| (Contains URL + Subresource Hash)  |
+------------------------------------+
```

1. **Packaging:** Plugins are bundled into a static distribution directory or `.zip` archive containing `omni.manifest.json` and compiled assets.
2. **Content Addressing (Blossom / IPFS):** Assets are uploaded to decentralized Blossom file servers (NIP-1063/Blossom spec).
3. **Manifest Publishing (NIP-89):** The developer signs and publishes a Nostr **NIP-89 App Handler event** (`kind: 31989`) containing:
   * App name, description, icons, and supported event kinds.
   * `bundle_url`: Blossom HTTPS or IPFS URL.
   * `bundle_hash`: SHA-256 SRI hash string.
4. **Host Verification:** When a user installs a plugin in Omni, the Host verifies the downloaded bundle against the SHA-256 hash before registering and executing the code in the sandbox.
