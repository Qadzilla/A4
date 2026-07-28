import {
  dismissInsightInputSchema,
  engageInsightInputSchema,
  listInsightsInputSchema,
} from '@a4/shared-schemas';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import { conversations, workspaceInsights } from '../../db/schema';
import { generateInsights, scoreInsight } from '../../services/insight-engine';
import { protectedProcedure, router } from '../trpc';

const notExpired = or(
  isNull(workspaceInsights.expiresAt),
  gt(workspaceInsights.expiresAt, new Date()),
);

export const insightsRouter = router({
  list: protectedProcedure.input(listInsightsInputSchema).query(async ({ ctx, input }) => {
    const conditions = [
      eq(workspaceInsights.userId, ctx.userId),
      eq(workspaceInsights.workspaceId, input.workspaceId),
      or(isNull(workspaceInsights.expiresAt), gt(workspaceInsights.expiresAt, new Date())),
    ];

    if (input.status) {
      conditions.push(eq(workspaceInsights.status, input.status));
    }
    if (input.type) {
      conditions.push(eq(workspaceInsights.type, input.type));
    }
    if (input.severity) {
      conditions.push(eq(workspaceInsights.severity, input.severity));
    }

    const rows = await ctx.db
      .select()
      .from(workspaceInsights)
      .where(and(...conditions));

    rows.sort((a, b) => scoreInsight(b) - scoreInsight(a));

    return rows.map((row) => ({
      ...row,
      data: row.data ? JSON.parse(row.data) : null,
      relevanceScore: scoreInsight(row),
    }));
  }),

  dismiss: protectedProcedure.input(dismissInsightInputSchema).mutation(async ({ ctx, input }) => {
    const [insight] = await ctx.db
      .select()
      .from(workspaceInsights)
      .where(and(eq(workspaceInsights.id, input.id), eq(workspaceInsights.userId, ctx.userId)));

    if (!insight) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Insight not found' });
    }

    await ctx.db
      .update(workspaceInsights)
      .set({ status: 'dismissed' })
      .where(eq(workspaceInsights.id, input.id));

    return { success: true };
  }),

  engage: protectedProcedure.input(engageInsightInputSchema).mutation(async ({ ctx, input }) => {
    const [insight] = await ctx.db
      .select()
      .from(workspaceInsights)
      .where(and(eq(workspaceInsights.id, input.id), eq(workspaceInsights.userId, ctx.userId)));

    if (!insight) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Insight not found' });
    }

    if (insight.status === 'engaged' && insight.conversationId) {
      return {
        insightId: insight.id,
        conversationId: insight.conversationId,
        insight: { ...insight, data: insight.data ? JSON.parse(insight.data) : null },
      };
    }

    const conversationId = crypto.randomUUID();
    const now = new Date();

    await ctx.db.insert(conversations).values({
      id: conversationId,
      workspaceId: insight.workspaceId,
      userId: ctx.userId,
      title: insight.title,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db
      .update(workspaceInsights)
      .set({ status: 'engaged', conversationId })
      .where(eq(workspaceInsights.id, input.id));

    return {
      insightId: insight.id,
      conversationId,
      insight: { ...insight, data: insight.data ? JSON.parse(insight.data) : null },
    };
  }),

  generate: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const candidates = await generateInsights(ctx.db, ctx.userId, input.workspaceId);

      const now = new Date();
      for (const candidate of candidates) {
        await ctx.db.insert(workspaceInsights).values({
          id: crypto.randomUUID(),
          workspaceId: input.workspaceId,
          userId: ctx.userId,
          type: candidate.type,
          severity: candidate.severity,
          title: candidate.title,
          summary: candidate.summary,
          data: candidate.data ? JSON.stringify(candidate.data) : null,
          status: 'active',
          createdAt: now,
          expiresAt: candidate.expiresAt,
        });
      }

      return { generated: candidates.length };
    }),

  getLastGeneratedAt: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [latest] = await ctx.db
        .select({ createdAt: workspaceInsights.createdAt })
        .from(workspaceInsights)
        .where(
          and(
            eq(workspaceInsights.workspaceId, input.workspaceId),
            eq(workspaceInsights.userId, ctx.userId),
          ),
        )
        .orderBy(desc(workspaceInsights.createdAt))
        .limit(1);

      return { lastGeneratedAt: latest?.createdAt ?? null };
    }),

  getEngagementStats: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(workspaceInsights)
        .where(
          and(
            eq(workspaceInsights.workspaceId, input.workspaceId),
            eq(workspaceInsights.userId, ctx.userId),
          ),
        );

      const total = rows.length;
      const dismissed = rows.filter((r) => r.status === 'dismissed').length;
      const engaged = rows.filter((r) => r.status === 'engaged').length;
      const engagementRate = dismissed + engaged > 0 ? engaged / (engaged + dismissed) : 0;

      const byType: Record<
        string,
        { generated: number; dismissed: number; engaged: number; rate: number }
      > = {};
      for (const row of rows) {
        if (!byType[row.type]) {
          byType[row.type] = { generated: 0, dismissed: 0, engaged: 0, rate: 0 };
        }
        const entry = byType[row.type]!;
        entry.generated++;
        if (row.status === 'dismissed') entry.dismissed++;
        if (row.status === 'engaged') entry.engaged++;
      }
      for (const entry of Object.values(byType)) {
        const acted = entry.dismissed + entry.engaged;
        entry.rate = acted > 0 ? entry.engaged / acted : 0;
      }

      return { total, dismissed, engaged, engagementRate, byType };
    }),

  getUnreadCount: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(workspaceInsights)
        .where(
          and(
            eq(workspaceInsights.workspaceId, input.workspaceId),
            eq(workspaceInsights.userId, ctx.userId),
            eq(workspaceInsights.status, 'active'),
            or(isNull(workspaceInsights.expiresAt), gt(workspaceInsights.expiresAt, new Date())),
          ),
        );

      return { count: rows.length };
    }),
});
