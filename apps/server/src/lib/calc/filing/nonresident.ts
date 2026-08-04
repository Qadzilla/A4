// ─── E1 · The 1040-NR return shape ─────────────────────────────────
// The other return. For a nonresident most of this engine changes
// polarity — and every mainstream free tool simply doesn't file the
// 1040-NR, which is why P3 needs Basis at all.
//
// Authority: Form 1040-NR instructions; Pub 519. ECI/FDAP sourcing at
// the depth the personas need, no deeper (the fence).
//
// What flips, each with its why (a nonresident Googling "American
// Opportunity Credit" deserves the real answer, not a missing button):
//  - NO standard deduction. Wages are taxed from the first dollar; the
//    one general exception is the India treaty's Article 21(2), which
//    E3 applies by citation — named here, never assumed.
//  - Education credits and the saver's credit are closed to nonresident
//    returns by statute. Explained, not hidden.
//  - Filing shapes: single or married-filing-separately only. No head
//    of household, no joint return — the §6013(g)/(h) elections that
//    can treat a spouse as resident exist and are REFUSED by name
//    (they change the whole year's tax law and belong to a preparer).
//  - Dependents: off, except narrow treaty cases (Canada, Mexico,
//    India, South Korea) — named, refused, not modelled.
//  - Wages and taxable scholarship are ECI, taxed at the same graduated
//    rates as a resident's — the brackets survive the flip.
//  - US bank interest is EXEMPT deposit interest (IRC §871(i)) — the
//    pleasant finding: the savings-account interest isn't US-taxable
//    at all, and it comes OUT of the return.
//  - State income tax withheld is an itemized deduction on the 1040-NR
//    — the one deduction that actually matters here.
//
// The fence, complete: no FDAP classification beyond the named streams
// (dividends, gains, and every C5 stream refuse by name rather than
// guess a withholding regime), no elections, no treaty logic (E3's).
// Dual-status is E5's brief and never reaches this module. And the
// cruel case runs the other way: an F-1 in year six is a RESIDENT —
// the flip belongs to A2, and this module trusts it by never checking
// residency itself.

import { type FactAssertion, type FactId, factSet, factState } from './facts';
import type { RuleTrace } from './trace';

export type NonresidentStatus = 'computed' | 'refused';

export interface NonresidentDetermination {
  status: NonresidentStatus;
  /** The 1040-NR's only two shapes. */
  filingStatus: 'single' | 'mfs';
  /** Effectively-connected income, taxed at the graduated rates. */
  eci: { wages: number; taxableScholarship: number };
  /** §871(i) deposit interest — excluded from US tax entirely. */
  exemptInterest: number;
  /** State income tax withheld — the itemized deduction that matters. */
  itemizedStateTax: number;
  /** W-2 box 2 plus the 1042-S's withholding on the scholarship. */
  federalWithheld: number;
  /** Income streams E1 names and refuses to classify. */
  outOfScope: FactId[];
  refusals: string[];
  explanation: RuleTrace;
  consumed: FactId[];
}

const CITE = 'Form 1040-NR instructions; Pub 519; IRC §871(i) (exempt deposit interest)';

/** The streams whose FDAP/ECI classification is beyond E1 — each refuses by name. */
const OUT_OF_SCOPE_STREAMS: Array<{ id: FactId; why: string }> = [
  {
    id: 'dividends-ordinary',
    why: 'US dividends are FDAP income with a treaty-rate withholding regime',
  },
  {
    id: 'realized-long-gains',
    why: 'capital gains for a nonresident turn on presence days and source rules',
  },
  {
    id: 'realized-short-gains',
    why: 'capital gains for a nonresident turn on presence days and source rules',
  },
  {
    id: 'crypto-proceeds',
    why: 'digital-asset sourcing for a nonresident is unsettled classification work',
  },
  {
    id: 'contract-income',
    why: 'self-employment as a nonresident raises work-authorization and ECI questions',
  },
  {
    id: 'platform-income',
    why: 'self-employment as a nonresident raises work-authorization and ECI questions',
  },
  {
    id: 'unemployment-income',
    why: 'US unemployment compensation for a nonresident is FDAP-classified',
  },
  {
    id: 'gambling-winnings',
    why: 'nonresident gambling winnings carry a 30% flat regime with treaty carve-outs',
  },
  {
    id: 'retirement-distribution',
    why: 'a nonresident retirement distribution mixes ECI and FDAP treatment',
  },
];

