//// JSON codec for Omni Server-Driven UI component trees.
////
//// Encodes and decodes the `omni:schema` wire format used over postMessage Channel 1
//// between guest plugin sandboxes and the host runtime.

import gleam/dynamic/decode
import gleam/float
import gleam/int
import gleam/json
import gleam/option.{type Option, None, Some}
import omni/protocol/schema/action
import omni/protocol/schema/node.{
  type Align, type BadgeTone, type BadgeVariant, type BannerTone,
  type ButtonVariant, type Direction, type IconButtonVariant, type IconPosition,
  type IndicatorStatus, type InputType, type Justify, type MetricTrend,
  type MetricValue, type Node, type NodeBase, type Orientation,
  type PageDeclaration, type ProgressVariant, type SelectOption, type TabItem,
  type TextTone, type TextVariant, AlignCenter, AlignEnd, AlignStart,
  AlignStretch, Avatar, Badge, BadgeAccent, BadgeError, BadgeNeutral,
  BadgeOutline, BadgeSolid, BadgeSubtle, BadgeSuccess, BadgeWarning, Banner,
  BannerError, BannerInfo, BannerSuccess, BannerWarning, Body, Box, Button,
  ButtonDanger, ButtonGhost, ButtonPrimary, ButtonSecondary, Caption, Card,
  CodeBlock, Column, Divider, EmptyState, Horizontal, Icon, IconButton,
  IconButtonDanger, IconButtonGhost, IconButtonSecondary, IconLeft, IconRight,
  Input, InputFile, InputNumber, InputPassword, InputSearch, InputText, InputUrl,
  JustifyBetween, JustifyCenter, JustifyEnd, JustifyStart, List, ListItem,
  Metric, MetricFloat, MetricInt, MetricString, Mono, NodeBase, PageDeclaration,
  Progress, ProgressBar, ProgressDisk, ProgressRing, ProgressSpinner, Row,
  Select, SelectOption, Spacer, StatusConnecting, StatusError, StatusIndicator,
  StatusOffline, StatusOnline, Subtitle, TabItem, Tabs, Text, Textarea, Title,
  Toggle, ToneAccent, ToneError, ToneMuted, TonePrimary, ToneSecondary,
  ToneSuccess, TrendDown, TrendNeutral, TrendUp, Vertical, VirtualList,
}
import omni/protocol/schema/style.{type SizeToken}

/// Wire envelope for `omni:schema` postMessage actions.
pub type SchemaMessage {
  SchemaMessage(type_name: String, schema: Node, component_id: Option(String))
}

// -----------------------------------------------------------------------------
// Enums to/from strings
// -----------------------------------------------------------------------------

pub fn direction_to_string(dir: Direction) -> String {
  case dir {
    Row -> "row"
    Column -> "column"
  }
}

pub fn direction_from_string(s: String) -> Result(Direction, Nil) {
  case s {
    "row" -> Ok(Row)
    "column" -> Ok(Column)
    _ -> Error(Nil)
  }
}

pub fn align_to_string(a: Align) -> String {
  case a {
    AlignStart -> "start"
    AlignCenter -> "center"
    AlignEnd -> "end"
    AlignStretch -> "stretch"
  }
}

pub fn align_from_string(s: String) -> Result(Align, Nil) {
  case s {
    "start" -> Ok(AlignStart)
    "center" -> Ok(AlignCenter)
    "end" -> Ok(AlignEnd)
    "stretch" -> Ok(AlignStretch)
    _ -> Error(Nil)
  }
}

pub fn justify_to_string(j: Justify) -> String {
  case j {
    JustifyStart -> "start"
    JustifyCenter -> "center"
    JustifyBetween -> "between"
    JustifyEnd -> "end"
  }
}

pub fn justify_from_string(s: String) -> Result(Justify, Nil) {
  case s {
    "start" -> Ok(JustifyStart)
    "center" -> Ok(JustifyCenter)
    "between" -> Ok(JustifyBetween)
    "end" -> Ok(JustifyEnd)
    _ -> Error(Nil)
  }
}

pub fn orientation_to_string(o: Orientation) -> String {
  case o {
    Horizontal -> "horizontal"
    Vertical -> "vertical"
  }
}

pub fn orientation_from_string(s: String) -> Result(Orientation, Nil) {
  case s {
    "horizontal" -> Ok(Horizontal)
    "vertical" -> Ok(Vertical)
    _ -> Error(Nil)
  }
}

pub fn text_variant_to_string(v: TextVariant) -> String {
  case v {
    Title -> "title"
    Subtitle -> "subtitle"
    Body -> "body"
    Caption -> "caption"
    Mono -> "mono"
  }
}

pub fn text_variant_from_string(s: String) -> Result(TextVariant, Nil) {
  case s {
    "title" -> Ok(Title)
    "subtitle" -> Ok(Subtitle)
    "body" -> Ok(Body)
    "caption" -> Ok(Caption)
    "mono" -> Ok(Mono)
    _ -> Error(Nil)
  }
}

pub fn text_tone_to_string(t: TextTone) -> String {
  case t {
    TonePrimary -> "primary"
    ToneSecondary -> "secondary"
    ToneMuted -> "muted"
    ToneAccent -> "accent"
    ToneError -> "error"
    ToneSuccess -> "success"
  }
}

pub fn text_tone_from_string(s: String) -> Result(TextTone, Nil) {
  case s {
    "primary" -> Ok(TonePrimary)
    "secondary" -> Ok(ToneSecondary)
    "muted" -> Ok(ToneMuted)
    "accent" -> Ok(ToneAccent)
    "error" -> Ok(ToneError)
    "success" -> Ok(ToneSuccess)
    _ -> Error(Nil)
  }
}

pub fn badge_tone_to_string(t: BadgeTone) -> String {
  case t {
    BadgeNeutral -> "neutral"
    BadgeSuccess -> "success"
    BadgeWarning -> "warning"
    BadgeError -> "error"
    BadgeAccent -> "accent"
  }
}

pub fn badge_tone_from_string(s: String) -> Result(BadgeTone, Nil) {
  case s {
    "neutral" -> Ok(BadgeNeutral)
    "success" -> Ok(BadgeSuccess)
    "warning" -> Ok(BadgeWarning)
    "error" -> Ok(BadgeError)
    "accent" -> Ok(BadgeAccent)
    _ -> Error(Nil)
  }
}

pub fn badge_variant_to_string(v: BadgeVariant) -> String {
  case v {
    BadgeSolid -> "solid"
    BadgeSubtle -> "subtle"
    BadgeOutline -> "outline"
  }
}

pub fn badge_variant_from_string(s: String) -> Result(BadgeVariant, Nil) {
  case s {
    "solid" -> Ok(BadgeSolid)
    "subtle" -> Ok(BadgeSubtle)
    "outline" -> Ok(BadgeOutline)
    _ -> Error(Nil)
  }
}

pub fn trend_to_string(t: MetricTrend) -> String {
  case t {
    TrendUp -> "up"
    TrendDown -> "down"
    TrendNeutral -> "neutral"
  }
}

pub fn trend_from_string(s: String) -> Result(MetricTrend, Nil) {
  case s {
    "up" -> Ok(TrendUp)
    "down" -> Ok(TrendDown)
    "neutral" -> Ok(TrendNeutral)
    _ -> Error(Nil)
  }
}

