//// URL parsing port based on standard WHATWG URL semantics.
////
//// Provides parsing and decomposition into scheme, host, port, path,
//// query parameters, and hash fragments.

import gleam/int
import gleam/option.{type Option, None, Some}

/// Parsed components of a Uniform Resource Locator.
pub type Url {
  Url(
    scheme: String,
    host: String,
    port: Option(Int),
    path: String,
    query: Option(String),
    fragment: Option(String),
  )
}

/// Errors encountered while attempting to parse a URL.
pub type UrlParseError {
  InvalidUrl(reason: String)
}

@external(javascript, "./url.ffi.mjs", "parse_url")
fn ffi_parse_url(
  raw: String,
  make_url: fn(
    String,
    String,
    Option(Int),
    String,
    Option(String),
    Option(String),
  ) -> Url,
  make_some: fn(a) -> Option(a),
  make_none: fn() -> Option(a),
  make_ok: fn(Url) -> Result(Url, UrlParseError),
  make_err: fn(String) -> Result(Url, UrlParseError),
) -> Result(Url, UrlParseError)

/// Parses `raw` according to the WHATWG URL standard.
/// Returns `Ok(Url)` on success or `Error(InvalidUrl(msg))` on failure.
pub fn parse(raw: String) -> Result(Url, UrlParseError) {
  ffi_parse_url(
    raw,
    fn(scheme, host, port, path, query, fragment) {
      Url(scheme, host, port, path, query, fragment)
    },
    fn(v) { Some(v) },
    fn() { None },
    fn(u) { Ok(u) },
    fn(err) { Error(InvalidUrl(err)) },
  )
}

/// Serializes a `Url` back into its canonical string representation.
pub fn to_string(url: Url) -> String {
  let port_str = case url.port {
    Some(p) -> ":" <> int.to_string(p)
    None -> ""
  }
  let authority = case url.host {
    "" -> ""
    h -> "//" <> h <> port_str
  }
  let query_str = case url.query {
    Some(q) -> "?" <> q
    None -> ""
  }
  let fragment_str = case url.fragment {
    Some(f) -> "#" <> f
    None -> ""
  }
  url.scheme <> ":" <> authority <> url.path <> query_str <> fragment_str
}

/// Percent-encodes a URL query parameter component using standard `encodeURIComponent`.
@external(javascript, "./url.ffi.mjs", "encode_component")
pub fn encode_component(value: String) -> String

/// Percent-decodes a URL query parameter component using `decodeURIComponent`
/// (converting `+` to spaces and falling back to the raw string on malformed sequences).
@external(javascript, "./url.ffi.mjs", "decode_component")
pub fn decode_component(value: String) -> String
