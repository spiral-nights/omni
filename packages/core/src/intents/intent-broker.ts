export type IntentHandler<T = any, R = any> = (data: T, callerPluginId: string) => Promise<R> | R;
export type EventListener<T = any> = (data: T, emitterPluginId?: string) => void;

export interface RegisteredIntentHandler {
  pluginId: string;
  action: string;
  name?: string;
  icon?: string;
  description?: string;
  isRpc?: boolean;
  handler: IntentHandler;
}

export type DisambiguateHandlerCallback = (
  action: string,
  candidates: Array<{ pluginId: string; name?: string; icon?: string; description?: string }>,
  data?: any,
  callerPluginId?: string
) => Promise<string | null>;

export type PromptEnableCandidateCallback = (
  action: string,
  candidate: { pluginId: string; name?: string; icon?: string; description?: string },
  data?: any,
  callerPluginId?: string
) => Promise<boolean>;

export const INTENT_ACTION_ALIASES: Record<string, string> = {
  compose_note: "create_note",
  create_note: "compose_note"
};

export class IntentBroker {
  private handlers: Map<string, RegisteredIntentHandler[]> = new Map();
  private eventListeners: Map<string, Set<EventListener>> = new Map();
  private disabledPluginIntents: Map<string, Set<string>> = new Map(); // pluginId -> Set of disabled actions
  private defaultHandlers: Map<string, string> = new Map(); // action -> pluginId
  private disambiguateCallback?: DisambiguateHandlerCallback;
  private promptEnableCandidateCallback?: PromptEnableCandidateCallback;

  setDisambiguateCallback(cb: DisambiguateHandlerCallback): void {
    this.disambiguateCallback = cb;
  }

  setPromptEnableCandidateCallback(cb: PromptEnableCandidateCallback): void {
    this.promptEnableCandidateCallback = cb;
  }

  setDefaultHandler(action: string, pluginId: string): void {
    this.defaultHandlers.set(action, pluginId);
  }

  getDefaultHandler(action: string): string | undefined {
    const direct = this.defaultHandlers.get(action);
    if (direct) return direct;
    const alias = INTENT_ACTION_ALIASES[action];
    return alias ? this.defaultHandlers.get(alias) : undefined;
  }

  clearDefaultHandler(action: string): void {
    this.defaultHandlers.delete(action);
  }

  getAllDefaultHandlers(): Record<string, string> {
    const res: Record<string, string> = {};
    for (const [action, pId] of this.defaultHandlers.entries()) {
      res[action] = pId;
    }
    return res;
  }

  setPluginIntentEnabled(pluginId: string, action: string, enabled: boolean): void {
    let set = this.disabledPluginIntents.get(pluginId);
    if (!set) {
      set = new Set();
      this.disabledPluginIntents.set(pluginId, set);
    }
    if (enabled) {
      set.delete(action);
      const alias = INTENT_ACTION_ALIASES[action];
      if (alias) set.delete(alias);
    } else {
      set.add(action);
      const alias = INTENT_ACTION_ALIASES[action];
      if (alias) set.add(alias);
    }
  }

  isPluginIntentEnabled(pluginId: string, action: string): boolean {
    const set = this.disabledPluginIntents.get(pluginId);
    if (set && set.has(action)) return false;
    const alias = INTENT_ACTION_ALIASES[action];
    if (alias && set && set.has(alias)) return false;
    return true;
  }

  registerHandler(
    pluginId: string,
    action: string,
    handler: IntentHandler,
    meta?: { name?: string; icon?: string; description?: string; isRpc?: boolean }
  ): void {
    let list = this.handlers.get(action);
    if (!list) {
      list = [];
      this.handlers.set(action, list);
    }
    // Remove existing for same plugin and action if present
    const existingIdx = list.findIndex((h) => h.pluginId === pluginId);
    const entry: RegisteredIntentHandler = {
      pluginId,
      action,
      name: meta?.name,
      icon: meta?.icon,
      description: meta?.description,
      isRpc: meta?.isRpc,
      handler
    };
    if (existingIdx !== -1) {
      list[existingIdx] = entry;
    } else {
      list.push(entry);
    }
  }

