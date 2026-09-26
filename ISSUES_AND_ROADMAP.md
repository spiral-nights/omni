# Omni — Issues & Enhancement Roadmap

This document tracks identified UX, architectural, and functional issues in the Omni MVP, along with planned fixes and implementation specifications.

---

## Issue Tracker Matrix

| ID | Issue | Category | Severity | Status |
| :--- | :--- | :--- | :--- | :--- |
| **ISSUE-01** | Replace playful emoji icons with refined monochrome SVG line icons | UI/Aesthetic | High | 📋 Open |
| **ISSUE-02** | Plugin lifecycle: Add/remove plugins & granular permission toggling | Plugin Engine | Critical | 📋 Open |
| **ISSUE-03** | Profile & Identity management view (kind-0 metadata & key custody) | Identity / Nostr | High | 📋 Open |
| **ISSUE-04** | Dynamic Layout & Slot Customization UI (slot mapping per page/section) | Layout / Runtime | Critical | 📋 Open |
| **ISSUE-05** | Relay Pool Inspector & Management (connection status, add/remove) | Networking / Nostr | High | 📋 Open |
| **ISSUE-06** | "Widgets" button interaction failure & desktop sidebar collapse | UX / Navigation | High | 📋 Open |

---

## Detailed Issue Analysis & Remediation Plans

### ISSUE-01: Refined Minimalist Iconography (Remove Emojis)
* **Problem Statement:** The current interface relies on colorful Unicode emojis (`☑️`, `⏱️`, `🧩`, `💬`, `📋`, `⚙️`, `❤️`, `🏠`) which clash with the tactful "Warm Paper Dark" / e-ink aesthetic (`#141312` graphite, `#ede8df` warm ivory, `#d4a373` sandstone).
* **Target Aesthetic:** Clean, geometric 1.5px monochrome SVG line icons that inherit `currentColor` and adopt sandstone accent styling when active.
* **Scope of Changes:**
  1. Create an inline SVG icon library (`apps/web/src/icons.ts`) containing:
     - `FeedIcon` (clean speech bubble / post line)
     - `WidgetsIcon` (split view / layout tiles)
     - `PluginsIcon` (clean puzzle / plug glyph)
     - `SettingsIcon` (minimal gear / sliders)
     - `ProfileIcon` (user silhouette)
     - `ChecklistIcon` (minimal checklist square)
     - `TimerIcon` (minimal clock / stop-timer)
     - `RelayIcon` (radio antenna / mesh nodes)
     - `CloseIcon`, `AddIcon`, `TrashIcon`, `CopyIcon`, `LockIcon`
  2. Update plugins (`@omni/plugin-checklist`, `@omni/plugin-timer`) to use SVG line vectors rather than emoji characters.
  3. Update web client shell, composer buttons, note reaction counters, and dock navigation.

---

### ISSUE-02: Plugin Lifecycle & Granular Permission Controls
* **Problem Statement:** Users currently cannot install third-party plugins by URL or manifest, cannot uninstall/disable plugins, and cannot view or toggle individual permission grants (e.g., granting `storage:kv` while denying `nostr:write`).
* **Technical Remediation:**
  1. **Plugin Installation:** Provide an "Install Plugin" dialog accepting a manifest JSON URL or direct manifest payload.
  2. **Enable / Disable State:** Persist an `enabled: boolean` state per plugin in `CapabilityStore`. Disabled plugins are immediately unmounted from slots and their sandboxes destroyed.
  3. **Granular Permission Manager:**
     - Interactive permission toggles for each declared permission:
       - `nostr:read` (Allow subscription to notes & events)
       - `nostr:write` (Allow prompt-less signing of specific kinds)
       - `storage:kv` (IndexedDB persistent storage with quota limit)
       - `intents:dispatch` / `intents:handle` (Cross-plugin intent routing)
     - Revocation immediately invalidates capability tokens in `AclEngine`.
  4. **Uninstall / Wipe:** Remove plugin sandbox, revoke all capabilities, and purge scoped IndexedDB KV data.

---

