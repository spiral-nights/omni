//// Status, Progress, Alerts & Empty State Schema Primitives Renderer
//// (`StatusIndicator`, `Progress`, `Banner`, `EmptyState`).
////
//// Renders feedback and status primitives into standard Lustre HTML and SVG
//// elements with `.omni-*` CSS classes.

import gleam/float
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import lustre/attribute.{type Attribute}
import lustre/element.{type Element}
import lustre/element/html
import lustre/element/svg
import lustre/event
import omni/protocol/schema/action.{type Action}
import omni/protocol/schema/codec
import omni/protocol/schema/node.{
  type BannerTone, type IndicatorStatus, type ProgressVariant, BannerError,
  BannerInfo, BannerSuccess, BannerWarning, ProgressBar, ProgressDisk,
  ProgressRing, ProgressSpinner,
}
import omni/ui/icons

/// Renders a `StatusIndicator` dot + label primitive.
pub fn render_status_indicator(
  base_attrs: List(Attribute(Action)),
  status: IndicatorStatus,
  label: Option(String),
  pulse: Option(Bool),
) -> Element(Action) {
  let st_str = codec.indicator_status_to_string(status)
  let class_attr =
    attribute.class("omni-status-indicator omni-status-" <> st_str)

  let pulse_class = case pulse {
    Some(True) -> " omni-status-pulse"
    _ -> ""
  }

  let dot_el =
    html.span(
      [
        attribute.class("omni-status-dot omni-status-" <> st_str <> pulse_class),
      ],
      [],
    )

  let label_el = case label {
    Some(lbl) -> [
      html.span([attribute.class("omni-status-label")], [element.text(lbl)]),
    ]
    None -> []
  }

  let attrs =
    list.flatten([
      [class_attr, attribute.attribute("data-status", st_str)],
      base_attrs,
    ])
  html.div(attrs, [dot_el, ..label_el])
}

/// Renders a `Progress` bar, spinner, disk, or ring primitive.
pub fn render_progress(
  base_attrs: List(Attribute(Action)),
  value: Float,
  max: Option(Float),
  label: Option(String),
  variant: Option(ProgressVariant),
  size: Option(Int),
  color: Option(String),
  show_ticks: Option(Bool),
  action: Option(Action),
) -> Element(Action) {
  let vr = option.unwrap(variant, ProgressBar)
  let vr_str = codec.progress_variant_to_string(vr)

  let max_val = case max {
    Some(m) if m >. 0.0 -> m
    _ -> 100.0
  }

  let clamped = float.clamp(value, min: 0.0, max: max_val)
  let ratio = clamped /. max_val
  let pct_int = float.round(ratio *. 100.0)
  let pct_str = int.to_string(pct_int)

  let interactive_class = case action {
    Some(_) -> " omni-progress-interactive"
    None -> ""
  }

  let class_attr =
    attribute.class(
      "omni-progress omni-progress-" <> vr_str <> interactive_class,
    )

  let extra_attrs =
    list.flatten([
      [
        attribute.attribute("data-variant", vr_str),
        attribute.attribute("data-value", float.to_string(clamped)),
        attribute.attribute("data-max", float.to_string(max_val)),
      ],
      case action {
        Some(act) -> [event.stop_propagation(event.on_click(act))]
        None -> []
      },
    ])

  let inner = case vr {
    ProgressBar -> {
      let label_el = case label {
        Some(lbl) -> [
          html.div([attribute.class("omni-progress-label")], [
            element.text(lbl <> " (" <> pct_str <> "%)"),
          ]),
        ]
        None -> []
      }
      let fill_attrs =
        list.flatten([
          [
            attribute.class("omni-progress-fill"),
            attribute.style("width", pct_str <> "%"),
          ],
          case color {
            Some(c) -> [attribute.style("background", c)]
            None -> []
          },
        ])
      let track_el =
        html.div([attribute.class("omni-progress-track")], [
          html.div(fill_attrs, []),
        ])
      list.flatten([label_el, [track_el]])
    }

    ProgressSpinner -> {
      let sz = option.unwrap(size, 24)
      let spinner_el = icons.render_icon("spinner", sz)
      let label_el = case label {
        Some(lbl) -> [
          html.span([attribute.class("omni-progress-label")], [
            element.text(lbl),
          ]),
        ]
        None -> []
      }
      [spinner_el, ..label_el]
    }

    ProgressDisk | ProgressRing -> {
      let sz = option.unwrap(size, 120)
      let sz_str = int.to_string(sz)
      let stroke_color =
        option.unwrap(color, "var(--omni-accent-primary, #d4a373)")
      // Circumference for r=40 is ~251.33
      let circumference = 251.33
      let dash = float.to_string(ratio *. circumference)
      let circ_str = float.to_string(circumference)

      let ticks_attr = case show_ticks {
        Some(False) -> "false"
        _ -> "true"
      }

      let svg_children =
        list.flatten([
          [
            svg.circle([
              attribute.attribute("cx", "50"),
              attribute.attribute("cy", "50"),
              attribute.attribute("r", "40"),
              attribute.attribute("fill", "none"),
              attribute.attribute("stroke", "var(--omni-bg-elevated, #22201d)"),
              attribute.attribute("stroke-width", "7"),
            ]),
            svg.circle([
              attribute.attribute("cx", "50"),
              attribute.attribute("cy", "50"),
              attribute.attribute("r", "40"),
              attribute.attribute("fill", "none"),
              attribute.attribute("stroke", stroke_color),
              attribute.attribute("stroke-width", "7"),
              attribute.attribute("stroke-dasharray", dash <> " " <> circ_str),
              attribute.attribute("stroke-linecap", "round"),
              attribute.attribute("transform", "rotate(-90 50 50)"),
            ]),
          ],
          case label {
            Some(lbl) -> [
              svg.text(
                [
                  attribute.attribute("x", "50"),
                  attribute.attribute("y", "53"),
                  attribute.attribute("text-anchor", "middle"),
                  attribute.attribute("class", "omni-progress-svg-label"),
                ],
                lbl,
              ),
            ]
            None -> []
          },
        ])

      [
        svg.svg(
          [
            attribute.attribute("viewBox", "0 0 100 100"),
            attribute.attribute("width", sz_str),
            attribute.attribute("height", sz_str),
            attribute.class("omni-progress-circular"),
            attribute.attribute("data-ticks", ticks_attr),
          ],
          svg_children,
        ),
      ]
    }
  }

  let attrs = list.flatten([[class_attr], base_attrs, extra_attrs])
  html.div(attrs, inner)
}

