import { createCategorizationRuleSchema, updateCategorizationRuleSchema } from '@a4/shared-schemas';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { categories, categorizationRules } from '../../db/schema';
import { protectedProcedure, router } from '../trpc';

export const categorizationRuleRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: categorizationRules.id,
          pattern: categorizationRules.pattern,
          categoryId: categorizationRules.categoryId,
          categoryName: categories.name,
          categoryColor: categories.color,
          createdAt: categorizationRules.createdAt,
        })
        .from(categorizationRules)
        .leftJoin(categories, eq(categorizationRules.categoryId, categories.id))
        .where(
          and(
            eq(categorizationRules.workspaceId, input.workspaceId),
            eq(categorizationRules.userId, ctx.userId),
          ),
        )
        .orderBy(categorizationRules.pattern);

      return rows;
    }),

  create: protectedProcedure
    .input(createCategorizationRuleSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify category belongs to user
      const [cat] = await ctx.db
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.id, input.categoryId), eq(categories.userId, ctx.userId)));

      if (!cat) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Category not found' });
      }

      const id = crypto.randomUUID();
      const now = new Date();

      await ctx.db.insert(categorizationRules).values({
        id,
        workspaceId: input.workspaceId,
        userId: ctx.userId,
        pattern: input.pattern,
        categoryId: input.categoryId,
        createdAt: now,
        updatedAt: now,
      });

      return { id };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: updateCategorizationRuleSchema }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: categorizationRules.id })
        .from(categorizationRules)
        .where(
          and(eq(categorizationRules.id, input.id), eq(categorizationRules.userId, ctx.userId)),
        );

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Rule not found' });
      }

      if (input.data.categoryId) {
        const [cat] = await ctx.db
          .select({ id: categories.id })
          .from(categories)
          .where(and(eq(categories.id, input.data.categoryId), eq(categories.userId, ctx.userId)));

        if (!cat) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Category not found' });
        }
      }

      await ctx.db
        .update(categorizationRules)
        .set({ ...input.data, updatedAt: new Date() })
        .where(eq(categorizationRules.id, input.id));

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: categorizationRules.id })
        .from(categorizationRules)
        .where(
          and(eq(categorizationRules.id, input.id), eq(categorizationRules.userId, ctx.userId)),
        );

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Rule not found' });
      }

      await ctx.db.delete(categorizationRules).where(eq(categorizationRules.id, input.id));

      return { success: true };
    }),
});
