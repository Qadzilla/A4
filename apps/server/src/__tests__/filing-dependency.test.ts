import { describe, expect, it } from 'vitest';
import { determineDependency } from '../lib/calc/filing/dependency';
import { type FactAssertion, makeAssertion } from '../lib/calc/filing/facts';
import { determineFilingStatus } from '../lib/calc/filing/filing-status';
import { DEPENDENCY_FIXTURES } from '../lib/calc/filing/fixtures/dependency';
import type { FilingFixture, FixtureFact } from '../lib/calc/filing/fixtures/types';

// ─── A3 acceptance ─────────────────────────────────────────────────
// Pub 501's rules live in the fixtures with their quotes; this file runs
// the corpus and covers what fixtures can't say — election vs
// determination in filing status, contradictions, the consumed lists.

function factsOf(fixture: FilingFixture<unknown>): FactAssertion[] {
  return fixture.facts.map((f: FixtureFact, i: number) =>
    makeAssertion({
      assertionId: `${fixture.id}#${i}`,
      factId: f.factId,
      taxYear: f.taxYear ?? fixture.taxYear,
      value: f.value,
      source: f.rule
        ? { kind: 'rule', ruleId: f.rule.ruleId, consumed: f.rule.consumed }
        : { kind: 'person', conversationId: null },
      assertedAt: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
    } as Parameters<typeof makeAssertion>[0]),
  );
}

describe('the dependency corpus', () => {
  for (const fixture of DEPENDENCY_FIXTURES) {
    it(fixture.id, () => {
      const result = determineDependency(factsOf(fixture), fixture.taxYear);
      expect(result.canBeClaimed).toBe(fixture.expected.canBeClaimed);
      if (fixture.expected.as !== undefined) {
        expect(result.as).toBe(fixture.expected.as);
      }
      for (const test of fixture.expected.failedContains ?? []) {
        expect(result.failedTests).toContain(test);
      }
      for (const fact of fixture.expected.missingContains ?? []) {
        expect(result.missingFacts).toContain(fact);
      }
      if (fixture.expected.kiddieTaxExposed !== undefined) {
        expect(result.consequences.kiddieTaxExposed).toBe(fixture.expected.kiddieTaxExposed);
      }
    });
  }

  it('ties the four consequences to a yes, and kiddie exposure to its own test', () => {
    const claimable = DEPENDENCY_FIXTURES.find(
      (f) => f.id === 'dependency/student-away-at-college',
    );
    if (!claimable) throw new Error('missing fixture');
    const result = determineDependency(factsOf(claimable), claimable.taxYear);
    expect(result.consequences).toEqual({
      limitedStandardDeduction: true,
      educationCreditsBlocked: true,
      saversCreditBlocked: true,
      kiddieTaxExposed: true,
    });
  });

  it('reports what it consumed, including the residency chain', () => {
    const nra = DEPENDENCY_FIXTURES.find(
      (f) => f.id === 'dependency/nonresident-cannot-be-claimed',
    );
    if (!nra) throw new Error('missing fixture');
    const result = determineDependency(factsOf(nra), nra.taxYear);
    expect(result.consumed).toContain('residency-status');
    expect(result.consumed).toContain('us-citizen');
  });

  it('refuses the qualifying-relative income test for a year with no data, by name', () => {
    const facts = factsOf({
      ...(DEPENDENCY_FIXTURES.find(
        (f) => f.id === 'dependency/qr-income-boundary-passes-under-limit',
      ) as FilingFixture<unknown>),
      taxYear: 2019,
    });
    // Rebuild for 2019 — same shape, a year the table doesn't hold.
    const rebuilt = facts.map((a) => ({ ...a, taxYear: 2019 }));
    const result = determineDependency(rebuilt, 2019);
    expect(result.canBeClaimed).toBe('unknown');
    expect(JSON.stringify(result.explanation.notes)).toContain('2019');
  });

  it('declines to determine over a contradiction and names the fact', () => {
    let n = 0;
    const make = (
      factId: Parameters<typeof makeAssertion>[0]['factId'],
      value: Parameters<typeof makeAssertion>[0]['value'],
      source: Parameters<typeof makeAssertion>[0]['source'] = {
        kind: 'person',
        conversationId: null,
      },
    ) =>
      makeAssertion({
        assertionId: `c${++n}`,
        factId,
        taxYear: 2026,
        value,
        source,
        assertedAt: `2026-01-01T00:00:${String(n).padStart(2, '0')}Z`,
      } as Parameters<typeof makeAssertion>[0]);

    const result = determineDependency(
      [
        make('us-citizen', { kind: 'bool', value: true }),
        make('married', { kind: 'bool', value: false }),
        make('birth-date', { kind: 'date', value: '2006-03-10' }),
        make('full-time-student-months', { kind: 'number', value: 9 }),
        make('lived-with-parents-months', { kind: 'number', value: 12 }),
        make('self-support-share-pct', { kind: 'number', value: 20 }),
        make(
          'self-support-share-pct',
          { kind: 'number', value: 80 },
          {
            kind: 'document',
            fileId: 'worksheet',
            field: 'self-support',
          },
        ),
      ],
      2026,
    );
    expect(result.canBeClaimed).toBe('unknown');
    expect(JSON.stringify(result.explanation.notes)).toContain('self-support-share-pct');
  });
});

