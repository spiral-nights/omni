//// High-level facade for the Omni Shell Elm architecture and shared avatar utilities.
////
//// Strictly plugin-agnostic: zero hardcoded plugin IDs.

import gleam/string
import lustre/element
import omni/shell/model.{type InstalledApp, type Model}
import omni/shell/msg.{type Msg}
import omni/shell/update.{type ShellEffect}
import omni/ui/avatar as omni_avatar

/// Initialize the shell model with an active shell ID and installed apps.
pub fn init(active_shell_id: String, apps: List(InstalledApp)) -> Model {
  model.init(active_shell_id, apps)
}

/// Process a shell message and return the updated model and side effects.
pub fn update(m: Model, message: Msg) -> #(Model, List(ShellEffect)) {
  update.update(m, message)
}

/// Generate a deterministic SVG data URI avatar derived from a pubkey and label,
/// matching the Warm Paper Dark palette harmonies from `base-shell.ts`.
pub fn avatar_data_uri(pubkey: String, label: String) -> String {
  let svg_str = avatar_svg(pubkey, label)
  "data:image/svg+xml;utf8," <> percent_encode_svg(svg_str)
}

/// Generate the raw SVG markup for a deterministic pubkey avatar.
pub fn avatar_svg(pubkey: String, label: String) -> String {
  omni_avatar.render(pubkey, label)
  |> element.to_string
}

fn percent_encode_svg(svg: String) -> String {
  svg
  |> string.replace("%", "%25")
  |> string.replace("#", "%23")
  |> string.replace("<", "%3C")
  |> string.replace(">", "%3E")
  |> string.replace("\"", "'")
}
