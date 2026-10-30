import { OmniShellHost } from "@omni/types";
import { OmniShellOptions, InstalledPluginEntry } from "./base-shell.js";

/**
 * Metadata descriptor for an installable Omni Shell experience
 */
export interface ShellDescriptor {
  id: string; // e.g. "classic", "panorama", "editorial", or custom ID / pubkey
  name: string;
  description: string;
  icon?: string;
  author?: string;
  version?: string;
  isBuiltin?: boolean;
  sourceUrl?: string; // e.g. local, nostr naddr, or URL
  scriptContent?: string;
  load?: () => Promise<new (options: OmniShellOptions) => OmniShellHost>;
  create?: (options: OmniShellOptions) => OmniShellHost;
}

/**
 * Standard built-in first-class shells (configured for code-split lazy loading)
 */
export const BUILTIN_SHELLS: ShellDescriptor[] = [
  {
    id: "classic",
    name: "Omni Classic",
    description: "Multi-viewport workbench with dock navigation, widgets dashboard, and Warm Paper Dark design system.",
    icon: "dock",
    author: "Omni Core Team",
    version: "1.0.0",
    isBuiltin: true,
    load: async () => {
      const { OmniShell } = await import("./shell.js");
      return OmniShell;
    }
  },
  {
    id: "panorama",
    name: "Panorama",
    description: "Modern fluid horizontal panoramic experience inspired by Windows Phone Metro & People Hub.",
    icon: "apps",
    author: "Omni Core Team",
    version: "1.0.0",
    isBuiltin: true,
    load: async () => {
      const { PanoramaShell } = await import("./panorama-shell.js");
      return PanoramaShell;
    }
  },
  {
    id: "editorial",
    name: "Editorial",
    description: "Sacred Swiss Editorial & Papyrus sanctuary with Newsreader typography, contemplative layout, and dynamic accent illumination.",
    icon: "book",
    author: "Omni Editorial Studio",
    version: "1.0.0",
    isBuiltin: true,
    load: async () => {
      const { EditorialShell } = await import("./editorial-shell.js");
      return EditorialShell;
    }
  }
];

/**
 * Curated catalog of installable shell experiences
 */
export const CURATED_SHELLS: ShellDescriptor[] = [
  {
    id: "mantra",
    name: "Mantra",
    description: "Sacred Editorial & Papyrus contemplative reading experience with Newsreader typography, axial layout, and cobalt illumination.",
    icon: "book",
    author: "Omni Editorial Studio",
    version: "1.0.0",
    isBuiltin: false,
    sourceUrl: "curated:@omni/shell-mantra",
    load: async () => {
      const { PanoramaShell } = await import("./panorama-shell.js");
      return PanoramaShell;
    }
  },
  {
    id: "minimalist",
    name: "Minimalist Terminal",
    description: "Ultra-lean high-density terminal shell for keyboard-centric power users.",
    icon: "terminal",
    author: "Community",
    version: "0.9.0",
    isBuiltin: false,
    sourceUrl: "curated:@omni/shell-minimalist",
    load: async () => {
      const { OmniShell } = await import("./shell.js");
      return OmniShell;
    }
  }
];

/**
 * Dynamic registry of available shells
 */
export class ShellRegistry {
  public static readonly STORAGE_KEY_INSTALLED = "omni_installed_shells";
  public static readonly STORAGE_KEY_ACTIVE = "omni_active_shell";

  private shells: Map<string, ShellDescriptor> = new Map();
  private shellClasses: Map<string, new (options: OmniShellOptions) => OmniShellHost> = new Map();

  constructor() {
    for (const shell of BUILTIN_SHELLS) {
      this.shells.set(shell.id, { ...shell, isBuiltin: true });
    }
    this.loadPersistedShells();
  }

  public registerClass(id: string, cls: new (options: OmniShellOptions) => OmniShellHost): void {
    this.shellClasses.set(id, cls);
  }

  public getClass(id: string): (new (options: OmniShellOptions) => OmniShellHost) | undefined {
    return this.shellClasses.get(id);
  }

  public register(descriptor: ShellDescriptor): void {
    this.shells.set(descriptor.id, descriptor);
  }

  public unregister(id: string): void {
    this.shells.delete(id);
  }

  public get(id: string): ShellDescriptor | undefined {
    return this.shells.get(id);
  }

  public list(): ShellDescriptor[] {
    return Array.from(this.shells.values());
  }

  public isBuiltin(id: string): boolean {
    const s = this.shells.get(id);
    return s?.isBuiltin === true;
  }

  public install(descriptor: ShellDescriptor, persist = true): void {
    if (!descriptor.id || !descriptor.name) {
      throw new Error("Shell descriptor must have an id and name.");
    }
    const curated = CURATED_SHELLS.find((c) => c.id === descriptor.id);
    const resolvedLoad = descriptor.load || curated?.load;
    const resolvedCreate = descriptor.create || curated?.create;
    this.shells.set(descriptor.id, {
      ...descriptor,
      isBuiltin: false,
      load: resolvedLoad,
      create: resolvedCreate
    });
    if (persist) {
      this.savePersistedShells();
    }
  }

