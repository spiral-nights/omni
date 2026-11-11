//// Companion viewport slots a user can assign a plugin to.
////
//// "Full-page app" is deliberately not a variant: every installed plugin is
//// an application by default; viewports are only companion surfaces.

/// Where a companion surface is placed in the shell.
pub type Viewport {
  Main
  Dock
  Sidebar
  HeaderActions
}

/// Parse the wire/storage name of a viewport.
pub fn parse(name: String) -> Result(Viewport, Nil) {
  case name {
    "main" -> Ok(Main)
    "dock" -> Ok(Dock)
    "sidebar" -> Ok(Sidebar)
    "header-actions" -> Ok(HeaderActions)
    _ -> Error(Nil)
  }
}

/// The wire/storage name of a viewport.
pub fn to_string(viewport: Viewport) -> String {
  case viewport {
    Main -> "main"
    Dock -> "dock"
    Sidebar -> "sidebar"
    HeaderActions -> "header-actions"
  }
}
