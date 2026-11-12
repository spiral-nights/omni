import gleam/int
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import gleeunit/should
import lustre/attribute as lustre_attr
import lustre/element as lustre_el
import omni/protocol/schema/action
import omni/protocol/schema/node.{
  AlignCenter, Avatar, Badge, BadgeOutline, BadgeSuccess, Banner, BannerWarning,
  Body, Box, Button, ButtonPrimary, ButtonSecondary, Card, CodeBlock, Column,
  Divider, EmptyState, Horizontal, Icon, IconButton, IconButtonDanger, IconLeft,
  IconRight, Input, InputSearch, JustifyBetween, List as SchemaList, ListItem,
  Metric, MetricInt, NodeBase, PageDeclaration, Progress, ProgressBar,
  ProgressRing, ProgressSpinner, Row, Select, SelectOption, Spacer,
  StatusIndicator, StatusOnline, TabItem, Tabs, Text, Textarea, Title, Toggle,
  ToneAccent, TonePrimary, TrendUp, Vertical, VirtualList, empty_base,
}
import omni/protocol/schema/style.{
  Padding, SizeLg, SizeMd, SizeSm, SizeXl, StyleProps,
}
import omni/testkit/golden
import omni/ui/render
import omni/ui/virtual_list

// -----------------------------------------------------------------------------
// NodeBase Common Properties Tests
// -----------------------------------------------------------------------------

pub fn render_invisible_node_returns_empty_test() {
  let base = NodeBase(..empty_base(), visible: Some(False))
  let n =
    Text(
      base: base,
      content: "Hidden content",
      variant: None,
      tone: None,
      truncate: None,
      action: None,
      show_inline_images: None,
    )
  render.render_to_string(n)
  |> should.equal("")
}

pub fn render_base_attributes_test() {
  let base =
    NodeBase(
      id: Some("node-1"),
      key: Some("key-1"),
      visible: Some(True),
      style: Some(StyleProps([Padding(SizeMd)])),
      page: Some(PageDeclaration(
        id: "page-home",
        title: Some("Home"),
        url: None,
      )),
    )
  let n =
    Text(
      base: base,
      content: "Visible",
      variant: Some(Title),
      tone: Some(ToneAccent),
      truncate: Some(True),
      action: None,
      show_inline_images: None,
    )
  let html_str = render.render_to_string(n)
  should.be_true(string.contains(html_str, "id=\"node-1\""))
  should.be_true(string.contains(html_str, "data-key=\"key-1\""))
  should.be_true(string.contains(html_str, "data-page-id=\"page-home\""))
  should.be_true(string.contains(html_str, "padding:1rem;"))
  should.be_true(string.contains(
    html_str,
    "omni-text omni-text-title omni-tone-accent omni-text-truncate",
  ))
}

// -----------------------------------------------------------------------------
// All 24 Primitives Unit Tests
// -----------------------------------------------------------------------------

pub fn render_box_test() {
  let n =
    Box(
      base: empty_base(),
      direction: Some(Row),
      gap: Some(SizeMd),
      align: Some(AlignCenter),
      justify: Some(JustifyBetween),
      wrap: Some(True),
      padding: Some(SizeSm),
      action: Some(action.new("box-click")),
      background: Some("var(--omni-bg-surface)"),
      children: [
        Text(
          base: empty_base(),
          content: "Child",
          variant: None,
          tone: None,
          truncate: None,
          action: None,
          show_inline_images: None,
        ),
      ],
    )
  let s = render.render_to_string(n)
  should.be_true(string.contains(
    s,
    "class=\"omni-box omni-box-row omni-box-interactive omni-box-wrap\"",
  ))
  should.be_true(string.contains(s, "data-direction=\"row\""))
  should.be_true(string.contains(s, "data-gap=\"md\""))
  should.be_true(string.contains(s, "data-padding=\"sm\""))
  should.be_true(string.contains(s, "data-align=\"center\""))
  should.be_true(string.contains(s, "data-justify=\"between\""))
  should.be_true(string.contains(s, "data-wrap=\"true\""))
  should.be_true(string.contains(s, "Child"))
}

