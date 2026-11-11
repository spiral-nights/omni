//// NIP-78 Arbitrary Custom App Data Workspace Schema for Omni.
////
//// Synchronizes user layout configurations, enabled plugins, viewport placements,
//// and default intent mappings across devices via Nostr `kind: 30078` events
//// tagged with `["d", "omni/workspace/v1"]`.

import gleam/dict.{type Dict}
import gleam/dynamic/decode
import gleam/float
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import omni/protocol/viewport.{type Viewport}

/// Standard NIP-78 identifier tag for Omni workspace synchronization.
pub const d_tag = "omni/workspace/v1"

/// Current schema version.
pub const current_version = 1

/// Viewport companion surface placement configuration.
pub type PluginPlacement {
  PluginPlacement(
    id: String,
    viewport: Viewport,
    route: Option(String),
    view_id: Option(String),
    enabled: Option(Bool),
    pinned: Option(Bool),
    relays: Option(List(String)),
  )
}

/// Installed plugin configuration in the user workspace.
pub type PluginConfig {
  PluginConfig(
    id: String,
    viewport: Option(Viewport),
    enabled: Bool,
    pinned: Option(Bool),
    order: Option(Int),
    naddr: Option(String),
    source_url: Option(String),
    display_name: Option(String),
    name: Option(String),
    description: Option(String),
    icon: Option(String),
    route: Option(String),
    view_id: Option(String),
    relays: Option(List(String)),
    placements: List(PluginPlacement),
    handled_intents: List(String),
    disabled_intents: List(String),
  )
}

/// Root Omni workspace state synchronized over NIP-78.
pub type WorkspaceState {
  WorkspaceState(
    version: Int,
    updated_at: Int,
    active_page: Option(String),
    auto_sync: Option(Bool),
    shell_type: Option(String),
    default_intents: Dict(String, String),
    plugins: List(PluginConfig),
  )
}

// -----------------------------------------------------------------------------
// Decoders
// -----------------------------------------------------------------------------

fn viewport_decoder() -> decode.Decoder(Viewport) {
  use s <- decode.then(decode.string)
  case viewport.parse(s) {
    Ok(vp) -> decode.success(vp)
    Error(Nil) -> decode.failure(viewport.Main, "valid viewport string")
  }
}

/// Dynamic decoder for `PluginPlacement`.
pub fn placement_decoder() -> decode.Decoder(PluginPlacement) {
  use id <- decode.field("id", decode.string)
  use vp <- decode.field("viewport", viewport_decoder())
  use rt <- decode.optional_field("route", None, decode.optional(decode.string))
  use v_id <- decode.optional_field(
    "viewId",
    None,
    decode.optional(decode.string),
  )
  use v_id_alt <- decode.optional_field(
    "view_id",
    None,
    decode.optional(decode.string),
  )
  use en <- decode.optional_field("enabled", None, decode.optional(decode.bool))
  use pin <- decode.optional_field("pinned", None, decode.optional(decode.bool))
  use rel <- decode.optional_field(
    "relays",
    None,
    decode.optional(decode.list(of: decode.string)),
  )

  let resolved_view_id = case v_id {
    Some(_) -> v_id
    None -> v_id_alt
  }

  decode.success(PluginPlacement(
    id: id,
    viewport: vp,
    route: rt,
    view_id: resolved_view_id,
    enabled: en,
    pinned: pin,
    relays: rel,
  ))
}

