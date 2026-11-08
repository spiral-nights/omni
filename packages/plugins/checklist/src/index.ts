/// <reference types="@omni/types" />
import {
  OmniCardPrimitive,
  OmniComponentNode,
  OmniAction,
  OmniMetricPrimitive,
  OmniBoxPrimitive
} from "@omni/types";

export interface TaskItem {
  id: number;
  text: string;
  done: boolean;
}

let tasks: TaskItem[] = [
  { id: 1, text: "Send Nostr note", done: true },
  { id: 2, text: "Review Omni PR", done: false },
  { id: 3, text: "Test Focus Timer", done: false }
];

export const TASKS_NIP78_D_TAG = "omni/tasks/v1";

let syncSocket: WebSocket | null = null;
let lastSyncedRemoteTimestamp = 0;
let taskDoc: any = null;

export function syncTasksToRelays(): void {
  if (typeof window === "undefined") return;
  const nostr = (window as any).nostr;
  if (!nostr) return;

  if (taskDoc && typeof taskDoc.set === "function") {
    taskDoc.set(tasks).catch((err: any) => {
      console.warn("[Tasks] Failed to set tasks on nostr.doc:", err);
    });
    return;
  }

  if (typeof nostr.signEvent !== "function") return;

  const nowSec = Math.floor(Date.now() / 1000);
  const unsigned = {
    kind: 30078,
    created_at: nowSec,
    tags: [["d", TASKS_NIP78_D_TAG]],
    content: JSON.stringify(tasks)
  };

  nostr.signEvent(unsigned).then((signed: any) => {
    if (!signed) return;
    lastSyncedRemoteTimestamp = signed.created_at;

    if (syncSocket && syncSocket.readyState === WebSocket.OPEN) {
      syncSocket.send(JSON.stringify(["EVENT", signed]));
    } else {
      try {
        const ws = new WebSocket("wss://relay.damus.io");
        ws.onopen = () => {
          ws.send(JSON.stringify(["EVENT", signed]));
          setTimeout(() => {
            try { ws.close(); } catch (_) {}
          }, 1500);
        };
      } catch (_) {}
    }
  }).catch((err: any) => {
    console.warn("[Tasks] Failed to sign task list event for relay sync:", err);
  });
}

export function initTasksRelaySync(onUpdate?: () => void): void {
  if (typeof window !== "undefined") {
    const nostr = (window as any).nostr;
    if (nostr && typeof nostr.doc === "function") {
      nostr.doc(TASKS_NIP78_D_TAG, { encrypted: false }).then((doc: any) => {
        taskDoc = doc;
        if (Array.isArray(doc.data) && doc.data.length > 0) {
          tasks = doc.data;
          persistTasks();
          onUpdate?.();
        }
        doc.onUpdate((remoteTasks: any) => {
          if (Array.isArray(remoteTasks)) {
            tasks = remoteTasks;
            persistTasks();
            onUpdate?.();
          }
        });
      }).catch((err: any) => {
        console.warn("[Tasks] nostr.doc error, falling back to websocket:", err);
      });
      return;
    }
  }

  if (typeof WebSocket === "undefined") return;
  const g = typeof globalThis !== "undefined" ? (globalThis as any) : null;
  if (g?.process?.env?.NODE_ENV === "test" || g?.process?.env?.VITEST) return;
  if (typeof window !== "undefined") {
    const w = window as any;
    if (w.happyDOM || w.__VITEST_ENVIRONMENT__) return;
    if (typeof navigator !== "undefined" && navigator.userAgent && (navigator.userAgent.includes("happy-dom") || navigator.userAgent.includes("jsdom"))) return;
  }
  if (syncSocket && (syncSocket.readyState === WebSocket.OPEN || syncSocket.readyState === WebSocket.CONNECTING)) return;

  try {
    syncSocket = new WebSocket("wss://relay.damus.io");
    syncSocket.onopen = () => {
      syncSocket?.send(JSON.stringify(["REQ", "tasks_sync_sub", { kinds: [30078], "#d": [TASKS_NIP78_D_TAG], limit: 1 }]));
    };

    syncSocket.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data);
        if (Array.isArray(frame) && frame[0] === "EVENT" && frame[2]) {
          const ev = frame[2];
          if (ev.kind === 30078 && ev.created_at > lastSyncedRemoteTimestamp) {
            const remoteTasks = JSON.parse(ev.content);
            if (Array.isArray(remoteTasks)) {
              tasks = remoteTasks;
              lastSyncedRemoteTimestamp = ev.created_at;
              persistTasks();
              onUpdate?.();
            }
          }
        }
      } catch (_) {}
    };
  } catch (err) {
    console.warn("[Tasks] Could not open relay sync socket:", err);
  }
}