  unregisterHandlers(pluginId: string): void {
    for (const [action, list] of this.handlers.entries()) {
      const filtered = list.filter((h) => h.pluginId !== pluginId);
      if (filtered.length === 0) {
        this.handlers.delete(action);
      } else {
        this.handlers.set(action, filtered);
      }
    }
    this.disabledPluginIntents.delete(pluginId);
    for (const [action, defId] of this.defaultHandlers.entries()) {
      if (defId === pluginId) {
        this.defaultHandlers.delete(action);
      }
    }
  }

  getHandlers(action: string): RegisteredIntentHandler[] {
    const direct = this.handlers.get(action) || [];
    if (direct.length > 0) return direct;
    const alias = INTENT_ACTION_ALIASES[action];
    return alias ? this.handlers.get(alias) || [] : [];
  }

  getRegisteredActions(): string[] {
    return Array.from(this.handlers.keys());
  }

  async dispatch<T = any, R = any>(callerPluginId: string, action: string, data?: T): Promise<R> {
    let effectiveAction = action;
    let allCandidates = this.handlers.get(action) || [];
    if (allCandidates.length === 0 && INTENT_ACTION_ALIASES[action]) {
      const alias = INTENT_ACTION_ALIASES[action];
      const aliasCandidates = this.handlers.get(alias) || [];
      if (aliasCandidates.length > 0) {
        effectiveAction = alias;
        allCandidates = aliasCandidates;
      }
    }
    const enabledCandidates = allCandidates.filter((h) => this.isPluginIntentEnabled(h.pluginId, effectiveAction));

    // Case 1: 0 enabled handlers
    if (enabledCandidates.length === 0) {
      // Check if exactly 1 disabled candidate exists
      const disabledCandidates = allCandidates.filter((h) => !this.isPluginIntentEnabled(h.pluginId, effectiveAction));
      if (disabledCandidates.length === 1 && this.promptEnableCandidateCallback) {
        const candidate = disabledCandidates[0];
        const shouldEnable = await this.promptEnableCandidateCallback(
          action,
          {
            pluginId: candidate.pluginId,
            name: candidate.name,
            icon: candidate.icon,
            description: candidate.description
          },
          data,
          callerPluginId
        );
        if (shouldEnable) {
          this.setPluginIntentEnabled(candidate.pluginId, action, true);
          return candidate.handler(data, callerPluginId);
        }
      }
      throw new Error(`Intent unresolved: No enabled handler registered for action "${action}"`);
    }

    let chosen: RegisteredIntentHandler | undefined;

    // Case 2: Exactly 1 enabled candidate
    if (enabledCandidates.length === 1) {
      chosen = enabledCandidates[0];
    } else {
      // Case 3: Multiple enabled candidates
      // Check default handler first (direct or alias)
      const defaultPluginId = this.defaultHandlers.get(action) || (INTENT_ACTION_ALIASES[action] ? this.defaultHandlers.get(INTENT_ACTION_ALIASES[action]) : undefined);
      if (defaultPluginId) {
        const defHandler = enabledCandidates.find((h) => h.pluginId === defaultPluginId);
        if (defHandler) {
          chosen = defHandler;
        }
      }

      // Disambiguate with user modal if callback registered
      if (!chosen && this.disambiguateCallback) {
        const chosenPluginId = await this.disambiguateCallback(
          action,
          enabledCandidates.map((c) => ({
            pluginId: c.pluginId,
            name: c.name,
            icon: c.icon,
            description: c.description
          })),
          data,
          callerPluginId
        );
        if (chosenPluginId) {
          const matched = enabledCandidates.find((h) => h.pluginId === chosenPluginId);
          if (matched) {
            chosen = matched;
          }
        }
      }

      // Fallback to the first candidate if disambiguation cancelled or returned nothing
      if (!chosen) {
        chosen = enabledCandidates[0];
      }
    }

    this.emit("intent:dispatched", {
      action,
      effectiveAction: chosen.action,
      callerPluginId,
      targetPluginId: chosen.pluginId,
      isRpc: Boolean(chosen.isRpc),
      data
    });

    const res = await chosen.handler(data, callerPluginId);
    return res;
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
