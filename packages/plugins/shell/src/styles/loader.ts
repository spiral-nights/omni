/**
 * Shared stylesheet injector for Omni Shells.
 * Injects the shell-specific stylesheet into document.head upon mount,
 * and removes or replaces it when the shell is unmounted.
 */
export const OMNI_SHELL_STYLE_ELEMENT_ID = "omni-active-shell-style";

export function mountShellStyles(css: string, elementId = OMNI_SHELL_STYLE_ELEMENT_ID): HTMLStyleElement | null {
  if (typeof document === "undefined") return null;

  let styleEl = document.getElementById(elementId) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = elementId;
    styleEl.setAttribute("data-omni-shell-theme", "true");
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = css;
  return styleEl;
}

export function unmountShellStyles(elementId = OMNI_SHELL_STYLE_ELEMENT_ID): void {
  if (typeof document === "undefined") return;

  const styleEl = document.getElementById(elementId);
  if (styleEl) {
    styleEl.remove();
  }
}
