import { createSubscriptionSchema, updateSubscriptionSchema } from '@a4/shared-schemas';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { subscriptions } from '../../db/schema';
import { protectedProcedure, router } from '../trpc';

const MONTHLY_MULTIPLIERS: Record<string, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  annual: 1 / 12,
};

export const subscriptionRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.workspaceId, input.workspaceId),
            eq(subscriptions.userId, ctx.userId),
          ),
        )
        .orderBy(subscriptions.nextBillingDate);
    }),

  create: protectedProcedure.input(createSubscriptionSchema).mutation(async ({ ctx, input }) => {
    const id = crypto.randomUUID();
    const now = new Date();

    await ctx.db.insert(subscriptions).values({
      id,
      workspaceId: input.workspaceId,
      userId: ctx.userId,
      name: input.name,
      amount: input.amount,
      frequency: input.frequency,
      startDate: input.startDate,
      nextBillingDate: input.nextBillingDate,
      categoryId: input.categoryId ?? null,
      status: input.status,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return { id };
  }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: updateSubscriptionSchema }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(and(eq(subscriptions.id, input.id), eq(subscriptions.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Subscription not found' });
      }

      await ctx.db
        .update(subscriptions)
        .set({ ...input.data, updatedAt: new Date() })
        .where(eq(subscriptions.id, input.id));

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(and(eq(subscriptions.id, input.id), eq(subscriptions.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Subscription not found' });
      }

      await ctx.db.delete(subscriptions).where(eq(subscriptions.id, input.id));

      return { success: true };
    }),

  getSummary: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const allSubs = await ctx.db
        .select({
          amount: subscriptions.amount,
          frequency: subscriptions.frequency,
          status: subscriptions.status,
        })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.workspaceId, input.workspaceId),
            eq(subscriptions.userId, ctx.userId),
          ),
        );

      let monthlyCost = 0;
      const byStatus = { active: 0, paused: 0, cancelled: 0 };

      for (const sub of allSubs) {
        byStatus[sub.status as keyof typeof byStatus]++;
        if (sub.status === 'active') {
          monthlyCost += sub.amount * (MONTHLY_MULTIPLIERS[sub.frequency] ?? 1);
        }
      }

      return {
        monthlyCost,
        annualCost: monthlyCost * 12,
        count: allSubs.length,
        byStatus,
      };
    }),
});
