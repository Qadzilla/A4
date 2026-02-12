import { createFolderSchema, updateFolderSchema } from '@a4/shared-schemas';
import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';

export const folderRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(({ ctx: _ctx, input: _input }) => {
      // TODO: Query database
      return [];
    }),

  create: protectedProcedure.input(createFolderSchema).mutation(({ ctx: _ctx, input: _input }) => {
    // TODO: Insert into database
    return { id: crypto.randomUUID() };
  }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: updateFolderSchema }))
    .mutation(({ ctx: _ctx, input: _input }) => {
      // TODO: Update database
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx: _ctx, input: _input }) => {
      // TODO: Delete from database
      return { success: true };
    }),
});
