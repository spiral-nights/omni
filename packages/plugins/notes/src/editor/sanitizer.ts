/**
 * Zero-Dependency HTML Sanitizer for Notes Editor
 * Whitelists formatting tags and cleans unsafe scripts/attributes.
 */

const ALLOWED_TAGS = new Set([
  "b", "strong", "i", "em", "u", "s", "strike", "del",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "div", "span", "br", "hr",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
  "a"
]);

export function sanitizeNoteHtml(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== "string") return "";

  if (typeof DOMParser === "undefined") {
    // Basic regex fallback for non-browser / test environments if needed
    return rawHtml
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
      .replace(/\s*on\w+="[^"]*"/gi, "")
      .replace(/\s*on\w+='[^']*'/gi, "");
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, "text/html");

  function cleanNode(node: Node): void {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const tagName = el.tagName.toLowerCase();

        if (!ALLOWED_TAGS.has(tagName)) {
          // Unwrap or remove node
          if (tagName === "script" || tagName === "style" || tagName === "iframe" || tagName === "object" || tagName === "embed") {
            el.remove();
            continue;
          } else {
            // Replace with text content
            const textNode = doc.createTextNode(el.textContent || "");
            el.replaceWith(textNode);
            continue;
          }
        }

        // Strip disallowed attributes (keep only href for links if safe)
        const attrs = Array.from(el.attributes);
        for (const attr of attrs) {
          const name = attr.name.toLowerCase();
          if (tagName === "a" && name === "href") {
            const val = attr.value.trim().toLowerCase();
            if (val.startsWith("javascript:") || val.startsWith("data:")) {
              el.removeAttribute(attr.name);
            }
          } else {
            el.removeAttribute(attr.name);
          }
        }

        cleanNode(el);
      }
    }
  }

  cleanNode(doc.body);
  return doc.body.innerHTML;
}
