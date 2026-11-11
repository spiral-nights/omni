import gleam/dict
import gleam/option.{None, Some}
import gleam/string
import gleeunit/should
import omni/sandbox/iframe_host

pub fn srcdoc_structure_fragment_wrap_test() {
  let cfg =
    iframe_host.IframeConfig(
      plugin_id: "org.omni.plugin.test",
      content: "<div id=\"root\">Hello Omni</div>",
      csp: None,
      tokens: None,
      bridge_script: None,
    )
  let srcdoc = iframe_host.build_srcdoc(cfg)

  // Validating srcdoc structure: <!DOCTYPE html>, <html>, <head>, <body>
  string.starts_with(srcdoc, "<!DOCTYPE html>\n<html>\n<head>")
  |> should.be_true
  string.contains(srcdoc, "<body>\n<div id=\"root\">Hello Omni</div>\n</body>")
  |> should.be_true
  string.ends_with(srcdoc, "</html>") |> should.be_true
}

pub fn csp_tag_injection_test() {
  let cfg =
    iframe_host.IframeConfig(
      plugin_id: "org.omni.plugin.test",
      content: "<p>Isolated</p>",
      csp: None,
      tokens: None,
      bridge_script: None,
    )
  let srcdoc = iframe_host.build_srcdoc(cfg)

  // Validating CSP tag injection and connect-src 'none' enforcement
  string.contains(
    srcdoc,
    "<meta http-equiv=\"Content-Security-Policy\" content=\"",
  )
  |> should.be_true
  string.contains(srcdoc, "connect-src 'none'") |> should.be_true
  string.contains(srcdoc, "default-src 'none'") |> should.be_true
}

pub fn custom_csp_tag_injection_test() {
  let custom_csp =
    "default-src 'none'; script-src 'self'; connect-src 'none'; style-src 'self';"
  let cfg =
    iframe_host.IframeConfig(
      plugin_id: "org.omni.plugin.test",
      content: "<p>Custom</p>",
      csp: Some(custom_csp),
      tokens: None,
      bridge_script: None,
    )
  let srcdoc = iframe_host.build_srcdoc(cfg)

  string.contains(
    srcdoc,
    "<meta http-equiv=\"Content-Security-Policy\" content=\""
      <> custom_csp
      <> "\">",
  )
  |> should.be_true
}

pub fn token_style_tag_injection_test() {
  let cfg =
    iframe_host.IframeConfig(
      plugin_id: "org.omni.plugin.test",
      content: "<h1>Styled</h1>",
      csp: None,
      tokens: None,
      bridge_script: None,
    )
  let srcdoc = iframe_host.build_srcdoc(cfg)

  // Validating token style tag injection
  string.contains(srcdoc, "<style id=\"omni-design-tokens\">") |> should.be_true
  string.contains(srcdoc, "--omni-bg-canvas: #141312;") |> should.be_true
  string.contains(srcdoc, "--omni-accent-primary: #d4a373;") |> should.be_true
  string.contains(srcdoc, "--omni-text-primary: #ede8df;") |> should.be_true
}

pub fn custom_theme_tokens_injection_test() {
  let custom_tokens =
    dict.from_list([
      #("--omni-accent-primary", "#ff5500"),
      #("--custom-banner", "#333333"),
    ])
  let cfg =
    iframe_host.IframeConfig(
      plugin_id: "org.omni.plugin.test",
      content: "<h1>Custom Styled</h1>",
      csp: None,
      tokens: Some(custom_tokens),
      bridge_script: None,
    )
  let srcdoc = iframe_host.build_srcdoc(cfg)

  string.contains(srcdoc, "--omni-accent-primary: #ff5500;") |> should.be_true
  string.contains(srcdoc, "--custom-banner: #333333;") |> should.be_true
}

pub fn bridge_script_placement_in_head_test() {
  let html =
    "<!DOCTYPE html><html><head><title>App</title></head><body><main>Content</main></body></html>"
  let cfg =
    iframe_host.IframeConfig(
      plugin_id: "org.omni.plugin.test",
      content: html,
      csp: None,
      tokens: None,
      bridge_script: None,
    )
  let srcdoc = iframe_host.build_srcdoc(cfg)

  // Validating bridge script tag placement inside <head> before </head>
  string.contains(srcdoc, "<script id=\"omni-guest-bridge\">") |> should.be_true
  string.contains(srcdoc, "var pluginId = \"org.omni.plugin.test\";")
  |> should.be_true
  string.contains(srcdoc, "window.nostr = {") |> should.be_true

  // Verify that bridge script and tokens are placed before </head>
  let assert Ok(#(head_part, _body_part)) = string.split_once(srcdoc, "</head>")
  string.contains(head_part, "<script id=\"omni-guest-bridge\">")
  |> should.be_true
  string.contains(head_part, "<style id=\"omni-design-tokens\">")
  |> should.be_true
  string.contains(head_part, "<meta http-equiv=\"Content-Security-Policy\"")
  |> should.be_true
}

pub fn prepare_mount_attributes_test() {
  let cfg =
    iframe_host.IframeConfig(
      plugin_id: "org.omni.plugin.editor",
      content: "<p>Editor</p>",
      csp: None,
      tokens: None,
      bridge_script: None,
    )
  let mount = iframe_host.prepare_mount(cfg)

  mount.plugin_id |> should.equal("org.omni.plugin.editor")
  mount.class_name
  |> should.equal("omni-app-iframe omni-app-org-omni-plugin-editor")
  string.contains(mount.sandbox, "allow-scripts") |> should.be_true
  string.contains(mount.sandbox, "allow-forms") |> should.be_true
  string.contains(mount.sandbox, "allow-same-origin") |> should.be_false
  mount.allow |> should.equal("autoplay; geolocation")
}

pub fn prepare_port_transfer_test() {
  let transfer = iframe_host.prepare_port_transfer("org.omni.plugin.test")
  transfer.msg_type |> should.equal("omni:init")
  transfer.plugin_id |> should.equal("org.omni.plugin.test")
  transfer.has_channel1 |> should.be_true
  transfer.has_channel2 |> should.be_true
}
