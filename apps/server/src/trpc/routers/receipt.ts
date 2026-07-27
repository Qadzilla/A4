import { createReceiptSchema, updateReceiptSchema } from '@a4/shared-schemas';
import { TRPCError } from '@trpc/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { receipts } from '../../db/schema';
import { scheduleLinkStructuredData } from '../../services/entity-linking';
import { protectedProcedure, router } from '../trpc';

export const receiptRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(receipts)
        .where(and(eq(receipts.workspaceId, input.workspaceId), eq(receipts.userId, ctx.userId)))
        .orderBy(desc(receipts.date));
    }),

  create: protectedProcedure.input(createReceiptSchema).mutation(async ({ ctx, input }) => {
    const id = crypto.randomUUID();
    const now = new Date();

    await ctx.db.insert(receipts).values({
      id,
      workspaceId: input.workspaceId,
      userId: ctx.userId,
      date: input.date,
      merchant: input.merchant,
      amount: input.amount,
      tax: input.tax,
      paymentMethod: input.paymentMethod,
      categoryId: input.categoryId ?? null,
      status: input.status,
      linkedFileId: input.linkedFileId ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    });

    scheduleLinkStructuredData(input.workspaceId, ctx.db);
    return { id };
  }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: updateReceiptSchema }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: receipts.id, workspaceId: receipts.workspaceId })
        .from(receipts)
        .where(and(eq(receipts.id, input.id), eq(receipts.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Receipt not found' });
      }

      await ctx.db
        .update(receipts)
        .set({ ...input.data, updatedAt: new Date() })
        .where(eq(receipts.id, input.id));

      scheduleLinkStructuredData(existing.workspaceId, ctx.db);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: receipts.id })
        .from(receipts)
        .where(and(eq(receipts.id, input.id), eq(receipts.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Receipt not found' });
      }

      await ctx.db.delete(receipts).where(eq(receipts.id, input.id));

      return { success: true };
    }),

  getSummary: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const allReceipts = await ctx.db
        .select({
          amount: receipts.amount,
          tax: receipts.tax,
          status: receipts.status,
        })
        .from(receipts)
        .where(and(eq(receipts.workspaceId, input.workspaceId), eq(receipts.userId, ctx.userId)));

      let totalAmount = 0;
      let totalTax = 0;
      const byStatus = { pending: 0, reviewed: 0, reimbursed: 0 };

      for (const r of allReceipts) {
        totalAmount += r.amount;
        totalTax += r.tax;
        byStatus[r.status as keyof typeof byStatus]++;
      }

      return { totalAmount, totalTax, count: allReceipts.length, byStatus };
    }),
});
