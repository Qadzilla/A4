import { describe, expect, it } from 'vitest';
import { makeAssertion } from '../lib/calc/filing/facts';
import { determineFicaRefund } from '../lib/calc/filing/fica-refund';
import { FICA_REFUND_FIXTURES } from '../lib/calc/filing/fixtures/fica-refund';
import { assertionsOf } from '../lib/calc/filing/fixtures/types';
import { assessReadiness } from '../lib/calc/filing/readiness';

// ─── E4 acceptance ─────────────────────────────────────────────────
// The corpus pins the finding itself; this file adds the surface — the
// found money as a readiness line that informs without gating (money
// outside the return must never hold the return hostage), the package
// checklist reaching the person whole, and the E2 tie: the 8843 paper
// trail is part of this claim's evidence.

describe('the fica-refund corpus', () => {
  for (const fixture of FICA_REFUND_FIXTURES) {
    it(fixture.id, () => {
      const result = determineFicaRefund(assertionsOf(fixture), fixture.taxYear);

      expect(result.status, 'status').toBe(fixture.expected.status);
      if (fixture.expected.total !== undefined) {
        expect(result.total, 'total').toBe(fixture.expected.total);
      }
      if (fixture.expected.claimWindowEnds !== undefined) {
        expect(result.claimWindowEnds, 'window').toBe(fixture.expected.claimWindowEnds);
      }
      if (fixture.expected.documentsContain !== undefined) {
        expect(JSON.stringify(result.packageDocuments)).toContain(
          fixture.expected.documentsContain,
        );
      }
      if (fixture.expected.letterContain !== undefined) {
        expect(JSON.stringify(result.employerLetter)).toContain(fixture.expected.letterContain);
      }
      if (fixture.expected.refusalsContain !== undefined) {
        expect(JSON.stringify(result.refusals)).toContain(fixture.expected.refusalsContain);
      }
      if (fixture.expected.notesContain !== undefined) {
        expect(JSON.stringify(result.explanation.notes)).toContain(fixture.expected.notesContain);
      }
      if (fixture.expected.missingFactsContain !== undefined) {
        expect(result.missingFacts, 'missing').toContain(fixture.expected.missingFactsContain);
      }
    });
  }

  it('the found package is complete: both forms, the 8843 tie, the paper reality', () => {
    const found = FICA_REFUND_FIXTURES.find((f) => f.id === 'fica/p3-found-money');
    if (!found) throw new Error('missing fixture');
    const result = determineFicaRefund(assertionsOf(found), found.taxYear);
    expect(result.packageForms.some((f) => f.includes('843'))).toBe(true);
    expect(result.packageForms.some((f) => f.includes('8316'))).toBe(true);
    expect(JSON.stringify(result.packageDocuments)).toContain('8843');
    expect(result.expectation).toContain('3 to 6 months');
    expect(result.employerLetter.length).toBeGreaterThanOrEqual(3);
  });
});

describe('the readiness surface', () => {
  let n = 0;
  const make = (
    factId: Parameters<typeof makeAssertion>[0]['factId'],
    value: Parameters<typeof makeAssertion>[0]['value'],
  ) =>
    makeAssertion({
      assertionId: `e4r${++n}`,
      factId,
      taxYear: 2026,
      value,
      source: { kind: 'person', conversationId: null },
      assertedAt: `2026-01-01T00:00:${String(n % 60).padStart(2, '0')}Z`,
      supersedes: null,
    } as Parameters<typeof makeAssertion>[0]);

  const p3Clean = () => [
    make('us-citizen', { kind: 'bool', value: false }),
    make('green-card-holder', { kind: 'bool', value: false }),
    make('visa-type', { kind: 'string', value: 'F' }),
    make('visa-first-entry-year', { kind: 'number', value: 2024 }),
    make('full-time-student-months', { kind: 'number', value: 9 }),
    make('married', { kind: 'bool', value: false }),
    make('digital-asset-activity', { kind: 'bool', value: false }),
    make('school-name', { kind: 'string', value: 'State University' }),
    make('8843-filed', { kind: 'bool', value: true }),
    make('w2-wages', { kind: 'number', value: 12000 }),
    make('w2-ss-tax-withheld', { kind: 'number', value: 744 }),
    make('w2-medicare-tax-withheld', { kind: 'number', value: 174 }),
    make('work-authorized', { kind: 'bool', value: true }),
  ];
  const MARCH = new Date('2027-03-01T12:00:00Z');
  const docs = [{ kind: 'W-2' as const, fileId: 'w2' }];

  it('found money is a line that informs — it never gates the verdict', () => {
    // Prior exempt years' 8843s on record so the catch-up caution is quiet.
    const withPrior = [
      ...p3Clean(),
      makeAssertion({
        assertionId: 'e4p1',
        factId: '8843-filed',
        taxYear: 2024,
        value: { kind: 'bool', value: true },
        source: { kind: 'person', conversationId: null },
        assertedAt: '2026-01-01T00:01:00Z',
        supersedes: null,
      } as Parameters<typeof makeAssertion>[0]),
      makeAssertion({
        assertionId: 'e4p2',
        factId: '8843-filed',
        taxYear: 2025,
        value: { kind: 'bool', value: true },
        source: { kind: 'person', conversationId: null },
        assertedAt: '2026-01-01T00:01:01Z',
        supersedes: null,
      } as Parameters<typeof makeAssertion>[0]),
    ];
    const readiness = assessReadiness(withPrior, docs, 2026, MARCH);
    const line = readiness.lines.find((l) => l.id === 'finding:fica-refund');
    expect(line).toBeDefined();
    expect(line?.detail).toContain('$918');
    expect(line?.detail).toContain('2030-04-15');
    expect(line?.action).toContain('employer');
    // The verdict is untouched by found money: nothing blocks, nothing
    // cautions on its account.
    expect(readiness.blockers.some((b) => b.id.includes('fica'))).toBe(false);
    expect(readiness.verdict).toBe('ready');
  });

  it('a refused finding still surfaces — named, not hidden', () => {
    const readiness = assessReadiness(
      [
        ...p3Clean().filter((a) => a.factId !== 'work-authorized'),
        make('work-authorized', { kind: 'bool', value: false }),
      ],
      docs,
      2026,
      MARCH,
    );
    const line = readiness.lines.find((l) => l.id === 'finding:fica-refund');
    expect(line?.detail).toContain('AUTHORIZED');
    expect(readiness.blockers.some((b) => b.id.includes('fica'))).toBe(false);
  });

  it('a resident year shows no finding line at all', () => {
    const resident = [
      make('us-citizen', { kind: 'bool', value: true }),
      make('married', { kind: 'bool', value: false }),
      make('digital-asset-activity', { kind: 'bool', value: false }),
      make('w2-wages', { kind: 'number', value: 30000 }),
      make('w2-ss-tax-withheld', { kind: 'number', value: 1860 }),
      make('w2-medicare-tax-withheld', { kind: 'number', value: 435 }),
    ];
    const readiness = assessReadiness(resident, docs, 2026, MARCH);
    expect(readiness.lines.some((l) => l.id === 'finding:fica-refund')).toBe(false);
  });
});
