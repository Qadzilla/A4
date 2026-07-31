import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../../db';
import { conversations, workspacePanels } from '../../db/schema';
import { protectedProcedure, router } from '../trpc';

/**
 * The workspace's memory. Panels belong to a conversation, so returning to a
 * thread returns to the desk you left. Ownership is always checked through
 * the conversation — a panel id alone is never enough to read or write one.
 */

const panelInput = z.object({
  id: z.string().min(1),
  conversationId: z.string().uuid(),
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
    'portfolio',
    'taxes',
  ]),
  title: z.string().min(1),
  subtitle: z.string().nullable(),
  payload: z.unknown(),
  payloadVersion: z.number().int().min(1).default(1),
});

async function assertOwnsConversation(db: DB, userId: string, conversationId: string) {
  const [row] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
}

export const panelRouter = router({
  list: protectedProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(workspacePanels)
        .where(
          and(
            eq(workspacePanels.conversationId, input.conversationId),
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
    await assertOwnsConversation(ctx.db, ctx.userId, input.conversationId);
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
      .where(eq(workspacePanels.conversationId, input.conversationId))
      .orderBy(asc(workspacePanels.position))
      .limit(1);
    const position = (top?.position ?? 0) - 1;

    await ctx.db.insert(workspacePanels).values({
      id: input.id,
      conversationId: input.conversationId,
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
