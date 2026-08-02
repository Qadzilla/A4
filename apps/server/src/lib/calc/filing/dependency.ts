// ─── A3 · Dependency ───────────────────────────────────────────────
// The most-wrongly-guessed fact for anyone under 25, run as the test it
// actually is. Authority: IRS Pub 501, whose rule statements are quoted in
// the fixtures — "under age 19 at the end of the year", "under age 24 if a
// student", full-time during some part of each of five calendar months,
// temporary absence for education counting as time at home, the joint-return
// exception for refund-only returns, and scholarships not counting as the
// child's own support.
//
// v1 models the parent as claimant — the demographic reality, and what the
// registry's life facts describe. The relationship test passes by
// construction and says so in the trace.
//
// Fence: no dollar computation (the consequences are flags; the estimator
// spends them), no contradiction resolved here, and the genuinely tangled
// cases — multiple-support agreements, divorced-parents rules (Form 8332) —
// are named in the trace as preparer territory, never silently mishandled.

import { type FactAssertion, type FactId, type FactState, factSet, factState } from './facts';
import type { RuleTrace } from './trace';
import { filingYearData } from './year-data';

export type DependencyTestId =
  | 'qc/relationship'
  | 'qc/age'
  | 'qc/residency'
  | 'qc/support'
  | 'qr/gross-income'
  | 'qr/support'
  | 'joint-return'
  | 'citizen-or-resident';

export interface DependencyDetermination {
  canBeClaimed: 'yes' | 'no' | 'unknown';
  as: 'qualifying-child' | 'qualifying-relative' | null;
  /** Tests that failed on known facts — what to narrate. */
  failedTests: DependencyTestId[];
  /** Facts that would decide it — what A4 prices and the intake asks. */
  missingFacts: FactId[];
  consequences: {
    limitedStandardDeduction: boolean;
    educationCreditsBlocked: boolean;
    saversCreditBlocked: boolean;
    /**
     * Form 8615 exposure — independent of whether anyone claims them: a
     * student under 24 can owe at the parents' rate even while nobody's
     * dependent. B2's guard reads this flag, nothing else.
     */
    kiddieTaxExposed: boolean;
  };
  explanation: RuleTrace;
  consumed: FactId[];
}

type TestResult =
  | { verdict: 'pass' }
  | { verdict: 'fail' }
  | { verdict: 'indeterminate'; missing: FactId[] };

const CITE = 'IRS Pub 501 — dependents (qualifying child, qualifying relative)';

