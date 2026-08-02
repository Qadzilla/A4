// ─── B2 · The kiddie-tax guard ─────────────────────────────────────
// The product's flagship insight — "$X of long-term gains at 0% federal
// tax" — is wrong for exactly the person most likely to be shown it: a
// full-time student under 24, whose unearned income above the Form 8615
// threshold is taxed at the parents' rate whether or not anyone claims
// them. Every surface that speaks of the window consults this guard.
//
// The determination mirrors A3's (lib/calc/filing/dependency.ts), keyed on
// the two facts the tax profile can carry today; when G-phase wires the
// fact model into the surfaces, this becomes a view over A3 rather than a
// twin. Unknown facts produce 'unknown', never 'clear' — a caution beats a
// silent wrong number, and a 26-year-old with a birth date on file sees
// nothing at all.
//
// Fence: no Form 8615 computation. The guard caps claims; it never blends
// a parents'-rate estimate into anyone's numbers.

import { filingYearData } from './filing/year-data';

export type KiddieStatus = 'exposed' | 'clear' | 'unknown';

export interface KiddieGuardResult {
  status: KiddieStatus;
  /**
   * The annotation consumers append wherever the window is described.
   * Null exactly when status is 'clear' — no change for the unaffected.
   */
  note: string | null;
}

export interface KiddieGuardInput {
  /** ISO yyyy-mm-dd, or null when the profile doesn't know. */
  birthDate: string | null;
  /** Null when the profile doesn't know — distinct from false. */
  fullTimeStudent: boolean | null;
}

export function kiddieGuard(input: KiddieGuardInput, taxYear: number): KiddieGuardResult {
  const threshold = filingYearData(taxYear)?.kiddieUnearnedThreshold;
  const above =
    threshold !== undefined ? `above $${threshold.toLocaleString('en-US')}` : 'above the threshold';

  const exposedNote = `Heads up: investment income ${above} for a student under 24 is taxed at the parents' rate (Form 8615, the "kiddie tax") — the 0% federal window mostly isn't usable here, whether or not anyone claims them as a dependent.`;
  const unknownNote = `One check before using the 0% window: for a full-time student under 24, investment income ${above} is taxed at the parents' rate (Form 8615) — a birth date and student status on the tax profile settle whether that applies.`;

  if (input.birthDate === null) {
    return { status: 'unknown', note: unknownNote };
  }
  const birthYear = Number(input.birthDate.slice(0, 4));
  if (!Number.isFinite(birthYear)) {
    return { status: 'unknown', note: unknownNote };
  }

  // Age at the end of the year — the same measure A3's age test uses.
  const age = taxYear - birthYear;

  if (age >= 24) return { status: 'clear', note: null };
  if (age <= 17) return { status: 'exposed', note: exposedNote };
  if (age === 18) {
    // The earned-income escape exists at 18 but needs the earned-vs-other
    // support split the profile doesn't carry; conservative, like A3.
    return { status: 'exposed', note: exposedNote };
  }
  // 19–23: it turns entirely on student status. Age alone must not trigger.
  if (input.fullTimeStudent === true) return { status: 'exposed', note: exposedNote };
  if (input.fullTimeStudent === false) return { status: 'clear', note: null };
  return { status: 'unknown', note: unknownNote };
}
