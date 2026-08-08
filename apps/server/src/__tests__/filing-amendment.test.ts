import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '../db';
import { ensureLaunchSchema } from '../db/ensure-schema';
import * as schema from '../db/schema';
import { claimClock } from '../lib/calc/filing/amendment';
import { amendmentFor } from '../services/amendment';
import { assertFact } from '../services/facts';
import { markFiled, snapshotManifest } from '../services/manifest';

// ─── H2 acceptance ─────────────────────────────────────────────────
// The corrected 1099 that lands after filing. What has to hold: the
// three columns reconcile to the dollar, a change that moves nothing
// says so instead of manufacturing a worksheet, the claim clock is
// right in both directions, and — the case that catches a naive
// implementation — two corrections before any amendment produce ONE
// worksheet with the combined change rather than two.

const KEYS = { userId: 'u1', workspaceId: 'w1' };
const TODAY = new Date('2026-05-01T00:00:00Z');

let db: DB;
let raw: Database.Database;

const say = async (factId: string, value: Parameters<typeof assertFact>[2]['value']) =>
  assertFact(db, KEYS, {
    factId,
    taxYear: 2025,
    value,
    source: { kind: 'person', conversationId: null },
  });

beforeEach(async () => {
  raw = new Database(':memory:');
  ensureLaunchSchema(raw);
  db = drizzle(raw, { schema }) as unknown as DB;

  await say('us-citizen', { kind: 'bool', value: true });
  await say('married', { kind: 'bool', value: false });
  await say('birth-date', { kind: 'date', value: '2003-04-15' });
  await say('digital-asset-activity', { kind: 'bool', value: false });
  await say('w2-employer-count', { kind: 'number', value: 1 });
  await say('w2-wages', { kind: 'number', value: 42000 });
  await say('gross-income', { kind: 'number', value: 42000 });
});

describe('nothing to amend', () => {
  it('a year with no snapshot is not a candidate at all', async () => {
    expect(await amendmentFor(db, KEYS, 2025, TODAY)).toBeNull();
  });

  it('a snapshot with nothing changed since reads as no-change', async () => {
    await snapshotManifest(db, KEYS, 2025, null, TODAY);
    const amendment = await amendmentFor(db, KEYS, 2025, TODAY);
    expect(amendment?.status).toBe('no-change');
    expect(amendment?.lines).toEqual([]);
    expect(amendment?.explanation).toContain('has changed since it was filed');
  });
});

describe('the three columns', () => {
  it('a corrected W-2 produces A, B and C that reconcile to the dollar', async () => {
    const snap = await snapshotManifest(db, KEYS, 2025, 'as filed', TODAY);
    await markFiled(db, KEYS, snap.id, '2026-03-03');

    // The corrected W-2 says $45,000.
    await say('w2-wages', { kind: 'number', value: 45000 });

    const amendment = await amendmentFor(db, KEYS, 2025, TODAY);
    if (!amendment) throw new Error('expected an amendment');
    expect(amendment.status).toBe('amend');

    for (const line of amendment.lines) {
      // Column B is column C minus column A. Every row, no exceptions.
      expect(Math.round(line.change), `${line.id} does not reconcile`).toBe(
        Math.round((line.asCorrected ?? 0) - (line.asFiled ?? 0)),
      );
    }

    const wages = amendment.lines.find((l) => l.id === '1040:1z');
    expect(wages?.asFiled).toBe(42000);
    expect(wages?.asCorrected).toBe(45000);
    expect(wages?.change).toBe(3000);

    // And the tax moved with it.
    expect(amendment.taxChange).toBeGreaterThan(0);
    expect(amendment.refundChange).toBeGreaterThan(0);
  });

  it('names what caused it, with the before and the after', async () => {
    await snapshotManifest(db, KEYS, 2025, null, TODAY);
    await say('w2-wages', { kind: 'number', value: 45000 });

    const amendment = await amendmentFor(db, KEYS, 2025, TODAY);
    const cause = amendment?.causes.find((c) => c.factId === 'w2-wages');
    expect(cause).toBeDefined();
    expect(cause?.before).toEqual({ kind: 'number', value: 42000 });
    expect(cause?.after).toEqual({ kind: 'number', value: 45000 });
  });

  it('drafts the Part III explanation from the diff, not from a template', async () => {
    await snapshotManifest(db, KEYS, 2025, null, TODAY);
    await say('w2-wages', { kind: 'number', value: 45000 });

    const amendment = await amendmentFor(db, KEYS, 2025, TODAY);
    const explanation = amendment?.explanation ?? '';
    expect(explanation).toContain('$42,000');
    expect(explanation).toContain('$45,000');
    expect(explanation).toMatch(/increases the (tax owed|refund due)/);
  });
});

describe('a change that changes nothing', () => {
  it('reports no action rather than manufacturing a worksheet', async () => {
    await snapshotManifest(db, KEYS, 2025, null, TODAY);

    // A fact that moves no line on any form: this person is not a
    // renter in Massachusetts, and answering an unrelated question
    // must not produce an amendment.
    await say('brokerage-account', { kind: 'bool', value: false });

    const amendment = await amendmentFor(db, KEYS, 2025, TODAY);
    expect(amendment?.status === 'no-change' || amendment?.status === 'no-action-needed').toBe(
      true,
    );
    expect(amendment?.taxChange).toBe(0);
  });

  it('a sub-dollar move is reported as needing nothing', async () => {
    await snapshotManifest(db, KEYS, 2025, null, TODAY);
    // Forty cents. The IRS publishes no math-error tolerance to compare
    // against, so the line is the return's own unit: a change that
    // rounds to zero whole dollars changes no line on any form.
    await say('w2-wages', { kind: 'number', value: 42000.4 });

    const amendment = await amendmentFor(db, KEYS, 2025, TODAY);
    expect(amendment?.status).toBe('no-change');
  });
});

