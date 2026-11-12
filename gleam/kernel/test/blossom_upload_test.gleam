import gleam/javascript/promise
import gleam/list
import gleam/option.{type Option, None, Some, from_result}
import gleam/result
import gleeunit
import gleeunit/should
import omni/kernel/blossom/upload
import omni/kernel/crypto/keystore
import omni/platform/ref.{type Ref}
import omni/platform/storage
import omni/protocol/blossom

pub fn main() {
  gleeunit.main()
}

pub fn upload_signs_bud06_and_puts_blob_test() -> promise.Promise(Nil) {
  let store = storage.in_memory()
  let ks = keystore.new(store)
  let calls: Ref(List(#(String, BitArray, List(#(String, String))))) =
    ref.new([])

  let send = fn(url, body, headers) {
    ref.update(calls, fn(all) { [#(url, body, headers), ..all] })
    promise.resolve(Ok(200))
  }

  let blob =
    blossom.BlobUpload(
      servers: ["https://cdn.example/"],
      path: "index.html",
      mime: "text/html",
      sha256: "abcdef",
      body: <<"<html>hi</html>":utf8>>,
    )

  use result <- promise.await(upload.upload_blob(ks, blob, 1_700_000_000, send))
  case result {
    Ok(uploaded) -> {
      uploaded.url |> should.equal("https://cdn.example/abcdef")
      uploaded.server |> should.equal("https://cdn.example")
    }
    Error(err) -> panic as err
  }

  let assert [call] = ref.get(calls)
  call.0 |> should.equal("https://cdn.example/upload")
  call.1 |> should.equal(<<"<html>hi</html>":utf8>>)
  let authorization =
    call.2
    |> list_authorization
  case authorization {
    Some(value) -> value |> should.not_equal("")
    None -> should.fail()
  }
  promise.resolve(Nil)
}

fn list_authorization(headers: List(#(String, String))) -> Option(String) {
  headers
  |> list.find(fn(header: #(String, String)) { header.0 == "Authorization" })
  |> result.map(fn(header: #(String, String)) { header.1 })
  |> from_result
}
