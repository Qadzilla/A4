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

  /**
   * Best available price for a symbol: live snapshot when the Polygon plan
   * allows it, otherwise the latest daily close (marked live: false so the UI
   * can label it EOD instead of pretending). Null when neither works.
   */
  getQuote: protectedProcedure
    .input(z.object({ symbol: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      try {
        const snap = await ctx.polygon.getSnapshot(input.symbol);
        const price = snap.lastTrade?.price ?? snap.day?.close ?? snap.prevDay?.close;
        if (price && price > 0) {
          return {
            symbol: input.symbol,
            price,
            changePct: snap.todaysChangePerc ?? 0,
            live: true,
            asOf: null as string | null,
          };
        }
      } catch {
        // snapshot not in plan (or symbol not covered) — fall back to daily bars
      }
      try {
        const today = new Date().toISOString().slice(0, 10);
        const from = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
        const bars = await ctx.polygon.getAggregates(
          input.symbol,
          1,
          'day',
          from,
          today,
          'desc',
          2,
        );
        const last = bars[0];
        const prev = bars[1];
        if (!last?.close || last.close <= 0) return null;
        const changePct = prev?.close ? ((last.close - prev.close) / prev.close) * 100 : 0;
        return {
          symbol: input.symbol,
          price: last.close,
          changePct,
          live: false,
          asOf: new Date(last.timestamp).toISOString().slice(0, 10),
        };
      } catch {
        return null;
      }
    }),
});
