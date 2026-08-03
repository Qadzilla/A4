// ─── D6 · The early-withdrawal penalty (Form 5329) ─────────────────
// The 10% ambush on the job-change cashout — and the exception list nobody
// reads, with its cruel pocket asymmetry: higher education, the first home
// and unemployed health premiums kill the penalty for an IRA and do
// nothing for a 401(k); the age-55 separation rule runs the other way.
//
// Authority: Form 5329 instructions (exception codes verified 2026-08):
//   01 separation at 55+ — qualified plans only, never IRAs
//   03 total and permanent disability — both pockets
//   05 medical above 7.5% of AGI — both pockets
//   07 health premiums while unemployed 12+ weeks — IRA only
//   08 higher education — IRA only
//   09 first home, $10,000 lifetime — IRA only
//
// The standing rule, from the contract: exceptions are OPTIONS with the
// dollars, never auto-claimed — some require substantiation the person
// must actually have, so the penalty below is the gross 10% and every
// exception is priced beside it, not subtracted behind their back.
//
// Fences: no Roth ordering (a Roth distribution refuses by name — C5's
// named gap), no SEPP/72(t), nothing here nets or elects.

import { type FactAssertion, type FactId, type FactState, factSet, factState } from './facts';
import type { RuleTrace } from './trace';

export const PENALTY_RATE = 0.1;
/** Exception 09's lifetime cap, from the 5329 instructions. */
export const FIRST_HOME_CAP = 10_000;
/** Exception 05's AGI floor. */
export const MEDICAL_AGI_FLOOR = 0.075;

export type ExceptionPocket = 'ira' | 'employer' | 'both';

export type ExceptionStatus =
  | 'available' // the gating facts are on file — claimable, with the savings priced
  | 'missing-facts' // could apply; the named facts would decide it
  | 'wrong-pocket' // the money came from the pocket this exception doesn't cover
  | 'not-applicable'; // the gating fact is known and says no

export interface PenaltyException {
  /** 5329 exception code, for the trace and the form. */
  code: '01' | '03' | '05' | '07' | '08' | '09';
  id: string;
  label: string;
  pocket: ExceptionPocket;
  status: ExceptionStatus;
  /** What would decide it, when missing-facts. */
  factsNeeded: FactId[];
  /** 10% of what this exception would shelter — priced, never applied. */
  savings: number | null;
  /** The substantiation reality, in plain words. */
  requirement: string;
}

export interface PenaltyDetermination {
  applicable: boolean;
  /** The gross 10% on the early amount — before any exception is claimed. */
  penalty: number;
  /** The early amount the penalty runs on (Roth and rollovers excluded upstream). */
  base: number;
  /** IRA / employer split, when the facts can say. */
  pocket: { ira: number; employer: number } | null;
  exceptions: PenaltyException[];
  /** Named refusals: Roth ordering, unclassified codes. */
  refusals: string[];
  explanation: RuleTrace;
  consumed: FactId[];
}

const CITE = 'Form 5329 instructions — additional tax on early distributions, exception codes';

