//// Omni web bootloader.
////
//// Headless orchestration for the host page: initializes the kernel, loads the
//// persisted shell registry selection, seeds the shell model with the default
//// system apps, dispatches shell messages, applies persistence side effects,
//// and renders the active theme. No proprietary SDKs and no plugin IDs.
////
//// Mounting the returned element into `#omni-root` is the host page's job
//// (`apps/web`), keeping the package free of DOM FFI.

import gleam/dict.{type Dict}
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import omni/kernel/kernel.{type KernelPorts, type OmniKernel}
import omni/kernel/nostr/relay_pool.{Connected, Connecting, Disconnected}
import omni/kernel/workspace/sync
import omni/nostr/relay_url
import omni/platform/ref
import omni/platform/storage
import omni/platform/websocket
import omni/protocol/plugin_id
import omni/protocol/schema/node.{type Node}
import omni/protocol/workspace
import omni/sandbox/iframe_host.{type IframeMount, IframeConfig}
import omni/sandbox/manager.{
  type SandboxManager, type SpawnOptions, SpawnOptions,
}
import omni/shell/model.{type Model, Model, PrimaryApp}
import omni/shell/msg.{type Msg, SelectShell}
import omni/shell/registry.{type ShellRegistry}
import omni/shell/shell
import omni/shell/styles
import omni/shell/theme.{type Theme}
import omni/shell/update.{type ShellEffect}
import omni/web/builtin.{type BuiltinApp}
import omni/web/config

/// Storage key holding the user's chosen accent color.
pub const accent_color_storage_key = "omni_accent_color"

/// Fully initialized host boot state: kernel, shell registry, shell model,
/// active sandboxes, and the guest bridge script injected into every sandbox.
pub type Booted {
  Booted(
    registry: ShellRegistry,
    model: Model,
    kernel: OmniKernel,
    sandboxes: SandboxManager,
    bridge_script: Option(String),
    builtins: Dict(String, BuiltinApp),
  )
}

/// Initialize the kernel, shell registry, and shell model from injected ports.
pub fn init(ports: KernelPorts) -> Booted {
  init_with_bridge(ports, None)
}

/// Initialize boot state with the bundled Gleam guest bridge injected into
/// every spawned sandbox.
pub fn init_with_bridge(
  ports: KernelPorts,
  bridge_script: Option(String),
) -> Booted {
  let kernel =
    kernel.new(ports, config.bootstrap_relays(), config.default_shell_id)
  let registry =
    registry.with_builtin_themes()
    |> registry.load_and_persist_active_id(kernel.storage)
  let builtins =
    builtin.apps()
    |> list.fold(dict.new(), fn(acc, pair) { dict.insert(acc, pair.0, pair.1) })
  let seeded =
    dict.fold(
      builtins,
      shell.init(registry.active_id, config.system_apps()),
      fn(m, id, app) {
        Model(
          ..m,
          embedded_views: dict.insert(m.embedded_views, id, app.render()),
        )
      },
    )
  Booted(
    registry: registry,
    model: seeded,
    kernel: kernel,
    sandboxes: manager.new(),
    bridge_script: bridge_script,
    builtins: builtins,
  )
}

/// Process a shell message: updates the model, applies persistence effects to
/// storage, and returns any host-facing effects (sandbox mounts, intents, ...).
pub fn dispatch(booted: Booted, msg: Msg) -> #(Booted, List(ShellEffect)) {
  let #(next_model, effects) = shell.update(booted.model, msg)

  let #(next_registry, _) =
    list.fold(effects, #(booted.registry, Nil), fn(acc, effect) {
      let #(reg, _) = acc
      case effect {
        update.SwitchActiveShell(shell_id) -> {
          let next_reg = registry.set_active(reg, shell_id)
          let _ = registry.save_active_id(next_reg, booted.kernel.storage)
          #(next_reg, Nil)
        }
        update.PersistWorkspaceLocal(ws) -> {
          let _ =
            storage.set(
              booted.kernel.storage,
              sync.storage_key_workspace,
              workspace.encode(ws),
            )
          #(reg, Nil)
        }
        update.PersistAccentColor(color) -> {
          let _ =
            storage.set(booted.kernel.storage, accent_color_storage_key, color)
          #(reg, Nil)
        }
        _ -> #(reg, Nil)
      }
    })

  // Forward schema actions to the in-process built-in apps.
  let _ =
    list.each(effects, fn(effect) {
      case effect {
        update.DispatchHostedAction(plugin_id, action) ->
          case dict.get(booted.builtins, plugin_id) {
            Ok(app) -> {
              let _ = app.handle_action(action)
              Nil
            }
            Error(Nil) -> Nil
          }
        _ -> Nil
      }
    })

  // Follow the active app's route, then refresh every embedded view so the
  // rendered tree reflects the latest plugin state.
  let _ = case next_model.active_page {
    PrimaryApp(plugin_id, route) ->
      case dict.get(booted.builtins, plugin_id) {
        Ok(app) -> app.navigate(option.unwrap(route, ""))
        Error(Nil) -> Nil
      }
    _ -> Nil
  }

  let refreshed =
    dict.fold(booted.builtins, next_model, fn(m, id, app) {
      Model(
        ..m,
        embedded_views: dict.insert(m.embedded_views, id, app.render()),
      )
    })

  let host_effects =
    effects
    |> list.filter(fn(effect) {
      case effect {
        update.SwitchActiveShell(_)
        | update.PersistWorkspaceLocal(_)
        | update.PersistAccentColor(_)
        | update.DispatchHostedAction(_, _) -> False
        _ -> True
      }
    })

  #(
    Booted(
      registry: next_registry,
      model: refreshed,
      kernel: booted.kernel,
      sandboxes: booted.sandboxes,
      bridge_script: booted.bridge_script,
      builtins: booted.builtins,
    ),
    host_effects,
  )
}

