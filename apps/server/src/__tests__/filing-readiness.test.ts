import { describe, expect, it } from 'vitest';
import { makeAssertion } from '../lib/calc/filing/facts';
import { assessReadiness } from '../lib/calc/filing/readiness';

// ─── A6 acceptance ─────────────────────────────────────────────────
// The gap engine, held to the desk's founding rule: nothing-to-check is
// not resolved. Blockers block, cheap unknowns don't, the calendar is a
// fact, and a superseded assertion flips the verdict in the same render.

let n = 0;
const make = (
  factId: Parameters<typeof makeAssertion>[0]['factId'],
  value: Parameters<typeof makeAssertion>[0]['value'],
  taxYear = 2026,
  supersedes: string | null = null,
  assertionId?: string,
) =>
  makeAssertion({
    assertionId: assertionId ?? `a${++n}`,
    factId,
    taxYear,
    value,
    source: { kind: 'person', conversationId: null },
    assertedAt: `2026-01-01T00:00:${String(n % 60).padStart(2, '0')}Z`,
    supersedes,
  } as Parameters<typeof makeAssertion>[0]);

const MARCH = new Date('2027-03-01T12:00:00Z');
const EARLY_JAN = new Date('2027-01-05T12:00:00Z');

/** P1, fully decided: 27, one job, income high enough to close every test. */
const p1 = () => [
  make('us-citizen', { kind: 'bool', value: true }),
  make('married', { kind: 'bool', value: false }),
  make('birth-date', { kind: 'date', value: '1999-06-01' }),
  make('gross-income', { kind: 'number', value: 42000 }),
  make('w2-employer-count', { kind: 'number', value: 1 }),
  make('w2-wages', { kind: 'number', value: 42000 }),
  make('digital-asset-activity', { kind: 'bool', value: false }),
];

describe('the founding rule', () => {
  it('reads an empty year as not-started, never ready', () => {
    const result = assessReadiness([], [], 2026, MARCH);
    expect(result.verdict).toBe('not-started');
    expect(result.lines).toEqual([]);
  });

  it('a timeless fact alone does not start a year', () => {
    const result = assessReadiness(
      [make('birth-date', { kind: 'date', value: '1999-06-01' }, 2024)],
      [],
      2026,
      MARCH,
    );
    expect(result.verdict).toBe('not-started');
  });
});

describe('P1 through the whole stack', () => {
  it('is ready with the W-2 on file and every question closed', () => {
    const result = assessReadiness(p1(), [{ kind: 'W-2', fileId: 'f1' }], 2026, MARCH);
    expect(result.blockers).toEqual([]);
    expect(result.verdict).toBe('ready');
    expect(result.lines.find((l) => l.id === 'doc:W-2')?.status).toBe('resolved');
    expect(result.lines.find((l) => l.id === 'form:form-1040')?.status).toBe('resolved');
  });

  it('cautions while the W-2 cannot exist yet, and never blocks for it', () => {
    const result = assessReadiness(p1(), [], 2026, EARLY_JAN);
    expect(result.verdict).toBe('ready-with-cautions');
    const line = result.lines.find((l) => l.id === 'doc:W-2');
    expect(line?.status).toBe('not-started');
    expect(line?.detail).toContain('2027-01-31');
  });

  it('blocks once the mandatory W-2 is past due, with the transcript step', () => {
    const result = assessReadiness(p1(), [], 2026, MARCH);
    expect(result.verdict).toBe('blocked');
    const line = result.lines.find((l) => l.id === 'doc:W-2');
    expect(line?.status).toBe('attention');
    expect(line?.action).toContain('Wage & Income transcript');
    expect(result.blockers.some((b) => b.from === 'mandatory-document')).toBe(true);
  });
});

describe('blockers', () => {
  it('P7: marketplace insurance blocks on the 8962 with the freeze explained', () => {
    const facts = [...p1(), make('marketplace-health-insurance', { kind: 'bool', value: true })];
    const result = assessReadiness(facts, [], 2026, MARCH);
    expect(result.verdict).toBe('blocked');
    expect(
      result.blockers.some((b) => b.from === 'unsupported-form' && b.reason.includes('freezes')),
    ).toBe(true);
    expect(result.outOfScope.some((f) => f.form === 'form-8962')).toBe(true);
  });

  it('a contradiction blocks and is never picked between', () => {
    const facts = [...p1(), make('w2-wages', { kind: 'number', value: 50000 }, 2026)];
    // Two live wage assertions now disagree (42,000 vs 50,000).
    const result = assessReadiness(facts, [{ kind: 'W-2', fileId: 'f1' }], 2026, MARCH);
    expect(result.verdict).toBe('blocked');
    expect(result.contradictions.map((c) => c.factId)).toContain('w2-wages');
    expect(result.blockers.some((b) => b.from === 'contradiction')).toBe(true);
  });

  it('an unmade filing election blocks as a computation, not a guess', () => {
    const facts = [
      make('us-citizen', { kind: 'bool', value: true }),
      make('birth-date', { kind: 'date', value: '1999-06-01' }),
      make('gross-income', { kind: 'number', value: 42000 }),
      make('w2-wages', { kind: 'number', value: 42000 }),
      make('married', { kind: 'bool', value: true }),
    ];
    const result = assessReadiness(facts, [], 2026, EARLY_JAN);
    expect(result.verdict).toBe('blocked');
    expect(result.blockers.some((b) => b.id === 'computation:filing-status-election')).toBe(true);
  });
});

