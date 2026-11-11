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
