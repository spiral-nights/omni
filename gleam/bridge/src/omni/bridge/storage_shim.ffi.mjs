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

function createShim(pluginId) {
  const prefix = `omni:plugin:${pluginId}:`;
  const backing = sharedBacking;
  return {
    getItem(key) {
      return backing.getItem(prefix + key);
    },
    setItem(key, value) {
      backing.setItem(prefix + key, String(value));
    },
    removeItem(key) {
      backing.removeItem(prefix + key);
    },
    clear() {
      const keys = [];
      for (let i = 0; i < backing.length; i += 1) {
        const key = backing.key(i);
        if (key && key.startsWith(prefix)) keys.push(key);
      }
      for (const key of keys) backing.removeItem(key);
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

export function install(pluginId) {
  if (typeof window === "undefined") return;
  if (!sharedBacking) {
    const host = window.localStorage;
    sharedBacking =
      host && !host.__omniShim ? host : memoryBacking();
  }
  const shim = createShim(String(pluginId));
  shim.__omniShim = true;
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: shim,
  });
}
