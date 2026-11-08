/** @module Interface omni:plugin/nostr@0.1.0 **/
/**
 * Queries local 0ms store and relays.
 * `filter` is a JSON-serialized array of NostrFilter. Returns a JSON-serialized array of NostrEvent.
 */
export function fetch(filter: string): string;
/**
 * Subscribes to live events across local 0ms store and connected relays.
 * `filter` is a JSON-serialized array of NostrFilter. Returns subscription ID.
 * Matching events are dispatched to guest's `handle-action("nostr:event", eventJson)`.
 */
export function subscribe(filter: string): string;
/**
 * Signs and broadcasts an event to the user's connected relays and local cache.
 * `draft` is a JSON-serialized Nostr draft. Returns JSON-serialized NostrPublishResult.
 */
export function publish(draft: string): string;
/**
 * Retrieves the current user's hex public key.
 */
export function getPublicKey(): string;
