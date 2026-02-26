import { createFolderSchema, updateFolderSchema } from '@a4/shared-schemas';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { workspaces } from '../../db/schema';
import { protectedProcedure, router } from '../trpc';

export const folderRouter = router({
  list: protectedProcedure
    .input(z.object({ parentId: z.string().uuid().nullable().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const parentId = input?.parentId ?? null;

      return ctx.db
        .select()
        .from(workspaces)
        .where(
          and(
            eq(workspaces.type, 'folder'),
            eq(workspaces.userId, ctx.userId),
            isNull(workspaces.deletedAt),
            parentId ? eq(workspaces.parentId, parentId) : isNull(workspaces.parentId),
          ),
        )
        .orderBy(workspaces.name);
    }),

  create: protectedProcedure.input(createFolderSchema).mutation(async ({ ctx, input }) => {
    const id = crypto.randomUUID();
    const now = new Date();

    await ctx.db.insert(workspaces).values({
      id,
      name: input.name,
      userId: ctx.userId,
      type: 'folder',
      parentId: input.parentId ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return { id, name: input.name };
  }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: updateFolderSchema }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(
          and(
            eq(workspaces.id, input.id),
            eq(workspaces.userId, ctx.userId),
            eq(workspaces.type, 'folder'),
          ),
        );

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Folder not found' });
      }

      await ctx.db
        .update(workspaces)
        .set({ ...input.data, updatedAt: new Date() })
        .where(eq(workspaces.id, input.id));

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(
          and(
            eq(workspaces.id, input.id),
            eq(workspaces.userId, ctx.userId),
            eq(workspaces.type, 'folder'),
          ),
        );

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Folder not found' });
      }

      const now = new Date();

      // Cascade soft-delete children first
      await ctx.db
        .update(workspaces)
        .set({ deletedAt: now })
        .where(and(eq(workspaces.parentId, input.id), eq(workspaces.userId, ctx.userId)));

      // Then soft-delete the folder itself
      await ctx.db.update(workspaces).set({ deletedAt: now }).where(eq(workspaces.id, input.id));

      return { success: true };
    }),
});
