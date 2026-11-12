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
import gleam/javascript/promise.{type Promise}
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import omni/kernel/acl/capability_store
import omni/kernel/blossom/upload as blossom_upload
import omni/kernel/crypto/keystore
import omni/kernel/intents/broker
import omni/kernel/kernel.{type KernelPorts, type OmniKernel, KernelPorts}
import omni/kernel/nostr/coordinator as subscription_coordinator
import omni/kernel/nostr/event_store
import omni/kernel/nostr/relay_pool
import omni/kernel/workspace/sync
import omni/nostr/event.{type Event, type UnsignedEvent, UnsignedEvent}
import omni/nostr/event_codec
import omni/nostr/event_id
import omni/nostr/kind
import omni/nostr/pubkey
import omni/nostr/relay_url
import omni/platform/clock
import omni/platform/http
import omni/platform/nip44
import omni/platform/promise_ext
import omni/platform/ref
import omni/platform/storage
import omni/platform/websocket
import omni/protocol/blossom
import omni/protocol/capability
import omni/protocol/grant.{Always}
import omni/protocol/intent.{IntentHandler}
import omni/protocol/plugin_id
import omni/protocol/schema/action.{type Action}
import omni/protocol/schema/node.{type Node}
import omni/protocol/workspace
import omni/sandbox/iframe_host.{type IframeMount, IframeConfig}
import omni/sandbox/manager.{
  type SandboxManager, type SpawnOptions, SpawnOptions,
}
import omni/shell/model.{
  type Model, type UserProfileSummary, IntentPromptState, Model, PrimaryApp,
  UserProfileSummary,
}
import omni/shell/msg.{
  type Msg, HostedSchemaAction, InstallApp, OpenApp, SelectIntentHandler,
  SelectShell, ShowIntentPrompt,
}
import omni/shell/registry.{type ShellRegistry}
import omni/shell/shell
import omni/shell/styles
import omni/shell/theme.{type Theme}
import omni/shell/update.{type ShellEffect}
import omni/web/builtin.{type BuiltinApp}
import omni/web/config
import omni/web/installer
import omni/web/nip65
import omni/web/permission_prompt.{type PermissionPrompts}

/// Storage key holding the user's chosen accent color.
pub const accent_color_storage_key = "omni_accent_color"

/// Storage key holding the selected light/dark appearance mode.
pub const theme_mode_storage_key = "omni_theme_mode"

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
    intent_broker: ref.Ref(broker.IntentBroker),
    permission_prompts: PermissionPrompts,
    workspace_sync_seq: ref.Ref(Int),
  )
}

/// Initialize the kernel, shell registry, and shell model from injected ports.
pub fn init(ports: KernelPorts) -> Booted {
  init_with_relays(ports, config.bootstrap_relays(), None)
}

/// Initialize boot state with the bundled Gleam guest bridge injected into
/// every spawned sandbox.
pub fn init_with_bridge(
  ports: KernelPorts,
  bridge_script: Option(String),
) -> Booted {
  init_with_relays(ports, config.bootstrap_relays(), bridge_script)
}

/// Initialize boot state against an explicit bootstrap relay set. Tests pass
/// `[]` so no real sockets are dialed, then attach fake relays.
pub fn init_with_relays(
  ports: KernelPorts,
  bootstrap_relays: List(relay_url.RelayUrl),
  bridge_script: Option(String),
) -> Booted {
  let permission_prompts = permission_prompt.new()
  let ports =
    KernelPorts(
      ..ports,
      prompt_handler: Some(permission_prompt.handler(permission_prompts)),
    )
  let kernel = kernel.new(ports, bootstrap_relays, config.default_shell_id)
  let registry =
    registry.with_builtin_themes()
    |> registry.load_and_persist_active_id(kernel.storage)
  let builtins =
    builtin.apps(pubkey.to_hex(keystore.get_public_key(kernel.keystore)))
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
  let theme_mode = case storage.get(kernel.storage, theme_mode_storage_key) {
    Some("light") -> "light"
    _ -> "dark"
  }
  let seeded_model =
    Model(
      ..seeded,
      user_profile: Some(session_profile(kernel)),
      theme_mode: theme_mode,
      key_encrypted: keystore.is_encrypted(kernel.keystore),
      key_locked: keystore.is_locked(kernel.keystore),
      accounts: keystore.accounts(kernel.keystore),
    )
  // Restore the persisted workspace before the first remote merge, but only
  // when the user actually has one (an absent state must not override the
  // registry's selected shell).
  let seeded_model = case
    storage.get(kernel.storage, sync.storage_key_workspace)
  {
    Some(_) ->
      model.apply_workspace_state(seeded_model, sync.load(kernel.storage))
    None -> seeded_model
  }
  let booted =
    Booted(
      registry: registry,
      model: seeded_model,
      kernel: kernel,
      sandboxes: manager.new(),
      bridge_script: bridge_script,
      builtins: builtins,
      intent_broker: ref.new(broker.new()),
      permission_prompts: permission_prompts,
      workspace_sync_seq: ref.new(0),
    )
  grant_default_capabilities(booted)
  register_intent_handlers(booted)
  install_auth_handler(booted)
  booted
}

