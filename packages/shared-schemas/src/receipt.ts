import { z } from 'zod';

export const paymentMethodSchema = z.enum(['cash', 'card', 'check', 'transfer', 'other']);
export const receiptStatusSchema = z.enum(['pending', 'reviewed', 'reimbursed']);

export const createReceiptSchema = z.object({
  workspaceId: z.string().uuid(),
  date: z.string().min(1), // YYYY-MM-DD
  merchant: z.string().min(1).max(200),
  amount: z.number(),
  tax: z.number(),
  paymentMethod: paymentMethodSchema,
  categoryId: z.string().uuid().nullable().optional(),
  status: receiptStatusSchema,
  linkedFileId: z.string().nullable().optional(),
  notes: z.string().max(2000).optional(),
});

export const updateReceiptSchema = z.object({
  date: z.string().min(1).optional(),
  merchant: z.string().min(1).max(200).optional(),
  amount: z.number().optional(),
  tax: z.number().optional(),
  paymentMethod: paymentMethodSchema.optional(),
  categoryId: z.string().uuid().nullable().optional(),
  status: receiptStatusSchema.optional(),
  linkedFileId: z.string().nullable().optional(),
  notes: z.string().max(2000).optional(),
});
