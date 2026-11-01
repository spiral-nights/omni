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

    renderer.destroy();
  });
});
