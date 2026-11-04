// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { html } from "../src/schema/html.js";

describe("html tagged template helper", () => {
  it("renders safe HTML elements with escaped text", () => {
    const dangerousString = "<script>alert('xss')</script>";
    const el = html`<div class="card"><p>${dangerousString}</p></div>` as HTMLElement;

    expect(el.tagName.toLowerCase()).toBe("div");
    expect(el.className).toBe("card");
    expect(el.querySelector("script")).toBeNull();
    expect(el.querySelector("p")?.textContent).toBe(dangerousString);
  });

  it("binds event listeners directly to the DOM element", () => {
    const handleClick = vi.fn();
    const btn = html`<button onclick=${handleClick}>Click Me</button>` as HTMLButtonElement;

    expect(btn.tagName.toLowerCase()).toBe("button");
    btn.click();
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("embeds nested DOM nodes directly into placeholder slots", () => {
    const icon = document.createElement("span");
    icon.className = "icon";
    icon.textContent = "★";

    const badge = html`<div class="badge">${icon} Featured</div>` as HTMLElement;
    expect(badge.querySelector(".icon")).toBe(icon);
    expect(badge.textContent).toBe("★ Featured");
  });
});
