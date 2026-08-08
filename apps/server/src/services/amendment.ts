// ─── H2 · Amendments, over the desk ────────────────────────────────
// The detector: a year with a snapshot on it and a live view that has
// moved since is an amendment candidate. Everything decided about it
// lives in lib/calc/filing/amendment.ts; this reads the two manifests
// and hands them over.
//
// The baseline is the MOST RECENT snapshot, not the first. Someone who
// filed, amended, and then received a second corrected form is
// measuring against what they last sent — measuring against the
// original would produce a worksheet describing a return that no longer
// exists.

import type { DB } from '../db';
import type { Amendment } from '../lib/calc/filing/amendment';
import { buildAmendment } from '../lib/calc/filing/amendment';
import type { FactScopeKeys } from './facts';
import { listSnapshots, manifestFor } from './manifest';

export async function amendmentFor(
  db: DB,
  keys: FactScopeKeys,
  taxYear: number,
  today: Date = new Date(),
): Promise<Amendment | null> {
  const snapshots = await listSnapshots(db, keys, taxYear);
  // listSnapshots orders newest first.
  const baseline = snapshots[0];
  // No snapshot, nothing to amend against. A year still being worked on
  // is not an amendment candidate, it is a year still being worked on.
  if (baseline === undefined) return null;

  const live = await manifestFor(db, keys, taxYear, today);

  return buildAmendment({
    taxYear,
    snapshot: baseline.manifest,
    snapshotId: baseline.id,
    filedAt: baseline.filedAt,
    live,
    today,
  });
}
