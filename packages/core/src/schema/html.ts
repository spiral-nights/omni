/**
 * Lightweight, zero-dependency tagged template helper for building safe,
 * reactive DOM elements without heavy runtime frameworks or vulnerable innerHTML.
 */

export type HtmlTemplateValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Node
  | Node[]
  | ((e: Event) => void)
  | Record<string, any>;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function html(
  strings: TemplateStringsArray,
  ...values: HtmlTemplateValue[]
): HTMLElement | DocumentFragment {
  const eventHandlers: Array<{ placeholder: string; eventName: string; handler: (e: Event) => void }> = [];
  const nodeSlots: Array<{ placeholder: string; nodes: Node[] }> = [];

  let htmlString = "";

  for (let i = 0; i < strings.length; i++) {
    htmlString += strings[i];
    if (i < values.length) {
      const val = values[i];

      // 1. Function passed as event handler (e.g. onclick=${fn})
      if (typeof val === "function") {
        const lastPart = strings[i];
        const match = lastPart.match(/on([a-zA-Z]+)\s*=\s*["']?$/);
        if (match) {
          const eventName = match[1].toLowerCase();
          const placeholderId = `__omni_ev_${Math.random().toString(36).slice(2, 9)}__`;
          eventHandlers.push({ placeholder: placeholderId, eventName, handler: val as (e: Event) => void });
          htmlString += placeholderId;
          continue;
        }
      }

      // 2. Node or Array of Nodes (e.g. <div>${iconElement}</div>)
      if (val instanceof Node || (Array.isArray(val) && val.length > 0 && val[0] instanceof Node)) {
        const nodes = val instanceof Node ? [val] : (val as Node[]);
        const slotId = `__omni_node_${Math.random().toString(36).slice(2, 9)}__`;
        nodeSlots.push({ placeholder: slotId, nodes });
        htmlString += `<span data-omni-slot="${slotId}"></span>`;
        continue;
      }

      // 3. Primitives
      if (val === null || val === undefined || val === false) {
        // do not render
      } else if (typeof val === "string") {
        // Check if inside an attribute or text content
        const lastPart = strings[i];
        if (lastPart.match(/=\s*["']?[^"'>]*$/)) {
          // Inside attribute
          htmlString += escapeHtml(val);
        } else {
          // Text content
          htmlString += escapeHtml(val);
        }
      } else {
        htmlString += String(val);
      }
    }
  }

  const template = document.createElement("template");
  template.innerHTML = htmlString.trim();
  const fragment = template.content;

  // Wire event handlers
  for (const { placeholder, eventName, handler } of eventHandlers) {
    const attrName = `on${eventName}`;
    const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_ELEMENT);
    let current: Node | null = walker.currentNode;
    while (current) {
      const el = current as HTMLElement;
      if (el.getAttribute && el.getAttribute(attrName) === placeholder) {
        el.removeAttribute(attrName);
        el.addEventListener(eventName, handler);
      }
      current = walker.nextNode();
    }
  }

  // Replace node slots with real DOM nodes
  for (const { placeholder, nodes } of nodeSlots) {
    const slot = fragment.querySelector(`span[data-omni-slot="${placeholder}"]`);
    if (slot && slot.parentNode) {
      const parent = slot.parentNode;
      for (const node of nodes) {
        parent.insertBefore(node, slot);
      }
      parent.removeChild(slot);
    }
  }

  if (fragment.children.length === 1) {
    return fragment.firstElementChild as HTMLElement;
  }
  return fragment;
}
