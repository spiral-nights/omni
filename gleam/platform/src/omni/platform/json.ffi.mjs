export function raw_parse(str, on_ok, on_err) {
  try {
    const val = JSON.parse(str);
    return on_ok(val);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    return on_err(msg);
  }
}

export function raw_stringify(val, indent, on_ok, on_err) {
  try {
    const space = indent > 0 ? indent : undefined;
    const str = JSON.stringify(val, null, space);
    if (str === undefined) {
      return on_err("undefined value cannot be serialized to JSON");
    }
    return on_ok(str);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    return on_err(msg);
  }
}
