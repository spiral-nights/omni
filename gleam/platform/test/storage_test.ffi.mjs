export function make_mock_storage(quotaError = false) {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      if (quotaError) {
        const err = new Error("Quota exceeded");
        err.name = "QuotaExceededError";
        throw err;
      }
      map.set(key, value);
    },
    removeItem(key) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
    key(index) {
      const keys = Array.from(map.keys());
      return keys[index] !== undefined ? keys[index] : null;
    },
    get length() {
      return map.size;
    },
  };
}

export function reset_backend() {
  return null;
}
