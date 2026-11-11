import gleam/dict
import gleam/option.{None, Some}
import gleeunit/should
import omni/kernel/navigation/router

pub fn router_parse_query_basic_test() {
  let params = router.parse_query("?view=settings")
  dict.get(params, "view") |> should.equal(Ok("settings"))
  dict.size(params) |> should.equal(1)
}

pub fn router_parse_query_multiple_params_test() {
  let params = router.parse_query("?view=widget&theme=dark&count=42")
  dict.get(params, "view") |> should.equal(Ok("widget"))
  dict.get(params, "theme") |> should.equal(Ok("dark"))
  dict.get(params, "count") |> should.equal(Ok("42"))
  dict.size(params) |> should.equal(3)
}

pub fn router_parse_query_with_fragment_and_url_test() {
  let params =
    router.parse_query(
      "https://example.com/app/index.html?view=search&q=nostr#section1",
    )
  dict.get(params, "view") |> should.equal(Ok("search"))
  dict.get(params, "q") |> should.equal(Ok("nostr"))
  dict.size(params) |> should.equal(2)
}

pub fn router_percent_decode_test() {
  let params = router.parse_query("?view=my%20view&tag=%23nostr")
  dict.get(params, "view") |> should.equal(Ok("my view"))
  dict.get(params, "tag") |> should.equal(Ok("#nostr"))
}

pub fn router_get_param_and_view_test() {
  router.get_view("?view=settings") |> should.equal(Some("settings"))
  router.get_view("?view=widget") |> should.equal(Some("widget"))
  router.get_view("?view=search&filter=all") |> should.equal(Some("search"))
  router.get_view("?other=val") |> should.equal(None)
  router.get_view("") |> should.equal(None)

  router.get_param("?foo=bar", "foo") |> should.equal(Some("bar"))
  router.get_param("?foo=bar", "baz") |> should.equal(None)
}

pub fn router_parse_route_test() {
  let route = router.parse_route("/index.html?view=settings&theme=dark#profile")
  route.path |> should.equal("/index.html")
  route.view |> should.equal(Some("settings"))
  route.fragment |> should.equal(Some("profile"))
  dict.get(route.params, "theme") |> should.equal(Ok("dark"))
}

pub fn router_set_and_remove_view_test() {
  let base = "/index.html?theme=dark"
  let with_view = router.set_view(base, "widget")
  router.get_view(with_view) |> should.equal(Some("widget"))

  let updated_view = router.set_view(with_view, "settings")
  router.get_view(updated_view) |> should.equal(Some("settings"))

  let without_view = router.remove_view(updated_view)
  router.get_view(without_view) |> should.equal(None)
  router.get_param(without_view, "theme") |> should.equal(Some("dark"))
}
