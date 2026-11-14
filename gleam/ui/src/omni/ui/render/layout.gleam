//// Layout & Structure Schema Primitives Renderer (`Box`, `Card`, `Divider`, `Spacer`).
////
//// Renders layout schema primitives into standard Lustre HTML elements with
//// `.omni-*` CSS classes and data attributes.

import gleam/list
import gleam/option.{type Option, None, Some}
import lustre/attribute.{type Attribute}
import lustre/element.{type Element}
import lustre/element/html
import lustre/event
import omni/protocol/schema/action.{type Action}
import omni/protocol/schema/codec
import omni/protocol/schema/node.{
  type Align, type Direction, type Justify, type Node, type Orientation, Column,
  Horizontal,
}
import omni/protocol/schema/style.{type SizeToken, SizeMd}
import omni/ui/icons

/// Renders a `Box` flex container primitive.
pub fn render_box(
  base_attrs: List(Attribute(Action)),
  direction: Option(Direction),
  gap: Option(SizeToken),
  align: Option(Align),
  justify: Option(Justify),
  wrap: Option(Bool),
  padding: Option(SizeToken),
  action: Option(Action),
  background: Option(String),
  children: List(Node),
  render_node: fn(Node) -> Element(Action),
) -> Element(Action) {
  let dir = option.unwrap(direction, Column)
  let dir_str = codec.direction_to_string(dir)
  let dir_class = "omni-box-" <> dir_str

  let gap_class = case gap {
    Some(g) -> " omni-box-gap-" <> style.size_to_string(g)
    None -> ""
  }

  let pad_class = case padding {
    Some(p) -> " omni-box-padding-" <> style.size_to_string(p)
    None -> ""
  }

  let align_class = case align {
    Some(a) -> " omni-box-align-" <> codec.align_to_string(a)
    None -> ""
  }

  let justify_class = case justify {
    Some(j) -> " omni-box-justify-" <> codec.justify_to_string(j)
    None -> ""
  }

  let interactive_class = case action {
    Some(_) -> " omni-box-interactive"
    None -> ""
  }

  let wrap_class = case wrap {
    Some(True) -> " omni-box-wrap"
    _ -> ""
  }

  let class_attr =
    attribute.class(
      "omni-box "
      <> dir_class
      <> gap_class
      <> pad_class
      <> align_class
      <> justify_class
      <> interactive_class
      <> wrap_class,
    )

  let data_attrs =
    list.flatten([
      [attribute.attribute("data-direction", dir_str)],
      case gap {
        Some(g) -> [
          attribute.attribute("gap", style.size_to_string(g)),
          attribute.attribute("data-gap", style.size_to_string(g)),
        ]
        None -> []
      },
      case padding {
        Some(p) -> [
          attribute.attribute("padding", style.size_to_string(p)),
          attribute.attribute("data-padding", style.size_to_string(p)),
        ]
        None -> []
      },
      case align {
        Some(a) -> [
          attribute.attribute("align", codec.align_to_string(a)),
          attribute.attribute("data-align", codec.align_to_string(a)),
        ]
        None -> []
      },
      case justify {
        Some(j) -> [
          attribute.attribute("justify", codec.justify_to_string(j)),
          attribute.attribute("data-justify", codec.justify_to_string(j)),
        ]
        None -> []
      },
      case wrap {
        Some(True) -> [attribute.attribute("data-wrap", "true")]
        Some(False) -> [attribute.attribute("data-wrap", "false")]
        None -> []
      },
      case background {
        Some(bg) -> [attribute.style("background", bg)]
        None -> []
      },
      case action {
        Some(act) -> [event.on_click(act)]
        None -> []
      },
    ])

  let attrs = list.flatten([[class_attr], base_attrs, data_attrs])
  html.div(attrs, list.map(children, render_node))
}

