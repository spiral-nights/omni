/// <reference types="@omni/types" />
import {
  OmniComponentNode,
  OmniAction,
  OmniTabsPrimitive,
  OmniStatusIndicatorPrimitive,
  OmniBannerPrimitive
} from "@omni/types";

export interface RelayInfo {
  url: string;
  status: "online" | "connecting" | "offline" | "error";
  latency?: number;
}

const DEFAULT_RELAYS: string[] = [
  "wss://relay.damus.io",
  "wss://relay.ditto.pub",
  "wss://nos.lol"
];

const PRESETS = [
  { name: "Ditto", url: "wss://relay.ditto.pub" },
  { name: "Damus", url: "wss://relay.damus.io" },
  { name: "Nos.lol", url: "wss://nos.lol" },
  { name: "Primal", url: "wss://relay.primal.net" },
  { name: "Nostr.band", url: "wss://relay.nostr.band" }
];

let currentTab = "relays"; // "relays" | "add"
let currentRelayList: RelayInfo[] = DEFAULT_RELAYS.map((url) => ({ url, status: "online" }));

function normalizeRelayUrl(input: string): string {
  let url = input.trim();
  if (!url) return "";
  if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
    url = `wss://${url}`;
  }
  return url.replace(/\/+$/, "");
}

function loadStoredRelays(): string[] {
  try {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem("omni_configured_relays");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    }
  } catch {}
  return DEFAULT_RELAYS;
}

function persistStoredRelays(urls: string[]): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("omni_configured_relays", JSON.stringify(urls));
    }
  } catch {}
}

export async function syncRelaysFromHost(): Promise<RelayInfo[]> {
  try {
    const omniApi =
      (typeof nostr !== "undefined" && (nostr as any)?.relays) ||
      (typeof window !== "undefined" && (window as any).nostr?.relays) ||
      (typeof omni !== "undefined" && (omni as any)?.relays) ||
      (typeof window !== "undefined" && (window as any).omni?.relays) ||
      null;

    if (omniApi && typeof omniApi.list === "function") {
      const list = await omniApi.list();
      if (Array.isArray(list) && list.length > 0) {
        currentRelayList = list.map((item: any) => {
          if (typeof item === "string") {
            return { url: item, status: "online" };
          }
          const isConn = item.status === "connected" || (!item.status && item.connected !== false);
          const isConnecting = item.status === "connecting";
          return {
            url: item.url || "",
            status: isConn ? "online" : (isConnecting ? "connecting" : "offline"),
            latency: item.latency
          };
        });
        return currentRelayList;
      }
    }

    const nostrApi =
      (typeof nostr !== "undefined" && (nostr as any)?.getRelays) ||
      (typeof window !== "undefined" && (window as any).nostr?.getRelays) ||
      null;

    if (nostrApi) {
      const map = await nostrApi();
      if (map && typeof map === "object") {
        const urls = Object.keys(map);
        if (urls.length > 0) {
          currentRelayList = urls.map((url) => ({ url, status: "online" }));
          return currentRelayList;
        }
      }
    }
  } catch (_) {}

  const stored = loadStoredRelays();
  currentRelayList = stored.map((url) => ({ url, status: "online" }));
  return currentRelayList;
}

export function getRelaysSchema(tab = currentTab, relays = currentRelayList): OmniComponentNode {
  if (isCompactRoute()) {
    return {
      type: "metric",
      label: "Relays",
      value: relays.length,
      subtext: relays.length > 0 ? "Pool Online" : "Offline"
    };
  }

  const activeRelaysCount = relays.filter((r) => r.status === "online").length;

  const tabsPrimitive: OmniTabsPrimitive = {
    type: "tabs",
    activeTab: tab,
    tabs: [
      { id: "relays", label: "Connected Relays", icon: "server", badge: relays.length },
      { id: "add", label: "Add Relays", icon: "plus" }
    ],
    action: { name: "switch-tab" }
  };

  const children: OmniComponentNode[] = [tabsPrimitive];

  if (tab === "relays") {
    // 1. Top Pool Overview Bar
    children.push({
      type: "box",
      direction: "row",
      align: "center",
      justify: "between",
      children: [
        {
          type: "metric",
          label: "Active Relay Pool",
          value: relays.length,
          subtext: activeRelaysCount === relays.length ? "All connected" : `${activeRelaysCount} of ${relays.length} active`
        },
        {
          type: "box",
          direction: "row",
          align: "center",
          gap: "md",
          children: [
            {
              type: "status-indicator",
              status: relays.length > 0 ? "online" : "offline",
              label: relays.length > 0 ? "Pool Active" : "Offline",
              pulse: relays.length > 0
            },
            {
              type: "button",
              label: "Refresh",
              variant: "secondary",
              size: "sm",
              action: { name: "refresh-relays" }
            }
          ]
        }
      ]
    });

    // 2. Relays List or Empty State Banner
    if (relays.length === 0) {
      children.push({
        type: "banner",
        tone: "info",
        title: "0ms Local Offline Mode",
        message: "No relays are currently configured. Omni is reading and caching events directly from the local IndexedDB event store.",
        action: { name: "switch-tab", payload: { tab: "add" } },
        actionLabel: "Add a Relay"
      });
    } else {
      children.push({
        type: "list",
        items: relays.map((r) => ({
          type: "list-item",
          id: r.url,
          title: r.url,
          subtitle:
            r.status === "online"
              ? "Connected (Read / Write)"
              : r.status === "connecting"
              ? "Connecting to WebSocket..."
              : "Disconnected",
          icon: "server",
          actions: [
            {
              type: "icon-button",
              icon: "trash",
              tooltip: "Disconnect and remove relay",
              variant: "danger",
              action: { name: "remove-relay", payload: { url: r.url } }
            }
          ]
        }))
      });
    }
  } else if (tab === "add") {
    children.push({
      type: "box",
      direction: "row",
      gap: "sm",
      align: "center",
      children: [
        {
          type: "input",
          name: "relayUrl",
          placeholder: "wss://relay.example.com",
          actionOnEnter: { name: "add-relay" }
        },
        {
          type: "button",
          label: "+ Add Relay",
          variant: "primary",
          action: { name: "add-relay" }
        }
      ]
    });

    children.push({
      type: "box",
      direction: "column",
      gap: "sm",
      children: [
        {
          type: "box",
          direction: "row",
          children: [
            {
              type: "metric",
              label: "Popular High-Performance Community Relays",
              value: "Presets",
              subtext: "One-click connection"
            }
          ]
        },
        {
          type: "box",
          direction: "row",
          gap: "sm",
          children: PRESETS.map((p) => ({
            type: "button",
            label: `+ ${p.name}`,
            size: "sm",
            variant: "secondary",
            action: { name: "add-preset", payload: { url: p.url } }
          }))
        }
      ]
    });
  }

  return {
    type: "card",
    title: "Relay Pool Manager",
    subtitle: "Active WebSocket connections to decentralized relays",
    icon: "server",
    children
  };
}

