//// Iframe sandbox guest host definition and srcdoc generation.
////
//// Hosts visual nsite plugins inside standard sandboxed `<iframe>` elements.
//// Injects strict CSP, theme design tokens, and the guest bridge script.

import gleam/dict.{type Dict}
import gleam/option.{type Option, None, Some}
import gleam/string
import omni/sandbox/csp
import omni/sandbox/tokens

/// Configuration options for building an iframe sandbox guest host.
pub type IframeConfig {
  IframeConfig(
    plugin_id: String,
    content: String,
    csp: Option(String),
    tokens: Option(Dict(String, String)),
    bridge_script: Option(String),
  )
}

/// Prepared iframe mount descriptor with sandbox security attributes.
pub type IframeMount {
  IframeMount(
    plugin_id: String,
    srcdoc: String,
    sandbox: String,
    allow: String,
    class_name: String,
  )
}

/// Port transfer message descriptor indicating readiness to transfer ports.
pub type PortTransferMessage {
  PortTransferMessage(
    msg_type: String,
    plugin_id: String,
    has_channel1: Bool,
    has_channel2: Bool,
  )
}

/// Generates the standard minimal guest bridge script tag for direct visual iframes.
pub fn build_guest_bridge_script(plugin_id: String) -> String {
  "<script id=\"omni-guest-bridge\">\n"
  <> "(function() {\n"
  <> "  var pluginId = "
  <> string.inspect(plugin_id)
  <> ";\n"
  <> "  var rpcSeq = 1;\n"
  <> "  var pending = new Map();\n"
  <> "\n"
  <> "  window.addEventListener('message', function(e) {\n"
  <> "    var data = e.data;\n"
  <> "    if (data && data.__omni_rpc_response && pending.has(data.id)) {\n"
  <> "      var p = pending.get(data.id);\n"
  <> "      pending.delete(data.id);\n"
  <> "      if (data.error) p.reject(data.error);\n"
  <> "      else p.resolve(data.result);\n"
  <> "    }\n"
  <> "  });\n"
  <> "\n"
  <> "  function callRpc(method, params) {\n"
  <> "    return new Promise(function(resolve, reject) {\n"
  <> "      var id = 'rpc_' + (rpcSeq++);\n"
  <> "      pending.set(id, { resolve: resolve, reject: reject });\n"
  <> "      window.parent.postMessage({\n"
  <> "        __omni_rpc_request: true,\n"
  <> "        pluginId: pluginId,\n"
  <> "        id: id,\n"
  <> "        method: method,\n"
  <> "        params: params\n"
  <> "      }, '*');\n"
  <> "    });\n"
  <> "  }\n"
  <> "\n"
  <> "  // Standard NIP-07 Signer (window.nostr)\n"
  <> "  window.nostr = {\n"
  <> "    getPublicKey: function() { return callRpc('nostr.getPublicKey'); },\n"
  <> "    signEvent: function(event) { return callRpc('nostr.signEvent', { event: event }); },\n"
  <> "    getRelays: function() { return callRpc('nostr.getRelays'); }\n"
  <> "  };\n"
  <> "\n"
  <> "  // Intercept standard protocol links (nostr:, lightning:, cashu:)\n"
  <> "  document.addEventListener('click', function(e) {\n"
  <> "    var anchor = e.target.closest('a');\n"
  <> "    if (anchor && anchor.href) {\n"
  <> "      var href = anchor.getAttribute('href') || '';\n"
  <> "      if (href.startsWith('nostr:') || href.startsWith('lightning:') || href.startsWith('cashu:')) {\n"
  <> "        e.preventDefault();\n"
  <> "        window.parent.postMessage({\n"
  <> "          __omni_uri_intent: true,\n"
  <> "          pluginId: pluginId,\n"
  <> "          uri: href\n"
  <> "        }, '*');\n"
  <> "      }\n"
  <> "    }\n"
  <> "  }, true);\n"
  <> "})();\n"
  <> "</script>"
}

/// Generates sandboxed `srcdoc` HTML embedding:
/// - Injected strict CSP `<meta http-equiv="Content-Security-Policy" content="...">`
/// - Injected design tokens `<style id="omni-design-tokens">`
/// - Injected guest bridge script `<script id="omni-guest-bridge">`
/// - Injected plugin script / HTML markup
pub fn build_srcdoc(config: IframeConfig) -> String {
  let policy = case config.csp {
    Some(p) -> p
    None -> csp.locked_down_csp()
  }
  let csp_tag = csp.to_meta_tag(policy)
  let token_style = case config.tokens {
    Some(t) ->
      tokens.build_token_style_tag(tokens.merge_tokens(
        tokens.default_tokens(),
        tokens.from_dict(t),
      ))
    None -> tokens.default_token_style_tag()
  }
  let bridge = case config.bridge_script {
    Some(b) -> b
    None -> build_guest_bridge_script(config.plugin_id)
  }

  let head_injections = csp_tag <> "\n" <> token_style <> "\n" <> bridge

  let raw = config.content
  case string.contains(raw, "</head>") {
    True -> {
      // Inject right before </head>
      case string.split_once(raw, "</head>") {
        Ok(#(before, after)) ->
          before <> "\n" <> head_injections <> "\n</head>" <> after
        Error(Nil) -> raw
      }
    }
    False -> {
      case string.contains(raw, "<head>") {
        True -> {
          case string.split_once(raw, "<head>") {
            Ok(#(before, after)) ->
              before <> "<head>\n" <> head_injections <> "\n" <> after
            Error(Nil) -> raw
          }
        }
        False -> {
          // Wrap fragment in standard HTML5 skeleton
          "<!DOCTYPE html>\n<html>\n<head>\n"
          <> head_injections
          <> "\n</head>\n<body>\n"
          <> raw
          <> "\n</body>\n</html>"
        }
      }
    }
  }
}

/// Prepare iframe sandbox mounting attributes and srcdoc.
pub fn prepare_mount(config: IframeConfig) -> IframeMount {
  let safe_id =
    string.replace(config.plugin_id, ".", "-")
    |> string.replace(":", "-")
  IframeMount(
    plugin_id: config.plugin_id,
    srcdoc: build_srcdoc(config),
    sandbox: csp.build_sandbox_attributes(csp.default_sandbox_flags()),
    allow: "autoplay; geolocation",
    class_name: "omni-app-iframe omni-app-" <> safe_id,
  )
}

/// Prepare dual-channel port transfer message.
pub fn prepare_port_transfer(plugin_id: String) -> PortTransferMessage {
  PortTransferMessage(
    msg_type: "omni:init",
    plugin_id: plugin_id,
    has_channel1: True,
    has_channel2: True,
  )
}
