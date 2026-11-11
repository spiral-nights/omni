const subscriptions = new Map();

function nextId() {
  return `sub_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeFilters(filters) {
  if (Array.isArray(filters)) return filters;
  if (filters && typeof filters === "object") return [filters];
  return [];
}

export function install(call_rpc) {
  if (typeof window === "undefined") return;
  const rpc = (method, params) =>
    Promise.resolve(
      call_rpc(method, params === undefined ? "" : JSON.stringify(params)),
    );

  const nostr = {
    async getPublicKey() {
      return rpc("nostr.getPublicKey", {});
    },
    async signEvent(event) {
      return rpc("nostr.signEvent", { event });
    },
    async getRelays() {
      return rpc("nostr.getRelays", {});
    },
    nip04: {
      async encrypt(pubkey, plaintext) {
        return rpc("nostr.nip04.encrypt", { pubkey, plaintext });
      },
      async decrypt(pubkey, ciphertext) {
        return rpc("nostr.nip04.decrypt", { pubkey, ciphertext });
      },
    },
    nip44: {
      async encrypt(pubkey, plaintext) {
        return rpc("nostr.nip44.encrypt", { pubkey, plaintext });
      },
      async decrypt(pubkey, ciphertext) {
        return rpc("nostr.nip44.decrypt", { pubkey, ciphertext });
      },
    },
    relays: {
      async list() {
        return rpc("relays.list", {});
      },
      async add(url) {
        return rpc("relays.add", { url });
      },
      async remove(url) {
        return rpc("relays.remove", { url });
      },
    },
    async fetch(filters, options) {
      return rpc("nostr.fetch", {
        filters: normalizeFilters(filters),
        ...(options || {}),
      });
    },
    subscribe(filters, onEvent, onEose) {
      const subId = nextId();
      const options =
        filters && !Array.isArray(filters) && typeof filters === "object"
          ? filters
          : null;
      const filterList = normalizeFilters(
        options && options.filters ? options.filters : filters,
      );
      subscriptions.set(subId, {
        onEvent: (options && options.onEvent) || onEvent,
        onEose: (options && options.onEose) || onEose,
      });
      rpc("nostr.subscribe", { subscriptionId: subId, filters: filterList });
      return {
        id: subId,
        unsubscribe() {
          subscriptions.delete(subId);
          rpc("nostr.unsubscribe", { subscriptionId: subId });
        },
      };
    },
    async publish(draft) {
      if (!draft || typeof draft !== "object") {
        throw new Error("Invalid draft event to publish");
      }
      return rpc("nostr.publish", { draft });
    },
    async doc(dTagOrSpec, docOptions) {
      return rpc("nostr.doc", {
        spec: dTagOrSpec,
        options: docOptions || {},
      });
    },
  };

  Object.defineProperty(window, "nostr", {
    configurable: true,
    value: nostr,
  });
}

export function route_notification(rawNotification) {
  let message;
  try {
    message =
      typeof rawNotification === "string"
        ? JSON.parse(rawNotification)
        : rawNotification;
  } catch {
    return;
  }
  if (!message || typeof message !== "object") return;
  const params = message.params || {};
  const subId = params.subscriptionId;
  if (!subId) return;
  const sub = subscriptions.get(subId);
  if (!sub) return;

  if (message.method === "nostr.stream.event") {
    if (typeof sub.onEvent === "function") {
      sub.onEvent(params.event, {
        fromCache: params.fromCache,
        relay: params.relay,
      });
    }
  } else if (message.method === "nostr.stream.eose") {
    if (typeof sub.onEose === "function") sub.onEose();
  }
}
