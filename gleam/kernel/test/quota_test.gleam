import gleeunit/should
import omni/kernel/rpc/quota
import omni/platform/storage
import omni/protocol/plugin_id

pub fn quota_allows_writes_under_limit_test() {
  let store = storage.in_memory()
  let tracker = quota.new(store, 100)
  let assert Ok(pid) = plugin_id.parse("org.omni.test")

  quota.check_quota(tracker, pid, 50)
  |> should.be_true

  quota.check_quota(tracker, pid, 100)
  |> should.be_true

  quota.check_quota(tracker, pid, 101)
  |> should.be_false
}

pub fn quota_tracks_existing_usage_test() {
  let store = storage.in_memory()
  let assert Ok(pid) = plugin_id.parse("org.omni.test")

  let _ = storage.set(store, "org.omni.test::key1", "12345")
  let _ = storage.set(store, "org.omni.test::key2", "67890")

  let tracker = quota.new(store, 20)

  quota.get_usage(tracker, pid)
  |> should.equal(10)

  // 10 existing + 5 = 15 <= 20
  quota.check_quota(tracker, pid, 5)
  |> should.be_true

  // 10 existing + 10 = 20 <= 20
  quota.check_quota(tracker, pid, 10)
  |> should.be_true

  // 10 existing + 11 = 21 > 20
  quota.check_quota(tracker, pid, 11)
  |> should.be_false
}

pub fn quota_per_plugin_isolation_test() {
  let store = storage.in_memory()
  let assert Ok(pid1) = plugin_id.parse("org.omni.test1")
  let assert Ok(pid2) = plugin_id.parse("org.omni.test2")

  let _ = storage.set(store, "org.omni.test1::heavy", "12345678901234567890")
  let tracker = quota.new(store, 30)

  quota.get_usage(tracker, pid1)
  |> should.equal(20)

  // pid2 usage is 0
  quota.get_usage(tracker, pid2)
  |> should.equal(0)

  quota.check_quota(tracker, pid2, 25)
  |> should.be_true
}

pub fn quota_scoped_key_and_prefix_test() {
  let assert Ok(pid) = plugin_id.parse("org.omni.feed")

  quota.plugin_prefix(pid)
  |> should.equal("org.omni.feed::")

  quota.scoped_key(pid, "draft_note")
  |> should.equal("org.omni.feed::draft_note")
}
