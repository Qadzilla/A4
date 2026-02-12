import { createConversationSchema, sendMessageSchema } from '@a4/shared-schemas';
import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';

export const chatRouter = router({
  listConversations: protectedProcedure.query(({ ctx: _ctx }) => {
    // TODO: Query database
    return [];
  }),

  getConversation: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx: _ctx, input: _input }) => {
      // TODO: Query database
      return null;
    }),

  createConversation: protectedProcedure
    .input(createConversationSchema)
    .mutation(({ ctx: _ctx, input: _input }) => {
      // TODO: Insert into database
      return { id: crypto.randomUUID() };
    }),

  sendMessage: protectedProcedure
    .input(sendMessageSchema)
    .mutation(({ ctx: _ctx, input: _input }) => {
      // TODO: Send to Claude API, stream response, save to database
      return { id: crypto.randomUUID(), content: 'AI response placeholder' };
    }),

  deleteConversation: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx: _ctx, input: _input }) => {
      // TODO: Delete from database
      return { success: true };
    }),
});
