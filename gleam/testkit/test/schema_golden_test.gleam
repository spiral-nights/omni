//// Golden wire compatibility tests for Omni Declarative Schema nodes.
////
//// Ensures Gleam Schema encoding exactly matches canonical wire format.

import gleam/option.{None}
import omni/protocol/schema/action.{Action}
import omni/protocol/schema/builder.{
  action, avatar, avatar_src, badge, badge_tone, box, button, card, child, row,
  text, title, with_icon,
}
import omni/protocol/schema/codec
import omni/protocol/schema/node.{BadgeNeutral, BadgeSuccess, Title}
import omni/testkit/golden

fn schema_golden_dir() -> String {
  "test/golden/schema"
}

pub fn golden_schema_card_test() {
  let ui =
    card()
    |> title("Profile Settings")
    |> with_icon("user")
    |> child(
      box()
      |> row()
      |> child(
        avatar()
        |> avatar_src("https://example.com/avatar.png")
        |> action(Action("view-avatar", None, None)),
      )
      |> child(text("SpiralNights") |> builder.text_variant(Title)),
    )
    |> child(
      box()
      |> row()
      |> child(badge("Active") |> badge_tone(BadgeSuccess))
      |> child(badge("Nostr") |> badge_tone(BadgeNeutral)),
    )
    |> child(button("Save Profile", Action("save-profile", None, None)))

  let encoded = codec.encode_node(ui)
  golden.assert_match_in(
    schema_golden_dir(),
    "schema_card_profile.json",
    encoded,
  )

  let assert Ok(content) =
    golden.read_from(schema_golden_dir(), "schema_card_profile.json")
  let assert Ok(decoded) = codec.decode_node(content)
  assert codec.encode_node(decoded) == encoded
}
