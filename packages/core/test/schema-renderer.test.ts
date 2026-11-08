// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SchemaRenderer } from "../src/schema/schema-renderer.js";
import { OmniComponentNode, OmniCardPrimitive } from "@omni/types";

describe("SchemaRenderer & Custom Web Components", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  it("renders a card with title, subtitle, icon, text and button", () => {
    const onAction = vi.fn();
    const renderer = new SchemaRenderer({ container, onAction });

    const schema: OmniCardPrimitive = {
      type: "card",
      title: "Daily Tasks",
      subtitle: "Workspace Companion",
      icon: "check",
      children: [
        {
          type: "text",
          content: "You have 3 pending tasks.",
          variant: "body",
          tone: "primary"
        },
        {
          type: "button",
          label: "Complete All",
          action: { name: "complete-all", payload: { count: 3 } }
        }
      ]
    };

    renderer.render(schema);

    const card = container.querySelector("omni-card");
    expect(card).not.toBeNull();

    const title = card?.querySelector(".omni-card-title");
    expect(title?.textContent).toBe("Daily Tasks");

    const subtitle = card?.querySelector(".omni-card-subtitle");
    expect(subtitle?.textContent).toBe("Workspace Companion");

    const textEl = card?.querySelector("omni-text");
    expect(textEl?.textContent).toBe("You have 3 pending tasks.");

    const btnWrapper = card?.querySelector("omni-button");
    const nativeBtn = btnWrapper?.querySelector("button");
    expect(nativeBtn).not.toBeNull();
    expect(nativeBtn?.textContent).toContain("Complete All");

    // Click button
    nativeBtn?.click();
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith(
      { name: "complete-all", payload: { count: 3 } },
      { count: 3 }
    );

    renderer.destroy();
  });

  it("captures form input and toggle state when an action is fired", () => {
    const onAction = vi.fn();
    const renderer = new SchemaRenderer({ container, onAction });

    const schema: OmniComponentNode = {
      type: "card",
      title: "Add Item",
      children: [
        {
          type: "input",
          name: "taskName",
          value: "Draft proposal",
          placeholder: "Enter task name..."
        },
        {
          type: "toggle",
          name: "isUrgent",
          label: "Urgent",
          checked: true,
          action: { name: "toggle-urgent" }
        },
        {
          type: "button",
          label: "Save Task",
          action: { name: "save-task" }
        }
      ]
    };

    renderer.render(schema);

    const btn = container.querySelector("omni-button button") as HTMLButtonElement;
    expect(btn).not.toBeNull();

    btn.click();

    expect(onAction).toHaveBeenCalledTimes(1);
    const [action, payload] = onAction.mock.calls[0];
    expect(action.name).toBe("save-task");
    expect(payload.taskName).toBe("Draft proposal");
    expect(payload.isUrgent).toBe(true);

    renderer.destroy();
  });

  it("renders a list with list-items and dispatches checkbox and click actions", () => {
    const onAction = vi.fn();
    const renderer = new SchemaRenderer({ container, onAction });

    const schema: OmniComponentNode = {
      type: "list",
      items: [
        {
          type: "list-item",
          id: "item-1",
          title: "Setup relays",
          subtitle: "wss://relay.damus.io",
          checked: false,
          onCheckAction: { name: "check-task", payload: { id: "item-1" } },
          onClickAction: { name: "open-item", payload: { id: "item-1" } }
        },
        {
          type: "list-item",
          id: "item-2",
          title: "Publish identity",
          checked: true,
          onCheckAction: { name: "check-task", payload: { id: "item-2" } }
        }
      ]
    };

    renderer.render(schema);

    const listEl = container.querySelector("omni-list");
    expect(listEl).not.toBeNull();

    const items = listEl?.querySelectorAll("omni-list-item");
    expect(items?.length).toBe(2);

    // Toggle checkbox on item 1
    const check1 = items?.[0].querySelector(".omni-list-item-checkbox") as HTMLInputElement;
    expect(check1).not.toBeNull();
    expect(check1.checked).toBe(false);

    check1.checked = true;
    check1.dispatchEvent(new Event("change", { bubbles: true }));

    expect(onAction).toHaveBeenCalledWith(
      { name: "check-task", payload: { id: "item-1" } },
      { id: "item-1", checked: true }
    );

    // Row click on item 1
    (items?.[0] as HTMLElement).click();
    expect(onAction).toHaveBeenCalledWith(
      { name: "open-item", payload: { id: "item-1" } },
      { id: "item-1" }
    );

    renderer.destroy();
  });

  it("renders metric and badge primitives with appropriate styling attributes", () => {
    const renderer = new SchemaRenderer({ container });

    const schema: OmniComponentNode = {
      type: "box",
      direction: "row",
      gap: "sm",
      children: [
        {
          type: "metric",
          label: "Active Relays",
          value: 8,
          trend: "up"
        },
        {
          type: "badge",
          label: "Connected",
          tone: "success",
          dot: true
        }
      ]
    };

    renderer.render(schema);

    const metric = container.querySelector("omni-metric");
    expect(metric?.getAttribute("trend")).toBe("up");
    expect(metric?.querySelector(".omni-metric-value")?.textContent).toBe("8");
    expect(metric?.querySelector(".omni-metric-label")?.textContent).toBe("Active Relays");

    const badge = container.querySelector("omni-badge");
    expect(badge?.getAttribute("tone")).toBe("success");
    expect(badge?.querySelector(".omni-badge-dot")).not.toBeNull();
    expect(badge?.querySelector(".omni-badge-label")?.textContent).toBe("Connected");

    renderer.destroy();
  });

  it("renders select, tabs, status-indicator, code-block, progress, and banner primitives", () => {
    const onAction = vi.fn();
    const renderer = new SchemaRenderer({ container, onAction });

    const schema: OmniComponentNode = {
      type: "box",
      direction: "column",
      children: [
        {
          type: "tabs",
          activeTab: "relays",
          tabs: [
            { id: "all", label: "All" },
            { id: "relays", label: "Active Relays", badge: 3 }
          ],
          action: { name: "switch-tab" }
        },
        {
          type: "select",
          name: "relayPreset",
          value: "damus",
          options: [
            { label: "Damus", value: "damus" },
            { label: "Ditto", value: "ditto" }
          ],
          action: { name: "select-preset" }
        },
        {
          type: "status-indicator",
          status: "online",
          label: "Connected to wss://relay.damus.io",
          pulse: true
        },
        {
          type: "code-block",
          code: JSON.stringify({ kind: 1, content: "Hello Nostr" }, null, 2),
          copyable: true
        },
        {
          type: "progress",
          value: 75,
          max: 100,
          label: "Syncing Events"
        },
        {
          type: "banner",
          tone: "info",
          title: "Notice",
          message: "Relay pool connected.",
          action: { name: "view-logs" },
          actionLabel: "View Logs",
          dismissible: true
        }
      ]
    };

    renderer.render(schema);

    // Verify tabs
    const tabsEl = container.querySelector("omni-tabs");
    expect(tabsEl).not.toBeNull();
    const tabButtons = tabsEl?.querySelectorAll(".omni-tab-btn");
    expect(tabButtons?.length).toBe(2);
    expect(tabButtons?.[1].classList.contains("active")).toBe(true);
    expect(tabButtons?.[1].textContent).toContain("Active Relays");
    expect(tabButtons?.[1].textContent).toContain("3");

    // Click first tab
    (tabButtons?.[0] as HTMLElement).click();
    expect(onAction).toHaveBeenCalledWith({ name: "switch-tab" }, { tabId: "all", value: "all" });

    // Verify select
    const selectEl = container.querySelector("omni-select");
    expect(selectEl).not.toBeNull();
    const nativeSelect = selectEl?.querySelector("select");
    expect(nativeSelect?.options.length).toBe(2);
    expect(nativeSelect?.value).toBe("damus");

    // Trigger select change
    nativeSelect!.value = "ditto";
    nativeSelect!.dispatchEvent(new Event("change"));
    expect(onAction).toHaveBeenCalledWith({ name: "select-preset" }, { relayPreset: "ditto", value: "ditto" });

    // Verify status indicator
    const statusEl = container.querySelector("omni-status-indicator");
    expect(statusEl).not.toBeNull();
    const dot = statusEl?.querySelector(".omni-status-dot");
    expect(dot?.classList.contains("omni-status-online")).toBe(true);
    expect(dot?.classList.contains("omni-pulse")).toBe(true);
    expect(statusEl?.querySelector(".omni-status-label")?.textContent).toBe("Connected to wss://relay.damus.io");

    // Verify code block
    const codeEl = container.querySelector("omni-code-block");
    expect(codeEl).not.toBeNull();
    expect(codeEl?.textContent).toContain("Hello Nostr");
    expect(codeEl?.querySelector(".omni-code-copy-btn")).not.toBeNull();

    // Verify progress
    const progressEl = container.querySelector("omni-progress");
    expect(progressEl).not.toBeNull();
    expect(progressEl?.querySelector(".omni-progress-label")?.textContent).toContain("Syncing Events (75%)");
    expect((progressEl?.querySelector(".omni-progress-bar") as HTMLElement)?.style.width).toBe("75%");

    // Verify banner
    const bannerEl = container.querySelector("omni-banner");
    expect(bannerEl).not.toBeNull();
    expect(bannerEl?.classList.contains("omni-banner-info")).toBe(true);
    expect(bannerEl?.querySelector(".omni-banner-title")?.textContent).toBe("Notice");
    expect(bannerEl?.querySelector(".omni-banner-message")?.textContent).toBe("Relay pool connected.");
    expect(bannerEl?.querySelector(".omni-banner-action-btn")?.textContent).toBe("View Logs");

    // Click banner action
    (bannerEl?.querySelector(".omni-banner-action-btn") as HTMLElement)?.click();
    expect(onAction).toHaveBeenCalledWith({ name: "view-logs" }, {});

    renderer.destroy();
  });

  it("renders circular visual disk progress with clock ticks and wedge arc", () => {
    const renderer = new SchemaRenderer({ container });

    renderer.render({
      type: "progress",
      variant: "disk",
      value: 15,
      max: 60,
      size: 260,
      label: "15:00",
      color: "#c85d3e",
      showTicks: true
    });

    const progressEl = container.querySelector("omni-progress");
    expect(progressEl).not.toBeNull();

    const svg = progressEl?.querySelector("svg.omni-progress-circular");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("viewBox")).toBe("0 0 100 100");

    // Has ticks lines
    const ticks = svg?.querySelectorAll("line");
    expect(ticks?.length).toBe(12);

    // Has path wedge arc
    const path = svg?.querySelector("path");
    expect(path).not.toBeNull();
    expect(path?.getAttribute("fill")).toBe("#c85d3e");

    // Has central label
    const text = svg?.querySelector("text");
    expect(text?.textContent?.trim()).toBe("15:00");

    renderer.destroy();
  });

  it("renders image URLs as clickable callout links by default, and as inline images when enabled", () => {
    const onAction = vi.fn();
    const renderer = new SchemaRenderer({ container, onAction });

    // 1. Default (links only): renders a .feed-media-callout anchor and NO img tag
    renderer.render({
      type: "card",
      children: [
        {
          type: "text",
          content: "Check this screenshot: https://blossom.ditto.pub/test-screenshot.png",
          variant: "body",
          showInlineImages: false
        }
      ]
    });

    const textEl = container.querySelector("omni-text");
    expect(textEl).not.toBeNull();
    const callout = textEl?.querySelector(".feed-media-callout.feed-image-link");
    expect(callout).not.toBeNull();
    expect(callout?.getAttribute("href")).toBe("https://blossom.ditto.pub/test-screenshot.png");
    expect(callout?.textContent).toContain("Image");
    expect(textEl?.querySelector("img")).toBeNull();

    // 2. When showInlineImages is true: renders an inline <img> element preview
    renderer.render({
      type: "card",
      children: [
        {
          type: "text",
          content: "Check this screenshot: https://blossom.ditto.pub/test-screenshot.png",
          variant: "body",
          showInlineImages: true
        }
      ]
    });

    const updatedTextEl = container.querySelector("omni-text");
    const imgEl = updatedTextEl?.querySelector("img");
    expect(imgEl).not.toBeNull();
    expect(imgEl?.getAttribute("src")).toBe("https://blossom.ditto.pub/test-screenshot.png");

    // 3. Video URLs: ALWAYS renders as a callout link and NEVER an inline video element
    renderer.render({
      type: "card",
      children: [
        {
          type: "text",
          content: "Watch clip: https://blossom.ditto.pub/test-video.mp4",
          variant: "body",
          showInlineImages: true
        }
      ]
    });

    const videoTextEl = container.querySelector("omni-text");
    const videoCallout = videoTextEl?.querySelector(".feed-media-callout.feed-video-link");
    expect(videoCallout).not.toBeNull();
    expect(videoCallout?.getAttribute("href")).toBe("https://blossom.ditto.pub/test-video.mp4");
    expect(videoCallout?.textContent).toContain("Video");
    expect(videoTextEl?.querySelector("video")).toBeNull();

    renderer.destroy();
  });

  describe("DOM Reconciliation & Morphing Engine", () => {
    it("preserves element identity across renders when updating properties", () => {
      const renderer = new SchemaRenderer({ container });

      renderer.render({
        type: "card",
        id: "main-card",
        title: "Initial Title",
        children: [
          { type: "text", id: "status-text", content: "Initial content" }
        ]
      });

      const cardBefore = container.querySelector("omni-card");
      const textBefore = container.querySelector("omni-text");
      expect(cardBefore).not.toBeNull();
      expect(textBefore).not.toBeNull();
      expect(cardBefore?.querySelector(".omni-card-title")?.textContent).toBe("Initial Title");
      expect(textBefore?.textContent).toBe("Initial content");

      // Re-render with modified content and title
      renderer.render({
        type: "card",
        id: "main-card",
        title: "Updated Title",
        children: [
          { type: "text", id: "status-text", content: "Updated content" }
        ]
      });

      const cardAfter = container.querySelector("omni-card");
      const textAfter = container.querySelector("omni-text");

      // Exact DOM reference equality: nodes were preserved, not destroyed!
      expect(cardAfter).toBe(cardBefore);
      expect(textAfter).toBe(textBefore);

      // Attributes patched in-place
      expect(cardAfter?.querySelector(".omni-card-title")?.textContent).toBe("Updated Title");
      expect(textAfter?.textContent).toBe("Updated content");

      renderer.destroy();
    });

    it("preserves active input focus and cursor during live updates", () => {
      const renderer = new SchemaRenderer({ container });

      renderer.render({
        type: "box",
        children: [
          { type: "input", name: "searchQuery", value: "nostr", placeholder: "Search..." },
          { type: "text", content: "Results: 0" }
        ]
      });

      const inputWrapper = container.querySelector("omni-input") as HTMLElement;
      const nativeInput = inputWrapper.querySelector("input") as HTMLInputElement;
      expect(nativeInput).not.toBeNull();

      // Simulate user focusing input
      nativeInput.focus();
      expect(document.activeElement).toBe(nativeInput);

      // Re-render when background search finishes (updating sibling text)
      renderer.render({
        type: "box",
        children: [
          { type: "input", name: "searchQuery", value: "nostr", placeholder: "Search..." },
          { type: "text", content: "Results: 42" }
        ]
      });

      const inputWrapperAfter = container.querySelector("omni-input");
      const nativeInputAfter = inputWrapperAfter?.querySelector("input");

      // Input was preserved and NOT re-created
      expect(inputWrapperAfter).toBe(inputWrapper);
      expect(nativeInputAfter).toBe(nativeInput);

      // Focus remained uninterrupted!
      expect(document.activeElement).toBe(nativeInput);
      expect(container.querySelector("omni-text")?.textContent).toBe("Results: 42");

      renderer.destroy();
    });

    it("intelligently prepends new items into a keyed list without destroying existing items", () => {
      const renderer = new SchemaRenderer({ container });

      // Initial list with 2 items
      renderer.render({
        type: "box",
        children: [
          { type: "card", id: "item-1", title: "First Note", children: [{ type: "text", content: "Note 1" }] },
          { type: "card", id: "item-2", title: "Second Note", children: [{ type: "text", content: "Note 2" }] }
        ]
      });

      const firstNoteBefore = container.querySelector("#item-1");
      const secondNoteBefore = container.querySelector("#item-2");
      expect(firstNoteBefore).not.toBeNull();
      expect(secondNoteBefore).not.toBeNull();

      // Prepend a third note at index 0
      renderer.render({
        type: "box",
        children: [
          { type: "card", id: "item-new", title: "Newest Note", children: [{ type: "text", content: "Note New" }] },
          { type: "card", id: "item-1", title: "First Note", children: [{ type: "text", content: "Note 1" }] },
          { type: "card", id: "item-2", title: "Second Note", children: [{ type: "text", content: "Note 2" }] }
        ]
      });

      const cards = container.querySelectorAll("omni-card");
      expect(cards.length).toBe(3);

      // First child is the newly inserted note
      expect(cards[0].id).toBe("item-new");
      expect(cards[0].querySelector(".omni-card-title")?.textContent).toBe("Newest Note");

      // Existing notes were re-used, preserving DOM instance identity!
      expect(cards[1]).toBe(firstNoteBefore);
      expect(cards[2]).toBe(secondNoteBefore);

      renderer.destroy();
    });

    it("supports structural positional matching when id or key is omitted", () => {
      const renderer = new SchemaRenderer({ container });

      renderer.render({
        type: "box",
        direction: "column",
        gap: "sm",
        children: [
          { type: "text", content: "Section Header" },
          { type: "divider" },
          { type: "button", label: "Submit" }
        ]
      });

      const initialText = container.querySelector("omni-text");
      const initialBtn = container.querySelector("omni-button");

      // Re-render with updated text and button label (no IDs provided)
      renderer.render({
        type: "box",
        direction: "column",
        gap: "sm",
        children: [
          { type: "text", content: "Updated Header" },
          { type: "divider" },
          { type: "button", label: "Saving..." }
        ]
      });

      const updatedText = container.querySelector("omni-text");
      const updatedBtn = container.querySelector("omni-button");

      // Re-used positionally
      expect(updatedText).toBe(initialText);
      expect(updatedBtn).toBe(initialBtn);

      expect(updatedText?.textContent).toBe("Updated Header");
      expect(updatedBtn?.textContent).toContain("Saving...");

      renderer.destroy();
    });

    it("cleans up removed children when new schema has fewer nodes", () => {
      const renderer = new SchemaRenderer({ container });

      renderer.render({
        type: "box",
        children: [
          { type: "text", id: "t1", content: "One" },
          { type: "text", id: "t2", content: "Two" },
          { type: "text", id: "t3", content: "Three" }
        ]
      });

      expect(container.querySelectorAll("omni-text").length).toBe(3);

      // Re-render with only 1 item
      renderer.render({
        type: "box",
        children: [
          { type: "text", id: "t2", content: "Two Updated" }
        ]
      });

      const remainingTexts = container.querySelectorAll("omni-text");
      expect(remainingTexts.length).toBe(1);
      expect(remainingTexts[0].id).toBe("t2");
      expect(remainingTexts[0].textContent).toBe("Two Updated");

      renderer.destroy();
    });

    it("renders virtual list primitive with spacer height and windowed slice", () => {
      const renderer = new SchemaRenderer({ container });

      // Generate 100 virtual list items
      const items = Array.from({ length: 100 }, (_, i) => ({
        type: "card" as const,
        id: `note-${i}`,
        title: `Note #${i}`,
        children: [{ type: "text" as const, content: `Content of note ${i}` }]
      }));

      renderer.render({
        type: "virtual-list",
        itemHeight: 80,
        overscan: 2,
        items
      });

      const vList = container.querySelector("omni-virtual-list") as HTMLElement;
      expect(vList).not.toBeNull();

      const spacer = vList.querySelector(".omni-virtual-list-spacer") as HTMLElement;
      expect(spacer).not.toBeNull();
      // Total virtual height is 100 items * 80px = 8000px
      expect(spacer.style.height).toBe("8000px");

      const viewport = vList.querySelector(".omni-virtual-list-viewport") as HTMLElement;
      expect(viewport).not.toBeNull();

      // Only windowed slice of cards is rendered in the DOM, far fewer than 100!
      const renderedCards = viewport.querySelectorAll("omni-card");
      expect(renderedCards.length).toBeGreaterThan(0);
      expect(renderedCards.length).toBeLessThan(30);

      // Verify first rendered card is note-0
      expect(renderedCards[0].id).toBe("note-0");

      renderer.destroy();
    });

    it("formats inline nostr entities into clickable entity badges with svg line icons", () => {
      const renderer = new SchemaRenderer({ container });

      // Valid Bech32 checksummed entities for 32-byte hex '00'.repeat(32)
      const testNpub = "npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzqujme";
      const testNote = "note1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqn2l0z3";

      renderer.render({
        type: "card",
        title: "Test Note",
        children: [
          {
            type: "text",
            content: `Hello ${testNpub}! Check out nostr:${testNote} for context.`
          }
        ]
      });

      const textEl = container.querySelector("omni-text");
      expect(textEl).not.toBeNull();

      // Check for inline entity links
      const links = textEl?.querySelectorAll("a.omni-nostr-entity");
      expect(links?.length).toBe(2);

      // Verify the links have proper protocol hrefs
      expect(links?.[0].getAttribute("href")).toBe(`nostr:${testNpub}`);
      expect(links?.[1].getAttribute("href")).toBe(`nostr:${testNote}`);

      // Verify monochrome SVG icons are embedded inside the entity pills
      expect(links?.[0].querySelector("svg")).not.toBeNull();
      expect(links?.[1].querySelector("svg")).not.toBeNull();

      renderer.destroy();
    });

    it("resets inline style on omni-box when updated without retaining obsolete properties", () => {
      const renderer = new SchemaRenderer({ container });

      // First render with custom background and negative margin
      renderer.render({
        type: "box",
        id: "styled-box",
        style: {
          background: "url(https://example.com/banner.jpg)",
          marginTop: "-20px"
        },
        children: []
      });

      const box = container.querySelector("#styled-box") as HTMLElement;
      expect(box).not.toBeNull();
      expect(box.style.marginTop).toBe("-20px");
      expect(box.style.background).toContain("url(");

      // Re-render the box without custom background or negative margin
      renderer.render({
        type: "box",
        id: "styled-box",
        style: {
          padding: "16px"
        },
        children: []
      });

      // Old styles must be cleared, not accumulated!
      expect(box.style.marginTop).toBe("");
      expect(box.style.background).toBe("");
      expect(box.style.padding).toBe("16px");

      renderer.destroy();
    });

    it("renders inline quote card for nevent/note with author and quoted content", async () => {
      const renderer = new SchemaRenderer({ container });

      // Valid Bech32 checksummed entities for 32-byte hex '00'.repeat(32)
      const testNoteHex = "00".repeat(32);
      const testNote = "note1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqn2l0z3";

      // Pre-register quoted note in event cache
      const { registerOmniEvent } = await import("../src/schema/components/primitive-elements.js");
      registerOmniEvent({
        id: testNoteHex,
        pubkey: "11".repeat(32),
        authorName: "Satoshi Nakamoto",
        content: "If you don't believe it or don't get it, I don't have the time to try to convince you, sorry."
      });

      renderer.render({
        type: "card",
        title: "Quote Repost Note",
        children: [
          {
            type: "text",
            content: `A legendary quote:\nnostr:${testNote}\nTimeless wisdom.`
          }
        ]
      });

      const textEl = container.querySelector("omni-text");
      expect(textEl).not.toBeNull();

      // Check that inline quote card is rendered
      const quoteCard = textEl?.querySelector(".omni-quote-card");
      expect(quoteCard).not.toBeNull();

      const authorEl = quoteCard?.querySelector(".omni-quote-author");
      expect(authorEl?.textContent).toBe("Satoshi Nakamoto");

      const badgeEl = quoteCard?.querySelector(".omni-quote-badge");
      expect(badgeEl?.textContent).toBe("Quoted Note");

      const contentEl = quoteCard?.querySelector(".omni-quote-content");
      expect(contentEl?.textContent).toContain("If you don't believe it");

      renderer.destroy();
    });

    it("renders caption with npub as plain text without pill box or duplicate name", async () => {
      const container = document.createElement("div");
      const renderer = new SchemaRenderer({ container });

      renderer.render({
        type: "card",
        title: "Profile Card",
        children: [
          {
            type: "text",
            content: "Connie",
            variant: "body",
            tone: "primary"
          },
          {
            type: "text",
            content: "npub103r3k4f999999999999999999999999999999999999999999999999999",
            variant: "caption",
            tone: "muted"
          }
        ]
      });

      const textEls = container.querySelectorAll("omni-text");
      expect(textEls.length).toBe(2);

      // Body text element
      expect(textEls[0].textContent).toBe("Connie");

      // Caption element must remain plain text, not converted to pill box or profile link
      expect(textEls[1].querySelector("a")).toBeNull();
      expect(textEls[1].textContent).toContain("npub103r3k4");
      expect(textEls[1].textContent).not.toContain("@@");

      renderer.destroy();
    });

    it("dispatches omni:request_event for uncached quote and updates quote card upon omni:event_cached", async () => {
      const { toBech32 } = await import("../src/crypto/bech32.js");
      const container = document.createElement("div");
      document.body.appendChild(container);
      const renderer = new SchemaRenderer({ container });

      const uncachedHex = "22".repeat(32);
      const uncachedNote = toBech32("note", uncachedHex);

      let requestedId = "";
      const onRequest = (e: Event) => {
        requestedId = (e as CustomEvent).detail?.id;
      };
      window.addEventListener("omni:request_event", onRequest);

      renderer.render({
        type: "card",
        title: "Uncached Quote",
        children: [
          {
            type: "text",
            content: `Check this: nostr:${uncachedNote}`
          }
        ]
      });

      const textEl = container.querySelector("omni-text");
      expect(textEl).not.toBeNull();

      const quoteCard = textEl?.querySelector(".omni-quote-card");
      expect(quoteCard).not.toBeNull();
      expect(quoteCard?.classList.contains("loading")).toBe(true);

      // Wait a microtask for async resolvePendingQuotes to query IndexedDB and dispatch omni:request_event
      await new Promise((r) => setTimeout(r, 30));
      expect(requestedId).toBe(uncachedHex);

      // Now simulate arrival of event via registerOmniEvent
      const { registerOmniEvent } = await import("../src/schema/components/primitive-elements.js");
      registerOmniEvent({
        id: uncachedHex,
        pubkey: "33".repeat(32),
        authorName: "@AliceInWonderland",
        content: "Down the rabbit hole!"
      });

      // Quote card should no longer be loading and authorName must have single @
      expect(quoteCard?.classList.contains("loading")).toBe(false);
      const authorEl = quoteCard?.querySelector(".omni-quote-author");
      expect(authorEl?.textContent).toBe("AliceInWonderland");
      expect(authorEl?.textContent).not.toContain("@@");

      const contentEl = quoteCard?.querySelector(".omni-quote-content");
      expect(contentEl?.textContent).toBe("Down the rabbit hole!");

      window.removeEventListener("omni:request_event", onRequest);
      renderer.destroy();
      container.remove();
    });
  });
});
