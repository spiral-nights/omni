/// <reference types="@omni/types" />

/**
 * Native zero-dependency HTML template helper using standard <template>.
 */
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

interface TaskItem {
  id: number;
  text: string;
  done: boolean;
}

async function mountChecklist(root: any) {
  let tasks: TaskItem[] = [
    { id: 1, text: "Send Nostr note", done: true },
    { id: 2, text: "Review Omni PR", done: false },
    { id: 3, text: "Test Focus Timer", done: false }
  ];

  try {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem("tasks");
      if (stored) tasks = JSON.parse(stored);
    }
  } catch {}

  function persistTasks() {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("tasks", JSON.stringify(tasks));
      }
    } catch {}
  }

  const card = html<HTMLDivElement>`
    <div class="checklist-widget-card" style="background: var(--bg-surface, #191816); border: 1px solid var(--border-strong, #383530); border-radius: var(--radius-md, 10px); padding: 16px; display: flex; flex-direction: column; gap: 12px; color: var(--text-primary, #ede8df);">
      <div class="widget-header" style="display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; font-size: 0.95rem; font-weight: 600; color: var(--text-primary, #ede8df);">Daily Tasks</h3>
      </div>
      <div class="task-input-row" style="display: flex; gap: 8px;">
        <input class="task-input" type="text" placeholder="Add task..." style="flex: 1; background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); color: var(--text-primary, #ede8df); padding: 8px 12px; border-radius: var(--radius-sm, 6px); font-size: 0.88rem;" />
        <button class="btn-add-task" style="background: var(--accent-primary, #d4a373); color: var(--accent-contrast, #141312); border: none; border-radius: var(--radius-sm, 6px); padding: 0 14px; font-size: 1.1rem; font-weight: 600; cursor: pointer;">+</button>
      </div>
      <ul class="task-list" style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px;"></ul>
    </div>
  `;

  const input = card.querySelector<HTMLInputElement>(".task-input")!;
  const addBtn = card.querySelector<HTMLButtonElement>(".btn-add-task")!;
  const ul = card.querySelector<HTMLUListElement>(".task-list")!;

  function renderTasks() {
    ul.replaceChildren();
    for (const t of tasks) {
      const li = html<HTMLLIElement>`
        <li class="task-item" style="display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border-subtle, #272522); font-size: 0.9rem;">
          <input type="checkbox" class="task-checkbox" ${t.done ? "checked" : ""} style="accent-color: var(--accent-primary, #d4a373); width: 18px; height: 18px; cursor: pointer;" />
          <span class="task-text" style="flex: 1; margin-left: 10px; ${t.done ? "text-decoration: line-through; opacity: 0.6;" : ""}">${escapeHtml(t.text)}</span>
          <button class="delete-task-btn" style="background: transparent; color: var(--text-muted, #78716c); border: none; font-size: 1.1rem; padding: 2px 6px; cursor: pointer;">×</button>
        </li>
      `;

      const cb = li.querySelector<HTMLInputElement>(".task-checkbox")!;
      cb.addEventListener("change", async () => {
        t.done = cb.checked;
        persistTasks();
        renderTasks();
      });

      const delBtn = li.querySelector<HTMLButtonElement>(".delete-task-btn")!;
      delBtn.addEventListener("click", async () => {
        const idx = tasks.findIndex((item) => item.id === t.id);
        if (idx !== -1) {
          tasks.splice(idx, 1);
          persistTasks();
          renderTasks();
        }
      });

      ul.appendChild(li);
    }
  }

  addBtn.addEventListener("click", async () => {
    const val = input.value?.trim();
    if (!val) return;
    tasks.push({ id: Date.now(), text: val, done: false });
    input.value = "";
    persistTasks();
    renderTasks();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      addBtn.click();
    }
  });

  renderTasks();
  root.appendChild(card);
}

