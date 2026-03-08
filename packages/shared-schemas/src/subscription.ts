import { z } from 'zod';

export const subscriptionFrequencySchema = z.enum([
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'annual',
]);
export const subscriptionStatusSchema = z.enum(['active', 'paused', 'cancelled']);

export const createSubscriptionSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().max(200),
  amount: z.number(),
  frequency: subscriptionFrequencySchema,
  startDate: z.string().min(1), // YYYY-MM-DD
  nextBillingDate: z.string().min(1), // YYYY-MM-DD
  categoryId: z.string().uuid().nullable().optional(),
  status: subscriptionStatusSchema,
  notes: z.string().max(2000).optional(),
});

export const updateSubscriptionSchema = z.object({
  name: z.string().max(200).optional(),
  amount: z.number().optional(),
  frequency: subscriptionFrequencySchema.optional(),
  startDate: z.string().min(1).optional(),
  nextBillingDate: z.string().min(1).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  status: subscriptionStatusSchema.optional(),
  notes: z.string().max(2000).optional(),
});
