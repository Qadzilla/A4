import { z } from 'zod';

export const currencySchema = z.enum([
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CAD',
  'AUD',
  'CHF',
  'CNY',
  'INR',
  'BRL',
]);

export const transactionTypeSchema = z.enum(['income', 'expense']);

export const createTransactionSchema = z.object({
  workspaceId: z.string().uuid(),
  date: z.string().min(1), // YYYY-MM-DD
  description: z.string().max(500),
  amount: z.number().nonnegative(),
  type: transactionTypeSchema,
  categoryId: z.string().uuid().nullable().optional(),
  notes: z.string().max(1000).optional(),
});

export const updateTransactionSchema = z.object({
  date: z.string().min(1).optional(),
  description: z.string().max(500).optional(),
  amount: z.number().nonnegative().optional(),
  type: transactionTypeSchema.optional(),
  categoryId: z.string().uuid().nullable().optional(),
  notes: z.string().max(1000).optional(),
});

export const transactionFilterSchema = z.object({
  workspaceId: z.string().uuid(),
  type: transactionTypeSchema.optional(),
  categoryId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
