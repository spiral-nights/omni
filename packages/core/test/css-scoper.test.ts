import { describe, it, expect } from "vitest";
import { scopeCss } from "../src/remote-dom/css-scoper.js";

describe("scopeCss Utility", () => {
  const scope = '[data-omni-comp-id="my-plugin"]';

  it("rewrites body, html, :root, and :scope to target the container directly", () => {
    const input = `
      :root { --accent: #ff0000; color-scheme: light; }
      body { background-color: #fdfaf7; color: #1e1b4b; min-height: 100vh; }
      html, body { height: 100%; margin: 0; }
    `;
    const scoped = scopeCss(input, scope);

    expect(scoped).toContain(`${scope} { --accent: #ff0000; color-scheme: light; }`);
    expect(scoped).toContain(`${scope} { background-color: #fdfaf7; color: #1e1b4b; min-height: 100vh; }`);
    expect(scoped).toContain(`${scope}, ${scope} { height: 100%; margin: 0; }`);

    // Verify it never targets bare body or :root
    expect(/(?:^|[^\w-])body\s*\{/.test(scoped)).toBe(false);
    expect(/(?:^|[^\w-]):root\s*\{/.test(scoped)).toBe(false);
  });

  it("prefixes universal and class selectors to confine them to the container", () => {
    const input = `
      * { box-sizing: border-box; }
      .card { padding: 16px; border-radius: 8px; }
      button.btn-primary:hover { background: blue; }
      #root { display: flex; }
    `;
    const scoped = scopeCss(input, scope);

    expect(scoped).toContain(`${scope} * { box-sizing: border-box; }`);
    expect(scoped).toContain(`${scope} .card { padding: 16px; border-radius: 8px; }`);
    expect(scoped).toContain(`${scope} button.btn-primary:hover { background: blue; }`);
    expect(scoped).toContain(`${scope} #root { display: flex; }`);
  });

  it("scopes rules nested inside @media and @supports queries", () => {
    const input = `
      @media (max-width: 600px) {
        body { padding: 10px; }
        .card { width: 100%; }
      }
    `;
    const scoped = scopeCss(input, scope);

    expect(scoped).toContain("@media (max-width: 600px)");
    expect(scoped).toContain(`${scope} { padding: 10px; }`);
    expect(scoped).toContain(`${scope} .card { width: 100%; }`);
  });

  it("preserves @keyframes stops without scoping them", () => {
    const input = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        50% { transform: rotate(180deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    const scoped = scopeCss(input, scope);

    expect(scoped).toContain("@keyframes spin");
    expect(scoped).toContain("0% { transform: rotate(0deg); }");
    expect(scoped).toContain("50% { transform: rotate(180deg); }");
    expect(scoped).toContain("100% { transform: rotate(360deg); }");
  });

  it("preserves @font-face and @import rules untouched", () => {
    const input = `
      @import url('https://fonts.googleapis.com/css2?family=Fredoka');
      @font-face {
        font-family: 'CustomFont';
        src: url('custom.woff2');
      }
    `;
    const scoped = scopeCss(input, scope);

    expect(scoped).toContain("@import url('https://fonts.googleapis.com/css2?family=Fredoka');");
    expect(scoped).toContain("@font-face {\n        font-family: 'CustomFont';\n        src: url('custom.woff2');\n      }");
  });

  it("preserves comments without corrupting subsequent rules", () => {
    const input = `
      /* Header styles */
      .header { display: flex; }
      /* Body background
         multi-line comment */
      body { background: white; }
    `;
    const scoped = scopeCss(input, scope);

    expect(scoped).toContain("/* Header styles */");
    expect(scoped).toContain(`${scope} .header { display: flex; }`);
    expect(scoped).toContain("/* Body background\n         multi-line comment */");
    expect(scoped).toContain(`${scope} { background: white; }`);
  });

  it("does not double-scope already scoped selectors", () => {
    const input = `
      ${scope} { background: #fff; }
      ${scope} .child { color: blue; }
    `;
    const scoped = scopeCss(input, scope);

    expect(scoped).toContain(`${scope} { background: #fff; }`);
    expect(scoped).toContain(`${scope} .child { color: blue; }`);
    expect(scoped.includes(`${scope} ${scope}`)).toBe(false);
  });
});
