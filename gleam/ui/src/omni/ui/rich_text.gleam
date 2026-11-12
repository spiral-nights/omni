//// Rich note content rendering.
////
//// Turns plain note text into safe inline elements:
//// - `http(s)` URLs become links (or inline images/videos for media URLs)
//// - `[label](url)` link syntax
//// - inline `npub`/`nprofile`/`note`/`nevent`/`naddr` identifiers as chips
////
//// Everything is rendered as DOM elements rather than raw HTML, so note content
//// can never inject markup.

import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import omni/protocol/schema/action.{type Action}
import omni/ui/sanitize

const bech32_charset = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"

const trailing_punctuation = ".,;:!?)]}"

const image_extensions = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif"]

const video_extensions = [".mp4", ".webm", ".mov"]

/// Render note content as a list of inline elements.
///
/// Content without links or Nostr identifiers is emitted as a single text node,
/// so plain labels are not wrapped in extra markup.
pub fn render(content: String, allow_media: Bool) -> List(Element(Action)) {
  case needs_rich(content) {
    False -> [html.text(content)]
    True ->
      content
      |> split_segments()
      |> list.map(fn(segment) { classify_segment(segment, allow_media) })
      |> coalesce()
  }
}

fn needs_rich(content: String) -> Bool {
  [
    "http://",
    "https://",
    "nostr:",
    "npub1",
    "nprofile1",
    "note1",
    "nevent1",
    "naddr1",
    "](http",
  ]
  |> list.any(fn(marker) { string.contains(content, marker) })
}

type Part {
  Plain(String)
  Rich(List(Element(Action)))
}

fn classify_segment(segment: String, allow_media: Bool) -> Part {
  case string.trim(segment) {
    "" -> Plain(segment)
    _ ->
      case markdown_link(segment) {
        Ok(#(label, url)) -> Rich([link_label(label, url)])
        Error(Nil) -> classify_plain_segment(segment, allow_media)
      }
  }
}

fn classify_plain_segment(segment: String, allow_media: Bool) -> Part {
  let #(core, trailing) = strip_trailing(segment)
  case core {
    "" -> Plain(segment)
    _ ->
      case classify(core, allow_media) {
        [only] ->
          case is_plain_element(core) {
            True -> Plain(segment)
            False -> Rich(append_trailing([only], trailing))
          }
        other -> Rich(append_trailing(other, trailing))
      }
  }
}

/// Whether a classified word produced no special rendering.
fn is_plain_element(word: String) -> Bool {
  case entity_label(word) {
    Some(_) -> False
    None ->
      case plain_url(word) {
        Some(_) -> False
        None ->
          case markdown_link(word) {
            Ok(_) -> False
            Error(Nil) -> True
          }
      }
  }
}

fn append_trailing(
  elements: List(Element(Action)),
  trailing: String,
) -> List(Element(Action)) {
  case trailing {
    "" -> elements
    _ -> list.append(elements, [html.text(trailing)])
  }
}

fn coalesce(parts: List(Part)) -> List(Element(Action)) {
  let #(elements, pending) =
    list.fold(parts, #([], []), fn(acc, part) {
      let #(elements, pending) = acc
      case part {
        Rich(els) -> {
          let elements = flush_text(pending, elements)
          #(list.append(elements, els), [])
        }
        Plain(text) -> #(elements, [text, ..pending])
      }
    })
  flush_text(pending, elements)
}

fn flush_text(
  pending: List(String),
  elements: List(Element(Action)),
) -> List(Element(Action)) {
  case pending {
    [] -> elements
    _ -> {
      let text = string.concat(list.reverse(pending))
      case text {
        "" -> elements
        _ -> list.append(elements, [html.text(text)])
      }
    }
  }
}

