import { z } from 'zod';

export const networthCategoryKindSchema = z.enum(['asset', 'liability']);

export const createNetworthCategorySchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(200),
  kind: networthCategoryKindSchema,
  isDefault: z.boolean().optional(),
});

export const updateNetworthCategorySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  kind: networthCategoryKindSchema.optional(),
});

export const createNetworthEntrySchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(200),
  categoryId: z.string().uuid(),
  value: z.number().min(0),
  notes: z.string().max(2000).nullable().optional(),
});

export const updateNetworthEntrySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  categoryId: z.string().uuid().optional(),
  value: z.number().min(0).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const DEFAULT_NETWORTH_CATEGORIES = [
  // Assets
  { name: 'Cash & Savings', kind: 'asset' as const, isDefault: true },
  { name: 'Investments', kind: 'asset' as const, isDefault: true },
  { name: 'Retirement Accounts', kind: 'asset' as const, isDefault: true },
  { name: 'Real Estate', kind: 'asset' as const, isDefault: true },
  { name: 'Vehicles', kind: 'asset' as const, isDefault: true },
  { name: 'Personal Property', kind: 'asset' as const, isDefault: true },
  // Liabilities
  { name: 'Credit Cards', kind: 'liability' as const, isDefault: true },
  { name: 'Student Loans', kind: 'liability' as const, isDefault: true },
  { name: 'Mortgage', kind: 'liability' as const, isDefault: true },
  { name: 'Auto Loans', kind: 'liability' as const, isDefault: true },
  { name: 'Medical Debt', kind: 'liability' as const, isDefault: true },
  { name: 'Other Debt', kind: 'liability' as const, isDefault: true },
];
