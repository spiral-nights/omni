# 09. Design System & Aesthetic Specification ("Warm Paper Dark")

## 1. Aesthetic Philosophy: Editorial & Warm Paper Dark

Omni avoids aggressive glowing neons, cold blue-grays, and glossy surfaces. Instead, it adopts a **tactile, distraction-free "warm paper dark" aesthetic** inspired by e-ink displays, high-end print typography, and dark parchment notebooks.

### Design Principles:
1. **Calm & Editorial:** High contrast without eye fatigue. Generous line heights, clean humanist typography, and intentional whitespace.
2. **Tactile Ink & Paper:** Surfaces feel like heavy matte card stock. Borders mimic fine pencil or ink rules rather than digital drop-shadows.
3. **Understated Warm Accents:** Interactive elements use natural sandstone, warm brass, and clay accents instead of electric purples or blues.
4. **Mobile-First Responsive Layout:** Designed primarily for one-handed mobile navigation with fixed bottom docks and gesture-friendly sheets, scaling gracefully to tablet and desktop viewports.

---

## 2. Core Color Palette & Design Tokens

```css
:root {
  /* Surface & Canvas (Dark Ink & Warm Paper) */
  --omni-bg-canvas: #141312;       /* Root viewport background */
  --omni-bg-surface: #191816;      /* Primary cards, note composer, header */
  --omni-bg-elevated: #22201d;     /* Elevated drawer sheet, hover cards */
  --omni-bg-subtle: #2a2824;       /* Input backgrounds, secondary pills */

  /* Text & Ink (Parchment & Warm Ivory) */
  --omni-text-primary: #ede8df;    /* High-contrast headings and body text */
  --omni-text-secondary: #a8a29e;  /* Timestamps, handles (@alice), captions */
  --omni-text-muted: #78716c;      /* Subtle placeholders, metadata */

  /* Borders & Dividers (Pencil & Ink Rules) */
  --omni-border-subtle: #272522;   /* Note dividers, light separators */
  --omni-border-strong: #383530;   /* Card borders, input outlines */
  --omni-border-focus: #c89666;    /* Active focus rings */

  /* Accents & Brand (Sandstone, Amber, Clay) */
  --omni-accent-primary: #d4a373;  /* Primary action buttons, active tabs */
  --omni-accent-hover: #c89666;    /* Button hover state */
  --omni-accent-contrast: #141312; /* Text on primary accent buttons */
  
  /* Status & Indicators */
  --omni-status-online: #4ade80;   /* Relay connected indicator */
  --omni-status-badge: #d4a373;    /* Dock badge counter */

  /* Typography */
  --omni-font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --omni-font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Corner Radii (Tactile Softness) */
  --omni-radius-sm: 6px;
  --omni-radius-md: 10px;
  --omni-radius-lg: 16px;
  --omni-radius-pill: 9999px;
}
```

---

## 3. Mobile-First Layout Architecture

```
+-------------------------------------------------------------+
|  Omni                         (•) Connected             (O) |  <- Header (48px)
+-------------------------------------------------------------+
|  [What is on your mind?                            Publish] |  <- Note Composer (72px)
+-------------------------------------------------------------+
|                                                             |
|  @user1 • 2m                                                |
|  Exciting Omni updates coming! #Nostr                       |
|  [Reply]   [Repost]   [Like]                                |
|  ---------------------------------------------------------  |  <- Timeline Feed
|  @user2 • 15m                                               |
|  Testing Remote DOM widgets inside sandboxes.               |
|  [Reply]   [Repost]   [Like]                                |
|                                                             |
+-------------------------------------------------------------+
|    [Home]         [Checklist(3)]      [Timer(25m)]    [Set] |  <- Bottom Dock (56px)
+-------------------------------------------------------------+
```

### Breakpoint Scaling:
1. **Mobile (< 768px):**
   * Feed and Composer occupy 100% width.
   * Fixed bottom navigation dock with four primary slots (`Home`, `Checklist`, `Timer`, `Settings`).
   * Tapping a plugin in the dock opens an elevated bottom-sheet drawer (`--omni-bg-elevated`) containing the Remote DOM widget.
2. **Tablet & Desktop (>= 768px):**
   * Dock shifts to a vertical rail on the left.
   * Feed remains centered at a readable max-width (640px).
   * Sidebar slot opens on the right (340px) displaying active widgets persistently side-by-side.

---

## 4. Host Styling for Standard HTML in Slots

The Host applies scoped CSS styling to all standard HTML elements projected into slot containers (`.omni-slot`):

| Standard HTML Element | Default Styling | Behavior |
| :--- | :--- | :--- |
| `<div>`, `<section>`, `<article>` | Inherits `--omni-bg-surface`, border rules, `--omni-radius-md`. | Structural widget container. |
| `<button>` | Background `--omni-accent-primary`, color `--omni-accent-contrast`, radius `--omni-radius-sm`. | Touch-friendly button (min-height 38px). |
| `<input type="text">` | Background `--omni-bg-subtle`, border `--omni-border-subtle`, text `--omni-text-primary`. | Native text input with warm placeholder. |
| `<input type="checkbox">` | Native checkbox styled with `accent-color: var(--omni-accent-primary)`. | Accessible, responsive toggle. |
| `<span>`, `<p>`, `<h1>`-`<h6>` | Text `--omni-text-primary`, `--omni-font-sans`, high legibility. | Typography hierarchy. |
| `<ul>`, `<ol>`, `<li>` | Reset list style with custom padding and warm divider lines. | Task lists and menus. |
