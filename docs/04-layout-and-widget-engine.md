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
|  | * Wallet Icon (P1) | * Active Main Plugin View (e.g. Chat/Map) | * Wallet Balance (P1)  |  |
|  | * Media App (P2)   |                                           | * Active Media Mini-Pl |  |
|  +--------------------+-------------------------------------------+------------------------+  |
|                                                  |                                            |
|                               RemoteReceiver per Slot Container                               |
|                                                  ^                                            |
|                                                  | Port 1 (Remote DOM Mutations)              |
|                                                  |                                            |
|  +-----------------------------------------------------------------------------------------+  |
|  |                              Isolated Sandbox (Iframe / Worker)                         |  |
|  |                                                                                         |  |
|  |  Plugin Bundle (e.g. Zap Wallet Plugin)                                                 |  |
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
* **Serialized UI Tree:** The plugin constructs virtual DOM elements (e.g., `<ui-card>`, `<ui-button>`, `<ui-badge>`, `<ui-text>`) via `@remote-dom/core`.
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
  "id": "org.nostr.wallet",
  "name": "Zap Wallet",
  "version": "1.0.0",
  "entry": "dist/plugin.js",

  "components": [
    {
      "id": "wallet-dock-icon",
      "type": "icon",
      "title": "Zap Wallet",
      "slot": "dock",
      "defaultProps": { "showBadge": true }
    },
    {
      "id": "wallet-sidebar-card",
      "type": "sidebar",
      "title": "Wallet Balance",
      "slot": "sidebar"
    },
    {
      "id": "wallet-main-history",
      "type": "main",
      "title": "Transactions & Lightning Channels",
      "slot": "main"
    }
  ]
}
```

---

## 5. Host Remote DOM Component Library

To enforce visual consistency and maintain security boundaries, the Host provides a standardized set of custom elements for guest plugins:

```html
<ui-card>
  <ui-header>
    <ui-icon name="zap"></ui-icon>
    <ui-text variant="heading">21,000 sats</ui-text>
  </ui-header>
  <ui-body>
    <ui-text variant="caption">Connected to Alby Bunker</ui-text>
    <ui-button variant="primary" id="btn-send">Send Zap</ui-button>
  </ui-body>
</ui-card>
```

### Design Token Inheritance
Because Remote DOM projects elements directly into the Host's DOM tree:
* All host CSS variables (`--color-background`, `--color-surface`, `--color-primary`, `--font-sans`, `--radius-md`) are automatically inherited.
* Mode changes (Light/Dark mode) apply instantly to all plugin components without any IPC broadcast or manual re-styling.
* Font rendering, line heights, and smooth animations match the native default client perfectly.
