import { z } from 'zod';

export const messageRoleSchema = z.enum(['user', 'assistant']);

export const messageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  role: messageRoleSchema,
  content: z.string(),
  createdAt: z.date(),
});

export const conversationSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(200),
  workspaceId: z.string().uuid().nullable(),
  userId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createConversationSchema = z.object({
  title: z.string().max(200).optional(),
  workspaceId: z.string().uuid().nullable().optional(),
});

export const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().min(1, 'Message cannot be empty').max(10000),
});
