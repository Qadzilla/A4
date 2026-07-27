import {
  createInvoiceLineItemSchema,
  createInvoiceSchema,
  updateInvoiceLineItemSchema,
  updateInvoiceSchema,
} from '@a4/shared-schemas';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { invoiceLineItems, invoices } from '../../db/schema';
import { scheduleLinkStructuredData } from '../../services/entity-linking';
import { protectedProcedure, router } from '../trpc';

export const invoiceRouter = router({
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [invoice] = await ctx.db
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, input.id), eq(invoices.userId, ctx.userId)));

      if (!invoice) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invoice not found' });
      }

      return invoice;
    }),

  list: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(invoices)
        .where(and(eq(invoices.workspaceId, input.workspaceId), eq(invoices.userId, ctx.userId)))
        .orderBy(invoices.date);
    }),

  create: protectedProcedure.input(createInvoiceSchema).mutation(async ({ ctx, input }) => {
    const id = crypto.randomUUID();
    const now = new Date();

    await ctx.db.insert(invoices).values({
      id,
      workspaceId: input.workspaceId,
      userId: ctx.userId,
      invoiceNumber: input.invoiceNumber,
      date: input.date,
      dueDate: input.dueDate,
      fromName: input.fromName ?? null,
      fromAddress: input.fromAddress ?? null,
      fromEmail: input.fromEmail ?? null,
      toName: input.toName ?? null,
      toAddress: input.toAddress ?? null,
      toEmail: input.toEmail ?? null,
      taxRate: input.taxRate,
      notes: input.notes ?? null,
      status: input.status,
      createdAt: now,
      updatedAt: now,
    });

    scheduleLinkStructuredData(input.workspaceId, ctx.db);
    return { id };
  }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: updateInvoiceSchema }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: invoices.id, workspaceId: invoices.workspaceId })
        .from(invoices)
        .where(and(eq(invoices.id, input.id), eq(invoices.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invoice not found' });
      }

      await ctx.db
        .update(invoices)
        .set({ ...input.data, updatedAt: new Date() })
        .where(eq(invoices.id, input.id));

      scheduleLinkStructuredData(existing.workspaceId, ctx.db);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: invoices.id, workspaceId: invoices.workspaceId })
        .from(invoices)
        .where(and(eq(invoices.id, input.id), eq(invoices.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invoice not found' });
      }

      // Cascade delete line items
      await ctx.db.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, input.id));
      await ctx.db.delete(invoices).where(eq(invoices.id, input.id));

      return { success: true };
    }),

  listLineItems: protectedProcedure
    .input(z.object({ invoiceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(invoiceLineItems)
        .where(eq(invoiceLineItems.invoiceId, input.invoiceId))
        .orderBy(invoiceLineItems.sortOrder);
    }),

  createLineItem: protectedProcedure
    .input(createInvoiceLineItemSchema)
    .mutation(async ({ ctx, input }) => {
      const id = crypto.randomUUID();
      const now = new Date();

      await ctx.db.insert(invoiceLineItems).values({
        id,
        invoiceId: input.invoiceId,
        description: input.description,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        sortOrder: input.sortOrder,
        createdAt: now,
        updatedAt: now,
      });

      return { id };
    }),

  updateLineItem: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: updateInvoiceLineItemSchema }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: invoiceLineItems.id })
        .from(invoiceLineItems)
        .where(eq(invoiceLineItems.id, input.id));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Line item not found' });
      }

      await ctx.db
        .update(invoiceLineItems)
        .set({ ...input.data, updatedAt: new Date() })
        .where(eq(invoiceLineItems.id, input.id));

      return { success: true };
    }),

  deleteLineItem: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(invoiceLineItems).where(eq(invoiceLineItems.id, input.id));
      return { success: true };
    }),

  getSummary: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const allInvoices = await ctx.db
        .select({ id: invoices.id, status: invoices.status })
        .from(invoices)
        .where(and(eq(invoices.workspaceId, input.workspaceId), eq(invoices.userId, ctx.userId)));

      const byStatus = { draft: 0, sent: 0, paid: 0, overdue: 0 };
      for (const inv of allInvoices) {
        byStatus[inv.status as keyof typeof byStatus]++;
      }

      return { count: allInvoices.length, byStatus };
    }),
});
