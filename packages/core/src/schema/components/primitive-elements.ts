import {
  OmniAction,
  OmniBoxPrimitive,
  OmniCardPrimitive,
  OmniDividerPrimitive,
  OmniSpacerPrimitive,
  OmniTextPrimitive,
  OmniBadgePrimitive,
  OmniMetricPrimitive,
  OmniIconPrimitive,
  OmniAvatarPrimitive,
  OmniButtonPrimitive,
  OmniIconButtonPrimitive,
  OmniInputPrimitive,
  OmniTextareaPrimitive,
  OmniTogglePrimitive,
  OmniSelectPrimitive,
  OmniListPrimitive,
  OmniListItemPrimitive,
  OmniEmptyStatePrimitive
} from "@omni/types";
import { renderSvgIcon } from "../icons.js";

const BaseElement: typeof HTMLElement =
  typeof HTMLElement !== "undefined" ? HTMLElement : (class {} as unknown as typeof HTMLElement);

const BaseCustomEvent: typeof CustomEvent =
  typeof CustomEvent !== "undefined" ? CustomEvent : (class {} as unknown as typeof CustomEvent);

/**
 * Event fired when an interactive Omni primitive triggers an action.
 */
export class OmniActionEvent extends BaseCustomEvent<{
  action: OmniAction;
  payload?: Record<string, unknown>;
}> {
  constructor(action: OmniAction, payload?: Record<string, unknown>) {
    super("omni-action", {
      bubbles: true,
      composed: true,
      detail: {
        action,
        payload: { ...(action.payload || {}), ...(payload || {}) }
      }
    });
  }
}

// ============================================================================
// 1. Layout & Structure Components
// ============================================================================

export class OmniBoxElement extends BaseElement {
  connectedCallback(): void {
    this.classList.add("omni-box");
  }

  setProps(props: Partial<OmniBoxPrimitive>): void {
    if (props.direction) this.setAttribute("direction", props.direction);
    if (props.gap) this.setAttribute("gap", props.gap);
    if (props.align) this.setAttribute("align", props.align);
    if (props.justify) this.setAttribute("justify", props.justify);
    if (props.padding) this.setAttribute("padding", props.padding);
    if (props.wrap !== undefined) {
      if (props.wrap) this.setAttribute("wrap", "");
      else this.removeAttribute("wrap");
    }
  }
}

export class OmniCardElement extends BaseElement {
  private headerEl: HTMLElement | null = null;
  private titleEl: HTMLElement | null = null;
  private subtitleEl: HTMLElement | null = null;
  private iconEl: HTMLElement | null = null;
  private headerActionContainer: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private footerEl: HTMLElement | null = null;

  connectedCallback(): void {
    this.classList.add("omni-card");
    this.ensureStructure();
  }

  private ensureStructure(): void {
    if (!this.bodyEl) {
      this.bodyEl = document.createElement("div");
      this.bodyEl.className = "omni-card-body";
      this.appendChild(this.bodyEl);
    }
  }

  getBody(): HTMLElement {
    this.ensureStructure();
    return this.bodyEl!;
  }

  getHeaderActionSlot(): HTMLElement {
    this.ensureHeader();
    if (!this.headerActionContainer) {
      this.headerActionContainer = document.createElement("div");
      this.headerActionContainer.className = "omni-card-header-action";
      this.headerEl!.appendChild(this.headerActionContainer);
    }
    return this.headerActionContainer;
  }

  getFooterSlot(): HTMLElement {
    if (!this.footerEl) {
      this.footerEl = document.createElement("div");
      this.footerEl.className = "omni-card-footer";
      this.appendChild(this.footerEl);
    }
    return this.footerEl;
  }

  private ensureHeader(): void {
    if (!this.headerEl) {
      this.headerEl = document.createElement("div");
      this.headerEl.className = "omni-card-header";
      this.insertBefore(this.headerEl, this.bodyEl || this.firstChild);
    }
  }

