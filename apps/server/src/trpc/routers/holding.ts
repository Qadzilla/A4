import { createHoldingSchema, updateHoldingSchema } from '@a4/shared-schemas';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { holdings } from '../../db/schema';
import { computeBenchmark } from '../../services/benchmark';
import { protectedProcedure, router } from '../trpc';

export const holdingRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(holdings)
        .where(and(eq(holdings.workspaceId, input.workspaceId), eq(holdings.userId, ctx.userId)))
        .orderBy(holdings.symbol);
    }),

  /**
   * Same-dollars, same-dates S&P 500 counterfactual over positions with a
   * known cost basis + acquisition date. Null when nothing is comparable —
   * the client shows an honest empty state instead of a fabricated number.
   */
  benchmark: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await computeBenchmark(ctx.db, ctx.polygon, ctx.userId, input.workspaceId);
      } catch (err) {
        console.warn('[benchmark] computation failed:', err);
        return null; // market data unavailable — degrade, don't error the surface
      }
    }),

  create: protectedProcedure.input(createHoldingSchema).mutation(async ({ ctx, input }) => {
    const id = crypto.randomUUID();
    const now = new Date();

    await ctx.db.insert(holdings).values({
      id,
      workspaceId: input.workspaceId,
      userId: ctx.userId,
      symbol: input.symbol,
      name: input.name,
      value: input.value,
      targetPct: input.targetPct,
      createdAt: now,
      updatedAt: now,
    });

    return { id };
  }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: updateHoldingSchema }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: holdings.id })
        .from(holdings)
        .where(and(eq(holdings.id, input.id), eq(holdings.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Holding not found' });
      }

      await ctx.db
        .update(holdings)
        .set({ ...input.data, updatedAt: new Date() })
        .where(eq(holdings.id, input.id));

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: holdings.id })
        .from(holdings)
        .where(and(eq(holdings.id, input.id), eq(holdings.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Holding not found' });
      }

      await ctx.db.delete(holdings).where(eq(holdings.id, input.id));

      return { success: true };
    }),

  getSummary: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const allHoldings = await ctx.db
        .select({
          value: holdings.value,
          targetPct: holdings.targetPct,
        })
        .from(holdings)
        .where(and(eq(holdings.workspaceId, input.workspaceId), eq(holdings.userId, ctx.userId)));

      let totalValue = 0;
      let maxDrift = 0;

      for (const h of allHoldings) {
        totalValue += h.value;
      }

      for (const h of allHoldings) {
        const actualPct = totalValue > 0 ? (h.value / totalValue) * 100 : 0;
        const drift = Math.abs(actualPct - h.targetPct);
        if (drift > maxDrift) maxDrift = drift;
      }

      const isBalanced = allHoldings.length === 0 || maxDrift <= 1.0;

      return {
        totalValue,
        holdingCount: allHoldings.length,
        isBalanced,
        maxDrift,
      };
    }),
});