describe('filing status', () => {
  let n = 0;
  const make = (
    factId: Parameters<typeof makeAssertion>[0]['factId'],
    value: Parameters<typeof makeAssertion>[0]['value'],
  ) =>
    makeAssertion({
      assertionId: `f${++n}`,
      factId,
      taxYear: 2026,
      value,
      source: { kind: 'person', conversationId: null },
      assertedAt: `2026-01-01T00:00:${String(n).padStart(2, '0')}Z`,
    } as Parameters<typeof makeAssertion>[0]);

  it('treats joint-vs-separate as an election, not a determination', () => {
    const result = determineFilingStatus([make('married', { kind: 'bool', value: true })], 2026);
    expect(result.status).toBe('unknown');
    expect(result.available.sort()).toEqual(['mfj', 'mfs']);
    expect(result.missingFacts).toContain('filing-jointly');
  });

  it('resolves the election once made', () => {
    const result = determineFilingStatus(
      [
        make('married', { kind: 'bool', value: true }),
        make('filing-jointly', { kind: 'bool', value: true }),
      ],
      2026,
    );
    expect(result.status).toBe('mfj');
    // Separate stays on the table — an election can be laid out both ways.
    expect(result.available).toContain('mfs');
  });

  it('defaults the unmarried to single and names the head-of-household door', () => {
    const result = determineFilingStatus([make('married', { kind: 'bool', value: false })], 2026);
    expect(result.status).toBe('single');
    expect(JSON.stringify(result.explanation.notes)).toContain('Head of household');
  });

  it('grants head of household only on affirmative facts', () => {
    const result = determineFilingStatus(
      [
        make('married', { kind: 'bool', value: false }),
        make('own-dependent-lived-with-months', { kind: 'number', value: 12 }),
        make('paid-over-half-home-costs', { kind: 'bool', value: true }),
      ],
      2026,
    );
    expect(result.status).toBe('hoh');
  });

  it('recognises a qualifying surviving spouse over head of household', () => {
    const result = determineFilingStatus(
      [
        make('married', { kind: 'bool', value: false }),
        make('widowed-within-two-prior-years', { kind: 'bool', value: true }),
        make('own-dependent-lived-with-months', { kind: 'number', value: 12 }),
        make('paid-over-half-home-costs', { kind: 'bool', value: true }),
      ],
      2026,
    );
    expect(result.status).toBe('qss');
  });

  it('asks before assuming when nothing marital is known', () => {
    const result = determineFilingStatus([], 2026);
    expect(result.status).toBe('unknown');
    expect(result.missingFacts).toContain('married');
  });
});