describe('unknowns caution, cheap unknowns pass', () => {
  it('P2: priced unknowns appear as lines with their dollar difference', () => {
    const facts = [
      make('us-citizen', { kind: 'bool', value: true }),
      make('married', { kind: 'bool', value: false }),
      make('birth-date', { kind: 'date', value: '2006-03-10' }),
      make('full-time-student-months', { kind: 'number', value: 9 }),
      make('lived-with-parents-months', { kind: 'number', value: 12 }),
      make('self-support-share-pct', { kind: 'unknown' }),
      make('w2-wages', { kind: 'number', value: 8000 }),
      make('realized-short-gains', { kind: 'number', value: 3100 }),
      make('brokerage-account', { kind: 'bool', value: true }),
      make('sold-investments', { kind: 'bool', value: true }),
    ];
    const result = assessReadiness(facts, [], 2026, EARLY_JAN);
    const supportLine = result.lines.find((l) => l.id === 'fact:self-support-share-pct');
    expect(supportLine?.status).toBe('unknown');
    expect(supportLine?.detail).toMatch(/\$\d+/);
    // The kiddie form is required either way here — blocked, and honestly so.
    expect(result.verdict).toBe('blocked');
    expect(result.outOfScope.some((f) => f.form === 'form-8615')).toBe(true);
  });

  it('a zero-priced unknown never appears and never cautions', () => {
    // P1 leaves self-support unasked; forking it changes nothing because
    // dependency is already decided by age and income. The $40 case files.
    const result = assessReadiness(p1(), [{ kind: 'W-2', fileId: 'f1' }], 2026, MARCH);
    expect(result.verdict).toBe('ready');
    expect(result.lines.some((l) => l.id === 'fact:self-support-share-pct')).toBe(false);
    // It is still in the ranked list for anyone who asks — just priced at $0.
    expect(result.unknowns.some((u) => u.at === 'self-support-share-pct' && u.delta === 0)).toBe(
      true,
    );
  });
});

describe('the digital-assets question', () => {
  it('blocks ready while unanswered — a 1040-face question is never left blank', () => {
    const facts = p1().filter((a) => a.factId !== 'digital-asset-activity');
    const result = assessReadiness(facts, [{ kind: 'W-2', fileId: 'f1' }], 2026, MARCH);
    expect(result.verdict).toBe('blocked');
    expect(result.blockers.some((b) => b.from === 'unanswered-question')).toBe(true);
    const line = result.lines.find((l) => l.id === 'fact:digital-asset-activity');
    expect(line?.status).toBe('not-started');
  });

  it('an explicit shrug is still unanswered — the question takes yes or no only', () => {
    const facts = [
      ...p1().filter((a) => a.factId !== 'digital-asset-activity'),
      make('digital-asset-activity', { kind: 'unknown' }),
    ];
    const result = assessReadiness(facts, [{ kind: 'W-2', fileId: 'f1' }], 2026, MARCH);
    expect(result.verdict).toBe('blocked');
    expect(result.lines.find((l) => l.id === 'fact:digital-asset-activity')?.status).toBe(
      'unknown',
    );
  });

  it('either answer unblocks — yes simply brings the sale forms with it', () => {
    const no = assessReadiness(p1(), [{ kind: 'W-2', fileId: 'f1' }], 2026, MARCH);
    expect(no.verdict).toBe('ready');

    const yes = assessReadiness(
      [
        ...p1().filter((a) => a.factId !== 'digital-asset-activity'),
        make('digital-asset-activity', { kind: 'bool', value: true }),
      ],
      [{ kind: 'W-2', fileId: 'f1' }],
      2026,
      MARCH,
    );
    expect(yes.blockers.some((b) => b.from === 'unanswered-question')).toBe(false);
    // Crypto disposals require the sale forms, honestly unsupported-or-not.
    expect(yes.lines.some((l) => l.id === 'form:form-8949')).toBe(true);
  });
});

describe('supersession and years', () => {
  it('a superseded fact flips readiness in the same render', () => {
    const sold = make('sold-investments', { kind: 'bool', value: true }, 2026, null, 'sold-1');
    const facts = [...p1(), make('brokerage-account', { kind: 'bool', value: true }), sold];
    const before = assessReadiness(facts, [{ kind: 'W-2', fileId: 'f1' }], 2026, MARCH);
    expect(before.lines.some((l) => l.id === 'doc:1099-B')).toBe(true);

    const corrected = [
      ...facts,
      make('sold-investments', { kind: 'bool', value: false }, 2026, 'sold-1'),
    ];
    const after = assessReadiness(corrected, [{ kind: 'W-2', fileId: 'f1' }], 2026, MARCH);
    expect(after.lines.some((l) => l.id === 'doc:1099-B')).toBe(false);
    expect(after.lines.some((l) => l.id === 'form:form-8949')).toBe(false);
  });

  it('P8: three years assess independently, and an unloaded year refuses', () => {
    const facts = [
      ...p1(),
      make('w2-wages', { kind: 'number', value: 30000 }, 2025),
      make('married', { kind: 'bool', value: false }, 2025),
      make('gross-income', { kind: 'number', value: 30000 }, 2025),
      make('w2-wages', { kind: 'number', value: 18000 }, 2024),
      make('married', { kind: 'bool', value: false }, 2024),
    ];
    const y2026 = assessReadiness(facts, [{ kind: 'W-2', fileId: 'a' }], 2026, MARCH);
    const y2025 = assessReadiness(facts, [], 2025, MARCH);
    const y2024 = assessReadiness(facts, [], 2024, MARCH);

    expect(y2026.verdict).toBe('ready');
    expect(y2025.verdict).toBe('blocked'); // W-2 long past due for 2025
    // 2024 has no year data loaded: the computation refuses by name.
    expect(y2024.verdict).toBe('blocked');
    expect(y2024.blockers.some((b) => b.id === 'computation:year-data')).toBe(true);
  });
});
