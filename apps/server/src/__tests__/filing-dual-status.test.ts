import { describe, expect, it } from 'vitest';
import { determineDualStatusBrief } from '../lib/calc/filing/dual-status';
import { evaluateYear } from '../lib/calc/filing/evaluation';
import { makeAssertion } from '../lib/calc/filing/facts';
import { DUAL_STATUS_FIXTURES } from '../lib/calc/filing/fixtures/dual-status';
import { assertionsOf } from '../lib/calc/filing/fixtures/types';
import { assessReadiness } from '../lib/calc/filing/readiness';
import { determineResidency } from '../lib/calc/filing/residency';

// ─── E5 acceptance ─────────────────────────────────────────────────
// The corpus pins the detector from both sides and the brief's content;
// this file adds the surfaces — the evaluation refusing with the brief
// attached, and readiness blocking WITH the briefing as the block's
// payload (Doctrine 7's detect → name → explain → refuse, with the
// hand-over made concrete).

describe('the dual-status corpus', () => {
  for (const fixture of DUAL_STATUS_FIXTURES) {
    it(fixture.id, () => {
      const assertions = assertionsOf(fixture);
      const residency = determineResidency(assertions, fixture.taxYear);
      expect(residency.status, 'residency').toBe(fixture.expected.residencyStatus);

      const brief = determineDualStatusBrief(assertions, fixture.taxYear);
      expect(brief !== null, 'brief presence').toBe(fixture.expected.hasBrief);
      if (brief === null) return;

      if (fixture.expected.residencyStart !== undefined) {
        expect(brief.residencyStart, 'start').toBe(fixture.expected.residencyStart);
      }
      if (fixture.expected.nonresidentWindowTo !== undefined) {
        expect(brief.windows?.nonresident.to, 'window boundary').toBe(
          fixture.expected.nonresidentWindowTo,
        );
        expect(brief.windows?.resident.from, 'resident from').toBe(brief.residencyStart);
        expect(brief.windows?.nonresident.from, 'nr from').toBe(`${fixture.taxYear}-01-01`);
      }
      if (fixture.expected.incomeContains !== undefined) {
        expect(
          brief.income.map((l) => l.factId),
          'income lines',
        ).toContain(fixture.expected.incomeContains);
      }
      if (fixture.expected.restrictionsContain !== undefined) {
        expect(JSON.stringify(brief.restrictions)).toContain(fixture.expected.restrictionsContain);
      }
      if (fixture.expected.formsContain !== undefined) {
        expect(JSON.stringify(brief.forms)).toContain(fixture.expected.formsContain);
      }
      if (fixture.expected.notesContain !== undefined) {
        expect(JSON.stringify(brief.explanation.notes)).toContain(fixture.expected.notesContain);
      }
    });
  }
});

describe('the surfaces', () => {
  let n = 0;
  const make = (
    factId: Parameters<typeof makeAssertion>[0]['factId'],
    value: Parameters<typeof makeAssertion>[0]['value'],
  ) =>
    makeAssertion({
      assertionId: `e5${++n}`,
      factId,
      taxYear: 2026,
      value,
      source: { kind: 'person', conversationId: null },
      assertedAt: `2026-01-01T00:00:${String(n % 60).padStart(2, '0')}Z`,
      supersedes: null,
    } as Parameters<typeof makeAssertion>[0]);

  const straddle = () => [
    make('us-citizen', { kind: 'bool', value: false }),
    make('green-card-holder', { kind: 'bool', value: false }),
    make('visa-type', { kind: 'string', value: 'F' }),
    make('visa-first-entry-year', { kind: 'number', value: 2021 }),
    make('full-time-student-months', { kind: 'number', value: 9 }),
    make('married', { kind: 'bool', value: false }),
    make('days-present', { kind: 'number', value: 200 }),
    make('first-presence-date', { kind: 'date', value: '2026-06-01' }),
    make('w2-wages', { kind: 'number', value: 30000 }),
  ];

  it('the evaluation refuses with the brief attached — no liability, everything known', () => {
    const result = evaluateYear(straddle(), 2026);
    expect(result.residency.status).toBe('dual-status');
    expect(result.liability).toBeNull();
    expect(result.blocked).toContain('dual-status-year');
    expect(result.dualStatus?.residencyStart).toBe('2026-06-01');
    expect(result.dualStatus?.income.some((l) => l.factId === 'w2-wages')).toBe(true);
    expect(JSON.stringify(result.notes)).toContain('twenty minutes');
  });

  it('readiness blocks WITH the briefing as the payload', () => {
    const readiness = assessReadiness(
      straddle(),
      [{ kind: 'W-2', fileId: 'w2' }],
      2026,
      new Date('2027-03-01T12:00:00Z'),
    );
    expect(readiness.verdict).toBe('blocked');
    const blocker = readiness.blockers.find((b) => b.id === 'computation:dual-status-year');
    expect(blocker).toBeDefined();
    expect(blocker?.briefing?.residencyStart).toBe('2026-06-01');
    expect(blocker?.briefing?.windows?.resident.from).toBe('2026-06-01');
    expect(blocker?.reason).toContain('twenty minutes');
  });

  it('the year-six continuing student never sees any of this', () => {
    const continuing = [
      ...straddle().filter(
        (a) => a.factId !== 'first-presence-date' && a.factId !== 'days-present',
      ),
      make('days-present', { kind: 'number', value: 330 }),
    ];
    const result = evaluateYear(continuing, 2026);
    expect(result.residency.status).toBe('resident');
    expect(result.dualStatus).toBeNull();
    expect(result.liability).not.toBeNull();
  });
});
