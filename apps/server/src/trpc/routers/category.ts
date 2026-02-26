import { createCategorySchema, updateCategorySchema } from '@a4/shared-schemas';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { categories } from '../../db/schema';
import { protectedProcedure, router } from '../trpc';

export const categoryRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        context: z.enum(['ledger', 'receipt', 'subscription']).default('ledger'),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.workspaceId, input.workspaceId),
            eq(categories.userId, ctx.userId),
            eq(categories.context, input.context),
          ),
        )
        .orderBy(categories.name);
    }),

  create: protectedProcedure.input(createCategorySchema).mutation(async ({ ctx, input }) => {
    const id = crypto.randomUUID();
    const now = new Date();

    await ctx.db.insert(categories).values({
      id,
      workspaceId: input.workspaceId,
      userId: ctx.userId,
      name: input.name,
      color: input.color,
      type: input.type,
      context: input.context ?? 'ledger',
      createdAt: now,
      updatedAt: now,
    });

    return { id, name: input.name, color: input.color, type: input.type };
  }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: updateCategorySchema }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.id, input.id), eq(categories.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Category not found' });
      }

      await ctx.db
        .update(categories)
        .set({ ...input.data, updatedAt: new Date() })
        .where(eq(categories.id, input.id));

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.id, input.id), eq(categories.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Category not found' });
      }

      await ctx.db.delete(categories).where(eq(categories.id, input.id));

      return { success: true };
    }),
});
