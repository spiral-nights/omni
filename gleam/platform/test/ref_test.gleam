import omni/platform/ref

pub fn ref_new_and_get_test() {
  let r = ref.new(10)
  assert ref.get(r) == 10
}

pub fn ref_set_test() {
  let r = ref.new("initial")
  ref.set(r, "updated")
  assert ref.get(r) == "updated"
}

pub fn ref_update_test() {
  let r = ref.new(5)
  ref.update(r, fn(n) { n * 2 })
  assert ref.get(r) == 10
}

pub fn ref_modify_test() {
  let r = ref.new(5)
  let returned = ref.modify(r, fn(n) { n + 7 })
  assert returned == 12
  assert ref.get(r) == 12
}

pub fn ref_get_and_set_test() {
  let r = ref.new("first")
  let prev = ref.get_and_set(r, "second")
  assert prev == "first"
  assert ref.get(r) == "second"
}
