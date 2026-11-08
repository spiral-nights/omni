# Omni — Nostr Extensions & Schema Architecture Guide

> **Authoritative Specification & Reference for Omni's Extended Nostr Client and Declarative Schema Engine.**  
> *Version 1.0 — November 2026*

---

## 1. Overview & Architectural Principles

Omni connects plugins to the Nostr protocol without imposing proprietary SDKs or vendor lock-in.

### The Three Mandates
1. **Zero Proprietary SDKs**:
   Plugins **never** import or call proprietary `omni.*` namespaces (`omni.storage`, `omni.nostr`, `omni.registerComponent`, etc.).
2. **Transparent Standard Augmentation**:
   Every capability lives on standard Web and Nostr globals:
   - Declarative UI via standard `postMessage` / Light DOM Custom Elements (`<omni-*>`).
   - Signing and protocol interactions via standard `window.nostr` (NIP-07).
   - Wire-level framing via standard `window.WebSocket`.
   - Scoped offline storage via standard `window.localStorage` and `window.indexedDB`.
3. **Multi-Tier Protocol Ergonomics**:
   Omni provides two complementary connectivity tiers on the same runtime:
   - **Tier A (Raw Wire Interop)**: `VirtualWebSocket` for unmodified 3rd-party Nostr clients (Snort, Coracle, etc.).
   - **Tier B (High-Level Reactive)**: High-level `window.nostr` extensions (`fetch`, `subscribe`, `publish`, and `doc`) for fast, zero-boilerplate plugin development.

---

## 2. Comparison: Low-Level vs. High-Level Nostr Connectivity

| Capability | Raw `VirtualWebSocket` (Tier A) | High-Level `window.nostr` (Tier B) | Universal `nostr.doc()` (Tier B) |
| :--- | :--- | :--- | :--- |
| **Target Use Case** | Legacy nsites, complex multi-relay routing | High-throughput feeds, event search, raw publishing | App state, user metadata, lists, settings |
| **Boilerplate Lines** | ~40–60 lines (`REQ`, `EVENT`, `EOSE`, subIds) | ~5 lines | **1–2 lines** |
| **0ms Local Cache** | Manual filter matching | Automatic 0ms `LocalEventStore` query | Automatic instant read |
| **Relay Aggregation** | Manual frame tracking | Automatic relay pool deduplication & sorting | Automatic multi-device sync |
| **Signing** | Manual `window.nostr.signEvent()` | Optional auto-signing in `nostr.publish()` | Automatic transparent signing |
| **Encryption** | Manual `window.nostr.nip04/nip44` calls | Manual or custom | **Automatic transparent encryption** (`{ encrypted: true }`) |
| **Reactivity** | Manual state synchronization | Callback via `nostr.subscribe` | **Live `onUpdate()` subscription** |

---

## 3. High-Level `window.nostr` Client Extensions

The guest runtime provides an extended `OmniNostrClient` implementing the standard NIP-07 interface, augmented with ergonomic helpers:

```typescript
export interface OmniNostrClient extends Nip07Signer {
  // --- High-Level Querying & Subscriptions ---
  fetch(filters: NostrFilter[], options?: NostrFetchOptions): Promise<NostrEvent[]>;
  subscribe(filters: NostrFilter[], onEvent: (event: NostrEvent) => void, onEose?: () => void): NostrSubscriptionHandle;
  publish(event: NostrDraftEvent, options?: NostrPublishOptions): Promise<NostrPublishResult>;

  // --- Reactive Universal Document Store ---
  doc<T = any>(dTagOrSpec: string | NostrDocSpec, options?: NostrDocOptions): Promise<NostrDoc<T>>;
}
```

### 3.1 `window.nostr.fetch(filters, options)`

Queries the host's 0ms IndexedDB event cache and active relay pool in parallel, deduplicates events, and resolves them sorted newest-first (`created_at` descending):

```javascript
// Fetch user's latest 20 status notes
const notes = await window.nostr.fetch([
  { kinds: [1], authors: [myPubkey], limit: 20 }
]);

console.log(`Loaded ${notes.length} notes:`, notes);
```

