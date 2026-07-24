import { eq } from 'drizzle-orm';
import { updateProfileSchema } from '@a4/shared-schemas';
import { userProfiles } from '../../db/schema';
import { protectedProcedure, router } from '../trpc';

export const userRouter = router({
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const [profile] = await ctx.db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, ctx.userId));

    if (profile) {
      return profile;
    }

    // Auto-create on first visit
    const now = new Date();
    const newProfile = {
      userId: ctx.userId,
      firstName: null,
      lastName: null,
      onboardingCompleted: false,
      createdAt: now,
      updatedAt: now,
    };
    await ctx.db.insert(userProfiles).values(newProfile);
    return newProfile;
  }),

  updateProfile: protectedProcedure
    .input(updateProfileSchema)
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      // Upsert: insert or update on conflict
      await ctx.db
        .insert(userProfiles)
        .values({
          userId: ctx.userId,
          firstName: input.firstName ?? null,
          lastName: input.lastName ?? null,
          onboardingCompleted: input.onboardingCompleted ?? false,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: userProfiles.userId,
          set: {
            ...(input.firstName !== undefined && { firstName: input.firstName }),
            ...(input.lastName !== undefined && { lastName: input.lastName }),
            ...(input.onboardingCompleted !== undefined && {
              onboardingCompleted: input.onboardingCompleted,
            }),
            updatedAt: now,
          },
        });
      return { success: true };
    }),
});
