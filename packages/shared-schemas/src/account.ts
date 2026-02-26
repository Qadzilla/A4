import { z } from 'zod';

export const accountTypeSchema = z.enum([
  'checking',
  'savings',
  'credit-card',
  'brokerage',
  'retirement',
  'loan',
  'mortgage',
  'crypto',
  'other',
]);

export const createAccountGroupSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(100),
  color: z.string().min(1),
});

export const updateAccountGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().min(1).optional(),
});

export const createAccountSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(200),
  institution: z.string().min(1).max(200),
  type: accountTypeSchema,
  balance: z.number(),
  groupId: z.string().uuid().nullable().optional(),
  lastUpdated: z.string().optional(), // YYYY-MM-DD
  notes: z.string().max(1000).optional(),
});

export const updateAccountSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  institution: z.string().min(1).max(200).optional(),
  type: accountTypeSchema.optional(),
  balance: z.number().optional(),
  groupId: z.string().uuid().nullable().optional(),
  lastUpdated: z.string().optional(),
  notes: z.string().max(1000).optional(),
});
