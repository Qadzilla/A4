import { z } from 'zod';

export const currencySchema = z.enum(['USD', 'EUR', 'GBP', 'CAD', 'AUD']);

export const transactionTypeSchema = z.enum(['income', 'expense', 'transfer']);

export const transactionSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  type: transactionTypeSchema,
  amount: z.number().positive(),
  currency: currencySchema,
  category: z.string().max(100),
  description: z.string().max(500).optional(),
  date: z.date(),
  userId: z.string(),
  createdAt: z.date(),
});

export const financialSummarySchema = z.object({
  totalIncome: z.number(),
  totalExpenses: z.number(),
  netProfit: z.number(),
  transactionCount: z.number().int(),
  currency: currencySchema,
  periodStart: z.date(),
  periodEnd: z.date(),
});

export const financialFilterSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  type: transactionTypeSchema.optional(),
  category: z.string().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  currency: currencySchema.optional(),
});
