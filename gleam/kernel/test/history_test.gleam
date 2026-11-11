import gleeunit/should
import omni/kernel/navigation/history

pub fn history_new_test() {
  let stack = history.new("home")
  history.current(stack) |> should.equal("home")
  history.can_go_back(stack) |> should.be_false
  history.depth(stack) |> should.equal(1)
  history.to_list(stack) |> should.equal(["home"])
}

pub fn history_push_and_back_test() {
  let stack =
    history.new("feed")
    |> history.push("settings")
    |> history.push("profile")

  history.current(stack) |> should.equal("profile")
  history.can_go_back(stack) |> should.be_true
  history.depth(stack) |> should.equal(3)
  history.to_list(stack) |> should.equal(["feed", "settings", "profile"])

  // Pop back to settings
  let assert Ok(back1) = history.pop(stack)
  history.current(back1) |> should.equal("settings")
  history.can_go_back(back1) |> should.be_true
  history.depth(back1) |> should.equal(2)

  // Pop back to feed
  let assert Ok(back2) = history.pop(back1)
  history.current(back2) |> should.equal("feed")
  history.can_go_back(back2) |> should.be_false
  history.depth(back2) |> should.equal(1)

  // Pop from root returns Error
  history.pop(back2) |> should.be_error
}

pub fn history_pop_with_previous_test() {
  let stack =
    history.new("pageA")
    |> history.push("pageB")

  let assert Ok(#(popped, updated)) = history.pop_with_previous(stack)
  popped |> should.equal("pageB")
  history.current(updated) |> should.equal("pageA")
}

pub fn history_replace_test() {
  let stack =
    history.new("feed")
    |> history.push("settings")
    |> history.replace("help")

  history.current(stack) |> should.equal("help")
  history.depth(stack) |> should.equal(2)
  history.to_list(stack) |> should.equal(["feed", "help"])

  let assert Ok(back) = history.pop(stack)
  history.current(back) |> should.equal("feed")
}
