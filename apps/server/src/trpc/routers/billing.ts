import { protectedProcedure, router } from '../trpc';

export const billingRouter = router({
  getCurrentPlan: protectedProcedure.query(({ ctx: _ctx }) => {
    // TODO: Query billing provider
    return { plan: 'free', status: 'active' };
  }),

  getInvoices: protectedProcedure.query(({ ctx: _ctx }) => {
    // TODO: Query billing provider
    return [];
  }),
});