pub fn render_card_test() {
  let n =
    Card(
      base: NodeBase(..empty_base(), id: Some("card-1")),
      title: Some("Relay Pool"),
      subtitle: Some("3 connected relays"),
      icon: Some("relay"),
      header_action: Some(Button(
        base: empty_base(),
        label: "Add",
        action: action.new("add-relay"),
        variant: Some(ButtonSecondary),
        size: Some(SizeSm),
        icon: Some("plus"),
        icon_position: Some(IconLeft),
        disabled: None,
        loading: None,
      )),
      children: [
        Text(
          base: empty_base(),
          content: "Card body content",
          variant: Some(Body),
          tone: Some(TonePrimary),
          truncate: None,
          action: None,
          show_inline_images: None,
        ),
      ],
      footer: [
        Badge(
          base: empty_base(),
          label: "Healthy",
          tone: Some(BadgeSuccess),
          variant: Some(BadgeOutline),
          dot: Some(True),
        ),
      ],
      action: Some(action.new("open-card")),
      banner_background: Some("linear-gradient(135deg, #22201d, #191816)"),
    )
  let s = render.render_to_string(n)
  should.be_true(string.contains(
    s,
    "class=\"omni-card omni-card-interactive has-banner\"",
  ))
  should.be_true(string.contains(s, "omni-card-banner"))
  should.be_true(string.contains(s, "omni-card-header"))
  should.be_true(string.contains(s, "omni-card-title"))
  should.be_true(string.contains(s, "Relay Pool"))
  should.be_true(string.contains(s, "3 connected relays"))
  should.be_true(string.contains(s, "omni-card-header-action"))
  should.be_true(string.contains(s, "omni-card-body"))
  should.be_true(string.contains(s, "omni-card-footer"))
}

pub fn render_divider_and_spacer_test() {
  let div_h = Divider(base: empty_base(), orientation: Some(Horizontal))
  let div_v = Divider(base: empty_base(), orientation: Some(Vertical))
  let sp = Spacer(base: empty_base(), size: Some(SizeXl))

  should.be_true(string.contains(
    render.render_to_string(div_h),
    "<hr class=\"omni-divider omni-divider-horizontal\" data-orientation=\"horizontal\">",
  ))
  should.be_true(string.contains(
    render.render_to_string(div_v),
    "omni-divider-vertical",
  ))
  should.be_true(string.contains(
    render.render_to_string(sp),
    "<div class=\"omni-spacer omni-spacer-xl\" data-size=\"xl\"></div>",
  ))
}

pub fn render_badge_and_metric_and_icon_test() {
  let b =
    Badge(
      base: empty_base(),
      label: "Online",
      tone: Some(BadgeSuccess),
      variant: Some(BadgeOutline),
      dot: Some(True),
    )
  let bs = render.render_to_string(b)
  should.be_true(string.contains(
    bs,
    "class=\"omni-badge omni-badge-success omni-badge-outline\"",
  ))
  should.be_true(string.contains(bs, "omni-badge-dot"))
  should.be_true(string.contains(bs, "Online"))

  let m =
    Metric(
      base: empty_base(),
      label: "Notes Cached",
      value: MetricInt(1024),
      subtext: Some("+12% today"),
      trend: Some(TrendUp),
    )
  let ms = render.render_to_string(m)
  should.be_true(string.contains(ms, "omni-metric omni-metric-trend-up"))
  should.be_true(string.contains(ms, "Notes Cached"))
  should.be_true(string.contains(ms, "1024"))
  should.be_true(string.contains(ms, "+12% today"))

  let ic = Icon(base: empty_base(), name: "bolt", size: Some(20))
  let ics = render.render_to_string(ic)
  should.be_true(string.contains(ics, "<svg"))
  should.be_true(string.contains(ics, "data-icon=\"bolt\""))
  should.be_true(string.contains(ics, "width=\"20\""))
}

