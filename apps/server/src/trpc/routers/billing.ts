import { count, eq, sql } from 'drizzle-orm';
import { aiUsage, files, workspaces } from '../../db/schema';
import { protectedProcedure, router } from '../trpc';

export const billingRouter = router({
  getCurrentPlan: protectedProcedure.query(() => {
    // Early access: everything free, no billing provider yet
    return {
      plan: 'free' as const,
      name: 'Early Access',
      status: 'active' as const,
      limits: {
        workspaces: 50,
        filesPerWorkspace: 100,
        fileSizeMb: 10,
        aiMessagesPerDay: 100,
      },
    };
  }),

  getUsage: protectedProcedure.query(async ({ ctx }) => {
    const [wsCount] = await ctx.db
      .select({ value: count() })
      .from(workspaces)
      .where(eq(workspaces.userId, ctx.userId));

    const [fileCount] = await ctx.db
      .select({ value: count() })
      .from(files)
      .where(eq(files.userId, ctx.userId));

    const [tokenStats] = await ctx.db
      .select({
        totalInputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)`,
        totalOutputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)`,
        totalCostCents: sql<number>`coalesce(sum(${aiUsage.costCents}), 0)`,
      })
      .from(aiUsage)
      .where(eq(aiUsage.userId, ctx.userId));

    return {
      workspaces: wsCount?.value ?? 0,
      files: fileCount?.value ?? 0,
      aiTokens: {
        input: tokenStats?.totalInputTokens ?? 0,
        output: tokenStats?.totalOutputTokens ?? 0,
        costCents: tokenStats?.totalCostCents ?? 0,
      },
    };
  }),

  getInvoices: protectedProcedure.query(() => {
    // No billing yet — no invoices
    return [];
  }),
});
