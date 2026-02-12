import { updateProfileSchema } from '@a4/shared-schemas';
import { protectedProcedure, router } from '../trpc';

export const userRouter = router({
  getProfile: protectedProcedure.query(({ ctx: _ctx }) => {
    // TODO: Query database
    return null;
  }),

  updateProfile: protectedProcedure
    .input(updateProfileSchema)
    .mutation(({ ctx: _ctx, input: _input }) => {
      // TODO: Update database
      return { success: true };
    }),
});