pub fn render_avatar_sanitization_and_fallback_test() {
  // Valid https URL renders img
  let av_valid =
    Avatar(
      base: empty_base(),
      src: Some("https://nostr.com/avatar.png"),
      pubkey: Some(
        "82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2",
      ),
      name: Some("Alice"),
      size: Some(SizeLg),
      action: Some(action.new("view-profile")),
    )
  let s_valid = render.render_to_string(av_valid)
  should.be_true(string.contains(
    s_valid,
    "class=\"omni-avatar omni-avatar-lg omni-avatar-interactive\"",
  ))
  should.be_true(string.contains(
    s_valid,
    "<img alt=\"Alice\" class=\"omni-avatar-img\" src=\"https://nostr.com/avatar.png\">",
  ))

  // Unsafe javascript: URL is rejected and falls back to initials
  let av_unsafe =
    Avatar(
      base: empty_base(),
      src: Some("javascript:alert(1)"),
      pubkey: Some("deadbeef"),
      name: Some("bob"),
      size: Some(SizeSm),
      action: None,
    )
  let s_unsafe = render.render_to_string(av_unsafe)
  should.be_false(string.contains(s_unsafe, "javascript:"))
  should.be_false(string.contains(s_unsafe, "<img"))
  should.be_true(string.contains(s_unsafe, "data-avatar-seed"))
  should.be_true(string.contains(s_unsafe, ">B</text>"))
}

pub fn render_code_block_test() {
  let cb =
    CodeBlock(
      base: empty_base(),
      code: "pub fn main() { Nil }",
      language: Some("gleam"),
      copyable: Some(True),
    )
  let s = render.render_to_string(cb)
  should.be_true(string.contains(s, "class=\"omni-code-block\""))
  should.be_true(string.contains(s, "data-language=\"gleam\""))
  should.be_true(string.contains(
    s,
    "<pre class=\"omni-code-pre\"><code class=\"omni-code\">pub fn main() { Nil }</code></pre>",
  ))
}

