# 04. Layout & Widget Engine

## 1. Architectural Concept: Plugin-Driven Layouts

In Omni, the layout engine itself is **driven entirely by a plugin** (the **Root Shell Plugin**). 

The Omni Core provides only the absolute minimal host primitives required to mount, position, secure, and auto-resize sandboxed iframes. The Root Shell Plugin decides *what* the application looks like—whether it is a classic 3-column social feed, a multi-window tiling desktop (similar to Blender/i3), a compact mobile drawer, or a customized dashboard.

```
+-----------------------------------------------------------------------------------------------+
|                                       Omni Host Runtime                                       |
|                                                                                               |
|  +-----------------------------------------------------------------------------------------+  |
|  |                     Root Shell Plugin (e.g. org.omni.shell.dock)                        |  |
|  |                                                                                         |  |
|  |  +--------------------+-------------------------------------------+------------------+  |  |
|  |  | [Slot: menu_dock]  | [Slot: main_viewport]                     | [Slot: widget_1] |  |  |
|  |  |                    |                                           |                  |  |  |
|  |  | * Navigation Tabs  | * Active Feature Plugin                   | * Mini Player /  |  |  |
|  |  | * Profile Selector |   (e.g., org.nostr.feed)                  |   Status Widget  |  |  |
|  |  | * Plugin Launcher  |                                           |                  |  |  |
|  |  +--------------------+-------------------------------------------+------------------+  |  |
|  |  | [Slot: bottom_bar]                                                                |  |  |
|  +--+------------------------------------------------------------------------------------+--+  |
|                                                  |                                            |
|                 Slot Declaration & Mount Binding | RPC: omni.layout.registerSlots(...)        |
|                                                  v                                            |
|  +-----------------------------------------------------------------------------------------+  |
|  |                                 Host Slot & Viewport Host                               |  |
|  |  - Tracks DOM slot bounds & coordinates                                                 |  |
|  |  - Injects sandboxed child iframes into matching slot containers                        |  |
|  |  - Runs Bidirectional ResizeObserver Engine to prevent clipping & scrollbar bugs        |  |
|  +-----------------------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------------------+
```

---

## 2. Minimal Host Slot Mounting System

To prevent untrusted plugins from tampering with one another's DOM while allowing the Root Shell to arrange views dynamically, Omni uses a **Slot Delegation Protocol**:

1. **Root Shell Declares Slots:** The Root Shell renders HTML container elements (e.g., `<div data-omni-slot="main_viewport"></div>`) and informs Omni Host via RPC:
   ```typescript
   omni.layout.registerSlots([
     { slotId: "menu_dock", type: "fixed", defaultSize: { width: 64 } },
     { slotId: "main_viewport", type: "fluid" },
     { slotId: "widget_sidebar", type: "collapsible", defaultSize: { width: 320 } },
     { slotId: "modal_overlay", type: "overlay" }
   ]);
   ```
2. **Mounting Mini-Apps to Slots:** The Root Shell requests the Host to attach installed plugins to specific slots:
   ```typescript
   omni.layout.mount({
     slotId: "main_viewport",
     pluginId: "org.nostr.feed",
     entryPoint: "main" // Matches entry point declared in plugin manifest
   });
   ```
3. **Host Injects Sandboxed Frame:** The Host instantiates the sandboxed iframe directly into the corresponding slot container, configuring isolation and communication channels.

---

## 3. Eliminating Iframe Traps: Dynamic Auto-Sizing & Sizing Handshake

Traditional iframes suffer from fixed height/width cutoffs, dual scrollbars, and broken layout responsiveness. Omni eliminates these issues using a **Bidirectional Dynamic Sizing Protocol**:

```
   [ Plugin Sandbox ]                                      [ Omni Host Frame Manager ]
           |                                                           |
 [DOM Content Mutates]                                                 |
           |                                                           |
 [ResizeObserver fires]                                                |
           |                                                           |
           |-- omni.ui.reportIntrinsicDimensions({ width, height }) -->|
           |                                                           |
           |                                               [Update iframe style]
           |                                               [Adjust slot container]
           |                                                           |
           |<-- omni.ui.onViewportResized({ width, height }) ----------|
           |                                                           |
[Adapt internal responsive CSS]                                        |
```

### 3.1. Sizing Modes
Every slot supports one of three sizing models:

1. **Fluid (Viewport-Driven):**
   * The container takes all available space (e.g., main feed or document viewer).
   * Host sets iframe to `width: 100%; height: 100%`.
   * Plugin listens to `omni.ui.onViewportResized` and adapts internal CSS container queries.
2. **Auto-Height / Auto-Width (Content-Driven Widgets):**
   * Used for inline widgets, cards, banners, or dropdowns.
   * Plugin's `@omni/sdk` attaches an internal `ResizeObserver` to `document.body` or `#omni-root`.
   * When content expands (e.g. accordion opens or replies load), `@omni/sdk` emits `omni.ui.reportDimensions`.
   * Host updates iframe dimensions in real time, preventing internal scrollbars.
3. **Overlay & Sheet (Modal-Driven):**
   * Used for interactive intents (e.g. Zap dialogs, Image Pickers, NIP-07 confirmations).
   * Host centers the frame or renders it as a bottom slide-up sheet with a dimmed backdrop.

---

## 4. Multi-Entry Point & Widget Architecture

A single plugin can expose multiple entry points in its manifest:

```json
{
  "id": "org.nostr.calendar",
  "name": "Nostr Calendar",
  "version": "1.0.0",
  "entryPoints": {
    "main": {
      "path": "dist/index.html",
      "displayType": "fullscreen",
      "title": "Full Calendar View"
    },
    "widget": {
      "path": "dist/widget.html",
      "displayType": "inline-card",
      "title": "Upcoming Events Card",
      "preferredDimensions": { "minHeight": 120, "maxHeight": 350 }
    },
    "status": {
      "path": "dist/status.html",
      "displayType": "badge",
      "title": "Today's Agenda Count"
    }
  }
}
```

* **Full View:** Mounted in `main_viewport` when user navigates to Calendar.
* **Widget:** Mounted into a widget grid / dashboard card slot alongside other mini-app widgets.
* **Badge / Status:** Mounted in the Root Shell's menu bar or dock to show upcoming event notifications.

---

## 5. Theme & Design Token Injection

To maintain visual cohesion across diverse plugins without breaking sandboxing:

1. **CSS Variables Synchronization:** On handshake, the Host injects the active color palette, typography tokens, border radii, and spacing variables into the plugin context.
2. **Dynamic Mode Switching:** When the user switches between Light/Dark mode or changes accent colors, the Host emits an `omni.theme.changed` event over IPC.
3. **`@omni/sdk/theme.css`:** Plugins can import default standard CSS variables (e.g., `var(--omni-bg-primary)`, `var(--omni-accent)`, `var(--omni-text-primary)`), allowing widgets to blend seamlessly into whichever Root Shell the user selects.