fn register_intent_handlers(booted: Booted) -> Nil {
  config.system_apps()
  |> list.each(fn(app) {
    list.each(app.handled_intents, fn(action_name) {
      let _ =
        ref.update(booted.intent_broker, fn(current) {
          broker.register_handler(
            current,
            IntentHandler(
              plugin_id: app.id,
              action: action_name,
              name: Some(app.name),
              icon: Some(app.icon),
              description: Some(app.description),
              route: None,
              is_rpc: None,
            ),
          )
        })
      Nil
    })
  })
}

fn refresh_embedded_views(booted: Booted) -> Booted {
  let model =
    dict.fold(booted.builtins, booted.model, fn(m, id, app) {
      Model(
        ..m,
        embedded_views: dict.insert(m.embedded_views, id, app.render()),
      )
    })
  Booted(..booted, model: model)
}

fn forward_action(booted: Booted, plugin_id: String, action: Action) -> Booted {
  case dict.get(booted.builtins, plugin_id) {
    Ok(app) -> {
      let _ = app.handle_action(action)
      refresh_embedded_views(booted)
    }
    Error(Nil) -> booted
  }
}

/// Route an unhandled plugin action through the kernel intent broker.
pub fn route_intent(booted: Booted, action: Action) -> Booted {
  let request =
    intent.Intent(
      action: action.name,
      data: action.payload,
      caller_plugin_id: None,
    )
  case broker.resolve(ref.get(booted.intent_broker), request) {
    intent.Resolved(handler, _data) -> {
      let #(navigated, _) =
        dispatch(booted, OpenApp(handler.plugin_id, handler.route))
      forward_action(navigated, handler.plugin_id, action)
    }
    intent.Disambiguate(act, candidates, _data) -> {
      let ids = list.map(candidates, fn(candidate) { candidate.plugin_id })
      let payload_json = action.to_json(action) |> json.to_string
      let #(prompted, _) =
        dispatch(
          booted,
          ShowIntentPrompt(IntentPromptState(
            intent_name: act,
            candidates: ids,
            payload_json: payload_json,
          )),
        )
      prompted
    }
    _ -> booted
  }
}

fn install_auth_handler(booted: Booted) -> Nil {
  relay_pool.set_auth_handler(
    booted.kernel.relay_pool,
    fn(relay_url_str, challenge) {
      let draft =
        UnsignedEvent(
          pubkey: None,
          created_at: clock.system().now_ms() / 1000,
          kind: kind.Other(22_242),
          tags: [["relay", relay_url_str], ["challenge", challenge]],
          content: "",
        )
      case keystore.sign_event(booted.kernel.keystore, draft) {
        Ok(event) -> Some(event)
        Error(_) -> None
      }
    },
  )
}

fn session_profile(kernel: OmniKernel) -> UserProfileSummary {
  let public_hex = pubkey.to_hex(keystore.get_public_key(kernel.keystore))
  let npub = keystore.get_npub(kernel.keystore)
  UserProfileSummary(
    pubkey: public_hex,
    npub: npub,
    display_name: "npub" <> string.drop_start(npub, 5) |> string.slice(0, 8),
    picture: None,
    nip05: None,
  )
}

