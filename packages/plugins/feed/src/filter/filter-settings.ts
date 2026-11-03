import {
  DEFAULT_FILTER_PATTERNS,
  loadFilterPatterns,
  saveFilterPatterns,
  compileFilterRegex
} from "./content-filter.js";

const TRASH_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;

function html<T extends HTMLElement = HTMLElement>(
  strings: TemplateStringsArray,
  ...values: any[]
): T {
  const template = document.createElement("template");
  template.innerHTML = strings.reduce((acc, str, i) => acc + str + (values[i] ?? ""), "").trim();
  return template.content.firstElementChild as T;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const STORAGE_KEY_FEED_INLINE_IMAGES = "omni_feed_inline_images";

export function loadInlineImagesPreference(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY_FEED_INLINE_IMAGES) === "true";
  } catch (_) {
    return false;
  }
}

export function saveInlineImagesPreference(enabled: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_FEED_INLINE_IMAGES, String(enabled));
  } catch (_) {}
}

export function renderFilterSettings(container: HTMLElement, onFiltersChanged?: (patterns: string[]) => void) {
  let patterns = loadFilterPatterns();
  let inlineImages = loadInlineImagesPreference();

  const wrapper = html<HTMLDivElement>`
    <div class="feed-filter-settings" style="display: flex; flex-direction: column; gap: 18px; font-family: inherit; color: var(--text-primary, #ede8df);">
      <!-- Display Preferences -->
      <div class="feed-display-preferences" style="display: flex; flex-direction: column; gap: 8px;">
        <h3 style="margin: 0; font-size: 1rem; font-weight: 600; color: var(--text-primary, #ede8df);">Display Preferences</h3>
        <div class="feed-media-settings-box" style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-subtle, #22201d); padding: 12px; border-radius: var(--radius-sm, 6px); border: 1px solid var(--border-subtle, #33312c);">
          <div style="flex: 1; padding-right: 12px;">
            <div style="font-size: 0.82rem; font-weight: 600; color: var(--text-primary, #ede8df);">Inline Image Previews</div>
            <div style="font-size: 0.75rem; color: var(--text-muted, #78716c); margin-top: 2px;">
              Display image previews directly in feed posts. When turned off (default), image URLs appear as prominent clickable callout links.
            </div>
          </div>
          <label style="display: inline-flex; align-items: center; cursor: pointer;">
            <input type="checkbox" id="feed-toggle-inline-images" class="feed-toggle-inline-images" ${inlineImages ? "checked" : ""} style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--omni-accent-primary, #d4a373);" />
          </label>
        </div>
      </div>

      <div class="filter-header-row">
        <h3 style="margin: 0; font-size: 1rem; font-weight: 600; color: var(--text-primary, #ede8df);">Content Filters</h3>
        <p style="margin: 4px 0 0 0; font-size: 0.8rem; color: var(--text-muted, #78716c);">
          Filter notes out of your feed using regular expressions. By default, raw JSON payloads (starting with { and ending with }, ignoring whitespace) are filtered out.
        </p>
      </div>

      <!-- Add Pattern Box -->
      <div class="filter-add-box" style="display: flex; flex-direction: column; gap: 8px; background: var(--bg-subtle, #22201d); padding: 12px; border-radius: var(--radius-sm, 6px); border: 1px solid var(--border-subtle, #33312c);">
        <label style="font-size: 0.78rem; font-weight: 600; color: var(--text-secondary, #9e988f);" for="input-filter-pattern">
          Add Regex Pattern
        </label>
        <div style="display: flex; gap: 8px;">
          <input id="input-filter-pattern" class="filter-pattern-input" type="text" spellcheck="false" placeholder="e.g. ^\\s*\\{[\\s\\S]*\\}\\s*$ or \\b(spam|bot)\\b" style="flex: 1; background: var(--bg-canvas, #141312); border: 1px solid var(--border-strong, #44413c); color: var(--text-primary, #ede8df); padding: 7px 10px; border-radius: var(--radius-sm, 6px); font-family: monospace; font-size: 0.82rem;" />
          <button class="btn-add-pattern" style="background: var(--omni-accent-primary, var(--accent-primary, #d4a373)); color: var(--accent-contrast, #141312); border: none; padding: 7px 14px; border-radius: var(--radius-sm, 6px); font-size: 0.8rem; font-weight: 600; cursor: pointer;">
            Add Filter
          </button>
        </div>
        <div class="filter-status-message" style="font-size: 0.75rem; min-height: 16px; color: var(--text-muted, #78716c);"></div>
      </div>

      <!-- Active Patterns List -->
      <div class="filter-list-section" style="display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong style="font-size: 0.82rem; color: var(--text-secondary, #9e988f);">Active Patterns (<span class="pattern-count">${patterns.length}</span>)</strong>
          <button class="btn-reset-patterns" style="background: transparent; border: 1px solid var(--border-subtle, #33312c); color: var(--text-muted, #78716c); padding: 4px 10px; border-radius: var(--radius-sm, 6px); font-size: 0.72rem; cursor: pointer;">
            Reset to Defaults
          </button>
        </div>
        <div class="filter-patterns-list" style="display: flex; flex-direction: column; gap: 6px;"></div>
      </div>
    </div>
  `;

  const input = wrapper.querySelector<HTMLInputElement>(".filter-pattern-input")!;
  const btnAdd = wrapper.querySelector<HTMLButtonElement>(".btn-add-pattern")!;
  const btnReset = wrapper.querySelector<HTMLButtonElement>(".btn-reset-patterns")!;
  const statusMsg = wrapper.querySelector<HTMLDivElement>(".filter-status-message")!;
  const patternCount = wrapper.querySelector<HTMLElement>(".pattern-count")!;
  const listEl = wrapper.querySelector<HTMLDivElement>(".filter-patterns-list")!;
  const toggleInlineImages = wrapper.querySelector<HTMLInputElement>(".feed-toggle-inline-images");

  toggleInlineImages?.addEventListener("change", () => {
    saveInlineImagesPreference(toggleInlineImages.checked);
    setStatus(toggleInlineImages.checked ? "Inline images enabled." : "Inline images disabled (links only).");
    onFiltersChanged?.(patterns);
  });

  function setStatus(text: string, isError = false) {
    if (!statusMsg) return;
    statusMsg.textContent = text;
    statusMsg.style.color = isError ? "var(--accent-danger, #e11d48)" : "var(--omni-accent-primary, var(--accent-primary, #d4a373))";
    if (text && !isError) {
      setTimeout(() => {
        if (statusMsg.textContent === text) {
          statusMsg.textContent = "";
        }
      }, 3000);
    }
  }

  function renderPatterns() {
    listEl.innerHTML = "";
    patternCount.textContent = String(patterns.length);

    if (patterns.length === 0) {
      const emptyEl = html<HTMLDivElement>`
        <div class="empty-patterns" style="font-size: 0.78rem; color: var(--text-muted, #78716c); font-style: italic; padding: 8px 0;">
          No active filters. All notes will be displayed in the feed.
        </div>
      `;
      listEl.appendChild(emptyEl);
      return;
    }

    for (let i = 0; i < patterns.length; i++) {
      const pat = patterns[i];
      const isJsonDefault = pat === "^\\s*\\{[\\s\\S]*\\}\\s*$";
      const row = html<HTMLDivElement>`
        <div class="pattern-item" data-index="${i}" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; background: var(--bg-surface, #191816); border: 1px solid var(--border-subtle, #2a2824); padding: 8px 12px; border-radius: var(--radius-sm, 6px);">
          <div style="display: flex; align-items: center; gap: 8px; overflow: hidden; min-width: 0;">
            <code class="feed-pattern-code" style="font-family: monospace; font-size: 0.82rem; color: var(--omni-accent-primary, var(--accent-primary, #d4a373)); word-break: break-all;">${escapeHtml(pat)}</code>
            ${isJsonDefault ? `<span class="pattern-badge-default" style="font-size: 0.7rem; color: var(--text-muted, #78716c); white-space: nowrap;">(JSON payloads default)</span>` : ""}
          </div>
          <button class="btn-remove-pattern" data-index="${i}" title="Remove pattern" aria-label="Remove pattern" style="background: transparent; border: none; color: var(--text-muted, #78716c); cursor: pointer; padding: 4px; display: flex; align-items: center;">
            ${TRASH_ICON}
          </button>
        </div>
      `;

      row.querySelector<HTMLButtonElement>(".btn-remove-pattern")?.addEventListener("click", () => {
        patterns.splice(i, 1);
        saveFilterPatterns(patterns);
        renderPatterns();
        setStatus("Filter pattern removed.");
        onFiltersChanged?.(patterns);
      });

      listEl.appendChild(row);
    }
  }

  function handleAddPattern() {
    const rawVal = input.value.trim();
    if (!rawVal) {
      setStatus("Please enter a regular expression.", true);
      return;
    }

    const compiled = compileFilterRegex(rawVal);
    if (!compiled) {
      setStatus("Invalid regular expression syntax.", true);
      return;
    }

    if (patterns.includes(rawVal)) {
      setStatus("This filter pattern already exists.", true);
      return;
    }

    patterns.push(rawVal);
    saveFilterPatterns(patterns);
    input.value = "";
    renderPatterns();
    setStatus("Filter pattern added successfully.");
    onFiltersChanged?.(patterns);
  }

  btnAdd.addEventListener("click", handleAddPattern);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleAddPattern();
  });

  btnReset.addEventListener("click", () => {
    patterns = [...DEFAULT_FILTER_PATTERNS];
    saveFilterPatterns(patterns);
    renderPatterns();
    setStatus("Reset to default filters.");
    onFiltersChanged?.(patterns);
  });

  renderPatterns();
  container.appendChild(wrapper);
}

export function mountFeedSettings(root: any) {
  const container = html<HTMLDivElement>`
    <div class="feed-standalone-settings" style="padding: 16px 20px; font-family: inherit; color: var(--text-primary, #ede8df);">
      <div class="feed-settings-content"></div>
    </div>
  `;
  const content = container.querySelector<HTMLDivElement>(".feed-settings-content")!;
  renderFilterSettings(content);
  root.appendChild(container);
  return container;
}
