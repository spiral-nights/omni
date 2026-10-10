/**
 * Standard JSON-RPC 2.0 Error Codes
 */
export const JsonRpcErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  PERMISSION_DENIED: -32001,
  INTENT_UNRESOLVED: -32002,
  SIGNER_REJECTED: -32003,
  RATE_LIMIT_EXCEEDED: -32004,
  QUOTA_EXCEEDED: -32005
} as const;
export type JsonRpcErrorCode = (typeof JsonRpcErrorCode)[keyof typeof JsonRpcErrorCode];

/**
 * JSON-RPC 2.0 Request
 */
export interface JsonRpcRequest<T = unknown> {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: T;
}

/**
 * JSON-RPC 2.0 Response Success
 */
export interface JsonRpcResponseSuccess<T = unknown> {
  jsonrpc: "2.0";
  id: string | number;
  result: T;
  error?: never;
}

/**
 * JSON-RPC 2.0 Response Error
 */
export interface JsonRpcResponseError {
  jsonrpc: "2.0";
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
  result?: never;
}

export type JsonRpcResponse<T = unknown> =
  | JsonRpcResponseSuccess<T>
  | JsonRpcResponseError;

/**
 * JSON-RPC 2.0 Notification
 */
export interface JsonRpcNotification<T = unknown> {
  jsonrpc: "2.0";
  method: string;
  params: T;
}

export type IpcMessage =
  | JsonRpcRequest
  | JsonRpcResponse
  | JsonRpcNotification;

/**
 * Initial Handshake Message sent on Sandbox creation
 */
export interface OmniInitMessage {
  type: "omni:init";
  payload: {
    pluginId: string;
    instanceId: string;
    userPubkey: string;
    theme: {
      mode: "light" | "dark";
      colors: Record<string, string>;
    };
    slots: string[];
    scriptContent?: string;
  };
}