/// Dynamic decoder for `PluginConfig`.
pub fn plugin_config_decoder() -> decode.Decoder(PluginConfig) {
  use id <- decode.field("id", decode.string)
  use vp <- decode.optional_field(
    "viewport",
    None,
    decode.optional(viewport_decoder()),
  )
  use en <- decode.optional_field("enabled", True, decode.bool)
  use pin <- decode.optional_field("pinned", None, decode.optional(decode.bool))
  use ord <- decode.optional_field("order", None, decode.optional(decode.int))
  use na <- decode.optional_field("naddr", None, decode.optional(decode.string))
  use src <- decode.optional_field(
    "sourceUrl",
    None,
    decode.optional(decode.string),
  )
  use src_alt <- decode.optional_field(
    "source_url",
    None,
    decode.optional(decode.string),
  )
  use disp <- decode.optional_field(
    "displayName",
    None,
    decode.optional(decode.string),
  )
  use disp_alt <- decode.optional_field(
    "display_name",
    None,
    decode.optional(decode.string),
  )
  use nm <- decode.optional_field("name", None, decode.optional(decode.string))
  use desc <- decode.optional_field(
    "description",
    None,
    decode.optional(decode.string),
  )
  use ic <- decode.optional_field("icon", None, decode.optional(decode.string))
  use rt <- decode.optional_field("route", None, decode.optional(decode.string))
  use v_id <- decode.optional_field(
    "viewId",
    None,
    decode.optional(decode.string),
  )
  use v_id_alt <- decode.optional_field(
    "view_id",
    None,
    decode.optional(decode.string),
  )
  use rel <- decode.optional_field(
    "relays",
    None,
    decode.optional(decode.list(of: decode.string)),
  )
  use plc <- decode.optional_field(
    "placements",
    [],
    decode.list(of: placement_decoder()),
  )
  use h_intents <- decode.optional_field(
    "handledIntents",
    [],
    decode.list(of: decode.string),
  )
  use h_intents_alt <- decode.optional_field(
    "handled_intents",
    [],
    decode.list(of: decode.string),
  )
  use d_intents <- decode.optional_field(
    "disabledIntents",
    [],
    decode.list(of: decode.string),
  )
  use d_intents_alt <- decode.optional_field(
    "disabled_intents",
    [],
    decode.list(of: decode.string),
  )

  let resolved_src = case src {
    Some(_) -> src
    None -> src_alt
  }
  let resolved_disp = case disp {
    Some(_) -> disp
    None -> disp_alt
  }
  let resolved_vid = case v_id {
    Some(_) -> v_id
    None -> v_id_alt
  }
  let resolved_hintents = case h_intents {
    [] -> h_intents_alt
    other -> other
  }
  let resolved_dintents = case d_intents {
    [] -> d_intents_alt
    other -> other
  }

  decode.success(PluginConfig(
    id: id,
    viewport: vp,
    enabled: en,
    pinned: pin,
    order: ord,
    naddr: na,
    source_url: resolved_src,
    display_name: resolved_disp,
    name: nm,
    description: desc,
    icon: ic,
    route: rt,
    view_id: resolved_vid,
    relays: rel,
    placements: plc,
    handled_intents: resolved_hintents,
    disabled_intents: resolved_dintents,
  ))
}

/// Dynamic decoder for `WorkspaceState`.
pub fn decoder() -> decode.Decoder(WorkspaceState) {
  use ver <- decode.optional_field("version", current_version, decode.int)
  use updated <- decode.optional_field(
    "updatedAt",
    0,
    decode.one_of(decode.int, [
      {
        use f <- decode.then(decode.float)
        decode.success(float_to_int(f))
      },
    ]),
  )
  use updated_alt <- decode.optional_field(
    "updated_at",
    0,
    decode.one_of(decode.int, [
      {
        use f <- decode.then(decode.float)
        decode.success(float_to_int(f))
      },
    ]),
  )
  use page <- decode.optional_field(
    "activePage",
    None,
    decode.optional(decode.string),
  )
  use page_alt <- decode.optional_field(
    "active_page",
    None,
    decode.optional(decode.string),
  )
  use sync <- decode.optional_field(
    "autoSync",
    None,
    decode.optional(decode.bool),
  )
  use sync_alt <- decode.optional_field(
    "auto_sync",
    None,
    decode.optional(decode.bool),
  )
  use shell <- decode.optional_field(
    "shellType",
    None,
    decode.optional(decode.string),
  )
  use shell_alt <- decode.optional_field(
    "shell_type",
    None,
    decode.optional(decode.string),
  )
  use def_intents <- decode.optional_field(
    "defaultIntents",
    dict.new(),
    decode.dict(decode.string, decode.string),
  )
  use def_intents_alt <- decode.optional_field(
    "default_intents",
    dict.new(),
    decode.dict(decode.string, decode.string),
  )
  use plugins <- decode.optional_field(
    "plugins",
    [],
    decode.list(of: plugin_config_decoder()),
  )

  let resolved_updated = case updated {
    0 -> updated_alt
    other -> other
  }
  let resolved_page = case page {
    Some(_) -> page
    None -> page_alt
  }
  let resolved_sync = case sync {
    Some(_) -> sync
    None -> sync_alt
  }
  let resolved_shell = case shell {
    Some(_) -> shell
    None -> shell_alt
  }
  let resolved_def_intents = case dict.size(def_intents) {
    0 -> def_intents_alt
    _ -> def_intents
  }

  decode.success(WorkspaceState(
    version: ver,
    updated_at: resolved_updated,
    active_page: resolved_page,
    auto_sync: resolved_sync,
    shell_type: resolved_shell,
    default_intents: resolved_def_intents,
    plugins: plugins,
  ))
}

fn float_to_int(f: Float) -> Int {
  float.round(f)
}

// -----------------------------------------------------------------------------
// Encoders
// -----------------------------------------------------------------------------

