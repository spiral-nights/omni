# 08. Plugin Developer Guide & Manifest Spec

## 1. Plugin Manifest Specification (`omni.manifest.json`)

Every Omni plugin is defined by a clean, declarative JSON manifest declaring its identity, entry bundle, UI component contributions, capability requests, and intent handlers.

```json
{
  "$schema": "https://omni.run/schema/v1/manifest.json",
  "id": "org.omni.plugins.checklist",
  "name": "Daily Checklist",
  "version": "1.0.0",
  "description": "Interactive to-do and checklist widget with local persistence",
  "author": {
    "name": "Omni Team",
    "pubkey": "3bf0c63fcb93463407af97b5e0918838e6fb709e4693b0110d96049f1e70bcbc"
  },
  "icon": "check-square",
  "entry": "dist/bundle.js",

  "components": [
    {
      "id": "checklist-dock-icon",
      "type": "icon",
      "title": "Checklist",
      "slot": "dock",
      "defaultProps": { "badgeCount": 3 }
    },
    {
      "id": "checklist-sidebar-widget",
      "type": "sidebar",
      "title": "Tasks Today",
      "slot": "sidebar"
    },
    {
      "id": "checklist-main-dashboard",
      "type": "main",
      "title": "Task Manager",
      "slot": "main"
    }
  ],

  "permissions": {
    "storage": {
      "quotaMb": 2
    },
    "intents": {
      "handle": ["tasks.create-item"]
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
// 1. Register Dock Icon using Standard HTML
omni.registerComponent("checklist-dock-icon", ({ root, props }) => {
  const icon = root.createElement("button");
  icon.className = "omni-dock-btn";
  icon.innerHTML = "<span>☑️</span>";
  if (props.badgeCount > 0) {
    const badge = root.createElement("span");
    badge.className = "badge";
    badge.textContent = String(props.badgeCount);
    icon.appendChild(badge);
  }
  icon.addEventListener("click", () => {
    omni.ui.toggleSlot("sidebar");
  });
  root.appendChild(icon);
});

// 2. Register Sidebar Checklist Widget using Standard HTML
omni.registerComponent("checklist-sidebar-widget", async ({ root }) => {
  const container = root.createElement("div");
  container.className = "checklist-card";
  
  const header = root.createElement("h3");
  header.textContent = "Today Tasks";
  
  // Task input form
  const inputRow = root.createElement("div");
  inputRow.className = "input-row";
  const input = root.createElement("input");
  input.type = "text";
  input.placeholder = "Add a new task...";
  const addBtn = root.createElement("button");
  addBtn.textContent = "Add";
  
  inputRow.appendChild(input);
  inputRow.appendChild(addBtn);
  
  // Tasks list container
  const taskList = root.createElement("ul");
  taskList.className = "task-list";
  
  // Load tasks from scoped IndexedDB storage
  const tasks = (await omni.storage.get("tasks")) || [
    { id: 1, text: "Welcome to Omni!", done: false }
  ];

  function renderTasks() {
    taskList.replaceChildren();
    tasks.forEach((t) => {
      const li = root.createElement("li");
      const checkbox = root.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = t.done;
      checkbox.addEventListener("change", async () => {
        t.done = checkbox.checked;
        await omni.storage.set("tasks", tasks);
        renderTasks();
      });
      const text = root.createElement("span");
      text.textContent = t.text;
      if (t.done) text.style.textDecoration = "line-through";
      li.appendChild(checkbox);
      li.appendChild(text);
      taskList.appendChild(li);
    });
  }

  addBtn.addEventListener("click", async () => {
    const val = input.value?.trim();
    if (!val) return;
    tasks.push({ id: Date.now(), text: val, done: false });
    await omni.storage.set("tasks", tasks);
    input.value = "";
    renderTasks();
  });

  renderTasks();
  container.appendChild(header);
  container.appendChild(inputRow);
  container.appendChild(taskList);
  root.appendChild(container);
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
