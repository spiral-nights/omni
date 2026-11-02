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
  OmniTabsPrimitive,
  OmniStatusIndicatorPrimitive,
  OmniCodeBlockPrimitive,
  OmniProgressPrimitive,
  OmniBannerPrimitive,
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
  public actionData: OmniAction | null = null;

  connectedCallback(): void {
    this.classList.add("omni-box");
    this.addEventListener("click", (e) => {
      if (this.actionData) {
        if (
          (e.target as HTMLElement).closest("button") ||
          (e.target as HTMLElement).closest("input") ||
          (e.target as HTMLElement).closest("textarea")
        ) {
          return;
        }
        this.dispatchEvent(new OmniActionEvent(this.actionData));
      }
    });
  }

  setProps(props: Partial<OmniBoxPrimitive>): void {
    this.actionData = props.action || null;
    if (props.action) {
      this.style.cursor = "pointer";
    } else {
      this.style.cursor = "";
    }
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
  public actionData: OmniAction | null = null;

  connectedCallback(): void {
    this.classList.add("omni-card");
    this.ensureStructure();
    this.addEventListener("click", (e) => {
      // If user selected text to copy, do not navigate
      const sel = typeof window !== "undefined" ? window.getSelection()?.toString()?.trim() : "";
      if (sel && sel.length > 0) {
        return;
      }
      // If click originated on an interactive control (button, link, input, avatar, media), do not trigger card action
      const target = e.target as HTMLElement;
      if (
        target.closest(
          "button, input, textarea, a, video, audio, img, omni-button, omni-icon-button, omni-avatar, [role='button']"
        )
      ) {
        return;
      }
      if (this.actionData) {
        this.dispatchEvent(new OmniActionEvent(this.actionData));
      }
    });
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
    this.actionData = props.action || null;
    if (props.action) {
      this.style.cursor = "pointer";
    } else {
      this.style.cursor = "";
    }
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

function formatTextWithLinks(raw: string, showInlineImages?: boolean): string {
  if (!raw) return "";

  const inlineImages = showInlineImages !== undefined
    ? showInlineImages
    : (typeof localStorage !== "undefined" && localStorage.getItem("omni_feed_inline_images") === "true");

  // 1. Placeholder-replace markdown links [text](url) to preserve anchor texts
  const placeholders: string[] = [];
  let text = raw.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label, url) => {
    const idx = placeholders.length;
    placeholders.push(
      `<a href="${url}" target="_blank" rel="noopener noreferrer" class="feed-link" style="color: var(--omni-accent-primary, #d4a373); text-decoration: underline; text-underline-offset: 3px; word-break: break-all;">${label}</a>`
    );
    return `___OMNI_LINK_PLACEHOLDER_${idx}___`;
  });

  // 2. Escape HTML entities
  text = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  // 3. Match raw URLs and extract media previews (Blossom videos, images)
  const mediaUrls: Array<{ type: "video" | "image"; url: string }> = [];
  const urlRegex = /(https?:\/\/[^\s<]+)/gi;
  text = text.replace(urlRegex, (matched) => {
    let url = matched;
    let trailing = "";

    // Strip trailing HTML entities (&gt;, &quot;, &#39;, &amp;)
    const entityMatch = url.match(/(&(?:gt|lt|quot|amp|#39);)+$/);
    if (entityMatch) {
      trailing = entityMatch[0] + trailing;
      url = url.slice(0, -entityMatch[0].length);
    }

    // Strip trailing punctuation
    const punctMatch = url.match(/[.,!?:;)\]"'']+$/);
    if (punctMatch) {
      trailing = punctMatch[0] + trailing;
      url = url.slice(0, -punctMatch[0].length);
    }

    const cleanUrl = url.replace(/^http:\/\//i, "https://");
    const isVideo = /\.(mp4|webm|mov|m4v|ogv|ogg|mkv)(\?.*)?$/i.test(cleanUrl);
    const isImage = /\.(png|jpg|jpeg|gif|webp|svg)(\?.*)?$/i.test(cleanUrl);

    if (isVideo) {
      let displayLabel = cleanUrl;
      try {
        const parsed = new URL(cleanUrl);
        const name = parsed.pathname.split("/").filter(Boolean).pop() || parsed.hostname;
        displayLabel = name.length > 28 ? `${name.slice(0, 12)}…${name.slice(-10)}` : name;
      } catch (_) {}

      return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="feed-media-callout feed-video-link" style="display: inline-flex; align-items: center; gap: 7px; padding: 4px 10px; margin: 3px 0; background: var(--omni-bg-surface, #191816); border: 1px solid var(--omni-border-subtle, #33312c); border-radius: var(--omni-radius-sm, 6px); color: var(--omni-accent-primary, #d4a373); text-decoration: none; font-size: 0.85em; font-weight: 500; transition: all 0.15s ease; max-width: 100%; word-break: break-all;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg><span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px;">${displayLabel}</span><span class="media-callout-badge" style="font-size: 0.72em; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.85; background: rgba(212, 163, 115, 0.15); padding: 1px 5px; border-radius: 3px; margin-left: 2px;">Video</span></a>${trailing}`;
    }

    if (isImage) {
      if (inlineImages) {
        mediaUrls.push({ type: "image", url: cleanUrl });
        return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="feed-link" style="color: var(--omni-accent-primary, #d4a373); text-decoration: underline; text-underline-offset: 3px; word-break: break-all;">${cleanUrl}</a>${trailing}`;
      } else {
        // Render as special clickable media callout link
        let displayLabel = cleanUrl;
        try {
          const parsed = new URL(cleanUrl);
          const name = parsed.pathname.split("/").filter(Boolean).pop() || parsed.hostname;
          displayLabel = name.length > 28 ? `${name.slice(0, 12)}…${name.slice(-10)}` : name;
        } catch (_) {}

        return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="feed-media-callout feed-image-link" style="display: inline-flex; align-items: center; gap: 7px; padding: 4px 10px; margin: 3px 0; background: var(--omni-bg-surface, #191816); border: 1px solid var(--omni-border-subtle, #33312c); border-radius: var(--omni-radius-sm, 6px); color: var(--omni-accent-primary, #d4a373); text-decoration: none; font-size: 0.85em; font-weight: 500; transition: all 0.15s ease; max-width: 100%; word-break: break-all;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg><span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px;">${displayLabel}</span><span class="media-callout-badge" style="font-size: 0.72em; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.85; background: rgba(212, 163, 115, 0.15); padding: 1px 5px; border-radius: 3px; margin-left: 2px;">Image</span></a>${trailing}`;
      }
    }

    return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="feed-link" style="color: var(--omni-accent-primary, #d4a373); text-decoration: underline; text-underline-offset: 3px; word-break: break-all;">${cleanUrl}</a>${trailing}`;
  });

  // 4. Restore placeholders
  for (let i = 0; i < placeholders.length; i++) {
    text = text.replace(`___OMNI_LINK_PLACEHOLDER_${i}___`, placeholders[i]);
  }

  // 5. Append media preview elements if image URLs were found and enabled
  if (mediaUrls.length > 0) {
    for (const m of mediaUrls) {
      if (m.type === "image" && inlineImages) {
        text += `<div class="feed-media-wrap" style="margin-top: 8px;"><img src="${m.url}" loading="lazy" style="max-width: 100%; border-radius: 6px; display: block; max-height: 480px; object-fit: contain;" /></div>`;
      }
    }
  }

  return text;
}

export class OmniTextElement extends BaseElement {
  public actionData: OmniAction | null = null;

  connectedCallback(): void {
    this.classList.add("omni-text");
    this.addEventListener("click", (e) => {
      // 1. If user is selecting text to copy, do not trigger action
      const sel = typeof window !== "undefined" ? window.getSelection()?.toString()?.trim() : "";
      if (sel && sel.length > 0) {
        return;
      }
      // 2. If clicking a link or interactive media control, let browser handle it instead of triggering action
      if ((e.target as HTMLElement).closest("a, button, input, textarea, video, audio")) {
        return;
      }
      if (this.actionData) {
        this.dispatchEvent(new OmniActionEvent(this.actionData));
      }
    });
  }

  setProps(props: Partial<OmniTextPrimitive>): void {
    this.actionData = props.action || null;
    if (props.action) {
      this.style.cursor = "pointer";
    } else {
      this.style.cursor = "";
    }
    if (props.variant) this.setAttribute("variant", props.variant);
    if (props.tone) this.setAttribute("tone", props.tone);
    if (props.truncate !== undefined) {
      if (props.truncate) this.setAttribute("truncate", "");
      else this.removeAttribute("truncate");
    }
    if (props.content !== undefined) {
      if (/(https?:\/\/[^\s<]+|\[.*?\]\(https?:\/\/)/i.test(props.content)) {
        this.innerHTML = formatTextWithLinks(props.content, props.showInlineImages);
      } else {
        this.textContent = props.content;
      }
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

export function getAvatarSvg(pubkey: string, letter: string): string {
  let hash = 0;
  for (let i = 0; i < (pubkey || "").length; i++) {
    hash = (hash << 5) - hash + pubkey.charCodeAt(i);
    hash |= 0;
  }
  const seed = Math.abs(hash);

  const palettes = [
    ["#c85d3e", "#3d190e", "#ffd2c2"], // Terracotta / Rust
    ["#288755", "#0b2e1b", "#bcf5d4"], // Emerald / Forest
    ["#356ec4", "#102347", "#cce0ff"], // Cobalt / Royal Blue
    ["#85419c", "#2b1036", "#f3cbff"], // Plum / Violet
    ["#aa3148", "#3b0d17", "#ffd0d9"], // Crimson / Wine
    ["#23858a", "#0a2d2f", "#bdf4f7"], // Deep Teal / Marine
    ["#b88320", "#3d2905", "#ffe6b0"], // Ochre / Amber Gold
    ["#4d5ec2", "#161b42", "#d4dcff"], // Indigo / Dusk
    ["#c24965", "#3b0f1b", "#ffd2dc"], // Coral / Rose
    ["#6b8028", "#222c09", "#e4f7a8"], // Olive / Moss
    ["#8e4a7d", "#2e1227", "#f9d0ee"], // Berry / Heather
    ["#1c83a8", "#072b38", "#bceeff"], // Azure / Vibrant Cyan
    ["#bd5726", "#381506", "#ffd3bb"], // Burnt Sienna
    ["#6a47b8", "#1e113d", "#e0d4ff"], // Violet / Lavender
    ["#25846f", "#092d24", "#bcf5e6"], // Jade / Spruce
    ["#a16328", "#331c07", "#fedec0"]  // Warm Copper / Cinnamon
  ];
  const [stop1, stop2, accent] = palettes[seed % palettes.length];

  const c1_x = 20 + (seed % 60);
  const c1_y = 20 + ((seed >> 4) % 60);
  const c1_r = 24 + ((seed >> 8) % 16);
  const c1_color = seed % 2 === 0 ? accent : "#ede8df";
  const c1_opacity = (0.24 + (seed % 8) * 0.015).toFixed(2);

  const c2_x = 100 - c1_x;
  const c2_y = 100 - c1_y;
  const c2_r = 20 + ((seed >> 12) % 20);

  const waveY = 64 + (seed % 10);
  const waveControlY = 40 + ((seed >> 3) % 14);
  const waveEndY = 68 + ((seed >> 6) % 12);

  const cleanLetter = (letter || "?").slice(0, 1).toUpperCase();

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%" style="display: block; border-radius: 50%;">
  <rect width="100" height="100" rx="50" fill="${stop1}" />
  <circle cx="${c1_x}" cy="${c1_y}" r="${c1_r}" fill="${c1_color}" fill-opacity="${c1_opacity}" />
  <circle cx="${c2_x}" cy="${c2_y}" r="${c2_r}" fill="${stop2}" fill-opacity="0.4" />
  <path d="M 0 ${waveY} Q 50 ${waveControlY} 100 ${waveEndY} L 100 100 L 0 100 Z" fill="#141312" fill-opacity="0.3" />
  <circle cx="50" cy="50" r="47.5" fill="none" stroke="#ede8df" stroke-opacity="0.25" stroke-width="1.5" />
  <text x="50" y="52" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="46" font-weight="900" fill="#ffffff" stroke="#141312" stroke-width="2" stroke-opacity="0.5" text-anchor="middle" dominant-baseline="central" paint-order="stroke fill">${cleanLetter}</text>
</svg>`;
}

export class OmniAvatarElement extends BaseElement {
  public actionData: OmniAction | null = null;

  connectedCallback(): void {
    this.classList.add("omni-avatar");
    this.addEventListener("click", () => {
      if (this.actionData) {
        this.dispatchEvent(new OmniActionEvent(this.actionData));
      }
    });
  }

  setProps(props: Partial<OmniAvatarPrimitive>): void {
    if (props.size) this.setAttribute("size", props.size);
    this.actionData = props.action || null;
    if (props.action) {
      this.style.cursor = "pointer";
    } else {
      this.style.cursor = "";
    }

    const key = props.pubkey || props.name || "";
    const initial = (props.name || props.pubkey || "?").slice(0, 1).toUpperCase();
    this.innerHTML = getAvatarSvg(key, initial);
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
  private actionOnChange: OmniAction | null = null;

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
      this.inputEl.addEventListener("change", () => {
        if (this.inputEl!.type === "file") {
          const files = this.inputEl!.files;
          if (files && files.length > 0) {
            const file = files[0];
            if (typeof FileReader !== "undefined") {
              const reader = new FileReader();
              reader.onload = () => {
                const buffer = reader.result as ArrayBuffer;
                const bytes = new Uint8Array(buffer);
                if (this.actionOnChange) {
                  this.dispatchEvent(
                    new OmniActionEvent(this.actionOnChange, {
                      fileName: file.name,
                      fileSize: file.size,
                      fileType: file.type,
                      fileBytes: bytes,
                      value: file.name
                    })
                  );
                }
              };
              reader.readAsArrayBuffer(file);
            }
          }
        } else if (this.actionOnChange) {
          this.dispatchEvent(
            new OmniActionEvent(this.actionOnChange, {
              [this.inputEl!.name || "value"]: this.inputEl!.value,
              value: this.inputEl!.value
            })
          );
        }
      });
      this.appendChild(this.inputEl);

      this.addEventListener("dragover", (e) => {
        if (this.inputEl?.type === "file") {
          e.preventDefault();
        }
      });
      this.addEventListener("drop", (e: any) => {
        if (this.inputEl?.type === "file") {
          e.preventDefault();
          const files = e.dataTransfer?.files;
          if (files && files.length > 0 && typeof FileReader !== "undefined") {
            const file = files[0];
            const reader = new FileReader();
            reader.onload = () => {
              const buffer = reader.result as ArrayBuffer;
              const bytes = new Uint8Array(buffer);
              if (this.actionOnChange) {
                this.dispatchEvent(
                  new OmniActionEvent(this.actionOnChange, {
                    fileName: file.name,
                    fileSize: file.size,
                    fileType: file.type,
                    fileBytes: bytes,
                    value: file.name
                  })
                );
              }
            };
            reader.readAsArrayBuffer(file);
          }
        }
      });
    }
  }

  getValue(): string {
    return this.inputEl?.value || "";
  }

  setValue(val: string): void {
    if (this.inputEl && this.inputEl.type !== "file") this.inputEl.value = val;
  }

  setProps(props: Partial<OmniInputPrimitive>): void {
    if (!this.inputEl) this.connectedCallback();
    this.actionOnEnter = props.actionOnEnter || null;
    this.actionOnChange = props.actionOnChange || null;

    if (props.name) {
      this.setAttribute("name", props.name);
      this.inputEl!.name = props.name;
    }
    if (props.placeholder !== undefined) this.inputEl!.placeholder = props.placeholder;
    if (props.value !== undefined && props.inputType !== "file") this.inputEl!.value = props.value;
    if (props.inputType) this.inputEl!.type = props.inputType;
    if (props.accept) this.inputEl!.accept = props.accept;
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

export class OmniSelectElement extends BaseElement {
  private selectEl: HTMLSelectElement | null = null;
  private actionData: OmniAction | null = null;

  connectedCallback(): void {
    this.classList.add("omni-select-wrapper");
    if (!this.selectEl) {
      this.selectEl = document.createElement("select");
      this.selectEl.className = "omni-select";
      this.selectEl.addEventListener("change", () => {
        if (this.actionData && !this.selectEl?.disabled) {
          this.dispatchEvent(
            new OmniActionEvent(this.actionData, {
              [this.selectEl!.name || "value"]: this.selectEl!.value,
              value: this.selectEl!.value
            })
          );
        }
      });
      this.appendChild(this.selectEl);
    }
  }

  getValue(): string {
    return this.selectEl?.value || "";
  }

  setValue(val: string): void {
    if (this.selectEl) this.selectEl.value = val;
  }

  setProps(props: Partial<OmniSelectPrimitive>): void {
    if (!this.selectEl) this.connectedCallback();
    this.actionData = props.action || null;

    if (props.name) {
      this.setAttribute("name", props.name);
      this.selectEl!.name = props.name;
    }

    if (Array.isArray(props.options)) {
      this.selectEl!.innerHTML = "";
      for (const opt of props.options) {
        const optionEl = document.createElement("option");
        optionEl.value = opt.value;
        optionEl.textContent = opt.label;
        this.selectEl!.appendChild(optionEl);
      }
    }

    if (props.value !== undefined) {
      this.selectEl!.value = props.value;
    }
  }
}

export class OmniTabsElement extends BaseElement {
  private navEl: HTMLElement | null = null;
  private activeTabId: string = "";
  private actionData: OmniAction | null = null;

  connectedCallback(): void {
    this.classList.add("omni-tabs-wrapper");
    if (!this.navEl) {
      this.navEl = document.createElement("div");
      this.navEl.className = "omni-tabs-nav";
      this.appendChild(this.navEl);
    }
  }

  getActiveTab(): string {
    return this.activeTabId;
  }

  setProps(props: Partial<OmniTabsPrimitive>): void {
    if (!this.navEl) this.connectedCallback();
    this.actionData = props.action || null;
    this.activeTabId = props.activeTab || "";

    if (Array.isArray(props.tabs)) {
      this.navEl!.innerHTML = "";
      for (const tab of props.tabs) {
        const tabBtn = document.createElement("button");
        tabBtn.type = "button";
        tabBtn.className = `omni-tab-btn${tab.id === this.activeTabId ? " active" : ""}`;
        tabBtn.dataset.tabId = tab.id;

        if (tab.icon) {
          const iconSpan = document.createElement("span");
          iconSpan.className = "omni-tab-icon";
          iconSpan.innerHTML = renderSvgIcon(tab.icon, 16);
          tabBtn.appendChild(iconSpan);
        }

        const labelSpan = document.createElement("span");
        labelSpan.className = "omni-tab-label";
        labelSpan.textContent = tab.label;
        tabBtn.appendChild(labelSpan);

        if (tab.badge !== undefined && tab.badge !== "") {
          const badgeSpan = document.createElement("span");
          badgeSpan.className = "omni-tab-badge";
          badgeSpan.textContent = String(tab.badge);
          tabBtn.appendChild(badgeSpan);
        }

        tabBtn.addEventListener("click", () => {
          this.activeTabId = tab.id;
          this.navEl!.querySelectorAll(".omni-tab-btn").forEach((b) => b.classList.remove("active"));
          tabBtn.classList.add("active");

          if (this.actionData) {
            this.dispatchEvent(
              new OmniActionEvent(this.actionData, {
                tabId: tab.id,
                value: tab.id
              })
            );
          }
        });

        this.navEl!.appendChild(tabBtn);
      }
    }
  }
}

export class OmniStatusIndicatorElement extends BaseElement {
  private dotEl: HTMLElement | null = null;
  private labelEl: HTMLElement | null = null;

  connectedCallback(): void {
    this.classList.add("omni-status-indicator");
    if (!this.dotEl) {
      this.dotEl = document.createElement("span");
      this.dotEl.className = "omni-status-dot";
      this.appendChild(this.dotEl);
    }
  }

  setProps(props: Partial<OmniStatusIndicatorPrimitive>): void {
    if (!this.dotEl) this.connectedCallback();
    const status = props.status || "offline";
    this.dotEl!.className = `omni-status-dot omni-status-${status}${props.pulse ? " omni-pulse" : ""}`;

    if (props.label) {
      if (!this.labelEl) {
        this.labelEl = document.createElement("span");
        this.labelEl.className = "omni-status-label";
        this.appendChild(this.labelEl);
      }
      this.labelEl.textContent = props.label;
    } else if (this.labelEl) {
      this.labelEl.remove();
      this.labelEl = null;
    }
  }
}

export class OmniCodeBlockElement extends BaseElement {
  private preEl: HTMLPreElement | null = null;
  private codeEl: HTMLElement | null = null;
  private copyBtn: HTMLButtonElement | null = null;
  private currentCode: string = "";

  connectedCallback(): void {
    this.classList.add("omni-code-block-wrapper");
    if (!this.preEl) {
      this.preEl = document.createElement("pre");
      this.preEl.className = "omni-code-pre";

      this.codeEl = document.createElement("code");
      this.codeEl.className = "omni-code";
      this.preEl.appendChild(this.codeEl);

      this.appendChild(this.preEl);
    }
  }

  setProps(props: Partial<OmniCodeBlockPrimitive>): void {
    if (!this.preEl) this.connectedCallback();
    this.currentCode = props.code || "";
    this.codeEl!.textContent = this.currentCode;

    if (props.copyable !== false) {
      if (!this.copyBtn) {
        this.copyBtn = document.createElement("button");
        this.copyBtn.type = "button";
        this.copyBtn.className = "omni-code-copy-btn";
        this.copyBtn.title = "Copy code";
        this.copyBtn.innerHTML = renderSvgIcon("copy", 14);
        this.copyBtn.addEventListener("click", async () => {
          try {
            if (typeof navigator !== "undefined" && navigator.clipboard) {
              await navigator.clipboard.writeText(this.currentCode);
              this.copyBtn!.innerHTML = renderSvgIcon("check", 14);
              setTimeout(() => {
                if (this.copyBtn) this.copyBtn.innerHTML = renderSvgIcon("copy", 14);
              }, 1600);
            }
          } catch {}
        });
        this.appendChild(this.copyBtn);
      }
    } else if (this.copyBtn) {
      this.copyBtn.remove();
      this.copyBtn = null;
    }
  }
}

export class OmniProgressElement extends BaseElement {
  private trackEl: HTMLElement | null = null;
  private barEl: HTMLElement | null = null;
  private labelEl: HTMLElement | null = null;

  connectedCallback(): void {
    this.classList.add("omni-progress-wrapper");
    if (!this.trackEl) {
      this.trackEl = document.createElement("div");
      this.trackEl.className = "omni-progress-track";

      this.barEl = document.createElement("div");
      this.barEl.className = "omni-progress-bar";
      this.trackEl.appendChild(this.barEl);

      this.appendChild(this.trackEl);
    }
  }

  setProps(props: Partial<OmniProgressPrimitive>): void {
    if (!this.trackEl) this.connectedCallback();
    const max = props.max && props.max > 0 ? props.max : 100;
    const val = Math.max(0, Math.min(max, props.value ?? 0));
    const pct = Math.round((val / max) * 100);

    this.barEl!.style.width = `${pct}%`;

    if (props.label) {
      if (!this.labelEl) {
        this.labelEl = document.createElement("div");
        this.labelEl.className = "omni-progress-label";
        this.insertBefore(this.labelEl, this.trackEl);
      }
      this.labelEl.textContent = `${props.label} (${pct}%)`;
    } else if (this.labelEl) {
      this.labelEl.remove();
      this.labelEl = null;
    }
  }
}

export class OmniBannerElement extends BaseElement {
  private iconEl: HTMLElement | null = null;
  private contentEl: HTMLElement | null = null;
  private actionBtn: HTMLButtonElement | null = null;
  private dismissBtn: HTMLButtonElement | null = null;
  private actionData: OmniAction | null = null;
  private dismissActionData: OmniAction | null = null;

  connectedCallback(): void {
    this.classList.add("omni-banner");
  }

  setProps(props: Partial<OmniBannerPrimitive>): void {
    const tone = props.tone || "info";
    this.className = `omni-banner omni-banner-${tone}`;

    this.innerHTML = "";

    const iconName = props.icon || (tone === "error" || tone === "warning" ? "close" : tone === "success" ? "check-circle" : "bell");
    this.iconEl = document.createElement("div");
    this.iconEl.className = "omni-banner-icon";
    this.iconEl.innerHTML = renderSvgIcon(iconName, 18);
    this.appendChild(this.iconEl);

    this.contentEl = document.createElement("div");
    this.contentEl.className = "omni-banner-content";

    if (props.title) {
      const titleEl = document.createElement("div");
      titleEl.className = "omni-banner-title";
      titleEl.textContent = props.title;
      this.contentEl.appendChild(titleEl);
    }

    const msgEl = document.createElement("div");
    msgEl.className = "omni-banner-message";
    msgEl.textContent = props.message || "";
    this.contentEl.appendChild(msgEl);

    this.appendChild(this.contentEl);

    if (props.action && props.actionLabel) {
      this.actionData = props.action;
      this.actionBtn = document.createElement("button");
      this.actionBtn.type = "button";
      this.actionBtn.className = "omni-banner-action-btn";
      this.actionBtn.textContent = props.actionLabel;
      this.actionBtn.addEventListener("click", () => {
        this.dispatchEvent(new OmniActionEvent(this.actionData!));
      });
      this.appendChild(this.actionBtn);
    }

    if (props.dismissible) {
      this.dismissActionData = props.onDismissAction || null;
      this.dismissBtn = document.createElement("button");
      this.dismissBtn.type = "button";
      this.dismissBtn.className = "omni-banner-dismiss-btn";
      this.dismissBtn.title = "Dismiss";
      this.dismissBtn.innerHTML = renderSvgIcon("close", 14);
      this.dismissBtn.addEventListener("click", () => {
        this.remove();
        if (this.dismissActionData) {
          this.dispatchEvent(new OmniActionEvent(this.dismissActionData));
        }
      });
      this.appendChild(this.dismissBtn);
    }
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

    // Leading avatar image or icon
    if (!this.checkEl) {
      if (props.avatarUrl) {
        if (!this.iconEl) {
          this.iconEl = document.createElement("div");
          this.insertBefore(this.iconEl, this.firstChild);
        }
        this.iconEl.className = "omni-list-item-icon omni-list-item-avatar";
        const initial = (props.title || props.id || "?").slice(0, 1).toUpperCase();
        const fallbackSvg = getAvatarSvg(props.avatarPubkey || props.id || props.title || "", initial);
        this.iconEl.innerHTML = `<img src="${props.avatarUrl}" alt="${props.title || ''}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" onerror="this.onerror=null; this.parentElement.innerHTML = decodeURIComponent('${encodeURIComponent(fallbackSvg)}');" />`;
      } else if (props.avatarPubkey || (props.icon === "user" && props.id && props.id.length >= 32)) {
        if (!this.iconEl) {
          this.iconEl = document.createElement("div");
          this.insertBefore(this.iconEl, this.firstChild);
        }
        this.iconEl.className = "omni-list-item-icon omni-list-item-avatar";
        const initial = (props.title || props.id || "?").slice(0, 1).toUpperCase();
        const avatarSvg = getAvatarSvg(props.avatarPubkey || props.id || "", initial);
        this.iconEl.innerHTML = avatarSvg;
      } else if (props.icon) {
        if (!this.iconEl) {
          this.iconEl = document.createElement("div");
          this.insertBefore(this.iconEl, this.firstChild);
        }
        this.iconEl.className = "omni-list-item-icon";
        this.iconEl.innerHTML = renderSvgIcon(props.icon, 16);
      } else if (this.iconEl) {
        this.iconEl.remove();
        this.iconEl = null;
      }
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
    ["omni-select", OmniSelectElement],
    ["omni-tabs", OmniTabsElement],
    ["omni-status-indicator", OmniStatusIndicatorElement],
    ["omni-code-block", OmniCodeBlockElement],
    ["omni-progress", OmniProgressElement],
    ["omni-banner", OmniBannerElement],
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
