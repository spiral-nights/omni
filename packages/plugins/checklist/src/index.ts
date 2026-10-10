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
    if (typeof omni !== "undefined" && omni.storage) {
      const stored = await omni.storage.get<TaskItem[]>("tasks");
      if (stored) tasks = stored;
    } else if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem("tasks");
      if (stored) tasks = JSON.parse(stored);
    }
  } catch {}

  async function persistTasks() {
    try {
      if (typeof omni !== "undefined" && omni.storage) {
        await omni.storage.set("tasks", tasks);
      } else if (typeof localStorage !== "undefined") {
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

if (typeof omni !== "undefined" && typeof (omni as any).registerComponent === "function") {
  (omni as any).registerComponent("checklist-sidebar-widget", ({ root }: any) => {
    mountChecklist(root);
  });
  (omni as any).registerComponent("checklist-widget", ({ root }: any) => {
    mountChecklist(root);
  });
  (omni as any).registerComponent("org.omni.nsite.checklist-main", ({ root }: any) => {
    mountChecklist(root);
  });
} else if (typeof document !== "undefined") {
  mountChecklist(document.body);
}