pub fn button_variant_to_string(v: ButtonVariant) -> String {
  case v {
    ButtonPrimary -> "primary"
    ButtonSecondary -> "secondary"
    ButtonGhost -> "ghost"
    ButtonDanger -> "danger"
  }
}

pub fn button_variant_from_string(s: String) -> Result(ButtonVariant, Nil) {
  case s {
    "primary" -> Ok(ButtonPrimary)
    "secondary" -> Ok(ButtonSecondary)
    "ghost" -> Ok(ButtonGhost)
    "danger" -> Ok(ButtonDanger)
    _ -> Error(Nil)
  }
}

pub fn icon_button_variant_to_string(v: IconButtonVariant) -> String {
  case v {
    IconButtonGhost -> "ghost"
    IconButtonSecondary -> "secondary"
    IconButtonDanger -> "danger"
  }
}

pub fn icon_button_variant_from_string(
  s: String,
) -> Result(IconButtonVariant, Nil) {
  case s {
    "ghost" -> Ok(IconButtonGhost)
    "secondary" -> Ok(IconButtonSecondary)
    "danger" -> Ok(IconButtonDanger)
    _ -> Error(Nil)
  }
}

pub fn icon_position_to_string(p: IconPosition) -> String {
  case p {
    IconLeft -> "left"
    IconRight -> "right"
  }
}

pub fn icon_position_from_string(s: String) -> Result(IconPosition, Nil) {
  case s {
    "left" -> Ok(IconLeft)
    "right" -> Ok(IconRight)
    _ -> Error(Nil)
  }
}

pub fn input_type_to_string(t: InputType) -> String {
  case t {
    InputText -> "text"
    InputNumber -> "number"
    InputSearch -> "search"
    InputUrl -> "url"
    InputPassword -> "password"
    InputFile -> "file"
  }
}

pub fn input_type_from_string(s: String) -> Result(InputType, Nil) {
  case s {
    "text" -> Ok(InputText)
    "number" -> Ok(InputNumber)
    "search" -> Ok(InputSearch)
    "url" -> Ok(InputUrl)
    "password" -> Ok(InputPassword)
    "file" -> Ok(InputFile)
    _ -> Error(Nil)
  }
}

pub fn indicator_status_to_string(s: IndicatorStatus) -> String {
  case s {
    StatusOnline -> "online"
    StatusConnecting -> "connecting"
    StatusOffline -> "offline"
    StatusError -> "error"
  }
}

pub fn indicator_status_from_string(s: String) -> Result(IndicatorStatus, Nil) {
  case s {
    "online" -> Ok(StatusOnline)
    "connecting" -> Ok(StatusConnecting)
    "offline" -> Ok(StatusOffline)
    "error" -> Ok(StatusError)
    _ -> Error(Nil)
  }
}

pub fn progress_variant_to_string(v: ProgressVariant) -> String {
  case v {
    ProgressBar -> "bar"
    ProgressSpinner -> "spinner"
    ProgressDisk -> "disk"
    ProgressRing -> "ring"
  }
}

pub fn progress_variant_from_string(s: String) -> Result(ProgressVariant, Nil) {
  case s {
    "bar" -> Ok(ProgressBar)
    "spinner" -> Ok(ProgressSpinner)
    "disk" -> Ok(ProgressDisk)
    "ring" -> Ok(ProgressRing)
    _ -> Error(Nil)
  }
}

pub fn banner_tone_to_string(t: BannerTone) -> String {
  case t {
    BannerInfo -> "info"
    BannerSuccess -> "success"
    BannerWarning -> "warning"
    BannerError -> "error"
  }
}

pub fn banner_tone_from_string(s: String) -> Result(BannerTone, Nil) {
  case s {
    "info" -> Ok(BannerInfo)
    "success" -> Ok(BannerSuccess)
    "warning" -> Ok(BannerWarning)
    "error" -> Ok(BannerError)
    _ -> Error(Nil)
  }
}

// -----------------------------------------------------------------------------
// Sub-decoders
// -----------------------------------------------------------------------------

fn size_token_decoder() -> decode.Decoder(SizeToken) {
  use s <- decode.then(decode.string)
  case style.size_from_string(s) {
    Ok(st) -> decode.success(st)
    Error(Nil) ->
      decode.failure(style.SizeNone, "SizeToken (none, xs, sm, md, lg, xl)")
  }
}

fn page_declaration_decoder() -> decode.Decoder(PageDeclaration) {
  decode.one_of(
    {
      use s <- decode.then(decode.string)
      decode.success(PageDeclaration(id: s, title: None, url: None))
    },
    [
      {
        use id <- decode.field("id", decode.string)
        use title <- decode.optional_field(
          "title",
          None,
          decode.optional(decode.string),
        )
        use url <- decode.optional_field(
          "url",
          None,
          decode.optional(decode.string),
        )
        decode.success(PageDeclaration(id: id, title: title, url: url))
      },
    ],
  )
}

