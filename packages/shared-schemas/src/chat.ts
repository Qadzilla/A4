import { z } from 'zod';

export const messageRoleSchema = z.enum(['user', 'assistant']);

export const messageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  userId: z.string(),
  role: messageRoleSchema,
  content: z.string(),
  tokenCount: z.number().int().nullable().optional(),
  model: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
});

export const conversationSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  userId: z.string(),
  title: z.string().max(200).nullable(),
  model: z.string().default('claude-sonnet-4-6'),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const createConversationSchema = z.object({
  workspaceId: z.string().uuid(),
  title: z.string().max(200).optional(),
  model: z.string().optional(),
});

export const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().min(1, 'Message cannot be empty').max(10000),
});

export const sseEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('message_start'), messageId: z.string() }),
  z.object({ type: z.literal('text_delta'), text: z.string() }),
  z.object({ type: z.literal('error'), message: z.string() }),
  z.object({
    type: z.literal('done'),
    usage: z.object({ inputTokens: z.number().int(), outputTokens: z.number().int() }),
  }),
]);

export const conversationListItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(200).nullable(),
  model: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  messageCount: z.number().int().nonnegative(),
});
