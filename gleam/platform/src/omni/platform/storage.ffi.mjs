let customBackend = null;

export function set_custom_backend(backend) {
  customBackend = backend;
}

function get_backend() {
  if (customBackend) return customBackend;
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
    if (typeof globalThis !== "undefined" && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch (_e) {}
  return null;
}

export function is_available() {
  const backend = get_backend();
  if (!backend) return false;
  try {
    const testKey = "__omni_storage_test__";
    backend.setItem(testKey, "1");
    backend.removeItem(testKey);
    return true;
  } catch (_e) {
    return false;
  }
}

export function get_item(key) {
  const backend = get_backend();
  if (!backend) return null;
  try {
    const val = backend.getItem(key);
    return val === null ? null : val;
  } catch (_e) {
    return null;
  }
}

export function set_item(key, value) {
  const backend = get_backend();
  if (!backend) return "unavailable";
  try {
    backend.setItem(key, value);
    return null;
  } catch (err) {
    if (err && (err.name === "QuotaExceededError" || err.code === 22)) {
      return "quota_exceeded";
    }
    return String(err);
  }
}

export function remove_item(key) {
  const backend = get_backend();
  if (!backend) return;
  try {
    backend.removeItem(key);
  } catch (_e) {}
}

export function clear_items() {
  const backend = get_backend();
  if (!backend) return;
  try {
    backend.clear();
  } catch (_e) {}
}

export function get_keys() {
  const backend = get_backend();
  if (!backend) return [];
  try {
    const keys = [];
    for (let i = 0; i < backend.length; i++) {
      const k = backend.key(i);
      if (k !== null && k !== undefined) keys.push(k);
    }
    return keys;
  } catch (_e) {
    return [];
  }
}