  setProps(props: Partial<OmniCardPrimitive>): void {
    this.ensureStructure();
    if (props.title || props.subtitle || props.icon) {
      this.ensureHeader();
      
      if (props.icon) {
        if (!this.iconEl) {
          this.iconEl = document.createElement("div");
          this.iconEl.className = "omni-card-icon";
          this.headerEl!.insertBefore(this.iconEl, this.headerEl!.firstChild);
        }
        this.iconEl.innerHTML = renderSvgIcon(props.icon, 18);
      } else if (this.iconEl) {
        this.iconEl.remove();
        this.iconEl = null;
      }

      let titlesBox = this.headerEl!.querySelector(".omni-card-titles") as HTMLElement;
      if (!titlesBox) {
        titlesBox = document.createElement("div");
        titlesBox.className = "omni-card-titles";
        if (this.headerActionContainer) {
          this.headerEl!.insertBefore(titlesBox, this.headerActionContainer);
        } else {
          this.headerEl!.appendChild(titlesBox);
        }
      }

      if (props.title) {
        if (!this.titleEl) {
          this.titleEl = document.createElement("h3");
          this.titleEl.className = "omni-card-title";
          titlesBox.appendChild(this.titleEl);
        }
        this.titleEl.textContent = props.title;
      } else if (this.titleEl) {
        this.titleEl.remove();
        this.titleEl = null;
      }

      if (props.subtitle) {
        if (!this.subtitleEl) {
          this.subtitleEl = document.createElement("p");
          this.subtitleEl.className = "omni-card-subtitle";
          titlesBox.appendChild(this.subtitleEl);
        }
        this.subtitleEl.textContent = props.subtitle;
      } else if (this.subtitleEl) {
        this.subtitleEl.remove();
        this.subtitleEl = null;
      }
    }
  }
}

export class OmniDividerElement extends BaseElement {
  connectedCallback(): void {
    this.classList.add("omni-divider");
    if (!this.hasAttribute("orientation")) {
      this.setAttribute("orientation", "horizontal");
    }
  }

  setProps(props: Partial<OmniDividerPrimitive>): void {
    if (props.orientation) this.setAttribute("orientation", props.orientation);
  }
}

export class OmniSpacerElement extends BaseElement {
  connectedCallback(): void {
    this.classList.add("omni-spacer");
  }

  setProps(props: Partial<OmniSpacerPrimitive>): void {
    if (props.size) this.setAttribute("size", props.size);
  }
}

// ============================================================================
// 2. Typography & Status Display
// ============================================================================

export class OmniTextElement extends BaseElement {
  connectedCallback(): void {
    this.classList.add("omni-text");
  }

  setProps(props: Partial<OmniTextPrimitive>): void {
    if (props.variant) this.setAttribute("variant", props.variant);
    if (props.tone) this.setAttribute("tone", props.tone);
    if (props.truncate !== undefined) {
      if (props.truncate) this.setAttribute("truncate", "");
      else this.removeAttribute("truncate");
    }
    if (props.content !== undefined) {
      this.textContent = props.content;
    }
  }
}

export class OmniBadgeElement extends BaseElement {
  private dotEl: HTMLElement | null = null;
  private labelEl: HTMLElement | null = null;

  connectedCallback(): void {
    this.classList.add("omni-badge");
  }

  setProps(props: Partial<OmniBadgePrimitive>): void {
    if (props.tone) this.setAttribute("tone", props.tone);
    if (props.variant) this.setAttribute("variant", props.variant);
    
    if (props.dot) {
      if (!this.dotEl) {
        this.dotEl = document.createElement("span");
        this.dotEl.className = "omni-badge-dot";
        this.insertBefore(this.dotEl, this.firstChild);
      }
    } else if (this.dotEl) {
      this.dotEl.remove();
      this.dotEl = null;
    }

    if (props.label !== undefined) {
      if (!this.labelEl) {
        this.labelEl = document.createElement("span");
        this.labelEl.className = "omni-badge-label";
        this.appendChild(this.labelEl);
      }
      this.labelEl.textContent = props.label;
    }
  }
}

export class OmniMetricElement extends BaseElement {
  private valueEl: HTMLElement | null = null;
  private labelEl: HTMLElement | null = null;
  private subtextEl: HTMLElement | null = null;

  connectedCallback(): void {
    this.classList.add("omni-metric");
  }

  setProps(props: Partial<OmniMetricPrimitive>): void {
    if (props.trend) this.setAttribute("trend", props.trend);

    if (props.value !== undefined) {
      if (!this.valueEl) {
        this.valueEl = document.createElement("div");
        this.valueEl.className = "omni-metric-value";
        this.appendChild(this.valueEl);
      }
      this.valueEl.textContent = String(props.value);
    }

    if (props.label !== undefined) {
      if (!this.labelEl) {
        this.labelEl = document.createElement("div");
        this.labelEl.className = "omni-metric-label";
        this.appendChild(this.labelEl);
      }
      this.labelEl.textContent = props.label;
    }

    if (props.subtext !== undefined) {
      if (!this.subtextEl) {
        this.subtextEl = document.createElement("div");
        this.subtextEl.className = "omni-metric-subtext";
        this.appendChild(this.subtextEl);
      }
      this.subtextEl.textContent = props.subtext;
    } else if (this.subtextEl) {
      this.subtextEl.remove();
      this.subtextEl = null;
    }
  }
}

