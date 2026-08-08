import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '../db';
import { ensureLaunchSchema } from '../db/ensure-schema';
import * as schema from '../db/schema';
import { evaluateYear } from '../lib/calc/filing/evaluation';
import { makeAssertion } from '../lib/calc/filing/facts';
import { reviewPriorYears } from '../lib/calc/filing/prior-years';
import { supportedFilingYears, yearRulesLoaded } from '../lib/calc/filing/year-data';
import { assertFact } from '../services/facts';
import { priorYearsFor } from '../services/prior-years';

// ─── H4 acceptance ─────────────────────────────────────────────────
// P8 is three years behind and frightened. The work here is ordering
// the years by which refund evaporates first, being right about the
// clock (which is NOT H2's clock), and — the case that matters most —
// flipping the framing per year when one of them owes rather than
// refunds.

let n = 0;
const make = (
  factId: Parameters<typeof makeAssertion>[0]['factId'],
  taxYear: number,
  value: Parameters<typeof makeAssertion>[0]['value'],
) =>
  makeAssertion({
    assertionId: `h4${++n}`,
    factId,
    taxYear,
    value,
    source: { kind: 'person', conversationId: null },
    assertedAt: `2025-01-01T00:00:${String(n % 60).padStart(2, '0')}Z`,
    supersedes: null,
  } as Parameters<typeof makeAssertion>[0]);

/** A year that overpaid through withholding — the ordinary skipped year. */
const refundYear = (taxYear: number) => [
  make('us-citizen', taxYear, { kind: 'bool', value: true }),
  make('married', taxYear, { kind: 'bool', value: false }),
  make('birth-date', taxYear, { kind: 'date', value: '2000-04-15' }),
  make('w2-employer-count', taxYear, { kind: 'number', value: 1 }),
  make('w2-wages', taxYear, { kind: 'number', value: 30000 }),
  make('gross-income', taxYear, { kind: 'number', value: 30000 }),
  make('w2-federal-withheld', taxYear, { kind: 'number', value: 4000 }),
];

/** A year with contract income and nothing withheld — this one owes. */
const owingYear = (taxYear: number) => [
  make('us-citizen', taxYear, { kind: 'bool', value: true }),
  make('married', taxYear, { kind: 'bool', value: false }),
  make('birth-date', taxYear, { kind: 'date', value: '2000-04-15' }),
  make('contract-income', taxYear, { kind: 'number', value: 40000 }),
  make('gross-income', taxYear, { kind: 'number', value: 40000 }),
];

const input = (taxYear: number, assertions: ReturnType<typeof make>[]) => ({
  taxYear,
  evaluation: yearRulesLoaded(taxYear) ? evaluateYear(assertions, taxYear) : null,
  factsOnFile: assertions.length,
  documentsOnFile: 0,
});

const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('the clock is the due date, not the filing date', () => {
  it('runs three years from the return due date', () => {
    // H2's amendment clock runs from when the return was FILED. A year
    // never filed has no filing date, so this one runs from the due
    // date — conflating them would hand people months they don't have.
    const review = reviewPriorYears([input(2025, refundYear(2025))], at('2026-06-01'));
    expect(review.years[0]?.forfeitDate).toBe('2029-04-15');
  });

  it('reports closing-soon, then forfeited', () => {
    const soon = reviewPriorYears([input(2025, refundYear(2025))], at('2029-03-01'));
    expect(soon.years[0]?.status).toBe('closing-soon');

    const gone = reviewPriorYears([input(2025, refundYear(2025))], at('2029-05-01'));
    expect(gone.years[0]?.status).toBe('forfeited');
  });
});

describe('ordering is the advice', () => {
  it('oldest-expiring first', () => {
    const review = reviewPriorYears(
      [input(2026, refundYear(2026)), input(2025, refundYear(2025))],
      at('2027-06-01'),
    );
    expect(review.years.map((y) => y.taxYear)).toEqual([2025, 2026]);
    expect(review.headline).toContain('2025');
  });

  it('a forfeited year sinks below the ones still worth money', () => {
    const review = reviewPriorYears(
      [input(2025, refundYear(2025)), input(2026, refundYear(2026))],
      // 2025 forfeited 2029-04-15; 2026 has until 2030-04-15.
      at('2029-06-01'),
    );
    expect(review.years[0]?.taxYear).toBe(2026);
    expect(review.years[1]?.status).toBe('forfeited');
    expect(review.headline).toContain('is gone');
  });
});

describe('the framing flips per year, not per person', () => {
  it('a refund year says filing late costs nothing', () => {
    const review = reviewPriorYears([input(2025, refundYear(2025))], at('2026-06-01'));
    const year = review.years[0];
    expect(year?.estimate?.direction).toBe('refund');
    expect(year?.estimate?.noPenaltyNote).toContain('costs nothing');
    expect(year?.estimate?.owedNote).toBeNull();
  });

  it('a year that OWES gets the penalty arithmetic instead', () => {
    const review = reviewPriorYears([input(2025, owingYear(2025))], at('2026-06-01'));
    const year = review.years[0];
    expect(year?.estimate?.direction).toBe('owed');
    expect(year?.estimate?.owedNote).toContain('5%');
    expect(year?.estimate?.owedNote).toContain('stops growing the day the return goes in');
    // The dangerous sentence must NOT appear on this year.
    expect(year?.estimate?.noPenaltyNote).toBeNull();
  });

  it('the cruel case: one owes, one refunds — each keeps its own framing', () => {
    const review = reviewPriorYears(
      [input(2025, refundYear(2025)), input(2026, owingYear(2026))],
      at('2027-06-01'),
    );
    const byYear = new Map(review.years.map((y) => [y.taxYear, y]));

    expect(byYear.get(2025)?.estimate?.noPenaltyNote).not.toBeNull();
    expect(byYear.get(2025)?.estimate?.owedNote).toBeNull();
    expect(byYear.get(2026)?.estimate?.owedNote).not.toBeNull();
    expect(byYear.get(2026)?.estimate?.noPenaltyNote).toBeNull();

    // And the headline says both things rather than averaging them into
    // one reassuring sentence.
    expect(review.headline).toContain('refund');
    expect(review.headline).toContain('owes rather than refunds');

    // Both kinds of note are present, and the payment-plan one only
    // because a year owes.
    expect(JSON.stringify(review.notes)).toContain('payment plan');
    expect(JSON.stringify(review.notes)).toContain('Credits go with the refund');
  });
});

