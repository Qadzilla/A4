import { describe, expect, it } from 'vitest';
import { evaluateYear } from '../lib/calc/filing/evaluation';
import { conservativeYear, extensionAdvice } from '../lib/calc/filing/extension';
import { type FactAssertion, factSet, factState, makeAssertion } from '../lib/calc/filing/facts';
import { fork } from '../lib/calc/filing/forks';
import { INTAKE_QUESTIONS } from '../lib/calc/filing/intake';

// ─── H3 acceptance ─────────────────────────────────────────────────
// An extension moves the paperwork six months and the money zero days.
// The load-bearing part is the payment estimate, and the property that
// makes it trustworthy is that it is a genuine CEILING: no single open
// question, answered the expensive way, can push the year past it.

let n = 0;
const make = (
  factId: Parameters<typeof makeAssertion>[0]['factId'],
  value: Parameters<typeof makeAssertion>[0]['value'],
) =>
  makeAssertion({
    assertionId: `h3${++n}`,
    factId,
    taxYear: 2025,
    value,
    source: { kind: 'person', conversationId: null },
    assertedAt: `2025-01-01T00:00:${String(n % 60).padStart(2, '0')}Z`,
    supersedes: null,
  } as Parameters<typeof makeAssertion>[0]);

/** A year with real income and several questions still open. */
const halfAnswered = (): FactAssertion[] => [
  make('us-citizen', { kind: 'bool', value: true }),
  make('married', { kind: 'bool', value: false }),
  make('birth-date', { kind: 'date', value: '2003-04-15' }),
  make('state-of-residence', { kind: 'string', value: 'MA' }),
  make('w2-employer-count', { kind: 'number', value: 1 }),
  make('w2-wages', { kind: 'number', value: 42000 }),
  make('gross-income', { kind: 'number', value: 42000 }),
];

const advise = (
  assertions: FactAssertion[],
  opts: { today?: string; ready?: boolean; stateCode?: string | null } = {},
) =>
  extensionAdvice({
    assertions,
    taxYear: 2025,
    today: new Date(`${opts.today ?? '2026-03-15'}T00:00:00Z`),
    ready: opts.ready ?? false,
    stateCode: opts.stateCode === undefined ? 'MA' : opts.stateCode,
  });

describe('when it surfaces', () => {
  it('a year that is not ready, before the deadline, gets the offer', () => {
    const advice = advise(halfAnswered());
    expect(advice.status).toBe('recommended');
    expect(advice.extendedDeadline).toBe('2026-10-15');
    expect(advice.daysUntilDeadline).toBeGreaterThan(0);
  });

  it('a ready year gets no nag', () => {
    const advice = advise(halfAnswered(), { ready: true });
    expect(advice.status).toBe('not-needed');
    expect(advice.payment).toBeNull();
  });

  it('after the deadline it says what actually helps now', () => {
    const advice = advise(halfAnswered(), { today: '2026-05-01' });
    expect(advice.status).toBe('deadline-passed');
    expect(advice.payment).toBeNull();
    expect(JSON.stringify(advice.notes)).toContain('stops the late-filing penalty growing');
  });
});

describe('the conservative branch is a real ceiling', () => {
  // The property the whole slice rests on, over several fact sets: the
  // conservative year must be at least as expensive as the worst branch
  // of EVERY single-fact fork. A ceiling some one unknown could exceed
  // would not be a ceiling.
  const sets: Array<[string, FactAssertion[]]> = [
    ['a first W-2 year', halfAnswered()],
    [
      'a year with platform income',
      [...halfAnswered(), make('platform-income', { kind: 'number', value: 9000 })],
    ],
    [
      'a year with retirement money out',
      [...halfAnswered(), make('retirement-distribution', { kind: 'number', value: 6000 })],
    ],
    [
      'a year with almost nothing answered',
      [
        make('us-citizen', { kind: 'bool', value: true }),
        make('married', { kind: 'bool', value: false }),
      ],
    ],
  ];

  for (const [label, assertions] of sets) {
    it(`${label} — no single fork exceeds it`, () => {
      const conservative = conservativeYear(assertions, 2025);
      const ceiling = conservative.evaluation.liability?.federalTax ?? 0;
      const set = factSet(assertions, 2025);

      for (const question of INTAKE_QUESTIONS) {
        const state = factState(set, question.factId);
        if (state.status === 'known' || state.status === 'contradicted') continue;
        const result = fork(assertions, 2025, question.factId);
        if (!result.ok) continue;
        for (const branch of result.branches) {
          const tax = branch.evaluation.liability?.federalTax;
          if (tax === undefined || tax === null) continue;
          expect(
            ceiling + 0.01,
            `${question.factId} branch (${JSON.stringify(branch.assumed)}) exceeds the ceiling`,
          ).toBeGreaterThanOrEqual(tax);
        }
      }
    });
  }

  it('is never below the year on known facts alone', () => {
    const assertions = halfAnswered();
    const known = evaluateYear(assertions, 2025).liability?.federalTax ?? 0;
    const ceiling = conservativeYear(assertions, 2025).evaluation.liability?.federalTax ?? 0;
    expect(ceiling).toBeGreaterThanOrEqual(known);
  });

  it('names each assumption and what it costs, most expensive first', () => {
    const conservative = conservativeYear(halfAnswered(), 2025);
    expect(conservative.assumedWorst.length).toBeGreaterThan(0);
    const costs = conservative.assumedWorst.map((a) => a.costsIfTrue);
    expect(costs).toEqual([...costs].sort((a, b) => b - a));
    // Each is asked as a question, not named as a field.
    expect(conservative.assumedWorst.every((a) => a.question.trim().endsWith('?'))).toBe(true);
  });

  it('the assumptions are hypotheses — they never reach the fact ledger', () => {
    // The conservative year asserts expensive answers to run the
    // arithmetic. If any of them leaked back into the caller's
    // assertions, the next question the person was asked would already
    // be "answered" with a guess the engine made up.
    const assertions = halfAnswered();
    const before = assertions.length;
    const conservative = conservativeYear(assertions, 2025);
    expect(assertions).toHaveLength(before);
    expect(conservative.assumedWorst.length).toBeGreaterThan(0);
    // And the caller's own view of the year is untouched.
    const set = factSet(assertions, 2025);
    for (const assumed of conservative.assumedWorst) {
      expect(factState(set, assumed.factId).status).not.toBe('known');
    }
  });
});

