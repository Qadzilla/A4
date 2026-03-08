import { z } from 'zod';

export const createBudgetGroupSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().max(100),
  color: z.string().min(1),
});

export const updateBudgetGroupSchema = z.object({
  name: z.string().max(100).optional(),
  color: z.string().min(1).optional(),
});

export const createBudgetCategorySchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().max(200),
  budgeted: z.number(),
  actual: z.number(),
  source: z.string().max(1000).nullable().optional(), // JSON string
  notes: z.string().max(2000).nullable().optional(),
  groupId: z.string().uuid().nullable().optional(),
});

export const updateBudgetCategorySchema = z.object({
  name: z.string().max(200).optional(),
  budgeted: z.number().optional(),
  actual: z.number().optional(),
  source: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  groupId: z.string().uuid().nullable().optional(),
});
