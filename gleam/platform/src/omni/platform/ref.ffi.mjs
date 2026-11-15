export function new_ref(initial) {
  return { value: initial };
}

export function get(ref) {
  return ref.value;
}

export function set(ref, value) {
  ref.value = value;
  return undefined;
}

const stringMemoCache = new Map();

export function memoize_string(key, compute) {
  const k = String(key);
  if (stringMemoCache.has(k)) {
    return stringMemoCache.get(k);
  }
  const value = String(compute());
  if (stringMemoCache.size > 4096) {
    stringMemoCache.clear();
  }
  stringMemoCache.set(k, value);
  return value;
}
