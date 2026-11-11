import gleam/dict
import gleam/list
import gleam/string
import omni/sandbox/tokens

pub fn default_tokens_contains_all_palettes_test() {
  let toks = tokens.default_tokens()
  let keys = list.map(toks, fn(pair) { pair.0 })

  assert list.contains(keys, tokens.bg_canvas) == True
  assert list.contains(keys, tokens.bg_surface) == True
  assert list.contains(keys, tokens.bg_elevated) == True
  assert list.contains(keys, tokens.text_primary) == True
  assert list.contains(keys, tokens.text_secondary) == True
  assert list.contains(keys, tokens.text_muted) == True
  assert list.contains(keys, tokens.border_subtle) == True
  assert list.contains(keys, tokens.border_strong) == True
  assert list.contains(keys, tokens.accent_primary) == True
  assert list.contains(keys, tokens.radius_sm) == True
  assert list.contains(keys, tokens.radius_md) == True
  assert list.contains(keys, tokens.font_sans) == True
  assert list.contains(keys, tokens.font_mono) == True

  // Verify default color values match the Warm Paper Dark palette
  let d = dict.from_list(toks)
  assert dict.get(d, tokens.bg_canvas) == Ok("#141312")
  assert dict.get(d, tokens.bg_surface) == Ok("#191816")
  assert dict.get(d, tokens.bg_elevated) == Ok("#22201d")
  assert dict.get(d, tokens.text_primary) == Ok("#ede8df")
  assert dict.get(d, tokens.accent_primary) == Ok("#d4a373")
}

pub fn to_css_rules_test() {
  let sample = [
    #("--omni-bg-canvas", "#141312"),
    #("--omni-text-primary", "#ede8df"),
  ]
  let rules = tokens.to_css_rules(sample)
  assert rules
    == "  --omni-bg-canvas: #141312;\n  --omni-text-primary: #ede8df;"
}

pub fn build_token_style_tag_test() {
  let tag = tokens.default_token_style_tag()
  assert string.starts_with(tag, "<style id=\"omni-design-tokens\">\n:root {\n")
    == True
  assert string.ends_with(tag, "\n}\n</style>") == True
  assert string.contains(tag, "  --omni-bg-canvas: #141312;") == True
  assert string.contains(tag, "  --omni-accent-primary: #d4a373;") == True
}

pub fn merge_tokens_test() {
  let base = [
    #("--omni-bg-canvas", "#141312"),
    #("--omni-text-primary", "#ede8df"),
  ]
  let overrides = [
    #("--omni-bg-canvas", "#000000"),
    #("--custom-color", "#ffffff"),
  ]

  let merged = tokens.merge_tokens(base, overrides)
  let d = dict.from_list(merged)

  assert dict.get(d, "--omni-bg-canvas") == Ok("#000000")
  assert dict.get(d, "--omni-text-primary") == Ok("#ede8df")
  assert dict.get(d, "--custom-color") == Ok("#ffffff")
}

pub fn from_dict_and_to_dict_test() {
  let sample =
    dict.from_list([#("--custom-a", "10px"), #("--custom-b", "20px")])
  let list_tokens = tokens.from_dict(sample)
  let roundtrip = tokens.to_dict(list_tokens)
  assert roundtrip == sample
}
