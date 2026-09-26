// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { RemoteDomHost } from "../src/remote-dom/remote-dom-host.js";

describe("RemoteDomHost Standard HTML Projection", () => {
  it("projects standard HTML elements (div, button, input) into host container", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const onEvent = vi.fn();
    const host = new RemoteDomHost({
      container,
      componentId: "test-widget",
      onEvent
    });

    // Send Remote DOM mutation: Insert div with a button and input
    // Mutation 0: Insert child [0, parentId, serializedChild, index]
    host.mutate([
      [
        0,
        "~",
        {
          id: "node-1",
          type: 1,
          element: "div",
          attributes: { class: "widget-card" },
          children: [
            {
              id: "node-2",
              type: 1,
              element: "button",
              attributes: { class: "btn-action" },
              children: [
                {
                  id: "node-3",
                  type: 3,
                  data: "Click Me"
                }
              ]
            },
            {
              id: "node-4",
              type: 1,
              element: "input",
              attributes: { type: "text", placeholder: "Enter name..." },
              children: []
            }
          ]
        },
        0
      ]
    ]);

    // Verify DOM structure
    const widgetCard = container.querySelector(".widget-card");
    expect(widgetCard).not.toBeNull();
    expect(widgetCard?.tagName.toLowerCase()).toBe("div");

    const btn = widgetCard?.querySelector("button");
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toBe("Click Me");

    const input = widgetCard?.querySelector("input");
    expect(input).not.toBeNull();
    expect(input?.getAttribute("placeholder")).toBe("Enter name...");

    host.destroy();
  });

  it("intercepts click events on standard HTML buttons and routes back to sandbox callback", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const onEvent = vi.fn();
    const host = new RemoteDomHost({
      container,
      componentId: "checklist-widget",
      onEvent
    });

    // 1. Insert button
    host.mutate([
      [
        0,
        "~",
        {
          id: "btn-1",
          type: 1,
          element: "button",
          attributes: {},
          children: [{ id: "txt-1", type: 3, data: "Add Item" }]
        },
        0
      ]
    ]);

    // 2. Register click event listener on the button (Mutation 3 with type 3)
    host.mutate([
      [3, "btn-1", "click", true, 3]
    ]);

    const button = container.querySelector("button")!;
    expect(button).not.toBeNull();

    // Trigger click on host DOM element
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    // onEvent should have been invoked with componentId, id, eventName
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(
      "checklist-widget",
      expect.objectContaining({
        id: "btn-1",
        eventName: "click"
      })
    );

    host.destroy();
  });
});
