export { OmniShell } from "./shell.js";
export { PanoramaShell } from "./panorama-shell.js";
export type { PanoramaPivot } from "./panorama-shell.js";
export type {
  OmniShellOptions,
  InstalledPluginEntry,
  AppPage,
  SettingsTab
} from "./shell.js";
export { ICONS, icon } from "./icons.js";
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
  BUILTIN_SHELLS
} from "./shell-registry.js";
export type { ShellDescriptor } from "./shell-registry.js";

export {
  mountShellStyles,
  unmountShellStyles,
  OMNI_SHELL_STYLE_ELEMENT_ID
} from "./styles/loader.js";
export { CLASSIC_SHELL_CSS } from "./styles/classic-styles.js";
export { PANORAMA_SHELL_CSS } from "./styles/panorama-styles.js";
