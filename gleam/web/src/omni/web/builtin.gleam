//// Host-rendered built-in plugin views.
////
//// First-party plugins are Gleam packages. Until their bundles are resolved
//// into sandboxes, the host starts them in-process and hands their Schema
//// trees to the shell, which renders them and routes actions back here.
//// Plugin IDs live only in `config`/`builtin`, never in the shell or UI.

import omni/plugin_kit/app.{type RunningApp}
import omni/plugin_kit/route
import omni/protocol/schema/action.{type Action}
import omni/protocol/schema/node.{type Node}
import plugin/checklist/main as checklist
import plugin/feed/main as feed
import plugin/notes/main as notes
import plugin/profiles/main as profiles
import plugin/publisher/main as publisher
import plugin/relays/main as relays
import plugin/timer/main as timer

/// A built-in plugin running in-process in the host.
pub type BuiltinApp {
  BuiltinApp(
    render: fn() -> Node,
    navigate: fn(String) -> Nil,
    handle_action: fn(Action) -> Bool,
  )
}

/// The first-party applications bundled with the host.
pub fn apps() -> List(#(String, BuiltinApp)) {
  [
    #("org.omni.plugin.feed", host(fn(emit) { feed.start_app("", emit) })),
    #(
      "org.omni.plugin.checklist",
      host(fn(emit) { checklist.start_app("", emit) }),
    ),
    #("org.omni.plugin.timer", host(fn(emit) { timer.start_app("", emit) })),
    #("org.omni.plugin.notes", host(fn(emit) { notes.start_app("", emit) })),
    #("org.omni.plugin.relays", host(fn(emit) { relays.start_app("", emit) })),
    #(
      "org.omni.plugin.profiles",
      host(fn(emit) { profiles.start_app("", emit) }),
    ),
    #(
      "org.omni.plugin.publisher",
      host(fn(emit) { publisher.start_app("", emit) }),
    ),
  ]
}

fn host(start: fn(fn(Node) -> Nil) -> RunningApp(a, b)) -> BuiltinApp {
  let running = start(fn(_node) { Nil })

  BuiltinApp(
    render: fn() { app.current_view(running) },
    navigate: fn(raw_route) {
      app.navigate(running, route.parse_search(raw_route))
    },
    handle_action: fn(action) { app.handle_action(running, action) },
  )
}
