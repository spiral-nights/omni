export function make_circular_object() {
  const obj = {};
  obj.self = obj;
  return obj;
}

export function make_js_object() {
  return { name: "Alice", count: 42 };
}