/// Renders a `Banner` alert callout primitive.
pub fn render_banner(
  base_attrs: List(Attribute(Action)),
  tone: Option(BannerTone),
  title: Option(String),
  message: String,
  icon: Option(String),
  action: Option(Action),
  action_label: Option(String),
  dismissible: Option(Bool),
  on_dismiss_action: Option(Action),
) -> Element(Action) {
  let tn = option.unwrap(tone, BannerInfo)
  let tn_str = codec.banner_tone_to_string(tn)

  let default_icon = case tn {
    BannerError | BannerWarning -> "close"
    BannerSuccess -> "check-circle"
    BannerInfo -> "bell"
  }
  let icon_name = option.unwrap(icon, default_icon)

  let class_attr = attribute.class("omni-banner omni-banner-" <> tn_str)

  let icon_el =
    html.div([attribute.class("omni-banner-icon")], [
      icons.render_icon(icon_name, 18),
    ])

  let title_el = case title {
    Some(t) -> [
      html.div([attribute.class("omni-banner-title")], [element.text(t)]),
    ]
    None -> []
  }

  let msg_el = [
    html.div([attribute.class("omni-banner-message")], [
      element.text(message),
    ]),
  ]

  let content_el =
    html.div(
      [attribute.class("omni-banner-content")],
      list.flatten([title_el, msg_el]),
    )

  let action_btn_el = case action, action_label {
    Some(act), Some(lbl) -> [
      html.button(
        [
          attribute.type_("button"),
          attribute.class("omni-banner-action-btn"),
          event.stop_propagation(event.on_click(act)),
        ],
        [element.text(lbl)],
      ),
    ]
    _, _ -> []
  }

  let dismiss_btn_el = case dismissible {
    Some(True) -> {
      let click_attr = case on_dismiss_action {
        Some(act) -> [event.stop_propagation(event.on_click(act))]
        None -> []
      }
      [
        html.button(
          list.flatten([
            [
              attribute.type_("button"),
              attribute.class("omni-banner-dismiss-btn"),
              attribute.title("Dismiss"),
              attribute.attribute("aria-label", "Dismiss"),
            ],
            click_attr,
          ]),
          [icons.render_icon("close", 14)],
        ),
      ]
    }
    _ -> []
  }

  let attrs =
    list.flatten([
      [
        class_attr,
        attribute.role("alert"),
        attribute.attribute("data-tone", tn_str),
      ],
      base_attrs,
    ])

  html.div(
    attrs,
    list.flatten([[icon_el, content_el], action_btn_el, dismiss_btn_el]),
  )
}

/// Renders an `EmptyState` placeholder primitive.
pub fn render_empty_state(
  base_attrs: List(Attribute(Action)),
  icon: Option(String),
  title: String,
  description: Option(String),
  action: Option(Action),
  action_label: Option(String),
) -> Element(Action) {
  let class_attr = attribute.class("omni-empty-state")

  let icon_el = case icon {
    Some(ic) -> [
      html.div([attribute.class("omni-empty-state-icon")], [
        icons.render_icon(ic, 32),
      ]),
    ]
    None -> []
  }

  let title_el = [
    html.h4([attribute.class("omni-empty-state-title")], [
      element.text(title),
    ]),
  ]

  let desc_el = case description {
    Some(d) -> [
      html.p([attribute.class("omni-empty-state-description")], [
        element.text(d),
      ]),
    ]
    None -> []
  }

  let action_el = case action, action_label {
    Some(act), Some(lbl) -> [
      html.button(
        [
          attribute.type_("button"),
          attribute.class(
            "omni-button omni-button-secondary omni-button-md omni-empty-state-action",
          ),
          event.stop_propagation(event.on_click(act)),
        ],
        [
          html.span([attribute.class("omni-button-label")], [
            element.text(lbl),
          ]),
        ],
      ),
    ]
    _, _ -> []
  }

  let attrs = list.flatten([[class_attr], base_attrs])
  html.div(attrs, list.flatten([icon_el, title_el, desc_el, action_el]))
}
