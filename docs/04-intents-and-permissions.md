# Omni — Standardized Intents & Cross-App Protocols

> **Authoritative Specification for Cross-App Intents, Protocol Handlers, and Conflict Resolution.**  
> *Version 1.0 — October 2026*

---

## 1. Overview & Philosophy

In Omni, cross-application communication and workflows are built strictly upon **open web standards and decentralized Nostr protocols (NIP-89, NIP-21, NIP-52, and W3C Web Standards)**.

### Core Tenets
1. **Zero Proprietary SDKs**: Applications and nsites never import or invoke an `omni.*` SDK. They operate as 100% standard web applications.
2. **Metadata-First Discovery (Offline / 0ms)**: Omni discovers an app's intent and kind-handling capabilities **before** launching its sandbox or iframe, by inspecting its published Nostr metadata (NIP-89) or Web App Manifest.
3. **User Agency & Disambiguation**: When multiple apps can handle the same intent, the user decides via an "Open With..." chooser or designates a permanent default. If 0 active handlers exist but a disabled candidate exists, Omni presents an interactive toast enabling one-tap activation.
4. **Granular Kind-Level Publishing ACL**: Intent handling and Nostr publishing are governed per event kind (`nostr:write::1`, `nostr:write::7`, etc.) rather than blanket wildcard write access.

---

## 2. Predefined Standard Intents & Payloads

Omni defines a canonical catalog of standard intents mapped directly to standard Nostr kinds, URI schemes, and web conventions:

| Intent Action | Category | Standard Mapping | Primary Payload Schema | Description |
| :--- | :--- | :--- | :--- | :--- |
| `create_note` | Social | NIP-89 `["k", "1"]`, `nostr:compose` | `{ text?: string, replyTo?: string, media?: string[] }` | Compose a short public text note or thread reply. |
| `view_note` | Social | NIP-21 `nostr:note1...`, `nostr:nevent1...` | `{ id: string, relays?: string[] }` | View a specific note and its threaded discussion. |
| `view_profile` | Identity | NIP-21 `nostr:npub1...`, `nostr:nprofile1...` | `{ pubkey: string, npub?: string }` | Inspect a user profile, notes, and metadata. |
| `edit_profile` | Identity | NIP-89 `["k", "0"]` | `{}` | Open the profile/identity editor. |
| `pay_invoice` | Wallet | `lightning:lnbc...`, `cashu:ey...` | `{ invoice: string, amountSats?: number, memo?: string }` | Pay a Lightning BOLT-11 or Cashu ecash invoice. |
| `send_dm` | Messaging | NIP-04 / NIP-17 `["k", "4"]`, `["k", "1059"]` | `{ recipientPubkey: string, text?: string }` | Open direct message conversation with a user. |
| `view_calendar` | Productivity | NIP-52 `["k", "31922"]`, `["k", "31923"]`, `["k", "31924"]` | `{ date?: string, eventId?: string }` | Open calendar schedule or inspect calendar event. |
| `create_task` | Productivity | `["intent", "task"]`, `web+task:` | `{ title: string, dueDate?: string, tags?: string[] }` | Add a new task to checklist/todo app. |
| `share` | System | W3C Web Share API (`navigator.share`) | `{ title?: string, text?: string, url?: string }` | Share web content, links, or media across apps. |
| `open_url` | System | Standard HTTP(S) URLs | `{ url: string }` | Open external web link or documentation. |

---

## 3. Declaring Intent Handlers (SDK-Free)

Apps declare the intents they support using standard web and Nostr mechanisms. Omni indexes these declarations at registration time so capabilities are known immediately without loading the guest iframe.

### 3.1 Nostr-Native Declaration (NIP-89 & NIP-5A Events)
In the app's published Nostr event (`kind: 31990` Handler Info or `kind: 35129` nsite definition):

```json
{
  "kind": 31990,
  "tags": [
    ["d", "feed-app"],
    ["k", "1"],
    ["k", "30023"],
    ["intent", "create_note", "?view=compose"],
    ["intent", "view_note", "?view=thread&id=%s"],
    ["intent", "share", "?view=compose"]
  ],
  "content": "{\"name\":\"Feed\",\"picture\":\"...\",\"about\":\"Timeline Feed & Composer\"}"
}
```

- **`["k", "<kind>"]`**: Declares handling of Nostr event kinds (e.g. `1` for short notes, `0` for profiles, `31924` for calendar).
- **`["intent", "<action>", "<route_template>"]`**: Explicitly maps standard intents to URL route templates within the app bundle.

### 3.2 Web Standard Declaration (Web App Manifest & HTML Links)
For standard web apps (PWAs / nsites):

```html
<!-- Inside index.html <head> -->
<link rel="alternate" data-intent="create_note" href="?view=compose" title="Compose Note" />
<link rel="alternate" data-intent="view_profile" href="?view=profile" title="View Profile" />
```

Or inside `manifest.webmanifest`:

```json
{
  "name": "Nostr Calendar",
  "protocol_handlers": [
    {
      "protocol": "web+calendar",
      "url": "/?view=calendar&date=%s"
    }
  ],
  "share_target": {
    "action": "/?view=compose",
    "params": { "title": "title", "text": "text", "url": "url" }
  },
  "shortcuts": [
    { "name": "Compose Note", "url": "/?view=compose" }
  ]
}
```

---

## 4. Triggering Intents Without an SDK

Applications trigger intents using standard browser and web features:

### 4.1 Standard Protocol Links
```html
<!-- Opens the user's default profile inspector -->
<a href="nostr:npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6">View Profile</a>

<!-- Opens the user's payment wallet -->
<a href="lightning:lnbc25u1p3x0j5xpp5...">Pay Invoice</a>

<!-- Opens note composer -->
<a href="nostr:compose?text=Hello%20world">Compose Note</a>
```

### 4.2 Standard Web APIs
```javascript
// Native Web Share API -> mapped to 'share' / 'create_note' intent
navigator.share({
  title: "Check this out",
  text: "Excited about decentralized web clients!",
  url: "https://example.com"
});

// Standard custom event (works without importing any external library)
window.dispatchEvent(new CustomEvent("intent", {
  detail: { action: "view_calendar", date: "2026-10-12" }
}));
```

---

## 5. Intent Resolution Algorithm & Conflict Handling

When an intent `action` is dispatched, the Omni Kernel executes the following resolution pipeline:

```mermaid
flowchart TD
    D["Intent Dispatched (action, payload)"] --> Q["Query Registered Candidates"]
    Q --> F["Filter Enabled Handlers (per workspace settings)"]
    
    F --> C{"Count of Enabled Handlers"}
    
    C -->|0 Enabled| Z{"Does any disabled candidate exist?"}
    Z -->|Yes (Exactly 1)| Toast["Fire Toast Notification:\n'Enable {App} to handle {action}?'\n[ Enable & Open ]"]
    Z -->|No| Fallback["Fallback / Show Toast: 'No app available'"]
    Toast -->|User clicks Enable| Enable["Enable in Workspace & Dispatch"]
    
    C -->|1 Enabled| Route["Dispatch directly to handler"]
    
    C -->|> 1 Enabled| DefCheck{"Is default set in NIP-78 defaultIntents?"}
    DefCheck -->|Yes| RouteDef["Dispatch directly to default app"]
    DefCheck -->|No / 'Ask Every Time'| OpenWith["Show 'Open With...' Modal\n(Lists apps + '[ ] Always use this app')"]
    OpenWith -->|User selects app| SaveChoice{"'Always' checked?"}
    SaveChoice -->|Yes| SaveDef["Save to defaultIntents (NIP-78)"]
    SaveChoice -->|No| DirectExec["Dispatch intent to selected app"]
    SaveDef --> DirectExec
```

### 5.1 Zero Active Handlers with 1 Disabled Candidate
If no active handler is enabled, but exactly one installed plugin declares support for that intent:
- An interactive toast notification appears at the top/bottom of the shell:
  > *"Enable **Feed** to handle **create_note**?"* `[ Enable & Open ]`
- Clicking **Enable & Open** updates the plugin's intent setting, commits the update to NIP-78 workspace state, and delivers the payload.

### 5.2 Multi-App Disambiguation ("Open With..." Modal)
If more than one active handler is available and no default is configured:
- Omni Shell displays the **"Open With..."** modal.
- Users select their preferred application from a list displaying geometric monochrome icons and titles.
- Checking **"Always use this app"** saves the preference to `defaultIntents[action]` in the user's NIP-78 workspace settings (`kind: 30078`).

---

## 6. Granular Kind-Level Publishing ACL

To prevent untrusted plugins from publishing unauthorized event kinds (e.g. altering profile metadata Kind 0, deleting events Kind 5, or spamming notes Kind 1), Omni enforces kind-scoped capabilities.

### 6.1 Capability Structure
- Wildcard publishing: `nostr:write::*` (only for full-trust system tools).
- Scoped publishing: `nostr:write::<kind_number>`:
  - `nostr:write::1`: Short Text Notes
  - `nostr:write::6`: Reposts
  - `nostr:write::7`: Reactions / Likes
  - `nostr:write::0`: Profile Metadata
  - `nostr:write::30023`: Long-Form Content
  - `nostr:write::31922`: Calendar Events

### 6.2 IPC Enforcement Boundary
During both `nostr.publish` and `nostr.signEvent` JSON-RPC calls, the kernel's `AclEngine` validates the event's `kind` against the calling plugin's granted capabilities:

```typescript
const kind = params.event.kind;
const hasPermission = 
  aclEngine.checkPermission(pluginId, `nostr:write::${kind}`) ||
  aclEngine.checkPermission(pluginId, "nostr:write::*");

if (!hasPermission) {
  throw new JsonRpcError(
    RpcErrorCode.Forbidden,
    `Plugin '${pluginId}' is not authorized to sign or publish kind ${kind}.`
  );
}
```

### 6.3 Collapsible Permissions UI
In both the Classic Shell and Panorama System view, Nostr publishing permissions are presented in a dedicated **collapsible section** to keep the interface clean while allowing complete granularity:

```
┌────────────────────────────────────────────────────────┐
│ ▾ Nostr Publishing Permissions (Kind-Level ACL)       │
│                                                        │
│   [x] Allow All Kinds (Wildcard)                       │
│                                                        │
│   ── Standard Kinds ────────────────────────────────── │
│   [x] Short Text Note (Kind 1)                         │
│   [x] Reaction / Like (Kind 7)                         │
│   [x] Repost (Kind 6)                                  │
│   [ ] User Metadata / Profile (Kind 0)                 │
│   [ ] Long-Form Content (Kind 30023)                   │
│   [ ] Relay List Metadata (Kind 10002)                 │
│   [ ] Encrypted Direct Message (Kind 4 / 1059)         │
│                                                        │
│   ── Custom Kind ───────────────────────────────────── │
│   [ Enter Kind # ] [ + Add Kind ]                      │
└────────────────────────────────────────────────────────┘
```