pub fn render_buttons_and_inputs_test() {
  let btn =
    Button(
      base: empty_base(),
      label: "Publish",
      action: action.new("publish"),
      variant: Some(ButtonPrimary),
      size: Some(SizeMd),
      icon: Some("upload"),
      icon_position: Some(IconRight),
      disabled: Some(False),
      loading: Some(True),
    )
  let bs = render.render_to_string(btn)
  should.be_true(string.contains(
    bs,
    "class=\"omni-button omni-button-primary omni-button-md omni-button-loading\"",
  ))
  should.be_true(string.contains(bs, "omni-spinner"))
  should.be_true(string.contains(bs, "Publish"))
  should.be_true(string.contains(bs, "disabled"))

  let ibtn =
    IconButton(
      base: empty_base(),
      icon: "trash",
      tooltip: Some("Delete note"),
      action: action.new("delete"),
      variant: Some(IconButtonDanger),
      size: Some(SizeSm),
      disabled: None,
    )
  let ibs = render.render_to_string(ibtn)
  should.be_true(string.contains(
    ibs,
    "class=\"omni-icon-button omni-icon-button-danger omni-icon-button-sm\"",
  ))
  should.be_true(string.contains(ibs, "aria-label=\"Delete note\""))
  should.be_true(string.contains(ibs, "title=\"Delete note\""))

  let inp =
    Input(
      base: empty_base(),
      name: "query",
      placeholder: Some("Search notes..."),
      value: Some("nostr"),
      input_type: Some(InputSearch),
      accept: None,
      clearable: Some(True),
      prefix_icon: Some("search"),
      action_on_enter: Some(action.new("search-enter")),
      action_on_change: Some(action.new("search-change")),
    )
  let inps = render.render_to_string(inp)
  should.be_true(string.contains(
    inps,
    "class=\"omni-input-wrapper omni-input-clearable omni-input-with-prefix\"",
  ))
  should.be_true(string.contains(inps, "omni-input-prefix-icon"))
  should.be_true(string.contains(inps, "type=\"search\""))
  should.be_true(string.contains(inps, "name=\"query\""))
  should.be_true(string.contains(inps, "placeholder=\"Search notes...\""))
  should.be_true(string.contains(inps, "value=\"nostr\""))

  let ta =
    Textarea(
      base: empty_base(),
      name: "bio",
      placeholder: Some("About you"),
      value: Some("Builder on Nostr"),
      rows: Some(4),
      action_on_change: None,
    )
  let tas = render.render_to_string(ta)
  should.be_true(string.contains(tas, "<textarea class=\"omni-textarea\""))
  should.be_true(string.contains(tas, "rows=\"4\""))
  should.be_true(string.contains(tas, "Builder on Nostr</textarea>"))

  let tog =
    Toggle(
      base: empty_base(),
      name: "nip44",
      label: Some("Enable NIP-44 Encryption"),
      checked: True,
      action: action.new("toggle-nip44"),
      disabled: None,
    )
  let togs = render.render_to_string(tog)
  should.be_true(string.contains(
    togs,
    "class=\"omni-toggle omni-toggle-checked\"",
  ))
  should.be_true(string.contains(togs, "omni-toggle-track"))
  should.be_true(string.contains(togs, "omni-toggle-thumb"))
  should.be_true(string.contains(togs, "Enable NIP-44 Encryption"))

  let sel =
    Select(
      base: empty_base(),
      name: "shell",
      value: Some("panorama"),
      options: [
        SelectOption(label: "Editorial", value: "editorial"),
        SelectOption(label: "Panorama", value: "panorama"),
      ],
      action: Some(action.new("select-shell")),
    )
  let sels = render.render_to_string(sel)
  should.be_true(string.contains(sels, "<select class=\"omni-select\""))
  should.be_true(string.contains(
    sels,
    "<option selected value=\"panorama\">Panorama</option>",
  ))

  let tbs =
    Tabs(
      base: empty_base(),
      tabs: [
        TabItem(
          id: "global",
          label: "Global",
          icon: Some("feed"),
          badge: Some("12"),
        ),
        TabItem(id: "replies", label: "Replies", icon: None, badge: None),
      ],
      active_tab: "global",
      action: action.new("switch-tab"),
    )
  let tbss = render.render_to_string(tbs)
  should.be_true(string.contains(tbss, "role=\"tablist\""))
  should.be_true(string.contains(tbss, "class=\"omni-tab-btn active\""))
  should.be_true(string.contains(tbss, "data-tab-id=\"global\""))
  should.be_true(string.contains(tbss, "omni-tab-badge"))
}

