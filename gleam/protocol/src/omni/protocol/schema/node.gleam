//// Exhaustive closed ADT for all 24 Omni Server-Driven UI Primitive Types.
////
//// Plugins emit these declarative component nodes across sandboxes over
//// Channel 1 (`omni:schema` wire format) for mounting into the host DOM.

import gleam/option.{type Option, None}
import omni/protocol/schema/action.{type Action}
import omni/protocol/schema/style.{type SizeToken, type Style}

/// Layout flow direction for flex containers.
pub type Direction {
  Row
  Column
}

/// Align items along the cross axis.
pub type Align {
  AlignStart
  AlignCenter
  AlignEnd
  AlignStretch
}

/// Justify content along the main axis.
pub type Justify {
  JustifyStart
  JustifyCenter
  JustifyBetween
  JustifyEnd
}

/// Divider line orientation.
pub type Orientation {
  Horizontal
  Vertical
}

/// Typography variant styling.
pub type TextVariant {
  Title
  Subtitle
  Body
  Caption
  Mono
}

/// Typography color tone.
pub type TextTone {
  TonePrimary
  ToneSecondary
  ToneMuted
  ToneAccent
  ToneError
  ToneSuccess
}

/// Badge tone.
pub type BadgeTone {
  BadgeNeutral
  BadgeSuccess
  BadgeWarning
  BadgeError
  BadgeAccent
}

/// Badge visual presentation.
pub type BadgeVariant {
  BadgeSolid
  BadgeSubtle
  BadgeOutline
}

/// Value displayed by a metric node.
pub type MetricValue {
  MetricInt(Int)
  MetricFloat(Float)
  MetricString(String)
}

/// Trend indicator for a metric node.
pub type MetricTrend {
  TrendUp
  TrendDown
  TrendNeutral
}

/// Button presentation variant.
pub type ButtonVariant {
  ButtonPrimary
  ButtonSecondary
  ButtonGhost
  ButtonDanger
}

/// Icon button presentation variant.
pub type IconButtonVariant {
  IconButtonGhost
  IconButtonSecondary
  IconButtonDanger
}

/// Icon placement relative to button label.
pub type IconPosition {
  IconLeft
  IconRight
}

/// HTML input type category.
pub type InputType {
  InputText
  InputNumber
  InputSearch
  InputUrl
  InputPassword
  InputFile
}

/// Option entry for a select dropdown primitive.
pub type SelectOption {
  SelectOption(label: String, value: String)
}

/// Tab item for a tabs primitive.
pub type TabItem {
  TabItem(
    id: String,
    label: String,
    icon: Option(String),
    badge: Option(String),
  )
}

/// Connection or operation status indicator.
pub type IndicatorStatus {
  StatusOnline
  StatusConnecting
  StatusOffline
  StatusError
}

/// Visual presentation style for progress indicators.
pub type ProgressVariant {
  ProgressBar
  ProgressSpinner
  ProgressDisk
  ProgressRing
}

/// Tone for alert banners.
pub type BannerTone {
  BannerInfo
  BannerSuccess
  BannerWarning
  BannerError
}

/// Logical page identifier or metadata for page history and back navigation.
pub type PageDeclaration {
  PageDeclaration(id: String, title: Option(String), url: Option(String))
}

/// Common base properties shared by all schema nodes.
pub type NodeBase {
  NodeBase(
    id: Option(String),
    key: Option(String),
    visible: Option(Bool),
    style: Option(Style),
    page: Option(PageDeclaration),
  )
}

/// Create a default empty `NodeBase` with all fields unset.
pub fn empty_base() -> NodeBase {
  NodeBase(id: None, key: None, visible: None, style: None, page: None)
}

