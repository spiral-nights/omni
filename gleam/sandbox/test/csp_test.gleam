import gleam/string
import gleeunit/should
import omni/sandbox/csp

pub fn locked_down_csp_exact_test() {
  let expected =
    "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; connect-src 'none'; style-src 'unsafe-inline'; img-src data: blob: https:; font-src data: https:;"
  csp.locked_down_csp() |> should.equal(expected)
  csp.default_csp() |> should.equal(expected)
}

pub fn build_csp_from_directives_test() {
  let directives =
    csp.CspDirectives(
      default_src: ["'none'"],
      script_src: ["'unsafe-inline'", "'unsafe-eval'", "blob:"],
      connect_src: ["'none'"],
      style_src: ["'unsafe-inline'"],
      img_src: ["data:", "blob:", "https:"],
      font_src: ["data:", "https:"],
    )
  let built = csp.build_csp(directives)
  string.contains(built, "default-src 'none';") |> should.be_true
  string.contains(built, "connect-src 'none';") |> should.be_true
  string.contains(built, "script-src 'unsafe-inline' 'unsafe-eval' blob:;")
  |> should.be_true
  string.contains(built, "style-src 'unsafe-inline';") |> should.be_true
  string.contains(built, "img-src data: blob: https:;") |> should.be_true
  string.contains(built, "font-src data: https:;") |> should.be_true
}

pub fn to_meta_tag_test() {
  let policy = csp.locked_down_csp()
  let tag = csp.to_meta_tag(policy)
  tag
  |> should.equal(
    "<meta http-equiv=\"Content-Security-Policy\" content=\"" <> policy <> "\">",
  )
  csp.build_csp_meta_tag(policy) |> should.equal(tag)
}

pub fn sandbox_flags_builder_test() {
  let default_flags = csp.default_sandbox_flags()
  let default_str = csp.build_sandbox_attributes(default_flags)
  string.contains(default_str, "allow-scripts") |> should.be_true
  string.contains(default_str, "allow-forms") |> should.be_true
  string.contains(default_str, "allow-modals") |> should.be_true
  string.contains(default_str, "allow-popups") |> should.be_true
  string.contains(default_str, "allow-downloads") |> should.be_true

  let minimal_flags = csp.minimal_sandbox_flags()
  let minimal_str = csp.build_sandbox_attributes(minimal_flags)
  minimal_str |> should.equal("allow-scripts")
}

pub fn sandbox_safety_accepts_valid_test() {
  csp.is_safe_sandbox_attributes("allow-scripts allow-forms allow-modals")
  |> should.be_true
  csp.is_safe_sandbox_attributes("allow-scripts") |> should.be_true
  csp.is_safe_sandbox_attributes(csp.strict_sandbox_attr) |> should.be_true

  let assert Ok(val) =
    csp.validate_sandbox_attributes("allow-scripts allow-modals")
  string.contains(val, "allow-scripts") |> should.be_true
}

pub fn sandbox_safety_rejects_same_origin_test() {
  csp.is_safe_sandbox_attributes("allow-scripts allow-same-origin")
  |> should.be_false
  let assert Error(err) =
    csp.validate_sandbox_attributes("allow-scripts allow-same-origin")
  string.contains(err, "allow-same-origin") |> should.be_true
}

pub fn sandbox_safety_rejects_top_navigation_test() {
  csp.is_safe_sandbox_attributes("allow-scripts allow-top-navigation")
  |> should.be_false
  csp.is_safe_sandbox_attributes(
    "allow-scripts allow-top-navigation-by-user-activation",
  )
  |> should.be_false

  let assert Error(err) =
    csp.validate_sandbox_attributes("allow-scripts allow-top-navigation")
  string.contains(err, "allow-top-navigation") |> should.be_true
}

pub fn sandbox_safety_rejects_missing_scripts_test() {
  csp.is_safe_sandbox_attributes("allow-forms allow-modals") |> should.be_false
  let assert Error(err) =
    csp.validate_sandbox_attributes("allow-forms allow-modals")
  string.contains(err, "allow-scripts") |> should.be_true
}

pub fn csp_safety_validation_test() {
  csp.is_safe_csp(csp.locked_down_csp()) |> should.be_true
  csp.is_safe_csp("default-src 'none'; connect-src 'none';") |> should.be_true

  csp.is_safe_csp("default-src 'none'; connect-src *;") |> should.be_false
  csp.is_safe_csp("default-src 'none'; connect-src https:;") |> should.be_false
  csp.is_safe_csp("default-src 'none';") |> should.be_false
}
