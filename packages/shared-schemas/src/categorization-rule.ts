import { z } from 'zod';

export const createCategorizationRuleSchema = z.object({
  workspaceId: z.string().uuid(),
  pattern: z.string().min(1).max(200),
  categoryId: z.string().uuid(),
});

export const updateCategorizationRuleSchema = z.object({
  pattern: z.string().min(1).max(200).optional(),
  categoryId: z.string().uuid().optional(),
});
