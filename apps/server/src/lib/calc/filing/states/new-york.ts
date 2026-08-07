// ─── F2 · New York (IT-201 / IT-203) ───────────────────────────────
// One state, three taxes, and the rule that generates more surprise
// bills for remote workers than anything else in state taxation.
//
// Authority: 2025 IT-201-I instructions (brackets, NYC brackets,
// household credits, NYC school tax credit, Yonkers surcharge);
// TSB-M-06(5)I (convenience of the employer); Form Y-203-I (Yonkers
// nonresident earnings tax, 0.5%); Form IT-272-I (college tuition
// credit). Figures live in ny-data.ts with their sources named.
//
// THE CONVENIENCE RULE, which is the reason this module exists:
// New York taxes wages earned for a New York employer even on days the
// person was physically somewhere else — unless working elsewhere was
// the EMPLOYER's necessity rather than the employee's convenience. The
// escape is narrow and factual (a bona fide employer office at the
// remote location, essentially), and it is litigated constantly.
//
// So v1 computes the conservative answer — all wages NY-source — and
// says plainly that it is the conservative answer, that the rule is
// contested, and that contesting it is preparer territory. It never
// launders a position choice into a default in either direction: a
// person who asserts employer-necessity does not get a quietly reduced
// bill, they get a named refusal pointing at a preparer, because that
// assertion is a filing position and not an arithmetic input.
//
// The other two taxes: New York City charges residents a second income
// tax (living in Queens costs money that living in Hoboken does not),
// and Yonkers charges residents a surcharge on the state tax and
// nonresidents 0.5% on wages earned inside the city.
//
// Fences: no dual-resident relief computation (statutory residency is
// detected, explained and refused — F4's), no recapture above
// $107,650 (ny-data explains why), no audit-position advice.

import type { TaxBracket } from '../../tax-data';
import { type FactAssertion, type FactId, factSet, factState } from '../facts';
import type { FilingStatus } from '../filing-status';
import type { ResidencyStatus } from '../residency';
import type { RuleTrace } from '../trace';
import { newYorkData } from './ny-data';

export type NewYorkStatus = 'computed' | 'refused' | 'not-applicable';

export interface NewYorkDetermination {
  stateCode: 'NY';
  status: NewYorkStatus;
  /** Full-year resident, or a nonresident reached by the convenience rule. */
  basis: 'resident' | 'nonresident-convenience' | null;
  nyAgi: number;
  /** Wages New York claims, which for a NY employer is all of them. */
  nySourceWages: number;
  standardDeduction: number;
  taxableIncome: number;
  stateTaxBeforeCredits: number;
  householdCredit: number;
  /** State tax after its own credits — the base for the Yonkers surcharge. */
  stateTax: number;
  nycTax: number;
  nycSchoolTaxCredit: number;
  nycHouseholdCredit: number;
  yonkersResidentSurcharge: number;
  yonkersNonresidentTax: number;
  /** IT-272 — eligibility computed, amount left to the form's worksheet. */
  collegeTuitionCredit: { eligible: boolean | 'unknown'; maxCredit: number; reason: string };
  /** Everything New York charges, all three taxes together. */
  totalNewYorkTax: number;
  /** 183 days + a place to live makes a resident, however domiciled. */
  statutoryResidencyDetected: boolean;
  missingFacts: FactId[];
  refusals: string[];
  explanation: RuleTrace;
  consumed: FactId[];
}

export interface NewYorkContext {
  federalAgi: number;
  filingStatus: FilingStatus;
  canBeClaimed: 'yes' | 'no' | 'unknown';
  residencyStatus: ResidencyStatus;
  stateOfResidence: string | null;
  wages: number;
}

const CITE =
  '2025 IT-201-I instructions; TSB-M-06(5)I (convenience of the employer); Form Y-203-I; Form IT-272-I';

function applyBrackets(income: number, brackets: TaxBracket[]): number {
  let tax = 0;
  for (const b of brackets) {
    if (income <= b.min) break;
    tax += (Math.min(income, b.max) - b.min) * b.rate;
  }
  return tax;
}

function tableCredit(agi: number, table: Array<{ upTo: number; credit: number }>): number {
  for (const row of table) {
    if (agi <= row.upTo) return row.credit;
  }
  return 0;
}