pub fn render_feedback_primitives_test() {
  let si =
    StatusIndicator(
      base: empty_base(),
      status: StatusOnline,
      label: Some("Connected"),
      pulse: Some(True),
    )
  let sis = render.render_to_string(si)
  should.be_true(string.contains(
    sis,
    "class=\"omni-status-indicator omni-status-online\"",
  ))
  should.be_true(string.contains(
    sis,
    "omni-status-dot omni-status-online omni-status-pulse",
  ))

  let prog_bar =
    Progress(
      base: empty_base(),
      value: 65.0,
      max: Some(100.0),
      label: Some("Uploading"),
      variant: Some(ProgressBar),
      size: None,
      color: None,
      show_ticks: None,
      action: None,
    )
  let pbs = render.render_to_string(prog_bar)
  should.be_true(string.contains(pbs, "omni-progress omni-progress-bar"))
  should.be_true(string.contains(pbs, "Uploading (65%)"))
  should.be_true(string.contains(pbs, "width:65%;"))

  let prog_ring =
    Progress(
      base: empty_base(),
      value: 50.0,
      max: Some(100.0),
      label: Some("12:30"),
      variant: Some(ProgressRing),
      size: Some(180),
      color: None,
      show_ticks: Some(True),
      action: None,
    )
  let prs = render.render_to_string(prog_ring)
  should.be_true(string.contains(prs, "omni-progress-ring"))
  should.be_true(string.contains(prs, "omni-progress-circular"))
  should.be_true(string.contains(prs, "12:30"))

  let prog_spin =
    Progress(
      base: empty_base(),
      value: 0.0,
      max: None,
      label: Some("Syncing"),
      variant: Some(ProgressSpinner),
      size: Some(20),
      color: None,
      show_ticks: None,
      action: None,
    )
  let pss = render.render_to_string(prog_spin)
  should.be_true(string.contains(pss, "omni-progress-spinner"))
  should.be_true(string.contains(pss, "omni-icon-spin"))

  let ban =
    Banner(
      base: empty_base(),
      tone: Some(BannerWarning),
      title: Some("Relay Disconnected"),
      message: "Reconnecting in 3s...",
      icon: Some("relay"),
      action: Some(action.new("retry-relay")),
      action_label: Some("Retry Now"),
      dismissible: Some(True),
      on_dismiss_action: Some(action.new("dismiss-banner")),
    )
  let bans = render.render_to_string(ban)
  should.be_true(string.contains(bans, "omni-banner omni-banner-warning"))
  should.be_true(string.contains(bans, "role=\"alert\""))
  should.be_true(string.contains(bans, "Relay Disconnected"))
  should.be_true(string.contains(bans, "Retry Now"))
  should.be_true(string.contains(bans, "omni-banner-dismiss-btn"))

  let es =
    EmptyState(
      base: empty_base(),
      icon: Some("notes"),
      title: "No Notes Yet",
      description: Some("Create your first encrypted note."),
      action: Some(action.new("create-note")),
      action_label: Some("New Note"),
    )
  let ess = render.render_to_string(es)
  should.be_true(string.contains(ess, "omni-empty-state"))
  should.be_true(string.contains(ess, "No Notes Yet"))
  should.be_true(string.contains(ess, "New Note"))
}

pub fn render_list_and_virtual_list_test() {
  let item1 =
    ListItem(
      base: empty_base(),
      title: "wss://relay.damus.io",
      subtitle: Some("Read & Write"),
      meta: Some("42ms"),
      icon: Some("relay"),
      avatar_url: None,
      avatar_pubkey: None,
      checked: None,
      on_check_action: None,
      on_click_action: Some(action.new("inspect-relay")),
      actions: [
        IconButton(
          base: empty_base(),
          icon: "trash",
          tooltip: Some("Remove"),
          action: action.new("remove-relay"),
          variant: Some(IconButtonDanger),
          size: Some(SizeSm),
          disabled: None,
        ),
      ],
    )
  let item2 =
    ListItem(
      base: empty_base(),
      title: "Review NIP-78 sync",
      subtitle: None,
      meta: None,
      icon: None,
      avatar_url: None,
      avatar_pubkey: None,
      checked: Some(True),
      on_check_action: Some(action.new("toggle-task")),
      on_click_action: None,
      actions: [],
    )
  let lst =
    SchemaList(
      base: empty_base(),
      items: [item1, item2],
      on_scroll_end_action: Some(action.new("load-more")),
      has_more: Some(True),
      loading_more: Some(True),
    )
  let ls = render.render_to_string(lst)
  should.be_true(string.contains(ls, "class=\"omni-list\""))
  should.be_true(string.contains(ls, "role=\"list\""))
  should.be_true(string.contains(ls, "wss://relay.damus.io"))
  should.be_true(string.contains(ls, "omni-list-item-checkbox"))
  should.be_true(string.contains(ls, "omni-list-loading"))

  // VirtualList window computation
  let twenty_items =
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]
    |> list.map(fn(i) {
      ListItem(
        base: NodeBase(..empty_base(), id: Some("v-item-" <> int.to_string(i))),
        title: "Item " <> int.to_string(i),
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
    })

  let win = virtual_list.compute_window(twenty_items, 50, 2, 250, 200)
  // scroll_top=250 / 50 = 5, minus overscan 2 => start_index = 3
  should.equal(win.start_index, 3)
  // visible_count = 200/50 + 2*2 = 8 => end_index = 11
  should.equal(win.end_index, 11)
  should.equal(win.top_spacer_px, 150)
  should.equal(win.bottom_spacer_px, 450)
  should.equal(list.length(win.visible_items), 8)

  let vl =
    VirtualList(
      base: empty_base(),
      items: twenty_items,
      item_height: Some(50),
      overscan: Some(2),
      max_height: Some("400px"),
    )
  let vls = render.render_to_string(vl)
  should.be_true(string.contains(vls, "omni-virtual-list"))
  should.be_true(string.contains(vls, "data-total-items=\"20\""))
}

