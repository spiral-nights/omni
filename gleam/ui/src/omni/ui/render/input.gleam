//// Interactive Controls & Form Input Schema Primitives Renderer
//// (`Button`, `IconButton`, `Input`, `Textarea`, `Toggle`, `Select`, `Tabs`).
////
//// Renders interactive form and button primitives into standard Lustre HTML
//// elements with `.omni-*` CSS classes and payload-enriched `Action` dispatch.

import gleam/dict
import gleam/dynamic.{type Dynamic}
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import lustre/attribute.{type Attribute}
import lustre/element.{type Element}
import lustre/element/html
import lustre/event
import omni/protocol/schema/action.{type Action}
import omni/protocol/schema/codec
import omni/protocol/schema/node.{
  type ButtonVariant, type IconButtonVariant, type IconPosition, type InputType,
  type SelectOption, type TabItem, ButtonPrimary, IconButtonGhost, IconLeft,
  IconRight, InputText,
}
import omni/protocol/schema/style.{type SizeToken, SizeMd, SizeSm}
import omni/ui/icons

/// Merge extra key-value pairs into an `Action`'s payload dictionary.
pub fn merge_action_payload(
  act: Action,
  extra: List(#(String, Dynamic)),
) -> Action {
  let existing = case act.payload {
    Some(d) -> d
    None -> dict.new()
  }
  let merged =
    list.fold(extra, existing, fn(acc, pair) {
      dict.insert(acc, pair.0, pair.1)
    })
  action.with_payload(act, merged)
}

/// Renders a `Button` primitive.
pub fn render_button(
  base_attrs: List(Attribute(Action)),
  label: String,
  btn_action: Action,
  variant: Option(ButtonVariant),
  size: Option(SizeToken),
  icon: Option(String),
  icon_position: Option(IconPosition),
  disabled: Option(Bool),
  loading: Option(Bool),
) -> Element(Action) {
  let vr = option.unwrap(variant, ButtonPrimary)
  let vr_str = codec.button_variant_to_string(vr)

  let sz = option.unwrap(size, SizeMd)
  let sz_str = style.size_to_string(sz)

  let is_loading = option.unwrap(loading, False)
  let is_disabled = option.unwrap(disabled, False) || is_loading

  let loading_class = case is_loading {
    True -> " omni-button-loading"
    False -> ""
  }

  let class_attr =
    attribute.class(
      "omni-button omni-button-"
      <> vr_str
      <> " omni-button-"
      <> sz_str
      <> loading_class,
    )

  let icon_size = case sz {
    SizeSm -> 14
    _ -> 16
  }

  let pos = option.unwrap(icon_position, IconLeft)

  let loading_el = case is_loading {
    True -> [html.span([attribute.class("omni-spinner")], [])]
    False -> []
  }

  let left_icon_el = case icon, pos {
    Some(ic), IconLeft -> [icons.render_icon(ic, icon_size)]
    _, _ -> []
  }

  let right_icon_el = case icon, pos {
    Some(ic), IconRight -> [icons.render_icon(ic, icon_size)]
    _, _ -> []
  }

  let label_el = [
    html.span([attribute.class("omni-button-label")], [element.text(label)]),
  ]

  let extra_attrs = [
    attribute.type_("button"),
    attribute.attribute("data-variant", vr_str),
    attribute.attribute("data-size", sz_str),
    attribute.attribute("data-action", btn_action.name),
    case icon {
      Some(ic) -> attribute.attribute("data-icon", ic)
      None -> attribute.attribute("data-icon", "")
    },
    case is_disabled {
      True -> attribute.disabled(True)
      False -> event.stop_propagation(event.on_click(btn_action))
    },
  ]

  let attrs = list.flatten([[class_attr], base_attrs, extra_attrs])
  let children =
    list.flatten([loading_el, left_icon_el, label_el, right_icon_el])

  html.button(attrs, children)
}

/// Renders an `IconButton` primitive.
pub fn render_icon_button(
  base_attrs: List(Attribute(Action)),
  icon: String,
  tooltip: Option(String),
  btn_action: Action,
  variant: Option(IconButtonVariant),
  size: Option(SizeToken),
  disabled: Option(Bool),
) -> Element(Action) {
  let vr = option.unwrap(variant, IconButtonGhost)
  let vr_str = codec.icon_button_variant_to_string(vr)

  let sz = option.unwrap(size, SizeMd)
  let sz_str = style.size_to_string(sz)

  let is_disabled = option.unwrap(disabled, False)

  let class_attr =
    attribute.class(
      "omni-icon-button omni-icon-button-"
      <> vr_str
      <> " omni-icon-button-"
      <> sz_str,
    )

  let icon_size = case sz {
    SizeSm -> 14
    _ -> 16
  }

  let aria_label = option.unwrap(tooltip, icon)

  let extra_attrs =
    list.flatten([
      [
        attribute.type_("button"),
        attribute.attribute("data-variant", vr_str),
        attribute.attribute("data-size", sz_str),
        attribute.attribute("data-action", btn_action.name),
        attribute.attribute("data-icon", icon),
        attribute.attribute("aria-label", aria_label),
      ],
      case tooltip {
        Some(t) -> [attribute.title(t)]
        None -> []
      },
      case is_disabled {
        True -> [attribute.disabled(True)]
        False -> [event.stop_propagation(event.on_click(btn_action))]
      },
    ])

  let attrs = list.flatten([[class_attr], base_attrs, extra_attrs])
  html.button(attrs, [icons.render_icon(icon, icon_size)])
}

/// Renders an `Input` primitive wrapped in `.omni-input-wrapper`.
pub fn render_input(
  base_attrs: List(Attribute(Action)),
  name: String,
  placeholder: Option(String),
  value: Option(String),
  input_type: Option(InputType),
  accept: Option(String),
  clearable: Option(Bool),
  prefix_icon: Option(String),
  action_on_enter: Option(Action),
  action_on_change: Option(Action),
) -> Element(Action) {
  let inp_type = option.unwrap(input_type, InputText)
  let type_str = codec.input_type_to_string(inp_type)

  let clearable_class = case clearable {
    Some(True) -> " omni-input-clearable"
    _ -> ""
  }

  let prefix_class = case prefix_icon {
    Some(_) -> " omni-input-with-prefix"
    None -> ""
  }

  let wrapper_class =
    attribute.class("omni-input-wrapper" <> clearable_class <> prefix_class)

  let prefix_el = case prefix_icon {
    Some(ic) -> [
      html.span([attribute.class("omni-input-prefix-icon")], [
        icons.render_icon(ic, 16),
      ]),
    ]
    None -> []
  }

  let input_attrs =
    list.flatten([
      [
        attribute.class("omni-input"),
        attribute.type_(type_str),
        attribute.name(name),
      ],
      case placeholder {
        Some(ph) -> [attribute.placeholder(ph)]
        None -> []
      },
      case value {
        Some(v) -> [attribute.attribute("value", v)]
        None -> []
      },
      case accept {
        Some(ac) -> [attribute.accept([ac])]
        None -> []
      },
      case action_on_change {
        Some(act) -> [
          event.on_input(fn(val) {
            merge_action_payload(act, [
              #("value", dynamic.string(val)),
              #("name", dynamic.string(name)),
              #(name, dynamic.string(val)),
            ])
          }),
        ]
        None -> []
      },
      case action_on_enter {
        Some(act) -> {
          let current_val = option.unwrap(value, "")
          [
            event.on_keydown(fn(_key) {
              merge_action_payload(act, [
                #("value", dynamic.string(current_val)),
                #("name", dynamic.string(name)),
              ])
            }),
          ]
        }
        None -> []
      },
    ])

  let wrapper_attrs = list.flatten([[wrapper_class], base_attrs])
  html.div(wrapper_attrs, list.flatten([prefix_el, [html.input(input_attrs)]]))
}

/// Renders a `Textarea` multi-line input primitive.
pub fn render_textarea(
  base_attrs: List(Attribute(Action)),
  name: String,
  placeholder: Option(String),
  value: Option(String),
  rows: Option(Int),
  action_on_change: Option(Action),
) -> Element(Action) {
  let class_attr = attribute.class("omni-textarea")
  let extra_attrs =
    list.flatten([
      [attribute.name(name)],
      case placeholder {
        Some(ph) -> [attribute.placeholder(ph)]
        None -> []
      },
      case rows {
        Some(r) -> [attribute.attribute("rows", int.to_string(r))]
        None -> []
      },
      case action_on_change {
        Some(act) -> [
          event.on_input(fn(val) {
            merge_action_payload(act, [
              #("value", dynamic.string(val)),
              #("name", dynamic.string(name)),
              #(name, dynamic.string(val)),
            ])
          }),
        ]
        None -> []
      },
    ])

  let attrs = list.flatten([[class_attr], base_attrs, extra_attrs])
  html.textarea(attrs, option.unwrap(value, ""))
}

/// Renders a `Toggle` switch primitive.
pub fn render_toggle(
  base_attrs: List(Attribute(Action)),
  name: String,
  label: Option(String),
  checked: Bool,
  toggle_action: Action,
  disabled: Option(Bool),
) -> Element(Action) {
  let is_disabled = option.unwrap(disabled, False)
  let checked_class = case checked {
    True -> " omni-toggle-checked"
    False -> ""
  }
  let disabled_class = case is_disabled {
    True -> " omni-toggle-disabled"
    False -> ""
  }

  let class_attr =
    attribute.class("omni-toggle" <> checked_class <> disabled_class)

  let next_checked = !checked
  let dispatched_action =
    merge_action_payload(toggle_action, [
      #("checked", dynamic.bool(next_checked)),
      #("name", dynamic.string(name)),
      #(name, dynamic.bool(next_checked)),
    ])

  let checkbox_attrs =
    list.flatten([
      [
        attribute.class("omni-toggle-checkbox"),
        attribute.type_("checkbox"),
        attribute.name(name),
      ],
      case checked {
        True -> [attribute.attribute("checked", "")]
        False -> []
      },
      case is_disabled {
        True -> [attribute.disabled(True)]
        False -> [
          event.on_check(fn(new_chk) {
            merge_action_payload(toggle_action, [
              #("checked", dynamic.bool(new_chk)),
              #("name", dynamic.string(name)),
              #(name, dynamic.bool(new_chk)),
            ])
          }),
        ]
      },
    ])

  let track_el =
    html.span([attribute.class("omni-toggle-track")], [
      html.span([attribute.class("omni-toggle-thumb")], []),
    ])

  let label_el = case label {
    Some(lbl) -> [
      html.span([attribute.class("omni-toggle-label")], [element.text(lbl)]),
    ]
    None -> []
  }

  let click_attr = case is_disabled {
    True -> []
    False -> [event.stop_propagation(event.on_click(dispatched_action))]
  }

  let attrs = list.flatten([[class_attr], base_attrs, click_attr])
  html.label(
    attrs,
    list.flatten([[html.input(checkbox_attrs), track_el], label_el]),
  )
}

/// Renders a `Select` dropdown primitive.
pub fn render_select(
  base_attrs: List(Attribute(Action)),
  name: String,
  value: Option(String),
  options: List(SelectOption),
  select_action: Option(Action),
) -> Element(Action) {
  let class_attr = attribute.class("omni-select")
  let extra_attrs =
    list.flatten([
      [attribute.name(name)],
      case select_action {
        Some(act) -> [
          event.on_change(fn(val) {
            merge_action_payload(act, [
              #("value", dynamic.string(val)),
              #("name", dynamic.string(name)),
              #(name, dynamic.string(val)),
            ])
          }),
        ]
        None -> []
      },
    ])

  let option_els =
    list.map(options, fn(opt) {
      let is_selected = case value {
        Some(v) -> v == opt.value
        None -> False
      }
      let opt_attrs =
        list.flatten([
          [attribute.value(opt.value)],
          case is_selected {
            True -> [attribute.attribute("selected", "")]
            False -> []
          },
        ])
      html.option(opt_attrs, opt.label)
    })

  let attrs = list.flatten([[class_attr], base_attrs, extra_attrs])
  html.select(attrs, option_els)
}

/// Renders a `Tabs` navigation bar primitive.
pub fn render_tabs(
  base_attrs: List(Attribute(Action)),
  tabs: List(TabItem),
  active_tab: String,
  tab_action: Action,
) -> Element(Action) {
  let class_attr = attribute.class("omni-tabs omni-tabs-nav")
  let role_attr = attribute.role("tablist")

  let tab_buttons =
    list.map(tabs, fn(tab) {
      let is_active = tab.id == active_tab
      let active_class = case is_active {
        True -> " active"
        False -> ""
      }
      let btn_action =
        merge_action_payload(tab_action, [
          #("tab", dynamic.string(tab.id)),
          #("id", dynamic.string(tab.id)),
          #("tabId", dynamic.string(tab.id)),
          #("value", dynamic.string(tab.id)),
        ])

      let icon_el = case tab.icon {
        Some(ic) -> [
          html.span([attribute.class("omni-tab-icon")], [
            icons.render_icon(ic, 16),
          ]),
        ]
        None -> []
      }

      let label_el = [
        html.span([attribute.class("omni-tab-label")], [
          element.text(tab.label),
        ]),
      ]

      let badge_el = case tab.badge {
        Some(b) -> [
          html.span([attribute.class("omni-tab-badge")], [element.text(b)]),
        ]
        None -> []
      }

      html.button(
        [
          attribute.type_("button"),
          attribute.class("omni-tab-btn" <> active_class),
          attribute.role("tab"),
          attribute.attribute("aria-selected", case is_active {
            True -> "true"
            False -> "false"
          }),
          attribute.attribute("data-tab-id", tab.id),
          event.stop_propagation(event.on_click(btn_action)),
        ],
        list.flatten([icon_el, label_el, badge_el]),
      )
    })

  let attrs = list.flatten([[class_attr, role_attr], base_attrs])
  html.div(attrs, tab_buttons)
}
