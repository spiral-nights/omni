//// Typography, Media & Data Display Schema Primitives Renderer
//// (`Text`, `Badge`, `Metric`, `Icon`, `Avatar`, `CodeBlock`).
////
//// Renders text and display primitives into standard Lustre HTML elements
//// with `.omni-*` CSS classes and strict URL sanitization.

import gleam/float
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import lustre/attribute.{type Attribute}
import lustre/element.{type Element}
import lustre/element/html
import lustre/event
import omni/protocol/schema/action.{type Action}
import omni/protocol/schema/codec
import omni/protocol/schema/node.{
  type BadgeTone, type BadgeVariant, type MetricTrend, type MetricValue,
  type TextTone, type TextVariant, BadgeNeutral, BadgeSubtle, Body, MetricFloat,
  MetricInt, MetricString, TonePrimary,
}
import omni/protocol/schema/style.{type SizeToken, SizeMd}
import omni/ui/avatar as generated_avatar
import omni/ui/icons
import omni/ui/sanitize

/// Renders a `Text` typography primitive.
pub fn render_text(
  base_attrs: List(Attribute(Action)),
  content: String,
  variant: Option(TextVariant),
  tone: Option(TextTone),
  truncate: Option(Bool),
  action: Option(Action),
  show_inline_images: Option(Bool),
) -> Element(Action) {
  let vr = option.unwrap(variant, Body)
  let vr_str = codec.text_variant_to_string(vr)

  let tn = option.unwrap(tone, TonePrimary)
  let tn_str = codec.text_tone_to_string(tn)

  let trunc_class = case truncate {
    Some(True) -> " omni-text-truncate"
    _ -> ""
  }

  let interactive_class = case action {
    Some(_) -> " omni-text-interactive"
    None -> ""
  }

  let class_attr =
    attribute.class(
      "omni-text omni-text-"
      <> vr_str
      <> " omni-tone-"
      <> tn_str
      <> trunc_class
      <> interactive_class,
    )

  let extra_attrs =
    list.flatten([
      [
        attribute.attribute("data-variant", vr_str),
        attribute.attribute("data-tone", tn_str),
      ],
      case truncate {
        Some(True) -> [attribute.attribute("data-truncate", "true")]
        _ -> []
      },
      case show_inline_images {
        Some(True) -> [attribute.attribute("data-inline-images", "true")]
        Some(False) -> [attribute.attribute("data-inline-images", "false")]
        None -> []
      },
      case action {
        Some(act) -> [event.stop_propagation(event.on_click(act))]
        None -> []
      },
    ])

  let attrs = list.flatten([[class_attr], base_attrs, extra_attrs])
  html.div(attrs, [element.text(content)])
}

/// Renders a `Badge` status pill primitive.
pub fn render_badge(
  base_attrs: List(Attribute(Action)),
  label: String,
  tone: Option(BadgeTone),
  variant: Option(BadgeVariant),
  dot: Option(Bool),
) -> Element(Action) {
  let tn = option.unwrap(tone, BadgeNeutral)
  let tn_str = codec.badge_tone_to_string(tn)

  let vr = option.unwrap(variant, BadgeSubtle)
  let vr_str = codec.badge_variant_to_string(vr)

  let class_attr =
    attribute.class(
      "omni-badge omni-badge-" <> tn_str <> " omni-badge-" <> vr_str,
    )

  let data_attrs = [
    attribute.attribute("data-tone", tn_str),
    attribute.attribute("data-variant", vr_str),
  ]

  let dot_el = case dot {
    Some(True) -> [html.span([attribute.class("omni-badge-dot")], [])]
    _ -> []
  }

  let label_el = [
    html.span([attribute.class("omni-badge-label")], [element.text(label)]),
  ]

  let attrs = list.flatten([[class_attr], base_attrs, data_attrs])
  html.span(attrs, list.flatten([dot_el, label_el]))
}

/// Renders a `Metric` key-value display primitive.
pub fn render_metric(
  base_attrs: List(Attribute(Action)),
  label: String,
  value: MetricValue,
  subtext: Option(String),
  trend: Option(MetricTrend),
) -> Element(Action) {
  let trend_class = case trend {
    Some(tr) -> " omni-metric-trend-" <> codec.trend_to_string(tr)
    None -> ""
  }

  let class_attr = attribute.class("omni-metric" <> trend_class)

  let trend_attr = case trend {
    Some(tr) -> [
      attribute.attribute("data-trend", codec.trend_to_string(tr)),
    ]
    None -> []
  }

  let val_str = case value {
    MetricInt(i) -> int.to_string(i)
    MetricFloat(f) -> float.to_string(f)
    MetricString(s) -> s
  }

  let label_el =
    html.span([attribute.class("omni-metric-label")], [element.text(label)])

  let value_el =
    html.span([attribute.class("omni-metric-value")], [element.text(val_str)])

  let subtext_el = case subtext {
    Some(st) -> [
      html.span([attribute.class("omni-metric-subtext")], [element.text(st)]),
    ]
    None -> []
  }

  let trend_el = case trend {
    Some(tr) -> {
      let tr_str = codec.trend_to_string(tr)
      [
        html.span(
          [
            attribute.class("omni-metric-trend omni-metric-trend-" <> tr_str),
          ],
          [element.text(tr_str)],
        ),
      ]
    }
    None -> []
  }

  let attrs = list.flatten([[class_attr], base_attrs, trend_attr])
  html.div(attrs, list.flatten([[label_el, value_el], subtext_el, trend_el]))
}