// -----------------------------------------------------------------------------
// Golden Snapshot Tests for Composite Trees
// -----------------------------------------------------------------------------

pub fn golden_card_composite_test() {
  let tree =
    Card(
      base: NodeBase(
        id: Some("profile-card"),
        key: Some("pk-alice"),
        visible: Some(True),
        style: None,
        page: Some(PageDeclaration(
          id: "profile-overview",
          title: Some("Profile"),
          url: None,
        )),
      ),
      title: Some("Alice"),
      subtitle: Some("npub1alice..."),
      icon: Some("user"),
      header_action: Some(Button(
        base: empty_base(),
        label: "Edit",
        action: action.new("edit-profile"),
        variant: Some(ButtonSecondary),
        size: Some(SizeSm),
        icon: Some("sliders"),
        icon_position: Some(IconLeft),
        disabled: None,
        loading: None,
      )),
      children: [
        Box(
          base: empty_base(),
          direction: Some(Row),
          gap: Some(SizeMd),
          align: Some(AlignCenter),
          justify: Some(JustifyBetween),
          wrap: None,
          padding: Some(SizeSm),
          action: None,
          background: None,
          children: [
            Avatar(
              base: empty_base(),
              src: Some("https://nostr.build/alice.png"),
              pubkey: Some("82341f882b6eabcd"),
              name: Some("Alice"),
              size: Some(SizeLg),
              action: None,
            ),
            Metric(
              base: empty_base(),
              label: "Followers",
              value: MetricInt(342),
              subtext: Some("+8 this week"),
              trend: Some(TrendUp),
            ),
          ],
        ),
        Divider(base: empty_base(), orientation: Some(Horizontal)),
        Text(
          base: empty_base(),
          content: "Building decentralized micro-frontends on Nostr.",
          variant: Some(Body),
          tone: Some(TonePrimary),
          truncate: None,
          action: None,
          show_inline_images: None,
        ),
      ],
      footer: [
        Badge(
          base: empty_base(),
          label: "NIP-07 Verified",
          tone: Some(BadgeSuccess),
          variant: Some(BadgeOutline),
          dot: Some(True),
        ),
      ],
      action: None,
      banner_background: Some("#22201d"),
    )

  golden.assert_match(
    "render/card_composite.html",
    render.render_to_readable_string(tree),
  )
}

