import { describe, expect, it } from 'vitest';
import { evaluateYear } from '../lib/calc/filing/evaluation';
import { makeAssertion } from '../lib/calc/filing/facts';
import { PENALTY_FIXTURES } from '../lib/calc/filing/fixtures/penalty';
import { assertionsOf } from '../lib/calc/filing/fixtures/types';
import { determinePenalty } from '../lib/calc/filing/penalty';
import {
  type StoredBenefitFormRow,
  liveBenefitFormRows,
  planBenefitFacts,
} from '../services/benefit-form-facts';

// ─── D6 acceptance ─────────────────────────────────────────────────
// The corpus carries the 5329 exception matrix; this file runs it and
// covers what fixtures can't say — the evaluation wiring that flips P6,
// the never-auto-claimed rule, the pocket split arriving from C5's
// IRA/SEP/SIMPLE checkbox, and the priced-in-words asymmetry note.

let n = 0;
const make = (
  factId: Parameters<typeof makeAssertion>[0]['factId'],
  value: Parameters<typeof makeAssertion>[0]['value'],
) =>
  makeAssertion({
    assertionId: `p${++n}`,
    factId,
    taxYear: 2026,
    value,
    source: { kind: 'person', conversationId: null },
    assertedAt: `2026-01-01T00:00:${String(n % 60).padStart(2, '0')}Z`,
    supersedes: null,
  } as Parameters<typeof makeAssertion>[0]);

describe('the exception matrix (corpus)', () => {
  for (const fixture of PENALTY_FIXTURES) {
    it(fixture.id, () => {
      const assertions = assertionsOf(fixture);
      const evaluation = evaluateYear(assertions, fixture.taxYear);
      const agi = evaluation.liability?.agi ?? null;
      const result = determinePenalty(assertions, fixture.taxYear, agi);

      expect(result.penalty).toBe(fixture.expected.penalty);
      for (const [id, status] of Object.entries(fixture.expected.statuses ?? {})) {
        const exception = result.exceptions.find((e) => e.id === id);
        expect(exception?.status, `${id} status`).toBe(status);
      }
      for (const [id, savings] of Object.entries(fixture.expected.savings ?? {})) {
        const exception = result.exceptions.find((e) => e.id === id);
        expect(exception?.savings, `${id} savings`).toBe(savings);
      }
      if (fixture.expected.refusalCount !== undefined) {
        expect(result.refusals).toHaveLength(fixture.expected.refusalCount);
      }
    });
  }

  it('never auto-claims: available exceptions leave the penalty untouched', () => {
    const fixture = PENALTY_FIXTURES.find((f) => f.id === 'penalty/education-kills-it-for-an-ira');
    if (!fixture) throw new Error('missing fixture');
    const result = determinePenalty(assertionsOf(fixture), 2026, 42000);
    expect(result.exceptions.some((e) => e.status === 'available')).toBe(true);
    expect(result.penalty).toBe(900); // gross, with the option priced beside it
    expect(JSON.stringify(result.explanation.notes)).toContain('claims, not assumptions');
  });

  it('prices the asymmetry in words when the pocket is the unknown', () => {
    const fixture = PENALTY_FIXTURES.find((f) => f.id === 'penalty/unknown-pocket-is-the-fork');
    if (!fixture) throw new Error('missing fixture');
    const result = determinePenalty(assertionsOf(fixture), 2026, 42000);
    expect(result.pocket).toBeNull();
    const education = result.exceptions.find((e) => e.id === 'higher-education');
    expect(education?.factsNeeded).toContain('early-distribution-from-ira');
    expect(JSON.stringify(result.explanation.notes)).toContain('different pocket');
  });

  it('missing AGI leaves the medical exception a question, not a guess', () => {
    const result = determinePenalty(
      [
        make('retirement-early-distribution', { kind: 'number', value: 9000 }),
        make('early-distribution-from-ira', { kind: 'bool', value: false }),
        make('medical-expenses-paid', { kind: 'number', value: 5000 }),
      ],
      2026,
      null,
    );
    expect(result.exceptions.find((e) => e.id === 'medical')?.status).toBe('missing-facts');
  });

  it('splits the base when C5 supplied the IRA amount, and caps savings by pocket', () => {
    const result = determinePenalty(
      [
        make('retirement-early-distribution', { kind: 'number', value: 9000 }),
        make('retirement-early-ira-amount', { kind: 'number', value: 4000 }),
        make('qualified-tuition-paid', { kind: 'number', value: 6000 }),
      ],
      2026,
      42000,
    );
    expect(result.pocket).toEqual({ ira: 4000, employer: 5000 });
    // $6,000 of tuition, but only $4,000 came from an IRA — the exception
    // shelters min(tuition, IRA pocket).
    expect(result.exceptions.find((e) => e.id === 'higher-education')?.savings).toBe(400);
    // And the employer side keeps its own door: age-55 is askable.
    expect(result.exceptions.find((e) => e.id === 'age-55-separation')?.status).toBe(
      'missing-facts',
    );
  });

  it('no early money, no determination — but Roth still refuses by name', () => {
    const result = determinePenalty(
      [make('retirement-roth-distribution', { kind: 'number', value: 3000 })],
      2026,
      42000,
    );
    expect(result.applicable).toBe(false);
    expect(result.penalty).toBe(0);
    expect(result.refusals).toHaveLength(1);
    expect(result.refusals[0]).toContain('Roth');
  });
});

