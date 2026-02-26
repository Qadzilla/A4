import {
  createBudgetCategorySchema,
  createBudgetGroupSchema,
  updateBudgetCategorySchema,
  updateBudgetGroupSchema,
} from '@a4/shared-schemas';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { budgetCategories, budgetGroups } from '../../db/schema';
import { protectedProcedure, router } from '../trpc';

export const budgetRouter = router({
  listCategories: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(budgetCategories)
        .where(
          and(
            eq(budgetCategories.workspaceId, input.workspaceId),
            eq(budgetCategories.userId, ctx.userId),
          ),
        )
        .orderBy(budgetCategories.name);
    }),

  createCategory: protectedProcedure
    .input(createBudgetCategorySchema)
    .mutation(async ({ ctx, input }) => {
      const id = crypto.randomUUID();
      const now = new Date();

      await ctx.db.insert(budgetCategories).values({
        id,
        workspaceId: input.workspaceId,
        userId: ctx.userId,
        name: input.name,
        budgeted: input.budgeted,
        actual: input.actual,
        source: input.source ?? null,
        notes: input.notes ?? null,
        groupId: input.groupId ?? null,
        createdAt: now,
        updatedAt: now,
      });

      return { id };
    }),

  updateCategory: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: updateBudgetCategorySchema }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: budgetCategories.id })
        .from(budgetCategories)
        .where(and(eq(budgetCategories.id, input.id), eq(budgetCategories.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Budget category not found' });
      }

      await ctx.db
        .update(budgetCategories)
        .set({ ...input.data, updatedAt: new Date() })
        .where(eq(budgetCategories.id, input.id));

      return { success: true };
    }),

  deleteCategory: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: budgetCategories.id })
        .from(budgetCategories)
        .where(and(eq(budgetCategories.id, input.id), eq(budgetCategories.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Budget category not found' });
      }

      await ctx.db.delete(budgetCategories).where(eq(budgetCategories.id, input.id));

      return { success: true };
    }),

  listGroups: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(budgetGroups)
        .where(
          and(
            eq(budgetGroups.workspaceId, input.workspaceId),
            eq(budgetGroups.userId, ctx.userId),
          ),
        )
        .orderBy(budgetGroups.name);
    }),

  createGroup: protectedProcedure
    .input(createBudgetGroupSchema)
    .mutation(async ({ ctx, input }) => {
      const id = crypto.randomUUID();
      const now = new Date();

      await ctx.db.insert(budgetGroups).values({
        id,
        workspaceId: input.workspaceId,
        userId: ctx.userId,
        name: input.name,
        color: input.color,
        createdAt: now,
        updatedAt: now,
      });

      return { id, name: input.name, color: input.color };
    }),

  updateGroup: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: updateBudgetGroupSchema }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: budgetGroups.id })
        .from(budgetGroups)
        .where(and(eq(budgetGroups.id, input.id), eq(budgetGroups.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Budget group not found' });
      }

      await ctx.db
        .update(budgetGroups)
        .set({ ...input.data, updatedAt: new Date() })
        .where(eq(budgetGroups.id, input.id));

      return { success: true };
    }),

  deleteGroup: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: budgetGroups.id })
        .from(budgetGroups)
        .where(and(eq(budgetGroups.id, input.id), eq(budgetGroups.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Budget group not found' });
      }

      // Nullify groupId on categories that reference this group
      await ctx.db
        .update(budgetCategories)
        .set({ groupId: null, updatedAt: new Date() })
        .where(and(eq(budgetCategories.groupId, input.id), eq(budgetCategories.userId, ctx.userId)));

      await ctx.db.delete(budgetGroups).where(eq(budgetGroups.id, input.id));

      return { success: true };
    }),

  getSummary: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const allCats = await ctx.db
        .select({
          budgeted: budgetCategories.budgeted,
          actual: budgetCategories.actual,
        })
        .from(budgetCategories)
        .where(
          and(
            eq(budgetCategories.workspaceId, input.workspaceId),
            eq(budgetCategories.userId, ctx.userId),
          ),
        );

      let totalBudgeted = 0;
      let totalActual = 0;

      for (const cat of allCats) {
        totalBudgeted += cat.budgeted;
        totalActual += cat.actual;
      }

      const remaining = totalBudgeted - totalActual;
      const percent = totalBudgeted === 0 ? (totalActual === 0 ? 0 : 100) : (totalActual / totalBudgeted) * 100;

      return { totalBudgeted, totalActual, remaining, percent, count: allCats.length };
    }),
});
