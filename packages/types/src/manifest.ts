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
  }).optional()
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
 * Full Omni Plugin Manifest Schema
 */
export const OmniManifestSchema = z.object({
  $schema: z.string().optional(),
  id: z.string().regex(/^[a-zA-Z0-9_.-]+$/),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+/),
  description: z.string().optional(),
  author: AuthorSchema.optional(),
  icon: z.string().optional(),
  entry: z.string().min(1),
  components: z.array(ComponentDeclarationSchema).default([]),
  permissions: ManifestPermissionsSchema
});
export type OmniManifest = z.infer<typeof OmniManifestSchema>;
