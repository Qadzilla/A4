import {
  type EntityExtractionResult,
  type EntityType,
  entityExtractionResultSchema,
} from '@a4/shared-schemas';
import { and, count, eq, inArray, notInArray, or } from 'drizzle-orm';
import type { DB } from '../db';
import {
  aiUsage,
  documentChunks,
  entities,
  entityEdges,
  entityMentions,
  files,
} from '../db/schema';
import { calculateCostCents } from '../routes/chat-stream';
import { structuredCompletion } from './anthropic';
import { JOB_TYPES, registerJobHandler } from './job-queue';

const EXTRACTION_MODEL = 'claude-haiku-4-5';
const CHUNKS_PER_BATCH = 6;
const MIN_CONFIDENCE = 0.5;

const EXTRACTION_SYSTEM_PROMPT = `You extract entities and relationships from financial documents (bank statements, invoices, receipts, contracts, tax forms).

Entity types:
- merchant: businesses the user transacts with (Amazon, Netflix, a landlord's LLC)
- institution: banks, brokerages, card issuers, insurers (Chase, Fidelity)
- person: named individuals
- organization: employers, agencies, non-profits that are not merchants or institutions
- account_ref: specific account references (e.g. "checking ...8842", "Visa ending 6411")

Rules:
- Extract each distinct entity once per batch, using the exact surface form from the text as its name.
- Include a short snippet of surrounding text for each entity.
- When the text states a specific transaction amount and/or date at the mention site (e.g. a statement line), include amount (plain number, no currency symbol) and date (YYYY-MM-DD).
- Report relationships only when the text states them (e.g. a charge links a merchant to an account_ref: "charged to").
- Confidence reflects how certain you are the mention is a real entity of that type.
- Do not invent entities that are not in the text. Generic words ("payment", "balance") are not entities.`;

const EXTRACTION_OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: {
            type: 'string',
            enum: ['merchant', 'institution', 'person', 'organization', 'account_ref'],
          },
          confidence: { type: 'number' },
          snippet: { type: 'string' },
          amount: { type: 'number' },
          date: { type: 'string', description: 'YYYY-MM-DD' },
        },
        required: ['name', 'type', 'confidence'],
      },
    },
    relationships: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fromName: { type: 'string' },
          toName: { type: 'string' },
          relationship: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['fromName', 'toName', 'relationship', 'confidence'],
      },
    },
  },
  required: ['entities', 'relationships'],
};

/**
 * Basic normalization for entity identity lookups. The full merchant-string
 * normalizer (payment-processor prefixes, store numbers) lands in BU-06 —
 * this is deliberately just case/whitespace so resolution can tighten later.
 */
export function normalizeEntityName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Deletes chunk-sourced mentions for the given chunk ids, then sweeps the
 * workspace for entities left with zero mentions (and their edges). Called on
 * file deletion and before re-extraction.
 */
export async function cleanupMentionsForChunks(
  chunkIds: string[],
  workspaceId: string,
  db: DB,
): Promise<void> {
  if (chunkIds.length > 0) {
    await db
      .delete(entityMentions)
      .where(
        and(
          eq(entityMentions.workspaceId, workspaceId),
          eq(entityMentions.sourceType, 'chunk'),
          inArray(entityMentions.sourceId, chunkIds),
        ),
      );
  }

  // Recount and prune zero-mention entities in this workspace
  const workspaceEntities = await db
    .select({ id: entities.id })
    .from(entities)
    .where(eq(entities.workspaceId, workspaceId));
  if (workspaceEntities.length === 0) return;

  const mentioned = await db
    .selectDistinct({ entityId: entityMentions.entityId })
    .from(entityMentions)
    .where(eq(entityMentions.workspaceId, workspaceId));
  const mentionedIds = new Set(mentioned.map((m) => m.entityId));

  const orphanIds = workspaceEntities.map((e) => e.id).filter((id) => !mentionedIds.has(id));
  if (orphanIds.length === 0) return;

  await db.delete(entities).where(inArray(entities.id, orphanIds));
  await db
    .delete(entityEdges)
    .where(
      or(inArray(entityEdges.fromEntityId, orphanIds), inArray(entityEdges.toEntityId, orphanIds)),
    );
}

