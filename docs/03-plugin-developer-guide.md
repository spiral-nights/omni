# Omni — Plugin & nsite Developer Guide

> **Authoritative Guide for Building, Styling, and Publishing Apps on Omni.**  
> *Version 2.0 (Consolidated) — October 2026*

---

## 1. The Core Developer Principle

**There are NO custom SDKs or proprietary manifests in Omni.**

You build a **100% standard web application (nsite)** using open web and Nostr standards. Your application can run:
1. Standalone in any browser window.
2. Sandboxed inside Omni, projecting into the user's chosen viewport.

---

## 2. Standard Web & Nostr APIs

Inside Omni, standard web interfaces are transparently virtualized by the host runtime:

| API | Standard Web Usage | How Omni Handles It |
| :--- | :--- | :--- |
| **Identity & Signing** | `window.nostr` (NIP-07) | Host keystore signs events following ACL checks. |
| **Relay Networking** | `new WebSocket("wss://...")` | Multiplexed through host's RelayPool and 0ms local cache. |
| **Local Storage** | `localStorage` / `indexedDB` | Transparently scoped and isolated per plugin ID. |
| **UI Mounting** | `document.body` or `#root` | Remote DOM automatically projects elements into the host container. |
| **Cross-App Links** | `<a href="nostr:...">` | Host intercepts and presents the "Open With..." chooser. |
| **Sharing** | `navigator.share(...)` | Host opens the timeline composer with pre-populated content. |

