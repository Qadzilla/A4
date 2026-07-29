import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { snaptradeUsers } from '../../db/schema';
import {
  SNAPTRADE_ENABLED,
  disconnectConnection,
  getConnectPortalUrl,
  listConnections,
  syncBrokerageHoldings,
} from '../../services/snaptrade';
import { protectedProcedure, router } from '../trpc';

export const brokerageRouter = router({
  /** Feature gate + connection state. Never errors — degrades to disabled. */
  status: protectedProcedure.query(async ({ ctx }) => {
    if (!SNAPTRADE_ENABLED) {
      return { enabled: false as const, connections: [] };
    }
    try {
      const connections = await listConnections(ctx.db, ctx.userId);
      return { enabled: true as const, connections };
    } catch (err) {
      console.warn('[brokerage] status failed:', err);
      return { enabled: true as const, connections: [] };
    }
  }),

  /** URL for SnapTrade's connection portal; the user completes the link there. */
  connectUrl: protectedProcedure
    .input(z.object({ redirect: z.string().url().optional() }))
    .mutation(async ({ ctx, input }) => {
      const url = await getConnectPortalUrl(ctx.db, ctx.userId, input.redirect);
      return { url };
    }),

  /** Pull positions + cash from every connected brokerage into the workspace. */
  sync: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return syncBrokerageHoldings(ctx.db, ctx.userId, input.workspaceId);
    }),

  disconnect: protectedProcedure
    .input(z.object({ authorizationId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await disconnectConnection(ctx.db, ctx.userId, input.authorizationId);
      return { success: true };
    }),

  /** Remove the local SnapTrade identity (dev/testing escape hatch). */
  unregister: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.delete(snaptradeUsers).where(and(eq(snaptradeUsers.userId, ctx.userId)));
    return { success: true };
  }),
});
