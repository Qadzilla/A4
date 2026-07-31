import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { workspacePanels } from '../../db/schema';
import { protectedProcedure, router } from '../trpc';

/**
 * The desk's memory. Panels belong to a workspace and a tax year, not to the
 * conversation that produced them — the work of assembling a year happens
 * across many sittings, and each one should find the desk as it was left.
 * Every query is scoped by userId, so a panel id alone is never enough.
 */

const panelInput = z.object({
  id: z.string().min(1),
  taxYear: z.number().int().min(2000).max(2100),
  workspaceId: z.string().uuid(),
  kind: z.enum([
    'lots',
    'tax',
    'benchmark',
    'ledger',
    'holdings',
    'search',
    'document',
    'export',
    // Summoned, live: no payload, read fresh every render
    'portfolio',
    'taxes',
    'gains',
    'approaching',
    'losses',
    'reconciliation',
    'comparison',
    'generated',
  ]),
  title: z.string().min(1),
  subtitle: z.string().nullable(),
  payload: z.unknown(),
  payloadVersion: z.number().int().min(1).default(1),
});

export const panelRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        taxYear: z.number().int().min(2000).max(2100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(workspacePanels)
        .where(
          and(
            eq(workspacePanels.workspaceId, input.workspaceId),
            eq(workspacePanels.taxYear, input.taxYear),
            eq(workspacePanels.userId, ctx.userId),
          ),
        )
        .orderBy(desc(workspacePanels.pinned), asc(workspacePanels.position));

      return rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        subtitle: r.subtitle,
        pinned: r.pinned,
        position: r.position,
        // Stored as text; a row that somehow isn't valid JSON is dropped to an
        // empty object so one bad panel can't take the workspace down.
        data: safeParse(r.payload),
        createdAt: r.createdAt.getTime(),
      }));
    }),

  /** Insert or replace — the id is the tool call, so a rerun overwrites. */
  upsert: protectedProcedure.input(panelInput).mutation(async ({ ctx, input }) => {
    const now = new Date();

    const [existing] = await ctx.db
      .select({ id: workspacePanels.id, position: workspacePanels.position })
      .from(workspacePanels)
      .where(and(eq(workspacePanels.id, input.id), eq(workspacePanels.userId, ctx.userId)));

    if (existing) {
      await ctx.db
        .update(workspacePanels)
        .set({
          title: input.title,
          subtitle: input.subtitle,
          payload: JSON.stringify(input.payload ?? {}),
          payloadVersion: input.payloadVersion,
          updatedAt: now,
        })
        .where(eq(workspacePanels.id, input.id));
      return { id: input.id, position: existing.position };
    }

    // New panels land on top: one step above the current lowest position.
    const [top] = await ctx.db
      .select({ position: workspacePanels.position })
      .from(workspacePanels)
      .where(
        and(
          eq(workspacePanels.workspaceId, input.workspaceId),
          eq(workspacePanels.taxYear, input.taxYear),
          eq(workspacePanels.userId, ctx.userId),
        ),
      )
      .orderBy(asc(workspacePanels.position))
      .limit(1);
    const position = (top?.position ?? 0) - 1;

    await ctx.db.insert(workspacePanels).values({
      id: input.id,
      taxYear: input.taxYear,
      workspaceId: input.workspaceId,
      userId: ctx.userId,
      kind: input.kind,
      title: input.title,
      subtitle: input.subtitle,
      payload: JSON.stringify(input.payload ?? {}),
      payloadVersion: input.payloadVersion,
      position,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    });
    return { id: input.id, position };
  }),

  setPinned: protectedProcedure
    .input(z.object({ id: z.string().min(1), pinned: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(workspacePanels)
        .set({ pinned: input.pinned, updatedAt: new Date() })
        .where(and(eq(workspacePanels.id, input.id), eq(workspacePanels.userId, ctx.userId)));
      return { success: true };
    }),

  /** Explicit order for the ids given; anything omitted keeps its position. */
  reorder: protectedProcedure
    .input(z.object({ ids: z.array(z.string().min(1)).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      for (const [index, id] of input.ids.entries()) {
        await ctx.db
          .update(workspacePanels)
          .set({ position: index, updatedAt: now })
          .where(and(eq(workspacePanels.id, id), eq(workspacePanels.userId, ctx.userId)));
      }
      return { success: true };
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(workspacePanels)
        .where(and(eq(workspacePanels.id, input.id), eq(workspacePanels.userId, ctx.userId)));
      return { success: true };
    }),
});

function safeParse(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