/// Exhaustive ADT representing all 24 Omni Server-Driven UI Primitive Types.
pub type Node {
  Box(
    base: NodeBase,
    direction: Option(Direction),
    gap: Option(SizeToken),
    align: Option(Align),
    justify: Option(Justify),
    wrap: Option(Bool),
    padding: Option(SizeToken),
    action: Option(Action),
    background: Option(String),
    children: List(Node),
  )
  Card(
    base: NodeBase,
    title: Option(String),
    subtitle: Option(String),
    icon: Option(String),
    header_action: Option(Node),
    children: List(Node),
    footer: List(Node),
    action: Option(Action),
    banner_background: Option(String),
  )
  Divider(base: NodeBase, orientation: Option(Orientation))
  Spacer(base: NodeBase, size: Option(SizeToken))
  Text(
    base: NodeBase,
    content: String,
    variant: Option(TextVariant),
    tone: Option(TextTone),
    truncate: Option(Bool),
    action: Option(Action),
    show_inline_images: Option(Bool),
  )
  Badge(
    base: NodeBase,
    label: String,
    tone: Option(BadgeTone),
    variant: Option(BadgeVariant),
    dot: Option(Bool),
  )
  Metric(
    base: NodeBase,
    label: String,
    value: MetricValue,
    subtext: Option(String),
    trend: Option(MetricTrend),
  )
  Icon(base: NodeBase, name: String, size: Option(Int))
  Avatar(
    base: NodeBase,
    src: Option(String),
    pubkey: Option(String),
    name: Option(String),
    size: Option(SizeToken),
    action: Option(Action),
  )
  Button(
    base: NodeBase,
    label: String,
    action: Action,
    variant: Option(ButtonVariant),
    size: Option(SizeToken),
    icon: Option(String),
    icon_position: Option(IconPosition),
    disabled: Option(Bool),
    loading: Option(Bool),
  )
  IconButton(
    base: NodeBase,
    icon: String,
    tooltip: Option(String),
    action: Action,
    variant: Option(IconButtonVariant),
    size: Option(SizeToken),
    disabled: Option(Bool),
  )
  Input(
    base: NodeBase,
    name: String,
    placeholder: Option(String),
    value: Option(String),
    input_type: Option(InputType),
    accept: Option(String),
    clearable: Option(Bool),
    prefix_icon: Option(String),
    action_on_enter: Option(Action),
    action_on_change: Option(Action),
  )
  Textarea(
    base: NodeBase,
    name: String,
    placeholder: Option(String),
    value: Option(String),
    rows: Option(Int),
  )
  Toggle(
    base: NodeBase,
    name: String,
    label: Option(String),
    checked: Bool,
    action: Action,
    disabled: Option(Bool),
  )
  Select(
    base: NodeBase,
    name: String,
    value: Option(String),
    options: List(SelectOption),
    action: Option(Action),
  )
  Tabs(base: NodeBase, tabs: List(TabItem), active_tab: String, action: Action)
  StatusIndicator(
    base: NodeBase,
    status: IndicatorStatus,
    label: Option(String),
    pulse: Option(Bool),
  )
  CodeBlock(
    base: NodeBase,
    code: String,
    language: Option(String),
    copyable: Option(Bool),
  )
  Progress(
    base: NodeBase,
    value: Float,
    max: Option(Float),
    label: Option(String),
    variant: Option(ProgressVariant),
    size: Option(Int),
    color: Option(String),
    show_ticks: Option(Bool),
    action: Option(Action),
  )
  Banner(
    base: NodeBase,
    tone: Option(BannerTone),
    title: Option(String),
    message: String,
    icon: Option(String),
    action: Option(Action),
    action_label: Option(String),
    dismissible: Option(Bool),
    on_dismiss_action: Option(Action),
  )
  List(
    base: NodeBase,
    items: List(Node),
    on_scroll_end_action: Option(Action),
    has_more: Option(Bool),
    loading_more: Option(Bool),
  )
  ListItem(
    base: NodeBase,
    title: String,
    subtitle: Option(String),
    meta: Option(String),
    icon: Option(String),
    avatar_url: Option(String),
    avatar_pubkey: Option(String),
    checked: Option(Bool),
    on_check_action: Option(Action),
    on_click_action: Option(Action),
    actions: List(Node),
  )
  EmptyState(
    base: NodeBase,
    icon: Option(String),
    title: String,
    description: Option(String),
    action: Option(Action),
    action_label: Option(String),
  )
  VirtualList(
    base: NodeBase,
    items: List(Node),
    item_height: Option(Int),
    overscan: Option(Int),
    max_height: Option(String),
  )
}

/// Retrieve the wire type string for a primitive node.
pub fn node_type_name(node: Node) -> String {
  case node {
    Box(..) -> "box"
    Card(..) -> "card"
    Divider(..) -> "divider"
    Spacer(..) -> "spacer"
    Text(..) -> "text"
    Badge(..) -> "badge"
    Metric(..) -> "metric"
    Icon(..) -> "icon"
    Avatar(..) -> "avatar"
    Button(..) -> "button"
    IconButton(..) -> "icon-button"
    Input(..) -> "input"
    Textarea(..) -> "textarea"
    Toggle(..) -> "toggle"
    Select(..) -> "select"
    Tabs(..) -> "tabs"
    StatusIndicator(..) -> "status-indicator"
    CodeBlock(..) -> "code-block"
    Progress(..) -> "progress"
    Banner(..) -> "banner"
    List(..) -> "list"
    ListItem(..) -> "list-item"
    EmptyState(..) -> "empty-state"
    VirtualList(..) -> "virtual-list"
  }
}

