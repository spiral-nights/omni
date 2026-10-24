import { DOMRemoteReceiver } from "@remote-dom/core/receivers";
import { scopeCss } from "./css-scoper.js";

export const ALLOWED_HTML_ELEMENTS = [
  "div", "span", "p", "h1", "h2", "h3", "h4", "h5", "h6",
  "button", "input", "label", "form", "textarea", "select", "option",
  "ul", "ol", "li", "article", "section", "header", "footer", "nav",
  "svg", "path", "circle", "rect", "line", "polyline", "polygon", "g",
  "img", "small", "strong", "em", "b", "i", "time", "blockquote",
  "a", "code", "pre", "style", "mark", "abbr", "cite", "sub", "sup", "del", "ins", "kbd", "s", "u",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td",
  "details", "summary", "hr", "br", "dl", "dt", "dd",
  "figure", "figcaption", "main", "aside", "canvas", "progress", "meter"
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
  private readonly scopeSelector: string;
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
              bytes: Array.from(bytes)
            };
          })
        ).then((serializedFiles) => {
          if (data.detail.__omniTargetInput) {
            try { data.detail.__omniTargetInput.value = ""; } catch {}
          }
          const cleanDetail = { ...data.detail, files: serializedFiles };
          delete cleanDetail.__omniRawFiles;
          delete cleanDetail.__omniTargetInput;
          options.onEvent(componentId, { ...data, detail: cleanDetail });
        }).catch(() => {
          options.onEvent(componentId, data);
        });
        return;
      }
      options.onEvent(componentId, data);
    };

    const allowed = options.allowedElements || ALLOWED_HTML_ELEMENTS;

    // Apply CSS containment and scoping attribute to slot container
    this.scopeSelector = `[data-omni-comp-id="${this.componentId}"]`;
    if (this.container instanceof HTMLElement) {
      this.container.setAttribute("data-omni-comp-id", this.componentId);
      const safeId = this.componentId.replace(/[^a-zA-Z0-9_-]/g, "-");
      this.container.classList.add(`omni-comp-${safeId}`);
      this.container.style.position = "relative";
      const isCompact = this.container.closest("#dock-slot, #header-status-slot, #header-actions-slot");
      if (!isCompact) {
        this.container.style.contain = "layout paint";
        this.container.style.overflow = "auto";
        this.container.style.width = "100%";
      }
    }

    if (options.useShadowDom && typeof this.container.attachShadow === "function") {
      this.renderRoot = this.container.shadowRoot || this.container.attachShadow({ mode: "open" });
      if (typeof document !== "undefined") {
        const baseStyle = document.createElement("style");
        baseStyle.textContent = `:host { display: block; width: 100%; height: 100%; box-sizing: border-box; } * { box-sizing: border-box; } style, script, head, title, meta, link { display: none !important; }`;
        this.renderRoot.appendChild(baseStyle);
      }
    } else {
      this.renderRoot = this.container;
      if (typeof document !== "undefined" && !document.getElementById("omni-nonvisual-protection")) {
        const nonVisStyle = document.createElement("style");
        nonVisStyle.id = "omni-nonvisual-protection";
        nonVisStyle.textContent = `style, script, head, title, meta, link, .omni-component-slot style, .editorial-app-container style, .omni-slot style { display: none !important; }`;
        document.head?.appendChild(nonVisStyle);
      }
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
            detailVal.__omniTargetInput = target;
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

    const enrichDragAndPointerEvent = (e: any) => {
      const target = e.target as HTMLElement | null;
      let targetRect: any = undefined;
      if (target && typeof target.getBoundingClientRect === "function") {
        try {
          const r = target.getBoundingClientRect();
          targetRect = { left: r.left, top: r.top, width: r.width, height: r.height };
        } catch {}
      }
      const rawFiles = e.dataTransfer?.files && e.dataTransfer.files.length > 0
        ? Array.from(e.dataTransfer.files)
        : e.detail?.files
        ? Array.from(e.detail.files)
        : e.detail?.__omniRawFiles || [];

      let dragData: Record<string, string> = {};
      if (e.dataTransfer) {
        try {
          if (e.dataTransfer.types) {
            for (const t of e.dataTransfer.types) {
              const val = e.dataTransfer.getData(t);
              if (val) dragData[t] = val;
            }
          }
        } catch {}
      }

      const touches = e.touches
        ? Array.from(e.touches).map((t: any) => ({
            clientX: t.clientX,
            clientY: t.clientY,
            pageX: t.pageX,
            pageY: t.pageY
          }))
        : undefined;

      const changedTouches = e.changedTouches
        ? Array.from(e.changedTouches).map((t: any) => ({
            clientX: t.clientX,
            clientY: t.clientY,
            pageX: t.pageX,
            pageY: t.pageY
          }))
        : undefined;

      const existingDetail = typeof e.detail === "object" && e.detail !== null ? e.detail : {};
      try {
        Object.defineProperty(e, "detail", {
          value: {
            ...existingDetail,
            clientX: e.clientX,
            clientY: e.clientY,
            pageX: e.pageX,
            pageY: e.pageY,
            screenX: e.screenX,
            screenY: e.screenY,
            targetRect,
            dragData,
            touches,
            changedTouches,
            __omniRawFiles: rawFiles
          },
          configurable: true
        });
      } catch {}
    };

    const dragPointerEvents = [
      "dragstart", "dragenter", "dragover", "dragleave", "drop", "dragend",
      "pointerdown", "pointermove", "pointerup", "pointercancel",
      "mousedown", "mousemove", "mouseup",
      "touchstart", "touchmove", "touchend", "touchcancel"
    ];
    for (const evName of dragPointerEvents) {
      targetRoot.addEventListener(evName, enrichDragAndPointerEvent, true);
    }

    targetRoot.addEventListener("dragenter", (e: any) => {
      e.preventDefault();
      if (e.dataTransfer) {
        try { e.dataTransfer.dropEffect = "copy"; } catch {}
      }
    }, true);

    targetRoot.addEventListener("dragover", (e: any) => {
      e.preventDefault();
      if (e.dataTransfer) {
        try { e.dataTransfer.dropEffect = "copy"; } catch {}
      }
    }, true);

    targetRoot.addEventListener("drop", (e: any) => {
      e.preventDefault();
      if (e.__omniRetargeted) return;
      this.clickHandled = false;
      const rawFiles = e.dataTransfer?.files && e.dataTransfer.files.length > 0
        ? Array.from(e.dataTransfer.files)
        : e.detail?.files
        ? Array.from(e.detail.files)
        : e.detail?.__omniRawFiles || [];
      try {
        Object.defineProperty(e, "detail", {
          value: { ...(e.detail || {}), __omniRawFiles: rawFiles },
          configurable: true
        });
      } catch {}
    }, true);

    targetRoot.addEventListener("drop", (e: any) => {
      if (this.clickHandled) return;
      const rawFiles = e.dataTransfer?.files && e.dataTransfer.files.length > 0
        ? Array.from(e.dataTransfer.files)
        : e.detail?.files
        ? Array.from(e.detail.files)
        : e.detail?.__omniRawFiles || [];
      let el = (e.target as Element | null)?.parentElement || null;
      while (el && el !== targetRoot && !this.clickHandled) {
        const retargeted: any = new CustomEvent("drop", {
          detail: { ...(e.detail || {}), __omniRawFiles: rawFiles },
          bubbles: false
        });
        retargeted.__omniRetargeted = true;
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
    targetRoot.addEventListener("click", (e: Event) => {
      this.clickHandled = false;
      const targetEl = e.target as Element | null;
      const triggerEl = targetEl?.closest?.("[data-file-input]");
      if (triggerEl) {
        const inputId = triggerEl.getAttribute("data-file-input");
        if (inputId) {
          const fileInput = targetRoot.querySelector(`#${inputId}`) as HTMLInputElement | null;
          if (fileInput && fileInput.type === "file") {
            fileInput.click();
          }
        }
      }
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
      // Mutation 0 (MUTATION_TYPE_INSERT_CHILD): wrap all eventListeners in inserted tree and scope styles
      if (rec[0] === 0 && rec[2]) {
        this.scopeNodeStyles(rec[2]);
        this.wrapNodeEventListeners(rec[2]);
        return rec;
      }

      // Mutation 2 (MUTATION_TYPE_UPDATE_TEXT): scope text if inside a <style> tag
      if (rec[0] === 2 && typeof rec[2] === "string") {
        const attachedMap = (this.receiver as any).attached as Map<string, Node> | undefined;
        const targetNode = attachedMap?.get(rec[1]);
        if (targetNode?.parentElement?.tagName === "STYLE" || targetNode?.parentNode?.nodeName === "STYLE") {
          rec[2] = scopeCss(rec[2], this.scopeSelector);
        }
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

      // Mutation 3: scope textContent or innerHTML if updating a <style> element
      if (rec[0] === 3 && (rec[2] === "textContent" || rec[2] === "innerHTML") && typeof rec[3] === "string") {
        const attachedMap = (this.receiver as any).attached as Map<string, Node> | undefined;
        const targetNode = attachedMap?.get(rec[1]);
        if (targetNode instanceof HTMLElement && targetNode.tagName === "STYLE") {
          rec[3] = scopeCss(rec[3], this.scopeSelector);
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

    const attachedMap = (this.receiver as any).attached as Map<string, Node> | undefined;

    try {
      for (const rec of filteredRecords) {
        // Mutation 1 (MUTATION_TYPE_REMOVE_CHILD): [1, parentId, index]
        if (rec[0] === 1) {
          const parentId = rec[1];
          const index = rec[2];
          const parent = (parentId === "~" || parentId === "0" || !parentId)
            ? (this.renderRoot as Node)
            : attachedMap?.get(parentId);

          if (!parent || !parent.childNodes || index < 0 || index >= parent.childNodes.length || !parent.childNodes[index]) {
            // Child is already detached or index is out of bounds; safe skip
            continue;
          }
        }

        // Mutation 0 (MUTATION_TYPE_INSERT_CHILD): [0, parentId, child, index]
        if (rec[0] === 0) {
          const parentId = rec[1];
          const parent = (parentId === "~" || parentId === "0" || !parentId)
            ? (this.renderRoot as Node)
            : attachedMap?.get(parentId);

          if (!parent) {
            // Parent target is not attached to DOM; safe skip
            continue;
          }
        }

        // Mutation 3 (MUTATION_TYPE_UPDATE_PROPERTY): [3, id, name, value, type]
        // When type === 2 (UPDATE_PROPERTY_TYPE_ATTRIBUTE), DOMRemoteReceiver strictly enforces
        // typeof value === 'string' or null. Convert booleans or other types safely.
        if (rec[0] === 3 && rec[4] === 2) {
          if (rec[3] === false || rec[3] === null || rec[3] === undefined) {
            rec[3] = null;
          } else if (rec[3] === true) {
            rec[3] = "";
          } else if (typeof rec[3] !== "string") {
            rec[3] = String(rec[3]);
          }
        }

        try {
          this.receiver.connection.mutate([rec]);
        } catch (recordErr) {
          console.warn(`Remote DOM non-fatal mutation record error in [${this.componentId}]:`, recordErr, rec);
        }
      }
    } catch (err) {
      console.error(`Remote DOM mutation error in [${this.componentId}]:`, err);
    } finally {
      if (origCreate && typeof document !== "undefined") {
        document.createElement = origCreate;
      }
      this.ensureRenderRootStylesScoped();
    }
  }

  private scopeNodeStyles(node: any): void {
    if (!node || typeof node !== "object") return;
    if (typeof node.element === "string" && node.element.toLowerCase() === "style") {
      if (Array.isArray(node.children)) {
        for (const c of node.children) {
          if (c.type === 3 && typeof c.data === "string") {
            c.data = scopeCss(c.data, this.scopeSelector);
          }
        }
      }
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        this.scopeNodeStyles(child);
      }
    }
  }

  private ensureRenderRootStylesScoped(): void {
    if (!this.renderRoot || typeof (this.renderRoot as any).querySelectorAll !== "function") return;
    try {
      const styleEls = (this.renderRoot as any).querySelectorAll("style");
      for (let i = 0; i < styleEls.length; i++) {
        const s = styleEls[i];
        if (!s.getAttribute("data-omni-scoped")) {
          const origText = s.textContent || "";
          if (origText) {
            s.textContent = scopeCss(origText, this.scopeSelector);
          }
          s.setAttribute("data-omni-scoped", "true");
        }
      }
    } catch (_) {}
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

