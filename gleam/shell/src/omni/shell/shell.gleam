//// High-level facade for the Omni Shell Elm architecture and shared avatar utilities.
////
//// Strictly plugin-agnostic: zero hardcoded plugin IDs.

import gleam/int
import gleam/list
import gleam/string
import omni/shell/model.{type InstalledApp, type Model}
import omni/shell/msg.{type Msg}
import omni/shell/update.{type ShellEffect}

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
  let seed = hash_pubkey(pubkey)
  let palettes = avatar_palettes()
  let palette_count = list.length(palettes)
  let idx = case int.modulo(seed, palette_count) {
    Ok(r) -> int.absolute_value(r)
    Error(Nil) -> 0
  }
  let #(stop1, stop2, accent) = nth_palette(palettes, idx)

  let c1_x = 20 + mod_pos(seed, 60)
  let c1_y = 20 + mod_pos(int.bitwise_shift_right(seed, 4), 60)
  let c1_r = 24 + mod_pos(int.bitwise_shift_right(seed, 8), 16)
  let c1_color = case mod_pos(seed, 2) == 0 {
    True -> accent
    False -> "#ede8df"
  }

  let c2_x = 100 - c1_x
  let c2_y = 100 - c1_y
  let c2_r = 20 + mod_pos(int.bitwise_shift_right(seed, 12), 20)

  let wave_y = 64 + mod_pos(seed, 10)
  let wave_ctrl_y = 40 + mod_pos(int.bitwise_shift_right(seed, 3), 14)
  let wave_end_y = 68 + mod_pos(int.bitwise_shift_right(seed, 6), 12)

  let trimmed = string.trim(label)
  let clean_letter = case trimmed {
    "" -> "?"
    _ -> string.uppercase(string.slice(trimmed, 0, 1))
  }

  "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\" width=\"100%\" height=\"100%\">"
  <> "<rect width=\"100\" height=\"100\" rx=\"50\" fill=\""
  <> stop1
  <> "\" />"
  <> "<circle cx=\""
  <> int.to_string(c1_x)
  <> "\" cy=\""
  <> int.to_string(c1_y)
  <> "\" r=\""
  <> int.to_string(c1_r)
  <> "\" fill=\""
  <> c1_color
  <> "\" fill-opacity=\"0.3\" />"
  <> "<circle cx=\""
  <> int.to_string(c2_x)
  <> "\" cy=\""
  <> int.to_string(c2_y)
  <> "\" r=\""
  <> int.to_string(c2_r)
  <> "\" fill=\""
  <> stop2
  <> "\" fill-opacity=\"0.4\" />"
  <> "<path d=\"M 0 "
  <> int.to_string(wave_y)
  <> " Q 50 "
  <> int.to_string(wave_ctrl_y)
  <> " 100 "
  <> int.to_string(wave_end_y)
  <> " L 100 100 L 0 100 Z\" fill=\"#141312\" fill-opacity=\"0.3\" />"
  <> "<circle cx=\"50\" cy=\"50\" r=\"47.5\" fill=\"none\" stroke=\"#ede8df\" stroke-opacity=\"0.25\" stroke-width=\"1.5\" />"
  <> "<text x=\"50\" y=\"52\" font-family=\"sans-serif\" font-size=\"46\" font-weight=\"900\" fill=\"#ffffff\" text-anchor=\"middle\" dominant-baseline=\"central\">"
  <> clean_letter
  <> "</text>"
  <> "</svg>"
}

fn mod_pos(n: Int, divisor: Int) -> Int {
  case int.modulo(n, divisor) {
    Ok(r) -> int.absolute_value(r)
    Error(Nil) -> 0
  }
}

fn hash_pubkey(pubkey: String) -> Int {
  let codepoints = string.to_utf_codepoints(pubkey)
  let raw =
    list.fold(codepoints, 0, fn(acc, cp) {
      let code = string.utf_codepoint_to_int(cp)
      let shifted = int.bitwise_shift_left(acc, 5) - acc + code
      int.bitwise_and(shifted, 0x7fffffff)
    })
  int.absolute_value(raw)
}

fn avatar_palettes() -> List(#(String, String, String)) {
  [
    #("#c85d3e", "#3d190e", "#ffd2c2"),
    #("#288755", "#0b2e1b", "#bcf5d4"),
    #("#356ec4", "#102347", "#cce0ff"),
    #("#85419c", "#2b1036", "#f3cbff"),
    #("#aa3148", "#3b0d17", "#ffd0d9"),
    #("#23858a", "#0a2d2f", "#bdf4f7"),
    #("#b88320", "#3d2905", "#ffe6b0"),
    #("#4d5ec2", "#161b42", "#d4dcff"),
    #("#c24965", "#3b0f1b", "#ffd2dc"),
    #("#6b8028", "#222c09", "#e4f7a8"),
    #("#8e4a7d", "#2e1227", "#f9d0ee"),
    #("#1c83a8", "#072b38", "#bceeff"),
    #("#bd5726", "#381506", "#ffd3bb"),
    #("#6a47b8", "#1e113d", "#e0d4ff"),
    #("#25846f", "#092d24", "#bcf5e6"),
    #("#a16328", "#331c07", "#fedec0"),
  ]
}

fn nth_palette(
  palettes: List(#(String, String, String)),
  target: Int,
) -> #(String, String, String) {
  case palettes, target {
    [first, ..], 0 -> first
    [_, ..rest], n if n > 0 -> nth_palette(rest, n - 1)
    _, _ -> #("#c85d3e", "#3d190e", "#ffd2c2")
  }
}

fn percent_encode_svg(svg: String) -> String {
  svg
  |> string.replace("%", "%25")
  |> string.replace("#", "%23")
  |> string.replace("<", "%3C")
  |> string.replace(">", "%3E")
  |> string.replace("\"", "'")
}
