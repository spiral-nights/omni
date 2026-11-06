import { OmniAction, OmniComponentNode } from "@omni/types";
import {
  registerOmniPrimitives,
  OmniActionEvent,
  OmniBoxElement,
  OmniCardElement,
  OmniDividerElement,
  OmniSpacerElement,
  OmniTextElement,
  OmniBadgeElement,
  OmniMetricElement,
  OmniIconElement,
  OmniAvatarElement,
  OmniButtonElement,
  OmniIconButtonElement,
  OmniInputElement,
  OmniTextareaElement,
  OmniToggleElement,
  OmniSelectElement,
  OmniTabsElement,
  OmniStatusIndicatorElement,
  OmniCodeBlockElement,
  OmniProgressElement,
  OmniBannerElement,
  OmniListElement,
  OmniListItemElement,
  OmniEmptyStateElement,
  OmniVirtualListElement
} from "./components/primitive-elements.js";

export interface SchemaRendererOptions {
  container: HTMLElement;
  onAction?: (action: OmniAction, payload?: Record<string, unknown>) => void;
}

export class SchemaRenderer {
  private container: HTMLElement;
  private onAction?: (action: OmniAction, payload?: Record<string, unknown>) => void;
  private actionListener: ((e: Event) => void) | null = null;
  private infiniteScrollObserver: IntersectionObserver | null = null;
  private lastAutoLoadTime = 0;

  constructor(options: SchemaRendererOptions) {
    this.container = options.container;
    this.onAction = options.onAction;
    registerOmniPrimitives();
    this.setupActionListener();
  }

  private setupActionListener(): void {
    this.actionListener = (e: Event) => {
      const customEv = e as OmniActionEvent;
      if (customEv.detail?.action) {
        // Automatically inject current form state from inputs if not explicitly in payload
        const formValues = this.collectFormValues();
        const mergedPayload = { ...formValues, ...(customEv.detail.payload || {}) };
        this.onAction?.(customEv.detail.action, mergedPayload);
      }
    };
    this.container.addEventListener("omni-action", this.actionListener);
  }

  /**
   * Scans container for named inputs/toggles to capture ambient form state.
   */
  collectFormValues(): Record<string, unknown> {
    const values: Record<string, unknown> = {};

    const inputs = this.container.querySelectorAll("omni-input");
    for (const inp of Array.from(inputs)) {
      const name = inp.getAttribute("name") || (inp.querySelector("input") as HTMLInputElement)?.name;
      const val = (inp as OmniInputElement).getValue();
      if (name) {
        values[name] = val;
      }
    }

    const textareas = this.container.querySelectorAll("omni-textarea");
    for (const ta of Array.from(textareas)) {
      const name = ta.getAttribute("name") || (ta.querySelector("textarea") as HTMLTextAreaElement)?.name;
      const val = (ta as OmniTextareaElement).getValue();
      if (name) {
        values[name] = val;
      }
    }

    const toggles = this.container.querySelectorAll("omni-toggle");
    for (const tog of Array.from(toggles)) {
      const name = tog.getAttribute("name") || (tog.querySelector("input") as HTMLInputElement)?.name;
      const val = (tog as OmniToggleElement).checked;
      if (name) {
        values[name] = val;
      }
    }

    return values;
  }

  /**
   * Renders or reconciles a component tree into the container using in-place DOM morphing.
   */
  render(rootNode: OmniComponentNode): void {
    if (!rootNode || rootNode.visible === false) {
      while (this.container.firstChild) {
        this.container.removeChild(this.container.firstChild);
      }
      return;
    }

    const currentFirstChild = this.container.firstElementChild as HTMLElement | null;
    const expectedTag = `omni-${rootNode.type}`;

    if (currentFirstChild && currentFirstChild.tagName.toLowerCase() === expectedTag) {
      // In-place reconciliation of root
      this.patchNode(currentFirstChild, rootNode);
      while (this.container.children.length > 1) {
        this.container.removeChild(this.container.lastElementChild!);
      }
    } else {
      // Root replaced or initial render
      while (this.container.firstChild) {
        this.container.removeChild(this.container.firstChild);
      }
      const element = this.createNode(rootNode);
      if (element) {
        this.container.appendChild(element);
      }
    }

    this.setupInfiniteScroll();
  }

