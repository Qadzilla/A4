import { z } from 'zod';

export const userProfileSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  imageUrl: z.string().url().optional(),
  onboardingCompleted: z.boolean(),
  createdAt: z.date(),
});

export const updateProfileSchema = z.object({
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  onboardingCompleted: z.boolean().optional(),
});
