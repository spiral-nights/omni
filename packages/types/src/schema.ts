/**
 * Omni Schema-Based Server-Driven UI Types
 * Declarative component nodes emitted by plugins for companion widgets,
 * settings, dock shortcuts, and cards.
 */

export type OmniPrimitiveType =
  | "box"
  | "card"
  | "divider"
  | "spacer"
  | "text"
  | "badge"
  | "metric"
  | "icon"
  | "avatar"
  | "button"
  | "icon-button"
  | "input"
  | "textarea"
  | "toggle"
  | "select"
  | "tabs"
  | "status-indicator"
  | "code-block"
  | "progress"
  | "banner"
  | "list"
  | "list-item"
  | "empty-state";

export interface OmniAction {
  name: string;
  payload?: Record<string, unknown>;
  navigate?: {
    pluginId?: string;
    view?: string;
    route?: string;
  };
}

export interface OmniPrimitiveBase {
  id?: string;
  key?: string;
  visible?: boolean;
}

export interface OmniBoxPrimitive extends OmniPrimitiveBase {
  type: "box";
  direction?: "row" | "column";
  gap?: "none" | "xs" | "sm" | "md" | "lg";
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "between" | "end";
  wrap?: boolean;
  padding?: "none" | "xs" | "sm" | "md" | "lg";
  action?: OmniAction;
  children: OmniComponentNode[];
}

export interface OmniCardPrimitive extends OmniPrimitiveBase {
  type: "card";
  title?: string;
  subtitle?: string;
  icon?: string;
  headerAction?: OmniComponentNode;
  children: OmniComponentNode[];
  footer?: OmniComponentNode[];
}

export interface OmniDividerPrimitive extends OmniPrimitiveBase {
  type: "divider";
  orientation?: "horizontal" | "vertical";
}

export interface OmniSpacerPrimitive extends OmniPrimitiveBase {
  type: "spacer";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
}

export interface OmniTextPrimitive extends OmniPrimitiveBase {
  type: "text";
  content: string;
  variant?: "title" | "subtitle" | "body" | "caption" | "mono";
  tone?: "primary" | "secondary" | "muted" | "accent" | "error" | "success";
  truncate?: boolean;
}

export interface OmniBadgePrimitive extends OmniPrimitiveBase {
  type: "badge";
  label: string;
  tone?: "neutral" | "success" | "warning" | "error" | "accent";
  variant?: "solid" | "subtle" | "outline";
  dot?: boolean;
}

export interface OmniMetricPrimitive extends OmniPrimitiveBase {
  type: "metric";
  label: string;
  value: string | number;
  subtext?: string;
  trend?: "up" | "down" | "neutral";
}

export interface OmniIconPrimitive extends OmniPrimitiveBase {
  type: "icon";
  name: string;
  size?: number;
}

export interface OmniAvatarPrimitive extends OmniPrimitiveBase {
  type: "avatar";
  src?: string;
  pubkey?: string;
  name?: string;
  size?: "sm" | "md" | "lg";
  action?: OmniAction;
}

export interface OmniButtonPrimitive extends OmniPrimitiveBase {
  type: "button";
  label: string;
  action: OmniAction;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: string;
  iconPosition?: "left" | "right";
  disabled?: boolean;
  loading?: boolean;
}

export interface OmniIconButtonPrimitive extends OmniPrimitiveBase {
  type: "icon-button";
  icon: string;
  tooltip?: string;
  action: OmniAction;
  variant?: "ghost" | "secondary" | "danger";
  size?: "sm" | "md";
  disabled?: boolean;
}

export interface OmniInputPrimitive extends OmniPrimitiveBase {
  type: "input";
  name: string;
  placeholder?: string;
  value?: string;
  inputType?: "text" | "number" | "search" | "url" | "password" | "file";
  accept?: string;
  clearable?: boolean;
  prefixIcon?: string;
  actionOnEnter?: OmniAction;
  actionOnChange?: OmniAction;
}

export interface OmniTextareaPrimitive extends OmniPrimitiveBase {
  type: "textarea";
  name: string;
  placeholder?: string;
  value?: string;
  rows?: number;
}

export interface OmniTogglePrimitive extends OmniPrimitiveBase {
  type: "toggle";
  name: string;
  label?: string;
  checked: boolean;
  action: OmniAction;
  disabled?: boolean;
}

export interface OmniSelectOption {
  label: string;
  value: string;
}

export interface OmniSelectPrimitive extends OmniPrimitiveBase {
  type: "select";
  name: string;
  value?: string;
  options: OmniSelectOption[];
  action?: OmniAction;
}

export interface OmniTabItem {
  id: string;
  label: string;
  icon?: string;
  badge?: string | number;
}

export interface OmniTabsPrimitive extends OmniPrimitiveBase {
  type: "tabs";
  tabs: OmniTabItem[];
  activeTab: string;
  action: OmniAction;
}

export interface OmniStatusIndicatorPrimitive extends OmniPrimitiveBase {
  type: "status-indicator";
  status: "online" | "connecting" | "offline" | "error";
  label?: string;
  pulse?: boolean;
}

export interface OmniCodeBlockPrimitive extends OmniPrimitiveBase {
  type: "code-block";
  code: string;
  language?: string;
  copyable?: boolean;
}

export interface OmniProgressPrimitive extends OmniPrimitiveBase {
  type: "progress";
  value: number;
  max?: number;
  label?: string;
  variant?: "bar" | "spinner";
}

export interface OmniBannerPrimitive extends OmniPrimitiveBase {
  type: "banner";
  tone?: "info" | "success" | "warning" | "error";
  title?: string;
  message: string;
  icon?: string;
  action?: OmniAction;
  actionLabel?: string;
  dismissible?: boolean;
  onDismissAction?: OmniAction;
}

export interface OmniListItemPrimitive extends OmniPrimitiveBase {
  type: "list-item";
  title: string;
  subtitle?: string;
  meta?: string;
  icon?: string;
  avatarUrl?: string;
  checked?: boolean;
  onCheckAction?: OmniAction;
  onClickAction?: OmniAction;
  actions?: OmniComponentNode[];
}

export interface OmniListPrimitive extends OmniPrimitiveBase {
  type: "list";
  items: OmniListItemPrimitive[];
  onScrollEndAction?: OmniAction;
  hasMore?: boolean;
  loadingMore?: boolean;
}

export interface OmniEmptyStatePrimitive extends OmniPrimitiveBase {
  type: "empty-state";
  icon?: string;
  title: string;
  description?: string;
  action?: OmniAction;
  actionLabel?: string;
}

export type OmniComponentNode =
  | OmniBoxPrimitive
  | OmniCardPrimitive
  | OmniDividerPrimitive
  | OmniSpacerPrimitive
  | OmniTextPrimitive
  | OmniBadgePrimitive
  | OmniMetricPrimitive
  | OmniIconPrimitive
  | OmniAvatarPrimitive
  | OmniButtonPrimitive
  | OmniIconButtonPrimitive
  | OmniInputPrimitive
  | OmniTextareaPrimitive
  | OmniTogglePrimitive
  | OmniSelectPrimitive
  | OmniTabsPrimitive
  | OmniStatusIndicatorPrimitive
  | OmniCodeBlockPrimitive
  | OmniProgressPrimitive
  | OmniBannerPrimitive
  | OmniListPrimitive
  | OmniListItemPrimitive
  | OmniEmptyStatePrimitive;

export interface OmniSchemaViewResponse {
  schemaVersion: "1.0";
  root: OmniComponentNode;
}
