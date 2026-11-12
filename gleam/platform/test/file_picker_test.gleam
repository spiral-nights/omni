import gleeunit
import gleeunit/should
import omni/platform/file_picker

pub fn main() -> Nil {
  gleeunit.main()
}

pub fn zip_accept_filter_test() {
  file_picker.zip_accept() |> should.equal(".zip,application/zip")
}

pub fn is_zip_file_name_test() {
  file_picker.is_zip_file_name("bundle.zip") |> should.be_true
  file_picker.is_zip_file_name("  Bundle.ZIP  ") |> should.be_true
  file_picker.is_zip_file_name("bundle.tar.gz") |> should.be_false
  file_picker.is_zip_file_name("") |> should.be_false
}
