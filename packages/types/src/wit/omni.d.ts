// world omni:plugin/omni-plugin@0.1.0
export type * as OmniPluginNostr010 from './interfaces/omni-plugin-nostr.js'; // import omni:plugin/nostr@0.1.0
export type * as OmniPluginUi010 from './interfaces/omni-plugin-ui.js'; // import omni:plugin/ui@0.1.0
/**
* Invoked when the plugin is mounted.
* Returns the initial UI view (JSON string), or an empty string if using `ui.render()`.
*/
export function init(): string;
/**
* Invoked when the user interacts with a UI primitive (button click, toggle, form submit).
* `action` is the action name string (e.g., "increment", "add-task").
* `payload` is the JSON-serialized action payload including ambient form values.
* Returns an optional updated UI view (JSON string), or an empty string if no re-render.
*/
export function handleAction(action: string, payload: string): string;