### ISSUE-03: Profile & Identity Management
* **Problem Statement:** There is no profile view to manage identity, view full public/private keys, edit kind-0 metadata, or switch/export accounts.
* **Technical Remediation:**
  1. **Profile Navigation / View:** Add a dedicated Profile tab or modal accessible via the header user badge.
  2. **Key Custody & Export:**
     - Display `npub` (bech32) and full hex public key with 1-click copy.
     - Secure "Reveal Private Key (`nsec`)" with password/confirmation barrier.
     - "Import Account" (`nsec` or 12-word mnemonic) to switch from temporary guest key to existing Nostr identity.
  3. **Nostr Kind-0 Metadata Editor:**
     - Display and edit profile fields: Display Name, Name/Handle (`@name`), About/Bio, Picture URL, NIP-05 identifier, and Lightning Address (`lud16`).
     - Publish signed kind-0 event to connected relays and cache in local `LocalEventStore`.

---

### ISSUE-04: Dynamic Layout & Slot Customization Engine
* **Problem Statement:** Plugin components are hardcoded into default slots. Users cannot choose which components appear where, nor can they attach widgets to different pages, sections, or slots (e.g. placing the checklist in the dock, main viewport, or sidebar).
* **Technical Remediation:**
  1. **Slot Registry & Layout Store:**
     - Introduce `LayoutStore` (persisted in IndexedDB) tracking slot assignments:
       ```ts
       interface SlotMapping {
         slotId: "dock" | "sidebar" | "main-feed-header" | "main-feed-footer";
         componentId: string; // e.g. "checklist-dock-icon"
         pluginId: string;
         order: number;
         enabled: boolean;
       }
       ```
  2. **Slot Customizer UI:**
     - Provide a visual "Customize Layout" mode:
       - Each slot displays an "Add Widget (+)" button.
       - A drawer/modal shows all registered components from installed plugins.
       - Drag, re-order, or remove components from any slot.
  3. **Multi-Slot Dynamic Mounting:**
     - `OmniKernel` dynamically mounts and unmounts `RemoteDomHost` instances when slot assignments change without needing a full page reload.

---

### ISSUE-05: Relay Pool Visibility & Management
* **Problem Statement:** The header only displays a static status pill. Users cannot inspect which relays they are connected to, view connection states, latency, or add/remove relays.
* **Technical Remediation:**
  1. **Relay Manager Modal / Drawer:**
     - Clicking the Relay pill opens the Relay Manager view.
     - Lists all active relays (e.g. `wss://relay.damus.io`, `wss://nos.lol`, `wss://relay.nostr.band`).
     - Real-time connection indicators (🟢 Connected, 🟡 Connecting, 🔴 Disconnected) and round-trip ping latency.
  2. **Relay Controls:**
     - "Add Relay" input field with URL validation.
     - Toggle Read vs. Write permissions per relay (NIP-65 gossip readiness).
     - Remove relay button.
     - "Reconnect All" action.
  3. **Relay Persistence:**
     - Save user relay list in `localStorage` / IndexedDB and publish as NIP-65 relay list event (kind 10002).

---

### ISSUE-06: "Widgets" Button Interaction Failure & Desktop Sidebar Collapse
* **Problem Statement:** The "Widgets" button in the dock does nothing when clicked.
* **Root Cause Analysis:**
  1. **CSS Breakpoint Conflict:** In `apps/web/src/style.css`, media query `@media (min-width: 768px)` sets `.mobile-drawer-sheet, .mobile-drawer-overlay { display: none !important; }`. On standard desktop resolutions, clicking "Widgets" toggles classes on a hidden element.
  2. **Deferred Event Binding:** In `apps/web/src/main.ts`, the click listener for `dockBtnWidgets` was placed at the end of the async `startApp()` function. If initialization had any async latency, click events were missed.
  3. **Desktop Visibility:** On desktop screens, widgets reside in `.desktop-sidebar` on the right side of the screen, but there is no toggle button or collapse state for the desktop sidebar.
* **Remediation Plan:**
  1. Move all DOM event bindings to top-level synchronous execution on page load.
  2. Implement unified widget visibility logic:
     - On mobile (`< 768px`): "Widgets" opens the pull-up drawer sheet.
     - On desktop (`>= 768px`): "Widgets" toggles the desktop sidebar visibility (expand / collapse), with a subtle slide transition.
  3. Ensure active visual indicator on the Widgets button when drawer or sidebar is open.
