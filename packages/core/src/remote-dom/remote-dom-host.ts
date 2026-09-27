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
      this.container.style.contain = "layout paint";
      this.container.style.overflow = "auto";
    }

    this.receiver = new DOMRemoteReceiver({
      root: this.container,
      elements: allowed
    });
  }

  mutate(records: any[]): void {
    const wrappedRecords = records.map((rec) => {
      // Mutation 3 (MUTATION_TYPE_UPDATE_PROPERTY) with updateType 3 (UPDATE_PROPERTY_TYPE_EVENT_LISTENER)
      if (rec[0] === 3 && rec[4] === 3) {
        const id = rec[1];
        const property = rec[2];
        const value = rec[3];
        if (value) {
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

    try {
      this.receiver.connection.mutate(wrappedRecords);
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

  destroy(): void {
    this.receiver.disconnect();
  }
}

