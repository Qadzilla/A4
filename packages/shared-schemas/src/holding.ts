import { z } from 'zod';

export const createHoldingSchema = z.object({
  workspaceId: z.string().uuid(),
  symbol: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  value: z.number().min(0),
  targetPct: z.number().min(0).max(100),
});

export const updateHoldingSchema = z.object({
  symbol: z.string().min(1).max(20).optional(),
  name: z.string().min(1).max(200).optional(),
  value: z.number().min(0).optional(),
  targetPct: z.number().min(0).max(100).optional(),
});
