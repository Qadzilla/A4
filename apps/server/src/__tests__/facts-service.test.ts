import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '../db';
import * as schema from '../db/schema';
import { factAssertions } from '../db/schema';
import { factSet, factState } from '../lib/calc/filing/facts';
import { assertFact, loadFacts } from '../services/facts';

// ─── G1 persistence ────────────────────────────────────────────────
// The P8 lesson, applied: anything that writes gets checked in the
// database, not on a screen. What matters here is that the table stays
// append-only — a changed answer must leave both rows behind, because
// `dependents` re-runs off that history and an UPDATE would erase the
// question of what used to be true.

const FACTS_SQL = `
  CREATE TABLE fact_assertions (
    assertion_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    fact_id TEXT NOT NULL,
    tax_year INTEGER NOT NULL,
    value TEXT NOT NULL,
    source TEXT NOT NULL,
    asserted_at TEXT NOT NULL,
    supersedes TEXT,
    created_at INTEGER NOT NULL
  );
`;

const KEYS = { userId: 'u1', workspaceId: 'w1' };
const OTHER = { userId: 'u2', workspaceId: 'w2' };

let db: DB;
let raw: Database.Database;

beforeEach(() => {
  raw = new Database(':memory:');
  raw.exec(FACTS_SQL);
  db = drizzle(raw, { schema }) as unknown as DB;
});

const rows = () =>
  raw.prepare('SELECT * FROM fact_assertions').all() as Array<{
    assertion_id: string;
    fact_id: string;
    supersedes: string | null;
    value: string;
  }>;

