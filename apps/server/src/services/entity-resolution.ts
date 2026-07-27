import { and, count, eq, inArray, isNull } from 'drizzle-orm';
import type { DB } from '../db';
import { aiUsage, entities, entityEdges, entityMentions, jobs } from '../db/schema';
import { calculateCostCents } from '../routes/chat-stream';
import { structuredCompletion } from './anthropic';
import { embedTexts } from './embedding';
import { normalizeEntityName } from './entity-extraction';
import { JOB_TYPES, enqueueJob, registerJobHandler } from './job-queue';
import { cosineSimilarity } from './vector-search';

const ADJUDICATION_MODEL = 'claude-haiku-4-5';
/** Tier-2 cosine floor for a pair to be considered at all. */
const CANDIDATE_SIMILARITY = 0.9;
/** Non-person pairs at/above this merge without LLM adjudication. */
const AUTO_MERGE_SIMILARITY = 0.97;
/** Tier-3 minimum confidence on a "same" verdict to merge. */
const ADJUDICATION_CONFIDENCE = 0.8;
/** Max mention snippets per entity shown to the adjudicator. */
const SNIPPETS_PER_ENTITY = 3;

const ADJUDICATION_SYSTEM_PROMPT = `You decide whether two extracted financial entities refer to the same real-world entity (the same company, bank, person, or account).

Consider names, aliases, and the context snippets where each was mentioned. Abbreviations, ticker-style shortenings, and payment-processor mangling of the same business are the same entity ("AMZN Mktp US" = "Amazon.com"). Different branches or products of clearly distinct companies are not. For people, distinct individuals can share similar names — only say "same" when the evidence supports it.`;

const ADJUDICATION_OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    same: { type: 'boolean' },
    confidence: { type: 'number' },
  },
  required: ['same', 'confidence'],
};

/**
 * Aggressive merchant-string normalization: strips payment-processor prefixes
 * (SQ *, TST*, PAYPAL *), transaction reference tails (*R2D4), store numbers
 * (#1234 or trailing digits), and .com/.net suffixes. Distinct-but-related
 * strings that survive this ("amzn mktp us" vs "amazon") are Tier 2/3's job.
 */