fn grant_default_capabilities(booted: Booted) -> Nil {
  config.system_apps()
  |> list.each(fn(app) {
    case plugin_id.parse(app.id) {
      Ok(pid) ->
        list.each(
          [
            capability.NostrRead,
            capability.NostrWrite,
            capability.NostrSign,
            capability.NostrEncrypt,
            capability.StorageKv,
            capability.RelaysManage,
            capability.IntentsDispatch,
            capability.IntentsHandle,
          ],
          fn(cap) {
            capability_store.set_grant(
              booted.kernel.capability_store,
              pid,
              cap,
              Always,
              None,
            )
          },
        )
      Error(_) -> Nil
    }
  })
}

/// Process a shell message: updates the model, applies persistence effects to
/// storage, and returns any host-facing effects (sandbox mounts, intents, ...).
pub fn dispatch(booted: Booted, msg: Msg) -> #(Booted, List(ShellEffect)) {
  case msg {
    HostedSchemaAction(plugin_id, action) ->
      case dict.get(booted.builtins, plugin_id) {
        Ok(app) ->
          case app.handle_action(action) {
            True -> #(refresh_embedded_views(booted), [])
            False -> #(route_intent(booted, action), [])
          }
        Error(Nil) -> #(route_intent(booted, action), [])
      }
    _ -> dispatch_normal(booted, msg)
  }
}

fn dispatch_normal(booted: Booted, msg: Msg) -> #(Booted, List(ShellEffect)) {
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
        update.PersistThemeMode(mode) -> {
          let _ =
            storage.set(booted.kernel.storage, theme_mode_storage_key, mode)
          #(reg, Nil)
        }
        update.DispatchIntentToPlugin(plugin_id, intent_name, payload_json) -> {
          case action.decode_json(payload_json) {
            Ok(act) -> {
              let _ =
                forward_action(
                  booted,
                  plugin_id,
                  action.with_payload(
                    action.new(intent_name),
                    act.payload |> option.unwrap(dict.new()),
                  ),
                )
              Nil
            }
            Error(_) -> {
              let _ = forward_action(booted, plugin_id, action.new(intent_name))
              Nil
            }
          }
          #(reg, Nil)
        }
        update.PermissionDecision(prompt_id, allowed) -> {
          permission_prompt.resolve(
            booted.permission_prompts,
            prompt_id,
            allowed,
          )
          #(reg, Nil)
        }
        update.PublishWorkspaceNip78(ws) -> {
          schedule_workspace_publish(booted, ws)
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
            Ok(app) ->
              case app.handle_action(action) {
                True -> Nil
                False -> {
                  let _ = route_intent(booted, action)
                  Nil
                }
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
        | update.PersistThemeMode(_)
        | update.DispatchHostedAction(_, _)
        | update.DispatchIntentToPlugin(_, _, _)
        | update.PermissionDecision(_, _) -> False
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
      intent_broker: booted.intent_broker,
      permission_prompts: booted.permission_prompts,
      workspace_sync_seq: booted.workspace_sync_seq,
    ),
    host_effects,
  )
}

/// Import a hex or nsec private key and refresh the session profile.
pub fn import_key(booted: Booted, raw: String) -> Result(Booted, String) {
  case keystore.switch_key(booted.kernel.keystore, raw) {
    Error(err) -> Error(err)
    Ok(_pubkey) ->
      Ok(
        Booted(
          ..booted,
          model: Model(
            ..booted.model,
            user_profile: Some(session_profile(booted.kernel)),
            accounts: keystore.accounts(booted.kernel.keystore),
          ),
        ),
      )
  }
}

/// Encrypt the active key at rest with a passphrase.
pub fn enable_passphrase(
  booted: Booted,
  passphrase: String,
) -> Promise(Result(Booted, String)) {
  use result <- promise.await(keystore.enable_passphrase(
    booted.kernel.keystore,
    passphrase,
  ))
  promise.resolve(case result {
    Ok(_) ->
      Ok(
        Booted(
          ..booted,
          model: Model(..booted.model, key_encrypted: True, key_locked: False),
        ),
      )
    Error(err) -> Error(err)
  })
}

