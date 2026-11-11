import gleeunit/should
import omni/kernel/rpc/rate_limit

pub fn rate_limit_allows_requests_up_to_capacity_test() {
  let limiter = rate_limit.new(3, 1)

  // 3 requests allowed immediately
  rate_limit.check(limiter, "plugin_a", 1000)
  |> should.be_true

  rate_limit.check(limiter, "plugin_a", 1000)
  |> should.be_true

  rate_limit.check(limiter, "plugin_a", 1000)
  |> should.be_true

  // 4th request exhausted
  rate_limit.check(limiter, "plugin_a", 1000)
  |> should.be_false
}

pub fn rate_limit_refills_over_time_test() {
  // 1 token per 1000ms, capacity 2
  let limiter = rate_limit.new(2, 1)

  rate_limit.check(limiter, "plugin_a", 0)
  |> should.be_true

  rate_limit.check(limiter, "plugin_a", 0)
  |> should.be_true

  // Exhausted at 0ms
  rate_limit.check(limiter, "plugin_a", 0)
  |> should.be_false

  // At 500ms, not enough time for 1 full token
  rate_limit.check(limiter, "plugin_a", 500)
  |> should.be_false

  // At 1000ms, 1 token refilled
  rate_limit.check(limiter, "plugin_a", 1000)
  |> should.be_true

  // Exhausted again
  rate_limit.check(limiter, "plugin_a", 1000)
  |> should.be_false

  // At 2000ms, another token refilled
  rate_limit.check(limiter, "plugin_a", 2000)
  |> should.be_true
}

pub fn rate_limit_caps_at_capacity_test() {
  // Capacity 2, refill 5 per sec
  let limiter = rate_limit.new(2, 5)

  rate_limit.check(limiter, "client", 0)
  |> should.be_true
  rate_limit.check(limiter, "client", 0)
  |> should.be_true

  // Wait 10 seconds (50 refilled tokens theoretically, but capacity is 2)
  rate_limit.check(limiter, "client", 10_000)
  |> should.be_true
  rate_limit.check(limiter, "client", 10_000)
  |> should.be_true
  rate_limit.check(limiter, "client", 10_000)
  |> should.be_false
}

pub fn rate_limit_per_client_isolation_test() {
  let limiter = rate_limit.new(1, 1)

  rate_limit.check(limiter, "client_1", 0)
  |> should.be_true
  rate_limit.check(limiter, "client_1", 0)
  |> should.be_false

  // client_2 has an independent bucket
  rate_limit.check(limiter, "client_2", 0)
  |> should.be_true
  rate_limit.check(limiter, "client_2", 0)
  |> should.be_false
}

pub fn rate_limit_zero_capacity_rejects_test() {
  let limiter = rate_limit.new(0, 10)
  rate_limit.check(limiter, "client", 0)
  |> should.be_false
}
