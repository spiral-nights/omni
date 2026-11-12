//// Ergonomic, pipe-friendly builder functions for constructing Omni UI trees.
////
//// Example:
//// ```gleam
//// box()
//// |> gap("sm")
//// |> padding("md")
//// |> child(text("Hello Omni") |> text_variant(Title))
//// |> child(button("Click Me", action.new("button_click")))
//// ```

import gleam/list
import gleam/option.{None, Some}
import omni/protocol/schema/action.{type Action}
import omni/protocol/schema/node.{
  type Align, type BadgeTone, type BannerTone, type IndicatorStatus,
  type InputType, type Justify, type MetricValue, type Node, type SelectOption,
  type TabItem, type TextTone, type TextVariant, Avatar, Badge, BadgeNeutral,
  BadgeSubtle, Banner, BannerInfo, Body, Box, Button, ButtonPrimary, Card,
  CodeBlock, Column, Divider, EmptyState, Horizontal, Icon, IconButton,
  IconButtonGhost, Input, InputText, List, ListItem, Metric, NodeBase,
  PageDeclaration, Progress, ProgressBar, Row, Select, Spacer, StatusIndicator,
  Tabs, Text, Textarea, Toggle, Vertical, VirtualList,
}
import omni/protocol/schema/style.{type SizeToken, type Style}

// -----------------------------------------------------------------------------
// Constructors
// -----------------------------------------------------------------------------

/// Create a new Box container. Defaults to column layout.
pub fn box() -> Node {
  Box(
    base: node.empty_base(),
    direction: Some(Column),
    gap: None,
    align: None,
    justify: None,
    wrap: None,
    padding: None,
    action: None,
    background: None,
    children: [],
  )
}

/// Create a new Card container.
pub fn card() -> Node {
  Card(
    base: node.empty_base(),
    title: None,
    subtitle: None,
    icon: None,
    header_action: None,
    children: [],
    footer: [],
    action: None,
    banner_background: None,
  )
}

/// Create a horizontal divider line.
pub fn divider() -> Node {
  Divider(base: node.empty_base(), orientation: Some(Horizontal))
}

/// Create a vertical divider line.
pub fn vertical_divider() -> Node {
  Divider(base: node.empty_base(), orientation: Some(Vertical))
}

/// Create a blank spacer.
pub fn spacer() -> Node {
  Spacer(base: node.empty_base(), size: Some(style.SizeMd))
}

/// Create a text node.
pub fn text(content: String) -> Node {
  Text(
    base: node.empty_base(),
    content: content,
    variant: Some(Body),
    tone: None,
    truncate: None,
    action: None,
    show_inline_images: None,
  )
}

/// Create a badge pill.
pub fn badge(label: String) -> Node {
  Badge(
    base: node.empty_base(),
    label: label,
    tone: Some(BadgeNeutral),
    variant: Some(BadgeSubtle),
    dot: None,
  )
}

/// Create a metric stat card.
pub fn metric(label: String, val: MetricValue) -> Node {
  Metric(
    base: node.empty_base(),
    label: label,
    value: val,
    subtext: None,
    trend: None,
  )
}

/// Create an icon primitive.
pub fn icon(name: String) -> Node {
  Icon(base: node.empty_base(), name: name, size: None)
}

/// Create an avatar primitive.
pub fn avatar() -> Node {
  Avatar(
    base: node.empty_base(),
    src: None,
    pubkey: None,
    name: None,
    size: Some(style.SizeMd),
    action: None,
  )
}

/// Create an interactive button.
pub fn button(label: String, act: Action) -> Node {
  Button(
    base: node.empty_base(),
    label: label,
    action: act,
    variant: Some(ButtonPrimary),
    size: Some(style.SizeMd),
    icon: None,
    icon_position: None,
    disabled: None,
    loading: None,
  )
}

/// Create a compact icon button.
pub fn icon_button(icon_name: String, act: Action) -> Node {
  IconButton(
    base: node.empty_base(),
    icon: icon_name,
    tooltip: None,
    action: act,
    variant: Some(IconButtonGhost),
    size: Some(style.SizeMd),
    disabled: None,
  )
}

/// Create a single-line input field.
pub fn input(name: String) -> Node {
  Input(
    base: node.empty_base(),
    name: name,
    placeholder: None,
    value: None,
    input_type: Some(InputText),
    accept: None,
    clearable: None,
    prefix_icon: None,
    action_on_enter: None,
    action_on_change: None,
  )
}

