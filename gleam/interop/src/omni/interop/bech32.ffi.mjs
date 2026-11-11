export function js_object(entries) {
  const obj = {};
  for (const [k, v] of entries) {
    obj[k] = v;
  }
  return obj;
}

export function js_null() {
  return null;
}