export function normalizeMerchantString(raw: string): string {
  let s = raw.toLowerCase().trim();
  s = s.replace(/^(sq|tst|pp|py|sp|paypal|pos|ach|dd)\s*\*\s*/, '');
  s = s.replace(/\*\S*/g, ' ');
  s = s.replace(/\.(com|net|org|io)\b/g, '');
  s = s.replace(/#\s*\d+/g, ' ');
  s = s.replace(/\b\d{3,}\b/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > 0 ? s : normalizeEntityName(raw);
}

type EntityRow = typeof entities.$inferSelect;

function rejectedSet(entity: EntityRow): Set<string> {
  return new Set(JSON.parse(entity.rejectedMerges) as string[]);
}

function pickWinner(a: EntityRow, b: EntityRow): [EntityRow, EntityRow] {
  if (a.mentionCount !== b.mentionCount) {
    return a.mentionCount > b.mentionCount ? [a, b] : [b, a];
  }
  return a.canonicalName.length >= b.canonicalName.length ? [a, b] : [b, a];
}

/**
 * Merges loser entities into the winner: repoints mentions and edges (deduping
 * edges and dropping self-edges), unions aliases and rejection lists, refreshes
 * the winner's mention count, and deletes the losers.
 */
export async function mergeEntities(winnerId: string, loserIds: string[], db: DB): Promise<void> {
  if (loserIds.length === 0) return;

  const rows = await db
    .select()
    .from(entities)
    .where(inArray(entities.id, [winnerId, ...loserIds]));
  const winner = rows.find((r) => r.id === winnerId);
  if (!winner) return;
  const losers = rows.filter((r) => r.id !== winnerId);
  if (losers.length === 0) return;

  const now = new Date();

  // Union aliases: losers' canonical names + aliases become winner aliases
  const aliases = new Set(JSON.parse(winner.aliases) as string[]);
  const rejected = rejectedSet(winner);
  for (const loser of losers) {
    if (loser.canonicalName !== winner.canonicalName) aliases.add(loser.canonicalName);
    for (const a of JSON.parse(loser.aliases) as string[]) {
      if (a !== winner.canonicalName) aliases.add(a);
    }
    for (const r of rejectedSet(loser)) {
      if (r !== winnerId) rejected.add(r);
    }
  }

  // Repoint mentions
  await db
    .update(entityMentions)
    .set({ entityId: winnerId })
    .where(inArray(entityMentions.entityId, loserIds));

  // Repoint edges, then drop self-edges and dedupe (same from/to/relationship)
  await db
    .update(entityEdges)
    .set({ fromEntityId: winnerId })
    .where(inArray(entityEdges.fromEntityId, loserIds));
  await db
    .update(entityEdges)
    .set({ toEntityId: winnerId })
    .where(inArray(entityEdges.toEntityId, loserIds));
  await db
    .delete(entityEdges)
    .where(and(eq(entityEdges.fromEntityId, winnerId), eq(entityEdges.toEntityId, winnerId)));

  const winnerEdges = await db
    .select()
    .from(entityEdges)
    .where(eq(entityEdges.workspaceId, winner.workspaceId));
  const seen = new Map<string, (typeof winnerEdges)[number]>();
  for (const edge of winnerEdges) {
    const key = `${edge.fromEntityId}|${edge.toEntityId}|${edge.relationship}`;
    const kept = seen.get(key);
    if (!kept) {
      seen.set(key, edge);
      continue;
    }
    const mergedEvidence = [
      ...new Set([
        ...(JSON.parse(kept.evidence) as string[]),
        ...(JSON.parse(edge.evidence) as string[]),
      ]),
    ];
    await db
      .update(entityEdges)
      .set({ evidence: JSON.stringify(mergedEvidence) })
      .where(eq(entityEdges.id, kept.id));
    await db.delete(entityEdges).where(eq(entityEdges.id, edge.id));
  }

  const [mentionRow] = await db
    .select({ n: count() })
    .from(entityMentions)
    .where(eq(entityMentions.entityId, winnerId));

  await db
    .update(entities)
    .set({
      aliases: JSON.stringify([...aliases]),
      rejectedMerges: JSON.stringify([...rejected]),
      mentionCount: mentionRow?.n ?? 0,
      updatedAt: now,
    })
    .where(eq(entities.id, winnerId));

  // Tombstone losers instead of deleting: canvas cards and old references can
  // follow mergedInto to the surviving entity
  await db
    .update(entities)
    .set({ mergedInto: winnerId, mentionCount: 0, updatedAt: now })
    .where(inArray(entities.id, loserIds));

  // Chains stay one hop deep: anything already pointing at a loser repoints
  await db
    .update(entities)
    .set({ mergedInto: winnerId, updatedAt: now })
    .where(inArray(entities.mergedInto, loserIds));
}

async function recordRejection(a: EntityRow, b: EntityRow, db: DB): Promise<void> {
  const now = new Date();
  for (const [entity, otherId] of [
    [a, b.id],
    [b, a.id],
  ] as const) {
    const rejected = rejectedSet(entity);
    if (!rejected.has(otherId)) {
      rejected.add(otherId);
      await db
        .update(entities)
        .set({ rejectedMerges: JSON.stringify([...rejected]), updatedAt: now })
        .where(eq(entities.id, entity.id));
    }
  }
}

async function snippetsFor(entityId: string, db: DB): Promise<string[]> {
  const mentions = await db
    .select({ snippet: entityMentions.snippet })
    .from(entityMentions)
    .where(eq(entityMentions.entityId, entityId))
    .limit(SNIPPETS_PER_ENTITY);
  return mentions.map((m) => m.snippet).filter((s): s is string => Boolean(s));
}

async function adjudicatePair(
  a: EntityRow,
  b: EntityRow,
  db: DB,
): Promise<{ same: boolean; inputTokens: number; outputTokens: number }> {
  const [aSnippets, bSnippets] = await Promise.all([snippetsFor(a.id, db), snippetsFor(b.id, db)]);

  const describe = (e: EntityRow, snippets: string[]) =>
    [
      `Name: ${e.canonicalName}`,
      `Type: ${e.type}`,
      `Aliases: ${(JSON.parse(e.aliases) as string[]).join(', ') || '(none)'}`,
      `Mention snippets:\n${snippets.map((s) => `- ${s}`).join('\n') || '- (none)'}`,
    ].join('\n');

  const response = await structuredCompletion({
    systemPrompt: ADJUDICATION_SYSTEM_PROMPT,
    userMessage: `Are these the same real-world entity?\n\nEntity A:\n${describe(a, aSnippets)}\n\nEntity B:\n${describe(b, bSnippets)}`,
    outputSchema: ADJUDICATION_OUTPUT_SCHEMA,
    toolName: 'report_verdict',
    model: ADJUDICATION_MODEL,
    maxTokens: 256,
  });

  const verdict = response.data as { same?: unknown; confidence?: unknown };
  const same =
    verdict.same === true &&
    typeof verdict.confidence === 'number' &&
    verdict.confidence >= ADJUDICATION_CONFIDENCE;

  return { same, inputTokens: response.inputTokens, outputTokens: response.outputTokens };
}

/**
 * Three-tier resolution over a workspace's entities:
 *  1. Deterministic — merchants sharing a normalized merchant string merge.
 *  2. Embedding similarity — canonical-name cosine pairs ≥0.90 become
 *     candidates; non-person pairs ≥0.97 merge outright.
 *  3. LLM adjudication — remaining candidates (and ALL person pairs) go to
 *     Haiku; "same" at ≥0.8 confidence merges, "different" is recorded so the
 *     pair is never re-adjudicated.
 *
 * When the embedding service is unavailable, Tiers 2–3 are skipped — Tier 1
 * still runs.
 */
export async function resolveEntities(payload: unknown, db: DB): Promise<void> {
  const workspaceId = (payload as { workspaceId?: unknown })?.workspaceId;
  if (typeof workspaceId !== 'string' || workspaceId.length === 0) {
    throw new Error('resolve-entities payload requires a workspaceId string');
  }

  // ── Tier 1: deterministic merchant normalization ──
  const liveEntities = () =>
    db
      .select()
      .from(entities)
      .where(and(eq(entities.workspaceId, workspaceId), isNull(entities.mergedInto)));
  let rows = await liveEntities();
  const merchantGroups = new Map<string, EntityRow[]>();
  for (const row of rows.filter((r) => r.type === 'merchant')) {
    const key = normalizeMerchantString(row.canonicalName);
    merchantGroups.set(key, [...(merchantGroups.get(key) ?? []), row]);
  }
  for (const group of merchantGroups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => {
      const [w] = pickWinner(a, b);
      return w === a ? -1 : 1;
    });
    const winner = sorted[0]!;
    await mergeEntities(
      winner.id,
      sorted.slice(1).map((e) => e.id),
      db,
    );
  }

  // ── Tier 2: embedding-similarity candidates ──
  rows = await liveEntities();
  if (rows.length < 2) return;

  let embeddings: Float32Array[];
  try {
    embeddings = await embedTexts(rows.map((r) => r.canonicalName));
  } catch {
    return; // embedding service unavailable — Tier 1 already applied
  }

  const alive = new Set(rows.map((r) => r.id));
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i]!;
      const b = rows[j]!;
      if (!alive.has(a.id) || !alive.has(b.id)) continue;
      if (a.type !== b.type) continue;

      const similarity = cosineSimilarity(embeddings[i]!, embeddings[j]!);
      if (similarity < CANDIDATE_SIMILARITY) continue;

      // Refresh rejection state (may have changed via merges this run)
      const [freshA] = await db.select().from(entities).where(eq(entities.id, a.id));
      const [freshB] = await db.select().from(entities).where(eq(entities.id, b.id));
      if (!freshA || !freshB || freshA.mergedInto || freshB.mergedInto) continue;
      if (rejectedSet(freshA).has(b.id) || rejectedSet(freshB).has(a.id)) continue;

      const isPerson = a.type === 'person';
      if (!isPerson && similarity >= AUTO_MERGE_SIMILARITY) {
        const [winner, loser] = pickWinner(freshA, freshB);
        await mergeEntities(winner.id, [loser.id], db);
        alive.delete(loser.id);
        continue;
      }

      // ── Tier 3: LLM adjudication ──
      const verdict = await adjudicatePair(freshA, freshB, db);
      totalInputTokens += verdict.inputTokens;
      totalOutputTokens += verdict.outputTokens;
      if (verdict.same) {
        const [winner, loser] = pickWinner(freshA, freshB);
        await mergeEntities(winner.id, [loser.id], db);
        alive.delete(loser.id);
      } else {
        await recordRejection(freshA, freshB, db);
      }
    }
  }

  if (totalInputTokens > 0 || totalOutputTokens > 0) {
    const userId = rows[0]!.userId;
    await db.insert(aiUsage).values({
      id: crypto.randomUUID(),
      userId,
      conversationId: null,
      model: ADJUDICATION_MODEL,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      costCents: calculateCostCents(ADJUDICATION_MODEL, totalInputTokens, totalOutputTokens),
      createdAt: new Date(),
    });
  }
}

/**
 * Enqueues resolution for a workspace unless an identical job is already
 * pending (debounce — extraction of several files shouldn't stack resolve
 * runs).
 */
export async function enqueueResolveEntities(workspaceId: string, db: DB): Promise<void> {
  const pending = await db
    .select({ payload: jobs.payload })
    .from(jobs)
    .where(and(eq(jobs.type, JOB_TYPES.resolveEntities), eq(jobs.status, 'pending')));

  const alreadyQueued = pending.some((job) => {
    try {
      return (JSON.parse(job.payload) as { workspaceId?: string }).workspaceId === workspaceId;
    } catch {
      return false;
    }
  });
  if (alreadyQueued) return;

  await enqueueJob(JOB_TYPES.resolveEntities, { workspaceId }, { db });
}

/** Call once at boot to attach the handler to the job queue. */
export function registerEntityResolutionHandler(): void {
  registerJobHandler(JOB_TYPES.resolveEntities, resolveEntities);
}