export class OmniIconElement extends BaseElement {
  connectedCallback(): void {
    this.classList.add("omni-icon");
  }

  setProps(props: Partial<OmniIconPrimitive>): void {
    const size = props.size || 16;
    if (props.name) {
      this.innerHTML = renderSvgIcon(props.name, size);
    }
  }
}

export class OmniAvatarElement extends BaseElement {
  private imgEl: HTMLImageElement | null = null;
  private fallbackEl: HTMLElement | null = null;

  connectedCallback(): void {
    this.classList.add("omni-avatar");
  }

  setProps(props: Partial<OmniAvatarPrimitive>): void {
    if (props.size) this.setAttribute("size", props.size);

    if (props.src) {
      if (!this.imgEl) {
        this.imgEl = document.createElement("img");
        this.imgEl.className = "omni-avatar-img";
        this.imgEl.alt = props.name || "Avatar";
        this.imgEl.onerror = () => {
          this.imgEl?.remove();
          this.imgEl = null;
          this.renderFallback(props);
        };
        this.appendChild(this.imgEl);
      }
      this.imgEl.src = props.src;
      if (this.fallbackEl) {
        this.fallbackEl.remove();
        this.fallbackEl = null;
      }
    } else {
      if (this.imgEl) {
        this.imgEl.remove();
        this.imgEl = null;
      }
      this.renderFallback(props);
    }
  }

  private renderFallback(props: Partial<OmniAvatarPrimitive>): void {
    if (!this.fallbackEl) {
      this.fallbackEl = document.createElement("div");
      this.fallbackEl.className = "omni-avatar-fallback";
      this.appendChild(this.fallbackEl);
    }
    const initial = (props.name || props.pubkey || "?").slice(0, 1).toUpperCase();
    this.fallbackEl.textContent = initial;
  }
}

// ============================================================================
// 3. Interactive Controls & Actions
// ============================================================================

export class OmniButtonElement extends BaseElement {
  private btnEl: HTMLButtonElement | null = null;
  public actionData: OmniAction | null = null;

  connectedCallback(): void {
    this.classList.add("omni-button-wrapper");
    if (!this.btnEl) {
      this.btnEl = document.createElement("button");
      this.btnEl.className = "omni-button";
      this.appendChild(this.btnEl);
      this.addEventListener("click", () => {
        if (this.actionData && !this.btnEl?.disabled) {
          this.dispatchEvent(new OmniActionEvent(this.actionData));
        }
      });
    }
  }

  setProps(props: Partial<OmniButtonPrimitive>): void {
    if (!this.btnEl) this.connectedCallback();
    this.actionData = props.action || null;

    if (props.variant) {
      this.setAttribute("variant", props.variant);
      this.btnEl!.setAttribute("variant", props.variant);
    }
    if (props.size) {
      this.setAttribute("size", props.size);
      this.btnEl!.setAttribute("size", props.size);
    }

    this.btnEl!.disabled = Boolean(props.disabled || props.loading);

    let content = "";
    if (props.loading) {
      content += `<span class="omni-spinner"></span>`;
    }
    if (props.icon && props.iconPosition !== "right") {
      content += renderSvgIcon(props.icon, props.size === "sm" ? 14 : 16);
    }
    if (props.label) {
      content += `<span>${props.label}</span>`;
    }
    if (props.icon && props.iconPosition === "right") {
      content += renderSvgIcon(props.icon, props.size === "sm" ? 14 : 16);
    }
    this.btnEl!.innerHTML = content;
  }
}

export class OmniIconButtonElement extends BaseElement {
  private btnEl: HTMLButtonElement | null = null;
  public actionData: OmniAction | null = null;

  connectedCallback(): void {
    this.classList.add("omni-icon-button-wrapper");
    if (!this.btnEl) {
      this.btnEl = document.createElement("button");
      this.btnEl.className = "omni-icon-button";
      this.appendChild(this.btnEl);
      this.addEventListener("click", () => {
        if (this.actionData && !this.btnEl?.disabled) {
          this.dispatchEvent(new OmniActionEvent(this.actionData));
        }
      });
    }
  }

