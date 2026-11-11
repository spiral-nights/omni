import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}
import omni/platform/promise_ext

@external(javascript, "./promise_ext_test.ffi.mjs", "reject_promise")
fn reject_promise(reason: String) -> Promise(a)

pub fn all_test() {
  use results <- promise.await(
    promise_ext.all([
      promise.resolve(1),
      promise.resolve(2),
      promise.resolve(3),
    ]),
  )
  assert results == [1, 2, 3]
  promise.resolve(Nil)
}

pub fn race_test() {
  use winner <- promise.await(
    promise_ext.race([
      promise_ext.delay(10, "slow"),
      promise.resolve("fast"),
    ]),
  )
  assert winner == "fast"
  promise.resolve(Nil)
}

pub fn try_await_ok_test() {
  use result <- promise.await(
    promise_ext.from_result(Ok(10))
    |> promise_ext.try_await(fn(n) { promise.resolve(Ok(n * 2)) }),
  )
  assert result == Ok(20)
  promise.resolve(Nil)
}

pub fn try_await_error_test() {
  use result <- promise.await(
    promise_ext.from_result(Error("fail"))
    |> promise_ext.try_await(fn(n: Int) { promise.resolve(Ok(n * 2)) }),
  )
  assert result == Error("fail")
  promise.resolve(Nil)
}

pub fn try_map_test() {
  use res1 <- promise.await(
    promise.resolve(Ok(5))
    |> promise_ext.try_map(fn(n) { Ok(n + 3) }),
  )
  assert res1 == Ok(8)

  use res2 <- promise.await(
    promise.resolve(Error("err"))
    |> promise_ext.try_map(fn(n: Int) { Ok(n + 3) }),
  )
  assert res2 == Error("err")
  promise.resolve(Nil)
}

pub fn map_error_test() {
  use res <- promise.await(
    promise.resolve(Error(404))
    |> promise_ext.map_error(fn(code) { "HTTP " <> string_from_int(code) }),
  )
  assert res == Error("HTTP 404")
  promise.resolve(Nil)
}

fn string_from_int(n: Int) -> String {
  case n {
    404 -> "404"
    _ -> "other"
  }
}

pub fn delay_test() {
  use val <- promise.await(promise_ext.delay(5, "delayed"))
  assert val == "delayed"
  promise.resolve(Nil)
}

pub fn guard_true_test() {
  use res <- promise.await(
    promise_ext.guard(True, "blocked", fn() { promise.resolve(Ok("proceeded")) }),
  )
  assert res == Ok("proceeded")
  promise.resolve(Nil)
}

pub fn guard_false_test() {
  use res <- promise.await(
    promise_ext.guard(False, "blocked", fn() {
      promise.resolve(Ok("proceeded"))
    }),
  )
  assert res == Error("blocked")
  promise.resolve(Nil)
}

pub fn timeout_success_test() {
  use res <- promise.await(promise_ext.timeout(promise.resolve("ok"), 50))
  assert res == Ok("ok")
  promise.resolve(Nil)
}

pub fn timeout_expired_test() {
  use res <- promise.await(promise_ext.timeout(promise_ext.delay(50, "slow"), 5))
  assert res == Error(promise_ext.Timeout)
  promise.resolve(Nil)
}

pub fn timeout_with_default_test() {
  use val1 <- promise.await(promise_ext.timeout_with_default(
    promise.resolve("fast"),
    50,
    "fallback",
  ))
  assert val1 == "fast"

  use val2 <- promise.await(promise_ext.timeout_with_default(
    promise_ext.delay(50, "slow"),
    5,
    "fallback",
  ))
  assert val2 == "fallback"
  promise.resolve(Nil)
}

pub fn catch_error_test() {
  use res <- promise.await(promise_ext.catch_error(reject_promise("boom")))
  case res {
    Ok(_) -> panic as "expected error"
    Error(_) -> promise.resolve(Nil)
  }
}

pub fn catch_error_with_test() {
  use res <- promise.await(
    promise_ext.catch_error_with(reject_promise("boom"), fn(_dyn: Dynamic) {
      "caught"
    }),
  )
  assert res == Error("caught")
  promise.resolve(Nil)
}
