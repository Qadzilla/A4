import { z } from 'zod';
import { getDeskComparison, getDeskPositions, getDeskStatus } from '../../services/desk';
import { protectedProcedure, router } from '../trpc';

/** Where a tax year stands: the desk's default view. */
export const deskRouter = router({
  /** Positions with term, countdown and unrealized. */
  positions: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getDeskPositions(ctx.db, ctx.userId, input.workspaceId);
    }),

  /** The same positions against the questions a sell decision turns on. */
  comparison: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getDeskComparison(ctx.db, ctx.userId, input.workspaceId);
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
