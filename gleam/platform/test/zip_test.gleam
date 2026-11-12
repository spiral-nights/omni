import gleam/list
import gleeunit
import gleeunit/should
import omni/platform/zip

pub fn main() {
  gleeunit.main()
}

pub fn zip_round_trip_preserves_files_test() {
  let entries = [
    #("index.html", <<"<html><body>hi</body></html>":utf8>>),
    #("app.js", <<"console.log('omni')":utf8>>),
    #("app.css", <<"body{margin:0}":utf8>>),
  ]
  let archive = zip.zip(entries)
  let assert Ok(extracted) = zip.unzip(archive)

  list.length(extracted) |> should.equal(3)
  let assert Ok(html) =
    list.find(extracted, fn(entry) { entry.0 == "index.html" })
  html.1 |> should.equal(<<"<html><body>hi</body></html>":utf8>>)
}

pub fn unzip_invalid_archive_errors_test() {
  zip.unzip(<<"not a zip":utf8>>) |> should.be_error
}
