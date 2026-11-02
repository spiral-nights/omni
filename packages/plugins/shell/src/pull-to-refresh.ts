import { icon } from "./icons.js";

export interface PullToRefreshOptions {
  root: HTMLElement;
  onRefresh: () => void;
  threshold?: number;
}

export class PullToRefreshController {
  private root: HTMLElement;
  private onRefresh: () => void;
  private threshold: number;

  private indicatorEl: HTMLElement | null = null;
  private boundTouchStartHandler: ((e: TouchEvent) => void) | null = null;
  private boundTouchMoveHandler: ((e: TouchEvent) => void) | null = null;
  private boundTouchEndHandler: ((e: TouchEvent) => void) | null = null;

  constructor(options: PullToRefreshOptions) {
    this.root = options.root;
    this.onRefresh = options.onRefresh;
    this.threshold = options.threshold ?? 50;
  }

  public init(): void {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    if (this.indicatorEl) {
      this.destroy();
    }

    const indicator = document.createElement("div");
    indicator.className = "omni-pull-to-refresh";
    indicator.id = "omni-pull-to-refresh";
    indicator.innerHTML = `
      <div class="omni-pull-indicator-content">
        <span class="omni-pull-icon">${icon("refresh", 16)}</span>
        <span class="omni-pull-label">pull down to refresh</span>
      </div>
    `;
    this.root.appendChild(indicator);
    this.indicatorEl = indicator;

    let startY = 0;
    let startX = 0;
    let isPulling = false;
    let pullDistance = 0;

    const isAtScrollTop = (target: EventTarget | null): boolean => {
      let el = target as HTMLElement | null;
      while (el && el !== document.body && el !== document.documentElement && el !== this.root) {
        if (el.scrollTop > 1) {
          return false;
        }
        el = el.parentElement;
      }
      return true;
    };

    this.boundTouchStartHandler = (e: TouchEvent) => {
      if (!e.touches || e.touches.length !== 1) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
        return;
      }
      if (!isAtScrollTop(target)) {
        return;
      }
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      isPulling = false;
      pullDistance = 0;
    };

    this.boundTouchMoveHandler = (e: TouchEvent) => {
      if (!e.touches || e.touches.length !== 1 || startY === 0) return;
      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      const diffY = currentY - startY;
      const diffX = Math.abs(currentX - startX);

      // If predominantly horizontal, ignore and abort pull to refresh
      if (diffX > Math.abs(diffY)) {
        if (isPulling) {
          this.reset();
          isPulling = false;
        }
        return;
      }

      // If pulling down while at the top of scrollable content
      if (diffY > 10 && isAtScrollTop(e.target)) {
        isPulling = true;
        pullDistance = Math.min(90, diffY * 0.5);
        if (e.cancelable) {
          e.preventDefault();
        }
        this.update(pullDistance, this.threshold);
      } else if (isPulling && diffY <= 0) {
        this.reset();
        isPulling = false;
      }
    };

    this.boundTouchEndHandler = () => {
      if (isPulling) {
        if (pullDistance >= this.threshold) {
          this.trigger();
        } else {
          this.reset();
        }
      }
      startY = 0;
      startX = 0;
      isPulling = false;
      pullDistance = 0;
    };

    window.addEventListener("touchstart", this.boundTouchStartHandler, { passive: true });
    window.addEventListener("touchmove", this.boundTouchMoveHandler, { passive: false });
    window.addEventListener("touchend", this.boundTouchEndHandler, { passive: true });
    window.addEventListener("touchcancel", this.boundTouchEndHandler, { passive: true });
  }

  private update(distance: number, threshold: number): void {
    if (!this.indicatorEl) return;
    const label = this.indicatorEl.querySelector(".omni-pull-label");
    const iconEl = this.indicatorEl.querySelector<HTMLElement>("svg");

    this.indicatorEl.style.transition = "none";
    this.indicatorEl.style.opacity = Math.min(1, distance / 25).toString();
    this.indicatorEl.style.transform = `translate(-50%, ${distance}px)`;

    if (iconEl) {
      iconEl.style.transform = `rotate(${distance * 4.5}deg)`;
    }

    if (label) {
      if (distance >= threshold) {
        label.textContent = "release to refresh";
        this.indicatorEl.classList.add("ready");
      } else {
        label.textContent = "pull down to refresh";
        this.indicatorEl.classList.remove("ready");
      }
    }
  }

  private reset(): void {
    if (!this.indicatorEl) return;
    this.indicatorEl.style.transition = "transform 0.22s ease, opacity 0.22s ease";
    this.indicatorEl.style.opacity = "0";
    this.indicatorEl.style.transform = "translate(-50%, -100%)";
    this.indicatorEl.classList.remove("ready", "is-refreshing");
  }

  private trigger(): void {
    if (!this.indicatorEl) return;
    const label = this.indicatorEl.querySelector(".omni-pull-label");
    if (label) label.textContent = "refreshing...";
    this.indicatorEl.classList.add("is-refreshing");
    this.indicatorEl.style.transition = "transform 0.15s ease";
    this.indicatorEl.style.transform = "translate(-50%, 48px)";

    setTimeout(() => {
      this.onRefresh();
    }, 280);
  }

  public destroy(): void {
    if (typeof window !== "undefined") {
      if (this.boundTouchStartHandler) window.removeEventListener("touchstart", this.boundTouchStartHandler);
      if (this.boundTouchMoveHandler) window.removeEventListener("touchmove", this.boundTouchMoveHandler);
      if (this.boundTouchEndHandler) {
        window.removeEventListener("touchend", this.boundTouchEndHandler);
        window.removeEventListener("touchcancel", this.boundTouchEndHandler);
      }
    }
    this.boundTouchStartHandler = null;
    this.boundTouchMoveHandler = null;
    this.boundTouchEndHandler = null;
    this.indicatorEl?.remove();
    this.indicatorEl = null;
  }
}