describe('writing a fact', () => {
  it('persists, and reads back through the A1 algebra', async () => {
    const written = await assertFact(db, KEYS, {
      factId: 'state-of-residence',
      taxYear: 2025,
      value: { kind: 'string', value: 'MA' },
      source: { kind: 'person', conversationId: null },
    });
    expect(written.ok).toBe(true);
    expect(rows()).toHaveLength(1);

    const loaded = await loadFacts(db, KEYS, 2025);
    const state = factState(factSet(loaded, 2025), 'state-of-residence');
    expect(state.status).toBe('known');
    if (state.status === 'known') expect(state.value).toEqual({ kind: 'string', value: 'MA' });
  });

  it('rejects an invented fact id with the nearest real ones', async () => {
    const result = await assertFact(db, KEYS, {
      factId: 'state-of-residency',
      taxYear: 2025,
      value: { kind: 'string', value: 'MA' },
      source: { kind: 'person', conversationId: null },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.reason).toBe('unknown-fact-id');
    if (result.problem.reason !== 'unknown-fact-id') return;
    expect(result.problem.suggestions).toContain('state-of-residence');
    // And nothing was written — a rejection is not a partial write.
    expect(rows()).toHaveLength(0);
  });

  it('a skip is an assertion, not an absence', async () => {
    await assertFact(db, KEYS, {
      factId: 'self-support-share-pct',
      taxYear: 2025,
      value: { kind: 'unknown' },
      source: { kind: 'person', conversationId: null },
    });
    const loaded = await loadFacts(db, KEYS, 2025);
    expect(factState(factSet(loaded, 2025), 'self-support-share-pct').status).toBe('unknown');
    // Distinct from a fact nobody asked about.
    expect(factState(factSet(loaded, 2025), 'lived-with-parents-months').status).toBe('unasserted');
  });
});

describe('changing an answer', () => {
  it('supersedes rather than overwrites — both rows survive', async () => {
    const first = await assertFact(db, KEYS, {
      factId: 'w2-employer-count',
      taxYear: 2025,
      value: { kind: 'number', value: 1 },
      source: { kind: 'person', conversationId: null },
    });
    const second = await assertFact(db, KEYS, {
      factId: 'w2-employer-count',
      taxYear: 2025,
      value: { kind: 'number', value: 2 },
      source: { kind: 'person', conversationId: null },
    });
    if (!first.ok || !second.ok) throw new Error('both writes should succeed');

    const all = rows();
    expect(all).toHaveLength(2);
    expect(second.assertion.supersedes).toBe(first.assertion.assertionId);

    const loaded = await loadFacts(db, KEYS, 2025);
    const state = factState(factSet(loaded, 2025), 'w2-employer-count');
    expect(state.status).toBe('known');
    if (state.status === 'known') expect(state.value).toEqual({ kind: 'number', value: 2 });
  });

  it('a person correcting a document supersedes it — they were shown it and disagreed', async () => {
    const doc = await assertFact(db, KEYS, {
      factId: 'w2-wages',
      taxYear: 2025,
      value: { kind: 'number', value: 19200 },
      source: { kind: 'document', fileId: 'f1', field: 'box1' },
    });
    const person = await assertFact(db, KEYS, {
      factId: 'w2-wages',
      taxYear: 2025,
      value: { kind: 'number', value: 19000 },
      source: { kind: 'person', conversationId: null },
    });
    if (!doc.ok || !person.ok) throw new Error('both writes should succeed');
    expect(person.assertion.supersedes).toBe(doc.assertion.assertionId);

    const state = factState(factSet(await loadFacts(db, KEYS, 2025), 2025), 'w2-wages');
    if (state.status !== 'known') throw new Error('expected a settled value');
    expect(state.value).toEqual({ kind: 'number', value: 19000 });
  });

  it('a document does NOT silently overwrite a person — that lands as a contradiction', async () => {
    await assertFact(db, KEYS, {
      factId: 'w2-wages',
      taxYear: 2025,
      value: { kind: 'number', value: 19000 },
      source: { kind: 'person', conversationId: null },
    });
    await assertFact(db, KEYS, {
      factId: 'w2-wages',
      taxYear: 2025,
      value: { kind: 'number', value: 19200 },
      source: { kind: 'document', fileId: 'f1', field: 'box1' },
    });

    // Two live sources disagreeing is the point: readiness blocks on it
    // rather than averaging them or letting the newest quietly win.
    const state = factState(factSet(await loadFacts(db, KEYS, 2025), 2025), 'w2-wages');
    expect(state.status).toBe('contradicted');
  });

  it('a timeless fact answered once is not re-answered per year', async () => {
    const first = await assertFact(db, KEYS, {
      factId: 'birth-date',
      taxYear: 2025,
      value: { kind: 'date', value: '2003-04-04' },
      source: { kind: 'person', conversationId: null },
    });
    const corrected = await assertFact(db, KEYS, {
      factId: 'birth-date',
      taxYear: 2026,
      value: { kind: 'date', value: '2003-04-05' },
      source: { kind: 'person', conversationId: null },
    });
    if (!first.ok || !corrected.ok) throw new Error('both writes should succeed');
    // Different years, same fact — the 2026 answer still supersedes the
    // 2025 one, because a birth date is not a fact about a year.
    expect(corrected.assertion.supersedes).toBe(first.assertion.assertionId);
    const state = factState(factSet(await loadFacts(db, KEYS), 2025), 'birth-date');
    if (state.status !== 'known') throw new Error('expected a settled value');
    expect(state.value).toEqual({ kind: 'date', value: '2003-04-05' });
  });
});

describe('isolation', () => {
  it("one desk never reads another's facts", async () => {
    await assertFact(db, KEYS, {
      factId: 'state-of-residence',
      taxYear: 2025,
      value: { kind: 'string', value: 'MA' },
      source: { kind: 'person', conversationId: null },
    });
    expect(await loadFacts(db, OTHER, 2025)).toEqual([]);
  });

  it('a year is loadable on its own, and the whole desk together', async () => {
    await assertFact(db, KEYS, {
      factId: 'gross-income',
      taxYear: 2025,
      value: { kind: 'number', value: 42000 },
      source: { kind: 'person', conversationId: null },
    });
    await assertFact(db, KEYS, {
      factId: 'gross-income',
      taxYear: 2026,
      value: { kind: 'number', value: 51000 },
      source: { kind: 'person', conversationId: null },
    });
    expect(await loadFacts(db, KEYS, 2025)).toHaveLength(1);
    expect(await loadFacts(db, KEYS)).toHaveLength(2);
    // Two years of the same fact are not a contradiction.
    const state = factState(factSet(await loadFacts(db, KEYS), 2026), 'gross-income');
    if (state.status !== 'known') throw new Error('expected a settled value');
    expect(state.value).toEqual({ kind: 'number', value: 51000 });
  });
});
