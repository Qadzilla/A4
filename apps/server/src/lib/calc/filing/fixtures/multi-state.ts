// ─── Multi-state fixtures (F4) ─────────────────────────────────────
// The credit formulas are transcribed in multi-state.ts with their
// sources. What these pin is the part everyone gets wrong: the CAP.
//
// All three states allow a credit for tax paid to another, and all
// three cap it — but not the same way. Massachusetts and New York cap
// once, on their own tax on the doubly-taxed income. California caps
// TWICE, also by the source state's own share. A "lesser of the two
// taxes" implementation over-credits under California whenever the
// source state taxed more than the doubly-taxed amount, and the
// fixture below is built to catch exactly that.

import type { MultiStateContext, MultiStateStatus, StateSlice } from '../states/multi-state';
import type { FilingFixture, FixtureFact } from './types';

export interface MultiStateExpected {
  status: MultiStateStatus;
  shape?: 'resident-plus-source' | 'part-year' | null;
  receivingState?: string;
  sourceState?: string;
  doublyTaxedIncome?: number;
  /** Rounded to the dollar. */
  credit?: number;
  boundBy?: 'source-tax' | 'receiving-state-cap' | 'source-state-cap';
  wagesPriorState?: number;
  wagesNewState?: number;
  wagesBasis?: 'paystub' | 'day-count';
  gainsPriorState?: number;
  gainsNewState?: number;
  refusalsContain?: string;
  notesContain?: string;
  missingFactsContain?: string;
}

export interface MultiStateFixture extends FilingFixture<MultiStateExpected> {
  ctx: MultiStateContext;
}

const num = (v: number) => ({ kind: 'number', value: v }) as const;
const str = (v: string) => ({ kind: 'string', value: v }) as const;
const date = (v: string) => ({ kind: 'date', value: v }) as const;

const slice = (
  code: StateSlice['code'],
  tax: number,
  income: number,
  resident: boolean,
): StateSlice => ({ code, tax, income, resident });

const noMove: FixtureFact[] = [];

