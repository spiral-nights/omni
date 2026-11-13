//// Transient shell notifications rendered above the active layout.

import gleam/int as integer
import gleam/list
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import lustre/event
import omni/shell/model.{type Model, type Toast, ToastError, ToastSuccess}
import omni/shell/msg.{type Msg, DismissToast}
import omni/ui/icons

/// Render the current toast stack, newest first.
pub fn render_toasts(model: Model) -> Element(Msg) {
  html.div(
    [
      attribute.class("omni-toast-stack"),
      attribute.attribute("aria-live", "polite"),
    ],
    list.map(model.toasts, render_toast),
  )
}

fn render_toast(toast: Toast) -> Element(Msg) {
  let tone_class = case toast.tone {
    ToastSuccess -> "success"
    ToastError -> "error"
    _ -> "info"
  }
  let icon_name = case toast.tone {
    ToastSuccess -> "check-circle"
    ToastError -> "x"
    _ -> "bell"
  }
  html.div(
    [
      attribute.class("omni-toast " <> tone_class),
      attribute.attribute("role", "status"),
      attribute.attribute("data-toast-id", int_to_string(toast.id)),
    ],
    [
      icons.render_icon(icon_name, 16),
      html.span([attribute.class("omni-toast-message")], [
        element.text(toast.message),
      ]),
      html.button(
        [
          attribute.type_("button"),
          attribute.id("btn-dismiss-toast-" <> int_to_string(toast.id)),
          attribute.class("omni-toast-close"),
          attribute.title("Dismiss"),
          event.on_click(DismissToast(toast.id)),
        ],
        [icons.render_icon("close", 14)],
      ),
    ],
  )
}

fn int_to_string(value: Int) -> String {
  integer.to_string(value)
}