/// Create a multi-line textarea.
pub fn textarea(name: String) -> Node {
  Textarea(
    base: node.empty_base(),
    name: name,
    placeholder: None,
    value: None,
    rows: Some(3),
    action_on_change: None,
  )
}

/// Create a toggle switch.
pub fn toggle(name: String, checked: Bool, act: Action) -> Node {
  Toggle(
    base: node.empty_base(),
    name: name,
    label: None,
    checked: checked,
    action: act,
    disabled: None,
  )
}

/// Create a select dropdown.
pub fn select(name: String, options: List(SelectOption)) -> Node {
  Select(
    base: node.empty_base(),
    name: name,
    value: None,
    options: options,
    action: None,
  )
}

/// Create a tab bar.
pub fn tabs(tabs_list: List(TabItem), active: String, act: Action) -> Node {
  Tabs(
    base: node.empty_base(),
    tabs: tabs_list,
    active_tab: active,
    action: act,
  )
}

/// Create a status indicator pill or dot.
pub fn status_indicator(status: IndicatorStatus) -> Node {
  StatusIndicator(
    base: node.empty_base(),
    status: status,
    label: None,
    pulse: None,
  )
}

/// Create a syntax-highlighted code block.
pub fn code_block(code: String) -> Node {
  CodeBlock(
    base: node.empty_base(),
    code: code,
    language: None,
    copyable: Some(True),
  )
}

/// Create a progress bar or circle.
pub fn progress(val: Float) -> Node {
  Progress(
    base: node.empty_base(),
    value: val,
    max: Some(100.0),
    label: None,
    variant: Some(ProgressBar),
    size: None,
    color: None,
    show_ticks: None,
    action: None,
  )
}

/// Create an alert banner.
pub fn banner(msg: String) -> Node {
  Banner(
    base: node.empty_base(),
    tone: Some(BannerInfo),
    title: None,
    message: msg,
    icon: None,
    action: None,
    action_label: None,
    dismissible: None,
    on_dismiss_action: None,
  )
}

/// Create a list container.
pub fn list_view(items: List(Node)) -> Node {
  List(
    base: node.empty_base(),
    items: items,
    on_scroll_end_action: None,
    has_more: None,
    loading_more: None,
  )
}

/// Create an individual list item.
pub fn list_item(title_text: String) -> Node {
  ListItem(
    base: node.empty_base(),
    title: title_text,
    subtitle: None,
    meta: None,
    icon: None,
    avatar_url: None,
    avatar_pubkey: None,
    checked: None,
    on_check_action: None,
    on_click_action: None,
    actions: [],
  )
}

/// Create an empty state placeholder.
pub fn empty_state(title_text: String) -> Node {
  EmptyState(
    base: node.empty_base(),
    icon: None,
    title: title_text,
    description: None,
    action: None,
    action_label: None,
  )
}

/// Create a virtualized list container.
pub fn virtual_list(items: List(Node)) -> Node {
  VirtualList(
    base: node.empty_base(),
    items: items,
    item_height: Some(48),
    overscan: Some(5),
    max_height: None,
  )
}

// -----------------------------------------------------------------------------
// Base Modifiers
// -----------------------------------------------------------------------------

/// Set the node ID.
pub fn with_id(n: Node, id_str: String) -> Node {
  let b = node.get_base(n)
  node.set_base(n, NodeBase(..b, id: Some(id_str)))
}

/// Set the key for reconciliation.
pub fn with_key(n: Node, key_str: String) -> Node {
  let b = node.get_base(n)
  node.set_base(n, NodeBase(..b, key: Some(key_str)))
}

/// Set visibility of the node.
pub fn visible(n: Node, is_vis: Bool) -> Node {
  let b = node.get_base(n)
  node.set_base(n, NodeBase(..b, visible: Some(is_vis)))
}

/// Attach a style to the node.
pub fn with_style(n: Node, st: Style) -> Node {
  let b = node.get_base(n)
  node.set_base(n, NodeBase(..b, style: Some(st)))
}

/// Declare a logical page for history and back navigation.
pub fn page(n: Node, page_id: String) -> Node {
  let b = node.get_base(n)
  let p = PageDeclaration(id: page_id, title: None, url: None)
  node.set_base(n, NodeBase(..b, page: Some(p)))
}

// -----------------------------------------------------------------------------
// Layout Modifiers
// -----------------------------------------------------------------------------