/// Convenience: switch the active shell theme and persist the choice.
pub fn select_shell(booted: Booted, shell_id: String) -> Booted {
  booted
  |> dispatch(SelectShell(shell_id))
  |> fn(pair) { pair.0 }
}

/// Dial every configured bootstrap relay and track its connection state in the
/// kernel relay pool. Safe to call once after boot.
pub fn connect_relays(booted: Booted) -> Nil {
  relay_pool.get_configured_relays(booted.kernel.relay_pool)
  |> list.each(fn(url) {
    let cell = ref.new(None)
    let connection =
      websocket.connect(relay_url.to_string(url), fn(event) {
        let status = case event {
          websocket.Open -> Connected
          websocket.Close(code, reason) ->
            Disconnected(
              reason: "closed " <> int.to_string(code) <> " " <> reason,
            )
          websocket.Error(message) -> Disconnected(reason: message)
          websocket.Message(_) -> Connecting
        }
        case ref.get(cell) {
          Some(conn) ->
            relay_pool.attach_socket(
              booted.kernel.relay_pool,
              url,
              conn,
              status,
            )
          None -> Nil
        }
      })
    ref.update(cell, fn(_) { Some(connection) })
    relay_pool.attach_socket(
      booted.kernel.relay_pool,
      url,
      connection,
      Connecting,
    )
  })
}

/// Spawn a tracked sandbox for a plugin view and build the `<iframe>` mount
/// descriptor with CSP, design tokens, and the configured guest bridge script.
/// The host mounts the returned `srcdoc` into the plugin's island container.
pub fn spawn_sandbox(
  booted: Booted,
  plugin_id_str: String,
  content: String,
  route: Option(String),
) -> Result(#(Booted, IframeMount), String) {
  case plugin_id.parse(plugin_id_str) {
    Error(_) -> Error("Invalid plugin ID: " <> plugin_id_str)
    Ok(id) -> {
      let options =
        SpawnOptions(
          ..manager.default_spawn_options(),
          format_hint: Some("iframe"),
          route: route,
          content: Some(content),
          runtime_script: booted.bridge_script,
        )

      let #(next_manager, _host) = manager.spawn(booted.sandboxes, id, options)

      let mount =
        iframe_host.prepare_mount(IframeConfig(
          plugin_id: plugin_id_str,
          content: content,
          csp: None,
          tokens: None,
          bridge_script: booted.bridge_script,
        ))

      Ok(#(
        Booted(
          registry: booted.registry,
          model: booted.model,
          kernel: booted.kernel,
          sandboxes: next_manager,
          bridge_script: booted.bridge_script,
          builtins: booted.builtins,
        ),
        mount,
      ))
    }
  }
}

/// Terminate a plugin's sandbox and release its ports and blob URLs.
pub fn terminate_sandbox(booted: Booted, plugin_id_str: String) -> Booted {
  case plugin_id.parse(plugin_id_str) {
    Error(_) -> booted
    Ok(id) ->
      Booted(
        registry: booted.registry,
        model: booted.model,
        kernel: booted.kernel,
        sandboxes: manager.terminate(booted.sandboxes, id),
        bridge_script: booted.bridge_script,
        builtins: booted.builtins,
      )
  }
}

/// Resolve the registry's active theme.
pub fn active_theme(booted: Booted) -> Theme {
  registry.active_theme(booted.registry)
}

/// Render the boot tree: theme stylesheets plus the active theme's shell view.
/// The element is meant to be mounted inside the host `#omni-root` container.
pub fn view(booted: Booted) -> Element(Msg) {
  let theme = active_theme(booted)

  html.div(
    [
      attribute.id("omni-boot-root"),
      attribute.class("omni-boot-root"),
      attribute.attribute("data-active-shell", theme.id),
    ],
    [
      html.div(
        [attribute.class("omni-shell-stylesheets")],
        styles.render_shell_stylesheets(theme.id),
      ),
      theme.render(booted.model),
    ],
  )
}
