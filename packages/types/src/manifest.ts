import { z } from "zod";

/**
 * Supported UI Component Types
 */
export const ComponentTypeSchema = z.enum(["icon", "sidebar", "main", "widget"]);
export type ComponentType = z.infer<typeof ComponentTypeSchema>;

/**
 * Component Declaration Schema
 */
export const ComponentDeclarationSchema = z.object({
  id: z.string().min(1),
  type: ComponentTypeSchema,
  title: z.string().min(1),
  slot: z.string().min(1),
  defaultProps: z.record(z.unknown()).optional()
});
export type ComponentDeclaration = z.infer<typeof ComponentDeclarationSchema>;

/**
 * Manifest Permissions Schema
 */
export const ManifestPermissionsSchema = z.object({
  nostr: z.object({
    read: z.object({
      kinds: z.array(z.number().int()).optional(),
      allKinds: z.boolean().optional()
    }).optional(),
    write: z.object({
      kinds: z.array(z.number().int()).optional(),
      allKinds: z.boolean().optional()
    }).optional(),
    sign: z.boolean().optional(),
    encrypt: z.boolean().optional()
  }).optional(),
  storage: z.object({
    quotaMb: z.number().positive().default(5)
  }).optional(),
  intents: z.object({
    call: z.array(z.string()).optional(),
    handle: z.array(z.string()).optional()
  }).optional(),
  relays: z.object({
    manage: z.boolean().optional(),
    read: z.boolean().optional()
  }).optional(),
  identity: z.object({
    manageKeys: z.boolean().optional()
  }).optional(),
  geolocation: z.boolean().optional()
}).default({});
export type ManifestPermissions = z.infer<typeof ManifestPermissionsSchema>;

/**
 * Author Schema
 */
export const AuthorSchema = z.object({
  name: z.string().optional(),
  pubkey: z.string().length(64).optional(),
  nip05: z.string().optional()
});
export type Author = z.infer<typeof AuthorSchema>;

/**
 * Sub-view / Route Declaration Schema
 * Allows pure nsites to declare supported routes (e.g. settings, widget)
 * without requiring any proprietary SDK.
 */
export const PluginViewDeclarationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  path: z.string().default("")
});
export type PluginViewDeclaration = z.infer<typeof PluginViewDeclarationSchema>;

/**
 * Full Omni Plugin Manifest Schema
 */
export const OmniManifestSchema = z.object({
  $schema: z.string().optional(),
  id: z.string().regex(/^[a-zA-Z0-9_.-]+$/),
  name: z.string().min(1),
  displayName: z.string().optional(),
  version: z.string().regex(/^\d+\.\d+\.\d+/),
  description: z.string().optional(),
  author: AuthorSchema.optional(),
  icon: z.string().optional(),
  entry: z.string().min(1),
  trusted: z.boolean().optional(),
  components: z.array(ComponentDeclarationSchema).default([]),
  views: z.array(PluginViewDeclarationSchema).default([]),
  permissions: ManifestPermissionsSchema
});
export type OmniManifest = z.infer<typeof OmniManifestSchema>;