/// Set direction to row for Box containers.
pub fn row(n: Node) -> Node {
  case n {
    Box(..) as b -> Box(..b, direction: Some(Row))
    other -> other
  }
}

/// Set direction to column for Box containers.
pub fn column(n: Node) -> Node {
  case n {
    Box(..) as b -> Box(..b, direction: Some(Column))
    other -> other
  }
}

/// Set gap on a Box container from a token string (e.g. "xs", "sm", "md", "lg").
pub fn gap(n: Node, token_str: String) -> Node {
  let sz = case style.size_from_string(token_str) {
    Ok(s) -> Some(s)
    Error(Nil) -> None
  }
  case n {
    Box(..) as b -> Box(..b, gap: sz)
    other -> other
  }
}

/// Set gap on a Box container with a typed `SizeToken`.
pub fn gap_size(n: Node, sz: SizeToken) -> Node {
  case n {
    Box(..) as b -> Box(..b, gap: Some(sz))
    other -> other
  }
}

/// Set padding on a Box container from a token string.
pub fn padding(n: Node, token_str: String) -> Node {
  let sz = case style.size_from_string(token_str) {
    Ok(s) -> Some(s)
    Error(Nil) -> None
  }
  case n {
    Box(..) as b -> Box(..b, padding: sz)
    other -> other
  }
}

/// Set padding on a Box container with a typed `SizeToken`.
pub fn padding_size(n: Node, sz: SizeToken) -> Node {
  case n {
    Box(..) as b -> Box(..b, padding: Some(sz))
    other -> other
  }
}

/// Align items along cross axis.
pub fn align(n: Node, a: Align) -> Node {
  case n {
    Box(..) as b -> Box(..b, align: Some(a))
    other -> other
  }
}

/// Justify content along main axis.
pub fn justify(n: Node, j: Justify) -> Node {
  case n {
    Box(..) as b -> Box(..b, justify: Some(j))
    other -> other
  }
}

/// Set flex wrapping on a Box.
pub fn wrap(n: Node, w: Bool) -> Node {
  case n {
    Box(..) as b -> Box(..b, wrap: Some(w))
    other -> other
  }
}

/// Set background color or token on a Box.
pub fn background(n: Node, bg: String) -> Node {
  case n {
    Box(..) as b -> Box(..b, background: Some(bg))
    other -> other
  }
}

/// Append a single child node to Box or Card.
pub fn child(parent: Node, c: Node) -> Node {
  case parent {
    Box(..) as b -> Box(..b, children: list.append(b.children, [c]))
    Card(..) as card -> Card(..card, children: list.append(card.children, [c]))
    other -> other
  }
}

/// Replace all children of a Box or Card.
pub fn children(parent: Node, kids: List(Node)) -> Node {
  case parent {
    Box(..) as b -> Box(..b, children: kids)
    Card(..) as card -> Card(..card, children: kids)
    other -> other
  }
}

// -----------------------------------------------------------------------------
// Component-Specific Modifiers
// -----------------------------------------------------------------------------

/// Set title on Card, Banner, ListItem, or EmptyState.
pub fn title(n: Node, t: String) -> Node {
  case n {
    Card(..) as card -> Card(..card, title: Some(t))
    Banner(..) as banner -> Banner(..banner, title: Some(t))
    ListItem(..) as item -> ListItem(..item, title: t)
    EmptyState(..) as empty -> EmptyState(..empty, title: t)
    other -> other
  }
}

/// Set subtitle on Card or ListItem.
pub fn subtitle(n: Node, s: String) -> Node {
  case n {
    Card(..) as card -> Card(..card, subtitle: Some(s))
    ListItem(..) as item -> ListItem(..item, subtitle: Some(s))
    other -> other
  }
}

/// Set icon name on Card, Banner, EmptyState, or ListItem.
pub fn with_icon(n: Node, icon_name: String) -> Node {
  case n {
    Card(..) as card -> Card(..card, icon: Some(icon_name))
    Banner(..) as banner -> Banner(..banner, icon: Some(icon_name))
    ListItem(..) as item -> ListItem(..item, icon: Some(icon_name))
    EmptyState(..) as empty -> EmptyState(..empty, icon: Some(icon_name))
    Button(..) as btn -> Button(..btn, icon: Some(icon_name))
    other -> other
  }
}

