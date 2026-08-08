import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '../db';
import { ensureLaunchSchema } from '../db/ensure-schema';
import * as schema from '../db/schema';
import { type W4Input, remainingPayPeriods, w4Advice } from '../lib/calc/filing/w4';
import { assertFact } from '../services/facts';
import { w4For } from '../services/w4';

// ─── H5 acceptance ─────────────────────────────────────────────────
// The only form here that changes the future. Three things carry it:
// the number is a real box on the real form (not "claim fewer
// allowances", which stopped existing in 2020), the divisor is
// REMAINING paychecks, and the refund framing states both directions
// without recommending either.

const base: W4Input = {
  basedOn: 2025,
  gap: 0,
  income: 42000,
  filingStatus: 'single',
  selfEmploymentIncome: 0,
  payFrequency: 'biweekly',
  today: new Date('2026-01-01T00:00:00Z'),
  safeHarborShortfall: null,
};

const advise = (over: Partial<W4Input>) => w4Advice({ ...base, ...over });
const lineFor = (advice: ReturnType<typeof advise>, step: string) =>
  advice.lines.find((l) => l.step === step);

describe('the number goes in a real box', () => {
  it('an under-withheld year produces Step 4(c), per pay period', () => {
    const advice = advise({ gap: 1300 });
    const line = lineFor(advice, '4(c)');
    expect(line?.basis).toBe('per-pay-period');
    expect(line?.label).toBe('Extra withholding');
    // $1,300 over 26 fortnightly paychecks, rounded up so it lands.
    expect(line?.amount).toBe(50);
    expect(line?.citation).toContain('Step 4(c)');
  });

  it('an over-withheld year produces Step 3, as an annual figure', () => {
    const advice = advise({ gap: -2300 });
    const line = lineFor(advice, '3');
    expect(line?.basis).toBe('annual');
    expect(line?.amount).toBe(2300);
    // Step 3 comes straight off withholding, so the paycheck effect is
    // the annual figure divided by the year's periods.
    expect(line?.how).toContain('$88');
  });

  it('never mentions allowances — they stopped existing in 2020', () => {
    for (const gap of [1300, -2300, 0]) {
      const advice = advise({ gap });
      const prose = JSON.stringify(advice);
      expect(prose.toLowerCase()).not.toContain('allowance');
      expect(prose.toLowerCase()).not.toContain('exemptions to claim');
    }
  });
});

describe('the divisor is remaining paychecks, not the year', () => {
  it('a full year ahead uses every period', () => {
    expect(remainingPayPeriods('biweekly', new Date('2026-01-01T00:00:00Z'), 2026)).toBe(26);
    expect(remainingPayPeriods('monthly', new Date('2026-01-01T00:00:00Z'), 2026)).toBe(12);
  });

  it('the cruel case: fixing it in September divides by what is left', () => {
    // Roughly a third of the year remains from 1 September.
    const remaining = remainingPayPeriods('biweekly', new Date('2026-09-01T00:00:00Z'), 2026);
    expect(remaining).toBeGreaterThan(6);
    expect(remaining).toBeLessThan(10);

    const advice = advise({ gap: 1300, today: new Date('2026-09-01T00:00:00Z') });
    const line = lineFor(advice, '4(c)');
    // Dividing by 26 would give $50 and leave them short by two thirds.
    expect(line?.amount).toBeGreaterThan(140);
    expect(line?.how).toContain(`${remaining} paychecks left`);
  });

  it('the total actually covers the gap', () => {
    for (const month of ['01', '05', '09', '12']) {
      const today = new Date(`2026-${month}-01T00:00:00Z`);
      const advice = advise({ gap: 1300, today });
      const line = lineFor(advice, '4(c)');
      const covered = (line?.amount ?? 0) * advice.remainingPayPeriods;
      expect(covered, `${month} falls short`).toBeGreaterThanOrEqual(1300);
    }
  });

  it('never divides by zero at the end of the year', () => {
    const advice = advise({ gap: 1300, today: new Date('2026-12-31T12:00:00Z') });
    expect(advice.remainingPayPeriods).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(lineFor(advice, '4(c)')?.amount ?? Number.NaN)).toBe(true);
  });
});