/// Renders an `Icon` primitive wrapping `omni/ui/icons.render_icon`.
pub fn render_icon_node(
  base_attrs: List(Attribute(Action)),
  name: String,
  size: Option(Int),
) -> Element(Action) {
  let sz = option.unwrap(size, 16)
  let svg_el = icons.render_icon(name, sz)
  case base_attrs {
    [] -> svg_el
    _ ->
      html.span(
        list.flatten([
          [attribute.class("omni-icon-wrapper")],
          base_attrs,
        ]),
        [svg_el],
      )
  }
}

/// Renders an `Avatar` primitive with URL sanitization and fallback initials.
pub fn render_avatar(
  base_attrs: List(Attribute(Action)),
  src: Option(String),
  pubkey: Option(String),
  name: Option(String),
  size: Option(SizeToken),
  action: Option(Action),
) -> Element(Action) {
  let sz = option.unwrap(size, SizeMd)
  let sz_str = style.size_to_string(sz)

  let interactive_class = case action {
    Some(_) -> " omni-avatar-interactive"
    None -> ""
  }

  let class_attr =
    attribute.class("omni-avatar omni-avatar-" <> sz_str <> interactive_class)

  let extra_attrs =
    list.flatten([
      [attribute.attribute("data-size", sz_str)],
      case pubkey {
        Some(pk) -> [attribute.attribute("data-pubkey", pk)]
        None -> []
      },
      case action {
        Some(act) -> [event.stop_propagation(event.on_click(act))]
        None -> []
      },
    ])

  let safe_src = case src {
    Some(raw) -> sanitize.sanitize_url(raw)
    None -> None
  }

  let alt_text = case name {
    Some(n) -> n
    None ->
      case pubkey {
        Some(pk) -> string.slice(pk, 0, 8)
        None -> "Avatar"
      }
  }

  let inner = case safe_src {
    Some(url) -> [
      html.img([
        attribute.class("omni-avatar-img"),
        attribute.src(url),
        attribute.alt(alt_text),
      ]),
    ]
    None -> {
      let initials = derive_initials(name, pubkey)
      let seed_key = case pubkey {
        Some(pk) -> pk
        None ->
          case name {
            Some(n) -> n
            None -> "?"
          }
      }
      [generated_avatar.render(seed_key, initials)]
    }
  }

  let attrs = list.flatten([[class_attr], base_attrs, extra_attrs])
  html.div(attrs, inner)
}

fn derive_initials(name: Option(String), pubkey: Option(String)) -> String {
  case name {
    Some(n) -> {
      let trimmed = string.trim(n)
      case trimmed {
        "" -> derive_pubkey_initials(pubkey)
        _ -> string.uppercase(string.slice(trimmed, 0, 1))
      }
    }
    None -> derive_pubkey_initials(pubkey)
  }
}

fn derive_pubkey_initials(pubkey: Option(String)) -> String {
  case pubkey {
    Some(pk) -> {
      let trimmed = string.trim(pk)
      case trimmed {
        "" -> "?"
        _ -> string.uppercase(string.slice(trimmed, 0, 2))
      }
    }
    None -> "?"
  }
}

/// Renders a `CodeBlock` primitive.
pub fn render_code_block(
  base_attrs: List(Attribute(Action)),
  code: String,
  language: Option(String),
  copyable: Option(Bool),
) -> Element(Action) {
  let lang_str = option.unwrap(language, "text")
  let class_attr = attribute.class("omni-code-block")
  let data_attrs = [
    attribute.attribute("data-language", lang_str),
    case copyable {
      Some(False) -> attribute.attribute("data-copyable", "false")
      _ -> attribute.attribute("data-copyable", "true")
    },
  ]

  let code_el =
    html.pre([attribute.class("omni-code-pre")], [
      html.code([attribute.class("omni-code")], [element.text(code)]),
    ])

  let attrs = list.flatten([[class_attr], base_attrs, data_attrs])
  html.div(attrs, [code_el])
}