export function determineNonresidentReturn(
  assertions: FactAssertion[],
  taxYear: number,
): NonresidentDetermination {
  const set = factSet(assertions, taxYear);
  const consumed: FactId[] = [];
  const notes: string[] = [];

  const num = (id: FactId): number | null => {
    if (!consumed.includes(id)) consumed.push(id);
    const s = factState(set, id);
    return s.status === 'known' && s.value.kind === 'number' ? s.value.value : null;
  };
  const bool = (id: FactId): boolean | null => {
    if (!consumed.includes(id)) consumed.push(id);
    const s = factState(set, id);
    return s.status === 'known' && s.value.kind === 'bool' ? s.value.value : null;
  };

  const finish = (
    partial: Partial<NonresidentDetermination> & { status: NonresidentStatus },
  ): NonresidentDetermination => ({
    filingStatus: 'single',
    eci: { wages: 0, taxableScholarship: 0 },
    exemptInterest: 0,
    itemizedStateTax: 0,
    federalWithheld: 0,
    outOfScope: [],
    refusals: [],
    explanation: {
      ruleId: 'nonresident/1040-nr',
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

  // ── The elections and the shapes ──
  if (bool('filing-jointly') === true) {
    return finish({
      status: 'refused',
      refusals: [
        'A nonresident cannot file a joint return unless the §6013(g)/(h) election treats the spouse as a US resident for the whole year — an election that changes which tax law applies to every dollar, carries multi-year consequences, and belongs with a preparer. Basis names it and computes nothing on top of a guess.',
      ],
    });
  }

  const married = bool('married');
  if (married === null) {
    return finish({
      status: 'refused',
      refusals: [
        'Whether the year is married or single decides which 1040-NR shape applies (single or married-filing-separately — a nonresident has no other), and it is unresolved.',
      ],
    });
  }
  const filingStatus: 'single' | 'mfs' = married ? 'mfs' : 'single';
  if (married) {
    notes.push(
      'Married nonresidents file separately — the joint shapes need the §6013 election Basis refuses. The MFS column of the same rate table applies.',
    );
  }

  // ── The streams E1 refuses to classify, by name ──
  const outOfScope: FactId[] = [];
  const refusals: string[] = [];
  for (const stream of OUT_OF_SCOPE_STREAMS) {
    const v = num(stream.id);
    if (v !== null && v !== 0) {
      outOfScope.push(stream.id);
      refusals.push(
        `This nonresident year has ${stream.id} on file, and ${stream.why} — classification E1 does not attempt. The return needs a preparer or a later slice; nothing here is guessed.`,
      );
    }
  }
  if (bool('marketplace-health-insurance') === true) {
    outOfScope.push('marketplace-health-insurance');
    refusals.push(
      'Marketplace coverage on a nonresident year: the premium tax credit generally requires resident status, and the reconciliation rules differ — a preparer question, named rather than mis-computed.',
    );
  }
  if (outOfScope.length > 0) {
    return finish({ status: 'refused', filingStatus, outOfScope, refusals });
  }

  // ── The return that remains: ECI at graduated rates ──
  const wages = num('w2-wages') ?? 0;
  const taxableScholarship = num('taxable-scholarship-income') ?? 0;
  if (taxableScholarship > 0) {
    notes.push(
      `$${taxableScholarship} of scholarship above tuition is effectively-connected income for a nonresident student — same graduated rates as wages, but with no standard deduction in front of it (the India treaty is the one general exception, applied at E3 by citation).`,
    );
  }

  const interest = num('interest-income') ?? 0;
  const exemptInterest = interest > 0 ? interest : 0;
  if (exemptInterest > 0) {
    notes.push(
      `The pleasant finding: $${exemptInterest} of US bank interest is EXEMPT deposit interest for a nonresident (IRC §871(i)) — not US-taxable at all. It comes out of the return entirely.`,
    );
  }

  const itemizedStateTax = num('w2-state-tax-withheld') ?? 0;
  if (itemizedStateTax > 0) {
    notes.push(
      `$${itemizedStateTax} of state income tax withheld itemizes on the 1040-NR — the one deduction that matters on this return, since the standard deduction does not exist for it.`,
    );
  } else {
    notes.push(
      'No standard deduction exists on a 1040-NR: the income is taxed from the first dollar. State tax withheld (when it exists) itemizes; the India treaty standard deduction is E3, by citation.',
    );
  }

  notes.push(
    'Education credits and the saver’s credit are closed to nonresident returns by statute — the real answer to the search result, not a missing button. Dependents are off too, outside narrow treaty cases (Canada, Mexico, India, South Korea) Basis names and does not model.',
  );

  const federalWithheld =
    (num('w2-federal-withheld') ?? 0) + (num('scholarship-federal-withheld') ?? 0);

  return finish({
    status: 'computed',
    filingStatus,
    eci: { wages, taxableScholarship },
    exemptInterest,
    itemizedStateTax,
    federalWithheld,
  });
}