pub fn golden_form_controls_test() {
  let tree =
    Box(
      base: NodeBase(..empty_base(), id: Some("settings-form")),
      direction: Some(Column),
      gap: Some(SizeMd),
      align: None,
      justify: None,
      wrap: None,
      padding: Some(SizeMd),
      action: None,
      background: None,
      children: [
        Tabs(
          base: empty_base(),
          tabs: [
            TabItem(
              id: "general",
              label: "General",
              icon: Some("settings"),
              badge: None,
            ),
            TabItem(
              id: "relays",
              label: "Relays",
              icon: Some("relay"),
              badge: Some("3"),
            ),
          ],
          active_tab: "general",
          action: action.new("change-settings-tab"),
        ),
        Input(
          base: empty_base(),
          name: "display_name",
          placeholder: Some("Display Name"),
          value: Some("Alice"),
          input_type: None,
          accept: None,
          clearable: Some(True),
          prefix_icon: Some("user"),
          action_on_enter: None,
          action_on_change: Some(action.new("update-name")),
        ),
        Textarea(
          base: empty_base(),
          name: "about",
          placeholder: Some("Bio"),
          value: Some("Local-first enthusiast"),
          rows: Some(3),
          action_on_change: None,
        ),
        Select(
          base: empty_base(),
          name: "theme_shell",
          value: Some("editorial"),
          options: [
            SelectOption(label: "Omni Editorial", value: "editorial"),
            SelectOption(label: "Panorama Hub", value: "panorama"),
            SelectOption(label: "Editorial Shell", value: "editorial"),
          ],
          action: Some(action.new("change-shell")),
        ),
        Toggle(
          base: empty_base(),
          name: "offline_cache",
          label: Some("0ms Local Event Store Cache"),
          checked: True,
          action: action.new("toggle-cache"),
          disabled: None,
        ),
        Button(
          base: empty_base(),
          label: "Save Settings",
          action: action.new("save-settings"),
          variant: Some(ButtonPrimary),
          size: Some(SizeMd),
          icon: Some("check"),
          icon_position: Some(IconLeft),
          disabled: None,
          loading: None,
        ),
      ],
    )

  golden.assert_match(
    "render/form_controls.html",
    render.render_to_readable_string(tree),
  )
}

pub fn golden_feedback_and_list_test() {
  let tree =
    Box(
      base: NodeBase(..empty_base(), id: Some("feedback-panel")),
      direction: Some(Column),
      gap: Some(SizeSm),
      align: None,
      justify: None,
      wrap: None,
      padding: None,
      action: None,
      background: None,
      children: [
        Banner(
          base: empty_base(),
          tone: Some(BannerWarning),
          title: Some("Low Relay Redundancy"),
          message: "Only 1 write relay is currently active.",
          icon: Some("relay"),
          action: Some(action.new("configure-relays")),
          action_label: Some("Configure"),
          dismissible: Some(True),
          on_dismiss_action: Some(action.new("dismiss-warning")),
        ),
        StatusIndicator(
          base: empty_base(),
          status: StatusOnline,
          label: Some("wss://relay.damus.io"),
          pulse: Some(True),
        ),
        Progress(
          base: empty_base(),
          value: 75.0,
          max: Some(100.0),
          label: Some("Cache Index"),
          variant: Some(ProgressBar),
          size: None,
          color: None,
          show_ticks: None,
          action: None,
        ),
        SchemaList(
          base: empty_base(),
          items: [
            ListItem(
              base: empty_base(),
              title: "Verify Schnorr signature",
              subtitle: Some("NIP-01 compliance"),
              meta: Some("Done"),
              icon: None,
              avatar_url: None,
              avatar_pubkey: None,
              checked: Some(True),
              on_check_action: Some(action.new("check-item")),
              on_click_action: None,
              actions: [],
            ),
          ],
          on_scroll_end_action: None,
          has_more: Some(False),
          loading_more: Some(False),
        ),
      ],
    )

  golden.assert_matches(
    "render/feedback_and_list.html",
    render.render_to_readable_string(tree),
  )
}

pub fn golden_virtual_list_window_test() {
  let items =
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    |> list.map(fn(i) {
      ListItem(
        base: NodeBase(..empty_base(), id: Some("vl-row-" <> int.to_string(i))),
        title: "Virtual Row " <> int.to_string(i),
        subtitle: Some("Item subtitle " <> int.to_string(i)),
        meta: Some("#" <> int.to_string(i)),
        icon: Some("feed"),
        avatar_url: None,
        avatar_pubkey: None,
        checked: None,
        on_check_action: None,
        on_click_action: None,
        actions: [],
      )
    })

  let windowed_el =
    virtual_list.render_virtual_list_at(
      [lustre_attr.id("vlist-1")],
      items,
      60,
      1,
      Some("120px"),
      180,
      120,
      render.render,
    )

  golden.assert_matches(
    "render/virtual_list_window.html",
    lustre_el.to_readable_string(windowed_el),
  )
}
