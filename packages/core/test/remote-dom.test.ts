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

  it("DEFAULT_OMNI_RUNTIME executes and creates remote elements without TypeError", async () => {
    const { DEFAULT_OMNI_RUNTIME } = await import("../src/sandbox/default-runtime.js");
    
    // Create an iframe to execute DEFAULT_OMNI_RUNTIME in a fresh window context
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const win = iframe.contentWindow as any;
    
    // Execute runtime script
    win.eval(DEFAULT_OMNI_RUNTIME);

    expect(win.omni).toBeDefined();
    expect(typeof win.omni.registerComponent).toBe("function");

    // Create MessageChannels to simulate handshake
    const channelDom = new MessageChannel();
    const channelRpc = new MessageChannel();

    let renderInvoked = false;
    let createdInputType = "";

    // Register a component that creates elements, sets types, classes, attributes
    win.omni.registerComponent("test-comp", ({ root }: any) => {
      renderInvoked = true;
      const input = root.createElement("input");
      input.type = "text";
      input.placeholder = "Enter value";
      input.className = "test-input";
      root.appendChild(input);
      createdInputType = input.type;
    });

    // Send omni:init handshake via MessageEvent with explicit ports
    const initEvent = new MessageEvent("message", {
      data: { type: "omni:init", payload: { pluginId: "test.plugin" } },
      ports: [channelDom.port2, channelRpc.port2]
    });
    win.dispatchEvent(initEvent);

    // Give microtasks time to execute
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(renderInvoked).toBe(true);
    expect(createdInputType).toBe("text");
    expect(win.omni.nostr).toBeDefined();
    expect(typeof win.omni.nostr.subscribe).toBe("function");
    expect(typeof win.omni.nostr.publish).toBe("function");
    expect(typeof win.omni.nostr.getPublicKey).toBe("function");
    expect(typeof win.omni.nostr.signEvent).toBe("function");

    document.body.removeChild(iframe);
  });

  it("handles ROOT_ID ('~') property mutations directly on container without throwing", () => {
    const container = document.createElement("div");
    container.className = "host-slot";
    document.body.appendChild(container);

    const onEvent = vi.fn();
    const host = new RemoteDomHost({
      container,
      componentId: "feed-dock-icon",
      onEvent
    });

    // Send property mutation on ROOT_ID ("~") which previously caused:
    // Error: Remote property is not allowed: class (type 2)
    expect(() => {
      host.mutate([
        [3, "~", "class", "omni-component-feed-dock-icon custom-active", 2],
        [3, "~", "data-status", "ready", 2]
      ]);
    }).not.toThrow();

    // Verify container received the class and attribute
    expect(container.classList.contains("omni-component-feed-dock-icon")).toBe(true);
    expect(container.classList.contains("custom-active")).toBe(true);
    expect(container.getAttribute("data-status")).toBe("ready");

    host.destroy();
    document.body.removeChild(container);
  });
});

