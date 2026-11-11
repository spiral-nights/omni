import gleam/string
import gleeunit/should
import omni/sandbox/css_scoper

const scope = "[data-omni-comp-id=\"my-plugin\"]"

pub fn rewrites_roots_and_body_test() {
  let input =
    "
    :root { --accent: #ff0000; color-scheme: light; }
    body { background-color: #fdfaf7; color: #1e1b4b; min-height: 100vh; }
    html, body { height: 100%; margin: 0; }
  "
  let scoped = css_scoper.scope_css(input, scope)

  string.contains(
    scoped,
    scope <> " { --accent: #ff0000; color-scheme: light; }",
  )
  |> should.be_true
  string.contains(
    scoped,
    scope
      <> " { background-color: #fdfaf7; color: #1e1b4b; min-height: 100vh; }",
  )
  |> should.be_true
  string.contains(
    scoped,
    scope <> ", " <> scope <> " { height: 100%; margin: 0; }",
  )
  |> should.be_true

  // Verify bare body or :root is never targeted directly
  string.contains(scoped, "\n    body {") |> should.be_false
  string.contains(scoped, "\n    :root {") |> should.be_false
}

pub fn rewrites_html_body_combinators_test() {
  let input =
    "
    html body { margin: 0; }
    html > body { padding: 0; }
    html > body.dark { background: black; }
  "
  let scoped = css_scoper.scope_css(input, scope)

  string.contains(scoped, scope <> " { margin: 0; }") |> should.be_true
  string.contains(scoped, scope <> " { padding: 0; }") |> should.be_true
  string.contains(scoped, scope <> ".dark { background: black; }")
  |> should.be_true
}

pub fn prefixes_universal_and_class_selectors_test() {
  let input =
    "
    * { box-sizing: border-box; }
    .card { padding: 16px; border-radius: 8px; }
    button.btn-primary:hover { background: blue; }
    #root { display: flex; }
  "
  let scoped = css_scoper.scope_css(input, scope)

  string.contains(scoped, scope <> " * { box-sizing: border-box; }")
  |> should.be_true
  string.contains(
    scoped,
    scope <> " .card { padding: 16px; border-radius: 8px; }",
  )
  |> should.be_true
  string.contains(
    scoped,
    scope <> " button.btn-primary:hover { background: blue; }",
  )
  |> should.be_true
  string.contains(scoped, scope <> " #root { display: flex; }")
  |> should.be_true
}

pub fn preserves_media_queries_and_scopes_inner_rules_test() {
  let input =
    "
    @media (max-width: 600px) {
      .sidebar { display: none; }
      body { padding: 8px; }
    }
  "
  let scoped = css_scoper.scope_css(input, scope)

  string.contains(scoped, "@media (max-width: 600px)") |> should.be_true
  string.contains(scoped, scope <> " .sidebar { display: none; }")
  |> should.be_true
  string.contains(scoped, scope <> " { padding: 8px; }") |> should.be_true
}

pub fn preserves_keyframes_at_rules_test() {
  let input =
    "
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  "
  let scoped = css_scoper.scope_css(input, scope)
  string.contains(scoped, "@keyframes spin") |> should.be_true
  string.contains(scoped, "from { transform: rotate(0deg); }") |> should.be_true
  string.contains(scoped, "to { transform: rotate(360deg); }") |> should.be_true
}

pub fn handles_complex_comma_separated_selectors_test() {
  let input =
    "
    h1, h2, h3.title { font-weight: bold; }
    input[type=\"text\"], textarea:focus { border: 1px solid red; }
  "
  let scoped = css_scoper.scope_css(input, scope)

  string.contains(
    scoped,
    scope
      <> " h1, "
      <> scope
      <> " h2, "
      <> scope
      <> " h3.title { font-weight: bold; }",
  )
  |> should.be_true
  string.contains(
    scoped,
    scope
      <> " input[type=\"text\"], "
      <> scope
      <> " textarea:focus { border: 1px solid red; }",
  )
  |> should.be_true
}

pub fn preserves_css_comments_test() {
  let input =
    "
    /* Main container styles */
    .container { margin: auto; }
    /* End of styles */
  "
  let scoped = css_scoper.scope_css(input, scope)

  string.contains(scoped, "/* Main container styles */") |> should.be_true
  string.contains(scoped, "/* End of styles */") |> should.be_true
  string.contains(scoped, scope <> " .container { margin: auto; }")
  |> should.be_true
}

pub fn avoids_double_prefixing_already_scoped_selectors_test() {
  let input = "
    " <> scope <> " { margin: 0; }
    " <> scope <> " .inner { color: red; }
    " <> scope <> ">div { display: block; }
    " <> scope <> ":hover { opacity: 0.8; }
  "
  let scoped = css_scoper.scope_css(input, scope)

  string.contains(scoped, scope <> " " <> scope) |> should.be_false
  string.contains(scoped, scope <> " { margin: 0; }") |> should.be_true
  string.contains(scoped, scope <> " .inner { color: red; }") |> should.be_true
  string.contains(scoped, scope <> ">div { display: block; }") |> should.be_true
  string.contains(scoped, scope <> ":hover { opacity: 0.8; }") |> should.be_true
}
