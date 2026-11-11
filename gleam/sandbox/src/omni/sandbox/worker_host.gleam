//// Web Worker sandbox guest host definition and script sanitization.
////
//// Hosts headless and declarative Schema plugins off the main UI thread in dedicated
//// Web Workers (`WorkerGuestHost`), providing 100% off-thread parallel CPU execution,
//// zero-DOM isolation, and stripping host origin storage and network access.

import gleam/dict.{type Dict}
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/regexp
import gleam/string

/// Configuration options for creating a Worker guest host script.
pub type WorkerConfig {
  WorkerConfig(
    plugin_id: String,
    plugin_script: String,
    runtime_script: Option(String),
    route: Option(String),
    view_id: Option(String),
    initial_storage: Option(Dict(String, String)),
  )
}

/// Handshake message descriptor for transferring Channel 1 & Channel 2 ports.
pub type WorkerHandshake {
  WorkerHandshake(
    plugin_id: String,
    message_type: String,
    transfers_channel1: Bool,
    transfers_channel2: Bool,
    payload_json: String,
  )
}

/// Hardened worker preamble defanging host storage, caches, and raw sockets.
pub const worker_preamble =
  "
(function() {
  'use strict';

  // 1. Defang unmetered host origin storage & network
  try { delete self.indexedDB; } catch (_) {}
  try { delete self.caches; } catch (_) {}
  try { delete self.cookieStore; } catch (_) {}
  try { delete self.fetch; } catch (_) {}
  try { delete self.XMLHttpRequest; } catch (_) {}
  try { delete self.importScripts; } catch (_) {}
  try { delete self.WebSocket; } catch (_) {}

  // 2. Global aliasing for standard Web & Nostr guest scripts
  if (typeof self.window === 'undefined') {
    self.window = self;
  }
  if (typeof self.parent === 'undefined') {
    self.parent = self;
  }
  if (typeof self.top === 'undefined') {
    self.top = self;
  }
})();
"

/// Strip sourcemap comments (`sourceMappingURL` and `sourceURL`).
pub fn strip_sourcemaps(code: String) -> String {
  let opts = regexp.Options(case_insensitive: True, multi_line: True)

  let code = case
    regexp.compile("//[#@]\\s*sourceMappingURL=[^\\r\\n]*", opts)
  {
    Ok(re) -> regexp.replace(re, code, "")
    Error(_) -> code
  }

  let code = case
    regexp.compile("/\\*#\\s*sourceMappingURL=[\\s\\S]*?\\*/", opts)
  {
    Ok(re) -> regexp.replace(re, code, "")
    Error(_) -> code
  }

  let code = case
    regexp.compile("/\\*@\\s*sourceMappingURL=[\\s\\S]*?\\*/", opts)
  {
    Ok(re) -> regexp.replace(re, code, "")
    Error(_) -> code
  }

  let code = case regexp.compile("//[#@]\\s*sourceURL=[^\\r\\n]*", opts) {
    Ok(re) -> regexp.replace(re, code, "")
    Error(_) -> code
  }

  code
}

/// Strip ES module export statements from plugin scripts.
///
/// Converts `export const x = 1;` into `const x = 1;`
/// and strips block exports `export { a, b };` and `export default ...;`.
pub fn strip_exports(code: String) -> String {
  let opts = regexp.Options(case_insensitive: False, multi_line: True)

  // 1. Strip block exports: export { ... };
  let code = case
    regexp.compile("^\\s*export\\s*\\{[^}]*\\}\\s*;?\\s*$", opts)
  {
    Ok(re) -> regexp.replace(re, code, "")
    Error(_) -> code
  }

  // 2. Strip export default
  let code = case regexp.compile("^\\s*export\\s+default\\s+", opts) {
    Ok(re) -> regexp.replace(re, code, "")
    Error(_) -> code
  }

  // 3. Strip export from declaration keywords
  let code = case
    regexp.compile(
      "^\\s*export\\s+(async\\s+function|function|class|const|let|var)\\s+",
      opts,
    )
  {
    Ok(re) -> {
      regexp.match_map(re, code, fn(m) {
        case m.submatches {
          [Some(decl)] -> decl <> " "
          _ -> ""
        }
      })
    }
    Error(_) -> code
  }

  code
}

/// Sanitize plugin script by stripping sourcemap comments and ES module exports.
pub fn sanitize_plugin_script(code: String) -> String {
  code
  |> strip_sourcemaps
  |> strip_exports
}

/// Build the complete self-contained worker blob script for off-thread execution.
pub fn build_worker_script(config: WorkerConfig) -> String {
  let safe_runtime = case config.runtime_script {
    Some(rt) -> strip_sourcemaps(rt)
    None -> ""
  }
  let safe_plugin = sanitize_plugin_script(config.plugin_script)

  let route_val = option.unwrap(config.route, "")
  let view_val = option.unwrap(config.view_id, "main")
  let storage_json = case config.initial_storage {
    Some(st) ->
      dict.to_list(st)
      |> list.map(fn(p) { #(p.0, json.string(p.1)) })
      |> json.object
      |> json.to_string
    None -> "{}"
  }

  let config_injection =
    "\ntry {\n"
    <> "  self.__OMNI_ROUTE__ = "
    <> string.inspect(route_val)
    <> ";\n"
    <> "  self.__OMNI_VIEW__ = "
    <> string.inspect(view_val)
    <> ";\n"
    <> "  self.__OMNI_INITIAL_STORAGE__ = "
    <> storage_json
    <> ";\n"
    <> "} catch (_) {}\n"

  let execution_block =
    "(async function() {\n  try {\n"
    <> safe_plugin
    <> "\n  } catch (err) {\n    console.error('[Omni Worker Plugin Execution Error: ' + "
    <> string.inspect(config.plugin_id)
    <> " + ']', err);\n  }\n})();"

  worker_preamble
  <> "\n"
  <> safe_runtime
  <> "\n"
  <> config_injection
  <> "\n"
  <> execution_block
}

/// Prepare handshake descriptor for transferring `channel1` and `channel2` ports.
pub fn prepare_handshake(config: WorkerConfig) -> WorkerHandshake {
  let payload =
    json.object([
      #("pluginId", json.string(config.plugin_id)),
      #("route", json.string(option.unwrap(config.route, ""))),
      #("viewId", json.string(option.unwrap(config.view_id, "main"))),
      #("channel1", json.string("portSchemaBus")),
      #("channel2", json.string("portKernelRpc")),
    ])
    |> json.to_string

  WorkerHandshake(
    plugin_id: config.plugin_id,
    message_type: "omni:init",
    transfers_channel1: True,
    transfers_channel2: True,
    payload_json: payload,
  )
}
