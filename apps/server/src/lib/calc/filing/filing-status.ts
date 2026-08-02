// ─── A3 · Filing status ────────────────────────────────────────────
// Which of the five statuses the facts support. Two principles shape it:
// an election is not a determination — married people choose joint or
// separate, so the engine reports what's available and never picks — and
// a benefit status is never assumed: head of household requires facts
// affirmatively present, and the default in their absence is the
// no-benefit status with the door named in the trace.
//
// Authority: IRS Pub 501, filing status chapter.

import { type FactAssertion, type FactId, type FactState, factSet, factState } from './facts';
import type { RuleTrace } from './trace';

export type FilingStatus = 'single' | 'mfj' | 'mfs' | 'hoh' | 'qss';

export interface FilingStatusDetermination {
  /** 'unknown' when the deciding fact is an election not yet made. */
  status: FilingStatus | 'unknown';
  /** Everything the facts support — laid out, never ranked. */
  available: FilingStatus[];
  missingFacts: FactId[];
  explanation: RuleTrace;
  consumed: FactId[];
}

const CITE = 'IRS Pub 501 — filing status';

export function determineFilingStatus(
  assertions: FactAssertion[],
  taxYear: number,
): FilingStatusDetermination {
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

  const finish = (
    status: FilingStatus | 'unknown',
    available: FilingStatus[],
    missingFacts: FactId[],
    steps: RuleTrace['steps'],
    notes: string[],
  ): FilingStatusDetermination => ({
    status: contradicted.length > 0 ? 'unknown' : status,
    available,
    missingFacts,
    explanation: {
      ruleId: 'filing-status/pub501',
      citation: CITE,
      steps,
      notes:
        contradicted.length > 0
          ? [
              `Facts in live disagreement: ${contradicted.join(', ')}. Resolve the contradiction first.`,
              ...notes,
            ]
          : notes,
    },
    consumed,
  });

  const isMarried = known<boolean>('married');

  if (isMarried === null) {
    return finish(
      'unknown',
      ['single', 'mfj', 'mfs'],
      ['married'],
      [{ label: 'Married at year end' }],
      ['Marital status on December 31 decides the starting set — it is the first fact needed.'],
    );
  }

  if (isMarried) {
    const joint = known<boolean>('filing-jointly');
    if (joint === true) {
      return finish('mfj', ['mfj', 'mfs'], [], [{ label: 'Married', value: true }], []);
    }
    if (joint === false) {
      return finish(
        'mfs',
        ['mfj', 'mfs'],
        [],
        [{ label: 'Married', value: true }],
        [
          'Filing separately is an election — joint remains available, and the numbers differ; both can be laid out.',
        ],
      );
    }
    return finish(
      'unknown',
      ['mfj', 'mfs'],
      ['filing-jointly'],
      [{ label: 'Married', value: true }],
      [
        'Joint or separate is an election, not a determination — the engine computes both and the person chooses.',
      ],
    );
  }

  // Unmarried: surviving spouse first (it beats head of household), then
  // head of household, then single.
  const widowed = known<boolean>('widowed-within-two-prior-years');
  const dependentMonths = known<number>('own-dependent-lived-with-months');
  const paidHalfHome = known<boolean>('paid-over-half-home-costs');

  if (widowed === true) {
    if (dependentMonths !== null && dependentMonths > 6 && paidHalfHome === true) {
      return finish(
        'qss',
        ['qss'],
        [],
        [
          { label: 'Spouse died within two prior years', value: true },
          { label: 'Dependent child at home, months', value: dependentMonths },
          { label: 'Paid over half the cost of the home', value: true },
        ],
        ['Qualifying surviving spouse uses the joint-return rates for two years after the loss.'],
      );
    }
    const missing: FactId[] = [];
    if (dependentMonths === null) missing.push('own-dependent-lived-with-months');
    if (paidHalfHome === null) missing.push('paid-over-half-home-costs');
    if (missing.length > 0) {
      return finish(
        'unknown',
        ['qss', 'hoh', 'single'],
        missing,
        [{ label: 'Spouse died within two prior years', value: true }],
        ['Surviving-spouse status turns on a dependent child at home and keeping up the home.'],
      );
    }
  }

  if (dependentMonths !== null && dependentMonths > 6 && paidHalfHome === true) {
    return finish(
      'hoh',
      ['hoh', 'single'],
      [],
      [
        { label: 'Qualifying person at home, months', value: dependentMonths },
        { label: 'Paid over half the cost of the home', value: true },
      ],
      [
        'Head of household — the qualifying-person test here is the v1 model (own dependent at home); the full Pub 501 table has more shapes, which the intake asks about only when indicated.',
      ],
    );
  }

  return finish(
    'single',
    ['single'],
    [],
    [{ label: 'Married', value: false }],
    [
      'Single is the no-benefit default. Head of household exists for someone keeping up a home for a dependent — if that describes the year, those two facts change this.',
    ],
  );
}
