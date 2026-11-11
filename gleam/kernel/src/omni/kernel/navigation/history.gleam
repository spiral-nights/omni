//// Pure page and view history stack model.
////
//// Tracks navigation history with push, pop, replace, and back navigation capabilities.

import gleam/list

/// Pure page/view navigation stack.
pub type PageStack {
  PageStack(pages: List(String), current: String)
}

/// Initialize a navigation stack with an initial root page.
pub fn new(root: String) -> PageStack {
  PageStack(pages: [], current: root)
}

/// Return the active page/view.
pub fn current(stack: PageStack) -> String {
  stack.current
}

/// Check whether back navigation is possible (stack contains previous pages).
pub fn can_go_back(stack: PageStack) -> Bool {
  case stack.pages {
    [] -> False
    _ -> True
  }
}

/// Push a new page onto the navigation stack.
/// The previous `current` page is prepended to `pages`.
pub fn push(stack: PageStack, page: String) -> PageStack {
  PageStack(pages: [stack.current, ..stack.pages], current: page)
}

/// Pop the top page and return to the previous page in history.
/// Returns `Error(Nil)` if the stack cannot go back.
pub fn pop(stack: PageStack) -> Result(PageStack, Nil) {
  case stack.pages {
    [prev, ..rest] -> Ok(PageStack(pages: rest, current: prev))
    [] -> Error(Nil)
  }
}

/// Pop the top page and return both the departed page and the updated stack.
pub fn pop_with_previous(
  stack: PageStack,
) -> Result(#(String, PageStack), Nil) {
  case stack.pages {
    [prev, ..rest] ->
      Ok(#(stack.current, PageStack(pages: rest, current: prev)))
    [] -> Error(Nil)
  }
}

/// Replace the current page without adding an entry to the history stack.
pub fn replace(stack: PageStack, page: String) -> PageStack {
  PageStack(..stack, current: page)
}

/// Return total navigation depth (previous pages + 1 current).
pub fn depth(stack: PageStack) -> Int {
  1 + list.length(stack.pages)
}

/// Return full linear history from initial root page to current page.
pub fn to_list(stack: PageStack) -> List(String) {
  list.append(list.reverse(stack.pages), [stack.current])
}
