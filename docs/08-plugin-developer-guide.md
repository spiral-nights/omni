# 08. Plugin Developer Guide & Manifest Spec

## 1. Plugin Manifest Specification (`omni.manifest.json`)

Every Omni plugin is defined by a clean, declarative JSON manifest declaring its identity, entry bundle, UI component contributions, capability requests, and intent handlers.

```json
{
  "$schema": "https://omni.run/schema/v1/manifest.json",
  "id": "com.example.wallet",
  "name": "Zap Wallet",
  "version": "1.0.0",
  "description": "Lightning wallet widget, balance tracker, and payment intent handler",
  "author": {
    "name": "Alice",
    "pubkey": "3bf0c63fcb93463407af97b5e0918838e6fb709e4693b0110d96049f1e70bcbc",
    "nip05": "alice@example.com"
  },
  "icon": "zap",
  "entry": "dist/bundle.js",

  "components": [
    {
      "id": "wallet-dock-icon",
      "type": "icon",
      "title": "Zap Wallet",
      "slot": "dock",
      "defaultProps": { "showBadge": true }
    },
    {
      "id": "wallet-sidebar-balance",
      "type": "sidebar",
      "title": "Wallet Balance",
      "slot": "sidebar"
    },
    {
      "id": "wallet-main-transactions",
      "type": "main",
      "title": "Transaction History",
      "slot": "main"
    },
    {
      "id": "wallet-quick-pay",
      "type": "widget",
      "title": "Quick Pay Card",
      "slot": "custom"
    }
  ],

  "permissions": {
    "nostr": {
      "read": { "kinds": [1, 9734, 9735] },
      "write": { "kinds": [9734] },
      "sign": true,
      "encrypt": true
    },
    "storage": {
      "quotaMb": 5
    },
    "intents": {
      "call": ["social.view-profile"],
      "handle": ["wallet.send-payment", "wallet.get-balance"]
    }
  }
}
```

### Component Definition Fields

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique identifier for the component within this plugin. |
| `type` | `"icon" \| "sidebar" \| "main" \| "widget"` | Visual type and role of the component. |
| `title` | `string` | Human-readable title or tooltip label. |
| `slot` | `string` | Target slot in the host layout (`"dock"`, `"sidebar"`, `"main"`, or custom). |
| `defaultProps` | `Record<string, unknown>` | Optional initial property payload passed on mount. |

---

## 2. Injected Runtime Environment & `@omni/types`

Plugins bundle **zero runtime SDK or IPC dependencies**. The Omni Host automatically injects standard globals into the sandbox:
* **`window.nostr`**: Standard NIP-07 signing & cryptography interface.
* **`window.omni`**: Component registration, local subscriptions, storage, and cross-plugin intents.

For TypeScript autocompletion and type checking, developers install `@omni/types` as a dev-dependency:
```bash
npm install -D @omni/types
```

In `tsconfig.json`:
```json
{
  "compilerOptions": {
    "types": ["@omni/types"]
  }
}
```

---

### 2.1. Standard NIP-07 Cryptography (`window.nostr`)

Because the host injects standard `window.nostr`, you can use it directly or with popular libraries like `nostr-tools` or `@nostr-dev-kit/ndk`:

```typescript
// Standard NIP-07 API works out-of-the-box
const pubkey = await window.nostr.getPublicKey();

// Sign draft event (delegated to user active signer provider in Host)
const signedEvent = await window.nostr.signEvent({
  kind: 1,
  content: "Hello from a zero-bundle Omni plugin!",
  tags: [],
  created_at: Math.floor(Date.now() / 1000)
});
```

---

### 2.2. Registering Remote DOM UI Components

Instead of serving HTML files in iframes, plugins register render functions for each declared component using Shopify Remote DOM:

