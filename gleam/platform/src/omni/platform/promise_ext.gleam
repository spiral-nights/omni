//// Extensions and helpers for working with `gleam_javascript/promise`.
////
//// Provides combinators for chaining, error mapping, timeouts, and
//// catching JavaScript rejections into Gleam `Result` types.

import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}
import gleam/result

/// Timeout indicator for promise operations.
pub type TimeoutError {
  Timeout
}

/// Awaits a list of promises, resolving with a list of results once all have resolved.
pub fn all(promises: List(Promise(a))) -> Promise(List(a)) {
  promise.await_list(promises)
}

/// Races a list of promises, returning the result of whichever resolves first.
pub fn race(promises: List(Promise(a))) -> Promise(a) {
  promise.race_list(promises)
}

/// Chains an asynchronous operation onto a promise containing a `Result`.
/// If the promise resolves with `Ok(val)`, `callback` is called.
/// If it resolves with `Error(err)`, it passes through without invoking `callback`.
pub fn try_await(
  promise: Promise(Result(a, e)),
  callback: fn(a) -> Promise(Result(b, e)),
) -> Promise(Result(b, e)) {
  promise.try_await(promise, callback)
}

/// Maps the `Ok` value of a promise containing a `Result` using a synchronous function.
pub fn try_map(
  promise: Promise(Result(a, e)),
  callback: fn(a) -> Result(b, e),
) -> Promise(Result(b, e)) {
  promise.map_try(promise, callback)
}

/// Maps the `Error` value of a promise containing a `Result`.
pub fn map_error(
  promise: Promise(Result(a, e1)),
  callback: fn(e1) -> e2,
) -> Promise(Result(a, e2)) {
  promise.map(promise, fn(res) { result.map_error(res, callback) })
}

/// Wraps an immediate `Result` value into an already-resolved promise.
pub fn from_result(res: Result(a, e)) -> Promise(Result(a, e)) {
  promise.resolve(res)
}

/// Creates a promise that resolves with the given value after a delay in milliseconds.
pub fn delay(ms: Int, value: a) -> Promise(a) {
  promise.wait(ms)
  |> promise.map(fn(_) { value })
}

/// Executes an async operation only if `condition` is `True`, otherwise resolves immediately with `Error(error)`.
pub fn guard(
  condition: Bool,
  error: e,
  then: fn() -> Promise(Result(a, e)),
) -> Promise(Result(a, e)) {
  case condition {
    True -> then()
    False -> promise.resolve(Error(error))
  }
}

/// Races a promise against a timeout duration in milliseconds.
/// Returns `Ok(val)` if the promise resolved before timeout, or `Error(Timeout)` if it timed out.
pub fn timeout(
  promise: Promise(a),
  ms: Int,
) -> Promise(Result(a, TimeoutError)) {
  let timer =
    promise.wait(ms)
    |> promise.map(fn(_) { Error(Timeout) })
  let main =
    promise
    |> promise.map(Ok)
  promise.race_list([main, timer])
}

/// Races a promise against a timeout duration in milliseconds, returning `default` on timeout.
pub fn timeout_with_default(
  promise: Promise(a),
  ms: Int,
  default: a,
) -> Promise(a) {
  timeout(promise, ms)
  |> promise.map(fn(res) {
    case res {
      Ok(val) -> val
      Error(Timeout) -> default
    }
  })
}

/// Catches JavaScript promise rejections and converts them into `Error(Dynamic)`.
pub fn catch_error(promise: Promise(a)) -> Promise(Result(a, Dynamic)) {
  promise
  |> promise.map(Ok)
  |> promise.rescue(fn(err) { Error(err) })
}

/// Catches JavaScript promise rejections and converts them with the provided error mapper function.
pub fn catch_error_with(
  promise: Promise(a),
  handler: fn(Dynamic) -> e,
) -> Promise(Result(a, e)) {
  promise
  |> promise.map(Ok)
  |> promise.rescue(fn(err) { Error(handler(err)) })
}