/// Remove passphrase encryption from the stored key.
pub fn disable_passphrase(booted: Booted) -> Result(Booted, String) {
  case keystore.disable_passphrase(booted.kernel.keystore) {
    Ok(_) ->
      Ok(
        Booted(
          ..booted,
          model: Model(..booted.model, key_encrypted: False, key_locked: False),
        ),
      )
    Error(err) -> Error(err)
  }
}

/// Unlock a passphrase-encrypted key and refresh the session profile.
pub fn unlock_key(
  booted: Booted,
  passphrase: String,
) -> Promise(Result(Booted, String)) {
  use result <- promise.await(keystore.unlock(
    booted.kernel.keystore,
    passphrase,
  ))
  promise.resolve(case result {
    Ok(_) ->
      Ok(
        Booted(
          ..booted,
          model: Model(
            ..booted.model,
            key_locked: False,
            user_profile: Some(session_profile(booted.kernel)),
          ),
        ),
      )
    Error(err) -> Error(err)
  })
}

/// Switch to another imported account and refresh the session profile.
pub fn switch_account(
  booted: Booted,
  pubkey_hex: String,
) -> Result(Booted, String) {
  case keystore.switch_account(booted.kernel.keystore, pubkey_hex) {
    Error(err) -> Error(err)
    Ok(_) ->
      Ok(
        Booted(
          ..booted,
          model: Model(
            ..booted.model,
            user_profile: Some(session_profile(booted.kernel)),
            accounts: keystore.accounts(booted.kernel.keystore),
          ),
        ),
      )
  }
}

/// Export the active private key as an nsec string.
pub fn export_key_nsec(booted: Booted) -> Result(String, String) {
  keystore.get_nsec(booted.kernel.keystore)
}

/// Convenience: switch the active shell theme and persist the choice.
pub fn select_shell(booted: Booted, shell_id: String) -> Booted {
  booted
  |> dispatch(SelectShell(shell_id))
  |> fn(pair) { pair.0 }
}

/// Sign and broadcast drafts queued by built-in apps, then feed the signed
/// events back into the apps and the local event store.
pub fn publish_pending(booted: Booted) -> Promise(List(String)) {
  let uploader = blossom_upload.upload_blob(
    booted.kernel.keystore,
    _,
    booted.kernel.clock.now_ms() / 1000,
    http.put_bytes,
  )
  publish_pending_with(booted, uploader)
}

