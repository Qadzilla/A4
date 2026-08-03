import { describe, expect, it } from 'vitest';
import { evaluateYear } from '../lib/calc/filing/evaluation';
import { makeAssertion } from '../lib/calc/filing/facts';
import { fork } from '../lib/calc/filing/forks';
import {
  type ExtractedBenefitForm,
  type StoredBenefitFormRow,
  classifyBox7,
  liveBenefitFormRows,
  planBenefitFacts,
} from '../services/benefit-form-facts';

// ─── C5 acceptance ─────────────────────────────────────────────────
// The code table decides what each dollar is; a rollover is not income and
// says so; a rollover WITH withholding is a trap and says that louder; the
// state-refund gate defaults to not-taxable and the fork prices finding
// out; and P6's shortfall — 20% withheld is not settlement — reaches the
// liability.

const NOW = '2026-08-02T12:00:00.000Z';

let n = 0;
function benefitForm(
  kind: StoredBenefitFormRow['kind'],
  over: Partial<StoredBenefitFormRow> & {
    r1099?: ExtractedBenefitForm['r1099'];
    g1099?: ExtractedBenefitForm['g1099'];
    w2g?: ExtractedBenefitForm['w2g'];
  } = {},
): StoredBenefitFormRow {
  n += 1;
  return {
    fileId: over.fileId ?? `file-${n}`,
    kind,
    payerTin: over.payerTin !== undefined ? over.payerTin : `77-00000${n}`,
    corrected: over.corrected ?? false,
    createdAt: over.createdAt ?? n,
    extracted: {
      kind,
      payerName: `Payer ${n}`,
      payerTin: over.payerTin !== undefined ? over.payerTin : `77-00000${n}`,
      corrected: over.corrected ?? false,
      taxYear: 2026,
      r1099: over.r1099 ?? null,
      g1099: over.g1099 ?? null,
      w2g: over.w2g ?? null,
    },
  };
}

const r = (over: Partial<NonNullable<ExtractedBenefitForm['r1099']>>) => ({
  box1: null,
  box2a: null,
  box2bNotDetermined: null,
  box4: null,
  box7Codes: null,
  iraSepSimple: null,
  ...over,
});

function plan(
  live: StoredBenefitFormRow[],
  personLive: Parameters<typeof planBenefitFacts>[0]['personLive'] = [],
) {
  return planBenefitFacts({
    live,
    prevLive: [],
    personLive,
    taxYear: 2026,
    triggeringFileId: live[live.length - 1]?.fileId ?? 'file-x',
    nowIso: NOW,
  });
}

let m = 0;
const make = (
  factId: Parameters<typeof makeAssertion>[0]['factId'],
  value: Parameters<typeof makeAssertion>[0]['value'],
  source: Parameters<typeof makeAssertion>[0]['source'] = { kind: 'person', conversationId: null },
) =>
  makeAssertion({
    assertionId: `b${++m}`,
    factId,
    taxYear: 2026,
    value,
    source,
    assertedAt: `2026-01-01T00:00:${String(m % 60).padStart(2, '0')}Z`,
    supersedes: null,
  } as Parameters<typeof makeAssertion>[0]);