  setProps(props: Partial<OmniIconButtonPrimitive>): void {
    if (!this.btnEl) this.connectedCallback();
    this.actionData = props.action || null;

    if (props.variant) {
      this.setAttribute("variant", props.variant);
      this.btnEl!.setAttribute("variant", props.variant);
    }
    if (props.size) {
      this.setAttribute("size", props.size);
      this.btnEl!.setAttribute("size", props.size);
    }
    if (props.tooltip) this.btnEl!.title = props.tooltip;

    this.btnEl!.disabled = Boolean(props.disabled);
    if (props.icon) {
      this.btnEl!.innerHTML = renderSvgIcon(props.icon, props.size === "sm" ? 14 : 16);
    }
  }
}

// ============================================================================
// 4. Form Inputs & State Capture
// ============================================================================

export class OmniInputElement extends BaseElement {
  private inputEl: HTMLInputElement | null = null;
  private actionOnEnter: OmniAction | null = null;

  connectedCallback(): void {
    this.classList.add("omni-input-wrapper");
    if (!this.inputEl) {
      this.inputEl = document.createElement("input");
      this.inputEl.className = "omni-input";
      this.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && this.actionOnEnter) {
          e.preventDefault();
          this.dispatchEvent(
            new OmniActionEvent(this.actionOnEnter, {
              [this.inputEl!.name || "value"]: this.inputEl!.value,
              value: this.inputEl!.value
            })
          );
        }
      });
      this.appendChild(this.inputEl);
    }
  }

  getValue(): string {
    return this.inputEl?.value || "";
  }

  setValue(val: string): void {
    if (this.inputEl) this.inputEl.value = val;
  }

  setProps(props: Partial<OmniInputPrimitive>): void {
    if (!this.inputEl) this.connectedCallback();
    this.actionOnEnter = props.actionOnEnter || null;

    if (props.name) {
      this.setAttribute("name", props.name);
      this.inputEl!.name = props.name;
    }
    if (props.placeholder !== undefined) this.inputEl!.placeholder = props.placeholder;
    if (props.value !== undefined) this.inputEl!.value = props.value;
    if (props.inputType) this.inputEl!.type = props.inputType;
  }
}

export class OmniTextareaElement extends BaseElement {
  private textareaEl: HTMLTextAreaElement | null = null;

  connectedCallback(): void {
    this.classList.add("omni-textarea-wrapper");
    if (!this.textareaEl) {
      this.textareaEl = document.createElement("textarea");
      this.textareaEl.className = "omni-textarea";
      this.appendChild(this.textareaEl);
    }
  }

  getValue(): string {
    return this.textareaEl?.value || "";
  }

  setValue(val: string): void {
    if (this.textareaEl) this.textareaEl.value = val;
  }

  setProps(props: Partial<OmniTextareaPrimitive>): void {
    if (!this.textareaEl) this.connectedCallback();
    if (props.name) this.textareaEl!.name = props.name;
    if (props.placeholder !== undefined) this.textareaEl!.placeholder = props.placeholder;
    if (props.value !== undefined) this.textareaEl!.value = props.value;
    if (props.rows !== undefined) this.textareaEl!.rows = props.rows;
  }
}

export class OmniToggleElement extends BaseElement {
  private labelEl: HTMLElement | null = null;
  private inputEl: HTMLInputElement | null = null;
  private actionData: OmniAction | null = null;

  connectedCallback(): void {
    this.classList.add("omni-toggle-wrapper");
    if (!this.inputEl) {
      const container = document.createElement("label");
      container.className = "omni-toggle-container";

      this.inputEl = document.createElement("input");
      this.inputEl.type = "checkbox";
      this.inputEl.className = "omni-toggle-checkbox";
      this.inputEl.addEventListener("change", () => {
        if (this.actionData && !this.inputEl?.disabled) {
          this.dispatchEvent(
            new OmniActionEvent(this.actionData, {
              [this.inputEl!.name || "checked"]: this.inputEl!.checked,
              checked: this.inputEl!.checked
            })
          );
        }
      });

      const track = document.createElement("span");
      track.className = "omni-toggle-track";

      this.labelEl = document.createElement("span");
      this.labelEl.className = "omni-toggle-label";

      container.appendChild(this.inputEl);
      container.appendChild(track);
      container.appendChild(this.labelEl);
      this.appendChild(container);
    }
  }