/// Attach an interactive Action to the node.
pub fn action(n: Node, act: Action) -> Node {
  case n {
    Box(..) as b -> Box(..b, action: Some(act))
    Card(..) as c -> Card(..c, action: Some(act))
    Text(..) as txt -> Text(..txt, action: Some(act))
    Avatar(..) as av -> Avatar(..av, action: Some(act))
    Button(..) as btn -> Button(..btn, action: act)
    IconButton(..) as ib -> IconButton(..ib, action: act)
    Toggle(..) as tog -> Toggle(..tog, action: act)
    Select(..) as sel -> Select(..sel, action: Some(act))
    Tabs(..) as tb -> Tabs(..tb, action: act)
    Progress(..) as pr -> Progress(..pr, action: Some(act))
    Banner(..) as ban -> Banner(..ban, action: Some(act))
    EmptyState(..) as es -> EmptyState(..es, action: Some(act))
    ListItem(..) as li -> ListItem(..li, on_click_action: Some(act))
    other -> other
  }
}

/// Set disabled state on Button, IconButton, Toggle.
pub fn disabled(n: Node, is_disabled: Bool) -> Node {
  case n {
    Button(..) as btn -> Button(..btn, disabled: Some(is_disabled))
    IconButton(..) as ib -> IconButton(..ib, disabled: Some(is_disabled))
    Toggle(..) as tog -> Toggle(..tog, disabled: Some(is_disabled))
    other -> other
  }
}

/// Set loading state on Button.
pub fn loading(n: Node, is_loading: Bool) -> Node {
  case n {
    Button(..) as btn -> Button(..btn, loading: Some(is_loading))
    other -> other
  }
}

/// Set a CSS background for the card's banner strip.
pub fn banner_background(n: Node, background: String) -> Node {
  case n {
    Card(..) as card -> Card(..card, banner_background: Some(background))
    other -> other
  }
}

/// Set the change action on a Textarea.
pub fn action_on_change(n: Node, act: Action) -> Node {
  case n {
    Textarea(..) as ta -> Textarea(..ta, action_on_change: Some(act))
    other -> other
  }
}

/// Set placeholder on Input or Textarea.
pub fn placeholder(n: Node, ph: String) -> Node {
  case n {
    Input(..) as inp -> Input(..inp, placeholder: Some(ph))
    Textarea(..) as ta -> Textarea(..ta, placeholder: Some(ph))
    other -> other
  }
}

/// Set initial value on Input, Textarea, or Select.
pub fn value(n: Node, val: String) -> Node {
  case n {
    Input(..) as inp -> Input(..inp, value: Some(val))
    Textarea(..) as ta -> Textarea(..ta, value: Some(val))
    Select(..) as sel -> Select(..sel, value: Some(val))
    other -> other
  }
}

/// Set input type on Input primitive.
pub fn input_type(n: Node, it: InputType) -> Node {
  case n {
    Input(..) as inp -> Input(..inp, input_type: Some(it))
    other -> other
  }
}

/// Set footer children on Card.
pub fn footer(card_node: Node, foot: List(Node)) -> Node {
  case card_node {
    Card(..) as c -> Card(..c, footer: foot)
    other -> other
  }
}

/// Set header action node on Card.
pub fn header_action(card_node: Node, ha: Node) -> Node {
  case card_node {
    Card(..) as c -> Card(..c, header_action: Some(ha))
    other -> other
  }
}

/// Set typography variant on Text.
pub fn text_variant(n: Node, vr: TextVariant) -> Node {
  case n {
    Text(..) as txt -> Text(..txt, variant: Some(vr))
    other -> other
  }
}

/// Set color tone on Text.
pub fn text_tone(n: Node, tn: TextTone) -> Node {
  case n {
    Text(..) as txt -> Text(..txt, tone: Some(tn))
    other -> other
  }
}

/// Set tone on Badge.
pub fn badge_tone(n: Node, tn: BadgeTone) -> Node {
  case n {
    Badge(..) as b -> Badge(..b, tone: Some(tn))
    other -> other
  }
}

/// Set tone on Banner.
pub fn banner_tone(n: Node, tn: BannerTone) -> Node {
  case n {
    Banner(..) as ban -> Banner(..ban, tone: Some(tn))
    other -> other
  }
}

/// Set image source on Avatar.
pub fn avatar_src(n: Node, url: String) -> Node {
  case n {
    Avatar(..) as av -> Avatar(..av, src: Some(url))
    other -> other
  }
}
