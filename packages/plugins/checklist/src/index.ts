/// <reference types="@omni/types" />

interface TaskItem {
  id: number;
  text: string;
  done: boolean;
}

async function mountChecklist(root: any) {
  const isRemote = typeof root.createElement === "function";
  const createElement = (tag: string) => isRemote ? root.createElement(tag) : document.createElement(tag);

  const card = createElement("div");
  card.className = "checklist-widget-card";

  const header = createElement("div");
  header.className = "widget-header";
  const title = createElement("h3");
  title.textContent = "Daily Tasks";
  header.appendChild(title);
  card.appendChild(header);

  // Input form
  const form = createElement("div");
  form.className = "task-input-row";
  const input = createElement("input");
  input.type = "text";
  input.placeholder = "Add task...";
  const addBtn = createElement("button");
  addBtn.textContent = "+";
  form.appendChild(input);
  form.appendChild(addBtn);
  card.appendChild(form);

  // List container
  const ul = createElement("ul");
  ul.className = "task-list";
  card.appendChild(ul);

  // Load initial tasks from storage
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

  function renderTasks() {
    ul.replaceChildren();
    for (const t of tasks) {
      const li = createElement("li");
      li.className = "task-item";

      const cb = createElement("input");
      cb.type = "checkbox";
      cb.checked = t.done;
      cb.addEventListener("change", async () => {
        t.done = cb.checked;
        await persistTasks();
        renderTasks();
      });

      const span = createElement("span");
      span.textContent = t.text;
      if (t.done) span.style.textDecoration = "line-through";

      const delBtn = createElement("button");
      delBtn.className = "delete-task-btn";
      delBtn.textContent = "×";
      delBtn.addEventListener("click", async () => {
        const idx = tasks.findIndex((item) => item.id === t.id);
        if (idx !== -1) {
          tasks.splice(idx, 1);
          await persistTasks();
          renderTasks();
        }
      });

      li.appendChild(cb);
      li.appendChild(span);
      li.appendChild(delBtn);
      ul.appendChild(li);
    }
  }

  addBtn.addEventListener("click", async () => {
    const val = input.value?.trim();
    if (!val) return;
    tasks.push({ id: Date.now(), text: val, done: false });
    input.value = "";
    await persistTasks();
    renderTasks();
  });

  renderTasks();
  root.appendChild(card);
}

async function mountChecklistSettings(root: any) {
  const isRemote = typeof root.createElement === "function";
  const createElement = (tag: string) => isRemote ? root.createElement(tag) : document.createElement(tag);

  const container = createElement("div");
  container.className = "checklist-settings-container";
  container.style.cssText = "display: flex; flex-direction: column; gap: 12px; font-family: var(--omni-font-sans, system-ui); color: var(--omni-text-primary, #ede8df);";

  const title = createElement("h4");
  title.textContent = "Daily Checklist Settings";
  title.style.cssText = "margin: 0; font-size: 0.95rem; font-weight: 600; color: var(--omni-accent-primary, #d4a373);";
  container.appendChild(title);

  const desc = createElement("p");
  desc.textContent = "Manage persistent tasks storage and cleanup completed items.";
  desc.style.cssText = "margin: 0; font-size: 0.78rem; color: var(--omni-text-muted, #9e988f);";
  container.appendChild(desc);

  // Status stats
  let tasks: TaskItem[] = [];
  try {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem("tasks");
      if (stored) tasks = JSON.parse(stored);
    }
  } catch {}

  const statsRow = createElement("div");
  statsRow.style.cssText = "display: flex; gap: 16px; font-size: 0.8rem; background: var(--omni-bg-subtle, #2a2723); padding: 8px 12px; border-radius: 4px;";
  const totalSpan = createElement("span");
  totalSpan.textContent = `Total Tasks: ${tasks.length}`;
  const completedSpan = createElement("span");
  completedSpan.textContent = `Completed: ${tasks.filter(t => t.done).length}`;
  statsRow.appendChild(totalSpan);
  statsRow.appendChild(completedSpan);
  container.appendChild(statsRow);

  // Action Buttons
  const actionsRow = createElement("div");
  actionsRow.style.cssText = "display: flex; gap: 8px; margin-top: 4px;";

  const btnClear = createElement("button");
  btnClear.textContent = "Clear Completed Tasks";
  btnClear.className = "btn-secondary";
  btnClear.style.cssText = "background: var(--omni-bg-subtle, #2a2723); border: 1px solid var(--omni-border-strong, #3d3933); color: var(--omni-text-primary, #ede8df); padding: 6px 12px; border-radius: 4px; font-size: 0.78rem; cursor: pointer;";

  btnClear.addEventListener("click", async () => {
    const active = tasks.filter((t) => !t.done);
    tasks = active;
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("tasks", JSON.stringify(active));
      }
    } catch (_) {}
    totalSpan.textContent = `Total Tasks: ${tasks.length}`;
    completedSpan.textContent = `Completed: 0`;
    btnClear.textContent = "Cleared!";
    setTimeout(() => {
      btnClear.textContent = "Clear Completed Tasks";
    }, 1500);
  });

  actionsRow.appendChild(btnClear);
  container.appendChild(actionsRow);

  root.appendChild(container);
}

function isSettingsRoute(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const search = window.location.search || "";
    if (new URLSearchParams(search).get("view") === "settings") return true;
    if (window.location.hash.includes("settings")) return true;
    if ((window as any).__OMNI_ROUTE__?.includes("settings")) return true;
  } catch (_) {}
  return false;
}

const mountApp = (root: any) => {
  if (isSettingsRoute()) {
    mountChecklistSettings(root);
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