describe('a year whose rules are not loaded', () => {
  it('refuses by name rather than running on another year’s numbers', () => {
    // 2022 has 1099-K thresholds loaded but no rate schedules — exactly
    // the half-loaded state the completeness check exists to catch.
    expect(yearRulesLoaded(2022)).toBe(false);

    const review = reviewPriorYears([input(2022, refundYear(2022))], at('2026-06-01'));
    const year = review.years[0];
    expect(year?.support).toBe('rules-not-loaded');
    expect(year?.refusal).toContain('2022');
    expect(year?.refusal).toContain("looks right and isn't");
    expect(year?.estimate).toBeNull();
    // The deadline and the transcript still apply to it.
    expect(year?.forfeitDate).toBe('2026-04-15');
    expect(JSON.stringify(review.notes)).toContain('still a year worth filing');
  });

  it('the completeness check requires BOTH tables, not one', () => {
    // Checking one and assuming the other is how a prior year gets
    // computed with this year's brackets and nobody notices.
    for (const year of supportedFilingYears()) {
      expect(yearRulesLoaded(year)).toBe(true);
    }
    expect(supportedFilingYears()).toEqual([2025, 2026]);
    expect(yearRulesLoaded(2024)).toBe(false);
  });
});

describe('the transcript path', () => {
  it('names the exact mechanism, and what it saves you from', () => {
    const review = reviewPriorYears([input(2025, refundYear(2025))], at('2026-06-01'));
    expect(review.transcript.how).toContain('4506-T');
    expect(review.transcript.how).toContain('line 8');
    expect(review.transcript.why).toContain('do not need to find your old paperwork');
    // And it does not overclaim: nothing reads one automatically yet.
    expect(JSON.stringify(review.notes)).toContain('does not read a transcript automatically');
  });
});

// ─── Over the desk ─────────────────────────────────────────────────

describe('reading the years off a real desk', () => {
  const KEYS = { userId: 'u1', workspaceId: 'w1' };
  let db: DB;

  beforeEach(() => {
    const raw = new Database(':memory:');
    ensureLaunchSchema(raw);
    db = drizzle(raw, { schema }) as unknown as DB;
  });

  const say = async (
    factId: string,
    taxYear: number,
    value: Parameters<typeof assertFact>[2]['value'],
  ) =>
    assertFact(db, KEYS, {
      factId,
      taxYear,
      value,
      source: { kind: 'person', conversationId: null },
    });

  it('a year nobody has touched produces no row at all', async () => {
    await say('w2-wages', 2025, { kind: 'number', value: 30000 });
    const review = await priorYearsFor(db, KEYS, 2026, at('2027-06-01'));
    expect(review.years.map((y) => y.taxYear)).toEqual([2025]);
  });

  it('counts only what belongs to the year, not the person', async () => {
    // A birth date is timeless: it says nothing about whether 2025 was
    // started, and counting it would make an untouched year look begun.
    await say('birth-date', 2025, { kind: 'date', value: '2000-04-15' });
    const review = await priorYearsFor(db, KEYS, 2026, at('2027-06-01'));
    expect(review.years).toEqual([]);
  });

  it('P8: three years behind, ranked with what each is worth', async () => {
    for (const year of [2023, 2024, 2025]) {
      await say('us-citizen', year, { kind: 'bool', value: true });
      await say('married', year, { kind: 'bool', value: false });
      await say('w2-employer-count', year, { kind: 'number', value: 1 });
      await say('w2-wages', year, { kind: 'number', value: 30000 });
      await say('gross-income', year, { kind: 'number', value: 30000 });
      await say('w2-federal-withheld', year, { kind: 'number', value: 4000 });
    }

    const review = await priorYearsFor(db, KEYS, 2026, at('2027-06-01'));

    // 2023's three years ran out on 2027-04-15 — six weeks before this
    // person looked. It sinks to the bottom because nothing can be done
    // about it, and leading with it would bury the two that still pay.
    expect(review.years.map((y) => y.taxYear)).toEqual([2024, 2025, 2023]);
    const byYear = new Map(review.years.map((y) => [y.taxYear, y]));
    expect(byYear.get(2023)?.status).toBe('forfeited');
    expect(byYear.get(2024)?.status).toBe('open');

    // 2023 and 2024 have no rate schedules loaded, so they refuse rather
    // than being computed on 2025's numbers.
    expect(byYear.get(2023)?.support).toBe('rules-not-loaded');
    expect(byYear.get(2024)?.support).toBe('rules-not-loaded');

    const y2025 = byYear.get(2025);
    expect(y2025?.support).toBe('supported');
    expect(y2025?.estimate?.direction).toBe('refund');
    expect(y2025?.estimate?.amount).toBeGreaterThan(1000);
    expect(y2025?.forfeitDate).toBe('2029-04-15');
    expect(review.headline).toContain('is gone');
  });
});