/// Renders a `Card` surface primitive with optional banner, header, body, and footer.
pub fn render_card(
  base_attrs: List(Attribute(Action)),
  title: Option(String),
  subtitle: Option(String),
  icon: Option(String),
  header_action: Option(Node),
  children: List(Node),
  footer: List(Node),
  action: Option(Action),
  banner_background: Option(String),
  render_node: fn(Node) -> Element(Action),
) -> Element(Action) {
  let interactive_class = case action {
    Some(_) -> " omni-card-interactive"
    None -> ""
  }
  let banner_class = case banner_background {
    Some(_) -> " has-banner"
    None -> ""
  }

  let class_attr =
    attribute.class("omni-card" <> interactive_class <> banner_class)

  let click_attr = case action {
    Some(act) -> [event.on_click(act)]
    None -> []
  }

  let banner_el = case banner_background {
    Some(bg) -> [
      html.div(
        [
          attribute.class("omni-card-banner"),
          attribute.style("background", bg),
        ],
        [],
      ),
    ]
    None -> []
  }

  let has_header = case title, subtitle, icon, header_action {
    None, None, None, None -> False
    _, _, _, _ -> True
  }

  let header_el = case has_header {
    False -> []
    True -> {
      let icon_el = case icon {
        Some(ic) -> [
          html.div([attribute.class("omni-card-icon")], [
            icons.render_icon(ic, 18),
          ]),
        ]
        None -> []
      }

      let has_titles = case title, subtitle {
        None, None -> False
        _, _ -> True
      }

      let titles_el = case has_titles {
        False -> []
        True -> {
          let title_children =
            list.flatten([
              case title {
                Some(t) -> [
                  html.h3([attribute.class("omni-card-title")], [
                    element.text(t),
                  ]),
                ]
                None -> []
              },
              case subtitle {
                Some(st) -> [
                  html.p([attribute.class("omni-card-subtitle")], [
                    element.text(st),
                  ]),
                ]
                None -> []
              },
            ])
          [html.div([attribute.class("omni-card-titles")], title_children)]
        }
      }

      let action_el = case header_action {
        Some(ha) -> [
          html.div([attribute.class("omni-card-header-action")], [
            render_node(ha),
          ]),
        ]
        None -> []
      }

      [
        html.div(
          [attribute.class("omni-card-header")],
          list.flatten([icon_el, titles_el, action_el]),
        ),
      ]
    }
  }

  let body_el = [
    html.div(
      [attribute.class("omni-card-body")],
      list.map(children, render_node),
    ),
  ]

  let footer_el = case footer {
    [] -> []
    items -> [
      html.div(
        [attribute.class("omni-card-footer")],
        list.map(items, render_node),
      ),
    ]
  }

  let attrs = list.flatten([[class_attr], base_attrs, click_attr])
  let card_children = list.flatten([banner_el, header_el, body_el, footer_el])

  html.div(attrs, card_children)
}

/// Renders a `Divider` rule primitive.
pub fn render_divider(
  base_attrs: List(Attribute(Action)),
  orientation: Option(Orientation),
) -> Element(Action) {
  let ori = option.unwrap(orientation, Horizontal)
  let ori_str = codec.orientation_to_string(ori)
  let class_attr = attribute.class("omni-divider omni-divider-" <> ori_str)
  let data_attr = attribute.attribute("data-orientation", ori_str)

  html.hr(list.flatten([[class_attr, data_attr], base_attrs]))
}

/// Renders a `Spacer` layout primitive.
pub fn render_spacer(
  base_attrs: List(Attribute(Action)),
  size: Option(SizeToken),
) -> Element(Action) {
  let sz = option.unwrap(size, SizeMd)
  let sz_str = style.size_to_string(sz)
  let class_attr = attribute.class("omni-spacer omni-spacer-" <> sz_str)
  let data_attr = attribute.attribute("data-size", sz_str)

  html.div(list.flatten([[class_attr, data_attr], base_attrs]), [])
}