  /**
   * Reconciles child nodes of a container element without destroying preserved nodes.
   */
  private reconcileChildren(container: HTMLElement, newNodes: OmniComponentNode[]): void {
    const visibleNewNodes = (newNodes || []).filter((n) => n && n.visible !== false);
    const oldChildren = Array.from(container.children) as HTMLElement[];

    // Index keyed old elements
    const oldKeyMap = new Map<string, HTMLElement>();
    for (const oldEl of oldChildren) {
      const key = oldEl.dataset.omniKey || (oldEl.id ? oldEl.id : null);
      if (key) {
        oldKeyMap.set(key, oldEl);
      }
    }

    const usedElements = new Set<HTMLElement>();
    const reconciledElements: HTMLElement[] = [];

    for (let i = 0; i < visibleNewNodes.length; i++) {
      const newNode = visibleNewNodes[i];
      const expectedTag = `omni-${newNode.type}`;
      const newKey = newNode.key || newNode.id;

      let matchedEl: HTMLElement | null = null;

      // 1. Keyed matching
      if (newKey && oldKeyMap.has(newKey)) {
        const candidate = oldKeyMap.get(newKey)!;
        if (candidate.tagName.toLowerCase() === expectedTag) {
          matchedEl = candidate;
          oldKeyMap.delete(newKey);
        }
      } else {
        // 2. Positional structural matching
        const candidate = oldChildren[i];
        if (candidate && !usedElements.has(candidate)) {
          const candidateKey = candidate.dataset.omniKey || (candidate.id ? candidate.id : null);
          if (!candidateKey && candidate.tagName.toLowerCase() === expectedTag) {
            matchedEl = candidate;
          }
        }
      }

      if (matchedEl) {
        this.patchNode(matchedEl, newNode);
        usedElements.add(matchedEl);
        reconciledElements.push(matchedEl);
      } else {
        const created = this.createNode(newNode);
        if (created) {
          usedElements.add(created);
          reconciledElements.push(created);
        }
      }
    }

    // Remove un-reused old elements
    for (const oldEl of oldChildren) {
      if (!usedElements.has(oldEl) && oldEl.parentNode === container) {
        container.removeChild(oldEl);
      }
    }

    // Re-position or insert elements in desired order
    for (let i = 0; i < reconciledElements.length; i++) {
      const targetEl = reconciledElements[i];
      const currentChildAtI = container.children[i] || null;
      if (currentChildAtI !== targetEl) {
        container.insertBefore(targetEl, currentChildAtI);
      }
    }
  }

  /**
   * Patches attributes, properties, and subtrees of an existing DOM primitive in place.
   */
  private patchNode(el: HTMLElement, node: OmniComponentNode): void {
    if (!el || !node) return;

    if (node.id) el.id = node.id;
    else el.removeAttribute("id");

    if (node.key) el.dataset.omniKey = node.key;
    else delete el.dataset.omniKey;

    if ((el as any).setProps) {
      (el as any).setProps(node);
    }

    if ((node as any)?.style) {
      const s = (node as any).style;
      if (typeof s === "string") {
        el.style.cssText = s;
      } else if (typeof s === "object") {
        el.removeAttribute("style");
        Object.assign(el.style, s);
      }
    } else if (!(el as any).setProps) {
      el.removeAttribute("style");
    }

    // Reconcile nested child slots
    switch (node.type) {
      case "box": {
        this.reconcileChildren(el, Array.isArray(node.children) ? node.children : []);
        break;
      }

      case "card": {
        const card = el as OmniCardElement;
        this.reconcileChildren(card.getHeaderActionSlot(), node.headerAction ? [node.headerAction] : []);
        this.reconcileChildren(card.getBody(), Array.isArray(node.children) ? node.children : []);
        this.reconcileChildren(card.getFooterSlot(), Array.isArray(node.footer) ? node.footer : []);
        break;
      }

      case "list": {
        const list = el as OmniListElement;
        this.reconcileChildren(list.getItemsContainer(), Array.isArray(node.items) ? node.items : []);
        break;
      }

      case "list-item": {
        const listItem = el as OmniListItemElement;
        this.reconcileChildren(listItem.getActionsSlot(), Array.isArray(node.actions) ? node.actions : []);
        break;
      }

      case "virtual-list": {
        const vList = el as OmniVirtualListElement;
        vList.onRenderSlice = (slice) => {
          this.reconcileChildren(vList.getViewport(), slice);
        };
        vList.setProps(node);
        break;
      }
    }
  }

