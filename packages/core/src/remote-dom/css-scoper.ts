/**
 * CSS Scoper for Remote DOM Sandboxed Plugins
 *
 * Ensures that guest <style> stylesheets projected into the host DOM
 * cannot pollute the global host document (e.g. document.body, :root,
 * html, or unqualified universal/class selectors).
 *
 * Scopes all selectors to the component container element (scopeSelector),
 * rewriting root/body references to the container itself.
 */

function scopeSingleSelector(sel: string, scope: string): string {
  sel = sel.trim();
  if (!sel) return "";

  // If already scoped to this container, do not double-prefix
  if (sel === scope || sel.startsWith(scope + " ") || sel.startsWith(scope + ">") || sel.startsWith(scope + ":") || sel.startsWith(scope + ".")) {
    return sel;
  }

  // Handle "html body" or "html > body"
  if (/^html(\s+|>)\s*body(\b|$)/i.test(sel)) {
    return sel.replace(/^html(\s+|>)\s*body/i, scope);
  }

  // Handle root/host/body selectors
  if (/^(body|html|:root|:host|:scope)(\b|$)/i.test(sel)) {
    return sel.replace(/^(body|html|:root|:host|:scope)/i, scope);
  }

  // Descendant selector inside the scope
  return scope + " " + sel;
}

function scopeSelectorList(selectors: string, scope: string): string {
  const parts: string[] = [];
  let cur = "";
  let depth = 0;

  for (let i = 0; i < selectors.length; i++) {
    const ch = selectors[i];
    if (ch === "(" || ch === "[") {
      depth++;
    } else if (ch === ")" || ch === "]") {
      depth = Math.max(0, depth - 1);
    } else if (ch === "," && depth === 0) {
      if (cur.trim()) parts.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());

  return parts.map((p) => scopeSingleSelector(p, scope)).join(", ");
}

/**
 * Scopes a complete CSS stylesheet string under the given scopeSelector.
 */
export function scopeCss(cssText: string, scopeSelector: string): string {
  if (!cssText || !scopeSelector) return cssText;

  let pos = 0;
  const len = cssText.length;
  let result = "";

  while (pos < len) {
    // 1. Preserve leading whitespace
    const startWs = pos;
    while (pos < len && /\s/.test(cssText[pos])) pos++;
    result += cssText.slice(startWs, pos);
    if (pos >= len) break;

    // 2. Preserve CSS comments
    if (cssText[pos] === "/" && cssText[pos + 1] === "*") {
      const commentEnd = cssText.indexOf("*/", pos + 2);
      if (commentEnd === -1) {
        result += cssText.slice(pos);
        break;
      }
      result += cssText.slice(pos, commentEnd + 2);
      pos = commentEnd + 2;
      continue;
    }

    // 3. Find next rule delimiter: '{' or ';'
    let bracketCount = 0;
    const startPos = pos;
    while (pos < len) {
      const ch = cssText[pos];
      if (ch === "{" && bracketCount === 0) break;
      if (ch === ";" && bracketCount === 0) break;
      if (ch === "(" || ch === "[") bracketCount++;
      else if (ch === ")" || ch === "]") bracketCount = Math.max(0, bracketCount - 1);
      pos++;
    }

    const selectorOrAt = cssText.slice(startPos, pos).trim();
    if (pos >= len) {
      result += cssText.slice(startPos);
      break;
    }

    if (cssText[pos] === ";") {
      // Top-level at-rule statement like @import or @charset
      result += selectorOrAt + ";";
      pos++;
      continue;
    }

    // Advance past '{'
    pos++;
    const blockStart = pos;
    let depth = 1;

    while (pos < len && depth > 0) {
      const ch = cssText[pos];
      if (ch === "/" && cssText[pos + 1] === "*") {
        const commentEnd = cssText.indexOf("*/", pos + 2);
        if (commentEnd === -1) {
          pos = len;
          break;
        }
        pos = commentEnd + 2;
        continue;
      }
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      if (depth > 0) pos++;
    }

    const blockBody = cssText.slice(blockStart, pos);
    pos++; // advance past closing '}'

    if (selectorOrAt.startsWith("@")) {
      const atRuleName = selectorOrAt.split(/\s+/)[0].toLowerCase();
      // Keep keyframes, font-face, page un-scoped
      if (
        atRuleName === "@keyframes" ||
        atRuleName === "@-webkit-keyframes" ||
        atRuleName === "@font-face" ||
        atRuleName === "@page"
      ) {
        result += selectorOrAt + " {" + blockBody + "}";
      } else if (
        atRuleName === "@media" ||
        atRuleName === "@supports" ||
        atRuleName === "@container"
      ) {
        // Recursively scope rules inside conditional at-rule blocks
        result += selectorOrAt + " {" + scopeCss(blockBody, scopeSelector) + "}";
      } else {
        result += selectorOrAt + " {" + blockBody + "}";
      }
    } else {
      // Standard style rule
      const scopedSelector = scopeSelectorList(selectorOrAt, scopeSelector);
      result += scopedSelector + " {" + blockBody + "}";
    }
  }

  return result;
}
