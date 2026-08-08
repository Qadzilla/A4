// ─── F3 · Massachusetts (Form 1) ───────────────────────────────────
// B1's rate table turned into a real return — and three low-income
// mercies this product's audience qualifies for constantly and almost
// never claims.
//
// Authority: mass.gov rate, exemption and NTS/LIC pages; the Form 1
// Line 29 worksheet for the LIC cap. Figures live in ma-data.ts.
//
// MASSACHUSETTS DOES NOT HAVE ONE RATE. It has income classes:
//   Part A — interest and dividends at 5%, SHORT-TERM gains at 8.5%
//   Part B — wages and most ordinary income at 5%
//   Part C — long-term gains at 5%
// The 8.5% is the one that matters here: for most people this age it is
// a higher rate than their federal bracket, so a short-term sale can
// cost more in Massachusetts than it does federally.
//
// THE MERCIES, which are the point of the slice:
//   No Tax Status  — under the floor, Massachusetts tax is zero. Not
//                    reduced: zero. Students hit this constantly and
//                    file anyway, because filing is how the withholding
//                    comes back.
//   Limited Income Credit — just over the floor, the tax is capped at
//                    10% of the amount by which income exceeds it.
//   Rental deduction — half the rent paid, up to $4,000 off Part B.
//   Undergraduate student-loan interest — deductible in full, no
//                    phaseout, and it stacks with the federal deduction
//                    that phases this audience out.
//
// LOSSES: Massachusetts nets them in its own statutory order, and it is
// not the intuitive one. See ma-loss-netting.ts, which reads that order
// out of M.G.L. c. 62 § 2(c) rather than out of the form instructions
// mass.gov would not serve. F3 shipped refusing losses; the refusal is
// retired here, and the fixture that pinned it is kept as the record.

import { type FactAssertion, type FactId, factSet, factState } from '../facts';
import type { FilingStatus } from '../filing-status';
import type { RuleTrace } from '../trace';
import { massachusettsData } from './ma-data';
import { type MaNetting, netMassachusettsGains } from './ma-loss-netting';

export type MassachusettsStatus = 'computed' | 'refused' | 'not-applicable';

export interface MassachusettsDetermination {
  stateCode: 'MA';
  status: MassachusettsStatus;
  /** Wages and ordinary income, after exemption and deductions. */
  partBTaxable: number;
  interestDividends: number;
  shortTermGains: number;
  longTermGains: number;
  personalExemption: number;
  rentalDeduction: number;
  studentLoanDeduction: number;
  massachusettsAgi: number;
  /** Before the two mercies are applied. */
  taxBeforeMercies: number;
  noTaxStatus: boolean;
  limitedIncomeCredit: number;
  /** What Massachusetts actually charges. */
  totalMassachusettsTax: number;
  /** How the year's gains and losses netted, in the statute's order. */
  netting: MaNetting | null;
  missingFacts: FactId[];
  refusals: string[];
  explanation: RuleTrace;
  consumed: FactId[];
}

export interface MassachusettsContext {
  filingStatus: FilingStatus;
  stateOfResidence: string | null;
  /** D4's net profit, which is Part B income like wages. */
  seNetProfit: number;
}

const CITE =
  'mass.gov tax rates, personal exemptions, and No Tax Status / Limited Income Credit pages; Form 1 Line 29 worksheet';

