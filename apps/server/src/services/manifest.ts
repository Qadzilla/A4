// ─── H1 · The manifest, persisted ──────────────────────────────────
// Building one is pure and lives in lib/calc/filing/manifest.ts. This
// adds the two things it can't have: the year read from the database,
// and snapshots.
//
// A snapshot is the answer to "what did I actually file?", which is the
// question H2 builds every amendment on. So it is frozen: the code here
// never updates a payload, and the database refuses to let it (the
// triggers in ensure-schema.ts). A fact superseded tomorrow moves the
// live manifest and moves nothing in a snapshot taken today — which is
// the whole point of taking one.

import { and, desc, eq } from 'drizzle-orm';
import type { DB } from '../db';
import { manifestSnapshots } from '../db/schema';
import type { Manifest } from '../lib/calc/filing/manifest';
import { buildManifest } from '../lib/calc/filing/manifest';
import type { FactScopeKeys } from './facts';
import { loadFilingYear } from './filing-year';

export interface StoredSnapshot {
  id: string;
  taxYear: number;
  manifest: Manifest;
  filedAt: string | null;
  label: string | null;
  createdAt: string;
}

/** The live manifest — recomputed on every read, never cached. */
export async function manifestFor(
  db: DB,
  keys: FactScopeKeys,
  taxYear: number,
  today: Date = new Date(),
): Promise<Manifest> {
  const year = await loadFilingYear(db, keys, taxYear);
  // The refund clock depends on when the return actually went in, and
  // the only place that is recorded is a snapshot marked filed. Reading
  // it here means the calendar on the live page is right for someone who
  // filed late, rather than telling them the money is gone while it
  // isn't.
  const filedAt = await lastFiledDate(db, keys, taxYear);
  return buildManifest({
    assertions: year.assertions,
    docs: year.docs,
    taxYear,
    today,
    filedAt,
    extras: year.extras,
  });
}

async function lastFiledDate(db: DB, keys: FactScopeKeys, taxYear: number): Promise<string | null> {
  const rows = await db
    .select({ filedAt: manifestSnapshots.filedAt })
    .from(manifestSnapshots)
    .where(
      and(
        eq(manifestSnapshots.workspaceId, keys.workspaceId),
        eq(manifestSnapshots.userId, keys.userId),
        eq(manifestSnapshots.taxYear, taxYear),
      ),
    )
    .orderBy(desc(manifestSnapshots.createdAt));
  return rows.find((r) => r.filedAt !== null)?.filedAt ?? null;
}

/** Freeze the year as it stands. Immutable from this moment. */
export async function snapshotManifest(
  db: DB,
  keys: FactScopeKeys,
  taxYear: number,
  label: string | null,
  today: Date = new Date(),
): Promise<StoredSnapshot> {
  const manifest = await manifestFor(db, keys, taxYear, today);
  const id = crypto.randomUUID();
  await db.insert(manifestSnapshots).values({
    id,
    workspaceId: keys.workspaceId,
    userId: keys.userId,
    taxYear,
    payload: JSON.stringify(manifest),
    filedAt: null,
    label,
    createdAt: today,
  });
  return {
    id,
    taxYear,
    manifest,
    filedAt: null,
    label,
    createdAt: today.toISOString(),
  };
}

export async function listSnapshots(
  db: DB,
  keys: FactScopeKeys,
  taxYear: number,
): Promise<StoredSnapshot[]> {
  const rows = await db
    .select()
    .from(manifestSnapshots)
    .where(
      and(
        eq(manifestSnapshots.workspaceId, keys.workspaceId),
        eq(manifestSnapshots.userId, keys.userId),
        eq(manifestSnapshots.taxYear, taxYear),
      ),
    )
    .orderBy(desc(manifestSnapshots.createdAt));

  return rows.map((r) => ({
    id: r.id,
    taxYear: r.taxYear,
    manifest: JSON.parse(r.payload) as Manifest,
    filedAt: r.filedAt,
    label: r.label,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Record that a snapshot was filed, on a date.
 *
 * The one write a snapshot accepts, and only once — new information
 * about an unchanged document, rather than a change to it. Marking a
 * second date would be rewriting history, so the trigger refuses it and
 * this returns the reason rather than throwing something opaque.
 */
export async function markFiled(
  db: DB,
  keys: FactScopeKeys,
  snapshotId: string,
  filedAt: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const result = await db
      .update(manifestSnapshots)
      .set({ filedAt })
      .where(
        and(
          eq(manifestSnapshots.id, snapshotId),
          eq(manifestSnapshots.workspaceId, keys.workspaceId),
          eq(manifestSnapshots.userId, keys.userId),
        ),
      );
    const changed = (result as unknown as { changes?: number }).changes;
    if (changed === 0) return { ok: false, reason: 'No such snapshot on this desk.' };
    return { ok: true };
  } catch {
    return {
      ok: false,
      reason:
        'That snapshot is already marked filed. A snapshot records what was filed and when, and neither can be rewritten — take a new one instead.',
    };
  }
}