  private setupInfiniteScroll(): void {
    if (typeof IntersectionObserver === "undefined") return;
    this.infiniteScrollObserver?.disconnect();
    this.infiniteScrollObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const now = Date.now();
            if (now - this.lastAutoLoadTime > 1200) {
              this.lastAutoLoadTime = now;
              this.onAction?.({ name: "load-more" }, {});
            }
          }
        }
      },
      { rootMargin: "400px" }
    );

    const sentinels = this.container.querySelectorAll(
      "[data-action='load-more'], [data-infinite-scroll], omni-button, button"
    );
    for (const el of Array.from(sentinels)) {
      const isLoadMoreAction =
        (el as any).actionData?.name === "load-more" ||
        el.getAttribute("data-action") === "load-more" ||
        el.hasAttribute("data-infinite-scroll");
      if (isLoadMoreAction) {
        this.infiniteScrollObserver.observe(el);
      }
    }
  }

  private createNode(node: OmniComponentNode): HTMLElement | null {
    const el = this.createNodeInternal(node);
    if (!el) return null;

    if (node.id) el.id = node.id;
    if (node.key) el.dataset.omniKey = node.key;

    if ((node as any)?.style) {
      const s = (node as any).style;
      if (typeof s === "string") {
        el.style.cssText = s;
      } else if (typeof s === "object") {
        el.removeAttribute("style");
        Object.assign(el.style, s);
      }
    } else if (!(el as any).setProps) {
      el.removeAttribute("style");
    }
    return el;
  }

  private createNodeInternal(node: OmniComponentNode): HTMLElement | null {
    if (!node || node.visible === false) return null;

    switch (node.type) {
      case "box": {
        const el = document.createElement("omni-box") as OmniBoxElement;
        el.setProps(node);
        if (Array.isArray(node.children)) {
          for (const child of node.children) {
            const childEl = this.createNode(child);
            if (childEl) el.appendChild(childEl);
          }
        }
        return el;
      }

      case "card": {
        const el = document.createElement("omni-card") as OmniCardElement;
        el.setProps(node);

        if (node.headerAction) {
          const actionEl = this.createNode(node.headerAction);
          if (actionEl) el.getHeaderActionSlot().appendChild(actionEl);
        }

        if (Array.isArray(node.children)) {
          const body = el.getBody();
          for (const child of node.children) {
            const childEl = this.createNode(child);
            if (childEl) body.appendChild(childEl);
          }
        }

        if (Array.isArray(node.footer)) {
          const footer = el.getFooterSlot();
          for (const item of node.footer) {
            const footerEl = this.createNode(item);
            if (footerEl) footer.appendChild(footerEl);
          }
        }
        return el;
      }

      case "divider": {
        const el = document.createElement("omni-divider") as OmniDividerElement;
        el.setProps(node);
        return el;
      }

      case "spacer": {
        const el = document.createElement("omni-spacer") as OmniSpacerElement;
        el.setProps(node);
        return el;
      }

      case "text": {
        const el = document.createElement("omni-text") as OmniTextElement;
        el.setProps(node);
        return el;
      }

      case "badge": {
        const el = document.createElement("omni-badge") as OmniBadgeElement;
        el.setProps(node);
        return el;
      }

      case "metric": {
        const el = document.createElement("omni-metric") as OmniMetricElement;
        el.setProps(node);
        return el;
      }

      case "icon": {
        const el = document.createElement("omni-icon") as OmniIconElement;
        el.setProps(node);
        return el;
      }

      case "avatar": {
        const el = document.createElement("omni-avatar") as OmniAvatarElement;
        el.setProps(node);
        return el;
      }

      case "button": {
        const el = document.createElement("omni-button") as OmniButtonElement;
        el.setProps(node);
        return el;
      }

      case "icon-button": {
        const el = document.createElement("omni-icon-button") as OmniIconButtonElement;
        el.setProps(node);
        return el;
      }

      case "input": {
        const el = document.createElement("omni-input") as OmniInputElement;
        el.setProps(node);
        return el;
      }

      case "textarea": {
        const el = document.createElement("omni-textarea") as OmniTextareaElement;
        el.setProps(node);
        return el;
      }

      case "toggle": {
        const el = document.createElement("omni-toggle") as OmniToggleElement;
        el.setProps(node);
        return el;
      }

      case "select": {
        const el = document.createElement("omni-select") as OmniSelectElement;
        el.setProps(node);
        return el;
      }

      case "tabs": {
        const el = document.createElement("omni-tabs") as OmniTabsElement;
        el.setProps(node);
        return el;
      }

      case "status-indicator": {
        const el = document.createElement("omni-status-indicator") as OmniStatusIndicatorElement;
        el.setProps(node);
        return el;
      }

      case "code-block": {
        const el = document.createElement("omni-code-block") as OmniCodeBlockElement;
        el.setProps(node);
        return el;
      }

      case "progress": {
        const el = document.createElement("omni-progress") as OmniProgressElement;
        el.setProps(node);
        return el;
      }

      case "banner": {
        const el = document.createElement("omni-banner") as OmniBannerElement;
        el.setProps(node);
        return el;
      }

      case "list": {
        const el = document.createElement("omni-list") as OmniListElement;
        el.setProps(node);
        if (Array.isArray(node.items)) {
          const itemsContainer = el.getItemsContainer();
          for (const item of node.items) {
            const itemEl = this.createNode(item);
            if (itemEl) itemsContainer.appendChild(itemEl);
          }
        }
        return el;
      }

      case "list-item": {
        const el = document.createElement("omni-list-item") as OmniListItemElement;
        el.setProps(node);
        if (Array.isArray(node.actions)) {
          const actionsSlot = el.getActionsSlot();
          for (const act of node.actions) {
            const actEl = this.createNode(act);
            if (actEl) actionsSlot.appendChild(actEl);
          }
        }
        return el;
      }

      case "empty-state": {
        const el = document.createElement("omni-empty-state") as OmniEmptyStateElement;
        el.setProps(node);
        return el;
      }

      case "virtual-list": {
        const el = document.createElement("omni-virtual-list") as OmniVirtualListElement;
        el.onRenderSlice = (slice) => {
          this.reconcileChildren(el.getViewport(), slice);
        };
        el.setProps(node);
        return el;
      }

      default:
        return null;
    }
  }

  destroy(): void {
    if (this.infiniteScrollObserver) {
      this.infiniteScrollObserver.disconnect();
      this.infiniteScrollObserver = null;
    }
    if (this.actionListener) {
      this.container.removeEventListener("omni-action", this.actionListener);
      this.actionListener = null;
    }
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }
  }
}
