//// Strategy type for user-swappable Omni Shell themes.
////
//// All shell themes (`panorama`, `editorial`, and custom installed shells)
//// share a single pure Elm `Model`/`Msg`/`update` loop and differ only by their
//// `Theme` descriptor and view rendering function.

import lustre/element.{type Element}
import omni/shell/model.{type Model, type ShellInfo, ShellInfo}
import omni/shell/msg.{type Msg}

/// Strategy descriptor for a swappable shell theme.
pub type Theme {
  Theme(
    id: String,
    name: String,
    description: String,
    icon: String,
    author: String,
    version: String,
    is_builtin: Bool,
    stylesheet_href: String,
    render: fn(Model) -> Element(Msg),
  )
}

/// Convert a `Theme` strategy into a display `ShellInfo` metadata record for Settings.
pub fn to_shell_info(theme: Theme) -> ShellInfo {
  ShellInfo(
    id: theme.id,
    name: theme.name,
    description: theme.description,
    icon: theme.icon,
    author: theme.author,
    version: theme.version,
    is_builtin: theme.is_builtin,
  )
}
