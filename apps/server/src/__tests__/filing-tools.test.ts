import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '../db';
import * as schema from '../db/schema';
import { evaluateYear } from '../lib/calc/filing/evaluation';
import { type FactAssertion, makeAssertion } from '../lib/calc/filing/facts';
import { getToolDefinitions } from '../services/ai-tools';
import { assertFact } from '../services/facts';
import {
  explainDeterminationTool,
  getReadinessTool,
  priceUnknownTool,
  recordFactTool,
} from '../services/filing-tools';

// ─── G2 acceptance ─────────────────────────────────────────────────
// The four tools, and the two things that must never slip: a tool must
// not compute, and a citation must be the engine's own string. The
// second is pinned with string equality on purpose — a paraphrased
// citation reads as authority and isn't, which is the failure this
// whole arrangement exists to prevent.

const SQL = `
  CREATE TABLE fact_assertions (
    assertion_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
    fact_id TEXT NOT NULL, tax_year INTEGER NOT NULL, value TEXT NOT NULL,
    source TEXT NOT NULL, asserted_at TEXT NOT NULL, supersedes TEXT, created_at INTEGER NOT NULL
  );
  CREATE TABLE w2_forms (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
    file_id TEXT NOT NULL UNIQUE, tax_year INTEGER NOT NULL, employer_name TEXT,
    employer_ein TEXT, corrected INTEGER NOT NULL DEFAULT 0, payload TEXT NOT NULL,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE income_forms (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
    file_id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, tax_year INTEGER NOT NULL,
    payer_name TEXT, payer_tin TEXT, corrected INTEGER NOT NULL DEFAULT 0,
    payload TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE investment_forms (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
    file_id TEXT NOT NULL UNIQUE, tax_year INTEGER NOT NULL, broker TEXT, broker_tin TEXT,
    corrected INTEGER NOT NULL DEFAULT 0, payload TEXT NOT NULL,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE education_health_forms (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
    file_id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, tax_year INTEGER NOT NULL,
    issuer_name TEXT, issuer_tin TEXT, corrected INTEGER NOT NULL DEFAULT 0,
    payload TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE benefit_forms (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
    file_id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, tax_year INTEGER NOT NULL,
    payer_name TEXT, payer_tin TEXT, corrected INTEGER NOT NULL DEFAULT 0,
    payload TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE trades (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
    symbol TEXT NOT NULL, side TEXT NOT NULL, trade_date TEXT NOT NULL,
    units REAL NOT NULL, price REAL NOT NULL, fees REAL NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'manual', external_id TEXT UNIQUE,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
`;

const KEYS = { userId: 'u1', workspaceId: 'w1' };
const TODAY = new Date('2026-03-01T00:00:00Z');

let db: DB;
let raw: Database.Database;

beforeEach(() => {
  raw = new Database(':memory:');
  raw.exec(SQL);
  db = drizzle(raw, { schema }) as unknown as DB;
});

/** A Bostonian on payroll — enough of a year for the engine to decide things. */
async function seedBostonian(): Promise<void> {
  const facts: Array<[string, unknown]> = [
    ['us-citizen', true],
    ['married', false],
    ['birth-date', '2003-04-04'],
    ['state-of-residence', 'MA'],
    ['w2-wages', 42000],
    ['gross-income', 42000],
    ['w2-employer-count', 1],
  ];
  for (const [factId, value] of facts) {
    await recordFactTool(db, KEYS, { factId, value, taxYear: 2025, conversationId: 'c1' });
  }
}

