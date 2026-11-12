//// Declarative Schema UI Renderer (`Node` -> `lustre/element.Element(Action)`).
////
//// Renders all 24 Omni Server-Driven UI primitives directly into standard
//// Lustre HTML elements with `.omni-*` CSS classes (Decision D1).

import gleam/option.{None, Some}
import lustre/attribute.{type Attribute}
import lustre/element.{type Element}
import omni/protocol/schema/action.{type Action}
import omni/protocol/schema/node.{
  type Node, type NodeBase, Avatar, Badge, Banner, Box, Button, Card, CodeBlock,
  Divider, EmptyState, Icon, IconButton, Input, List as SchemaList, ListItem,
  Metric, Progress, Select, Spacer, StatusIndicator, Tabs, Text, Textarea,
  Toggle, VirtualList,
}
import omni/ui/render/feedback
import omni/ui/render/input
import omni/ui/render/layout
import omni/ui/render/list as render_list_mod
import omni/ui/render/text
import omni/ui/tokens
import omni/ui/virtual_list

/// Extracts Lustre attributes from a `NodeBase` (`id`, `data-key`, `style`, `data-page-id`).
pub fn base_attributes(base: NodeBase) -> List(Attribute(Action)) {
  let attrs = []
  let attrs = case base.page {
    Some(p) -> [attribute.attribute("data-page-id", p.id), ..attrs]
    None -> attrs
  }
  let attrs = case base.style {
    Some(st) -> [tokens.style_to_attribute(st), ..attrs]
    None -> attrs
  }
  let attrs = case base.key {
    Some(k) -> [attribute.attribute("data-key", k), ..attrs]
    None -> attrs
  }
  let attrs = case base.id {
    Some(id) -> [attribute.id(id), ..attrs]
    None -> attrs
  }
  attrs
}

/// Renders an Omni Schema `Node` tree into a Lustre `Element(Action)`.
///
/// If `base.visible == Some(False)`, returns `element.none()`.
pub fn render(n: Node) -> Element(Action) {
  let base = node.get_base(n)
  case base.visible {
    Some(False) -> element.none()
    _ -> {
      let b_attrs = base_attributes(base)
      case n {
        Box(
          _,
          direction,
          gap,
          align,
          justify,
          wrap,
          padding,
          act,
          background,
          children,
        ) ->
          layout.render_box(
            b_attrs,
            direction,
            gap,
            align,
            justify,
            wrap,
            padding,
            act,
            background,
            children,
            render,
          )

        Card(
          _,
          title,
          subtitle,
          icon,
          header_action,
          children,
          footer,
          act,
          banner_bg,
        ) ->
          layout.render_card(
            b_attrs,
            title,
            subtitle,
            icon,
            header_action,
            children,
            footer,
            act,
            banner_bg,
            render,
          )

        Divider(_, orientation) -> layout.render_divider(b_attrs, orientation)

        Spacer(_, size) -> layout.render_spacer(b_attrs, size)

        Text(_, content, variant, tone, truncate, act, show_inline_images) ->
          text.render_text(
            b_attrs,
            content,
            variant,
            tone,
            truncate,
            act,
            show_inline_images,
          )

        Badge(_, label, tone, variant, dot) ->
          text.render_badge(b_attrs, label, tone, variant, dot)

        Metric(_, label, value, subtext, trend) ->
          text.render_metric(b_attrs, label, value, subtext, trend)

        Icon(_, name, size) -> text.render_icon_node(b_attrs, name, size)

        Avatar(_, src, pubkey, name, size, act) ->
          text.render_avatar(b_attrs, src, pubkey, name, size, act)

        Button(
          _,
          label,
          act,
          variant,
          size,
          icon,
          icon_position,
          disabled,
          loading,
        ) ->
          input.render_button(
            b_attrs,
            label,
            act,
            variant,
            size,
            icon,
            icon_position,
            disabled,
            loading,
          )

        IconButton(_, icon, tooltip, act, variant, size, disabled) ->
          input.render_icon_button(
            b_attrs,
            icon,
            tooltip,
            act,
            variant,
            size,
            disabled,
          )

        Input(
          _,
          name,
          placeholder,
          value,
          input_type,
          accept,
          clearable,
          prefix_icon,
          action_on_enter,
          action_on_change,
        ) ->
          input.render_input(
            b_attrs,
            name,
            placeholder,
            value,
            input_type,
            accept,
            clearable,
            prefix_icon,
            action_on_enter,
            action_on_change,
          )

        Textarea(_, name, placeholder, value, rows, on_change) ->
          input.render_textarea(
            b_attrs,
            name,
            placeholder,
            value,
            rows,
            on_change,
          )

        Toggle(_, name, label, checked, act, disabled) ->
          input.render_toggle(b_attrs, name, label, checked, act, disabled)

        Select(_, name, value, options, act) ->
          input.render_select(b_attrs, name, value, options, act)

        Tabs(_, tabs, active_tab, act) ->
          input.render_tabs(b_attrs, tabs, active_tab, act)

        StatusIndicator(_, status, label, pulse) ->
          feedback.render_status_indicator(b_attrs, status, label, pulse)

        CodeBlock(_, code, language, copyable) ->
          text.render_code_block(b_attrs, code, language, copyable)

        Progress(_, value, max, label, variant, size, color, show_ticks, act) ->
          feedback.render_progress(
            b_attrs,
            value,
            max,
            label,
            variant,
            size,
            color,
            show_ticks,
            act,
          )

        Banner(
          _,
          tone,
          title,
          message,
          icon,
          act,
          action_label,
          dismissible,
          on_dismiss_action,
        ) ->
          feedback.render_banner(
            b_attrs,
            tone,
            title,
            message,
            icon,
            act,
            action_label,
            dismissible,
            on_dismiss_action,
          )

        SchemaList(_, items, on_scroll_end_action, has_more, loading_more) ->
          render_list_mod.render_list(
            b_attrs,
            items,
            on_scroll_end_action,
            has_more,
            loading_more,
            render,
          )

        ListItem(
          _,
          title,
          subtitle,
          meta,
          icon,
          avatar_url,
          avatar_pubkey,
          checked,
          on_check_action,
          on_click_action,
          actions,
        ) ->
          render_list_mod.render_list_item(
            b_attrs,
            title,
            subtitle,
            meta,
            icon,
            avatar_url,
            avatar_pubkey,
            checked,
            on_check_action,
            on_click_action,
            actions,
            render,
          )

        EmptyState(_, icon, title, description, act, action_label) ->
          feedback.render_empty_state(
            b_attrs,
            icon,
            title,
            description,
            act,
            action_label,
          )

        VirtualList(_, items, item_height, overscan, max_height) ->
          virtual_list.render_virtual_list(
            b_attrs,
            items,
            item_height,
            overscan,
            max_height,
            render,
          )
      }
    }
  }
}

/// Renders an Omni Schema `Node` into a compact HTML string.
pub fn render_to_string(n: Node) -> String {
  render(n) |> element.to_string
}

/// Renders an Omni Schema `Node` into a formatted, human-readable HTML string
/// suitable for golden snapshot comparison.
pub fn render_to_readable_string(n: Node) -> String {
  render(n) |> element.to_readable_string
}