/// Publish pending drafts after uploading any queued blobs with `uploader`.
pub fn publish_pending_with(
  booted: Booted,
  uploader: fn(blossom.BlobUpload) ->
    Promise(Result(blossom.UploadedBlob, String)),
) -> Promise(List(String)) {
  let uploads =
    dict.fold(booted.builtins, [], fn(acc, _id, app) {
      list.append(acc, app.take_uploads())
    })
  use _uploads <- promise.await(promise_ext.all(list.map(uploads, uploader)))
  let drafts =
    dict.fold(booted.builtins, [], fn(acc, _id, app) {
      list.append(acc, app.take_publishes())
    })
  let encrypted =
    dict.fold(booted.builtins, [], fn(acc, _id, app) {
      list.append(acc, app.take_encrypted_publishes())
    })

  let pending =
    list.append(
      list.map(encrypted, fn(draft) { #(draft, True) }),
      list.map(drafts, fn(draft) { #(draft, False) }),
    )

  case pending {
    [] -> promise.resolve([])
    pending ->
      promise_ext.all(
        list.map(pending, fn(pair) {
          case pair.1 {
            True -> publish_encrypted_draft(booted, pair.0)
            False -> publish_draft(booted, pair.0)
          }
        }),
      )
      |> promise.map(fn(results) {
        list.filter_map(results, fn(result) {
          case result {
            Ok(id) -> Ok(id)
            Error(_) -> Error(Nil)
          }
        })
      })
  }
}

/// Debounce workspace publishes so rapid layout changes coalesce into one
/// kind-30078 event.
fn schedule_workspace_publish(
  booted: Booted,
  ws: workspace.WorkspaceState,
) -> Nil {
  let seq = ref.get(booted.workspace_sync_seq) + 1
  ref.set(booted.workspace_sync_seq, seq)
  let _ =
    promise_ext.delay(800, Nil)
    |> promise.map(fn(_) {
      case ref.get(booted.workspace_sync_seq) == seq {
        True -> {
          let draft =
            UnsignedEvent(
              pubkey: None,
              created_at: ws.updated_at,
              kind: kind.AppData,
              tags: [["d", config.workspace_sync_d_tag]],
              content: workspace.encode(ws),
            )
          let _ = publish_draft(booted, draft)
          Nil
        }
        False -> Nil
      }
    })
  Nil
}

/// Encrypt a draft's content to the user with NIP-44, then sign and publish it.
pub fn publish_encrypted_draft(
  booted: Booted,
  draft: UnsignedEvent,
) -> Promise(Result(String, String)) {
  let private_key = keystore.get_private_key(booted.kernel.keystore)
  let self_pubkey =
    pubkey.to_hex(keystore.get_public_key(booted.kernel.keystore))
  use result <- promise.await(nip44.nip44_encrypt(
    private_key,
    self_pubkey,
    draft.content,
  ))
  case result {
    Error(err) -> promise.resolve(Error(err))
    Ok(ciphertext) ->
      publish_draft(booted, UnsignedEvent(..draft, content: ciphertext))
  }
}

/// Sign a single unsigned draft and broadcast it. Returns the event ID.
pub fn publish_draft(
  booted: Booted,
  draft: UnsignedEvent,
) -> Promise(Result(String, String)) {
  case keystore.sign_event(booted.kernel.keystore, draft) {
    Error(err) -> promise.resolve(Error(err))
    Ok(event) -> {
      use _relays <- promise.await(relay_pool.publish(
        booted.kernel.relay_pool,
        event,
      ))
      use _saved <- promise.await(event_store.save_event(
        booted.kernel.event_store,
        event,
      ))
      ingest_signed(booted, event)
      promise.resolve(Ok(event_id.to_hex(event.id)))
    }
  }
}

fn ingest_signed(booted: Booted, event: Event) -> Nil {
  dict.each(booted.builtins, fn(_id, app) {
    case app.ingest {
      Some(ingest) -> ingest(event)
      None -> Nil
    }
  })
}

/// Apply a kind-10002 relay list: add discovered relays and set read/write
/// scopes so REQ only goes to read relays and publishes only to write relays.
pub fn apply_relay_list(booted: Booted, tags: List(List(String))) -> Nil {
  subscription_coordinator.seed_relay_list(
    booted.kernel.coordinator,
    pubkey.to_hex(keystore.get_public_key(booted.kernel.keystore)),
    tags,
  )
  list.each(nip65.parse_tags(tags), fn(hint) {
    case relay_url.parse(hint.url) {
      Error(Nil) -> Nil
      Ok(url) -> {
        relay_pool.add_relay(booted.kernel.relay_pool, url)
        relay_pool.set_relay_scope(
          booted.kernel.relay_pool,
          url,
          hint.read,
          hint.write,
        )
      }
    }
  })
}

/// Resolve an install target, record the installed app, and spawn its sandbox.
///
/// This is the shared seam used by the host (with `http.fetch_text`) and by
/// acceptance tests (with an injected fetcher).
pub fn install_from_target(
  booted: Booted,
  fetch: installer.Fetcher,
  target: String,
  plugin_id_str: String,
) -> Promise(Result(#(Booted, IframeMount), String)) {
  use resolved <- promise.await(installer.resolve_with(
    booted.kernel,
    target,
    plugin_id_str,
    fetch,
  ))

  case resolved {
    Error(err) -> promise.resolve(Error(err))
    Ok(bundle) -> {
      let #(installed, _effects) = dispatch(booted, InstallApp(bundle.app))
      case spawn_sandbox(installed, plugin_id_str, bundle.content, None) {
        Error(err) -> promise.resolve(Error(err))
        Ok(#(next, mount)) -> promise.resolve(Ok(#(next, mount)))
      }
    }
  }
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
          intent_broker: booted.intent_broker,
          permission_prompts: booted.permission_prompts,
          workspace_sync_seq: booted.workspace_sync_seq,
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
        intent_broker: booted.intent_broker,
        permission_prompts: booted.permission_prompts,
        workspace_sync_seq: booted.workspace_sync_seq,
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