describe('two corrections, one amendment', () => {
  it('accumulates rather than producing a worksheet per supersession', async () => {
    await snapshotManifest(db, KEYS, 2025, 'as filed', TODAY);

    // A corrected W-2 in March, then a second one in April. Nobody has
    // amended in between.
    await say('w2-wages', { kind: 'number', value: 45000 });
    await say('w2-wages', { kind: 'number', value: 47000 });

    const amendment = await amendmentFor(db, KEYS, 2025, TODAY);
    if (!amendment) throw new Error('expected an amendment');

    // ONE candidate.
    const wagesLines = amendment.lines.filter((l) => l.id === '1040:1z');
    expect(wagesLines).toHaveLength(1);
    // Carrying the cumulative change: 42,000 → 47,000, not two of 3,000
    // and 2,000, and not the last one alone.
    expect(wagesLines[0]?.asFiled).toBe(42000);
    expect(wagesLines[0]?.asCorrected).toBe(47000);
    expect(wagesLines[0]?.change).toBe(5000);

    // And one cause, showing the whole distance travelled.
    const causes = amendment.causes.filter((c) => c.factId === 'w2-wages');
    expect(causes).toHaveLength(1);
    expect(causes[0]?.before).toEqual({ kind: 'number', value: 42000 });
    expect(causes[0]?.after).toEqual({ kind: 'number', value: 47000 });
  });
});

// ─── The claim clock ───────────────────────────────────────────────

describe('the claim clock', () => {
  const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

  it('filing early buys nothing — the clock starts at the deadline', () => {
    // §6513(a): a return filed before the due date is filed ON it.
    const early = claimClock(2025, '2026-01-20', at('2026-05-01'));
    expect(early.deadline).toBe('2029-04-15');
    expect(early.note).toContain('counts as filing on 2026-04-15');
  });

  it('filing late moves it — three years from the day it went in', () => {
    const late = claimClock(2025, '2027-08-01', at('2027-09-01'));
    expect(late.deadline).toBe('2030-08-01');
    expect(late.boundBy).toBe('three-years-from-filing');
    expect(late.note).toContain('Filed late');
  });

  it('with no filing date, it assumes the deadline and says so', () => {
    const unknown = claimClock(2025, null, at('2026-05-01'));
    expect(unknown.deadline).toBe('2029-04-15');
    // Withholding counts as paid on the due date too, so the two-year
    // limb starts on the same day and never runs longer.
    expect(unknown.boundBy).toBe('three-years-from-filing');
    expect(unknown.note).toContain('two-year rule starts on the same day');
  });

  it('closes, and says how long is left before it does', () => {
    expect(claimClock(2025, null, at('2029-04-14')).status).toBe('closing-soon');
    expect(claimClock(2025, null, at('2029-04-16')).status).toBe('closed');
    expect(claimClock(2025, null, at('2026-05-01')).status).toBe('open');
    expect(claimClock(2025, null, at('2027-04-15')).daysRemaining).toBe(731);
  });
});

describe('the window closing is about refunds, not about amending', () => {
  it('a refund past the deadline is named as gone', async () => {
    const snap = await snapshotManifest(db, KEYS, 2025, null, TODAY);
    await markFiled(db, KEYS, snap.id, '2026-03-03');
    // Wages were overstated: this would bring money back.
    await say('w2-wages', { kind: 'number', value: 38000 });

    const amendment = await amendmentFor(db, KEYS, 2025, new Date('2030-01-01T00:00:00Z'));
    expect(amendment?.status).toBe('refund-window-closed');
    expect(JSON.stringify(amendment?.notes)).toContain('stays with the Treasury');
  });

  it('owing more is never barred by it', async () => {
    const snap = await snapshotManifest(db, KEYS, 2025, null, TODAY);
    await markFiled(db, KEYS, snap.id, '2026-03-03');
    await say('w2-wages', { kind: 'number', value: 45000 });

    const amendment = await amendmentFor(db, KEYS, 2025, new Date('2030-01-01T00:00:00Z'));
    // §6511 limits claims for money back, not payments in. Telling
    // someone who owes more that they are too late would be wrong in
    // the more expensive direction.
    expect(amendment?.status).toBe('amend');
    expect(JSON.stringify(amendment?.notes)).toContain('amended to pay more at any time');
  });
});

describe('the baseline is what was last filed', () => {
  it('a second snapshot supersedes the first as column A', async () => {
    await snapshotManifest(db, KEYS, 2025, 'original', TODAY);
    await say('w2-wages', { kind: 'number', value: 45000 });

    // The amendment went in; a new snapshot records what was sent.
    const second = await snapshotManifest(
      db,
      KEYS,
      2025,
      'after amending',
      new Date('2026-06-01T00:00:00Z'),
    );
    await markFiled(db, KEYS, second.id, '2026-06-01');

    // Then a third corrected form arrives.
    await say('w2-wages', { kind: 'number', value: 46000 });

    const amendment = await amendmentFor(db, KEYS, 2025, new Date('2026-07-01T00:00:00Z'));
    const wages = amendment?.lines.find((l) => l.id === '1040:1z');
    // Column A is 45,000 — what the last filing said — not the 42,000
    // of a return that no longer exists.
    expect(wages?.asFiled).toBe(45000);
    expect(wages?.asCorrected).toBe(46000);
  });
});
