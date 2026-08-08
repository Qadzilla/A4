// ─── Massachusetts capital-loss netting ────────────────────────────
// The gap F3 left open, closed from the statute rather than from the
// form instructions.
//
// mass.gov refuses automated requests on every route tried — WebFetch,
// a browser user-agent, the /doc/…/download pattern — so the Schedule B
// and D instructions stayed unreachable across three slices. The way
// through was to stop trying: the ordering is not an instruction-book
// convention, it is M.G.L. c. 62 § 2(c), and malegislature.gov serves
// it. That is better authority than the instructions anyway — the
// booklet paraphrases the statute, and here we read what it paraphrases.
//
// Authority, verbatim (M.G.L. c. 62 § 2(c), retrieved 2026-08-07):
//
//   (2)(a) — "the excess, if any, of the Part A net capital loss for
//     the year over the Part A net capital gain for the year, but not
//     more than the amount allowed under paragraph (4), shall be
//     applied against Part A interest and dividends; provided,
//     however, that any remaining excess of the Part A net capital
//     loss for the year shall be applied against capital gains
//     included in Part C gross income."
//
//   (2)(b) — "The excess, if any, of the Part C net capital losses for
//     the year over the Part C net capital gains for the year shall be
//     applied against capital gains included in Part A gross income.
//     If Part C net capital losses for the year exceed the Part A net
//     capital gain for the year, then the excess … but not more than
//     the amount allowed under paragraph (4), shall be applied against
//     any interest and dividends included in Part A gross income."
//
//   (4) — "not more than an aggregate amount of $2,000 in Part A
//     capital loss and Part C capital loss shall be applied against
//     any interest and dividends included in Part A gross income."
//
// THE ORDERING IS NOT THE ONE F3 GUESSED. F3's refusal text told people
// short-term losses go against long-term gains first and then against
// interest and dividends. The statute is the other way round for a Part
// A loss: interest and dividends FIRST, capped, and only the remainder
// reaches Part C. Getting that backwards changes the answer whenever
// the cap binds, because the two destinations are taxed at different
// rates — which is exactly why F3 refused instead of guessing.
//
// Two more details the statute settles and memory would not:
//   · The $2,000 is an AGGREGATE across both loss kinds, not $2,000
//     each. And it is $2,000, where the federal figure is $3,000 — a
//     difference nobody expects.
//   · A carryforward keeps its CHARACTER. An unused Part A loss is "a
//     Part A capital loss … in the succeeding taxable year", and a
//     Part C loss stays Part C. It does not become a generic loss.

/** M.G.L. c. 62 § 2(c)(4). Aggregate across both loss kinds. */
export const LOSS_AGAINST_INTEREST_CAP = 2000;

export interface MaGainsInput {
  /** Part A capital gain or loss — held one year or less. */
  shortTerm: number;
  /** Part C capital gain or loss — held more than one year. */
  longTerm: number;
  /** Part A interest and dividends, before any loss is applied. */
  interestAndDividends: number;
}

export interface MaNetting {
  /** Part A short-term gain left to tax, after netting. Never negative. */
  taxableShortTermGain: number;
  /** Part C long-term gain left to tax, after netting. Never negative. */
  taxableLongTermGain: number;
  /** Interest and dividends left to tax, after any offset. */
  taxableInterestAndDividends: number;
  /** How much loss reached interest and dividends. Capped at $2,000. */
  appliedAgainstInterest: number;
  /** Loss the year could not absorb, by character — it keeps it. */
  carryforward: { partA: number; partC: number };
  /** Every step, in the statute's order, for the trace. */
  steps: Array<{ label: string; value: number }>;
  notes: string[];
}

const round = (n: number): number => Math.round(n * 100) / 100;

/**
 * Net a Massachusetts year's gains and losses, in the statute's order.
 *
 * Written as a sequence of "apply this pot against that pot" steps in
 * the order § 2(c) sets out, rather than as a formula, because the
 * order is the entire content of the rule and a formula would hide it.
 */
