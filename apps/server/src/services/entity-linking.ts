import type { EntityType } from '@a4/shared-schemas';
import { and, count, eq, inArray, isNull, ne } from 'drizzle-orm';
import type { DB } from '../db';
import { accounts, entities, entityMentions, jobs, transactions } from '../db/schema';
import { cleanupMentionsForChunks, normalizeEntityName } from './entity-extraction';
import { normalizeMerchantString } from './entity-resolution';
import { JOB_TYPES, enqueueJob, registerJobHandler } from './job-queue';

interface StructuredRow {
  sourceType: 'transaction' | 'account';
  sourceId: string;
  name: string;
  entityType: EntityType;
  amount: number | null;
  date: Date | null;
}

function parseRowDate(raw: string | null): Date | null {
  if (!raw) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function collectStructuredRows(workspaceId: string, db: DB): Promise<StructuredRow[]> {
  const rows: StructuredRow[] = [];

  const txns = await db
    .select()
    .from(transactions)
    .where(eq(transactions.workspaceId, workspaceId));
  for (const t of txns) {
    rows.push({
      sourceType: 'transaction',
      sourceId: t.id,
      name: t.description,
      entityType: 'merchant',
      amount: t.amount,
      date: parseRowDate(t.date),
    });
  }

  const accts = await db.select().from(accounts).where(eq(accounts.workspaceId, workspaceId));
  for (const a of accts) {
    rows.push({
      sourceType: 'account',
      sourceId: a.id,
      name: a.institution,
      entityType: 'institution',
      amount: null,
      date: null,
    });
  }

  return rows.filter((r) => r.name.trim().length > 0);
}

/**
 * Deterministically links structured financial rows (transactions, accounts)
 * to entities by normalized
 * name — canonical names and aliases both match, with the aggressive merchant
 * normalizer tried first. Unmatched names become new entities; structured rows
 * are first-class entity sources.
 *
 * Full rebuild per run: all structured mentions for the workspace are dropped
 * and rewritten, so deleted rows disappear and edits re-link. No LLM cost.
 */
export async function linkStructuredData(payload: unknown, db: DB): Promise<void> {
  const workspaceId = (payload as { workspaceId?: unknown })?.workspaceId;
  if (typeof workspaceId !== 'string' || workspaceId.length === 0) {
    throw new Error('link-structured payload requires a workspaceId string');
  }

  await db
    .delete(entityMentions)
    .where(
      and(eq(entityMentions.workspaceId, workspaceId), ne(entityMentions.sourceType, 'chunk')),
    );

  const structuredRows = await collectStructuredRows(workspaceId, db);
  const now = new Date();
  const touched = new Set<string>();

  // Lookup: every normalization of every canonical name and alias → entity id
  const workspaceEntities = await db
    .select()
    .from(entities)
    .where(and(eq(entities.workspaceId, workspaceId), isNull(entities.mergedInto)));
  const lookup = new Map<string, string>();
  const addKeys = (name: string, type: string, entityId: string) => {
    lookup.set(`${type}|${normalizeEntityName(name)}`, entityId);
    lookup.set(`${type}|${normalizeMerchantString(name)}`, entityId);
  };
  for (const entity of workspaceEntities) {
    addKeys(entity.canonicalName, entity.type, entity.id);
    for (const alias of JSON.parse(entity.aliases) as string[]) {
      addKeys(alias, entity.type, entity.id);
    }
  }

  const userId = structuredRows[0] ? await ownerUserId(workspaceId, db) : null;

  for (const row of structuredRows) {
    const merchantKey = `${row.entityType}|${normalizeMerchantString(row.name)}`;
    const basicKey = `${row.entityType}|${normalizeEntityName(row.name)}`;
    let entityId = lookup.get(merchantKey) ?? lookup.get(basicKey);

    if (!entityId) {
      entityId = crypto.randomUUID();
      await db.insert(entities).values({
        id: entityId,
        workspaceId,
        userId: userId ?? 'unknown',
        type: row.entityType,
        canonicalName: row.name,
        normalizedName: normalizeEntityName(row.name),
        createdAt: now,
        updatedAt: now,
      });
      addKeys(row.name, row.entityType, entityId);
    }
    touched.add(entityId);

    await db.insert(entityMentions).values({
      id: crypto.randomUUID(),
      entityId,
      workspaceId,
      userId: userId ?? 'unknown',
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      snippet: null,
      confidence: 1,
      amount: row.amount,
      date: row.date,
      createdAt: now,
    });
  }

  for (const entityId of touched) {
    const [row] = await db
      .select({ n: count() })
      .from(entityMentions)
      .where(eq(entityMentions.entityId, entityId));
    await db
      .update(entities)
      .set({ mentionCount: row?.n ?? 0, updatedAt: now })
      .where(eq(entities.id, entityId));
  }

  // Prune entities orphaned by the rebuild (e.g. their only source row was
  // deleted); passing no chunk ids runs just the zero-mention sweep
  await cleanupMentionsForChunks([], workspaceId, db);
}

async function ownerUserId(workspaceId: string, db: DB): Promise<string | null> {
  const [anyEntity] = await db
    .select({ userId: entities.userId })
    .from(entities)
    .where(eq(entities.workspaceId, workspaceId))
    .limit(1);
  if (anyEntity) return anyEntity.userId;
  const [anyTxn] = await db
    .select({ userId: transactions.userId })
    .from(transactions)
    .where(eq(transactions.workspaceId, workspaceId))
    .limit(1);
  return anyTxn?.userId ?? null;
}

/**
 * Enqueues linking for a workspace unless an identical job is already pending.
 * Called from card CRUD paths — cheap to call often, debounced here.
 */
export async function enqueueLinkStructuredData(workspaceId: string, db: DB): Promise<void> {
  const pending = await db
    .select({ payload: jobs.payload })
    .from(jobs)
    .where(and(eq(jobs.type, JOB_TYPES.linkStructured), eq(jobs.status, 'pending')));

  const alreadyQueued = pending.some((job) => {
    try {
      return (JSON.parse(job.payload) as { workspaceId?: string }).workspaceId === workspaceId;
    } catch {
      return false;
    }
  });
  if (alreadyQueued) return;

  await enqueueJob(JOB_TYPES.linkStructured, { workspaceId }, { db });
}

/**
 * Fire-and-forget variant for router mutation paths — linking is additive, so
 * an enqueue failure must never fail the user's write.
 */
export function scheduleLinkStructuredData(workspaceId: string, db: DB): void {
  enqueueLinkStructuredData(workspaceId, db).catch((err) => {
    console.warn(`[entities] Failed to enqueue linking for workspace ${workspaceId}:`, err);
  });
}

/** Call once at boot to attach the handler to the job queue. */
export function registerEntityLinkingHandler(): void {
  registerJobHandler(JOB_TYPES.linkStructured, linkStructuredData);
}
