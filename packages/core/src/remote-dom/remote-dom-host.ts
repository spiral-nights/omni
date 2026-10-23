import { DOMRemoteReceiver } from "@remote-dom/core/receivers";

export const ALLOWED_HTML_ELEMENTS = [
  "div", "span", "p", "h1", "h2", "h3", "h4", "h5", "h6",
  "button", "input", "label", "form", "textarea", "select", "option",
  "ul", "ol", "li", "article", "section", "header", "footer", "nav",
  "svg", "path", "circle", "rect", "line", "polyline", "polygon",
  "img", "small", "strong", "em", "b", "i", "time", "blockquote",
  "a", "code", "pre"
];

export interface RemoteDomHostOptions {
  container: Element;
  componentId: string;
  onEvent: (componentId: string, data: { id: string; eventName: string; detail: any }) => void;
  allowedElements?: string[];
  useShadowDom?: boolean;
}

export class RemoteDomHost {
  private receiver: DOMRemoteReceiver;
  readonly componentId: string;
  readonly container: Element;
  readonly renderRoot: Element | ShadowRoot;
  private onEvent: (componentId: string, data: { id: string; eventName: string; detail: any }) => void;
  private clickHandled = false;

  constructor(options: RemoteDomHostOptions) {
    this.container = options.container;
    this.componentId = options.componentId;
    this.onEvent = (componentId, data) => {
      this.clickHandled = true;
      if (data.detail && Array.isArray(data.detail.__omniRawFiles)) {
        const rawFiles = data.detail.__omniRawFiles;
        Promise.all(
          rawFiles.map(async (f: any) => {
            let bytes: Uint8Array;
            if (f.bytes instanceof Uint8Array) {
              bytes = f.bytes;
            } else if (typeof f.arrayBuffer === "function") {
              const ab = await f.arrayBuffer();
              bytes = new Uint8Array(ab);
            } else {
              bytes = new Uint8Array(0);
            }
            return {
              name: f.name || "file",
              size: f.size ?? bytes.byteLength,
              type: f.type || "application/octet-stream",
              bytes
            };
          })
        ).then((serializedFiles) => {
          const cleanDetail = { ...data.detail, files: serializedFiles };
          delete cleanDetail.__omniRawFiles;
          options.onEvent(componentId, { ...data, detail: cleanDetail });
        }).catch(() => {
          options.onEvent(componentId, data);
        });
        return;
      }
      options.onEvent(componentId, data);
    };

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

    if (options.useShadowDom && typeof this.container.attachShadow === "function") {
      this.renderRoot = this.container.shadowRoot || this.container.attachShadow({ mode: "open" });
      if (typeof document !== "undefined") {
        const baseStyle = document.createElement("style");
        baseStyle.textContent = `:host { display: block; width: 100%; height: 100%; box-sizing: border-box; } * { box-sizing: border-box; }`;
        this.renderRoot.appendChild(baseStyle);
      }
    } else {
      this.renderRoot = this.container;
    }

    this.receiver = new DOMRemoteReceiver({
      root: this.renderRoot as any,
      elements: allowed
    });

    // Ensure form inputs (input, textarea, select) pass value/checked in event.detail
    // so DOMRemoteReceiver's handler (which passes event.detail) conveys input values
    const targetRoot = this.renderRoot;
    const enrichInputEvent = (e: Event) => {
      const target = e.target as any;
      if (target && ("value" in target || "checked" in target || "files" in target)) {
        try {
          const detailVal: Record<string, any> = {
            value: target.value !== undefined ? String(target.value) : "",
            checked: Boolean(target.checked)
          };
          if (target.files && target.files.length > 0) {
            detailVal.__omniRawFiles = Array.from(target.files);
          }
          Object.defineProperty(e, "detail", {
            value: detailVal,
            configurable: true
          });
        } catch {}
      }
    };

    targetRoot.addEventListener("input", enrichInputEvent, true);
    targetRoot.addEventListener("change", enrichInputEvent, true);

    targetRoot.addEventListener("dragover", (e: Event) => {
      e.preventDefault();
    }, true);

    targetRoot.addEventListener("drop", (e: any) => {
      e.preventDefault();
      this.clickHandled = false;
      const rawFiles = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
      try {
        Object.defineProperty(e, "detail", {
          value: { __omniRawFiles: rawFiles },
          configurable: true
        });
      } catch {}
    }, true);

    targetRoot.addEventListener("drop", (e: any) => {
      if (this.clickHandled) return;
      const rawFiles = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : (e.detail?.__omniRawFiles || []);
      let el = (e.target as Element | null)?.parentElement || null;
      while (el && el !== targetRoot && !this.clickHandled) {
        const retargeted = new CustomEvent("drop", {
          detail: { __omniRawFiles: rawFiles },
          bubbles: false
        });
        el.dispatchEvent(retargeted);
        el = el.parentElement;
      }
    });

    const enrichKeyboardEvent = (e: KeyboardEvent) => {
      const target = e.target as any;
      try {
        Object.defineProperty(e, "detail", {
          value: {
            key: e.key,
            code: e.code,
            keyCode: e.keyCode,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            ctrlKey: e.ctrlKey,
            metaKey: e.metaKey,
            value: target?.value !== undefined ? String(target.value) : ""
          },
          configurable: true
        });
      } catch {}
    };

    targetRoot.addEventListener("keydown", enrichKeyboardEvent as any, true);
    targetRoot.addEventListener("keyup", enrichKeyboardEvent as any, true);
    targetRoot.addEventListener("keypress", enrichKeyboardEvent as any, true);

    // DOMRemoteReceiver only fires a remote listener when `event.target === element`
    targetRoot.addEventListener("click", () => {
      this.clickHandled = false;
    }, true);
    targetRoot.addEventListener("click", (e: Event) => {
      if (this.clickHandled) return;
      let el = (e.target as Element | null)?.parentElement || null;
      while (el && el !== targetRoot && !this.clickHandled) {
        const retargeted = new CustomEvent("click", { detail: {}, bubbles: false });
        el.dispatchEvent(retargeted);
        el = el.parentElement;
      }
    });
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

    // Ensure all structural DOM operations (0: insertChild, 1: removeChild, 2: updateText)
    // are executed before property updates (3: updateProperty), while strictly preserving
    // the relative sequence of structural operations so child indices remain consistent.
    filteredRecords.sort((a, b) => {
      const orderA = a[0] === 3 ? 1 : 0;
      const orderB = b[0] === 3 ? 1 : 0;
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
    try {
      this.receiver.disconnect();
    } catch {}
  }
}

