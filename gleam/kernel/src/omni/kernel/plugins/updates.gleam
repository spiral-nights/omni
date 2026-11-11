//// Pure semantic version comparison and plugin update detection.
////
//// Follows Semantic Versioning (SemVer) rules for major, minor, patch,
//// and pre-release identifiers without external runtime dependencies.

import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/order.{type Order, Eq, Gt, Lt}
import gleam/string

/// Structured semantic version representation.
pub type Version {
  Version(major: Int, minor: Int, patch: Int, prerelease: Option(String))
}

/// Description of an available plugin update.
pub type PluginUpdate {
  PluginUpdate(
    plugin_id: String,
    current_version: String,
    latest_version: String,
    source_url: Option(String),
    naddr: Option(String),
  )
}

/// Parse a version string into a `Version` record.
///
/// Accepts formats like `"1.2.3"`, `"v1.2.3"`, `"1.2"`, `"1"`, and `"1.0.0-rc.1"`.
pub fn parse_version(raw: String) -> Result(Version, Nil) {
  let clean =
    raw
    |> string.trim
    |> string.lowercase

  let without_v = case string.starts_with(clean, "v") {
    True -> string.drop_start(clean, 1)
    False -> clean
  }

  case without_v == "" {
    True -> Error(Nil)
    False -> {
      // Separate pre-release tag (after '-' or '+')
      let #(core, prerelease) = case string.split(without_v, "-") {
        [c, pre, ..rest] -> #(c, Some(string.join([pre, ..rest], "-")))
        _ ->
          case string.split(without_v, "+") {
            [c, build, ..rest] -> #(c, Some(string.join([build, ..rest], "+")))
            _ -> #(without_v, None)
          }
      }

      let parts =
        string.split(core, ".")
        |> list.map(string.trim)

      case parts {
        [maj_str] -> {
          use maj <- result_guard(int.parse(maj_str))
          Ok(Version(major: maj, minor: 0, patch: 0, prerelease: prerelease))
        }

        [maj_str, min_str] -> {
          use maj <- result_guard(int.parse(maj_str))
          use min <- result_guard(int.parse(min_str))
          Ok(Version(major: maj, minor: min, patch: 0, prerelease: prerelease))
        }

        [maj_str, min_str, pat_str, ..] -> {
          use maj <- result_guard(int.parse(maj_str))
          use min <- result_guard(int.parse(min_str))
          use pat <- result_guard(int.parse(pat_str))
          Ok(Version(major: maj, minor: min, patch: pat, prerelease: prerelease))
        }

        _ -> Error(Nil)
      }
    }
  }
}

fn result_guard(
  res: Result(a, e),
  f: fn(a) -> Result(b, Nil),
) -> Result(b, Nil) {
  case res {
    Ok(v) -> f(v)
    Error(_) -> Error(Nil)
  }
}

/// Format a `Version` record back into a standard string representation.
pub fn to_string(version: Version) -> String {
  let base =
    int.to_string(version.major)
    <> "."
    <> int.to_string(version.minor)
    <> "."
    <> int.to_string(version.patch)

  case version.prerelease {
    Some(pre) -> base <> "-" <> pre
    None -> base
  }
}

/// Compare two `Version` records according to SemVer ordering rules.
pub fn compare(a: Version, b: Version) -> Order {
  case int.compare(a.major, b.major) {
    Eq ->
      case int.compare(a.minor, b.minor) {
        Eq ->
          case int.compare(a.patch, b.patch) {
            Eq -> compare_prerelease(a.prerelease, b.prerelease)
            other -> other
          }
        other -> other
      }
    other -> other
  }
}

fn compare_prerelease(a: Option(String), b: Option(String)) -> Order {
  case a, b {
    // Normal release has higher precedence than pre-release version
    None, None -> Eq
    None, Some(_) -> Gt
    Some(_), None -> Lt
    Some(pre_a), Some(pre_b) -> string.compare(pre_a, pre_b)
  }
}

/// Compare two raw version strings.
///
/// Falls back to lexicographical comparison if either fails to parse as SemVer.
pub fn compare_strings(v1_str: String, v2_str: String) -> Order {
  case parse_version(v1_str), parse_version(v2_str) {
    Ok(v1), Ok(v2) -> compare(v1, v2)
    Ok(_), Error(_) -> Gt
    Error(_), Ok(_) -> Lt
    Error(_), Error(_) -> string.compare(v1_str, v2_str)
  }
}

/// Check if candidate version is strictly newer than current version.
pub fn is_newer(candidate: String, current: String) -> Bool {
  compare_strings(candidate, current) == Gt
}

/// Detect whether an update is available for a plugin.
pub fn detect_update(
  plugin_id: String,
  current_version: String,
  latest_version: String,
  source_url: Option(String),
  naddr: Option(String),
) -> Option(PluginUpdate) {
  case is_newer(latest_version, current_version) {
    True ->
      Some(PluginUpdate(
        plugin_id: plugin_id,
        current_version: current_version,
        latest_version: latest_version,
        source_url: source_url,
        naddr: naddr,
      ))
    False -> None
  }
}
