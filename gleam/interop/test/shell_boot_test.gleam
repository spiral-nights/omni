import gleam/option.{None, Some}
import gleeunit
import gleeunit/should
import omni/interop/shell_boot
import omni/social/profile

pub fn main() {
  gleeunit.main()
}

pub fn own_profile_summary_prefers_display_name_test() {
  let profile =
    profile.Profile(
      pubkey: "abc",
      name: Some("handle"),
      display_name: Some("Alice"),
      about: None,
      picture: Some("https://img.example/a.png"),
      banner: None,
      nip05: Some("alice@example.com"),
      lud16: None,
      website: None,
      created_at: 1,
    )
  let summary = shell_boot.profile_summary_for("npub1abcdefgh", profile)
  summary.pubkey |> should.equal("abc")
  summary.display_name |> should.equal("Alice")
  summary.picture |> should.equal(Some("https://img.example/a.png"))
  summary.nip05 |> should.equal(Some("alice@example.com"))
}

pub fn own_profile_summary_falls_back_to_name_test() {
  let profile =
    profile.Profile(
      pubkey: "abc",
      name: Some("handle"),
      display_name: None,
      about: None,
      picture: None,
      banner: None,
      nip05: None,
      lud16: None,
      website: None,
      created_at: 1,
    )
  shell_boot.profile_summary_for("npub1abcdefgh", profile).display_name
  |> should.equal("handle")
}
