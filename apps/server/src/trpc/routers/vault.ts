import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { vaultConfig } from '../../db/schema';
import { protectedProcedure, router } from '../trpc';

export const vaultRouter = router({
  getConfig: protectedProcedure.query(async ({ ctx }) => {
    const [config] = await ctx.db
      .select()
      .from(vaultConfig)
      .where(eq(vaultConfig.userId, ctx.userId));

    if (!config) return null;

    return {
      salt: config.salt,
      verificationCiphertext: config.verificationCiphertext,
      verificationIV: config.verificationIV,
    };
  }),

  setup: protectedProcedure
    .input(
      z.object({
        salt: z.string(),
        verificationCiphertext: z.string(),
        verificationIV: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if already set up
      const [existing] = await ctx.db
        .select({ userId: vaultConfig.userId })
        .from(vaultConfig)
        .where(eq(vaultConfig.userId, ctx.userId));

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Vault already set up. Cannot overwrite passphrase.',
        });
      }

      await ctx.db.insert(vaultConfig).values({
        userId: ctx.userId,
        salt: input.salt,
        verificationCiphertext: input.verificationCiphertext,
        verificationIV: input.verificationIV,
      });

      return { success: true };
    }),
});