export function netMassachusettsGains(input: MaGainsInput): MaNetting {
  const steps: Array<{ label: string; value: number }> = [];
  const notes: string[] = [];

  let shortTerm = input.shortTerm;
  let longTerm = input.longTerm;
  let interest = input.interestAndDividends;
  let appliedAgainstInterest = 0;
  // A loss the year cannot absorb keeps its character into the next
  // one, so the two are tracked separately from the start.
  let carryPartA = 0;
  let carryPartC = 0;

  steps.push({ label: 'Part A short-term gain or loss', value: round(shortTerm) });
  steps.push({ label: 'Part C long-term gain or loss', value: round(longTerm) });
  steps.push({ label: 'Part A interest and dividends', value: round(interest) });

  /** What is left of the aggregate $2,000, shared by both loss kinds. */
  const interestRoom = (): number =>
    Math.max(0, Math.min(LOSS_AGAINST_INTEREST_CAP - appliedAgainstInterest, interest));

  // ── § 2(c)(2)(a): a Part A (short-term) net loss ──
  if (shortTerm < 0) {
    let loss = -shortTerm;
    shortTerm = 0;

    // First stop is interest and dividends, capped. This is the step
    // F3's guess had last.
    const toInterest = Math.min(loss, interestRoom());
    if (toInterest > 0) {
      interest -= toInterest;
      appliedAgainstInterest += toInterest;
      loss -= toInterest;
      steps.push({
        label: 'Short-term loss against interest and dividends',
        value: round(toInterest),
      });
    }

    // Then, and only then, against long-term gains.
    if (loss > 0 && longTerm > 0) {
      const toLongTerm = Math.min(loss, longTerm);
      longTerm -= toLongTerm;
      loss -= toLongTerm;
      steps.push({ label: 'Short-term loss against long-term gains', value: round(toLongTerm) });
    }

    if (loss > 0) {
      steps.push({ label: 'Short-term loss carried forward', value: round(loss) });
    }
    carryPartA = loss;
  }

  // ── § 2(c)(2)(b): a Part C (long-term) net loss ──
  if (longTerm < 0) {
    let loss = -longTerm;
    longTerm = 0;

    // Long-term losses reach short-term gains first, then interest.
    if (shortTerm > 0) {
      const toShortTerm = Math.min(loss, shortTerm);
      shortTerm -= toShortTerm;
      loss -= toShortTerm;
      steps.push({ label: 'Long-term loss against short-term gains', value: round(toShortTerm) });
    }

    const toInterest = Math.min(loss, interestRoom());
    if (toInterest > 0) {
      interest -= toInterest;
      appliedAgainstInterest += toInterest;
      loss -= toInterest;
      steps.push({
        label: 'Long-term loss against interest and dividends',
        value: round(toInterest),
      });
    }

    if (loss > 0) {
      steps.push({ label: 'Long-term loss carried forward', value: round(loss) });
    }
    carryPartC = loss;
  }

  const carryforward = { partA: round(carryPartA), partC: round(carryPartC) };

  if (appliedAgainstInterest >= LOSS_AGAINST_INTEREST_CAP) {
    notes.push(
      `Massachusetts caps the loss you can put against interest and dividends at $${LOSS_AGAINST_INTEREST_CAP.toLocaleString('en-US')} a year, across both kinds of loss together — the federal figure is $3,000, and the difference surprises people.`,
    );
  }
  if (carryforward.partA > 0 || carryforward.partC > 0) {
    notes.push(
      'Losses this year could not absorb carry forward, and they keep their character — a short-term loss stays short-term next year, a long-term loss stays long-term. Basis records the amount but does not yet carry one INTO a later year, so a carried loss has to be entered by hand when you file that year.',
    );
  }

  return {
    taxableShortTermGain: round(Math.max(0, shortTerm)),
    taxableLongTermGain: round(Math.max(0, longTerm)),
    taxableInterestAndDividends: round(Math.max(0, interest)),
    appliedAgainstInterest: round(appliedAgainstInterest),
    carryforward,
    steps,
    notes,
  };
}