async function mountChecklistSettings(root: any) {
  let tasks: TaskItem[] = [];
  try {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem("tasks");
      if (stored) tasks = JSON.parse(stored);
    }
  } catch {}

  const container = html<HTMLDivElement>`
    <div class="checklist-settings-container" style="display: flex; flex-direction: column; gap: 12px; font-family: inherit; color: var(--text-primary, #ede8df);">
      <h4 style="margin: 0; font-size: 0.95rem; font-weight: 600; color: var(--accent-primary, #d4a373);">Daily Checklist Settings</h4>
      <p style="margin: 0; font-size: 0.78rem; color: var(--text-muted, #78716c);">Manage persistent tasks storage and cleanup completed items.</p>
      <div class="checklist-stats-row" style="display: flex; gap: 16px; font-size: 0.8rem; background: var(--bg-subtle, #2a2824); padding: 8px 12px; border-radius: var(--radius-sm, 6px);">
        <span class="total-tasks-label">Total Tasks: ${tasks.length}</span>
        <span class="completed-tasks-label">Completed: ${tasks.filter((t) => t.done).length}</span>
      </div>
      <div style="display: flex; gap: 8px; margin-top: 4px;">
        <button class="btn-clear-tasks" style="background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); color: var(--text-primary, #ede8df); padding: 6px 12px; border-radius: var(--radius-sm, 6px); font-size: 0.78rem; cursor: pointer;">Clear Completed Tasks</button>
      </div>
    </div>
  `;

  const totalSpan = container.querySelector<HTMLElement>(".total-tasks-label")!;
  const completedSpan = container.querySelector<HTMLElement>(".completed-tasks-label")!;
  const btnClear = container.querySelector<HTMLButtonElement>(".btn-clear-tasks")!;

  btnClear.addEventListener("click", async () => {
    tasks = tasks.filter((t) => !t.done);
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("tasks", JSON.stringify(tasks));
      }
    } catch (_) {}
    totalSpan.textContent = `Total Tasks: ${tasks.length}`;
    completedSpan.textContent = `Completed: 0`;
    btnClear.textContent = "Cleared!";
    setTimeout(() => {
      btnClear.textContent = "Clear Completed Tasks";
    }, 1500);
  });

  root.appendChild(container);
}

function isSettingsRoute(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const search = window.location.search || "";
    if (new URLSearchParams(search).get("view") === "settings") return true;
    if (window.location.hash.includes("settings")) return true;
    if ((window as any).__OMNI_ROUTE__?.includes("settings")) return true;
    if ((window as any).__OMNI_VIEW__ === "settings") return true;
  } catch (_) {}
  return false;
}

function isCompactRoute(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const search = window.location.search || "";
    if (new URLSearchParams(search).get("view") === "compact") return true;
    if (window.location.hash.includes("compact")) return true;
    if ((window as any).__OMNI_ROUTE__?.includes("compact")) return true;
    if ((window as any).__OMNI_VIEW__ === "compact") return true;
  } catch (_) {}
  return false;
}

function mountChecklistCompact(root: any) {
  let tasks: TaskItem[] = [
    { id: 1, text: "Send Nostr note", done: true },
    { id: 2, text: "Review Omni PR", done: false },
    { id: 3, text: "Test Focus Timer", done: false }
  ];

  try {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem("tasks");
      if (stored) tasks = JSON.parse(stored);
    }
  } catch {}

  const completed = tasks.filter((t) => t.done).length;
  const total = tasks.length;
  const nextPending = tasks.find((t) => !t.done);
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  const container = html<HTMLDivElement>`
    <div class="checklist-compact-card" style="display: flex; flex-direction: column; justify-content: center; height: 100%; width: 100%; gap: 6px; padding: 4px; box-sizing: border-box; color: #ffffff; font-family: inherit;">
      <div style="display: flex; justify-content: space-between; align-items: baseline;">
        <span style="font-size: 1.5rem; font-weight: 700; line-height: 1;">${completed}/${total}</span>
        <span style="font-size: 0.72rem; opacity: 0.85;">${percent}% done</span>
      </div>
      <div style="width: 100%; height: 4px; background: rgba(255, 255, 255, 0.25); border-radius: 2px; overflow: hidden;">
        <div style="width: ${percent}%; height: 100%; background: #ffffff;"></div>
      </div>
      <div style="font-size: 0.75rem; opacity: 0.9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px;">
        ${nextPending ? `Next: ${escapeHtml(nextPending.text)}` : "All tasks complete!"}
      </div>
    </div>
  `;

  root.appendChild(container);
}

const mountApp = (root: any) => {
  if (isSettingsRoute()) {
    mountChecklistSettings(root);
  } else if (isCompactRoute()) {
    mountChecklistCompact(root);
  } else {
    mountChecklist(root);
  }
};

function init() {
  if (typeof document !== "undefined") {
    mountApp(document.body);
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