```typescript
// 1. Register Dock Icon Component
omni.registerComponent("wallet-dock-icon", (root) => {
  const icon = root.createElement("ui-icon");
  icon.setAttribute("name", "zap");
  icon.addEventListener("click", () => {
    omni.ui.toggleSlot("sidebar");
  });
  root.appendChild(icon);
});

// 2. Register Sidebar Balance Widget
omni.registerComponent("wallet-sidebar-balance", (root) => {
  const card = root.createElement("ui-card");
  
  const header = root.createElement("ui-header");
  header.textContent = "Lightning Balance";
  
  const balance = root.createElement("ui-text");
  balance.setAttribute("variant", "heading");
  balance.textContent = "⚡ 21,500 sats";
  
  const payBtn = root.createElement("ui-button");
  payBtn.setAttribute("variant", "primary");
  payBtn.textContent = "Send Payment";
  payBtn.addEventListener("click", async () => {
    await omni.intents.dispatch("wallet.send-payment", { amount: 1000 });
  });

  card.appendChild(header);
  card.appendChild(balance);
  card.appendChild(payBtn);
  root.appendChild(card);
});
```

*Because Remote DOM renders native host DOM elements, widgets automatically inherit the host client's CSS styling, theme variables, and responsive layout without any iframe clipping.*

---

### 2.3. Nostr Protocol APIs

#### Querying & Subscribing to Events
```typescript
// Instant 0ms cache hits from local IndexedDB + live multiplexed relay streaming
const sub = omni.nostr.subscribe({
  filters: [
    { kinds: [9735], "#p": [omni.session.pubkey], limit: 20 }
  ],
  onEvent: (event, metadata) => {
    console.log(`Received zap receipt ${event.id}, cached: ${metadata.fromCache}`);
    updateBalanceDisplay(event);
  },
  onEose: () => {
    console.log("Finished reading cached and stored events.");
  }
});

// To unsubscribe:
sub.unsubscribe();
```

#### Publishing Events
```typescript
// Submits draft event to Omni for capability validation, signing, and broadcast
const receipt = await omni.nostr.publish({
  kind: 9734,
  content: "Zap request",
  tags: [["p", targetPubkey], ["amount", "21000"]],
  created_at: Math.floor(Date.now() / 1000)
});

console.log("Published zap request ID:", receipt.id);
```

---

### 2.4. Intent Broker APIs

#### Emitting an Intent
```typescript
// Call an external intent (e.g. view a user profile or pick an image)
try {
  await omni.intents.dispatch("social.view-profile", {
    pubkey: "3bf0c63fcb93463407af97b5e0918838e6fb709e4693b0110d96049f1e70bcbc"
  });
} catch (err) {
  console.error("Intent resolution failed:", err);
}

// Pub/Sub Broadcast
omni.intents.emit("wallet.balance-updated", {
  balanceSats: 21500
});
```

#### Handling an Intent
```typescript
// Handle payment requests dispatched by other plugins
omni.intents.handle("wallet.send-payment", async (data) => {
  const result = await processPayment(data.invoice, data.amount);
  return { success: true, preimage: result.preimage };
});
```

---

### 2.5. Scoped Key-Value Storage

```typescript
// Persisted in host IndexedDB, isolated to this plugin ID
await omni.storage.set("preferred_currency", "sat");
const currency = await omni.storage.get("preferred_currency");
```

---

## 3. Distribution, Packaging & Verification

```
+------------------------------------+
|  Build Plugin -> (dist/bundle.js)  |
+------------------------------------+
                  |
                  v
+------------------------------------+
| Upload to Blossom / IPFS Server    | ---> Returns Content Hash (SHA-256)
+------------------------------------+
                  |
                  v
+------------------------------------+
| Publish NIP-89 Announcement        | ---> Kind 31989 / 31990 signed by dev
| (Contains URL + Subresource Hash)  |
+------------------------------------+
```

1. **Packaging:** Plugins are compiled to a single JavaScript bundle along with `omni.manifest.json`.
2. **Content Addressing (Blossom / IPFS):** Bundle assets are uploaded to Blossom file servers (NIP-1063/Blossom spec) or IPFS.
3. **Manifest Publishing (NIP-89):** The developer signs and publishes a Nostr **NIP-89 App Handler event** (`kind: 31989`) containing the bundle URL and its SHA-256 SRI hash.
4. **Host Verification:** When a user installs the plugin in Omni, the host verifies the downloaded bundle against the declared SHA-256 hash before running it in the sandbox.
