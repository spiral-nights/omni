export { BaseShell } from "./base-shell.js";
export type {
  OmniShellOptions,
  InstalledPluginEntry,
  AppPage,
  SettingsTab
} from "./base-shell.js";

// Lazy-loaded Shell types (type-only exports erased at compile-time to enable dynamic code-splitting)
export type { OmniShell } from "./shell.js";
export type { PanoramaShell, PanoramaPivot, PanoramaAccentPreset } from "./panorama-shell.js";
export type {
  EditorialShell,
  EditorialThemeMode,
  EditorialAccentPreset
} from "./editorial-shell.js";

export { ICONS, icon, renderPluginIcon } from "./icons.js";
export type { IconName } from "./icons.js";
export {
  LayoutManager,
  STANDARD_SLOTS,
  STANDARD_VIEWPORTS
} from "@omni/core";
export type { SlotMapping, AvailableSlot } from "@omni/core";

export {
  ShellRegistry,
  shellRegistry,
  BUILTIN_SHELLS,
  CURATED_SHELLS
} from "./shell-registry.js";
export type { ShellDescriptor } from "./shell-registry.js";

export {
  mountShellStyles,
  unmountShellStyles,
  OMNI_SHELL_STYLE_ELEMENT_ID
} from "./styles/loader.js";
