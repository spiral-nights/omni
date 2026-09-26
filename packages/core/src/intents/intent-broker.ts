export type IntentHandler<T = any, R = any> = (data: T, callerPluginId: string) => Promise<R> | R;
export type EventListener<T = any> = (data: T, emitterPluginId?: string) => void;

export class IntentBroker {
  private handlers: Map<string, { pluginId: string; handler: IntentHandler }> = new Map();
  private eventListeners: Map<string, Set<EventListener>> = new Map();

  registerHandler(pluginId: string, action: string, handler: IntentHandler): void {
    this.handlers.set(action, { pluginId, handler });
  }

  unregisterHandlers(pluginId: string): void {
    for (const [action, entry] of this.handlers.entries()) {
      if (entry.pluginId === pluginId) {
        this.handlers.delete(action);
      }
    }
  }

  async dispatch<T = any, R = any>(callerPluginId: string, action: string, data?: T): Promise<R> {
    const entry = this.handlers.get(action);
    if (!entry) {
      throw new Error(`Intent unresolved: No handler registered for action "${action}"`);
    }
    return entry.handler(data, callerPluginId);
  }

  emit<T = any>(event: string, data?: T, emitterPluginId?: string): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(data, emitterPluginId);
        } catch (err) {
          console.error(`Error in event listener for "${event}":`, err);
        }
      }
    }
  }

  on<T = any>(event: string, listener: EventListener<T>): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    const set = this.eventListeners.get(event)!;
    set.add(listener);

    return () => {
      set.delete(listener);
      if (set.size === 0) {
        this.eventListeners.delete(event);
      }
    };
  }
}
