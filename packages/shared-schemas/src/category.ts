import { z } from 'zod';

export const categoryTypeSchema = z.enum(['income', 'expense', 'both']);
export const categoryContextSchema = z.enum(['ledger', 'receipt', 'subscription']);

export const createCategorySchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(100),
  color: z.string().min(1),
  type: categoryTypeSchema,
  context: categoryContextSchema.default('ledger'),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().min(1).optional(),
  type: categoryTypeSchema.optional(),
});
