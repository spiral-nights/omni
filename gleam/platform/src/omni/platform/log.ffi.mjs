function prefix(context) {
  return `[Omni][${context}]`;
}

export function warn(context, message) {
  console.warn(prefix(context), message);
}

export function error(context, message) {
  console.error(prefix(context), message);
}

export function info(context, message) {
  console.info(prefix(context), message);
}
