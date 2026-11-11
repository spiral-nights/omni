function createShim(pluginId) {
  const prefix = `omni:plugin:${pluginId}:`;
  const backing = window.localStorage;
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
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: createShim(String(pluginId)),
  });
}
