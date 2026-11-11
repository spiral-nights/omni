export function reject_promise(reason) {
  return Promise.reject(new Error(reason));
}