export function determineDependency(
  assertions: FactAssertion[],
  taxYear: number,
): DependencyDetermination {
  const set = factSet(assertions, taxYear);
  const consumed: FactId[] = [];
  const contradicted: FactId[] = [];

  const read = (id: FactId): FactState => {
    if (!consumed.includes(id)) consumed.push(id);
    return factState(set, id);
  };
  const known = <T>(id: FactId): T | null => {
    const state = read(id);
    if (state.status === 'contradicted') {
      contradicted.push(id);
      return null;
    }
    if (state.status !== 'known') return null;
    return (state.value as { value: unknown }).value as T;
  };
  const isUnresolved = (id: FactId): boolean => {
    const state = factState(set, id);
    return state.status === 'unasserted' || state.status === 'unknown';
  };

  const steps: RuleTrace['steps'] = [];
  const notes: string[] = [];

  // ── Shared tests: these gate every kind of dependent ──

  // Citizen-or-resident: "a U.S. citizen, national, or resident alien".
  const citizenTest = ((): TestResult => {
    const citizen = known<boolean>('us-citizen');
    if (citizen === true) return { verdict: 'pass' };
    const residency = known<string>('residency-status');
    if (residency === 'resident' || residency === 'us-person') return { verdict: 'pass' };
    if (residency === 'nonresident') return { verdict: 'fail' };
    const missing: FactId[] = [];
    if (isUnresolved('us-citizen')) missing.push('us-citizen');
    if (isUnresolved('residency-status')) missing.push('residency-status');
    return { verdict: 'indeterminate', missing };
  })();
  if (citizenTest.verdict === 'fail') {
    notes.push(
      'A dependent must be a US citizen, national or resident alien (or a resident of Canada or Mexico) — nonresident status closes the question.',
    );
  }

  // Joint-return: fails only for a real joint return that isn't refund-only.
  const jointTest = ((): TestResult => {
    const isMarried = known<boolean>('married');
    if (isMarried === false) return { verdict: 'pass' };
    if (isMarried === null) {
      return isUnresolved('married')
        ? { verdict: 'indeterminate', missing: ['married'] }
        : { verdict: 'indeterminate', missing: [] };
    }
    const joint = known<boolean>('filing-jointly');
    if (joint === false) return { verdict: 'pass' };
    if (joint === null) return { verdict: 'indeterminate', missing: ['filing-jointly'] };
    const refundOnly = known<boolean>('joint-refund-only');
    if (refundOnly === true) {
      notes.push(
        'Joint return filed only to claim a refund of withheld tax — the exception to the joint-return test applies.',
      );
      return { verdict: 'pass' };
    }
    if (refundOnly === null) return { verdict: 'indeterminate', missing: ['joint-refund-only'] };
    return { verdict: 'fail' };
  })();

  // ── Qualifying child ──

  const age = ((): number | null => {
    const birth = known<string>('birth-date');
    if (birth === null) return null;
    const year = Number(birth.slice(0, 4));
    return Number.isFinite(year) ? taxYear - year : null;
  })();
  const studentMonths = known<number>('full-time-student-months');
  const disabled = known<boolean>('permanently-disabled');

  const ageTest = ((): TestResult => {
    if (age === null) return { verdict: 'indeterminate', missing: ['birth-date'] };
    steps.push({ label: 'Age at end of year', value: age });
    if (age < 19) return { verdict: 'pass' };
    if (age < 24) {
      if (studentMonths !== null && studentMonths >= 5) {
        steps.push({ label: 'Full-time student months', value: studentMonths });
        return { verdict: 'pass' };
      }
      if (studentMonths === null && isUnresolved('full-time-student-months')) {
        return { verdict: 'indeterminate', missing: ['full-time-student-months'] };
      }
    }
    if (disabled === true) return { verdict: 'pass' };
    if (age >= 24 && studentMonths !== null && studentMonths >= 5) {
      notes.push(
        'The student rule ends the year age 24 is reached at year-end — enrollment no longer helps.',
      );
    }
    // The disability exception exists; unasserted is treated as not applying,
    // and the trace says so rather than blocking every determination on a
    // question almost nobody needs asked.
    if (disabled === null) {
      notes.push(
        'Age test failed without the permanent-disability exception considered — if that applies, say so and this re-runs.',
      );
    }
    return { verdict: 'fail' };
  })();

  // Residency: more than half the year, with school absence counting as home.
  const residencyTest = ((): TestResult => {
    const home = known<number>('lived-with-parents-months');
    const school = known<number>('months-away-at-school');
    const total = (home ?? 0) + (school ?? 0);
    if (total > 6) {
      steps.push({ label: 'Months at home incl. school absence', value: total });
      if ((school ?? 0) > 0) {
        notes.push('Time away at school is a temporary absence — it counts as living at home.');
      }
      return { verdict: 'pass' };
    }
    const missing: FactId[] = [];
    if (home === null && isUnresolved('lived-with-parents-months'))
      missing.push('lived-with-parents-months');
    if (school === null && isUnresolved('months-away-at-school'))
      missing.push('months-away-at-school');
    if (missing.length > 0) return { verdict: 'indeterminate', missing };
    steps.push({ label: 'Months at home incl. school absence', value: total });
    return { verdict: 'fail' };
  })();

  // Support: the child did not provide more than half of their own support.
  const selfSupport = known<number>('self-support-share-pct');
  const qcSupportTest = ((): TestResult => {
    if (selfSupport === null) {
      return isUnresolved('self-support-share-pct')
        ? { verdict: 'indeterminate', missing: ['self-support-share-pct'] }
        : { verdict: 'indeterminate', missing: [] };
    }
    steps.push({ label: 'Own support provided by self (%)', value: selfSupport });
    if (selfSupport > 50) {
      notes.push(
        'Money from loans the person is themselves liable for counts as their own support; scholarships do not count as support at all.',
      );
      return { verdict: 'fail' };
    }
    return { verdict: 'pass' };
  })();

  const qcTests: Array<[DependencyTestId, TestResult]> = [
    ['qc/relationship', { verdict: 'pass' }], // parent claimant, by construction
    ['citizen-or-resident', citizenTest],
    ['qc/age', ageTest],
    ['qc/residency', residencyTest],
    ['qc/support', qcSupportTest],
    ['joint-return', jointTest],
  ];

  // ── Qualifying relative — evaluated when qualifying child fails ──

  const qrIncomeTest = ((): TestResult => {
    const data = filingYearData(taxYear);
    if (data === null) {
      notes.push(
        `Year data for ${taxYear} isn't loaded — the qualifying-relative income limit can't be applied. Refusing to guess.`,
      );
      return { verdict: 'indeterminate', missing: [] };
    }
    const income = known<number>('gross-income');
    if (income === null) {
      return isUnresolved('gross-income')
        ? { verdict: 'indeterminate', missing: ['gross-income'] }
        : { verdict: 'indeterminate', missing: [] };
    }
    steps.push({ label: 'Gross income', value: income });
    steps.push({
      label: 'Qualifying-relative income limit (less-than test)',
      value: data.qrGrossIncomeLimit,
    });
    // "Less than" — equal fails.
    return income < data.qrGrossIncomeLimit ? { verdict: 'pass' } : { verdict: 'fail' };
  })();

  const qrSupportTest = ((): TestResult => {
    if (selfSupport === null) {
      return isUnresolved('self-support-share-pct')
        ? { verdict: 'indeterminate', missing: ['self-support-share-pct'] }
        : { verdict: 'indeterminate', missing: [] };
    }
    // The claimant must provide more than half — modelled as the remainder
    // of the person's own share, which is the parent-claimant reality. A
    // support pool split across several relatives is a multiple-support
    // agreement and out of scope, named below.
    if (100 - selfSupport > 50) return { verdict: 'pass' };
    return { verdict: 'fail' };
  })();

  const qrTests: Array<[DependencyTestId, TestResult]> = [
    ['citizen-or-resident', citizenTest],
    ['qr/gross-income', qrIncomeTest],
    ['qr/support', qrSupportTest],
    ['joint-return', jointTest],
  ];

  const verdictOf = (tests: Array<[DependencyTestId, TestResult]>) => {
    if (tests.some(([, t]) => t.verdict === 'fail')) return 'no' as const;
    if (tests.every(([, t]) => t.verdict === 'pass')) return 'yes' as const;
    return 'unknown' as const;
  };

  const qcVerdict = verdictOf(qcTests);
  const qrVerdict = verdictOf(qrTests);

  const failedTests = [
    ...new Set([...qcTests, ...qrTests].filter(([, t]) => t.verdict === 'fail').map(([id]) => id)),
  ];
  const missingFacts = [
    ...new Set(
      [...qcTests, ...qrTests].flatMap(([, t]) => (t.verdict === 'indeterminate' ? t.missing : [])),
    ),
  ];

  let canBeClaimed: 'yes' | 'no' | 'unknown';
  let as: DependencyDetermination['as'];
  if (qcVerdict === 'yes') {
    canBeClaimed = 'yes';
    as = 'qualifying-child';
  } else if (qrVerdict === 'yes') {
    canBeClaimed = 'yes';
    as = 'qualifying-relative';
  } else if (qcVerdict === 'no' && qrVerdict === 'no') {
    canBeClaimed = 'no';
    as = null;
  } else {
    canBeClaimed = 'unknown';
    as = null;
  }

  if (contradicted.length > 0) {
    canBeClaimed = 'unknown';
    as = null;
    notes.unshift(
      `Facts in live disagreement: ${contradicted.join(', ')}. Resolve the contradiction first.`,
    );
  }

  notes.push(
    'Out of scope by name: multiple-support agreements and the divorced-parents rules (Form 8332) — a preparer question if several households share the support.',
  );

  // ── Kiddie-tax exposure (Form 8615) — independent of being claimed ──
  const filingJoint = known<boolean>('filing-jointly');
  const kiddieTaxExposed = ((): boolean => {
    if (age === null) return false;
    if (filingJoint === true && known<boolean>('joint-refund-only') !== true) return false;
    if (age < 18) return true;
    if (age === 18 || (age < 24 && studentMonths !== null && studentMonths >= 5)) {
      // The escape — earned income over half of own support — needs the
      // earned-vs-borrowed split, which the fact model doesn't carry yet.
      // Conservative exposure with the note, per B2's contract.
      notes.push(
        'Form 8615 exposure assumed for a student under 24: the earned-income escape (earned income covering over half of own support) needs the earned/borrowed split to rule out.',
      );
      return true;
    }
    return false;
  })();

  const yes = canBeClaimed === 'yes';
  return {
    canBeClaimed,
    as,
    failedTests,
    missingFacts,
    consequences: {
      limitedStandardDeduction: yes,
      educationCreditsBlocked: yes,
      saversCreditBlocked: yes,
      kiddieTaxExposed,
    },
    explanation: {
      ruleId: 'dependency/pub501',
      citation: CITE,
      steps: [
        { label: 'Qualifying child', value: qcVerdict },
        { label: 'Qualifying relative', value: qrVerdict },
        ...steps,
      ],
      notes,
    },
    consumed,
  };
}