async function getOrCreateEntity(
  db: DB,
  workspaceId: string,
  userId: string,
  type: EntityType,
  surfaceName: string,
  now: Date,
): Promise<{ id: string }> {
  const normalized = normalizeEntityName(surfaceName);
  const existing = await db
    .select()
    .from(entities)
    .where(
      and(
        eq(entities.workspaceId, workspaceId),
        eq(entities.type, type),
        eq(entities.normalizedName, normalized),
      ),
    );

  const found = existing[0];
  if (found) {
    // Track a new surface form as an alias
    if (surfaceName !== found.canonicalName) {
      const aliases = JSON.parse(found.aliases) as string[];
      if (!aliases.includes(surfaceName)) {
        aliases.push(surfaceName);
        await db
          .update(entities)
          .set({ aliases: JSON.stringify(aliases), updatedAt: now })
          .where(eq(entities.id, found.id));
      }
    }
    return { id: found.id };
  }

  const id = crypto.randomUUID();
  await db.insert(entities).values({
    id,
    workspaceId,
    userId,
    type,
    canonicalName: surfaceName,
    normalizedName: normalized,
    createdAt: now,
    updatedAt: now,
  });
  return { id };
}

/** Parses a lenient YYYY-MM-DD string into a Date, or null when invalid. */
export function parseMentionDate(raw: string | undefined): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Attributes a mention to the first chunk in the batch containing the name. */
function findSourceChunk(name: string, batch: Array<{ id: string; content: string }>): string {
  const lower = name.toLowerCase();
  const match = batch.find((c) => c.content.toLowerCase().includes(lower));
  return (match ?? batch[0]!).id;
}

