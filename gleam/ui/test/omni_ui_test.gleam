import gleam/dict
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import gleeunit
import gleeunit/should
import lustre/element
import lustre/element/html
import omni/protocol/schema/style.{
  AccentPrimary, Background, Color, Padding, Px, SizeLg, SizeMd, SizeNone,
  SizeSm, SizeXl, SizeXs, StyleMap, StyleProps, StyleRaw, Surface, TextPrimary,
  Width,
}
import omni/ui/icons
import omni/ui/sanitize
import omni/ui/tokens

pub fn main() {
  gleeunit.main()
}

// -----------------------------------------------------------------------------
// Icons Tests
// -----------------------------------------------------------------------------

pub fn all_icon_names_render_valid_svg_test() {
  let names = icons.icon_names()
  should.be_true(list.length(names) >= 60)

  list.each(names, fn(name) {
    should.be_true(icons.has_icon(name))
    let rendered =
      icons.render_icon_default(name)
      |> element.to_string
    should.be_true(string.starts_with(rendered, "<svg"))
    should.be_true(string.ends_with(rendered, "</svg>"))
    should.be_true(string.contains(rendered, "viewBox=\"0 0 24 24\""))
    should.be_true(string.contains(rendered, "width=\"16\""))
    should.be_true(string.contains(rendered, "height=\"16\""))
    should.be_true(string.contains(rendered, "stroke=\"currentColor\""))
    should.be_true(string.contains(rendered, "stroke-width=\"1.75\""))
    should.be_true(string.contains(rendered, "class=\"omni-icon"))
    should.be_true(string.contains(rendered, "data-icon=\"" <> name <> "\""))
    should.be_false(string.contains(rendered, "data-icon-fallback=\"true\""))
  })
}

pub fn render_icon_custom_size_test() {
  let svg_str =
    icons.render_icon("feed", 24)
    |> element.to_string
  should.be_true(string.contains(svg_str, "width=\"24\""))
  should.be_true(string.contains(svg_str, "height=\"24\""))
  should.be_true(string.contains(svg_str, "data-icon=\"feed\""))
}

pub fn render_icon_spinner_has_spin_class_test() {
  let spinner_str =
    icons.render_icon_default("spinner")
    |> element.to_string
  should.be_true(string.contains(
    spinner_str,
    "class=\"omni-icon omni-icon-spin\"",
  ))

  let loader_str =
    icons.render_icon_default("loader")
    |> element.to_string
  should.be_true(string.contains(
    loader_str,
    "class=\"omni-icon omni-icon-spin\"",
  ))
}

pub fn render_unknown_icon_fallback_test() {
  should.be_false(icons.has_icon("non-existent-icon"))
  let fallback_str =
    icons.render_icon("non-existent-icon", 20)
    |> element.to_string
  should.be_true(string.starts_with(fallback_str, "<svg"))
  should.be_true(string.contains(
    fallback_str,
    "data-icon=\"non-existent-icon\"",
  ))
  should.be_true(string.contains(fallback_str, "data-icon-fallback=\"true\""))
  should.be_true(string.contains(fallback_str, "<circle"))
}

// -----------------------------------------------------------------------------
// Tokens Tests
// -----------------------------------------------------------------------------

pub fn default_tokens_map_contains_warm_paper_dark_palette_test() {
  let map = tokens.default_tokens_map()
  dict.get(map, tokens.bg_canvas)
  |> should.equal(Ok("#141312"))
  dict.get(map, tokens.bg_surface)
  |> should.equal(Ok("#191816"))
  dict.get(map, tokens.bg_elevated)
  |> should.equal(Ok("#22201d"))
  dict.get(map, tokens.text_primary)
  |> should.equal(Ok("#ede8df"))
  dict.get(map, tokens.text_secondary)
  |> should.equal(Ok("#9e988f"))
  dict.get(map, tokens.text_muted)
  |> should.equal(Ok("#6b665f"))
  dict.get(map, tokens.accent_primary)
  |> should.equal(Ok("#d4a373"))
  dict.get(map, tokens.border_subtle)
  |> should.equal(Ok("#272522"))
  dict.get(map, tokens.border_default)
  |> should.equal(Ok("#302d29"))
  dict.get(map, tokens.success)
  |> should.equal(Ok("#98c379"))
  dict.get(map, tokens.warning)
  |> should.equal(Ok("#e5c07b"))
  dict.get(map, tokens.error)
  |> should.equal(Ok("#e06c75"))
  dict.get(map, tokens.space_md)
  |> should.equal(Ok("1rem"))
  dict.get(map, tokens.radius_md)
  |> should.equal(Ok("10px"))
}

