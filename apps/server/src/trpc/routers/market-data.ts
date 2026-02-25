import { aggregateInputSchema, tickerSearchInputSchema } from '@a4/shared-schemas';
import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';

export const marketDataRouter = router({
  searchTickers: protectedProcedure.input(tickerSearchInputSchema).query(async ({ ctx, input }) => {
    return ctx.polygon.searchTickers(input.query, input.market, input.limit);
  }),

  getTickerDetail: protectedProcedure
    .input(z.object({ symbol: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      // Check cache first
      const cached = await ctx.polygon.getCachedTickerDetail(ctx.db, input.symbol);
      if (cached) return cached;

      // Fetch from Polygon and cache
      const detail = await ctx.polygon.getTickerDetail(input.symbol);
      await ctx.polygon.cacheTickerDetail(ctx.db, detail);
      return detail;
    }),

  getAggregates: protectedProcedure.input(aggregateInputSchema).query(async ({ ctx, input }) => {
    const fromMs = new Date(input.from).getTime();
    const toMs = new Date(input.to).getTime();

    // Check cache first
    const cached = await ctx.polygon.getCachedBars(
      ctx.db,
      input.symbol,
      input.timespan,
      input.multiplier,
      fromMs,
      toMs,
    );
    if (cached && cached.length > 0) return cached;

    // Fetch from Polygon
    const bars = await ctx.polygon.getAggregates(
      input.symbol,
      input.multiplier,
      input.timespan,
      input.from,
      input.to,
      input.sort,
      input.limit,
    );

    // Cache the results
    if (bars.length > 0) {
      await ctx.polygon.cacheBars(ctx.db, input.symbol, input.timespan, input.multiplier, bars);
    }

    return bars;
  }),

  getSnapshot: protectedProcedure
    .input(z.object({ symbol: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return ctx.polygon.getSnapshot(input.symbol);
    }),
});
