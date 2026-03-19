import { z } from 'zod';

export const messageRoleSchema = z.enum(['user', 'assistant', 'tool']);

export const messageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  userId: z.string(),
  role: messageRoleSchema,
  content: z.string(),
  tokenCount: z.number().int().nullable().optional(),
  model: z.string().nullable().optional(),
  toolCalls: z.string().nullable().optional(),
  toolCallId: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
});

export const conversationSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  userId: z.string(),
  title: z.string().max(200).nullable(),
  model: z.string().default('claude-sonnet-4-6'),
  summary: z.string().nullable().optional(),
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

export const citationSchema = z.object({
  index: z.number(),
  fileId: z.string(),
  fileName: z.string(),
  chunkContent: z.string(),
  score: z.number(),
});

export type Citation = z.infer<typeof citationSchema>;

export const sseEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('message_start'), messageId: z.string() }),
  z.object({ type: z.literal('text_delta'), text: z.string() }),
  z.object({ type: z.literal('error'), message: z.string() }),
  z.object({
    type: z.literal('done'),
    usage: z.object({ inputTokens: z.number().int(), outputTokens: z.number().int() }),
    citations: z.array(citationSchema).optional(),
  }),
  z.object({
    type: z.literal('tool_call_start'),
    toolCallId: z.string(),
    toolName: z.string(),
    toolInput: z.record(z.unknown()),
  }),
  z.object({
    type: z.literal('tool_call_end'),
    toolCallId: z.string(),
    toolName: z.string(),
    durationMs: z.number(),
  }),
  z.object({
    type: z.literal('tool_result'),
    toolCallId: z.string(),
    toolName: z.string(),
    result: z.unknown(),
    isError: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('canvas_update'),
    action: z.enum(['create', 'update']),
    item: z.object({
      id: z.string(),
      type: z.string(),
      name: z.string(),
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
      zIndex: z.number(),
      data: z.unknown().optional(),
    }),
  }),
]);

export const conversationListItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(200).nullable(),
  model: z.string(),
  summary: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  messageCount: z.number().int().nonnegative(),
});