/// Convert a `PluginPlacement` to `gleam/json.Json`.
pub fn placement_to_json(p: PluginPlacement) -> json.Json {
  let fields = [
    #("id", json.string(p.id)),
    #("viewport", json.string(viewport.to_string(p.viewport))),
  ]
  let fields = case p.route {
    Some(r) -> [#("route", json.string(r)), ..fields]
    None -> fields
  }
  let fields = case p.view_id {
    Some(vid) -> [#("viewId", json.string(vid)), ..fields]
    None -> fields
  }
  let fields = case p.enabled {
    Some(e) -> [#("enabled", json.bool(e)), ..fields]
    None -> fields
  }
  let fields = case p.pinned {
    Some(pin) -> [#("pinned", json.bool(pin)), ..fields]
    None -> fields
  }
  let fields = case p.relays {
    Some(rels) -> [#("relays", json.array(rels, of: json.string)), ..fields]
    None -> fields
  }
  json.object(fields)
}

/// Convert a `PluginConfig` to `gleam/json.Json`.
pub fn plugin_config_to_json(cfg: PluginConfig) -> json.Json {
  let fields = [
    #("id", json.string(cfg.id)),
    #("enabled", json.bool(cfg.enabled)),
  ]
  let fields = case cfg.viewport {
    Some(vp) -> [#("viewport", json.string(viewport.to_string(vp))), ..fields]
    None -> fields
  }
  let fields = case cfg.pinned {
    Some(pin) -> [#("pinned", json.bool(pin)), ..fields]
    None -> fields
  }
  let fields = case cfg.order {
    Some(ord) -> [#("order", json.int(ord)), ..fields]
    None -> fields
  }
  let fields = case cfg.naddr {
    Some(na) -> [#("naddr", json.string(na)), ..fields]
    None -> fields
  }
  let fields = case cfg.source_url {
    Some(src) -> [#("sourceUrl", json.string(src)), ..fields]
    None -> fields
  }
  let fields = case cfg.display_name {
    Some(disp) -> [#("displayName", json.string(disp)), ..fields]
    None -> fields
  }
  let fields = case cfg.name {
    Some(nm) -> [#("name", json.string(nm)), ..fields]
    None -> fields
  }
  let fields = case cfg.description {
    Some(desc) -> [#("description", json.string(desc)), ..fields]
    None -> fields
  }
  let fields = case cfg.icon {
    Some(ic) -> [#("icon", json.string(ic)), ..fields]
    None -> fields
  }
  let fields = case cfg.route {
    Some(rt) -> [#("route", json.string(rt)), ..fields]
    None -> fields
  }
  let fields = case cfg.view_id {
    Some(vid) -> [#("viewId", json.string(vid)), ..fields]
    None -> fields
  }
  let fields = case cfg.relays {
    Some(rels) -> [#("relays", json.array(rels, of: json.string)), ..fields]
    None -> fields
  }
  let fields = case cfg.placements {
    [] -> fields
    plcs -> [#("placements", json.array(plcs, of: placement_to_json)), ..fields]
  }
  let fields = case cfg.handled_intents {
    [] -> fields
    hi -> [#("handledIntents", json.array(hi, of: json.string)), ..fields]
  }
  let fields = case cfg.disabled_intents {
    [] -> fields
    di -> [#("disabledIntents", json.array(di, of: json.string)), ..fields]
  }
  json.object(fields)
}

/// Convert a `WorkspaceState` to `gleam/json.Json`.
pub fn to_json(state: WorkspaceState) -> json.Json {
  let fields = [
    #("version", json.int(state.version)),
    #("updatedAt", json.int(state.updated_at)),
    #("plugins", json.array(state.plugins, of: plugin_config_to_json)),
  ]
  let fields = case state.active_page {
    Some(p) -> [#("activePage", json.string(p)), ..fields]
    None -> fields
  }
  let fields = case state.auto_sync {
    Some(s) -> [#("autoSync", json.bool(s)), ..fields]
    None -> fields
  }
  let fields = case state.shell_type {
    Some(sh) -> [#("shellType", json.string(sh)), ..fields]
    None -> fields
  }
  let fields = case dict.size(state.default_intents) {
    0 -> fields
    _ -> [
      #(
        "defaultIntents",
        json.object(
          dict.to_list(state.default_intents)
          |> list.map(fn(pair) { #(pair.0, json.string(pair.1)) }),
        ),
      ),
      ..fields
    ]
  }
  json.object(fields)
}

/// Decode a JSON string into `WorkspaceState`.
pub fn decode_json(
  json_str: String,
) -> Result(WorkspaceState, json.DecodeError) {
  json.parse(from: json_str, using: decoder())
}

/// Encode `WorkspaceState` into a JSON string.
pub fn encode(state: WorkspaceState) -> String {
  to_json(state) |> json.to_string
}

// -----------------------------------------------------------------------------
// Migration Helper
// -----------------------------------------------------------------------------

/// Migrate any legacy or unversioned JSON workspace string into a modern
/// `WorkspaceState` adhering to version 1.
pub fn migrate_json(
  json_str: String,
  fallback_timestamp: Int,
) -> Result(WorkspaceState, json.DecodeError) {
  case decode_json(json_str) {
    Ok(state) -> {
      let migrated = case state.version < current_version {
        True -> WorkspaceState(..state, version: current_version)
        False -> state
      }
      let final_state = case migrated.updated_at {
        0 -> WorkspaceState(..migrated, updated_at: fallback_timestamp)
        _ -> migrated
      }
      Ok(final_state)
    }
    Error(err) -> Error(err)
  }
}
