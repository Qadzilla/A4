import {
  createWorkspaceSchema,
  updateThumbnailSchema,
  updateWorkspaceSchema,
} from '@a4/shared-schemas';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { canvasConnections, canvasItems, workspaces } from '../../db/schema';
import { protectedProcedure, router } from '../trpc';

export const workspaceRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.userId, ctx.userId), isNull(workspaces.deletedAt)))
      .orderBy(desc(workspaces.updatedAt));
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [workspace] = await ctx.db
        .select()
        .from(workspaces)
        .where(and(eq(workspaces.id, input.id), eq(workspaces.userId, ctx.userId)));

      if (!workspace) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' });
      }

      return workspace;
    }),

  create: protectedProcedure.input(createWorkspaceSchema).mutation(async ({ ctx, input }) => {
    const id = crypto.randomUUID();
    const now = new Date();

    await ctx.db.insert(workspaces).values({
      id,
      name: input.name,
      description: input.description ?? null,
      userId: ctx.userId,
      createdAt: now,
      updatedAt: now,
      type: input.type ?? 'workspace',
      parentId: input.parentId ?? null,
    });

    return { id, type: input.type ?? 'workspace' };
  }),

  listByFolder: protectedProcedure
    .input(z.object({ folderId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(workspaces)
        .where(
          and(
            eq(workspaces.parentId, input.folderId),
            eq(workspaces.userId, ctx.userId),
            isNull(workspaces.deletedAt),
          ),
        )
        .orderBy(desc(workspaces.updatedAt));
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: updateWorkspaceSchema }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(and(eq(workspaces.id, input.id), eq(workspaces.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' });
      }

      await ctx.db
        .update(workspaces)
        .set({ ...input.data, updatedAt: new Date() })
        .where(eq(workspaces.id, input.id));

      return { success: true };
    }),

  updateThumbnail: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: updateThumbnailSchema }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(and(eq(workspaces.id, input.id), eq(workspaces.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' });
      }

      await ctx.db
        .update(workspaces)
        .set({ thumbnail: input.data.thumbnail })
        .where(eq(workspaces.id, input.id));

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(and(eq(workspaces.id, input.id), eq(workspaces.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' });
      }

      const now = new Date();

      // Soft-delete children first, then the item itself
      await ctx.db
        .update(workspaces)
        .set({ deletedAt: now })
        .where(and(eq(workspaces.parentId, input.id), eq(workspaces.userId, ctx.userId)));
      await ctx.db
        .update(workspaces)
        .set({ deletedAt: now })
        .where(eq(workspaces.id, input.id));

      return { success: true };
    }),

  listTrashed: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.userId, ctx.userId), isNotNull(workspaces.deletedAt)))
      .orderBy(desc(workspaces.deletedAt));
  }),

  restore: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(and(eq(workspaces.id, input.id), eq(workspaces.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' });
      }

      // Restore children first, then the item itself
      await ctx.db
        .update(workspaces)
        .set({ deletedAt: null })
        .where(and(eq(workspaces.parentId, input.id), eq(workspaces.userId, ctx.userId)));
      await ctx.db
        .update(workspaces)
        .set({ deletedAt: null })
        .where(eq(workspaces.id, input.id));

      return { success: true };
    }),

  permanentDelete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: workspaces.id, deletedAt: workspaces.deletedAt })
        .from(workspaces)
        .where(and(eq(workspaces.id, input.id), eq(workspaces.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' });
      }

      if (!existing.deletedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Workspace must be in trash before permanent deletion',
        });
      }

      // Collect child workspace IDs for cascade
      const children = await ctx.db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(and(eq(workspaces.parentId, input.id), eq(workspaces.userId, ctx.userId)));
      const allIds = [input.id, ...children.map((c) => c.id)];

      // Cascade-delete canvas data for all affected workspaces
      for (const wsId of allIds) {
        await ctx.db
          .delete(canvasConnections)
          .where(and(eq(canvasConnections.workspaceId, wsId), eq(canvasConnections.userId, ctx.userId)));
        await ctx.db
          .delete(canvasItems)
          .where(and(eq(canvasItems.workspaceId, wsId), eq(canvasItems.userId, ctx.userId)));
      }

      // Hard-delete children first, then the item itself
      await ctx.db
        .delete(workspaces)
        .where(and(eq(workspaces.parentId, input.id), eq(workspaces.userId, ctx.userId)));
      await ctx.db.delete(workspaces).where(eq(workspaces.id, input.id));

      return { success: true };
    }),
});
