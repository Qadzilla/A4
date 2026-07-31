import { createConversationSchema, sendMessageSchema } from '@a4/shared-schemas';
import { TRPCError } from '@trpc/server';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { aiUsage, conversations, messages, workspacePanels } from '../../db/schema';
import { protectedProcedure, router } from '../trpc';

function sumUsageRows(
  rows: { inputTokens: number; outputTokens: number; costCents: number | null }[],
) {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostCents = 0;
  for (const r of rows) {
    totalInputTokens += r.inputTokens;
    totalOutputTokens += r.outputTokens;
    totalCostCents += r.costCents ?? 0;
  }
  return { totalInputTokens, totalOutputTokens, totalCostCents, messageCount: rows.length };
}

export const chatRouter = router({
  listConversations: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const convos = await ctx.db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.userId, ctx.userId),
            eq(conversations.workspaceId, input.workspaceId),
          ),
        )
        .orderBy(desc(conversations.updatedAt));

      if (convos.length === 0) return [];

      const convoIds = convos.map((c) => c.id);
      const counts = await ctx.db
        .select({ conversationId: messages.conversationId, messageCount: count() })
        .from(messages)
        .where(inArray(messages.conversationId, convoIds))
        .groupBy(messages.conversationId);

      const countMap = new Map(counts.map((c) => [c.conversationId, c.messageCount]));

      return convos.map((c) => ({
        id: c.id,
        title: c.title,
        model: c.model,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        messageCount: countMap.get(c.id) ?? 0,
      }));
    }),

  getConversation: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [conversation] = await ctx.db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, input.id), eq(conversations.userId, ctx.userId)));

      if (!conversation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
      }

      const msgs = await ctx.db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, input.id))
        .orderBy(asc(messages.createdAt));

      return { ...conversation, messages: msgs };
    }),

  createConversation: protectedProcedure
    .input(createConversationSchema)
    .mutation(async ({ ctx, input }) => {
      const id = crypto.randomUUID();
      const now = new Date();

      await ctx.db.insert(conversations).values({
        id,
        workspaceId: input.workspaceId,
        userId: ctx.userId,
        title: input.title ?? null,
        model: input.model ?? 'claude-sonnet-4-6',
        createdAt: now,
        updatedAt: now,
      });

      return { id };
    }),

  sendMessage: protectedProcedure.input(sendMessageSchema).mutation(async ({ ctx, input }) => {
    const [conversation] = await ctx.db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, input.conversationId), eq(conversations.userId, ctx.userId)));

    if (!conversation) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
    }

    const id = crypto.randomUUID();
    const now = new Date();

    await ctx.db.insert(messages).values({
      id,
      conversationId: input.conversationId,
      userId: ctx.userId,
      role: 'user',
      content: input.content,
      createdAt: now,
    });

    await ctx.db
      .update(conversations)
      .set({ updatedAt: now })
      .where(eq(conversations.id, input.conversationId));

    return { id, conversationId: input.conversationId };
  }),

  deleteConversation: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [conversation] = await ctx.db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, input.id), eq(conversations.userId, ctx.userId)));

      if (!conversation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
      }

      await ctx.db.delete(messages).where(eq(messages.conversationId, input.id));
      await ctx.db.delete(workspacePanels).where(eq(workspacePanels.conversationId, input.id));
      await ctx.db.delete(conversations).where(eq(conversations.id, input.id));

      return { success: true };
    }),

  getUsage: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      if (input.workspaceId) {
        const rows = await ctx.db
          .select({
            inputTokens: aiUsage.inputTokens,
            outputTokens: aiUsage.outputTokens,
            costCents: aiUsage.costCents,
          })
          .from(aiUsage)
          .innerJoin(conversations, eq(aiUsage.conversationId, conversations.id))
          .where(
            and(eq(aiUsage.userId, ctx.userId), eq(conversations.workspaceId, input.workspaceId)),
          );

        return sumUsageRows(rows);
      }

      const rows = await ctx.db
        .select({
          inputTokens: aiUsage.inputTokens,
          outputTokens: aiUsage.outputTokens,
          costCents: aiUsage.costCents,
        })
        .from(aiUsage)
        .where(eq(aiUsage.userId, ctx.userId));

      return sumUsageRows(rows);
    }),
});