function loadTasks(): TaskItem[] {
  try {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem("tasks");
      if (stored) tasks = JSON.parse(stored);
    }
  } catch {}
  return tasks;
}

function persistTasks(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("tasks", JSON.stringify(tasks));
    }
  } catch {}
}

export function getChecklistSchema(view = "widget"): OmniComponentNode {
  loadTasks();
  if (view === "settings") {
    const completed = tasks.filter((t) => t.done).length;
    return {
      type: "card",
      title: "Task List Settings",
      subtitle: "Manage persistent tasks storage and cleanup completed items.",
      children: [
        {
          type: "box",
          direction: "row",
          gap: "md",
          children: [
            { type: "metric", label: "Total Tasks", value: tasks.length },
            { type: "metric", label: "Completed", value: completed }
          ]
        },
        {
          type: "button",
          label: "Clear Completed Tasks",
          action: { name: "clear-completed" },
          variant: "secondary"
        }
      ]
    };
  }

  if (view === "compact") {
    const completed = tasks.filter((t) => t.done).length;
    const total = tasks.length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const nextPending = tasks.find((t) => !t.done);
    return {
      type: "metric",
      label: "Tasks Done",
      value: `${percent}%`,
      subtext: nextPending ? `Next: ${nextPending.text}` : "All tasks complete!"
    };
  }

  // Default: widget view
  return {
    type: "card",
    title: "Task List",
    icon: "check",
    children: [
      {
        type: "box",
        direction: "row",
        gap: "sm",
        children: [
          {
            type: "input",
            name: "taskText",
            placeholder: "Add task...",
            actionOnEnter: { name: "add-task" }
          },
          {
            type: "button",
            label: "+",
            action: { name: "add-task" },
            size: "sm"
          }
        ]
      },
      {
        type: "list",
        items: tasks.map((t) => ({
          type: "list-item",
          id: String(t.id),
          title: t.text,
          checked: t.done,
          onCheckAction: { name: "toggle-task", payload: { id: t.id } },
          actions: [
            {
              type: "icon-button",
              icon: "trash",
              tooltip: "Delete task",
              variant: "danger",
              action: { name: "delete-task", payload: { id: t.id } }
            }
          ]
        }))
      }
    ]
  };
}

export function handleChecklistAction(
  action: OmniAction,
  payload?: Record<string, unknown>
): OmniComponentNode {
  loadTasks();
  const actName = action.name;
  if (actName === "add-task" || actName === "create_task") {
    const text = String(payload?.title || payload?.text || payload?.taskText || payload?.value || "").trim();
    if (text) {
      tasks.push({ id: Date.now(), text, done: false });
      persistTasks();
      syncTasksToRelays();
    }
  } else if (actName === "toggle-task") {
    const id = Number(payload?.id || action.payload?.id);
    const item = tasks.find((t) => t.id === id);
    if (item) {
      item.done = payload?.checked !== undefined ? Boolean(payload.checked) : !item.done;
      persistTasks();
      syncTasksToRelays();
    }
  } else if (actName === "delete-task") {
    const id = Number(payload?.id || action.payload?.id);
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx !== -1) {
      tasks.splice(idx, 1);
      persistTasks();
      syncTasksToRelays();
    }
  } else if (actName === "clear-completed") {
    tasks = tasks.filter((t) => !t.done);
    persistTasks();
    syncTasksToRelays();
  }
  return getChecklistSchema(action.name === "clear-completed" ? "settings" : "widget");
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

if (typeof window !== "undefined") {
  const getActiveView = () =>
    isSettingsRoute() ? "settings" : isCompactRoute() ? "compact" : "widget";

  const dispatchSchema = (schema: OmniComponentNode) => {
    const view = getActiveView();
    const compId = view === "widget" ? "widget" : "main";
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "omni:schema", componentId: compId, schema }, "*");
    } else {
      window.postMessage({ type: "omni:schema", componentId: compId, schema }, "*");
    }
  };

  // Dispatch initial schema for the active route/view
  dispatchSchema(getChecklistSchema(getActiveView()));

  // Initialize Nostr relay sync
  initTasksRelaySync(() => dispatchSchema(getChecklistSchema(getActiveView())));

  // Listen for host actions over standard Web messaging
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data) return;

    if (data.type === "omni:init") {
      dispatchSchema(getChecklistSchema(getActiveView()));
      return;
    }

    if (
      (data.type === "omni:action" || data.type === "action") &&
      data.action
    ) {
      const nextSchema = handleChecklistAction(data.action, data.payload);
      dispatchSchema(nextSchema);
    }
  });
}
