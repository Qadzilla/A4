import {
  DEFAULT_NETWORTH_CATEGORIES,
  createNetworthCategorySchema,
  createNetworthEntrySchema,
  updateNetworthCategorySchema,
  updateNetworthEntrySchema,
} from '@a4/shared-schemas';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { networthCategories, networthEntries } from '../../db/schema';
import { protectedProcedure, router } from '../trpc';

export const networthRouter = router({
  listCategories: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(networthCategories)
        .where(
          and(
            eq(networthCategories.workspaceId, input.workspaceId),
            eq(networthCategories.userId, ctx.userId),
          ),
        )
        .orderBy(networthCategories.kind, networthCategories.name);
    }),

  createCategory: protectedProcedure
    .input(createNetworthCategorySchema)
    .mutation(async ({ ctx, input }) => {
      const id = crypto.randomUUID();
      const now = new Date();

      await ctx.db.insert(networthCategories).values({
        id,
        workspaceId: input.workspaceId,
        userId: ctx.userId,
        name: input.name,
        kind: input.kind,
        isDefault: input.isDefault ?? false,
        createdAt: now,
        updatedAt: now,
      });

      return { id };
    }),

  updateCategory: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: updateNetworthCategorySchema }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: networthCategories.id })
        .from(networthCategories)
        .where(and(eq(networthCategories.id, input.id), eq(networthCategories.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Net worth category not found' });
      }

      await ctx.db
        .update(networthCategories)
        .set({ ...input.data, updatedAt: new Date() })
        .where(eq(networthCategories.id, input.id));

      return { success: true };
    }),

  deleteCategory: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: networthCategories.id })
        .from(networthCategories)
        .where(and(eq(networthCategories.id, input.id), eq(networthCategories.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Net worth category not found' });
      }

      // Cascade-delete entries with that categoryId
      await ctx.db
        .delete(networthEntries)
        .where(
          and(eq(networthEntries.categoryId, input.id), eq(networthEntries.userId, ctx.userId)),
        );

      await ctx.db.delete(networthCategories).where(eq(networthCategories.id, input.id));

      return { success: true };
    }),

  seedDefaults: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Idempotent: only seed if no categories exist for this workspace/user
      const existing = await ctx.db
        .select({ id: networthCategories.id })
        .from(networthCategories)
        .where(
          and(
            eq(networthCategories.workspaceId, input.workspaceId),
            eq(networthCategories.userId, ctx.userId),
          ),
        )
        .limit(1);

      if (existing.length > 0) return { seeded: false };

      const now = new Date();
      const values = DEFAULT_NETWORTH_CATEGORIES.map((cat) => ({
        id: crypto.randomUUID(),
        workspaceId: input.workspaceId,
        userId: ctx.userId,
        name: cat.name,
        kind: cat.kind,
        isDefault: cat.isDefault,
        createdAt: now,
        updatedAt: now,
      }));

      await ctx.db.insert(networthCategories).values(values);

      return { seeded: true };
    }),

  listEntries: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(networthEntries)
        .where(
          and(
            eq(networthEntries.workspaceId, input.workspaceId),
            eq(networthEntries.userId, ctx.userId),
          ),
        )
        .orderBy(networthEntries.name);
    }),

  createEntry: protectedProcedure
    .input(createNetworthEntrySchema)
    .mutation(async ({ ctx, input }) => {
      const id = crypto.randomUUID();
      const now = new Date();

      await ctx.db.insert(networthEntries).values({
        id,
        workspaceId: input.workspaceId,
        userId: ctx.userId,
        name: input.name,
        categoryId: input.categoryId,
        value: input.value,
        notes: input.notes ?? null,
        createdAt: now,
        updatedAt: now,
      });

      return { id };
    }),

  updateEntry: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: updateNetworthEntrySchema }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: networthEntries.id })
        .from(networthEntries)
        .where(and(eq(networthEntries.id, input.id), eq(networthEntries.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Net worth entry not found' });
      }

      await ctx.db
        .update(networthEntries)
        .set({ ...input.data, updatedAt: new Date() })
        .where(eq(networthEntries.id, input.id));

      return { success: true };
    }),

  deleteEntry: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: networthEntries.id })
        .from(networthEntries)
        .where(and(eq(networthEntries.id, input.id), eq(networthEntries.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Net worth entry not found' });
      }

      await ctx.db.delete(networthEntries).where(eq(networthEntries.id, input.id));

      return { success: true };
    }),

  getSummary: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const whereClause = and(
        eq(networthEntries.workspaceId, input.workspaceId),
        eq(networthEntries.userId, ctx.userId),
      );

      const allEntries = await ctx.db
        .select({
          value: networthEntries.value,
          categoryId: networthEntries.categoryId,
        })
        .from(networthEntries)
        .where(whereClause);

      const allCategories = await ctx.db
        .select({
          id: networthCategories.id,
          kind: networthCategories.kind,
        })
        .from(networthCategories)
        .where(
          and(
            eq(networthCategories.workspaceId, input.workspaceId),
            eq(networthCategories.userId, ctx.userId),
          ),
        );

      const catKindMap = new Map(allCategories.map((c) => [c.id, c.kind]));

      let totalAssets = 0;
      let totalLiabilities = 0;

      for (const entry of allEntries) {
        const kind = catKindMap.get(entry.categoryId);
        if (kind === 'asset') {
          totalAssets += entry.value;
        } else if (kind === 'liability') {
          totalLiabilities += entry.value;
        }
      }

      return {
        totalAssets,
        totalLiabilities,
        netWorth: totalAssets - totalLiabilities,
        entryCount: allEntries.length,
      };
    }),
});
