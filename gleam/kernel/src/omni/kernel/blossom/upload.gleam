//// Blossom blob upload with BUD-06 authorization.

import gleam/int
import gleam/javascript/promise.{type Promise}
import gleam/list
import gleam/option.{Some}
import omni/kernel/crypto/keystore.{type Keystore}
import omni/protocol/blossom

/// Injected HTTP PUT sender: url, body, headers -> status.
pub type Sender =
  fn(String, BitArray, List(#(String, String))) -> Promise(Result(Int, String))

/// Upload a blob to the first server that accepts it.
pub fn upload_blob(
  keystore: Keystore,
  upload: blossom.BlobUpload,
  now_seconds: Int,
  send: Sender,
) -> Promise(Result(blossom.UploadedBlob, String)) {
  let draft =
    blossom.create_auth_event_draft(
      upload.sha256,
      Some(upload.path),
      blossom.Upload,
      3600,
      now_seconds,
    )
  case keystore.sign_event(keystore, draft) {
    Error(err) -> promise.resolve(Error(err))
    Ok(signed) -> {
      let headers = [
        #("Authorization", blossom.encode_auth_header(signed)),
        #("Content-Type", upload.mime),
        #("X-SHA-256", upload.sha256),
      ]
      try_servers(upload, headers, send)
    }
  }
}

/// Upload the same blob to every configured server, returning one result per
/// server so callers can report partial success.
pub fn upload_blob_to_all(
  keystore: Keystore,
  upload: blossom.BlobUpload,
  now_seconds: Int,
  send: Sender,
) -> Promise(List(#(String, Result(blossom.UploadedBlob, String)))) {
  let servers = upload.servers
  case servers {
    [] -> promise.resolve([])
    _ -> {
      let draft =
        blossom.create_auth_event_draft(
          upload.sha256,
          Some(upload.path),
          blossom.Upload,
          3600,
          now_seconds,
        )
      case keystore.sign_event(keystore, draft) {
        Error(err) ->
          promise.resolve(
            list.map(servers, fn(server) { #(server, Error(err)) }),
          )
        Ok(signed) -> {
          let headers = [
            #("Authorization", blossom.encode_auth_header(signed)),
            #("Content-Type", upload.mime),
            #("X-SHA-256", upload.sha256),
          ]
          upload_each_server(servers, upload, headers, send)
        }
      }
    }
  }
}

fn try_servers(
  upload: blossom.BlobUpload,
  headers: List(#(String, String)),
  send: Sender,
) -> Promise(Result(blossom.UploadedBlob, String)) {
  case upload.servers {
    [] -> promise.resolve(Error("No Blossom server configured"))
    [server, ..rest] -> {
      use result <- promise.await(send(
        blossom.upload_url(server),
        upload.body,
        headers,
      ))
      case result {
        Ok(status) if status >= 200 && status < 300 ->
          promise.resolve(
            Ok(blossom.UploadedBlob(
              server: blossom.normalize_server(server),
              path: upload.path,
              sha256: upload.sha256,
              url: blossom.blob_url(server, upload.sha256),
            )),
          )
        _ ->
          try_servers(
            blossom.BlobUpload(..upload, servers: rest),
            headers,
            send,
          )
      }
    }
  }
}

fn upload_each_server(
  servers: List(String),
  upload: blossom.BlobUpload,
  headers: List(#(String, String)),
  send: Sender,
) -> Promise(List(#(String, Result(blossom.UploadedBlob, String)))) {
  case servers {
    [] -> promise.resolve([])
    [server, ..rest] -> {
      use status <- promise.await(send(
        blossom.upload_url(server),
        upload.body,
        headers,
      ))
      use tail <- promise.await(upload_each_server(rest, upload, headers, send))
      let normalized = blossom.normalize_server(server)
      let result = case status {
        Ok(code) if code >= 200 && code < 300 ->
          Ok(blossom.UploadedBlob(
            server: normalized,
            path: upload.path,
            sha256: upload.sha256,
            url: blossom.blob_url(server, upload.sha256),
          ))
        Ok(code) -> Error("HTTP " <> int.to_string(code))
        Error(err) -> Error(err)
      }
      promise.resolve([#(normalized, result), ..tail])
    }
  }
}