describe('the box 7 table', () => {
  it('maps every taught code, and combined codes by priority', () => {
    expect(classifyBox7('G')).toBe('rollover');
    expect(classifyBox7('H')).toBe('rollover');
    expect(classifyBox7('1')).toBe('early');
    expect(classifyBox7('2')).toBe('regular');
    expect(classifyBox7('3')).toBe('regular');
    expect(classifyBox7('4')).toBe('regular');
    expect(classifyBox7('7')).toBe('regular');
    expect(classifyBox7('J')).toBe('roth');
    expect(classifyBox7('T')).toBe('roth');
    expect(classifyBox7('Q')).toBe('roth');
    expect(classifyBox7('1B')).toBe('early');
    expect(classifyBox7('4G')).toBe('rollover'); // rollover outranks
    expect(classifyBox7(null)).toBe('unclassified');
    expect(classifyBox7('')).toBe('unclassified');
    expect(classifyBox7('K')).toBe('unclassified');
  });

  it('a code G is not income — and the fact says why', () => {
    const out = plan([benefitForm('1099-R', { r1099: r({ box1: 12000, box7Codes: 'G' }) })]);
    const byId = new Map(out.map((a) => [a.factId, a]));
    expect(byId.get('retirement-rollover')?.value).toEqual({ kind: 'number', value: 12000 });
    // Nothing lands in the income-bearing facts.
    expect(byId.has('retirement-distribution')).toBe(false);
    expect(byId.has('retirement-distribution-taxable')).toBe(false);
    if (byId.get('retirement-rollover')?.source.kind === 'document') {
      expect((byId.get('retirement-rollover')?.source as { field: string }).field).toContain(
        'not income',
      );
    }
  });

  it('cruel case: a rollover WITH withholding names the partial-rollover trap', () => {
    const out = plan([
      benefitForm('1099-R', { r1099: r({ box1: 12000, box4: 2400, box7Codes: 'G' }) }),
    ]);
    const rollover = out.find((a) => a.factId === 'retirement-rollover');
    if (!rollover || rollover.source.kind !== 'document') throw new Error('expected rollover');
    expect(rollover.source.field).toContain('$2400');
    expect(rollover.source.field).toContain('60-day');
    // The withholding still counts toward payments.
    expect(out.find((a) => a.factId === 'retirement-federal-withheld')?.value).toEqual({
      kind: 'number',
      value: 2400,
    });
  });

  it('code 1 fills the early bucket; an unreadable code stays unclassified', () => {
    const out = plan([
      benefitForm('1099-R', { r1099: r({ box1: 9000, box2a: 9000, box4: 1800, box7Codes: '1' }) }),
      benefitForm('1099-R', { r1099: r({ box1: 500, box7Codes: null }) }),
    ]);
    const byId = new Map(out.map((a) => [a.factId, a]));
    expect(byId.get('retirement-early-distribution')?.value).toEqual({
      kind: 'number',
      value: 9000,
    });
    expect(byId.get('retirement-distribution-unclassified')?.value).toEqual({
      kind: 'number',
      value: 500,
    });
    expect(byId.get('retirement-distribution')?.value).toEqual({ kind: 'number', value: 9500 });
    expect(byId.get('retirement-distribution-taxable')?.value).toEqual({
      kind: 'number',
      value: 9000,
    });
  });

  it('Roth codes go to the named gap, never a guess', () => {
    const out = plan([benefitForm('1099-R', { r1099: r({ box1: 3000, box7Codes: 'J' }) })]);
    const roth = out.find((a) => a.factId === 'retirement-roth-distribution');
    expect(roth?.value).toEqual({ kind: 'number', value: 3000 });
    if (roth?.source.kind === 'document') {
      expect(roth.source.field).toContain('not yet modelled');
    }
  });
});

describe('unemployment and the refund', () => {
  it('the form replaces an estimate in either direction — states are exact', () => {
    const person = make('unemployment-income', { kind: 'number', value: 3000 });
    const out = plan(
      [benefitForm('1099-G', { g1099: { box1: 3200, box2: null, box4: null, state: 'CA' } })],
      [person],
    );
    const u = out.find((a) => a.factId === 'unemployment-income');
    expect(u?.value).toEqual({ kind: 'number', value: 3200 });
    expect(u?.supersedes).toBe(person.assertionId);
    if (u?.source.kind === 'document') {
      expect(u.source.field).toContain('$3000 estimate');
    }
  });

  it('the state refund asserts raw with the gate explained', () => {
    const out = plan([
      benefitForm('1099-G', { g1099: { box1: null, box2: 380, box4: null, state: 'CA' } }),
    ]);
    const refund = out.find((a) => a.factId === 'state-refund-received');
    expect(refund?.value).toEqual({ kind: 'number', value: 380 });
    if (refund?.source.kind === 'document') {
      expect(refund.source.field).toContain('itemized');
    }
  });
});

