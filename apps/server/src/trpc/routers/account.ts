import {
  createAccountGroupSchema,
  createAccountSchema,
  updateAccountGroupSchema,
  updateAccountSchema,
} from '@a4/shared-schemas';
import { TRPCError } from '@trpc/server';
import { and, eq, sql, sum } from 'drizzle-orm';
import { z } from 'zod';
import { accountGroups, accounts } from '../../db/schema';
import { protectedProcedure, router } from '../trpc';

const LIABILITY_TYPES = new Set(['credit-card', 'loan', 'mortgage']);

export const accountRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(accounts)
        .where(and(eq(accounts.workspaceId, input.workspaceId), eq(accounts.userId, ctx.userId)))
        .orderBy(accounts.name);
    }),

  create: protectedProcedure.input(createAccountSchema).mutation(async ({ ctx, input }) => {
    const id = crypto.randomUUID();
    const now = new Date();

    await ctx.db.insert(accounts).values({
      id,
      workspaceId: input.workspaceId,
      userId: ctx.userId,
      name: input.name,
      institution: input.institution,
      type: input.type,
      balance: input.balance,
      groupId: input.groupId ?? null,
      lastUpdated: input.lastUpdated ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return { id };
  }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: updateAccountSchema }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.id, input.id), eq(accounts.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found' });
      }

      await ctx.db
        .update(accounts)
        .set({ ...input.data, updatedAt: new Date() })
        .where(eq(accounts.id, input.id));

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.id, input.id), eq(accounts.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found' });
      }

      await ctx.db.delete(accounts).where(eq(accounts.id, input.id));

      return { success: true };
    }),

  listGroups: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(accountGroups)
        .where(
          and(
            eq(accountGroups.workspaceId, input.workspaceId),
            eq(accountGroups.userId, ctx.userId),
          ),
        )
        .orderBy(accountGroups.name);
    }),

  createGroup: protectedProcedure
    .input(createAccountGroupSchema)
    .mutation(async ({ ctx, input }) => {
      const id = crypto.randomUUID();
      const now = new Date();

      await ctx.db.insert(accountGroups).values({
        id,
        workspaceId: input.workspaceId,
        userId: ctx.userId,
        name: input.name,
        color: input.color,
        createdAt: now,
        updatedAt: now,
      });

      return { id, name: input.name, color: input.color };
    }),

  updateGroup: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: updateAccountGroupSchema }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: accountGroups.id })
        .from(accountGroups)
        .where(and(eq(accountGroups.id, input.id), eq(accountGroups.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Account group not found' });
      }

      await ctx.db
        .update(accountGroups)
        .set({ ...input.data, updatedAt: new Date() })
        .where(eq(accountGroups.id, input.id));

      return { success: true };
    }),

  deleteGroup: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: accountGroups.id })
        .from(accountGroups)
        .where(and(eq(accountGroups.id, input.id), eq(accountGroups.userId, ctx.userId)));

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Account group not found' });
      }

      // Nullify groupId on accounts that reference this group
      await ctx.db
        .update(accounts)
        .set({ groupId: null, updatedAt: new Date() })
        .where(and(eq(accounts.groupId, input.id), eq(accounts.userId, ctx.userId)));

      await ctx.db.delete(accountGroups).where(eq(accountGroups.id, input.id));

      return { success: true };
    }),

  getSummary: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const whereClause = and(
        eq(accounts.workspaceId, input.workspaceId),
        eq(accounts.userId, ctx.userId),
      );

      const allAccounts = await ctx.db
        .select({ type: accounts.type, balance: accounts.balance })
        .from(accounts)
        .where(whereClause);

      let totalAssets = 0;
      let totalLiabilities = 0;

      for (const acc of allAccounts) {
        if (LIABILITY_TYPES.has(acc.type)) {
          totalLiabilities += acc.balance;
        } else {
          totalAssets += acc.balance;
        }
      }

      return {
        totalAssets,
        totalLiabilities,
        netWorth: totalAssets - totalLiabilities,
        count: allAccounts.length,
      };
    }),
});