describe('the cruel case: everything unknown', () => {
  it('still recommends the extension, and refuses to invent the payment', () => {
    // The spec said "the conservative estimate still computes from what
    // exists". It can't, here — the year is blocked before any total
    // exists, and `?? 0` was quietly offering ZERO as the most you
    // plausibly owe. That is the most dangerous number to be wrong
    // about on this page, so it names what is missing instead.
    const advice = advise([make('us-citizen', { kind: 'bool', value: true })]);
    expect(advice.status).toBe('recommended');
    expect(advice.payment).toBeNull();
    expect(JSON.stringify(advice.notes)).toContain('File the extension regardless');
    expect(JSON.stringify(advice.notes)).toContain('no honest ceiling');
  });

  it('a year with income but open questions DOES get a figure', () => {
    const advice = advise(halfAnswered());
    expect(advice.payment).not.toBeNull();
    expect(advice.payment?.amount).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(advice.notes)).toContain('every open question lands the expensive way');
  });
});

describe('the states', () => {
  it('California asks for nothing, and says what is not automatic', () => {
    const ca = advise(halfAnswered(), { stateCode: 'CA' }).states[0];
    expect(ca?.form).toBeNull();
    expect(ca?.automatic).toBe(true);
    expect(ca?.detail).toContain('FTB 3519');
  });

  it('New York wants its own form, and says the federal one does not cover it', () => {
    const ny = advise(halfAnswered(), { stateCode: 'NY' }).states[0];
    expect(ny?.form).toBe('IT-370');
    expect(ny?.detail).toContain('does not cover New York');
  });

  it('Massachusetts carries the 80% condition — the rule nobody knows they need', () => {
    const ma = advise(halfAnswered(), { stateCode: 'MA' }).states[0];
    expect(ma?.form).toBeNull();
    expect(ma?.automatic).toBe(true);
    // Void, not reduced. The distinction is the whole point.
    expect(ma?.condition).toContain('80%');
    expect(ma?.condition).toContain('void');
  });

  it('a state with no module produces no state note rather than a guess', () => {
    expect(advise(halfAnswered(), { stateCode: 'TX' }).states).toEqual([]);
    expect(advise(halfAnswered(), { stateCode: null }).states).toEqual([]);
  });
});

describe('what the payment avoids', () => {
  it('shows the tenfold difference between the two penalties', () => {
    const advice = advise(halfAnswered());
    const exposure = advice.exposure;
    if (!exposure) throw new Error('expected an exposure');

    expect(exposure.failureToFileMonthly).toBe(0.05);
    expect(exposure.failureToPayMonthly).toBe(0.005);
    expect(exposure.oneMonthWithoutExtension).toBeCloseTo(exposure.unpaid * 0.05, 6);
    expect(exposure.oneMonthWithExtension).toBeCloseTo(exposure.unpaid * 0.005, 6);
    // In a month where both apply the filing penalty is reduced by the
    // payment one — it is never 5.5%, and saying otherwise would
    // overstate by 10%.
    expect(exposure.note).toContain('never 5.5%');
  });

  it('carries the 60-day minimum for the year the return is due', () => {
    // $525 for due dates after 2025-12-31; the 2025 figure was $510.
    expect(advise(halfAnswered()).exposure?.minimumIfOver60Days).toBe(525);
  });

  it('with nothing owed, says there is nothing for it to run on', () => {
    const advice = advise([
      make('us-citizen', { kind: 'bool', value: true }),
      make('married', { kind: 'bool', value: false }),
      make('state-of-residence', { kind: 'string', value: 'MA' }),
    ]);
    if (advice.exposure && advice.exposure.unpaid <= 0) {
      expect(advice.exposure.note).toContain('nothing for a late-payment penalty to run on');
    }
  });
});