/// Retrieve the common `NodeBase` from any schema node.
pub fn get_base(node: Node) -> NodeBase {
  case node {
    Box(base: b, ..) -> b
    Card(base: b, ..) -> b
    Divider(base: b, ..) -> b
    Spacer(base: b, ..) -> b
    Text(base: b, ..) -> b
    Badge(base: b, ..) -> b
    Metric(base: b, ..) -> b
    Icon(base: b, ..) -> b
    Avatar(base: b, ..) -> b
    Button(base: b, ..) -> b
    IconButton(base: b, ..) -> b
    Input(base: b, ..) -> b
    Textarea(base: b, ..) -> b
    Toggle(base: b, ..) -> b
    Select(base: b, ..) -> b
    Tabs(base: b, ..) -> b
    StatusIndicator(base: b, ..) -> b
    CodeBlock(base: b, ..) -> b
    Progress(base: b, ..) -> b
    Banner(base: b, ..) -> b
    List(base: b, ..) -> b
    ListItem(base: b, ..) -> b
    EmptyState(base: b, ..) -> b
    VirtualList(base: b, ..) -> b
  }
}

/// Set or update the common `NodeBase` on any schema node.
pub fn set_base(node: Node, base: NodeBase) -> Node {
  case node {
    Box(_, dir, gap, al, just, wr, pad, act, bg, kids) ->
      Box(base, dir, gap, al, just, wr, pad, act, bg, kids)
    Card(_, t, sub, ic, ha, kids, foot, act, bbg) ->
      Card(base, t, sub, ic, ha, kids, foot, act, bbg)
    Divider(_, ori) -> Divider(base, ori)
    Spacer(_, sz) -> Spacer(base, sz)
    Text(_, c, vr, tn, tr, act, img) -> Text(base, c, vr, tn, tr, act, img)
    Badge(_, l, tn, vr, dot) -> Badge(base, l, tn, vr, dot)
    Metric(_, l, v, sub, tr) -> Metric(base, l, v, sub, tr)
    Icon(_, nm, sz) -> Icon(base, nm, sz)
    Avatar(_, src, pk, nm, sz, act) -> Avatar(base, src, pk, nm, sz, act)
    Button(_, l, act, vr, sz, ic, ip, dis, load) ->
      Button(base, l, act, vr, sz, ic, ip, dis, load)
    IconButton(_, ic, tip, act, vr, sz, dis) ->
      IconButton(base, ic, tip, act, vr, sz, dis)
    Input(_, nm, ph, v, it, acc, clr, pfx, o_ent, o_chg) ->
      Input(base, nm, ph, v, it, acc, clr, pfx, o_ent, o_chg)
    Textarea(_, nm, ph, v, rows) -> Textarea(base, nm, ph, v, rows)
    Toggle(_, nm, lbl, chk, act, dis) -> Toggle(base, nm, lbl, chk, act, dis)
    Select(_, nm, v, opts, act) -> Select(base, nm, v, opts, act)
    Tabs(_, tabs, act_tab, act) -> Tabs(base, tabs, act_tab, act)
    StatusIndicator(_, st, lbl, pulse) -> StatusIndicator(base, st, lbl, pulse)
    CodeBlock(_, c, lang, cp) -> CodeBlock(base, c, lang, cp)
    Progress(_, v, mx, lbl, vr, sz, col, ticks, act) ->
      Progress(base, v, mx, lbl, vr, sz, col, ticks, act)
    Banner(_, tn, t, msg, ic, act, albl, dis, od) ->
      Banner(base, tn, t, msg, ic, act, albl, dis, od)
    List(_, items, scr, hm, lm) -> List(base, items, scr, hm, lm)
    ListItem(_, t, sub, m, ic, au, ap, chk, ochk, oclk, acts) ->
      ListItem(base, t, sub, m, ic, au, ap, chk, ochk, oclk, acts)
    EmptyState(_, ic, t, desc, act, albl) ->
      EmptyState(base, ic, t, desc, act, albl)
    VirtualList(_, items, ih, ov, mh) -> VirtualList(base, items, ih, ov, mh)
  }
}