  public uninstall(id: string): boolean {
    const s = this.shells.get(id);
    if (!s) return false;
    if (s.isBuiltin) {
      throw new Error(`Cannot uninstall built-in shell '${s.name}'.`);
    }
    this.shells.delete(id);
    this.savePersistedShells();
    if (this.getActiveShellId() === id) {
      this.setActiveShell("classic");
    }
    return true;
  }

  public getActiveShellId(): string {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(ShellRegistry.STORAGE_KEY_ACTIVE) || "panorama";
    }
    return "panorama";
  }

  public setActiveShell(id: string): void {
    if (!this.shells.has(id)) {
      throw new Error(`Shell '${id}' is not installed.`);
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(ShellRegistry.STORAGE_KEY_ACTIVE, id);
    }
  }

  public getCuratedCatalog(): ShellDescriptor[] {
    return CURATED_SHELLS;
  }

  public loadPersistedShells(): void {
    if (typeof localStorage === "undefined") return;
    try {
      const raw = localStorage.getItem(ShellRegistry.STORAGE_KEY_INSTALLED);
      if (!raw) return;
      const list: ShellDescriptor[] = JSON.parse(raw);
      if (Array.isArray(list)) {
        for (const item of list) {
          if (!item.id) continue;
          if (!this.shells.has(item.id)) {
            const curated = CURATED_SHELLS.find((c) => c.id === item.id);
            this.shells.set(item.id, {
              ...item,
              isBuiltin: false,
              load: curated?.load,
              create: curated?.create
            });
          }
        }
      }
    } catch (e) {
      console.warn("Failed to load persisted shells from localStorage:", e);
    }
  }

  public savePersistedShells(): void {
    if (typeof localStorage === "undefined") return;
    try {
      const toSave = Array.from(this.shells.values())
        .filter((s) => !s.isBuiltin)
        .map(({ id, name, description, icon, author, version, sourceUrl, scriptContent }) => ({
          id,
          name,
          description,
          icon,
          author,
          version,
          sourceUrl,
          scriptContent,
          isBuiltin: false
        }));
      localStorage.setItem(ShellRegistry.STORAGE_KEY_INSTALLED, JSON.stringify(toSave));
    } catch (e) {
      console.warn("Failed to persist shells to localStorage:", e);
    }
  }

  /**
   * Asynchronously load and instantiate the requested shell.
   * Only the code and styles for the requested shell will be downloaded.
   */
  public async createAsync(id: string, options: OmniShellOptions): Promise<OmniShellHost> {
    const descriptor = this.shells.get(id) || this.shells.get("classic") || BUILTIN_SHELLS[0];
    if (!descriptor) {
      throw new Error(`Shell '${id}' is not registered.`);
    }

    // 1. If constructor is already registered/loaded in memory:
    if (this.shellClasses.has(descriptor.id)) {
      const Cls = this.shellClasses.get(descriptor.id)!;
      return new Cls(options);
    }

    // 2. If synchronous creator function is provided:
    if (descriptor.create) {
      return descriptor.create(options);
    }

    // 3. If dynamic loader is provided:
    if (descriptor.load) {
      const Cls = await descriptor.load();
      this.shellClasses.set(descriptor.id, Cls);
      return new Cls(options);
    }

    // 4. Built-in ID fallback dynamic imports:
    if (descriptor.id === "panorama") {
      const { PanoramaShell } = await import("./panorama-shell.js");
      this.shellClasses.set("panorama", PanoramaShell);
      return new PanoramaShell(options);
    } else if (descriptor.id === "editorial") {
      const { EditorialShell } = await import("./editorial-shell.js");
      this.shellClasses.set("editorial", EditorialShell);
      return new EditorialShell(options);
    } else {
      const { OmniShell } = await import("./shell.js");
      this.shellClasses.set("classic", OmniShell);
      return new OmniShell(options);
    }
  }

  /**
   * Synchronously instantiate a shell. If not yet loaded or synchronous creator not provided,
   * falls back to cached constructor or throws with guidance to use createAsync.
   */
  public create(id: string, options: OmniShellOptions): OmniShellHost {
    const descriptor = this.shells.get(id) || this.shells.get("classic") || BUILTIN_SHELLS[0];
    if (!descriptor) {
      throw new Error(`Shell '${id}' is not registered.`);
    }

    if (this.shellClasses.has(descriptor.id)) {
      const Cls = this.shellClasses.get(descriptor.id)!;
      return new Cls(options);
    }

    if (descriptor.create) {
      return descriptor.create(options);
    }

    // If classic is registered and this is a fallback:
    if (this.shellClasses.has("classic")) {
      const Cls = this.shellClasses.get("classic")!;
      return new Cls(options);
    }

    throw new Error(`Shell '${id}' has not been loaded. Use await shellRegistry.createAsync('${id}', options) instead.`);
  }
}

export const shellRegistry = new ShellRegistry();