### Minimal Complete Example (Vanilla HTML / JS)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: var(--omni-font-sans, system-ui, sans-serif);
      color: var(--omni-text-primary, #ede8df);
      background: var(--omni-bg-surface, #191816);
      padding: 16px;
      margin: 0;
    }
    .btn {
      background: var(--omni-accent-primary, #d4a373);
      color: #141312;
      border: none;
      padding: 8px 16px;
      border-radius: var(--omni-radius-sm, 6px);
      cursor: pointer;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <h3>✦ My Decentralized App</h3>
  <button id="btn-publish" class="btn">Publish Note</button>

  <script type="module">
    // 1. Check standard NIP-07 signer
    const nostr = window.nostr;

    document.getElementById("btn-publish").addEventListener("click", async () => {
      if (!nostr) {
        alert("No Nostr signer available.");
        return;
      }

      // 2. Request signature
      const event = await nostr.signEvent({
        kind: 1,
        content: "Hello from my standalone nsite on Omni!",
        tags: [["client", "omni"]],
        created_at: Math.floor(Date.now() / 1000)
      });

      // 3. Broadcast using standard WebSocket
      const ws = new WebSocket("wss://relay.damus.io");
      ws.onopen = () => {
        ws.send(JSON.stringify(["EVENT", event]));
        alert("Note broadcasted!");
      };
    });
  </script>
</body>
</html>
```

---

## 3. Responsive Multi-Viewport Design

Because the user can assign your application to either a **Full-Page App** (`main`) or a **Workspace Widget Card** (`sidebar`), design your layout responsively using **CSS Container Queries**:

```css
/* Container Query for adaptive viewports */
.my-app-container {
  container-type: inline-size;
}

/* Default / Wide: Full-Page Viewport */
.dashboard-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;
}

/* Compact: Sidebar / Widget Card Viewport */
@container (max-width: 480px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }
  .hide-on-compact {
    display: none;
  }
}
```

---

## 4. Multi-View Architecture & Settings Conventions

Rather than requiring separate packages or proprietary manifests, Omni supports **sub-views and routes within a single nsite bundle**. This allows a single application to provide:
- A primary full-page application (`main`)
- A dedicated settings panel (`settings`)
- One or more dashboard companion widgets (`widget`)

### 4.1 Reserved Route Conventions
Omni recognizes standard semantic route names:
- **`settings`** (`?view=settings`): Automatically surfaced in Omni's **Settings & Control** menu under the plugin's dedicated section.
- **`widget`** (`?view=widget`): Optimized for compact display in the **Widgets Dashboard** (`sidebar`), **Dock Shortcut** (`dock`), or **Header Quick Action** (`header-actions`).
- **`main`** (`/` or `?view=main`): The primary full-page experience.

### 4.2 Route Detection (Zero Custom SDKs)
Omni detects supported sub-views using two open standards:

#### Tier 1: Nostr-Native Event Tags (Fastest & Relay-Filterable)
Add `view` tags directly to your published Nostr nsite event (`kind: 35129` or `kind: 30063`):
```json
{
  "kind": 35129,
  "tags": [
    ["d", "task-planner"],
    ["name", "Task Planner"],
    ["view", "settings", "Planner Settings", "?view=settings"],
    ["view", "widget", "Daily Summary Card", "?view=widget"]
  ]
}
```
*Note: If the path parameter is omitted, Omni automatically defaults to `?view=<id>`.*

#### Tier 2: HTML `<link rel="alternate">` or Web App Manifest
Include standard HTML alternate links in your `index.html` `<head>`:
```html
<link rel="alternate" href="?view=settings" title="Settings" />
<link rel="alternate" href="?view=widget" title="Mini Widget" />
```
Or declare standard W3C Web App Manifest `shortcuts`:
```json
{
  "shortcuts": [
    { "name": "Settings", "url": "/?view=settings" },
    { "name": "Widget", "url": "/?view=widget" }
  ]
}
```

### 4.3 Handling Routes in Guest Code
Your guest web app inspects `window.location.search` or `window.location.hash` using standard web APIs:
```javascript
// Standard web routing (works in vanilla JS, React Router, SvelteKit, etc.)
const params = new URLSearchParams(window.location.search);
const view = params.get("view") || window.location.hash.replace("#", "") || "main";

if (view === "settings") {
  renderSettingsForm();
} else if (view === "widget") {
  renderCompactWidget();
} else {
  renderFullApplication();
}
```
*Both `localStorage` and `indexedDB` are automatically shared across all routes of your nsite because they run within the same origin sandbox partition.*

### 4.4 App Names & Display Names (`displayName`)
Applications can define an internal or formal `name` alongside an optional, concise `displayName`:
- **`name`**: The formal app title used in Settings, app management, and metadata inspectors (e.g. `"Profile Editor"` or `"Profile Viewer"`).
- **`displayName`**: The concise label displayed on navigation docks, live tiles, and mobile launchers (e.g. `"My Profile"` for the editor and `"Profile"` for the viewer).
If `displayName` is omitted, Omni falls back cleanly to `name`.

### 4.5 Viewport & Route Assignment in Omni
When a user assigns your plugin to a viewport in Omni:
1. They select the **Target Viewport** (e.g. *Navigation Dock Shortcut*, *Widgets Dashboard*, or *Header Action*). Every plugin is an autonomous full-page app by default.
2. They select the **Assigned Route** (e.g. `Main App (/)` or `Countdown Card (/?view=widget)`).
3. If your plugin declares a `settings` route, an **"Open Settings Panel"** control is automatically rendered inside the plugin's card in Omni's Settings menu.

### 4.6 Back Button Placement & Browser History Synchronization
When plugins navigate into sub-views (such as a thread discussion, search results, or user profile inspection):
1. **Top-Left Placement**: Position the back button anchored at the top-left of the view header, adjacent to the view title or search input, maintaining consistent ergonomics across desktop and mobile.
2. **Browser History Integration**: Synchronize with browser navigation using `window.history.pushState` on sub-view transitions and listen for `popstate` events:
   ```javascript
   // When opening a sub-view:
   window.history.pushState({ view: "thread", noteId }, "", `?view=thread&id=${noteId}`);

   // When handling browser back/forward buttons:
   window.addEventListener("popstate", (event) => {
     if (event.state?.view === "thread") {
       renderThread(event.state.noteId);
     } else {
       renderMainFeed();
     }
   });
   ```
3. **Explicit Back Action**: When the user clicks the top-left back button, invoke `window.history.back()` or restore the root state, resetting the URL and view cleanly.

---

## 5. Design System & Aesthetic Guidelines

Omni supports multiple swappable shells (Omni Classic, Panorama Hub, and Editorial). Plugins automatically inherit the active shell's design tokens and CSS custom properties:

### 5.1 Color Tokens
```css
/* Surface Palettes */
--omni-bg-canvas: #141312;      /* Deep graphite window background */
--omni-bg-surface: #191816;     /* Subtle warm charcoal surfaces */
--omni-bg-card: #22201d;        /* Elevated card background */
--omni-bg-subtle: #2a2723;      /* Input fields & hover states */

/* Typography Colors */
--omni-text-primary: #ede8df;   /* Warm ivory headings and body */
--omni-text-secondary: #9e988f; /* Sandstone grey secondary text */
--omni-text-muted: #6b665f;     /* Muted labels & timestamps */

/* Accent Colors */
--omni-accent-primary: #d4a373; /* Warm sandstone accent */
--omni-border-subtle: #2e2b26;  /* Soft divider lines */
--omni-border-strong: #3d3933;  /* Input & active borders */

/* Border Radius */
--omni-radius-sm: 6px;
--omni-radius-md: 10px;
--omni-radius-pill: 9999px;
```

### 5.2 Strict Iconography Rules
- **NEVER use colorful emojis in UI code**.
- **Always use geometric monochrome SVG line icons** (1.5px – 1.8px stroke width, inheriting `currentColor`).

---

## 6. Authoring, Packaging & Uploading Plugins (`@omni/plugin-publisher`)

Omni handles all plugin creation, `.zip` extraction, Blossom uploading, and arbitrary URL installation purely through the **Plugin Studio** (`@omni/plugin-publisher`) plugin—requiring zero custom modifications to any shell.

### 6.1 Structure of a `.zip` Plugin Archive
To create a multi-file plugin, place your standard web files in a directory and zip them:
```
my-plugin.zip
├── index.html          # Entry HTML (mounts to document.body or #root)
├── style.css           # Stylesheet using --omni-* CSS variables
├── app.js              # Standard ES module / JavaScript logic
└── manifest.json       # Optional metadata (id, name, version, description, icon)
```
- **Sub-Views**: Declare supported views in `index.html` using `<link rel="alternate" href="?view=widget" title="Mini Widget">` or `<link rel="alternate" href="?view=settings" title="Settings">`.
- **Icons**: Always use geometric monochrome SVG line icons (`stroke="currentColor"`, `stroke-width="1.75"`). Never use colorful emojis.

### 6.2 Uploading & Installing via Plugin Studio (`@omni/plugin-publisher`)
Open **Publisher** (**Plugin Studio**) from the navigation dock in any shell (**Omni Classic**, **Panorama Hub**, or **Editorial**):

1. **Drop or Select Your `.zip` Archive**:
   - Drag and drop your `.zip` file (or `.html` / `.js` bundle) onto the **Create & Upload** dropzone, or click **Select .zip or .html File**.
   - Plugin Studio extracts all files in-browser, computes each file's SHA-256 hash, and auto-populates the plugin's Name, App Slug (`d` tag), Version, and Description.
2. **Choose Your Packaging & Upload Method**:
   - **Option B — Multi-File Blossom Upload**: Extracts and uploads each file (`index.html`, `style.css`, `app.js`, etc.) separately to your active Blossom servers via `PUT <server>/upload` with a signed BUD-06 (`kind: 24242`) Nostr authorization header, and records individual `["f", "<path>", "<sha256>", "<mime>"]` tags on the `kind: 35129` Nostr event.
   - **Option A — Single-File Inlined Bundle**: Inlines relative CSS, JS, and image assets from the `.zip` into a single self-contained HTML bundle.
3. **Install Locally or Publish to Blossom & Nostr**:
   - **Install Locally in Omni (No Blossom Needed)**: Signs the `kind: 35129` event into Omni's 0ms `LocalEventStore` and triggers `nostr:naddr1...` to immediately install and open your plugin in the active workspace without needing any Blossom server.
   - **Upload to Blossom & Publish to Nostr (NIP-5A)**: Uploads the files to all enabled Blossom servers, signs and broadcasts the `kind: 35129` event to your connected Nostr relays, and outputs a shareable `naddr1...` address.
4. **Install or Package from an Arbitrary URL / `naddr`**:
   - Paste any remote `.zip` URL (`https://.../plugin.zip`), raw `.html` URL (`https://.../index.html`), or `naddr1...` string into the **Install or Package from Arbitrary URL / NIP-5A naddr** card in Plugin Studio and click **Fetch & Inspect** or **Install from URL**.
5. **Manage Published Plugins & Blossom Servers**:
   - **My Published Plugins (`?view=published`)**: Tracks all `kind: 35129` plugins signed by your Nostr key, showing which Blossom servers and file hashes are associated with each version.
   - **Blossom Servers (`?view=servers`)**: Add or toggle public Blossom servers (e.g. `https://cdn.satellite.earth`, `https://blossom.primal.net`, `https://nostr.download`) and sync your server list to Nostr as a BUD-03 (`kind: 10063`) event.

### 6.3 Manual NIP-5A Event Structure (`kind: 35129`)
If publishing via external scripts instead of Plugin Studio:
1. **Host Assets on Blossom**:
   Upload your files to a Blossom server (`PUT /upload` with a signed `kind: 24242` Nostr auth header) and record each file's SHA-256 hex digest.
2. **Publish NIP-5A Event (`kind: 35129`)**:
   ```json
   {
     "kind": 35129,
     "tags": [
       ["d", "org.omni.plugin.my-app"],
       ["name", "My App Name"],
       ["version", "1.0.0"],
       ["description", "A decentralized tool for Omni."],
       ["icon", "globe"],
       ["view", "main", "My App Name", ""],
       ["view", "widget", "My App Widget", "?view=widget"],
       ["view", "settings", "My App Settings", "?view=settings"],
       ["f", "index.html", "<sha256_hash>", "text/html"],
       ["f", "style.css", "<sha256_hash>", "text/css"],
       ["f", "app.js", "<sha256_hash>", "application/javascript"],
       ["server", "https://cdn.satellite.earth"]
     ],
     "content": ""
   }
   ```
3. **Distribute via `naddr`**:
   Encode `(kind: 35129, pubkey, d-tag, relays)` into a NIP-19 `naddr1...` string and open or paste it in Plugin Studio.
