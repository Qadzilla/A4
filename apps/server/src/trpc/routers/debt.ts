import { createDebtSchema, updateDebtSchema } from '@a4/shared-schemas';
import { TRPCError } from '@trpc/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { debts } from '../../db/schema';
import { protectedProcedure, router } from '../trpc';

export const debtRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(debts)
        .where(and(eq(debts.workspaceId, input.workspaceId), eq(debts.userId, ctx.userId)))
        .orderBy(desc(debts.balance));
    }),

  create: protectedProcedure.input(createDebtSchema).mutation(async ({ ctx, input }) => {
    const id = crypto.randomUUID();
    const now = new Date();

    await ctx.db.insert(debts).values({
      id,
      workspaceId: input.workspaceId,
      userId: ctx.userId,
      name: input.name,
      balance: input.balance,
      annualInterestRate: input.annualInterestRate,
      minimumPayment: input.minimumPayment,
      createdAt: now,
      updatedAt: now,
    });

    return { id };
  }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: updateDebtSchema }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: debts.id })
        .from(debts)
        .where(and(eq(debts.id, input.id), eq(debts.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Debt not found' });
      }

      await ctx.db
        .update(debts)
        .set({ ...input.data, updatedAt: new Date() })
        .where(eq(debts.id, input.id));

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: debts.id })
        .from(debts)
        .where(and(eq(debts.id, input.id), eq(debts.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Debt not found' });
      }

      await ctx.db.delete(debts).where(eq(debts.id, input.id));

      return { success: true };
    }),

  getSummary: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const allDebts = await ctx.db
        .select({
          balance: debts.balance,
          annualInterestRate: debts.annualInterestRate,
          minimumPayment: debts.minimumPayment,
        })
        .from(debts)
        .where(and(eq(debts.workspaceId, input.workspaceId), eq(debts.userId, ctx.userId)));

      let totalBalance = 0;
      let totalMinPayment = 0;
      let highestAPR = 0;

      for (const d of allDebts) {
        totalBalance += d.balance;
        totalMinPayment += d.minimumPayment;
        if (d.annualInterestRate > highestAPR) highestAPR = d.annualInterestRate;
      }

      return {
        totalBalance,
        totalMinPayment,
        count: allDebts.length,
        highestAPR,
      };
    }),
});
