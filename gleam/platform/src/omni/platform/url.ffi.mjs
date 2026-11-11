export function parse_url(raw, makeUrl, makeSome, makeNone, makeOk, makeErr) {
  try {
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    const parsed = new URL(trimmed);

    const scheme = parsed.protocol ? parsed.protocol.replace(/:$/, "") : "";
    const host = parsed.hostname || "";
    const port = parsed.port ? makeSome(parseInt(parsed.port, 10)) : makeNone();
    const path = parsed.pathname || "";
    const query = parsed.search ? makeSome(parsed.search.replace(/^\?/, "")) : makeNone();
    const fragment = parsed.hash ? makeSome(parsed.hash.replace(/^#/, "")) : makeNone();

    return makeOk(makeUrl(scheme, host, port, path, query, fragment));
  } catch (err) {
    return makeErr(String(err && err.message ? err.message : "Invalid URL"));
  }
}

export function encode_component(value) {
  return encodeURIComponent(String(value));
}

export function decode_component(value) {
  try {
    return decodeURIComponent(String(value).replace(/\+/g, " "));
  } catch {
    return String(value);
  }
}

