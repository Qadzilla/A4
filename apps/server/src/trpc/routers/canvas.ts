import { saveCanvasSchema } from '@a4/shared-schemas';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { canvasConnections, canvasItems, workspaces } from '../../db/schema';
import { protectedProcedure, router } from '../trpc';

export const canvasRouter = router({
  load: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Verify workspace ownership
      const [workspace] = await ctx.db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(and(eq(workspaces.id, input.workspaceId), eq(workspaces.userId, ctx.userId)));

      if (!workspace) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' });
      }

      const items = await ctx.db
        .select()
        .from(canvasItems)
        .where(and(eq(canvasItems.workspaceId, input.workspaceId), eq(canvasItems.userId, ctx.userId)));

      const connections = await ctx.db
        .select()
        .from(canvasConnections)
        .where(
          and(eq(canvasConnections.workspaceId, input.workspaceId), eq(canvasConnections.userId, ctx.userId)),
        );

      return {
        items: items.map((row) => ({
          id: row.id,
          type: row.type,
          name: row.name,
          x: row.x,
          y: row.y,
          width: row.width,
          height: row.height,
          zIndex: row.zIndex,
          data: row.data ? (JSON.parse(row.data) as Record<string, unknown>) : undefined,
        })),
        connections: connections.map((row) => ({
          id: row.id,
          fromItemId: row.fromItemId,
          fromAnchor: row.fromAnchor as 'top' | 'bottom' | 'left' | 'right',
          toItemId: row.toItemId,
          toAnchor: row.toAnchor as 'top' | 'bottom' | 'left' | 'right',
        })),
      };
    }),

  save: protectedProcedure.input(saveCanvasSchema).mutation(async ({ ctx, input }) => {
    // Verify workspace ownership
    const [workspace] = await ctx.db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.id, input.workspaceId), eq(workspaces.userId, ctx.userId)));

    if (!workspace) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' });
    }

    ctx.db.transaction((tx) => {
      // Clear existing data
      tx.delete(canvasConnections)
        .where(
          and(eq(canvasConnections.workspaceId, input.workspaceId), eq(canvasConnections.userId, ctx.userId)),
        )
        .run();

      tx.delete(canvasItems)
        .where(and(eq(canvasItems.workspaceId, input.workspaceId), eq(canvasItems.userId, ctx.userId)))
        .run();

      // Batch insert items
      if (input.items.length > 0) {
        tx.insert(canvasItems)
          .values(
            input.items.map((item) => ({
              id: item.id,
              workspaceId: input.workspaceId,
              userId: ctx.userId,
              type: item.type,
              name: item.name,
              x: item.x,
              y: item.y,
              width: item.width,
              height: item.height,
              zIndex: item.zIndex,
              data: item.data ? JSON.stringify(item.data) : null,
            })),
          )
          .run();
      }

      // Batch insert connections
      if (input.connections.length > 0) {
        tx.insert(canvasConnections)
          .values(
            input.connections.map((conn) => ({
              id: conn.id,
              workspaceId: input.workspaceId,
              userId: ctx.userId,
              fromItemId: conn.fromItemId,
              fromAnchor: conn.fromAnchor,
              toItemId: conn.toItemId,
              toAnchor: conn.toAnchor,
            })),
          )
          .run();
      }
    });

    return { success: true };
  }),
});