describe('the side gig: two instruments, same target', () => {
  it('prices both, and prefers neither', () => {
    const advice = advise({ gap: 3000, selfEmploymentIncome: 12000, safeHarborShortfall: 2800 });
    expect(advice.instruments.map((i) => i.id)).toEqual([
      'w4-extra-withholding',
      'quarterly-estimates',
    ]);
    for (const instrument of advice.instruments) {
      expect(instrument.each).toBeGreaterThan(0);
      expect(instrument.rhythm.length).toBeGreaterThan(0);
      expect(instrument.note.length).toBeGreaterThan(20);
    }
  });

  it('says outright that Step 4(a) is the wrong box for freelance money', () => {
    // The trap: 4(a) reads like "income from elsewhere" and the form
    // explicitly excludes self-employment from it.
    const advice = advise({ gap: 3000, selfEmploymentIncome: 12000 });
    const prose = JSON.stringify(advice.notes);
    expect(prose).toContain('does not go in Step 4(a)');
    expect(prose).toContain("shouldn't include income from any jobs or self-employment");
    expect(prose).toContain('W4App');
  });

  it('with no side gig, no quarterly instrument is offered', () => {
    const advice = advise({ gap: 1300 });
    expect(advice.instruments.map((i) => i.id)).toEqual(['w4-extra-withholding']);
  });
});

describe("Step 3's ceiling is on the form's face", () => {
  it('closes above $200,000 for a single filer, and says why', () => {
    const advice = advise({ gap: -3000, income: 250_000 });
    expect(lineFor(advice, '3')).toBeUndefined();
    expect(JSON.stringify(advice.notes)).toContain('Step 3 is closed above');
  });

  it('the joint limit is higher', () => {
    const joint = advise({ gap: -3000, income: 250_000, filingStatus: 'mfj' });
    expect(lineFor(joint, '3')).toBeDefined();
  });
});

describe('the framing states both directions and recommends neither', () => {
  // The G3 sweep, applied here. A refund is a default that was never
  // chosen; the job is to make it a choice, not to imply it was a mistake.
  const RECOMMENDATION_VERBS = [
    'you should',
    'the smart move',
    'the best',
    'better to',
    'we recommend',
    'the right choice',
    'ideally',
    'obviously',
    'no-brainer',
    "i'd suggest",
    'make sure to',
  ];

  it('an over-withheld year says both things', () => {
    const advice = advise({ gap: -2300 });
    const framing = advice.framing.join(' ');
    // The cost of the default.
    expect(framing).toContain('already yours');
    expect(framing).toContain('$88');
    // And the honest case for keeping it.
    expect(framing).toContain('real reason to keep it');
    expect(framing).toContain('the choice is yours');
  });

  it('no recommendation verb survives, in any direction', () => {
    for (const gap of [2300, -2300, 0]) {
      const prose = JSON.stringify(advise({ gap, selfEmploymentIncome: 5000 })).toLowerCase();
      for (const verb of RECOMMENDATION_VERBS) {
        expect(prose, `"${verb}" appears at gap ${gap}`).not.toContain(verb);
      }
    }
  });

  it('an on-target year says nothing needs changing', () => {
    const advice = advise({ gap: 0 });
    expect(advice.direction).toBe('on-target');
    expect(advice.lines).toEqual([]);
    expect(JSON.stringify(advice.notes)).toContain('unless your life did');
  });
});

describe('over the desk', () => {
  const KEYS = { userId: 'u1', workspaceId: 'w1' };
  let db: DB;

  beforeEach(() => {
    const raw = new Database(':memory:');
    ensureLaunchSchema(raw);
    db = drizzle(raw, { schema }) as unknown as DB;
  });

  const say = async (factId: string, value: Parameters<typeof assertFact>[2]['value']) =>
    assertFact(db, KEYS, {
      factId,
      taxYear: 2025,
      value,
      source: { kind: 'person', conversationId: null },
    });

  it("P1's refund produces the Step-3 figure that would have zeroed it", async () => {
    await say('us-citizen', { kind: 'bool', value: true });
    await say('married', { kind: 'bool', value: false });
    await say('birth-date', { kind: 'date', value: '2003-04-15' });
    await say('w2-employer-count', { kind: 'number', value: 1 });
    await say('w2-wages', { kind: 'number', value: 42000 });
    await say('gross-income', { kind: 'number', value: 42000 });
    // Over-withheld by design: the tax on $42,000 is about $2,912.
    await say('w2-federal-withheld', { kind: 'number', value: 5000 });

    const advice = await w4For(db, KEYS, 2025, 'biweekly', new Date('2026-01-01T00:00:00Z'));
    if (!advice) throw new Error('expected advice');

    expect(advice.direction).toBe('over-withheld');
    expect(advice.forTaxYear).toBe(2026);
    const step3 = advice.lines.find((l) => l.step === '3');
    // The refund was 5,000 − 2,911.50 = 2,088.50, and that is the figure
    // that would have brought it to nothing.
    expect(Math.round(step3?.amount ?? 0)).toBe(2089);
  });

  it('a year that cannot be totalled produces nothing rather than a guess', async () => {
    await say('us-citizen', { kind: 'bool', value: true });
    expect(await w4For(db, KEYS, 2025)).toBeNull();
  });
});
