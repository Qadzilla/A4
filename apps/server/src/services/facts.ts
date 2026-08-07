// ─── G1 · The fact model, persisted ────────────────────────────────
// A1 is pure — no clock, no database, no invented ids. This is the thin
// layer that gives it those three things and nothing else. Every read
// comes back through `factSet`; every write goes through
// `validateAssertion` first, so the untyped path (HTTP, and later the
// AI's record_fact tool) is held to exactly the same registry as the
// typed one.
//
// The table is append-only and stays that way. Changing an answer writes
// a NEW row pointing at the old one through `supersedes`, which is what
// makes a corrected document able to re-run precisely what depended on
// the number it corrected. Nothing here ever UPDATEs or DELETEs an
// assertion — if it did, the audit trail the whole engine leans on would
// be a lie.
//
// Until C1 this file did not exist and each extractor kept its own
// loader filtered to its own fact ids. Those still work; this is the one
// that reads the whole year, which is what an intake needs.

import { and, eq } from 'drizzle-orm';
import type { DB } from '../db';
import { factAssertions } from '../db/schema';
import {
  FACT_REGISTRY,
  type FactAssertion,
  type FactId,
  type FactSource,
  type FactValue,
  isFactId,
  validateAssertion,
} from '../lib/calc/filing/facts';

export interface FactScopeKeys {
  userId: string;
  workspaceId: string;
}

const toAssertion = (row: typeof factAssertions.$inferSelect): FactAssertion => ({
  assertionId: row.assertionId,
  factId: row.factId as FactId,
  taxYear: row.taxYear,
  value: JSON.parse(row.value) as FactValue,
  source: JSON.parse(row.source) as FactSource,
  assertedAt: row.assertedAt,
  supersedes: row.supersedes,
});

/**
 * Every assertion for a desk, both years and timeless — supersession is
 * resolved by `liveAssertions`, not by the query, because a superseded
 * assertion is still part of the record and `dependents` needs to see it.
 *
 * Rows whose fact id is no longer in the registry are dropped rather than
 * crashing the year: the registry is a closed set at compile time, but a
 * database outlives a deployment.
 */
export async function loadFacts(
  db: DB,
  keys: FactScopeKeys,
  taxYear?: number,
): Promise<FactAssertion[]> {
  const where = [
    eq(factAssertions.workspaceId, keys.workspaceId),
    eq(factAssertions.userId, keys.userId),
  ];
  const rows = await db
    .select()
    .from(factAssertions)
    .where(and(...where));

  return rows
    .filter((r) => isFactId(r.factId))
    .filter((r) => taxYear === undefined || r.taxYear === taxYear)
    .map(toAssertion);
}

type Problem = Extract<ReturnType<typeof validateAssertion>, { ok: false }>['problem'];

export type AssertResult = { ok: true; assertion: FactAssertion } | { ok: false; problem: Problem };

export interface AssertFactInput {
  factId: string;
  taxYear: number;
  value: FactValue;
  source: FactSource;
  /** Injectable, like every other clock in this engine. */
  now?: Date;
  /** The assertion this replaces. Resolved automatically when omitted. */
  supersedes?: string | null;
  assertionId?: string;
}

/**
 * Write one assertion. When `supersedes` is omitted, the current live
 * assertion for that fact — from the same kind of source — is superseded
 * automatically, which is what makes "change your answer" a one-call
 * operation from the surface.
 *
 * A person correcting a document's number supersedes the document: they
 * were shown what it said and disagreed on purpose. A document does NOT
 * silently supersede a person; that lands as a contradiction, and
 * readiness blocks on it until someone picks a side. Averaging two
 * sources, or letting the newest quietly win, is the failure this shape
 * exists to prevent.
 */
export async function assertFact(
  db: DB,
  keys: FactScopeKeys,
  input: AssertFactInput,
): Promise<AssertResult> {
  const now = input.now ?? new Date();

  let supersedes = input.supersedes ?? null;
  if (supersedes === null && isFactId(input.factId)) {
    const existing = await loadFacts(db, keys, undefined);
    const live = liveFor(existing, input.factId, input.taxYear);
    // Person answers supersede whatever was there. Everything else only
    // supersedes its own kind — see the doc comment.
    const target =
      input.source.kind === 'person'
        ? live[live.length - 1]
        : live.filter((a) => a.source.kind === input.source.kind).pop();
    supersedes = target?.assertionId ?? null;
  }

  const checked = validateAssertion({
    assertionId: input.assertionId ?? crypto.randomUUID(),
    factId: input.factId,
    taxYear: input.taxYear,
    value: input.value,
    source: input.source,
    assertedAt: now.toISOString(),
    supersedes,
  });
  if (!checked.ok) return { ok: false, problem: checked.problem };

  await db.insert(factAssertions).values({
    assertionId: checked.assertion.assertionId,
    workspaceId: keys.workspaceId,
    userId: keys.userId,
    factId: checked.assertion.factId,
    taxYear: checked.assertion.taxYear,
    value: JSON.stringify(checked.assertion.value),
    source: JSON.stringify(checked.assertion.source),
    assertedAt: checked.assertion.assertedAt,
    supersedes: checked.assertion.supersedes,
    createdAt: now,
  });

  return { ok: true, assertion: checked.assertion };
}

/**
 * The live assertions for one fact, in assertion order. Timeless facts —
 * a birth date, a visa's first entry — ignore the year, exactly as
 * `factSet` does, so answering one in 2025 doesn't leave a duplicate
 * waiting to contradict it in 2026.
 */
function liveFor(all: FactAssertion[], factId: FactId, taxYear: number): FactAssertion[] {
  const superseded = new Set(all.map((a) => a.supersedes).filter((v): v is string => v !== null));
  const timeless = FACT_REGISTRY[factId].scope === 'timeless';
  return all
    .filter((a) => !superseded.has(a.assertionId))
    .filter((a) => a.factId === factId)
    .filter((a) => timeless || a.taxYear === taxYear)
    .sort((a, b) => a.assertedAt.localeCompare(b.assertedAt));
}