  get checked(): boolean {
    return Boolean(this.inputEl?.checked);
  }

  setProps(props: Partial<OmniTogglePrimitive>): void {
    if (!this.inputEl) this.connectedCallback();
    this.actionData = props.action || null;

    if (props.name) {
      this.setAttribute("name", props.name);
      this.inputEl!.name = props.name;
    }
    if (props.checked !== undefined) this.inputEl!.checked = props.checked;
    if (props.disabled !== undefined) this.inputEl!.disabled = props.disabled;
    if (props.label !== undefined && this.labelEl) this.labelEl.textContent = props.label;
  }
}

// ============================================================================
// 5. Collections, Lists & Infinite Scroll
// ============================================================================

export class OmniListItemElement extends BaseElement {
  private checkEl: HTMLInputElement | null = null;
  private titleEl: HTMLElement | null = null;
  private subtitleEl: HTMLElement | null = null;
  private metaEl: HTMLElement | null = null;
  private iconEl: HTMLElement | null = null;
  private actionsContainer: HTMLElement | null = null;
  private onClickActionData: OmniAction | null = null;

  connectedCallback(): void {
    this.classList.add("omni-list-item");
    this.addEventListener("click", (e) => {
      // If clicking directly on a button or checkbox, do not fire row action
      if (
        (e.target as HTMLElement).closest("button") ||
        (e.target as HTMLElement).closest("input")
      ) {
        return;
      }
      if (this.onClickActionData) {
        this.dispatchEvent(new OmniActionEvent(this.onClickActionData));
      }
    });
  }

  getActionsSlot(): HTMLElement {
    if (!this.actionsContainer) {
      this.actionsContainer = document.createElement("div");
      this.actionsContainer.className = "omni-list-item-actions";
      this.appendChild(this.actionsContainer);
    }
    return this.actionsContainer;
  }

  setProps(props: Partial<OmniListItemPrimitive>): void {
    this.onClickActionData = props.onClickAction || null;
    if (props.onClickAction) {
      this.setAttribute("clickable", "");
    } else {
      this.removeAttribute("clickable");
    }

    // Leading checkbox if checked is boolean
    if (props.checked !== undefined) {
      if (!this.checkEl) {
        this.checkEl = document.createElement("input");
        this.checkEl.type = "checkbox";
        this.checkEl.className = "omni-list-item-checkbox";
        this.checkEl.addEventListener("change", (e) => {
          e.stopPropagation();
          if (props.onCheckAction) {
            this.dispatchEvent(
              new OmniActionEvent(props.onCheckAction, { checked: this.checkEl!.checked })
            );
          }
        });
        this.insertBefore(this.checkEl, this.firstChild);
      }
      this.checkEl.checked = props.checked;
      if (props.checked) this.setAttribute("checked", "");
      else this.removeAttribute("checked");
    } else if (this.checkEl) {
      this.checkEl.remove();
      this.checkEl = null;
    }

    // Leading icon
    if (props.icon && !this.checkEl) {
      if (!this.iconEl) {
        this.iconEl = document.createElement("div");
        this.iconEl.className = "omni-list-item-icon";
        this.insertBefore(this.iconEl, this.firstChild);
      }
      this.iconEl.innerHTML = renderSvgIcon(props.icon, 16);
    }

    // Content container
    let contentBox = this.querySelector(".omni-list-item-content") as HTMLElement;
    if (!contentBox) {
      contentBox = document.createElement("div");
      contentBox.className = "omni-list-item-content";
      if (this.actionsContainer) {
        this.insertBefore(contentBox, this.actionsContainer);
      } else {
        this.appendChild(contentBox);
      }
    }

    if (props.title !== undefined) {
      if (!this.titleEl) {
        this.titleEl = document.createElement("div");
        this.titleEl.className = "omni-list-item-title";
        contentBox.appendChild(this.titleEl);
      }
      this.titleEl.textContent = props.title;
    }

    if (props.subtitle !== undefined) {
      if (!this.subtitleEl) {
        this.subtitleEl = document.createElement("div");
        this.subtitleEl.className = "omni-list-item-subtitle";
        contentBox.appendChild(this.subtitleEl);
      }
      this.subtitleEl.textContent = props.subtitle;
    } else if (this.subtitleEl) {
      this.subtitleEl.remove();
      this.subtitleEl = null;
    }

    if (props.meta !== undefined) {
      if (!this.metaEl) {
        this.metaEl = document.createElement("div");
        this.metaEl.className = "omni-list-item-meta";
        contentBox.appendChild(this.metaEl);
      }
      this.metaEl.textContent = props.meta;
    } else if (this.metaEl) {
      this.metaEl.remove();
      this.metaEl = null;
    }
  }
}

