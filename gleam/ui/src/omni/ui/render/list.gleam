//// Collections & Lists Schema Primitives Renderer (`List`, `ListItem`).
////
//// Renders list containers and list items into standard Lustre HTML elements
//// with `.omni-*` CSS classes, sanitized avatar URLs, and interactive actions.

import gleam/dynamic
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import lustre/attribute.{type Attribute}
import lustre/element.{type Element}
import lustre/element/html
import lustre/event
import omni/protocol/schema/action.{type Action}
import omni/protocol/schema/node.{type Node}
import omni/ui/avatar as generated_avatar
import omni/ui/icons
import omni/ui/render/input
import omni/ui/sanitize

/// Renders a `List` container primitive.
pub fn render_list(
  base_attrs: List(Attribute(Action)),
  items: List(Node),
  on_scroll_end_action: Option(Action),
  has_more: Option(Bool),
  loading_more: Option(Bool),
  render_node: fn(Node) -> Element(Action),
) -> Element(Action) {
  let class_attr = attribute.class("omni-list")
  let role_attr = attribute.role("list")

  let extra_attrs =
    list.flatten([
      case has_more {
        Some(True) -> [attribute.attribute("data-has-more", "true")]
        Some(False) -> [attribute.attribute("data-has-more", "false")]
        None -> []
      },
      case loading_more {
        Some(True) -> [attribute.attribute("data-loading-more", "true")]
        Some(False) -> [attribute.attribute("data-loading-more", "false")]
        None -> []
      },
      case on_scroll_end_action {
        Some(act) -> [attribute.attribute("data-scroll-end-action", act.name)]
        None -> []
      },
    ])

  let items_el =
    html.div([attribute.class("omni-list-items")], list.map(items, render_node))

  let loading_el = case loading_more {
    Some(True) -> [
      html.div([attribute.class("omni-list-sentinel omni-list-loading")], [
        html.span([attribute.class("omni-spinner")], []),
      ]),
    ]
    _ -> []
  }

  let attrs = list.flatten([[class_attr, role_attr], base_attrs, extra_attrs])
  html.div(attrs, [items_el, ..loading_el])
}

/// Renders a `ListItem` row primitive.
pub fn render_list_item(
  base_attrs: List(Attribute(Action)),
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
  render_node: fn(Node) -> Element(Action),
) -> Element(Action) {
  let interactive_class = case on_click_action {
    Some(_) -> " omni-list-item-interactive"
    None -> ""
  }
  let checked_class = case checked {
    Some(True) -> " omni-list-item-checked"
    _ -> ""
  }

  let class_attr =
    attribute.class("omni-list-item" <> interactive_class <> checked_class)

  let extra_attrs =
    list.flatten([
      [attribute.role("listitem")],
      case checked {
        Some(True) -> [attribute.attribute("data-checked", "true")]
        Some(False) -> [attribute.attribute("data-checked", "false")]
        None -> []
      },
      case on_click_action {
        Some(act) -> [event.on_click(act)]
        None -> []
      },
    ])

  // Leading checkbox (if `checked` is `Some`)
  let checkbox_el = case checked {
    Some(is_chk) -> {
      let chk_attrs =
        list.flatten([
          [
            attribute.class("omni-list-item-checkbox"),
            attribute.type_("checkbox"),
          ],
          case is_chk {
            True -> [attribute.attribute("checked", "")]
            False -> []
          },
          case on_check_action {
            Some(act) -> [
              event.on_check(fn(new_chk) {
                input.merge_action_payload(act, [
                  #("checked", dynamic.bool(new_chk)),
                ])
              }),
            ]
            None -> []
          },
        ])
      [html.input(chk_attrs)]
    }
    None -> []
  }

  // Leading avatar or icon (when no checkbox is present)
  let leading_el = case checked {
    Some(_) -> []
    None -> {
      let safe_avatar = case avatar_url {
        Some(raw) -> sanitize.sanitize_url(raw)
        None -> None
      }
      case safe_avatar {
        Some(url) -> [
          html.div(
            [attribute.class("omni-list-item-icon omni-list-item-avatar")],
            [
              html.img([
                attribute.class("omni-avatar-img"),
                attribute.src(url),
                attribute.alt(title),
              ]),
            ],
          ),
        ]
        None ->
          case avatar_pubkey {
            Some(pk) -> {
              let initial =
                string.uppercase(string.slice(string.trim(title), 0, 1))
              let fallback = case initial {
                "" -> string.uppercase(string.slice(pk, 0, 2))
                _ -> initial
              }
              [
                html.div(
                  [
                    attribute.class("omni-list-item-icon omni-list-item-avatar"),
                    attribute.attribute("data-pubkey", pk),
                  ],
                  [generated_avatar.render(pk, fallback)],
                ),
              ]
            }
            None ->
              case icon {
                Some(ic) -> [
                  html.div([attribute.class("omni-list-item-icon")], [
                    icons.render_icon(ic, 16),
                  ]),
                ]
                None -> []
              }
          }
      }
    }
  }

  // Content column (title, subtitle)
  let title_el = [
    html.div([attribute.class("omni-list-item-title")], [
      element.text(title),
    ]),
  ]
  let subtitle_el = case subtitle {
    Some(sub) -> [
      html.div([attribute.class("omni-list-item-subtitle")], [
        element.text(sub),
      ]),
    ]
    None -> []
  }
  let content_el = [
    html.div(
      [attribute.class("omni-list-item-content")],
      list.flatten([title_el, subtitle_el]),
    ),
  ]

  // Meta / actions right column
  let meta_el = case meta {
    Some(m) -> [
      html.div([attribute.class("omni-list-item-meta")], [element.text(m)]),
    ]
    None -> []
  }

  let actions_el = case actions {
    [] -> []
    acts -> [
      html.div(
        [attribute.class("omni-list-item-actions")],
        list.map(acts, render_node),
      ),
    ]
  }

  let attrs = list.flatten([[class_attr], base_attrs, extra_attrs])
  let children =
    list.flatten([checkbox_el, leading_el, content_el, meta_el, actions_el])

  html.div(attrs, children)
}
