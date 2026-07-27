import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { entities, entityEdges, entityMentions } from '../../db/schema';
import type { DB } from '../../db';
import { protectedProcedure, router } from '../trpc';

const MAX_GRAPH_NODES = 50;

type EntityRow = typeof entities.$inferSelect;

function serialize(entity: EntityRow) {
  return {
    id: entity.id,
    workspaceId: entity.workspaceId,
    type: entity.type,
    canonicalName: entity.canonicalName,
    aliases: JSON.parse(entity.aliases) as string[],
    mentionCount: entity.mentionCount,
    updatedAt: entity.updatedAt,
  };
}

/**
 * Follows the mergedInto tombstone chain to the surviving entity, so canvas
 * cards keep working after resolution merges the entity they reference.
 */
async function resolveLiveEntity(
  id: string,
  userId: string,
  db: DB,
): Promise<EntityRow | null> {
  let currentId = id;
  for (let hops = 0; hops < 5; hops++) {
    const [row] = await db
      .select()
      .from(entities)
      .where(and(eq(entities.id, currentId), eq(entities.userId, userId)));
    if (!row) return null;
    if (!row.mergedInto) return row;
    currentId = row.mergedInto;
  }
  return null;
}

export const entityRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        type: z
          .enum(['merchant', 'institution', 'person', 'organization', 'account_ref'])
          .optional(),
        query: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [
        eq(entities.workspaceId, input.workspaceId),
        eq(entities.userId, ctx.userId),
        isNull(entities.mergedInto),
      ];
      if (input.type) conditions.push(eq(entities.type, input.type));

      const rows = await ctx.db
        .select()
        .from(entities)
        .where(and(...conditions))
        .orderBy(desc(entities.mentionCount))
        .limit(200);

      const query = input.query?.toLowerCase().trim();
      const filtered = query
        ? rows.filter(
            (e) =>
              e.normalizedName.includes(query) ||
              (JSON.parse(e.aliases) as string[]).some((a) => a.toLowerCase().includes(query)),
          )
        : rows;

      return filtered.map(serialize);
    }),

  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const entity = await resolveLiveEntity(input.id, ctx.userId, ctx.db);
    if (!entity) return null;
    return { ...serialize(entity), redirectedFrom: entity.id === input.id ? null : input.id };
  }),

  getMentions: protectedProcedure
    .input(z.object({ id: z.string(), limit: z.number().int().min(1).max(100).optional() }))
    .query(async ({ ctx, input }) => {
      const entity = await resolveLiveEntity(input.id, ctx.userId, ctx.db);
      if (!entity) return { mentions: [], bySourceType: {} };

      const mentions = await ctx.db
        .select()
        .from(entityMentions)
        .where(
          and(eq(entityMentions.entityId, entity.id), eq(entityMentions.userId, ctx.userId)),
        )
        .orderBy(desc(entityMentions.createdAt))
        .limit(input.limit ?? 50);

      const bySourceType: Record<string, number> = {};
      for (const m of mentions) {
        bySourceType[m.sourceType] = (bySourceType[m.sourceType] ?? 0) + 1;
      }

      return {
        mentions: mentions.map((m) => ({
          id: m.id,
          sourceType: m.sourceType,
          sourceId: m.sourceId,
          snippet: m.snippet,
          amount: m.amount,
          date: m.date,
          confidence: m.confidence,
        })),
        bySourceType,
      };
    }),

  getConnections: protectedProcedure
    .input(z.object({ id: z.string(), depth: z.number().int().min(1).max(2).optional() }))
    .query(async ({ ctx, input }) => {
      const entity = await resolveLiveEntity(input.id, ctx.userId, ctx.db);
      if (!entity) return { nodes: [], edges: [] };

      const depth = input.depth ?? 1;
      const allEdges = await ctx.db
        .select()
        .from(entityEdges)
        .where(
          and(
            eq(entityEdges.workspaceId, entity.workspaceId),
            eq(entityEdges.userId, ctx.userId),
          ),
        );

      const visited = new Set<string>([entity.id]);
      const edgeKeys = new Set<string>();
      const foundEdges: Array<{ from: string; to: string; relationship: string }> = [];
      let frontier = [entity.id];
      for (let hop = 0; hop < depth && visited.size < MAX_GRAPH_NODES; hop++) {
        const next: string[] = [];
        for (const edge of allEdges) {
          if (!frontier.includes(edge.fromEntityId) && !frontier.includes(edge.toEntityId)) {
            continue;
          }
          const key = `${edge.fromEntityId}|${edge.toEntityId}|${edge.relationship}`;
          if (!edgeKeys.has(key)) {
            edgeKeys.add(key);
            foundEdges.push({
              from: edge.fromEntityId,
              to: edge.toEntityId,
              relationship: edge.relationship,
            });
          }
          for (const nodeId of [edge.fromEntityId, edge.toEntityId]) {
            if (!visited.has(nodeId) && visited.size < MAX_GRAPH_NODES) {
              visited.add(nodeId);
              next.push(nodeId);
            }
          }
        }
        frontier = next;
        if (frontier.length === 0) break;
      }

      const nodes = await ctx.db
        .select()
        .from(entities)
        .where(inArray(entities.id, [...visited]));

      return { nodes: nodes.map(serialize), edges: foundEdges };
    }),
});