describe('record_fact', () => {
  it('writes what the person said, with the conversation on it', async () => {
    const result = await recordFactTool(db, KEYS, {
      factId: 'state-of-residence',
      value: 'MA',
      taxYear: 2025,
      conversationId: 'c1',
    });
    expect(result.available).toBe(true);
    expect(result.recorded).toBe('state-of-residence');

    const rows = raw.prepare('SELECT * FROM fact_assertions').all() as Array<{ source: string }>;
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]?.source ?? '{}')).toEqual({
      kind: 'person',
      conversationId: 'c1',
    });
  });

  it('an invented fact id is rejected WITH the nearest real ones', async () => {
    const result = await recordFactTool(db, KEYS, {
      factId: 'state_of_residency',
      value: 'MA',
      taxYear: 2025,
      conversationId: 'c1',
    });
    expect(result.available).toBe(false);
    expect(result.didYouMean).toContain('state-of-residence');
    expect(raw.prepare('SELECT COUNT(*) c FROM fact_assertions').get()).toEqual({ c: 0 });
  });

  it('takes plain values and maps them onto the registry kind', async () => {
    await recordFactTool(db, KEYS, {
      factId: 'married',
      value: 'yes',
      taxYear: 2025,
      conversationId: 'c1',
    });
    await recordFactTool(db, KEYS, {
      factId: 'w2-wages',
      value: '$42,000',
      taxYear: 2025,
      conversationId: 'c1',
    });
    const rows = raw.prepare('SELECT fact_id, value FROM fact_assertions').all() as Array<{
      fact_id: string;
      value: string;
    }>;
    const byId = new Map(rows.map((r) => [r.fact_id, JSON.parse(r.value)]));
    expect(byId.get('married')).toEqual({ kind: 'bool', value: true });
    expect(byId.get('w2-wages')).toEqual({ kind: 'number', value: 42000 });
  });

  it('null is "they said they don\'t know" — an answer, not a missing argument', async () => {
    const result = await recordFactTool(db, KEYS, {
      factId: 'self-support-share-pct',
      value: null,
      taxYear: 2025,
      conversationId: 'c1',
    });
    expect(result.available).toBe(true);
    expect(result.value).toEqual({ kind: 'unknown' });
  });

  it('a wrong-shaped value is refused with the shape it wanted', async () => {
    const result = await recordFactTool(db, KEYS, {
      factId: 'birth-date',
      value: 'April 2003',
      taxYear: 2025,
      conversationId: 'c1',
    });
    expect(result.available).toBe(false);
    expect(String(result.reason)).toContain('YYYY-MM-DD');
  });

  it('a fact the engine derives cannot be written by the model', async () => {
    const result = await recordFactTool(db, KEYS, {
      factId: 'filing-status',
      value: 'single',
      taxYear: 2025,
      conversationId: 'c1',
    });
    expect(result.available).toBe(false);
    expect(String(result.reason)).toContain('works out');
  });

  it('never writes anything but person provenance', async () => {
    await seedBostonian();
    const sources = (
      raw.prepare('SELECT source FROM fact_assertions').all() as Array<{ source: string }>
    ).map((r) => JSON.parse(r.source).kind);
    expect(new Set(sources)).toEqual(new Set(['person']));
  });
});

describe('get_readiness', () => {
  it('an empty year says so rather than pretending to assess one', async () => {
    const result = await getReadinessTool(db, KEYS, 2025, TODAY);
    expect(result.available).toBe(true);
    expect(result.verdict).toBe('not-started');
  });

  it("returns A6's object, not a summary of it", async () => {
    await seedBostonian();
    const result = await getReadinessTool(db, KEYS, 2025, TODAY);
    expect(result.available).toBe(true);
    for (const key of [
      'verdict',
      'lines',
      'blockers',
      'contradictions',
      'unknowns',
      'outOfScope',
    ]) {
      expect(result, `missing ${key}`).toHaveProperty(key);
    }
  });

  it('an uploaded W-2 stops readiness claiming it never arrived', async () => {
    await seedBostonian();
    const before = await getReadinessTool(db, KEYS, 2025, TODAY);
    expect(JSON.stringify(before.lines)).toContain('W-2');
    expect(JSON.stringify(before.blockers)).toContain('W-2');

    raw
      .prepare(
        `INSERT INTO w2_forms (id, workspace_id, user_id, file_id, tax_year, payload, created_at, updated_at)
         VALUES ('r1', 'w1', 'u1', 'f1', 2025, '{}', 0, 0)`,
      )
      .run();

    const after = await getReadinessTool(db, KEYS, 2025, TODAY);
    expect(JSON.stringify(after.blockers)).not.toContain('W-2');
  });
});

describe('price_unknown', () => {
  it('one fact comes back as two branches and the difference between them', async () => {
    await seedBostonian();
    const result = await priceUnknownTool(db, KEYS, 2025, 'unreported-tips');
    expect(result.available).toBe(true);
    expect(result.at).toBe('unreported-tips');
    expect((result.branches as unknown[]).length).toBe(2);
    expect(result.delta as number).toBeGreaterThan(0);
    // Single-fact fork: everything else identical in both branches.
    expect(String(result.heldConstant)).toContain('stays exactly as it is');
  });

  it('a fact already known has nothing to price, and says which', async () => {
    await seedBostonian();
    const result = await priceUnknownTool(db, KEYS, 2025, 'state-of-residence');
    expect(result.available).toBe(false);
    expect(String(result.reason)).toContain('already known');
  });

  it('the ranked list is priced, and carries the question to ask', async () => {
    await seedBostonian();
    const result = await priceUnknownTool(db, KEYS, 2025);
    expect(result.available).toBe(true);
    const ranked = result.ranked as Array<{ at: string; question: string; worth: number | null }>;
    expect(ranked.length).toBeGreaterThan(0);
    // Every row can be asked out loud without the model inventing wording.
    expect(ranked.every((r) => r.question.trim().endsWith('?'))).toBe(true);
    const worths = ranked.map((r) => r.worth ?? 0);
    expect(worths).toEqual([...worths].sort((a, b) => b - a));
  });

  it('never comes back empty-handed while a question remains', async () => {
    // Caught live: handed a list it could not price, the model filled the
    // silence by reciting a state's rent rules from memory and got the cap
    // wrong. Every ranked result must leave something to ASK, and must
    // carry the instruction not to invent the figure instead.
    const empty = await priceUnknownTool(db, KEYS, 2025);
    await recordFactTool(db, KEYS, {
      factId: 'state-of-residence',
      value: 'MA',
      taxYear: 2025,
      conversationId: 'c1',
    });
    const thin = await priceUnknownTool(db, KEYS, 2025);
    await seedBostonian();
    const full = await priceUnknownTool(db, KEYS, 2025);

    for (const result of [empty, thin, full]) {
      expect(result.available).toBe(true);
      expect((result.ranked as unknown[]).length).toBeGreaterThan(0);
      expect(String(result.note)).toContain('do not state any threshold');
    }
  });

  it('an invented fact id is rejected with suggestions here too', async () => {
    await seedBostonian();
    const result = await priceUnknownTool(db, KEYS, 2025, 'unreported-tip');
    expect(result.available).toBe(false);
    expect(result.didYouMean).toContain('unreported-tips');
  });
});