describe('the evaluation wiring', () => {
  it('P6 flips: the paper refund becomes the real bill', () => {
    const result = evaluateYear(
      [
        make('us-citizen', { kind: 'bool', value: true }),
        make('married', { kind: 'bool', value: false }),
        make('birth-date', { kind: 'date', value: '2003-09-09' }),
        make('gross-income', { kind: 'number', value: 60000 }),
        make('full-time-student-months', { kind: 'number', value: 0 }),
        make('w2-wages', { kind: 'number', value: 45000 }),
        make('gambling-winnings', { kind: 'number', value: 6000 }),
        make('retirement-distribution', { kind: 'number', value: 9000 }),
        make('retirement-distribution-taxable', { kind: 'number', value: 9000 }),
        make('retirement-early-distribution', { kind: 'number', value: 9000 }),
        make('retirement-federal-withheld', { kind: 'number', value: 1800 }),
        make('w2-federal-withheld', { kind: 'number', value: 3600 }),
      ],
      2026,
    );
    if (result.liability === null) throw new Error('expected liability');
    expect(result.liability.earlyWithdrawalPenalty).toBe(900);
    expect(result.liability.refundOrOwed).toBeGreaterThan(0);
    expect(result.penalty?.applicable).toBe(true);
    expect(JSON.stringify(result.notes)).toContain('10% additional tax');
  });

  it('leaves the A8 surface honest: the tax line excludes the penalty, the total includes it', () => {
    const result = evaluateYear(
      [
        make('us-citizen', { kind: 'bool', value: true }),
        make('married', { kind: 'bool', value: false }),
        make('birth-date', { kind: 'date', value: '1999-06-01' }),
        make('gross-income', { kind: 'number', value: 42000 }),
        make('full-time-student-months', { kind: 'number', value: 0 }),
        make('w2-wages', { kind: 'number', value: 42000 }),
        make('retirement-early-distribution', { kind: 'number', value: 5000 }),
        make('retirement-distribution', { kind: 'number', value: 5000 }),
        make('retirement-distribution-taxable', { kind: 'number', value: 5000 }),
      ],
      2026,
    );
    if (result.liability === null) throw new Error('expected liability');
    // 1040 line 16 is income tax; the 5329 rides Schedule 2 into line 24.
    expect(result.liability.federalTax - result.liability.incomeTax).toBe(500);
  });

  it('a clean year carries no penalty and no note', () => {
    const result = evaluateYear(
      [
        make('us-citizen', { kind: 'bool', value: true }),
        make('married', { kind: 'bool', value: false }),
        make('birth-date', { kind: 'date', value: '1999-06-01' }),
        make('gross-income', { kind: 'number', value: 42000 }),
        make('full-time-student-months', { kind: 'number', value: 0 }),
        make('w2-wages', { kind: 'number', value: 42000 }),
      ],
      2026,
    );
    if (result.liability === null) throw new Error('expected liability');
    expect(result.liability.earlyWithdrawalPenalty).toBe(0);
    expect(result.penalty).toBeNull();
  });
});

describe('the C5 pocket split feeding D6', () => {
  const row = (
    fileId: string,
    box7Codes: string,
    box1: number,
    iraSepSimple: boolean | null,
  ): StoredBenefitFormRow => ({
    fileId,
    kind: '1099-R',
    payerTin: `tin-${fileId}`,
    corrected: false,
    createdAt: 1,
    extracted: {
      kind: '1099-R',
      payerName: 'Custodian',
      payerTin: `tin-${fileId}`,
      corrected: false,
      taxYear: 2026,
      r1099: { box1, box2a: box1, box2bNotDetermined: null, box4: 0, box7Codes, iraSepSimple },
      g1099: null,
      w2g: null,
    },
  });

  it('asserts the IRA amount when every early row states its checkbox', () => {
    const rows = [row('f1', '1', 6000, true), row('f2', '1', 3000, false)];
    const plan = planBenefitFacts({
      live: liveBenefitFormRows(rows),
      prevLive: [],
      personLive: [],
      taxYear: 2026,
      triggeringFileId: 'f1',
      nowIso: '2027-02-01T00:00:00Z',
    });
    const split = plan.find((a) => a.factId === 'retirement-early-ira-amount');
    expect(split?.value).toEqual({ kind: 'number', value: 6000 });
  });

  it('stays a question when any early row leaves the checkbox unread', () => {
    const rows = [row('f1', '1', 6000, true), row('f2', '1', 3000, null)];
    const plan = planBenefitFacts({
      live: liveBenefitFormRows(rows),
      prevLive: [],
      personLive: [],
      taxYear: 2026,
      triggeringFileId: 'f1',
      nowIso: '2027-02-01T00:00:00Z',
    });
    expect(plan.some((a) => a.factId === 'retirement-early-ira-amount')).toBe(false);
  });
});
