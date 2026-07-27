import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { DB } from '../db';
import { documentChunks, entities, entityMentions, transactions } from '../db/schema';

/** Amounts within a cent of each other are the same amount. */
const AMOUNT_TOLERANCE = 0.01;
/** A statement line and a ledger entry may post up to 3 days apart. */
const DATE_WINDOW_DAYS = 3;

export interface UnmatchedDocumentMention {
  mentionId: string;
  entityId: string;
  entityName: string;
  amount: number;
  date: Date | null;
  snippet: string | null;
  chunkId: string;
}

export interface UnmatchedTransaction {
  transactionId: string;
  description: string;
  amount: number;
  date: string;
  entityId: string | null;
}

export interface ReconciliationResult {
  /** Stated in documents (statements/receipts) but absent from the ledger */
  unmatchedDocumentMentions: UnmatchedDocumentMention[];
  /** In the ledger but not found in the compared documents */
  unmatchedTransactions: UnmatchedTransaction[];
  matchedCount: number;
}

function withinDays(a: Date, b: Date, days: number): boolean {
  return Math.abs(a.getTime() - b.getTime()) <= days * 24 * 60 * 60 * 1000;
}

function amountsMatch(a: number, b: number): boolean {
  return Math.abs(Math.abs(a) - Math.abs(b)) <= AMOUNT_TOLERANCE;
}

/**
 * Compares dollar amounts stated in document mentions against ledger
 * transactions. A pair matches when it shares an entity, the amounts agree to
 * the cent, and the dates fall within the posting window (a mention without a
 * date matches on entity + amount alone). Matching is greedy one-to-one, so a
 * single transaction can't satisfy two statement lines.
 *
 * Pass `fileId` to reconcile one document (e.g. "reconcile my July
 * statement"); omit it to compare every document mention in the workspace.
 */
export async function findUnmatchedTransactions(
  workspaceId: string,
  db: DB,
  fileId?: string,
): Promise<ReconciliationResult> {
  // Document-side: chunk mentions that state an amount
  const mentionConditions = [
    eq(entityMentions.workspaceId, workspaceId),
    eq(entityMentions.sourceType, 'chunk'),
    isNotNull(entityMentions.amount),
  ];
  if (fileId) {
    const chunkRows = await db
      .select({ id: documentChunks.id })
      .from(documentChunks)
      .where(eq(documentChunks.fileId, fileId));
    const chunkIds = chunkRows.map((c) => c.id);
    if (chunkIds.length === 0) {
      return { unmatchedDocumentMentions: [], unmatchedTransactions: [], matchedCount: 0 };
    }
    mentionConditions.push(inArray(entityMentions.sourceId, chunkIds));
  }
  const docMentions = await db
    .select()
    .from(entityMentions)
    .where(and(...mentionConditions));

  // Ledger-side: transactions and their entity links (via structured mentions)
  const txns = await db
    .select()
    .from(transactions)
    .where(eq(transactions.workspaceId, workspaceId));
  const txnMentions = await db
    .select({ entityId: entityMentions.entityId, sourceId: entityMentions.sourceId })
    .from(entityMentions)
    .where(
      and(
        eq(entityMentions.workspaceId, workspaceId),
        eq(entityMentions.sourceType, 'transaction'),
      ),
    );
  const txnEntity = new Map(txnMentions.map((m) => [m.sourceId, m.entityId]));

  const entityNames = new Map<string, string>();
  for (const row of await db
    .select({ id: entities.id, canonicalName: entities.canonicalName })
    .from(entities)
    .where(eq(entities.workspaceId, workspaceId))) {
    entityNames.set(row.id, row.canonicalName);
  }

  // Greedy one-to-one matching
  const unmatchedTxnPool = new Map(txns.map((t) => [t.id, t]));
  const unmatchedDocMentions: UnmatchedDocumentMention[] = [];
  let matchedCount = 0;

  for (const mention of docMentions) {
    const mentionAmount = mention.amount;
    if (mentionAmount === null) continue;

    let matchedTxnId: string | null = null;
    for (const [txnId, txn] of unmatchedTxnPool) {
      if (txnEntity.get(txnId) !== mention.entityId) continue;
      if (!amountsMatch(txn.amount, mentionAmount)) continue;
      if (mention.date) {
        const txnDate = new Date(`${txn.date}T00:00:00Z`);
        if (
          Number.isNaN(txnDate.getTime()) ||
          !withinDays(txnDate, mention.date, DATE_WINDOW_DAYS)
        ) {
          continue;
        }
      }
      matchedTxnId = txnId;
      break;
    }

    if (matchedTxnId) {
      unmatchedTxnPool.delete(matchedTxnId);
      matchedCount++;
    } else {
      unmatchedDocMentions.push({
        mentionId: mention.id,
        entityId: mention.entityId,
        entityName: entityNames.get(mention.entityId) ?? 'Unknown',
        amount: mentionAmount,
        date: mention.date,
        snippet: mention.snippet,
        chunkId: mention.sourceId,
      });
    }
  }

  const unmatchedTransactions: UnmatchedTransaction[] = [...unmatchedTxnPool.values()].map((t) => ({
    transactionId: t.id,
    description: t.description,
    amount: t.amount,
    date: t.date,
    entityId: txnEntity.get(t.id) ?? null,
  }));

  return { unmatchedDocumentMentions: unmatchedDocMentions, unmatchedTransactions, matchedCount };
}
