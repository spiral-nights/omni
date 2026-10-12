import { DOMRemoteReceiver } from "@remote-dom/core/receivers";

export const ALLOWED_HTML_ELEMENTS = [
  "div", "span", "p", "h1", "h2", "h3", "h4", "h5", "h6",
  "button", "input", "label", "form", "textarea", "select", "option",
  "ul", "ol", "li", "article", "section", "header", "footer", "nav",
  "svg", "path", "circle", "rect", "line", "polyline", "polygon",
  "img", "small", "strong", "em", "b", "i", "time", "blockquote"
];

export interface RemoteDomHostOptions {
  container: Element;
  componentId: string;
  onEvent: (componentId: string, data: { id: string; eventName: string; detail: any }) => void;
  allowedElements?: string[];
}

export class RemoteDomHost {
  private receiver: DOMRemoteReceiver;
  readonly componentId: string;
  readonly container: Element;
  private onEvent: (componentId: string, data: { id: string; eventName: string; detail: any }) => void;

  constructor(options: RemoteDomHostOptions) {
    this.container = options.container;
    this.componentId = options.componentId;
    this.onEvent = options.onEvent;

    const allowed = options.allowedElements || ALLOWED_HTML_ELEMENTS;

    // Apply CSS containment to slot container
    if (this.container instanceof HTMLElement) {
      this.container.style.position = "relative";
      const isCompact = this.container.closest("#dock-slot, #header-status-slot, #header-actions-slot");
      if (!isCompact) {
        this.container.style.contain = "layout paint";
        this.container.style.overflow = "auto";
      }
    }

    this.receiver = new DOMRemoteReceiver({
      root: this.container,
      elements: allowed
    });

    // Ensure form inputs (input, textarea, select) pass value/checked in event.detail
    // so DOMRemoteReceiver's handler (which passes event.detail) conveys input values
    if (this.container instanceof HTMLElement) {
      const enrichInputEvent = (e: Event) => {
        const target = e.target as any;
        if (target && ("value" in target || "checked" in target)) {
          try {
            Object.defineProperty(e, "detail", {
              value: {
                value: target.value !== undefined ? String(target.value) : "",
                checked: Boolean(target.checked)
              },
              configurable: true
            });
          } catch {}
        }
      };

      this.container.addEventListener("input", enrichInputEvent, true);
      this.container.addEventListener("change", enrichInputEvent, true);
    }
  }

  mutate(records: any[]): void {
    const wrappedRecords = records.map((rec) => {
      // Mutation 0 (MUTATION_TYPE_INSERT_CHILD): wrap all eventListeners in inserted tree
      if (rec[0] === 0 && rec[2]) {
        this.wrapNodeEventListeners(rec[2]);
        return rec;
      }

      // Mutation 3 (MUTATION_TYPE_UPDATE_PROPERTY) with updateType 3 (UPDATE_PROPERTY_TYPE_EVENT_LISTENER)
      if (rec[0] === 3 && rec[4] === 3) {
        const id = rec[1];
        const property = rec[2];
        const value = rec[3];
        if (value && typeof value !== "function") {
          const listener = (detail: any) => {
            this.onEvent(this.componentId, {
              id,
              eventName: property,
              detail
            });
          };
          return [3, id, property, listener, 3];
        }
      }
      return rec;
    });

    const filteredRecords: any[] = [];
    for (const rec of wrappedRecords) {
      // Intercept property mutations (type 3) targeting ROOT_ID ("~" or "0")
      // DOMRemoteReceiver doesn't index ROOT_ID in its attached map and throws on property updates
      if (rec[0] === 3 && (rec[1] === "~" || rec[1] === "0")) {
        const property = rec[2];
        const value = rec[3];
        const type = rec[4];
        if (this.container instanceof HTMLElement) {
          if (type === 2) {
            // Attribute update
            if (value === null || value === undefined) {
              this.container.removeAttribute(property);
            } else {
              if (property === "class") {
                const classes = String(value).split(/\s+/).filter(Boolean);
                for (const cls of classes) {
                  this.container.classList.add(cls);
                }
              } else {
                this.container.setAttribute(property, String(value));
              }
            }
          } else if (type === 1) {
            // Property update
            (this.container as any)[property] = value;
          }
        }
        continue;
      }
      filteredRecords.push(rec);
    }

    const SVG_TAGS = new Set(["svg", "path", "circle", "rect", "line", "polyline", "polygon", "g"]);
    let origCreate: any = null;
    if (typeof document !== "undefined") {
      origCreate = document.createElement.bind(document);
      document.createElement = function (tagName: string, options?: any) {
        if (SVG_TAGS.has(tagName.toLowerCase())) {
          return document.createElementNS("http://www.w3.org/2000/svg", tagName);
        }
        return origCreate(tagName, options);
      };
    }

    // Ensure all insertChild (0) operations are executed before updateProperty (3)
    filteredRecords.sort((a, b) => {
      const orderA = a[0] === 0 ? 0 : 1;
      const orderB = b[0] === 0 ? 0 : 1;
      return orderA - orderB;
    });

    try {
      this.receiver.connection.mutate(filteredRecords);
    } catch (err) {
      console.error(`Remote DOM mutation error in [${this.componentId}]:`, err);
    } finally {
      if (origCreate && typeof document !== "undefined") {
        document.createElement = origCreate;
      }
    }
  }

  call(id: string, method: string, args: any[] = []): any {
    try {
      return this.receiver.connection.call(id, method, ...args);
    } catch (err) {
      console.error(`Remote DOM method call error in [${this.componentId}]:`, err);
    }
  }

  private wrapNodeEventListeners(node: any): void {
    if (!node || typeof node !== "object") return;
    if (node.eventListeners && typeof node.eventListeners === "object") {
      const id = node.id;
      for (const eventName of Object.keys(node.eventListeners)) {
        const val = node.eventListeners[eventName];
        if (typeof val !== "function") {
          node.eventListeners[eventName] = (detail: any) => {
            this.onEvent(this.componentId, {
              id,
              eventName,
              detail
            });
          };
        }
      }
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        this.wrapNodeEventListeners(child);
      }
    }
  }

  destroy(): void {
    this.receiver.disconnect();
  }
}

