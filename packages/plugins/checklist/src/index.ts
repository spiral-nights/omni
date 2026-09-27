/// <reference types="@omni/types" />

interface TaskItem {
  id: number;
  text: string;
  done: boolean;
}

// Ensure omni global exists
if (typeof omni !== "undefined") {
  // 1. Register Dock Icon
  omni.registerComponent("checklist-dock-icon", ({ root, props }) => {
    const btn = root.createElement("button");
    btn.className = "dock-icon-btn";
    btn.title = "Daily Checklist";

    const svg = root.createElement("svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "20");
    svg.setAttribute("height", "20");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");

    const rect = root.createElement("rect");
    rect.setAttribute("x", "3");
    rect.setAttribute("y", "3");
    rect.setAttribute("width", "18");
    rect.setAttribute("height", "18");
    rect.setAttribute("rx", "3");

    const polyline = root.createElement("polyline");
    polyline.setAttribute("points", "9 12 11 14 15 10");

    svg.appendChild(rect);
    svg.appendChild(polyline);
    btn.appendChild(svg);

    const badge = root.createElement("span");
    badge.className = "dock-badge";
    badge.textContent = String(props.badgeCount || 3);
    btn.appendChild(badge);

    btn.addEventListener("click", () => {
      omni.ui.toggleSlot("sidebar");
    });

    root.appendChild(btn);
  });

  // 2. Register Sidebar Widget
  omni.registerComponent("checklist-sidebar-widget", async ({ root }) => {
    const card = root.createElement("div");
    card.className = "checklist-widget-card";

    const header = root.createElement("div");
    header.className = "widget-header";
    const title = root.createElement("h3");
    title.textContent = "Daily Tasks";
    header.appendChild(title);
    card.appendChild(header);

    // Input form
    const form = root.createElement("div");
    form.className = "task-input-row";
    const input = root.createElement("input");
    input.type = "text";
    input.placeholder = "Add task...";
    const addBtn = root.createElement("button");
    addBtn.textContent = "+";
    form.appendChild(input);
    form.appendChild(addBtn);
    card.appendChild(form);

    // List container
    const ul = root.createElement("ul");
    ul.className = "task-list";
    card.appendChild(ul);

    // Load initial tasks
    const tasks: TaskItem[] = (await omni.storage.get<TaskItem[]>("tasks")) || [
      { id: 1, text: "Send Nostr note", done: true },
      { id: 2, text: "Review Omni PR", done: false },
      { id: 3, text: "Test Focus Timer", done: false }
    ];

    function renderTasks() {
      ul.replaceChildren();
      for (const t of tasks) {
        const li = root.createElement("li");
        li.className = "task-item";

        const cb = root.createElement("input");
        cb.type = "checkbox";
        cb.checked = t.done;
        cb.addEventListener("change", async () => {
          t.done = cb.checked;
          await omni.storage.set("tasks", tasks);
          renderTasks();
        });

        const span = root.createElement("span");
        span.textContent = t.text;
        if (t.done) span.style.textDecoration = "line-through";

        const delBtn = root.createElement("button");
        delBtn.className = "delete-task-btn";
        delBtn.textContent = "×";
        delBtn.addEventListener("click", async () => {
          const idx = tasks.findIndex((item) => item.id === t.id);
          if (idx !== -1) {
            tasks.splice(idx, 1);
            await omni.storage.set("tasks", tasks);
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
      await omni.storage.set("tasks", tasks);
      renderTasks();
    });

    renderTasks();
    root.appendChild(card);
  });
}
