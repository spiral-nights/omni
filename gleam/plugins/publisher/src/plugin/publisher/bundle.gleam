//// Nsite bundle model: files, hashing, MIME detection, and zip extraction.

import gleam/bit_array
import gleam/list
import gleam/string
import omni/platform/webcrypto
import omni/platform/zip
import omni/protocol/blossom

/// A file inside an nsite bundle.
pub type BundleFile {
  BundleFile(
    path: String,
    mime: String,
    sha256: String,
    size: Int,
    bytes: BitArray,
  )
}

/// An installable nsite bundle.
pub type Bundle {
  Bundle(entry: String, files: List(BundleFile))
}

/// Build a bundle from raw zip `bytes`.
pub fn from_zip_bytes(bytes: BitArray) -> Result(Bundle, String) {
  case zip.unzip(bytes) {
    Error(err) -> Error(err)
    Ok(entries) -> {
      let files =
        entries
        |> list.filter(fn(entry) { is_bundle_file(entry.0) })
        |> strip_shared_prefix
        |> list.map(fn(entry) {
          let #(path, contents) = entry
          let sha = webcrypto.sha256_hex_bits(contents)
          let mime = blossom.detect_mime_type(path).mime
          BundleFile(
            path: path,
            mime: mime,
            sha256: sha,
            size: bit_array_byte_size(contents),
            bytes: contents,
          )
        })

      case pick_entry(files) {
        Error(err) -> Error(err)
        Ok(entry) -> Ok(Bundle(entry: entry, files: files))
      }
    }
  }
}

/// Build a single-file HTML bundle.
pub fn from_html(html: String, entry: String) -> Bundle {
  let bytes = bit_array.from_string(html)
  Bundle(entry: entry, files: [
    BundleFile(
      path: entry,
      mime: "text/html",
      sha256: webcrypto.sha256_hex_bits(bytes),
      size: bit_array_byte_size(bytes),
      bytes: bytes,
    ),
  ])
}

/// Locate the entry file of a bundle.
pub fn entry_file(bundle: Bundle) -> Result(BundleFile, String) {
  case list.find(bundle.files, fn(file) { file.path == bundle.entry }) {
    Ok(file) -> Ok(file)
    Error(Nil) -> Error("Bundle entry file is missing: " <> bundle.entry)
  }
}

fn is_bundle_file(path: String) -> Bool {
  !string.starts_with(path, "__MACOSX/")
  && path != ".DS_Store"
  && !string.ends_with(path, "/")
}

fn strip_shared_prefix(
  entries: List(#(String, BitArray)),
) -> List(#(String, BitArray)) {
  let paths = list.map(entries, fn(entry) { entry.0 })
  case paths {
    [] -> entries
    [first, ..] ->
      case string.split(first, "/") {
        [prefix, _, ..] -> {
          let prefix_with_slash = prefix <> "/"
          let all_share =
            list.length(paths) > 1
            && list.all(paths, fn(path) {
              string.starts_with(path, prefix_with_slash)
            })
          case all_share {
            True ->
              list.map(entries, fn(entry) {
                #(
                  string.drop_start(entry.0, string.length(prefix_with_slash)),
                  entry.1,
                )
              })
            False -> entries
          }
        }
        _ -> entries
      }
  }
}

fn pick_entry(files: List(BundleFile)) -> Result(String, String) {
  let preferred = ["index.html", "index.htm", "index.js"]
  case
    list.find(preferred, fn(name) {
      list.any(files, fn(file) { file.path == name })
    })
  {
    Ok(name) -> Ok(name)
    Error(Nil) -> Error("Zip bundle must contain index.html or index.js")
  }
}

fn bit_array_byte_size(bytes: BitArray) -> Int {
  bytes
  |> bit_array.byte_size
}