#### Options (`NostrFetchOptions`)
- **`timeoutMs`** *(number, default: 3000)*: Max wait time for remote relays to return `EOSE`. Local 0ms cache hits resolve immediately if relays are slow.
- **`localOnly`** *(boolean, default: false)*: When `true`, queries only the local 0ms IndexedDB store, bypassing network relays entirely.
- **`relays`** *(string[])*: Scopes the query to specific relay URLs instead of the user's default pool.

---

### 3.2 `window.nostr.subscribe(filters, onEvent, onEose)`

Establishes a live subscription across the local event store and connected relays. Dispatches events as they arrive:

```javascript
const sub = window.nostr.subscribe(
  [{ kinds: [1], "#p": [myPubkey], limit: 50 }],
  (event) => {
    console.log("New notification or mention received:", event);
    prependNotification(event);
  },
  () => {
    console.log("Initial relay backlog caught up (EOSE).");
  }
);

// When tearing down:
sub.unsubscribe();
```

---

### 3.3 `window.nostr.publish(event, options)`

Signs and broadcasts an event to the user's connected Nostr relays and commits it to the local 0ms event store:

```javascript
const result = await window.nostr.publish({
  kind: 1,
  content: "Hello decentralized world from Omni!",
  tags: [["t", "omni"], ["client", "omni"]]
});

console.log("Published event ID:", result.id, "Signature:", result.sig);
```

#### Automatic Keystore Integration
If the draft does not contain `pubkey`, `created_at`, `id`, or `sig`, Omni automatically populates the user's public key, sets the current Unix timestamp, prompts for signature via the host keystore, and broadcasts to the relay pool.

---

## 4. Universal Document Abstraction (`window.nostr.doc<T>()`)

Most decentralized applications manage state: user settings, checklists, kanban boards, drafts, playlists, or bookmarks. In Nostr, these are represented by **Replaceable Events** (`10000 <= kind < 20000` or Kind 0, 3) and **Parameterized Replaceable Events** (`30000 <= kind < 40000`).

`window.nostr.doc<T>()` abstracts wire-level Nostr events into an ergonomic, local-first document model.

### 4.1 Basic Usage (Kind 30078 App State)

```javascript
interface TaskItem {
  id: number;
  text: string;
  done: boolean;
}

// Open or create document for d-tag "omni/tasks/v1"
const tasksDoc = await window.nostr.doc<TaskItem[]>("omni/tasks/v1", {
  encrypted: false
});

// Read 0ms local-first data
console.log("Current tasks:", tasksDoc.data || []);

// Listen for updates from other tabs or remote devices
tasksDoc.onUpdate((remoteTasks) => {
  renderTasks(remoteTasks);
});

// Mutate and broadcast optimistic update
await tasksDoc.set([
  ...tasksDoc.data,
  { id: Date.now(), text: "New decentralized task", done: false }
]);
```

---

### 4.2 Transparent End-to-End Encryption

By setting `{ encrypted: true }`, payloads are encrypted and decrypted automatically using the user's Nostr key (NIP-04 with auto-upgrading NIP-44 fallback). **Raw plaintext is never written to relays or unencrypted storage**:

```javascript
interface SecretNote {
  title: string;
  body: string;
  updatedAt: number;
}

// Automatically encrypted using user's Nostr key
const noteDoc = await window.nostr.doc<SecretNote>("omni/notes/v1/note-123", {
  encrypted: true
});

// Setting data encrypts the content before signing and broadcasting
await noteDoc.set({
  title: "My Private Seed Phrase Notes",
  body: "Never share with anyone.",
  updatedAt: Date.now()
});

// Reading data automatically decrypts the content
console.log("Decrypted note title:", noteDoc.data?.title);
```

---

### 4.3 Generalization Beyond Kind 30078

`window.nostr.doc()` is fully generalized to handle any standard Nostr replaceable event:

```typescript
export interface NostrDocSpec {
  kind: number;             // e.g. 0, 10002, 30000, 30023, 30078
  d?: string;               // Parameterized identifier tag (for kinds 30000-39999)
  pubkey?: string;          // Author public key (defaults to current user)
  encrypted?: boolean;      // Enable transparent encryption (defaults to false)
}
```

