import { updateProfileSchema } from '@a4/shared-schemas';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { userApiKeys, userProfiles } from '../../db/schema';
import { BYOK_ENABLED } from '../../env';
import {
  encryptApiKey,
  invalidateKeyCache,
  validateProviderApiKey,
} from '../../services/key-vault';
import { protectedProcedure, router } from '../trpc';

const keyProviderSchema = z.enum(['anthropic', 'openai']);

function requireByok() {
  if (!BYOK_ENABLED) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Bring-your-own-key is not configured on this server',
    });
  }
}

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

  updateProfile: protectedProcedure.input(updateProfileSchema).mutation(async ({ ctx, input }) => {
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

  // ── BYOK provider keys ──
  // The raw key is accepted once, validated against the provider, stored
  // encrypted, and never returned to any client afterwards.

  getApiKeyStatus: protectedProcedure.query(async ({ ctx }) => {
    if (!BYOK_ENABLED) return { enabled: false as const, keys: [] };
    const rows = await ctx.db
      .select({
        provider: userApiKeys.provider,
        keyHint: userApiKeys.keyHint,
        updatedAt: userApiKeys.updatedAt,
      })
      .from(userApiKeys)
      .where(eq(userApiKeys.userId, ctx.userId));
    return { enabled: true as const, keys: rows };
  }),

  setApiKey: protectedProcedure
    .input(z.object({ provider: keyProviderSchema, key: z.string().min(8).max(500) }))
    .mutation(async ({ ctx, input }) => {
      requireByok();

      const valid = await validateProviderApiKey(input.provider, input.key);
      if (!valid) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `The ${input.provider} API key was rejected by the provider`,
        });
      }

      const now = new Date();
      await ctx.db
        .insert(userApiKeys)
        .values({
          id: crypto.randomUUID(),
          userId: ctx.userId,
          provider: input.provider,
          encryptedKey: encryptApiKey(input.key),
          keyHint: input.key.slice(-4),
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [userApiKeys.userId, userApiKeys.provider],
          set: {
            encryptedKey: encryptApiKey(input.key),
            keyHint: input.key.slice(-4),
            updatedAt: now,
          },
        });

      invalidateKeyCache(ctx.userId, input.provider);
      return { success: true, keyHint: input.key.slice(-4) };
    }),

  deleteApiKey: protectedProcedure
    .input(z.object({ provider: keyProviderSchema }))
    .mutation(async ({ ctx, input }) => {
      requireByok();
      await ctx.db
        .delete(userApiKeys)
        .where(and(eq(userApiKeys.userId, ctx.userId), eq(userApiKeys.provider, input.provider)));
      invalidateKeyCache(ctx.userId, input.provider);
      return { success: true };
    }),
});
