/** @module Interface omni:plugin/ui@0.1.0 **/
/**
 * Renders or updates the active declarative UI view.
 * The `view` parameter is a JSON-serialized OmniComponentNode matching omni-ui.schema.json.
 */
export function render(view: string): void;
/**
 * Updates a specific companion component viewport (e.g., "widget", "dock", "main").
 */
export function renderComponent(componentId: string, view: string): void;
