import gleam/result
import omni/testkit/golden

pub fn file_exists_and_missing_test() {
  assert !golden.file_exists("test/golden/nonexistent_file_xyz_123.golden")
  assert result.is_error(golden.read("nonexistent_file_xyz_123.golden"))
}

pub fn golden_write_read_and_check_test() {
  let filename = "golden_test_sample.txt"
  let content = "{\n  \"status\": \"ok\",\n  \"count\": 42\n}\n"

  // Write snapshot file
  let assert Ok(Nil) = golden.write(filename, content)
  assert golden.file_exists(golden.golden_path(filename))

  // Read snapshot file
  let assert Ok(read_content) = golden.read(filename)
  assert read_content == content

  // Read fixture via full path
  let assert Ok(fixture_content) =
    golden.read_fixture(golden.golden_path(filename))
  assert fixture_content == content

  // Check matching content
  assert golden.check(filename, content) == Ok(Nil)

  // Check matching content with \r\n Windows-style newlines
  let windows_content = "{\r\n  \"status\": \"ok\",\r\n  \"count\": 42\r\n}\r\n"
  assert golden.check(filename, windows_content) == Ok(Nil)

  // Check mismatching content
  let mismatch_result = golden.check(filename, "something completely different")
  case mismatch_result {
    Error(golden.Mismatch(_path, expected, actual)) -> {
      assert expected == content
      assert actual == "something completely different"
    }
    _ -> panic as "Expected Mismatch error"
  }

  // assert_match passes on exact match
  golden.assert_match(filename, content)
}

pub fn custom_directory_golden_test() {
  let custom_dir = "test/golden/custom_sub"
  let filename = "sub_sample.json"
  let content = "{\"nested\": true}"

  let assert Ok(Nil) = golden.write_to(custom_dir, filename, content)
  assert golden.check_in(custom_dir, filename, content) == Ok(Nil)
  golden.assert_match_in(custom_dir, filename, content)
}