export function determinePenalty(
  assertions: FactAssertion[],
  taxYear: number,
  /** AGI from the evaluation — the medical exception's floor needs it. */
  agi: number | null,
): PenaltyDetermination {
  const set = factSet(assertions, taxYear);
  const consumed: FactId[] = [];
  const read = (id: FactId): FactState => {
    if (!consumed.includes(id)) consumed.push(id);
    return factState(set, id);
  };
  const num = (id: FactId): number | null => {
    const s = read(id);
    return s.status === 'known' && s.value.kind === 'number' ? s.value.value : null;
  };
  const boolFact = (id: FactId): boolean | null => {
    const s = read(id);
    return s.status === 'known' && s.value.kind === 'bool' ? s.value.value : null;
  };
  const unresolved = (id: FactId): boolean => {
    const s = factState(set, id);
    return s.status === 'unasserted' || s.status === 'unknown';
  };

  const notes: string[] = [];
  const refusals: string[] = [];

  const base = num('retirement-early-distribution') ?? 0;
  const roth = num('retirement-roth-distribution') ?? 0;
  const unclassified = num('retirement-distribution-unclassified') ?? 0;

  if (roth > 0) {
    refusals.push(
      `$${roth} came out of a Roth account. Roth money comes back contributions-first and those come out free — but the ordering rules aren't modelled yet, so Basis names the gap instead of over-penalising. No penalty is computed on it here.`,
    );
  }
  if (unclassified > 0) {
    refusals.push(
      `$${unclassified} of distributions carry a box 7 code Basis doesn't classify — their penalty treatment is undecided, not assumed.`,
    );
  }

  if (base <= 0) {
    return {
      applicable: false,
      penalty: 0,
      base: 0,
      pocket: null,
      exceptions: [],
      refusals,
      explanation: {
        ruleId: 'penalty/5329',
        citation: CITE,
        steps: [{ label: 'Early distributions', value: 0 }],
        notes: refusals.length > 0 ? [...refusals] : ['No early retirement money this year.'],
      },
      consumed,
    };
  }

  // ── The pocket: number fact from the documents, bool from the person ──
  const iraAmount = num('retirement-early-ira-amount');
  const fromIra = boolFact('early-distribution-from-ira');
  let pocket: { ira: number; employer: number } | null = null;
  if (iraAmount !== null) {
    pocket = { ira: Math.min(iraAmount, base), employer: Math.max(0, base - iraAmount) };
  } else if (fromIra === true) {
    pocket = { ira: base, employer: 0 };
  } else if (fromIra === false) {
    pocket = { ira: 0, employer: base };
  }
  const pocketFacts: FactId[] = ['early-distribution-from-ira'];

  const penalty = Math.round(PENALTY_RATE * base);

  // ── The exceptions, each an option with its price ──
  const exceptions: PenaltyException[] = [];

  /**
   * The shared shape: a pocket-restricted exception against an unknown
   * pocket is missing-facts (the asymmetry makes finding out worth real
   * money); against the wrong pocket it is the finding itself.
   */
  const pocketed = (
    restrictedTo: 'ira' | 'employer',
    build: (amountInPocket: number) => Omit<PenaltyException, 'pocket' | 'status'> & {
      status?: ExceptionStatus;
    },
  ): PenaltyException => {
    if (pocket === null) {
      const b = build(0);
      return {
        ...b,
        pocket: restrictedTo,
        status: 'missing-facts',
        factsNeeded: [...new Set([...pocketFacts, ...b.factsNeeded])],
        savings: null,
      };
    }
    const inPocket = restrictedTo === 'ira' ? pocket.ira : pocket.employer;
    if (inPocket <= 0) {
      const b = build(0);
      return { ...b, pocket: restrictedTo, status: 'wrong-pocket', savings: null };
    }
    const b = build(inPocket);
    return { ...b, pocket: restrictedTo, status: b.status ?? 'available' };
  };

  // 08 — higher education, IRA only. Tuition actually paid is the
  // conservative floor: the exception's definition also admits room and
  // board, which the intake can add later.
  const tuition = num('qualified-tuition-paid');
  exceptions.push(
    pocketed('ira', (inPocket) => {
      if (tuition === null) {
        return {
          code: '08',
          id: 'higher-education',
          label: 'Higher-education expenses',
          factsNeeded: ['qualified-tuition-paid'],
          savings: null,
          status: unresolved('qualified-tuition-paid') ? 'missing-facts' : 'not-applicable',
          requirement:
            'Education expenses paid in the same year the money came out — tuition counts for certain; room and board can too.',
        };
      }
      if (tuition <= 0) {
        return {
          code: '08',
          id: 'higher-education',
          label: 'Higher-education expenses',
          factsNeeded: [],
          savings: null,
          status: 'not-applicable',
          requirement: 'Education expenses paid in the same year the money came out.',
        };
      }
      return {
        code: '08',
        id: 'higher-education',
        label: 'Higher-education expenses',
        factsNeeded: [],
        savings: Math.round(PENALTY_RATE * Math.min(tuition, inPocket)),
        requirement:
          'Keep the tuition records — the exception covers education paid in the year of the withdrawal.',
      };
    }),
  );

  // 09 — first home, IRA only, $10,000 lifetime.
  const firstHome = boolFact('bought-first-home');
  exceptions.push(
    pocketed('ira', (inPocket) => ({
      code: '09',
      id: 'first-home',
      label: 'First-home purchase',
      factsNeeded: firstHome === null ? ['bought-first-home'] : [],
      savings:
        firstHome === true ? Math.round(PENALTY_RATE * Math.min(FIRST_HOME_CAP, inPocket)) : null,
      status:
        firstHome === true ? 'available' : firstHome === false ? 'not-applicable' : 'missing-facts',
      requirement: `Up to $${FIRST_HOME_CAP} lifetime, for buying a first home.`,
    })),
  );

  // 07 — health premiums while unemployed 12+ weeks, IRA only.
  const twelveWeeks = boolFact('unemployed-twelve-weeks');
  const premiums = num('health-premiums-paid-while-unemployed');
  exceptions.push(
    pocketed('ira', (inPocket) => {
      const needed: FactId[] = [];
      if (twelveWeeks === null) needed.push('unemployed-twelve-weeks');
      if (premiums === null) needed.push('health-premiums-paid-while-unemployed');
      if (twelveWeeks === false) {
        return {
          code: '07',
          id: 'unemployed-health-premiums',
          label: 'Health premiums while unemployed',
          factsNeeded: [],
          savings: null,
          status: 'not-applicable',
          requirement: 'Twelve straight weeks of unemployment compensation, then premiums paid.',
        };
      }
      if (needed.length > 0) {
        return {
          code: '07',
          id: 'unemployed-health-premiums',
          label: 'Health premiums while unemployed',
          factsNeeded: needed,
          savings: null,
          status: 'missing-facts',
          requirement: 'Twelve straight weeks of unemployment compensation, then premiums paid.',
        };
      }
      return {
        code: '07',
        id: 'unemployed-health-premiums',
        label: 'Health premiums while unemployed',
        factsNeeded: [],
        savings: Math.round(PENALTY_RATE * Math.min(premiums ?? 0, inPocket)),
        requirement: 'Twelve straight weeks of unemployment compensation, then premiums paid.',
      };
    }),
  );

  // 05 — medical above 7.5% of AGI, both pockets.
  const medical = num('medical-expenses-paid');
  exceptions.push(
    ((): PenaltyException => {
      const shared = {
        code: '05' as const,
        id: 'medical',
        label: 'Medical costs above 7.5% of income',
        pocket: 'both' as const,
        requirement:
          'Unreimbursed medical costs, but only the part above 7.5% of adjusted gross income.',
      };
      if (medical === null) {
        return {
          ...shared,
          status: unresolved('medical-expenses-paid') ? 'missing-facts' : 'not-applicable',
          factsNeeded: ['medical-expenses-paid'],
          savings: null,
        };
      }
      if (agi === null) {
        return {
          ...shared,
          status: 'missing-facts',
          factsNeeded: [],
          savings: null,
        };
      }
      const excess = Math.max(0, medical - MEDICAL_AGI_FLOOR * agi);
      if (excess <= 0)
        return { ...shared, status: 'not-applicable', factsNeeded: [], savings: null };
      return {
        ...shared,
        status: 'available',
        factsNeeded: [],
        savings: Math.round(PENALTY_RATE * Math.min(excess, base)),
      };
    })(),
  );

  // 03 — total and permanent disability, both pockets.
  const disabled = boolFact('permanently-disabled');
  exceptions.push({
    code: '03',
    id: 'disability',
    label: 'Permanent and total disability',
    pocket: 'both',
    status:
      disabled === true ? 'available' : disabled === false ? 'not-applicable' : 'missing-facts',
    factsNeeded: disabled === null ? ['permanently-disabled'] : [],
    savings: disabled === true ? Math.round(PENALTY_RATE * base) : null,
    requirement: "A doctor's determination of permanent and total disability.",
  });

  // 01 — separation from service at 55+, employer plans only. The mirror
  // of the education rule: this one never helps an IRA.
  const separated = boolFact('separated-from-service-at-55');
  exceptions.push(
    pocketed('employer', (inPocket) => ({
      code: '01',
      id: 'age-55-separation',
      label: 'Left the employer in or after the year of turning 55',
      factsNeeded: separated === null ? ['separated-from-service-at-55'] : [],
      savings: separated === true ? Math.round(PENALTY_RATE * inPocket) : null,
      status:
        separated === true ? 'available' : separated === false ? 'not-applicable' : 'missing-facts',
      requirement: 'Applies to that employer’s plan only — never to an IRA.',
    })),
  );

  // ── The asymmetry, priced in words when the pocket is the unknown ──
  if (pocket === null) {
    const potential = exceptions.filter((e) => e.pocket !== 'both' && e.status === 'missing-facts');
    if (potential.length > 0) {
      notes.push(
        'Which pocket the money came from decides the exceptions: education, a first home and unemployed health premiums only ever kill the penalty for an IRA; the age-55 rule only for an employer plan. Same dollars, different pocket, different bill — worth finding out.',
      );
    }
  }

  const available = exceptions.filter((e) => e.status === 'available');
  if (available.length > 0) {
    notes.push(
      'Exceptions are claims, not assumptions: each needs its records, so the penalty above is the gross figure and every exception is priced beside it.',
    );
  }

  return {
    applicable: true,
    penalty,
    base,
    pocket,
    exceptions,
    refusals,
    explanation: {
      ruleId: 'penalty/5329',
      citation: CITE,
      steps: [
        { label: 'Early distributions subject to the additional tax', value: base },
        { label: 'Additional tax at 10%', value: penalty },
        ...(pocket !== null
          ? [
              { label: 'From IRAs', value: pocket.ira },
              { label: 'From employer plans', value: pocket.employer },
            ]
          : []),
      ],
      notes: [...refusals, ...notes],
    },
    consumed,
  };
}
