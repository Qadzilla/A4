import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { holdings } from '../../db/schema';
import { getDeskStatus } from '../../services/desk';
import { protectedProcedure, router } from '../trpc';

const DAY_MS = 24 * 60 * 60 * 1000;
const LONG_TERM_DAYS = 365;

/** Where a tax year stands: the desk's default view. */
export const deskRouter = router({
  /**
   * Every position with the things a decision turns on: what it cost, what
   * it's worth, which side of the one-year line it sits on, and how long
   * until that changes. One place for the arithmetic, so the panels that
   * slice it differently can't drift apart.
   */
  positions: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(holdings)
        .where(and(eq(holdings.workspaceId, input.workspaceId), eq(holdings.userId, ctx.userId)))
        .orderBy(holdings.symbol);

      const now = Date.now();
      return rows.map((h) => {
        const basisKnown = h.costBasis !== null && h.costBasis > 0;
        const heldDays = h.acquiredAt
          ? Math.floor((now - new Date(`${h.acquiredAt}T00:00:00Z`).getTime()) / DAY_MS)
          : null;
        const isLong = heldDays !== null && heldDays > LONG_TERM_DAYS;
        return {
          id: h.id,
          symbol: h.symbol,
          name: h.name,
          value: h.value,
          quantity: h.quantity,
          costBasis: basisKnown ? h.costBasis : null,
          acquiredAt: h.acquiredAt,
          // Null rather than zero wherever the basis or date is missing — the
          // difference between "no gain" and "we don't know" is the product.
          unrealized: basisKnown ? h.value - (h.costBasis as number) : null,
          term: heldDays === null ? null : isLong ? ('long' as const) : ('short' as const),
          daysToLongTerm: heldDays === null || isLong ? null : LONG_TERM_DAYS + 1 - heldDays,
        };
      });
    }),

  status: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        taxYear: z.number().int().min(2000).max(2100),
      }),
    )
    .query(async ({ ctx, input }) => {
      return getDeskStatus(ctx.db, ctx.userId, input.workspaceId, input.taxYear);
    }),
});
