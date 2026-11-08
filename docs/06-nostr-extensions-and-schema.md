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

## 5. Declarative Schema UI Primitives & Machine-Readable Specification

Omni enables lightweight plugins and background workers to render rich interactive interfaces without direct DOM access by emitting declarative JSON component trees.

### 5.1 Machine-Readable JSON Schema

The canonical, machine-readable JSON Schema specification is maintained at:
- **File**: [`packages/types/schema/omni-ui.schema.json`](file:///home/spiralnights/code/omni/packages/types/schema/omni-ui.schema.json)
- **Schema ID**: `https://omni.org/schemas/v1/omni-ui.schema.json`
- **TypeScript AST**: [`packages/types/src/schema.ts`](file:///home/spiralnights/code/omni/packages/types/src/schema.ts)

Plugin developers and external tools can reference the schema directly in JSON documents for instant autocomplete, hover documentation, and validation in VS Code or any JSON Schema-compatible editor:

```json
{
  "$schema": "https://omni.org/schemas/v1/omni-ui.schema.json",
  "type": "card",
  "title": "My Plugin Widget",
  "icon": "clock",
  "children": [
    {
      "type": "box",
      "direction": "row",
      "gap": "sm",
      "children": [
        { "type": "button", "label": "Start", "action": { "name": "start-timer" } }
      ]
    }
  ]
}
```

### 5.2 The Light DOM Custom Elements Pipeline

```
+--------------------------+          postMessage           +-----------------------------+
| Guest Code / Web Worker  | -----------------------------> | Omni Host (SchemaRenderer)  |
| - window.nostr.doc()     |   { type: "omni:schema", ... } | - Custom Elements (<omni-*>) |
| - State & Business Logic | <----------------------------- | - Design Token Styling      |
+--------------------------+    Event: "omni:action"        +-----------------------------+
```

1. The sandboxed guest emits `{ type: "omni:schema", schema: rootNode }` over Port 1 (`channelSchemaBus`) or `window.parent.postMessage`.
2. The host `SchemaRenderer` performs in-place morphing and renders native Light DOM Custom Elements (`<omni-box>`, `<omni-card>`, `<omni-button>`, etc.).
3. When the user interacts (clicks a button, submits an input, toggles a switch), the host captures ambient form state and dispatches an `omni:action` message back to the guest.

---

### 5.3 Complete Reference of All 24 Schema Primitives

Every primitive extends `OmniPrimitiveBase`:
- `id` *(string)*: Optional DOM identifier.
- `key` *(string)*: Unique key for smooth list reconciliation and morphing.
- `visible` *(boolean)*: Toggle display without unmounting.
- `style` *(string | Record<string, string>)*: Custom inline CSS styling or CSS variables.
- `page` *(string | OmniPageDeclaration)*: Logical page metadata (`{ id, title, url, state }`) for host navigation stack and back-button management.

#### 1. Layout & Structure
| Primitive | Type | Key Attributes | Notes |
| :--- | :--- | :--- | :--- |
| **`<omni-box>`** | `"box"` | `direction`: `"row"` \| `"column"`<br>`gap` / `padding`: `"none"` \| `"xs"` \| `"sm"` \| `"md"` \| `"lg"`<br>`align`: `"start"` \| `"center"` \| `"end"` \| `"stretch"`<br>`justify`: `"start"` \| `"center"` \| `"between"` \| `"end"`<br>`wrap`: boolean<br>`action`: `OmniAction`<br>`children`: `OmniComponentNode[]` | Primary flexbox layout primitive. |
| **`<omni-card>`** | `"card"` | `title`: string<br>`subtitle`: string<br>`icon`: string<br>`headerAction`: `OmniComponentNode`<br>`children`: `OmniComponentNode[]`<br>`footer`: `OmniComponentNode[]`<br>`action`: `OmniAction` | Elevated surface card container. |
| **`<omni-divider>`** | `"divider"` | `orientation`: `"horizontal"` \| `"vertical"` | Visual separator rule. |
| **`<omni-spacer>`** | `"spacer"` | `size`: `"xs"` \| `"sm"` \| `"md"` \| `"lg"` \| `"xl"` | Flexible layout spacing block. |

#### 2. Typography & Content
| Primitive | Type | Key Attributes | Notes |
| :--- | :--- | :--- | :--- |
| **`<omni-text>`** | `"text"` | `content`: string *(required)*<br>`variant`: `"title"` \| `"subtitle"` \| `"body"` \| `"caption"` \| `"mono"`<br>`tone`: `"primary"` \| `"secondary"` \| `"muted"` \| `"accent"` \| `"error"` \| `"success"`<br>`truncate`: boolean<br>`showInlineImages`: boolean | Core text rendering with semantic styling. |
| **`<omni-badge>`** | `"badge"` | `label`: string *(required)*<br>`tone`: `"neutral"` \| `"success"` \| `"warning"` \| `"error"` \| `"accent"`<br>`variant`: `"solid"` \| `"subtle"` \| `"outline"`<br>`dot`: boolean | Status or category pill badge. |
| **`<omni-metric>`** | `"metric"` | `label`: string *(required)*<br>`value`: string \| number *(required)*<br>`subtext`: string<br>`trend`: `"up"` \| `"down"` \| `"neutral"` | Prominent numerical or key-value metric. |
| **`<omni-icon>`** | `"icon"` | `name`: string *(required)*<br>`size`: number (default: 20) | Monochrome geometric SVG line icon. |
| **`<omni-avatar>`** | `"avatar"` | `src`: string<br>`pubkey`: string<br>`name`: string<br>`size`: `"xs"` \| `"sm"` \| `"md"` \| `"lg"` \| `"xl"` | User avatar with deterministic robohash fallback. |
| **`<omni-code-block>`** | `"code-block"` | `code`: string *(required)*<br>`language`: string<br>`copyable`: boolean | Formatted code snippet with 1-click copy. |

#### 3. Buttons & Actions
| Primitive | Type | Key Attributes | Notes |
| :--- | :--- | :--- | :--- |
| **`<omni-button>`** | `"button"` | `label`: string *(required)*<br>`action`: `OmniAction` *(required)*<br>`variant`: `"primary"` \| `"secondary"` \| `"ghost"` \| `"danger"`<br>`size`: `"sm"` \| `"md"` \| `"lg"`<br>`icon`: string<br>`iconPosition`: `"left"` \| `"right"`<br>`disabled` / `loading`: boolean | Standard interactive button. |
| **`<omni-icon-button>`** | `"icon-button"` | `icon`: string *(required)*<br>`action`: `OmniAction` *(required)*<br>`tooltip`: string<br>`variant`: `"ghost"` \| `"secondary"` \| `"danger"`<br>`size`: `"sm"` \| `"md"` | Compact standalone icon button. |

#### 4. Forms & Input Controls
| Primitive | Type | Key Attributes | Notes |
| :--- | :--- | :--- | :--- |
| **`<omni-input>`** | `"input"` | `name`: string *(required)*<br>`placeholder`: string<br>`value`: string<br>`inputType`: `"text"` \| `"number"` \| `"search"` \| `"url"` \| `"password"` \| `"file"`<br>`clearable`: boolean<br>`prefixIcon`: string<br>`actionOnEnter`: `OmniAction`<br>`actionOnChange`: `OmniAction` | Single-line text, number, search, or file input. |
| **`<omni-textarea>`** | `"textarea"` | `name`: string *(required)*<br>`placeholder`: string<br>`value`: string<br>`rows`: number | Multi-line text entry. |
| **`<omni-toggle>`** | `"toggle"` | `name`: string *(required)*<br>`label`: string<br>`checked`: boolean *(required)*<br>`action`: `OmniAction` *(required)* | Interactive boolean switch. |
| **`<omni-select>`** | `"select"` | `name`: string *(required)*<br>`value`: string<br>`options`: `Array<{ label: string, value: string }>` *(required)*<br>`action`: `OmniAction` | Dropdown selector. |

#### 5. Navigation & Feedback
| Primitive | Type | Key Attributes | Notes |
| :--- | :--- | :--- | :--- |
| **`<omni-tabs>`** | `"tabs"` | `tabs`: `Array<{ id: string, label: string, icon?: string, badge?: string \| number }>` *(required)*<br>`activeTab`: string *(required)*<br>`action`: `OmniAction` *(required)* | Horizontal tab bar navigation switcher. |
| **`<omni-status-indicator>`** | `"status-indicator"` | `status`: `"online"` \| `"connecting"` \| `"offline"` \| `"error"` *(required)*<br>`label`: string<br>`pulse`: boolean | Live connection status indicator dot. |
| **`<omni-progress>`** | `"progress"` | `value`: number *(required)*<br>`max`: number (default: 100)<br>`label`: string<br>`variant`: `"bar"` \| `"spinner"` \| `"disk"` \| `"ring"`<br>`size`: number (diameter in px for ring/disk)<br>`color`: string<br>`showTicks`: boolean (clock rim markings)<br>`action`: `OmniAction` | Visual progress bar or visual circular timer. |
| **`<omni-banner>`** | `"banner"` | `tone`: `"info"` \| `"success"` \| `"warning"` \| `"error"`<br>`title`: string<br>`message`: string *(required)*<br>`icon`: string<br>`action`: `OmniAction`<br>`dismissible`: boolean | Full-width contextual callout banner. |
| **`<omni-empty-state>`** | `"empty-state"` | `icon`: string<br>`title`: string *(required)*<br>`description`: string<br>`action`: `OmniAction`<br>`actionLabel`: string | Friendly placeholder for zero-data views. |

#### 6. Lists & Collections
| Primitive | Type | Key Attributes | Notes |
| :--- | :--- | :--- | :--- |
| **`<omni-list>`** | `"list"` | `items`: `OmniListItemPrimitive[]` *(required)*<br>`onScrollEndAction`: `OmniAction`<br>`hasMore` / `loadingMore`: boolean | Interactive scrollable list with infinite scroll. |
| **`<omni-list-item>`** | `"list-item"` | `title`: string *(required)*<br>`subtitle` / `meta`: string<br>`icon` / `avatarUrl` / `avatarPubkey`: string<br>`checked`: boolean<br>`onCheckAction` / `onClickAction`: `OmniAction`<br>`actions`: `OmniComponentNode[]` | Rich row item with checkbox and action buttons. |
| **`<omni-virtual-list>`** | `"virtual-list"` | `items`: `OmniComponentNode[]` *(required)*<br>`itemHeight`: number<br>`overscan`: number<br>`maxHeight`: string | High-performance virtualized list. |

---

### 5.4 Ambient Form State Capture

When an `OmniAction` fires from any child button or input:
1. `SchemaRenderer` automatically scans the container for all named inputs (`omni-input`, `omni-textarea`, `omni-toggle`).
2. Their current values are merged into the event payload:
   ```javascript
   // If the user typed "Alice" into <omni-input name="username">
   // and clicks <omni-button action="{ name: 'submit' }">:
   // The guest receives:
   {
     type: "omni:action",
     action: { name: "submit" },
     payload: { username: "Alice" }
   }
   ```
This eliminates the need for manual two-way data binding on every keystroke.

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

---

## 8. WebAssembly Component Model & WIT Support

Omni provides first-class support for compiling plugins directly to WebAssembly (`.wasm`) using the **W3C WebAssembly Component Model & WIT (`.wit`)** standards.

### 1. Canonical WIT Interface (`packages/types/wit/omni.wit`)

WASM plugins target the standard WIT interface exported by `@omni/types`:

```wit
package omni:plugin@0.1.0;

/// Host UI rendering and component updates.
interface ui {
    /// Render or update declarative schema for the default or active view.
    render: func(view: string);

    /// Render or update declarative schema for an explicit component/slot.
    render-component: func(component-id: string, view: string);
}

/// Host Nostr and data primitives.
interface nostr {
    /// Query local 0ms event store and relay pool.
    fetch: func(filters: string, options: string) -> string;

    /// Publish a draft event via the host keystore and relay pool.
    publish: func(draft-event: string) -> string;

    /// Retrieve the user's public key (hex).
    get-public-key: func() -> string;
}

/// World representing an Omni WebAssembly guest plugin.
world omni-plugin {
    /// Host capabilities imported by the guest plugin.
    import ui;
    import nostr;

    /// Initializes the plugin and returns initial declarative schema JSON.
    export init: func() -> string;

    /// Handles a UI action dispatched by the user and optionally returns updated schema JSON.
    export handle-action: func(action: string, payload: string) -> string;
}
```

### 2. Execution Runtime (`WasmGuestHost`)

WASM plugins execute in `WasmGuestHost` inside the host kernel:
- **Zero DOM / Zero Proprietary SDKs**: WASM modules compile against standard imports (`ui`, `nostr`, and standard WASI Preview 1 snapshot).
- **Linear Memory & String Passing**: Strings (JSON schema and payloads) are marshalled across linear memory using UTF-8 encoding. If the module exports `alloc` or `malloc`, the host utilizes the guest allocator; otherwise, a memory-growing bump allocator allocates safely above the guest data heap.
- **WASI Preview 1 Emulation**: Built-in support for `fd_write` (capturing `stdout` / `println!` into host logger), `clock_time_get`, `proc_exit`, and random seed generation.
- **Native Light DOM Custom Elements**: When `ui.render(view)` is called or `init()` / `handle-action()` returns JSON schema, Omni's `SchemaRenderer` mounts the declarative UI into the active slot container.

### 3. Example: Rust Plugin Implementation

```rust
// A pure Rust plugin compiling to wasm32-unknown-unknown or wasm32-wasip1
#[link(wasm_import_module = "omni:plugin/ui")]
extern "C" {
    fn render(ptr: *const u8, len: usize);
}

#[no_mangle]
pub extern "C" fn init() -> *const u8 {
    let schema = r#"{
        "type": "card",
        "title": "Rust WASM Plugin",
        "icon": "cpu",
        "children": [
            { "type": "badge", "label": "Compiled to WebAssembly", "variant": "success" },
            { "type": "button", "label": "Increment Counter", "action": { "name": "increment" } }
        ]
    }"#;
    render(schema.as_ptr(), schema.len());
    std::ptr::null()
}

#[no_mangle]
pub extern "C" fn handle_action(action_ptr: *const u8, action_len: usize, payload_ptr: *const u8, payload_len: usize) -> *const u8 {
    // Process action and call render() with new state
    std::ptr::null()
}
```

### 4. MoonBit Flagship Implementation (`@omni/plugin-feed`)

`@omni/plugin-feed` is compiled from **MoonBit** into a **28 KB** standalone WebAssembly binary (`dist/feed.wasm`):
- **Zero DOM / Pure Functional State**: Maintains notes state, tab selection, and active threads in MoonBit linear memory.
- **In-Memory Bech32 & String Marshalling**: Decodes `npub` Nostr identifiers and parses action payloads with zero JavaScript GC pauses.
- **WASI `fd_write` & Line-Buffered Streaming**: Emits Declarative Schema UI JSON directly to the host `SchemaRenderer`.
- **GitHub Actions Free CI/CD**: Compiled automatically in CI via MoonBit's official free installer script.