export async function extractEntitiesFromFile(payload: unknown, db: DB): Promise<void> {
  const fileId = (payload as { fileId?: unknown })?.fileId;
  if (typeof fileId !== 'string' || fileId.length === 0) {
    throw new Error('extract-entities payload requires a fileId string');
  }

  const [file] = await db.select().from(files).where(eq(files.id, fileId));
  if (!file) return; // deleted before the job ran — nothing to do

  const chunks = await db
    .select({ id: documentChunks.id, content: documentChunks.content })
    .from(documentChunks)
    .where(eq(documentChunks.fileId, fileId))
    .orderBy(documentChunks.chunkIndex);

  // Idempotent re-run: clear this file's prior chunk mentions, plus any
  // orphans left by earlier re-embeddings of this workspace
  const chunkIds = chunks.map((c) => c.id);
  await cleanupMentionsForChunks(chunkIds, file.workspaceId, db);
  if (chunkIds.length > 0) {
    await db.delete(entityMentions).where(
      and(
        eq(entityMentions.workspaceId, file.workspaceId),
        eq(entityMentions.sourceType, 'chunk'),
        notInArray(
          entityMentions.sourceId,
          (
            await db
              .select({ id: documentChunks.id })
              .from(documentChunks)
              .where(eq(documentChunks.workspaceId, file.workspaceId))
          ).map((c) => c.id),
        ),
      ),
    );
  }
  if (chunks.length === 0) return;

  const now = new Date();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const touchedEntityIds = new Set<string>();

  for (let i = 0; i < chunks.length; i += CHUNKS_PER_BATCH) {
    const batch = chunks.slice(i, i + CHUNKS_PER_BATCH);
    const batchText = batch
      .map((c, idx) => `--- Section ${i + idx + 1} ---\n${c.content}`)
      .join('\n\n');

    const response = await structuredCompletion({
      systemPrompt: EXTRACTION_SYSTEM_PROMPT,
      userMessage: `Extract entities and relationships from this document excerpt (file: ${file.fileName}):\n\n${batchText}`,
      outputSchema: EXTRACTION_OUTPUT_SCHEMA,
      toolName: 'report_entities',
      model: EXTRACTION_MODEL,
    });
    totalInputTokens += response.inputTokens;
    totalOutputTokens += response.outputTokens;

    const parsed = entityExtractionResultSchema.safeParse(response.data);
    if (!parsed.success) {
      throw new Error(`Extraction output failed validation: ${parsed.error.message}`);
    }
    const result: EntityExtractionResult = parsed.data;

    // Entities + mentions
    const batchEntityIds = new Map<string, string>(); // normalized name → entity id
    const batchMentionIds = new Map<string, string>(); // normalized name → mention id
    for (const extracted of result.entities) {
      if (extracted.confidence < MIN_CONFIDENCE) continue;
      const entity = await getOrCreateEntity(
        db,
        file.workspaceId,
        file.userId,
        extracted.type,
        extracted.name,
        now,
      );
      touchedEntityIds.add(entity.id);
      batchEntityIds.set(normalizeEntityName(extracted.name), entity.id);

      const mentionId = crypto.randomUUID();
      batchMentionIds.set(normalizeEntityName(extracted.name), mentionId);
      await db.insert(entityMentions).values({
        id: mentionId,
        entityId: entity.id,
        workspaceId: file.workspaceId,
        userId: file.userId,
        sourceType: 'chunk',
        sourceId: findSourceChunk(extracted.name, batch),
        snippet: extracted.snippet ?? null,
        confidence: extracted.confidence,
        amount: extracted.amount ?? null,
        date: parseMentionDate(extracted.date),
        createdAt: now,
      });
    }

    // Relationships between entities seen in this batch
    for (const rel of result.relationships) {
      if (rel.confidence < MIN_CONFIDENCE) continue;
      const fromId = batchEntityIds.get(normalizeEntityName(rel.fromName));
      const toId = batchEntityIds.get(normalizeEntityName(rel.toName));
      if (!fromId || !toId || fromId === toId) continue;

      const evidence = [
        batchMentionIds.get(normalizeEntityName(rel.fromName)),
        batchMentionIds.get(normalizeEntityName(rel.toName)),
      ].filter((id): id is string => Boolean(id));

      const [existingEdge] = await db
        .select()
        .from(entityEdges)
        .where(
          and(
            eq(entityEdges.workspaceId, file.workspaceId),
            eq(entityEdges.fromEntityId, fromId),
            eq(entityEdges.toEntityId, toId),
            eq(entityEdges.relationship, rel.relationship),
          ),
        );

      if (existingEdge) {
        const merged = [
          ...new Set([...(JSON.parse(existingEdge.evidence) as string[]), ...evidence]),
        ];
        await db
          .update(entityEdges)
          .set({ evidence: JSON.stringify(merged) })
          .where(eq(entityEdges.id, existingEdge.id));
      } else {
        await db.insert(entityEdges).values({
          id: crypto.randomUUID(),
          workspaceId: file.workspaceId,
          userId: file.userId,
          fromEntityId: fromId,
          toEntityId: toId,
          relationship: rel.relationship,
          evidence: JSON.stringify(evidence),
          createdAt: now,
        });
      }
    }
  }

  // Refresh denormalized mention counts for every entity we touched
  for (const entityId of touchedEntityIds) {
    const [row] = await db
      .select({ n: count() })
      .from(entityMentions)
      .where(eq(entityMentions.entityId, entityId));
    await db
      .update(entities)
      .set({ mentionCount: row?.n ?? 0, updatedAt: now })
      .where(eq(entities.id, entityId));
  }

  // Meter the extraction spend (conversationId null = background pipeline)
  await db.insert(aiUsage).values({
    id: crypto.randomUUID(),
    userId: file.userId,
    conversationId: null,
    model: EXTRACTION_MODEL,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    costCents: calculateCostCents(EXTRACTION_MODEL, totalInputTokens, totalOutputTokens),
    createdAt: now,
  });

  // Queue resolution to merge duplicate surface forms (debounced per
  // workspace; dynamic import avoids a static module cycle)
  try {
    const { enqueueResolveEntities } = await import('./entity-resolution');
    await enqueueResolveEntities(file.workspaceId, db);
  } catch (err) {
    console.warn(`[entities] Failed to enqueue resolution for workspace ${file.workspaceId}:`, err);
  }
}

/** Call once at boot to attach the handler to the job queue. */
export function registerEntityExtractionHandler(): void {
  registerJobHandler(JOB_TYPES.extractEntities, extractEntitiesFromFile);
}
