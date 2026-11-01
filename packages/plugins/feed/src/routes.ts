export function getAppRoute(): string {
  if (typeof window === "undefined") return "";
  try {
    if (window.location?.search && window.location.search !== "") {
      return window.location.search;
    }
    if (window.location?.hash && window.location.hash !== "") {
      return window.location.hash;
    }
    if ((window as any).__OMNI_ROUTE__) {
      return String((window as any).__OMNI_ROUTE__);
    }
    if ((window as any).__OMNI_SEARCH__) {
      return String((window as any).__OMNI_SEARCH__);
    }
    if ((window as any).__OMNI_VIEW__) {
      return `?view=${(window as any).__OMNI_VIEW__}`;
    }
  } catch (_) {}
  return "";
}

export function isSearchRoute(): boolean {
  try {
    const route = getAppRoute();
    if (!route) return false;
    const qIdx = route.indexOf("?");
    const query = qIdx !== -1 ? route.slice(qIdx) : route;
    const params = new URLSearchParams(query);
    if (params.get("view") === "search") return true;
    if (route.includes("view=search") || route === "search") return true;
  } catch (_) {}
  return false;
}

export function isSettingsRoute(): boolean {
  try {
    const route = getAppRoute();
    if (!route) return false;
    const qIdx = route.indexOf("?");
    const query = qIdx !== -1 ? route.slice(qIdx) : route;
    const params = new URLSearchParams(query);
    if (params.get("view") === "settings") return true;
    if (route.includes("view=settings") || route.includes("settings")) return true;
  } catch (_) {}
  return false;
}

export function isWidgetRoute(): boolean {
  try {
    const route = getAppRoute();
    if (!route) return false;
    const qIdx = route.indexOf("?");
    const query = qIdx !== -1 ? route.slice(qIdx) : route;
    const params = new URLSearchParams(query);
    if (params.get("view") === "widget" || params.get("view") === "sidebar") return true;
    if (route.includes("view=widget") || route.includes("view=sidebar")) return true;
  } catch (_) {}
  return false;
}

export function isCompactRoute(): boolean {
  try {
    const route = getAppRoute();
    if (!route) return false;
    const qIdx = route.indexOf("?");
    const query = qIdx !== -1 ? route.slice(qIdx) : route;
    const params = new URLSearchParams(query);
    if (params.get("view") === "compact" || params.get("view") === "dock") return true;
    if (route.includes("view=compact") || route.includes("view=dock")) return true;
  } catch (_) {}
  return false;
}

export function isSchemaRoute(): boolean {
  try {
    const route = getAppRoute();
    if (route && (route.includes("format=schema") || route.includes("view=schema"))) return true;
    if (route && (route.includes("format=iframe") || route.includes("view=iframe"))) return false;
  } catch (_) {}
  if (typeof window !== "undefined" && window.parent && window.parent !== window) {
    return true;
  }
  return false;
}

export function isIframeRoute(): boolean {
  return !isSchemaRoute();
}