#### Example 1: User Profile Metadata (Kind 0)
```javascript
const profileDoc = await window.nostr.doc({ kind: 0 });
console.log("Profile Name:", profileDoc.data?.name);

await profileDoc.set({
  ...profileDoc.data,
  about: "Decentralized builder on Omni"
});
```

#### Example 2: NIP-65 Relay List (Kind 10002)
```javascript
const relaysDoc = await window.nostr.doc({ kind: 10002 });
// Custom serializer/deserializer transforms raw tags into typed JSON
```

#### Example 3: Long-Form Markdown Article (Kind 30023)
```javascript
const articleDoc = await window.nostr.doc({
  kind: 30023,
  d: "building-omni-part-1"
});

await articleDoc.set({
  title: "Building Omni: A Truly Modular Client",
  content: "# Building Omni\n\nNostr nsites are the future of the web..."
});
```

#### Example 4: Bookmark & Follow Lists (Kind 30000 / NIP-51)
```javascript
const bookmarksDoc = await window.nostr.doc({
  kind: 30000,
  d: "favorite-nsites"
});
```

---

### 4.4 `NostrDoc` Interface Reference

```typescript
export interface NostrDoc<T = any> {
  readonly kind: number;
  readonly d?: string;
  readonly pubkey: string;
  readonly data: T | null;
  readonly event: NostrEvent | null;

  set(data: T): Promise<NostrEvent>;
  reload(): Promise<T | null>;
  onUpdate(callback: (data: T) => void): () => void;
  dispose(): void;
}
```

- **`data`**: The current parsed (and decrypted) JavaScript value, or `null` if not found.
- **`set(data)`**: Optimistically updates local cache, signs the Nostr event, broadcasts it to the relay pool, and returns the signed `NostrEvent`.
- **`reload()`**: Explicitly re-queries the 0ms local event store and active relays.
- **`onUpdate(cb)`**: Registers a callback invoked whenever newer versions of this document arrive from relays or other windows. Returns an unsubscribe teardown function.
- **`dispose()`**: Cleans up internal subscriptions and listeners.

---

## 5. Declarative Schema UI Primitives

Omni enables lightweight plugins and background workers to render rich interactive interfaces without direct DOM access by emitting declarative JSON component trees.

### 5.1 The Light DOM Custom Elements Pipeline
```
+--------------------------+          postMessage           +-----------------------------+
| Guest Code / Web Worker  | -----------------------------> | Omni Host (SchemaRenderer)  |
| - window.nostr.doc()     |   { type: "omni:schema", ... } | - Custom Elements (<omni-*>) |
| - State & Business Logic | <----------------------------- | - Design Token Styling      |
+--------------------------+    Event: "omni:action"        +-----------------------------+
```

### 5.2 Core Schema Primitives

| Component Node | Type | Primary Properties | Description |
| :--- | :--- | :--- | :--- |
| **`<omni-box>`** | `"box"` | `direction: "row" \| "column"`, `gap`, `children` | Flex container with responsive spacing |
| **`<omni-card>`** | `"card"` | `title`, `subtitle`, `icon`, `children` | Elevated surface card container |
| **`<omni-button>`** | `"button"` | `label`, `action`, `variant: "primary" \| "secondary" \| "danger"`, `size` | Interactive button triggering actions |
| **`<omni-icon-button>`** | `"icon-button"`| `icon`, `tooltip`, `action`, `variant` | Compact icon button |
| **`<omni-input>`** | `"input"` | `name`, `placeholder`, `actionOnEnter` | Single-line text input |
| **`<omni-textarea>`** | `"textarea"` | `name`, `placeholder`, `rows` | Multi-line text field |
| **`<omni-metric>`** | `"metric"` | `label`, `value`, `subtext` | High-visibility metric display |
| **`<omni-list>`** | `"list"` | `items: OmniListItem[]` | Virtualizable list with checkboxes and action buttons |
| **`<omni-tabs>`** | `"tabs"` | `tabs: Array<{ id, label, icon }>`, `activeTab`, `onTabChange` | Tabbed navigation switcher |
| **`<omni-status-indicator>`**| `"status-indicator"` | `status: "online" \| "offline" \| "connecting" \| "error"`, `label`, `pulse` | Pulsing connection status badge |
| **`<omni-code-block>`** | `"code-block"`| `code`, `language`, `copyable` | Syntax-highlighted code container |
| **`<omni-progress>`** | `"progress"` | `value`, `max`, `label` | Progress bar with percentage |
| **`<omni-banner>`** | `"banner"` | `variant: "info" \| "warning" \| "error" \| "success"`, `message` | Callout notification banner |

