import { OmniShellHost } from "@omni/types";
import { OmniShell, OmniShellOptions, InstalledPluginEntry } from "./shell.js";
import { PanoramaShell } from "./panorama-shell.js";

/**
 * Metadata descriptor for an installable Omni Shell experience
 */
export interface ShellDescriptor {
  id: string; // e.g. "classic", "panorama", or custom ID / pubkey
  name: string;
  description: string;
  icon?: string;
  author?: string;
  version?: string;
  create: (options: OmniShellOptions) => OmniShellHost;
}

/**
 * Standard built-in first-class shells
 */
export const BUILTIN_SHELLS: ShellDescriptor[] = [
  {
    id: "classic",
    name: "Omni Classic",
    description: "Multi-viewport workbench with dock navigation, widgets dashboard, and Warm Paper Dark design system.",
    icon: "dock",
    author: "Omni Core Team",
    version: "1.0.0",
    create: (options) => new OmniShell(options)
  },
  {
    id: "panorama",
    name: "Panorama",
    description: "Modern fluid horizontal panoramic experience inspired by Windows Phone Metro & People Hub.",
    icon: "apps",
    author: "Omni Core Team",
    version: "1.0.0",
    create: (options) => new PanoramaShell(options)
  }
];

/**
 * Dynamic registry of available shells
 */
export class ShellRegistry {
  private shells: Map<string, ShellDescriptor> = new Map();

  constructor() {
    for (const shell of BUILTIN_SHELLS) {
      this.shells.set(shell.id, shell);
    }
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

  public create(id: string, options: OmniShellOptions): OmniShellHost {
    const descriptor = this.shells.get(id) || this.shells.get("classic")!;
    return descriptor.create(options);
  }
}

export const shellRegistry = new ShellRegistry();