export const MULTI_STATE_FIXTURES: MultiStateFixture[] = [
  {
    id: 'ms/p5-massachusetts-credits-the-new-york-tax',
    source: { kind: 'persona', persona: 'P5' },
    taxYear: 2025,
    facts: noMove,
    ctx: {
      // MA resident taxed on everything; NY taxed the wages via convenience.
      slices: [slice('MA', 3200, 67000, true), slice('NY', 2900, 65000, false)],
      wages: 65000,
      sales: [],
      statutoryResidencyDetected: false,
    },
    expected: {
      status: 'computed',
      shape: 'resident-plus-source',
      receivingState: 'MA',
      sourceState: 'NY',
      doublyTaxedIncome: 65000,
      boundBy: 'source-tax',
      credit: 2900,
      notesContain: 'stops the same dollar being taxed twice',
    },
    note: "The founding fixture. New York taxes the whole $65,000 under the convenience rule; Massachusetts taxes it too because that is where P5 lives. MA's cap is 3,200 × 65,000/67,000 = $3,105, which is above the $2,900 of New York tax — so the full New York tax credits and nothing is lost. Without claiming it, P5 pays both bills in full.",
  },
  {
    id: 'ms/massachusetts-cap-bites-and-the-gap-is-real',
    source: {
      kind: 'authority',
      citation:
        'MA Schedule OJC: the credit is the lesser of the tax due to the other jurisdiction and Massachusetts tax times the doubly-taxed share of Massachusetts income — so a higher-taxing source state leaves a gap.',
    },
    taxYear: 2025,
    facts: noMove,
    ctx: {
      slices: [slice('MA', 3200, 67000, true), slice('NY', 4000, 65000, false)],
      wages: 65000,
      sales: [],
      statutoryResidencyDetected: false,
    },
    expected: {
      status: 'computed',
      receivingState: 'MA',
      boundBy: 'receiving-state-cap',
      credit: 3104,
      notesContain: 'no relief',
    },
    note: 'Same shape, but New York takes $4,000. Massachusetts caps at 3,200 × 65,000/67,000 = $3,104.48, so $895.52 of New York tax gets no relief at all. That gap is not a bug — it is how the credit is written, and it is the real cost of working across that border.',
  },
  {
    id: 'ms/california-caps-on-both-sides',
    source: {
      kind: 'authority',
      citation:
        "CA Schedule S: the credit is limited BOTH by the other state's tax times the doubly-taxed share of that state's income AND by California tax times the doubly-taxed share of California's — two caps, not one.",
    },
    taxYear: 2025,
    facts: noMove,
    ctx: {
      // NY taxed 80,000 of which only 50,000 is also taxed by CA.
      slices: [slice('CA', 4000, 100000, true), slice('NY', 6000, 50000, false)],
      wages: 50000,
      sales: [],
      statutoryResidencyDetected: false,
    },
    expected: {
      status: 'computed',
      receivingState: 'CA',
      sourceState: 'NY',
      doublyTaxedIncome: 50000,
      boundBy: 'receiving-state-cap',
      credit: 2000,
    },
    note: "California's own cap is 4,000 × 50,000/100,000 = $2,000, which binds. The source-side cap (6,000 × 50,000/50,000 = 6,000) does not bite here — the next fixture is the one where it does, and where a naive implementation would over-credit.",
  },
  {
    id: 'ms/california-source-side-cap-catches-the-naive-version',
    source: {
      kind: 'adversarial',
      rationale:
        "The cap the spec warned about. Where the source state taxed MORE income than the two states share, California limits the credit to the source state's tax on the SHARED portion only. An implementation that used the source state's whole tax bill would over-credit — this fixture fails against that version and passes against Schedule S.",
    },
    taxYear: 2025,
    facts: noMove,
    ctx: {
      // NY taxed 100,000 (only 25,000 of it also taxed by CA); CA taxed a lot.
      slices: [slice('CA', 20000, 25000, true), slice('NY', 8000, 100000, false)],
      wages: 25000,
      sales: [],
      statutoryResidencyDetected: false,
    },
    expected: {
      status: 'computed',
      receivingState: 'CA',
      boundBy: 'source-state-cap',
      credit: 2000,
    },
    note: "Doubly-taxed is 25,000. California's own cap is 20,000 × 25,000/25,000 = 20,000 — no help. New York's whole bill is 8,000. But Schedule S caps at the source-side share too: 8,000 × 25,000/100,000 = $2,000. A 'lesser of the two taxes' engine would credit 8,000 here and be wrong by six thousand dollars.",
  },
  {
    id: 'ms/moved-mid-year-splits-wages-by-day-count',
    source: {
      kind: 'adversarial',
      rationale:
        'With no paystub on file the only honest split is calendar days, and it must be MARKED an estimate — pay is rarely earned evenly, and where two states tax at different rates the difference between the estimate and the truth is real money.',
    },
    taxYear: 2025,
    facts: [
      { factId: 'state-move-date', value: date('2025-07-01') },
      { factId: 'prior-state-of-residence', value: str('CA') },
    ],
    ctx: {
      slices: [slice('NY', 2000, 30000, true)],
      wages: 60000,
      sales: [],
      statutoryResidencyDetected: false,
    },
    expected: {
      status: 'computed',
      shape: 'part-year',
      wagesBasis: 'day-count',
      missingFactsContain: 'wages-earned-in-prior-state',
      notesContain: 'ESTIMATE',
    },
    note: 'A July 1 move: 181 of 364 days fall before it, so roughly half the wages belong to California. The engine says out loud that this is a calendar split and names the paystub that would make it exact.',
  },
  {
    id: 'ms/paystub-beats-the-calendar',
    source: {
      kind: 'adversarial',
      rationale:
        'When the exact split is on file it must win over the estimate outright — the whole point of naming the missing paystub is that supplying it changes the answer.',
    },
    taxYear: 2025,
    facts: [
      { factId: 'state-move-date', value: date('2025-07-01') },
      { factId: 'prior-state-of-residence', value: str('CA') },
      { factId: 'wages-earned-in-prior-state', value: num(41000) },
    ],
    ctx: {
      slices: [slice('NY', 2000, 30000, true)],
      wages: 60000,
      sales: [],
      statutoryResidencyDetected: false,
    },
    expected: {
      status: 'computed',
      wagesBasis: 'paystub',
      wagesPriorState: 41000,
      wagesNewState: 19000,
    },
    note: "The real split was 41,000/19,000, nothing like the calendar's half-and-half. That is a $11,000 swing in which state taxes what — exactly why the estimate is labelled.",
  },
  {
    id: 'ms/sales-belong-to-where-you-lived-that-day',
    source: {
      kind: 'adversarial',
      rationale:
        'Capital gains need no estimate at all: every sale carries its own date, and the lot engine has recorded those since P4. Allocating them by residence on the sale date is exact where wages are approximate — a quiet payoff of a decision made long before this module.',
    },
    taxYear: 2025,
    facts: [
      { factId: 'state-move-date', value: date('2025-07-01') },
      { factId: 'prior-state-of-residence', value: str('CA') },
      { factId: 'wages-earned-in-prior-state', value: num(30000) },
    ],
    ctx: {
      slices: [slice('NY', 2000, 30000, true)],
      wages: 60000,
      sales: [
        { saleDate: '2025-03-15', gain: 4000 },
        { saleDate: '2025-08-20', gain: 1500 },
      ],
      statutoryResidencyDetected: false,
    },
    expected: {
      status: 'computed',
      gainsPriorState: 4000,
      gainsNewState: 1500,
      notesContain: 'No estimate needed',
    },
    note: "The March sale is California's; the August sale is New York's. No proration, no judgement — the dates decide it.",
  },
  {
    id: 'ms/three-states-refuses',
    source: {
      kind: 'adversarial',
      rationale:
        'Three states means allocation across several returns with credits running in more than one direction. The fence is pairwise, and a year past it must say so rather than silently computing two of the three.',
    },
    taxYear: 2025,
    facts: [
      { factId: 'state-move-date', value: date('2025-07-01') },
      { factId: 'prior-state-of-residence', value: str('CA') },
    ],
    ctx: {
      slices: [slice('NY', 2000, 30000, true), slice('MA', 900, 15000, false)],
      wages: 60000,
      sales: [],
      statutoryResidencyDetected: false,
    },
    expected: { status: 'refused', refusalsContain: '3 states' },
  },
  {
    id: 'ms/statutory-residency-is-not-a-credit-problem',
    source: {
      kind: 'adversarial',
      rationale:
        'F2 detects that two states may each claim the whole year. A credit does not fix that — each state claims everything, and the relief between them is negotiated rather than computed. Offering a credit here would imply the conflict was resolved.',
    },
    taxYear: 2025,
    facts: noMove,
    ctx: {
      slices: [slice('MA', 3200, 67000, true), slice('NY', 2900, 65000, false)],
      wages: 65000,
      sales: [],
      statutoryResidencyDetected: true,
    },
    expected: { status: 'refused', refusalsContain: 'resident year in two states' },
  },
  {
    id: 'ms/one-state-is-not-multi-state',
    source: {
      kind: 'adversarial',
      rationale:
        'A person who lived and worked in one state all year must produce nothing here — a multi-state determination that fires for everyone is noise.',
    },
    taxYear: 2025,
    facts: noMove,
    ctx: {
      slices: [slice('MA', 3200, 67000, true)],
      wages: 65000,
      sales: [],
      statutoryResidencyDetected: false,
    },
    expected: { status: 'single-state' },
  },
];
