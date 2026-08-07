// ─── F4 · Multi-state allocation and the credit for taxes paid ─────
// Two realities, one module: working across a border, and moving
// mid-year. Both end in the same place — two states looking at the
// same dollar — and the credit for taxes paid is what stops them both
// keeping it.
//
// Authority (verified 2026-08-04):
//   MA — Schedule OJC / Form 1 worksheet. Credit is the lesser of the
//        tax DUE to the other jurisdiction and Massachusetts tax times
//        the doubly-taxed share of Massachusetts income. Massachusetts
//        says explicitly that "tax due is different from taxes
//        withheld" and the credit runs on the tax DUE — the trap this
//        module surfaces rather than repeats.
//   NY — Form IT-112-R. Lesser of the tax paid to the other
//        jurisdiction and New York tax times the ratio of income taxed
//        by both to New York income, and it may never reduce New York
//        tax below what would be owed with that income excluded.
//   CA — Schedule S, and this one is DIFFERENT: the credit is capped on
//        BOTH sides — by the other state's tax times the doubly-taxed
//        share of THAT state's income, and by California tax times the
//        doubly-taxed share of California's. A naive "lesser of the two
//        taxes" over-credits whenever the source state taxed more than
//        the doubly-taxed amount, which is exactly where the spec said
//        implementations go wrong.
//
// The allocation half: a move date splits the year into two residency
// windows. Wages split by the paystub when one exists and by day-count
// when it doesn't — marked an estimate, with the paystub named as what
// would make it exact. Capital gains split by SALE DATE against the
// move date, which is computable because the lot engine has carried
// per-sale dates since P4 — a quiet payoff of a decision made long
// before this module existed.
//
// Fences: the three states, pairwise. No dual-residency relief (F2
// detects statutory residency and refuses; this module refuses it
// again rather than pretending a credit resolves it). No apportionment
// beyond wages and capital gains. Three or more states refuses by name.

import type { FactAssertion, FactId } from '../facts';
import { factSet, factState } from '../facts';
import type { RuleTrace } from './../trace';

export type MultiStateStatus = 'single-state' | 'computed' | 'refused';
export type StateCode = 'CA' | 'NY' | 'MA';

export interface StateSlice {
  code: StateCode;
  /** Everything that state charges, after its own credits. */
  tax: number;
  /** The income that state actually taxed. */
  income: number;
  resident: boolean;
}

export interface CreditForTaxesPaid {
  receivingState: StateCode;
  sourceState: StateCode;
  /** The form the receiving state computes it on. */
  form: string;
  doublyTaxedIncome: number;
  /** Tax DUE to the source state — not what was withheld. */
  taxDueToSource: number;
  /** The receiving state's own tax on the same income. */
  receivingStateCap: number;
  /** California alone also caps by the source state's share. */
  sourceStateCap: number | null;
  credit: number;
  /** Which limb of the formula bound — the interesting part. */
  boundBy: 'source-tax' | 'receiving-state-cap' | 'source-state-cap';
}

export interface ResidencyWindow {
  state: string;
  from: string;
  to: string;
}

export interface MultiStateDetermination {
  status: MultiStateStatus;
  shape: 'resident-plus-source' | 'part-year' | null;
  windows: ResidencyWindow[] | null;
  allocation: {
    wages: { priorState: number; newState: number; basis: 'paystub' | 'day-count' };
    /** Sale-date allocation, from the ledger the lot engine already keeps. */
    capitalGains: { priorState: number; newState: number } | null;
  } | null;
  credit: CreditForTaxesPaid | null;
  missingFacts: FactId[];
  refusals: string[];
  explanation: RuleTrace;
  consumed: FactId[];
}

export interface SaleForAllocation {
  saleDate: string;
  gain: number;
}

export interface MultiStateContext {
  slices: StateSlice[];
  wages: number;
  /** Realized sales with their dates — F4's half of D5's work. */
  sales: SaleForAllocation[];
  /** F2 flagged this year as a possible dual-resident year. */
  statutoryResidencyDetected: boolean;
}

const CITE =
  'MA Schedule OJC / Form 1 worksheet; NY Form IT-112-R; CA Schedule S (Other State Tax Credit)';

