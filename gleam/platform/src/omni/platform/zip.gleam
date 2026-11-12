//// ZIP archive port (FFI-quarantined), powered by `fflate`.

/// A file entry in a zip archive.
pub type ZipEntry =
  #(String, BitArray)

/// Build a zip archive from `entries`.
@external(javascript, "./zip.ffi.mjs", "zip")
pub fn zip(entries: List(ZipEntry)) -> BitArray

/// Extract a zip archive into file entries.
@external(javascript, "./zip.ffi.mjs", "unzip")
pub fn unzip(bytes: BitArray) -> Result(List(ZipEntry), String)
