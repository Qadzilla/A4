import { TRPCError } from '@trpc/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { files, tax1099s, taxProfiles, trades } from '../../db/schema';
import { computeRealizedGains, reconcile1099 } from '../../lib/calc';
import type { Extracted1099 } from '../../lib/calc';
import { buildTaxPicture, loadTaxProfile } from '../../services/tax-picture';
import { protectedProcedure, router } from '../trpc';

/**
 * The tax pillar's data + math (P4). The profile stores the user's inputs;
 * `picture` runs the deterministic estimator over them and folds in the
 * portfolio's unrealized-gains context so the surface can show the 0% LTCG
 * harvesting headroom. Everything here is an educational estimate — the
 * client renders that framing, the server never pretends otherwise.
 */

const profileUpdateSchema = z.object({
  taxYear: z.number().int().min(2025).max(2026).optional(),
  filingStatus: z.enum(['single', 'mfj', 'mfs', 'hoh']).optional(),
  stateCode: z.string().max(2).optional(),
  w2Wages: z.number().min(0).optional(),
  selfEmploymentIncome: z.number().min(0).optional(),
  investmentIncome: z.number().min(0).optional(),
  capitalGainsShort: z.number().optional(), // net; may be negative (losses)
  capitalGainsLong: z.number().optional(),
  otherIncome: z.number().min(0).optional(),
  retirement401k: z.number().min(0).optional(),
  traditionalIRA: z.number().min(0).optional(),
  hsaContribution: z.number().min(0).optional(),
  studentLoanInterest: z.number().min(0).optional(),
  deductionType: z.enum(['standard', 'itemized']).optional(),
  saltDeduction: z.number().min(0).optional(),
  mortgageInterest: z.number().min(0).optional(),
  charitableGiving: z.number().min(0).optional(),
  otherItemized: z.number().min(0).optional(),
  numDependentChildren: z.number().int().min(0).optional(),
  otherCredits: z.number().min(0).optional(),
  federalWithheld: z.number().min(0).optional(),
  stateWithheld: z.number().min(0).optional(),
  estimatedPayments: z.number().min(0).optional(),
  priorYearTax: z.number().min(0).nullable().optional(),
  priorYearAgi: z.number().min(0).nullable().optional(),
});

export const taxRouter = router({
  getProfile: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return loadTaxProfile(ctx.db, ctx.userId, input.workspaceId);
    }),

  updateProfile: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid(), data: profileUpdateSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await loadTaxProfile(ctx.db, ctx.userId, input.workspaceId);
      const now = new Date();
      if (existing) {
        await ctx.db
          .update(taxProfiles)
          .set({ ...input.data, updatedAt: now })
          .where(eq(taxProfiles.id, existing.id));
        return { id: existing.id };
      }
      const id = crypto.randomUUID();
      await ctx.db.insert(taxProfiles).values({
        id,
        workspaceId: input.workspaceId,
        userId: ctx.userId,
        ...input.data,
        createdAt: now,
        updatedAt: now,
      });
      return { id };
    }),

  /**
   * The realized-gains ledger: FIFO lot matching with wash-sale detection
   * over the imported trade history, reported for one tax year. Null when
   * there are no trades at all — the surface hides the section entirely.
   */
  realizedGains: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid(), taxYear: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(trades)
        .where(and(eq(trades.workspaceId, input.workspaceId), eq(trades.userId, ctx.userId)));
      if (rows.length === 0) return null;
      const summary = computeRealizedGains(
        rows.map((t) => ({
          id: t.id,
          symbol: t.symbol,
          side: t.side as 'buy' | 'sell',
          tradeDate: t.tradeDate,
          units: t.units,
          price: t.price,
          fees: t.fees,
        })),
        input.taxYear,
      );
      return { ...summary, tradeCount: rows.length };
    }),

  /** Extracted 1099s for the workspace, newest first. */
  list1099s: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: tax1099s.id,
          fileId: tax1099s.fileId,
          taxYear: tax1099s.taxYear,
          broker: tax1099s.broker,
          createdAt: tax1099s.createdAt,
          fileName: files.fileName,
        })
        .from(tax1099s)
        .leftJoin(files, eq(files.id, tax1099s.fileId))
        .where(and(eq(tax1099s.workspaceId, input.workspaceId), eq(tax1099s.userId, ctx.userId)))
        .orderBy(desc(tax1099s.createdAt));
      return rows;
    }),

  /**
   * Broker-reported vs computed: reconcile one extracted 1099 against the
   * lot engine's ledger for that form's tax year.
   */
  reconciliation: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid(), fileId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select()
        .from(tax1099s)
        .where(
          and(
            eq(tax1099s.fileId, input.fileId),
            eq(tax1099s.workspaceId, input.workspaceId),
            eq(tax1099s.userId, ctx.userId),
          ),
        );
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '1099 not found' });
      }
      const extracted = JSON.parse(row.payload) as Extracted1099;
      const tradeRows = await ctx.db
        .select()
        .from(trades)
        .where(and(eq(trades.workspaceId, input.workspaceId), eq(trades.userId, ctx.userId)));
      const ledger = computeRealizedGains(
        tradeRows.map((t) => ({
          id: t.id,
          symbol: t.symbol,
          side: t.side as 'buy' | 'sell',
          tradeDate: t.tradeDate,
          units: t.units,
          price: t.price,
          fees: t.fees,
        })),
        row.taxYear,
      );
      return {
        taxYear: row.taxYear,
        broker: row.broker,
        reportedRowCount: extracted.rows.length,
        ...reconcile1099(extracted, ledger.sales),
      };
    }),

  /**
   * The year-round meter: full estimate + quarterly safe-harbor plan +
   * unrealized-gains context (long/short split by acquiredAt where known).
   */
  picture: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return buildTaxPicture(ctx.db, ctx.userId, input.workspaceId);
    }),
});
