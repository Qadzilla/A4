import { z } from 'zod';

export const invoiceStatusSchema = z.enum(['draft', 'sent', 'paid', 'overdue']);

export const createInvoiceSchema = z.object({
  workspaceId: z.string().uuid(),
  invoiceNumber: z.string().min(1).max(100),
  date: z.string().min(1), // YYYY-MM-DD
  dueDate: z.string().min(1), // YYYY-MM-DD
  fromName: z.string().max(200).optional(),
  fromAddress: z.string().max(500).optional(),
  fromEmail: z.string().max(200).optional(),
  toName: z.string().max(200).optional(),
  toAddress: z.string().max(500).optional(),
  toEmail: z.string().max(200).optional(),
  taxRate: z.number(),
  notes: z.string().max(2000).optional(),
  status: invoiceStatusSchema,
});

export const updateInvoiceSchema = z.object({
  invoiceNumber: z.string().min(1).max(100).optional(),
  date: z.string().min(1).optional(),
  dueDate: z.string().min(1).optional(),
  fromName: z.string().max(200).nullable().optional(),
  fromAddress: z.string().max(500).nullable().optional(),
  fromEmail: z.string().max(200).nullable().optional(),
  toName: z.string().max(200).nullable().optional(),
  toAddress: z.string().max(500).nullable().optional(),
  toEmail: z.string().max(200).nullable().optional(),
  taxRate: z.number().optional(),
  notes: z.string().max(2000).nullable().optional(),
  status: invoiceStatusSchema.optional(),
});

export const createInvoiceLineItemSchema = z.object({
  invoiceId: z.string().uuid(),
  description: z.string().max(500),
  quantity: z.number(),
  unitPrice: z.number(),
  sortOrder: z.number().int(),
});

export const updateInvoiceLineItemSchema = z.object({
  description: z.string().max(500).optional(),
  quantity: z.number().optional(),
  unitPrice: z.number().optional(),
  sortOrder: z.number().int().optional(),
});
