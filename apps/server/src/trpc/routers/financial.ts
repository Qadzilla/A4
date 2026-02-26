import {
  createTransactionSchema,
  transactionFilterSchema,
  updateTransactionSchema,
} from '@a4/shared-schemas';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, gte, lte, sql, sum } from 'drizzle-orm';
import { z } from 'zod';
import { transactions } from '../../db/schema';
import { protectedProcedure, router } from '../trpc';

export const financialRouter = router({
  listTransactions: protectedProcedure
    .input(transactionFilterSchema)
    .query(async ({ ctx, input }) => {
      const conditions = [
        eq(transactions.workspaceId, input.workspaceId),
        eq(transactions.userId, ctx.userId),
      ];

      if (input.type) conditions.push(eq(transactions.type, input.type));
      if (input.categoryId) conditions.push(eq(transactions.categoryId, input.categoryId));
      if (input.startDate) conditions.push(gte(transactions.date, input.startDate));
      if (input.endDate) conditions.push(lte(transactions.date, input.endDate));

      return ctx.db
        .select()
        .from(transactions)
        .where(and(...conditions))
        .orderBy(desc(transactions.date));
    }),

  createTransaction: protectedProcedure
    .input(createTransactionSchema)
    .mutation(async ({ ctx, input }) => {
      const id = crypto.randomUUID();
      const now = new Date();

      await ctx.db.insert(transactions).values({
        id,
        workspaceId: input.workspaceId,
        userId: ctx.userId,
        date: input.date,
        description: input.description,
        amount: input.amount,
        type: input.type,
        categoryId: input.categoryId ?? null,
        notes: input.notes ?? null,
        createdAt: now,
        updatedAt: now,
      });

      return { id };
    }),

  updateTransaction: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: updateTransactionSchema }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: transactions.id })
        .from(transactions)
        .where(and(eq(transactions.id, input.id), eq(transactions.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Transaction not found' });
      }

      await ctx.db
        .update(transactions)
        .set({ ...input.data, updatedAt: new Date() })
        .where(eq(transactions.id, input.id));

      return { success: true };
    }),

  deleteTransaction: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: transactions.id })
        .from(transactions)
        .where(and(eq(transactions.id, input.id), eq(transactions.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Transaction not found' });
      }

      await ctx.db.delete(transactions).where(eq(transactions.id, input.id));

      return { success: true };
    }),

  bulkCreateTransactions: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        transactions: z.array(
          z.object({
            date: z.string().min(1),
            description: z.string().min(1).max(500),
            amount: z.number().nonnegative(),
            type: z.enum(['income', 'expense']),
            categoryId: z.string().uuid().nullable().optional(),
            notes: z.string().max(1000).optional(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const rows = input.transactions.map((t) => ({
        id: crypto.randomUUID(),
        workspaceId: input.workspaceId,
        userId: ctx.userId,
        date: t.date,
        description: t.description,
        amount: t.amount,
        type: t.type,
        categoryId: t.categoryId ?? null,
        notes: t.notes ?? null,
        createdAt: now,
        updatedAt: now,
      }));

      if (rows.length > 0) {
        await ctx.db.insert(transactions).values(rows);
      }

      return { count: rows.length };
    }),

  getSummary: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [
        eq(transactions.workspaceId, input.workspaceId),
        eq(transactions.userId, ctx.userId),
      ];

      if (input.startDate) conditions.push(gte(transactions.date, input.startDate));
      if (input.endDate) conditions.push(lte(transactions.date, input.endDate));

      const whereClause = and(...conditions);

      const [incomeResult] = await ctx.db
        .select({ total: sum(transactions.amount) })
        .from(transactions)
        .where(and(whereClause, eq(transactions.type, 'income')));

      const [expenseResult] = await ctx.db
        .select({ total: sum(transactions.amount) })
        .from(transactions)
        .where(and(whereClause, eq(transactions.type, 'expense')));

      const [countResult] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(transactions)
        .where(whereClause);

      const totalIncome = Number(incomeResult?.total ?? 0);
      const totalExpenses = Number(expenseResult?.total ?? 0);

      return {
        totalIncome,
        totalExpenses,
        net: totalIncome - totalExpenses,
        count: countResult?.count ?? 0,
      };
    }),
});