const FORM_BY_STATE: Record<StateCode, string> = {
  MA: 'Massachusetts Schedule OJC',
  NY: 'New York Form IT-112-R',
  CA: 'California Schedule S',
};

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export function determineMultiState(
  assertions: FactAssertion[],
  taxYear: number,
  ctx: MultiStateContext,
): MultiStateDetermination {
  const set = factSet(assertions, taxYear);
  const consumed: FactId[] = [];
  const notes: string[] = [];
  const missing: FactId[] = [];

  const read = <T>(id: FactId, kind: 'number' | 'string' | 'date'): T | null => {
    if (!consumed.includes(id)) consumed.push(id);
    const s = factState(set, id);
    return s.status === 'known' && s.value.kind === kind ? (s.value.value as T) : null;
  };

  const finish = (
    partial: Partial<MultiStateDetermination> & { status: MultiStateStatus },
  ): MultiStateDetermination => ({
    shape: null,
    windows: null,
    allocation: null,
    credit: null,
    missingFacts: [],
    refusals: [],
    explanation: {
      ruleId: 'multi-state/allocation-and-credit',
      citation: CITE,
      steps: [
        { label: 'Tax year', value: taxYear },
        { label: 'Status', value: partial.status },
      ],
      notes,
    },
    consumed,
    ...partial,
  });

  const moveDate = read<string>('state-move-date', 'date');
  const priorState = read<string>('prior-state-of-residence', 'string');
  const active = ctx.slices.filter((s) => s.income > 0 || s.tax > 0);

  // ── Nothing multi-state about this year ──
  if (active.length < 2 && moveDate === null) {
    return finish({ status: 'single-state' });
  }

  // ── The refusals, before any arithmetic ──
  if (ctx.statutoryResidencyDetected) {
    return finish({
      status: 'refused',
      refusals: [
        "This year may be a resident year in two states at once (New York's statutory-residency test). A credit for taxes paid does not resolve that — each state can claim the whole year, and the relief between them is negotiated rather than computed. Named and handed over, not approximated.",
      ],
    });
  }

  const distinctStates = new Set<string>([
    ...active.map((s) => s.code as string),
    ...(priorState !== null ? [priorState] : []),
  ]);
  if (distinctStates.size > 2) {
    return finish({
      status: 'refused',
      refusals: [
        `This year touches ${distinctStates.size} states (${[...distinctStates].sort().join(', ')}). Basis computes state pairs; three or more means allocation across several returns with credits running in more than one direction, which is genuinely a preparer's job. Every state's own numbers above are still computed and correct.`,
      ],
    });
  }

  const unmodelled = [...distinctStates].filter((s) => !['CA', 'NY', 'MA'].includes(s));
  if (unmodelled.length > 0) {
    return finish({
      status: 'refused',
      refusals: [
        `${unmodelled.join(' and ')} isn't modelled — Basis covers California, New York and Massachusetts, and a credit computed against a state whose own tax it cannot compute would be a guess with a dollar sign on it.`,
      ],
    });
  }

  // ── Part-year: the timeline and the allocation ──
  let windows: ResidencyWindow[] | null = null;
  let allocation: MultiStateDetermination['allocation'] = null;
  const residentSlice = active.find((s) => s.resident) ?? null;

  if (moveDate !== null && priorState !== null) {
    const yearStart = `${taxYear}-01-01`;
    const yearEnd = `${taxYear}-12-31`;
    const newState = residentSlice?.code ?? '';
    windows = [
      { state: priorState, from: yearStart, to: moveDate },
      { state: newState, from: moveDate, to: yearEnd },
    ];

    const priorDays = daysBetween(yearStart, moveDate);
    const totalDays = daysBetween(yearStart, yearEnd) || 365;
    const asserted = read<number>('wages-earned-in-prior-state', 'number');
    let wagesPrior: number;
    let basis: 'paystub' | 'day-count';
    if (asserted !== null) {
      wagesPrior = Math.min(asserted, ctx.wages);
      basis = 'paystub';
    } else {
      wagesPrior = Math.round((ctx.wages * priorDays) / totalDays);
      basis = 'day-count';
      missing.push('wages-earned-in-prior-state');
      notes.push(
        `Wages are split by calendar days here — ${priorDays} of ${totalDays} before the move — because no paystub figure is on file. That is an ESTIMATE: pay is rarely earned evenly, and a paystub from around ${moveDate} would make the split exact. If the two states tax at different rates, the difference between the estimate and the real split is real money.`,
      );
    }
    const wagesNew = Math.max(0, ctx.wages - wagesPrior);

    // Capital gains allocate by the date of each sale, which is exactly
    // what the lot engine has been recording since P4.
    let capitalGains: { priorState: number; newState: number } | null = null;
    if (ctx.sales.length > 0) {
      let before = 0;
      let after = 0;
      for (const sale of ctx.sales) {
        if (sale.saleDate < moveDate) before += sale.gain;
        else after += sale.gain;
      }
      capitalGains = { priorState: before, newState: after };
      notes.push(
        `Investment sales belong to whichever state you lived in on the day you sold — $${Math.round(before)} to ${priorState}, $${Math.round(after)} to ${newState}. No estimate needed: every sale carries its own date.`,
      );
    }

    allocation = { wages: { priorState: wagesPrior, newState: wagesNew, basis }, capitalGains };
    notes.push(
      `Moving on ${moveDate} means two part-year returns, not one — each state taxes the part of the year you lived there, and neither gets the whole thing.`,
    );
  }

  // ── The credit for taxes paid ──
  // The receiving state is where you live; the source state is the one
  // that taxed income earned inside it. Only a resident state gives it.
  let credit: CreditForTaxesPaid | null = null;
  const sourceSlice = active.find((s) => !s.resident && s.tax > 0) ?? null;

  if (residentSlice !== null && sourceSlice !== null) {
    const doublyTaxedIncome = Math.min(sourceSlice.income, residentSlice.income);
    const receivingStateCap =
      residentSlice.income > 0 ? residentSlice.tax * (doublyTaxedIncome / residentSlice.income) : 0;
    // California alone caps on the source side too (Schedule S).
    const sourceStateCap =
      residentSlice.code === 'CA' && sourceSlice.income > 0
        ? sourceSlice.tax * (doublyTaxedIncome / sourceSlice.income)
        : null;

    const candidates: Array<{ value: number; by: CreditForTaxesPaid['boundBy'] }> = [
      { value: sourceSlice.tax, by: 'source-tax' },
      { value: receivingStateCap, by: 'receiving-state-cap' },
    ];
    if (sourceStateCap !== null) candidates.push({ value: sourceStateCap, by: 'source-state-cap' });
    const winner = candidates.reduce((a, b) => (b.value < a.value ? b : a));

    credit = {
      receivingState: residentSlice.code,
      sourceState: sourceSlice.code,
      form: FORM_BY_STATE[residentSlice.code],
      doublyTaxedIncome,
      taxDueToSource: sourceSlice.tax,
      receivingStateCap,
      sourceStateCap,
      credit: Math.max(0, winner.value),
      boundBy: winner.by,
    };

    notes.push(
      `${sourceSlice.code} and ${residentSlice.code} are both taxing the same $${Math.round(doublyTaxedIncome)}. ${residentSlice.code} gives a credit for the ${sourceSlice.code} tax on ${credit.form} — $${Math.round(credit.credit)} here — which is what stops the same dollar being taxed twice. Without claiming it you would pay both bills in full.`,
    );
    if (winner.by !== 'source-tax') {
      notes.push(
        `The credit is capped: ${residentSlice.code} will not refund more than its own tax on that income, so $${Math.round(sourceSlice.tax - credit.credit)} of the ${sourceSlice.code} tax gets no relief. That gap is the real cost of the arrangement, and it is not a mistake — it is how the credit is written.`,
      );
    }
    if (residentSlice.code === 'MA') {
      notes.push(
        'Massachusetts computes this on the tax DUE to the other state, not the tax withheld from your paychecks — using the withholding figure is the most common way this credit comes out wrong.',
      );
    }
  }

  if (credit === null && windows === null) {
    return finish({ status: 'single-state' });
  }

  return finish({
    status: 'computed',
    shape: windows !== null ? 'part-year' : 'resident-plus-source',
    windows,
    allocation,
    credit,
    missingFacts: missing,
  });
}