describe('explain_determination', () => {
  it('returns the engine trace verbatim — citation string-equal, not paraphrased', async () => {
    await seedBostonian();
    const result = await explainDeterminationTool(db, KEYS, 2025, 'residency');
    expect(result.available).toBe(true);

    // The same evaluation, run directly. The tool must be a courier.
    const assertions: FactAssertion[] = [
      makeAssertion({
        assertionId: 'direct',
        factId: 'us-citizen',
        taxYear: 2025,
        value: { kind: 'bool', value: true },
        source: { kind: 'person', conversationId: null },
        assertedAt: '2025-01-01T00:00:00Z',
        supersedes: null,
      }),
    ];
    const engine = evaluateYear(assertions, 2025).residency.explanation;

    expect(result.citation).toBe(engine.citation);
    expect(result.ruleId).toBe(engine.ruleId);
    expect(result.steps).toEqual(engine.steps);
  });

  it('the state trace carries the state module’s own authority', async () => {
    await seedBostonian();
    const result = await explainDeterminationTool(db, KEYS, 2025, 'state');
    expect(result.available).toBe(true);
    expect(result.ruleId).toBe('state/ma-form1');
    expect(String(result.citation).length).toBeGreaterThan(0);
  });

  it('a determination the year never put in play degrades with a reason', async () => {
    await seedBostonian();
    const result = await explainDeterminationTool(db, KEYS, 2025, 'multi-state');
    expect(result.available).toBe(false);
    expect(String(result.reason)).toContain('multi-state');
  });

  it('an unknown determination name comes back with the list of real ones', async () => {
    const result = await explainDeterminationTool(db, KEYS, 2025, 'residence');
    expect(result.available).toBe(false);
    expect(result.known).toContain('residency');
  });
});

describe('the registry', () => {
  it('all four tools are exposed to the model', async () => {
    const names = getToolDefinitions().map((t) => t.name);
    for (const name of ['record_fact', 'get_readiness', 'price_unknown', 'explain_determination']) {
      expect(names, `${name} is not registered`).toContain(name);
    }
  });

  it('every tool degrades rather than throwing when the year is empty', async () => {
    const results = await Promise.all([
      getReadinessTool(db, KEYS, 2025, TODAY),
      priceUnknownTool(db, KEYS, 2025),
      explainDeterminationTool(db, KEYS, 2025, 'state'),
      recordFactTool(db, KEYS, {
        factId: 'nope',
        value: 1,
        taxYear: 2025,
        conversationId: null,
      }),
    ]);
    for (const r of results) {
      expect(typeof r.available).toBe('boolean');
      if (r.available === false) expect(typeof r.reason).toBe('string');
    }
  });

  it("a document's facts are never written by the model — only the C-phase writes those", async () => {
    // The engine's own document path still works: a document assertion
    // written by an extraction job is readable, and the model's later
    // answer supersedes it rather than being blocked by it.
    await assertFact(db, KEYS, {
      factId: 'w2-wages',
      taxYear: 2025,
      value: { kind: 'number', value: 19200 },
      source: { kind: 'document', fileId: 'f1', field: 'box1' },
    });
    const result = await recordFactTool(db, KEYS, {
      factId: 'w2-wages',
      value: 19000,
      taxYear: 2025,
      conversationId: 'c1',
    });
    expect(result.available).toBe(true);
    expect(result.supersededAssertionId).not.toBeNull();

    const kinds = (
      raw.prepare('SELECT source FROM fact_assertions').all() as Array<{ source: string }>
    ).map((r) => JSON.parse(r.source).kind);
    // One document row (written by the job) and one person row. The model
    // added a person row and nothing else.
    expect(kinds.filter((k) => k === 'document')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'person')).toHaveLength(1);
  });
});
