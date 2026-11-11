//// Internal Result constructors when Ok is shadowed by RelayFrame.Ok.

import gleam/option.{type Option, None, Some}

pub fn ok(val: a) -> Result(a, e) {
  Ok(val)
}

pub fn error(err: e) -> Result(a, e) {
  Error(err)
}

pub fn from_option(opt: Option(a), err: e) -> Result(a, e) {
  case opt {
    Some(v) -> Ok(v)
    None -> Error(err)
  }
}
