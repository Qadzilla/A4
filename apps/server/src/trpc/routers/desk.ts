import { z } from 'zod';
import { getDeskStatus } from '../../services/desk';
import { protectedProcedure, router } from '../trpc';

/** Where a tax year stands: the desk's default view. */
export const deskRouter = router({
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
