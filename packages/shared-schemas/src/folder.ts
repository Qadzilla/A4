import { z } from 'zod';

export const folderSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  parentId: z.string().uuid().nullable(),
  userId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createFolderSchema = z.object({
  name: z.string().min(1, 'Folder name is required').max(100),
  parentId: z.string().uuid().nullable().optional(),
});

export const updateFolderSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  parentId: z.string().uuid().nullable().optional(),
});
