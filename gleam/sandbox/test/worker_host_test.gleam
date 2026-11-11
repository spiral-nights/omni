import gleam/dict
import gleam/option.{None, Some}
import gleam/string
import gleeunit/should
import omni/sandbox/worker_host

pub fn strip_sourcemaps_test() {
  let code_with_maps =
    "
    function add(a, b) { return a + b; }
    //# sourceMappingURL=bundle.js.map
    console.log('done');
    //@ sourceMappingURL=bundle.js.map
    /*# sourceMappingURL=inline.map */
    /*@ sourceMappingURL=inline2.map */
    //# sourceURL=my-script.js
    //@ sourceURL=my-script2.js
  "
  let stripped = worker_host.strip_sourcemaps(code_with_maps)

  string.contains(stripped, "sourceMappingURL") |> should.be_false
  string.contains(stripped, "sourceURL") |> should.be_false
  string.contains(stripped, "function add(a, b) { return a + b; }")
  |> should.be_true
  string.contains(stripped, "console.log('done');") |> should.be_true
}

pub fn strip_exports_block_test() {
  let module_code =
    "
    const a = 1;
    const b = 2;
    export { a, b };
    export { default } from './other.js';
  "
  let stripped = worker_host.strip_exports(module_code)

  string.contains(stripped, "export { a, b };") |> should.be_false
  string.contains(stripped, "const a = 1;") |> should.be_true
  string.contains(stripped, "const b = 2;") |> should.be_true
}

pub fn strip_exports_declarations_test() {
  let module_code =
    "
    export const x = 42;
    export let y = 100;
    export var z = 200;
    export function greet() { return 'hello'; }
    export async function fetchFeed() { return []; }
    export class Widget { constructor() {} }
  "
  let stripped = worker_host.strip_exports(module_code)

  string.contains(stripped, "export const") |> should.be_false
  string.contains(stripped, "export let") |> should.be_false
  string.contains(stripped, "export var") |> should.be_false
  string.contains(stripped, "export function") |> should.be_false
  string.contains(stripped, "export async function") |> should.be_false
  string.contains(stripped, "export class") |> should.be_false

  string.contains(stripped, "const x = 42;") |> should.be_true
  string.contains(stripped, "let y = 100;") |> should.be_true
  string.contains(stripped, "var z = 200;") |> should.be_true
  string.contains(stripped, "function greet() { return 'hello'; }")
  |> should.be_true
  string.contains(stripped, "async function fetchFeed() { return []; }")
  |> should.be_true
  string.contains(stripped, "class Widget { constructor() {} }")
  |> should.be_true
}

pub fn strip_export_default_test() {
  let code =
    "
    export default function main() { return 1; }
  "
  let stripped = worker_host.strip_exports(code)
  string.contains(stripped, "export default") |> should.be_false
  string.contains(stripped, "function main() { return 1; }") |> should.be_true
}

pub fn sanitize_plugin_script_combined_test() {
  let dirty_code =
    "
    export const PI = 3.14;
    //# sourceMappingURL=math.js.map
    export default PI;
    /*# sourceMappingURL=old.map */
  "
  let clean = worker_host.sanitize_plugin_script(dirty_code)
  string.contains(clean, "export const") |> should.be_false
  string.contains(clean, "sourceMappingURL") |> should.be_false
  string.contains(clean, "const PI = 3.14;") |> should.be_true
}

pub fn build_worker_script_test() {
  let config =
    worker_host.WorkerConfig(
      plugin_id: "org.omni.plugin.feed",
      plugin_script: "console.log('feed active');\n//# sourceMappingURL=feed.map",
      runtime_script: Some("console.log('runtime bridge loaded');"),
      route: Some("?view=widget"),
      view_id: Some("widget"),
      initial_storage: Some(dict.from_list([#("cached", "true")])),
    )
  let script = worker_host.build_worker_script(config)

  // 1. Defangs unmetered host origin storage & network
  string.contains(script, "delete self.indexedDB") |> should.be_true
  string.contains(script, "delete self.caches") |> should.be_true
  string.contains(script, "delete self.fetch") |> should.be_true
  string.contains(script, "delete self.XMLHttpRequest") |> should.be_true
  string.contains(script, "delete self.WebSocket") |> should.be_true

  // 2. Global aliasing
  string.contains(script, "self.window = self") |> should.be_true
  string.contains(script, "self.parent = self") |> should.be_true

  // 3. Injected configuration
  string.contains(script, "self.__OMNI_ROUTE__ = \"?view=widget\";")
  |> should.be_true
  string.contains(script, "self.__OMNI_VIEW__ = \"widget\";") |> should.be_true
  string.contains(
    script,
    "self.__OMNI_INITIAL_STORAGE__ = {\"cached\":\"true\"};",
  )
  |> should.be_true

  // 4. Runtime & plugin execution
  string.contains(script, "console.log('runtime bridge loaded');")
  |> should.be_true
  string.contains(script, "console.log('feed active');") |> should.be_true
  string.contains(script, "sourceMappingURL") |> should.be_false
}

pub fn prepare_handshake_test() {
  let config =
    worker_host.WorkerConfig(
      plugin_id: "org.omni.plugin.checklist",
      plugin_script: "run();",
      runtime_script: None,
      route: Some("/"),
      view_id: Some("main"),
      initial_storage: None,
    )
  let handshake = worker_host.prepare_handshake(config)

  handshake.plugin_id |> should.equal("org.omni.plugin.checklist")
  handshake.message_type |> should.equal("omni:init")
  handshake.transfers_channel1 |> should.be_true
  handshake.transfers_channel2 |> should.be_true
  string.contains(handshake.payload_json, "portSchemaBus") |> should.be_true
  string.contains(handshake.payload_json, "portKernelRpc") |> should.be_true
}
