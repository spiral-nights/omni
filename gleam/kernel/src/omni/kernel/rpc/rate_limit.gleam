//// Token bucket rate limiter for RPC requests.
////
//// Tracks request bursts and steady-state rates per client key using
//// a standard token bucket algorithm.

import gleam/dict.{type Dict}
import gleam/int
import omni/platform/ref.{type Ref}

/// Token bucket rate limiter tracking per-client tokens and refill timestamps.
pub type RateLimiter {
  RateLimiter(
    buckets: Ref(Dict(String, #(Int, Int))),
    capacity: Int,
    refill_rate_per_sec: Int,
  )
}

/// Creates a new `RateLimiter` with the given bucket `capacity` and `refill_rate_per_sec`.
pub fn new(capacity: Int, refill_rate_per_sec: Int) -> RateLimiter {
  RateLimiter(
    buckets: ref.new(dict.new()),
    capacity: capacity,
    refill_rate_per_sec: refill_rate_per_sec,
  )
}

/// Checks whether a request from `client_key` is permitted at timestamp `now_ms`.
///
/// Consumes 1 token from the client's bucket if available and returns `True`.
/// If the bucket is exhausted, returns `False` without consuming tokens.
pub fn check(limiter: RateLimiter, client_key: String, now_ms: Int) -> Bool {
  case limiter.capacity <= 0 {
    True -> False
    False -> {
      let buckets_map = ref.get(limiter.buckets)
      case dict.get(buckets_map, client_key) {
        Error(Nil) -> {
          // First request seen from this client: initial bucket starts full.
          // Consume 1 token immediately.
          let initial_tokens = limiter.capacity - 1
          ref.update(limiter.buckets, fn(b) {
            dict.insert(b, client_key, #(initial_tokens, now_ms))
          })
          True
        }
        Ok(#(current_tokens, last_refill_ms)) -> {
          let elapsed_ms = int.max(0, now_ms - last_refill_ms)
          let refilled = case limiter.refill_rate_per_sec > 0 {
            True -> { elapsed_ms * limiter.refill_rate_per_sec } / 1000
            False -> 0
          }
          let available_tokens =
            int.min(limiter.capacity, current_tokens + refilled)

          let next_refill_ms = case available_tokens >= limiter.capacity {
            True -> now_ms
            False ->
              case refilled > 0 {
                True ->
                  last_refill_ms
                  + { refilled * 1000 }
                  / limiter.refill_rate_per_sec
                False -> last_refill_ms
              }
          }

          case available_tokens >= 1 {
            True -> {
              ref.update(limiter.buckets, fn(b) {
                dict.insert(b, client_key, #(
                  available_tokens - 1,
                  next_refill_ms,
                ))
              })
              True
            }
            False -> {
              ref.update(limiter.buckets, fn(b) {
                dict.insert(b, client_key, #(available_tokens, next_refill_ms))
              })
              False
            }
          }
        }
      }
    }
  }
}