fn classify(word: String, allow_media: Bool) -> List(Element(Action)) {
  case markdown_link(word) {
    Ok(#(label, url)) -> [link_label(label, url)]
    Error(Nil) ->
      case media_kind(word) {
        Some(Image) ->
          case allow_media {
            True -> [media_element(word, Image)]
            False -> [link_label(shorten_url(word), word)]
          }
        Some(Video) ->
          case allow_media {
            True -> [media_element(word, Video)]
            False -> [link_label(shorten_url(word), word)]
          }
        None ->
          case plain_url(word) {
            Some(url) -> [link_label(shorten_url(url), url)]
            None -> entity_element(word)
          }
      }
  }
}

fn entity_element(word: String) -> List(Element(Action)) {
  case entity_label(word) {
    Some(label) -> [
      html.span(
        [
          attribute.class("omni-inline-entity"),
          attribute.title(word),
          attribute.attribute("data-entity", word),
        ],
        [element_text(label)],
      ),
    ]
    None -> [element_text(word)]
  }
}

fn entity_label(word: String) -> Option(String) {
  let raw = case string.starts_with(word, "nostr:") {
    True -> string.slice(word, 6, string.length(word) - 6)
    False -> word
  }
  let lower = string.lowercase(raw)
  let known =
    string.starts_with(lower, "npub1")
    || string.starts_with(lower, "nprofile1")
    || string.starts_with(lower, "note1")
    || string.starts_with(lower, "nevent1")
    || string.starts_with(lower, "naddr1")
  case known && string.length(lower) >= 20 && is_bech32(lower) {
    True -> Some(shorten_identifier(lower))
    False -> None
  }
}

fn is_charset_char(char: String) -> Bool {
  string.contains(bech32_charset, char)
}

/// Validate the data part of a bech32 identifier (after the `1` separator).
/// The human-readable prefix (`npub`, `note`, ...) is not bech32 data and may
/// contain characters such as `b`.
fn is_bech32(value: String) -> Bool {
  case string.split(value, "1") {
    [_, data] -> list.all(string.to_graphemes(data), is_charset_char)
    _ -> False
  }
}

fn shorten_identifier(value: String) -> String {
  let len = string.length(value)
  case len > 18 {
    True ->
      string.slice(value, 0, 10) <> "..." <> string.slice(value, len - 4, 4)
    False -> value
  }
}

fn shorten_url(url: String) -> String {
  let stripped = strip_scheme(url)
  let len = string.length(stripped)
  case len > 48 {
    True -> string.slice(stripped, 0, 46) <> "..."
    False -> stripped
  }
}

fn strip_scheme(url: String) -> String {
  url
  |> string.replace("https://", "")
  |> string.replace("http://", "")
}

type MediaKind {
  Image
  Video
}

fn media_kind(url: String) -> Option(MediaKind) {
  case plain_url(url) {
    None -> None
    Some(clean) -> {
      let path = strip_query(clean) |> string.lowercase
      case list.any(image_extensions, fn(ext) { string.ends_with(path, ext) }) {
        True -> Some(Image)
        False ->
          case
            list.any(video_extensions, fn(ext) { string.ends_with(path, ext) })
          {
            True -> Some(Video)
            False -> None
          }
      }
    }
  }
}

fn strip_query(url: String) -> String {
  case string.split(url, "?") {
    [path, ..] -> path
    [] -> url
  }
}

fn plain_url(word: String) -> Option(String) {
  case
    string.starts_with(word, "https://") || string.starts_with(word, "http://")
  {
    True ->
      case sanitize.sanitize_url(word) {
        Some(clean) -> Some(clean)
        None -> None
      }
    False -> None
  }
}

fn media_element(url: String, kind: MediaKind) -> Element(Action) {
  let safe = option.unwrap(sanitize.sanitize_url(url), "")
  case kind {
    Image ->
      html.img([
        attribute.class("omni-inline-image"),
        attribute.src(safe),
        attribute.alt("Embedded image"),
        attribute.attribute("loading", "lazy"),
        attribute.attribute("referrerpolicy", "no-referrer"),
      ])
    Video ->
      html.video(
        [
          attribute.class("omni-inline-video"),
          attribute.src(safe),
          attribute.attribute("controls", "true"),
          attribute.attribute("preload", "metadata"),
        ],
        [],
      )
  }
}

fn link_label(label: String, url: String) -> Element(Action) {
  case sanitize.sanitize_url(url) {
    Some(safe) ->
      html.a(
        [
          attribute.class("omni-rich-link"),
          attribute.href(safe),
          attribute.attribute("target", "_blank"),
          attribute.attribute("rel", "noopener noreferrer"),
          attribute.title(safe),
          attribute.attribute("data-url", safe),
        ],
        [html.text(label)],
      )
    None -> html.text(label)
  }
}

/// Parse `[label](url)`.
fn markdown_link(word: String) -> Result(#(String, String), Nil) {
  case string.split(word, "[") {
    ["", rest] ->
      case string.split(rest, "]") {
        [label, after] ->
          case string.starts_with(after, "(") && string.ends_with(after, ")") {
            True -> {
              let url = string.slice(after, 1, string.length(after) - 2)
              case label, url {
                "", _ -> Error(Nil)
                _, "" -> Error(Nil)
                _, _ -> Ok(#(label, url))
              }
            }
            False -> Error(Nil)
          }
        _ -> Error(Nil)
      }
    _ -> Error(Nil)
  }
}

fn element_text(content: String) -> Element(Action) {
  html.span([attribute.class("omni-rich-text")], [html.text(content)])
}

// -----------------------------------------------------------------------------
// Segmentation
// -----------------------------------------------------------------------------
//
// Splits content into alternating word and whitespace segments, preserving the
// original spacing (including newlines) so the rendered text matches the source.

fn split_segments(input: String) -> List(String) {
  let codepoints = string.to_utf_codepoints(input)
  scan(codepoints, [], None, [])
}

fn scan(
  codepoints: List(UtfCodepoint),
  buffer: List(String),
  mode: Option(Bool),
  segments: List(String),
) -> List(String) {
  case codepoints {
    [] -> finish(buffer, segments)
    [codepoint, ..rest] -> {
      let whitespace = is_whitespace(codepoint)
      let char = string.from_utf_codepoints([codepoint])
      let same = case mode {
        Some(previous) -> previous == whitespace
        None -> False
      }
      case mode, same {
        None, _ -> scan(rest, [char], Some(whitespace), segments)
        Some(_), True -> scan(rest, [char, ..buffer], mode, segments)
        Some(_), False -> {
          let segment = string.concat(list.reverse(buffer))
          scan(rest, [char], Some(whitespace), [segment, ..segments])
        }
      }
    }
  }
}

fn finish(buffer: List(String), segments: List(String)) -> List(String) {
  let segment = string.concat(list.reverse(buffer))
  case segment {
    "" -> list.reverse(segments)
    _ -> list.reverse([segment, ..segments])
  }
}

fn is_whitespace(codepoint: UtfCodepoint) -> Bool {
  case string.utf_codepoint_to_int(codepoint) {
    32 | 9 | 10 | 13 -> True
    _ -> False
  }
}

fn strip_trailing(word: String) -> #(String, String) {
  let len = string.length(word)
  case len {
    0 -> #("", "")
    _ -> {
      let last = string.slice(word, len - 1, 1)
      case string.contains(trailing_punctuation, last) {
        True -> {
          let #(core, rest) = strip_trailing(string.slice(word, 0, len - 1))
          #(core, rest <> last)
        }
        False -> #(word, "")
      }
    }
  }
}
