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
  OmniListElement,
  OmniListItemElement,
  OmniEmptyStateElement
} from "./components/primitive-elements.js";

export interface SchemaRendererOptions {
  container: HTMLElement;
  onAction?: (action: OmniAction, payload?: Record<string, unknown>) => void;
}

export class SchemaRenderer {
  private container: HTMLElement;
  private onAction?: (action: OmniAction, payload?: Record<string, unknown>) => void;
  private actionListener: ((e: Event) => void) | null = null;

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
   * Renders or updates a component tree into the container.
   */
  render(rootNode: OmniComponentNode): void {
    // Clear existing container contents
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }

    const element = this.renderNode(rootNode);
    if (element) {
      this.container.appendChild(element);
    }
  }

  private renderNode(node: OmniComponentNode): HTMLElement | null {
    if (!node || node.visible === false) return null;

    switch (node.type) {
      case "box": {
        const el = document.createElement("omni-box") as OmniBoxElement;
        el.setProps(node);
        if (node.id) el.id = node.id;
        if (Array.isArray(node.children)) {
          for (const child of node.children) {
            const childEl = this.renderNode(child);
            if (childEl) el.appendChild(childEl);
          }
        }
        return el;
      }

      case "card": {
        const el = document.createElement("omni-card") as OmniCardElement;
        el.setProps(node);
        if (node.id) el.id = node.id;

        if (node.headerAction) {
          const actionEl = this.renderNode(node.headerAction);
          if (actionEl) el.getHeaderActionSlot().appendChild(actionEl);
        }

        if (Array.isArray(node.children)) {
          const body = el.getBody();
          for (const child of node.children) {
            const childEl = this.renderNode(child);
            if (childEl) body.appendChild(childEl);
          }
        }

        if (Array.isArray(node.footer)) {
          const footer = el.getFooterSlot();
          for (const item of node.footer) {
            const footerEl = this.renderNode(item);
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

      case "list": {
        const el = document.createElement("omni-list") as OmniListElement;
        el.setProps(node);
        if (Array.isArray(node.items)) {
          const itemsContainer = el.getItemsContainer();
          for (const item of node.items) {
            const itemEl = this.renderNode(item);
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
            const actEl = this.renderNode(act);
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

      default:
        return null;
    }
  }

  destroy(): void {
    if (this.actionListener) {
      this.container.removeEventListener("omni-action", this.actionListener);
      this.actionListener = null;
    }
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }
  }
}
