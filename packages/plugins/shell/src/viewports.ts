export interface AvailableSlot {
  id: string;
  name: string;
  description: string;
}

export const STANDARD_SLOTS: AvailableSlot[] = [
  { id: "main", name: "Full-Page App", description: "Primary center view with dedicated launcher in the navigation dock" },
  { id: "sidebar", name: "Widget", description: "Modular widget card displayed on the Widgets page" },
  { id: "dock", name: "Navigation Dock Shortcut", description: "Shortcut button or companion icon in the left navigation dock" },
  { id: "header-status", name: "Header Status Area", description: "Top header area next to brand logo" },
  { id: "header-actions", name: "Header Quick Action", description: "Top right header area for quick actions and profile tools" }
];

export const STANDARD_VIEWPORTS: AvailableSlot[] = [
  { id: "sidebar", name: "Widget", description: "Modular widget card displayed on the Widgets page" },
  { id: "dock", name: "Navigation Dock Shortcut", description: "Shortcut button or companion icon in the left navigation dock" },
  { id: "header-actions", name: "Header Quick Action", description: "Top right header area for quick actions and profile tools" }
];
