import { z } from 'zod';

export const workspaceTypeSchema = z.enum(['workspace', 'folder']);

export const workspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  userId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  thumbnail: z.string().nullable().optional(),
  type: workspaceTypeSchema,
  parentId: z.string().uuid().nullable().optional(),
  deletedAt: z.date().nullable().optional(),
});

export const createWorkspaceSchema = z.object({
  name: z.string().min(1, 'Workspace name is required').max(100),
  description: z.string().max(500).optional(),
  type: workspaceTypeSchema.default('workspace'),
  parentId: z.string().uuid().nullable().optional(),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

export const updateThumbnailSchema = z.object({
  thumbnail: z
    .string()
    .regex(/^data:image\/jpeg;base64,/)
    .max(100_000),
});
