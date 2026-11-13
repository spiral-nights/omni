//// Composition root for the headless Omni kernel.
////
//// `OmniKernel` wires together the local event store, keystore, relay pool,
//// ACL engine, capability store, subscription coordinator, plugin registry,
//// navigation history, intent broker, and RPC dispatcher using injectable ports.

import gleam/javascript/promise.{type Promise}
import gleam/option.{type Option, None, Some}
import omni/kernel/acl/capability_store.{type CapabilityStore}
import omni/kernel/acl/engine.{type AclEngine}
import omni/kernel/crypto/keystore.{type Keystore}
import omni/kernel/intents/broker.{type IntentBroker}
import omni/kernel/layout/layout.{type LayoutModel}
import omni/kernel/navigation/history.{type PageStack}
import omni/kernel/nostr/coordinator.{type SubscriptionCoordinator}
import omni/kernel/nostr/event_store.{
  type LocalEventStore, LocalEventStoreOptions,
}
import omni/kernel/nostr/relay_pool.{type RelayPool}
import omni/kernel/plugins/registry.{type PluginRegistry}
import omni/kernel/rpc/dispatcher.{type RpcContext}
import omni/kernel/rpc/quota.{type QuotaTracker}
import omni/kernel/rpc/rate_limit.{type RateLimiter}
import omni/nostr/pubkey.{type Pubkey}
import omni/nostr/relay_url.{type RelayUrl}
import omni/platform/clock.{type Clock}
import omni/platform/idb.{type IdbDatabase}
import omni/platform/storage.{type Storage}
import omni/protocol/capability.{type Capability}
import omni/protocol/grant.{type Grant}
import omni/protocol/plugin_id.{type PluginId}

/// Injectable ports required by the headless kernel.
pub type KernelPorts {
  KernelPorts(
    storage: Storage,
    idb: IdbDatabase,
    clock: Clock,
    prompt_handler: Option(
      fn(PluginId, Capability, Option(Int), Option(String)) -> Promise(Grant),
    ),
  )
}

/// The initialized headless Omni kernel instance.
pub type OmniKernel {
  OmniKernel(
    capability_store: CapabilityStore,
    acl_engine: AclEngine,
    keystore: Keystore,
    event_store: LocalEventStore,
    relay_pool: RelayPool,
    coordinator: SubscriptionCoordinator,
    registry: PluginRegistry,
    intents: IntentBroker,
    layout: LayoutModel,
    navigation: PageStack,
    rate_limiter: RateLimiter,
    quota_tracker: QuotaTracker,
    storage: Storage,
    clock: Clock,
    guest_subscriptions: dispatcher.SubscriptionRegistry,
  )
}

/// Initialize the headless Omni kernel using injected ports and configuration.
pub fn new(
  ports: KernelPorts,
  bootstrap_relays: List(RelayUrl),
  initial_page: String,
) -> OmniKernel {
  let cap_store = capability_store.new(ports.storage)
  let acl = engine.new(cap_store, ports.prompt_handler)
  let ks = keystore.new(ports.storage)

  let es =
    event_store.new(
      ports.idb,
      LocalEventStoreOptions(
        db_name: None,
        max_notes: Some(100),
        max_memory_cache_size: Some(500),
        user_pubkey: Some(keystore.get_public_key(ks)),
      ),
    )

  let pool = relay_pool.new(ports.storage, bootstrap_relays)
  let coord = coordinator.new(es, pool, Some(acl))

  let reg = registry.new()
  let brk = broker.new()
  let lay = layout.new()
  let nav = history.new(initial_page)

  let limiter = rate_limit.new(60, 20)
  let quota = quota.new(ports.storage, 10_000_000)

  OmniKernel(
    capability_store: cap_store,
    acl_engine: acl,
    keystore: ks,
    event_store: es,
    relay_pool: pool,
    coordinator: coord,
    registry: reg,
    intents: brk,
    layout: lay,
    navigation: nav,
    rate_limiter: limiter,
    quota_tracker: quota,
    storage: ports.storage,
    clock: ports.clock,
    guest_subscriptions: dispatcher.new_subscription_registry(),
  )
}

/// Create an RPC context for a specific plugin.
pub fn get_rpc_context(kernel: OmniKernel, plugin_id: PluginId) -> RpcContext {
  get_rpc_context_with(kernel, plugin_id, dispatcher.default_host_hooks())
}

/// Create an RPC context wired to host callbacks (intents, navigation, share).
pub fn get_rpc_context_with(
  kernel: OmniKernel,
  plugin_id: PluginId,
  host: dispatcher.HostHooks,
) -> RpcContext {
  dispatcher.RpcContext(
    plugin_id: plugin_id,
    acl_engine: kernel.acl_engine,
    keystore: kernel.keystore,
    event_store: kernel.event_store,
    relay_pool: kernel.relay_pool,
    coordinator: kernel.coordinator,
    storage: kernel.storage,
    rate_limiter: kernel.rate_limiter,
    quota_tracker: kernel.quota_tracker,
    host: host,
    subscriptions: kernel.guest_subscriptions,
  )
}

/// Set active user public key across keystore and event store.
pub fn set_user_pubkey(kernel: OmniKernel, pk: Pubkey) -> Nil {
  event_store.set_user_pubkey(kernel.event_store, pk)
}