export class OmniListElement extends BaseElement {
  private itemsContainer: HTMLElement | null = null;
  private sentinelEl: HTMLElement | null = null;
  private observer: IntersectionObserver | null = null;
  private onScrollEndActionData: OmniAction | null = null;
  private hasMore = false;
  private loadingMore = false;

  connectedCallback(): void {
    this.classList.add("omni-list");
    this.ensureStructure();
    this.setupObserver();
  }

  disconnectedCallback(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  private ensureStructure(): void {
    if (!this.itemsContainer) {
      this.itemsContainer = document.createElement("div");
      this.itemsContainer.className = "omni-list-items";
      this.appendChild(this.itemsContainer);
    }
    if (!this.sentinelEl) {
      this.sentinelEl = document.createElement("div");
      this.sentinelEl.className = "omni-list-sentinel";
      this.appendChild(this.sentinelEl);
    }
  }

  getItemsContainer(): HTMLElement {
    this.ensureStructure();
    return this.itemsContainer!;
  }

  private setupObserver(): void {
    if (typeof IntersectionObserver === "undefined") return;
    if (this.observer) this.observer.disconnect();

    this.observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (
          entry?.isIntersecting &&
          this.hasMore &&
          !this.loadingMore &&
          this.onScrollEndActionData
        ) {
          this.dispatchEvent(new OmniActionEvent(this.onScrollEndActionData));
        }
      },
      { root: null, rootMargin: "120px" }
    );

    if (this.sentinelEl) {
      this.observer.observe(this.sentinelEl);
    }
  }

  setProps(props: Partial<OmniListPrimitive>): void {
    this.ensureStructure();
    this.onScrollEndActionData = props.onScrollEndAction || null;
    this.hasMore = Boolean(props.hasMore);
    this.loadingMore = Boolean(props.loadingMore);

    if (props.loadingMore) {
      this.sentinelEl!.innerHTML = `<span class="omni-spinner"></span>`;
    } else {
      this.sentinelEl!.innerHTML = "";
    }
  }
}

export class OmniEmptyStateElement extends BaseElement {
  connectedCallback(): void {
    this.classList.add("omni-empty-state");
  }

  setProps(props: Partial<OmniEmptyStatePrimitive>): void {
    let content = "";
    if (props.icon) {
      content += `<div class="omni-empty-state-icon">${renderSvgIcon(props.icon, 36)}</div>`;
    }
    if (props.title) {
      content += `<h4 class="omni-empty-state-title">${props.title}</h4>`;
    }
    if (props.description) {
      content += `<p class="omni-empty-state-description">${props.description}</p>`;
    }
    this.innerHTML = content;

    if (props.action && props.actionLabel) {
      const btn = document.createElement("omni-button") as OmniButtonElement;
      btn.setProps({
        label: props.actionLabel,
        action: props.action,
        variant: "secondary"
      });
      this.appendChild(btn);
    }
  }
}

// ============================================================================
// Registration Helper
// ============================================================================

export function registerOmniPrimitives(): void {
  if (typeof customElements === "undefined") return;

  const definitions: [string, CustomElementConstructor][] = [
    ["omni-box", OmniBoxElement],
    ["omni-card", OmniCardElement],
    ["omni-divider", OmniDividerElement],
    ["omni-spacer", OmniSpacerElement],
    ["omni-text", OmniTextElement],
    ["omni-badge", OmniBadgeElement],
    ["omni-metric", OmniMetricElement],
    ["omni-icon", OmniIconElement],
    ["omni-avatar", OmniAvatarElement],
    ["omni-button", OmniButtonElement],
    ["omni-icon-button", OmniIconButtonElement],
    ["omni-input", OmniInputElement],
    ["omni-textarea", OmniTextareaElement],
    ["omni-toggle", OmniToggleElement],
    ["omni-list", OmniListElement],
    ["omni-list-item", OmniListItemElement],
    ["omni-empty-state", OmniEmptyStateElement]
  ];

  for (const [tag, constructor] of definitions) {
    if (!customElements.get(tag)) {
      customElements.define(tag, constructor);
    }
  }
}
