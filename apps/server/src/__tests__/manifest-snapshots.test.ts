import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '../db';
import { ensureLaunchSchema } from '../db/ensure-schema';
import * as schema from '../db/schema';
import { assertFact } from '../services/facts';
import { listSnapshots, manifestFor, markFiled, snapshotManifest } from '../services/manifest';

// ─── H1 snapshots ──────────────────────────────────────────────────
// A snapshot answers "what did I actually file?", which is the question
// every amendment is built on. So the interesting tests are all about
// what CANNOT happen to one — and they run against the real DDL,
// triggers included, because the P8 lesson is that a promise the
// application makes is not the same as a guarantee the database keeps.

const KEYS = { userId: 'u1', workspaceId: 'w1' };
const TODAY = new Date('2026-03-01T00:00:00Z');

let db: DB;
let raw: Database.Database;

beforeEach(async () => {
  raw = new Database(':memory:');
  // The launch DDL itself, so the triggers under test are the shipped ones.
  ensureLaunchSchema(raw);
  db = drizzle(raw, { schema }) as unknown as DB;

  for (const [factId, value] of [
    ['us-citizen', { kind: 'bool', value: true }],
    ['married', { kind: 'bool', value: false }],
    ['birth-date', { kind: 'date', value: '2003-04-15' }],
    ['w2-employer-count', { kind: 'number', value: 1 }],
    ['w2-wages', { kind: 'number', value: 42000 }],
    ['gross-income', { kind: 'number', value: 42000 }],
    ['digital-asset-activity', { kind: 'bool', value: false }],
  ] as Array<[string, Parameters<typeof assertFact>[2]['value']]>) {
    await assertFact(db, KEYS, {
      factId,
      taxYear: 2025,
      value,
      source: { kind: 'person', conversationId: null },
    });
  }
});

describe('taking one', () => {
  it('freezes the manifest as it stands, and lists back', async () => {
    const snap = await snapshotManifest(db, KEYS, 2025, 'before I file', TODAY);
    expect(snap.manifest.taxYear).toBe(2025);
    expect(snap.filedAt).toBeNull();

    const all = await listSnapshots(db, KEYS, 2025);
    expect(all).toHaveLength(1);
    expect(all[0]?.label).toBe('before I file');
    expect(all[0]?.manifest.forms.length).toBeGreaterThan(0);
  });
});

describe('what cannot happen to one', () => {
  it('the payload cannot be rewritten — the database refuses, not just the code', async () => {
    const snap = await snapshotManifest(db, KEYS, 2025, null, TODAY);
    expect(() =>
      raw
        .prepare('UPDATE manifest_snapshots SET payload = ? WHERE id = ?')
        .run('{"tampered":true}', snap.id),
    ).toThrow(/immutable/);
  });

  it('a snapshot cannot be deleted', async () => {
    const snap = await snapshotManifest(db, KEYS, 2025, null, TODAY);
    expect(() => raw.prepare('DELETE FROM manifest_snapshots WHERE id = ?').run(snap.id)).toThrow(
      /cannot be deleted/,
    );
  });

  it('the year it belongs to cannot be moved', async () => {
    const snap = await snapshotManifest(db, KEYS, 2025, null, TODAY);
    expect(() =>
      raw.prepare('UPDATE manifest_snapshots SET tax_year = 2026 WHERE id = ?').run(snap.id),
    ).toThrow(/immutable/);
  });
});

describe('marking it filed', () => {
  it('is the one write a snapshot accepts', async () => {
    const snap = await snapshotManifest(db, KEYS, 2025, null, TODAY);
    const result = await markFiled(db, KEYS, snap.id, '2026-04-10');
    expect(result.ok).toBe(true);

    const [stored] = await listSnapshots(db, KEYS, 2025);
    expect(stored?.filedAt).toBe('2026-04-10');
  });

  it('cannot be rewritten once set — a filed date is not a draft', async () => {
    const snap = await snapshotManifest(db, KEYS, 2025, null, TODAY);
    await markFiled(db, KEYS, snap.id, '2026-04-10');
    const second = await markFiled(db, KEYS, snap.id, '2026-04-14');

    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toContain('already marked filed');

    const [stored] = await listSnapshots(db, KEYS, 2025);
    expect(stored?.filedAt).toBe('2026-04-10');
  });

  it("another desk's snapshot is not findable, let alone writable", async () => {
    const snap = await snapshotManifest(db, KEYS, 2025, null, TODAY);
    const result = await markFiled(db, { userId: 'u2', workspaceId: 'w2' }, snap.id, '2026-04-10');
    expect(result.ok).toBe(false);
  });
});

describe('the live view moves; the snapshot does not', () => {
  it('a fact superseded after the snapshot changes one and not the other', async () => {
    const snap = await snapshotManifest(db, KEYS, 2025, null, TODAY);
    const frozenAgi = snap.manifest.forms[0]?.lines.find((l) => l.id === '1040:11')?.amount;
    expect(frozenAgi).toBe(42000);

    // The W-2 was wrong; a corrected one says $48,000.
    await assertFact(db, KEYS, {
      factId: 'w2-wages',
      taxYear: 2025,
      value: { kind: 'number', value: 48000 },
      source: { kind: 'person', conversationId: null },
    });

    const live = await manifestFor(db, KEYS, 2025, TODAY);
    expect(live.forms[0]?.lines.find((l) => l.id === '1040:11')?.amount).toBe(48000);

    // The snapshot is what was filed. It says what it said.
    const [stored] = await listSnapshots(db, KEYS, 2025);
    expect(stored?.manifest.forms[0]?.lines.find((l) => l.id === '1040:11')?.amount).toBe(42000);
  });
});
