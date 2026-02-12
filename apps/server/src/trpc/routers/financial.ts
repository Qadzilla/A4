import { financialFilterSchema } from '@a4/shared-schemas';
import { protectedProcedure, router } from '../trpc';

export const financialRouter = router({
  getSummary: protectedProcedure
    .input(financialFilterSchema)
    .query(({ ctx: _ctx, input: _input }) => {
      // TODO: Aggregate financial data from database
      return {
        totalIncome: 0,
        totalExpenses: 0,
        netProfit: 0,
        transactionCount: 0,
        currency: 'USD' as const,
        periodStart: new Date(),
        periodEnd: new Date(),
      };
    }),

  getTransactions: protectedProcedure
    .input(financialFilterSchema)
    .query(({ ctx: _ctx, input: _input }) => {
      // TODO: Query database
      return [];
    }),
});