pub fn size_token_helpers_test() {
  tokens.size_token_to_space_var(SizeNone)
  |> should.equal("0")
  tokens.size_token_to_space_var(SizeXs)
  |> should.equal("var(--omni-space-xs, 0.25rem)")
  tokens.size_token_to_space_var(SizeSm)
  |> should.equal("var(--omni-space-sm, 0.5rem)")
  tokens.size_token_to_space_var(SizeMd)
  |> should.equal("var(--omni-space-md, 1rem)")
  tokens.size_token_to_space_var(SizeLg)
  |> should.equal("var(--omni-space-lg, 1.5rem)")
  tokens.size_token_to_space_var(SizeXl)
  |> should.equal("var(--omni-space-xl, 2rem)")

  tokens.size_token_to_class("omni-gap", SizeMd)
  |> should.equal("omni-gap-md")
}

pub fn style_to_attribute_test() {
  let s_props =
    StyleProps([
      Padding(SizeMd),
      Color(TextPrimary),
      Background(Surface),
      Width(Px(320)),
    ])
  let el_str =
    html.div([tokens.style_to_attribute(s_props)], [])
    |> element.to_string
  should.be_true(string.contains(el_str, "padding:1rem;"))
  should.be_true(string.contains(el_str, "color:var(--omni-text-primary);"))
  should.be_true(string.contains(el_str, "background:var(--omni-bg-surface);"))
  should.be_true(string.contains(el_str, "width:320px;"))

  let s_map = StyleMap(dict.from_list([#("display", "flex")]))
  let el_map_str =
    html.div([tokens.style_to_attribute(s_map)], [])
    |> element.to_string
  should.be_true(string.contains(el_map_str, "display:flex;"))

  let s_raw = StyleRaw("gap: 8px;")
  let el_raw_str =
    html.div([tokens.style_to_attribute(s_raw)], [])
    |> element.to_string
  should.be_true(string.contains(el_raw_str, "style=\"gap: 8px;\""))

  let color_el_str =
    html.span([tokens.color_token_to_attribute(AccentPrimary)], [])
    |> element.to_string
  should.be_true(string.contains(
    color_el_str,
    "color:var(--omni-accent-primary);",
  ))
}

// -----------------------------------------------------------------------------
// Sanitize Tests
// -----------------------------------------------------------------------------

pub fn escape_html_test() {
  sanitize.escape_html("<script>alert(\"xss\" & '1')</script>")
  |> should.equal(
    "&lt;script&gt;alert(&quot;xss&quot; &amp; &#39;1&#39;)&lt;/script&gt;",
  )
}

pub fn sanitize_url_blocks_unsafe_schemes_test() {
  sanitize.sanitize_url("javascript:alert(1)")
  |> should.equal(None)
  sanitize.sanitize_url("JAVASCRIPT:alert(1)")
  |> should.equal(None)
  sanitize.sanitize_url("   jAvAsCrIpT:alert(1)  ")
  |> should.equal(None)
  sanitize.sanitize_url("&#106;avascript:alert(1)")
  |> should.equal(None)
  sanitize.sanitize_url("java&#x09;script:alert(1)")
  |> should.equal(None)
  sanitize.sanitize_url("vbscript:msgbox(1)")
  |> should.equal(None)
  sanitize.sanitize_url("data:text/html,<script>alert(1)</script>")
  |> should.equal(None)
  sanitize.sanitize_url("data:application/javascript,alert(1)")
  |> should.equal(None)
  sanitize.sanitize_url("data:image/svg+xml,<svg onload=alert(1)>")
  |> should.equal(None)
  sanitize.sanitize_url("//evil.example.com/payload.js")
  |> should.equal(None)
  sanitize.sanitize_url("https://example.com/\u{0000}evil")
  |> should.equal(None)
  should.be_false(sanitize.is_safe_url("javascript:void(0)"))
}

pub fn sanitize_url_allows_safe_schemes_test() {
  sanitize.sanitize_url("https://nostr.com/nip-07")
  |> should.equal(Some("https://nostr.com/nip-07"))
  sanitize.sanitize_url("http://localhost:8080/test")
  |> should.equal(Some("http://localhost:8080/test"))
  sanitize.sanitize_url(
    "nostr:npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6",
  )
  |> should.equal(Some(
    "nostr:npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6",
  ))
  sanitize.sanitize_url("lightning:lnbc10u1p3pj257pp5")
  |> should.equal(Some("lightning:lnbc10u1p3pj257pp5"))
  sanitize.sanitize_url("cashu:cashuAeyJ0b2tlbiI6W3sibWludCI6Imh0dHBzOi8v")
  |> should.equal(Some("cashu:cashuAeyJ0b2tlbiI6W3sibWludCI6Imh0dHBzOi8v"))
  sanitize.sanitize_url("mailto:alice@example.com")
  |> should.equal(Some("mailto:alice@example.com"))
  sanitize.sanitize_url("blob:https://omni.local/550e8400")
  |> should.equal(Some("blob:https://omni.local/550e8400"))
  sanitize.sanitize_url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==")
  |> should.equal(Some("data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=="))
  sanitize.sanitize_url("/settings?view=relays")
  |> should.equal(Some("/settings?view=relays"))
  sanitize.sanitize_url("?view=widget")
  |> should.equal(Some("?view=widget"))
  sanitize.sanitize_url("#section-1")
  |> should.equal(Some("#section-1"))
  should.be_true(sanitize.is_safe_url("nostr:note1abc"))
}

pub fn is_safe_attribute_name_test() {
  should.be_true(sanitize.is_safe_attribute_name("class"))
  should.be_true(sanitize.is_safe_attribute_name("data-plugin-id"))
  should.be_true(sanitize.is_safe_attribute_name("aria-label"))
  should.be_true(sanitize.is_safe_attribute_name("href"))

  should.be_false(sanitize.is_safe_attribute_name("onclick"))
  should.be_false(sanitize.is_safe_attribute_name("ONERROR"))
  should.be_false(sanitize.is_safe_attribute_name("onload"))
  should.be_false(sanitize.is_safe_attribute_name("onmouseover"))
  should.be_false(sanitize.is_safe_attribute_name("srcdoc"))
  should.be_false(sanitize.is_safe_attribute_name("formaction"))
  should.be_false(sanitize.is_safe_attribute_name(""))
  should.be_false(sanitize.is_safe_attribute_name("class name"))
  should.be_false(sanitize.is_safe_attribute_name("data\"evil"))
  should.be_false(sanitize.is_safe_attribute_name("data=evil"))
}

pub fn strip_unsafe_html_test() {
  let dirty =
    "<p onclick=\"alert(1)\" class=\"lead\">Hello <script>evil()</script><iframe src=\"https://evil.com\"></iframe><a href=\"javascript:alert(2)\" target=\"_blank\">bad link</a><a href=\"nostr:npub1xyz\">good link</a><img src=\"https://example.com/a.png\" onerror=\"steal()\" /></p>"

  let cleaned = sanitize.strip_unsafe_html(dirty)

  should.be_false(string.contains(cleaned, "<script"))
  should.be_false(string.contains(cleaned, "evil()"))
  should.be_false(string.contains(cleaned, "<iframe"))
  should.be_false(string.contains(cleaned, "onclick"))
  should.be_false(string.contains(cleaned, "onerror"))
  should.be_false(string.contains(cleaned, "javascript:"))

  should.be_true(string.contains(cleaned, "<p class=\"lead\">"))
  should.be_true(string.contains(cleaned, "Hello "))
  should.be_true(string.contains(
    cleaned,
    "<a href=\"nostr:npub1xyz\">good link</a>",
  ))
  should.be_true(string.contains(
    cleaned,
    "<img src=\"https://example.com/a.png\" />",
  ))
}