export function determineMassachusetts(
  assertions: FactAssertion[],
  taxYear: number,
  ctx: MassachusettsContext,
): MassachusettsDetermination {
  const set = factSet(assertions, taxYear);
  const consumed: FactId[] = [];
  const notes: string[] = [];
  const missing: FactId[] = [];

  const num = (id: FactId): number | null => {
    if (!consumed.includes(id)) consumed.push(id);
    const s = factState(set, id);
    return s.status === 'known' && s.value.kind === 'number' ? s.value.value : null;
  };

  const finish = (
    partial: Partial<MassachusettsDetermination> & { status: MassachusettsStatus },
  ): MassachusettsDetermination => ({
    stateCode: 'MA',
    partBTaxable: 0,
    interestDividends: 0,
    shortTermGains: 0,
    longTermGains: 0,
    netting: null,
    personalExemption: 0,
    rentalDeduction: 0,
    studentLoanDeduction: 0,
    massachusettsAgi: 0,
    taxBeforeMercies: 0,
    noTaxStatus: false,
    limitedIncomeCredit: 0,
    totalMassachusettsTax: 0,
    missingFacts: [],
    refusals: [],
    explanation: {
      ruleId: 'state/ma-form1',
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

  if (ctx.stateOfResidence !== 'MA') {
    return finish({ status: 'not-applicable' });
  }

  const year = massachusettsData(taxYear);
  if (year === null) {
    return finish({
      status: 'refused',
      refusals: [
        `Massachusetts figures for ${taxYear} aren't verified — the exemption, No Tax Status and Limited Income Credit amounts are set annually and only the confirmed year is loaded. Nothing here is carried forward on the assumption it didn't change.`,
      ],
    });
  }

  // ── The classes ──
  const wages = num('w2-wages') ?? 0;
  const interest = num('interest-income') ?? 0;
  const dividends = num('dividends-ordinary') ?? 0;
  const shortTermGains = num('realized-short-gains') ?? 0;
  const longTermGains = num('realized-long-gains') ?? 0;
  const unemployment = num('unemployment-income') ?? 0;

  // ── Losses: netted in the statute's own order (§ 2(c)) ──
  // F3 refused this rather than guess the ordering, and refusing was
  // right — the guess in that refusal's own wording turned out to have
  // the sequence backwards. The statute settles it; see ma-loss-netting.
  const netting = netMassachusettsGains({
    shortTerm: shortTermGains,
    longTerm: longTermGains,
    interestAndDividends: interest + dividends,
  });
  const netShortTerm = netting.taxableShortTermGain;
  const netLongTerm = netting.taxableLongTermGain;
  notes.push(...netting.notes);
  if (netting.appliedAgainstInterest > 0) {
    notes.push(
      `$${Math.round(netting.appliedAgainstInterest)} of capital loss came off your interest and dividends before Massachusetts taxed them.`,
    );
  }

  const partBIncome = wages + ctx.seNetProfit + unemployment;
  const interestDividends = netting.taxableInterestAndDividends;
  const grossMaIncome = partBIncome + interestDividends + netShortTerm + netLongTerm;

  if (grossMaIncome > year.surtaxRefusalFloor) {
    return finish({
      status: 'refused',
      refusals: [
        `Massachusetts income above $${year.surtaxRefusalFloor.toLocaleString('en-US')} runs into the 4% surtax, whose threshold is indexed annually and isn't loaded here. Computing without it would understate the bill, so this one needs the current figure or a preparer.`,
      ],
    });
  }

  // ── Deductions (Schedule Y) and the exemption ──
  const rentPaid = num('rent-paid-massachusetts');
  let rentalDeduction = 0;
  if (rentPaid === null) {
    missing.push('rent-paid-massachusetts');
    notes.push(
      `Massachusetts lets renters deduct half the rent they paid, up to $${year.rentalDeduction.cap} — worth about $${Math.round(year.rentalDeduction.cap * year.partBRate)} of tax at the state's 5% rate. Whether you rent isn't on file, and it is worth asking.`,
    );
  } else {
    rentalDeduction = Math.min(rentPaid * year.rentalDeduction.sharePct, year.rentalDeduction.cap);
    if (rentalDeduction > 0) {
      notes.push(
        `Half your rent deducts in Massachusetts — $${Math.round(rentalDeduction)} off the taxable income here, capped at $${year.rentalDeduction.cap}.`,
      );
    }
  }

  const studentLoanDeduction = num('student-loan-interest-paid') ?? 0;
  if (studentLoanDeduction > 0) {
    notes.push(
      `Massachusetts deducts undergraduate student-loan interest in FULL — no phaseout, no $2,500 ceiling, and it works even where the federal deduction has phased you out. $${Math.round(studentLoanDeduction)} comes off here.`,
    );
  }

  const statusKey = ctx.filingStatus === 'qss' ? 'mfj' : ctx.filingStatus;
  const personalExemption = year.personalExemption[statusKey];
  const partBTaxable = Math.max(
    0,
    partBIncome - personalExemption - rentalDeduction - studentLoanDeduction,
  );

  const taxBeforeMercies =
    partBTaxable * year.partBRate +
    interestDividends * year.interestDividendRate +
    netShortTerm * year.shortTermRate +
    netLongTerm * year.longTermRate;

  if (netShortTerm > 0) {
    notes.push(
      `Massachusetts taxes short-term gains at ${year.shortTermRate * 100}% — higher than the 5% it charges on wages, and usually higher than your federal bracket at this income. $${Math.round(netShortTerm * year.shortTermRate)} of state tax on this year's short-term sales.`,
    );
  }

  // ── The mercies. MA AGI here is gross income less the Schedule Y
  // deductions; the exemption is not one of them. ──
  const massachusettsAgi = Math.max(0, grossMaIncome - studentLoanDeduction);
  const mfsExcluded = ctx.filingStatus === 'mfs';
  const ntsLimit =
    statusKey === 'single'
      ? year.noTaxStatus.single
      : year.noTaxStatus[statusKey === 'hoh' ? 'hoh' : 'mfj'];
  const licLimit =
    statusKey === 'single'
      ? year.limitedIncomeCredit.single
      : year.limitedIncomeCredit[statusKey === 'hoh' ? 'hoh' : 'mfj'];

  let noTaxStatus = false;
  let limitedIncomeCredit = 0;
  let totalMassachusettsTax = taxBeforeMercies;

  if (mfsExcluded) {
    notes.push(
      'Married filing separately qualifies for neither No Tax Status nor the Limited Income Credit — one of the real prices of that election, and it belongs in the comparison.',
    );
  } else if (massachusettsAgi <= ntsLimit) {
    noTaxStatus = true;
    totalMassachusettsTax = 0;
    notes.push(
      `Your Massachusetts income is under the state's floor of $${ntsLimit.toLocaleString('en-US')} — you owe Massachusetts nothing at all. Not reduced: zero. File anyway, because filing is how the tax already withheld from your paychecks comes back.`,
    );
  } else if (massachusettsAgi < licLimit) {
    const cap = (massachusettsAgi - ntsLimit) * year.limitedIncomeCreditRate;
    if (cap < taxBeforeMercies) {
      limitedIncomeCredit = taxBeforeMercies - cap;
      totalMassachusettsTax = cap;
      notes.push(
        `Just over the No Tax Status floor, Massachusetts caps the tax at ${year.limitedIncomeCreditRate * 100}% of the amount above it — the Limited Income Credit takes $${Math.round(limitedIncomeCredit)} off, leaving $${Math.round(cap)}.`,
      );
    }
  }

  return finish({
    status: 'computed',
    partBTaxable,
    interestDividends,
    shortTermGains: netShortTerm,
    longTermGains: netLongTerm,
    netting,
    personalExemption,
    rentalDeduction,
    studentLoanDeduction,
    massachusettsAgi,
    taxBeforeMercies,
    noTaxStatus,
    limitedIncomeCredit,
    totalMassachusettsTax,
    missingFacts: missing,
  });
}
