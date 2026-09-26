# 04. Layout & Remote DOM Engine

## 1. Architectural Concept: Native Slots & Remote DOM Projection

Omni departs from traditional micro-frontend architectures by eliminating nested UI iframes entirely. Instead, the **Omni Web Application** renders a native, cohesive client interface and provides a **declarative Slot System** powered by **Shopify Remote DOM (`@remote-dom/core`)**.

```
+-----------------------------------------------------------------------------------------------+
|                                    Omni Native Web Application                                |
|                                                                                               |
|  +-----------------------------------------------------------------------------------------+  |
|  | [Slot: 'dock']     | [Slot: 'main']                            | [Slot: 'sidebar']      |  |
|  |                    |                                           |                        |  |
|  | * Home Feed Icon   | * Native Timeline Feed (Default)          | * Trending Topics      |  |
|  | * Checklist (P1)   | * Active Main Plugin View (e.g. Tasks)    | * Tasks Checklist (P1) |  |
|  | * Timer (P2)       |                                           | * Pomodoro Timer (P2)  |  |
|  +--------------------+-------------------------------------------+------------------------+  |
|                                                  |                                            |
|                               RemoteReceiver per Slot Container                               |
|                                                  ^                                            |
|                                                  | Port 1 (Remote DOM Mutations)              |
|                                                  |                                            |
|  +-----------------------------------------------------------------------------------------+  |
|  |                              Isolated Sandbox (Iframe / Worker)                         |  |
|  |                                                                                         |  |
|  |  Plugin Bundle (e.g. Daily Checklist Plugin)                                                 |  |
|  |  - RemoteRoot("wallet-icon")    -----> Projects to Slot 'dock'                          |  |
|  |  - RemoteRoot("wallet-balance") -----> Projects to Slot 'sidebar'                       |  |
|  |  - RemoteRoot("wallet-tx-view") -----> Projects to Slot 'main'                          |  |
|  +-----------------------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------------------+
```

---

## 2. Why Remote DOM Replaces Iframes

In traditional micro-frontend systems, every widget renders inside an `<iframe>`. This approach introduces fatal UX and architectural issues:
1. **Layout Traps & Broken Responsiveness:** Iframes cannot naturally stretch or shrink with their contents without asynchronous `ResizeObserver` polling and IPC message roundtrips.
2. **Nested Scrollbar Hell:** Mismatched heights cause ugly, unusable double scrollbars.
3. **Modal & Tooltip Clipping:** Dropdowns, popups, and tooltips are bounded by the iframe's rectangular viewport and get clipped at iframe borders.
4. **Theme Fragmentation:** Host CSS custom properties cannot penetrate the iframe boundary without explicit variable mirroring.
5. **Heavy Resource Footprint:** Spawning a dozen separate iframes for widgets degrades memory and CPU performance.

### How Shopify Remote DOM Solves This
* **Headless Sandbox:** The plugin code executes in a single, lightweight sandboxed environment (headless iframe or Web Worker) with zero direct access to the Host DOM.
* **Serialized UI Tree:** The plugin constructs standard HTML elements (e.g., `<div>`, `<button>`, `<input>`, `<span>`) via `@remote-dom/core`.
* **Host-Side Native Rendering:** The Host attaches a `RemoteReceiver` to the target slot DOM container. As the plugin updates elements, Remote DOM transmits batched mutation arrays over a `MessagePort`.
* **Zero Clipping & Native CSS:** The elements are rendered as real DOM elements in the Host page. They inherit the Host's CSS variables, participate in native Flexbox/Grid flow, scale smoothly, support keyboard accessibility, and never get clipped by arbitrary boundaries.

---

## 3. Slot Hierarchy & Component Types

Omni categorizes UI contributions into four core component types:

| Component Type | Target Slot | Primary Role | UX Characteristics |
| :--- | :--- | :--- | :--- |
| **`icon`** | `dock` / `toolbar` | Quick-launch icons, unread notification badges, status indicators. | Compact (32x32 to 48x48px), tooltip on hover, click toggles sidebar or main view. |
| **`sidebar`** | `sidebar` | Secondary panel widgets (balances, upcoming events, trending tags). | Fixed width (280-360px) or collapsible, vertical card layout, fluid height. |
| **`main`** | `main` | Full-page / tabbed applications (custom client views, chat threads, media galleries). | Fluid width & height, primary viewport focus, replaces or tabs alongside default feed. |
| **`widget`** | Custom slots | Floating cards, dashboard tiles, or contextual note decorations. | Slot-in anywhere the host or user configures a custom widget container. |

---

## 4. Multi-Component Plugin Manifest Declaration

A single plugin can contribute multiple distinct components across different slots within `omni.manifest.json`:

```json
{
  "$schema": "https://omni.run/schema/v1/manifest.json",
  "id": "org.omni.plugins.checklist",
  "name": "Daily Checklist",
  "version": "1.0.0",
  "entry": "dist/plugin.js",

  "components": [
    {
      "id": "checklist-dock-icon",
      "type": "icon",
      "title": "Daily Checklist",
      "slot": "dock",
      "defaultProps": { "showBadge": true }
    },
    {
      "id": "checklist-sidebar-widget",
      "type": "sidebar",
      "title": "Today Tasks",
      "slot": "sidebar"
    },
    {
      "id": "checklist-main-dashboard",
      "type": "main",
      "title": "Task Manager",
      "slot": "main"
    }
  ]
}
```

---

## 5. Standard HTML Rendering & Security Model

Omni avoids proprietary `<ui-*>` components. Plugins write standard, familiar HTML (`<div>`, `<button>`, `<input>`, `<span>`, `<ul>`, `<li>`), rendered natively in the Host DOM with comprehensive security:

### 5.1. Security Guarantees
1. **Isolated Event Execution:** Event listeners (such as `button.addEventListener("click", ...)`) **never run in the host context**. When a user clicks a button in the Host, the host RemoteReceiver serializes an inert event message (`{ type: "event", targetId: 42, eventName: "click" }`) over `MessagePort`. The listener executes 100% inside the sandboxed iframe.
2. **Tag Allowlist:** The Host RemoteReceiver strictly enforces an allowed tag list (e.g. `div`, `span`, `p`, `button`, `input`, `label`, `ul`, `li`, `h1`-`h6`, `svg`). Executable or dangerous tags (`<script>`, `<iframe>`, `<object>`, `<embed>`, `<link>`) are completely blocked.
3. **No Ingestion of Inline Scripts:** Remote DOM passes properties as data values, completely preventing string-based XSS or `onclick="..."` injection.
4. **CSS Containment:** Slot containers enforce CSS containment (`contain: layout paint; position: relative; overflow: auto;`). Even if guest elements use `position: fixed`, they cannot escape the slot bounds or overlay the host UI.

### Design Token Inheritance & "Warm Paper Dark" Theme
Because Remote DOM projects elements directly into the Host's DOM tree:
* All host CSS variables defined in [09-design-system-and-tokens.md](09-design-system-and-tokens.md) (`--omni-bg-canvas`, `--omni-bg-surface`, `--omni-text-primary`, `--omni-accent-primary`, `--omni-radius-md`) are automatically inherited.
* Mode changes (Light/Dark mode) apply instantly to all plugin components without any IPC broadcast or manual re-styling.
* Font rendering, line heights, and smooth animations match the native default client perfectly.