fn page_declaration_to_json(p: PageDeclaration) -> json.Json {
  let fields = [#("id", json.string(p.id))]
  let fields = case p.title {
    Some(t) -> [#("title", json.string(t)), ..fields]
    None -> fields
  }
  let fields = case p.url {
    Some(u) -> [#("url", json.string(u)), ..fields]
    None -> fields
  }
  json.object(fields)
}

fn select_option_decoder() -> decode.Decoder(SelectOption) {
  use label <- decode.field("label", decode.string)
  use val <- decode.field("value", decode.string)
  decode.success(SelectOption(label: label, value: val))
}

fn select_option_to_json(opt: SelectOption) -> json.Json {
  json.object([
    #("label", json.string(opt.label)),
    #("value", json.string(opt.value)),
  ])
}

fn tab_item_decoder() -> decode.Decoder(TabItem) {
  use id <- decode.field("id", decode.string)
  use label <- decode.field("label", decode.string)
  use icon <- decode.optional_field(
    "icon",
    None,
    decode.optional(decode.string),
  )
  use badge <- decode.optional_field(
    "badge",
    None,
    decode.optional(
      decode.one_of(decode.string, [
        decode.map(decode.int, int.to_string),
        decode.map(decode.float, float.to_string),
      ]),
    ),
  )
  decode.success(TabItem(id: id, label: label, icon: icon, badge: badge))
}

fn tab_item_to_json(tab: TabItem) -> json.Json {
  let fields = [
    #("id", json.string(tab.id)),
    #("label", json.string(tab.label)),
  ]
  let fields = case tab.icon {
    Some(i) -> [#("icon", json.string(i)), ..fields]
    None -> fields
  }
  let fields = case tab.badge {
    Some(b) -> [#("badge", json.string(b)), ..fields]
    None -> fields
  }
  json.object(fields)
}

fn metric_value_decoder() -> decode.Decoder(MetricValue) {
  decode.one_of(decode.map(decode.int, MetricInt), [
    decode.map(decode.float, MetricFloat),
    decode.map(decode.string, MetricString),
  ])
}

fn metric_value_to_json(val: MetricValue) -> json.Json {
  case val {
    MetricInt(i) -> json.int(i)
    MetricFloat(f) -> json.float(f)
    MetricString(s) -> json.string(s)
  }
}

// -----------------------------------------------------------------------------
// Base fields decoder / encoder
// -----------------------------------------------------------------------------

fn base_decoder() -> decode.Decoder(NodeBase) {
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use key <- decode.optional_field("key", None, decode.optional(decode.string))
  use visible <- decode.optional_field(
    "visible",
    None,
    decode.optional(decode.bool),
  )
  use st <- decode.optional_field(
    "style",
    None,
    decode.optional(style.decoder()),
  )
  use pg <- decode.optional_field(
    "page",
    None,
    decode.optional(page_declaration_decoder()),
  )
  decode.success(NodeBase(
    id: id,
    key: key,
    visible: visible,
    style: st,
    page: pg,
  ))
}

fn add_base_fields(
  fields: List(#(String, json.Json)),
  base: NodeBase,
) -> List(#(String, json.Json)) {
  let fields = case base.id {
    Some(id) -> [#("id", json.string(id)), ..fields]
    None -> fields
  }
  let fields = case base.key {
    Some(k) -> [#("key", json.string(k)), ..fields]
    None -> fields
  }
  let fields = case base.visible {
    Some(v) -> [#("visible", json.bool(v)), ..fields]
    None -> fields
  }
  let fields = case base.style {
    Some(s) -> [#("style", style.to_json(s)), ..fields]
    None -> fields
  }
  let fields = case base.page {
    Some(p) -> [#("page", page_declaration_to_json(p)), ..fields]
    None -> fields
  }
  fields
}

// -----------------------------------------------------------------------------
// Node decoder
// -----------------------------------------------------------------------------

/// Dynamic decoder for any Omni Schema `Node` (recursive).
pub fn node_decoder() -> decode.Decoder(Node) {
  use <- decode.recursive
  use node_type <- decode.field("type", decode.string)
  use base <- decode.then(base_decoder())

  case node_type {
    "box" -> decode_box(base)
    "card" -> decode_card(base)
    "divider" -> decode_divider(base)
    "spacer" -> decode_spacer(base)
    "text" -> decode_text(base)
    "badge" -> decode_badge(base)
    "metric" -> decode_metric(base)
    "icon" -> decode_icon(base)
    "avatar" -> decode_avatar(base)
    "button" -> decode_button(base)
    "icon-button" | "icon_button" -> decode_icon_button(base)
    "input" -> decode_input(base)
    "textarea" -> decode_textarea(base)
    "toggle" -> decode_toggle(base)
    "select" -> decode_select(base)
    "tabs" -> decode_tabs(base)
    "status-indicator" | "status_indicator" -> decode_status_indicator(base)
    "code-block" | "code_block" -> decode_code_block(base)
    "progress" -> decode_progress(base)
    "banner" -> decode_banner(base)
    "list" -> decode_list(base)
    "list-item" | "list_item" -> decode_list_item(base)
    "empty-state" | "empty_state" -> decode_empty_state(base)
    "virtual-list" | "virtual_list" -> decode_virtual_list(base)
    other ->
      decode.failure(
        node.Spacer(base, None),
        "Unknown schema node type: " <> other,
      )
  }
}

fn decode_box(base: NodeBase) -> decode.Decoder(Node) {
  use dir <- decode.optional_field(
    "direction",
    None,
    decode.optional({
      use s <- decode.then(decode.string)
      case direction_from_string(s) {
        Ok(d) -> decode.success(d)
        Error(Nil) -> decode.failure(Row, "direction (row, column)")
      }
    }),
  )
  use gp <- decode.optional_field(
    "gap",
    None,
    decode.optional(size_token_decoder()),
  )
  use al <- decode.optional_field(
    "align",
    None,
    decode.optional({
      use s <- decode.then(decode.string)
      case align_from_string(s) {
        Ok(a) -> decode.success(a)
        Error(Nil) -> decode.failure(AlignStart, "align")
      }
    }),
  )
  use just <- decode.optional_field(
    "justify",
    None,
    decode.optional({
      use s <- decode.then(decode.string)
      case justify_from_string(s) {
        Ok(j) -> decode.success(j)
        Error(Nil) -> decode.failure(JustifyStart, "justify")
      }
    }),
  )
  use wrap <- decode.optional_field("wrap", None, decode.optional(decode.bool))
  use pad <- decode.optional_field(
    "padding",
    None,
    decode.optional(size_token_decoder()),
  )
  use act <- decode.optional_field(
    "action",
    None,
    decode.optional(action.decoder()),
  )
  use bg <- decode.optional_field(
    "background",
    None,
    decode.optional(decode.string),
  )
  use kids <- decode.optional_field(
    "children",
    [],
    decode.list(of: node_decoder()),
  )

  decode.success(Box(
    base: base,
    direction: dir,
    gap: gp,
    align: al,
    justify: just,
    wrap: wrap,
    padding: pad,
    action: act,
    background: bg,
    children: kids,
  ))
}

fn decode_card(base: NodeBase) -> decode.Decoder(Node) {
  use title <- decode.optional_field(
    "title",
    None,
    decode.optional(decode.string),
  )
  use subtitle <- decode.optional_field(
    "subtitle",
    None,
    decode.optional(decode.string),
  )
  use icon <- decode.optional_field(
    "icon",
    None,
    decode.optional(decode.string),
  )
  use header_action <- decode.optional_field(
    "headerAction",
    None,
    decode.optional(node_decoder()),
  )
  use children <- decode.optional_field(
    "children",
    [],
    decode.list(of: node_decoder()),
  )
  use footer <- decode.optional_field(
    "footer",
    [],
    decode.list(of: node_decoder()),
  )
  use act <- decode.optional_field(
    "action",
    None,
    decode.optional(action.decoder()),
  )
  use banner_bg <- decode.optional_field(
    "bannerBackground",
    None,
    decode.optional(decode.string),
  )

  decode.success(Card(
    base: base,
    title: title,
    subtitle: subtitle,
    icon: icon,
    header_action: header_action,
    children: children,
    footer: footer,
    action: act,
    banner_background: banner_bg,
  ))
}

fn decode_divider(base: NodeBase) -> decode.Decoder(Node) {
  use ori <- decode.optional_field(
    "orientation",
    None,
    decode.optional({
      use s <- decode.then(decode.string)
      case orientation_from_string(s) {
        Ok(o) -> decode.success(o)
        Error(Nil) -> decode.failure(Horizontal, "orientation")
      }
    }),
  )
  decode.success(Divider(base: base, orientation: ori))
}

fn decode_spacer(base: NodeBase) -> decode.Decoder(Node) {
  use sz <- decode.optional_field(
    "size",
    None,
    decode.optional(size_token_decoder()),
  )
  decode.success(Spacer(base: base, size: sz))
}

fn decode_text(base: NodeBase) -> decode.Decoder(Node) {
  use content <- decode.field("content", decode.string)
  use vr <- decode.optional_field(
    "variant",
    None,
    decode.optional({
      use s <- decode.then(decode.string)
      case text_variant_from_string(s) {
        Ok(v) -> decode.success(v)
        Error(Nil) -> decode.failure(Body, "variant")
      }
    }),
  )
  use tn <- decode.optional_field(
    "tone",
    None,
    decode.optional({
      use s <- decode.then(decode.string)
      case text_tone_from_string(s) {
        Ok(t) -> decode.success(t)
        Error(Nil) -> decode.failure(TonePrimary, "tone")
      }
    }),
  )
  use trunc <- decode.optional_field(
    "truncate",
    None,
    decode.optional(decode.bool),
  )
  use act <- decode.optional_field(
    "action",
    None,
    decode.optional(action.decoder()),
  )
  use inline_img <- decode.optional_field(
    "showInlineImages",
    None,
    decode.optional(decode.bool),
  )

  decode.success(Text(
    base: base,
    content: content,
    variant: vr,
    tone: tn,
    truncate: trunc,
    action: act,
    show_inline_images: inline_img,
  ))
}

fn decode_badge(base: NodeBase) -> decode.Decoder(Node) {
  use label <- decode.field("label", decode.string)
  use tn <- decode.optional_field(
    "tone",
    None,
    decode.optional({
      use s <- decode.then(decode.string)
      case badge_tone_from_string(s) {
        Ok(t) -> decode.success(t)
        Error(Nil) -> decode.failure(BadgeNeutral, "badge tone")
      }
    }),
  )
  use vr <- decode.optional_field(
    "variant",
    None,
    decode.optional({
      use s <- decode.then(decode.string)
      case badge_variant_from_string(s) {
        Ok(v) -> decode.success(v)
        Error(Nil) -> decode.failure(BadgeSolid, "badge variant")
      }
    }),
  )
  use dot <- decode.optional_field("dot", None, decode.optional(decode.bool))

  decode.success(Badge(
    base: base,
    label: label,
    tone: tn,
    variant: vr,
    dot: dot,
  ))
}

fn decode_metric(base: NodeBase) -> decode.Decoder(Node) {
  use label <- decode.field("label", decode.string)
  use val <- decode.field("value", metric_value_decoder())
  use sub <- decode.optional_field(
    "subtext",
    None,
    decode.optional(decode.string),
  )
  use tr <- decode.optional_field(
    "trend",
    None,
    decode.optional({
      use s <- decode.then(decode.string)
      case trend_from_string(s) {
        Ok(t) -> decode.success(t)
        Error(Nil) -> decode.failure(TrendNeutral, "metric trend")
      }
    }),
  )

  decode.success(Metric(
    base: base,
    label: label,
    value: val,
    subtext: sub,
    trend: tr,
  ))
}

fn decode_icon(base: NodeBase) -> decode.Decoder(Node) {
  use name <- decode.field("name", decode.string)
  use sz <- decode.optional_field("size", None, decode.optional(decode.int))
  decode.success(Icon(base: base, name: name, size: sz))
}

fn decode_avatar(base: NodeBase) -> decode.Decoder(Node) {
  use src <- decode.optional_field("src", None, decode.optional(decode.string))
  use pubkey <- decode.optional_field(
    "pubkey",
    None,
    decode.optional(decode.string),
  )
  use name <- decode.optional_field(
    "name",
    None,
    decode.optional(decode.string),
  )
  use sz <- decode.optional_field(
    "size",
    None,
    decode.optional(size_token_decoder()),
  )
  use act <- decode.optional_field(
    "action",
    None,
    decode.optional(action.decoder()),
  )

  decode.success(Avatar(
    base: base,
    src: src,
    pubkey: pubkey,
    name: name,
    size: sz,
    action: act,
  ))
}

fn decode_button(base: NodeBase) -> decode.Decoder(Node) {
  use label <- decode.field("label", decode.string)
  use act <- decode.field("action", action.decoder())
  use vr <- decode.optional_field(
    "variant",
    None,
    decode.optional({
      use s <- decode.then(decode.string)
      case button_variant_from_string(s) {
        Ok(v) -> decode.success(v)
        Error(Nil) -> decode.failure(ButtonPrimary, "button variant")
      }
    }),
  )
  use sz <- decode.optional_field(
    "size",
    None,
    decode.optional(size_token_decoder()),
  )
  use icon <- decode.optional_field(
    "icon",
    None,
    decode.optional(decode.string),
  )
  use icon_pos <- decode.optional_field(
    "iconPosition",
    None,
    decode.optional({
      use s <- decode.then(decode.string)
      case icon_position_from_string(s) {
        Ok(p) -> decode.success(p)
        Error(Nil) -> decode.failure(IconLeft, "icon position")
      }
    }),
  )
  use dis <- decode.optional_field(
    "disabled",
    None,
    decode.optional(decode.bool),
  )
  use load <- decode.optional_field(
    "loading",
    None,
    decode.optional(decode.bool),
  )

  decode.success(Button(
    base: base,
    label: label,
    action: act,
    variant: vr,
    size: sz,
    icon: icon,
    icon_position: icon_pos,
    disabled: dis,
    loading: load,
  ))
}

fn decode_icon_button(base: NodeBase) -> decode.Decoder(Node) {
  use icon <- decode.field("icon", decode.string)
  use tip <- decode.optional_field(
    "tooltip",
    None,
    decode.optional(decode.string),
  )
  use act <- decode.field("action", action.decoder())
  use vr <- decode.optional_field(
    "variant",
    None,
    decode.optional({
      use s <- decode.then(decode.string)
      case icon_button_variant_from_string(s) {
        Ok(v) -> decode.success(v)
        Error(Nil) -> decode.failure(IconButtonGhost, "icon button variant")
      }
    }),
  )
  use sz <- decode.optional_field(
    "size",
    None,
    decode.optional(size_token_decoder()),
  )
  use dis <- decode.optional_field(
    "disabled",
    None,
    decode.optional(decode.bool),
  )

  decode.success(IconButton(
    base: base,
    icon: icon,
    tooltip: tip,
    action: act,
    variant: vr,
    size: sz,
    disabled: dis,
  ))
}

fn decode_input(base: NodeBase) -> decode.Decoder(Node) {
  use name <- decode.field("name", decode.string)
  use ph <- decode.optional_field(
    "placeholder",
    None,
    decode.optional(decode.string),
  )
  use val <- decode.optional_field(
    "value",
    None,
    decode.optional(decode.string),
  )
  use in_type <- decode.optional_field(
    "inputType",
    None,
    decode.optional({
      use s <- decode.then(decode.string)
      case input_type_from_string(s) {
        Ok(t) -> decode.success(t)
        Error(Nil) -> decode.failure(InputText, "input type")
      }
    }),
  )
  use acc <- decode.optional_field(
    "accept",
    None,
    decode.optional(decode.string),
  )
  use clr <- decode.optional_field(
    "clearable",
    None,
    decode.optional(decode.bool),
  )
  use pfx <- decode.optional_field(
    "prefixIcon",
    None,
    decode.optional(decode.string),
  )
  use on_enter <- decode.optional_field(
    "actionOnEnter",
    None,
    decode.optional(action.decoder()),
  )
  use on_change <- decode.optional_field(
    "actionOnChange",
    None,
    decode.optional(action.decoder()),
  )

  decode.success(Input(
    base: base,
    name: name,
    placeholder: ph,
    value: val,
    input_type: in_type,
    accept: acc,
    clearable: clr,
    prefix_icon: pfx,
    action_on_enter: on_enter,
    action_on_change: on_change,
  ))
}

fn decode_textarea(base: NodeBase) -> decode.Decoder(Node) {
  use name <- decode.field("name", decode.string)
  use ph <- decode.optional_field(
    "placeholder",
    None,
    decode.optional(decode.string),
  )
  use val <- decode.optional_field(
    "value",
    None,
    decode.optional(decode.string),
  )
  use rows <- decode.optional_field("rows", None, decode.optional(decode.int))
  use change <- decode.optional_field(
    "actionOnChange",
    None,
    decode.optional(action.decoder()),
  )

  decode.success(Textarea(
    base: base,
    name: name,
    placeholder: ph,
    value: val,
    rows: rows,
    action_on_change: change,
  ))
}

fn decode_toggle(base: NodeBase) -> decode.Decoder(Node) {
  use name <- decode.field("name", decode.string)
  use lbl <- decode.optional_field(
    "label",
    None,
    decode.optional(decode.string),
  )
  use chk <- decode.field("checked", decode.bool)
  use act <- decode.field("action", action.decoder())
  use dis <- decode.optional_field(
    "disabled",
    None,
    decode.optional(decode.bool),
  )

  decode.success(Toggle(
    base: base,
    name: name,
    label: lbl,
    checked: chk,
    action: act,
    disabled: dis,
  ))
}

fn decode_select(base: NodeBase) -> decode.Decoder(Node) {
  use name <- decode.field("name", decode.string)
  use val <- decode.optional_field(
    "value",
    None,
    decode.optional(decode.string),
  )
  use opts <- decode.optional_field(
    "options",
    [],
    decode.list(of: select_option_decoder()),
  )
  use act <- decode.optional_field(
    "action",
    None,
    decode.optional(action.decoder()),
  )

  decode.success(Select(
    base: base,
    name: name,
    value: val,
    options: opts,
    action: act,
  ))
}

fn decode_tabs(base: NodeBase) -> decode.Decoder(Node) {
  use tabs_list <- decode.optional_field(
    "tabs",
    [],
    decode.list(of: tab_item_decoder()),
  )
  use active <- decode.field("activeTab", decode.string)
  use act <- decode.field("action", action.decoder())

  decode.success(Tabs(
    base: base,
    tabs: tabs_list,
    active_tab: active,
    action: act,
  ))
}

fn decode_status_indicator(base: NodeBase) -> decode.Decoder(Node) {
  use st <- decode.field(
    "status",
    decode.then(decode.string, fn(s) {
      case indicator_status_from_string(s) {
        Ok(status) -> decode.success(status)
        Error(Nil) -> decode.failure(StatusOnline, "status indicator status")
      }
    }),
  )
  use lbl <- decode.optional_field(
    "label",
    None,
    decode.optional(decode.string),
  )
  use pulse <- decode.optional_field(
    "pulse",
    None,
    decode.optional(decode.bool),
  )

  decode.success(StatusIndicator(
    base: base,
    status: st,
    label: lbl,
    pulse: pulse,
  ))
}

fn decode_code_block(base: NodeBase) -> decode.Decoder(Node) {
  use code <- decode.field("code", decode.string)
  use lang <- decode.optional_field(
    "language",
    None,
    decode.optional(decode.string),
  )
  use cp <- decode.optional_field(
    "copyable",
    None,
    decode.optional(decode.bool),
  )

  decode.success(CodeBlock(base: base, code: code, language: lang, copyable: cp))
}

fn decode_progress(base: NodeBase) -> decode.Decoder(Node) {
  use val <- decode.field(
    "value",
    decode.one_of(decode.float, [decode.map(decode.int, int.to_float)]),
  )
  use mx <- decode.optional_field(
    "max",
    None,
    decode.optional(
      decode.one_of(decode.float, [decode.map(decode.int, int.to_float)]),
    ),
  )
  use lbl <- decode.optional_field(
    "label",
    None,
    decode.optional(decode.string),
  )
  use vr <- decode.optional_field(
    "variant",
    None,
    decode.optional({
      use s <- decode.then(decode.string)
      case progress_variant_from_string(s) {
        Ok(v) -> decode.success(v)
        Error(Nil) -> decode.failure(ProgressBar, "progress variant")
      }
    }),
  )
  use sz <- decode.optional_field("size", None, decode.optional(decode.int))
  use col <- decode.optional_field(
    "color",
    None,
    decode.optional(decode.string),
  )
  use ticks <- decode.optional_field(
    "showTicks",
    None,
    decode.optional(decode.bool),
  )
  use act <- decode.optional_field(
    "action",
    None,
    decode.optional(action.decoder()),
  )

  decode.success(Progress(
    base: base,
    value: val,
    max: mx,
    label: lbl,
    variant: vr,
    size: sz,
    color: col,
    show_ticks: ticks,
    action: act,
  ))
}

fn decode_banner(base: NodeBase) -> decode.Decoder(Node) {
  use tn <- decode.optional_field(
    "tone",
    None,
    decode.optional({
      use s <- decode.then(decode.string)
      case banner_tone_from_string(s) {
        Ok(t) -> decode.success(t)
        Error(Nil) -> decode.failure(BannerInfo, "banner tone")
      }
    }),
  )
  use title <- decode.optional_field(
    "title",
    None,
    decode.optional(decode.string),
  )
  use msg <- decode.field("message", decode.string)
  use icon <- decode.optional_field(
    "icon",
    None,
    decode.optional(decode.string),
  )
  use act <- decode.optional_field(
    "action",
    None,
    decode.optional(action.decoder()),
  )
  use act_lbl <- decode.optional_field(
    "actionLabel",
    None,
    decode.optional(decode.string),
  )
  use dis <- decode.optional_field(
    "dismissible",
    None,
    decode.optional(decode.bool),
  )
  use on_dis <- decode.optional_field(
    "onDismissAction",
    None,
    decode.optional(action.decoder()),
  )

  decode.success(Banner(
    base: base,
    tone: tn,
    title: title,
    message: msg,
    icon: icon,
    action: act,
    action_label: act_lbl,
    dismissible: dis,
    on_dismiss_action: on_dis,
  ))
}

fn decode_list(base: NodeBase) -> decode.Decoder(Node) {
  use items <- decode.optional_field(
    "items",
    [],
    decode.list(of: node_decoder()),
  )
  use on_scroll <- decode.optional_field(
    "onScrollEndAction",
    None,
    decode.optional(action.decoder()),
  )
  use has_more <- decode.optional_field(
    "hasMore",
    None,
    decode.optional(decode.bool),
  )
  use loading <- decode.optional_field(
    "loadingMore",
    None,
    decode.optional(decode.bool),
  )

  decode.success(List(
    base: base,
    items: items,
    on_scroll_end_action: on_scroll,
    has_more: has_more,
    loading_more: loading,
  ))
}

fn decode_list_item(base: NodeBase) -> decode.Decoder(Node) {
  use title <- decode.field("title", decode.string)
  use sub <- decode.optional_field(
    "subtitle",
    None,
    decode.optional(decode.string),
  )
  use meta <- decode.optional_field(
    "meta",
    None,
    decode.optional(decode.string),
  )
  use icon <- decode.optional_field(
    "icon",
    None,
    decode.optional(decode.string),
  )
  use av_url <- decode.optional_field(
    "avatarUrl",
    None,
    decode.optional(decode.string),
  )
  use av_pk <- decode.optional_field(
    "avatarPubkey",
    None,
    decode.optional(decode.string),
  )
  use chk <- decode.optional_field(
    "checked",
    None,
    decode.optional(decode.bool),
  )
  use on_chk <- decode.optional_field(
    "onCheckAction",
    None,
    decode.optional(action.decoder()),
  )
  use on_clk <- decode.optional_field(
    "onClickAction",
    None,
    decode.optional(action.decoder()),
  )
  use acts <- decode.optional_field(
    "actions",
    [],
    decode.list(of: node_decoder()),
  )

  decode.success(ListItem(
    base: base,
    title: title,
    subtitle: sub,
    meta: meta,
    icon: icon,
    avatar_url: av_url,
    avatar_pubkey: av_pk,
    checked: chk,
    on_check_action: on_chk,
    on_click_action: on_clk,
    actions: acts,
  ))
}

fn decode_empty_state(base: NodeBase) -> decode.Decoder(Node) {
  use icon <- decode.optional_field(
    "icon",
    None,
    decode.optional(decode.string),
  )
  use title <- decode.field("title", decode.string)
  use desc <- decode.optional_field(
    "description",
    None,
    decode.optional(decode.string),
  )
  use act <- decode.optional_field(
    "action",
    None,
    decode.optional(action.decoder()),
  )
  use act_lbl <- decode.optional_field(
    "actionLabel",
    None,
    decode.optional(decode.string),
  )

  decode.success(EmptyState(
    base: base,
    icon: icon,
    title: title,
    description: desc,
    action: act,
    action_label: act_lbl,
  ))
}

fn decode_virtual_list(base: NodeBase) -> decode.Decoder(Node) {
  use items <- decode.optional_field(
    "items",
    [],
    decode.list(of: node_decoder()),
  )
  use item_h <- decode.optional_field(
    "itemHeight",
    None,
    decode.optional(decode.int),
  )
  use over <- decode.optional_field(
    "overscan",
    None,
    decode.optional(decode.int),
  )
  use max_h <- decode.optional_field(
    "maxHeight",
    None,
    decode.optional(decode.string),
  )

  decode.success(VirtualList(
    base: base,
    items: items,
    item_height: item_h,
    overscan: over,
    max_height: max_h,
  ))
}

// -----------------------------------------------------------------------------
// Node encoder
// -----------------------------------------------------------------------------

/// Convert any Omni Schema `Node` into `gleam/json.Json`.
pub fn node_to_json(n: Node) -> json.Json {
  case n {
    Box(base, dir, gap, align, justify, wrap, padding, act, bg, children) -> {
      let fields = [#("type", json.string("box"))]
      let fields = case dir {
        Some(d) -> [
          #("direction", json.string(direction_to_string(d))),
          ..fields
        ]
        None -> fields
      }
      let fields = case gap {
        Some(g) -> [#("gap", json.string(style.size_to_string(g))), ..fields]
        None -> fields
      }
      let fields = case align {
        Some(a) -> [#("align", json.string(align_to_string(a))), ..fields]
        None -> fields
      }
      let fields = case justify {
        Some(j) -> [#("justify", json.string(justify_to_string(j))), ..fields]
        None -> fields
      }
      let fields = case wrap {
        Some(w) -> [#("wrap", json.bool(w)), ..fields]
        None -> fields
      }
      let fields = case padding {
        Some(p) -> [
          #("padding", json.string(style.size_to_string(p))),
          ..fields
        ]
        None -> fields
      }
      let fields = case act {
        Some(a) -> [#("action", action.to_json(a)), ..fields]
        None -> fields
      }
      let fields = case bg {
        Some(b) -> [#("background", json.string(b)), ..fields]
        None -> fields
      }
      let fields = case children {
        [] -> fields
        kids -> [#("children", json.array(kids, of: node_to_json)), ..fields]
      }
      json.object(add_base_fields(fields, base))
    }

    Card(
      base,
      title,
      subtitle,
      icon,
      header_action,
      children,
      footer,
      act,
      banner_bg,
    ) -> {
      let fields = [#("type", json.string("card"))]
      let fields = case title {
        Some(t) -> [#("title", json.string(t)), ..fields]
        None -> fields
      }
      let fields = case subtitle {
        Some(s) -> [#("subtitle", json.string(s)), ..fields]
        None -> fields
      }
      let fields = case icon {
        Some(i) -> [#("icon", json.string(i)), ..fields]
        None -> fields
      }
      let fields = case header_action {
        Some(ha) -> [#("headerAction", node_to_json(ha)), ..fields]
        None -> fields
      }
      let fields = [
        #("children", json.array(children, of: node_to_json)),
        ..fields
      ]
      let fields = case footer {
        [] -> fields
        foot -> [#("footer", json.array(foot, of: node_to_json)), ..fields]
      }
      let fields = case act {
        Some(a) -> [#("action", action.to_json(a)), ..fields]
        None -> fields
      }
      let fields = case banner_bg {
        Some(bg) -> [#("bannerBackground", json.string(bg)), ..fields]
        None -> fields
      }
      json.object(add_base_fields(fields, base))
    }

    Divider(base, ori) -> {
      let fields = [#("type", json.string("divider"))]
      let fields = case ori {
        Some(o) -> [
          #("orientation", json.string(orientation_to_string(o))),
          ..fields
        ]
        None -> fields
      }
      json.object(add_base_fields(fields, base))
    }

    Spacer(base, sz) -> {
      let fields = [#("type", json.string("spacer"))]
      let fields = case sz {
        Some(s) -> [#("size", json.string(style.size_to_string(s))), ..fields]
        None -> fields
      }
      json.object(add_base_fields(fields, base))
    }

    Text(base, content, vr, tn, trunc, act, inline_img) -> {
      let fields = [
        #("type", json.string("text")),
        #("content", json.string(content)),
      ]
      let fields = case vr {
        Some(v) -> [
          #("variant", json.string(text_variant_to_string(v))),
          ..fields
        ]
        None -> fields
      }
      let fields = case tn {
        Some(t) -> [#("tone", json.string(text_tone_to_string(t))), ..fields]
        None -> fields
      }
      let fields = case trunc {
        Some(tr) -> [#("truncate", json.bool(tr)), ..fields]
        None -> fields
      }
      let fields = case act {
        Some(a) -> [#("action", action.to_json(a)), ..fields]
        None -> fields
      }
      let fields = case inline_img {
        Some(img) -> [#("showInlineImages", json.bool(img)), ..fields]
        None -> fields
      }
      json.object(add_base_fields(fields, base))
    }

    Badge(base, label, tn, vr, dot) -> {
      let fields = [
        #("type", json.string("badge")),
        #("label", json.string(label)),
      ]
      let fields = case tn {
        Some(t) -> [#("tone", json.string(badge_tone_to_string(t))), ..fields]
        None -> fields
      }
      let fields = case vr {
        Some(v) -> [
          #("variant", json.string(badge_variant_to_string(v))),
          ..fields
        ]
        None -> fields
      }
      let fields = case dot {
        Some(d) -> [#("dot", json.bool(d)), ..fields]
        None -> fields
      }
      json.object(add_base_fields(fields, base))
    }

    Metric(base, label, val, sub, tr) -> {
      let fields = [
        #("type", json.string("metric")),
        #("label", json.string(label)),
        #("value", metric_value_to_json(val)),
      ]
      let fields = case sub {
        Some(s) -> [#("subtext", json.string(s)), ..fields]
        None -> fields
      }
      let fields = case tr {
        Some(t) -> [#("trend", json.string(trend_to_string(t))), ..fields]
        None -> fields
      }
      json.object(add_base_fields(fields, base))
    }

    Icon(base, name, sz) -> {
      let fields = [
        #("type", json.string("icon")),
        #("name", json.string(name)),
      ]
      let fields = case sz {
        Some(s) -> [#("size", json.int(s)), ..fields]
        None -> fields
      }
      json.object(add_base_fields(fields, base))
    }

    Avatar(base, src, pubkey, name, sz, act) -> {
      let fields = [#("type", json.string("avatar"))]
      let fields = case src {
        Some(s) -> [#("src", json.string(s)), ..fields]
        None -> fields
      }
      let fields = case pubkey {
        Some(pk) -> [#("pubkey", json.string(pk)), ..fields]
        None -> fields
      }
      let fields = case name {
        Some(n) -> [#("name", json.string(n)), ..fields]
        None -> fields
      }
      let fields = case sz {
        Some(s) -> [#("size", json.string(style.size_to_string(s))), ..fields]
        None -> fields
      }
      let fields = case act {
        Some(a) -> [#("action", action.to_json(a)), ..fields]
        None -> fields
      }
      json.object(add_base_fields(fields, base))
    }

    Button(base, label, act, vr, sz, icon, icon_pos, dis, load) -> {
      let fields = [
        #("type", json.string("button")),
        #("label", json.string(label)),
        #("action", action.to_json(act)),
      ]
      let fields = case vr {
        Some(v) -> [
          #("variant", json.string(button_variant_to_string(v))),
          ..fields
        ]
        None -> fields
      }
      let fields = case sz {
        Some(s) -> [#("size", json.string(style.size_to_string(s))), ..fields]
        None -> fields
      }
      let fields = case icon {
        Some(i) -> [#("icon", json.string(i)), ..fields]
        None -> fields
      }
      let fields = case icon_pos {
        Some(p) -> [
          #("iconPosition", json.string(icon_position_to_string(p))),
          ..fields
        ]
        None -> fields
      }
      let fields = case dis {
        Some(d) -> [#("disabled", json.bool(d)), ..fields]
        None -> fields
      }
      let fields = case load {
        Some(l) -> [#("loading", json.bool(l)), ..fields]
        None -> fields
      }
      json.object(add_base_fields(fields, base))
    }

    IconButton(base, icon, tip, act, vr, sz, dis) -> {
      let fields = [
        #("type", json.string("icon-button")),
        #("icon", json.string(icon)),
        #("action", action.to_json(act)),
      ]
      let fields = case tip {
        Some(t) -> [#("tooltip", json.string(t)), ..fields]
        None -> fields
      }
      let fields = case vr {
        Some(v) -> [
          #("variant", json.string(icon_button_variant_to_string(v))),
          ..fields
        ]
        None -> fields
      }
      let fields = case sz {
        Some(s) -> [#("size", json.string(style.size_to_string(s))), ..fields]
        None -> fields
      }
      let fields = case dis {
        Some(d) -> [#("disabled", json.bool(d)), ..fields]
        None -> fields
      }
      json.object(add_base_fields(fields, base))
    }

    Input(base, name, ph, val, in_type, acc, clr, pfx, on_enter, on_change) -> {
      let fields = [
        #("type", json.string("input")),
        #("name", json.string(name)),
      ]
      let fields = case ph {
        Some(p) -> [#("placeholder", json.string(p)), ..fields]
        None -> fields
      }
      let fields = case val {
        Some(v) -> [#("value", json.string(v)), ..fields]
        None -> fields
      }
      let fields = case in_type {
        Some(t) -> [
          #("inputType", json.string(input_type_to_string(t))),
          ..fields
        ]
        None -> fields
      }
      let fields = case acc {
        Some(a) -> [#("accept", json.string(a)), ..fields]
        None -> fields
      }
      let fields = case clr {
        Some(c) -> [#("clearable", json.bool(c)), ..fields]
        None -> fields
      }
      let fields = case pfx {
        Some(p) -> [#("prefixIcon", json.string(p)), ..fields]
        None -> fields
      }
      let fields = case on_enter {
        Some(a) -> [#("actionOnEnter", action.to_json(a)), ..fields]
        None -> fields
      }
      let fields = case on_change {
        Some(a) -> [#("actionOnChange", action.to_json(a)), ..fields]
        None -> fields
      }
      json.object(add_base_fields(fields, base))
    }

    Textarea(base, name, ph, val, rows, on_change) -> {
      let fields = [
        #("type", json.string("textarea")),
        #("name", json.string(name)),
      ]
      let fields = case ph {
        Some(p) -> [#("placeholder", json.string(p)), ..fields]
        None -> fields
      }
      let fields = case val {
        Some(v) -> [#("value", json.string(v)), ..fields]
        None -> fields
      }
      let fields = case rows {
        Some(r) -> [#("rows", json.int(r)), ..fields]
        None -> fields
      }
      let fields = case on_change {
        Some(a) -> [#("actionOnChange", action.to_json(a)), ..fields]
        None -> fields
      }
      json.object(add_base_fields(fields, base))
    }

    Toggle(base, name, lbl, chk, act, dis) -> {
      let fields = [
        #("type", json.string("toggle")),
        #("name", json.string(name)),
        #("checked", json.bool(chk)),
        #("action", action.to_json(act)),
      ]
      let fields = case lbl {
        Some(l) -> [#("label", json.string(l)), ..fields]
        None -> fields
      }
      let fields = case dis {
        Some(d) -> [#("disabled", json.bool(d)), ..fields]
        None -> fields
      }
      json.object(add_base_fields(fields, base))
    }

    Select(base, name, val, opts, act) -> {
      let fields = [
        #("type", json.string("select")),
        #("name", json.string(name)),
        #("options", json.array(opts, of: select_option_to_json)),
      ]
      let fields = case val {
        Some(v) -> [#("value", json.string(v)), ..fields]
        None -> fields
      }
      let fields = case act {
        Some(a) -> [#("action", action.to_json(a)), ..fields]
        None -> fields
      }
      json.object(add_base_fields(fields, base))
    }

    Tabs(base, tabs_list, active, act) -> {
      let fields = [
        #("type", json.string("tabs")),
        #("tabs", json.array(tabs_list, of: tab_item_to_json)),
        #("activeTab", json.string(active)),
        #("action", action.to_json(act)),
      ]
      json.object(add_base_fields(fields, base))
    }

    StatusIndicator(base, st, lbl, pulse) -> {
      let fields = [
        #("type", json.string("status-indicator")),
        #("status", json.string(indicator_status_to_string(st))),
      ]
      let fields = case lbl {
        Some(l) -> [#("label", json.string(l)), ..fields]
        None -> fields
      }
      let fields = case pulse {
        Some(p) -> [#("pulse", json.bool(p)), ..fields]
        None -> fields
      }
      json.object(add_base_fields(fields, base))
    }

    CodeBlock(base, code, lang, cp) -> {
      let fields = [
        #("type", json.string("code-block")),
        #("code", json.string(code)),
      ]
      let fields = case lang {
        Some(l) -> [#("language", json.string(l)), ..fields]
        None -> fields
      }
      let fields = case cp {
        Some(c) -> [#("copyable", json.bool(c)), ..fields]
        None -> fields
      }
      json.object(add_base_fields(fields, base))
    }

    Progress(base, val, mx, lbl, vr, sz, col, ticks, act) -> {
      let fields = [
        #("type", json.string("progress")),
        #("value", json.float(val)),
      ]
      let fields = case mx {
        Some(m) -> [#("max", json.float(m)), ..fields]
        None -> fields
      }
      let fields = case lbl {
        Some(l) -> [#("label", json.string(l)), ..fields]
        None -> fields
      }
      let fields = case vr {
        Some(v) -> [
          #("variant", json.string(progress_variant_to_string(v))),
          ..fields
        ]
        None -> fields
      }
      let fields = case sz {
        Some(s) -> [#("size", json.int(s)), ..fields]
        None -> fields
      }
      let fields = case col {
        Some(c) -> [#("color", json.string(c)), ..fields]
        None -> fields
      }
      let fields = case ticks {
        Some(t) -> [#("showTicks", json.bool(t)), ..fields]
        None -> fields
      }
      let fields = case act {
        Some(a) -> [#("action", action.to_json(a)), ..fields]
        None -> fields
      }
      json.object(add_base_fields(fields, base))
    }

    Banner(base, tn, title, msg, icon, act, act_lbl, dis, on_dis) -> {
      let fields = [
        #("type", json.string("banner")),
        #("message", json.string(msg)),
      ]
      let fields = case tn {
        Some(t) -> [#("tone", json.string(banner_tone_to_string(t))), ..fields]
        None -> fields
      }
      let fields = case title {
        Some(t) -> [#("title", json.string(t)), ..fields]
        None -> fields
      }
      let fields = case icon {
        Some(i) -> [#("icon", json.string(i)), ..fields]
        None -> fields
      }
      let fields = case act {
        Some(a) -> [#("action", action.to_json(a)), ..fields]
        None -> fields
      }
      let fields = case act_lbl {
        Some(l) -> [#("actionLabel", json.string(l)), ..fields]
        None -> fields
      }
      let fields = case dis {
        Some(d) -> [#("dismissible", json.bool(d)), ..fields]
        None -> fields
      }
      let fields = case on_dis {
        Some(od) -> [#("onDismissAction", action.to_json(od)), ..fields]
        None -> fields
      }
      json.object(add_base_fields(fields, base))
    }

    List(base, items, on_scroll, has_more, loading) -> {
      let fields = [
        #("type", json.string("list")),
        #("items", json.array(items, of: node_to_json)),
      ]
      let fields = case on_scroll {
        Some(a) -> [#("onScrollEndAction", action.to_json(a)), ..fields]
        None -> fields
      }
      let fields = case has_more {
        Some(h) -> [#("hasMore", json.bool(h)), ..fields]
        None -> fields
      }
      let fields = case loading {
        Some(l) -> [#("loadingMore", json.bool(l)), ..fields]
        None -> fields
      }
      json.object(add_base_fields(fields, base))
    }

    ListItem(
      base,
      title,
      sub,
      meta,
      icon,
      av_url,
      av_pk,
      chk,
      on_chk,
      on_clk,
      acts,
    ) -> {
      let fields = [
        #("type", json.string("list-item")),
        #("title", json.string(title)),
      ]
      let fields = case sub {
        Some(s) -> [#("subtitle", json.string(s)), ..fields]
        None -> fields
      }
      let fields = case meta {
        Some(m) -> [#("meta", json.string(m)), ..fields]
        None -> fields
      }
      let fields = case icon {
        Some(i) -> [#("icon", json.string(i)), ..fields]
        None -> fields
      }
      let fields = case av_url {
        Some(u) -> [#("avatarUrl", json.string(u)), ..fields]
        None -> fields
      }
      let fields = case av_pk {
        Some(p) -> [#("avatarPubkey", json.string(p)), ..fields]
        None -> fields
      }
      let fields = case chk {
        Some(c) -> [#("checked", json.bool(c)), ..fields]
        None -> fields
      }
      let fields = case on_chk {
        Some(a) -> [#("onCheckAction", action.to_json(a)), ..fields]
        None -> fields
      }
      let fields = case on_clk {
        Some(a) -> [#("onClickAction", action.to_json(a)), ..fields]
        None -> fields
      }
      let fields = case acts {
        [] -> fields
        a -> [#("actions", json.array(a, of: node_to_json)), ..fields]
      }
      json.object(add_base_fields(fields, base))
    }

    EmptyState(base, icon, title, desc, act, act_lbl) -> {
      let fields = [
        #("type", json.string("empty-state")),
        #("title", json.string(title)),
      ]
      let fields = case icon {
        Some(i) -> [#("icon", json.string(i)), ..fields]
        None -> fields
      }
      let fields = case desc {
        Some(d) -> [#("description", json.string(d)), ..fields]
        None -> fields
      }
      let fields = case act {
        Some(a) -> [#("action", action.to_json(a)), ..fields]
        None -> fields
      }
      let fields = case act_lbl {
        Some(l) -> [#("actionLabel", json.string(l)), ..fields]
        None -> fields
      }
      json.object(add_base_fields(fields, base))
    }

    VirtualList(base, items, item_h, over, max_h) -> {
      let fields = [
        #("type", json.string("virtual-list")),
        #("items", json.array(items, of: node_to_json)),
      ]
      let fields = case item_h {
        Some(h) -> [#("itemHeight", json.int(h)), ..fields]
        None -> fields
      }
      let fields = case over {
        Some(o) -> [#("overscan", json.int(o)), ..fields]
        None -> fields
      }
      let fields = case max_h {
        Some(m) -> [#("maxHeight", json.string(m)), ..fields]
        None -> fields
      }
      json.object(add_base_fields(fields, base))
    }
  }
}

/// Parse a JSON string into an Omni Schema `Node`.
pub fn decode_node(json_str: String) -> Result(Node, json.DecodeError) {
  json.parse(from: json_str, using: node_decoder())
}

/// Encode an Omni Schema `Node` into a JSON string.
pub fn encode_node(n: Node) -> String {
  node_to_json(n) |> json.to_string
}

// -----------------------------------------------------------------------------
// omni:schema wire envelope message
// -----------------------------------------------------------------------------

/// Decoder for `{ type: "omni:schema", schema: ..., componentId?: ... }` or `{ type: "schema", ... }`.
pub fn schema_message_decoder() -> decode.Decoder(SchemaMessage) {
  use type_name <- decode.field("type", decode.string)
  use sc <- decode.field(
    "schema",
    decode.one_of(node_decoder(), [
      {
        use root <- decode.field("root", node_decoder())
        decode.success(root)
      },
    ]),
  )
  use comp_id <- decode.optional_field(
    "componentId",
    None,
    decode.optional(decode.string),
  )

  decode.success(SchemaMessage(
    type_name: type_name,
    schema: sc,
    component_id: comp_id,
  ))
}

/// Convert a `SchemaMessage` into `gleam/json.Json`.
pub fn schema_message_to_json(msg: SchemaMessage) -> json.Json {
  let fields = [
    #("type", json.string(msg.type_name)),
    #("schema", node_to_json(msg.schema)),
  ]
  let fields = case msg.component_id {
    Some(cid) -> [#("componentId", json.string(cid)), ..fields]
    None -> fields
  }
  json.object(fields)
}

/// Decode a JSON string into a `SchemaMessage`.
pub fn decode_schema_message(
  json_str: String,
) -> Result(SchemaMessage, json.DecodeError) {
  json.parse(from: json_str, using: schema_message_decoder())
}

/// Encode a `SchemaMessage` into a JSON string.
pub fn encode_schema_message(msg: SchemaMessage) -> String {
  schema_message_to_json(msg) |> json.to_string
}