export function determineNewYork(
  assertions: FactAssertion[],
  taxYear: number,
  ctx: NewYorkContext,
): NewYorkDetermination {
  const set = factSet(assertions, taxYear);
  const consumed: FactId[] = [];
  const notes: string[] = [];
  const missing: FactId[] = [];
  const refusals: string[] = [];

  const num = (id: FactId): number | null => {
    if (!consumed.includes(id)) consumed.push(id);
    const s = factState(set, id);
    return s.status === 'known' && s.value.kind === 'number' ? s.value.value : null;
  };
  const str = (id: FactId): string | null => {
    if (!consumed.includes(id)) consumed.push(id);
    const s = factState(set, id);
    return s.status === 'known' && s.value.kind === 'string' ? s.value.value : null;
  };
  const boolFact = (id: FactId): boolean | null => {
    if (!consumed.includes(id)) consumed.push(id);
    const s = factState(set, id);
    return s.status === 'known' && s.value.kind === 'bool' ? s.value.value : null;
  };

  const finish = (
    partial: Partial<NewYorkDetermination> & { status: NewYorkStatus },
  ): NewYorkDetermination => ({
    stateCode: 'NY',
    basis: null,
    nyAgi: 0,
    nySourceWages: 0,
    standardDeduction: 0,
    taxableIncome: 0,
    stateTaxBeforeCredits: 0,
    householdCredit: 0,
    stateTax: 0,
    nycTax: 0,
    nycSchoolTaxCredit: 0,
    nycHouseholdCredit: 0,
    yonkersResidentSurcharge: 0,
    yonkersNonresidentTax: 0,
    collegeTuitionCredit: { eligible: 'unknown', maxCredit: 0, reason: '' },
    totalNewYorkTax: 0,
    statutoryResidencyDetected: false,
    missingFacts: [],
    refusals: [],
    explanation: {
      ruleId: 'state/ny-it201',
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

  const resident = ctx.stateOfResidence === 'NY';
  const employerNY = str('employer-state') === 'NY';

  // ── Does New York reach this year at all? ──
  // Two ways in: living there, or working for a New York employer from
  // somewhere else — which is the whole point of the convenience rule.
  if (!resident && !employerNY) {
    return finish({ status: 'not-applicable' });
  }

  const year = newYorkData(taxYear);
  if (year === null) {
    return finish({
      status: 'refused',
      refusals: [
        `New York's ${taxYear} figures aren't loaded — the brackets, deductions and credit limits are indexed annually and this year's are not on file. Nothing here is guessed.`,
      ],
    });
  }

  // ── Statutory residency: detected, explained, refused (F4 owns it) ──
  const daysNY = num('days-present-ny');
  const abode = boolFact('ny-permanent-abode');
  const statutoryResidencyDetected = !resident && daysNY !== null && daysNY > 183 && abode === true;
  if (statutoryResidencyDetected) {
    return finish({
      status: 'refused',
      statutoryResidencyDetected: true,
      refusals: [
        `${daysNY} days in New York plus a place to live there available year-round makes someone a New York resident for tax purposes — a "statutory resident" — even while genuinely domiciled somewhere else. That means two states may both call this a resident year, and untangling it (the resident credit each state gives for the other's tax) is genuinely specialist work. Basis detects it and hands it over rather than computing one side and calling it the answer.`,
      ],
    });
  }

  // ── The convenience rule ──
  const basis: 'resident' | 'nonresident-convenience' = resident
    ? 'resident'
    : 'nonresident-convenience';
  const nySourceWages = ctx.wages;
  if (!resident && employerNY) {
    const necessity = boolFact('work-outside-employer-necessity');
    if (necessity === true) {
      return finish({
        status: 'refused',
        basis: 'nonresident-convenience',
        refusals: [
          "Working outside New York at the employer's own necessity — rather than for your own convenience — is the one escape from New York's convenience rule, and it is narrow, factual and heavily contested (TSB-M-06(5)I). Claiming it is a filing position, not an arithmetic input, so Basis will not quietly reduce the bill on the strength of one answer. A preparer takes this one: the conservative number is New York taxing all of these wages, and the contest is worth real money if the facts genuinely support it.",
        ],
      });
    }
    if (necessity === null) missing.push('work-outside-employer-necessity');
    notes.push(
      `You worked from ${ctx.stateOfResidence ?? 'another state'} for a New York employer. New York taxes those wages anyway — its "convenience of the employer" rule sources wages to the employer's office unless working elsewhere was the employer's own necessity, and it has worked this way for decades. All $${Math.round(ctx.wages)} of wages are treated as New York income here, which is the conservative reading. Your home state should credit you for the New York tax; that credit is what stops it being taxed twice.`,
    );
  }

  // ── NY AGI. The conformity set is short: 401(k) and student-loan
  // interest both conform, so federal AGI carries over unchanged. ──
  const nyAgi = resident ? ctx.federalAgi : nySourceWages;

  if (nyAgi > year.recaptureThreshold) {
    return finish({
      status: 'refused',
      basis,
      nyAgi,
      nySourceWages,
      refusals: [
        `New York income above $${year.recaptureThreshold} triggers New York's tax computation worksheets, which claw back the benefit of the lower brackets on a sliding scale. Running the plain rate schedule at this income would understate the bill, so Basis refuses rather than under-reporting. This one needs the worksheet or a preparer.`,
      ],
    });
  }

  const statusKey = ctx.filingStatus === 'qss' ? 'mfj' : ctx.filingStatus;
  const standardDeduction =
    ctx.canBeClaimed === 'yes'
      ? year.dependentStandardDeduction
      : year.standardDeduction[statusKey];
  const taxableIncome = Math.max(0, nyAgi - standardDeduction);
  const stateTaxBeforeCredits = applyBrackets(taxableIncome, year.brackets[statusKey]);

  // ── Household credit (single filers only — see ny-data) ──
  const householdCredit =
    ctx.canBeClaimed === 'yes' || ctx.filingStatus !== 'single'
      ? 0
      : tableCredit(ctx.federalAgi, year.householdCreditSingle);
  const stateTax = Math.max(0, stateTaxBeforeCredits - householdCredit);
  if (householdCredit > 0) {
    notes.push(
      `New York's household credit takes $${householdCredit} off the state tax at this income — nobody claims it on purpose; it just applies.`,
    );
  }

  // ── New York City: a second income tax for living in a borough ──
  const nycMonths = num('months-in-nyc') ?? 0;
  let nycTax = 0;
  let nycSchoolTaxCredit = 0;
  let nycHouseholdCredit = 0;
  if (nycMonths >= 12 && resident) {
    nycTax = applyBrackets(taxableIncome, year.nycBrackets[statusKey]);
    if (ctx.canBeClaimed !== 'yes' && ctx.federalAgi <= year.nycSchoolTaxCredit.incomeLimit) {
      nycSchoolTaxCredit =
        statusKey === 'mfj' ? year.nycSchoolTaxCredit.joint : year.nycSchoolTaxCredit.single;
    }
    if (ctx.canBeClaimed !== 'yes' && ctx.filingStatus === 'single') {
      nycHouseholdCredit = tableCredit(ctx.federalAgi, year.nycHouseholdCreditSingle);
    }
    nycTax = Math.max(0, nycTax - nycSchoolTaxCredit - nycHouseholdCredit);
    notes.push(
      `Living in New York City is a second income tax: $${Math.round(nycTax)} on top of the state's, on the same income. Moving across the river to New Jersey would end it — the city tax follows residence, not the job.`,
    );
  } else if (nycMonths > 0 && nycMonths < 12) {
    missing.push('months-in-nyc');
    notes.push(
      'Part of the year in New York City means a part-year city return (Form IT-360.1) that prorates the city tax — allocation work Basis leaves to F4 rather than approximating.',
    );
  }

  // ── Yonkers, both directions ──
  const yonkersMonths = num('months-in-yonkers') ?? 0;
  const yonkersWages = num('yonkers-wages') ?? 0;
  let yonkersResidentSurcharge = 0;
  let yonkersNonresidentTax = 0;
  if (yonkersMonths >= 12 && resident) {
    yonkersResidentSurcharge = stateTax * year.yonkersResidentSurchargeRate;
    notes.push(
      `Yonkers residents pay a surcharge of ${(year.yonkersResidentSurchargeRate * 100).toFixed(2)}% of the state tax — $${Math.round(yonkersResidentSurcharge)} here, purely for the address.`,
    );
  } else if (yonkersWages > 0) {
    if (yonkersWages <= year.yonkersNonresident.noFilingFloor) {
      notes.push(
        `Wages earned in Yonkers under $${year.yonkersNonresident.noFilingFloor} don't require the nonresident earnings return at all.`,
      );
    } else {
      yonkersNonresidentTax = yonkersWages * year.yonkersNonresident.rate;
      notes.push(
        `Working in Yonkers without living there carries a ${year.yonkersNonresident.rate * 100}% earnings tax on those wages — $${Math.round(yonkersNonresidentTax)} on Form Y-203.`,
      );
    }
  }

  // ── College tuition credit (IT-272): eligibility, not amount ──
  const tuition = num('qualified-tuition-paid') ?? 0;
  const tc = year.collegeTuitionCredit;
  let collegeTuitionCredit: NewYorkDetermination['collegeTuitionCredit'];
  if (tuition <= 0) {
    collegeTuitionCredit = { eligible: false, maxCredit: 0, reason: 'No college tuition on file.' };
  } else if (!resident) {
    collegeTuitionCredit = {
      eligible: false,
      maxCredit: 0,
      reason: 'The college tuition credit is for full-year New York residents only (IT-272).',
    };
  } else if (ctx.canBeClaimed === 'yes') {
    collegeTuitionCredit = {
      eligible: false,
      maxCredit: 0,
      reason:
        'Someone claimed as a dependent cannot take the credit — the person who claims them takes it instead.',
    };
  } else {
    collegeTuitionCredit = {
      eligible: true,
      maxCredit: tc.maxPerStudent,
      reason: `New York pays up to $${tc.maxPerStudent} per undergraduate student for tuition, and it is REFUNDABLE — it pays out even at zero tax. Expenses count up to $${tc.expenseCap}; the exact figure comes from Form IT-272's worksheet.`,
    };
    notes.push(collegeTuitionCredit.reason);
  }

  const totalNewYorkTax = stateTax + nycTax + yonkersResidentSurcharge + yonkersNonresidentTax;

  return finish({
    status: 'computed',
    basis,
    nyAgi,
    nySourceWages,
    standardDeduction,
    taxableIncome,
    stateTaxBeforeCredits,
    householdCredit,
    stateTax,
    nycTax,
    nycSchoolTaxCredit,
    nycHouseholdCredit,
    yonkersResidentSurcharge,
    yonkersNonresidentTax,
    collegeTuitionCredit,
    totalNewYorkTax,
    statutoryResidencyDetected: false,
    missingFacts: missing,
    refusals,
  });
}
