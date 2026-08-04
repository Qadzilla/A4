import { describe, expect, it } from 'vitest';
import { makeAssertion } from '../lib/calc/filing/facts';
import { FORM_8843_FIXTURES } from '../lib/calc/filing/fixtures/form-8843';
import { assertionsOf } from '../lib/calc/filing/fixtures/types';
import { determineForm8843 } from '../lib/calc/filing/form-8843';
import { assessReadiness } from '../lib/calc/filing/readiness';

// ─── E2 acceptance ─────────────────────────────────────────────────
// The corpus pins the requirement engine (per exempt year, standalone
// with no income, vanishing at year six, the J-researcher fence); this
// file adds the readiness surface — catch-up years as their own
// protective lines that caution without ever blocking, and dropping to
// a clean "ready" once the record shows the forms filed.

describe('the form-8843 corpus', () => {
  for (const fixture of FORM_8843_FIXTURES) {
    it(fixture.id, () => {
      const result = determineForm8843(assertionsOf(fixture), fixture.taxYear);

      expect(result.required, 'required').toBe(fixture.expected.required);
      if (fixture.expected.standalone !== undefined) {
        expect(result.standalone, 'standalone').toBe(fixture.expected.standalone);
      }
      if (fixture.expected.catchUp !== undefined) {
        expect(result.catchUp, 'catch-up').toEqual(fixture.expected.catchUp);
      }
      if (fixture.expected.missingFactsContain !== undefined) {
        expect(result.missingFacts, 'missing').toContain(fixture.expected.missingFactsContain);
      }
      if (fixture.expected.refusalsContain !== undefined) {
        expect(JSON.stringify(result.refusals)).toContain(fixture.expected.refusalsContain);
      }
      if (fixture.expected.notesContain !== undefined) {
        expect(JSON.stringify(result.explanation.notes).toLowerCase()).toContain(
          fixture.expected.notesContain.toLowerCase(),
        );
      }
    });
  }
});

describe('the readiness surface', () => {
  let n = 0;
  const make = (
    factId: Parameters<typeof makeAssertion>[0]['factId'],
    value: Parameters<typeof makeAssertion>[0]['value'],
    taxYear = 2026,
  ) =>
    makeAssertion({
      assertionId: `e2r${++n}`,
      factId,
      taxYear,
      value,
      source: { kind: 'person', conversationId: null },
      assertedAt: `2026-01-01T00:00:${String(n % 60).padStart(2, '0')}Z`,
      supersedes: null,
    } as Parameters<typeof makeAssertion>[0]);

  const p3ish = () => [
    make('us-citizen', { kind: 'bool', value: false }),
    make('green-card-holder', { kind: 'bool', value: false }),
    make('visa-type', { kind: 'string', value: 'F' }),
    make('visa-first-entry-year', { kind: 'number', value: 2024 }),
    make('full-time-student-months', { kind: 'number', value: 9 }),
    make('married', { kind: 'bool', value: false }),
    make('digital-asset-activity', { kind: 'bool', value: false }),
    make('w2-wages', { kind: 'number', value: 12000 }),
    make('school-name', { kind: 'string', value: 'State University' }),
  ];
  const MARCH = new Date('2027-03-01T12:00:00Z');
  const docs = [{ kind: 'W-2' as const, fileId: 'w2' }];

  it('catch-up years are protective lines that caution — never blockers', () => {
    const readiness = assessReadiness(p3ish(), docs, 2026, MARCH);
    const catchUpLines = readiness.lines.filter((l) => l.id.startsWith('form:form-8843:'));
    expect(catchUpLines.map((l) => l.id).sort()).toEqual([
      'form:form-8843:2024',
      'form:form-8843:2025',
    ]);
    for (const line of catchUpLines) {
      expect(line.status).toBe('attention');
      expect(line.detail).toContain('protective');
      expect(line.action).toContain('mail');
    }
    // Not one of them blocks: the year's own return is unaffected.
    expect(readiness.blockers.some((b) => b.id.startsWith('form:form-8843'))).toBe(false);
    expect(readiness.verdict).toBe('ready-with-cautions');
  });

  it('with the record showing the forms filed, the year is cleanly ready', () => {
    const facts = [
      ...p3ish(),
      make('8843-filed', { kind: 'bool', value: true }, 2024),
      make('8843-filed', { kind: 'bool', value: true }, 2025),
    ];
    const readiness = assessReadiness(facts, docs, 2026, MARCH);
    expect(readiness.lines.some((l) => l.id.startsWith('form:form-8843:'))).toBe(false);
    expect(readiness.verdict).toBe('ready');
    // This year's own 8843 line carries the riding-along detail.
    const line = readiness.lines.find((l) => l.id === 'form:form-8843');
    expect(line?.detail).toContain('1040-NR');
  });

  it('a standalone year names the mailing reality on its own line', () => {
    const zeroIncome = [
      make('us-citizen', { kind: 'bool', value: false }),
      make('green-card-holder', { kind: 'bool', value: false }),
      make('visa-type', { kind: 'string', value: 'F' }),
      make('visa-first-entry-year', { kind: 'number', value: 2026 }),
      make('full-time-student-months', { kind: 'number', value: 9 }),
      make('married', { kind: 'bool', value: false }),
      make('digital-asset-activity', { kind: 'bool', value: false }),
      make('school-name', { kind: 'string', value: 'State University' }),
    ];
    const readiness = assessReadiness(zeroIncome, [], 2026, MARCH);
    const line = readiness.lines.find((l) => l.id === 'form:form-8843');
    expect(line?.detail).toContain('cannot be e-filed');
    expect(line?.detail).toContain('even with no income');
  });
});