describe('winnings and the floor', () => {
  it('a person who tracked more than the W-2Gs stands above them', () => {
    const person = make('gambling-winnings', { kind: 'number', value: 7500 });
    const out = plan([benefitForm('W-2G', { w2g: { box1: 6000, box4: 1440 } })], [person]);
    expect(out.some((a) => a.factId === 'gambling-winnings')).toBe(false);
  });

  it('a person below the W-2G total is reconciled up to it', () => {
    const person = make('gambling-winnings', { kind: 'number', value: 500 });
    const out = plan([benefitForm('W-2G', { w2g: { box1: 6000, box4: null } })], [person]);
    const w = out.find((a) => a.factId === 'gambling-winnings');
    expect(w?.value).toEqual({ kind: 'number', value: 6000 });
    expect(w?.supersedes).toBe(person.assertionId);
  });

  it('a corrected W-2G retires its predecessor by payer TIN', () => {
    const live = liveBenefitFormRows([
      benefitForm('W-2G', { payerTin: '77-1111111', w2g: { box1: 6000, box4: null }, fileId: 'a' }),
      benefitForm('W-2G', {
        payerTin: '77-1111111',
        corrected: true,
        createdAt: 99,
        w2g: { box1: 4200, box4: null },
        fileId: 'b',
      }),
    ]);
    expect(live.map((f) => f.fileId)).toEqual(['b']);
  });
});

describe('the streams reach the liability', () => {
  const base = () => [
    make('us-citizen', { kind: 'bool', value: true }),
    make('married', { kind: 'bool', value: false }),
    make('birth-date', { kind: 'date', value: '2003-09-09' }),
    make('gross-income', { kind: 'number', value: 60000 }),
    make('full-time-student-months', { kind: 'number', value: 0 }),
    make('w2-wages', { kind: 'number', value: 45000 }),
  ];

  it('P6: winnings and the cashout are income, losses never net silently, and 20% withheld is not settlement', () => {
    const result = evaluateYear(
      [
        ...base(),
        make('gambling-winnings', { kind: 'number', value: 6000 }),
        make('gambling-losses', { kind: 'number', value: 7000 }),
        make('retirement-distribution', { kind: 'number', value: 9000 }),
        make('retirement-distribution-taxable', { kind: 'number', value: 9000 }),
        make('retirement-early-distribution', { kind: 'number', value: 9000 }),
        make('retirement-federal-withheld', { kind: 'number', value: 1800 }),
        make('w2-federal-withheld', { kind: 'number', value: 3600 }),
      ],
      2026,
    );
    if (result.liability === null) throw new Error('expected liability');
    // 45,000 + 6,000 + 9,000 — the 7,000 of losses appear nowhere.
    expect(result.liability.agi).toBe(60000);
    expect(result.liability.federalWithheld).toBe(5400);
    // The trap in numbers, realised: before the penalty the year looks
    // like a small refund — which is exactly why the 20% withholding felt
    // like settlement. D6's $900 additional tax flips it to owing. This
    // was written as D6's acceptance test when C5 shipped; it now passes
    // against the wired penalty.
    expect(result.liability.earlyWithdrawalPenalty).toBe(900);
    expect(result.liability.refundOrOwed - 900).toBeLessThan(0); // pre-penalty: a paper refund
    expect(result.liability.refundOrOwed).toBeGreaterThan(0); // the real bill: owing
  });

  it('a rollover changes nothing — the pleasant finding, in dollars', () => {
    const without = evaluateYear(base(), 2026);
    const withRollover = evaluateYear(
      [...base(), make('retirement-rollover', { kind: 'number', value: 12000 })],
      2026,
    );
    if (without.liability === null || withRollover.liability === null) {
      throw new Error('expected liabilities');
    }
    expect(withRollover.liability.agi).toBe(without.liability.agi);
    expect(withRollover.liability.incomeTax).toBe(without.liability.incomeTax);
  });

  it('the refund gate defaults to not-taxable, and the fork prices finding out', () => {
    const facts = [
      ...base(),
      make(
        'state-refund-received',
        { kind: 'number', value: 800 },
        {
          kind: 'document',
          fileId: 'g1',
          field: '1099-G box 2',
        },
      ),
      make('itemized-prior-year', { kind: 'unknown' }),
    ];
    const ungated = evaluateYear(facts, 2026);
    if (ungated.liability === null) throw new Error('expected liability');
    expect(ungated.liability.agi).toBe(45000); // not taxed while unknown

    const priced = fork(facts, 2026, 'itemized-prior-year');
    if (!priced.ok) throw new Error('fork refused');
    // Itemized-true branch taxes the $800 at 12% — the price of finding out.
    expect(priced.delta).toBeGreaterThan(80);
    expect(priced.delta).toBeLessThan(120);
  });
});
