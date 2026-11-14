function memoryBacking() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    clear: () => data.clear(),
    key: (index) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size;
    },
  };
}

let sharedBacking;

function getHostStorage() {
  try {
    const host =
      typeof window !== "undefined"
        ? window.localStorage
        : typeof self !== "undefined"
        ? self.localStorage
        : null;
    if (host && !host.__omniShim) {
      host.getItem("__omni_probe__");
      return host;
    }
  } catch (_) {
    // SecurityError or restricted storage access
  }
  return null;
}

function seedInitialStorage(backing, pluginId) {
  try {
    const globalObj =
      typeof window !== "undefined"
        ? window
        : typeof self !== "undefined"
        ? self
        : typeof globalThis !== "undefined"
        ? globalThis
        : null;
    if (!globalObj) return;
    const initial = globalObj.__OMNI_INITIAL_STORAGE__;
    if (initial && typeof initial === "object") {
      const prefix = `omni:plugin:${pluginId}:`;
      for (const [k, v] of Object.entries(initial)) {
        if (k.startsWith("omni:plugin:")) {
          backing.setItem(k, String(v));
        } else {
          backing.setItem(prefix + k, String(v));
        }
      }
    }
  } catch (_) {}
}

function createShim(pluginId, rpc) {
  const prefix = `omni:plugin:${pluginId}:`;
  const backing = sharedBacking;
  return {
    getItem(key) {
      return backing.getItem(prefix + key);
    },
    setItem(key, value) {
      const valStr = String(value);
      backing.setItem(prefix + key, valStr);
      if (typeof rpc === "function") {
        try {
          rpc("storage.set", { key: String(key), value: valStr });
        } catch (_) {}
      }
    },
    removeItem(key) {
      backing.removeItem(prefix + key);
      if (typeof rpc === "function") {
        try {
          rpc("storage.delete", { key: String(key) });
        } catch (_) {}
      }
    },
    clear() {
      const keys = [];
      for (let i = 0; i < backing.length; i += 1) {
        const key = backing.key(i);
        if (key && key.startsWith(prefix)) keys.push(key);
      }
      for (const key of keys) backing.removeItem(key);
      if (typeof rpc === "function") {
        try {
          rpc("storage.clear", {});
        } catch (_) {}
      }
    },
    key(index) {
      let seen = 0;
      for (let i = 0; i < backing.length; i += 1) {
        const key = backing.key(i);
        if (!key || !key.startsWith(prefix)) continue;
        if (seen === index) return key.slice(prefix.length);
        seen += 1;
      }
      return null;
    },
    get length() {
      let count = 0;
      for (let i = 0; i < backing.length; i += 1) {
        const key = backing.key(i);
        if (key && key.startsWith(prefix)) count += 1;
      }
      return count;
    },
  };
}

export function install(pluginId, rpc) {
  const target =
    typeof window !== "undefined"
      ? window
      : typeof self !== "undefined"
      ? self
      : null;
  if (!target) return;
  if (!sharedBacking) {
    const host = getHostStorage();
    sharedBacking = host || memoryBacking();
  }
  seedInitialStorage(sharedBacking, String(pluginId));
  const shim = createShim(String(pluginId), rpc);
  shim.__omniShim = true;
  try {
    Object.defineProperty(target, "localStorage", {
      configurable: true,
      value: shim,
    });
  } catch (_) {
    target.localStorage = shim;
  }
}