export async function handleRelaysAction(
  action: OmniAction,
  payload?: Record<string, unknown>
): Promise<OmniComponentNode> {
  const actName = action.name;
  if (actName === "switch-tab") {
    const tab = String(payload?.tab || payload?.value || action.payload?.tab || "relays");
    currentTab = tab;
    try {
      if (typeof window !== "undefined" && window.history && typeof window.history.pushState === "function") {
        window.history.pushState({ tab }, "", `?tab=${tab}`);
      }
    } catch (_) {}
  } else if (actName === "add-relay" || actName === "add-preset") {
    const raw = String(payload?.relayUrl || payload?.url || payload?.value || action.payload?.url || "").trim();
    const url = normalizeRelayUrl(raw);
    if (url) {
      const omniApi =
        (typeof nostr !== "undefined" && (nostr as any)?.relays) ||
        (typeof window !== "undefined" && (window as any).nostr?.relays) ||
        (typeof omni !== "undefined" && (omni as any)?.relays) ||
        (typeof window !== "undefined" && (window as any).omni?.relays) ||
        null;
      if (omniApi && typeof omniApi.add === "function") {
        try { await omniApi.add(url); } catch (_) {}
      }
      if (!currentRelayList.some((r) => r.url === url)) {
        currentRelayList.push({ url, status: "online" });
      }
      persistStoredRelays(currentRelayList.map((r) => r.url));
      currentTab = "relays";
    }
  } else if (actName === "remove-relay") {
    const url = String(payload?.url || action.payload?.url || "").trim();
    if (url) {
      const omniApi =
        (typeof nostr !== "undefined" && (nostr as any)?.relays) ||
        (typeof window !== "undefined" && (window as any).nostr?.relays) ||
        (typeof omni !== "undefined" && (omni as any)?.relays) ||
        (typeof window !== "undefined" && (window as any).omni?.relays) ||
        null;
      if (omniApi && typeof omniApi.remove === "function") {
        try { await omniApi.remove(url); } catch (_) {}
      }
      currentRelayList = currentRelayList.filter((r) => r.url !== url);
      persistStoredRelays(currentRelayList.map((r) => r.url));
    }
  } else if (actName === "refresh-relays") {
    await syncRelaysFromHost();
  }

  return getRelaysSchema(currentTab, currentRelayList);
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

function dispatchSchema(schema: OmniComponentNode | null) {
  if (!schema || typeof window === "undefined") return;
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: "omni:schema", componentId: "main", schema }, "*");
  } else {
    window.postMessage({ type: "omni:schema", componentId: "main", schema }, "*");
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("omni:action", async (event: any) => {
    const detail = event.detail || event;
    if (detail?.__fromSchemaBus) return;
    const action = detail.action;
    const payload = detail.payload;
    if (action) {
      const next = await handleRelaysAction(action, payload);
      dispatchSchema(next);
    }
  });

  window.addEventListener("message", async (event: MessageEvent) => {
    const data = event.data;
    if (data && (data.type === "omni:action" || data.type === "action") && data.action) {
      const next = await handleRelaysAction(data.action, data.payload);
      dispatchSchema(next);
    }
  });

  window.addEventListener("popstate", (event: PopStateEvent) => {
    const tab = event?.state?.tab;
    if (tab) {
      currentTab = tab;
      dispatchSchema(getRelaysSchema(currentTab));
    }
  });

  // Initial load & dispatch
  (async () => {
    await syncRelaysFromHost();
    dispatchSchema(getRelaysSchema(currentTab, currentRelayList));
  })();
}