---

## 6. Complete End-to-End Example: Schema Widget with `nostr.doc`

Here is a complete, self-contained checklist widget running in ~40 lines of clean TypeScript/JavaScript without any external dependencies:

```typescript
import { OmniComponentNode, OmniAction } from "@omni/types";

interface Task {
  id: number;
  text: string;
  done: boolean;
}

let doc: any = null;
let tasks: Task[] = [];

// 1. Initialize reactive document
async function init() {
  doc = await window.nostr.doc<Task[]>("omni/tasks/v1", { encrypted: false });
  tasks = doc.data || [];
  render();

  // Listen for multi-device sync
  doc.onUpdate((remoteTasks: Task[]) => {
    tasks = remoteTasks;
    render();
  });
}

// 2. Render Declarative Schema
function render() {
  const completed = tasks.filter((t) => t.done).length;

  const schema: OmniComponentNode = {
    type: "card",
    title: "Daily Tasks",
    icon: "check",
    children: [
      {
        type: "box",
        direction: "row",
        gap: "sm",
        children: [
          { type: "input", name: "newTask", placeholder: "Add task...", actionOnEnter: { name: "add-task" } },
          { type: "button", label: "+", action: { name: "add-task" }, size: "sm" }
        ]
      },
      {
        type: "list",
        items: tasks.map((t) => ({
          type: "list-item",
          id: String(t.id),
          title: t.text,
          checked: t.done,
          onCheckAction: { name: "toggle-task", payload: { id: t.id } },
          actions: [
            { type: "icon-button", icon: "trash", variant: "danger", action: { name: "delete-task", payload: { id: t.id } } }
          ]
        }))
      }
    ]
  };

  // Dispatch over standard web messaging
  window.parent.postMessage({ type: "omni:schema", componentId: "widget", schema }, "*");
}

// 3. Handle Actions
window.addEventListener("message", async (e) => {
  if (e.data?.type === "omni:action") {
    const { action, payload } = e.data;

    if (action.name === "add-task") {
      const text = String(payload?.newTask || "").trim();
      if (text) {
        tasks.push({ id: Date.now(), text, done: false });
        await doc.set(tasks);
        render();
      }
    } else if (action.name === "toggle-task") {
      const id = Number(action.payload?.id);
      const item = tasks.find((t) => t.id === id);
      if (item) {
        item.done = !item.done;
        await doc.set(tasks);
        render();
      }
    } else if (action.name === "delete-task") {
      tasks = tasks.filter((t) => t.id !== Number(action.payload?.id));
      await doc.set(tasks);
      render();
    }
  }
});

init();
```

---

## 7. Security & Sandboxing Architecture

1. **Kind-Level Capability Governance (ACL)**:
   Every high-level operation (`fetch`, `subscribe`, `publish`, `doc`) enforces capability checks in `AclEngine`:
   - `nostr:read`: Required to fetch and subscribe.
   - `nostr:write`: Required to publish drafts.
   - `nostr:sign`: Required to sign events with the host keystore.
   - Sensitive kinds (e.g. Encrypted DMs Kind 4 / Kind 1059) are filtered unless explicitly granted.
2. **Subscription Namespacing**:
   Each guest subscription is automatically namespaced `${pluginId}:${subId}` inside the host kernel. Plugins cannot inspect or intercept other plugins' subscription streams.
3. **Storage Partitioning**:
   Any state stored in `localStorage` or `indexedDB` is strictly partitioned per `pluginId`.
4. **Transparent Keystore Protection**:
   Private keys (`nsec`) are **never** shared with plugin sandboxes. Signing occurs strictly inside the host's WebCrypto keystore via IPC.
