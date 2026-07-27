import { z } from 'zod';

export const entityTypeSchema = z.enum([
  'merchant',
  'institution',
  'person',
  'organization',
  'account_ref',
]);

export const entityMentionSourceTypeSchema = z.enum([
  'chunk',
  'transaction',
  'invoice',
  'receipt',
  'subscription',
  'account',
]);

export const entitySchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  userId: z.string(),
  type: entityTypeSchema,
  canonicalName: z.string().min(1),
  normalizedName: z.string().min(1),
  aliases: z.array(z.string()),
  mentionCount: z.number().int().nonnegative(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const entityMentionSchema = z.object({
  id: z.string().uuid(),
  entityId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  userId: z.string(),
  sourceType: entityMentionSourceTypeSchema,
  sourceId: z.string(),
  snippet: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  amount: z.number().nullable(),
  date: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
});

export const entityEdgeSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  userId: z.string(),
  fromEntityId: z.string().uuid(),
  toEntityId: z.string().uuid(),
  relationship: z.string().min(1),
  evidence: z.array(z.string()),
  createdAt: z.coerce.date(),
});

// Shape the extraction model must produce per document batch (pre-resolution:
// entities are surface forms; relationships reference them by name)
export const extractedEntitySchema = z.object({
  name: z.string().min(1),
  type: entityTypeSchema,
  confidence: z.number().min(0).max(1),
  snippet: z.string().optional(),
  // Transaction details stated at the mention site, for reconciliation.
  // Date is intentionally lenient — a malformed model date must not fail the
  // whole batch; consumers parse and null-out invalid values.
  amount: z.number().optional(),
  date: z.string().optional(),
});

export const extractedRelationshipSchema = z.object({
  fromName: z.string().min(1),
  toName: z.string().min(1),
  relationship: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export const entityExtractionResultSchema = z.object({
  entities: z.array(extractedEntitySchema),
  relationships: z.array(extractedRelationshipSchema),
});

export type EntityType = z.infer<typeof entityTypeSchema>;
export type EntityMentionSourceType = z.infer<typeof entityMentionSourceTypeSchema>;
export type Entity = z.infer<typeof entitySchema>;
export type EntityMention = z.infer<typeof entityMentionSchema>;
export type EntityEdge = z.infer<typeof entityEdgeSchema>;
export type ExtractedEntity = z.infer<typeof extractedEntitySchema>;
export type ExtractedRelationship = z.infer<typeof extractedRelationshipSchema>;
export type EntityExtractionResult = z.infer<typeof entityExtractionResultSchema>;
