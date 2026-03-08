import { z } from 'zod';

export const createDebtSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().max(200),
  balance: z.number().min(0),
  annualInterestRate: z.number().min(0),
  minimumPayment: z.number().min(0),
});

export const updateDebtSchema = z.object({
  name: z.string().max(200).optional(),
  balance: z.number().min(0).optional(),
  annualInterestRate: z.number().min(0).optional(),
  minimumPayment: z.number().min(0).optional(),
});
